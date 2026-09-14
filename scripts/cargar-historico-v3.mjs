// ============================================================================
// RECONSTRUCCION DEL HISTORICO DE MUSCLE PRO — v3, a la sede nueva.
//
// ── LOS CINCO CONJUNTOS ─────────────────────────────────────────────────────
//   15 jornadas      una por dia, 2026-08-30 .. 2026-09-13
//   79 compras       391 unidades, 8 proveedores
//  110 ventas        101 cobradas + 9 a credito, de las cuales 2 con abono
//   10 gastos
//    2 debt_payments  los abonos de 80.000 y 20.000
//
// ── LAS SUMAS DE CONTROL ────────────────────────────────────────────────────
//   comprado           13.172.423,29   ⚠️ CON CENTAVOS, y por eso se escribe
//                                     entero: redondearla a 13.172.423 la deja
//                                     sin cerrar contra sus propias 79 lineas.
//   vendido             7.854.600
//   gastos              4.941.500
//   saldo de cartera      725.000   (825.000 a credito - 100.000 abonado)
//
// ── QUE ES DATO Y QUE ES ASUMIDO ────────────────────────────────────────────
//   DATO de su archivo:
//     · metodo de pago -> 86 TRANSFERENCIA + 15 EFECTIVO = las 101 cobradas.
//       Cierra por dos caminos, y por eso es dato y no lectura. ⚠️ Cambia el
//       arqueo: las 15 en efectivo SI tocan la caja de sus dias.
//     · cantidades, precios reales, fechas, proveedores y los cinco niveles.
//   CONFIRMADO por la clienta — entro asumido, se pregunto, lo confirmo. El
//   recorrido se conserva: no es lo mismo que «siempre fue dato de ella».
//     · canal = 'mostrador' para las 110. Todas fueron en el local.
//     · plazo_dias = 15 · unidad = 'unidad'
//   DERIVADO POR NOSOTROS, no dato de ella:
//     · `customers.nivel_default` con el corte >=2: 9 de 33, 24 vacios (3 por
//       empate). Ella autorizo EL METODO, no el valor.
//   DECIDIDO POR NOSOTROS, y su archivo NO lo dice:
//     · 🔴 DENTRO DE UN MISMO DIA, LAS COMPRAS VAN ANTES QUE LAS VENTAS.
//       Su archivo registra la FECHA de cada linea, no la SECUENCIA intra-dia,
//       asi que el orden lo elegimos nosotros — igual que `canal` o
//       `nivel_default`, y por eso esta aca y no en «el orden de carga».
//       Se elige por dos razones que apuntan igual: recibir y despues vender es
//       lo plausible en un negocio, Y es la que produce el dato completo.
//       EL CONTRAFACTUAL, que es lo que la justifica y no la plausibilidad:
//         este orden      ->   0 de 110 lineas sin costo ·  0,0% del vendido
//         el contrario    ->  39 de 110                  · 49,8%  (3.910.100)
//       Y no se recupera: `adjust_cost` corrige de ahi en adelante, jamas el
//       pasado. El orden intra-dia vale la mitad del costo de lo vendido.
//   NORMALIZADO POR NOSOTROS sobre su dato — declarado como lo demas:
//     · `VENOM` y `Venom` son EL MISMO proveedor (7 y 14 lineas). Sin esto
//       quedan dos `suppliers` y todo reporte por proveedor se parte en dos.
//       Tercera aparicion de la clase: tildes en categorias, mayusculas aca, y
//       antes los nombres de producto entre hojas.
//   NULO A PROPOSITO:
//     · `order_items.nivel_aplicado` -> estas 110 ventas son ANTERIORES a las
//       listas, y ese null significa «no salio de una lista». Es un dato.
//
// ── LO QUE ESTE CARGADOR NO PUEDE FECHAR, DICHO ANTES DE CORRER ─────────────
// 🔴 `register_debt_payment(p_order_id, p_amount, p_payment_method)` NO TOMA
//    FECHA. Los dos abonos quedan estampados EL DIA QUE SE CORRA, no el de su
//    venta. El saldo de cartera es correcto igual (825.000 - 100.000 = 725.000);
//    lo que queda fechado hoy es el MOVIMIENTO, no el saldo.
//    Se declara en vez de escribir una fecha falsa en silencio — misma decision
//    que tomo la deuda 97 con el cierre de jornada, y el mismo camino si algun
//    dia molesta: una RPC con fecha explicita y motivo, no aflojar nada.
//    ✅ El METODO de los abonos: TRANSFERENCIA. **Entro asumido, se pregunto, lo
//    confirmo la clienta el 2026-09-14.** El recorrido se conserva a proposito:
//    borrarlo convertiria el dato en algo que siempre fue suyo, y eso es una
//    afirmacion falsa sobre su origen. Su archivo escribe «ABONO 80 MIL» y
//    «ABONO 20 MIL» en la columna de metodo y NO dice como se pagaron; se
//    propuso `transfer` porque 86 de 101 cobradas lo son, y ella lo confirmo.
//    ⚠️ Consecuencia que ella tambien confirmo: la caja de esos dias NO se mueve.
//
// ── SU HOJA «Resumen General» NO CIERRA CON SUS PROPIAS LINEAS ──────────────
// ✅ CONFIRMADO POR ELLA el 2026-09-14: su resumen esta desactualizado y las
//    lineas son la fuente. Lo cargado es correcto.
//      ventas acumuladas   ella 7.173.100   ·   sus lineas 7.854.600
//      compra inventario   ella 13.054.423  ·   sus lineas 13.172.423,29
// 🔴 Y con esto la clase QUEDA CERRADA: es la SEGUNDA hoja suya de resumen que
//    se contradice con sus propias lineas —la primera fue `Control de
//    inventario` (v2)— y en las dos ella confirmo que mandan las lineas. Deja de
//    ser un hallazgo por archivo: **sus hojas de resumen son fotos que no se
//    recalculan**. Esta anotado en CLAUDE.md, Comportamientos del negocio § 4,
//    porque es lo que va a explicar cualquier diferencia futura entre lo que
//    ella mira en Excel y lo que ve en Nodo.
// ⛔ NO se ajusta nada para que cuadre con su resumen: eso inventaria un dato
//    sobre lineas reales.
//
// ── LAS 15 JORNADAS VAN SIN ARQUEO ──────────────────────────────────────────
//   `closing_amount`, `expected_amount` y `difference` quedan NULOS, asi que
//   ella va a ver 15 cierres SIN CUADRE y eso es correcto: nadie conto esos
//   dias. Un cero seria un ARQUEO FALSO PERSISTIDO —el defecto que la auditoria
//   A1 documento— y ademas se reimprime en el comprobante. Un hueco visible es
//   honesto; un cero plausible, no.
//   Se cierran con `cerrar_jornada_con_fecha` (deuda 97), con motivo y rastro:
//   es la unica forma de que los 15 cierres queden en SU dia y no todos hoy.
//
// ── DOS JORNADAS NO TIENEN VENTAS, SOLO GASTOS ──────────────────────────────
//   El 2026-08-30 y el 2026-09-13. No es un artefacto nuestro: son dias en que
//   gasto y no vendio. Se cargan igual y se ven asi.
//
// ── EL ORDEN: COMPRAS Y VENTAS INTERCALADAS POR FECHA ───────────────────────
// 🔴 No es prolijidad, y el numero lo dice: el COSTO SE CONGELA AL VENDER (R1
//    punto 8). Cada compra recalcula `cost_price` por promedio ponderado movil
//    y cada venta graba el costo VIGENTE en `order_items.unit_cost`.
//
//      compras primero (este orden):    0 de 110 lineas sin costo ·   0,0% del vendido
//      ventas primero  (el peor caso): 39 de 110                  ·  49,8% del vendido
//
//    **El orden DENTRO del dia vale la mitad del costo de lo vendido**, y no se
//    recupera: `adjust_cost` corrige de ahi en adelante, nunca el pasado.
//
// ⚠️ El orden DENTRO del dia es una DECISION NUESTRA y esta declarada arriba,
//    entre lo decidido por nosotros. Aca va el mecanismo; alla, el hecho.
//
//    LA PREMISA DE ESE 0%, declarada porque la medicion se apoya entera en ella:
//    los 62 productos estan HOY con `cost_price` NULO. No es un supuesto: el
//    cargador del catalogo no escribe esa columna y `products.cost_price` no
//    tiene default (`numeric(12,2) check (cost_price >= 0)`, nullable). Si en vez
//    de nulo estuviera en CERO, el orden no importaria y seria peor: un costo
//    cero congela un margen del 100% FALSO en cada linea, y eso no se ve como un
//    hueco sino como una utilidad extraordinaria.
//    ⚠️ Medido contra el ESQUEMA. Se reconfirma contra la BASE con una sonda de
//    SOLO LECTURA antes de correr — el esquema es una declaracion y no ejecuta.
//
// ✅ Simulado dia a dia ANTES de escribir: CERO productos en negativo, ni
//    transitorios ni finales. Stock final: 34 productos, 200 unidades.
//
// 🔴 ESTO SI ES EL HISTORICO COMPLETO, a diferencia de `cargar-muscle-pro-v3`,
//    que cargo solo el catalogo. Despues de esto los reportes por periodo sobre
//    el 30/08 .. 13/09 SI son completos.
//
// ⛔ EL INVENTARIO SALE DE ACA y NO de un conteo: cada compra suma y cada venta
//    resta. Su hoja `Control de inventario` contradice sus propias lineas de
//    venta —17 Nutella contra 20— y ella confirmo que las lineas son la fuente.
//    `adjust_stock` queda para lo que es: corregir un descuadre medido contra un
//    conteo REAL, cuando ella cuente. No para fabricar un inventario inicial.
//
// USO:
//   MPE=<correo> MPP=<clave> node scripts/cargar-historico-v3.mjs \
//     --sede-id <uuid> [--dry-run]
// ============================================================================
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import ExcelJS from 'exceljs'

