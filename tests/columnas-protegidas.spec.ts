import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { ownerCreds } from './helpers/auth'

// ============================================================================
// DEUDA 78 · `cost_price` y `stock_qty` NO SE ESCRIBEN POR LA TABLA
//
// 🔴 QUÉ SOSTIENE. La policy `products: gestionar` es `for all` con
//    `productos.editar`, así que hasta el 2026-09-07 cualquiera con ese permiso
//    hacía `update products set cost_price = ...` desde el cliente: cambiaba
//    PLATA, sin autor y sin motivo, y ese número alimenta Utilidades. Falla
//    ABIERTO. La evidencia la daba nuestro propio arnés —`costo-congelado.spec`
//    lo hacía exactamente así—.
//
//    El cierre es un ALLOWLIST DE COLUMNAS: se revocó el UPDATE de tabla y se
//    concedió columna por columna lo que el cliente edita de verdad. Las dos
//    columnas quedan fuera por OMISIÓN, que es lo que hace que una columna nueva
//    nazca cerrada.
//
// 🔴 POR QUÉ EL CONTROL POSITIVO NO ES DECORATIVO, y es la mitad que decide si
//    este archivo mide algo. Un test que sólo pide «el update falla» está VERDE
//    con el guard de más: si el `grant` de la migración se olvidara entero, el
//    cliente no podría editar NADA y los dos casos negativos pasarían igual,
//    celebrando una pantalla de productos rota.
//    Por eso hay dos controles, y son de cosas distintas:
//      ① `nombre` SÍ se edita por la tabla  -> el allowlist concede
//      ② `adjust_cost` / `adjust_stock` SÍ funcionan -> el usuario TIENE los
//         permisos, o sea que ① y ② no fallaron por falta de derechos sino por
//         el privilegio de columna. Es «negar por la RAZÓN correcta».
//
// ⚠️ NO va en `describe.serial`, a propósito. El control ② existe para el momento
//    en que los negativos se mueven —o sea justo cuando están rojos—, y en serial
//    un rojo lo dejaría en `did not run`: el control desaparecería por el fallo
//    del caso que venía a controlar. Comparten la fixture, no el resultado.
// ============================================================================

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
const COSTO = 80
const STOCK = 50
const PRECIO = 500

let db: SupabaseClient
let SEDE = ''
let CAT_ID = ''
let PROTEGIDO = ''   // sujeto de los casos negativos
let CON_RPC = ''     // sujeto del control ②, aparte para que nadie se pise

async function leer(id: string) {
  const { data, error } = await db
    .from('products').select('cost_price, stock_qty, name').eq('id', id).single()
  if (error) throw error
  return data
}

test.beforeAll(async () => {
  db = createClient(process.env.VITE_NODO_SUPABASE_URL!, process.env.VITE_NODO_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  })
  const { error } = await db.auth.signInWithPassword(ownerCreds())
  if (error) throw error
  const uid = (await db.auth.getUser()).data.user!.id
  SEDE = (await db.from('profiles').select('sede_id').eq('id', uid).single()).data!.sede_id as string

  CAT_ID = (await db.from('categories')
    .insert({ sede_id: SEDE, name: `E2E Columnas ${SUFFIX}` }).select('id').single()).data!.id

  // ⚠️ El INSERT sigue llevando las dos columnas y está BIEN: el allowlist es de
  //    UPDATE. Crear un producto con su costo y su existencia inicial no
  //    reescribe ninguna historia; cambiarlos después, sí.
  const base = {
    sede_id: SEDE, category_id: CAT_ID, price: PRECIO,
    kind: 'simple' as const, stock_tracking: true, stock_qty: STOCK, cost_price: COSTO,
  }
  PROTEGIDO = (await db.from('products')
    .insert({ ...base, name: `E2E Protegido ${SUFFIX}` }).select('id').single()).data!.id
  CON_RPC = (await db.from('products')
    .insert({ ...base, name: `E2E ConRPC ${SUFFIX}` }).select('id').single()).data!.id
})

test.afterAll(async () => {
  if (!db) return
  await db.from('products').update({ is_active: false }).in('id', [PROTEGIDO, CON_RPC])
  await db.from('categories').update({ is_active: false }).eq('id', CAT_ID)
})

