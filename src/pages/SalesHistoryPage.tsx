import { useState, useMemo } from 'react'
import {
  Search, X, ChevronLeft, ChevronRight, Printer, Receipt,
  Store, MessageCircle, Phone, Calendar, Ban, AlertTriangle,
} from 'lucide-react'
import { useSedeConfig } from '@/hooks/useSedeConfig'
import { usePermissions } from '@/hooks/usePermissions'
import { useCashShift } from '@/hooks/useCashShift'
import {
  useSalesHistory, useSaleDetail, useVoidSale, useCancelledSales, SALES_PAGE_SIZE,
  type SalesHistoryRow, type CancelledSaleRow,
} from '@/hooks/useSalesHistory'
import { printSaleTicket } from '@/lib/printer'
import type { Enums } from '@/types/database.types'
import { Badge } from '@/components/ui/Badge'
import { PageHeader } from '@/components/ui/PageHeader'
import { formatoCOP } from '@/lib/formato'

// ─── Helpers ──────────────────────────────────────────────────────


const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString('es-CO', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit', timeZone: 'America/Bogota',
  })

// 'YYYY-MM-DD' de hoy en zona Bogotá.
function todayBogota(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'America/Bogota',
  }).format(new Date())
  return parts // en-CA da YYYY-MM-DD
}

function daysAgoBogota(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'America/Bogota',
  }).format(d)
}

// Unión concreta (no el conditional perezoso Enums<...>) para poder indexar
// CANAL sin TS7053. sale.canal/row.canal (text en BD) se castean
// a este alias en el punto de indexado: resuelven a la misma unión.
type Canal = 'mostrador' | 'whatsapp' | 'telefono'
type PayMethod = Enums<'payment_method'>

// 🔴 LOS TRES CANALES VAN EN NEUTRO — mismo caso que los tipos de movimiento
//    de Inventario. Tenían mostrador ÁMBAR, WhatsApp VERDE y teléfono AZUL: tres
//    familias que SÍ significan algo (advertencia, confirmación, acción) usadas
//    para codificar una CATEGORÍA. Un canal no es un estado ni una acción — que
//    una venta entre por WhatsApp no es una confirmación de nada.
//    Y el color era redundante: LOS TRES ÍCONOS YA SON DISTINTOS (tienda, chat,
//    teléfono), que es una diferencia que se lee sin tener que aprender un
//    código.
const CANAL: Record<Canal, { label: string; icon: React.ReactNode; bg: string; fg: string }> = {
  mostrador: { label: 'Mostrador',  icon: <Store size={12} />,           bg: 'var(--border-2)', fg: 'var(--ink-2)' },
  whatsapp:  { label: 'WhatsApp',   icon: <MessageCircle size={12} />,   bg: 'var(--border-2)', fg: 'var(--ink-2)' },
  telefono:  { label: 'Teléfono',   icon: <Phone size={12} />,           bg: 'var(--border-2)', fg: 'var(--ink-2)' },
}

const METHOD_LABEL: Record<PayMethod, string> = {
  cash: 'Efectivo', card: 'Tarjeta', transfer: 'Transferencia', nequi: 'Nequi / QR',
}

const METHOD_OPTIONS: { value: PayMethod | ''; label: string }[] = [
  { value: '',         label: 'Todos los métodos' },
  { value: 'cash',     label: 'Efectivo' },
  { value: 'card',     label: 'Tarjeta' },
  { value: 'transfer', label: 'Transferencia' },
  { value: 'nequi',    label: 'Nequi / QR' },
]

// Métodos DISTINTOS de la venta. Con pago mixto hay una fila por método; el
// pago simple tiene una sola. Se deduplica por si acaso (no debería repetirse).
function paymentMethodsOf(row: { payments: { method: PayMethod }[] }): PayMethod[] {
  return [...new Set(row.payments.map((p) => p.method))]
}

// Etiqueta de método(s) para la lista/detalle. Simple → un método (igual que
// hoy); mixto → "Efectivo + Nequi". Una venta a fiado NO tiene fila en
// `payments` (la liquidación vive en debt_payments), así que se deriva del
// payment_status para que no aparezca como venta sin método.
function methodDisplay(row: { payment_status: string; total: number; payments: { method: PayMethod }[]; cancelled_at?: string | null }): string {
  // Una venta anulada no tiene "método" útil (sus payments se borraron): se
  // rotula como tal para no leerse como venta viva sin método.
  if (row.cancelled_at) return 'Anulada'
  const methods = paymentMethodsOf(row)
  if (methods.length > 0) return methods.map((m) => METHOD_LABEL[m]).join(' + ')
  // Venta GRATIS (descuento 100%): total 0, sin filas en payments, saldada ('paid').
  // Se distingue del fiado saldado (que tiene total > 0).
  if (row.total === 0) return 'Cortesía'
  if (row.payment_status === 'paid') return 'Fiado (saldado)'
  if (row.payment_status === 'partial') return 'Fiado (parcial)'
  return 'Fiado'
}

