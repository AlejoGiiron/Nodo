import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import {
  createOrder, addOrderItemsWithExtras, registerSalePayment, assignOrderNumber,
  type SalePaymentPart,
} from '@/lib/supabase-helpers'
import { useCashShift } from '@/hooks/useCashShift'
import { mensajeDeError } from '@/lib/errores'
import { captureError } from '@/lib/sentry'
import type { CartItem } from '@/stores/cartStore'
import type { Enums } from '@/types/database.types'

/**
 * LA ESCRITURA DEL COBRO — una sola, para las dos superficies.
 *
 * 🔴 POR QUÉ EXISTE, Y POR QUÉ AHORA. El cobro pasa de modal a columna (§8.15
 * reabierta), y eso se hace **por cortes**: durante la transición conviven la
 * columna del mostrador y el modal. Dos superficies que cobran es R1 en el flujo
 * más caro del producto — **salvo que la escritura sea una sola**, que es
 * exactamente lo que este hook garantiza. Mismo patrón que Gastos, donde el
 * formulario lateral y el modal del banner comparten `addMovement`.
 *
 * ⚠️ **Y «comparten la escritura» es una afirmación de diseño, así que se MIDE:**
 * el spec de cada corte cobra el mismo escenario por las dos superficies y
 * compara **lo que quedó en la base** —orden, líneas, pagos—, no lo que muestran.
 * Comparar las pantallas sería comparar dos vistas, que no es lo que está en duda.
 *
 * ── QUÉ INCLUYE, Y POR QUÉ TANTO ──────────────────────────────────────────
 * No sólo el `insert`: también el manejo de error, el `captureError` y las
 * invalidaciones. Si la columna y el modal compartieran la escritura pero cada
 * una tratara el error a su manera, el defecto que R1 describe volvería por la
 * puerta de al lado — un cobro que falla y avisa distinto según dónde se hizo.
 */

export type PaymentMethodUI = 'efectivo' | 'tarjeta' | 'transferencia' | 'nequi' | 'fiado'

/** Los cuatro medios que mueven dinero, a su valor en la base. */
const MAPA_DE_METODOS: Record<Exclude<PaymentMethodUI, 'fiado'>, Enums<'payment_method'>> = {
  efectivo: 'cash',
  tarjeta: 'card',
  transferencia: 'transfer',
  nequi: 'nequi',
}

export interface DatosDeCobro {
  perfil: { id: string; sede_id: string }
  /**
   * ⚠️ `canal` y `discount_type` son `text` con CHECK en la base, NO enums de
   * Postgres, así que `database.types.ts` los tipa como `string` y `Enums<>` no
   * los conoce. Se declara la unión a mano y se anota de dónde sale — es un lado
   * más del contrato R1, y el que se congela sin que `tsc` avise.
   * Fuente: el CHECK de `supabase/migrations/`; el otro lado vive en POSPage.
   */
  canal: 'mostrador' | 'whatsapp' | 'telefono'
  items: CartItem[]
  /** Total ya calculado por la pantalla. Ver la nota de la deuda 80 abajo. */
  total: number
  discountAmt: number
  discountType: 'fixed' | 'pct' | null
  discountReason: string
  method: PaymentMethodUI
  split: boolean
  splitParts: SalePaymentPart[]
  customerId: string | null
  customerName: string
  plazoDias: number | null
  /** Sólo para el reporte de errores: desde qué superficie se cobró. */
  origen: 'columna' | 'modal'
}

export interface ResultadoDeCobro {
  orderId: string
  orderNumber: number | null
  numeroReservado: number | null
}

