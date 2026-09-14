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

/** Qué unicidad se violó. `null` = el error no es una violación de unicidad. */
export type CampoDuplicado = 'nombre' | 'otro' | null

/**
 * ¿Qué unicidad de Postgres (`23505`) se violó?
 *
 * 🔴 ESTE HELPER MIRABA SÓLO EL CÓDIGO `23505` Y DEVOLVÍA UN BOOLEANO —y su
 *    propio comentario, escrito el 2026-09-04, decía TEXTUAL: *«si algún día
 *    una de esas tablas gana un segundo índice único, este helper deja de
 *    discriminar y hay que mirar el nombre»*. **Ese día fue el 2026-09-07**:
 *    `products` ganó `products_codigo_unico_por_sede` (deuda 41), y un código
 *    repetido habría dicho «ya existe un producto con ese NOMBRE» — un mensaje
 *    que manda a mirar el campo equivocado.
 *
 * ⏸️ **ESE ÍNDICE YA NO EXISTE: se retiró el 2026-09-14** al revisar la decisión
 *    A de la deuda 41. Se deja escrito el episodio porque es lo que explica por
 *    qué este helper mira el nombre del índice, y esa razón **sigue viva**:
 *    `products` y `categories` conservan sus índices de nombre. Lo que caducó es
 *    el ejemplo, no el mecanismo.
 *
 * ⚠️ Así que ahora SÍ se mira el nombre del índice, y el argumento que lo
 *    desaconsejaba sigue siendo cierto: **son dos lados sin sincronizador**
 *    —la migración y esta constante— y renombrar el índice devolvería el
 *    mensaje genérico sin ponerse rojo. Lo que cambió es que la alternativa
 *    dejó de existir: sin mirar el nombre, el mensaje MIENTE. Se elige el
 *    riesgo de un mensaje genérico sobre el de un mensaje falso.
 *    El otro lado se declara acá y `errores.test.ts` clava las cadenas que quedan.
 *
 * 🔴 Y `'otro'` NO es un caso de más: un índice único que no reconocemos debe
 *    dar un mensaje que NO nombre ningún campo. Caer a `'nombre'` sería
 *    exactamente el defecto que este cambio corrige, con otro disfraz.
 */
// 🔴 `codigo` SALIÓ DE ESTE MAPA el 2026-09-14, y no porque el helper fallara:
//    **el índice único dejó de existir** (revisión de la decisión A de la deuda
//    41 — el cliente usa el código como código de LÍNEA, y sus cuatro galletas
//    Mr Cream comparten `004-6` a propósito). Sin índice, un `23505` que lo
//    nombre no puede ocurrir, así que la entrada era una afirmación falsa sobre
//    el esquema — la clase de estado podrido que este repo viene midiendo.
//
// ⚠️ Y quitarla es seguro POR `'otro'`, no a pesar de él: si algún día vuelve un
//    índice único sobre el código, el mensaje cae al genérico —que no nombra
//    ningún campo— en vez de mentir diciendo «nombre». Ése es el default que se
//    diseñó justamente para esto, y es la dirección correcta del fallo.
const INDICES = {
  nombre: ['products_nombre_unico_por_sede', 'categories_nombre_unico_por_sede'],
} as const

export function campoDuplicado(err: unknown): CampoDuplicado {
  const e = err as { code?: unknown; message?: unknown; details?: unknown } | null | undefined
  if (e?.code !== '23505') return null
  // Postgres pone el nombre del índice en el mensaje; PostgREST lo reenvía.
  const texto = `${typeof e?.message === 'string' ? e.message : ''} ${typeof e?.details === 'string' ? e.details : ''}`
  for (const [campo, nombres] of Object.entries(INDICES)) {
    if (nombres.some((n) => texto.includes(n))) return campo as 'nombre'
  }
  return 'otro'
}
