import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

// ============================================================================
// 🔴 LIMPIEZA DE UNA SOLA VEZ, YA EJECUTADA — ⛔ NO ES UNA PLANTILLA
//
// Anula las ventas a crédito de FIXTURE que quedaron vivas en Cartera de LAB
// antes de que las limpiezas de los specs supieran anular las suyas (deuda 130).
//
// ⛔ **ESTO NO SE VUELVE A CORRER NI SE COPIA.** Existe como registro de qué se
//    tocó y con qué guards. La forma correcta de que esto no vuelva a pasar es
//    que CADA SPEC limpie lo suyo —la otra mitad de la 130—, no un script que
//    barre después. Barrer sin arreglar quién ensucia deja el lab igual en cinco
//    corridas.
// ⚠️ Y se escribe con esta advertencia arriba por un caso medido del proyecto:
//    un `.sql` archivado en el repo **no se lee como historia, se lee como
//    plantilla** — `_heredado/storage-product-images.sql` tenía tres defectos y
//    el único motivo por el que no costaron nada es que nunca se aplicó.
//
// ── R0, las cuatro preguntas ────────────────────────────────────────────────
// 1 CLASE     por-id. Se fija cada fila por UUID, una por una. NUNCA por patrón:
//             el patrón se re-evalúa contra los datos del día que corra.
// 2 PRECEDENTE la orden fantasma de Muscle Pro, anulada con `update` directo
//             porque `register_sale_void` la rechazaba — y el criterio «limpiar
//             residuo produjo residuo»: el camino de MENOR escritura.
// 3 MODO DE FALLO  si el objetivo se resolviera por nombre, anularía ventas que
//             no son de fixture. Fail-closed: lista derivada e impresa, `update`
//             con `.eq('id')` Y `.is('cancelled_at', null)`, error CAPTURADO y
//             fila devuelta verificada, y conteo antes/después que tiene que
//             cerrar. RLS acota a LAB por construcción: esta sesión sólo ve las
//             sedes de su organización, medido.
// 4 OBJETIVO  por UUID. Allowlist de los ids que devolvió la enumeración.
//
// ⚠️ NO HAY `begin/commit`: `supabase-js` no abre transacción, así que cada
//    `update` es su propia sentencia. Se compensa con la verificación POR FILA
//    —cada una devuelve su id o se cuenta como fallo— más el cruce final.
//
// 🔴 LO QUE ESTE CAMINO NO HACE, Y VA ESCRITO EN EL MOTIVO DE CADA FILA: **no
//    revierte el stock.** `register_sale_void` sí lo hace; un `update` directo no
//    puede. Estas ventas quedan anuladas con su stock ya descontado. Se acepta
//    porque son de fixture, en LAB, sobre productos de fixture — y porque la
//    alternativa (abrir una jornada para usar la RPC) ya se midió que NO
//    funciona: el guard rechaza toda venta anterior a esa jornada, y el intento
//    deja una jornada vacía que tampoco se puede borrar.
//
// Uso:  node scripts/limpiar-fiado-de-fixture.mjs --dry-run   (mira y no toca)
//       node scripts/limpiar-fiado-de-fixture.mjs             (ejecuta)
// ============================================================================

const DRY = process.argv.includes('--dry-run')

