// ============================================================================
// CARGA DEL CATALOGO v3 DE MUSCLE PRO — a una sede NUEVA y vacia.
//
// 🔴 POR QUE UNA SEDE NUEVA Y NO UNA RECONCILIACION: lo cargado hasta ahora sale
//    de `Control Mp 2.xlsx`, que la clienta ya supero — codigos viejos, una
//    categoria movida, y tres ventas con cantidades corregidas. Y v3 **modifica
//    el rango ya cargado**: agrega 8 lineas de compra y 11 de venta dentro de
//    dias que ya estan en la base, y cambia 3 cantidades (una de 3 a 15).
//    Rehacer es barato porque **la clienta no opero ni un dia en Nodo**: todo lo
//    que hay es transcripcion nuestra. Esa ventana se cierra el dia que venda.
//
// ⚠️ LA FUENTE DE LOS CINCO NIVELES ES `Compra de inventario`, NO `LISTA DE
//    PRECIOS`. Medido: en `Compra de inventario` los factores contra el costo
//    dan UN SOLO VALOR en las 79 filas (L0 x1,10 · L1 x1,15 · L2 x1,20 ·
//    L3 x1,30 · L4 x1,40); en `LISTA DE PRECIOS` el L1 coincide con costo x1,15
//    en 22 de 34 y los 12 que no son todos de la familia `005-*`. Una es calculo
//    fresco y la otra una foto vieja.
//    Y de las varias compras de un producto se toma **la MAS RECIENTE**: el
//    precio vigente sale del costo vigente.
//
// 🔴 EL PARSER DE ESTE CARGADOR ES `exceljs` (node) A PROPOSITO. El verificador
//    lee el MISMO archivo con `openpyxl` (Python). Comparar la base contra la
//    tabla que este script leyo verificaria la base **contra su propio typo**.
//
// ⛔ LO QUE ESTE SCRIPT **NO** CARGA, dicho para que no se lea como olvido:
//    · El inventario inicial. Las existencias son un hecho con fecha y entran
//      por `adjust_stock`, que exige motivo. Queda pendiente.
//    · El historico de ventas y compras. Va despues, con ella ya operando.
//    · `customers.nivel_default`. Medido: de las 110 lineas de venta, CERO caen
//      exacto en alguno de los cinco niveles de su producto — ella vende en
//      numeros redondos y los niveles tienen decimales. No hay moda que
//      derivar, y «el nivel mas cercano» seria atribuirle un nivel que nunca
//      eligio. Queda NULL y la cadena cae a la sede (deuda 101).
//
// USO:
//   MPE=<correo> MPP=<clave> node scripts/cargar-muscle-pro-v3.mjs \
//     --sede-id <uuid> [--dry-run] [--fase 1,2,3,4]
// ============================================================================
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import ExcelJS from 'exceljs'

const ARCHIVO = 'docs/Control Mp 3.xlsx'

// ── argumentos ──────────────────────────────────────────────────────────────
const args = new Map()
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]
  if (a.startsWith('--')) args.set(a.slice(2), process.argv[i + 1]?.startsWith('--') ? true : process.argv[++i] ?? true)
}
const SEDE_ID = args.get('sede-id')
const DRY = args.has('dry-run')
const FASES = new Set(String(args.get('fase') ?? '1,2,3,4').split(',').map((x) => x.trim()))

function abortar(que, queHacer) {
  console.error('\n🔴 ABORTA: ' + que)
  if (queHacer) console.error('   ' + queHacer)
  process.exit(1)
}
if (!SEDE_ID) abortar('falta --sede-id', 'Es la sede NUEVA y vacia. Sin esto no se corre.')
if (!process.env.MPE || !process.env.MPP) abortar('faltan MPE/MPP en el entorno')

// ── las categorias canonicas ────────────────────────────────────────────────
// 🔴 El Excel escribe las categorias SIN TILDES y en minuscula a veces
//    («Farmacologia», «crema de arroz», «Proteina» y «proteina»). El producto
//    las muestra con su ortografia correcta. El cruce va SIN TILDES —el indice
//    unico normaliza espacios y mayusculas pero NO tildes, asi que cargar
//    «Farmacologia» al lado de «Farmacología» crearia DOS categorias— y el
//    nombre que se escribe es el canonico.
const CANONICA = {
  'farmacologia': 'Farmacología',
  'proteina': 'Proteína',
  'snack': 'Snack',
  'crema de arroz': 'Crema de arroz',
  'creatina': 'Creatina',
  'aminoacidos': 'Aminoácidos',
  'pre entrenos': 'Pre entrenos',
  'quemadores': 'Quemadores',
  'multivitaminico': 'Multivitamínico',
  'vitamina': 'Vitamina',
  'glutamina': 'Glutamina',
  'precursor': 'Precursor',
  'protector': 'Protector',
}
const sinTildes = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
const clave = (s) => sinTildes(s).trim().replace(/\s+/g, ' ').toLowerCase()

