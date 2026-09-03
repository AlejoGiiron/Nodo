import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { ownerCreds } from './helpers/auth'

// ============================================================================
// EL COSTO ES PROMEDIO PONDERADO MÓVIL, NO ÚLTIMO COSTO — §8.1
//
// 🔴 POR QUÉ ESTE SPEC EXISTE, Y POR QUÉ LLEGA TARDE. El método de costeo se
//    decidió el 2026-08-31, se discutió, se aprobó, y sobre él se apoyan TRES
//    decisiones de esquema: `order_items.unit_cost` congelado al vender (R1
//    punto 8), la devolución de compra que NO toca `cost_price` (deuda 49), y
//    la pantalla de Utilidades entera (deuda 86).
//    **Y no tenía una sola aserción.**
//
// 🔴 Lo destapó el archivo real del cliente: de sus 21 productos comprados,
//    CERO tienen más de un costo unitario. O sea que **ningún dato real
//    distingue promedio ponderado de último costo** — con ese archivo los dos
//    métodos dan idéntico, y el lab habría heredado la misma ceguera.
//    El escenario que los separa **hay que fabricarlo a propósito**.
//
// ── EL CONTRASTE, QUE ES LO QUE LO HACE MEDIR ───────────────────────────────
//    Comprar 10 a 1.000 · vender 1 · comprar 10 a 2.000.
//      · promedio ponderado → (9×1.000 + 10×2.000) / 19 = **1.526,32**
//      · último costo       → **2.000**
//    2.000 es un número perfectamente plausible: si la aserción sólo pidiera
//    «cost_price > 0» o «cambió», pasaría con el método equivocado. Por eso el
//    caso asevera la cifra exacta **y** que NO sea la del método descartado.
//
// ⚠️ Y LA VENTA EN EL MEDIO NO ES DECORADO: la fórmula pondera por el stock que
//    hay **al momento de comprar**. Sin la venta, el stock sería 10 y no 9, y
//    el promedio daría 1.500 — un número que también se distingue de 2.000,
//    pero que no ejercita que la ponderación use el stock REAL.
//
// ⚠️ TRES CAÍDAS A ÚLTIMO COSTO que el escenario tiene que evitar, o el
//    promedio no se ejecuta nunca (leídas de `compras.sql`):
//      · el producto no lleva inventario  → `not v_tracking`
//      · no tiene costo previo            → `v_costo_actual is null`
//      · el stock está en cero o negativo → `v_stock_actual <= 0`
//    Por eso la PRIMERA compra es parte del montaje, no del sujeto: deja el
//    producto con costo y con stock, que es la única forma de llegar al `else`.
// ============================================================================

test.describe.configure({ mode: 'serial' })

function loadEnv(path: string) {
  try {
    for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  } catch { /* ignore */ }
}
loadEnv('.env'); loadEnv('.env.test')

const SUFFIX = Date.now().toString().slice(-6)
const PRODUCTO = `E2E Costeo ${SUFFIX}`
const PROVEEDOR = `E2E ProvCosteo ${SUFFIX}`

let db: SupabaseClient
let SEDE: string
let PERFIL: string
let JORNADA: string | null = null
let PRODUCTO_ID: string
let PROVEEDOR_ID: string

const COMPRA_1 = { qty: 10, costo: 1_000 }
const COMPRA_2 = { qty: 10, costo: 2_000 }
const VENDIDAS = 1
/** (9×1.000 + 10×2.000) / 19 = 1.526,3157… → la RPC redondea a 2 decimales. */
const PROMEDIO_ESPERADO = 1_526.32
/** Lo que daría el método DESCARTADO. Es el contraste. */
const ULTIMO_COSTO = COMPRA_2.costo

async function costoDe(id: string): Promise<number | null> {
  const { data, error } = await db.from('products').select('cost_price').eq('id', id).single()
  if (error) throw error
  return data.cost_price === null ? null : Number(data.cost_price)
}
async function stockDe(id: string): Promise<number> {
  const { data, error } = await db.from('products').select('stock_qty').eq('id', id).single()
  if (error) throw error
  return Number(data.stock_qty)
}

async function comprar(qty: number, costo: number) {
  const { error } = await db.rpc('register_purchase', {
    p_invoice: { supplier_id: PROVEEDOR_ID, invoice_number: `E2E-${SUFFIX}-${costo}` },
    p_items: [{ product_id: PRODUCTO_ID, qty, unit_cost: costo }],
  })
  if (error) throw error
}

