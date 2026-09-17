import { describe, expect, it } from 'vitest'
import { dayEndISO, dayStartISO } from './diaBogota'

describe('diaBogota — límites de día en Bogotá (R7)', () => {
  it('el día empieza a las 05:00 UTC y termina a las 04:59:59.999 UTC del siguiente', () => {
    expect(dayStartISO('2026-09-16')).toBe('2026-09-16T05:00:00.000Z')
    expect(dayEndISO('2026-09-16')).toBe('2026-09-17T04:59:59.999Z')
  })

  it('un movimiento de las 21:23 del 15 en Bogotá NO cae en el 16 — el caso medido en LAB', () => {
    const movimiento = '2026-09-16T02:23:36.647Z'
    const dentroDel16 = movimiento >= dayStartISO('2026-09-16') && movimiento <= dayEndISO('2026-09-16')
    const dentroDel15 = movimiento >= dayStartISO('2026-09-15') && movimiento <= dayEndISO('2026-09-15')
    expect({ dentroDel15, dentroDel16 }).toEqual({ dentroDel15: true, dentroDel16: false })
  })

  it('control negativo: la forma vieja SÍ lo metía en el 16 — sin esto el caso de arriba no discrimina', () => {
    const movimiento = '2026-09-16T02:23:36.647Z'
    const desdeViejo = new Date('2026-09-16').toISOString()
    expect(movimiento >= desdeViejo).toBe(true)
  })
})
