// ============================================================================
// ANULA LA ORDEN FANTASMA CON UN UPDATE DIRECTO — y por que no por la RPC.
//
// 🔴 `register_sale_void` LA RECHAZA, y con razon:
//      «Esta venta pertenece a una jornada cerrada y no puede anularse»
//    Su guard es `v_created_at < v_jornada_opened`, y existe para que nadie
//    revierta PLATA de un periodo cerrado.
//
// ✅ POR QUE LA EXCEPCION ES LEGITIMA, y esta medido, no argumentado:
//    la fila tiene CERO lineas, CERO pagos y CERO abonos, y aporta CERO al
//    saldo de Cartera (725.000 con ella y sin ella). O sea: **no hay plata que
//    revertir**, que es exactamente lo que el guard protege. La RPC rechaza
//    porque no puede distinguir una orden vacia de una con movimientos; esa
//    distincion la tenemos con el dato delante.
//    ⚠️ Y de las tres cosas que hace la RPC —guards, devolver stock linea por
//    linea, y el `update orders`— las dos primeras son NO-OP sobre esta fila.
//    Su trabajo sustantivo aca es el update, y es el que se hace.
//
// ⛔ EL GUARD NO SE TOCA. La RPC queda intacta para todos los dias; esto es UNA
//    excepcion, sobre UNA fila, declarada en el motivo que queda escrito en la
//    base. No es relajar un camino: es no usarlo, una vez, con la razon a la
//    vista. (Ver CLAUDE.md: «no se quita un guard del camino normal».)
//
// 🔴 R0 · MODO DE FALLO: con un uuid equivocado esto ANULA UNA VENTA REAL. Por
//    eso: objetivo por UUID y NUNCA por criterio —un `where` que describa la
//    fila podria alcanzar otra—, las cuatro propiedades comprobadas antes,
//    1 fila contada antes y 1 despues, y EL SALDO COMO TESTIGO: si se mueve,
//    se anulo otra cosa y aborta.
//
// USO: MPE=<correo> MPP=<clave> node scripts/anular-fantasma-update-directo.mjs [--aplicar]
// ============================================================================
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const ORDEN = '4b984fb3-8278-4370-94f4-ba98e8693298'
const SEDE  = 'd11e803c-298d-41fe-806f-ae71e84653f8'
const MOTIVO = 'orden vacía creada por el cargador de catálogo, sin líneas ni pagos — ' +
  'anulada con update directo porque register_sale_void rechaza órdenes de jornada cerrada'
const APLICAR = process.argv.includes('--aplicar')

const abortar = (que, queHacer) => {
  console.error('\n🔴 ABORTA: ' + que)
  if (queHacer) console.error('   ' + queHacer)
  process.exit(1)
}

const env = Object.fromEntries(
  readFileSync('.env', 'utf8').split(/\r?\n/).filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))
const db = createClient(env.VITE_NODO_SUPABASE_URL, env.VITE_NODO_SUPABASE_ANON_KEY)
const { data: sesion, error: eAuth } = await db.auth.signInWithPassword({
  email: process.env.MPE, password: process.env.MPP })
if (eAuth) abortar('no entro: ' + eAuth.message)

// ── CARTERA con la consulta DEL PRODUCTO, sin filtros propios ───────────────
// `getDebts`, src/lib/supabase-helpers.ts — copiada, no equivalente.
const cartera = async () => {
  const { data, error } = await db.from('orders')
    .select('id, order_number, total, debt_payments(amount)')
    .eq('sede_id', SEDE).in('payment_status', ['pending', 'partial']).is('cancelled_at', null)
  if (error) abortar('no pude leer Cartera: ' + error.message)
  const saldo = data.reduce((a, x) => a + Number(x.total) -
    (x.debt_payments ?? []).reduce((b, d) => b + Number(d.amount), 0), 0)
  return { filas: data.length, saldo, nums: data.map((x) => x.order_number).sort((a, b) => a - b) }
}

// ── § 1 · CONTAR LAS FILAS ANTES DE TOCARLAS (R0) ──────────────────────────
// 🔴 Se cuenta POR EL UUID, que es el mismo objetivo que va a recibir el update.
//    Contar por un criterio distinto del que se usa para escribir es contar
//    otra cosa.
const { count: antesN, error: eCn } = await db.from('orders')
  .select('*', { count: 'exact', head: true }).eq('id', ORDEN)
if (eCn) abortar('no pude contar: ' + eCn.message)
console.log('══ FILAS QUE ALCANZA EL OBJETIVO, ANTES ══  %d', antesN)
if (antesN !== 1) abortar('el uuid alcanza ' + antesN + ' fila(s), esperaba 1')

// ── § 2 · LAS CUATRO PROPIEDADES ───────────────────────────────────────────
// Columnas pedidas POR NOMBRE: `select('*')` imprimiria `customer_name`, PII.
const { data: o, error: eO } = await db.from('orders')
  .select('id, sede_id, order_number, total, payment_status, cancelled_at')
  .eq('id', ORDEN).single()
