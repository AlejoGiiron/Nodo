import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { DailySalesRow } from '@/hooks/useReports'

// ⚠️ HOOK SIN CONSUMIDOR (deuda 59: `grep -rn "useDailySummary(" src/` → vacío).
//    NO se borra acá: la poda tiene su regla y su enumeración. Lo que sí se hizo
//    el 2026-09-02 es alinearlo con la deuda 53 — `total_revenue` dejó de existir
//    en la vista, y un hook muerto que además no compila es peor que uno muerto.
//    Duplica la agregación que `useReports` ya hace sobre la misma vista.
export interface DailySummary {
  date: string
  order_count: number
  /** Facturado (suma de `orders.total`). Antes se llamaba `total_revenue` y era lo COBRADO. */
  sold_total: number
  /** Pagos recibidos (suma de `payments.amount`). */
  collected_total: number
  /** `sold_total / order_count`: misma población arriba y abajo (deuda 53). */
  avg_ticket: number
  by_channel: DailySalesRow[]
  by_method: {
    cash: number
    card: number
    transfer: number
    nequi: number
  }
}

export function useDailySummary(date: string) {
  const { profile } = useAuth()

  return useQuery({
    queryKey: ['daily_summary', date],
    queryFn: async (): Promise<DailySummary> => {
      const { data, error } = await supabase
        .from('daily_sales_summary')
        .select('*')
        .eq('day', date)
        .order('canal')
      if (error) throw error
      const rows = (data ?? []) as DailySalesRow[]

      const order_count     = rows.reduce((s, r) => s + (r.order_count     ?? 0), 0)
      const sold_total      = rows.reduce((s, r) => s + (r.sold_total      ?? 0), 0)
      const collected_total = rows.reduce((s, r) => s + (r.collected_total ?? 0), 0)
      const avg_ticket      = order_count > 0 ? sold_total / order_count : 0

      return {
        date,
        order_count,
        sold_total,
        collected_total,
        avg_ticket,
        by_channel: rows,
        by_method: {
          cash:     rows.reduce((s, r) => s + (r.cash_total      ?? 0), 0),
          card:     rows.reduce((s, r) => s + (r.card_total      ?? 0), 0),
          transfer: rows.reduce((s, r) => s + (r.transfer_total  ?? 0), 0),
          nequi:    rows.reduce((s, r) => s + (r.nequi_total     ?? 0), 0),
        },
      }
    },
    enabled: !!profile?.sede_id && !!date,
    staleTime: 5 * 60_000,
  })
}
