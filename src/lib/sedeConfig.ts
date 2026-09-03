import type { Json } from '@/types/database.types'

export type PaymentMethod = 'cash' | 'card' | 'transfer' | 'nequi'

export interface SedeConfig {
  slug?: string | null
  cash_out_reasons?: string[]
  /**
   * 🔴 SUBCATEGORIAS DE GASTO — deuda 45. Vive acá y NO en un CHECK del esquema,
   * y la diferencia con `categoria` es **quién lee el reporte**: `categoria` es
   * estructural y CRUZA SEDES, así que si el cliente la inventara los reportes
   * dejarían de ser comparables. Una subcategoría de gasto **vive adentro de una
   * sede** y es del negocio — las de una ferretería no son las de una
   * distribuidora, y clavar el vocabulario de un cliente en el esquema choca con
   * que el producto es horizontal.
   *
   * ⚠️ Se elige de un DESPLEGABLE, nunca se teclea al cargar el gasto:
   * "publicidad" y "Publicidad" serían dos filas del reporte.
   */
  expense_subcategories?: string[]
  payment_methods?: PaymentMethod[]
  nequi_qr_url?: string | null
}

/**
 * Sembrada con las tres que el cliente ya usa en su archivo real
 * (`Control_Mp.xlsx`). Es un DEFAULT editable por sede, no una allowlist.
 *
 * ⛔ "Compra de inventario" NO está y no es un olvido: **va a Compras**. Es
 *    exactamente el error que el cliente comete hoy en su Excel, donde
 *    3.511.500 de sus 5.495.500 de "gastos" son compras (deuda 63).
 */
export const DEFAULT_EXPENSE_SUBCATEGORIES = ['Publicidad', 'Adecuación', 'Activo']

/**
 * Un activo no se consume en el mes. Se dice DONDE SE ELIGE, no en un
 * instructivo: hoy no importa —el cliente está arrancando y lo pidió junto—
 * pero cuando compare meses, uno con muebles va a parecer malo sin serlo.
 */
export const NOTA_ACTIVO =
  'Un activo no se consume en el mes: un escritorio sirve durante años. Queda ' +
  'acá porque así lo pediste, pero al comparar meses conviene separarlo — si no, ' +
  'el mes en que compraste muebles va a parecer malo sin serlo.'

/** ¿Esta subcategoría es la de activos? Se compara flexible: la lista es editable. */
export const esSubcategoriaDeActivo = (s: string | null | undefined) =>
  !!s && /activo/i.test(s)

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
