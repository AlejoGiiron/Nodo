import { describe, it, expect } from 'vitest'
import { mensajeDeError, esNombreDuplicado } from './errores'

describe('mensajeDeError', () => {
  it('saca el message de un Error', () => {
    expect(mensajeDeError(new Error('Abri la jornada'), 'genérico')).toBe('Abri la jornada')
  })

  // El caso que hizo existir la función: el error de `supabase.rpc()` en el
  // camino real NO es `instanceof Error`. Sin esto, todo guard de la base caía
  // en el genérico.
  it('saca el message de un objeto que NO es Error', () => {
    const comoPostgrest = { message: 'No autorizado para ajustar inventario', code: 'P0001' }
    expect(mensajeDeError(comoPostgrest, 'genérico')).toBe('No autorizado para ajustar inventario')
  })

  it('cae al fallback cuando no hay message utilizable', () => {
    expect(mensajeDeError({ message: '' }, 'genérico')).toBe('genérico')
    expect(mensajeDeError(null, 'genérico')).toBe('genérico')
  })
})

describe('esNombreDuplicado', () => {
  // 23505 = unique_violation. Es el código que va a devolver el índice
  // `products_nombre_unico_por_sede` cuando alguien teclee un nombre repetido.
  it('reconoce el 23505 de Postgres', () => {
    expect(esNombreDuplicado({ code: '23505', message: 'duplicate key value' })).toBe(true)
  })

  // 🔴 CONTROL NEGATIVO, y es el que hace que el caso de arriba mida algo: si
  // el helper devolviera `true` para cualquier error, el toast diría "ya existe
  // ese nombre" ante un problema de red o un guard de permisos — una
  // advertencia falsa, que induce el error que dice prevenir. Se prueba con los
  // códigos que este mismo camino puede producir de verdad.
  it.each([
    ['P0001', 'raise de un guard de plpgsql'],
    ['42501', 'RLS: insufficient_privilege'],
    ['23503', 'FK: la categoría no existe'],
    ['23514', 'CHECK: price >= 0'],
  ])('NO confunde %s (%s) con un nombre duplicado', (code) => {
    expect(esNombreDuplicado({ code, message: 'lo que sea' })).toBe(false)
  })

  it('NO se dispara con un error sin código', () => {
    expect(esNombreDuplicado(new Error('boom'))).toBe(false)
    expect(esNombreDuplicado(null)).toBe(false)
    expect(esNombreDuplicado(undefined)).toBe(false)
  })

  // El código viene como STRING desde PostgREST. Si algún día llegara numérico,
  // este caso deja escrito que hoy no se contempla en vez de que pase callado.
  it('el código es una cadena, no un número', () => {
    expect(esNombreDuplicado({ code: 23505 })).toBe(false)
  })
})