// ── ① CONTROL POSITIVO ──────────────────────────────────────────────────────
test('el cliente SIGUE pudiendo editar un producto por la tabla', async () => {
  const nuevo = `E2E Protegido ${SUFFIX} (editado)`
  const { error } = await db.from('products').update({ name: nuevo }).eq('id', PROTEGIDO)
  expect(
    error?.message ?? null,
    'el allowlist de la migración 78 dejó de conceder `name`: la pantalla de ' +
    'productos está rota, y los dos casos negativos de abajo pasarían igual',
  ).toBeNull()
  expect((await leer(PROTEGIDO)).name).toBe(nuevo)
})

// ── SUJETO ──────────────────────────────────────────────────────────────────
test('🔴 `cost_price` NO se puede cambiar por la tabla', async () => {
  const antes = (await leer(PROTEGIDO)).cost_price

  const { error } = await db.from('products')
    .update({ cost_price: 9_999 }).eq('id', PROTEGIDO)

  expect(
    error?.message ?? '(no hubo error: el update PASÓ)',
    'SE PUDO CAMBIAR EL COSTO POR LA TABLA. Es plata sin autor ni motivo, y el ' +
    'número alimenta Utilidades: el camino con rastro es `adjust_cost`',
  ).toMatch(/permission denied/i)

  // 🔴 Y que niegue POR LA RAZÓN CORRECTA: un rechazo de RLS diría «violates
  //    row-level security policy» y significaría otra cosa entera —que la fila
  //    no es de esta sede—, dejando el privilegio de columna sin evaluar.
  expect(error!.message, 'negó RLS, no el privilegio de columna: el guard de la 78 no se ejerció')
    .not.toMatch(/row-level security/i)

  expect(
    (await leer(PROTEGIDO)).cost_price,
    'el costo cambió igual: el error no impidió la escritura',
  ).toBe(antes)
})

test('🔴 `stock_qty` NO se puede cambiar por la tabla', async () => {
  const antes = (await leer(PROTEGIDO)).stock_qty

  const { error } = await db.from('products')
    .update({ stock_qty: 9_999 }).eq('id', PROTEGIDO)

  expect(
    error?.message ?? '(no hubo error: el update PASÓ)',
    'SE PUDO CAMBIAR LA EXISTENCIA POR LA TABLA, sin motivo y sin `stock_movements`. ' +
    'Y por la tabla alcanza `productos.editar`, mientras que `adjust_stock` exige ' +
    '`inventario.ajustar`: el camino corto pide MENOS permiso que el correcto',
  ).toMatch(/permission denied/i)

  expect(error!.message, 'negó RLS, no el privilegio de columna')
    .not.toMatch(/row-level security/i)

  expect(
    (await leer(PROTEGIDO)).stock_qty,
    'la existencia cambió igual: el error no impidió la escritura',
  ).toBe(antes)
})

// ── ② CONTROL: el camino CON RASTRO sigue abierto, y el usuario tiene permiso ─
test('el camino con rastro sigue abierto: `adjust_cost` y `adjust_stock` escriben', async () => {
  const { error: eCosto } = await db.rpc('adjust_cost', {
    p_product_id: CON_RPC, p_new_cost: 111, p_reason: 'columnas-protegidas.spec',
  })
  expect(eCosto?.message ?? null, 'adjust_cost dejó de funcionar').toBeNull()

  const { error: eStock } = await db.rpc('adjust_stock', {
    p_product_id: CON_RPC, p_qty: 5, p_reason: 'columnas-protegidas.spec',
  })
  expect(eStock?.message ?? null, 'adjust_stock dejó de funcionar').toBeNull()

  const fin = await leer(CON_RPC)
  expect(Number(fin.cost_price), 'el costo se movió por la RPC').toBe(111)
  expect(fin.stock_qty, 'la existencia se movió por la RPC').toBe(STOCK + 5)

  // 🔴 Y el rastro, que es lo que distingue este camino del que se cerró.
  const { data: mov } = await db.from('stock_movements')
    .select('type, qty, notes').eq('product_id', CON_RPC).eq('type', 'adjustment')
  expect(
    mov ?? [],
    'el ajuste no dejó movimiento: sin rastro, este camino no es mejor que el cerrado',
  ).toHaveLength(1)
})
