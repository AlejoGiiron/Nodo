import { useQuery } from '@tanstack/react-query'
import { getBalanceDeSede } from '@/lib/supabase-helpers'
import { derivarBalance, type Balance, type ComponentesBalance } from '@/lib/balance'
import { useAuth } from '@/hooks/useAuth'

/**
 * El balance de la sede: cuánto puso, cuánto entró, cuánto salió y cuánto
 * debería tener hoy.
 *
 * 🔴 ACUMULADO DESDE EL INICIO, y NO toma el rango de fechas de Reportes. La
 *    pregunta de la clienta —«cuánto deberíamos tener»— no tiene sentido sobre
 *    una semana: un balance de siete días diría que arrancó con 15 millones el
 *    lunes. La pantalla lo declara en vez de dejar que el selector de arriba
 *    parezca que aplica.
 *
 * 🔴 Devuelve también `confirmado`, y no es adorno: el balance es una
 *    AFIRMACIÓN SOBRE PLATA que la clienta va a cruzar contra lo que tiene en
 *    la mano. Con caché viejo de otra sede pintaría cifras plausibles de otro
 *    negocio, que es la peor forma de una confirmación falsa. Mientras no esté
 *    confirmado, la pantalla no muestra números.
 */
export function useBalance(): { balance: Balance | null; confirmado: boolean; error: unknown } {
  const { profile } = useAuth()
  const sedeId = profile?.sede_id

  const q = useQuery({
    queryKey: ['balance_de_sede', sedeId],
    queryFn: async () => {
      const { data, error } = await getBalanceDeSede(sedeId!)
      if (error) throw error
      return data as unknown as ComponentesBalance | null
    },
    enabled: !!sedeId,
    staleTime: 30_000,
  })

  return {
    balance: q.data ? derivarBalance(q.data) : null,
    confirmado: !!sedeId && !q.isPending && !q.isFetching,
    error: q.error,
  }
}
