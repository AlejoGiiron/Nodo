// ============================================================================
// EL BALANCE DE LA SEDE — la aritmética, UNA sola vez
//
// 🔴 POR QUÉ VIVE ACÁ Y NO EN LA PANTALLA NI EN LA VISTA. La pantalla de
//    Reportes y el libro de Excel tienen que dar EL MISMO número: si la resta
//    se escribiera en los dos, serían dos lados de un contrato sin nada que los
//    sincronice, y el que se congela es siempre el que nadie mira (R1). Es el
//    mismo defecto que la deuda 53 ya pagó — dos libros del mismo período que
//    no cerraban entre sí.
//
//    La vista `balance_de_sede` trae los COMPONENTES; acá se hacen las cuentas;
//    la pantalla y el Excel sólo pintan.
//
// 🔴 Y LA IDENTIDAD QUE LO VUELVE VERIFICABLE, medida contra la sede real el
//    2026-09-21 y aseverada en `balance.test.ts`:
//
//        patrimonio  =  capital + resultado − retiros − descuadre
//                       + entradasSinClasificar
//
//    ⚠️ El último término lo AGREGÓ el test, no yo: la primera versión de esta
//    identidad no lo tenía y se puso roja por 75.000. Las entradas de caja sin
//    clasificar suben el patrimonio y no son ganancia (ver el campo), así que
//    entran a la identidad como término propio en vez de esconderse en el
//    resultado.
//
//    No es una comprobación decorativa: es lo que convierte «los números no
//    cierran» en «no cierran POR ESTO Y POR ESTO MUCHO». Sin ella, el reporte
//    tendría dos cifras plausibles que difieren y ninguna explicación.
// ============================================================================

/** Lo que devuelve la vista `balance_de_sede`. Todo acumulado desde el inicio. */
export interface ComponentesBalance {
  sede_nombre: string | null
  capital_inicial: number | null
  capital_inicial_desde: string | null
  cobrado_ventas: number
  abonos: number
  otras_entradas: number
  compras: number
  devoluciones_proveedor: number
  gastos: number
  retiros: number
  otras_salidas: number
  vendido: number
  costo_vendido: number
  inventario_a_costo: number
  cartera: number
  productos_sin_costo: number
  unidades_sin_costo: number
  lineas_venta_sin_costo: number
}

export interface Balance {
  /** De qué sede es este balance. Viaja al Excel: un archivo sin sede es indistinguible de otro. */
  sedeNombre: string
  /**
   * 🔴 `false` cuando no hay capital inicial cargado, y entonces `efectivo`,
   * `patrimonio` y `contraCapital` son NULL — no cero. Un cero afirmaría que
   * arrancó sin plata, que es un número plausible y falso; el nulo dice que
   * falta un dato y deja que la pantalla lo pida.
   */
  configurado: boolean
  capital: number | null
  desde: string | null

  entradas: number
  salidas: number
  /** Plata que debería haber hoy, en caja y banco. Null si falta el capital. */
  efectivo: number | null

  inventario: number
  cartera: number
  /** Efectivo + mercancía + lo que le deben. Null si falta el capital. */
  patrimonio: number | null
  /** Patrimonio − capital. Negativo = hoy vale menos que lo que puso. */
  contraCapital: number | null

  vendido: number
  costoVendido: number
  /** Lo que dejan las ventas antes de gastos. */
  utilidadBruta: number
  gastos: number
  retiros: number
  /**
   * Utilidad bruta − gastos. **Los retiros NO entran**: sacar plata baja el
   * patrimonio pero no es una pérdida del negocio, es una distribución. Meterlos
   * acá haría parecer que el negocio pierde cuando en realidad se repartió.
   */
  resultado: number

  /**
   * Mercancía comprada que no está ni vendida ni en el inventario.
   * `compras − devoluciones − (inventario + costo de lo vendido)`.
   * Distinto de cero = falta explicar. La causa más común son productos con
   * existencia y SIN COSTO: valen 0 al sumar el inventario.
   */
  descuadreDeMercancia: number
  /**
   * 🔴 Plata que ENTRÓ por caja y no es una venta ni un abono (categoría `otro`).
   * NO se cuenta como ganancia, y la asimetría con `otras_salidas` —que sí baja
   * el resultado— es deliberada, no una incoherencia:
   *
   *   · una salida sin clasificar, contada como costo, empeora el resultado:
   *     falla hacia el lado conservador;
   *   · una entrada sin clasificar, contada como ingreso, lo MEJORA — y si es
   *     una inyección de capital de la dueña, sería plata propia disfrazada de
   *     ganancia. Un número plausible y favorable no lo revisa nadie.
   *
   * Así que sube el patrimonio (la plata está) y queda por fuera del resultado,
   * declarada, hasta que alguien diga qué es.
   */
  entradasSinClasificar: number
  productosSinCosto: number
  unidadesSinCosto: number
  lineasVentaSinCosto: number
  /** true si hay algún dato que hace que el balance no pueda cerrar del todo. */
  hayHuecos: boolean
}

const n = (v: number | null | undefined): number => Number(v ?? 0)

export function derivarBalance(c: ComponentesBalance): Balance {
  const capital = c.capital_inicial == null ? null : Number(c.capital_inicial)

  const entradas = n(c.cobrado_ventas) + n(c.abonos) + n(c.otras_entradas)
  const salidas =
    n(c.compras) - n(c.devoluciones_proveedor) + n(c.gastos) + n(c.retiros) + n(c.otras_salidas)

  const efectivo = capital == null ? null : capital + entradas - salidas
  const inventario = n(c.inventario_a_costo)
  const cartera = n(c.cartera)
  const patrimonio = efectivo == null ? null : efectivo + inventario + cartera

  const vendido = n(c.vendido)
  const costoVendido = n(c.costo_vendido)
  const utilidadBruta = vendido - costoVendido
  const gastos = n(c.gastos)
  const retiros = n(c.retiros)
  // `otras_salidas` son salidas de caja sin clasificar: cuentan como gasto para
  // el resultado, porque plata que salió y no compró mercancía es un costo del
  // período. Se muestran aparte para que se pueda ir a clasificarlas.
  const resultado = utilidadBruta - gastos - n(c.otras_salidas)

  const descuadreDeMercancia =
    n(c.compras) - n(c.devoluciones_proveedor) - (inventario + costoVendido)

  return {
    sedeNombre: c.sede_nombre ?? 'Sede',
    configurado: capital != null,
    capital,
    desde: c.capital_inicial_desde,
    entradas,
    salidas,
    efectivo,
    inventario,
    cartera,
    patrimonio,
    contraCapital: patrimonio == null || capital == null ? null : patrimonio - capital,
    vendido,
    costoVendido,
    utilidadBruta,
    gastos,
    retiros,
    resultado,
    descuadreDeMercancia,
    entradasSinClasificar: n(c.otras_entradas),
    productosSinCosto: n(c.productos_sin_costo),
    unidadesSinCosto: n(c.unidades_sin_costo),
    lineasVentaSinCosto: n(c.lineas_venta_sin_costo),
    hayHuecos: n(c.productos_sin_costo) > 0 || n(c.lineas_venta_sin_costo) > 0,
  }
}
