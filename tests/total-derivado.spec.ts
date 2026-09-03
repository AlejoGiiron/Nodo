import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { ownerCreds } from './helpers/auth'

// ============================================================================
// `orders.total` SE DERIVA EN EL SERVIDOR — deuda 80
//
// 🔴 POR QUÉ ES BLOQUEANTE DEL PRECIO EDITABLE. Hoy el total y las líneas salen
//    del MISMO `item.product.price` en el MISMO render, así que coinciden **por
//    construcción**: no están verificados, es que no pueden diferir. En cuanto
//    el precio de la línea es un estado que el cajero cambia, esa coincidencia
//    deja de ser estructural y pasa a ser una **convención** entre dos cálculos
//    del cliente — R1 nacido a propósito, sobre el número que sostiene la plata.
//
// LA FÓRMULA:
//   total = Σ(order_items.qty × unit_price)
//         + Σ(order_item_extras.qty × unit_price)
//         − orders.discount_amount
//
// ⚠️ Y `order_item_extras.qty` YA VIENE MULTIPLICADA por la cantidad de la
//    línea (`v_total_qty := v_extra_qty * v_item_qty` en la RPC de alta).
//    Volver a multiplicar por `oi.qty` es lo natural y DUPLICA los extras. El
//    caso de abajo mide justamente esa diferencia, con los dos números.
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

// Elegidos para que la trampa de los extras dé un número BIEN distinto.
const PRECIO = 10_000
const CANT = 3
const EXTRA_PRECIO = 2_000
const EXTRA_QTY = 2                                   // por unidad del producto
const DESCUENTO = 5_000

const LINEA = PRECIO * CANT                           // 30.000
const EXTRAS = EXTRA_PRECIO * EXTRA_QTY * CANT        // 12.000 (qty ya viene ×3)
const TOTAL_OK = LINEA + EXTRAS - DESCUENTO           // 37.000
const TOTAL_SI_DUPLICA = LINEA + EXTRAS * CANT - DESCUENTO  // 61.000

let db: SupabaseClient
let SEDE = ''
let OWNER = ''
let CAT = ''
let PRODUCTO = ''
let BARATO = ''
let EXTRA = ''
let CLIENTE = ''

async function crearOrden(extra: Record<string, unknown> = {}) {
  // ⚠️ SIN `total`: es lo que este spec viene a probar. La columna tiene
  //    `default 0`, así que la orden nace en cero y el trigger la corrige.
  const r = await db.from('orders').insert({
    sede_id: SEDE, created_by: OWNER, canal: 'mostrador', ...extra,
  }).select('id, total').single()
  if (r.error) throw r.error
  return r.data
}

async function totalDe(orderId: string): Promise<number> {
  const { data, error } = await db.from('orders').select('total').eq('id', orderId).single()
  if (error) throw error
  return Number(data.total)
}

test.beforeAll(async () => {
  db = createClient(process.env.VITE_NODO_SUPABASE_URL!, process.env.VITE_NODO_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  })
  const { error } = await db.auth.signInWithPassword(ownerCreds())
  if (error) throw error
  OWNER = (await db.auth.getUser()).data.user!.id
  SEDE = (await db.from('profiles').select('sede_id').eq('id', OWNER).single()).data!.sede_id as string

  CAT = (await db.from('categories')
    .insert({ sede_id: SEDE, name: 'E2E Total ' + SUFFIX }).select('id').single()).data!.id
  PRODUCTO = (await db.from('products').insert({
    sede_id: SEDE, category_id: CAT, name: 'E2E Derivado ' + SUFFIX,
    price: PRECIO, kind: 'simple', stock_tracking: false,
  }).select('id').single()).data!.id
  BARATO = (await db.from('products').insert({
    sede_id: SEDE, category_id: CAT, name: 'E2E Barato ' + SUFFIX,
    price: 3_000, kind: 'simple', stock_tracking: false,
  }).select('id').single()).data!.id

  EXTRA = (await db.from('extras').insert({
    sede_id: SEDE, name: 'E2E Extra ' + SUFFIX, price: EXTRA_PRECIO,
  }).select('id').single()).data!.id
  const link = await db.from('product_extras').insert({ product_id: PRODUCTO, extra_id: EXTRA })
  if (link.error) throw link.error

  CLIENTE = (await db.from('customers')
    .insert({ sede_id: SEDE, name: 'E2E Total ' + SUFFIX }).select('id').single()).data!.id
})

test.afterAll(async () => {
  if (!db) return
  await db.from('products').update({ is_active: false }).in('id', [PRODUCTO, BARATO])
  await db.from('extras').update({ is_active: false }).eq('id', EXTRA)
  await db.from('categories').update({ is_active: false }).eq('id', CAT)
  await db.from('customers').update({ is_active: false }).eq('id', CLIENTE)
})

