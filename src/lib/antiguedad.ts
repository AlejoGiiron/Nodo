/**
 * Antigüedad de una deuda — los cálculos de `AgingBar`, en su propio archivo.
 *
 * Viven acá y no junto al componente por la misma razón que `formatoCOP`:
 * exportar funciones desde un archivo de componentes rompe el fast refresh de
 * Vite, y el linter lo marca. Separarlos también los hace testeables sin montar
 * nada.
 *
 * 🔴 ESTO CALCULA ANTIGÜEDAD, NO VENCIMIENTO. Ver la cabecera de AgingBar.
 */

/** Días desde la fecha más vieja. La frontera de día se calcula en Bogotá (R7). */
export function diasDeAntiguedad(iso: string): number {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' })
  const dia = (d: Date) => new Date(`${fmt.format(d)}T00:00:00`)
  const ms = dia(new Date()).getTime() - dia(new Date(iso)).getTime()
  return Math.max(0, Math.round(ms / 86_400_000))
}

export const TRAMOS = [
  { hasta: 30, token: 'var(--d1)' },
  { hasta: 60, token: 'var(--d2)' },
  { hasta: 90, token: 'var(--d3)' },
  { hasta: Infinity, token: 'var(--d4)' },
]

/** En qué tramo cae una antigüedad: 0 = 0–30 … 3 = +90. */
export const tramoDe = (dias: number) => TRAMOS.findIndex((t) => dias <= t.hasta)

