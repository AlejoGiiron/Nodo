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
  /**
   * 🔴 PLAZOS DE CRÉDITO OFRECIDOS — deuda 46. Enteros de DÍAS, nunca
   * etiquetas: "30 días" como texto no se puede sumar a una fecha. Va por sede
   * por la misma razón que las subcategorías: otro negocio maneja otros plazos.
   */
  plazos_credito?: number[]
  /** El que se ofrece cuando el cliente no tiene plazo pactado. */
  plazo_credito_default?: number

  /**
   * 🔴 NIVEL DE PRECIO POR DEFECTO DE LA SEDE — deuda 101. Segundo eslabon de la
   * cadena **linea → cliente → sede → L1**: se usa cuando la venta no tiene
   * cliente (`orders.customer_id` es nullable y la mayoria de las ventas de
   * mostrador no lo tienen) o cuando el cliente no tiene nivel pactado.
   *
   * ⚠️ NO es fail-closed a proposito: bloquear la venta por falta de lista
   * romperia el mostrador, que es el mismo intercambio que ya se rechazo con
   * `handle_new_user` — un guard que estorba el camino de todos por un caso de
   * borde no se relaja, se le da su propio camino.
   */
  nivel_precio_default?: number
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

/** Sembrados con los que el cliente confirmó que maneja. Editables por sede. */
export const DEFAULT_PLAZOS_CREDITO = [8, 15, 30]
export const DEFAULT_PLAZO_CREDITO = 30

/**
 * 🔴 EL ULTIMO ESLABON DE LA CADENA DE NIVELES, Y EL UNICO LITERAL — deuda 101.
 * `linea → cliente → sede → L1`. Los tres primeros son datos; este es el piso.
 *
 * **L1 no es un nivel inventado: es el que la clienta ya usaba.** El campo unico
 * de precio del formulario de producto lo tecleaba como su PRECIO BASE, y su
 * precio base ES L1 — verificado, 22 de 22 coinciden. Por eso el formulario
 * sigue teniendo un campo y ese campo escribe L1.
 *
 * ⚠️ R1 ANTICIPADA — se escribe ANTES de que exista el segundo lado, que es la
 * primera vez que lo hacemos: **hoy este literal tiene UN SOLO LADO**, porque la
 * resolucion del nivel es 100% del cliente. **El dia que un reporte agrupe por
 * nivel EN EL SERVIDOR, va a necesitar este mismo numero y seran dos lados sin
 * nada que los sincronice.** Ese dia, o el servidor lo recibe como parametro, o
 * este valor baja a `sedes.config` y deja de ser literal.
 */
export const NIVEL_PRECIO_DEFAULT = 1

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
