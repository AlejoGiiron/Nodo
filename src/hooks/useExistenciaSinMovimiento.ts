import { useQuery } from '@tanstack/react-query'
import { getExistenciaSinMovimiento } from '@/lib/supabase-helpers'

/**
 * Existencia de un producto que ningún movimiento explica.
 *
 * 🔴 Devuelve `dato` y también si está CONFIRMADO. La línea del pie afirma un
 *    número sobre el que la clienta va a cuadrar, así que no se pinta con un
 *    valor viejo del caché de otro producto — es la clase de la deuda 56 leída
 *    sobre una afirmación en vez de sobre una escritura.
 */
export function useExistenciaSinMovimiento(productId: string | null) {
  const q = useQuery({
    queryKey: ['existencia_sin_movimiento', productId],
    queryFn: async () => {
      const { data, error } = await getExistenciaSinMovimiento(productId!)
      if (error) throw error
      return data?.existencia_sin_movimiento ?? null
    },
    enabled: !!productId,
    staleTime: 10_000,
  })
  return {
    hueco: q.data ?? null,
    confirmado: !!productId && !q.isPending && !q.isFetching,
  }
}
