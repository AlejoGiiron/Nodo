#!/usr/bin/env node
/**
 * CARGA INICIAL DEL CATÁLOGO DE UNA SEDE.
 *
 * Uso:
 *   export SUPABASE_URL=https://<ref>.supabase.co        # o se lee de .env
 *   export SUPABASE_ANON_KEY=<la anon key>               # o se lee de .env
 *   export ADMIN_PASSWORD='<la contraseña del admin>'    # ⚠️ nunca en un archivo
 *   node scripts/cargar-catalogo.mjs \
 *     --sede-id <uuid de la sede> \
 *     --email <correo del admin de esa sede> \
 *     --catalogo docs/muscle-pro-catalogo.md
 *
 * 🔴 NADA DE MUSCLE PRO ESTÁ HARDCODEADO. Los datos salen del `.md` (§4 y §5) y
 *    la sede es un argumento. Mismo criterio que `onboard-organizacion.mjs`:
 *    esta herramienta se corre una vez por cliente, y el vocabulario de un
 *    tenant no entra al producto (deuda 45).
 *
 * ── POR QUÉ ENTRA POR EL CAMINO DE LA PANTALLA Y NO POR UN INSERT ──────────
 *    `upsertCategory` / `upsertProduct` (src/lib/supabase-helpers.ts) no se
 *    pueden importar acá: dependen de `src/lib/supabase.ts`, que lee
 *    `import.meta.env` y sólo lo resuelve Vite. Así que se replica su
 *    comportamiento EXACTO — ver §7 del catálogo para la enumeración completa.
 *
 *    Las dos funciones son una línea cada una; la garantía no está en su cuerpo
 *    sino en QUIÉN las ejecuta: anon key + el JWT del usuario, así que RLS
 *    aplica. Por eso este script INICIA SESIÓN como el admin de la sede en vez
 *    de usar la service_role key: con service_role la policy
 *    `sede_id = get_my_sede_id() and has_permission('productos.editar')`
 *    ni se evalúa, y eso es exactamente lo que el camino garantiza.
 *
 * ── LOS TRES GUARDS, TODOS FAIL-CLOSED ────────────────────────────────────
 *    1. La sede del argumento tiene que ser la del admin logueado. Si no,
 *       aborta ANTES de escribir — y si el guard fallara, PostgREST rechaza
 *       igual por RLS. Dos redes, no una.
 *    2. La sede tiene que tener CERO categorías y CERO productos. Si no da
 *       cero, para. (`--reanudar` la relaja, ver abajo.)
 *    3. Idempotencia por NOMBRE: no hay `unique (sede_id, name)` en ninguna de
 *       las dos tablas, así que un `upsert` sin `id` es un insert puro y
 *       correrlo dos veces DUPLICARÍA. Se lee primero; lo que ya existe se
 *       informa y NO se toca.
 *
 *    ⚠️ `--reanudar` no es una puerta trasera: cambia el guard 2 por uno más
 *       estricto que un conteo — cada categoría y cada producto que ya esté
 *       tiene que estar declarado en el `.md`. Si aparece UNO solo que no está,
 *       aborta. Sirve para completar una corrida que murió a la mitad, no para
 *       escribir sobre un catálogo ajeno.
 */