const ARCHIVO = 'docs/Control Mp 3.xlsx'
const MOTIVO_CIERRE = 'reconstruccion de historico (deuda 97)'

const args = new Map()
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]
  if (a.startsWith('--')) args.set(a.slice(2), process.argv[i + 1]?.startsWith('--') ? true : process.argv[++i] ?? true)
}
const SEDE_ID = args.get('sede-id')
const DRY = args.has('dry-run')

function abortar(que, queHacer) {
  console.error('\n🔴 ABORTA: ' + que)
  if (queHacer) console.error('   ' + queHacer)
  process.exit(1)
}
if (!SEDE_ID) abortar('falta --sede-id')
if (!DRY && (!process.env.MPE || !process.env.MPP)) abortar('faltan MPE/MPP')

const sinTildes = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
const clave = (s) => sinTildes(s).trim().replace(/\s+/g, ' ').toLowerCase()
const AT = (dia, hora) => dia + 'T' + hora + '-05:00'   // America/Bogota (R7)

// ── lectura ─────────────────────────────────────────────────────────────────
const wb = new ExcelJS.Workbook()
await wb.xlsx.readFile(ARCHIVO)
function hoja(nombre) {
  const ws = wb.getWorksheet(nombre)
  if (!ws) abortar('no existe la hoja «' + nombre + '»')
  const enc = {}
  ws.getRow(1).eachCell((c, i) => { const v = String(c.value ?? '').trim(); if (v) enc[v.toLowerCase()] = i })
  const col = (n) => {
    const k = Object.keys(enc).find((e) => e === n || e.includes(n))
    if (!k) abortar('la hoja «' + nombre + '» no tiene columna «' + n + '»', Object.keys(enc).join(', '))
    return enc[k]
  }
  return { ws, col }
}
const valor = (c) => (c && typeof c === 'object' && 'result' in c ? c.result : c)
const num = (c) => { const v = valor(c); return typeof v === 'number' ? v : null }
const txt = (c) => { const v = valor(c); return v == null ? null : String(v).trim() }
const fecha = (c) => { const v = valor(c); return v instanceof Date ? v.toISOString().slice(0, 10) : null }

