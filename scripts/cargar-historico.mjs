#!/usr/bin/env node
/**
 * RECONSTRUCCIÓN DEL HISTÓRICO DE UNA SEDE, desde el archivo del cliente.
 *
 * Uso:
 *   export ADMIN_PASSWORD='…'          # ⚠️ nunca en un archivo
 *   node scripts/cargar-historico.mjs \
 *     --sede-id <uuid> --email <admin> --org-esperada "Muscle Pro" \
 *     --archivo "docs/Control Mp 2.xlsx" [--aplicar]
 *
 *   Sin `--aplicar` NO ESCRIBE: arma el plan entero, lo imprime y cuenta.
 *
 * Plan y decisiones: `docs/historico-muscle-pro-plan.md`.
 * Mediciones que lo sostienen: `docs/historico-muscle-pro-enumeracion.md`.
 *
 * ── LAS CUATRO DE R0 ───────────────────────────────────────────────────────
 * 1. CLASE — inserción masiva POR-ID y FAIL-CLOSED, por el camino del producto
 *    (RPC + policies), no por SQL directo.
 * 2. PRECEDENTE — `cargar-catalogo.mjs` y `actualizar-precios.mjs`: guard de
 *    sede, conteo previo, y verificación releyendo DE LA BASE.
 * 3. MODO DE FALLO — 🔴 **ninguna de estas tablas tiene policy de DELETE**: una
 *    carga equivocada NO se puede borrar, se convive con ella. Por eso el
 *    conteo previo aborta ante cualquier estado inesperado.
 * 4. OBJETIVO — sede por UUID **y** verificada contra la sesión y contra el
 *    nombre de organización esperado; productos por nombre NORMALIZADO igual
 *    que el índice único; nada se resuelve por posición.
 *
 * ── POR QUÉ NO ES SQL DIRECTO ──────────────────────────────────────────────
 *    `register_purchase` calcula el promedio ponderado móvil, escribe el
 *    movimiento de stock y el de caja, y valida jornada y permiso. Replicarlo
 *    con `insert` sería reimplementar la lógica de negocio sin sus tests.
 *    `orders`, `customers`, `suppliers` y `cash_movements` SÍ van por insert
 *    directo, porque así los escribe la app: tienen policy y no hay RPC.
 *
 * ── LO QUE ESTE SCRIPT NO PUEDE HACER, y se dice ───────────────────────────
 *    Las líneas, los movimientos de stock, los pagos y los abonos quedan
 *    fechados HOY: sus RPC no aceptan fecha. Sólo la ORDEN lleva su fecha real.
 */

