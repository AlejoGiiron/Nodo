import type { Json } from '@/types/database.types'

export type PaymentMethod = 'cash' | 'card' | 'transfer' | 'nequi'

export interface SedeConfig {
  slug?: string | null
  cash_out_reasons?: string[]
  payment_methods?: PaymentMethod[]
  nequi_qr_url?: string | null
}

/**
 * Mezcla un patch sobre la configuración ACTUAL de la sede — deuda 58, A1 §3.4.
 *
 * 🔴 POR QUÉ ES UNA FUNCIÓN Y NO UN SPREAD INLINE. `useSedeConfig.updateConfig`
 *    hacía `{ ...config, ...patch }` con `config = (sede?.config as SedeConfig)
 *    ?? {}`. Si la consulta de la sede **falló** —`sede` undefined, `isLoading`
 *    ya en false—, el spread partía de `{}` y el UPDATE escribía **sólo las dos
 *    claves del patch**: `slug` y `nequi_qr_url` desaparecían de la fila.
 *
 *    No es "guardar mal": es **borrar** claves que nadie tocó, escribiendo un
 *    objeto entero sobre otro. La ventana por TIEMPO es chica porque AppLayout
 *    deja la sede en caché; **el camino de ERROR estaba abierto**.
 *
 * 🔴 FAIL-CLOSED (R2): sin configuración conocida no se escribe. Un `{}` como
 *    base es exactamente "lo que no está prohibido pasa en silencio".
 */
export function mergeSedeConfig(
  actual: SedeConfig | null | undefined,
  patch: Partial<SedeConfig>,
): Json {
  if (actual == null) {
    throw new Error(
      'No se puede guardar la configuración: la sede no está cargada. ' +
      'Guardar ahora borraría las claves que no estás editando.',
    )
  }
  return { ...actual, ...patch } as Json
}
