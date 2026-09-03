import { describe, it, expect } from 'vitest'
import { calcShiftBalance, cuadreTone, availableCash } from './shiftCalc'

describe('calcShiftBalance', () => {
  it('cuadrado: declarado coincide con el esperado', () => {
    const r = calcShiftBalance({
      openingAmount: 50_000,
      cashSales: 30_000,
      movementsIn: 0,
      movementsOut: 0,
      declared: 80_000,
    })
    expect(r.expectedCash).toBe(80_000)
    expect(r.difference).toBe(0)
    expect(r.status).toBe('exact')
    expect(r.isOverdraft).toBe(false)
  })

  it('sobrante: hay más efectivo del esperado', () => {
    const r = calcShiftBalance({
      openingAmount: 50_000,
      cashSales: 30_000,
      movementsIn: 0,
      movementsOut: 0,
      declared: 95_000,
    })
    expect(r.expectedCash).toBe(80_000)
    expect(r.difference).toBe(15_000)
    expect(r.status).toBe('over')
    expect(r.isOverdraft).toBe(false)
  })

  it('faltante: hay menos efectivo del esperado', () => {
    const r = calcShiftBalance({
      openingAmount: 50_000,
      cashSales: 30_000,
      movementsIn: 0,
      movementsOut: 0,
      declared: 70_000,
    })
    expect(r.expectedCash).toBe(80_000)
    expect(r.difference).toBe(-10_000)
    expect(r.status).toBe('short')
    expect(r.isOverdraft).toBe(false)
  })

  it('sobregiro: los egresos dejan el esperado negativo', () => {
    const r = calcShiftBalance({
      openingAmount: 50_000,
      cashSales: 20_000,
      movementsIn: 0,
      movementsOut: 100_000, // supera apertura + ventas efectivo
      declared: 0,
    })
    expect(r.expectedCash).toBe(-30_000)
    expect(r.isOverdraft).toBe(true)
    // El cuadre sigue siendo ortogonal: declarado 0 vs esperado -30k = sobrante
    expect(r.difference).toBe(30_000)
    expect(r.status).toBe('over')
  })

  it('ingresos manuales aumentan el esperado', () => {
    const r = calcShiftBalance({
      openingAmount: 50_000,
      cashSales: 0,
      movementsIn: 25_000,
      movementsOut: 5_000,
      declared: 70_000,
    })
    expect(r.expectedCash).toBe(70_000)
    expect(r.status).toBe('exact')
  })
})

describe('availableCash', () => {
  it('apertura + ventas efectivo + ingresos − egresos', () => {
    expect(
      availableCash({ openingAmount: 50_000, cashSales: 30_000, movementsIn: 10_000, movementsOut: 20_000 }),
    ).toBe(70_000)
  })

  it('puede quedar negativo (sobregiro)', () => {
    expect(
      availableCash({ openingAmount: 0, cashSales: 0, movementsIn: 0, movementsOut: 15_000 }),
    ).toBe(-15_000)
  })
})

// ─── El ROL del cuadre — deuda 64 ────────────────────────────────────────────
//
// 🔴 Por qué esto es una función y no un `? :` en cada pantalla: la regla estaba
//    escrita DOS VECES —en `CloseShiftModal` y en `ShiftHistoryPage`— y por eso
//    la corrección de septiembre llegó a una y no a la otra. La bitácora la dio
//    por hecha; el modal, que es donde se DECIDE el cierre, siguió pintando el
//    sobrante en verde durante todo ese tiempo. Un contrato en dos lados sin
//    nada que los sincronice (R1).
describe('cuadreTone — qué AFIRMA el color del arqueo', () => {
  it('CUADRADO es el único resultado bueno: verde', () => {
    expect(cuadreTone(0)).toEqual({ rol: 'success', etiqueta: 'Cuadre exacto' })
  })

  it('FALTANTE es lo más grave: danger', () => {
    expect(cuadreTone(-10_000).rol).toBe('danger')
    expect(cuadreTone(-1).rol).toBe('danger')
  })

  it('🔴 SOBRANTE es un descuadre, no una buena noticia: warning, nunca success', () => {
    // Que a la caja le sobre plata significa que algo NO SE REGISTRÓ: una venta
    // cobrada por fuera, un vuelto mal dado, una base mal contada. Pintarlo de
    // verde —el color de la confirmación— lo archiva: un faltante se investiga
    // igual aunque el color esté mal, un sobrante en verde no lo mira nadie.
    expect(cuadreTone(15_000).rol).toBe('warning')
    expect(cuadreTone(1).rol).toBe('warning')
    expect(cuadreTone(15_000).rol, 'verde afirma "esto salió bien"').not.toBe('success')
  })

  it('la etiqueta nombra el estado, no el signo', () => {
    expect(cuadreTone(15_000).etiqueta).toBe('Sobrante')
    expect(cuadreTone(-15_000).etiqueta).toBe('Faltante')
  })
})
