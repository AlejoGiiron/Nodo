import { useMemo, useState } from 'react'
import { X, Plus, Trash2, Loader2, PackageCheck } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { useSuppliers } from '@/hooks/useSuppliers'
import { useProducts } from '@/hooks/useProducts'
import { useRegisterPurchase } from '@/hooks/usePurchases'
import { formatoCOP } from '@/lib/formato'

interface NewInvoiceModalProps {
  onClose: () => void
  /** Abre directo el form de proveedor (cuando no hay ninguno). */
  onNeedSupplier: () => void
}

interface DraftLine {
  key: string
  product_id: string
  /** Unidades de COMPRA (bultos), no de venta. */
  qty: string
  unit_cost: string
  /** Etiqueta libre de la presentación. Vacío = se compra en la unidad de venta. */
  purchase_unit: string
  /** Cuántas unidades de venta trae una de compra. '' se lee como 1. */
  factor: string
}


const fieldLabel: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 6,
}
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 13px', border: '1.5px solid var(--border)', borderRadius: 9,
  fontSize: 14, color: 'var(--ink)', outline: 'none', boxSizing: 'border-box', background: 'var(--surface)',
}

let lineSeq = 0
const newLine = (): DraftLine => ({
  key: `l${lineSeq++}`, product_id: '', qty: '1', unit_cost: '',
  purchase_unit: '', factor: '',
})

/** '' o '0' se leen como 1: comprar suelto es el caso normal. */
const factorDe = (l: DraftLine) => Math.max(1, parseInt(l.factor, 10) || 1)

