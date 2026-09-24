import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

// ============================================================================
// SONDA DE RESIDUO DEL LABORATORIO
//
// 🔴 POR QUÉ EXISTE, con la cuenta del 2026-09-24 que la motivó: seis corridas
//    de la suite entera —unas dos horas— y **cero defectos de código**. Lo que
//    encontraron fue: residuo de fixture dos veces, el entorno una, el puerto
//    una, y dos de proceso.
//
// > **La suite era el detector de residuo POR ACCIDENTE.** Tardaba diecinueve
// > minutos en decir algo que una consulta dice en dos segundos.
//
// 🔴 Y PEOR: ERA UN DETECTOR CON RETARDO VARIABLE. Detecta cuando algo CRUZA UN
//    LÍMITE, no cuando aparece. Ochenta y cuatro ventas fiadas estuvieron ahí
//    unas diez corridas sin decir nada, hasta que la undécima pasó de 1000 y
//    rompió un KPI. El aviso llegó desacoplado de la causa, y quien lo recibió
//    no tenía forma de saber cuál de las diez corridas lo había dejado.
//
//    Por eso los umbrales de acá avisan **ANTES DEL CRUCE**: el objetivo no es
//    detectar el límite, es detectar la ACUMULACIÓN.
//
// ⚠️ EL LÍMITE DE ESTA SONDA, ESCRITO ACÁ PORQUE ES DONDE SE LEE: **mide lo que
//    YA SABEMOS que ensucia.** Cada chequeo salió de un fallo real, no de
//    imaginar. Una forma NUEVA de residuo no la ve hasta que alguien la agregue
//    — así que un verde de esta sonda no dice «el lab está limpio», dice «las
//    cinco cosas que sabemos que ensucian están bien».
//    No reemplaza a la suite: le saca un rol que tomó por accidente.
// ============================================================================

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
if (eLogin) { console.error('sonda: no se pudo entrar como owner —', eLogin.message); process.exit(2) }
const uid = (await db.auth.getUser()).data.user.id
const SEDE = (await db.from('profiles').select('sede_id').eq('id', uid).single()).data.sede_id

/** Prefijos con los que los specs nombran su fixture. Salen del código, no de la memoria. */
const PREFIJOS = ['E2E %', 'AV %', 'RLS Neg %']

const fallos = []
const avisos = []

/** Cuenta EN EL SERVIDOR: `head: true` no trae filas y no tiene tope de 1000. */
const contar = async (tabla, aplicar) => {
  let q = db.from(tabla).select('id', { count: 'exact', head: true })
  q = aplicar(q)
  const { count, error } = await q
  if (error) { console.error(`sonda: fallo contando ${tabla} —`, error.message); process.exit(2) }
  return count ?? 0
}

// ── 1 · JORNADAS ABIERTAS ───────────────────────────────────────────────────
// Hay UNA sola abierta por sede. Si queda una de otra corrida, el spec que
// necesite abrir la suya ABORTA y se lleva sus casos sin medir — costó
// 1 failed + 7 did not run el 2026-09-24.
{
  const { data, error } = await db.from('jornadas').select('id, opened_at')
    .eq('sede_id', SEDE).is('closed_at', null)
  if (error) { console.error('sonda: jornadas —', error.message); process.exit(2) }
  const n = (data ?? []).length
  console.log(`jornadas abiertas: ${n}`)
  if (n > 0) {
    fallos.push(
      `Hay ${n} jornada(s) ABIERTA(S) (${data.map((j) => j.id).join(', ')}).\n` +
      '   El próximo spec que necesite abrir la suya va a ABORTAR: hay una sola por sede.\n' +
      '   Cerralas antes de lanzar, o mirá qué corrida quedó a medias.')
  }
}

// ── 2 · EL TOPE DE 1000 — Y SU MARGEN ───────────────────────────────────────
// `getDebts` trae las órdenes con deuda SIN paginar, y PostgREST corta en 1000
// sin error. Pasado ese número, los KPI de Cartera mienten —incluido «Total por
// cobrar», que es plata— y los specs que los aseveran se caen (deuda 128).
// 🔴 El umbral avisa a 900, no a 1000: el problema de hoy fue que el aviso
//    llegó DESPUÉS del cruce.
{
  const TOPE = 1000
  const MARGEN = 900
  const conDeuda = await contar('orders', (q) =>
    q.eq('sede_id', SEDE).is('cancelled_at', null).in('payment_status', ['pending', 'partial']))
  const deFixture = await contar('orders', (q) => {
    let r = q.eq('sede_id', SEDE).is('cancelled_at', null).in('payment_status', ['pending', 'partial'])
    return r.or(PREFIJOS.map((p) => `customer_name.like.${p}`).join(','))
  })
  console.log(`órdenes con deuda: ${conDeuda} (tope ${TOPE}) · de fixture: ${deFixture}`)
  if (conDeuda >= MARGEN) {
    const cuanto = TOPE - conDeuda
    const base =
      conDeuda >= TOPE
        ? `Hay ${conDeuda} órdenes con deuda: YA SE CRUZÓ el tope de ${TOPE}.`
        : `Hay ${conDeuda} órdenes con deuda: faltan ${cuanto} para el tope de ${TOPE}.`
    fallos.push(
      `${base}\n` +
      `   Pasado el tope, Cartera muestra números TOPADOS —«Total por cobrar» incluido, y eso es plata—.\n` +
      (deFixture > 0
        ? `   ${deFixture} son de fixture: anulalas y el margen vuelve.\n`
        : '   NINGUNA es de fixture: esto ya no se limpia, es la deuda 128 (paginar `getDebts`).\n'))
  }
}

