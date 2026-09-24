import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import {
  getDebts, getDebtPayments, registerDebtPayment,
  type DebtRow, type DebtPaymentRow, type RegisterDebtPaymentResult,
} from '@/lib/supabase-helpers'
import { useAuth } from '@/hooks/useAuth'
import type { SentryArea } from '@/lib/sentry'
import { mensajeDeError } from '@/lib/errores'

export type { DebtPaymentRow }

/** Una deuda a fiado con su saldo ya derivado. */
export interface Debt {
  id: string
  order_number: number | null
  created_at: string
  /**
   * Lo que la venta vale HOY: el documento original mas los cambios de
   * producto. Es lo que hay que cobrar, y por eso es este el que lleva el
   * nombre corto — el unico consumidor es la columna «Total» de Cartera.
   */
  total: number
  /** Lo que decia el documento el dia que se vendio. La historia no se reescribe. */
  totalOriginal: number
  /** Cuanto movieron los cambios de producto. 0 = no hubo ninguno. */
  deltaCambios: number
  abonado: number
  saldo: number
  payment_status: string             // 'pending' | 'partial'
  /** Plazo pactado EN ESTA VENTA. null = sin plazo: el vencimiento no se calcula. */
  plazo_dias: number | null
  customerId: string | null
  customerName: string
}

const deriveDebt = (row: DebtRow): Debt => {
  const abonado = (row.debt_payments ?? []).reduce((s, p) => s + p.amount, 0)
  // 🔴 Desde 20260924120000 el saldo es `total + Σ deltas − abonos`. Sin esto
  //    la cartera muestra el total del documento ORIGINAL: un numero plausible
  //    que hace que le cobre al cliente el producto que ya devolvio.
  const deltaCambios = (row.sale_changes ?? []).reduce((s, c) => s + Number(c.delta_total), 0)
  const totalActual = Number(row.total) + deltaCambios
  return {
    id: row.id,
    order_number: row.order_number,
    created_at: row.created_at,
    total: totalActual,
    totalOriginal: Number(row.total),
    deltaCambios,
    abonado,
    // El clamp a 0 lo protege de un saldo negativo. Hoy no puede venir de un
    // cambio: `register_sale_change` RECHAZA si quedaria pagada de mas.
    saldo: Math.max(0, totalActual - abonado),
    payment_status: row.payment_status,
    plazo_dias: row.plazo_dias ?? null,
    customerId: row.customer_id,
    customerName: row.customers?.name ?? row.customer_name ?? 'Cliente',
  }
}

/** Cuentas por cobrar: órdenes a fiado pendientes/parciales con su saldo. */
export function useDebts() {
  const { profile } = useAuth()
  const sedeId = profile?.sede_id ?? null

  const query = useQuery({
    queryKey: ['debts', sedeId],
    queryFn: async () => {
      const { data, error } = await getDebts(sedeId!)
      if (error) throw error
      return (data ?? []).map((r) => deriveDebt(r as unknown as DebtRow))
    },
    enabled: !!sedeId,
    staleTime: 15_000,
  })

  return {
    debts: query.data ?? [],
    isLoading: query.isLoading,
    isFetching: query.isFetching,
  }
}

/** Historial de abonos de una orden a fiado. */
export function useDebtPayments(orderId: string | null) {
  const query = useQuery({
    queryKey: ['debt_payments', orderId],
    queryFn: async () => {
      const { data, error } = await getDebtPayments(orderId!)
      if (error) throw error
      return (data ?? []) as unknown as DebtPaymentRow[]
    },
    enabled: !!orderId,
    staleTime: 15_000,
  })

  return { payments: query.data ?? [], isLoading: query.isLoading }
}

/**
 * Registra un abono vía la RPC register_debt_payment (atómica). Tras el éxito
 * invalida cuentas por cobrar, la orden, el historial de abonos y la caja
 * (movimientos + ventas del turno), para que el ingreso y el nuevo saldo se
 * reflejen sin recargar.
 *
 * Toasts inequívocos según el retorno: el abono SIEMPRE quedó registrado; el
 * matiz es si la deuda se saldó y si el efectivo entró a la caja.
 */
export function useRegisterDebtPayment() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    meta: { area: 'fiado' satisfies SentryArea },
    mutationFn: async (
      { orderId, amount, paymentMethod }: { orderId: string; amount: number; paymentMethod: string },
    ) => {
      const { data, error } = await registerDebtPayment(orderId, amount, paymentMethod)
      if (error) throw error
      return data as unknown as RegisterDebtPaymentResult
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['debts'] })
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      queryClient.invalidateQueries({ queryKey: ['debt_payments'] })
      queryClient.invalidateQueries({ queryKey: ['cash_movements'] })
      queryClient.invalidateQueries({ queryKey: ['shift_payments'] })

      const saldoCOP = new Intl.NumberFormat('es-CO', {
        style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 0,
      }).format(result.saldo_restante)

      // 🔴 `requiere_conciliacion`, no `!jornada_abierta`: la RPC ya decidió si
      //    este abono quedó pendiente de conciliar, y esa es la fuente. Derivarlo
      //    acá sería reimplementar la regla en un segundo lugar (R1).
      //    ⚠️ Antes decía `!result.shift_open` — una clave que la RPC NUNCA
      //    devolvió. `undefined` es falsy, así que el aviso de degradación salía
      //    SIEMPRE que el método era efectivo, incluso con el ingreso creado.
      if (result.requiere_conciliacion) {
        // Inequívoco: el abono SÍ quedó; lo único que NO pasó es el ingreso de
        // caja (no hay turno al cual atribuirlo).
        toast(
          'Abono registrado. El efectivo no entró a caja (sin turno abierto).',
          { icon: '⚠️', duration: 7000 },
        )
      } else if (result.new_status === 'paid') {
        const extra = result.cash_movement_created ? ' · Ingreso de caja registrado.' : ''
        toast.success(`Deuda saldada.${extra}`)
      } else {
        const extra = result.cash_movement_created ? ' · Entró a caja.' : ''
        toast.success(`Abono registrado · saldo: ${saldoCOP}${extra}`)
      }
    },
    onError: (err) => toast.error(mensajeDeError(err, 'Error al registrar el abono')),
  })

  return { registerDebtPayment: mutation.mutateAsync, isRegistering: mutation.isPending }
}
