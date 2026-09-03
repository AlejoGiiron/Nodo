import { useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import {
  getOpenShift,
  openShift as openShiftHelper,
  closeShift as closeShiftHelper,
  getShiftPayments,
  getShiftSalesCount,
  getCashMovements,
  createCashMovement,
  type ClosedShiftRow,
} from '@/lib/supabase-helpers'
import type { SentryArea } from '@/lib/sentry'
import type { Tables, TablesInsert, Json } from '@/types/database.types'
import type { ShiftReconciliation } from '@/lib/shiftCalc'

export interface ShiftSalesSummary {
  cash: number
  card: number
  transfer: number
  nequi: number
  total: number
}

export type CashMovement = Tables<'cash_movements'>

export function useCashShift() {
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const sedeId = profile?.sede_id

  const { data: currentShift = null, isLoading: isLoadingShift, isError: shiftFallo } = useQuery({
    queryKey: ['cash_shift_open', sedeId],
    queryFn: async () => {
      const { data, error } = await getOpenShift(sedeId!)
      if (error) throw error
      return data ?? null
    },
    enabled: !!sedeId,
    staleTime: 10_000,
  })

  // 🔴 DEUDA 55. `isLoading` e `isError` se EXPONEN porque el consumidor no
  //    tiene otra forma de saberlo: el default de esta query es `null` y
  //    `salesSummary?.cash ?? 0` da 0, que es indistinguible de "no hubo ventas".
  //    Es el corolario de CLAUDE.md: un hook que devuelve un valor derivado
  //    tiene que devolver también su carga.
  const {
    data: salesSummary = null,
    refetch: refetchSales,
    isLoading: isLoadingSales,
    isError: salesFallo,
  } = useQuery({
    queryKey: ['shift_payments', currentShift?.id],
    queryFn: async () => {
      const { data, error } = await getShiftPayments(
        sedeId!,
        currentShift!.opened_at,
      )
      if (error) throw error
      const p = data ?? []
      return {
        cash: p.filter(x => x.method === 'cash').reduce((s, x) => s + x.amount, 0),
        card: p.filter(x => x.method === 'card').reduce((s, x) => s + x.amount, 0),
        transfer: p.filter(x => x.method === 'transfer').reduce((s, x) => s + x.amount, 0),
        nequi: p.filter(x => x.method === 'nequi').reduce((s, x) => s + x.amount, 0),
        total: p.reduce((s, x) => s + x.amount, 0),
      } as ShiftSalesSummary
    },
    enabled: !!currentShift?.id,
    refetchInterval: 5_000,
  })

  // Mismo caso: el default es `[]`, y una lista vacía dice "no hubo
  // movimientos" con la misma cara que "todavía no sé".
  const {
    data: movements = [],
    isLoading: isLoadingMovements,
    isError: movementsFallo,
  } = useQuery({
    queryKey: ['cash_movements', currentShift?.id],
    queryFn: async () => {
      const { data, error } = await getCashMovements(currentShift!.id)
      if (error) throw error
      return data ?? []
    },
    enabled: !!currentShift?.id,
  })

  const invalidateShift = () =>
    queryClient.invalidateQueries({ queryKey: ['cash_shift_open', sedeId] })

  const invalidateMovements = () =>
    queryClient.invalidateQueries({ queryKey: ['cash_movements', currentShift?.id] })

  const invalidateSales = () =>
    queryClient.invalidateQueries({ queryKey: ['shift_payments', currentShift?.id] })

  // `meta.area` alimenta el reporte central de errores de mutación (App.tsx).
  // Los modales de caja capturan con `catch {}` porque el toast lo muestra este
  // hook — sin esto, el objeto de error se perdía y "Error al cerrar el turno"
  // era todo el diagnóstico disponible.
  const openShiftMutation = useMutation({
    meta: { area: 'caja' satisfies SentryArea },
    mutationFn: async (openingAmount: number) => {
      const { data, error } = await openShiftHelper({
        sede_id: sedeId!,
        opened_by: profile!.id,
        opening_amount: openingAmount,
      })
      if (error) throw error
      return data!
    },
    onSuccess: () => { invalidateShift(); toast.success('Turno abierto') },
    onError: () => toast.error('Error al abrir el turno'),
  })

  const closeShiftMutation = useMutation({
    meta: { area: 'caja' satisfies SentryArea },
    mutationFn: async (params: {
      closingAmount: number
      expectedAmount: number
      difference: number
      // Snapshot del arqueo SIN sales_count (lo completa esta mutación al
      // cerrar, único momento en que la ventana solo-opened_at es correcta —
      // recomputarlo en un turno cerrado sumaría datos posteriores).
      reconciliation: Omit<ShiftReconciliation, 'sales_count'>
      comment: string
    }) => {
      // Congelado al cierre: nº de ventas del turno.
      const salesCount = await getShiftSalesCount(sedeId!, currentShift!.opened_at)
      const reconciliation: ShiftReconciliation = {
        ...params.reconciliation,
        sales_count: salesCount,
      }
      const { data, error } = await closeShiftHelper(currentShift!.id, {
        closing_amount: params.closingAmount,
        expected_amount: params.expectedAmount,
        difference: params.difference,
        closed_by: profile!.id,
        closed_at: new Date().toISOString(),
        close_reconciliation: reconciliation as unknown as Json,
        close_comment: params.comment.trim() || null,
      })
      if (error) throw error
      // Fila cerrada con joins (abrió/cerró) + snapshot + closed_at real del
      // servidor → insumo del comprobante, idéntico a la reimpresión del historial.
      return data as unknown as ClosedShiftRow
    },
    onSuccess: () => { invalidateShift(); toast.success('Turno cerrado correctamente') },
    onError: () => toast.error('Error al cerrar el turno'),
  })

  const addMovementMutation = useMutation({
    meta: { area: 'caja' satisfies SentryArea },
    mutationFn: async (
      // `categoria` es obligatoria: la constraint chk_categoria_segun_tipo la
      // exige y la valida CRUZADA con `type`. Sin ella el insert se rechaza.
      movement: Pick<
        TablesInsert<'cash_movements'>,
        'type' | 'amount' | 'reason' | 'categoria' | 'document_date'
      >,
    ) => {
      const { data, error } = await createCashMovement({
        ...movement,
        jornada_id: currentShift!.id,
        sede_id: sedeId!,
        created_by: profile!.id,
      })
      if (error) throw error
      return data!
    },
    onSuccess: (_, vars) => {
      invalidateMovements()
      invalidateSales()
      toast.success(vars.type === 'in' ? 'Ingreso registrado' : 'Egreso registrado')
    },
    onError: () => toast.error('Error al registrar movimiento'),
  })

  const channelRef = useRef<RealtimeChannel | null>(null)

  // Realtime: invalida salesSummary cuando se inserta un pago en este sede.
  // Nombre único por instancia para evitar que Supabase reutilice un canal ya
  // suscrito y lance "cannot add postgres_changes callbacks after subscribe".
  useEffect(() => {
    if (!sedeId) return

    const channelName = `shift-payments-${Math.random().toString(36).slice(2)}`

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'payments', filter: `sede_id=eq.${sedeId}` },
        () => queryClient.invalidateQueries({ queryKey: ['shift_payments'] }),
      )
      .subscribe()

    channelRef.current = channel

    return () => {
      channel.unsubscribe()
      supabase.removeChannel(channel)
      channelRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sedeId])

  return {
    currentShift,
    isOpen: !!currentShift,
    isLoadingShift,
    salesSummary,
    movements,
    // 🔴 La carga de los TRES insumos del arqueo. El cierre persiste un cálculo
    //    hecho con ellos y la reimpresión lee ese snapshot sin recomputar: si
    //    alguno no cargó, lo que se guarda es permanente y falso (deuda 55).
    isLoadingSales,
    isLoadingMovements,
    salesFallo,
    movementsFallo,
    shiftFallo,
    refetchSales,
    openShift: openShiftMutation.mutateAsync,
    closeShift: closeShiftMutation.mutateAsync,
    addMovement: addMovementMutation.mutateAsync,
    isOpeningShift: openShiftMutation.isPending,
    isClosingShift: closeShiftMutation.isPending,
    isAddingMovement: addMovementMutation.isPending,
  }
}