const C = hoja('Compra de inventario')
const compras = []
C.ws.eachRow((row, r) => {
  if (r === 1) return
  const f = fecha(row.getCell(C.col('fecha')).value)
  const p = txt(row.getCell(C.col('producto')).value)
  const q = num(row.getCell(C.col('unidades')).value)
  const cu = num(row.getCell(C.col('costo unitario')).value)
  const pv = txt(row.getCell(C.col('proveedor')).value)
  if (f && p && q && cu) compras.push({ f, p, q, cu, prov: pv })
})

const V = hoja('Ventas Diarias')
const ventas = []
V.ws.eachRow((row, r) => {
  if (r === 1) return
  const f = fecha(row.getCell(V.col('fecha')).value)
  const p = txt(row.getCell(V.col('producto')).value)
  const q = num(row.getCell(V.col('cantidad vendida')).value)
  const pr = num(row.getCell(V.col('precio real')).value)
  if (!f || !p || !q) return
  ventas.push({
    f, p, q, pr: pr ?? 0,
    cli: txt(row.getCell(V.col('cliente')).value),
    tipo: (txt(row.getCell(V.col('tipo de pago')).value) ?? '').toUpperCase(),
    metodo: (txt(row.getCell(V.col('metodo de pago')).value) ?? '').toUpperCase(),
  })
})

