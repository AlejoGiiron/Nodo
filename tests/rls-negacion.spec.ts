import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { ownerCreds, cashierCreds } from './helpers/auth'

// ============================================================================
// NEGACIÓN — la sonda de A2, como spec.
//
// Origen: `docs/auditorias/A2-negacion-policies.md`. A2 midió 828 celdas de
// tablas y 54 de RPC con una sonda SQL que vive en un documento; este spec trae
// a la suite **lo que la sonda encontró abierto** y la forma reducida de lo que
// encontró cerrado, para que no se reabra en silencio. Deudas 60 y 66(2).
//
// 🔴 POR QUÉ ESTE ARCHIVO EXISTE, y es el argumento de A4 (mutante M9):
//    `rbac.spec.ts` mide el gating de la UI (`can()` sobre el rol cargado) y
//    queda 7/7 VERDE con `has_permission` devolviendo `true` para todo. La base
//    no la probaba nadie: con una policy `INSERT ... with check (true)` sobre
//    `debt_payments`, la suite entera seguía verde. Lo que se prueba acá es la
//    BASE, con sesiones de usuario real (anon key + login), nunca service role:
//    RLS y los guards de las RPC solo muerden con `current_user =
//    'authenticated'`, que es lo que hace PostgREST.
//
// 🔴 EL CASO CENTRAL — un usuario DESACTIVADO con el token todavía vivo.
//    `get_my_sede_id()` filtra `is_active`, así que para un inactivo devuelve
//    NULL. En SQL `x <> NULL` no es verdadero ni falso: es NULL, y el `if` NO
//    DISPARA. Tres RPC comparaban así (`add_order_items_with_extras`,
//    `next_order_number`, `adjust_stock`) y A2 midió el efecto: el desactivado
//    escribió ítems y descontó stock en una orden de OTRA organización.
//    La app corta la sesión en el cliente; el token no se revoca. La base es el
//    único guard. Ver CLAUDE.md, "un guard que no evalúa deja pasar".
//
// Red de seguridad: `afterAll` reactiva al cajero SIEMPRE y anula
// la orden fixture. Un fallo a mitad no puede dejar al cajero del lab apagado.
// ============================================================================

// Sin `mode: 'serial'` A PROPÓSITO: en serial, el primer rojo SALTA a los demás
// y una corrida contra el defecto mostraría 1 de 4. Cada caso fija su propia
// precondición con `desactivarCajero()` / `reactivarCajero()`, que son
// idempotentes; el orden lo garantiza `workers: 1` de la config.

function loadEnv(path: string) {
  try {
    for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  } catch { /* ignore */ }
}
loadEnv('.env'); loadEnv('.env.test')

const anon = () =>
  createClient(process.env.VITE_NODO_SUPABASE_URL!, process.env.VITE_NODO_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  })

async function signIn(creds: { email: string; password: string }): Promise<SupabaseClient> {
  const c = anon()
  const { error } = await c.auth.signInWithPassword(creds)
  if (error) throw error
  return c
}

const SUFFIX = Date.now().toString().slice(-6)
const SIN_SEDE = /No tienes una sede activa/i

let owner: SupabaseClient
let cajero: SupabaseClient        // sesión abierta ANTES de desactivarlo: el token sobrevive
let OWNER_ID = ''
let CAJERO_ID = ''
let SEDE = ''
let CAT = ''
let PROD = ''                     // stock_tracking = FALSE a propósito (ver abajo)
let ORDEN = ''

/**
 * Apaga al cajero. Idempotente. La sesión de `cajero` ya está abierta desde
 * `beforeAll`: su JWT sigue siendo válido, que es exactamente el escenario de
 * A2 — la app corta la sesión en el cliente, el token no se revoca.
 */
async function desactivarCajero(): Promise<void> {
  const off = await owner
    .from('profiles')
    .update({ is_active: false })
    .eq('id', CAJERO_ID)
    .select('id, is_active')
  expect(off.error, 'el owner debe poder desactivar a un empleado').toBeNull()
  expect((off.data ?? [])[0]?.is_active, 'precondición: el cajero queda apagado').toBe(false)
}