export function NewInvoiceModal({ onClose, onNeedSupplier }: NewInvoiceModalProps) {
  const { suppliers } = useSuppliers()
  const { data: products = [] } = useProducts()
  const { registerPurchase, isRegistering } = useRegisterPurchase()

  const [supplierId, setSupplierId] = useState('')
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<DraftLine[]>([newLine()])

  const productById = useMemo(() => {
    const m = new Map<string, (typeof products)[number]>()
    for (const p of products) m.set(p.id, p)
    return m
  }, [products])

  const lineSubtotal = (l: DraftLine) =>
    (parseInt(l.qty, 10) || 0) * (parseInt(l.unit_cost, 10) || 0)

  const total = useMemo(() => lines.reduce((s, l) => s + lineSubtotal(l), 0), [lines])

  const updateLine = (key: string, patch: Partial<DraftLine>) =>
    setLines(ls => ls.map(l => (l.key === key ? { ...l, ...patch } : l)))

  // Al elegir producto, prellena el costo con su último costo conocido.
  const onPickProduct = (key: string, productId: string) => {
    const p = productById.get(productId)
    const cost = p?.cost_price != null ? String(Math.round(p.cost_price)) : ''
    updateLine(key, { product_id: productId, unit_cost: cost })
  }

  const removeLine = (key: string) => setLines(ls => (ls.length > 1 ? ls.filter(l => l.key !== key) : ls))

  const validLines = lines.filter(
    l => l.product_id && (parseInt(l.qty, 10) || 0) > 0 && (parseInt(l.unit_cost, 10) || 0) >= 0,
  )
  const isValid = !!supplierId && validLines.length > 0

  const handleSubmit = async () => {
    if (!supplierId) { toast.error('Selecciona un proveedor'); return }
    if (validLines.length === 0) { toast.error('Agrega al menos un ítem con cantidad y costo'); return }

    await registerPurchase({
      invoice: {
        supplier_id: supplierId,
        invoice_number: invoiceNumber.trim() || null,
        notes: notes.trim() || null,
      },
      items: validLines.map(l => ({
        // ⚠️ `purchase_unit` y el factor viajan JUNTOS o no viajan. Mandar la
        //    etiqueta sin el factor hace que la RPC rechace la compra entera —
        //    a propósito, es fail-closed: un factor asumido en 1 cuando era 50
        //    deja el costo unitario 50 veces más alto, y ese costo se congela
        //    al vender.
        ...(l.purchase_unit.trim()
          ? { purchase_unit: l.purchase_unit.trim(), units_per_purchase_unit: factorDe(l) }
          : {}),
        product_id: l.product_id,
        qty: parseInt(l.qty, 10),
        unit_cost: parseInt(l.unit_cost, 10),
      })),
    })
    onClose()
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'var(--overlay)', display: 'grid', placeItems: 'center', zIndex: 50, fontFamily: 'inherit', padding: 20 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        data-testid="new-invoice-modal"
        style={{ background: 'var(--surface)', borderRadius: 14, width: 720, maxWidth: '100%', maxHeight: '92vh', boxShadow: 'var(--shadow-1)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
      >
        {/* Header */}
        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border-2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--action)', textTransform: 'uppercase', letterSpacing: 1 }}>Compras</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--ink)', letterSpacing: -0.3, marginTop: 1 }}>Registrar compra</div>
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--border-2)', border: 'none', cursor: 'pointer', color: 'var(--ink-3)', display: 'grid', placeItems: 'center' }}><X size={16} /></button>
        </div>

        {/* Body */}
        <div style={{ padding: 22, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Cabecera */}
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 2 }}>
              <label style={fieldLabel}>Proveedor <span style={{ color: 'var(--danger)' }}>*</span></label>
              {suppliers.length === 0 ? (
                <button
                  data-testid="invoice-create-supplier"
                  onClick={onNeedSupplier}
                  style={{ ...inputStyle, textAlign: 'left', cursor: 'pointer', color: 'var(--action)', fontWeight: 600 }}
                >
                  + Crea tu primer proveedor
                </button>
              ) : (
                <select data-testid="invoice-supplier" value={supplierId} onChange={(e) => setSupplierId(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                  <option value="">Seleccionar proveedor...</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              )}
            </div>
            <div style={{ flex: 1 }}>
              <label style={fieldLabel}>N.° factura</label>
              <input data-testid="invoice-number" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="Opcional" style={inputStyle} />
            </div>
          </div>

          {/* Líneas */}
          <div>
            <label style={fieldLabel}>Ítems</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {lines.map(l => {
                return (
                  <div key={l.key} data-testid="invoice-line-row" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <div style={{ flex: 3, position: 'relative' }}>
                      <select
                        data-testid="invoice-item-product"
                        value={l.product_id}
                        onChange={(e) => onPickProduct(l.key, e.target.value)}
                        style={{ ...inputStyle, cursor: 'pointer', padding: '9px 12px' }}
                      >
                        <option value="">Producto...</option>
                        {products.map(pr => <option key={pr.id} value={pr.id}>{pr.name}</option>)}
                      </select>
                    </div>
                    <input
                      data-testid="invoice-item-qty"
                      type="number" min={1}
                      value={l.qty}
                      onChange={(e) => updateLine(l.key, { qty: e.target.value.replace(/\D/g, '') })}
                      placeholder="Cant."
                      title="Cantidad"
                      style={{ ...inputStyle, width: 70, flex: '0 0 auto', fontVariantNumeric: 'tabular-nums', textAlign: 'right', padding: '9px 10px' }}
                    />
                    <input
                      data-testid="invoice-item-unidad"
                      value={l.purchase_unit}
                      onChange={(e) => updateLine(l.key, { purchase_unit: e.target.value })}
                      placeholder="Unidad"
                      title="Unidad de compra: bulto, canasta, caja. Vacío = se compra suelto."
                      style={{ ...inputStyle, width: 88, flex: '0 0 auto', padding: '9px 10px' }}
                    />
                    <input
                      data-testid="invoice-item-factor"
                      type="number" min={1}
                      value={l.factor}
                      onChange={(e) => updateLine(l.key, { factor: e.target.value.replace(/\D/g, '') })}
                      placeholder="× und"
                      title="Cuántas unidades de venta trae una unidad de compra"
                      disabled={!l.purchase_unit.trim()}
                      style={{
                        ...inputStyle, width: 76, flex: '0 0 auto', textAlign: 'right',
                        padding: '9px 10px', fontVariantNumeric: 'tabular-nums',
                        background: l.purchase_unit.trim() ? 'var(--surface)' : 'var(--border-2)',
                      }}
                    />
                    <input
                      data-testid="invoice-item-cost"
                      type="number" min={0}
                      value={l.unit_cost}
                      onChange={(e) => updateLine(l.key, { unit_cost: e.target.value.replace(/\D/g, '') })}
                      placeholder="Costo unit."
                      title="Costo de UNA unidad de compra (lo que dice la factura)"
                      style={{ ...inputStyle, width: 110, flex: '0 0 auto', textAlign: 'right', padding: '9px 10px', fontVariantNumeric: 'tabular-nums' }}
                    />
                    <span data-testid="invoice-line-subtotal" style={{ width: 110, flex: '0 0 auto', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700, fontSize: 13, color: 'var(--ink)' }}>
                      {formatoCOP(lineSubtotal(l))}
                    </span>
                    <button
                      onClick={() => removeLine(l.key)}
                      title="Quitar ítem"
                      disabled={lines.length === 1}
                      style={{ width: 32, height: 32, flex: '0 0 auto', border: '1px solid var(--danger-soft)', background: 'var(--danger-soft)', borderRadius: 8, cursor: lines.length === 1 ? 'not-allowed' : 'pointer', color: 'var(--danger)', display: 'grid', placeItems: 'center', opacity: lines.length === 1 ? 0.4 : 1 }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                )
              })}
            </div>

            {/* 🔴 EL EFECTO SE MUESTRA ANTES DE APLICARLO (regla 7.10 del design
                system). Acá es más que una cortesía: es la única forma de que
                alguien note un factor mal tecleado ANTES de que el costo quede
                congelado en las ventas. La compra es atómica — registrar ES
                aplicar—, así que este bloque es el "borrador" del §6: el
                formulario sin confirmar, no un estado guardado. */}
            {validLines.some(l => l.purchase_unit.trim()) && (
              <div
                data-testid="invoice-efecto"
                style={{
                  marginTop: 10, padding: '10px 12px', borderRadius: 'var(--r-2)',
                  border: '1px solid var(--action-border)', background: 'var(--action-soft)',
                  fontSize: 12, color: 'var(--action-on-soft)',
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: 4 }}>Entra al inventario</div>
                {validLines.filter(l => l.purchase_unit.trim()).map(l => {
                  const pr = products.find(x => x.id === l.product_id)
                  const unidades = (parseInt(l.qty, 10) || 0) * factorDe(l)
                  const costoUnitario = Math.round((parseInt(l.unit_cost, 10) || 0) / factorDe(l))
                  return (
                    <div key={l.key} data-testid="invoice-efecto-linea" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {pr?.name ?? 'Producto'}: {l.qty} {l.purchase_unit.trim()} × {factorDe(l)} ={' '}
                      <strong>{unidades} und</strong> · costo unitario {formatoCOP(costoUnitario)}
                    </div>
                  )
                })}
              </div>
            )}

            {/* Hint de stock */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, fontSize: 11.5, color: 'var(--ink-3)' }}>
              <PackageCheck size={13} color="var(--action)" />
              Los productos con inventario suben su stock al registrar la compra. Todos actualizan su costo.
            </div>

            <button
              data-testid="invoice-add-item"
              onClick={() => setLines(ls => [...ls, newLine()])}
              style={{ marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', border: '1.5px dashed var(--ink-4)', background: 'var(--surface)', borderRadius: 9, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--ink-2)' }}
            >
              <Plus size={14} /> Agregar ítem
            </button>
          </div>

          {/* Notas */}
          <div>
            <label style={fieldLabel}>Notas</label>
            <input data-testid="invoice-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Observaciones de la compra" style={inputStyle} />
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 22px', borderTop: '1px solid var(--border-2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, background: 'linear-gradient(180deg, var(--surface-2) 0%, #fff 100%)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: 12.5, color: 'var(--ink-3)', fontWeight: 600 }}>Total</span>
            <span data-testid="invoice-total" style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--ink)' }}>{formatoCOP(total)}</span>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onClose} style={{ padding: '11px 18px', border: '1.5px solid var(--border)', background: 'var(--surface)', borderRadius: 9, cursor: 'pointer', fontSize: 13.5, fontWeight: 600, color: 'var(--ink-2)' }}>Cancelar</button>
            <button
              data-testid="invoice-submit"
              onClick={handleSubmit}
              disabled={!isValid || isRegistering}
              style={{ padding: '11px 24px', border: 'none', borderRadius: 10, background: !isValid || isRegistering ? 'var(--ink-4)' : 'var(--action)', cursor: !isValid || isRegistering ? 'not-allowed' : 'pointer', fontSize: 13.5, fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: 6, boxShadow: !isValid || isRegistering ? 'none' : '0 6px 16px rgba(16,185,129,.35)' }}
            >
              {isRegistering && <Loader2 size={15} className="animate-spin" />}
              {isRegistering ? 'Registrando...' : 'Registrar compra'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
