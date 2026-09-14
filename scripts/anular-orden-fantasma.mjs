// ============================================================================
// ANULA LA ORDEN FANTASMA DE LA SEDE v3 — residuo NUESTRO, no una venta suya.
//
// QUE ES: la fase 5 del cargador de catalogo dejo una orden #2 `pending` /
// `partial`, total 0, SIN lineas y SIN pagos, con un cliente asociado.
//
// 🔴 POR QUE HAY QUE SACARLA Y NO ALCANZA CON DEJARLA: Cartera filtra
//    `payment_status in ('pending','partial')` y `cancelled_at is null`
//    (`src/lib/supabase-helpers.ts`, la consulta de `getDebts`). La fantasma
//    cumple las dos, asi que aparece como una fila mas **en la pantalla donde
//    ella decide a quien cobrarle**. Un deudor inventado por nosotros.
//
// ⛔ NO SE BORRA: ninguna tabla tiene policy de DELETE. Anular es AGREGAR UN
//    HECHO —`cancelled_at` + motivo— que es el criterio del proyecto: la
//    historia no se reescribe, se le agrega. El motivo dice que fue NUESTRA,
//    para que dentro de seis meses no se lea como una venta suya anulada.
//
// 🔴 R0 · MODO DE FALLO: con un uuid equivocado esto ANULA UNA VENTA REAL.
//    Por eso el objetivo va fijado por UUID —nunca por nombre ni por «la que
//    tenga total 0»— y ANTES de tocar nada se comprueban sus cuatro
//    propiedades. Si alguna no da, aborta sin escribir.
//
// USO: MPE=<correo> MPP=<clave> node scripts/anular-orden-fantasma.mjs [--aplicar]
// ============================================================================
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const ORDEN = '4b984fb3-8278-4370-94f4-ba98e8693298'
const SEDE  = 'd11e803c-298d-41fe-806f-ae71e84653f8'
const MOTIVO = 'orden vacía creada por el cargador de catálogo, sin líneas ni pagos'
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
const { error: eAuth } = await db.auth.signInWithPassword({
  email: process.env.MPE, password: process.env.MPP })
if (eAuth) abortar('no entro: ' + eAuth.message)

// ── LAS CUATRO PROPIEDADES, comprobadas ANTES de escribir ───────────────────
// 🔴 Se piden las columnas POR NOMBRE, nunca `select('*')`: un volcado de todas
//    las columnas imprime `customer_name`, que es PII de la clienta.
const { data: o, error: eO } = await db.from('orders')
  .select('id, sede_id, order_number, total, payment_status, cancelled_at')
  .eq('id', ORDEN).single()
if (eO || !o) abortar('no encuentro la orden ' + ORDEN + ': ' + (eO?.message ?? ''))

const { count: nItems, error: eI } = await db.from('order_items')
  .select('*', { count: 'exact', head: true }).eq('order_id', ORDEN)
if (eI) abortar('no pude contar las lineas: ' + eI.message)
const { count: nPagos, error: eP } = await db.from('payments')
  .select('*', { count: 'exact', head: true }).eq('order_id', ORDEN)
if (eP) abortar('no pude contar los pagos: ' + eP.message)

console.log('══ LA FILA, ANTES DE TOCARLA ══')
console.log('   id             %s', o.id)
console.log('   sede_id        %s', o.sede_id)
console.log('   order_number   %s', o.order_number)
console.log('   total          %s', o.total)
console.log('   payment_status %s', o.payment_status)
console.log('   cancelled_at   %s', o.cancelled_at)
console.log('   lineas         %d   ·   pagos %d', nItems, nPagos)

// ⛔ Fail-closed: cualquiera de estas que no de, aborta. Una venta REAL de la
//    clienta tiene lineas y total > 0, asi que ninguna puede pasar por aca.
if (o.sede_id !== SEDE)    abortar('la orden no es de la sede v3', 'sede: ' + o.sede_id)
if (Number(o.total) !== 0) abortar('la orden tiene total ' + o.total + ', no 0',
  'una orden con total NO es la fantasma. Es una venta. NO se anula.')
if (nItems !== 0)          abortar('la orden tiene ' + nItems + ' linea(s)',
  'la fantasma no tiene ninguna. Esto es otra cosa.')
if (nPagos !== 0)          abortar('la orden tiene ' + nPagos + ' pago(s)',
  'la fantasma no tiene ninguno. Esto es otra cosa.')
if (o.cancelled_at)        abortar('la orden YA estaba anulada el ' + o.cancelled_at,
  'no hay nada que hacer.')
console.log('\n  ✅ las cuatro propiedades dan: es la fantasma, no una venta')

