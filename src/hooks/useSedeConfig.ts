import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import { useAuth } from '@/hooks/useAuth'
import { getSede, updateSede } from '@/lib/supabase-helpers'
import type { TablesUpdate } from '@/types/database.types'
import { mergeSedeConfig, type SedeConfig, type PaymentMethod } from '@/lib/sedeConfig'

// Los tipos viven en `src/lib/sedeConfig.ts`, junto a la función que hace el
// merge: se movieron ahí para que el merge sea testeable sin React (deuda 58).
export type { SedeConfig, PaymentMethod }

export function useSedeConfig() {
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const sedeId = profile?.sede_id

  const { data: sede, isLoading } = useQuery({
    queryKey: ['sede', sedeId],
    queryFn: async () => {
      const { data, error } = await getSede(sedeId!)
      if (error) throw error
      return data
    },
    enabled: !!sedeId,
    staleTime: 30_000,
  })

  // ⚠️ Este `?? {}` es sólo para LEER —una pantalla que muestra defaults
  //    mientras no hay datos es aceptable—. Lo que NO puede partir de `{}` es la
  //    ESCRITURA: ver `updateConfig`.
  const config: SedeConfig = (sede?.config as SedeConfig) ?? {}

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['sede', sedeId] })

  const updateMutation = useMutation({
    mutationFn: async (data: TablesUpdate<'sedes'>) => {
      const { data: updated, error } = await updateSede(sedeId!, data)
      if (error) throw error
      return updated
    },
    onSuccess: () => { invalidate(); toast.success('Cambios guardados') },
    onError: () => toast.error('Error al guardar los cambios'),
  })

  // 🔴 DEUDA 58. Antes: `{ ...config, ...patch }` con `config = sede?.config ??
  //    {}`. Con la sede sin cargar o con la consulta FALLADA, escribía un objeto
  //    de dos claves sobre una fila de cuatro y **borraba `slug` y
  //    `nequi_qr_url`** — claves que nadie estaba editando. `mergeSedeConfig`
  //    falla cerrado: sin configuración conocida no se escribe.
  const updateConfig = (patch: Partial<SedeConfig>) =>
    updateMutation.mutateAsync({
      config: mergeSedeConfig(sede?.config as SedeConfig | undefined, patch),
    })

  return {
    sede,
    config,
    isLoading,
    updateSede: updateMutation.mutateAsync,
    updateConfig,
    isSaving: updateMutation.isPending,
  }
}