async function reactivarCajero(): Promise<void> {
  const on = await owner
    .from('profiles')
    .update({ is_active: true })
    .eq('id', CAJERO_ID)
    .select('id, is_active')
  expect(on.error).toBeNull()
  expect((on.data ?? [])[0]?.is_active, 'el cajero vuelve a estar activo').toBe(true)
}

/** Cuenta las líneas de la orden fixture. Es el EFECTO que mide el caso rojo. */
async function lineas(): Promise<number> {
  const { count, error } = await owner
    .from('order_items')
    .select('id', { count: 'exact', head: true })
    .eq('order_id', ORDEN)
  if (error) throw error
  return count ?? 0
}

test.beforeAll(async () => {
  owner = await signIn(ownerCreds())
  cajero = await signIn(cashierCreds())
  OWNER_ID = (await owner.auth.getUser()).data.user!.id
  CAJERO_ID = (await cajero.auth.getUser()).data.user!.id
  SEDE = (await owner.from('profiles').select('sede_id').eq('id', OWNER_ID).single()).data!
    .sede_id as string

  // Fixture propia. 🔴 El producto va con `stock_tracking = false` A PROPÓSITO:
  // mientras el defecto esté vivo, la RPC ESCRIBE de verdad, y sin tracking la
  // única huella es una línea en `order_items` — sin tocar `products.stock_qty`
  // ni dejar `stock_movements`, que este cliente no podría borrar (las dos
  // tablas son solo-SELECT). La orden se anula en `afterAll`, así que la línea
  // queda colgada de una venta anulada: invisible en historial, vistas y
  // cartera. Es la clase de residuo que A4 midió en `pos.spec` (deuda 67) y que
  // acá no se repite. Y el prefijo es `E2E ` a propósito: es uno de los dos que
  // `global-setup` purga al arrancar, así que si un fallo se lleva puesto el
  // `afterAll`, la corrida siguiente igual arranca limpia.
  const cat = await owner
    .from('categories')
    .insert({ sede_id: SEDE, name: `E2E RLSNeg ${SUFFIX}` })
    .select('id')
    .single()
  if (cat.error) throw cat.error
  CAT = cat.data.id as string

  const prod = await owner
    .from('products')
    .insert({
      sede_id: SEDE, category_id: CAT, name: `E2E RLSNeg Prod ${SUFFIX}`,
      price: 1000, kind: 'simple', stock_tracking: false,
    })
    .select('id')
    .single()
  if (prod.error) throw prod.error
  PROD = prod.data.id as string

  const ord = await owner
    .from('orders')
    .insert({ sede_id: SEDE, created_by: OWNER_ID, canal: 'mostrador', total: 0 })
    .select('id')
    .single()
  if (ord.error) throw ord.error
  ORDEN = ord.data.id as string
})

test.afterAll(async () => {
  // Red de seguridad, en este orden: el cajero vuelve a estar activo pase lo que
  // pase (el resto de la suite lo usa), y la fixture sale de circulación.
  if (owner && CAJERO_ID) await owner.from('profiles').update({ is_active: true }).eq('id', CAJERO_ID)
  if (owner && ORDEN) {
    await owner
      .from('orders')
      .update({ cancelled_at: new Date().toISOString(), cancelled_by: OWNER_ID, cancel_reason: `fixture ${SUFFIX}` })
      .eq('id', ORDEN)
  }
  if (owner && PROD) await owner.from('products').update({ is_active: false }).eq('id', PROD)
  if (owner && CAT) await owner.from('categories').update({ is_active: false }).eq('id', CAT)
})

