import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import {
  getPurchaseInvoices, getPurchaseInvoiceDetail, registerPurchase, updatePurchase,
  type PurchaseInvoiceListRow, type PurchaseInvoiceDetailRow,
  type PurchaseInvoicePayload, type PurchaseItemPayload, type RegisterPurchaseResult,
  type UpdatePurchaseResult,
} from '@/lib/supabase-helpers'
import { useAuth } from '@/hooks/useAuth'
import type { SentryArea } from '@/lib/sentry'
import { mensajeDeError } from '@/lib/errores'

export type { PurchaseInvoiceListRow, PurchaseInvoiceDetailRow }

export const PURCHASES_PAGE_SIZE = 25

/** Historial de compras (cabeceras), paginado por fecha desc. */
export function usePurchaseInvoices(page: number) {
  const { profile } = useAuth()
  const sedeId = profile?.sede_id ?? null

  const query = useQuery({
    queryKey: ['purchase_invoices', sedeId, page],
    queryFn: async () => {
      const { data, count, error } = await getPurchaseInvoices({
        sedeId: sedeId!,
        page,
        pageSize: PURCHASES_PAGE_SIZE,
      })
      if (error) throw error
      return {
        rows: (data ?? []) as unknown as PurchaseInvoiceListRow[],
        count: count ?? 0,
      }
    },
    enabled: !!sedeId,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  })

  const count = query.data?.count ?? 0
  return {
    rows: query.data?.rows ?? [],
    count,
    pageCount: Math.max(1, Math.ceil(count / PURCHASES_PAGE_SIZE)),
    isLoading: query.isLoading,
    isFetching: query.isFetching,
  }
}

/** Detalle de una factura de compra (ítems con producto). */
export function usePurchaseInvoiceDetail(invoiceId: string | null) {
  const query = useQuery({
    queryKey: ['purchase_invoice_detail', invoiceId],
    queryFn: async () => {
      const { data, error } = await getPurchaseInvoiceDetail(invoiceId!)
      if (error) throw error
      return data as unknown as PurchaseInvoiceDetailRow
    },
    enabled: !!invoiceId,
    staleTime: 60_000,
  })

  return { invoice: query.data ?? null, isLoading: query.isLoading }
}

/**
 * Registra una compra vía la RPC register_purchase (atómica). Tras el éxito
 * invalida inventario (niveles + movimientos) y el historial de compras, para
 * que el nuevo stock se refleje sin recargar.
 *
 * La compra SALE de la caja del día (deuda 26): la RPC crea el egreso y exige
 * jornada abierta. *(Este comentario decía lo contrario y era falso desde la
 * deuda 26 — corregido al tocar el hook, 2026-09-17.)*
 */
export function useRegisterPurchase() {
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const sedeId = profile?.sede_id ?? null

  const mutation = useMutation({
    meta: { area: 'compras' satisfies SentryArea },
    mutationFn: async (
      { invoice, items }: { invoice: PurchaseInvoicePayload; items: PurchaseItemPayload[] },
    ) => {
      const { data, error } = await registerPurchase(invoice, items)
      if (error) throw error
      return data as unknown as RegisterPurchaseResult
    },
    onSuccess: (res) => {
      // Inventario: niveles (products) + auditoría de movimientos.
      queryClient.invalidateQueries({ queryKey: ['products', sedeId] })
      queryClient.invalidateQueries({ queryKey: ['stock_movements'] })
      // Historial de compras.
      queryClient.invalidateQueries({ queryKey: ['purchase_invoices', sedeId] })

      // El número sale de la RPC, la misma fuente que lo asignó.
      toast.success(`Compra #${res.purchase_number} registrada y stock actualizado.`)
    },
    onError: (err) => toast.error(mensajeDeError(err, 'Error al registrar la compra')),
  })

  return { registerPurchase: mutation.mutateAsync, isRegistering: mutation.isPending }
}

/**
 * Edita una compra vía update_purchase (atómica). Mueve stock, costo y caja,
 * así que invalida lo mismo que registrar, más el detalle y los movimientos de
 * caja (la diferencia de plata entra como `correccion_compra`).
 */
export function useUpdatePurchase() {
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const sedeId = profile?.sede_id ?? null

  const mutation = useMutation({
    meta: { area: 'compras' satisfies SentryArea },
    mutationFn: async (
      { invoiceId, invoice, items }:
        { invoiceId: string; invoice: PurchaseInvoicePayload; items: PurchaseItemPayload[] },
    ) => {
      const { data, error } = await updatePurchase(invoiceId, invoice, items)
      if (error) throw error
      return data as unknown as UpdatePurchaseResult
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['products', sedeId] })
      queryClient.invalidateQueries({ queryKey: ['stock_movements'] })
      queryClient.invalidateQueries({ queryKey: ['purchase_invoices', sedeId] })
      queryClient.invalidateQueries({ queryKey: ['purchase_invoice_detail', res.invoice_id] })
      queryClient.invalidateQueries({ queryKey: ['cash_movements'] })
      toast.success(`Compra #${res.purchase_number} actualizada.`)
    },
    onError: (err) => toast.error(mensajeDeError(err, 'Error al editar la compra')),
  })

  return { updatePurchase: mutation.mutateAsync, isUpdating: mutation.isPending }
}
