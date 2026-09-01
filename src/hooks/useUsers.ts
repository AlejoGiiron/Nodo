import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import { useAuth } from '@/hooks/useAuth'
import {
  getSedeProfiles,
  updateProfile,
  createUser as createUserHelper,
} from '@/lib/supabase-helpers'
import type { Tables, TablesUpdate } from '@/types/database.types'
import type { SentryArea } from '@/lib/sentry'

export type UserRow = Tables<'profiles'>

export function useUsers() {
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const sedeId = profile?.sede_id

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['sede_users', sedeId],
    queryFn: async () => {
      const { data, error } = await getSedeProfiles(sedeId!)
      if (error) throw error
      return data ?? []
    },
    enabled: !!sedeId,
    staleTime: 30_000,
  })

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['sede_users', sedeId] })

  const updateMutation = useMutation({
    meta: { area: 'config' satisfies SentryArea },
    mutationFn: async ({ userId, data }: { userId: string; data: TablesUpdate<'profiles'> }) => {
      const { data: updated, error } = await updateProfile(userId, data)
      if (error) throw error
      return updated
    },
    onSuccess: () => { invalidate(); toast.success('Usuario actualizado') },
    onError: () => toast.error('Error al actualizar el usuario'),
  })

  const createUserMutation = useMutation({
    meta: { area: 'config' satisfies SentryArea },
    mutationFn: async (params: {
      email: string
      password: string
      full_name: string
      /** Rol enum legacy que requiere la Edge Function / trigger handle_new_user. */
      enumRole: 'admin' | 'cashier' | 'waiter'
      /** Rol RBAC (roles.id). Lo asigna la Edge Function, no el navegador. */
      roleId: string | null
    }) => {
      // UN SOLO PASO. Antes esto eran dos: crear la cuenta y, después, un
      // updateProfile del role_id desde el navegador. Si ese segundo paso fallaba
      // —o el cajero cerraba la pestaña— el perfil quedaba SIN ROL y por lo tanto
      // SIN NINGÚN PERMISO (has_permission hace JOIN contra roles). Ahora el rol
      // se asigna server-side dentro del mismo request, con compensación si falla.
      const { data, error } = await createUserHelper({
        email: params.email,
        password: params.password,
        full_name: params.full_name,
        role: params.enumRole,
        role_id: params.roleId,
        sede_id: sedeId!,
      })
      if (error) throw error
      const body = data as { error?: string; user_id?: string } | null
      if (body?.error) throw new Error(body.error)
    },
    onSuccess: () => { invalidate(); toast.success('Usuario creado') },
    onError: (err: Error) => toast.error(err.message ?? 'Error al crear el usuario'),
  })

  return {
    users,
    isLoading,
    updateUser: (userId: string, data: TablesUpdate<'profiles'>) =>
      updateMutation.mutateAsync({ userId, data }),
    createUser: createUserMutation.mutateAsync,
    isUpdating: updateMutation.isPending,
    isCreatingUser: createUserMutation.isPending,
  }
}
