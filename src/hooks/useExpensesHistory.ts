import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { useAuth } from '@/hooks/useAuth'
import {
  getCashOutMovements, getCashOutTotal, type CashOutRow,
} from '@/lib/supabase-helpers'
import type { HistoryScope } from '@/hooks/useShiftHistory'

export type { CashOutRow }

export const EXPENSES_PAGE_SIZE = 25

export interface ExpensesHistoryUIFilters {
  from: string // 'YYYY-MM-DD'
  to: string   // 'YYYY-MM-DD'
  scope: HistoryScope
  page: number
}

// 🔴 LAS DOS CONVERSIONES A ISO MURIERON ACÁ (deuda 44). El rango ahora se
//    aplica sobre `document_date`, que es una columna `date`: no tiene hora ni
//    zona, así que las cadenas 'YYYY-MM-DD' viajan tal cual. Convertirlas era
//    necesario mientras se filtraba un `timestamptz`, y era exactamente el
//    lugar donde R7 se paga — un borde de día calculado a mano.

/**
 * Historial de gastos (egresos de caja, movimientos type='out') paginado y
 * filtrable por rango. Incluye el TOTAL del período (no solo de la página),
 * vía una consulta ligera aparte que trae solo `amount`.
 */
export function useExpensesHistory({ from, to, scope, page }: ExpensesHistoryUIFilters) {
  const { profile } = useAuth()
  const sedeId = profile?.sede_id ?? null
  const userId = scope === 'mine' ? (profile?.id ?? null) : null

  const query = useQuery({
    queryKey: ['expenses_history', sedeId, from, to, scope, userId, page],
    queryFn: async () => {
      const { data, count, error } = await getCashOutMovements({
        sedeId: sedeId!,
        userId,
        from: from || undefined,
        to: to || undefined,
        page,
        pageSize: EXPENSES_PAGE_SIZE,
      })
      if (error) throw error
      return {
        rows: (data ?? []) as unknown as CashOutRow[],
        count: count ?? 0,
      }
    },
    enabled: !!sedeId && !!from && !!to,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  })

  // Total del período (todas las filas filtradas, no solo la página actual).
  const totalQuery = useQuery({
    queryKey: ['expenses_total', sedeId, from, to, scope, userId],
    queryFn: async () => {
      const { data, error } = await getCashOutTotal({
        sedeId: sedeId!,
        userId,
        from: from || undefined,
        to: to || undefined,
      })
      if (error) throw error
      return (data ?? []).reduce((s, r) => s + (r.amount ?? 0), 0)
    },
    enabled: !!sedeId && !!from && !!to,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  })

  const count = query.data?.count ?? 0
  return {
    rows: query.data?.rows ?? [],
    count,
    periodTotal: totalQuery.data ?? 0,
    pageCount: Math.max(1, Math.ceil(count / EXPENSES_PAGE_SIZE)),
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
  }
}