const G = hoja('Gasto')
const gastos = []
G.ws.eachRow((row, r) => {
  if (r === 1) return
  const f = fecha(row.getCell(G.col('fecha')).value)
  const c = txt(row.getCell(G.col('concepto')).value)
  const v = num(row.getCell(G.col('valor')).value)
  if (f && c && v) gastos.push({ f, concepto: c, valor: v })
})

// 🔴 La subcategoria sale de SU concepto, no de una lista inventada.
const SUBCATEGORIA = [
  [/publicidad|marketing/i, 'Publicidad'],
  [/adecuacion|adecuación|estante/i, 'Adecuación'],
  [/escritorio|silla/i, 'Activo'],
  [/camisa/i, 'Uniformes'],
  [/bolsa/i, 'Empaque'],
  [/competencia/i, 'Patrocinio'],
]
const subcategoriaDe = (concepto) => {
  const m = SUBCATEGORIA.find(([re]) => re.test(concepto))
  if (!m) abortar('gasto sin subcategoria: «' + concepto + '»',
    'clasificarlo mal lo esconde en el reporte equivocado. Agregalo al mapa o preguntale a la clienta.')
  return m[1]
}

const dias = [...new Set([...compras.map((x) => x.f), ...ventas.map((x) => x.f), ...gastos.map((x) => x.f)])].sort()
const sumaC = compras.reduce((a, x) => a + x.q * x.cu, 0)
const sumaV = ventas.reduce((a, x) => a + x.q * x.pr, 0)
const sumaG = gastos.reduce((a, x) => a + x.valor, 0)
const provs = new Map()
for (const c of compras) provs.set(clave(c.prov), c.prov)   // VENOM/Venom colapsan

console.log('══ LEIDO (parser: exceljs) ══')
console.log('   dias: %d  (%s .. %s)', dias.length, dias[0], dias.at(-1))
console.log('   compras: %d lineas · comprado %s', compras.length, sumaC.toLocaleString('es-CO'))
console.log('   ventas:  %d lineas · vendido  %s', ventas.length, sumaV.toLocaleString('es-CO'))
console.log('   gastos:  %d · %s', gastos.length, sumaG.toLocaleString('es-CO'))
console.log('   proveedores: %d (normalizados desde %d)', provs.size, new Set(compras.map((c) => c.prov)).size)
console.log('   a credito: %d lineas', ventas.filter((v) => v.tipo.startsWith('CRED')).length)
for (const g of [...gastos].sort((a, b) => a.f.localeCompare(b.f)))
  console.log('     gasto %s  %s %s  ->  %s', g.f, g.concepto.slice(0, 32).padEnd(32),
    String(g.valor).padStart(9), subcategoriaDe(g.concepto))


// ── los dos abonos: van contra la venta que su propia fila identifica ───────
// Su archivo los escribe en la columna METODO DE PAGO de la venta abonada:
// «ABONO 80 MIL» sobre la de 100.000 del 31-08 y «ABONO 20 MIL» sobre la de
// 36.000 del 06-09. El monto sale del texto, no de una tabla aparte.
const abonoDe = (metodo) => {
  const m = /^ABONO\s+([\d.]+)\s*MIL/i.exec(metodo ?? '')
  return m ? Number(m[1].replace('.', '')) * 1000 : null
}
const conAbono = ventas.filter((v) => abonoDe(v.metodo) != null)
if (conAbono.length !== 2) abortar('esperaba 2 abonos y encontre ' + conAbono.length,
  'el formato «ABONO N MIL» cambio, o hay uno mas. Mirar la columna METODO DE PAGO.')