import { readFileSync, existsSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import ExcelJS from 'exceljs'

// ════════════════════════════════════════════════════════════════════════════
// Argumentos y entorno
// ════════════════════════════════════════════════════════════════════════════
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
const ARCHIVO = args.get('archivo') || 'docs/Control Mp 2.xlsx'
const APLICAR = banderas.has('aplicar')
const PLAZO_DIAS = Number(args.get('plazo') ?? 15)

const COP = (n) => new Intl.NumberFormat('es-CO').format(Math.round(n))
const salir = (c) => { console.log(`\nhistorico_exit=${c}`); process.exit(c) }
const abortar = (m, q) => { console.error(`\n🔴 PARA: ${m}`); if (q) console.error(`QUE HACER: ${q}`); salir(1) }

const faltan = []
if (!URL_BASE) faltan.push('SUPABASE_URL o VITE_NODO_SUPABASE_URL en .env')
if (!ANON) faltan.push('SUPABASE_ANON_KEY o VITE_NODO_SUPABASE_ANON_KEY en .env')
if (!PASSWORD) faltan.push('ADMIN_PASSWORD (variable de entorno)')
if (!SEDE_ID) faltan.push('--sede-id')
if (!EMAIL) faltan.push('--email')
if (!ORG_ESPERADA) faltan.push('--org-esperada (el nombre EXACTO de la organización; es un guard)')
if (faltan.length) { console.error('Faltan datos:\n  ' + faltan.join('\n  ')); process.exit(2) }

// ════════════════════════════════════════════════════════════════════════════
// § 0 · Leer el archivo y ARMAR EL PLAN — sin tocar la base
// ════════════════════════════════════════════════════════════════════════════
function crudo(cell) {
  let v = cell.value
  if (v && typeof v === 'object') {
    if ('formula' in v || 'sharedFormula' in v) v = v.result
    else if ('richText' in v) v = v.richText.map((x) => x.text).join('')
  }
  return v
}
const vacio = (v) => v === null || v === undefined || String(v).trim() === ''
const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().toUpperCase()
const N = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const aFecha = (v) => (v instanceof Date && Number.isFinite(v.getTime())
  ? new Date(Date.UTC(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate())) : null)
const iso = (d) => d.toISOString().slice(0, 10)
// Horas fijas en UTC para que todo caiga en el MISMO día de Bogotá (R7):
const AT = (f, hhmmss) => `${f}T${hhmmss}Z`
const H_ABRE = '13:00:00'   // 08:00 Bogotá
const H_OPERA = '17:00:00'  // 12:00 Bogotá
const H_CIERRA = '23:59:00' // 18:59 Bogotá

if (!existsSync(ARCHIVO)) abortar(`no existe ${ARCHIVO}`)
const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(ARCHIVO)
const hoja = (n) => { const w = wb.worksheets.find((x) => x.name === n); if (!w) abortar(`el archivo no tiene la hoja «${n}»`); return w }
function indexar(ws) {
  const m = new Map()
  for (let i = 1; i <= ws.columnCount; i++) { const v = crudo(ws.getRow(1).getCell(i)); if (!vacio(v)) m.set(norm(v), i) }
  return m
}
const col = (m, n) => { const i = m.get(norm(n)); if (!i) abortar(`falta la columna «${n}»`); return i }

// ── ventas ────────────────────────────────────────────────────────────────
const wsV = hoja('Ventas Diarias'), cV = indexar(wsV)
const lineasVenta = []
for (let r = 2; r <= wsV.rowCount; r++) {
  const row = wsV.getRow(r)
  const f = aFecha(crudo(row.getCell(col(cV, 'Fecha'))))
  const p = crudo(row.getCell(col(cV, 'Producto')))
  const q = N(crudo(row.getCell(col(cV, 'Cantidad Vendida'))))
  if (!f || vacio(p) || q === null) continue
  lineasVenta.push({
    fila: r, fecha: iso(f), producto: String(p).trim(), qty: q,
    precio: N(crudo(row.getCell(col(cV, 'Precio real de venta')))),
    total: N(crudo(row.getCell(col(cV, 'Venta Total')))),
    cliente: String(crudo(row.getCell(col(cV, 'Cliente'))) ?? '').trim(),
    tipo: norm(crudo(row.getCell(col(cV, 'TIPO DE PAGO')))),
    metodo: norm(crudo(row.getCell(col(cV, 'METODO DE PAGO')))),
  })
}

// ── tickets: (fecha, cliente, TIPO DE PAGO) — ver enumeración §0 ──────────
const tickets = new Map()
for (const l of lineasVenta) {
  const k = `${l.fecha}|${norm(l.cliente)}|${l.tipo}`
  if (!tickets.has(k)) tickets.set(k, { clave: k, fecha: l.fecha, cliente: l.cliente, tipo: l.tipo, lineas: [], metodos: new Set() })
  const t = tickets.get(k); t.lineas.push(l); t.metodos.add(l.metodo)
}
const TICKETS = [...tickets.values()].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.clave.localeCompare(b.clave))
for (const t of TICKETS) {
  t.esFiado = /CREDITO/.test(t.tipo)
  t.total = t.lineas.reduce((s, l) => s + (l.total ?? 0), 0)
  const calc = t.lineas.reduce((s, l) => s + (l.precio ?? 0) * l.qty, 0)
  if (Math.abs(calc - t.total) > 0.5) {
    abortar(`el ticket ${t.fecha} no cuadra: Σ precio×qty = ${calc} y Σ Venta Total = ${t.total}`,
      'el archivo se contradice consigo mismo en esa fila. No se escribió nada.')
  }
}
// Método de pago: allowlist POSITIVA. Lo que no esté acá aborta (R2).
const METODO = { TRANSFERENCIA: 'transfer', EFECTIVO: 'cash', NEQUI: 'nequi', TARJETA: 'card' }
for (const t of TICKETS) {
  if (t.esFiado) continue
  const ms = [...t.metodos].filter((m) => m && m !== 'NO APLICA')
  const mapeados = [...new Set(ms.map((m) => METODO[m]))]
  if (mapeados.length !== 1 || !mapeados[0]) {
    abortar(`el ticket de contado ${t.fecha} tiene métodos ${JSON.stringify([...t.metodos])}, que no mapean a UNO solo`,
      'la allowlist de métodos es TRANSFERENCIA/EFECTIVO/NEQUI/TARJETA. No se escribió nada.')
  }
  t.metodoPago = mapeados[0]
}

