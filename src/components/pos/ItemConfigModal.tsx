import { useMemo, useState } from 'react'
import { X, Plus, Minus, ShoppingCart, Package } from 'lucide-react'
import { useProductExtras } from '@/hooks/useProductExtras'
import type { CartExtra, ProductWithCategory } from '@/stores/cartStore'

const formatCOP = (n: number) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(n)

/**
 * Modal de configuración de un ítem: selección de extras (qty por unidad) para
 * un producto. Reutilizado por POS y Mesas. `initial` precarga la selección al
 * editar un ítem ya en el carrito. La qty de cada extra es POR UNIDAD del producto.
 */
export function ItemConfigModal({
  product,
  initial = [],
  confirmLabel = 'Agregar al carrito',
  onConfirm,
  onClose,
}: {
  product: ProductWithCategory
  initial?: CartExtra[]
  confirmLabel?: string
  onConfirm: (extras: CartExtra[]) => void
  onClose: () => void
}) {
  const { productExtras, isLoading } = useProductExtras(product.id)

  // Extras activos disponibles para este producto.
  const available = useMemo(
    () =>
      productExtras
        .map((r) => r.extras)
        .filter((e): e is NonNullable<typeof e> => !!e && e.is_active),
    [productExtras],
  )

  // qty por extra_id (por unidad del producto).
  const [qtys, setQtys] = useState<Record<string, number>>(() => {
    const map: Record<string, number> = {}
    for (const e of initial) map[e.extra_id] = e.qty
    return map
  })

  const setQty = (id: string, qty: number) =>
    setQtys((prev) => ({ ...prev, [id]: Math.max(0, qty) }))

  const extrasUnit = available.reduce((a, e) => a + Number(e.price) * (qtys[e.id] ?? 0), 0)
  const unitSubtotal = product.price + extrasUnit

  const handleConfirm = () => {
    const extras: CartExtra[] = available
      .filter((e) => (qtys[e.id] ?? 0) > 0)
      .map((e) => ({
        extra_id: e.id,
        name: e.name,
        price: Number(e.price),
        qty: qtys[e.id],
        linked_product_id: e.linked_product_id,
      }))
    onConfirm(extras)
  }

  return (
    <div
      data-testid="item-config-modal"
      style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,.55)', display: 'grid', placeItems: 'center', zIndex: 60, fontFamily: 'inherit' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: 'var(--surface)', borderRadius: 14, width: 460, maxWidth: '94%', maxHeight: '88%', boxShadow: '0 25px 50px -12px rgba(0,0,0,.25)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border-2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
              Personalizar
            </div>
            <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--ink)', letterSpacing: -0.3, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {product.name}
            </div>
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--border-2)', border: 'none', cursor: 'pointer', color: 'var(--ink-3)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <X size={16} />
          </button>
        </div>

        {/* Extras list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 22px' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 12 }}>
            Extras disponibles
          </div>
          {isLoading ? (
            <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--ink-4)', fontSize: 13 }}>
              Cargando extras...
            </div>
          ) : available.length === 0 ? (
            <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--ink-4)', fontSize: 13 }}>
              Este producto no tiene extras.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {available.map((e) => {
                const qty = qtys[e.id] ?? 0
                return (
                  <div
                    key={e.id}
                    data-testid="item-config-extra"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '10px 12px', borderRadius: 9,
                      border: `1.5px solid ${qty > 0 ? 'var(--action)' : 'var(--border)'}`,
                      background: qty > 0 ? 'var(--action-soft)' : 'var(--surface)',
                      transition: 'all .12s',
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 5 }}>
                        {e.name}
                        {e.linked_product_id && <Package size={12} color="var(--ink-4)" />}
                      </div>
                      <div style={{ fontSize: 11.5, color: 'var(--ink-3)', fontVariantNumeric: 'tabular-nums', marginTop: 1 }}>
                        +{formatCOP(Number(e.price))} c/u
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', background: 'var(--surface)', borderRadius: 8, border: '1px solid var(--border)' }}>
                      <button
                        data-testid="extra-qty-dec"
                        onClick={() => setQty(e.id, qty - 1)}
                        disabled={qty === 0}
                        style={{ width: 30, height: 30, border: 'none', background: 'transparent', cursor: qty === 0 ? 'not-allowed' : 'pointer', color: qty === 0 ? 'var(--ink-4)' : 'var(--ink-2)', display: 'grid', placeItems: 'center' }}
                      >
                        <Minus size={14} />
                      </button>
                      <div data-testid="extra-qty" style={{ minWidth: 28, textAlign: 'center', fontVariantNumeric: 'tabular-nums', fontWeight: 700, fontSize: 14, color: 'var(--ink)' }}>
                        {qty}
                      </div>
                      <button
                        data-testid="extra-qty-inc"
                        onClick={() => setQty(e.id, qty + 1)}
                        style={{ width: 30, height: 30, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--action)', display: 'grid', placeItems: 'center' }}
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer: subtotal + confirm */}
        <div style={{ padding: '16px 22px', borderTop: '1px solid var(--border-2)', background: 'linear-gradient(180deg, var(--surface-2) 0%, #fff 100%)', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
            <span style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>Subtotal por unidad</span>
            <span data-testid="item-config-subtotal" style={{ fontSize: 20, fontWeight: 700, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums', letterSpacing: -0.4 }}>
              {formatCOP(unitSubtotal)}
            </span>
          </div>
          {/* 🔴 DEUDA 57. `isLoading` ya se usaba para el TEXTO de la lista
              ("Cargando extras...") y no para el botón: se podía confirmar
              mientras la pantalla decía que estaba cargando. `available` era
              `[]`, así que `onConfirm([])` metía la línea al carrito SIN extras
              y la venta se cobraba de menos. Es la 54 un paso más adelante, con
              su propia ventana por producto (la consulta es por `product.id`).
              El botón no existe mientras carga — no un spinner. */}
          {isLoading ? (
            <div
              data-testid="item-config-cargando"
              style={{ width: '100%', height: 52, borderRadius: 'var(--r-2)', background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--ink-3)', fontSize: 13.5, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              Cargando extras…
            </div>
          ) : (
            <button
              data-testid="item-config-confirm"
              onClick={handleConfirm}
              style={{ width: '100%', height: 52, border: 'none', background: 'var(--action)', borderRadius: 'var(--r-2)', cursor: 'pointer', fontSize: 16, fontWeight: 700, color: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
            >
              <ShoppingCart size={16} /> {confirmLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