for (const f of ['.env', '.env.test']) {
  try {
    for (const l of readFileSync(f, 'utf8').split(/\r?\n/)) {
      const m = l.match(/^([A-Z0-9_]+)=(.*)$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  } catch { /* opcional */ }
}

const db = createClient(process.env.VITE_NODO_SUPABASE_URL, process.env.VITE_NODO_SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
})
const { error: eLogin } = await db.auth.signInWithPassword({
  email: process.env.E2E_OWNER_EMAIL, password: process.env.E2E_OWNER_PASSWORD,
})
if (eLogin) { console.error('no se pudo entrar como owner —', eLogin.message); process.exit(2) }

const uid = (await db.auth.getUser()).data.user.id
const prof = (await db.from('profiles').select('sede_id, organization_id').eq('id', uid).single()).data
const org = (await db.from('organizations').select('name').eq('id', prof.organization_id).single()).data

// 🔴 GUARD FAIL-CLOSED: si la organización no es LAB, no se toca nada. Es el
//    mismo guard que `tests/global-setup.ts` y por la misma razón: LAB convive
//    con los datos reales en el mismo proyecto de Supabase.
if (org?.name !== 'LAB') {
  console.error(`🔴 ABORTA: la organización de estas credenciales es "${org?.name}", no LAB.`)
  process.exit(2)
}
console.log(`organizacion: ${org.name} ✅   sede del owner: ${prof.sede_id}`)

const PREFIJOS = ['E2E %', 'AV %', 'RLS Neg %']
const orFixture = PREFIJOS.map((p) => `customer_name.like.${p}`).join(',')

const leerVivas = async () => {
  const { data, error } = await db.from('orders')
    .select('id, order_number, customer_name, total, created_at, sede_id')
    .is('cancelled_at', null).in('payment_status', ['pending', 'partial']).or(orFixture)
    .order('created_at')
  if (error) { console.error('fallo leyendo:', error.message); process.exit(2) }
  return data
}

const antes = await leerVivas()
console.log(`\nANTES: ${antes.length} venta(s) de fixture vivas en Cartera\n`)
for (const r of antes) {
  console.log(`  ${r.id}  #${r.order_number ?? '—'}  ${String(r.customer_name).padEnd(28)} ${String(r.total).padStart(8)}  ${r.created_at.slice(0, 10)}  sede=${r.sede_id === prof.sede_id ? 'la del owner' : '🔴 OTRA'}`)
}

const ajenas = antes.filter((r) => r.sede_id !== prof.sede_id)
if (ajenas.length > 0) {
  console.error(`\n🔴 ABORTA: ${ajenas.length} fila(s) no son de la sede del owner.`)
  process.exit(2)
}

const MOTIVO =
  'Residuo del arnes E2E: venta de fixture que quedo viva en Cartera. Anulada por ' +
  'update directo y NO por register_sale_void, que la rechaza (su jornada esta ' +
  'cerrada). Por eso el STOCK NO se revirtio. Deuda 130.'

if (DRY) {
  console.log(`\n--dry-run: NO se tocó nada. Se anularían ${antes.length}.`)
  console.log(`motivo que llevaría cada fila:\n  "${MOTIVO}"`)
  process.exit(0)
}

let ok = 0
const fallos = []
for (const r of antes) {
  // por UUID, y con `is('cancelled_at', null)` para que sea idempotente: si otra
  // cosa la anuló en el medio, esta sentencia no devuelve fila y se cuenta como
  // tal en vez de pisar nada.
  const { data, error } = await db.from('orders')
    .update({ cancelled_at: new Date().toISOString(), cancel_reason: MOTIVO, cancelled_by: uid })
    .eq('id', r.id).is('cancelled_at', null)
    .select('id')
  if (error) { fallos.push(`${r.id}: ${error.message}`); continue }
  if ((data ?? []).length !== 1) { fallos.push(`${r.id}: el update no devolvió 1 fila (devolvió ${(data ?? []).length})`); continue }
  ok++
}

const despues = await leerVivas()
console.log(`\nanuladas: ${ok}   fallos: ${fallos.length}`)
for (const f of fallos) console.log('  🔴 ' + f)
console.log(`DESPUES: ${despues.length} vivas`)
console.log(`CRUCE: ${antes.length} antes - ${ok} anuladas = ${antes.length - ok}  ·  medido despues: ${despues.length}  ${antes.length - ok === despues.length ? '✅ cierra' : '🔴 NO CIERRA'}`)
process.exit(fallos.length === 0 && despues.length === 0 ? 0 : 1)
