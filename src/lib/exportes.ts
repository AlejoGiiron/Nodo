import type { Workbook } from 'exceljs'

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