if (eO || !o) abortar('no encuentro la orden: ' + (eO?.message ?? ''))
const { count: nItems } = await db.from('order_items')
  .select('*', { count: 'exact', head: true }).eq('order_id', ORDEN)
const { count: nPagos } = await db.from('payments')
  .select('*', { count: 'exact', head: true }).eq('order_id', ORDEN)
const { count: nAbonos } = await db.from('debt_payments')
  .select('*', { count: 'exact', head: true }).eq('order_id', ORDEN)

console.log('\n══ LA FILA ══')
console.log('   order_number %s · total %s · payment_status %s · cancelled_at %s',
  o.order_number, o.total, o.payment_status, o.cancelled_at)
console.log('   lineas %d · pagos %d · abonos %d', nItems, nPagos, nAbonos)

if (o.sede_id !== SEDE)    abortar('no es de la sede v3')
if (Number(o.total) !== 0) abortar('tiene total ' + o.total + ', no 0', 'con total es una VENTA. No se toca.')
if (nItems !== 0)          abortar('tiene ' + nItems + ' linea(s)', 'la fantasma no tiene ninguna.')
if (nPagos !== 0)          abortar('tiene ' + nPagos + ' pago(s)', 'la fantasma no tiene ninguno.')
if (nAbonos !== 0)         abortar('tiene ' + nAbonos + ' abono(s)', 'la fantasma no tiene ninguno.')
if (o.cancelled_at)        abortar('ya estaba anulada el ' + o.cancelled_at)
console.log('\n  ✅ cero lineas, cero pagos, cero abonos, total cero: no hay plata que revertir')

const antes = await cartera()
console.log('  CARTERA (getDebts, sin filtros propios): %d fila(s) · saldo %s',
  antes.filas, antes.saldo.toLocaleString('es-CO'))

if (!APLICAR) {
  console.log('\nSOLO LECTURA. Para aplicar, --aplicar. Se escribiria, sobre 1 fila:')
  console.log('   cancelled_at  = now()')
  console.log('   cancelled_by  = ' + sesion.user.id)
  console.log('   cancel_reason = «' + MOTIVO + '»')
  process.exit(0)
}

// ── § 3 · EL UPDATE · POR UUID, NUNCA POR CRITERIO ─────────────────────────
// 🔴 `.eq('id', ORDEN)` y nada mas que describa la fila. Un `where` por total=0
//    o por payment_status podria alcanzar otra el dia que exista otra igual.
//    `.is('cancelled_at', null)` NO describe la fila: impide pisar una anulacion
//    previa, o sea que solo puede reducir el alcance.
console.log('\n══ ESCRIBIENDO ══  1 fila, por uuid')
const { data: tocadas, error: eU } = await db.from('orders')
  .update({ cancelled_at: new Date().toISOString(), cancelled_by: sesion.user.id, cancel_reason: MOTIVO })
  .eq('id', ORDEN).is('cancelled_at', null)
  .select('id, cancelled_at, cancel_reason')
if (eU) abortar('el update fallo: ' + eU.message)

// ── § 4 · CONTAR LAS FILAS DESPUES ─────────────────────────────────────────
console.log('══ FILAS TOCADAS ══  %d', tocadas?.length ?? 0)
if (!tocadas || tocadas.length !== 1)
  abortar('el update toco ' + (tocadas?.length ?? 0) + ' fila(s), esperaba 1',
    'MIRAR A MANO antes de volver a correr nada.')

// ── § 5 · VERIFICAR CONTRA LA BASE, no contra el retorno ───────────────────
const { data: d, error: eD } = await db.from('orders')
  .select('cancelled_at, cancel_reason, payment_status').eq('id', ORDEN).single()
if (eD) abortar('no pude releer: ' + eD.message)
console.log('\n══ LA FILA, DESPUES ══')
console.log('   cancelled_at  %s', d.cancelled_at)
console.log('   cancel_reason %s', d.cancel_reason)
if (!d.cancelled_at) abortar('sigue SIN anular')
if (d.cancel_reason !== MOTIVO) abortar('el motivo no quedo textual')

const despues = await cartera()
console.log('\n══ CARTERA · getDebts SIN FILTROS PROPIOS ══')
console.log('   filas  %d  ->  %d', antes.filas, despues.filas)
console.log('   saldo  %s  ->  %s', antes.saldo.toLocaleString('es-CO'), despues.saldo.toLocaleString('es-CO'))
console.log('   numeros: ' + despues.nums.join(', '))

if (despues.filas !== 9) abortar('Cartera quedo en ' + despues.filas + ' filas, esperaba 9')
if (despues.saldo !== 725000) abortar('el saldo quedo en ' + despues.saldo + ', esperaba 725.000',
  '🔴 EL SALDO SE MOVIO: lo anulado NO era la fila vacia. MIRAR A MANO YA.')
console.log('\n  ✅ 9 filas y 725.000 — y el saldo NO se movio, que es lo que prueba')
console.log('     que lo anulado aportaba cero.')
