import { useQuery } from '@tanstack/react-query'
import { getProducts } from '@/lib/supabase-helpers'
import { useAuth } from '@/hooks/useAuth'
import type { ProductWithCategory } from '@/stores/cartStore'

export function useProducts() {
  const { profile } = useAuth()

  return useQuery({
    queryKey: ['products', profile?.sede_id],
    queryFn: async () => {
      const { data, error } = await getProducts(profile!.sede_id)
      if (error) throw error
      return (data ?? []) as ProductWithCategory[]
    },
    enabled: !!profile?.sede_id,
  })
}