// ── compras: (fecha, proveedor) ───────────────────────────────────────────
const wsC = hoja('Compra de inventario'), cC = indexar(wsC)
const lineasCompra = []
for (let r = 2; r <= wsC.rowCount; r++) {
  const row = wsC.getRow(r)
  const f = aFecha(crudo(row.getCell(col(cC, 'Fecha'))))
  const p = crudo(row.getCell(col(cC, 'Producto')))
  const u = N(crudo(row.getCell(col(cC, 'Unidades'))))
  const cu = N(crudo(row.getCell(col(cC, 'Costo Unitario'))))
  const prov = String(crudo(row.getCell(col(cC, 'Proveedor'))) ?? '').trim()
  if (!f || vacio(p) || u === null || cu === null) continue
  lineasCompra.push({ fila: r, fecha: iso(f), producto: String(p).trim(), qty: u, costo: cu, proveedor: prov })
}
const facturas = new Map()
for (const l of lineasCompra) {
  const k = `${l.fecha}|${norm(l.proveedor)}`
  if (!facturas.has(k)) facturas.set(k, { clave: k, fecha: l.fecha, proveedor: l.proveedor, items: new Map() })
  const f = facturas.get(k), pk = norm(l.producto)
  if (f.items.has(pk)) {
    // Producto repetido en la MISMA factura: se suma SÓLO si el costo es igual.
    const prev = f.items.get(pk)
    if (Math.abs(prev.costo - l.costo) > 0.001) {
      abortar(`«${l.producto}» aparece dos veces en la factura ${k} con costos distintos (${prev.costo} y ${l.costo})`,
        'sumarlos perdería el costo de una de las dos líneas. Hay que decidir a mano.')
    }
    prev.qty += l.qty
  } else f.items.set(pk, { producto: l.producto, qty: l.qty, costo: l.costo })
}
const FACTURAS = [...facturas.values()].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.clave.localeCompare(b.clave))

// ── gastos: se DESCARTA «Compra Gmn» (es la factura GMN) ─────────────────
const wsG = hoja('Gasto')
const DESCARTAR_GASTO = /^compra\s+gmn\s*$/i
const SUBCATEGORIA = { 'camisas': 'uniformes' }   // sólo lo que el cliente confirmó
const GASTOS = []
for (let r = 2; r <= wsG.rowCount; r++) {
  const row = wsG.getRow(r)
  const f = aFecha(crudo(row.getCell(1)))
  const concepto = crudo(row.getCell(2))
  const valor = N(crudo(row.getCell(3)))
  if (!f || vacio(concepto) || valor === null) continue
  const txt = String(concepto).trim()
  if (DESCARTAR_GASTO.test(txt)) continue     // decisión del cliente: es la compra
  GASTOS.push({ fecha: iso(f), concepto: txt, valor, subcategoria: SUBCATEGORIA[txt.toLowerCase()] ?? null })
}

// ── abonos: la línea con «ABONO …» en el método ──────────────────────────
const ABONOS = []
for (const t of TICKETS) {
  for (const l of t.lineas) {
    const m = /ABONO\s+([\d.]+)\s*MIL/i.exec(l.metodo)
    if (!m) continue
    ABONOS.push({ ticket: t.clave, fecha: t.fecha, monto: Number(m[1].replace(/\./g, '')) * 1000, metodo: 'transfer' })
  }
}