// ── lectura del Excel ───────────────────────────────────────────────────────
const wb = new ExcelJS.Workbook()
await wb.xlsx.readFile(ARCHIVO)

function hoja(nombre) {
  const ws = wb.getWorksheet(nombre)
  if (!ws) abortar('no existe la hoja «' + nombre + '» en ' + ARCHIVO)
  const enc = {}
  ws.getRow(1).eachCell((c, i) => { const v = String(c.value ?? '').trim(); if (v) enc[v.toLowerCase()] = i })
  const col = (n) => {
    const k = Object.keys(enc).find((e) => e === n || e.includes(n))
    if (!k) abortar('la hoja «' + nombre + '» no tiene columna «' + n + '»', 'encabezados: ' + Object.keys(enc).join(', '))
    return enc[k]
  }
  return { ws, col }
}
const valor = (c) => (c && typeof c === 'object' && 'result' in c ? c.result : c)
const num = (c) => { const v = valor(c); return typeof v === 'number' ? v : null }
const txt = (c) => { const v = valor(c); return v == null ? null : String(v).trim() }

// ── § 1 · el maestro de productos ───────────────────────────────────────────
const P = hoja('Productos')
const cPI = P.col('item'), cPN = P.col('producto'), cPC = P.col('categoria')
const maestro = []
P.ws.eachRow((row, r) => {
  if (r === 1) return
  const nom = txt(row.getCell(cPN).value)
  if (!nom) return
  maestro.push({ nombre: nom, codigo: txt(row.getCell(cPI).value), categoria: txt(row.getCell(cPC).value) })
})

// ── § 2 · los cinco niveles, de la compra MAS RECIENTE de cada producto ─────
const C = hoja('Compra de inventario')
const cCN = C.col('producto'), cCF = C.col('fecha')
const cNivel = { L0: C.col('l0'), L1: C.col('l1'), L2: C.col('l2'), L3: C.col('l3'), L4: C.col('l4') }
const niveles = new Map()
C.ws.eachRow((row, r) => {
  if (r === 1) return
  const nom = txt(row.getCell(cCN).value)
  if (!nom) return
  const v = {}
  for (const k of ['L0', 'L1', 'L2', 'L3', 'L4']) {
    const n = num(row.getCell(cNivel[k]).value)
    if (n == null || n <= 0) return
    v[k] = n
  }
  const f = valor(row.getCell(cCF).value)
  const fecha = f instanceof Date ? f.getTime() : 0
  const k = clave(nom)
  const previo = niveles.get(k)
  if (!previo || fecha >= previo.fecha) niveles.set(k, { fecha, v })
})

// ── § 3 · clientes ──────────────────────────────────────────────────────────
const V = hoja('Ventas Diarias')
const cVC = V.col('cliente')
const clientes = new Set()
V.ws.eachRow((row, r) => {
  if (r === 1) return
  const c = txt(row.getCell(cVC).value)
  if (c) clientes.add(c)
})

console.log('══ LEIDO DE ' + ARCHIVO + ' (parser: exceljs) ══')
console.log('   productos del maestro: ' + maestro.length)
console.log('   productos con los 5 niveles: ' + niveles.size)
console.log('   clientes distintos: ' + clientes.size)
const cats = new Map()
for (const m of maestro) {
  const k = clave(m.categoria)
  if (!CANONICA[k]) abortar('categoria desconocida: «' + m.categoria + '»', 'agregala al mapa CANONICA con su ortografia correcta.')
  cats.set(k, CANONICA[k])
}
console.log('   categorias distintas (normalizadas): ' + cats.size)

const sinNiveles = maestro.filter((m) => !niveles.has(clave(m.nombre)))
if (sinNiveles.length) abortar(sinNiveles.length + ' productos sin los cinco niveles',
  'el alcance cambia: ' + sinNiveles.map((m) => m.nombre).join(', '))

if (DRY) { console.log('\n(--dry-run: no se escribe nada)'); process.exit(0) }

