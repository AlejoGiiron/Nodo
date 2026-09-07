#!/usr/bin/env node
/**
 * CARGA DE `codigo` Y `unidad` SOBRE UN CATÁLOGO YA CARGADO — deuda 41.
 *
 * Uso:
 *   export ADMIN_PASSWORD='…'          # ⚠️ nunca en un archivo
 *   node scripts/cargar-codigos.mjs \
 *     --sede-id <uuid> --email <admin> --org-esperada "Muscle Pro" \
 *     --catalogo docs/muscle-pro-catalogo-v2.md [--aplicar]
 *
 *   Sin `--aplicar` NO ESCRIBE: lee, cruza y muestra qué cambiaría.
 *
 * ── DE DÓNDE SALE CADA COLUMNA — Y NO SALEN DEL MISMO LADO ─────────────────
 * ✅ `codigo`  — DATO DEL CLIENTE. Los 42 salen de la hoja `Productos` del
 *               Excel, columna «Item».
 *               ⚠️ **NO del `.md`, y esto se midió:** `muscle-pro-catalogo-v2.md`
 *               tiene código para los **25 nuevos** y NO para los 17 ya
 *               cargados — su tabla es «producto | cargado | pasa a», sin
 *               columna de código. El documento se usa igual, como CONTROL
 *               CRUZADO de esos 25 contra el Excel.
 * 🔴 `unidad`  — VALOR ASUMIDO POR NOSOTROS, no un dato de su archivo. Su Excel
 *               NO tiene unidad de venta en ninguna hoja. Se pone `unidad` en
 *               los 42 porque todo lo que vende son frascos, tarros y galletas.
 *               **Es el mismo trato que el plazo de 15 días antes de que él lo
 *               confirmara: se carga, se marca como asumido, y se pregunta.**
 *               ⛔ Pregunta pendiente: «puse todos por unidad — ¿alguno se vende
 *               por peso, por metro o por paquete?»
 *
 * ── LAS CUATRO DE R0 ───────────────────────────────────────────────────────
 * 1. CLASE — UPDATE por-id y fail-closed, sobre una allowlist explícita: las
 *    filas nombradas en el documento, resueltas por nombre normalizado.
 * 2. PRECEDENTE — `actualizar-precios.mjs`: por UUID, exigiendo que cada update
 *    afecte EXACTAMENTE 1 fila, y contando antes.
 * 3. MODO DE FALLO — un código en el producto equivocado NO revienta: el
 *    mostrador encuentra otra cosa al teclearlo, y nadie lo nota hasta que
 *    alguien busca. Falla callado ⇒ todo aborta cerrado.
 * 4. OBJETIVO — por UUID. El nombre sólo RESUELVE la fila, con la misma
 *    normalización del índice único; sede por argumento Y por la sesión.
 *
 * 🔴 Y PARA EL DUPLICADO REAL DEL ARCHIVO, la verificación va EN LAS DOS
 *    DIRECCIONES: que HALOTESTIN quede en `001-10`, y que NINGÚN otro producto
 *    tenga `001-7` salvo TRENBONOM. Sin la segunda mitad, «Halotestin quedó
 *    bien» no dice nada sobre si el duplicado sigue ahí.
 */

