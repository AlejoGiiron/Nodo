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
  it('la paleta está clavada como lista, no como número', () => {
    expect(CATEGORY_COLORS).toEqual([
      '#10b981', '#059669', '#2563eb', '#7c3aed',
      '#db2777', '#d97706', '#0891b2', '#64748b',
    ])
  })

  it('no hay repetidos: dos muestras iguales son una opción que no se puede elegir', () => {
    expect(new Set(CATEGORY_COLORS).size).toBe(CATEGORY_COLORS.length)
  })
})
