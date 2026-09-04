import { describe, it, expect } from 'vitest'
import { CATEGORY_COLORS, COLOR_POR_DEFECTO_EN_LA_BASE } from './coloresDeCategoria'

/**
 * Tripwire de la deuda 91.
 *
 * 🔴 QUÉ PROTEGE, Y CONTRA QUÉ CAMBIO: que el `default` de `categories.color`
 *    pertenezca a la paleta que el selector ofrece. Ese era exactamente el
 *    defecto medido —`#6366f1` no estaba entre los ocho— y dejó **164
 *    categorías del lab con un color que su propio formulario no podía
 *    producir**.
 *
 * ⚠️ LO QUE NO ES: no verifica la BASE. Postgres no puede leer TypeScript, así
 *    que el `default` real vive en una migración y este archivo repite el
 *    literal. Es un tripwire sobre el lado de TS, no una sincronización — y se
 *    dice acá para que su verde no se lea como «los dos lados coinciden».
 *    El otro lado: `supabase/migrations/20260904160000_default_color_categoria.sql`.
 */
describe('paleta de colores de categoría', () => {
  it('🔴 el default de la base pertenece a la paleta que el selector ofrece', () => {
    expect(
      CATEGORY_COLORS.includes(COLOR_POR_DEFECTO_EN_LA_BASE),
      `el default de \`categories.color\` es ${COLOR_POR_DEFECTO_EN_LA_BASE} y NO está entre las ` +
      `${CATEGORY_COLORS.length} muestras del selector [${CATEGORY_COLORS.join(', ')}]. ` +
      'Toda categoría creada sin color nacería con un valor que su propio formulario no puede ' +
      'producir — el defecto de la deuda 91, que dejó 164 categorías así.',
    ).toBe(true)
  })

  // Control negativo del propio tripwire: si `includes` no discriminara, el
  // caso de arriba pasaría con cualquier valor y sería decorativo.
  it('y el tripwire puede dar rojo: un color inventado NO pertenece', () => {
    expect(CATEGORY_COLORS.includes('#6366f1')).toBe(false)   // el default viejo
    expect(CATEGORY_COLORS.includes('#000000')).toBe(false)
  })

  // La paleta es una LISTA ORDENADA, no un conteo: un `toHaveLength(8)` no ve
  // una SUSTITUCIÓN, que es el cambio que hace alguien «arreglando» un color.
  // Mismo criterio que el tripwire del catálogo de permisos.
  //
  // 🔴 Y el rojo NOMBRA QUÉ CAMBIÓ. La versión anterior comparaba las dos listas
  //    con `toEqual` y su fallo decía `expected [ '#7e3c9a', …(6) ] to deeply
  //    equal [ '#10b981', …(6) ]` — los dos arrays bien, y a mirar el lugar
  //    equivocado. Se asevera sobre un STRING construido con los que faltan y
  //    los que sobran, igual que el tripwire de permisos.
  it('la paleta está clavada como lista, y el rojo dice qué cambió', () => {
    const FIJADA = [
      '#7e3c9a', '#453c9a', '#3c789a', '#338467',
      '#4c8132', '#79772f', '#9a523c', '#9a3c75',
    ]
    const faltan = FIJADA.filter((c) => !CATEGORY_COLORS.includes(c))
    const sobran = CATEGORY_COLORS.filter((c) => !FIJADA.includes(c))
    expect(
      `salieron: ${faltan.join(', ') || 'ninguno'} · entraron: ${sobran.join(', ') || 'ninguno'}`,
    ).toBe('salieron: ninguno · entraron: ninguno')
    // El orden también se fija: `CATEGORY_COLORS[0]` es el color con el que nace
    // toda categoría nueva, así que reordenar NO es cosmético.
    expect(CATEGORY_COLORS[0], 'el primero es el default de toda categoría nueva').toBe('#7e3c9a')
    expect([...CATEGORY_COLORS]).toEqual(FIJADA)
  })

  // 🔴 El emerald de Vento SALIÓ de la paleta el 2026-09-04 (deuda 88 + 91): era
  //    el acento de otro producto Y verde, que §1.2 reserva a confirmación — o
  //    sea que toda categoría nueva nacía con el color equivocado en el rol
  //    equivocado. Este caso existe para que no vuelva de contrabando.
  it('el emerald de Vento NO está en la paleta', () => {
    expect(CATEGORY_COLORS).not.toContain('#10b981')
    expect(CATEGORY_COLORS).not.toContain('#059669')
  })

  it('no hay repetidos: dos muestras iguales son una opción que no se puede elegir', () => {
    expect(new Set(CATEGORY_COLORS).size).toBe(CATEGORY_COLORS.length)
  })
})
