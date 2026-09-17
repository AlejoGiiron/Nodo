import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { buscarProductos } from '@/lib/supabase-helpers'
import { useAuth } from '@/hooks/useAuth'

/**
 * Productos que coinciden con `termino` por nombre o código, activos Y
 * archivados. Ver `buscarProductos` para por qué no sale del catálogo cargado.
 * Con el término vacío no consulta: no hay lista que mostrar.
 */
export function useBuscarProductos(termino: string) {
  const { profile } = useAuth()
  const sedeId = profile?.sede_id
  const t = termino.trim()

  return useQuery({
    queryKey: ['buscar_productos', sedeId, t],
    queryFn: () => buscarProductos(sedeId!, t),
    enabled: !!sedeId && t.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  })
}
