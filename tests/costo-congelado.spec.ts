import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { ownerCreds } from './helpers/auth'

// ============================================================================
// EL COSTO SE CONGELA EN LA LÍNEA DE VENTA — el contrato de Utilidades
//
// 🔴 POR QUÉ ESTE ARCHIVO EXISTE. La auditoría A4 mutó
//    `add_order_items_with_extras` para que insertara `null` en
//    `order_items.unit_cost` — es decir, para que el costo **no se congelara**—
//    y **la suite entera pasó**. `grep -rn unit_cost tests/` devolvía una sola
//    aparición, y era el costo de COMPRA.
//
//    Sobre este contrato se apoyan TRES decisiones de esquema ya tomadas:
//      · el método de costeo (promedio ponderado móvil, 2026-08-31),
//      · descartar la compra en negativo,
//      · `adjust_cost` como hecho nuevo que NO reescribe el pasado (propuesta 49).
//
//    R1 punto 8 lo dice entero: *"el costo se congela en el momento de vender,
//    no se calcula después leyendo el costo actual del producto. Si se calculara
//    después, cada compra nueva cambiaría las utilidades de meses pasados y el
//    reporte daría distinto cada vez que se abre"* — el perfil exacto del fallo
//    silencioso de R7.
//
//    **Un contrato que nadie prueba existe hasta el primer refactor que lo rompa
//    en silencio.** Eso es lo que este archivo impide.
//
// ⚠️ Acá el rojo NO viene del código: el código está bien. Viene del MUTANTE —
//    R10 pura. Verificado el 2026-09-02: con `unit_cost` insertando `null`, los
//    tres casos de abajo mueren, y el primero muere diciendo el número.
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
const COSTO_VIEJO = 80
const COSTO_NUEVO = 94
const PRECIO = 500

let db: SupabaseClient
let SEDE = ''
let OWNER = ''
let CAT_ID = ''
let CON_COSTO = ''      // nace con cost_price = 80
let SIN_COSTO = ''      // nunca comprado: cost_price null

/** Crea una orden y le agrega una línea por la RPC. Devuelve el order_id. */
async function vender(productId: string): Promise<string> {
  const ord = await db
    .from('orders')
    .insert({ sede_id: SEDE, created_by: OWNER, canal: 'mostrador', total: PRECIO })
    .select('id')
    .single()
  if (ord.error) throw ord.error
  const orderId = ord.data.id as string
  const { error } = await db.rpc('add_order_items_with_extras', {
    p_order_id: orderId,
    p_items: [{ product_id: productId, qty: 1, unit_price: PRECIO }],
  })
  if (error) throw error
  return orderId
}

/** El costo CONGELADO en la línea de esa venta. */
async function costoDeLaLinea(orderId: string): Promise<number | null> {
  const { data, error } = await db
    .from('order_items')
    .select('unit_cost')
    .eq('order_id', orderId)
    .single()
  if (error) throw error
  return data.unit_cost === null ? null : Number(data.unit_cost)
}

async function ponerCosto(productId: string, costo: number | null) {
  const { error } = await db.from('products').update({ cost_price: costo }).eq('id', productId)
  if (error) throw error
}

test.beforeAll(async () => {
  db = createClient(process.env.VITE_NODO_SUPABASE_URL!, process.env.VITE_NODO_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  })
  const { error } = await db.auth.signInWithPassword(ownerCreds())
  if (error) throw error
  OWNER = (await db.auth.getUser()).data.user!.id
  SEDE = (await db.from('profiles').select('sede_id').eq('id', OWNER).single()).data!.sede_id as string

  CAT_ID = (await db.from('categories').insert({ sede_id: SEDE, name: `E2E Costo ${SUFFIX}` }).select('id').single()).data!.id
  CON_COSTO = (await db.from('products').insert({
    sede_id: SEDE, category_id: CAT_ID, name: `E2E CostoCongelado ${SUFFIX}`,
    price: PRECIO, kind: 'simple', stock_tracking: true, stock_qty: 50, cost_price: COSTO_VIEJO,
  }).select('id').single()).data!.id
  SIN_COSTO = (await db.from('products').insert({
    sede_id: SEDE, category_id: CAT_ID, name: `E2E CostoNulo ${SUFFIX}`,
    price: PRECIO, kind: 'simple', stock_tracking: false,
  }).select('id').single()).data!.id
})

test.afterAll(async () => {
  if (!db) return
  await db.from('products').update({ is_active: false }).in('id', [CON_COSTO, SIN_COSTO])
  await db.from('categories').update({ is_active: false }).eq('id', CAT_ID)
})

test('🔴 el costo de la línea NO cambia cuando cambia el costo del producto', async () => {
  // Venta con el costo viejo. Lo que se graba acá es historia: no se recalcula.
  const venta = await vender(CON_COSTO)
  expect(await costoDeLaLinea(venta), 'al vender se congela el costo vigente').toBe(COSTO_VIEJO)

  // Llega una compra (o un ajuste) y el costo del producto sube.
  await ponerCosto(CON_COSTO, COSTO_NUEVO)
  const actual = (await db.from('products').select('cost_price').eq('id', CON_COSTO).single()).data!
  expect(Number(actual.cost_price), 'precondición: el costo del producto cambió').toBe(COSTO_NUEVO)

  // 🔴 LA ASERCIÓN QUE SOSTIENE UTILIDADES. Si esto se rompe, cada compra nueva
  //    reescribe las utilidades de meses pasados y el reporte da distinto cada
  //    vez que se abre — sin error, sin aviso (R7).
  expect(
    await costoDeLaLinea(venta),
    'LA VENTA YA HECHA CAMBIÓ DE COSTO: la línea tiene que conservar el costo del ' +
    'momento de vender. Si lee el costo actual del producto, las utilidades del ' +
    'pasado se reescriben solas con cada compra',
  ).toBe(COSTO_VIEJO)
})

test('el CONTRASTE: una venta posterior congela el costo NUEVO', async () => {
  // Sin esto, un `unit_cost` clavado en 80 —o en cualquier constante— pasaría el
  // caso de arriba sin congelar nada. Es el control negativo del congelado.
  const venta = await vender(CON_COSTO)
  expect(
    await costoDeLaLinea(venta),
    'la venta nueva tiene que tomar el costo vigente HOY, no el de la venta vieja',
  ).toBe(COSTO_NUEVO)
})

test('un producto nunca comprado congela NULL, no cero', async () => {
  // `null` es información: "este producto nunca tuvo costo". Un 0 sería un dato
  // FALSO —diría que costó nada— y la utilidad saldría igual al precio. Es la
  // misma clase que el `?? 0` de A1: un valor que no distingue "no sé" de "nada".
  const venta = await vender(SIN_COSTO)
  expect(
    await costoDeLaLinea(venta),
    'sin costo conocido la línea guarda null; un 0 afirmaría que costó nada',
  ).toBeNull()
})
