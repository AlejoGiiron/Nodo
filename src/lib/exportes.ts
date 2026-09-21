import type { Workbook } from 'exceljs'
import type { Balance } from './balance'

// ============================================================================
// LOS DOS LIBROS DE EXCEL QUE SALEN DEL PRODUCTO
//
// 🔴 POR QUÉ VIVEN ACÁ Y NO DENTRO DE LA PANTALLA (deuda 53, auditoría A3 §3.3).
//    Criterio de CLAUDE.md: *todo lo que sale del producto en papel o en archivo
//    tiene que ser aseverable sin un humano mirando*. Mientras la construcción
//    del workbook estaba dentro de `handleExportFinanciero`, lo único que se
//    podía testear era que el botón no explotara — y el contenido del archivo,
//    que es lo que el dueño archiva y mira meses después, no lo verificaba nadie.
//
//    La construcción (`build…Workbook`) se separa de la entrega (la descarga).
//    El mismo movimiento que se hizo con el ticket impreso.
//
// 🔴 Y LO QUE ESTOS LIBROS TIENEN QUE DECIR, que es la deuda 53 entera: **cuál
//    de los tres números es cada columna.** Medido en el lab el 2026-09-02 para
//    un mismo período:
//
//        vendido (sum orders.total) ......... 9.647.600
//        cobrado (sum payments.amount) ...... 6.100.600
//        venta bruta por producto ........... 9.838.000
//
//    Los tres son ciertos y responden preguntas distintas. El defecto no era el
//    cálculo: era que los tres se llamaban "ventas" o "revenue", así que los dos
//    libros del mismo período **no cerraban entre sí y ninguna hoja decía por
//    qué**. Por eso cada libro lleva su hoja `Definiciones`: un archivo que se
//    guarda sin contexto tiene que traer el contexto adentro.
// ============================================================================

/** Fila de `daily_sales_summary` (la vista, tras la deuda 53). */
export interface FilaDiaria {
  day: string | null
  canal: string | null
  order_count: number | null
  sold_total: number | null
  collected_total: number | null
  cash_total: number | null
  card_total: number | null
  transfer_total: number | null
  nequi_total: number | null
}

export interface TotalesFinancieros {
  vendido: number
  cobrado: number
  ordenes: number
  ticketPromedio: number
  efectivo: number
  tarjeta: number
  transferencia: number
  nequi: number
}

export interface FilaProducto {
  product_name: string
  category_name: string
  total_qty: number
  total_revenue: number
}

export interface FilaCategoria {
  category: string
  total_qty: number
  total_revenue: number
}

export interface PeriodoExport {
  from: string
  to: string
}

/**
 * Las definiciones que viajan DENTRO de cada libro. Son la respuesta a "estos
 * dos archivos del mismo período no dan lo mismo": no dan lo mismo porque miden
 * cosas distintas, y ahora lo dicen.
 */
const DEFINICIONES: [string, string][] = [
  ['Vendido',
   'Suma de los totales de las ventas no anuladas, con el descuento ya aplicado. Es lo facturado en el período, se haya cobrado o no.'],
  ['Cobrado',
   'Suma de los pagos recibidos en el período. Una venta a crédito aporta 0 hasta que se abona; un abono de una venta anterior suma acá.'],
  ['Órdenes',
   'Cantidad de ventas no anuladas del período. Incluye las de crédito, estén cobradas o no.'],
  ['Ticket promedio',
   'Vendido dividido por Órdenes. Las dos cifras salen de la misma población: todas las ventas no anuladas.'],
  ['Venta bruta (hoja de productos)',
   'Suma de cantidad × precio unitario de cada línea. NO descuenta los descuentos aplicados a la venta, así que NO coincide con Vendido: sirve para comparar productos entre sí, no para totalizar el período.'],
]

/**
 * Las definiciones del BALANCE. Van aparte de las de arriba porque el balance
 * no tiene período y sus conceptos son otros — y sobre todo porque este archivo
 * es el que ella va a guardar y abrir meses después, sin la app al lado y sin
 * nadie que se lo explique. Todo lo que haga falta para entenderlo va adentro.
 */
