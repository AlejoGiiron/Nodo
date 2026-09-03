import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

/**
 * Nombre de la ORGANIZACIÓN (el tenant) — A6 · tanda 1.
 *
 * 🔴 POR QUÉ HACE FALTA, Y POR QUÉ NO ALCANZABA CON LA SEDE. El bloque de
 * identidad del sidebar es del **tenant**: §1.1 dice que `--brand` la define la
 * organización, y el tile de identidad es una de las cuatro superficies donde
 * ese color está permitido. Hasta hoy el sidebar mostraba el nombre de la
 * **sede** —"LAB Principal"— con lo cual la marca del cliente quedaba pintada
 * sobre un dato que no es su identidad.
 *
 * La sede no se pierde: pasa a la segunda línea, porque el producto es
 * multi-sede y saber en cuál estás parado decide todo lo que se escribe.
 *
 * ⚠️ RLS de `organizations` deja ver SÓLO la propia (policy "ver la propia"),
 * así que este `select` no puede devolver la de otro tenant aunque se le pida.
 */
export function useOrganization() {
  const { organizationId } = useAuth()

  const { data, isLoading } = useQuery({
    queryKey: ['organization', organizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('organizations')
        .select('id, name')
        .eq('id', organizationId!)
        .single()
      if (error) throw error
      return data
    },
    enabled: !!organizationId,
    // El nombre del tenant no cambia en una sesión de mostrador.
    staleTime: 30 * 60_000,
  })

  return {
    /**
     * `null` mientras carga o si la consulta falló — NO un texto de relleno.
     * El sidebar muestra la sede igual; inventar un nombre de organización
     * sería peor que no mostrarlo.
     */
    organizationName: data?.name ?? null,
    isLoading,
  }
}