const sumaAbonos = conAbono.reduce((a, v) => a + abonoDe(v.metodo), 0)
const sumaCredito = ventas.filter((v) => v.tipo.startsWith('CRED')).reduce((a, v) => a + v.q * v.pr, 0)
console.log('   abonos: %d por %s  ->  saldo de cartera %s',
  conAbono.length, sumaAbonos.toLocaleString('es-CO'), (sumaCredito - sumaAbonos).toLocaleString('es-CO'))

// ── las sumas de control que deciden si se carga ───────────────────────────
// 🔴 Se DESCOMPONE, no se recalcula por el mismo camino: que las partes cierren
//    con el total es una segunda medicion (la sexta falla de instrumento).
if (sumaCredito - sumaAbonos !== 725000)
  abortar('el saldo de cartera da ' + (sumaCredito - sumaAbonos) + ' y la cabecera declara 725.000',
    'una de las dos esta mal. NO se carga hasta saber cual.')
if (ventas.length !== 110 || compras.length !== 79 || gastos.length !== 10 || dias.length !== 15)
  abortar('los conjuntos no dan: ' + [ventas.length, compras.length, gastos.length, dias.length].join('/'),
    'la cabecera declara 110 ventas / 79 compras / 10 gastos / 15 dias.')
console.log('   ✅ las sumas de control cierran con la cabecera')

if (DRY) { console.log('\n(--dry-run: no se escribio nada)'); process.exit(0) }

// ════════════════════════════════════════════════════════════════════════════
// ESCRITURA
// ════════════════════════════════════════════════════════════════════════════
const env = Object.fromEntries(
  readFileSync('.env', 'utf8').split(/\r?\n/).filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))
const db = createClient(env.VITE_NODO_SUPABASE_URL, env.VITE_NODO_SUPABASE_ANON_KEY)
const { data: sesion, error: eAuth } = await db.auth.signInWithPassword({
  email: process.env.MPE, password: process.env.MPP })
if (eAuth) abortar('no entro: ' + eAuth.message)
const YO = sesion.user.id

// ── GUARD: la sede se fija por UUID, nunca por nombre ───────────────────────
const { data: sede, error: eSede } = await db.from('sedes').select('id, name').eq('id', SEDE_ID).single()
if (eSede || !sede) abortar('la sede ' + SEDE_ID + ' no existe o no la veo: ' + (eSede?.message ?? ''))
console.log('\n══ SEDE ══  %s  «%s»', sede.id, sede.name)

// 🔴 Contado en el SERVIDOR: `select(...)` sin paginar corta en 1000 filas sin
//    error y sin aviso, y contar del lado del cliente mide la pagina.
const cuenta = async (t) => {
  const { count, error } = await db.from(t).select('*', { count: 'exact', head: true }).eq('sede_id', SEDE_ID)
  if (error) abortar('no pude contar ' + t + ': ' + error.message)
  return count
}
const TABLAS = ['orders', 'jornadas', 'purchase_invoices', 'payments', 'debt_payments',
                'cash_movements', 'stock_movements', 'products', 'customers', 'suppliers']
const antes = {}
for (const t of TABLAS) antes[t] = await cuenta(t)
console.log('══ ANTES ══  ' + Object.entries(antes).map(([k, v]) => k + '=' + v).join(' · '))

// 🔴 LA ORDEN FANTASMA, permitida POR ID y no por «hay una, da igual».
//    Residuo de la fase 5 del cargador de catalogo: #2, pending, total 0, sin
//    lineas y sin pagos. NO se puede borrar: ninguna tabla tiene policy DELETE.
const FANTASMA = '4b984fb3-8278-4370-94f4-ba98e8693298'
const { data: ordsPrevias, error: eOP } = await db.from('orders').select('id').eq('sede_id', SEDE_ID)
if (eOP) abortar('no pude leer las ordenes previas: ' + eOP.message)
const intrusas = ordsPrevias.filter((o) => o.id !== FANTASMA)
if (intrusas.length) abortar('la sede tiene ' + intrusas.length + ' orden(es) que no son la fantasma conocida',
  'reconstruir encima DUPLICA, y no hay policy de DELETE para deshacerlo. Mirar a mano.')
