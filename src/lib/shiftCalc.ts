// Cálculo puro del cuadre de caja al cerrar un turno.
// Sin React, sin red: testeable de forma unitaria y determinista.

/** Estado del cuadre: declarado vs. efectivo esperado. */
export type CuadreStatus = 'exact' | 'over' | 'short'

export interface ShiftBalanceInput {
  /** Monto con el que se abrió la caja. */
  openingAmount: number
  /** Ventas cobradas en efectivo durante el turno. */
  cashSales: number
  /** Ingresos manuales (movimientos 'in'). */
  movementsIn: number
  /** Egresos manuales (movimientos 'out'). */
  movementsOut: number
  /** Efectivo declarado por quien cierra la caja. */
  declared: number
}

export interface ShiftBalance {
  /** apertura + ventas efectivo + ingresos − egresos. Puede ser negativo (sobregiro). */
  expectedCash: number
  /** declared − expectedCash. Negativo = faltante, positivo = sobrante. */
  difference: number
  /** Cuadre del declarado contra el esperado. */
  status: CuadreStatus
  /**
   * Sobregiro: el efectivo esperado quedó negativo porque los egresos
   * superaron apertura + ventas en efectivo + ingresos. Es ortogonal al
   * cuadre (puede haber cuadre exacto y aun así sobregiro).
   */
  isOverdraft: boolean
}

// ─── Arqueo multi-método (snapshot que se persiste al cerrar) ──────
// Se CONGELA al cerrar: payments no tiene jornada_id y su ventana es solo
// temporal, así que recomputar el esperado de un turno cerrado sumaría pagos
// posteriores. Por eso el esperado por método se snapshotea aquí.

export type ArqueoMethod = 'cash' | 'card' | 'transfer' | 'nequi'

export interface MethodReconciliation {
  /** cash = apertura + ventas efectivo + ingresos − egresos; otros = ventas del método. */
  expected: number
  /** Declarado por el cajero (blanco = 0). */
  declared: number
  /** declared − expected. Negativo = faltante, positivo = sobrante. */
  difference: number
}

export interface ShiftReconciliation {
  methods: Record<ArqueoMethod, MethodReconciliation>
  expected_total: number
  declared_total: number
  difference_total: number
  /** Ventas (órdenes distintas) del turno. Una venta mixta = 1 venta, N pagos. */
  sales_count: number
}

/** Efectivo disponible en caja según los movimientos hasta el momento. */
export function availableCash(
  input: Pick<ShiftBalanceInput, 'openingAmount' | 'cashSales' | 'movementsIn' | 'movementsOut'>,
): number {
  return input.openingAmount + input.cashSales + input.movementsIn - input.movementsOut
}

/** Rol visual del cuadre y su etiqueta. */
export interface CuadreTone {
  /** Rol del design system: `success` SOLO para el cuadre exacto. */
  rol: 'success' | 'warning' | 'danger'
  etiqueta: 'Cuadre exacto' | 'Sobrante' | 'Faltante'
}

/**
 * QUE AFIRMA EL COLOR DEL ARQUEO. Fuente unica — deuda 64.
 *
 * 🔴 **El unico resultado bueno del arqueo es CUADRADO.** Sobrante y faltante
 *    son los dos descuadres: que a la caja le sobre plata significa que algo
 *    **no se registro** — una venta cobrada por fuera del sistema, un vuelto mal
 *    dado, una base mal contada.
 *
 * 🔴 **Por que el sobrante en verde es PEOR que un faltante mal pintado:** un
 *    faltante duele y se investiga aunque el color este mal. Un sobrante en
 *    verde **se archiva**, y la plata de mas se queda en el cajon sin que nadie
 *    busque de donde salio. Es la *confirmacion falsa* de R?: no produce una
 *    accion equivocada, produce **la ausencia de una accion correcta**.
 *
 * ⚠️ **Y por que es una funcion y no un `? :` en cada pantalla:** esta regla
 *    estaba escrita DOS VECES —`CloseShiftModal` y `ShiftHistoryPage`— y la
 *    correccion llego a una sola. La bitacora la dio por hecha mientras el
 *    modal, que es donde se decide el cierre, seguia en verde. Un contrato en
 *    dos lados sin nada que los sincronice (R1). Aca hay uno.
 */
export function cuadreTone(difference: number): CuadreTone {
  if (difference === 0) return { rol: 'success', etiqueta: 'Cuadre exacto' }
  if (difference > 0) return { rol: 'warning', etiqueta: 'Sobrante' }
  return { rol: 'danger', etiqueta: 'Faltante' }
}

/** Calcula el cuadre del turno a partir de los montos del turno. */
export function calcShiftBalance(input: ShiftBalanceInput): ShiftBalance {
  const expectedCash = availableCash(input)
  const difference = input.declared - expectedCash

  const status: CuadreStatus =
    difference === 0 ? 'exact' : difference > 0 ? 'over' : 'short'

  return {
    expectedCash,
    difference,
    status,
    isOverdraft: expectedCash < 0,
  }
}
