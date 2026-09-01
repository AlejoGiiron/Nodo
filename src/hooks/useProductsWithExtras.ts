import { useQuery } from '@tanstack/react-query'
import { getProductsWithActiveExtras } from '@/lib/supabase-helpers'
import { useAuth } from '@/hooks/useAuth'

/**
 * Set de IDs de productos de la sede que tienen al menos un extra activo
 * asignado. El POS/Mesas lo usan para decidir si, al agregar un producto,
 * abren el modal de configuración o lo agregan directo (sin fricción).
 */
export function useProductsWithExtras() {
  const { profile } = useAuth()
  const sedeId = profile?.sede_id

  const query = useQuery({
    queryKey: ['products_with_extras', sedeId],
    queryFn: async () => {
      const { data, error } = await getProductsWithActiveExtras(sedeId!)
      if (error) throw error
      return new Set((data ?? []).map((r) => r.product_id))
    },
    enabled: !!sedeId,
    staleTime: 30_000,
  })

  return query.data ?? new Set<string>()
}