import { readFileSync, existsSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import ExcelJS from 'exceljs'

const args = new Map(); const banderas = new Set()
for (let i = 2; i < process.argv.length; i++) {
  const k = process.argv[i]; if (!k?.startsWith('--')) continue
  const v = process.argv[i + 1]
  if (v === undefined || v.startsWith('--')) banderas.add(k.slice(2))
  else { args.set(k.slice(2), v); i++ }
}
function deDotEnv(clave) {
  if (!existsSync('.env')) return undefined
  for (const l of readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
    if (m && m[1] === clave) return m[2].trim().replace(/^["']|["']$/g, '')
  }
}
const URL_BASE = process.env.SUPABASE_URL || deDotEnv('VITE_NODO_SUPABASE_URL')
const ANON = process.env.SUPABASE_ANON_KEY || deDotEnv('VITE_NODO_SUPABASE_ANON_KEY')
const PASSWORD = process.env.ADMIN_PASSWORD
const SEDE_ID = args.get('sede-id')
const EMAIL = args.get('email')
const ORG_ESPERADA = args.get('org-esperada')
const RUTA = args.get('catalogo') || 'docs/muscle-pro-catalogo-v2.md'
const ARCHIVO = args.get('archivo') || 'docs/Control Mp 2.xlsx'
const APLICAR = banderas.has('aplicar')
/** 🔴 ASUMIDO, no leído del archivo del cliente. Ver el encabezado. */
const UNIDAD_ASUMIDA = args.get('unidad') || 'unidad'

const salir = (c) => { console.log(`\ncodigos_exit=${c}`); process.exit(c) }
const abortar = (m, q) => { console.error(`\n🔴 PARA: ${m}`); if (q) console.error(`QUE HACER: ${q}`); salir(1) }
const faltan = []
if (!URL_BASE) faltan.push('SUPABASE_URL o VITE_NODO_SUPABASE_URL en .env')
if (!ANON) faltan.push('SUPABASE_ANON_KEY o VITE_NODO_SUPABASE_ANON_KEY en .env')
if (!PASSWORD) faltan.push('ADMIN_PASSWORD (variable de entorno)')
if (!SEDE_ID) faltan.push('--sede-id')
if (!EMAIL) faltan.push('--email')
if (!ORG_ESPERADA) faltan.push('--org-esperada (nombre EXACTO de la organización; es un guard)')
if (faltan.length) { console.error('Faltan datos:\n  ' + faltan.join('\n  ')); process.exit(2) }

// ════════════════════════════════════════════════════════════════════════════
// § 0 · Los códigos — DEL EXCEL, con el .md como CONTROL CRUZADO
//
// 🔴 EL DOCUMENTO NO ALCANZA, Y ESTO SE MIDIÓ: `muscle-pro-catalogo-v2.md`
//    tiene código para los **25 nuevos** y NO para los 17 ya cargados —su tabla
//    es «producto | cargado | pasa a», sin columna de código—. La fuente de los
//    42 es la hoja `Productos` del Excel, columna «Item».
//
// ✅ Y el .md se usa igual, como CONTROL CRUZADO: los 25 que sí tiene deben
//    coincidir con el Excel. Dos fuentes contando lo mismo por caminos
//    distintos; si no coinciden, aborta en vez de elegir una.
// ════════════════════════════════════════════════════════════════════════════
/** La MISMA normalización del índice único, para nombre y para código. */
const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
const L = (s, n) => String(s ?? '').padEnd(n)
const crudo = (cell) => {
  let v = cell.value
  if (v && typeof v === 'object') {
    if ('formula' in v || 'sharedFormula' in v) v = v.result
    else if ('richText' in v) v = v.richText.map((x) => x.text).join('')
  }
  return v
}
const vacio = (v) => v === null || v === undefined || String(v).trim() === ''

if (!existsSync(ARCHIVO)) abortar(`no existe ${ARCHIVO}`, 'es el Excel del cliente, fuera de git.')
const wb = new ExcelJS.Workbook()
await wb.xlsx.readFile(ARCHIVO)
const wsP = wb.worksheets.find((w) => w.name === 'Productos')
if (!wsP) abortar(`el Excel no tiene la hoja «Productos»`)
const colP = new Map()
for (let i = 1; i <= wsP.columnCount; i++) {
  const v = crudo(wsP.getRow(1).getCell(i))
  if (!vacio(v)) colP.set(norm(v), i)
}
for (const c of ['producto', 'item']) if (!colP.has(c)) abortar(`la hoja «Productos» no tiene la columna «${c}»`)

const CODIGOS = []
for (let r = 2; r <= wsP.rowCount; r++) {
  const nombre = crudo(wsP.getRow(r).getCell(colP.get('producto')))
  const item = crudo(wsP.getRow(r).getCell(colP.get('item')))
  if (vacio(nombre) || vacio(item)) continue
  CODIGOS.push({ nombre: String(nombre).trim(), codigo: String(item).trim() })
}
console.log('CÓDIGOS LEÍDOS del Excel, hoja «Productos», columna «Item»')
console.log('  filas con producto y código: %d', CODIGOS.length)

// ── CONTROL CRUZADO contra el .md, para los 25 que sí tiene ────────────────
function filasDe(md, encabezado) {
  const i = md.indexOf(encabezado)
  if (i < 0) abortar(`el documento no tiene la sección «${encabezado}»`)
  const resto = md.slice(i + encabezado.length)
  const fin = resto.search(/\n## /)
  const filas = []
  for (const linea of (fin < 0 ? resto : resto.slice(0, fin)).split(/\r?\n/)) {
    const t = linea.trim()
    if (!t.startsWith('|')) continue
    const c = t.split('|').slice(1, -1).map((x) => x.trim())
    if (c.every((x) => /^:?-{2,}:?$/.test(x))) continue
    filas.push(c)
  }
  return filas
}
/** El documento escribe «⚠️ 001-7» para marcar el duplicado: se limpia el adorno. */
const soloCodigo = (s) => String(s ?? '').replace(/[^0-9A-Za-z.\-_/]/g, '').trim()

const md = existsSync(RUTA) ? readFileSync(RUTA, 'utf8') : abortar(`no existe ${RUTA}`)
const f25 = filasDe(md, '## Los 25 por cargar')
if (f25[0].length !== 6) abortar(`«Los 25 por cargar» tiene ${f25[0].length} columnas, esperaba 6`)
let cruzados = 0
for (const [, producto, codigo] of f25.slice(1)) {
  const doc = soloCodigo(codigo)
  const enExcel = CODIGOS.find((c) => norm(c.nombre) === norm(producto))
  if (!enExcel) abortar(`«${producto}» está en el documento y NO en la hoja «Productos» del Excel`)
  if (norm(enExcel.codigo) !== norm(doc)) {
    abortar(`«${producto}»: el Excel dice «${enExcel.codigo}» y el documento «${doc}»`,
      'dos fuentes que no coinciden. No se elige una: se mira cuál está mal.')
  }
  cruzados++
}
console.log('  ✅ control cruzado: los %d del documento coinciden con el Excel', cruzados)

// ⚠️ HALOTESTIN: el archivo del cliente lo trae con 001-7, que ya es de
//    TRENBONOM. La serie 001 llega a 9 sin huecos, así que le corresponde
//    001-10 — verificado contra su maestro el 2026-09-06.
const CORRECCIONES = new Map([['halotestin', '001-10']])
for (const c of CODIGOS) {
  const fix = CORRECCIONES.get(norm(c.nombre))
  if (fix && c.codigo !== fix) {
    console.log('  ⚠️ CORRECCIÓN: «%s» viene con %s en el Excel → se carga %s', c.nombre, c.codigo, fix)
    c.codigo = fix
    c.corregido = true
  }
}

if (new Set(CODIGOS.map((c) => norm(c.codigo))).size !== CODIGOS.length) {
  const vistos = new Map()
  for (const c of CODIGOS) {
    const k = norm(c.codigo)
    if (vistos.has(k)) console.error('    🔴 %s está en «%s» y en «%s»', c.codigo, vistos.get(k), c.nombre)
    vistos.set(k, c.nombre)
  }
  abortar('quedan códigos repetidos después de las correcciones',
    'el índice único los rechazaría igual. Resolvelo antes de cargar.')
}
console.log('  TOTAL: %d códigos, todos distintos', CODIGOS.length)
console.log('  unidad a cargar: «%s»  🔴 VALOR ASUMIDO, no está en el archivo del cliente', UNIDAD_ASUMIDA)
console.log('  modo: %s', APLICAR ? '🔴 --aplicar: ESCRIBE' : 'sólo lectura')

// ════════════════════════════════════════════════════════════════════════════
// § 1 · Sesión y guards
// ════════════════════════════════════════════════════════════════════════════
const db = createClient(URL_BASE, ANON, { auth: { persistSession: false } })
const { data: ses, error: eL } = await db.auth.signInWithPassword({ email: EMAIL, password: PASSWORD })
if (eL) abortar(`no se pudo entrar como ${EMAIL}: ${eL.message}`, 'no se escribió nada.')
const { data: perfil } = await db.from('profiles').select('id, full_name, sede_id, organization_id').eq('id', ses.user.id).single()
const { data: org } = await db.from('organizations').select('name').eq('id', perfil.organization_id).single()
const { data: sede } = await db.from('sedes').select('name').eq('id', perfil.sede_id).single()
console.log('\nSESIÓN: %s · org «%s» · sede «%s»', perfil.full_name, org?.name, sede?.name)
if (perfil.sede_id !== SEDE_ID) abortar(`--sede-id no es la sede de la cuenta (${perfil.sede_id})`)
if (org?.name !== ORG_ESPERADA) abortar(`la organización es «${org?.name}» y --org-esperada dice «${ORG_ESPERADA}»`)
console.log('  ✅ sede y organización coinciden con lo declarado')

// ════════════════════════════════════════════════════════════════════════════
// § 2 · LECTURA PREVIA — los 42 tienen que estar, y las columnas VACÍAS
// ════════════════════════════════════════════════════════════════════════════
const { data: enBase, error: eP } = await db.from('products')
  .select('id, name, codigo, unidad, is_active').eq('sede_id', SEDE_ID).eq('is_active', true)
if (eP) abortar(`no se pudo leer products: ${eP.message}`)

console.log('\nANTES DE ESCRIBIR — productos ACTIVOS de la sede: %d  (el documento nombra %d)',
  (enBase ?? []).length, CODIGOS.length)

const problemas = []
const plan = []
for (const c of CODIGOS) {
  const matches = (enBase ?? []).filter((r) => norm(r.name) === norm(c.nombre))
  if (matches.length === 0) { problemas.push(`FALTA en la base: «${c.nombre}»`); continue }
  if (matches.length > 1) { problemas.push(`«${c.nombre}» resuelve a ${matches.length} filas activas`); continue }
  plan.push({ id: matches[0].id, nombre: matches[0].name, codigo: c.codigo, corregido: !!c.corregido, fila: matches[0] })
}
for (const r of enBase ?? []) {
  if (!CODIGOS.some((c) => norm(c.nombre) === norm(r.name))) problemas.push(`en la base y NO en el documento: «${r.name}»`)
}

// 🔴 Si alguna columna YA tiene valor, se PARA. Significa que alguien cargó por
//    otro camino, y pisarlo destruiría un dato que no sabemos de dónde salió.
const conCodigo = (enBase ?? []).filter((r) => r.codigo !== null)
const conUnidad = (enBase ?? []).filter((r) => r.unidad !== null)
if (conCodigo.length || conUnidad.length) {
  for (const r of conCodigo) console.error('    ya tiene codigo: «%s» = %s', r.name, r.codigo)
  for (const r of conUnidad) console.error('    ya tiene unidad: «%s» = %s', r.name, r.unidad)
  abortar(`${conCodigo.length} producto(s) ya tienen código y ${conUnidad.length} ya tienen unidad`,
    'alguien cargó por otro camino. MIRALO antes de pisar: este script es para columnas vacías.')
}
console.log('  ✅ las dos columnas están vacías en los %d', (enBase ?? []).length)

if (problemas.length) {
  console.error('\n🔴 LA BASE NO COINCIDE CON EL DOCUMENTO — %d problema(s):', problemas.length)
  for (const p of problemas) console.error('   · %s', p)
  abortar('no se escribe sobre una premisa que no se cumple.')
}
console.log('  ✅ los %d nombres resuelven a exactamente una fila', plan.length)

console.log('\n  %s %s %s', L('#', 4), L('PRODUCTO', 42), 'CÓDIGO')
plan.slice().sort((a, b) => a.codigo.localeCompare(b.codigo, 'es', { numeric: true }))
  .forEach((p, i) => console.log('  %s %s %s %s', L(i + 1, 4), L(p.nombre, 42), L(p.codigo, 8), p.corregido ? '⚠️ corregido' : ''))

if (!APLICAR) { console.log('\nSÓLO LECTURA: no se escribió nada. Para aplicar, --aplicar.'); salir(0) }

// ════════════════════════════════════════════════════════════════════════════
// § 3 · ESCRITURA — por UUID, exigiendo 1 fila
// ════════════════════════════════════════════════════════════════════════════
console.log('\n── ESCRIBIENDO ─────────────────────────────────────────────')
let n = 0
for (const p of plan) {
  const { data, error } = await db.from('products')
    .update({ codigo: p.codigo, unidad: UNIDAD_ASUMIDA })
    .eq('id', p.id).eq('sede_id', SEDE_ID).select('id, codigo, unidad')
  if (error) abortar(`no se pudo escribir «${p.nombre}»: ${error.message}`,
    `van ${n} escritos. Si es un 23505, hay un código repetido: el índice hizo su trabajo.`)
  if (!data || data.length !== 1) abortar(`el update de «${p.nombre}» afectó ${data?.length ?? 0} filas, esperaba 1`)
  n++
}
console.log('  %d productos con código y unidad', n)

// ════════════════════════════════════════════════════════════════════════════
// § 4 · VERIFICACIÓN — leída de la base, y el duplicado EN LAS DOS DIRECCIONES
// ════════════════════════════════════════════════════════════════════════════
console.log('\n── VERIFICACIÓN · leída de la base ─────────────────────────')
const { data: fin } = await db.from('products')
  .select('name, codigo, unidad').eq('sede_id', SEDE_ID).eq('is_active', true)
const malos = []
for (const p of plan) {
  const r = (fin ?? []).find((x) => norm(x.name) === norm(p.nombre))
  if (!r) { malos.push(`FALTA «${p.nombre}»`); continue }
  if (r.codigo !== p.codigo) malos.push(`«${p.nombre}»: código en base «${r.codigo}», esperaba «${p.codigo}»`)
  if (r.unidad !== UNIDAD_ASUMIDA) malos.push(`«${p.nombre}»: unidad en base «${r.unidad}», esperaba «${UNIDAD_ASUMIDA}»`)
}
const sinCodigo = (fin ?? []).filter((r) => r.codigo === null).length
const sinUnidad = (fin ?? []).filter((r) => r.unidad === null).length
console.log('  productos activos:        %d', (fin ?? []).length)
console.log('  sin código:               %d  %s', sinCodigo, sinCodigo === 0 ? '✅' : '🔴')
console.log('  sin unidad:               %d  %s', sinUnidad, sinUnidad === 0 ? '✅' : '🔴')
if (sinCodigo) malos.push(`${sinCodigo} productos quedaron sin código`)
if (sinUnidad) malos.push(`${sinUnidad} productos quedaron sin unidad`)

// 🔴 EL DUPLICADO, EN LAS DOS DIRECCIONES.
console.log('\n  🔴 el duplicado 001-7 del archivo, verificado en las DOS direcciones:')
const halo = (fin ?? []).find((r) => norm(r.name) === 'halotestin')
const okHalo = halo?.codigo === '001-10'
console.log('    ① HALOTESTIN quedó en «%s»  esperaba «001-10»  %s', halo?.codigo ?? '(falta)', okHalo ? '✅' : '🔴')
if (!okHalo) malos.push(`HALOTESTIN quedó con «${halo?.codigo}», esperaba 001-10`)

const con0017 = (fin ?? []).filter((r) => norm(r.codigo) === '001-7').map((r) => r.name)
const okOtros = con0017.length === 1 && norm(con0017[0]).startsWith('trenbonom')
console.log('    ② con 001-7 hay %d: %s  %s', con0017.length, con0017.join(', ') || '(ninguno)',
  okOtros ? '✅ sólo TRENBONOM' : '🔴')
if (!okOtros) malos.push(`001-7 lo tienen: ${con0017.join(', ') || 'nadie'} — debería tenerlo sólo TRENBONOM`)

// El conteo de códigos distintos cierra con el de productos: ningún duplicado.
const distintos = new Set((fin ?? []).map((r) => norm(r.codigo))).size
console.log('\n  códigos distintos: %d de %d productos  %s', distintos, (fin ?? []).length,
  distintos === (fin ?? []).length ? '✅ ninguno repetido' : '🔴 hay repetidos')
if (distintos !== (fin ?? []).length) malos.push('hay códigos repetidos en la base')

if (malos.length) {
  console.error('\n🔴 NO CIERRA — %d problema(s):', malos.length)
  for (const m of malos) console.error('   · %s', m)
  salir(1)
}
console.log('\n✅ LOS %d PRODUCTOS TIENEN CÓDIGO Y UNIDAD, y el duplicado del archivo quedó resuelto.', plan.length)
console.log('⛔ RECORDATORIO: la unidad es un VALOR ASUMIDO. Preguntarle al cliente:')
console.log('   «puse todos por unidad — ¿alguno se vende por peso, por metro o por paquete?»')
salir(0)
