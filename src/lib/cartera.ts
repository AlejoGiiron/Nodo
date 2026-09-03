/**
 * Aritmética del vencimiento de la cartera — deuda 46.
 *
 * 🔴 POR QUÉ ES UNA FUNCIÓN PURA Y NO UNA VISTA SQL. Es una frontera de día
 *    sobre un `timestamptz`, o sea R7 en su forma más pura: no revienta, da un
 *    número plausible y equivocado, y quien lo lee **llama al cliente a
 *    cobrarle algo que no venció**. Una función pura se pone roja con una fecha
 *    inventada; una vista sólo se prueba con datos reales y un reloj ajeno.
 *
 * 🔴 Y NO SE GUARDA LA FECHA DE VENCIMIENTO, SE DERIVA. Guardarla sería un
 *    tercer lado del mismo dato (R1): el día que se corrija la fecha de una
 *    venta, la fecha guardada quedaría apuntando al lugar equivocado. El plazo
 *    y la fecha de la venta son los hechos; el vencimiento es una cuenta.
 */

/** El día calendario en América/Bogotá de un instante. NUNCA `iso.slice(0,10)`. */
function fechaBogota(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'America/Bogota',
  }).format(new Date(iso))
}

/**
 * Ancla al mediodía UTC para hacer aritmética de días sobre una fecha
 * calendario. El mediodía deja 12 horas de margen a cada lado, así que ningún
 * corrimiento de zona puede empujar el resultado al día vecino.
 */
function aDias(fecha: string): number {
  return Math.round(new Date(`${fecha}T12:00:00Z`).getTime() / 86_400_000)
}

function sumarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

/** Hoy en América/Bogotá. Es la única frontera de día válida del proyecto (R7). */
export function hoyBogota(): string {
  return fechaBogota(new Date().toISOString())
}

/**
 * La fecha en que vence una venta a crédito, o `null` si no tiene plazo.
 *
 * ⚠️ `null` no es un caso borde: es la respuesta correcta para una venta sin
 *    plazo pactado. La pantalla muestra el `—` del design system en vez de
 *    inventar un vencimiento.
 */
export function venceEl(
  createdAtISO: string,
  plazoDias: number | null | undefined,
): string | null {
  if (plazoDias == null) return null
  return sumarDias(fechaBogota(createdAtISO), plazoDias)
}

/**
 * Días que lleva vencida una venta a crédito.
 *
 *   `null` → no se puede decir (no hay plazo pactado)
 *   `0`    → todavía en plazo, incluido el propio día del vencimiento
 *   `n`    → n días pasados desde que venció
 *
 * 🔴 LA DISTINCIÓN QUE SOSTIENE TODO: `null` NO es `0`. Cero es una afirmación
 *    —"no está vencida"— y sin plazo no se puede afirmar nada. Compartir valor
 *    ahí sería el mismo error que este proyecto ya pagó cuatro veces: "todavía
 *    no sé" y "no hay nada" con la misma representación.
 */
export function diasVencidos(
  createdAtISO: string,
  plazoDias: number | null | undefined,
  hoy: string = hoyBogota(),
): number | null {
  const vence = venceEl(createdAtISO, plazoDias)
  if (vence == null) return null
  const dif = aDias(hoy) - aDias(vence)
  // El día del vencimiento el cliente TODAVÍA está en plazo: cobrarle ahí sería
  // cobrarle antes de tiempo.
  return dif > 0 ? dif : 0
}

/**
 * Días vencidos de un conjunto de ventas — el número por el que se ordena la
 * cartera. Es el MÁXIMO: lo que dispara la acción es la deuda más atrasada del
 * cliente, no el promedio.
 *
 * Devuelve `null` sólo si NINGUNA de sus ventas tiene plazo; si una lo tiene,
 * ésa manda. Una venta sin plazo no puede tapar a otra que sí venció.
 */
export function diasVencidosMax(
  ventas: { created_at: string; plazo_dias: number | null }[],
  hoy: string = hoyBogota(),
): number | null {
  let max: number | null = null
  for (const v of ventas) {
    const d = diasVencidos(v.created_at, v.plazo_dias, hoy)
    if (d == null) continue
    if (max == null || d > max) max = d
  }
  return max
}
