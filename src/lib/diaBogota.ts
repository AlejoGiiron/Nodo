/**
 * Límites de un día de Bogotá como instantes ISO en UTC (R7).
 *
 * 🔴 FUENTE ÚNICA. Vivían dos copias idénticas —`useSalesHistory` y
 *    `useShiftHistory`— y un tercer filtro, el de movimientos de Inventario,
 *    escribía su propia versión: `new Date('AAAA-MM-DD')`. Esa forma JavaScript
 *    la interpreta como medianoche **UTC**, o sea las 19:00 del día ANTERIOR en
 *    Bogotá. Medido contra LAB el 2026-09-17: un movimiento de las 21:23 del 15
 *    aparecía filtrando el 16. Ventas y Turnos cortaban bien por tener cada uno su
 *    copia correcta, no porque algo los sincronizara (R1).
 *
 * Bogotá es UTC-5 fijo, sin horario de verano, así que el desfase se escribe
 * literal. No depende de la zona horaria del navegador: `to + 'T23:59:59'` sin
 * desfase sí dependía, y daba bien sólo en una máquina configurada en Bogotá.
 */

/** 'AAAA-MM-DD' (día de Bogotá) → primer instante del día, en ISO UTC. */
export function dayStartISO(day: string): string {
  return new Date(`${day}T00:00:00-05:00`).toISOString()
}

/** 'AAAA-MM-DD' (día de Bogotá) → último milisegundo del día, en ISO UTC. */
export function dayEndISO(day: string): string {
  return new Date(`${day}T23:59:59.999-05:00`).toISOString()
}