import { readFileSync, existsSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
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

/** Lee una clave del `.env` del repo. La anon key es pública por diseño; la
 *  contraseña del admin NO se lee de ningún archivo, sólo del entorno. */
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
const RUTA = args.get('catalogo') || 'docs/muscle-pro-catalogo.md'
const REANUDAR = banderas.has('reanudar')

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

const salir = (codigo) => { console.log(`\ncarga_exit=${codigo}`); process.exit(codigo) }
const abortar = (motivo, queHacer) => {
  console.error(`\n🔴 PARA: ${motivo}`)
  if (queHacer) console.error(`QUE HACER: ${queHacer}`)
  salir(1)
}

// ════════════════════════════════════════════════════════════════════════════
// § 0 · Parsear el catálogo del .md
//
// Estricto a propósito: una tabla con una columna de más o de menos aborta en
// vez de adivinar. Un parser permisivo sobre el catálogo de un cliente es un
// instrumento que puede mentir en silencio.
// ════════════════════════════════════════════════════════════════════════════
function tablaDe(md, encabezado) {
  const i = md.indexOf(encabezado)
  if (i < 0) abortar(`el catálogo no tiene la sección «${encabezado}»`,
    `revisá ${RUTA}: las secciones §4 y §5 son la entrada de este script`)
  const resto = md.slice(i + encabezado.length)
  const fin = resto.search(/\n## /)
  const bloque = fin < 0 ? resto : resto.slice(0, fin)

  const filas = []
  for (const linea of bloque.split(/\r?\n/)) {
    const t = linea.trim()
    if (!t.startsWith('|')) continue
    const celdas = t.split('|').slice(1, -1).map((c) => c.trim())
    if (celdas.every((c) => /^:?-{2,}:?$/.test(c))) continue   // separador
    filas.push(celdas)
  }
  if (filas.length < 2) abortar(`la tabla de «${encabezado}» no tiene filas`)
  return { encabezados: filas[0], filas: filas.slice(1) }
}

/** «150.000» → 150000, con round-trip: si al re-formatear no vuelve idéntico,
 *  el número no es el que dice el documento. Control cruzado, no confianza. */
function precioCOP(texto, contexto) {
  const limpio = texto.replace(/\./g, '')
  if (!/^\d+$/.test(limpio)) abortar(`precio ilegible en ${contexto}: «${texto}»`)
  const n = Number(limpio)
  const vuelta = new Intl.NumberFormat('es-CO').format(n)
  if (vuelta !== texto) {
    abortar(`el precio de ${contexto} no vuelve idéntico: «${texto}» → ${n} → «${vuelta}»`,
      'el documento usa punto como separador de miles y no lleva decimales')
  }
  return n
}

const md = existsSync(RUTA) ? readFileSync(RUTA, 'utf8') : abortar(`no existe ${RUTA}`)

const tCat = tablaDe(md, '## 4 ·')
if (tCat.encabezados.length !== 3) abortar(`§4 tiene ${tCat.encabezados.length} columnas, esperaba 3 (nombre · color · orden)`)
const CATEGORIAS = tCat.filas.map(([nombre, color, orden]) => {
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) abortar(`color ilegible en §4 para «${nombre}»: «${color}»`)
  if (!/^\d+$/.test(orden)) abortar(`orden ilegible en §4 para «${nombre}»: «${orden}»`)
  return { nombre, color, orden: Number(orden) }
})

const tProd = tablaDe(md, '## 5 ·')
if (tProd.encabezados.length !== 3) abortar(`§5 tiene ${tProd.encabezados.length} columnas, esperaba 3 (producto · categoría · precio)`)
const PRODUCTOS = tProd.filas.map(([nombre, categoria, precio]) => ({
  nombre, categoria, precio: precioCOP(precio, `«${nombre}»`),
}))

// Cruce: toda categoría citada por un producto tiene que estar en §4.
const nombresCat = new Set(CATEGORIAS.map((c) => c.nombre))
for (const p of PRODUCTOS) {
  if (!nombresCat.has(p.categoria)) {
    abortar(`«${p.nombre}» dice ser de «${p.categoria}», que no está en §4`,
      'o falta la categoría en §4, o el nombre está escrito distinto en las dos tablas')
  }
}
if (new Set(PRODUCTOS.map((p) => p.nombre)).size !== PRODUCTOS.length) {
  abortar('§5 tiene nombres de producto repetidos')
}

console.log('CATÁLOGO LEÍDO de %s', RUTA)
console.log('  categorías: %d   productos: %d', CATEGORIAS.length, PRODUCTOS.length)
console.log('  suma de precios (control cruzado): %s',
  new Intl.NumberFormat('es-CO').format(PRODUCTOS.reduce((a, p) => a + p.precio, 0)))

// ════════════════════════════════════════════════════════════════════════════
// § 1 · Sesión — como el admin de la sede, NO con service_role
// ════════════════════════════════════════════════════════════════════════════
const db = createClient(URL_BASE, ANON, { auth: { persistSession: false } })

const { data: sesion, error: errLogin } =
  await db.auth.signInWithPassword({ email: EMAIL, password: PASSWORD })
if (errLogin) abortar(`no se pudo entrar como ${EMAIL}: ${errLogin.message}`,
  'revisá ADMIN_PASSWORD y --email. No se escribió nada.')

const { data: perfil, error: errPerfil } = await db
  .from('profiles')
  .select('full_name, role, sede_id, organization_id')
  .eq('id', sesion.user.id)
  .single()
if (errPerfil || !perfil) abortar(`la cuenta entró pero no tiene perfil: ${errPerfil?.message}`)

const { data: sede } = await db
  .from('sedes').select('name, organizations(name)').eq('id', perfil.sede_id).single()

console.log('\nSESIÓN: %s (%s)', perfil.full_name, perfil.role)
console.log('  organización: %s', sede?.organizations?.name ?? '(no visible)')
console.log('  sede:         %s   %s', sede?.name ?? '(no visible)', perfil.sede_id)

// ── GUARD 1 ─────────────────────────────────────────────────────────────────
if (perfil.sede_id !== SEDE_ID) {
  abortar(
    `--sede-id NO es la sede de esta cuenta.\n` +
    `         argumento: ${SEDE_ID}\n` +
    `         la cuenta:  ${perfil.sede_id}`,
    'el catálogo se habría escrito en otra sede. No se escribió nada.',
  )
}
console.log('  ✅ la sede del argumento es la de la cuenta')

// ════════════════════════════════════════════════════════════════════════════
// § 2 · GUARD 2 — el conteo previo. Tiene que dar CERO de las dos.
// ════════════════════════════════════════════════════════════════════════════
const catExistentes = (await db.from('categories').select('id, name').eq('sede_id', SEDE_ID)).data ?? []
const prodExistentes = (await db.from('products').select('id, name').eq('sede_id', SEDE_ID)).data ?? []

console.log('\nANTES DE ESCRIBIR — conteo de la sede:')
console.log('  categorías: %d', catExistentes.length)
console.log('  productos:  %d', prodExistentes.length)

if (catExistentes.length !== 0 || prodExistentes.length !== 0) {
  if (!REANUDAR) {
    console.error('\n  lo que ya hay:')
    for (const c of catExistentes) console.error('    categoría · %s', c.name)
    for (const p of prodExistentes) console.error('    producto  · %s', p.name)
    abortar(
      'la sede NO está vacía y no se pasó --reanudar.',
      'mirá la lista de arriba. Si es una corrida anterior que murió a la mitad, ' +
      'volvé a correr con --reanudar: completa lo que falte y aborta si encuentra ' +
      'algo que no esté declarado en el catálogo.',
    )
  }
  // Con --reanudar el guard es MÁS estricto que un conteo: nada ajeno.
  const ajenasCat = catExistentes.filter((c) => !nombresCat.has(c.name))
  const nombresProd = new Set(PRODUCTOS.map((p) => p.nombre))
  const ajenosProd = prodExistentes.filter((p) => !nombresProd.has(p.name))
  if (ajenasCat.length || ajenosProd.length) {
    console.error('\n  no está declarado en %s:', RUTA)
    for (const c of ajenasCat) console.error('    categoría · %s', c.name)
    for (const p of ajenosProd) console.error('    producto  · %s', p.name)
    abortar('la sede tiene catálogo que este documento no declara.',
      'esta sede no está vacía por una corrida a medias: ya tiene datos propios. No se escribió nada.')
  }
  console.log('  ⚠️ --reanudar: lo que hay está todo declarado en el catálogo. Se completa lo que falte.')
}

// ════════════════════════════════════════════════════════════════════════════
// Lectura por nombre — y NO usa `maybeSingle()`
//
// 🔴 El índice `*_nombre_unico_por_sede` es PARCIAL (`where is_active`), así que
//    pueden convivir dos filas con el mismo nombre: una activa y una archivada.
//    Con `maybeSingle()` eso revienta con un error de PostgREST que no explica
//    nada. Se lee la lista entera y se decide explícitamente:
//
//      hay una ACTIVA        → ya existe, no se toca (idempotencia)
//      sólo hay ARCHIVADAS   → 🔴 PARA y la nombra. Crear el gemelo dejaría dos
//                              filas con el mismo nombre, y quién decide entre
//                              reactivar o renombrar es el operador, no esto.
//      no hay ninguna        → se crea
//
// ⚠️ Esta búsqueda es por nombre EXACTO; el índice normaliza (mayúsculas y
//    espacios). O sea que el índice puede rechazar algo que esta lectura no vio
//    —«mastenom e x ampollas» contra «MASTENOM E X AMPOLLAS»—. Es el orden
//    correcto: la base es la última palabra y falla cerrado.
// ════════════════════════════════════════════════════════════════════════════
async function buscarPorNombre(tabla, nombre, cols) {
  const { data, error } = await db
    .from(tabla).select(cols).eq('sede_id', SEDE_ID).eq('name', nombre)
  if (error) abortar(`no se pudo leer ${tabla} por nombre «${nombre}»: ${error.message}`)
  return {
    activa: (data ?? []).find((r) => r.is_active),
    archivadas: (data ?? []).filter((r) => !r.is_active),
  }
}

const pararPorArchivado = (tabla, nombre, archivadas) => abortar(
  `hay ${archivadas.length} ${tabla} ARCHIVADA(S) con el nombre «${nombre}», y ninguna activa.`,
  'crear una nueva dejaría dos filas con el mismo nombre. Decidí vos: reactivá la ' +
  'archivada desde la pantalla, o cambiale el nombre a una de las dos. Después ' +
  'volvé a correr con --reanudar. No se escribió nada de este ítem.',
)

// ════════════════════════════════════════════════════════════════════════════
// § 3 · CATEGORÍAS PRIMERO — el producto necesita su category_id
// ════════════════════════════════════════════════════════════════════════════
console.log('\n── CATEGORÍAS ──────────────────────────────────────────────')
const idPorCategoria = new Map()
let creadasCat = 0, saltadasCat = 0

for (const c of CATEGORIAS) {
  const { activa, archivadas } = await buscarPorNombre('categories', c.nombre, 'id, is_active')
  if (activa) {
    console.log('  = YA EXISTE, no se toca · %s', c.nombre)
    idPorCategoria.set(c.nombre, activa.id)
    saltadasCat++
    continue
  }
  if (archivadas.length) pararPorArchivado('categoría', c.nombre, archivadas)
  // El payload de CategoryModal.tsx, campo por campo.
  const { data, error } = await db.from('categories').upsert({
    name: c.nombre,
    description: null,
    color: c.color,
    is_active: true,
    sede_id: SEDE_ID,
    sort_order: c.orden,
  }).select().single()
  if (error) abortar(`no se pudo crear la categoría «${c.nombre}»: ${error.message}`,
    'las categorías creadas antes de ésta QUEDARON. Volvé a correr con --reanudar.')
  console.log('  + creada · %s', c.nombre)
  idPorCategoria.set(c.nombre, data.id)
  creadasCat++
}

// ════════════════════════════════════════════════════════════════════════════
// § 4 · PRODUCTOS
// ════════════════════════════════════════════════════════════════════════════
console.log('\n── PRODUCTOS ───────────────────────────────────────────────')
let creadosProd = 0, saltadosProd = 0

for (const p of PRODUCTOS) {
  const categoryId = idPorCategoria.get(p.categoria)
  if (!categoryId) abortar(`no hay category_id para «${p.categoria}» (producto «${p.nombre}»)`)

  const { activa, archivadas } = await buscarPorNombre('products', p.nombre, 'id, price, is_active')
  if (activa) {
    console.log('  = YA EXISTE, no se toca · %s (en base: %s)',
      p.nombre, new Intl.NumberFormat('es-CO').format(Number(activa.price)))
    saltadosProd++
    continue
  }
  if (archivadas.length) pararPorArchivado('producto', p.nombre, archivadas)
  // El payload de ProductModal.tsx, campo por campo. Sin cost_price: el
  // formulario no lo tiene, y `cost_price` lo escribe `register_purchase` por
  // promedio ponderado móvil (§8.1). Escribirlo acá sería sembrar la respuesta.
  const { error } = await db.from('products').upsert({
    id: randomUUID(),
    name: p.nombre,
    description: null,
    price: p.precio,
    category_id: categoryId,
    sede_id: SEDE_ID,
    image_url: null,
    is_active: true,
    kind: 'simple',
    stock_tracking: true,
    min_stock: 0,
    stock_qty: 0,
  }).select().single()
  if (error) abortar(`no se pudo crear «${p.nombre}»: ${error.message}`,
    'los productos creados antes de éste QUEDARON. Volvé a correr con --reanudar.')
  console.log('  + creado · %s', p.nombre)
  creadosProd++
}

console.log('\nESCRITO: %d categorías creadas, %d ya estaban · %d productos creados, %d ya estaban',
  creadasCat, saltadasCat, creadosProd, saltadosProd)

// ════════════════════════════════════════════════════════════════════════════
// § 5 · VERIFICACIÓN — leyendo DE LA BASE, no del output de arriba
//
// El criterio de éxito es esta comparación, no que el script no haya dado
// error. Se relee por el mismo camino que `getProducts` y se compara contra §5
// del documento, fila por fila.
// ════════════════════════════════════════════════════════════════════════════
console.log('\n── VERIFICACIÓN · leída de la base ─────────────────────────')
const { data: enBase, error: errLectura } = await db
  .from('products')
  .select('name, price, categories(name)')
  .eq('sede_id', SEDE_ID)
  .eq('is_active', true)
  .order('name')
if (errLectura) abortar(`no se pudo releer el catálogo: ${errLectura.message}`)

const porNombre = new Map(enBase.map((r) => [r.name, r]))
const esperados = [...PRODUCTOS].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
const problemas = []

console.log('  %s %s %s %s', '#'.padStart(3), 'PRODUCTO'.padEnd(28), 'CATEGORÍA'.padEnd(15), 'PRECIO')
esperados.forEach((esp, i) => {
  const fila = porNombre.get(esp.nombre)
  if (!fila) {
    problemas.push(`FALTA en la base: «${esp.nombre}»`)
    console.log('  %s %s %s', String(i + 1).padStart(3), esp.nombre.padEnd(28), '🔴 FALTA')
    return
  }
  const cat = fila.categories?.name ?? '(sin categoría)'
  const precio = Number(fila.price)
  const okCat = cat === esp.categoria
  const okPrecio = precio === esp.precio
  if (!okCat) problemas.push(`«${esp.nombre}»: categoría en base «${cat}», esperaba «${esp.categoria}»`)
  if (!okPrecio) problemas.push(`«${esp.nombre}»: precio en base ${precio}, esperaba ${esp.precio}`)
  console.log('  %s %s %s %s %s',
    String(i + 1).padStart(3),
    esp.nombre.padEnd(28),
    cat.padEnd(15),
    new Intl.NumberFormat('es-CO').format(precio).padStart(9),
    okCat && okPrecio ? '✅' : '🔴')
})

// Lo que está en la base y NO en el documento: también es un problema.
for (const fila of enBase) {
  if (!PRODUCTOS.some((p) => p.nombre === fila.name)) {
    problemas.push(`en la base y NO en el documento: «${fila.name}»`)
  }
}

const { data: catEnBase } = await db
  .from('categories').select('name').eq('sede_id', SEDE_ID).eq('is_active', true).order('name')
console.log('\n  categorías en base (%d): %s',
  catEnBase?.length ?? 0, (catEnBase ?? []).map((c) => c.name).join(' · '))
for (const c of CATEGORIAS) {
  if (!(catEnBase ?? []).some((x) => x.name === c.nombre)) problemas.push(`FALTA la categoría «${c.nombre}»`)
}

console.log('\n  productos en documento: %d   ·   en base: %d', PRODUCTOS.length, enBase.length)

if (problemas.length) {
  console.error('\n🔴 LA BASE NO COINCIDE CON %s — %d problema(s):', RUTA, problemas.length)
  for (const p of problemas) console.error('   · %s', p)
  salir(1)
}

console.log('\n✅ LA BASE COINCIDE CON %s: %d categorías y %d productos, con su categoría y su precio.',
  RUTA, CATEGORIAS.length, PRODUCTOS.length)
salir(0)
