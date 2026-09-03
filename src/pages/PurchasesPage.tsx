import { useState } from 'react'
import {
  Plus, Pencil, Trash2, ChevronLeft, ChevronRight, Building2, Phone,
} from 'lucide-react'
import { useSuppliers, type Supplier } from '@/hooks/useSuppliers'
import { usePurchaseInvoices } from '@/hooks/usePurchases'
import { SupplierFormModal } from '@/components/purchases/SupplierFormModal'
import { NewInvoiceModal } from '@/components/purchases/NewInvoiceModal'
import { PurchaseDetailModal } from '@/components/purchases/PurchaseDetailModal'
import { Button } from '@/components/ui/Button'
import { MoneyCell } from '@/components/ui/MoneyCell'
import { Badge } from '@/components/ui/Badge'
import { PageHeader } from '@/components/ui/PageHeader'

type Tab = 'invoices' | 'suppliers'

// El formateador local murió acá: las cifras pasan por MoneyCell, que aplica
// tabular-nums y el formato sin símbolo del §2 sin que nadie tenga que
// acordarse. Quedan **16 copias** en src/ (eran 19 antes de Compras); cada una
// muere cuando su pantalla migra, no en un sed. Ver src/lib/formato.ts.

const fmtDate = (iso: string) =>
  new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))

// ─── Compras tab ─────────────────────────────────────────────────
function InvoicesTab({ onNew, onOpen }: { onNew: () => void; onOpen: (id: string) => void }) {
  const [page, setPage] = useState(0)
  const { rows, count, pageCount, isFetching } = usePurchaseInvoices(page)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-3)', overflow: 'hidden', opacity: isFetching ? 0.6 : 1, transition: 'opacity .15s' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            {/* Etiquetas de columna: el otro de los dos únicos lugares donde la
                skill permite mayúscula sostenida (--fs-label, §2). */}
            <tr style={{ background: 'var(--surface-2)', textAlign: 'left', color: 'var(--ink-3)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em' }}>
              <th style={{ padding: '9px 16px', fontWeight: 600 }}>Fecha</th>
              <th style={{ padding: '9px 16px', fontWeight: 600 }}>Proveedor</th>
              <th style={{ padding: '9px 16px', fontWeight: 600 }}>N.° factura</th>
              <th style={{ padding: '9px 16px', fontWeight: 600, textAlign: 'right' }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              // EmptyState (§4): siempre con al menos un botón. Una pantalla
              // vacía es una invitación a actuar, no un mensaje de ánimo.
              <tr><td colSpan={4} style={{ padding: '40px 16px', textAlign: 'center' }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)', marginBottom: 4 }}>
                  Aún no hay compras registradas
                </div>
                <div style={{ fontSize: 13, color: 'var(--ink-3)', marginBottom: 14 }}>
                  Cada compra sube el stock y actualiza el costo de los productos.
                </div>
                <Button onClick={onNew}><Plus size={15} /> Registrar compra</Button>
              </td></tr>
            ) : rows.map(inv => (
              <tr
                key={inv.id}
                data-testid="purchase-row"
                onClick={() => onOpen(inv.id)}
                className="nodo-fila"
                style={{ borderTop: '1px solid var(--border-2)', cursor: 'pointer' }}
              >
                <td style={{ padding: '10px 16px', color: 'var(--ink-3)', fontVariantNumeric: 'tabular-nums', fontSize: 12 }}>{fmtDate(inv.created_at)}</td>
                <td style={{ padding: '10px 16px', color: 'var(--ink)' }}>{inv.suppliers?.name ?? '—'}</td>
                <td style={{ padding: '10px 16px', color: 'var(--ink-3)' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    {inv.invoice_number ?? '—'}
                    {/* 🔴 Una devolución vive en la misma tabla y con `total`
                        POSITIVO: sin este rótulo se lee como una compra más, y
                        la columna de la derecha parecería sumar cuando resta. */}
                    {inv.kind === 'return' && (
                      <Badge tone="success" data-testid="purchase-kind-return"
                             title="Devolución al proveedor: la mercancía salió y la plata volvió a la caja">
                        Devolución
                      </Badge>
                    )}
                  </span>
                </td>
                <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                  {/* El signo se pinta acá, donde se lee: MoneyCell manda los
                      negativos a --success-700, que es el token de "plata que
                      entra" (§4). En la base el total es positivo y el signo lo
                      lleva `kind` — un solo lugar decide, y es éste. */}
                  <MoneyCell
                    value={inv.kind === 'return' ? -inv.total : inv.total}
                    style={{ fontWeight: 600 }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12.5, color: 'var(--ink-3)', fontVariantNumeric: 'tabular-nums' }}>{count} compra{count !== 1 ? 's' : ''}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} style={{ padding: '6px 10px', borderRadius: 'var(--r-2)', border: '1px solid var(--border)', background: 'var(--surface)', cursor: page === 0 ? 'not-allowed' : 'pointer', color: 'var(--ink-2)', opacity: page === 0 ? 0.4 : 1, display: 'grid', placeItems: 'center' }}><ChevronLeft size={15} /></button>
          <span style={{ fontSize: 12.5, color: 'var(--ink-3)', fontVariantNumeric: 'tabular-nums' }}>{page + 1} / {pageCount}</span>
          <button onClick={() => setPage(p => (p + 1 < pageCount ? p + 1 : p))} disabled={page + 1 >= pageCount} style={{ padding: '6px 10px', borderRadius: 'var(--r-2)', border: '1px solid var(--border)', background: 'var(--surface)', cursor: page + 1 >= pageCount ? 'not-allowed' : 'pointer', color: 'var(--ink-2)', opacity: page + 1 >= pageCount ? 0.4 : 1, display: 'grid', placeItems: 'center' }}><ChevronRight size={15} /></button>
        </div>
      </div>
    </div>
  )
}

