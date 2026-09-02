import { useState, useEffect } from 'react'
import { X, ChevronRight, Plus, Minus } from 'lucide-react'
import { useInventory } from '@/hooks/useInventory'
import type { ProductWithCategory } from '@/stores/cartStore'

interface StockAdjustModalProps {
  /** Productos candidatos (simple con stock_tracking). */
  products: ProductWithCategory[]
  /** Producto preseleccionado (al ajustar desde una fila). */
  preselectedId?: string | null
  onClose: () => void
}

const fieldLabel: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 6,
}
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 13px', border: '1.5px solid var(--border)', borderRadius: 9,
  fontSize: 14, color: 'var(--ink)', outline: 'none', boxSizing: 'border-box', background: 'var(--surface)',
}

/**
 * Ajuste manual de stock. qty CON SIGNO (+entrada / −salida) con preview del
 * stock resultante (rojo si queda negativo). Llama a la RPC adjust_stock.
 */
export function StockAdjustModal({ products, preselectedId, onClose }: StockAdjustModalProps) {
  const { adjust } = useInventory()
  const [productId, setProductId] = useState(preselectedId ?? '')
  const [sign, setSign] = useState<1 | -1>(1)
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const selected = products.find(p => p.id === productId) ?? null
  const current = selected?.stock_qty ?? 0
  const delta = (parseInt(amount, 10) || 0) * sign
  const resulting = current + delta
  const isValid = !!productId && delta !== 0 && reason.trim().length > 0

  const handleSubmit = async () => {
    if (!isValid) return
    await adjust.mutateAsync({ productId, qty: delta, reason: reason.trim() })
    onClose()
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'var(--overlay)',
        display: 'grid', placeItems: 'center', zIndex: 50,
        fontFamily: 'inherit', padding: 20,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        data-testid="stock-adjust-modal"
        style={{
          background: 'var(--surface)', borderRadius: 14, width: 460, maxWidth: '100%',
          boxShadow: 'var(--shadow-1)', overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border-2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--action)', textTransform: 'uppercase', letterSpacing: 1 }}>
              Inventario
            </div>
            <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--ink)', letterSpacing: -0.3, marginTop: 1 }}>
              Ajuste manual de stock
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--border-2)', border: 'none', cursor: 'pointer', color: 'var(--ink-3)', display: 'grid', placeItems: 'center' }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Producto */}
          <div>
            <label style={fieldLabel}>Producto</label>
            <select
              data-testid="adjust-product"
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              style={{ ...inputStyle, cursor: 'pointer' }}
            >
              <option value="">Seleccionar insumo...</option>
              {products.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {/* Stock actual */}
          {selected && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 9, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
              <span style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>Stock actual</span>
              <span data-testid="adjust-current" style={{ fontSize: 16, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: current < 0 ? 'var(--danger-on-soft)' : 'var(--ink)' }}>
                {current}
              </span>
            </div>
          )}

          {/* Cantidad con signo */}
          <div>
            <label style={fieldLabel}>Cantidad</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ display: 'flex', borderRadius: 9, overflow: 'hidden', border: '1.5px solid var(--border)', flexShrink: 0 }}>
                <button
                  type="button"
                  data-testid="adjust-sign-in"
                  onClick={() => setSign(1)}
                  title="Entrada"
                  style={{ width: 42, border: 'none', cursor: 'pointer', background: sign === 1 ? 'var(--action-soft)' : 'var(--surface)', color: sign === 1 ? 'var(--success-700)' : 'var(--ink-4)', display: 'grid', placeItems: 'center' }}
                >
                  <Plus size={16} strokeWidth={2.5} />
                </button>
                <button
                  type="button"
                  data-testid="adjust-sign-out"
                  onClick={() => setSign(-1)}
                  title="Salida"
                  style={{ width: 42, border: 'none', borderLeft: '1.5px solid var(--border)', cursor: 'pointer', background: sign === -1 ? 'var(--danger-soft)' : 'var(--surface)', color: sign === -1 ? 'var(--danger)' : 'var(--ink-4)', display: 'grid', placeItems: 'center' }}
                >
                  <Minus size={16} strokeWidth={2.5} />
                </button>
              </div>
              <input
                type="number"
                min={1}
                data-testid="adjust-amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))}
                placeholder="0"
                style={{ ...inputStyle, fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}
              />
            </div>
          </div>

          {/* Preview resultante */}
          {selected && delta !== 0 && (
            <div
              data-testid="adjust-preview"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 14px', borderRadius: 9,
                background: resulting < 0 ? 'var(--danger-soft)' : 'var(--action-soft)',
                border: `1px solid ${resulting < 0 ? 'var(--danger-soft)' : 'var(--action-border)'}`,
              }}
            >
              <span style={{ fontSize: 12.5, fontWeight: 600, color: resulting < 0 ? 'var(--danger-on-soft)' : 'var(--success-on-soft)' }}>
                Stock resultante
              </span>
              <span style={{ fontSize: 18, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: resulting < 0 ? 'var(--danger-on-soft)' : 'var(--success-on-soft)' }}>
                {current} {delta >= 0 ? '+' : '−'} {Math.abs(delta)} = {resulting}
              </span>
            </div>
          )}

          {/* Motivo */}
          <div>
            <label style={fieldLabel}>Motivo <span style={{ color: 'var(--danger)' }}>*</span></label>
            <input
              type="text"
              data-testid="adjust-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ej: compra, merma, conteo físico..."
              style={inputStyle}
              onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--action)' }}
              onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border)' }}
            />
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 22px', borderTop: '1px solid var(--border-2)', display: 'flex', gap: 10, background: 'linear-gradient(180deg, var(--surface-2) 0%, var(--surface) 100%)' }}>
          <button
            type="button"
            onClick={onClose}
            style={{ flex: 1, padding: '11px 16px', border: '1.5px solid var(--border)', background: 'var(--surface)', borderRadius: 9, cursor: 'pointer', fontSize: 13.5, fontWeight: 600, color: 'var(--ink-2)' }}
          >
            Cancelar
          </button>
          <button
            type="button"
            data-testid="adjust-confirm"
            onClick={handleSubmit}
            disabled={!isValid || adjust.isPending}
            style={{
              flex: 2, padding: '11px 16px', border: 'none', borderRadius: 9,
              background: !isValid || adjust.isPending ? 'var(--ink-4)' : 'var(--action)',
              cursor: !isValid || adjust.isPending ? 'not-allowed' : 'pointer',
              fontSize: 13.5, fontWeight: 700, color: 'var(--surface)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              boxShadow: !isValid || adjust.isPending ? 'none' : '0 6px 16px rgba(16,185,129,.35)',
            }}
          >
            {adjust.isPending ? 'Aplicando...' : <><span>Aplicar ajuste</span><ChevronRight size={15} /></>}
          </button>
        </div>
      </div>
    </div>
  )
}