test.beforeAll(async () => {
  db = createClient(process.env.VITE_NODO_SUPABASE_URL!, process.env.VITE_NODO_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  })
  const { error } = await db.auth.signInWithPassword(ownerCreds())
  if (error) throw error
  const uid = (await db.auth.getUser()).data.user!.id
  SEDE = (await db.from('profiles').select('sede_id').eq('id', uid).single()).data!.sede_id as string

  const cat = (await db.from('categories')
    .insert({ sede_id: SEDE, name: `E2E CatCosteo ${SUFFIX}` }).select('id').single()).data!.id
  // 🔴 `stock_tracking: true` y `cost_price: null` a propósito: es el estado del
  //    que arranca un producto nuevo, y el que hace que la PRIMERA compra caiga
  //    —correctamente— a último costo.
  PRODUCTO_ID = (await db.from('products').insert({
    sede_id: SEDE, category_id: cat, name: PRODUCTO,
    price: 3_000, kind: 'simple', stock_tracking: true, stock_qty: 0, cost_price: null,
  }).select('id').single()).data!.id
  PROVEEDOR_ID = (await db.from('suppliers')
    .insert({ sede_id: SEDE, name: PROVEEDOR }).select('id').single()).data!.id

  // 🔴 CUARTA CONDICIÓN DEL ESCENARIO, y no estaba en el enunciado:
  //    `register_purchase` EXIGE JORNADA ABIERTA —«Abri la jornada de caja antes
  //    de registrar una compra»— porque la compra sale del cajón del día (deuda
  //    26, decidida contra la premisa heredada de Vento). Es un guard correcto,
  //    y sin él el spec moría en el montaje sin llegar nunca al cálculo.
  PERFIL = uid
  const abierta = await db.from('jornadas')
    .select('id').eq('sede_id', SEDE).is('closed_at', null).limit(1)
  if (abierta.data?.length) {
    JORNADA = null // ya había una: no es nuestra, no se cierra al final
  } else {
    const { data, error: e } = await db.from('jornadas')
      .insert({ sede_id: SEDE, opened_by: PERFIL, opening_amount: 0 })
      .select('id').single()
    if (e) throw e
    JORNADA = data!.id as string
  }
})

test.afterAll(async () => {
  // ⚠️ Se cierra SOLO si la abrió este spec. Cerrar una ajena dejaría el lab en
  //    un estado que otro spec no eligió — el residuo que ya costó tres rojos.
  if (JORNADA) {
    await db.from('jornadas')
      .update({ closed_at: new Date().toISOString(), closed_by: PERFIL, closing_amount: 0 })
      .eq('id', JORNADA)
  }
})

test('🔴 montaje: la PRIMERA compra deja costo y stock — sin eso el promedio no corre', async () => {
  expect(await costoDe(PRODUCTO_ID), 'un producto nuevo arranca sin costo').toBeNull()

  await comprar(COMPRA_1.qty, COMPRA_1.costo)

  expect(
    await costoDe(PRODUCTO_ID),
    'la primera compra cae a ÚLTIMO COSTO y está bien: con `cost_price` null y stock 0 no hay ' +
    'nada que promediar. Es una de las tres caídas documentadas en compras.sql',
  ).toBe(COMPRA_1.costo)
  expect(await stockDe(PRODUCTO_ID)).toBe(COMPRA_1.qty)
})

test('🔴 se vende una: la ponderación tiene que usar el stock REAL, no el comprado', async () => {
  const { data: orden, error } = await db.from('orders').insert({
    sede_id: SEDE, status: 'pending', canal: 'mostrador', created_by: PERFIL,
  }).select('id').single()
  if (error) throw error

  const { error: err2 } = await db.rpc('add_order_items_with_extras', {
    p_order_id: orden!.id,
    p_items: [{ product_id: PRODUCTO_ID, qty: VENDIDAS, unit_price: 3_000, extras: [] }],
  })
  if (err2) throw err2

  expect(
    await stockDe(PRODUCTO_ID),
    'la venta descuenta stock: 10 − 1 = 9. Ese 9 es el que pondera la compra siguiente',
  ).toBe(COMPRA_1.qty - VENDIDAS)
})

test('🔴 EL SUJETO: la segunda compra promedia — y NO es el último costo', async () => {
  await comprar(COMPRA_2.qty, COMPRA_2.costo)

  const costo = await costoDe(PRODUCTO_ID)

  expect(
    costo,
    `promedio ponderado móvil (§8.1): (9×${COMPRA_1.costo} + ${COMPRA_2.qty}×${COMPRA_2.costo}) / 19`,
  ).toBe(PROMEDIO_ESPERADO)

  // 🔴 EL CONTRASTE. Sin esta línea, una aserción de «cambió» o «es mayor que
  //    cero» pasaría con el método descartado — y 2.000 es un número plausible.
  expect(
    costo,
    'ÚLTIMO COSTO: el costo quedó en el de la última compra. Eso reescribiría la utilidad de ' +
    'todos los meses pasados cada vez que entra una compra — es la razón por la que §8.1 ' +
    'eligió promedio ponderado y por la que `order_items.unit_cost` se congela al vender',
  ).not.toBe(ULTIMO_COSTO)

  expect(await stockDe(PRODUCTO_ID), 'y el stock suma las dos compras menos lo vendido')
    .toBe(COMPRA_1.qty - VENDIDAS + COMPRA_2.qty)
})

test('limpieza: el producto y el proveedor de este spec se desactivan', async () => {
  // No se borran: tienen movimientos de stock y líneas de compra colgando, y la
  // historia no se reescribe. Se desactivan, que es lo que hace el producto.
  await db.from('products').update({ is_active: false }).eq('id', PRODUCTO_ID)
  await db.from('suppliers').update({ is_active: false }).eq('id', PROVEEDOR_ID)
  expect(true).toBe(true)
})