const DEFINICIONES_BALANCE: [string, string][] = [
  ['Qué período cubre',
   'NINGUNO: el balance es acumulado desde que arrancó el negocio hasta el momento en que se generó este archivo. No usa el selector de fechas de Reportes, porque «cuánto deberíamos tener» no se puede responder sobre una semana suelta.'],
  ['Con lo que arrancó',
   'La plata que se puso al empezar, cargada a mano en Configuración. Si dice «sin configurar», nadie la cargó todavía y por eso no hay un «debería tener»: no se asume cero, porque un cero afirmaría que se arrancó sin nada.'],
  ['Entró',
   'Todo lo cobrado por ventas (cualquier medio de pago: efectivo, transferencia, tarjeta, Nequi) más los abonos de las ventas a crédito. Una venta fiada aporta 0 hasta que se abona.'],
  ['Salió',
   'La mercancía comprada (por el total de cada factura de compra, menos las devoluciones al proveedor), más los gastos, más los retiros.'],
  ['Debería tener hoy',
   'Con lo que arrancó, más lo que entró, menos lo que salió. Es plata en caja Y en banco junta: la mayoría de los cobros no son en efectivo, así que este número NO es lo que debería haber en el cajón.'],
  ['En mercancía (a costo)',
   'Lo que hay en bodega valorado a lo que costó, no a lo que se vende. Los productos que tienen existencia pero no tienen costo cargado valen 0 acá: por eso el archivo dice cuántos son.'],
  ['Le deben (cartera)',
   'Ventas a crédito todavía no cobradas, menos los abonos que ya se recibieron. Es plata del negocio que está en la calle.'],
  ['Costo de lo vendido',
   'Lo que costó la mercancía que salió vendida, con el costo CONGELADO en el momento de cada venta. No se recalcula con los costos de hoy: si se recalculara, una compra nueva cambiaría la ganancia de meses pasados y este archivo daría distinto cada vez que se abre.'],
  ['Resultado',
   'Lo que dejan las ventas menos los gastos. Es cómo le fue al negocio.'],
  ['Retiros',
   'Plata que el dueño sacó para sí. Baja lo que hay adentro pero NO es una pérdida del negocio: es un reparto. Por eso está fuera del Resultado.'],
  ['Mercancía sin explicar',
   'Lo comprado menos lo que está en bodega menos lo que se vendió. Debería dar cero. Cuando no da, lo más común es que haya productos con existencia y sin costo cargado: como valen 0 en el inventario, la cuenta no cierra por lo que valdrían. Cargarles el costo hace que cierre.'],
  ['Entradas de caja sin clasificar',
   'Plata que entró por caja y no es una venta ni un abono. NO se cuenta como ganancia hasta saber qué es: si fuera plata que el dueño metió, contarla como ganancia haría ver al negocio mejor de lo que está.'],
  ['⚠️ Un límite de la ganancia',
   'Los costos de la mercancía cargada del Excel inicial y los de las compras hechas ya con el sistema no son comparables entre sí: de un proveedor se sabe que el costo traía IVA, de los otros no se sabe. La ganancia es correcta sobre los datos cargados; comparar márgenes entre antes y después de ese corte no es válido.'],
]

function hojaDefiniciones(wb: Workbook, periodo: PeriodoExport): void {
  const ws = wb.addWorksheet('Definiciones')
  ws.columns = [
    { header: 'Concepto', key: 'concepto', width: 32 },
    { header: 'Qué mide', key: 'detalle', width: 110 },
  ]
  ws.addRow({ concepto: 'Período', detalle: `${periodo.from} — ${periodo.to}` })
  for (const [concepto, detalle] of DEFINICIONES) ws.addRow({ concepto, detalle })
}

/** Libro financiero: vendido, cobrado y el detalle por día. */
export function buildFinancieroWorkbook(
  wb: Workbook,
  datos: { periodo: PeriodoExport; totales: TotalesFinancieros; filas: FilaDiaria[] },
): Workbook {
  const { periodo, totales, filas } = datos

  const ws1 = wb.addWorksheet('Resumen')
  ws1.columns = [
    { header: 'Métrica', key: 'metric', width: 34 },
    { header: 'Valor', key: 'value', width: 22 },
  ]
  ws1.addRows([
    { metric: 'Período', value: `${periodo.from} — ${periodo.to}` },
    { metric: 'Vendido (COP)', value: totales.vendido },
    { metric: 'Cobrado (COP)', value: totales.cobrado },
    { metric: 'Órdenes', value: totales.ordenes },
    { metric: 'Ticket promedio (COP)', value: Math.round(totales.ticketPromedio) },
    { metric: 'Cobrado en efectivo (COP)', value: totales.efectivo },
    { metric: 'Cobrado con tarjeta (COP)', value: totales.tarjeta },
    { metric: 'Cobrado por transferencia (COP)', value: totales.transferencia },
    { metric: 'Cobrado por Nequi (COP)', value: totales.nequi },
  ])

  const ws2 = wb.addWorksheet('Detalle por día')
  ws2.columns = [
    { header: 'Fecha', key: 'day', width: 14 },
    { header: 'Canal', key: 'canal', width: 14 },
    { header: 'Órdenes', key: 'order_count', width: 10 },
    { header: 'Vendido', key: 'sold', width: 16 },
    { header: 'Cobrado', key: 'collected', width: 16 },
    { header: 'Cobrado en efectivo', key: 'cash', width: 18 },
    { header: 'Cobrado con tarjeta', key: 'card', width: 18 },
    { header: 'Cobrado por transferencia', key: 'transfer', width: 22 },
    { header: 'Cobrado por Nequi', key: 'nequi', width: 18 },
  ]
  for (const r of filas) {
    ws2.addRow({
      day: r.day, canal: r.canal, order_count: r.order_count,
      sold: r.sold_total, collected: r.collected_total,
      cash: r.cash_total, card: r.card_total,
      transfer: r.transfer_total, nequi: r.nequi_total,
    })
  }

  hojaDefiniciones(wb, periodo)
  return wb
}