export function useCobro() {
  const queryClient = useQueryClient()
  const { refetchSales } = useCashShift()

  /**
   * Cobra. Devuelve el resultado, o `null` si falló — y en ese caso ya avisó
   * por toast y reportó el error. El llamador decide qué hacer con la pantalla.
   */
  const cobrar = async (d: DatosDeCobro): Promise<ResultadoDeCobro | null> => {
    const esFiado = d.method === 'fiado'
    if (esFiado && !d.customerId) {
      toast.error('Selecciona un cliente para la venta a fiado')
      return null
    }
    try {
      // Venta a fiado: la orden se crea como pendiente de pago y ligada al
      // cliente; NO entra dinero (no toca caja) y NO se registra payment.
      // El stock SÍ se descuenta igual (la mercancía salió). Se copia el nombre
      // del cliente a `customer_name` para que tickets/historial lo lean.
      const { data: order, error: orderErr } = await createOrder({
        canal: d.canal,
        status: 'pending',
        // 🔴 SIN `total` — deuda 80. Lo deriva el servidor de las líneas; el
        //    `total` de acá se usa para MOSTRAR y para el cobro, donde funciona
        //    como cruce contra el derivado.
        sede_id: d.perfil.sede_id,
        created_by: d.perfil.id,
        // Descuento REAL persistido (monto en COP ya reflejado en total).
        discount_amount: d.discountAmt,
        discount_type: d.discountAmt > 0 ? d.discountType : null,
        discount_reason: d.discountAmt > 0 ? (d.discountReason.trim() || null) : null,
        ...(esFiado
          ? {
              payment_status: 'pending' as const,
              customer_id: d.customerId,
              customer_name: d.customerName,
              // El plazo se CONGELA en la venta (deuda 46): la cartera deriva
              // de `orders`, así que leerlo del cliente daría otro vencimiento
              // mañana para una venta de enero.
              plazo_dias: d.plazoDias,
            }
          : {}),
      })
      if (orderErr || !order) throw orderErr ?? new Error('Error al crear orden')

      const { error: itemsErr } = await addOrderItemsWithExtras(
        order.id,
        d.items.map((item) => ({
          product_id: item.product.id,
          qty: item.qty,
          // 🔴 El precio PACTADO. `products.price` quedó como sugerencia y no
          //    se persiste en ningún lado (deuda 75).
          unit_price: item.price,
          notes: item.note || null,
          extras: item.extras.map((ex) => ({ extra_id: ex.extra_id, qty: ex.qty })),
        })),
      )
      if (itemsErr) throw itemsErr

      // Venta GRATIS (total 0 = descuento del 100%): NO hay dinero que cobrar.
      // Se salta `register_sale_payment` (valida amount>0). La orden queda
      // registrada SIN payment; `payment_status='paid'` por default —saldada, no
      // es fiado—. El número se asigna igual, abajo.
      if (!esFiado && d.total > 0) {
        // Un solo camino de cobro: simple = una parte al total; dividir = las
        // partes del editor. La RPC valida atómicamente que Σ = total y rechaza
        // si no cuadra, e inserta una fila por método.
        const parts: SalePaymentPart[] = d.split
          ? d.splitParts
          : [{ method: MAPA_DE_METODOS[d.method as Exclude<PaymentMethodUI, 'fiado'>], amount: d.total }]
        const { error: payErr } = await registerSalePayment(order.id, parts)
        if (payErr) throw payErr
      }

      // Numeración: es una venta real (cobrada o a fiado) → número correlativo.
      // Si falla NO se tumba la venta: queda registrada igual, y quien llamó
      // muestra el estado de «sin número» con su reintento.
      const num = await assignOrderNumber(order.id, d.perfil.sede_id)

      if (esFiado) queryClient.invalidateQueries({ queryKey: ['debts'] })
      refetchSales()

      return {
        orderId: order.id,
        orderNumber: num.orderNumber,
        numeroReservado: num.numeroReservado,
      }
    } catch (err) {
      const msg = mensajeDeError(err, 'Error desconocido')
      toast.error(`Error al procesar el cobro: ${msg}`)
      console.error('[checkout]', err)
      // El toast le dice al cajero que falló, pero no nos dice a nosotros por
      // qué. Es el flujo que más importa: si esto se rompe, no se puede cobrar.
      captureError(err, 'cobro', {
        origen: d.origen,
        esFiado,
        pagoDividido: d.split,
        cantidadItems: d.items.length,
      })
      return null
    }
  }

  return { cobrar }
}