// ── CONTROL NEGATIVO — va PRIMERO, y es obligatorio ─────────────────────────
//
// Regla del plan de A2: si toda la matriz niega, la sonda está mal, no la
// seguridad bien. Estos dos casos prueban que las mismas RPC, desde el rol
// correcto y ACTIVO, funcionan. Sin ellos, los rojos de abajo pasarían con la
// base caída, con las credenciales mal, o con la RPC renombrada.

test('control negativo: el owner ACTIVO sí puede agregar ítems y numerar', async () => {
  const antes = await lineas()

  const items = await owner.rpc('add_order_items_with_extras', {
    p_order_id: ORDEN,
    p_items: [{ product_id: PROD, qty: 1, unit_price: 1000 }],
  })
  expect(items.error, 'el owner activo DEBE poder agregar ítems a una orden de su sede').toBeNull()
  expect(await lineas(), 'y la línea tiene que quedar escrita').toBe(antes + 1)

  const num = await owner.rpc('next_order_number', { p_sede_id: SEDE })
  expect(num.error, 'el owner activo DEBE poder numerar en su sede').toBeNull()
  expect(typeof num.data, 'devuelve el correlativo').toBe('number')
})

test('control negativo: el owner ACTIVO sí puede ajustar stock', async () => {
  // Producto propio con tracking, para no mover el stock de los del lab.
  const p = await owner
    .from('products')
    .insert({
      sede_id: SEDE, category_id: CAT, name: `E2E RLSNeg Track ${SUFFIX}`,
      price: 1000, kind: 'simple', stock_tracking: true, stock_qty: 10,
    })
    .select('id')
    .single()
  if (p.error) throw p.error

  const ok = await owner.rpc('adjust_stock', { p_product_id: p.data.id, p_qty: 5, p_reason: 'control negativo A2' })
  expect(ok.error, 'el owner activo DEBE poder ajustar stock de su sede').toBeNull()

  const after = await owner.from('products').select('stock_qty').eq('id', p.data.id).single()
  expect(after.data!.stock_qty, 'el ajuste tiene que verse').toBe(15)

  await owner.from('products').update({ is_active: false }).eq('id', p.data.id)
})

// ── EL CASO ROJO DE A2 — el desactivado con el token vivo ───────────────────

test('un DESACTIVADO no puede agregar ítems: la RPC niega y NO escribe', async () => {
  await desactivarCajero()
  const antes = await lineas()

  const res = await cajero.rpc('add_order_items_with_extras', {
    p_order_id: ORDEN,
    p_items: [{ product_id: PROD, qty: 3, unit_price: 1000 }],
  })

  // 1. Niega, y con el mensaje del guard de sede — no con otro que lo tape.
  expect(
    res.error,
    'un usuario desactivado NO debe poder escribir ítems: get_my_sede_id() es NULL y el guard tiene que verlo',
  ).not.toBeNull()
  expect(res.error!.message).toMatch(SIN_SEDE)

  // 2. Y el EFECTO: no escribió. Es la mitad que A2 midió como postgres antes
  //    del rollback (líneas 1 → 2, stock 10 → 7) y la que un `expect(error)`
  //    solo no cubriría si la RPC fallara DESPUÉS de insertar.
  expect(await lineas(), 'ninguna línea nueva: la RPC no escribió').toBe(antes)
})

test('un DESACTIVADO no puede numerar ventas de ninguna sede', async () => {
  await desactivarCajero()
  const res = await cajero.rpc('next_order_number', { p_sede_id: SEDE })
  expect(res.error, 'un desactivado NO debe poder consumir el correlativo').not.toBeNull()
  expect(res.error!.message).toMatch(SIN_SEDE)
})

