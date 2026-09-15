import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getProductExtras, addProductExtra, removeProductExtra } from '@/lib/supabase-helpers'
import type { SentryArea } from '@/lib/sentry'

/**
 * Extras del catálogo asignados a un producto (relación product_extras).
 * `reconcile` recibe el productId explícito para soportar productos
 * recién creados (cuyo id aún no estaba disponible al montar el hook).
 */
export function useProductExtras(productId: string | null) {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ['product_extras', productId],
    queryFn: async () => {
      const { data, error } = await getProductExtras(productId!)
      if (error) throw error
      return data ?? []
    },
    enabled: !!productId,
  })

  const reconcile = useMutation({
    meta: { area: 'productos' satisfies SentryArea },
    mutationFn: async ({ productId, extraIds }: { productId: string; extraIds: string[] }) => {
      const { data: current, error: readErr } = await getProductExtras(productId)
      if (readErr) throw readErr
      const currentIds = new Set((current ?? []).map(r => r.extra_id))
      const target = new Set(extraIds)
      const toAdd = extraIds.filter(id => !currentIds.has(id))
      const toRemove = [...currentIds].filter(id => !target.has(id))

      for (const id of toAdd) {
        const { error } = await addProductExtra(productId, id)
        if (error) throw error
      }
      for (const id of toRemove) {
        const { error } = await removeProductExtra(productId, id)
        if (error) throw error
      }
    },
    onSuccess: (_data, { productId }) => {
      queryClient.invalidateQueries({ queryKey: ['product_extras', productId] })
    },
    // El error se maneja de forma centralizada en ProductModal.handleSubmit
    // (mensaje accionable + reintento idempotente); aquí no se toastea para no
    // duplicar y para que el guardado no falle en silencio por pasos.
  })

  const assignedIds = useMemo(
    () => new Set((query.data ?? []).map(r => r.extra_id)),
    [query.data],
  )

  return {
    productExtras: query.data ?? [],
    assignedIds,
    isLoading: query.isLoading,
    /**
     * ¿Lo que tengo en la mano ES el dato de ESTE producto, ya confirmado?
     *
     * 🔴 NO ES `isLoading`, Y ESA DISTINCION ES EL ARREGLO. Con algo en cache
     *    —la apertura anterior del modal— React Query **sirve el dato viejo al
     *    instante** y `isLoading` queda en FALSE: la consulta no esta
     *    «cargando», ya contesto. Pero contesto con el dato de ANTES, y el
     *    refetch viene en camino.
     *
     *    > Un guard que pregunta «¿termino de cargar?» no cubre «cargo OTRA
     *    > COSA».
     *
     * ⚠️ MEDIDO, y es PERDIDA DE DATO (2026-09-15): al reabrir un producto
     *    recien guardado, el modal sembraba la seleccion con el cache VACIO, el
     *    boton quedaba habilitado —`isLoading` falso— y guardar mandaba
     *    `extraIds: []`, asi que `reconcile` BORRABA la asignacion. La sonda
     *    dio `aria-pressed=false · cargando=0 · boton-habilitado=true`, y
     *    despues `product_extras: 0` donde antes habia 1.
     *
     *    Es la deuda 56 volviendo por otro camino: alla el guard FALTABA; aca
     *    el guard esta y mira el ESTADO DE LA CONSULTA en vez del DATO.
     * 🔴 Y EL `!productId` NO ES DEFENSIVO: ES EL CASO DEL PRODUCTO NUEVO, y
     *    olvidarlo rompio la creacion. La consulta lleva `enabled: !!productId`,
     *    y en React Query v5 una consulta DESHABILITADA queda con `isPending` en
     *    **true para siempre** —nunca va a resolver, porque nunca corre—. Sin
     *    esta rama, `datoConfirmado` era falso eternamente en un producto sin id
     *    y la seccion de receta se quedaba en «Cargando…»: `recipe-add-product`
     *    no se renderizaba nunca y no se podia crear un compuesto.
     *
     *    ⚠️ Es exactamente por esto que `isLoading` «funcionaba» aca:
     *    `isLoading = isPending && isFetching` es FALSO con la consulta apagada.
     *    Al endurecer el flag se gano el caso del cache viejo y se perdio el del
     *    id ausente — dos estados distintos que el flag tiene que separar.
     *
     *    Sin id no hay nada que confirmar: el vacio ES el dato.
     */
    datoConfirmado: !productId || (!query.isPending && !query.isFetching),
    reconcile,
  }
}
