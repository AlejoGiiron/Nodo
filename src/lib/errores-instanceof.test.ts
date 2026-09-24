import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

// ============================================================================
// TRIPWIRE · `instanceof Error` NO SE USA PARA LEER UN ERROR DE SUPABASE
//
// 🔴 POR QUÉ EXISTE, Y NO ES QUE LA CLASE NO SE HUBIERA BARRIDO — SE BARRIÓ:
//    el 2026-09-01 se midió con una sonda end-to-end que el error de
//    `supabase.rpc()` **no es `instanceof Error`** (es un objeto plano con
//    `message`), se encontraron **11 copias** del patrón, se barrieron las
//    once y se extrajo `mensajeDeError`. Con su razón escrita en `errores.ts`.
//
//    **Y el 2026-09-24 apareció la copia 12**, en un hook nuevo, tres líneas
//    debajo de un comentario que decía que el mensaje de la RPC tenía que
//    llegar intacto. El toast mostró `[object Object]` y se perdieron los tres
//    números que hacían accionable el rechazo.
//
// > **UNA EXTRACCIÓN ES UNA ALTERNATIVA, NO UNA PROHIBICIÓN.** `mensajeDeError`
// > existía, era mejor, y nada obligaba a usarlo. Las 11 se cerraron; la 12 no
// > tenía nada enfrente.
//
// Por eso esto no es un criterio más: **un criterio se lee y un tripwire se
// ejecuta.** Corre en `pnpm test:unit`, que es la condición 5 del push.
//
// ⚠️ IGNORA COMENTARIOS A PROPÓSITO. Este archivo, `errores.ts` y el hook que
//    estrenó el defecto NOMBRAN el patrón para explicarlo. Un detector que
//    mirara el texto crudo se dispararía con su propia documentación — es la
//    cuarta aparición medida de «la coincidencia vive dentro del comentario
//    que documenta la deuda», y acá se ataja en el detector, no con cuidado.
// ============================================================================

/** El único lugar donde la comprobación es legítima: la primera rama del helper. */
const PERMITIDO = 'src/lib/errores.ts'

const PATRON = /instanceof\s+Error/

/** Saca comentarios de línea y de bloque, y el contenido de los strings. */
export function soloCodigo(fuente: string): string {
  return fuente
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
}

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) return archivos(p)
    return /\.tsx?$/.test(p) && !/\.test\.tsx?$/.test(p) ? [p] : []
  })
}

const culpables = archivos('src')
  .map((f) => f.replace(/\\/g, '/'))
  .filter((f) => f !== PERMITIDO)
  .filter((f) => PATRON.test(soloCodigo(readFileSync(f, 'utf8'))))

describe('los errores de Supabase no se leen con instanceof', () => {
  it('🔴 ningún archivo de src/ usa `instanceof Error` fuera de errores.ts', () => {
    expect(
      culpables.join(', ') || 'ninguno',
      'el error de una RPC de Supabase NO es instanceof Error: es un objeto plano con ' +
      '`message`, así que esa comprobación cae al genérico y tira el mensaje del guard —' +
      'que se escribe accionable a propósito—. Usá `mensajeDeError(err, fallback)`',
    ).toBe('ninguno')
  })

  it('CONTROL POSITIVO — el detector encuentra el patrón en código', () => {
    // Sin esto, un detector roto daría «ninguno» arriba y pasaría.
    expect(PATRON.test(soloCodigo('const m = e instanceof Error ? e.message : "x"'))).toBe(true)
  })

  it('🔴 CONTROL NEGATIVO — no se dispara con el patrón DENTRO de un comentario', () => {
    // Es el control que hace usable al tripwire: este archivo, `errores.ts` y
    // el hook del cambio lo nombran para explicarlo. Sin esto, la propia
    // documentación de la regla la pondría roja, y alguien la aflojaría.
    expect(soloCodigo('// ojo: e instanceof Error no sirve acá')).not.toMatch(PATRON)
    expect(soloCodigo('/* e instanceof Error es un proxy */')).not.toMatch(PATRON)
  })

  it('CONTROL — `errores.ts` SÍ lo usa, y por eso está excluido', () => {
    // Si algún día el helper dejara de usarlo, la exclusión sobraría y este
    // caso lo diría: una allowlist con un miembro que ya no la necesita es una
    // puerta abierta sin razón.
    expect(
      PATRON.test(soloCodigo(readFileSync(PERMITIDO, 'utf8'))),
      'errores.ts ya no usa `instanceof Error`: sacá la excepción de este tripwire',
    ).toBe(true)
  })
})