// ── clientes y proveedores ────────────────────────────────────────────────
const CLIENTES = [...new Set(lineasVenta.map((l) => l.cliente).filter(Boolean))]
const PROVEEDORES = [...new Set(lineasCompra.map((l) => l.proveedor).filter(Boolean))]
const DIAS = [...new Set([...TICKETS.map((t) => t.fecha), ...FACTURAS.map((f) => f.fecha), ...GASTOS.map((g) => g.fecha)])].sort()

// ── el plan, impreso ──────────────────────────────────────────────────────
const idCli = new Map(CLIENTES.map((c, i) => [c, 'C' + String(i + 1).padStart(2, '0')]))
console.log('PLAN LEÍDO de %s', ARCHIVO)
console.log('  clientes: %d   proveedores: %d   días: %d (%s → %s)',
  CLIENTES.length, PROVEEDORES.length, DIAS.length, DIAS[0], DIAS[DIAS.length - 1])
console.log('  facturas de compra: %d   (%d líneas de archivo)', FACTURAS.length, lineasCompra.length)
console.log('  tickets de venta:   %d   (%d líneas de archivo) · a fiado: %d',
  TICKETS.length, lineasVenta.length, TICKETS.filter((t) => t.esFiado).length)
console.log('  gastos: %d   abonos: %d   plazo de crédito: %d días', GASTOS.length, ABONOS.length, PLAZO_DIAS)
const SUM_VENTAS = TICKETS.reduce((s, t) => s + t.total, 0)
const SUM_FIADO = TICKETS.filter((t) => t.esFiado).reduce((s, t) => s + t.total, 0)
const SUM_COMPRAS = FACTURAS.reduce((s, f) => s + [...f.items.values()].reduce((a, i) => a + i.qty * i.costo, 0), 0)
console.log('\n  CONTROLES (del archivo, antes de tocar nada):')
console.log('    Σ ventas:        %s', COP(SUM_VENTAS))
console.log('    Σ a fiado:       %s', COP(SUM_FIADO))
console.log('    Σ cobrado:       %s', COP(SUM_VENTAS - SUM_FIADO))
console.log('    Σ compras:       %s', COP(SUM_COMPRAS))
console.log('    Σ gastos:        %s  (sin «Compra Gmn»)', COP(GASTOS.reduce((s, g) => s + g.valor, 0)))
console.log('    Σ abonos:        %s', COP(ABONOS.reduce((s, a) => s + a.monto, 0)))
console.log('    saldo cartera:   %s', COP(SUM_FIADO - ABONOS.reduce((s, a) => s + a.monto, 0)))

console.log('\n  POR DÍA:')
for (const d of DIAS) {
  const nf = FACTURAS.filter((f) => f.fecha === d).length
  const nt = TICKETS.filter((t) => t.fecha === d).length
  const ng = GASTOS.filter((g) => g.fecha === d).length
  const na = ABONOS.filter((a) => a.fecha === d).length
  console.log('    %s · %d factura(s) · %d ticket(s) · %d gasto(s) · %d abono(s)', d, nf, nt, ng, na)
}
console.log('\n  modo: %s', APLICAR ? '🔴 --aplicar: ESCRIBE' : 'sólo lectura (sin --aplicar no se escribe nada)')

// ════════════════════════════════════════════════════════════════════════════
// § 1 · Sesión y GUARDS
// ════════════════════════════════════════════════════════════════════════════
const db = createClient(URL_BASE, ANON, { auth: { persistSession: false } })
const { data: ses, error: eL } = await db.auth.signInWithPassword({ email: EMAIL, password: PASSWORD })
if (eL) abortar(`no se pudo entrar como ${EMAIL}: ${eL.message}`, 'no se escribió nada.')
const { data: perfil } = await db.from('profiles').select('id, full_name, role, sede_id, organization_id').eq('id', ses.user.id).single()
if (!perfil) abortar('la cuenta entró pero no tiene perfil')
const { data: org } = await db.from('organizations').select('name').eq('id', perfil.organization_id).single()
const { data: sede } = await db.from('sedes').select('name').eq('id', perfil.sede_id).single()
console.log('\nSESIÓN: %s (%s) · org «%s» · sede «%s»', perfil.full_name, perfil.role, org?.name, sede?.name)

