#!/usr/bin/env node
/**
 * ACTUALIZAR EL PRECIO DE PRODUCTOS YA CARGADOS, DESDE UNA TABLA DEL .md.
 *
 * Uso:
 *   export ADMIN_PASSWORD='<la contraseña del admin>'    # ⚠️ nunca en un archivo
 *   node scripts/actualizar-precios.mjs \
 *     --sede-id <uuid de la sede> \
 *     --email <correo del admin de esa sede> \
 *     --catalogo docs/muscle-pro-catalogo-v2.md \
 *     --seccion "## Los 17 ya cargados" \
 *     [--aplicar]
 *
 *   Sin `--aplicar` NO ESCRIBE: entra, lee, cruza la tabla contra la base y
 *   muestra qué cambiaría. Con `--aplicar` hace lo mismo, escribe, y relee.
 *
 * La tabla de la sección tiene TRES columnas: producto · precio actual · precio
 * nuevo. El precio actual no es decorativo: es el CONTRASTE. Si la base no dice
 * lo que la tabla afirma que dice, el script para — la tabla es una hipótesis
 * fechada y la base es el dato.
 *
 * ── LAS CUATRO DE R0, contestadas acá porque esto es un UPDATE ─────────────
 *  1. CLASE — por-id y fail-closed. El nombre sólo sirve para RESOLVER la fila;
 *     el update va por UUID. Y la lista de qué tocar es una allowlist explícita
 *     (las filas de la tabla): nada que no esté en ella se toca.
 *  2. PRECEDENTE — `cargar-catalogo.mjs` (los tres guards, la lectura por
 *     nombre sin maybeSingle) y `20260904120000_nombre_unico_por_sede.sql`
 *     (la normalización que se replica acá, letra por letra).
 *  3. MODO DE FALLO — un precio equivocado en un producto NO revienta: la cajera
 *     ve una sugerencia mal y la venta sale. Falla callado ⇒ fail-closed: aborta
 *     si un nombre no resuelve a EXACTAMENTE una fila activa, si el precio en
 *     base no es el que la tabla dice, si en la sede hay productos que la tabla
 *     no nombra, o si el conteo cambia entre antes y después.
 *  4. OBJETIVO — fijado por UUID (resuelto una vez, por nombre normalizado, con
 *     el índice único parcial como garantía de que hay uno solo). Y la sede va
 *     por argumento Y por la sesión: si no coinciden, para antes de leer.
 *     Filas contadas ANTES de tocarlas: se imprimen, y el total tiene que ser
 *     igual al número de filas de la tabla — en este paso la tabla ES el
 *     catálogo entero.
 *
 * ── POR QUÉ ENTRA CON SESIÓN Y NO CON service_role ─────────────────────────
 *    Igual que la carga: anon key + JWT del admin, así que la policy
 *    `products: gestionar` (sede_id = get_my_sede_id() and
 *    has_permission('productos.editar')) SE EVALÚA. Con service_role no.
 *
 * ── NO ES TRANSACCIONAL, y se dice ─────────────────────────────────────────
 *    Son N updates por PostgREST, uno por fila. Si el k-ésimo falla, los k-1
 *    anteriores QUEDARON. Por eso la verificación previa acepta dos estados por
 *    fila —el precio viejo (se actualiza) o el nuevo (ya estaba, no se toca)— y
 *    cualquier otro aborta: así una corrida que murió a la mitad se puede
 *    repetir sin que el contraste la bloquee, y sin aflojarlo para nada más.
 */