// ── sesion ──────────────────────────────────────────────────────────────────
const env = readFileSync('.env', 'utf8')
const de = (k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.replace(/^["']|["']$/g, '').trim()
const db = createClient(de('VITE_NODO_SUPABASE_URL'), de('VITE_NODO_SUPABASE_ANON_KEY'), { auth: { persistSession: false } })
const { data: ses, error: eL } = await db.auth.signInWithPassword({ email: process.env.MPE, password: process.env.MPP })
if (eL) abortar('login: ' + eL.message)
const UID = ses.user.id
const { data: perfil } = await db.from('profiles').select('sede_id').eq('id', UID).single()
if (perfil.sede_id !== SEDE_ID) abortar(
  'la sede ACTIVA del usuario no es la que se paso por --sede-id',
  'activa=' + perfil.sede_id + '  pedida=' + SEDE_ID + '. RLS escribe en la ACTIVA, asi que esto sembraria en la sede equivocada.')
console.log('\nsesion ok · sede activa = la pedida  ✅')

// 🔴 GUARD FAIL-CLOSED: la sede tiene que estar VACIA. Cargar sobre una sede con
//    datos duplicaria el catalogo sin error, y no hay policy de DELETE.
for (const t of ['products', 'categories', 'customers', 'orders']) {
  const { count } = await db.from(t).select('*', { count: 'exact', head: true }).eq('sede_id', SEDE_ID)
  if (count !== 0) abortar('la sede NO esta vacia: ' + t + ' tiene ' + count + ' filas',
    'este script solo carga sedes nuevas. Ninguna tabla tiene policy de DELETE: lo cargado no se puede deshacer.')
}
console.log('la sede esta vacia  ✅')

// ── FASE 1 · categorias ─────────────────────────────────────────────────────
const idCat = new Map()
if (FASES.has('1')) {
  console.log('\n── FASE 1 · categorias ──')
  let n = 0
  for (const [k, nombre] of [...cats.entries()].sort((a, b) => a[1].localeCompare(b[1]))) {
    const { data, error } = await db.from('categories')
      .insert({ sede_id: SEDE_ID, name: nombre }).select('id').single()
    if (error) abortar('categoria «' + nombre + '»: ' + error.message, 'las creadas antes QUEDARON.')
    idCat.set(k, data.id); n++
    console.log('  + ' + nombre)
  }
  console.log('  ' + n + ' categorias')
} else {
  const { data } = await db.from('categories').select('id, name').eq('sede_id', SEDE_ID)
  for (const c of data ?? []) idCat.set(clave(c.name), c.id)
}

// ── FASE 2 · productos ──────────────────────────────────────────────────────
const idProd = new Map()
if (FASES.has('2')) {
  console.log('\n── FASE 2 · productos ──')
  let n = 0
  for (const m of maestro) {
    const cat = idCat.get(clave(m.categoria))
    if (!cat) abortar('sin categoria para «' + m.nombre + '»')
    const L1 = niveles.get(clave(m.nombre)).v.L1
    const { data, error } = await db.from('products').insert({
      sede_id: SEDE_ID, category_id: cat, name: m.nombre,
      // El codigo va TAL CUAL su archivo. El indice unico se retiro el
      // 2026-09-14 (revision de la decision A de la deuda 41): sus cuatro
      // galletas Mr Cream comparten 004-6 a proposito.
      codigo: m.codigo,
      // VALOR ASUMIDO, confirmado por la clienta el 2026-09-07: todo por unidad.
      unidad: 'unidad',
      // `products.price` sigue siendo not null y es L1 — su precio base.
      price: Math.round(L1),
      kind: 'simple', stock_tracking: true, min_stock: 0, is_active: true,
      description: null, image_url: null,
    }).select('id').single()
    if (error) abortar('producto «' + m.nombre + '»: ' + error.message, 'los creados antes QUEDARON.')
    idProd.set(clave(m.nombre), data.id); n++
  }
  console.log('  ' + n + ' productos')
} else {
  const { data } = await db.from('products').select('id, name').eq('sede_id', SEDE_ID)
  for (const p of data ?? []) idProd.set(clave(p.name), p.id)
}

// ── FASE 3 · los cinco niveles ──────────────────────────────────────────────
if (FASES.has('3')) {
  console.log('\n── FASE 3 · precios por nivel ──')
  const filas = []
  for (const m of maestro) {
    const pid = idProd.get(clave(m.nombre))
    if (!pid) abortar('sin id para «' + m.nombre + '»')
    const v = niveles.get(clave(m.nombre)).v
    for (const [k, nivel] of [['L0', 0], ['L1', 1], ['L2', 2], ['L3', 3], ['L4', 4]])
      filas.push({ product_id: pid, sede_id: SEDE_ID, nivel, precio: Math.round(v[k]) })
  }
  for (let i = 0; i < filas.length; i += 100) {
    const { error } = await db.from('product_prices').insert(filas.slice(i, i + 100))
    if (error) abortar('precios (lote ' + i + '): ' + error.message, 'los insertados antes QUEDARON.')
  }
  console.log('  ' + filas.length + ' filas de precio (' + maestro.length + ' x 5)')
}

// ── FASE 4 · clientes ───────────────────────────────────────────────────────
if (FASES.has('4')) {
  console.log('\n── FASE 4 · clientes ──')
  const filas = [...clientes].sort().map((nombre) => ({
    sede_id: SEDE_ID, name: nombre, is_active: true,
    // nivel_default queda NULL: ver la cabecera.
  }))
  for (let i = 0; i < filas.length; i += 50) {
    const { error } = await db.from('customers').insert(filas.slice(i, i + 50))
    if (error) abortar('clientes (lote ' + i + '): ' + error.message, 'los insertados antes QUEDARON.')
  }
  console.log('  ' + filas.length + ' clientes  (nivel_default NULL, a proposito)')
}

console.log('\n✅ ESCRITO. La verificacion va APARTE, con otro parser:')
console.log('   python scripts/verificar-carga-v3.py --sede-id ' + SEDE_ID)