/**
 * Libro del BALANCE. Su hoja de definiciones es PROPIA y no la compartida:
 * el balance no tiene período —es acumulado desde que arrancó— y sus conceptos
 * son otros. Reusar `hojaDefiniciones` habría puesto un «Período» que no aplica
 * y habría dejado sin explicar justo lo que hay que explicar.
 */
export function buildBalanceWorkbook(
  wb: Workbook,
  datos: { balance: Balance; sede: string; generado: string },
): Workbook {
  const { balance: b, sede, generado } = datos
  const sinDato = 'sin configurar'

  const ws = wb.addWorksheet('Balance')
  ws.columns = [
    { header: 'Concepto', key: 'concepto', width: 40 },
    { header: 'Valor (COP)', key: 'valor', width: 20 },
  ]
  ws.addRows([
    { concepto: 'Sede', valor: sede },
    { concepto: 'Generado', valor: generado },
    { concepto: 'Acumulado desde', valor: b.desde ?? sinDato },
    { concepto: '', valor: '' },
    { concepto: 'CUÁNTO DEBERÍA TENER', valor: '' },
    { concepto: 'Con lo que arrancó', valor: b.capital ?? sinDato },
    { concepto: 'Entró: cobrado de ventas y abonos', valor: b.entradas },
    { concepto: 'Salió: mercancía, gastos y retiros', valor: -b.salidas },
    { concepto: 'Debería tener hoy (caja y banco)', valor: b.efectivo ?? sinDato },
    { concepto: '', valor: '' },
    { concepto: 'DÓNDE ESTÁ', valor: '' },
    { concepto: 'En caja y banco', valor: b.efectivo ?? sinDato },
    { concepto: 'En mercancía (a costo)', valor: b.inventario },
    { concepto: 'Le deben (cartera)', valor: b.cartera },
    { concepto: 'Total hoy', valor: b.patrimonio ?? sinDato },
    { concepto: 'Contra lo que puso', valor: b.contraCapital ?? sinDato },
    { concepto: '', valor: '' },
    { concepto: 'CÓMO LE FUE AL NEGOCIO', valor: '' },
    { concepto: 'Vendido', valor: b.vendido },
    { concepto: 'Costo de lo vendido', valor: -b.costoVendido },
    { concepto: 'Deja la venta', valor: b.utilidadBruta },
    { concepto: 'Gastos', valor: -b.gastos },
    { concepto: 'Resultado', valor: b.resultado },
    { concepto: 'Retiros (no son pérdida)', valor: b.retiros },
    { concepto: '', valor: '' },
    { concepto: 'LO QUE FALTA EXPLICAR', valor: '' },
    { concepto: 'Mercancía sin explicar', valor: b.descuadreDeMercancia },
    { concepto: 'Entradas de caja sin clasificar', valor: b.entradasSinClasificar },
    { concepto: 'Productos con existencia y sin costo', valor: b.productosSinCosto },
    { concepto: 'Unidades sin costo', valor: b.unidadesSinCosto },
    { concepto: 'Líneas de venta sin costo', valor: b.lineasVentaSinCosto },
  ])

  const ws2 = wb.addWorksheet('Definiciones')
  ws2.columns = [
    { header: 'Concepto', key: 'concepto', width: 38 },
    { header: 'Qué mide', key: 'detalle', width: 110 },
  ]
  for (const [concepto, detalle] of DEFINICIONES_BALANCE) ws2.addRow({ concepto, detalle })
  return wb
}

/** Libro de stock: unidades y venta bruta por producto y por categoría. */
export function buildStockWorkbook(
  wb: Workbook,
  datos: { periodo: PeriodoExport; productos: FilaProducto[]; categorias: FilaCategoria[] },
): Workbook {
  const { periodo, productos, categorias } = datos

  const ws1 = wb.addWorksheet('Detalle de productos')
  ws1.columns = [
    { header: 'Producto', key: 'product_name', width: 32 },
    { header: 'Categoría', key: 'category_name', width: 20 },
    { header: 'Unidades vendidas', key: 'total_qty', width: 18 },
    { header: 'Venta bruta (COP)', key: 'total_revenue', width: 20 },
  ]
  for (const p of productos) ws1.addRow(p)

  const ws2 = wb.addWorksheet('Categorías')
  ws2.columns = [
    { header: 'Categoría', key: 'category', width: 24 },
    { header: 'Unidades vendidas', key: 'total_qty', width: 18 },
    { header: 'Venta bruta (COP)', key: 'total_revenue', width: 20 },
  ]
  for (const c of categorias) ws2.addRow(c)

  hojaDefiniciones(wb, periodo)
  return wb
}
