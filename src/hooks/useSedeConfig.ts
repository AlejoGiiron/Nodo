import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import { useAuth } from '@/hooks/useAuth'
import { getSede, updateSede } from '@/lib/supabase-helpers'
import type { Json, TablesUpdate } from '@/types/database.types'

export type PaymentMethod = 'cash' | 'card' | 'transfer' | 'nequi'

export interface SedeConfig {
  slug?: string | null
  cash_out_reasons?: string[]
  payment_methods?: PaymentMethod[]
  nequi_qr_url?: string | null
  kitchen_pin?: string | null
  kitchen_stations?: string[]
  kds_timers?: { green: number; amber: number }
  default_delivery_time?: number
  notifications?: {
    delivery_sound?: boolean
    kitchen_sound?: boolean
  }
}

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

  const updateConfig = (patch: Partial<SedeConfig>) =>
    updateMutation.mutateAsync({
      config: { ...config, ...patch } as Json,
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
