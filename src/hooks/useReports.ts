import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { getVouchersTotal } from '@/lib/supabase-helpers'
// El generador nuevo NO exporta `Views`: su `Tables<>` ya resuelve sobre
// `Tables & Views`, asi que una vista se pide igual que una tabla.
import type { Tables } from '@/types/database.types'

// 'YYYY-MM-DD' (Bogotá) → límites ISO del día en UTC. Bogotá = UTC-5 fijo.
const dayStartISO = (day: string) => new Date(`${day}T00:00:00-05:00`).toISOString()
const dayEndISO = (day: string) => new Date(`${day}T23:59:59.999-05:00`).toISOString()

export type DailySalesRow        = Tables<'daily_sales_summary'>
export type ProductPerformanceRow = Tables<'product_performance'>
export type HourlySalesRow       = Tables<'hourly_sales'>
// La vista se llama `user_performance` desde el esquema base: lo que medía no
// era "desempeño del mozo" sino el de QUIEN vende, y eso existe en Nodo.
export type UserPerformanceRow   = Tables<'user_performance'>

export interface ReportParams {
  from: string // 'YYYY-MM-DD'
  to: string   // 'YYYY-MM-DD'
}

export function useReports({ from, to }: ReportParams) {
  const { profile } = useAuth()
  const sedeId = profile?.sede_id ?? null
  const enabled = !!sedeId && !!from && !!to

  const dailySales = useQuery({
    queryKey: ['reports_daily_sales', from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('daily_sales_summary')
        .select('*')
        .gte('day', from)
        .lte('day', to)
        .order('day', { ascending: true })
      if (error) throw error
      return (data ?? []) as DailySalesRow[]
    },
    enabled,
    staleTime: 5 * 60_000,
  })

  const productPerformance = useQuery({
    queryKey: ['reports_products', from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('product_performance')
        .select('*')
        .gte('day', from)
        .lte('day', to)
        .order('total_revenue', { ascending: false })
      if (error) throw error
      return (data ?? []) as ProductPerformanceRow[]
    },
    enabled,
    staleTime: 5 * 60_000,
  })

  const hourlySales = useQuery({
    queryKey: ['reports_hourly', from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('hourly_sales')
        .select('*')
        .gte('day', from)
        .lte('day', to)
        .order('hour', { ascending: true })
      if (error) throw error
      return (data ?? []) as HourlySalesRow[]
    },
    enabled,
    staleTime: 5 * 60_000,
  })

  const userPerformance = useQuery({
    queryKey: ['reports_waiters', from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_performance')
        .select('*')
        .gte('day', from)
        .lte('day', to)
        .order('total_revenue', { ascending: false })
      if (error) throw error
      return (data ?? []) as UserPerformanceRow[]
    },
    enabled,
    staleTime: 5 * 60_000,
  })

  // Total regalado en vales (ruletazo) en el rango — KPI de Reportes.
  const vouchers = useQuery({
    queryKey: ['reports_vouchers', sedeId, from, to],
    queryFn: () => getVouchersTotal(sedeId!, dayStartISO(from), dayEndISO(to)),
    enabled,
    staleTime: 5 * 60_000,
  })

  return {
    dailySales:         dailySales.data         ?? [],
    productPerformance: productPerformance.data ?? [],
    hourlySales:        hourlySales.data        ?? [],
    userPerformance:    userPerformance.data    ?? [],
    vouchersTotal:      vouchers.data           ?? 0,
    isLoading:
      dailySales.isLoading        ||
      productPerformance.isLoading ||
      hourlySales.isLoading       ||
      userPerformance.isLoading,
    error:
      dailySales.error         ??
      productPerformance.error ??
      hourlySales.error        ??
      userPerformance.error,
  }
}
