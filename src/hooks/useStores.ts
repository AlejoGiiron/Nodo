import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { Tables } from '@/types/database.types'

export type StoreRow = Tables<'sedes'>
/**
 * 🔴 `sede_id` ENTRA AL TIPO el 2026-09-15, y es una LECTURA de mas — nada
 *    escribe esta columna desde esta pantalla. Hace falta porque la pantalla
 *    pasa a mostrar DONDE ESTA PARADA cada persona, que es lo que RLS lee de
 *    verdad (`get_my_sede_id()` -> `profiles.sede_id`), al lado de a donde
 *    PUEDE ir (`user_stores`). Los dos hechos son ciertos y son distintos.
 */
export type OrgUser = Pick<Tables<'profiles'>, 'id' | 'full_name' | 'email' | 'sede_id'>
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
        .select('id, full_name, email, sede_id')
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

  // 🔴 `deleteStoreMut` SE BORRO el 2026-09-15 (deuda 103), junto con su boton.
  //    Hacia `supabase.from('sedes').delete()`, y 16 tablas cuelgan de `sedes`
  //    con `on delete cascade`. Medido en el tenant de la clienta: un clic
  //    borraba **722 filas** — 127 ventas, 106 pagos, 224 movimientos de stock,
  //    20 jornadas — y, porque `profiles` TAMBIEN esta en el cascade, **las dos
  //    cuentas de la sede**. No era perder la historia: era perder a las
  //    personas y su acceso.
  //
  // ⚠️ SE BORRA LA MUTACION, NO SOLO EL BOTON, y es el precedente de
  //    `updateProductStock`: un escritor vivo sin consumidor es la ruta mas
  //    corta al hueco que se acaba de cerrar, esperando a que alguien la
  //    encuentre porque «ya existe».
  //
  // 📋 Y el camino queda cerrado tambien en la BASE: la migracion
  //    `20260915190000` parte la policy `for all` en select/insert/update sin
  //    `delete`. Sacar solo la UI seria la deuda 61 en otra capa — la interfaz
  //    ocupando el lugar de la autorizacion.
  //
  //    «Retirar» una sede es otra cosa y hoy no existe como operacion: se hizo
  //    a mano una vez (renombrar + sacar de `user_stores`) y va con la otra
  //    mitad de la 103.

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
    setAssignment: setAssignmentMut.mutateAsync,
    isMutating: createStoreMut.isPending || updateStoreMut.isPending,
  }
}
