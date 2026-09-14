// ============================================================================
// SONDA DE SOLO LECTURA sobre el tenant de la clienta.
//
// ⛔ NO ESCRIBE NADA. Ni un insert, ni un update, ni un rpc que mute.
// Entra con la cuenta de Alejandro (MPE/MPP) — no con la service_role key.
//
// QUE CONTESTA, y es la premisa de la que depende el orden de carga:
//   ¿`products.cost_price` esta NULO o esta en CERO en los productos cargados?
//   El esquema dice nullable sin default, pero un esquema es una DECLARACION y
//   no ejecuta (corolario de R4). Esto lo mide contra la base.
//
// 🔴 CUENTA EN EL SERVIDOR (`count: 'exact', head: true`), no sobre filas
//    traidas: PostgREST corta en 1000 filas sin error y sin aviso, y contar del
//    lado del cliente mide la pagina. Segunda aparicion de esa clase.
// ============================================================================
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync('.env', 'utf8').split(/\r?\n/).filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))

const db = createClient(env.VITE_NODO_SUPABASE_URL, env.VITE_NODO_SUPABASE_ANON_KEY)
const { error: eAuth } = await db.auth.signInWithPassword({
  email: process.env.MPE, password: process.env.MPP })
if (eAuth) { console.error('no entro: ' + eAuth.message); process.exit(1) }

const { data: sedes, error: eS } = await db.from('sedes').select('id, name')
if (eS) { console.error('sedes: ' + eS.message); process.exit(1) }
console.log('== SEDES VISIBLES ==')
for (const s of sedes) console.log('   %s  %s', s.id, s.name)

const sede = sedes.find((s) => /v3/i.test(s.name))
if (!sede) { console.error('\nno encuentro la sede del catalogo v3'); process.exit(1) }
console.log('\n== SEDE ELEGIDA ==\n   %s  «%s»', sede.id, sede.name)

// conteos EN EL SERVIDOR
const cuenta = async (f) => {
  const q = f(db.from('products').select('*', { count: 'exact', head: true }).eq('sede_id', sede.id))
  const { count, error } = await q
  if (error) { console.error('conteo: ' + error.message); process.exit(1) }
  return count
}
const total   = await cuenta((q) => q)
const costoNu = await cuenta((q) => q.is('cost_price', null))
const costoCe = await cuenta((q) => q.eq('cost_price', 0))
const stockNu = await cuenta((q) => q.is('stock_qty', null))
const stockCe = await cuenta((q) => q.eq('stock_qty', 0))

console.log('\n== PRODUCTOS DE ESA SEDE (contado en el servidor) ==')
console.log('   total:            %d', total)
console.log('   cost_price NULO:  %d   ·  en CERO: %d', costoNu, costoCe)
console.log('   stock_qty  NULO:  %d   ·  en CERO: %d', stockNu, stockCe)

// el CRUCE: las partes tienen que cerrar con el total
const conCosto = await cuenta((q) => q.not('cost_price', 'is', null))
console.log('\n   cruce: nulos %d + no-nulos %d = %d   (total %d)  -> %s',
  costoNu, conCosto, costoNu + conCosto, total, costoNu + conCosto === total ? 'CIERRA' : '🔴 NO CIERRA')

console.log('\n== VEREDICTO ==')
if (costoNu === total && costoCe === 0)
  console.log('   ✅ los %d estan con cost_price NULO. La medicion 0-de-110 se sostiene:\n' +
              '      el orden intra-dia decide, y un nulo se ve como hueco.', total)
else if (costoCe > 0)
  console.log('   🔴 hay %d en CERO. Un costo cero congela un MARGEN DEL 100%% falso,\n' +
              '      que se lee como buen negocio y no como dato faltante. PARAR.', costoCe)
else
  console.log('   ⚠️ %d ya tienen costo. La ventana es menor de lo medido; recalcular.', conCosto)

// ordenes/jornadas ya existentes en esa sede — para no cargar dos veces
for (const t of ['orders', 'jornadas', 'purchase_invoices', 'cash_movements', 'customers']) {
  const { count, error } = await db.from(t).select('*', { count: 'exact', head: true }).eq('sede_id', sede.id)
  console.log('   ' + t.padEnd(18) + ' ' + (error ? 'error: ' + error.message : count))
}

// 🔴 La sede deberia estar SIN ventas. Si hay alguna, hay que saber QUE es
//    antes de cargar: una orden previa cambia el correlativo y puede ser
//    residuo de una sonda (la clase «una sonda que escribe necesita su
//    limpieza en el mismo turno»).
const { data: ords, error: eO } = await db.from('orders')
  .select('id, order_number, total, status, created_at, cancelled_at, canal, customer_id')
  .eq('sede_id', sede.id)
if (eO) console.error('ordenes: ' + eO.message)
else { console.log('\n== LAS ORDENES QUE YA ESTAN ==')
  for (const o of ords) console.log('   ' + JSON.stringify(o)) }