for (const t of ['purchase_invoices', 'payments', 'debt_payments', 'jornadas'])
  if (antes[t] > 0) abortar('la sede ya tiene ' + t + '=' + antes[t],
    'este cargador es para una sede sin operacion. NO se puede deshacer.')
if (antes.products !== 62) abortar('esperaba 62 productos y hay ' + antes.products)
console.log('  ✅ sin operacion previa (salvo la orden fantasma, permitida por uuid)')

// 🔴 LA PREMISA DEL 0%, reconfirmada CONTRA LA BASE y no contra el esquema:
//    un esquema es una declaracion y no ejecuta (corolario de R4).
const sinCosto = (await db.from('products').select('*', { count: 'exact', head: true })
  .eq('sede_id', SEDE_ID).is('cost_price', null)).count
const costoCero = (await db.from('products').select('*', { count: 'exact', head: true })
  .eq('sede_id', SEDE_ID).eq('cost_price', 0)).count
console.log('  cost_price -> NULO en %d de %d · en CERO en %d', sinCosto, antes.products, costoCero)
if (costoCero > 0) abortar('hay ' + costoCero + ' productos con cost_price = 0',
  'un costo CERO congela un margen del 100% FALSO, que se lee como buen negocio y no como hueco. PARAR.')
if (sinCosto !== antes.products) abortar('solo ' + sinCosto + ' de ' + antes.products + ' estan sin costo',
  'la medicion 0-de-110 se hizo sobre el catalogo entero sin costo. Recalcular antes de cargar.')

// ── resolver productos y clientes POR NOMBRE NORMALIZADO ───────────────────
const { data: prods, error: eP } = await db.from('products').select('id, name').eq('sede_id', SEDE_ID)
if (eP) abortar('productos: ' + eP.message)
const idProd = new Map(prods.map((p) => [clave(p.name), p.id]))
const { data: clis, error: eC2 } = await db.from('customers').select('id, name').eq('sede_id', SEDE_ID)
if (eC2) abortar('clientes: ' + eC2.message)
const idCli = new Map(clis.map((c) => [clave(c.name), c.id]))

// CONTROL DE COBERTURA antes de escribir nada: si falta un nombre, aborta aca
const faltanProd = [...new Set([...compras.map((x) => x.p), ...ventas.map((x) => x.p)])]
  .filter((n) => !idProd.has(clave(n)))
if (faltanProd.length) abortar('no encuentro ' + faltanProd.length + ' producto(s) en la sede',
  faltanProd.slice(0, 8).join(' | '))
const nombresCli = [...new Set(ventas.map((v) => v.cli).filter(Boolean))]
const faltanCli = nombresCli.filter((n) => !idCli.has(clave(n)))
console.log('  productos del archivo mapeados: %d · clientes del archivo: %d, sin fila: %d',
  new Set([...compras.map((x) => x.p), ...ventas.map((x) => x.p)].map(clave)).size,
  nombresCli.length, faltanCli.length)

// proveedores: se crean los que falten, YA NORMALIZADOS (VENOM/Venom -> uno)
const { data: provsBd, error: eSup } = await db.from('suppliers').select('id, name').eq('sede_id', SEDE_ID)
if (eSup) abortar('proveedores: ' + eSup.message)
const idProv = new Map(provsBd.map((x) => [clave(x.name), x.id]))
for (const [k, nombreCanonico] of provs) {
  if (idProv.has(k)) continue
  const { data, error } = await db.from('suppliers')
    .insert({ sede_id: SEDE_ID, name: nombreCanonico,
              notes: 'HIST-v3: alta por reconstruccion del historico' }).select('id').single()
  if (error) abortar('proveedor «' + nombreCanonico + '»: ' + error.message)
  idProv.set(k, data.id)
  console.log('  + proveedor %s', nombreCanonico)
}
// clientes que falten — los nombres NO se imprimen: son PII de la clienta
let nCli = 0
for (const n of faltanCli) {
  const { data, error } = await db.from('customers')
    .insert({ sede_id: SEDE_ID, name: n, plazo_dias: 15,
              notes: 'HIST-v3: alta por reconstruccion del historico' }).select('id').single()
  if (error) abortar('no se pudo crear un cliente: ' + error.message)
  idCli.set(clave(n), data.id); nCli++
}
if (nCli) console.log('  + %d cliente(s) creados (los nombres no se imprimen: son PII)', nCli)

