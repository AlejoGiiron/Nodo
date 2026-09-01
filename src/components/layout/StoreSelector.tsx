import { Store } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

type UserStore = {
  sede_id: string
  sedes: { id: string; name: string } | null
}

/**
 * Selector de sede activa. Se muestra solo si el usuario tiene MÁS de una sede
 * (user_stores). Al cambiar, actualiza profiles.sede_id (sede activa),
 * re-carga el profile e invalida todas las queries para recargar datos de la
 * nueva sede.
 *
 * Nota: con una sola sede no se renderiza (caso actual).
 */
export function StoreSelector() {
  const { user, profile, refreshProfile } = useAuth()
  const queryClient = useQueryClient()

  const { data: stores = [] } = useQuery({
    queryKey: ['my_stores', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_stores')
        .select('sede_id, sedes(id, name)')
        .eq('user_id', user!.id)
      if (error) throw error
      return (data ?? []) as UserStore[]
    },
    enabled: !!user?.id,
    staleTime: 5 * 60_000,
  })

  // Solo tiene sentido con más de una sede.
  if (stores.length <= 1) return null

  const handleChange = async (newId: string) => {
    if (!user || newId === profile?.sede_id) return
    const { error } = await supabase
      .from('profiles')
      .update({ sede_id: newId })
      .eq('id', user.id)
    if (error) {
      toast.error('No se pudo cambiar de sede')
      return
    }
    await refreshProfile()
    queryClient.invalidateQueries()
    toast.success('Sede activa actualizada')
  }

  return (
    <div
      className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border"
      style={{ borderColor: '#e2e8f0', background: '#f8fafc' }}
    >
      <Store size={14} color="#64748b" />
      <select
        data-testid="store-selector"
        value={profile?.sede_id ?? ''}
        onChange={(e) => handleChange(e.target.value)}
        className="bg-transparent text-sm font-medium text-slate-700 outline-none cursor-pointer"
        style={{ border: 'none' }}
      >
        {stores.map((s) => (
          <option key={s.sede_id} value={s.sede_id}>
            {s.sedes?.name ?? 'Sede'}
          </option>
        ))}
      </select>
    </div>
  )
}