if (perfil.sede_id !== SEDE_ID) abortar(`--sede-id no es la sede de la cuenta (${perfil.sede_id})`, 'no se escribió nada.')
if (org?.name !== ORG_ESPERADA) {
  abortar(`la organización es «${org?.name}» y --org-esperada dice «${ORG_ESPERADA}»`,
    'este guard existe para que un histórico no entre en el tenant equivocado. No se escribió nada.')
}
console.log('  ✅ sede y organización coinciden con lo declarado')

// ── catálogo: todo producto del archivo tiene que existir YA ──────────────
const { data: productos } = await db.from('products').select('id, name, stock_qty, cost_price').eq('sede_id', SEDE_ID).eq('is_active', true)
const porProducto = new Map((productos ?? []).map((p) => [norm(p.name), p]))
const faltantes = new Set()
for (const l of [...lineasVenta, ...lineasCompra]) if (!porProducto.has(norm(l.producto))) faltantes.add(l.producto)
if (faltantes.size) {
  for (const f of faltantes) console.error('    🔴 no está en el catálogo: %s', f)
  abortar(`${faltantes.size} producto(s) del archivo no existen en el catálogo de la sede`,
    'el catálogo se carga primero (cargar-catalogo.mjs). No se escribió nada.')
}
console.log('  ✅ los %d productos del archivo existen en el catálogo', new Set([...lineasVenta, ...lineasCompra].map((l) => norm(l.producto))).size)

// ── GUARD de estado previo: la sede tiene que estar SIN operación ─────────
const cuenta = async (tabla) => {
  const { count, error } = await db.from(tabla).select('*', { count: 'exact', head: true }).eq('sede_id', SEDE_ID)
  if (error) abortar(`no se pudo contar ${tabla}: ${error.message}`)
  if (count === null) abortar(`el conteo de ${tabla} vino null — la tabla puede no existir`, 'null NO es cero.')
  return count
}
const antes = {}
for (const t of ['orders', 'purchase_invoices', 'cash_movements', 'jornadas', 'customers', 'suppliers', 'payments', 'debt_payments']) antes[t] = await cuenta(t)
console.log('\nANTES DE ESCRIBIR — filas contadas en la sede:')
for (const [t, n] of Object.entries(antes)) console.log('  ' + t.padEnd(20) + ' ' + n)
const sucias = ['orders', 'purchase_invoices', 'payments', 'debt_payments'].filter((t) => antes[t] > 0)
if (sucias.length) {
  abortar(`la sede ya tiene operación: ${sucias.map((t) => `${t}=${antes[t]}`).join(', ')}`,
    'este script es para una sede SIN historial. Reconstruir encima duplicaría, y NO HAY POLICY DE DELETE para deshacerlo.')
}
console.log('  ✅ la sede no tiene operación previa')

if (!APLICAR) { console.log('\nSÓLO LECTURA: no se escribió nada. Para aplicar, --aplicar.'); salir(0) }

// ════════════════════════════════════════════════════════════════════════════
// § 2 · ESCRITURA
// ════════════════════════════════════════════════════════════════════════════
const MARCA = 'HIST'   // marca de origen, para poder separar después
const idPorCliente = new Map(), idPorProveedor = new Map()

console.log('\n── CLIENTES ────────────────────────────────────────────────')
for (const nombre of CLIENTES) {
  const { data, error } = await db.from('customers')
    .insert({ sede_id: SEDE_ID, name: nombre, notes: `${MARCA}: alta por reconstrucción del histórico` })
    .select('id').single()
  if (error) abortar(`no se pudo crear el cliente ${idCli.get(nombre)}: ${error.message}`)
  idPorCliente.set(nombre, data.id)
}
console.log('  %d creados (los nombres no se imprimen: son PII)', idPorCliente.size)

