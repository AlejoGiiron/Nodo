import { useQuery } from '@tanstack/react-query'
import { getProductsWithActiveExtras } from '@/lib/supabase-helpers'
import { useAuth } from '@/hooks/useAuth'

/**
 * Productos de la sede con al menos un extra activo, **y si esa respuesta ya
 * llegó**.
 *
 * 🔴 DEVOLVÍA SÓLO EL SET, Y ESO COSTABA PLATA. La versión anterior hacía
 *    `return query.data ?? new Set()`, o sea **el mismo valor mientras carga y
 *    cuando el producto de verdad no tiene extras**. Su único consumidor
 *    —`handleAddProduct` en el mostrador— lee ese Set para decidir si abre el
 *    modal de configuración, así que con la respuesta en vuelo el producto
 *    entraba al carrito DIRECTO, salteándose sus extras: **la venta se cobra de
 *    menos y la línea se lee perfectamente normal.**
 *
 * ⚠️ La auditoría A1 documentó esta forma en cuatro lugares, arregló el
 *    consumidor del modal (`onConfirm([])`) y **dejó este hook mudo** — su
 *    propio corolario lo nombraba como el único de los cuatro donde el culpable
 *    era el hook. La hermana huérfana estalló el 2026-09-03, en la suite.
 *
 * 🔴 SE EXPONE `listo`, NO `cargando`, y la diferencia es fail-closed:
 *    `listo` es `isSuccess`, así que **todo lo que no sea una respuesta buena
 *    —cargando, error, query deshabilitada por falta de sede— cae del lado de
 *    "no sé"**. Un `cargando` invertido dejaría al error y al caso sin sede
 *    contando como "ya sé, y no tiene extras", que es el mismo fail-open que
 *    esto viene a cerrar.
 */
export function useProductsWithExtras() {
  const { profile } = useAuth()
  const sedeId = profile?.sede_id

  const query = useQuery({
    queryKey: ['products_with_extras', sedeId],
    queryFn: async () => {
      const { data, error } = await getProductsWithActiveExtras(sedeId!)
      if (error) throw error
      return new Set((data ?? []).map((r) => r.product_id))
    },
    enabled: !!sedeId,
    staleTime: 30_000,
  })

  return {
    /** IDs con al menos un extra activo. Sólo es confiable si `listo`. */
    conExtras: query.data ?? new Set<string>(),
    /** ¿Ya llegó la respuesta? Mientras sea `false`, el Set NO significa nada. */
    listo: query.isSuccess,
  }
}