test('un DESACTIVADO recibe el mensaje del guard de SEDE al ajustar stock, no el de permiso', async () => {
  await desactivarCajero()
  // 🔴 Este caso es el que A2 llamó "la misma línea, tapada por el segundo
  //    guard": hoy `adjust_stock` responde 'No autorizado para ajustar
  //    inventario' porque `has_permission` corre DESPUÉS de la comparación NULL.
  //    Verde por la razón equivocada: el guard de sede sigue sin evaluar, y el
  //    día que un rol tenga `inventario.ajustar` se abre. Por eso se exige el
  //    mensaje del guard de sede, no "que niegue".
  const res = await cajero.rpc('adjust_stock', {
    p_product_id: PROD, p_qty: 1, p_reason: 'sonda A2',
  })
  expect(res.error, 'un desactivado NO debe poder ajustar stock').not.toBeNull()
  expect(
    res.error!.message,
    'el primer guard que contesta tiene que ser el de sede; si contesta el de permiso, la comparación NULL sigue viva',
  ).toMatch(SIN_SEDE)
})

test('las otras cuatro RPC ya negaban al desactivado, y tienen que seguir', async () => {
  await desactivarCajero()
  // Son la FORMA DE REFERENCIA (`v_sede := get_my_sede_id(); if v_sede is null
  // then raise`). A2 las midió 8 de 8 en las sedes A y B. Se aseveran acá para
  // que el arreglo de las tres no las rompa, y para que nadie las "simplifique"
  // hacia la forma que se acaba de corregir.
  const casos: [string, Record<string, unknown>][] = [
    ['register_sale_payment', { p_order_id: ORDEN, p_payments: [{ method: 'cash', amount: 1000 }] }],
    ['register_sale_void', { p_order_id: ORDEN, p_reason: 'sonda A2' }],
    ['register_debt_payment', { p_order_id: ORDEN, p_amount: 1, p_payment_method: 'cash' }],
    ['register_purchase', { p_invoice: { supplier_id: crypto.randomUUID() }, p_items: [] }],
  ]
  for (const [rpc, args] of casos) {
    const res = await cajero.rpc(rpc, args)
    expect(res.error, `${rpc} debe negar al desactivado`).not.toBeNull()
    expect(res.error!.message, `${rpc} niega por sede, no por otra razón`).toMatch(SIN_SEDE)
  }
})

// ── LA MATRIZ REDUCIDA — lo que el mutante M9 de A4 destapó ─────────────────

test('las tablas solo-SELECT niegan el INSERT directo de un cajero ACTIVO', async () => {
  await reactivarCajero()
  // A2 midió las 23 tablas × 4 operaciones × 3 roles; acá va la forma reducida
  // que M9 mostró que faltaba: con una policy `INSERT ... with check (true)` en
  // `debt_payments`, `fiado.spec` quedaba 12/12 verde. Estas cinco tablas se
  // escriben SOLO por RPC (SECURITY DEFINER), nunca desde el cliente.
  const intentos: [string, Record<string, unknown>][] = [
    ['debt_payments', { sede_id: SEDE, order_id: ORDEN, amount: 1, payment_method: 'cash' }],
    ['order_items', { order_id: ORDEN, product_id: PROD, qty: 1, unit_price: 1000 }],
    ['payments', { order_id: ORDEN, sede_id: SEDE, method: 'cash', amount: 1 }],
    ['stock_movements', { sede_id: SEDE, product_id: PROD, type: 'adjustment', qty: 1 }],
    ['purchase_invoices', { sede_id: SEDE, supplier_id: crypto.randomUUID() }],
  ]
  for (const [tabla, fila] of intentos) {
    const res = await cajero.from(tabla).insert(fila).select('id')
    expect(res.error, `${tabla} NO debe aceptar un INSERT directo desde el cliente`).not.toBeNull()
    expect(res.error!.code, `${tabla} rechaza por RLS (42501), no por otra cosa`).toBe('42501')
  }

  // Control negativo de esta matriz: el mismo cajero SÍ lee lo que le
  // corresponde. Si todo diera error, la sonda estaría mal, no la seguridad bien.
  const lee = await cajero.from('orders').select('id').eq('sede_id', SEDE).limit(1)
  expect(lee.error, 'el cajero activo SÍ debe poder leer las órdenes de su sede').toBeNull()
  expect((lee.data ?? []).length, 'y encontrar al menos una').toBeGreaterThan(0)
})