console.log('\n── PROVEEDORES ─────────────────────────────────────────────')
for (const nombre of PROVEEDORES) {
  const { data, error } = await db.from('suppliers')
    .insert({ sede_id: SEDE_ID, name: nombre, notes: `${MARCA}: alta por reconstrucción del histórico` })
    .select('id').single()
  if (error) abortar(`no se pudo crear el proveedor «${nombre}»: ${error.message}`)
  idPorProveedor.set(norm(nombre), data.id)
  console.log('  + %s', nombre)
}

// ── el bucle de días ─────────────────────────────────────────────────────
let nFacturas = 0, nTickets = 0, nGastos = 0, nAbonos = 0
const ordenPorTicket = new Map()

for (const dia of DIAS) {
  console.log('\n══════ %s ══════', dia)

  // 1 · abrir jornada con fecha del día
  const { data: jor, error: eJ } = await db.from('jornadas')
    .insert({ sede_id: SEDE_ID, opened_by: perfil.id, opening_amount: 0, opened_at: AT(dia, H_ABRE) })
    .select('id, opened_at').single()
  if (eJ) abortar(`no se pudo abrir la jornada de ${dia}: ${eJ.message}`,
    'si quedó una jornada abierta de un día anterior, ciérrala antes de reintentar.')
  console.log('  jornada abierta %s', jor.opened_at)

  // 2 · compras del día (ANTES que las ventas: el costo se congela al vender)
  for (const f of FACTURAS.filter((x) => x.fecha === dia)) {
    const items = [...f.items.values()].map((i) => ({
      product_id: porProducto.get(norm(i.producto)).id,
      qty: i.qty, unit_cost: i.costo,
      purchase_unit: 'unidad', units_per_purchase_unit: 1,
    }))
    const { error } = await db.rpc('register_purchase', {
      p_invoice: {
        supplier_id: idPorProveedor.get(norm(f.proveedor)),
        invoice_number: null,
        notes: `${MARCA} ${f.fecha} ${f.proveedor}`,
        document_date: f.fecha,
      },
      p_items: items,
    })
    if (error) abortar(`compra ${f.clave}: ${error.message}`, `van ${nFacturas} facturas escritas. NO se pueden borrar.`)
    nFacturas++
    console.log('  compra · %-12s %2d ítem(s)  %s', f.proveedor, items.length,
      COP([...f.items.values()].reduce((s, i) => s + i.qty * i.costo, 0)))
  }

  // 3 · ventas del día
  for (const t of TICKETS.filter((x) => x.fecha === dia)) {
    const base = {
      sede_id: SEDE_ID, created_by: perfil.id, canal: 'mostrador', status: 'delivered',
      created_at: AT(dia, H_OPERA),
      notes: `${MARCA} ${t.fecha} ${idCli.get(t.cliente)} ${t.tipo}`,
    }
    const extra = t.esFiado
      ? { payment_status: 'pending', customer_id: idPorCliente.get(t.cliente), customer_name: t.cliente, plazo_dias: PLAZO_DIAS }
      : { customer_id: idPorCliente.get(t.cliente) ?? null, customer_name: t.cliente || null }
    const { data: orden, error: eO } = await db.from('orders').insert({ ...base, ...extra }).select('id').single()
    if (eO) abortar(`orden ${t.clave}: ${eO.message}`, `van ${nTickets} órdenes escritas. NO se pueden borrar.`)

    const items = t.lineas.map((l) => ({
      product_id: porProducto.get(norm(l.producto)).id,
      qty: l.qty, unit_price: l.precio, notes: null, extras: [],
    }))
    const { error: eI } = await db.rpc('add_order_items_with_extras', { p_order_id: orden.id, p_items: items })
    if (eI) abortar(`ítems de ${t.clave}: ${eI.message}`, 'la orden quedó creada y SIN líneas. Hay que mirarla a mano.')

    if (!t.esFiado) {
      const { error: eP } = await db.rpc('register_sale_payment', {
        p_order_id: orden.id, p_payments: [{ method: t.metodoPago, amount: t.total }],
      })
      if (eP) abortar(`pago de ${t.clave}: ${eP.message}`, 'la orden quedó con líneas y SIN pago.')
    }
    const { error: eN } = await db.rpc('next_order_number', { p_sede_id: SEDE_ID })
    if (eN) console.error('    ⚠️ numeración: %s', eN.message)
    ordenPorTicket.set(t.clave, orden.id)
    nTickets++
    console.log('  venta  · %s %-9s %2d línea(s) %10s %s',
      idCli.get(t.cliente), t.esFiado ? 'FIADO' : t.metodoPago, t.lineas.length, COP(t.total),
      t.esFiado ? `(plazo ${PLAZO_DIAS}d)` : '')
  }

  // 4 · gastos del día
  for (const g of GASTOS.filter((x) => x.fecha === dia)) {
    const { error } = await db.from('cash_movements').insert({
      jornada_id: jor.id, sede_id: SEDE_ID, type: 'out', categoria: 'gasto',
      subcategoria: g.subcategoria, amount: g.valor, reason: g.concepto,
      document_date: g.fecha, created_by: perfil.id,
    })
    if (error) abortar(`gasto «${g.concepto}» de ${dia}: ${error.message}`)
    nGastos++
    console.log('  gasto  · %-30s %10s %s', g.concepto.slice(0, 30), COP(g.valor), g.subcategoria ?? '')
  }

  // 5 · abonos del día
  for (const a of ABONOS.filter((x) => x.fecha === dia)) {
    const orderId = ordenPorTicket.get(a.ticket)
    if (!orderId) abortar(`el abono de ${dia} no encuentra su orden (${a.ticket})`)
    const { error } = await db.rpc('register_debt_payment', {
      p_order_id: orderId, p_amount: a.monto, p_payment_method: a.metodo,
    })
    if (error) abortar(`abono de ${dia}: ${error.message}`)
    nAbonos++
    console.log('  abono  · %s por %s', a.metodo, COP(a.monto))
  }

  // 6 · cerrar la jornada. 🔴 SIN arqueo: no hubo conteo, y un cero sería un
  //     arqueo falso persistido (el defecto que la auditoría A1 documentó).
  const { error: eC } = await db.from('jornadas')
    .update({ closed_at: AT(dia, H_CIERRA), closed_by: perfil.id }).eq('id', jor.id)
  if (eC) abortar(`no se pudo cerrar la jornada de ${dia}: ${eC.message}`)
  // 7 · corregir la fecha de cierre — el trigger la forzó a hoy (deuda 97)
  const { data: jc, error: eF } = await db.from('jornadas')
    .update({ closed_at: AT(dia, H_CIERRA) }).eq('id', jor.id).select('closed_at').single()
  if (eF) abortar(`no se pudo corregir el cierre de ${dia}: ${eF.message}`)
  const ok = jc.closed_at.slice(0, 10) === dia
  console.log('  jornada cerrada %s %s', jc.closed_at, ok ? '✅' : '🔴 la fecha NO quedó en el día')
  if (!ok) abortar('el cierre no quedó con la fecha del día', 'la deuda 97 puede haberse arreglado: sin ese camino, el histórico no puede fechar jornadas.')
}

