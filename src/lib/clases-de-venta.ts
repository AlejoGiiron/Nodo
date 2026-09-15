import type { Enums } from '@/types/database.types'

export type PayMethod = Enums<'payment_method'>

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * CÓMO SE COBRÓ UNA VENTA — una sola fuente para la COLUMNA y para el FILTRO.
 *
 * 🔴 EL DEFECTO QUE ESTE ARCHIVO CIERRA, y era R1 con el índice de una lista:
 *    el Historial tenía DOS fuentes para la misma pregunta. El combo era una
 *    lista literal de los 4 valores del enum `payment_method`; la columna la
 *    producía `methodDisplay()`, que ante una venta SIN filas en `payments`
 *    deriva el rótulo de `payment_status`, de `total` y de `cancelled_at` — y
 *    produce cinco rótulos más que el combo no conocía.
 *
 *    Resultado: la clienta veía «Fiado» en la columna y no podía filtrarlo.
 *
 * 🔴 Y ERA PEOR QUE UNA OPCIÓN FALTANTE. El filtro por método usaba
 *    `payments!inner`, o sea un INNER JOIN: una orden sin filas en `payments`
 *    **desaparece de la consulta**, no de la pantalla. Así que con CUALQUIER
 *    valor del filtro se caían las ventas a crédito, las cortesías y las
 *    anuladas — no faltaba una opción, había una clase entera de ventas
 *    inalcanzable por todos los valores.
 *
 * ── LO QUE SE MIDIÓ ANTES DE ELEGIR EL ARREGLO (lab, 2026-09-15) ────────────
 * Sobre 2.988 ventas numeradas:
 *
 *   sin `!inner`, el filtro embebido NO acota al padre    → 2.988 (todas)
 *   `.is('payments', null)` SÍ lo expresa                 → 1.384
 *     · anuladas                                             570
 *     · cortesía (total 0, viva)                             110
 *     · fiado vivo (pending/partial)                         528
 *     · fiado saldado (paid, total > 0)                      176
 *                                                          ─────
 *                                                           1.384  ← cierra
 *
 * Las cuatro clases **particionan** el conjunto sin resto, y el control cruzado
 * da 0 ventas CON pagos en `pending/partial`. Esos dos números son los que
 * descartan las dos salidas que parecían obvias:
 *
 *   ⛔ «sacar el inner join»        → el filtro se vuelve un no-op (2.988)
 *   ⛔ «una sección por clase»      → serían TRES secciones, y no escala: el
 *                                     molde de «Anuladas (N)» resolvió un
 *                                     miembro de la clase, no la clase
 *   ✅ una lista con su predicado   → el combo y la columna salen del mismo
 *                                     lugar, y agregar una clase es una fila
 *
 * ⚠️ Y el vocabulario: hacia la clienta esto se llama **crédito**; adentro sigue
 *    diciendo `fiado`, que es el valor con el que ya viven los permisos, la ruta
 *    y los testids. Es deliberado, igual que turno/jornada en la deuda 38.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Lo mínimo que hace falta de una orden para saber cómo se cobró. */
export interface FilaDeVenta {
  payment_status: string
  total: number
  cancelled_at?: string | null
  payments: { method: PayMethod }[]
}

export const ETIQUETA_DE_METODO: Record<PayMethod, string> = {
  cash: 'Efectivo', card: 'Tarjeta', transfer: 'Transferencia', nequi: 'Nequi / QR',
}

/** Los cuatro métodos REALES: los que escriben fila en `payments`. */
export const METODOS_REALES: PayMethod[] = ['cash', 'card', 'transfer', 'nequi']

/**
 * Las clases que NO escriben fila en `payments`, en ORDEN DE EVALUACIÓN.
 *
 * ⚠️ El orden no es estético: una anulada con total 0 es una anulada, no una
 *    cortesía. La primera que reconozca la fila gana, y es el mismo orden que
 *    tenía `methodDisplay` — se conserva a propósito para que este cambio no
 *    mueva ningún rótulo existente.
 */
export interface ClaseSinPago {
  valor: 'anulada' | 'cortesia' | 'fiado'
  /** Lo que dice el COMBO. */
  label: string
  /** ¿Esta fila es de esta clase? */
  detecta: (r: FilaDeVenta) => boolean
  /** Lo que dice la COLUMNA. Una clase puede tener varios rótulos. */
  etiqueta: (r: FilaDeVenta) => string
}

export const CLASES_SIN_PAGO: ClaseSinPago[] = [
  {
    valor: 'anulada',
    label: 'Anuladas',
    detecta: (r) => !!r.cancelled_at,
    etiqueta: () => 'Anulada',
  },
  {
    valor: 'cortesia',
    // Una venta con descuento del 100%: total 0, saldada, y sin fila de pago
    // porque no entró dinero.
    label: 'Cortesía (total 0)',
    detecta: (r) => r.total === 0,
    etiqueta: () => 'Cortesía',
  },
  {
    valor: 'fiado',
    label: 'Crédito (sin pago registrado)',
    // La última de la lista atrapa el resto: si no tiene pagos, no está anulada
    // y su total no es cero, es una venta a crédito.
    detecta: () => true,
    // ⚠️ «Crédito» es la palabra de la PANTALLA; adentro el valor sigue siendo
    //    `fiado` —permisos, ruta, testids—. Deliberado, igual que turno/jornada
    //    en la deuda 38: ver la deuda 109.
    etiqueta: (r) =>
      r.payment_status === 'paid' ? 'Crédito (saldado)'
        : r.payment_status === 'partial' ? 'Crédito (parcial)'
          : 'Crédito',
  },
]

/** El valor que puede tener el filtro del Historial. `''` = sin filtrar. */
export type ValorDeFiltro = PayMethod | ClaseSinPago['valor'] | ''

/**
 * Las opciones del combo, DERIVADAS de las dos listas de arriba.
 *
 * 🔴 No se escriben a mano: ése era exactamente el lado que se congelaba. Si
 *    mañana el enum gana un método o aparece otra clase sin pago, la opción
 *    aparece sola.
 */
export const OPCIONES_DE_FILTRO: { value: ValorDeFiltro; label: string }[] = [
  { value: '', label: 'Todos los métodos' },
  ...METODOS_REALES.map((m) => ({ value: m as ValorDeFiltro, label: ETIQUETA_DE_METODO[m] })),
  ...CLASES_SIN_PAGO.map((c) => ({ value: c.valor as ValorDeFiltro, label: c.label })),
]

/** ¿Este valor del filtro es un método real (los que viven en `payments`)? */
export const esMetodoReal = (v: ValorDeFiltro): v is PayMethod =>
  (METODOS_REALES as string[]).includes(v)

/**
 * El rótulo de la columna «Método».
 *
 * Con pagos, los métodos de la venta —un pago mixto dice «Efectivo + Nequi»—.
 * Sin pagos, la primera clase que la reconozca.
 */
export function etiquetaDeCobro(r: FilaDeVenta): string {
  // ⚠️ La anulada gana ANTES de mirar los pagos, igual que antes: una anulada
  //    perdió los suyos, y rotularla por un método sería describir una venta
  //    que ya no existe. Medido: las 570 anuladas del lab no tienen pagos.
  if (r.cancelled_at) return 'Anulada'
  const metodos = [...new Set(r.payments.map((p) => p.method))]
  if (metodos.length > 0) return metodos.map((m) => ETIQUETA_DE_METODO[m]).join(' + ')
  return (CLASES_SIN_PAGO.find((c) => c.detecta(r)) ?? CLASES_SIN_PAGO[CLASES_SIN_PAGO.length - 1])
    .etiqueta(r)
}
