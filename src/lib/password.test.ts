import { describe, it, expect } from 'vitest'
import {
  PASSWORD_MIN,
  PASSWORD_REGLA,
  validarPasswordNueva,
  MENSAJE_DE_ERROR,
} from './password'

describe('la regla de contraseña', () => {
  // 🔴 TRIPWIRE, no una aserción sobre el código de hoy.
  //    `supabase/functions/create-user/index.ts` tiene su propia comprobación
  //    (`password.length < 8`) y corre en Deno, fuera de este bundle: NO puede
  //    importar la constante. Son dos lados sin nada que los sincronice (R1).
  //    Este caso clava el valor para que cambiarlo acá se vea, y su mensaje
  //    nombra el otro lado — un rojo que no dice dónde está la otra mitad
  //    manda a mirar el lugar equivocado.
  it('el mínimo es 8 · SI ESTO SE PONE ROJO, tocá TAMBIÉN create-user/index.ts', () => {
    expect(
      PASSWORD_MIN,
      'el mínimo cambió acá. El otro lado es supabase/functions/create-user/index.ts, ' +
      'que valida password.length < 8 y NO puede importar esta constante (corre en Deno). ' +
      'Se tocan los dos en la misma pasada.',
    ).toBe(8)
  })

  it('es más estricta que la de la plataforma, que exige 6', () => {
    // Medido el 2026-09-07 contra el proyecto real: auth.updateUser rechaza 5
    // con `weak_password` y acepta 6. Si el producto bajara a 6, una cuenta
    // tendría dos reglas distintas según por dónde le pusieron la clave.
    expect(PASSWORD_MIN).toBeGreaterThan(6)
  })

  it('la regla se dice con el número, no en abstracto', () => {
    // Un «la contraseña es inválida» obliga a adivinar. El texto que ve la
    // persona tiene que contener el número.
    expect(PASSWORD_REGLA).toContain(String(PASSWORD_MIN))
  })
})

describe('validarPasswordNueva', () => {
  const OK = 'unaClaveLarga1'

  it('acepta una contraseña válida', () => {
    expect(validarPasswordNueva(OK, OK, 'otraCosa123')).toBeNull()
  })

  it('rechaza la vacía', () => {
    expect(validarPasswordNueva('', '', 'x')).toBe('vacia')
  })

  it('rechaza una de 7 y acepta una de 8 — el borde exacto', () => {
    const siete = 'a'.repeat(PASSWORD_MIN - 1)
    const ocho = 'a'.repeat(PASSWORD_MIN)
    expect(validarPasswordNueva(siete, siete, 'z')).toBe('corta')
    expect(validarPasswordNueva(ocho, ocho, 'z')).toBeNull()
  })

  it('🔴 rechaza cambiar la contraseña por LA MISMA', () => {
    // La plataforma lo acepta en silencio: la persona se queda creyendo que
    // rotó algo y no rotó nada. Es el caso que más se parece a un éxito.
    expect(validarPasswordNueva(OK, OK, OK)).toBe('igual-a-la-actual')
  })

  it('rechaza cuando las dos nuevas no coinciden', () => {
    expect(validarPasswordNueva(OK, OK + 'x', 'z')).toBe('no-coincide')
  })

  it('el orden importa: una corta que además no coincide se reporta como CORTA', () => {
    // Decir «no coinciden» sobre algo que además es inválido manda a arreglar
    // lo segundo y a chocar de nuevo con lo primero.
    expect(validarPasswordNueva('abc', 'xyz', 'z')).toBe('corta')
  })

  it('cada motivo tiene un mensaje, y ninguno es genérico', () => {
    for (const [motivo, texto] of Object.entries(MENSAJE_DE_ERROR)) {
      expect(texto, `el motivo ${motivo} no tiene mensaje`).toBeTruthy()
      expect(texto.toLowerCase(), `el mensaje de ${motivo} es genérico`).not.toContain('error al guardar')
    }
  })
})
