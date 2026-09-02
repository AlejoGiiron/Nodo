import { X } from 'lucide-react'
import { usePurchaseInvoiceDetail } from '@/hooks/usePurchases'
import { formatoCOP } from '@/lib/formato'

interface PurchaseDetailModalProps {
  invoiceId: string
  onClose: () => void
}


const fmtDateTime = (iso: string) =>
  new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))

export function PurchaseDetailModal({ invoiceId, onClose }: PurchaseDetailModalProps) {
  const { invoice, isLoading } = usePurchaseInvoiceDetail(invoiceId)

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'var(--overlay)', display: 'grid', placeItems: 'center', zIndex: 50, fontFamily: 'inherit', padding: 20 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        data-testid="purchase-detail-modal"
        style={{ background: 'var(--surface)', borderRadius: 14, width: 560, maxWidth: '100%', maxHeight: '90vh', boxShadow: 'var(--shadow-1)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
      >
        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border-2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--action)', textTransform: 'uppercase', letterSpacing: 1 }}>Compra</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--ink)', letterSpacing: -0.3, marginTop: 1 }}>
              {invoice?.suppliers?.name ?? 'Detalle de compra'}
            </div>
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--border-2)', border: 'none', cursor: 'pointer', color: 'var(--ink-3)', display: 'grid', placeItems: 'center' }}><X size={16} /></button>
        </div>

        <div style={{ padding: 22, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {isLoading || !invoice ? (
            <div style={{ padding: '30px 0', textAlign: 'center', color: 'var(--ink-4)', fontSize: 13 }}>Cargando...</div>
          ) : (
            <>
              {/* Metadatos */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 13 }}>
                <Meta label="Fecha" value={fmtDateTime(invoice.created_at)} />
                <Meta label="N.° factura" value={invoice.invoice_number ?? '—'} />
                <Meta label="Registró" value={invoice.profiles?.full_name ?? '—'} />
                {invoice.suppliers?.contact && <Meta label="Contacto" value={invoice.suppliers.contact} />}
                {invoice.suppliers?.phone && <Meta label="Teléfono" value={invoice.suppliers.phone} />}
              </div>

              {invoice.notes && (
                <div style={{ fontSize: 13, color: 'var(--ink-2)', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 9, padding: '10px 12px' }}>
                  {invoice.notes}
                </div>
              )}

              {/* Ítems */}
              <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: 'var(--surface-2)', textAlign: 'left', color: 'var(--ink-3)', fontSize: 11.5 }}>
                      <th style={{ padding: '9px 12px', fontWeight: 600 }}>Producto</th>
                      <th style={{ padding: '9px 12px', fontWeight: 600, textAlign: 'right' }}>Cant.</th>
                      <th style={{ padding: '9px 12px', fontWeight: 600, textAlign: 'right' }}>Costo</th>
                      <th style={{ padding: '9px 12px', fontWeight: 600, textAlign: 'right' }}>Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoice.purchase_invoice_items.map(it => (
                      <tr key={it.id} data-testid="purchase-detail-item" style={{ borderTop: '1px solid var(--border-2)' }}>
                        <td style={{ padding: '10px 12px', fontWeight: 600, color: 'var(--ink)' }}>{it.products?.name ?? '—'}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{it.qty}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--ink-3)' }}>{formatoCOP(it.unit_cost)}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{formatoCOP(it.subtotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Total */}
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'flex-end', gap: 10 }}>
                <span style={{ fontSize: 12.5, color: 'var(--ink-3)', fontWeight: 600 }}>Total</span>
                <span style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--ink)' }}>{formatoCOP(invoice.total)}</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--ink-4)', fontWeight: 600 }}>{label}</div>
      <div style={{ color: 'var(--ink)', fontWeight: 600, marginTop: 1 }}>{value}</div>
    </div>
  )
}
