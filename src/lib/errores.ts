/**
 * Extrae el mensaje legible de un error, venga de donde venga.
 *
 * 🔴 POR QUÉ EXISTE — medido el 2026-09-01, con sonda end-to-end:
 *    el error que devuelve `supabase.rpc()` en el camino REAL **no es
 *    `instanceof Error`** (aunque la clase `PostgrestError` del paquete sí
 *    extiende `Error` — probar la clase exportada era un proxy, R4).
 *
 *    Con el patrón viejo — `err instanceof Error ? err.message : 'genérico'` —
 *    TODO error de negocio de una RPC caía en el genérico: el guard de la base
 *    decía *"Abri la jornada de caja antes de registrar una compra"* y el
 *    usuario leía *"Error al registrar la compra"*. Los guards se escriben
 *    accionables a propósito; el toast los tiraba a la basura.
 *
 *    Había 11 copias del patrón, y DOS ya tenían el arreglo local
 *    (useSalesHistory, POSPage): el defecto ya se había pagado dos veces sin
 *    barrer la clase. Esto es la barrida (R3).
 */
export function mensajeDeError(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message
  const m = (err as { message?: unknown } | null | undefined)?.message
  return typeof m === 'string' && m !== '' ? m : fallback
}

/**
 * ¿El error es una violación de unicidad de Postgres (`23505`)?
 *
 * 🔴 POR QUÉ POR CÓDIGO Y NO POR NOMBRE DE CONSTRAINT — 2026-09-04, deuda 90.
 *    Matchear el nombre del índice acoplaría el cliente a una cadena que vive
 *    en una migración: dos lados sin sincronizador (R1), y el día que alguien
 *    renombre el índice el mensaje vuelve al genérico SIN QUE NADA SE PONGA
 *    ROJO. El código `23505` lo define Postgres, no nosotros.
 *
 * ⚠️ Lo que esto asume, y hay que decirlo: que en `products` y `categories` la
 *    ÚNICA unicidad alcanzable sea la del nombre. La PK es un uuid v4 que el
 *    cliente genera fresco en cada alta, así que colisionar con ella no es un
 *    caso real. Si algún día una de esas tablas gana un segundo índice único,
 *    este helper deja de discriminar y hay que mirar el nombre.
 */
export function esNombreDuplicado(err: unknown): boolean {
  const code = (err as { code?: unknown } | null | undefined)?.code
  return code === '23505'
}