test('🔴 el total se deriva de las líneas: con extras y descuento en la misma orden', async () => {
  const orden = await crearOrden({ discount_amount: DESCUENTO, discount_type: 'fixed' })
  expect(Number(orden.total), 'una orden sin líneas nace en 0, que es su total correcto').toBe(0)

  const alta = await db.rpc('add_order_items_with_extras', {
    p_order_id: orden.id,
    p_items: [{
      product_id: PRODUCTO, qty: CANT, unit_price: PRECIO,
      extras: [{ extra_id: EXTRA, qty: EXTRA_QTY }],
    }],
  })
  expect(alta.error).toBeNull()

  const total = await totalDe(orden.id)

  expect(
    total,
    `EL TOTAL NO SE DERIVA (deuda 80): lo manda el cliente y nadie lo verifica ` +
    `contra sus líneas. Esperado ${TOTAL_OK} = ${LINEA} de producto + ${EXTRAS} ` +
    `de extras − ${DESCUENTO} de descuento`,
  ).toBe(TOTAL_OK)

  // 🔴 EL CONTRASTE, y es la trampa del esquema: `order_item_extras.qty` YA
  //    viene multiplicada por la cantidad de la línea. Si el trigger volviera a
  //    multiplicar por `oi.qty` —que es lo que uno escribe sin mirar— los
  //    extras se duplicarían y el total daría este otro número, igual de
  //    plausible.
  expect(
    total,
    `los extras están duplicados: ${TOTAL_SI_DUPLICA} es lo que da multiplicar ` +
    `order_item_extras.qty por oi.qty, y esa qty YA venía multiplicada`,
  ).not.toBe(TOTAL_SI_DUPLICA)

  // Y la fórmula, verificada contra las filas reales en vez de contra constantes.
  const items = await db.from('order_items').select('qty, unit_price, id').eq('order_id', orden.id)
  const ids = (items.data ?? []).map((i) => i.id)
  const extras = await db.from('order_item_extras').select('qty, unit_price').in('order_item_id', ids)
  const sumaItems = (items.data ?? []).reduce((s, i) => s + i.qty * Number(i.unit_price), 0)
  const sumaExtras = (extras.data ?? []).reduce((s, e) => s + e.qty * Number(e.unit_price), 0)
  expect(total, 'la fórmula, contra las filas y no contra las constantes del test')
    .toBe(sumaItems + sumaExtras - DESCUENTO)
})

test('🔴 el descuento mayor que la PRIMERA línea no rompe el alta', async () => {
  // 🔴 ESTE CASO DECIDE LA FORMA DEL TRIGGER, y por eso está acá y no en el
  //    commit. Dos líneas de 3.000 con 5.000 de descuento: el total final es
  //    1.000 y es válido. Pero si el total se recalculara DESPUÉS DE CADA
  //    LÍNEA, al insertar la primera daría 3.000 − 5.000 = −2.000, y
  //    `orders.total` tiene `check (total >= 0)`: la venta entera se caería.
  //    Por eso el trigger es DIFERIDO — dispara al cerrar la transacción, con
  //    todas las líneas ya puestas.
  const orden = await crearOrden({ discount_amount: 5_000, discount_type: 'fixed' })

  const alta = await db.rpc('add_order_items_with_extras', {
    p_order_id: orden.id,
    p_items: [
      { product_id: BARATO, qty: 1, unit_price: 3_000 },
      { product_id: BARATO, qty: 1, unit_price: 3_000 },
    ],
  })
  expect(
    alta.error,
    'el estado intermedio (una sola línea contra el descuento entero) no puede ' +
    'tumbar la venta: el total es válido recién con todas las líneas',
  ).toBeNull()

  expect(await totalDe(orden.id), '3.000 + 3.000 − 5.000').toBe(1_000)
})

test('🔴 una venta a CRÉDITO también queda derivada', async () => {
  // Es el caso que la alternativa —validar en el cobro— dejaba afuera: un fiado
  // no registra pago, así que nunca habría pasado por esa validación. Y es
  // justamente el total que después alimenta la cartera.
  const orden = await crearOrden({
    status: 'pending', payment_status: 'pending',
    customer_id: CLIENTE, customer_name: 'E2E Total ' + SUFFIX,
  })

  const alta = await db.rpc('add_order_items_with_extras', {
    p_order_id: orden.id,
    p_items: [{ product_id: PRODUCTO, qty: 2, unit_price: PRECIO }],
  })
  expect(alta.error).toBeNull()

  expect(
    await totalDe(orden.id),
    'el fiado no pasa por register_sale_payment: si el total se validara ahí, ' +
    'estas ventas no se validarían nunca — y son las que van a la cartera',
  ).toBe(PRECIO * 2)
})
