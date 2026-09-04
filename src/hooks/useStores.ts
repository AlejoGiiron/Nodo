import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { Tables } from '@/types/database.types'

export type StoreRow = Tables<'sedes'>
export type OrgUser = Pick<Tables<'profiles'>, 'id' | 'full_name' | 'email'>
export type StoreAssignment = { user_id: string; sede_id: string }

/**
 * Sedes (sedes) de la organización + asignación de usuarios (user_stores).
 *
 * 🔴 CORREGIDO el 2026-09-04 — esta nota afirmaba lo contrario de lo que hace
 *    la base, y en la dirección que hace daño: decía que *"la lectura de
 *    profiles está acotada por RLS a la sede activa"* y que *"el soporte
 *    multi-sede pleno requerirá ampliar el SELECT de profiles a nivel
 *    organización"*. Las dos mitades son falsas.
 *
 *    La policy es `profiles: ver los de mi organizacion`, y usa
 *    `organization_id = get_my_organization_id()`: YA es de organización.
 *    Medido el día que LAB tuvo dos sedes — dos cuentas, en sedes distintas,
 *    ven 29 perfiles cada una.
 *
 *    ⚠️ Por qué importa borrarla y no sólo matizarla: mandaba a AMPLIAR una
 *    policy que ya está ancha, o sea a tocar una autorización que está bien.
 *    Una nota que dirige mal cuesta más que una ausente.
 *
 * ⛔ Lo que SÍ falta para el multi-sede está medido y tiene número: la deuda 92
 *    —`create-user` valida `sede_id` contra la sede del LLAMANTE, así que no se
 *    puede dar de alta a nadie en otra sede de la propia organización—.
 */
export function useStores() {
  const { organizationId } = useAuth()
  const queryClient = useQueryClient()

  const { data: stores = [], isLoading } = useQuery({
    queryKey: ['org_stores', organizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sedes')
        .select('*')
        .eq('organization_id', organizationId!)
        .order('created_at')
      if (error) throw error
      return data ?? []
    },
    enabled: !!organizationId,
    staleTime: 60_000,
  })

  const { data: orgUsers = [] } = useQuery({
    queryKey: ['org_users', organizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .eq('organization_id', organizationId!)
        .order('full_name')
      if (error) throw error
      return (data ?? []) as OrgUser[]
    },
    enabled: !!organizationId,
    staleTime: 60_000,
  })

  const { data: assignments = [] } = useQuery({
    queryKey: ['org_user_stores', organizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_stores')
        .select('user_id, sede_id')
      if (error) throw error
      return (data ?? []) as StoreAssignment[]
    },
    enabled: !!organizationId,
    staleTime: 60_000,
  })

  const invalidateStores = () =>
    queryClient.invalidateQueries({ queryKey: ['org_stores', organizationId] })
  const invalidateAssignments = () =>
    queryClient.invalidateQueries({ queryKey: ['org_user_stores', organizationId] })

  const createStoreMut = useMutation({
    mutationFn: async (data: { name: string; address?: string; phone?: string }) => {
      const { error } = await supabase.from('sedes').insert({
        name: data.name,
        address: data.address?.trim() || null,
        phone: data.phone?.trim() || null,
        organization_id: organizationId!,
      })
      if (error) throw error
    },
    onSuccess: () => { invalidateStores(); toast.success('Sede creada') },
    onError: () => toast.error('Error al crear la sede'),
  })

  const updateStoreMut = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: { name?: string; address?: string | null; phone?: string | null } }) => {
      const { error } = await supabase.from('sedes').update(data).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => { invalidateStores(); toast.success('Sede actualizada') },
    onError: () => toast.error('Error al actualizar la sede'),
  })

  const deleteStoreMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('sedes').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => { invalidateStores(); toast.success('Sede eliminada') },
    onError: () => toast.error('Error al eliminar la sede'),
  })

  const setAssignmentMut = useMutation({
    mutationFn: async ({ userId, sedeId, assigned }: { userId: string; sedeId: string; assigned: boolean }) => {
      if (assigned) {
        const { error } = await supabase
          .from('user_stores')
          .insert({ user_id: userId, sede_id: sedeId })
        if (error && error.code !== '23505') throw error // ignora duplicado
      } else {
        const { error } = await supabase
          .from('user_stores')
          .delete()
          .eq('user_id', userId)
          .eq('sede_id', sedeId)
        if (error) throw error
      }
    },
    onSuccess: () => invalidateAssignments(),
    onError: () => toast.error('Error al actualizar el acceso'),
  })

  return {
    stores,
    orgUsers,
    assignments,
    isLoading,
    createStore: createStoreMut.mutateAsync,
    updateStore: updateStoreMut.mutateAsync,
    deleteStore: deleteStoreMut.mutateAsync,
    setAssignment: setAssignmentMut.mutateAsync,
    isMutating: createStoreMut.isPending || updateStoreMut.isPending || deleteStoreMut.isPending,
  }
}