import { readFileSync, existsSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

// ════════════════════════════════════════════════════════════════════════════
// Argumentos y entorno
// ════════════════════════════════════════════════════════════════════════════
const args = new Map()
const banderas = new Set()
for (let i = 2; i < process.argv.length; i++) {
  const k = process.argv[i]
  if (!k?.startsWith('--')) continue
  const v = process.argv[i + 1]
  if (v === undefined || v.startsWith('--')) banderas.add(k.slice(2))
  else { args.set(k.slice(2), v); i++ }
}

function deDotEnv(clave) {
  if (!existsSync('.env')) return undefined
  for (const linea of readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
    if (m && m[1] === clave) return m[2].trim().replace(/^["']|["']$/g, '')
  }
  return undefined
}

const URL_BASE = process.env.SUPABASE_URL || deDotEnv('VITE_NODO_SUPABASE_URL')
const ANON = process.env.SUPABASE_ANON_KEY || deDotEnv('VITE_NODO_SUPABASE_ANON_KEY')
const PASSWORD = process.env.ADMIN_PASSWORD
const SEDE_ID = args.get('sede-id')
const EMAIL = args.get('email')
const RUTA = args.get('catalogo') || 'docs/muscle-pro-catalogo-v2.md'
const SECCION = args.get('seccion') || '## Los 17 ya cargados'
const APLICAR = banderas.has('aplicar')

const faltan = []
if (!URL_BASE) faltan.push('SUPABASE_URL (entorno) o VITE_NODO_SUPABASE_URL en .env')
if (!ANON) faltan.push('SUPABASE_ANON_KEY (entorno) o VITE_NODO_SUPABASE_ANON_KEY en .env')
if (!PASSWORD) faltan.push('ADMIN_PASSWORD (variable de entorno — nunca en un archivo)')
if (!SEDE_ID) faltan.push('--sede-id')
if (!EMAIL) faltan.push('--email')
if (faltan.length) {
  console.error('Faltan datos:\n  ' + faltan.join('\n  '))
  console.error('\nVer el encabezado de este archivo para el uso completo.')
  process.exit(2)
}

const COP = (n) => new Intl.NumberFormat('es-CO').format(n)
const salir = (codigo) => { console.log(`\nprecios_exit=${codigo}`); process.exit(codigo) }
const abortar = (motivo, queHacer) => {
  console.error(`\n🔴 PARA: ${motivo}`)
  if (queHacer) console.error(`QUE HACER: ${queHacer}`)
  salir(1)
}

// ════════════════════════════════════════════════════════════════════════════
// § 0 · La tabla — estricta: tres columnas, precios con round-trip
// ════════════════════════════════════════════════════════════════════════════
function tablaDe(md, encabezado) {
  const i = md.indexOf(encabezado)
  if (i < 0) abortar(`el documento no tiene la sección «${encabezado}»`,
    `revisá ${RUTA}, o pasá otra con --seccion`)
  const resto = md.slice(i + encabezado.length)
  const fin = resto.search(/\n## /)
  const bloque = fin < 0 ? resto : resto.slice(0, fin)
  const filas = []
  for (const linea of bloque.split(/\r?\n/)) {
    const t = linea.trim()
    if (!t.startsWith('|')) continue
    const celdas = t.split('|').slice(1, -1).map((c) => c.trim())
    if (celdas.every((c) => /^:?-{2,}:?$/.test(c))) continue
    filas.push(celdas)
  }
  if (filas.length < 2) abortar(`la tabla de «${encabezado}» no tiene filas`)
  return { encabezados: filas[0], filas: filas.slice(1) }
}

function precioCOP(texto, contexto) {
  const limpio = texto.replace(/\./g, '')
  if (!/^\d+$/.test(limpio)) abortar(`precio ilegible en ${contexto}: «${texto}»`)
  const n = Number(limpio)
  if (COP(n) !== texto) {
    abortar(`el precio de ${contexto} no vuelve idéntico: «${texto}» → ${n} → «${COP(n)}»`,
      'el documento usa punto como separador de miles y no lleva decimales')
  }
  return n
}

/** La MISMA normalización del índice `products_nombre_unico_por_sede`:
 *  lower(btrim(regexp_replace(name, '\s+', ' ', 'g'))). */
const normalizar = (s) => s.replace(/\s+/g, ' ').trim().toLowerCase()

const md = existsSync(RUTA) ? readFileSync(RUTA, 'utf8') : abortar(`no existe ${RUTA}`)
const t = tablaDe(md, SECCION)
if (t.encabezados.length !== 3) {
  abortar(`la tabla de «${SECCION}» tiene ${t.encabezados.length} columnas, esperaba 3 (producto · precio actual · precio nuevo)`)
}
const CAMBIOS = t.filas.map(([nombre, viejo, nuevo]) => ({
  nombre, clave: normalizar(nombre),
  viejo: precioCOP(viejo, `«${nombre}» (actual)`),
  nuevo: precioCOP(nuevo, `«${nombre}» (nuevo)`),
}))
if (new Set(CAMBIOS.map((c) => c.clave)).size !== CAMBIOS.length) {
  abortar('la tabla tiene nombres repetidos (normalizados)')
}

console.log('TABLA LEÍDA de %s · sección «%s»', RUTA, SECCION)
console.log('  filas: %d', CAMBIOS.length)
console.log('  suma precios actuales (control cruzado): %s', COP(CAMBIOS.reduce((a, c) => a + c.viejo, 0)))
console.log('  suma precios nuevos   (control cruzado): %s', COP(CAMBIOS.reduce((a, c) => a + c.nuevo, 0)))
console.log('  modo: %s', APLICAR ? '🔴 --aplicar: ESCRIBE' : 'sólo lectura (sin --aplicar no se escribe nada)')

// ════════════════════════════════════════════════════════════════════════════
// § 1 · Sesión como el admin de la sede — y GUARD 1
// ════════════════════════════════════════════════════════════════════════════
const db = createClient(URL_BASE, ANON, { auth: { persistSession: false } })
const { data: sesion, error: errLogin } =
  await db.auth.signInWithPassword({ email: EMAIL, password: PASSWORD })
if (errLogin) abortar(`no se pudo entrar como ${EMAIL}: ${errLogin.message}`,
  'revisá ADMIN_PASSWORD y --email. No se escribió nada.')

const { data: perfil, error: errPerfil } = await db
  .from('profiles').select('full_name, role, sede_id').eq('id', sesion.user.id).single()
if (errPerfil || !perfil) abortar(`la cuenta entró pero no tiene perfil: ${errPerfil?.message}`)
const { data: sede } = await db
  .from('sedes').select('name, organizations(name)').eq('id', perfil.sede_id).single()

console.log('\nSESIÓN: %s (%s)', perfil.full_name, perfil.role)
console.log('  organización: %s', sede?.organizations?.name ?? '(no visible)')
console.log('  sede:         %s   %s', sede?.name ?? '(no visible)', perfil.sede_id)
if (perfil.sede_id !== SEDE_ID) {
  abortar(`--sede-id NO es la sede de esta cuenta.\n         argumento: ${SEDE_ID}\n         la cuenta:  ${perfil.sede_id}`,
    'se habrían tocado precios de otra sede. No se escribió nada.')
}
console.log('  ✅ la sede del argumento es la de la cuenta')

// ════════════════════════════════════════════════════════════════════════════
// § 2 · ANTES — contar y cruzar, fila por fila
// ════════════════════════════════════════════════════════════════════════════
async function leerActivos() {
  const { data, error } = await db
    .from('products').select('id, name, price, is_active')
    .eq('sede_id', SEDE_ID).eq('is_active', true).order('name')
  if (error) abortar(`no se pudo leer products: ${error.message}`)
  return data ?? []
}

const antes = await leerActivos()
console.log('\nANTES — productos ACTIVOS de la sede: %d  (la tabla tiene %d)', antes.length, CAMBIOS.length)
if (antes.length !== CAMBIOS.length) {
  console.error('  en base y no en tabla:')
  for (const r of antes) if (!CAMBIOS.some((c) => c.clave === normalizar(r.name))) console.error('    · %s', r.name)
  abortar('el total de la sede no es el número de filas de la tabla.',
    'en este paso la tabla tiene que ser el catálogo ENTERO de la sede. Algo cambió y hay que mirarlo.')
}

const problemas = []
const plan = []   // { id, nombre, actual, nuevo, accion }
console.log('  %s %s %s %s %s', '#'.padStart(3), 'PRODUCTO'.padEnd(28), 'EN BASE'.padStart(9), 'TABLA:ACTUAL'.padStart(13), 'TABLA:NUEVO'.padStart(12))
CAMBIOS.forEach((c, i) => {
  const matches = antes.filter((r) => normalizar(r.name) === c.clave)
  let estado = ''
  if (matches.length === 0) { problemas.push(`FALTA en la base: «${c.nombre}»`); estado = '🔴 FALTA' }
  else if (matches.length > 1) { problemas.push(`«${c.nombre}» resuelve a ${matches.length} filas activas (el índice no lo permite: mirar)`); estado = '🔴 x' + matches.length }
  else {
    const r = matches[0]
    const actual = Number(r.price)
    if (actual === c.viejo) { plan.push({ id: r.id, nombre: r.name, actual, nuevo: c.nuevo, accion: 'actualizar' }); estado = '→ actualizar' }
    else if (actual === c.nuevo) { plan.push({ id: r.id, nombre: r.name, actual, nuevo: c.nuevo, accion: 'ya está' }); estado = '= ya está en el nuevo' }
    else { problemas.push(`«${c.nombre}»: en base ${actual}, la tabla dice actual ${c.viejo} (nuevo ${c.nuevo})`); estado = '🔴 NO COINCIDE' }
    console.log('  %s %s %s %s %s  %s', String(i + 1).padStart(3), c.nombre.padEnd(28),
      COP(actual).padStart(9), COP(c.viejo).padStart(13), COP(c.nuevo).padStart(12), estado)
    return
  }
  console.log('  %s %s %s %s %s  %s', String(i + 1).padStart(3), c.nombre.padEnd(28),
    '—'.padStart(9), COP(c.viejo).padStart(13), COP(c.nuevo).padStart(12), estado)
})
for (const r of antes) {
  if (!CAMBIOS.some((c) => c.clave === normalizar(r.name))) problemas.push(`en la base y NO en la tabla: «${r.name}»`)
}
if (problemas.length) {
  console.error('\n🔴 LA BASE NO DICE LO QUE LA TABLA AFIRMA — %d problema(s):', problemas.length)
  for (const p of problemas) console.error('   · %s', p)
  abortar('no se escribe sobre una premisa que no se cumple.', 'corregí la tabla o mirá la base. No se escribió nada.')
}
const aActualizar = plan.filter((p) => p.accion === 'actualizar')
const yaEstaban = plan.filter((p) => p.accion === 'ya está')
console.log('\n  cruce OK: %d a actualizar · %d ya están en el precio nuevo', aActualizar.length, yaEstaban.length)

if (!APLICAR) {
  console.log('\nSÓLO LECTURA: no se escribió nada. Para aplicar, volvé a correr con --aplicar.')
  salir(0)
}

// ════════════════════════════════════════════════════════════════════════════
// § 3 · ESCRIBIR — por UUID, uno por uno, por el camino de la pantalla (RLS)
// ════════════════════════════════════════════════════════════════════════════
console.log('\n── ACTUALIZANDO ─────────────────────────────────────────────')
let hechos = 0
for (const p of aActualizar) {
  const { data, error } = await db
    .from('products').update({ price: p.nuevo })
    .eq('id', p.id).eq('sede_id', SEDE_ID)
    .select('id, name, price')
  if (error) abortar(`no se pudo actualizar «${p.nombre}»: ${error.message}`,
    `los ${hechos} anteriores QUEDARON actualizados. Volvé a correr: el cruce los reconoce como «ya está».`)
  if (!data || data.length !== 1) abortar(`el update de «${p.nombre}» afectó ${data?.length ?? 0} filas, esperaba 1`,
    `los ${hechos} anteriores QUEDARON. Mirá la fila por id ${p.id} antes de seguir.`)
  console.log('  ~ %s · %s → %s', p.nombre.padEnd(28), COP(p.actual).padStart(9), COP(Number(data[0].price)).padStart(9))
  hechos++
}
console.log('\nESCRITO: %d precios actualizados, %d ya estaban', hechos, yaEstaban.length)

// ════════════════════════════════════════════════════════════════════════════
// § 4 · DESPUÉS — releer de la base y comparar contra el precio nuevo
// ════════════════════════════════════════════════════════════════════════════
console.log('\n── VERIFICACIÓN · leída de la base ─────────────────────────')
const despues = await leerActivos()
const problemasDespues = []
if (despues.length !== antes.length) problemasDespues.push(`el total de activos cambió: antes ${antes.length}, después ${despues.length}`)
console.log('  %s %s %s %s', '#'.padStart(3), 'PRODUCTO'.padEnd(28), 'EN BASE'.padStart(9), 'ESPERADO'.padStart(9))
CAMBIOS.forEach((c, i) => {
  const r = despues.find((x) => normalizar(x.name) === c.clave)
  const precio = r ? Number(r.price) : NaN
  const ok = precio === c.nuevo
  if (!ok) problemasDespues.push(`«${c.nombre}»: en base ${r ? precio : 'FALTA'}, esperaba ${c.nuevo}`)
  console.log('  %s %s %s %s %s', String(i + 1).padStart(3), c.nombre.padEnd(28),
    (r ? COP(precio) : 'FALTA').padStart(9), COP(c.nuevo).padStart(9), ok ? '✅' : '🔴')
})
console.log('\n  productos activos: antes %d · después %d', antes.length, despues.length)
console.log('  suma de precios en base ahora: %s', COP(despues.reduce((a, r) => a + Number(r.price), 0)))

if (problemasDespues.length) {
  console.error('\n🔴 LA BASE NO COINCIDE con la columna «nuevo» — %d problema(s):', problemasDespues.length)
  for (const p of problemasDespues) console.error('   · %s', p)
  salir(1)
}
console.log('\n✅ LOS %d PRECIOS COINCIDEN con la tabla, y el total de la sede sigue en %d.', CAMBIOS.length, despues.length)
salir(0)