// ─── Detalle de venta (modal) ─────────────────────────────────────

function SaleDetailModal({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const { sale, isLoading } = useSaleDetail(orderId)
  const { sede } = useSedeConfig()
  const { can } = usePermissions()
  const { currentShift } = useCashShift()
  const voidMutation = useVoidSale()
  const [voiding, setVoiding] = useState(false)   // diálogo de motivo abierto
  const [reason, setReason] = useState('')

  // Elegibilidad de anulación (misma lógica que las guardas de la RPC; la RPC
  // re-valida server-side, esto es solo conveniencia de UI):
  //   can('ventas.anular') ∧ turno abierto ∧ venta del turno actual ∧ no anulada.
  const isVoided = !!sale?.cancelled_at
  const canVoid = can('ventas.anular')
  const shiftOpen = !!currentShift
  const inCurrentShift =
    !!sale && !!currentShift &&
    new Date(sale.created_at).getTime() >= new Date(currentShift.opened_at).getTime()
  const voidEligible = shiftOpen && inCurrentShift
  // Tooltip = mensaje EXACTO de la RPC según el motivo del bloqueo.
  const voidBlockedReason = !shiftOpen
    ? 'No hay un turno de caja abierto'
    : !inCurrentShift
      ? 'Esta venta pertenece a un turno cerrado y no puede anularse; para corregirla se necesita una devolución'
      : ''

  const confirmVoid = () => {
    if (!sale || !reason.trim()) return
    voidMutation.mutate(
      { orderId: sale.id, reason: reason.trim() },
      { onSuccess: () => { setVoiding(false); setReason('') } },
    )
  }

  const subtotal = useMemo(() => {
    if (!sale) return 0
    return sale.order_items.reduce((acc, it) => {
      const extras = it.order_item_extras.reduce((a, e) => a + e.unit_price * e.qty, 0)
      return acc + it.unit_price * it.qty + extras
    }, 0)
  }, [sale])

  const discount = sale ? Math.max(0, subtotal - sale.total) : 0
  // Reimpresión: etiqueta de método(s) combinada ("Efectivo + Nequi" en mixto);
  // null si es fiado sin payments (el ticket omite la línea de método).
  const method = sale && sale.payments.length > 0 ? methodDisplay(sale) : null

  const handleReprint = () => {
    if (!sale) return
    printSaleTicket({
      sedeName: sede?.name,
      sedeAddress: sede?.address,
      orderNumber: sale.order_number,
      orderId: sale.id,
      canal: sale.canal,
      method,
      createdAt: sale.created_at,
      total: sale.total,
      items: sale.order_items.map((it) => ({
        qty: it.qty,
        name: it.products?.name ?? '—',
        unitPrice: it.unit_price,
        notes: it.notes,
        extras: it.order_item_extras.map((e) => ({
          name: e.extras?.name ?? 'Extra', qty: e.qty, unitPrice: e.unit_price,
        })),
      })),
    })
  }

  return (
    <div
      style={{ position: 'absolute', inset: 0, background: 'var(--overlay)', display: 'grid', placeItems: 'center', zIndex: 50 }}
      onClick={onClose}
    >
      <div
        data-testid="sale-detail-modal"
        style={{ background: 'var(--surface)', borderRadius: 14, width: 480, maxWidth: '94%', maxHeight: '88%', boxShadow: 'var(--shadow-1)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border-2)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Detalle de venta
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--ink)', letterSpacing: -0.4 }}>
              {sale?.order_number != null ? `Venta #${sale.order_number}` : 'Venta'}
            </div>
            {sale && (
              <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 2 }}>
                {formatDateTime(sale.created_at)} · {CANAL[sale.canal as Canal].label}
              </div>
            )}
            {isVoided && sale && (
              <div style={{ marginTop: 8 }}>
                {/* Tercer badge inline absorbido por la primitiva (§4). Tono
                    `danger` y no `debt`: anular está en la familia del error
                    según §1.2 ("validación fallida, anular compra, eliminar").
                    Los tres usos de esta pantalla comparten forma exacta, así
                    que los tres van al mismo componente. */}
                <Badge tone="danger" data-testid="sale-voided-badge">
                  <Ban size={13} /> Venta anulada
                </Badge>
                <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 4 }}>
                  {formatDateTime(sale.cancelled_at!)} · {sale.canceller?.full_name ?? '—'}
                </div>
                {sale.cancel_reason && (
                  <div style={{ fontSize: 11.5, color: 'var(--ink-2)', marginTop: 1 }}>
                    Motivo: <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{sale.cancel_reason}</span>
                  </div>
                )}
              </div>
            )}
          </div>
          <button onClick={onClose} style={{ background: 'var(--border-2)', border: 'none', width: 32, height: 32, borderRadius: 8, cursor: 'pointer', color: 'var(--ink-3)', display: 'grid', placeItems: 'center' }}>
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: 'auto', padding: 22 }}>
          {isLoading || !sale ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--ink-4)', fontSize: 13 }}>
              Cargando detalle...
            </div>
          ) : (
            <>
              {/* Meta */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 16, fontSize: 12.5, color: 'var(--ink-2)' }}>
                {sale.customer_name && <div>Cliente: <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{sale.customer_name}</span>{sale.customer_phone ? ` · ${sale.customer_phone}` : ''}</div>}
                <div>Atendió: <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{sale.profiles?.full_name ?? '—'}</span></div>
                <div>Pago: <span data-testid="sale-detail-method" style={{ fontWeight: 600, color: 'var(--ink)' }}>{methodDisplay(sale)}</span></div>
                {sale.payments.length > 1 && (
                  <div data-testid="sale-detail-payments" style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 2, paddingLeft: 10 }}>
                    {sale.payments.map((p, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', maxWidth: 220 }}>
                        <span>{METHOD_LABEL[p.method]}</span>
                        <span style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--ink)' }}>{formatoCOP(p.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Items */}
              <div style={{ border: '1px solid var(--border-2)', borderRadius: 10, overflow: 'hidden' }}>
                {sale.order_items.map((it) => {
                  const extrasTotal = it.order_item_extras.reduce((a, e) => a + e.unit_price * e.qty, 0)
                  const lineTotal = it.unit_price * it.qty + extrasTotal
                  return (
                    <div key={it.id} data-testid="sale-detail-item" style={{ padding: '10px 14px', borderBottom: '1px solid var(--surface-2)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                        <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>
                          {it.qty}× {it.products?.name ?? '—'}
                        </span>
                        <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>
                          {formatoCOP(lineTotal)}
                        </span>
                      </div>
                      {it.order_item_extras.length > 0 && (
                        <div data-testid="sale-detail-extras" style={{ marginTop: 3 }}>
                          {it.order_item_extras.map((e) => (
                            <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: 'var(--success-on-soft)', paddingLeft: 10 }}>
                              <span>+ {e.extras?.name ?? 'Extra'} ×{e.qty}</span>
                              <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatoCOP(e.unit_price * e.qty)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {it.notes && (
                        <div style={{ fontSize: 11.5, color: 'var(--warning-on-soft)', marginTop: 2, paddingLeft: 10 }}>* {it.notes}</div>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Totals */}
              <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: 'var(--ink-2)' }}>
                  <span>Subtotal</span>
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatoCOP(subtotal)}</span>
                </div>
                {discount > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: 'var(--danger)' }}>
                    <span>Descuento</span>
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>-{formatoCOP(discount)}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 4 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>Total</span>
                  <span style={{ fontSize: 24, fontWeight: 700, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums', letterSpacing: -0.6 }}>
                    {formatoCOP(sale.total)}
                  </span>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 22px', borderTop: '1px solid var(--border-2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          {/* Anular: solo con permiso y venta aún no anulada. Deshabilitado (no
              oculto) cuando no es del turno actual, con el motivo en el tooltip. */}
          <div>
            {canVoid && !isVoided && sale && (
              <button
                data-testid="sale-void-button"
                disabled={!voidEligible}
                title={voidEligible ? 'Anular esta venta' : voidBlockedReason}
                onClick={() => setVoiding(true)}
                style={{
                  padding: '11px 18px', borderRadius: 9,
                  border: `1.5px solid ${voidEligible ? 'var(--danger-soft)' : 'var(--border)'}`,
                  background: voidEligible ? 'var(--surface)' : 'var(--surface-2)',
                  cursor: voidEligible ? 'pointer' : 'not-allowed',
                  fontSize: 13.5, fontWeight: 700,
                  color: voidEligible ? 'var(--danger-on-soft)' : 'var(--ink-4)',
                  display: 'flex', alignItems: 'center', gap: 7,
                }}
              >
                <Ban size={15} /> Anular venta
              </button>
            )}
          </div>
          <button
            data-testid="sale-reprint"
            disabled={!sale}
            onClick={handleReprint}
            style={{
              padding: '11px 20px', border: 'none',
              background: sale ? 'var(--action)' : 'var(--ink-4)', borderRadius: 9,
              cursor: sale ? 'pointer' : 'not-allowed', fontSize: 13.5, fontWeight: 700, color: 'var(--surface)',
              display: 'flex', alignItems: 'center', gap: 7,
              boxShadow: sale ? '0 6px 16px rgba(16,185,129,.35)' : 'none',
            }}
          >
            <Printer size={15} /> Reimprimir ticket
          </button>
        </div>

        {/* Diálogo de anulación — motivo OBLIGATORIO + confirmación explícita */}
        {voiding && sale && (
          <div
            style={{ position: 'absolute', inset: 0, background: 'var(--overlay)', display: 'grid', placeItems: 'center', zIndex: 60 }}
            onClick={() => { if (!voidMutation.isPending) { setVoiding(false); setReason('') } }}
          >
            <div
              data-testid="sale-void-dialog"
              style={{ background: 'var(--surface)', borderRadius: 12, width: 420, maxWidth: '92%', boxShadow: 'var(--shadow-1)', overflow: 'hidden' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ padding: '18px 22px', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--danger-soft)', color: 'var(--danger)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                  <AlertTriangle size={20} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>
                    Anular {sale.order_number != null ? `venta #${sale.order_number}` : 'venta'}
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 3, lineHeight: 1.4 }}>
                    Devuelve el stock al inventario y la saca del cuadre del turno. La venta queda registrada como anulada (no se borra). Esta acción no se puede deshacer.
                  </div>
                </div>
              </div>
              <div style={{ padding: '0 22px 4px' }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', display: 'block', marginBottom: 6 }}>
                  Motivo <span style={{ color: 'var(--danger)' }}>*</span>
                </label>
                <textarea
                  data-testid="sale-void-reason"
                  autoFocus
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Ej: error del cajero, producto equivocado…"
                  rows={3}
                  style={{ width: '100%', border: '1.5px solid var(--border)', borderRadius: 8, padding: '9px 11px', fontSize: 13, color: 'var(--ink)', outline: 'none', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit' }}
                />
              </div>
              <div style={{ padding: '14px 22px 20px', display: 'flex', gap: 10 }}>
                <button
                  onClick={() => { setVoiding(false); setReason('') }}
                  disabled={voidMutation.isPending}
                  style={{ flex: 1, padding: '11px', border: '1.5px solid var(--border)', background: 'var(--surface)', borderRadius: 9, cursor: 'pointer', fontSize: 13.5, fontWeight: 600, color: 'var(--ink-2)' }}
                >
                  Cancelar
                </button>
                <button
                  data-testid="sale-void-confirm"
                  disabled={!reason.trim() || voidMutation.isPending}
                  onClick={confirmVoid}
                  style={{
                    flex: 2, padding: '11px', border: 'none', borderRadius: 9,
                    background: !reason.trim() || voidMutation.isPending ? 'var(--ink-4)' : 'var(--danger)',
                    cursor: !reason.trim() || voidMutation.isPending ? 'not-allowed' : 'pointer',
                    fontSize: 13.5, fontWeight: 700, color: 'var(--surface)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                  }}
                >
                  {voidMutation.isPending ? 'Anulando…' : <><Ban size={15} /> Confirmar anulación</>}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Página ───────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  padding: '9px 12px', border: '1.5px solid var(--border)', borderRadius: 8,
  fontSize: 13, color: 'var(--ink)', outline: 'none', boxSizing: 'border-box',
  fontFamily: 'inherit', background: 'var(--surface)',
}

export function SalesHistoryPage() {
  const [from, setFrom] = useState(daysAgoBogota(30))
  const [to, setTo] = useState(todayBogota())
  const [method, setMethod] = useState<PayMethod | ''>('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [detailId, setDetailId] = useState<string | null>(null)

  const { rows, count, pageCount, isLoading, isFetching } = useSalesHistory({
    from, to, method: method || null, search, page,
  })

  // Sección "Anuladas": solo con filtro de método activo (sin filtro las
  // anuladas ya salen inline). Una anulada perdió sus payments → sin método →
  // no bucketizable; se muestra aparte. No toca la query paginada.
  const { rows: cancelledRows } = useCancelledSales({ from, to, enabled: !!method })

  // Cualquier cambio de filtro vuelve a la primera página.
  const resetPage = () => setPage(0)

  const rangeFrom = count === 0 ? 0 : page * SALES_PAGE_SIZE + 1
  const rangeTo = Math.min(count, (page + 1) * SALES_PAGE_SIZE)

  return (
    <div
      className="flex flex-col h-full overflow-hidden"
      style={{ background: 'var(--bg)', color: 'var(--ink)', position: 'relative' }}
    >
      {/* Quinta pantalla con el patrón. El título es el que ya tenía. */}
      <PageHeader titulo="Historial de ventas" descripcion="ventas cobradas y anuladas, por sede" />

      {/* Controls bar */}
      <div style={{ padding: '14px 24px', background: 'var(--surface-3)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <Receipt size={16} color="var(--ink-3)" />
          <div style={{ fontSize: 12, color: 'var(--ink-3)', fontVariantNumeric: 'tabular-nums' }}>
            {count} {count === 1 ? 'venta' : 'ventas'}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Search por número */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface-2)', borderRadius: 8, padding: '8px 12px', border: '1px solid var(--border)', minWidth: 220 }}>
            <Search size={15} color="var(--ink-4)" />
            <input
              data-testid="sales-search"
              value={search}
              onChange={(e) => { setSearch(e.target.value); resetPage() }}
              placeholder="Buscar por número de venta..."
              inputMode="numeric"
              style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 13, color: 'var(--ink)' }}
            />
            {search && (
              <button onClick={() => { setSearch(''); resetPage() }} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--ink-4)', padding: 0, display: 'grid', placeItems: 'center' }}>
                <X size={14} />
              </button>
            )}
          </div>

          {/* Rango de fechas */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Calendar size={15} color="var(--ink-4)" />
            <input
              data-testid="sales-from"
              type="date"
              value={from}
              max={to}
              onChange={(e) => { setFrom(e.target.value); resetPage() }}
              style={inputStyle}
            />
            <span style={{ color: 'var(--ink-4)', fontSize: 13 }}>→</span>
            <input
              data-testid="sales-to"
              type="date"
              value={to}
              min={from}
              max={todayBogota()}
              onChange={(e) => { setTo(e.target.value); resetPage() }}
              style={inputStyle}
            />
          </div>

          {/* Método */}
          <select
            data-testid="sales-method"
            value={method}
            onChange={(e) => { setMethod(e.target.value as PayMethod | ''); resetPage() }}
            style={{ ...inputStyle, cursor: 'pointer' }}
          >
            {METHOD_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflow: 'auto', padding: '12px 24px 24px' }}>
        {/* Sección Anuladas — solo con filtro de método activo. Las anuladas no
            tienen método (payments borrados) → van aparte, no en el bucket. */}
        {method && cancelledRows.length > 0 && (
          <div data-testid="cancelled-sales-section" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Ban size={14} color="var(--danger-on-soft)" />
              <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--danger-on-soft)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
                Anuladas ({cancelledRows.length})
              </span>
              <span style={{ fontSize: 11.5, color: 'var(--ink-4)' }}>
                sin método — no se filtran por método de pago
              </span>
            </div>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--danger-soft)', borderRadius: 12, overflow: 'hidden' }}>
              {cancelledRows.map((row: CancelledSaleRow) => (
                <button
                  key={row.id}
                  data-testid="cancelled-sale-row"
                  onClick={() => setDetailId(row.id)}
                  style={{
                    width: '100%', textAlign: 'left', display: 'grid',
                    gridTemplateColumns: '90px 1fr 130px', gap: 12, alignItems: 'center',
                    padding: '13px 16px', borderBottom: '1px solid var(--danger-soft)',
                    background: 'var(--surface)', border: 'none', cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--danger-soft)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--surface)')}
                >
                  <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>
                    #{row.order_number}
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 13, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>
                      {formatDateTime(row.cancelled_at ?? row.created_at)}
                    </span>
                    <span style={{ display: 'block', fontSize: 12, color: 'var(--ink-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {row.canceller?.full_name ?? '—'}{row.cancel_reason ? ` · ${row.cancel_reason}` : ''}
                    </span>
                  </span>
                  <span style={{ textAlign: 'right' }}>
                    <Badge tone="danger" data-testid="sale-voided-badge">
                      <Ban size={11} /> Anulada
                    </Badge>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {isLoading ? (
          <div style={{ padding: 50, textAlign: 'center', color: 'var(--ink-4)', fontSize: 13.5 }}>
            Cargando ventas...
          </div>
        ) : rows.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center', color: 'var(--ink-4)', fontSize: 13.5 }}>
            <Receipt size={32} style={{ margin: '0 auto 14px', display: 'block', opacity: 0.3 }} />
            No hay ventas para los filtros seleccionados.
          </div>
        ) : (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 12, overflow: 'hidden', opacity: isFetching ? 0.7 : 1, transition: 'opacity .12s' }}>
            {/* Head */}
            <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr 130px 130px 120px', gap: 12, padding: '11px 16px', borderBottom: '1px solid var(--border-2)', background: 'var(--surface-2)', fontSize: 11, fontWeight: 700, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
              <span>Venta</span>
              <span>Fecha · Cliente</span>
              <span>Tipo</span>
              <span>Método</span>
              <span style={{ textAlign: 'right' }}>Total</span>
            </div>
            {/* Rows */}
            {rows.map((row: SalesHistoryRow) => {
              const ot = CANAL[row.canal as Canal]
              return (
                <button
                  key={row.id}
                  data-testid="sale-row"
                  onClick={() => setDetailId(row.id)}
                  style={{
                    width: '100%', textAlign: 'left', display: 'grid',
                    gridTemplateColumns: '90px 1fr 130px 130px 120px', gap: 12, alignItems: 'center',
                    padding: '13px 16px', borderBottom: '1px solid var(--surface-2)',
                    background: 'var(--surface)', border: 'none', cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--surface)')}
                >
                  <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>
                    #{row.order_number}
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 13, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>
                      {formatDateTime(row.created_at)}
                    </span>
                    {row.customer_name && (
                      <span style={{ display: 'block', fontSize: 12, color: 'var(--ink-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {row.customer_name}
                      </span>
                    )}
                  </span>
                  <span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: ot.bg, color: ot.fg, borderRadius: 6, padding: '3px 9px', fontSize: 11.5, fontWeight: 600 }}>
                      {ot.icon} {ot.label}
                    </span>
                  </span>
                  <span data-testid="sale-row-method" style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>
                    {row.cancelled_at ? (
                      <Badge tone="danger" data-testid="sale-voided-badge">
                        <Ban size={11} /> Anulada
                      </Badge>
                    ) : (
                      methodDisplay(row)
                    )}
                  </span>
                  <span style={{ textAlign: 'right', fontSize: 14, fontWeight: 700, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>
                    {formatoCOP(row.total)}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Pagination */}
      {count > 0 && (
        <div style={{ flexShrink: 0, padding: '12px 24px', borderTop: '1px solid var(--border-2)', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>
            {rangeFrom}–{rangeTo} de {count}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              data-testid="sales-prev"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              style={{
                width: 34, height: 34, borderRadius: 8, border: '1px solid var(--border)',
                background: 'var(--surface)', cursor: page === 0 ? 'not-allowed' : 'pointer',
                color: page === 0 ? 'var(--ink-4)' : 'var(--ink-2)', display: 'grid', placeItems: 'center',
              }}
            >
              <ChevronLeft size={16} />
            </button>
            <span style={{ fontSize: 12.5, color: 'var(--ink-2)', fontVariantNumeric: 'tabular-nums', minWidth: 70, textAlign: 'center' }}>
              {page + 1} / {pageCount}
            </span>
            <button
              data-testid="sales-next"
              disabled={page + 1 >= pageCount}
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              style={{
                width: 34, height: 34, borderRadius: 8, border: '1px solid var(--border)',
                background: 'var(--surface)', cursor: page + 1 >= pageCount ? 'not-allowed' : 'pointer',
                color: page + 1 >= pageCount ? 'var(--ink-4)' : 'var(--ink-2)', display: 'grid', placeItems: 'center',
              }}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Detail modal */}
      {detailId && <SaleDetailModal orderId={detailId} onClose={() => setDetailId(null)} />}
    </div>
  )
}