console.log('\nESCRITO: %d facturas · %d tickets · %d gastos · %d abonos · %d jornadas',
  nFacturas, nTickets, nGastos, nAbonos, DIAS.length)

// ════════════════════════════════════════════════════════════════════════════
// § 3 · VERIFICACIÓN — leyendo DE LA BASE
// ════════════════════════════════════════════════════════════════════════════
console.log('\n── VERIFICACIÓN · leída de la base ─────────────────────────')
const problemas = []
const chequear = (etq, real, esperado) => {
  const ok = Math.abs(real - esperado) < 0.5
  console.log('  %-34s %14s   esperado %14s  %s', etq, COP(real), COP(esperado), ok ? '✅' : '🔴')
  if (!ok) problemas.push(`${etq}: base ${real}, esperado ${esperado}`)
}
const { data: ords } = await db.from('orders').select('id, total, payment_status, created_at').eq('sede_id', SEDE_ID).is('cancelled_at', null)
chequear('órdenes no anuladas', (ords ?? []).length, TICKETS.length)
chequear('Σ orders.total', (ords ?? []).reduce((s, o) => s + Number(o.total), 0), SUM_VENTAS)
chequear('órdenes a fiado pendientes', (ords ?? []).filter((o) => o.payment_status !== 'paid').length, TICKETS.filter((t) => t.esFiado).length)
const { data: pays } = await db.from('payments').select('amount').eq('sede_id', SEDE_ID)
chequear('Σ payments.amount', (pays ?? []).reduce((s, p) => s + Number(p.amount), 0), SUM_VENTAS - SUM_FIADO)
const { data: invs } = await db.from('purchase_invoices').select('id, total').eq('sede_id', SEDE_ID)
chequear('facturas de compra', (invs ?? []).length, FACTURAS.length)
chequear('Σ compras', (invs ?? []).reduce((s, i) => s + Number(i.total), 0), SUM_COMPRAS)
const { data: movs } = await db.from('cash_movements').select('amount, categoria').eq('sede_id', SEDE_ID).eq('categoria', 'gasto')
chequear('movimientos de gasto', (movs ?? []).length, GASTOS.length)
const { data: abs } = await db.from('debt_payments').select('amount').eq('sede_id', SEDE_ID)
chequear('Σ abonos', (abs ?? []).reduce((s, a) => s + Number(a.amount), 0), ABONOS.reduce((s, a) => s + a.monto, 0))

