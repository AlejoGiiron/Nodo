import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import { registerSaleChange, type SaleChangeItem, type SaleChangeResult } from '@/lib/supabase-helpers'
import { formatoCOP } from '@/lib/formato'
import { mensajeDeError } from '@/lib/errores'

/**
 * Cambiar productos de una venta a crédito (20260924120000).
 *
 * 🔴 LO QUE INVALIDA NO ES DE MÁS, y cada uno tiene su razón: un cambio mueve
 *    el stock de DOS productos, escribe DOS movimientos, cambia lo que el
 *    cliente debe y mueve el balance de la sede. Si alguna de esas pantallas
 *    se queda con su caché, muestra un número que el producto acaba de dejar
 *    viejo — y el de Cartera es con el que ella cobra.
 */
export function useCambioProducto() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (v: { orderId: string; motivo: string; items: SaleChangeItem[] }) => {
      const { data, error } = await registerSaleChange(v.orderId, v.motivo, v.items)
      if (error) throw error
      return data as unknown as SaleChangeResult
    },
    onSuccess: (res) => {
      for (const k of ['sale_detail', 'sales_history', 'debts', 'debt_payments',
        'products', 'stock_movements', 'balance_de_sede']) {
        qc.invalidateQueries({ queryKey: [k] })
      }
      // El saldo va en el aviso porque es lo que ella necesita saber ya: con
      // cuánto queda la deuda después del cambio.
      toast.success(
        `Cambio registrado en la venta #${res.order_number}. Queda debiendo ${formatoCOP(res.saldo)}.`,
      )
    },
    // 🔴 El mensaje de la RPC SE MUESTRA TAL CUAL. Los suyos traen los números
    //    y nombran la salida —«abonó X, el total nuevo sería Y, sobran Z:
    //    elegí un producto de igual o mayor valor»—; reemplazarlo por un
    //    «Error al guardar» tiraría justo la parte accionable.
    onError: (e: unknown) => {
      // 🔴 `mensajeDeError` Y NO `e instanceof Error`. La primera version usaba
      //    `e instanceof Error ? e.message : String(e)` — y un `PostgrestError`
      //    NO ES una instancia de Error: es un objeto plano con `message`. Asi
      //    que el toast decia «[object Object]» y el mensaje util —los tres
      //    numeros y la salida— se perdia entero en el camino.
      // ⚠️ Lo cazo el caso que asevera el TEXTO VISIBLE. Uno que aseverara «hay
      //    un error» habria pasado con «[object Object]» en pantalla.
      toast.error(mensajeDeError(e, 'No se pudo registrar el cambio'))
    },
  })
}
