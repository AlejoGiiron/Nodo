import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import {
  buildFinancieroWorkbook, buildStockWorkbook,
  type FilaDiaria, type TotalesFinancieros,
} from './exportes'

// ============================================================================
// EL CONTENIDO DE LOS DOS EXCEL — deuda 53, auditoría A3 §3.3
//
// 🔴 Lo que este archivo mide, y por qué es lo primero de la 53: **el Excel es
//    lo que se archiva sin contexto.** La pantalla se puede corregir mañana y el
//    usuario vuelve a mirarla; un archivo guardado en diciembre con un rótulo
//    equivocado se lee en marzo tal como salió, y ya nadie recuerda de dónde
//    vino el número.
//
//    Antes de la deuda 53 la hoja Resumen decía **"Ventas totales (COP)"** con
//    `sum(payments.amount)` —cobrado— mientras la hoja de productos decía
//    **"Revenue (COP)"** con `sum(qty × precio)` —venta bruta—. Los dos libros
//    del mismo período no cerraban entre sí y ninguna hoja explicaba por qué.
//
// Medido en el lab el 2026-09-02, mismo período: vendido 9.647.600 · cobrado
// 6.100.600 · venta bruta 9.838.000. Tres números ciertos y distintos.
// ============================================================================

const PERIODO = { from: '2026-09-01', to: '2026-09-02' }

const TOTALES: TotalesFinancieros = {
  vendido: 9_647_600,
  cobrado: 6_100_600,
  ordenes: 691,
  ticketPromedio: 13_962.08,
  efectivo: 4_000_000,
  tarjeta: 600_600,
  transferencia: 1_000_000,
  nequi: 500_000,
}

const FILAS: FilaDiaria[] = [
  {
    day: '2026-09-01', canal: 'mostrador', order_count: 400,
    sold_total: 5_000_000, collected_total: 3_000_000,
    cash_total: 2_000_000, card_total: 400_000, transfer_total: 400_000, nequi_total: 200_000,
  },
  {
    day: '2026-09-02', canal: 'whatsapp', order_count: 291,
    sold_total: 4_647_600, collected_total: 3_100_600,
    cash_total: 2_000_000, card_total: 200_600, transfer_total: 600_000, nequi_total: 300_000,
  },
]

/** Texto plano de una hoja, para aseverar sobre lo que el archivo DICE. */
function textoDe(ws: ExcelJS.Worksheet): string {
  const partes: string[] = []
  ws.eachRow((row) => {
    row.eachCell((cell) => partes.push(String(cell.value ?? '')))
  })
  return partes.join(' | ')
}

function celdas(ws: ExcelJS.Worksheet): string[] {
  const out: string[] = []
  ws.eachRow((row) => row.eachCell((c) => out.push(String(c.value ?? ''))))
  return out
}

describe('Excel financiero — qué dice de sus propios números', () => {
  const wb = buildFinancieroWorkbook(new ExcelJS.Workbook(), {
    periodo: PERIODO, totales: TOTALES, filas: FILAS,
  })
  const resumen = wb.getWorksheet('Resumen')!
  const detalle = wb.getWorksheet('Detalle por día')!

  it('NINGUNA columna se llama "ventas" ni "revenue" a secas', () => {
    // El corazón de la 53: el rótulo tiene que decir CUÁL de los tres mide.
    const todo = [textoDe(resumen), textoDe(detalle)].join(' | ')
    expect(todo, 'un rótulo "Ventas totales" no dice si es vendido o cobrado').not.toMatch(/ventas totales/i)
    expect(todo, '"Revenue" no dice nada, y encima está en inglés').not.toMatch(/revenue/i)
  })

  it('distingue VENDIDO de COBRADO, y los dos están', () => {
    const c = celdas(resumen)
    expect(c).toContain('Vendido (COP)')
    expect(c).toContain('Cobrado (COP)')
    expect(c).toContain(String(TOTALES.vendido))
    expect(c).toContain(String(TOTALES.cobrado))
    // Y no son el mismo número: si alguien vuelve a alimentar los dos con la
    // misma fuente, esto se pone rojo.
    expect(TOTALES.vendido).not.toBe(TOTALES.cobrado)
  })

  it('el ticket promedio sale de la MISMA población: vendido / órdenes', () => {
    const c = celdas(resumen)
    expect(c).toContain(String(Math.round(TOTALES.vendido / TOTALES.ordenes)))
    expect(c).toContain('Ticket promedio (COP)')
  })

  it('los métodos de pago dicen que son COBRADO, no ventas', () => {
    const t = textoDe(resumen)
    expect(t).toMatch(/Cobrado en efectivo/)
    expect(t).toMatch(/Cobrado con tarjeta/)
    expect(t).toMatch(/Cobrado por transferencia/)
    expect(t).toMatch(/Cobrado por Nequi/)
  })

  it('el detalle por día trae vendido Y cobrado por fila', () => {
    const c = celdas(detalle)
    expect(c).toContain('Vendido')
    expect(c).toContain('Cobrado')
    expect(c).toContain(String(FILAS[0].sold_total))
    expect(c).toContain(String(FILAS[0].collected_total))
    // Control: la fila no perdió su identidad.
    expect(c).toContain('2026-09-01')
    expect(c).toContain('mostrador')
  })

  it('lleva sus DEFINICIONES adentro: el archivo se guarda sin contexto', () => {
    const def = wb.getWorksheet('Definiciones')
    expect(def, 'sin esta hoja, dos libros que no cierran no tienen explicación').toBeTruthy()
    const t = textoDe(def!)
    expect(t).toMatch(/se haya cobrado o no/i)
    expect(t).toMatch(/una venta a crédito aporta 0/i)
    expect(t).toMatch(/misma población/i)
    expect(t).toContain(PERIODO.from)
  })
})

describe('Excel de stock — la venta bruta dice que no totaliza el período', () => {
  const wb = buildStockWorkbook(new ExcelJS.Workbook(), {
    periodo: PERIODO,
    productos: [{ product_name: 'Arroz 500g', category_name: 'Granos', total_qty: 120, total_revenue: 420_000 }],
    categorias: [{ category: 'Granos', total_qty: 120, total_revenue: 420_000 }],
  })

  it('no dice "revenue" y sí dice venta bruta', () => {
    const productos = wb.getWorksheet('Detalle de productos')!
    const cats = wb.getWorksheet('Categorías')!
    const todo = [textoDe(productos), textoDe(cats)].join(' | ')
    expect(todo).not.toMatch(/revenue/i)
    expect(todo).toMatch(/venta bruta/i)
    expect(celdas(productos)).toContain('Arroz 500g')
  })

  it('explica por qué NO coincide con el vendido del otro libro', () => {
    // 🔴 Esta es la aserción que cierra la 53: el usuario que abre los dos
    //    archivos del mismo período y ve dos totales distintos tiene, en el
    //    propio archivo, la razón.
    const t = textoDe(wb.getWorksheet('Definiciones')!)
    expect(t).toMatch(/NO coincide con Vendido/i)
    expect(t).toMatch(/descuento/i)
  })
})
