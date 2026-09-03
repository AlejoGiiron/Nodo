import { describe, it, expect } from 'vitest'
import { diasVencidos, venceEl } from './cartera'

// ============================================================================
// ARITMÉTICA DEL VENCIMIENTO — deuda 46
//
// 🔴 POR QUÉ ESTO ES UNA FUNCIÓN PURA CON TESTS UNITARIOS Y NO SQL EN UNA VISTA.
//    Es una frontera de día sobre un `timestamptz`, o sea R7 en su forma más
//    pura: no revienta, da un número plausible y equivocado, y quien lo lee
//    **llama al cliente a cobrarle algo que no venció**. Una función pura se
//    puede poner roja con una fecha inventada; una vista sólo se prueba con
//    datos reales y un reloj que no controlamos.
//
// ⚠️ Y LA DISTINCIÓN QUE SOSTIENE TODO: `null` (no hay plazo pactado) NO es 0
//    (no está vencida). Compartir valor ahí sería exactamente el error que el
//    proyecto viene pagando —"todavía no sé" y "no hay nada" con el mismo
//    valor— y acá el resultado sería una fila que dice "al día" sobre una deuda
//    de la que no sabemos nada.
// ============================================================================

describe('diasVencidos', () => {
  it('sin plazo pactado devuelve null, NUNCA 0', () => {
    // 0 significaría "no está vencida", que es una AFIRMACIÓN. Sin plazo no se
    // puede afirmar nada, y el design system tiene un símbolo para eso: `—`.
    expect(diasVencidos('2026-01-10T15:00:00Z', null, '2026-06-01')).toBeNull()
    expect(diasVencidos('2026-01-10T15:00:00Z', undefined, '2026-06-01')).toBeNull()
  })

  it('el día del vencimiento todavía NO está vencida', () => {
    // Venta del 10 de enero a 30 días: vence el 9 de febrero. Ese día el cliente
    // todavía está en plazo — cobrarle sería cobrarle antes de tiempo.
    expect(diasVencidos('2026-01-10T15:00:00Z', 30, '2026-02-09')).toBe(0)
  })

  it('al día siguiente del vencimiento cuenta 1', () => {
    expect(diasVencidos('2026-01-10T15:00:00Z', 30, '2026-02-10')).toBe(1)
  })

  it('cuenta los días exactos, no aproxima', () => {
    // Venta del 1 a 8 días: vence el 9. El 11 lleva 2 días vencida.
    expect(diasVencidos('2026-01-01T15:00:00Z', 8, '2026-01-11')).toBe(2)
    expect(diasVencidos('2026-01-01T15:00:00Z', 15, '2026-01-20')).toBe(4)
  })

  it('una venta futura o de hoy no está vencida', () => {
    expect(diasVencidos('2026-01-10T15:00:00Z', 8, '2026-01-10')).toBe(0)
  })

  it('🔴 R7 — la fecha de la venta se toma en BOGOTÁ, no en UTC', () => {
    // 2026-01-11T04:00:00Z son las 23:00 del 10 de enero en Bogotá: la venta se
    // hizo el DÍA 10. Con plazo 0 vence el 10, así que el 11 lleva 1 día.
    //
    // 🔴 Si se tomara el timestamp crudo, la fecha de venta sería el 11, el
    //    vencimiento el 11, y el resultado 0 — un número plausible y equivocado
    //    que dice "al día" sobre algo vencido. Este caso DISCRIMINA: las dos
    //    lecturas dan resultados distintos.
    expect(diasVencidos('2026-01-11T04:00:00Z', 0, '2026-01-11')).toBe(1)
    expect(diasVencidos('2026-01-11T04:00:00Z', 0, '2026-01-10')).toBe(0)
  })

  it('plazo 0 es contado: vence el mismo día', () => {
    expect(diasVencidos('2026-01-10T15:00:00Z', 0, '2026-01-10')).toBe(0)
    expect(diasVencidos('2026-01-10T15:00:00Z', 0, '2026-01-11')).toBe(1)
  })

  it('cruza meses y años sin ayuda', () => {
    expect(diasVencidos('2025-12-20T15:00:00Z', 15, '2026-01-10')).toBe(6)
  })
})

describe('venceEl', () => {
  it('devuelve la fecha de vencimiento en Bogotá', () => {
    expect(venceEl('2026-01-10T15:00:00Z', 30)).toBe('2026-02-09')
    expect(venceEl('2026-01-11T04:00:00Z', 0)).toBe('2026-01-10')
  })

  it('sin plazo no hay fecha que mostrar', () => {
    expect(venceEl('2026-01-10T15:00:00Z', null)).toBeNull()
  })
})