// ── el CONTROL CRUZADO: cuantas filas ve Cartera hoy ───────────────────────
// 🔴 Con la consulta DEL PRODUCTO y sin filtros propios — no excluyendo nada
//    por id, que es exactamente el defecto que destapo esta orden.
const cartera = async () => {
  const { data, error } = await db.from('orders')
    .select('id, total, debt_payments(amount)')
    .eq('sede_id', SEDE).in('payment_status', ['pending', 'partial']).is('cancelled_at', null)
  if (error) abortar('no pude leer Cartera: ' + error.message)
  const saldo = data.reduce((a, x) =>
    a + Number(x.total) - (x.debt_payments ?? []).reduce((b, d) => b + Number(d.amount), 0), 0)
  return { filas: data.length, saldo }
}
const antes = await cartera()
console.log('  CARTERA ahora: %d fila(s) · saldo %s', antes.filas, antes.saldo.toLocaleString('es-CO'))

if (!APLICAR) {
  console.log('\nSOLO LECTURA: no se escribio nada. Para anular, --aplicar.')
  console.log('Se escribiria: register_sale_void(%s, «%s»)', ORDEN, MOTIVO)
  process.exit(0)
}

// ── LA JORNADA DE HOY, y por que hace falta ────────────────────────────────
// 🔴 `register_sale_void` EXIGE JORNADA ABIERTA, y la carga del historico cerro
//    las 15. Asi que anular obliga a abrir una 16.
//
// ⚠️ CONSECUENCIA DECLARADA, no escondida: queda una jornada con la fecha de
//    HOY, sin ventas, con una sola anulacion adentro. Eso es exactamente lo que
//    paso —un dia administrativo en que corregimos un residuo nuestro— y se ve
//    asi en Turnos. La alternativa era fecharla en el pasado, que seria escribir
//    una fecha falsa: la deuda 97 existe justamente para no hacer eso.
//
// ⚠️ Y se cierra por el camino NORMAL, no con `cerrar_jornada_con_fecha`: el
//    trigger estampa `now()` en la transicion, y hoy es hoy. La excepcion de la
//    97 es para fechar en el PASADO; usarla aca seria usarla porque esta a mano.
const { data: perfil, error: ePe } = await db.from('profiles').select('id').limit(1).single()
if (ePe) abortar('no pude leer el perfil: ' + ePe.message)

const { data: jor, error: eJ } = await db.from('jornadas')
  .insert({ sede_id: SEDE, opened_by: perfil.id, opening_amount: 0 })
  .select('id, opened_at').single()
if (eJ) abortar('no pude abrir la jornada: ' + eJ.message,
  'si quedo una abierta, cerrala antes de reintentar.')
console.log('\n  jornada 16 ABIERTA %s  (dia administrativo, sin ventas)', jor.opened_at)

// 🔴 La jornada se cierra PASE LO QUE PASE. Si quedara abierta bloquea la sede
//    entera: solo puede haber una por sede, y el proximo intento aborta.
const cerrarJornada = async () => {
  const { error } = await db.from('jornadas')
    .update({ closed_at: new Date().toISOString(), closed_by: perfil.id }).eq('id', jor.id)
  if (error) console.error('🔴 NO PUDE CERRAR LA JORNADA ' + jor.id + ': ' + error.message +
    '\n   Cerrala a mano ANTES de volver a operar en esta sede.')
  else console.log('  jornada 16 CERRADA (sin arqueo: nadie conto nada hoy)')
}

// ── LA ESCRITURA: una fila, fijada por uuid ────────────────────────────────
console.log('\n══ ANULANDO ══  1 fila, fijada por uuid')
const { data: res, error: eV } = await db.rpc('register_sale_void', {
  p_order_id: ORDEN, p_reason: MOTIVO })
if (eV) { await cerrarJornada(); abortar('register_sale_void: ' + eV.message) }
console.log('   la RPC devolvio: ' + JSON.stringify(res))
await cerrarJornada()

// ── VERIFICAR CONTRA LA BASE, no contra el retorno de la RPC ───────────────
const { data: d, error: eD } = await db.from('orders')
  .select('id, cancelled_at, cancel_reason, payment_status')
  .eq('id', ORDEN).single()
if (eD) abortar('no pude releer la orden: ' + eD.message)
console.log('\n══ LA FILA, DESPUES ══')
console.log('   cancelled_at   %s', d.cancelled_at)
console.log('   cancel_reason  %s', d.cancel_reason)
console.log('   payment_status %s', d.payment_status)

const despues = await cartera()
console.log('\n══ CARTERA ══  %d -> %d fila(s)  ·  saldo %s -> %s',
  antes.filas, despues.filas, antes.saldo.toLocaleString('es-CO'), despues.saldo.toLocaleString('es-CO'))

if (!d.cancelled_at) abortar('la orden sigue SIN anular')
if (despues.filas !== antes.filas - 1) abortar('Cartera paso de ' + antes.filas + ' a ' + despues.filas + ', esperaba una menos')
if (despues.saldo !== antes.saldo) abortar('el saldo cambio de ' + antes.saldo + ' a ' + despues.saldo,
  'la fantasma aportaba 0. Si el saldo se movio, se anulo otra cosa.')
console.log('\n  ✅ Cartera muestra una fila menos y EL SALDO NO SE MOVIO —')
console.log('     que es lo que prueba que lo anulado aportaba cero.')