// ─── Proveedores tab ─────────────────────────────────────────────
function SuppliersTab({ onEdit }: { onEdit: (s: Supplier | 'new') => void }) {
  const { suppliers, isLoading, deactivate } = useSuppliers()

  const handleDeactivate = async (s: Supplier) => {
    if (!window.confirm(`¿Desactivar el proveedor "${s.name}"?`)) return
    await deactivate(s.id)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {isLoading ? (
        // Skeleton, nunca un spinner en blanco (§4 DataRow).
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-3)', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[0, 1, 2].map(i => <div key={i} className="nodo-skeleton" style={{ width: `${70 - i * 12}%` }} />)}
        </div>
      ) : suppliers.length === 0 ? (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-3)', padding: '48px 16px', textAlign: 'center' }}>
          <Building2 size={28} color="var(--ink-4)" style={{ margin: '0 auto 10px', display: 'block' }} />
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)', marginBottom: 4 }}>
            Aún no hay proveedores
          </div>
          <div style={{ fontSize: 13, color: 'var(--ink-3)', marginBottom: 14 }}>
            Registrar una compra necesita un proveedor. Creá el primero.
          </div>
          <Button onClick={() => onEdit('new')}><Plus size={15} /> Nuevo proveedor</Button>
        </div>
      ) : (
        <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-3)', overflow: 'hidden', background: 'var(--surface)' }}>
          {suppliers.map((s, idx) => (
            <div key={s.id} data-testid="supplier-row" className="nodo-fila" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: idx < suppliers.length - 1 ? '1px solid var(--border-2)' : 'none' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, color: 'var(--ink)' }}>{s.name}</div>
                <div style={{ display: 'flex', gap: 14, fontSize: 12, color: 'var(--ink-3)', marginTop: 2, flexWrap: 'wrap' }}>
                  {s.contact && <span>{s.contact}</span>}
                  {s.phone && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Phone size={11} /> {s.phone}</span>}
                  {s.nit && <span>NIT {s.nit}</span>}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => onEdit(s)} title="Editar" style={{ width: 30, height: 30, border: '1px solid var(--border)', background: 'var(--surface)', borderRadius: 'var(--r-2)', cursor: 'pointer', color: 'var(--ink-3)', display: 'grid', placeItems: 'center' }}><Pencil size={13} /></button>
                {/* Destructivo = CONTORNO. El relleno sólido --danger está
                    reservado (§4), y desactivar un proveedor es reversible. */}
                <button data-testid="supplier-deactivate" onClick={() => handleDeactivate(s)} title="Desactivar" style={{ width: 30, height: 30, border: '1px solid var(--danger-soft)', background: 'var(--surface)', borderRadius: 'var(--r-2)', cursor: 'pointer', color: 'var(--danger)', display: 'grid', placeItems: 'center' }}><Trash2 size={13} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Page ────────────────────────────────────────────────────────
export function PurchasesPage() {
  const [tab, setTab] = useState<Tab>('invoices')
  const [invoiceOpen, setInvoiceOpen] = useState(false)
  const [editSupplier, setEditSupplier] = useState<Supplier | 'new' | null>(null)
  const [detailId, setDetailId] = useState<string | null>(null)

  return (
    <div style={{ height: '100%', overflow: 'auto', background: 'var(--bg)', color: 'var(--ink)' }}>
      {/* 🔴 SIN EYEBROW. Decía "ADMINISTRACIÓN" en mayúscula sostenida y con el
          acento del otro producto. La skill reserva la mayúscula sostenida a
          etiquetas de columna y de KPI, pide títulos en caja de oración (§5), y
          el eyebrow además repetía lo que el sidebar ya dice: el ítem activo es
          el que ubica. El título baja de 22/700 a --fs-head (16/600): el
          encabezado ubica, no compite con el contenido. */}
      <PageHeader
        titulo="Compras"
        descripcion="facturas de proveedor y proveedores, por sede"
        accion={tab === 'invoices'
          ? <Button data-testid="new-invoice-btn" onClick={() => setInvoiceOpen(true)}><Plus size={15} /> Registrar compra</Button>
          : <Button data-testid="new-supplier-btn" onClick={() => setEditSupplier('new')}><Plus size={15} /> Nuevo proveedor</Button>}
        tabs={[
          { id: 'invoices', label: 'Compras', testid: 'purchases-tab-invoices' },
          { id: 'suppliers', label: 'Proveedores', testid: 'purchases-tab-suppliers' },
        ]}
        tabActivo={tab}
        onTab={(id) => setTab(id as Tab)}
      />

      {/* Content */}
      <div style={{ padding: '20px 24px' }}>
        {tab === 'invoices'
          ? <InvoicesTab onNew={() => setInvoiceOpen(true)} onOpen={setDetailId} />
          : <SuppliersTab onEdit={setEditSupplier} />}
      </div>

      {invoiceOpen && (
        <NewInvoiceModal
          onClose={() => setInvoiceOpen(false)}
          onNeedSupplier={() => { setInvoiceOpen(false); setEditSupplier('new'); setTab('suppliers') }}
        />
      )}
      {editSupplier && <SupplierFormModal supplier={editSupplier} onClose={() => setEditSupplier(null)} />}
      {detailId && <PurchaseDetailModal invoiceId={detailId} onClose={() => setDetailId(null)} />}
    </div>
  )
}
