import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import {
  buildFinancieroWorkbook, buildStockWorkbook, buildBalanceWorkbook,
  type FilaDiaria, type TotalesFinancieros,
} from './exportes'
import { derivarBalance } from './balance'

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

// ============================================================================
// EL EXCEL DEL BALANCE
//
// 🔴 Es el artefacto que más pesa de los tres: afirma CUÁNTA PLATA debería tener
//    alguien, y se guarda. Si dentro de cuatro meses ella lo abre y ve «−3.109.325»
//    sin nada que lo explique, o cree que el negocio se robó esa plata, o cree
//    que el archivo está mal. Las dos lecturas son evitables y las evita la hoja
//    de definiciones, no la pantalla que lo generó.
// ============================================================================
describe('Excel del balance — se entiende sin la app al lado', () => {
  const BAL = derivarBalance({
    sede_nombre: 'Muscle Pro',
    capital_inicial: 15_000_000,
    capital_inicial_desde: '2026-08-31',
    cobrado_ventas: 10_117_600,
    abonos: 1_810_600,
    otras_entradas: 0,
    compras: 19_762_523.38,
    devoluciones_proveedor: 0,
    gastos: 5_631_200,
    retiros: 0,
    otras_salidas: 0,
    vendido: 13_024_300,
    costo_vendido: 10_230_224.67,
    inventario_a_costo: 9_260_098.72,
    cartera: 1_096_100,
    productos_sin_costo: 5,
    unidades_sin_costo: 29,
    lineas_venta_sin_costo: 8,
  })

  const wb = buildBalanceWorkbook(new ExcelJS.Workbook(), {
    balance: BAL, sede: 'Muscle Pro', generado: '2026-09-21 16:40',
  })

  it('trae los números del balance, no un resumen vago', () => {
    const c = celdas(wb.getWorksheet('Balance')!)
    expect(c).toContain(String(15_000_000))
    expect(c).toContain(String(BAL.efectivo))
    expect(c).toContain(String(BAL.patrimonio))
    expect(c).toContain(String(BAL.resultado))
    // CONTROL: el archivo dice de qué sede y de cuándo es. Sin eso, dos
    // exportes de sedes distintas son indistinguibles en una carpeta.
    expect(c).toContain('Muscle Pro')
    expect(c).toContain('2026-09-21 16:40')
  })

  it('🔴 dice que NO es un reporte de período', () => {
    // Sin esto, alguien va a cruzarlo contra el Excel financiero de una semana
    // y va a concluir que uno de los dos está mal.
    const t = textoDe(wb.getWorksheet('Definiciones')!)
    expect(t).toMatch(/acumulado desde que arrancó/i)
    expect(t).toMatch(/no usa el selector de fechas/i)
  })

  it('🔴 explica el descuadre y NO lo esconde', () => {
    const t = textoDe(wb.getWorksheet('Definiciones')!)
    expect(t).toMatch(/Debería dar cero/i)
    expect(t).toMatch(/sin costo cargado/i)
    // Y el número está en la hoja, con sus contadores.
    const c = celdas(wb.getWorksheet('Balance')!)
    expect(c).toContain('5')   // productos sin costo
    expect(c).toContain('29')  // unidades sin costo
  })

  it('🔴 dice que un retiro NO es una pérdida, y que el margen tiene un límite', () => {
    const t = textoDe(wb.getWorksheet('Definiciones')!)
    expect(t).toMatch(/NO es una pérdida/i)
    expect(t).toMatch(/no son comparables/i)
  })

  it('sin capital cargado NO inventa un cero: lo dice', () => {
    const sinCapital = derivarBalance({
      sede_nombre: 'Muscle Pro', capital_inicial: null, capital_inicial_desde: null,
      cobrado_ventas: 0, abonos: 0, otras_entradas: 0,
      compras: 0, devoluciones_proveedor: 0, gastos: 0, retiros: 0, otras_salidas: 0,
      vendido: 0, costo_vendido: 0, inventario_a_costo: 0, cartera: 0,
      productos_sin_costo: 0, unidades_sin_costo: 0, lineas_venta_sin_costo: 0,
    })
    const c = celdas(buildBalanceWorkbook(new ExcelJS.Workbook(), {
      balance: sinCapital, sede: 'Muscle Pro', generado: '2026-09-21 16:40',
    }).getWorksheet('Balance')!)
    expect(c.filter((x) => x === 'sin configurar').length).toBeGreaterThan(0)
  })
})