// fechas: ninguna orden puede haber quedado con la fecha de hoy
const hoy = new Date().toISOString().slice(0, 10)
const conFechaDeHoy = (ords ?? []).filter((o) => o.created_at.slice(0, 10) === hoy && !DIAS.includes(hoy)).length
console.log('  %-34s %14d   esperado %14d  %s', 'órdenes fechadas HOY por error', conFechaDeHoy, 0, conFechaDeHoy === 0 ? '✅' : '🔴')
if (conFechaDeHoy) problemas.push(`${conFechaDeHoy} órdenes quedaron fechadas hoy`)

// 🔴 EL CONTROL CRUZADO: el conteo FÍSICO de las galletas, que el cliente hizo
//    contando cajas. Viene de otro camino que nuestras sumas.
const FISICO = {
  'GALLETA MANI MUTANTES': 0, 'GALLETA NUTELLA MUTANTES': 20, 'GALLETA OREO MUTANTES': 7,
  'GALLETA ARANDANOS CHOCOLATE': 2, 'GALLETA ALMENDRA CHOCOLATE': 0,
}
console.log('\n  🔴 CONTROL CRUZADO · stock contra el conteo FÍSICO del cliente:')
const { data: prodFin } = await db.from('products').select('name, stock_qty, cost_price').eq('sede_id', SEDE_ID).eq('is_active', true)
for (const [nombre, esperado] of Object.entries(FISICO)) {
  const p = (prodFin ?? []).find((x) => norm(x.name) === norm(nombre))
  const real = p ? Number(p.stock_qty) : null
  const ok = real === esperado
  console.log('    %-30s %5s   esperado %3d  %s', nombre, real ?? 'FALTA', esperado, ok ? '✅' : '🔴')
  if (!ok) problemas.push(`stock de ${nombre}: ${real}, el conteo físico dice ${esperado}`)
}
const sinCosto = (prodFin ?? []).filter((p) => p.cost_price === null && Number(p.stock_qty) !== 0 || (p.cost_price === null))
console.log('\n  productos sin costo: %d  (esperado: los que nunca se compraron)', sinCosto.length)
for (const p of sinCosto) console.log('    · %s', p.name)

if (problemas.length) {
  console.error('\n🔴 LA CARGA NO CIERRA — %d problema(s):', problemas.length)
  for (const p of problemas) console.error('   · %s', p)
  console.error('\n⚠️ NO HAY POLICY DE DELETE: lo escrito quedó. Hay que mirarlo antes de reintentar.')
  salir(1)
}
console.log('\n✅ EL HISTÓRICO CIERRA con el archivo, y el stock cierra con el conteo físico del cliente.')
salir(0)
