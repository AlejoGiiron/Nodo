import { describe, it, expect } from 'vitest'
import { lineasVigentes, type LineaDeTicket, type ItemDeCambio } from './lineasVigentes'

// El caso real que abrió esto: venta #162, cinco líneas, vuelve OXIMETHANON y
// se lleva OXANDRONOM. El ticket reimpreso seguía diciendo OXIMETHANON.
const L = (productId: string, name: string, qty: number, unitPrice: number): LineaDeTicket =>
  ({ productId, name, qty, unitPrice })
const C = (direction: 'in' | 'out', productId: string, name: string, qty: number, unitPrice: number): ItemDeCambio =>
  ({ direction, productId, name, qty, unitPrice })

const VENTA_162 = [
  L('testo', 'TESTONOM C X AMPOLLAS', 1, 145000),
  L('primo-iny', 'PRIMOBOLAN INYECTABLE', 1, 245000),
  L('deca', 'DECANOM X AMPOLLAS', 1, 155000),
  L('oxi', 'OXIMETHANON TABS', 1, 169000),
  L('primo-oral', 'PRIMOBOLAN ORAL', 1, 225000),
]

const nombres = (ls: LineaDeTicket[]) => ls.map((l) => `${l.qty}x ${l.name}`)

describe('lineasVigentes — lo que el cliente tiene hoy', () => {
  it('🔴 venta #162: sale OXIMETHANON y entra OXANDRONOM', () => {
    const r = lineasVigentes(VENTA_162, [
      C('in', 'oxi', 'OXIMETHANON TABS', 1, 169000),
      C('out', 'oxa', 'OXANDRONOM 100 TABS', 1, 178000),
    ])
    expect(nombres(r)).toEqual([
      '1x TESTONOM C X AMPOLLAS',
      '1x PRIMOBOLAN INYECTABLE',
      '1x DECANOM X AMPOLLAS',
      '1x PRIMOBOLAN ORAL',
      '1x OXANDRONOM 100 TABS',
    ])
    // y la suma de las líneas cierra con el total vigente: 939.000 + 9.000
    expect(r.reduce((s, l) => s + l.qty * l.unitPrice, 0)).toBe(948000)
  })

  it('CONTROL: sin cambios devuelve las líneas originales tal cual', () => {
    // Sin esta mitad, una función que devolviera SIEMPRE otra cosa pasaría el
    // caso de arriba si casualmente coincidía.
    expect(lineasVigentes(VENTA_162, [])).toEqual(VENTA_162)
  })

  it('una devolución PARCIAL deja la línea con lo que queda', () => {
    const r = lineasVigentes([L('a', 'A', 3, 5000)], [C('in', 'a', 'A', 2, 5000), C('out', 'b', 'B', 1, 8000)])
    expect(nombres(r)).toEqual(['1x A', '1x B'])
  })

  it('dos cambios encadenados se aplican los dos', () => {
    const r = lineasVigentes([L('a', 'A', 3, 5000)], [
      C('in', 'a', 'A', 2, 5000), C('out', 'b', 'B', 1, 8000),
      C('in', 'a', 'A', 1, 5000), C('out', 'b', 'B', 1, 8000),
    ])
    expect(nombres(r), 'el mismo producto al mismo precio se agrupa en una línea').toEqual(['2x B'])
  })

  it('no toca las líneas que recibe: la venta original no se reescribe', () => {
    const originales = [L('a', 'A', 2, 5000)]
    lineasVigentes(originales, [C('in', 'a', 'A', 2, 5000), C('out', 'b', 'B', 1, 8000)])
    expect(originales[0].qty).toBe(2)
  })

  it('🔴 si lo que vuelve no está en la venta, LANZA en vez de imprimir algo que no cuadra', () => {
    expect(() => lineasVigentes([L('a', 'A', 1, 5000)], [C('in', 'a', 'A', 2, 5000)]))
      .toThrow(/devuelve 2 de «A»/)
  })
})
