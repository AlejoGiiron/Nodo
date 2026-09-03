import { describe, it, expect } from 'vitest'
import { mergeSedeConfig, type SedeConfig } from './sedeConfig'

// ============================================================================
// DEUDA 58 · A1 §3.4 — `{}` como base de un merge BORRA lo que nadie tocó
//
// El caso medido: `updateConfig({ cash_out_reasons, payment_methods })` con la
// sede sin cargar escribía `{ ...{}, ...patch }`, o sea un objeto con DOS claves
// sobre una fila que tenía cuatro. `slug` y `nequi_qr_url` se perdían — y
// `nequi_qr_url` es la imagen del QR que el negocio le muestra al cliente para
// que le pague.
//
// De los dos mecanismos que A1 describió, éste es **el que estaba abierto**: no
// depende de ganarle a un render, basta con que la consulta de la sede falle.
// ============================================================================

const GUARDADA: SedeConfig = {
  slug: 'muscle-pro-norte',
  nequi_qr_url: 'https://x.co/qr.png',
  cash_out_reasons: ['Arriendo', 'Servicios'],
  payment_methods: ['cash', 'nequi'],
}

describe('mergeSedeConfig', () => {
  it('🔴 sin configuración cargada NO escribe: falla cerrado', () => {
    expect(() => mergeSedeConfig(undefined, { payment_methods: ['cash'] }))
      .toThrow(/no está cargada/i)
    expect(() => mergeSedeConfig(null, { payment_methods: ['cash'] }))
      .toThrow(/no está cargada/i)
  })

  it('el mensaje dice QUÉ pasaría si escribiera, no sólo que no puede', () => {
    // Un rechazo mudo obliga a reconstruir el motivo; éste lo trae puesto.
    expect(() => mergeSedeConfig(undefined, {})).toThrow(/borraría las claves que no estás editando/i)
  })

  it('conserva las claves que el patch NO toca', () => {
    const out = mergeSedeConfig(GUARDADA, { payment_methods: ['cash'] }) as unknown as SedeConfig
    expect(out.slug, 'el slug no estaba en el patch y tiene que sobrevivir').toBe('muscle-pro-norte')
    expect(out.nequi_qr_url, 'el QR de Nequi tampoco estaba, y es lo que ve el cliente').toBe('https://x.co/qr.png')
    expect(out.cash_out_reasons).toEqual(['Arriendo', 'Servicios'])
    expect(out.payment_methods, 'y lo que sí estaba se aplica').toEqual(['cash'])
  })

  it('un patch vacío deja la configuración intacta', () => {
    expect(mergeSedeConfig(GUARDADA, {})).toEqual(GUARDADA)
  })
})