// ── 3 · VENTAS DE FIXTURE VIVAS EN CARTERA ──────────────────────────────────
// Las ventas a crédito de un spec quedan pendientes PARA SIEMPRE si nadie las
// anula. No es residuo inerte: empujan el conteo de arriba contra el tope.
{
  const vivas = await contar('orders', (q) => {
    const r = q.eq('sede_id', SEDE).is('cancelled_at', null).in('payment_status', ['pending', 'partial'])
    return r.or(PREFIJOS.map((p) => `customer_name.like.${p}`).join(','))
  })
  console.log(`ventas de fixture vivas en Cartera: ${vivas}`)
  if (vivas > 0) {
    fallos.push(
      `Hay ${vivas} venta(s) a crédito de FIXTURE vivas en Cartera.\n` +
      '   Cada corrida suma; ninguna se paga nunca. Anulalas y arreglá el `afterAll`\n' +
      '   del spec que las deja: la limpieza tiene que ANULAR sus ventas, no sólo\n' +
      '   desactivar al cliente (Cartera filtra órdenes, no clientes).')
  }
}

// ── 4 · FIXTURE ACTIVA EN EL CATÁLOGO ───────────────────────────────────────
// Un producto de fixture activo cambia lo que ve el POS: ordena por nombre, y
// un `AV …` se cuela antes que un `Lab …` (deuda 67, medida dos veces).
{
  const like = (q, col) => q.or(PREFIJOS.map((p) => `${col}.like.${p}`).join(','))
  const productos = await contar('products', (q) => like(q.eq('sede_id', SEDE).eq('is_active', true), 'name'))
  const categorias = await contar('categories', (q) => like(q.eq('sede_id', SEDE).eq('is_active', true), 'name'))
  const clientes = await contar('customers', (q) => like(q.eq('sede_id', SEDE).eq('is_active', true), 'name'))
  console.log(`fixture activa — productos: ${productos} · categorías: ${categorias} · clientes: ${clientes}`)
  const total = productos + categorias + clientes
  if (total > 0) {
    fallos.push(
      `Quedó fixture ACTIVA: ${productos} producto(s), ${categorias} categoría(s), ${clientes} cliente(s).\n` +
      '   Un producto de fixture activo se cuela en el POS —ordena por nombre— y\n' +
      '   cambia el carrito de specs que no hablan de él (deuda 67).')
  }
}

// ── 5 · ÓRDENES FECHADAS EN EL FUTURO ───────────────────────────────────────
// Una sonda dejó una orden fechada MAÑANA y mató cuatro specs que consultaban
// «la última»: el rojo decía «undefined leyendo unit_price» y ninguno hablaba
// de fechas (deuda 100).
{
  const futuras = await contar('orders', (q) =>
    q.eq('sede_id', SEDE).gt('created_at', new Date(Date.now() + 60_000).toISOString()))
  console.log(`órdenes fechadas en el futuro: ${futuras}`)
  if (futuras > 0) {
    fallos.push(
      `Hay ${futuras} orden(es) fechada(s) EN EL FUTURO.\n` +
      '   Se vuelven «la última» para todo spec que consulte por fecha, y el rojo\n' +
      '   aparece en archivos que no hablan de fechas (deuda 100).')
  }
}

console.log('')
for (const a of avisos) console.log('⚠️  ' + a)
if (fallos.length === 0) {
  console.log('✅ sonda de residuo: limpio (las cinco formas que sabemos que ensucian)')
  process.exit(0)
}
console.error(`🔴 SONDA DE RESIDUO: ${fallos.length} problema(s)\n`)
for (const f of fallos) console.error('🔴 ' + f + '\n')
console.error('⚠️  Esta sonda mide lo que YA SABEMOS que ensucia. Un verde no dice «el lab')
console.error('   está limpio»: dice que estas cinco formas están bien.\n')
process.exit(1)