// ── EL BUCLE DE DIAS ───────────────────────────────────────────────────────
const H_ABRE = '13:00:00', H_OPERA = '17:00:00', H_CIERRA = '23:59:00'   // 08:00 · 12:00 · 18:59 Bogota
const ATZ = (dia, h) => dia + 'T' + h + 'Z'
const COP = (n) => new Intl.NumberFormat('es-CO').format(Math.round(n))
const METODO = { TRANSFERENCIA: 'transfer', EFECTIVO: 'cash', NEQUI: 'nequi', TARJETA: 'card' }

let nFac = 0, nVta = 0, nGas = 0, nAbo = 0, nJor = 0
const ordenDeVenta = new Map()

for (const dia of dias) {
  const cd = compras.filter((x) => x.f === dia)
  const vd = ventas.filter((x) => x.f === dia)
  const gd = gastos.filter((x) => x.f === dia)
  console.log('\n══════ %s ══════  %d compra(s) · %d venta(s) · %d gasto(s)', dia, cd.length, vd.length, gd.length)

  const { data: jor, error: eJ } = await db.from('jornadas')
    .insert({ sede_id: SEDE_ID, opened_by: YO, opening_amount: 0, opened_at: ATZ(dia, H_ABRE) })
    .select('id').single()
  if (eJ) abortar('jornada de ' + dia + ': ' + eJ.message,
    'si quedo una abierta de un dia anterior, cerrala antes de reintentar. Van ' + nJor + ' jornadas.')
  nJor++

  // 1 · COMPRAS PRIMERO — la decision declarada en la cabecera. El costo se
  //     congela al vender, asi que el orden intra-dia vale 39 lineas / 49,8%.
  for (const c of cd) {
    const { error } = await db.rpc('register_purchase', {
      p_invoice: { supplier_id: idProv.get(clave(c.prov)), invoice_number: null,
                   notes: 'HIST-v3 ' + dia + ' ' + c.prov, document_date: dia },
      p_items: [{ product_id: idProd.get(clave(c.p)), qty: c.q, unit_cost: c.cu,
                  purchase_unit: 'unidad', units_per_purchase_unit: 1 }],
    })
    if (error) abortar('compra ' + dia + ' «' + c.p + '»: ' + error.message,
      'van ' + nFac + ' compras escritas. NO se pueden borrar.')
    nFac++
  }
  if (cd.length) console.log('  compras · %d factura(s) · %s', cd.length,
    COP(cd.reduce((a, x) => a + x.q * x.cu, 0)))

  // 2 · VENTAS
  for (const v of vd) {
    const esFiado = v.tipo.startsWith('CRED')
    const cliId = v.cli ? idCli.get(clave(v.cli)) ?? null : null
    const total = v.q * v.pr
    const { data: ord, error: eO } = await db.from('orders').insert({
      sede_id: SEDE_ID, created_by: YO, canal: 'mostrador', status: 'delivered',
      created_at: ATZ(dia, H_OPERA), customer_id: cliId, customer_name: v.cli || null,
      notes: 'HIST-v3 ' + dia + ' ' + v.tipo,
      ...(esFiado ? { payment_status: 'pending', plazo_dias: 15 } : {}),
    }).select('id').single()
    if (eO) abortar('orden ' + dia + ': ' + eO.message, 'van ' + nVta + ' ordenes. NO se pueden borrar.')

    // 🔴 `nivel_aplicado` va NULO a proposito: estas ventas son ANTERIORES a las
    //    listas, y el nulo significa «no salio de una lista». Es un dato.
    const { error: eI } = await db.rpc('add_order_items_with_extras', {
      p_order_id: ord.id,
      p_items: [{ product_id: idProd.get(clave(v.p)), qty: v.q, unit_price: v.pr, notes: null, extras: [] }],
    })
    if (eI) abortar('items de la orden de ' + dia + ': ' + eI.message,
      'la orden quedo creada y SIN lineas. Hay que mirarla a mano.')

    if (!esFiado) {
      const metodo = METODO[v.metodo]
      if (!metodo) abortar('metodo de pago desconocido: «' + v.metodo + '» (' + dia + ')',
        'es DATO de su archivo, asi que no se adivina. Agregalo al mapa METODO.')
      const { error: ePa } = await db.rpc('register_sale_payment', {
        p_order_id: ord.id, p_payments: [{ method: metodo, amount: total }] })
      if (ePa) abortar('pago de ' + dia + ': ' + ePa.message, 'la orden quedo con lineas y SIN pago.')
    }

    // 🔴 `next_order_number` DEVUELVE el correlativo y NO lo asigna. Sin este
    //    update la venta queda invisible: el Historial ORDENA POR NUMERO.
    const { data: num, error: eN } = await db.rpc('next_order_number', { p_sede_id: SEDE_ID })
    if (eN || typeof num !== 'number') abortar('numeracion ' + dia + ': ' + (eN?.message ?? 'no devolvio numero'),
      'la venta quedo completa y SIN numero: no aparece en el Historial.')
    const { data: numerada, error: eU } = await db.from('orders')
      .update({ order_number: num }).eq('id', ord.id).eq('sede_id', SEDE_ID).is('order_number', null).select('id')
    if (eU) abortar('no se pudo escribir el numero ' + num + ': ' + eU.message)
    if (!numerada || numerada.length !== 1)
      abortar('el numero ' + num + ' afecto ' + (numerada?.length ?? 0) + ' filas, esperaba 1')

    ordenDeVenta.set(dia + '|' + v.p + '|' + total, ord.id)
    nVta++
  }
  if (vd.length) console.log('  ventas  · %d · %s  (%d a credito)', vd.length,
    COP(vd.reduce((a, x) => a + x.q * x.pr, 0)), vd.filter((x) => x.tipo.startsWith('CRED')).length)

  // 3 · GASTOS
  for (const g of gd) {
    const { error } = await db.from('cash_movements').insert({
      jornada_id: jor.id, sede_id: SEDE_ID, type: 'out', categoria: 'gasto',
      subcategoria: subcategoriaDe(g.concepto), amount: g.valor, reason: g.concepto,
      document_date: g.f, created_by: YO })
    if (error) abortar('gasto «' + g.concepto + '» de ' + dia + ': ' + error.message)
    nGas++
    console.log('  gasto   · %s %s  %s', g.concepto.slice(0, 30).padEnd(30),
      COP(g.valor).padStart(11), subcategoriaDe(g.concepto))
  }

  // 4 · ABONOS del dia — ⚠️ la RPC no toma fecha: el movimiento queda HOY, y
  //     el metodo es ASUMIDO (`transfer`, 86 de 101). Las dos cosas declaradas.
  for (const v of vd) {
    const monto = abonoDe(v.metodo)
    if (monto == null) continue
    const oid = ordenDeVenta.get(dia + '|' + v.p + '|' + (v.q * v.pr))
    if (!oid) abortar('el abono de ' + dia + ' no encuentra su orden')
    const { error } = await db.rpc('register_debt_payment', {
      p_order_id: oid, p_amount: monto, p_payment_method: 'transfer' })
    if (error) abortar('abono de ' + dia + ': ' + error.message)
    nAbo++
    console.log('  abono   · %s  (metodo ASUMIDO: transfer · fecha: hoy, la RPC no la toma)', COP(monto))
  }

  // 5 · CIERRE CON FECHA — la excepcion NOMBRADA de la deuda 97. Sin arqueo:
  //     un cero seria un arqueo FALSO persistido, y ademas se reimprime.
  const { error: eCi } = await db.rpc('cerrar_jornada_con_fecha', {
    p_jornada_id: jor.id, p_closed_at: ATZ(dia, H_CIERRA), p_motivo: MOTIVO_CIERRE })
  if (eCi) abortar('cierre de ' + dia + ': ' + eCi.message,
    'la jornada quedo ABIERTA y solo puede haber una por sede: el dia siguiente va a abortar.')
}

console.log('\n══ ESCRITO ══')
console.log('   jornadas %d · compras %d · ventas %d · gastos %d · abonos %d', nJor, nFac, nVta, nGas, nAbo)
const despues = {}
for (const t of TABLAS) despues[t] = await cuenta(t)
console.log('══ DESPUES ══ ' + Object.entries(despues)
  .map(([k, v]) => k + '=' + v + (v - antes[k] ? ' (+' + (v - antes[k]) + ')' : '')).join(' · '))
console.log('\n(la verificacion va aparte y con OTRO parser: scripts/verificar-historico-v3.py)')
