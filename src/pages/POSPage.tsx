import { useState, useMemo, useEffect, useRef } from 'react'
import {
  Search, X, Plus, Trash, Minus, ShoppingCart, Percent,
  ChevronRight, Store, MessageCircle,
  Phone, StickyNote,
  Banknote, CreditCard, Smartphone, Check, Building2, Printer,
  Pause, Play, Clock, AlertTriangle, HandCoins, SplitSquareHorizontal,
} from 'lucide-react'
import { toast } from 'react-hot-toast'
import {
  useCartStore, cartItemTotal, precioLejosDelCatalogo, desvioDelCatalogo,
} from '@/stores/cartStore'
import { useProducts } from '@/hooks/useProducts'
import { useProductsWithExtras } from '@/hooks/useProductsWithExtras'
import { useAuth } from '@/hooks/useAuth'
import { usePermissions } from '@/hooks/usePermissions'
import { useSedeConfig } from '@/hooks/useSedeConfig'
import { useCashShift } from '@/hooks/useCashShift'
import { OpenShiftModal } from '@/components/shift/OpenShiftModal'
import { ItemConfigModal } from '@/components/pos/ItemConfigModal'
import { PaymentSplitEditor } from '@/components/pos/PaymentSplitEditor'
import { retryOrderNumber } from '@/lib/supabase-helpers'
import type { SalePaymentPart } from '@/lib/supabase-helpers'
import { CustomerPicker } from '@/components/fiado/CustomerPicker'
import { useCustomers } from '@/hooks/useCustomers'
import { DEFAULT_PLAZOS_CREDITO, DEFAULT_PLAZO_CREDITO } from '@/lib/sedeConfig'
import { cashQuickAmounts } from '@/lib/cashRounding'
import { stockStatus, esAlertaDeStock } from '@/lib/stockStatus'
import type { ProductWithCategory, CartItem, DiscountType, HeldOrder } from '@/stores/cartStore'
import { Button } from '@/components/ui/Button'
import { formatoCOP } from '@/lib/formato'
import { MoneyCell } from '@/components/ui/MoneyCell'
import { Input } from '@/components/ui/Input'
import { TenderSelector } from '@/components/ui/TenderSelector'
import { useCobro } from '@/hooks/useCobro'
import { ATAJOS, ATRIBUTO_LETRAS_INERTES, elFocoEstaEscribiendo, teclaDe } from '@/lib/atajos'
import { CupoMeter } from '@/components/ui/CupoMeter'

// Canal: por donde ENTRO el pedido. Espeja el CHECK de orders.canal — si acá
// se agrega un valor sin ampliar el CHECK, el insert falla RUIDOSO, que es lo
// que queremos. Al revés (CHECK ampliado y esto no) el valor simplemente no se
// puede elegir. Ninguna de las dos direcciones falla callada.
type Canal = 'mostrador' | 'whatsapp' | 'telefono'

// Canal por defecto del POS: se aplica al montar Y al terminar cada venta.
const DEFAULT_CANAL: Canal = 'mostrador'

type PaymentMethodUI = 'efectivo' | 'tarjeta' | 'transferencia' | 'nequi' | 'fiado'

const formatCOP = (n: number) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n)

// 🔴 LA ÚNICA EXCEPCIÓN DEL RE-SKIN: el ticket impreso.
//    Va a una impresora térmica, no a una pantalla, así que ni sus colores ni
//    su tipografía son del design system — la monoespaciada acá es funcional
//    (columnas fijas de 32 caracteres), no decorativa, y además las variables
//    CSS del :root no viajan al contexto de impresión. Se deja intacto a
//    propósito. La impresión está sin diseñar en la skill (§8.6).
const PRINT_CSS = `
@media print {
  body * { visibility: hidden !important; }
  .ticket-print, .ticket-print * { visibility: visible !important; }
  .ticket-print {
    display: block !important;
    position: fixed !important;
    top: 0 !important; left: 0 !important;
    width: 80mm !important;
    background: white !important;
    padding: 6mm !important;
    box-sizing: border-box !important;
    font-family: 'Courier New', monospace !important;
    font-size: 12px !important;
    line-height: 1.45 !important;
    color: black !important;
  }
}
.ticket-print { display: none; }
`

// ─── Shared button styles ────────────────────────────────────────
const qtyBtnStyle: React.CSSProperties = {
  width: 28, height: 28, border: 'none', background: 'transparent',
  cursor: 'pointer', color: 'var(--ink-2)', display: 'grid', placeItems: 'center', padding: 0,
}

const iconBtnStyle: React.CSSProperties = {
  width: 30, height: 30, borderRadius: 'var(--r-2)',
  border: '1px solid var(--border)', background: 'var(--surface)',
  cursor: 'pointer', color: 'var(--ink-3)', display: 'grid', placeItems: 'center',
}

// ─── Print ticket ────────────────────────────────────────────────
function PrintTicket({
  items,
  subtotal,
  discountAmt,
  discount,
  discountType,
  total,
  method,
  canal,
  orderId,
  orderNumber,
  receivedAmt,
  sedeName,
  sedeAddress,
}: {
  items: CartItem[]
  subtotal: number
  discountAmt: number
  discount: number
  discountType: DiscountType
  total: number
  method: PaymentMethodUI
  canal: Canal
  orderId: string
  orderNumber: number | null
  receivedAmt?: number
  sedeName: string
  sedeAddress?: string | null
}) {
  const now = new Date()
  const dateStr = now.toLocaleDateString('es-CO', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    timeZone: 'America/Bogota',
  })
  const timeStr = now.toLocaleTimeString('es-CO', {
    hour: '2-digit', minute: '2-digit',
    timeZone: 'America/Bogota',
  })
  const ventaLabel = orderNumber != null
    ? `Venta #${orderNumber}`
    : `#${orderId.slice(-8).toUpperCase()}`
  const canalLabel = { mostrador: 'Mostrador', whatsapp: 'WhatsApp', telefono: 'Teléfono' }[canal]
  const methodLabel = {
    efectivo: 'Efectivo', tarjeta: 'Tarjeta',
    transferencia: 'Transferencia', nequi: 'Nequi', fiado: 'Fiado',
  }[method]

  return (
    <div className="ticket-print">
      <div style={{ textAlign: 'center', marginBottom: 6 }}>
        <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: 3 }}>{sedeName.toUpperCase()}</div>
        {sedeAddress && <div style={{ fontSize: 11 }}>{sedeAddress}</div>}
        {/* 🔴 QUÉ ES este papel. No lo decía — ni esto ni "Factura", que habría
            sido una segunda afirmación falsa: Nodo no hace facturación
            electrónica (deuda 72). Sin esta línea se entrega y quien lo recibe
            supone que sirve como soporte tributario. */}
        <div style={{ fontSize: 11, marginTop: 4, letterSpacing: 1 }}>COMPROBANTE DE VENTA</div>
        <div style={{ fontSize: 13, fontWeight: 700 }}>{ventaLabel}</div>
        <div style={{ fontSize: 10, marginTop: 2 }}>{dateStr}  {timeStr} · {canalLabel}</div>
      </div>

      <div style={{ borderTop: '1px dashed #000', margin: '6px 0' }} />

      {items.map((item, i) => (
        <div key={i} style={{ marginBottom: 3 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 600 }}>{item.qty}x {item.product.name}</span>
            {/* El precio PACTADO, no el de lista (deuda 75): el ticket es
                lo que el cliente se lleva y tiene que decir lo que pagó. */}
            <span>{formatCOP(item.price * item.qty)}</span>
          </div>
          {item.extras.map((ex) => (
            <div key={ex.extra_id} style={{ display: 'flex', justifyContent: 'space-between', paddingLeft: 14, fontSize: 10 }}>
              <span>+ {ex.name} ×{ex.qty * item.qty}</span>
              <span>{formatCOP(ex.price * ex.qty * item.qty)}</span>
            </div>
          ))}
          {item.note && (
            <div style={{ paddingLeft: 14, fontSize: 10 }}>* {item.note}</div>
          )}
        </div>
      ))}

      <div style={{ borderTop: '1px dashed #000', margin: '6px 0' }} />

      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
        <span>Subtotal</span><span>{formatCOP(subtotal)}</span>
      </div>
      {discountAmt > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
          <span>Descuento {discountType === 'pct' ? `(${discount}%)` : ''}</span>
          <span>-{formatCOP(discountAmt)}</span>
        </div>
      )}
      <div style={{ borderTop: '1px dashed #000', margin: '6px 0' }} />

      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 14 }}>
        <span>TOTAL</span><span>{formatCOP(total)}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginTop: 2 }}>
        <span>{methodLabel}</span>
        {receivedAmt !== undefined && receivedAmt > total && (
          <span>Vuelto: {formatCOP(receivedAmt - total)}</span>
        )}
      </div>

      <div style={{ borderTop: '1px dashed #000', margin: '8px 0' }} />
      <div style={{ textAlign: 'center', fontSize: 11 }}>¡Gracias por su visita!</div>
    </div>
  )
}

// ─── Fila de producto ────────────────────────────────────────────
// 🔴 FILAS, NO TARJETAS (regla 7.3 del design system). Un catálogo de miles de
//    referencias en tarjetas redondeadas es ilegible y lento: la tarjeta se
//    reserva para KPI, ficha y formularios. Acá se busca con el teclado y se
//    recorre con la vista, así que la unidad es la fila.
//
// ⚠️ EL TESTID SIGUE SIENDO `product-card` Y ES UN NOMBRE EQUIVOCADO A
//    PROPÓSITO. Esto ya no es una tarjeta. Los testids NO cambian con el
//    re-skin — son el contrato con la suite, y renombrarlos convertiría un
//    cambio visual en un cambio de contrato. El día que se renombren testids
//    será por LISTA enumerada y en su propio turno, no de rebote acá.
//
// 🔴 LA FILA ESTÁ INCOMPLETA CONTRA LA SKILL, y es una decisión, no un olvido:
//    · La maqueta muestra `código · producto · unidad · precio · costo`.
//    · `código` y `unidad` NO EXISTEN en el esquema (deuda 41). No se pintan
//      vacías: un `—` en TODA una columna no es "dato ausente" (regla 7.5),
//      es una columna sin fuente — y afirmaría que el dato existe y falta,
//      que es peor que no mostrarla.
//    · `costo` se saca a propósito (deuda 42): no hay clave de permiso que lo
//      gatee, y `ocultarPlata` sin una clave detrás es una decisión de UI
//      ocupando el lugar de una de autorización. Además la cajera cobra, no
//      negocia precio.
//    Quedan `producto` y `precio`. Las otras tres entran cuando exista lo que
//    las sostiene.
const ALTO_FILA = 34

function ProductRow({ product, onAdd }: { product: ProductWithCategory; onAdd: () => void }) {
  // Indicador discreto de stock. NO bloquea la venta (el stock negativo está
  // permitido: se vende aunque el conteo diga 0); solo avisa. Sale de la MISMA
  // regla que usa Inventario (`stockStatus`), que es lo que impide que las dos
  // pantallas contesten distinto sobre el mismo producto.
  const stockQty = product.stock_qty ?? 0
  const estadoStock = stockStatus(product)
  const alertaStock = esAlertaDeStock(estadoStock)
  const STOCK_BADGE: Record<string, { bg: string; fg: string; bd: string; label: string }> = {
    negative: { bg: 'var(--debt-soft)', fg: 'var(--debt-on-soft)', bd: 'var(--debt-border)', label: 'Reponer' },
    out: { bg: 'var(--border-2)', fg: 'var(--ink-3)', bd: 'var(--border)', label: 'Sin stock' },
    low: { bg: 'var(--warning-soft)', fg: 'var(--warning-on-soft)', bd: 'var(--warning-border)', label: 'Stock bajo' },
  }
  const badge = STOCK_BADGE[estadoStock]

  return (
    <button
      data-testid="product-card"
      onClick={onAdd}
      title={product.description ?? undefined}
      style={{
        width: '100%', minHeight: ALTO_FILA,
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '0 12px', border: 'none',
        borderBottom: '1px solid var(--border-2)',
        background: 'var(--surface)', cursor: 'pointer', textAlign: 'left',
        font: 'inherit', color: 'var(--ink)',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-2)' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--surface)' }}
    >
      <span style={{
        flex: 1, minWidth: 0, fontSize: 14, fontWeight: 400,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {product.name}
      </span>
      {alertaStock && badge && (
        <span
          data-testid="pos-stock-indicator"
          data-stock-status={estadoStock}
          title={`Stock: ${stockQty}${product.min_stock > 0 ? ` · mínimo ${product.min_stock}` : ''}`}
          style={{
            flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '3px 9px', borderRadius: 999,
            background: badge.bg, color: badge.fg, border: `1px solid ${badge.bd}`,
            fontSize: 11, fontWeight: 600, lineHeight: 1.4, whiteSpace: 'nowrap',
          }}
        >
          <AlertTriangle size={10} /> {badge.label}
        </span>
      )}
      {/* ── COLUMNA CATEGORÍA ─────────────────────────────────────────────
          Entra al sacar el strip: si el catálogo se ve entero, la categoría
          deja de estar implícita en «qué pestaña estoy mirando» y pasa a ser
          un dato de la fila.

          🔴 VA EN TEXTO, SIN EL COLOR DE `categories.color`, y NO es una
             omisión: §4 dice que **una categoría no se pinta con la paleta de
             los estados**. Se midieron los ocho colores sembrados contra los
             tokens y la colisión es literal, no potencial:

               Farmacología  #0ea5e9  ===  --action-500   (venta en curso)
               Pre entrenos  #f59e0b  ===  --warning-500  (aviso)
               Proteína      #10b981  ===  el emerald de VENTO (deuda 88), y
                                           verde es SÓLO confirmación (§1.2)
               Quemadores    #ef4444  →    familia --danger
               Snack         #a855f7  →    violeta, que §4 dice que "ni siquiera
                                           existe en el sistema"

             Dos son coincidencia EXACTA de byte con un token semántico. Pintar
             el punto acá pondría un disco verde al lado del badge «Sin stock»
             en la misma fila: el color afirmaría «esto salió bien» sobre una
             categoría, que no afirma nada.
          ✅ Y aplica el corolario de §4: el color era REDUNDANTE — el nombre ya
             distingue la categoría, así que al quitarlo no se pierde
             información, se deja de afirmar de más. */}
      <span
        data-testid="product-categoria"
        style={{
          flexShrink: 0, minWidth: 108, maxWidth: 132,
          fontSize: 12, color: 'var(--ink-3)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}
      >
        {product.categories?.name ?? '—'}
      </span>
      {/* `simbolo` va acá y no en el componente: §2 omite el `$` en columnas de
          tabla por defecto, y esta lista es la excepción decidida. Ver la nota
          de MoneyCell y §2 de la skill, que la documenta con su razón. */}
      <MoneyCell value={product.price} simbolo style={{ flexShrink: 0, minWidth: 96 }} />
    </button>
  )
}

// ─── Cart line item ──────────────────────────────────────────────
function CartLine({ item, index, noting, onToggleNote, hasExtras, onEditExtras }: {
  item: CartItem; index: number; noting: boolean; onToggleNote: () => void
  hasExtras: boolean; onEditExtras: () => void
}) {
  const setQty = useCartStore((s) => s.setQty)
  const setPrice = useCartStore((s) => s.setPrice)
  const setNote = useCartStore((s) => s.setNote)
  const remove = useCartStore((s) => s.remove)
  const color = item.product.categories?.color ?? 'var(--ink-4)'

  return (
    <div style={{ padding: '14px 22px', borderBottom: '1px solid var(--surface-2)', display: 'flex', gap: 12 }}>
      <div style={{
        width: 4, borderRadius: 2, background: color, flexShrink: 0,
        alignSelf: 'stretch', marginTop: 2, marginBottom: 2,
      }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
          <div style={{
            fontSize: 14, fontWeight: 600, color: 'var(--ink)', lineHeight: 1.3,
            minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {item.product.name}
          </div>
          <MoneyCell
            value={cartItemTotal(item)}
            style={{ fontSize: 14, fontWeight: 700, flexShrink: 0 }}
          />
        </div>
        {/* 🔴 PRECIO EDITABLE EN LA LÍNEA — deuda 75. El del catálogo pasa a
            ser una SUGERENCIA: el cliente negocia el mismo producto a 109.000,
            110.000 y 115.000 (medido en su archivo real). No es un descuento —
            `discount_amount` sigue siendo la rebaja SOBRE lo acordado. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
          <input
            data-testid="cart-item-price"
            inputMode="numeric"
            value={item.price ? formatCOP(item.price).replace(/[^\d.]/g, '') : ''}
            onChange={(e) => setPrice(index, Number(e.target.value.replace(/\D/g, '')))}
            aria-label={`Precio unitario de ${item.product.name}`}
            style={{
              width: 96, padding: '3px 7px', borderRadius: 6, fontSize: 11.5,
              fontVariantNumeric: 'tabular-nums', textAlign: 'right',
              border: `1px solid ${precioLejosDelCatalogo(item) ? 'var(--warning-border)' : 'var(--border)'}`,
              background: precioLejosDelCatalogo(item) ? 'var(--warning-soft)' : 'var(--surface)',
              color: 'var(--ink-2)', outline: 'none',
            }}
          />
          <span style={{ fontSize: 11.5, color: 'var(--ink-4)' }}>c/u</span>
          {item.price !== item.product.price && (
            <span style={{ fontSize: 11, color: 'var(--ink-4)' }}>
              lista {formatCOP(item.product.price)}
            </span>
          )}
        </div>

        {/* 🔴 LA ÚNICA RED QUE VA A EXISTIR. El servidor NUNCA compara
            `unit_price` contra `products.price` —la RPC lo toma directo del
            payload—, así que con precio libre un typo de 15.000 por 115.000 no
            lo detecta nada más que esto. Advierte y deja seguir: negociar es
            normal en este negocio, y un aviso que sale siempre deja de leerse. */}
        {precioLejosDelCatalogo(item) && (
          <div
            data-testid="precio-lejos-del-catalogo"
            style={{
              marginTop: 4, padding: '5px 8px', borderRadius: 'var(--r-2)',
              background: 'var(--warning-soft)', color: 'var(--warning-on-soft)',
              fontSize: 11, lineHeight: 1.4,
            }}
          >
            {(() => {
              const d = desvioDelCatalogo(item)
              const pct = d == null ? 0 : Math.round(Math.abs(d) * 100)
              return `${pct}% ${d != null && d < 0 ? 'por debajo' : 'por encima'} del precio de lista. Confirmá que es el precio acordado.`
            })()}
          </div>
        )}

        {/* Extras del ítem */}
        {item.extras.length > 0 && (
          <div data-testid="cart-item-extras" style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {item.extras.map((ex) => (
              <div key={ex.extra_id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: 'var(--success-on-soft)' }}>
                <span>+ {ex.name} ×{ex.qty}</span>
                <MoneyCell
                  value={ex.price * ex.qty * item.qty}
                  style={{ fontSize: 11.5, fontWeight: 400, color: 'var(--success-on-soft)' }}
                />
              </div>
            ))}
          </div>
        )}

        {item.note && !noting && (
          <div style={{
            marginTop: 6, padding: '4px 8px', background: 'var(--warning-soft)', color: 'var(--warning-on-soft)',
            fontSize: 11.5, borderRadius: 5, display: 'inline-flex', alignItems: 'center',
            gap: 5, fontWeight: 500,
          }}>
            <StickyNote size={11} />{item.note}
          </div>
        )}

        {noting && (
          <input
            autoFocus
            value={item.note}
            onChange={(e) => setNote(index, e.target.value)}
            onBlur={onToggleNote}
            onKeyDown={(e) => e.key === 'Enter' && onToggleNote()}
            placeholder="Nota (ej: sin hielo)"
            style={{
              marginTop: 6, width: '100%', border: '1px solid var(--action)', outline: 'none',
              boxShadow: '0 0 0 3px var(--action-soft)',
              borderRadius: 'var(--r-2)', padding: '6px 9px', fontSize: 12,
              fontFamily: 'inherit', boxSizing: 'border-box',
            }}
          />
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 9 }}>
          <div style={{
            display: 'flex', alignItems: 'center',
            background: 'var(--surface-2)', borderRadius: 8, border: '1px solid var(--border)',
          }}>
            <button
              onClick={() => item.qty === 1 ? remove(index) : setQty(index, item.qty - 1)}
              style={qtyBtnStyle}
            >
              {item.qty === 1 ? <Trash size={13} /> : <Minus size={13} />}
            </button>
            <div style={{
              minWidth: 32, textAlign: 'center', fontVariantNumeric: 'tabular-nums',
              fontWeight: 700, fontSize: 14, color: 'var(--ink)',
            }}>
              {item.qty}
            </div>
            <button onClick={() => setQty(index, item.qty + 1)} style={qtyBtnStyle}>
              <Plus size={13} />
            </button>
          </div>
          <div style={{ flex: 1 }} />
          {hasExtras && (
            <button onClick={onEditExtras} style={iconBtnStyle} title="Extras" data-testid="cart-edit-extras">
              <Plus size={13} />
            </button>
          )}
          <button onClick={onToggleNote} style={iconBtnStyle} title="Nota">
            <StickyNote size={13} />
          </button>
          <button
            onClick={() => remove(index)}
            style={{ ...iconBtnStyle, color: 'var(--danger)' }}
            title="Eliminar"
          >
            <X size={13} />
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Total row ───────────────────────────────────────────────────
// Vive DENTRO del panel de cobro, que va sobre --ink: por eso los colores son
// los tokens --on-dark-*, los únicos permitidos encima de la tinta (§1.2).
// La monoespaciada se fue: las cifras se alinean con tabular-nums (§2).
function TotalRow({ label, value, tono = 'normal' }: {
  label: string; value: number; tono?: 'normal' | 'apagado'
}) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '3px 0',
      color: 'var(--on-dark-2)',
    }}>
      <span>{label}</span>
      <span style={{
        fontVariantNumeric: 'tabular-nums', fontWeight: 500,
        color: tono === 'apagado' ? 'var(--on-dark-2)' : 'var(--on-dark-3)',
      }}>
        {value < 0 ? '-' : ''}{formatoCOP(Math.abs(value))}
      </span>
    </div>
  )
}

// ─── Cart panel ──────────────────────────────────────────────────
/**
 * Alto minimo de la lista del carrito, en pixeles.
 *
 * Medido, no elegido: la fila del carrito mide **117px** —nombre y precio,
 * precio editable y stepper— asi que tres filas son 351. Tres y no una porque
 * una venta de mostrador tipica lleva tres o cuatro items.
 *
 * 🔴 SOBREVIVE A LA VUELTA AL MODAL (2026-09-03) AUNQUE SU DEFECTO YA NO PUEDA
 *    OCURRIR, y esa es exactamente su categoria: **el tripwire que no se puede
 *    matar**. El colapso a cero lo causaba el panel de cobro en linea comiendose
 *    485px fijos; con el cobro en modal el panel volvio a ~180px y la lista
 *    entra con holgura en los seis viewports. O sea que hoy el minimo **no esta
 *    conteniendo nada**: es una red bajo un piso que ya no se cae.
 *    Se queda igual, y la razon es que el defecto no era del cobro en linea
 *    sino de la CLASE «un panel de alto fijo en una columna flex deja a su
 *    hermano en cero» — que vuelve con cualquier bloque que crezca ahi.
 *
 * ⚠️ Si la fila cambia de alto, este numero deja de significar «tres filas». Se
 *    remide contando el paso entre dos `cart-item-price` consecutivos.
 */
const ALTO_MINIMO_LISTA = 351

function CartPanel({
  subtotal,
  discountAmt,
  total,
  canal,
  setCanal,
  notingIdx,
  setNotingIdx,
  onCheckout,
  onHold,
  heldCount,
  onShowHeld,
  productsWithExtras,
  onEditExtras,
}: {
  subtotal: number
  discountAmt: number
  total: number
  canal: Canal
  setCanal: (c: Canal) => void
  notingIdx: number | null
  setNotingIdx: (i: number | null) => void
  onCheckout: () => void
  onHold: () => void
  heldCount: number
  onShowHeld: () => void
  productsWithExtras: Set<string>
  onEditExtras: (item: CartItem) => void
}) {
  const items = useCartStore((s) => s.items)
  const discount = useCartStore((s) => s.discount)
  const discountType = useCartStore((s) => s.discountType)
  const discountReason = useCartStore((s) => s.discountReason)
  const clear = useCartStore((s) => s.clear)
  const setDiscount = useCartStore((s) => s.setDiscount)
  const setDiscountReason = useCartStore((s) => s.setDiscountReason)
  const { can } = usePermissions()

  const canales = [
    { id: 'mostrador' as Canal, label: 'Mostrador', icon: <Store size={17} />,          bg: 'var(--warning-soft)', fg: 'var(--warning-on-soft)' },
    { id: 'whatsapp'  as Canal, label: 'WhatsApp',  icon: <MessageCircle size={17} />,  bg: 'var(--success-soft)', fg: 'var(--success-on-soft)' },
    { id: 'telefono'  as Canal, label: 'Teléfono',  icon: <Phone size={17} />,          bg: 'var(--action-soft)', fg: 'var(--action-on-soft)' },
  ]
  const current = canales.find((t) => t.id === canal)!

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      background: 'var(--surface)', minWidth: 0, borderLeft: '1px solid var(--border)',
    }}>
      {/* Header */}
      <div style={{ padding: '18px 22px 14px', borderBottom: '1px solid var(--border-2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              data-testid="canal-toggle"
              style={{
                width: 36, height: 36, borderRadius: 10,
                background: current.bg, color: current.fg,
                display: 'grid', placeItems: 'center', cursor: 'pointer',
              }}
              onClick={() => {
                const ids = canales.map((t) => t.id)
                setCanal(ids[(ids.indexOf(canal) + 1) % ids.length])
              }}
              title="Cambiar canal de la venta"
            >
              {current.icon}
            </div>
            <div>
              {/* testid: el texto solo colisionaba con el nav del sidebar. */}
              <div data-testid="canal-label" style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)', letterSpacing: '-0.015em' }}>
                {current.label}
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 1 }}>
                Nueva orden
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Indicador de ventas en espera */}
            {heldCount > 0 && (
              <button
                onClick={onShowHeld}
                title="Ventas en espera"
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  height: 34, padding: '0 11px', borderRadius: 'var(--r-2)',
                  border: '1px solid var(--warning-border)', background: 'var(--warning-soft)',
                  cursor: 'pointer', color: 'var(--warning-on-soft)', fontSize: 12.5, fontWeight: 600,
                }}
              >
                <Pause size={14} />
                En espera
                <span style={{
                  background: 'var(--warning-700)', color: '#fff', borderRadius: 999,
                  minWidth: 18, height: 18, display: 'grid', placeItems: 'center',
                  fontSize: 11, fontWeight: 700, padding: '0 4px',
                }}>
                  {heldCount}
                </span>
              </button>
            )}
            {can('pos.anular') && (
              <button
                onClick={clear}
                style={{
                  width: 34, height: 34, borderRadius: 'var(--r-2)',
                  border: '1px solid var(--border)', background: 'var(--surface)',
                  cursor: 'pointer', color: 'var(--ink-3)', display: 'grid', placeItems: 'center',
                }}
                title="Vaciar carrito (anular)"
              >
                <Trash size={15} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Items.
          `minHeight` es el piso de la lista. Ver `ALTO_MINIMO_LISTA`: hoy no
          esta conteniendo nada —con el cobro en modal la lista entra sobrada—
          y se conserva igual porque la clase de defecto que ataja no depende
          de donde vive el cobro. */}
      <div style={{ flex: 1, overflow: 'auto', minHeight: ALTO_MINIMO_LISTA }}>
        {items.length === 0 ? (
          <div style={{ padding: 50, textAlign: 'center', color: 'var(--ink-4)', fontSize: 13.5 }}>
            <div style={{
              width: 56, height: 56, borderRadius: '50%', background: 'var(--border-2)',
              margin: '0 auto 14px', display: 'grid', placeItems: 'center', color: 'var(--ink-4)',
            }}>
              <ShoppingCart size={24} />
            </div>
            <div style={{ fontWeight: 600, color: 'var(--ink-3)', marginBottom: 4 }}>Carrito vacío</div>
            <div style={{ fontSize: 12 }}>Toca un producto para agregarlo</div>
          </div>
        ) : (
          items.map((item, idx) => (
            <CartLine
              key={item.id}
              item={item}
              index={idx}
              noting={notingIdx === idx}
              onToggleNote={() => setNotingIdx(notingIdx === idx ? null : idx)}
              hasExtras={productsWithExtras.has(item.product.id)}
              onEditExtras={() => onEditExtras(item)}
            />
          ))
        )}
      </div>

      {/* Discount — requiere permiso pos.descuento */}
      {can('pos.descuento') && (
      <div style={{ padding: '12px 22px', borderTop: '1px solid var(--border-2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9 }}>
          <Percent size={13} color="var(--ink-2)" />
          <span style={{
            fontSize: 11.5, fontWeight: 700, color: 'var(--ink-2)',
            textTransform: 'uppercase', letterSpacing: 0.5,
          }}>
            Descuento
          </span>
          <div style={{ flex: 1 }} />
          {/* Selector %/$ */}
          <div style={{ display: 'flex', borderRadius: 7, border: '1px solid var(--border)', overflow: 'hidden' }}>
            {(['pct', 'fixed'] as DiscountType[]).map((t) => (
              <button
                key={t}
                onClick={() => setDiscount(0, t)}
                style={{
                  padding: '4px 12px', border: 'none',
                  background: discountType === t ? 'var(--action)' : 'var(--surface)',
                  color: discountType === t ? '#fff' : 'var(--ink-3)',
                  fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  transition: 'all .1s',
                }}
              >
                {t === 'pct' ? '%' : '$'}
              </button>
            ))}
          </div>
        </div>

        {discountType === 'pct' ? (
          <div>
            {/* Input % editable (clamp 0–100 en el store) */}
            <div style={{ position: 'relative', marginBottom: 6 }}>
              <input
                type="text"
                inputMode="numeric"
                value={discount ? String(discount) : ''}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, '')
                  setDiscount(digits === '' ? 0 : parseInt(digits, 10), 'pct')
                }}
                placeholder="0"
                style={{
                  width: '100%', padding: '8px 26px 8px 12px',
                  border: `1px solid ${discount > 0 ? 'var(--action)' : 'var(--border)'}`,
                  borderRadius: 'var(--r-2)', fontSize: 13, fontVariantNumeric: 'tabular-nums',
                  outline: 'none', boxSizing: 'border-box', color: 'var(--ink)',
                }}
              />
              <span style={{
                position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                fontSize: 13, color: 'var(--ink-4)', pointerEvents: 'none',
              }}>%</span>
            </div>
            {/* Presets rápidos */}
            <div style={{ display: 'flex', gap: 4 }}>
              {[0, 5, 10, 15, 20].map((v) => (
                <button
                  key={v}
                  onClick={() => setDiscount(v, 'pct')}
                  style={{
                    flex: 1, padding: '6px 0',
                    border: `1px solid ${discount === v ? 'var(--action)' : 'var(--border)'}`,
                    background: discount === v ? 'var(--action-soft)' : 'var(--surface)',
                    color: discount === v ? 'var(--action-on-soft)' : 'var(--ink-3)',
                    borderRadius: 'var(--r-1)', fontSize: 11.5, fontWeight: 600,
                    fontVariantNumeric: 'tabular-nums', cursor: 'pointer',
                  }}
                >
                  {v === 0 ? '—' : `${v}%`}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ position: 'relative' }}>
            <span style={{
              position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
              fontSize: 13, color: 'var(--ink-4)', pointerEvents: 'none',
            }}>$</span>
            <input
              type="text"
              inputMode="numeric"
              data-testid="discount-amount"
              // Igual que el campo de dinero: el `onChange` de abajo descarta
              // todo lo que no sea dígito, así que una letra acá ya es inerte.
              // Declararlo deja que los atajos de letra manden con el foco
              // adentro — que es la razón por la que los atajos son letras.
              {...{ [ATRIBUTO_LETRAS_INERTES]: '' }}
              value={discount ? String(discount) : ''}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, '')
                setDiscount(digits === '' ? 0 : parseInt(digits, 10), 'fixed')
              }}
              placeholder="0"
              style={{
                width: '100%', padding: '8px 12px 8px 22px',
                border: `1px solid ${discount > 0 ? 'var(--action)' : 'var(--border)'}`,
                borderRadius: 'var(--r-2)', fontSize: 13, fontVariantNumeric: 'tabular-nums',
                outline: 'none', boxSizing: 'border-box', color: 'var(--ink)',
              }}
            />
            {discount > 0 && (
              <button
                onClick={() => setDiscount(0, 'fixed')}
                style={{
                  position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  color: 'var(--ink-4)', display: 'grid', placeItems: 'center', padding: 0,
                }}
              >
                <X size={13} />
              </button>
            )}
          </div>
        )}

        {/* Motivo del descuento (opcional). Ya no se gatea: `discount_reason`
            SI viajo al esquema base, y una columna que nadie puede llenar es
            exactamente el residuo que la deuda 23.1 prohibe. */}
        <input
          data-testid="discount-reason"
          value={discountReason}
          onChange={(e) => setDiscountReason(e.target.value)}
          placeholder="Motivo del descuento (opcional)"
          style={{
            width: '100%', marginTop: 6, padding: '8px 12px',
            border: '1px solid var(--border)', borderRadius: 'var(--r-2)', fontSize: 12.5,
            outline: 'none', boxSizing: 'border-box', color: 'var(--ink)',
          }}
        />
      </div>
      )}

      {/* ── En espera ─────────────────────────────────────────────────────
          Queda AFUERA del panel de cobro, sobre superficie clara. La maqueta
          pone en la tinta solo lo que lleva a cobrar; y un secundario sobre
          --ink necesitaría un token de borde on-dark que la skill no define
          (§8: lo que no está, se pregunta). No se inventa. */}
      <div style={{ padding: '12px 22px 0' }}>
        <Button
          variant="secondary"
          size="sm"
          block
          disabled={items.length === 0}
          onClick={onHold}
          title="Poner la venta en espera"
        >
          <Pause size={15} /> En espera
        </Button>
      </div>

      {/* ── Panel de cobro ────────────────────────────────────────────────
          Sobre --ink, con los tokens --on-dark-*. El total a cobrar es el
          ÚNICO número grande del producto (regla 7.4, --fs-total 44/700):
          todo lo demás es información de trabajo, no un tablero. */}
      <div style={{ padding: '12px 22px 20px' }}>
        <div style={{
          background: 'var(--ink)', borderRadius: 'var(--r-3)', padding: 16,
        }}>
          <TotalRow label="Subtotal" value={subtotal} />
          {discountAmt > 0 && (
            <TotalRow
              label={`Descuento${discountType === 'pct' ? ` (${discount}%)` : ''}`}
              value={-discountAmt}
            />
          )}

          <div style={{
            display: 'flex', justifyContent: 'space-between',
            alignItems: 'baseline', gap: 10, margin: '10px 0 14px',
          }}>
            <span style={{
              fontSize: 11, fontWeight: 600, letterSpacing: '.04em',
              textTransform: 'uppercase', color: 'var(--on-dark-2)',
            }}>
              Total a cobrar
            </span>
            <span
              data-testid="cart-total"
              style={{
                fontSize: 44, fontWeight: 700, color: '#fff',
                fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.03em',
                lineHeight: 1,
              }}
            >
              {formatoCOP(total)}
            </span>
          </div>

          {/* "Cobrar — F12" es la ÚNICA tecla impresa del producto (§5): el
              atajo que la cajera usa cientos de veces al día es el que
              justifica la excepción a "los atajos no se imprimen".
              🔴 El rótulo se DERIVA de la tabla de atajos, no se escribe. Este
                 botón imprimió «F12» durante todo el proyecto con la tecla
                 muerta: eran dos lados de un contrato sin nada que los
                 sincronizara (R1). Derivándolo, no puede volver a mentir. */}
          <Button
            data-testid="cobro-abrir"
            size="pos"
            block
            className="nodo-btn--sobre-tinta"
            disabled={items.length === 0}
            onClick={onCheckout}
          >
            Cobrar — {teclaDe('Cobrar')}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Checkout modal ──────────────────────────────────────────────
function CheckoutModal({
  items,
  total,
  subtotal,
  discountAmt,
  discount,
  discountType,
  discountReason,
  canal,
  onClose,
  onComplete,
}: {
  items: CartItem[]
  total: number
  subtotal: number
  discountAmt: number
  discount: number
  discountType: DiscountType
  discountReason: string
  canal: Canal
  onClose: () => void
  onComplete: () => void
}) {
  const { profile } = useAuth()
  const { can } = usePermissions()
  const { sede, config: sedeConfig } = useSedeConfig()
  const { cobrar } = useCobro()
  const [step, setStep] = useState<'method' | 'amount' | 'success'>('method')
  const [method, setMethod] = useState<PaymentMethodUI>('efectivo')
  const [received, setReceived] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [orderId, setOrderId] = useState<string | null>(null)
  const [orderNumber, setOrderNumber] = useState<number | null>(null)
  // Número que la secuencia entregó pero no se pudo grabar: el reintento lo
  // reusa en vez de pedir otro (ver AssignOrderNumberResult).
  const [numeroReservado, setNumeroReservado] = useState<number | null>(null)
  const [reintentandoNumero, setReintentandoNumero] = useState(false)
  // Fiado: cliente seleccionado (solo aplica si method === 'fiado').
  const [customerId, setCustomerId] = useState<string | null>(null)
  // 🔴 Deuda 46. El plazo se PRECARGA del cliente y queda editable: se pacta por
  //    venta. Lo que se manda a `orders` es este valor, no el del cliente — si
  //    la venta leyera el plazo del cliente al mostrarse en cartera,
  //    renegociarlo movería el vencimiento de todas sus ventas viejas.
  const [plazoDias, setPlazoDias] = useState<number | null>(null)
  const { customers } = useCustomers()
  const plazosSede = sedeConfig.plazos_credito ?? DEFAULT_PLAZOS_CREDITO
  const plazoDefaultSede = sedeConfig.plazo_credito_default ?? DEFAULT_PLAZO_CREDITO
  const [customerName, setCustomerName] = useState<string>('')
  // Pago dividido (mixto): activo bajo demanda vía "Dividir pago".
  const [split, setSplit] = useState(false)
  const [splitParts, setSplitParts] = useState<SalePaymentPart[]>([])
  const [splitValid, setSplitValid] = useState(false)

  const canFiado = can('fiado.gestionar')
  const receivedNum = parseInt(received.replace(/\D/g, ''), 10) || 0
  const change = receivedNum - total

  const paymentMethods: { id: PaymentMethodUI; label: string; icon: React.ReactNode }[] = [
    { id: 'efectivo',      label: 'Efectivo',     icon: <Banknote size={22} /> },
    { id: 'tarjeta',       label: 'Tarjeta',       icon: <CreditCard size={22} /> },
    { id: 'transferencia', label: 'Transferencia', icon: <Building2 size={22} /> },
    { id: 'nequi',         label: 'Nequi / QR',   icon: <Smartphone size={22} /> },
    ...(canFiado ? [{ id: 'fiado' as const, label: 'Fiado', icon: <HandCoins size={22} /> }] : []),
  ]

  const quickAmounts = cashQuickAmounts(total)


  // En modo dividir el fiado no aplica (mixto = solo métodos reales).
  const isFiado = !split && method === 'fiado'

  const handleConfirm = async () => {
    if (!profile) return
    setSubmitting(true)
    // 🔴 LA ESCRITURA VIVE EN `useCobro`, NO ACÁ. El cobro pasa de modal a
    //    columna por cortes, y durante la transición las dos superficies cobran.
    //    Dos superficies que escriben lo mismo es R1 en el flujo más caro del
    //    producto; una sola escritura con dos vistas, no. Mismo patrón que
    //    Gastos con `addMovement`.
    const res = await cobrar({
      perfil: { id: profile.id, sede_id: profile.sede_id },
      canal, items, total,
      discountAmt,
      discountType: discountAmt > 0 ? discountType : null,
      discountReason,
      method, split, splitParts,
      customerId, customerName, plazoDias,
      origen: 'modal',
    })
    setSubmitting(false)
    if (!res) return
    setOrderNumber(res.orderNumber)
    setNumeroReservado(res.numeroReservado)
    setOrderId(res.orderId)
    setStep('success')
  }

  // Reintento a pedido del cajero cuando la venta quedó sin número. La venta YA
  // está cobrada y registrada: esto solo completa el correlativo.
  const handleRetryNumero = async () => {
    if (!orderId || !profile) return
    setReintentandoNumero(true)
    try {
      const num = await retryOrderNumber(orderId, profile.sede_id, numeroReservado)
      setOrderNumber(num.orderNumber)
      setNumeroReservado(num.numeroReservado)
      if (num.orderNumber != null) toast.success(`Número asignado: venta #${num.orderNumber}`)
      else toast.error('No se pudo asignar el número. La venta está cobrada igual.')
    } finally {
      setReintentandoNumero(false)
    }
  }

  // Atajos del COBRO: E efectivo · T transferencia · C crédito.
  //
  // 🔴 LAS LETRAS NO MANDAN DONDE SE ESCRIBE. `elFocoEstaEscribiendo()` decide
  //    POR TIPO de control, no por una lista de campos: una lista se congela y
  //    el próximo input nacería sin protección. La única excepción es el campo
  //    de dinero, que DECLARA con `data-letras-inertes` que las letras le son
  //    inertes — y es justo la excepción por la que se eligieron letras.
  //
  // ⚠️ El atajo NO puede elegir lo que el botón no ofrece: si el medio está
  //    ausente de la grilla —fiado sin permiso, o cualquiera en modo dividir—
  //    la tecla no hace nada. Un atajo que activa un control que no está es la
  //    forma más silenciosa de saltarse un permiso.
  const mediosRef = useRef<string[]>([])
  mediosRef.current = paymentMethods.map((m) => m.id)
  // 🔴 EL ATAJO SE APAGA DONDE NO HAY GRILLA QUE MIRAR — decidido el 2026-09-03,
  //    al volver el cobro al modal.
  //    Con el cobro en línea la grilla estaba siempre visible, así que apretar
  //    «T» mostraba el efecto en el acto. El modal parte el cobro en dos pasos:
  //    en el del MONTO la grilla no está montada, y el atajo cambiaría el medio
  //    **sin ninguna retroalimentación** — un cambio de estado invisible, sobre
  //    el medio de pago, con el foco adentro del campo del dinero. Es la peor
  //    combinación posible: el estado que decide a dónde va la plata, mudo, en
  //    el control que la cajera está usando.
  //    ⚠️ La razón PRINCIPAL de que los atajos de cobro sean letras sigue entera
  //    —el campo descarta letras, así que no le quitan nada—. Lo que cambió no
  //    es si la letra puede dispararse: es que en ese paso no hay qué mostrar.
  const pasoRef = useRef(step)
  pasoRef.current = step
  const setMethodRef = useRef(setMethod)
  setMethodRef.current = setMethod
  const splitRef = useRef(split)
  splitRef.current = split
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      // Con modificador no es nuestro: `Ctrl+E` es el omnibox, `Ctrl+C` copiar.
      if (e.ctrlKey || e.altKey || e.metaKey) return
      if (elFocoEstaEscribiendo()) return
      const atajo = ATAJOS.find((a) => a.ambito === 'cobro' && a.tecla === e.key.toLowerCase())
      if (!atajo?.medio) return
      // Sin grilla en pantalla no hay retroalimentación: la tecla no manda.
      if (pasoRef.current !== 'method') return
      if (splitRef.current) return
      if (!mediosRef.current.includes(atajo.medio)) return
      // Se corta el paso para que la letra no llegue al campo de dinero. Ahí ya
      // sería inerte, pero que no llegue es más barato que confiar en que se
      // descarte bien.
      e.preventDefault()
      setMethodRef.current(atajo.medio as PaymentMethodUI)
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])

  // ── LOS TRES PRIMARIOS DEL MODAL, DEFINIDOS UNA SOLA VEZ ─────────────────
  //
  // 🔴 Existen porque Enter tiene que hacer EXACTAMENTE lo que hace el boton, y
  //    escribir la condicion dos veces es R1 en el flujo mas caro del producto:
  //    dos lados sin nada que los sincronice, y el dia que uno cambie —agregar
  //    un guard, cambiar el umbral— el otro se congela y Enter cobra donde el
  //    boton ya no deja. Se declaran aca y los consumen los dos.
  const primarioMetodo = () =>
    (method === 'efectivo' && total > 0 ? setStep('amount') : handleConfirm())
  const bloqueadoMetodo = submitting || (isFiado && !customerId)
  const bloqueadoMixto = submitting || !splitValid
  const bloqueadoEfectivo = change < 0 || submitting

  // ── ENTER CONFIRMA, Y F4 LLEVA AL CLIENTE ────────────────────────────────
  //
  // El primario vigente vive en un ref que se refresca en cada render: el
  // listener se suscribe una vez y siempre ejecuta la accion del paso actual.
  const primarioRef = useRef<() => void>(() => {})
  primarioRef.current = () => {
    if (step === 'amount') { if (!bloqueadoEfectivo) handleConfirm(); return }
    if (step !== 'method') return
    if (split) { if (!bloqueadoMixto) handleConfirm(); return }
    if (!bloqueadoMetodo) primarioMetodo()
  }
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.altKey || e.metaKey) return

      // F4 · «Cambiar cliente» (§5). Apunta al BUSCADOR del picker y no a un
      // boton propio: el picker del modal muestra la lista completa con el
      // elegido marcado, asi que ya se puede cambiar de cliente sin un control
      // aparte. Agregar un boton para darle destino a la tecla habria sido
      // inventar el control en vez de encontrarlo.
      //
      // ⚠️ Solo actua en el camino de CREDITO, que es el unico donde existe un
      //    cliente. Es el mismo alcance que F2, que tampoco hace nada fuera del
      //    mostrador. Y el `preventDefault` va DESPUES del guard: si no hay a
      //    quien enfocar, la tecla no se come el evento.
      if (e.key === teclaDe('Cambiar cliente')) {
        const campo = document.querySelector<HTMLInputElement>('[data-testid="customer-search"]')
        if (!campo) return
        e.preventDefault()
        campo.focus()
        campo.select()
        return
      }

      // Enter = el primario del paso. Si el foco esta en un boton, el navegador
      // ya lo va a accionar: correrlo ademas seria cobrar dos veces.
      if (e.key === 'Enter') {
        if ((document.activeElement as HTMLElement)?.tagName === 'BUTTON') return
        e.preventDefault()
        primarioRef.current()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])

  const methodLabel = (m: PaymentMethodUI) =>
    ({ efectivo: 'Efectivo', tarjeta: 'Tarjeta', transferencia: 'Transferencia', nequi: 'Nequi / QR', fiado: 'Fiado' })[m]

  return (
    <div
      style={{
        position: 'absolute', inset: 0,
        background: 'var(--overlay)',
        display: 'grid', placeItems: 'center',
        zIndex: 50,
      }}
    >
      {/* Dialog (§4): radio --r-3 y --shadow-1, que es el ÚNICO nivel de
          elevación del producto y está reservado a diálogos. Todo lo demás se
          separa con borde de 1px. */}
      <div style={{
        background: 'var(--surface)', borderRadius: 'var(--r-3)',
        width: step === 'method' ? 540 : 440,
        maxWidth: '92%',
        boxShadow: 'var(--shadow-1)',
        overflow: 'hidden',
      }}>
        {/* ── Step: method ── */}
        {step === 'method' && (
          <>
            <div style={{
              padding: '18px 22px', borderBottom: '1px solid var(--border-2)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                  Total a cobrar
                </div>
                <div data-testid="checkout-total" style={{ fontSize: 28, fontWeight: 700, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>
                  {formatoCOP(total)}
                </div>
              </div>
              <button
                onClick={onClose}
                style={{ background: 'var(--border-2)', border: 'none', width: 32, height: 32, borderRadius: 'var(--r-2)', cursor: 'pointer', color: 'var(--ink-3)', display: 'grid', placeItems: 'center' }}
              >
                <X size={16} />
              </button>
            </div>
            {!split && (
            <div style={{ padding: 22 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', marginBottom: 12 }}>
                Método de pago
              </div>
              {/* TenderSelector (§4). Sobre superficie CLARA: el cobro de Nodo
                  es en modal, decidido al cerrar §8.15. Los testids
                  `pay-method-${id}` los conserva el componente. */}
              <TenderSelector
                tenders={paymentMethods.map((m) => ({ id: m.id, label: m.label, icon: m.icon }))}
                seleccionado={method}
                onSelect={(id) => setMethod(id as PaymentMethodUI)}
                columnas={4}
              />

              {/* Dividir pago: revela el editor de pago mixto bajo demanda.
                  El caso común (un método al 100%) queda intacto arriba. */}
              {!isFiado && (
                <button
                  type="button"
                  data-testid="pay-split-toggle"
                  onClick={() => setSplit(true)}
                  style={{
                    marginTop: 14, display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '8px 12px', borderRadius: 'var(--r-2)', border: '1px dashed var(--ink-4)',
                    background: 'var(--surface)', color: 'var(--ink-2)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  <SplitSquareHorizontal size={14} /> Dividir pago
                </button>
              )}

              {/* Fiado: selección de cliente obligatoria */}
              {isFiado && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 6 }}>
                    Cliente <span style={{ color: 'var(--danger)' }}>*</span>
                  </div>
                  <CustomerPicker
                    value={customerId}
                    onChange={(id, name) => {
                      setCustomerId(id)
                      setCustomerName(name)
                      // Precarga del plazo pactado con ese cliente; si no tiene,
                      // el default de la sede. Queda editable.
                      const c = customers.find((x) => x.id === id)
                      setPlazoDias(c?.plazo_dias ?? plazoDefaultSede)
                    }}
                  />

                  {/* 🔴 PLAZO DE LA VENTA — deuda 46. Desplegable y no número
                      libre: el typo de 3 por 30 no lo detecta nada, y una venta
                      a 3 días se lee como vencida a los cuatro. */}
                  {customerId && (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 6 }}>
                        Plazo de pago
                      </div>
                      <select
                        data-testid="pos-plazo"
                        value={plazoDias == null ? '' : String(plazoDias)}
                        onChange={(e) => setPlazoDias(e.target.value === '' ? null : Number(e.target.value))}
                        style={{
                          width: '100%', padding: '9px 12px', borderRadius: 'var(--r-2)',
                          border: '1px solid var(--border)', background: 'var(--surface)',
                          color: 'var(--ink)', fontSize: 13, cursor: 'pointer', appearance: 'auto',
                        }}
                      >
                        <option value="">Sin plazo</option>
                        {plazosSede.map((d) => (
                          <option key={d} value={String(d)}>{d} días</option>
                        ))}
                      </select>
                      <div data-testid="pos-plazo-nota" style={{ marginTop: 6, fontSize: 11.5, color: 'var(--ink-3)' }}>
                        Queda guardado en esta venta: cambiarle el plazo al cliente
                        después no mueve el vencimiento de ésta.
                      </div>
                    </div>
                  )}
                  {/* CupoMeter (§4). Vive ACÁ —dentro del modal, en el paso del
                      crédito— por la ubicación fijada al cerrar §8.15. La regla
                      7.1 se cumple igual: el cupo se proyecta con la venta en
                      curso ANTES de comprometerla; cambia dónde, no cuándo.
                      ⚠️ Hoy siempre en `sin dato`: el cupo no existe en el
                      esquema (deuda 40). El componente ya dice qué falta y
                      dónde asignarlo, en vez de inventar un número. */}
                  {customerId && (
                    <div style={{ marginTop: 12, padding: 12, border: '1px solid var(--border)', borderRadius: 'var(--r-2)', background: 'var(--surface-2)' }}>
                      <CupoMeter asignado={null} consumido={0} ventaEnCurso={total} />
                    </div>
                  )}
                  <div data-testid="pos-fiado-aviso" style={{ marginTop: 8, fontSize: 11.5, color: 'var(--warning-on-soft)', background: 'var(--warning-soft)', borderRadius: 'var(--r-2)', padding: '8px 11px' }}>
                    La venta a fiado queda pendiente de pago. No entra dinero a la caja; los abonos se registran en Fiado → Cuentas por cobrar.
                  </div>
                </div>
              )}

              <div style={{ marginTop: 18, display: 'flex', gap: 10 }}>
                <Button variant="secondary" onClick={onClose} style={{ flex: 1 }}>
                  Cancelar
                </Button>
                <Button
                  data-testid="checkout-continue"
                  disabled={bloqueadoMetodo}
                  onClick={primarioMetodo}
                  style={{ flex: 2 }}
                >
                  {submitting
                    ? 'Procesando...'
                    : isFiado
                      ? <><HandCoins size={15} /><span>Registrar fiado</span></>
                      : <><span>Continuar</span><ChevronRight size={15} /></>}
                </Button>
              </div>
            </div>
            )}

            {/* ── Modo dividir (pago mixto) ── */}
            {split && (
            <div style={{ padding: 22 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', marginBottom: 12 }}>
                Dividir pago entre métodos
              </div>
              <PaymentSplitEditor
                total={total}
                onChange={(parts, ok) => { setSplitParts(parts); setSplitValid(ok) }}
              />
              <div style={{ marginTop: 18, display: 'flex', gap: 10 }}>
                <Button variant="secondary" onClick={() => setSplit(false)} style={{ flex: 1 }}>
                  Un solo método
                </Button>
                <Button
                  data-testid="checkout-confirm-mixto"
                  disabled={bloqueadoMixto}
                  onClick={handleConfirm}
                  style={{ flex: 2 }}
                >
                  {submitting ? 'Procesando...' : <><Check size={15} /><span>Cobrar {formatoCOP(total)}</span></>}
                </Button>
              </div>
            </div>
            )}
          </>
        )}

        {/* ── Step: amount (efectivo) ── */}
        {step === 'amount' && (
          <>
            <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border-2)' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Efectivo recibido
              </div>
              {/* El estado "POS grande" del Input (§4): 52px, alineado a la
                  derecha, tabular. La plata se escribe grande porque se cuenta
                  en voz alta. */}
              <Input
                autoFocus
                inputSize="pos"
                data-testid="checkout-received"
                // Declara que las letras le son inertes: sólo cuenta lo que
                // `parseInt(replace(/\D/g,''))` deja, y lo que se pinta es el
                // número formateado. Por eso los atajos de letra pueden mandar
                // con el foco acá — que es la razón por la que son letras.
                {...{ [ATRIBUTO_LETRAS_INERTES]: '' }}
                value={received ? formatoCOP(receivedNum) : ''}
                onChange={(e) => setReceived(e.target.value)}
                placeholder={formatoCOP(total)}
                style={{ marginTop: 6 }}
              />
              <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                {quickAmounts.map((chip) => {
                  const active = receivedNum === chip.amount && received !== ''
                  return (
                    <button
                      key={chip.exact ? 'exact' : chip.amount}
                      data-testid={chip.exact ? 'quick-amount-exact' : 'quick-amount-chip'}
                      onClick={() => setReceived(String(chip.amount))}
                      style={{
                        padding: '6px 12px',
                        // El chip "Exacto" se destaca con el borde de ACCIÓN, no
                        // con verde: es la opción sugerida, no una confirmación
                        // de que algo salió bien (§1.2).
                        border: `1px solid ${active ? 'var(--action)' : chip.exact ? 'var(--action-border)' : 'var(--border)'}`,
                        background: active ? 'var(--action-soft)' : 'var(--surface-2)',
                        borderRadius: 'var(--r-1)', fontSize: 11.5, fontWeight: chip.exact ? 700 : 600,
                        color: active || chip.exact ? 'var(--action-on-soft)' : 'var(--ink-2)',
                        fontVariantNumeric: 'tabular-nums', cursor: 'pointer',
                        transition: 'all .12s',
                      }}
                    >
                      {chip.exact ? `Exacto · ${formatoCOP(chip.amount)}` : formatoCOP(chip.amount)}
                    </button>
                  )
                })}
              </div>
            </div>
            <div style={{ padding: 22 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--ink-3)', marginBottom: 6 }}>
                <span>Total</span>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatoCOP(total)}</span>
              </div>
              {/* El vuelto SÍ es verde: es confirmación de que la cuenta cierra
                  (§1.2). Lo que no puede ser verde es la ACCIÓN — el botón de
                  abajo—. Y "Falta" usa --danger, no --debt: es un error de la
                  operación en curso, no una deuda del cliente. */}
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                padding: '12px 14px',
                background: change >= 0 ? 'var(--success-soft)' : 'var(--danger-soft)',
                borderRadius: 'var(--r-2)', marginBottom: 18,
              }}>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: change >= 0 ? 'var(--success-on-soft)' : 'var(--danger-on-soft)' }}>
                  {change >= 0 ? 'Vuelto' : 'Falta'}
                </span>
                <span data-testid="checkout-change" style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: change >= 0 ? 'var(--success-on-soft)' : 'var(--danger-on-soft)' }}>
                  {formatoCOP(Math.abs(change))}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <Button variant="secondary" onClick={() => setStep('method')} style={{ flex: 1 }}>
                  Atrás
                </Button>
                {/* 🔴 Este botón era #10b981. Violación directa de §1.2: verde
                    es SOLO confirmación y ninguna acción lo usa. Con un botón
                    verde el usuario deja de poder distinguir "esto está bien"
                    de "hacé clic acá" — y acá el clic COBRA. */}
                <Button
                  data-testid="checkout-confirm-efectivo"
                  disabled={bloqueadoEfectivo}
                  onClick={handleConfirm}
                  style={{ flex: 2 }}
                >
                  {submitting ? 'Procesando...' : <><Check size={15} /><span>Confirmar cobro</span></>}
                </Button>
              </div>
            </div>
          </>
        )}

        {/* ── Step: success ── */}
        {step === 'success' && orderId && (
          <div style={{ padding: '36px 28px', textAlign: 'center' }}>
            {/* El disco de éxito SÍ es verde, y es el uso legítimo: confirma
                que algo salió bien. No es una acción. */}
            <div style={{
              width: 64, height: 64, borderRadius: '50%', background: 'var(--success-soft)',
              display: 'grid', placeItems: 'center', margin: '0 auto 16px', color: 'var(--success-700)',
            }}>
              <Check size={32} strokeWidth={2.5} />
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--ink)', marginBottom: 4 }}>
              {orderNumber != null ? `¡Venta #${orderNumber} registrada!` : '¡Cobro exitoso!'}
            </div>
            <div style={{ fontSize: 13, color: 'var(--ink-3)', marginBottom: 4 }}>
              {formatoCOP(total)} · {methodLabel(method)}
            </div>
            {method === 'efectivo' && receivedNum > total && (
              <div style={{ fontSize: 12, color: 'var(--success-700)', fontWeight: 600, marginBottom: 4 }}>
                Vuelto: {formatoCOP(receivedNum - total)}
              </div>
            )}
            <div data-testid="success-order-number" style={{ fontSize: 11, color: 'var(--ink-4)', fontVariantNumeric: 'tabular-nums', marginBottom: orderNumber != null ? 24 : 12 }}>
              {orderNumber != null ? `Venta #${orderNumber}` : `#${orderId.slice(-8).toUpperCase()}`}
            </div>

            {/* La venta se cobró, pero quedó sin correlativo. Antes esto fallaba
                MUDO: la pantalla decía "¡Cobro exitoso!" y nadie se enteraba de
                que la venta no iba a aparecer en el Historial ni se iba a poder
                reimprimir. */}
            {orderNumber == null && (
              <div
                data-testid="success-sin-numero"
                style={{
                  background: 'var(--warning-soft)', border: '1px solid var(--warning-border)',
                  borderRadius: 'var(--r-2)',
                  padding: '10px 12px', margin: '0 0 20px',
                  fontSize: 12, color: 'var(--warning-on-soft)', lineHeight: 1.5,
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: 6 }}>
                  Venta registrada — sin número asignado
                </div>
                <div style={{ marginBottom: 8 }}>
                  El cobro está guardado. Falta el número para que aparezca en el
                  historial y se pueda reimprimir.
                </div>
                <button
                  onClick={handleRetryNumero}
                  disabled={reintentandoNumero}
                  data-testid="retry-order-number"
                  style={{
                    padding: '6px 14px', border: '1.5px solid var(--warning-700)', background: 'var(--surface)',
                    borderRadius: 7, cursor: reintentandoNumero ? 'default' : 'pointer',
                    fontSize: 12, fontWeight: 600, color: 'var(--warning-on-soft)',
                    opacity: reintentandoNumero ? 0.6 : 1,
                  }}
                >
                  {reintentandoNumero ? 'Reintentando…' : 'Reintentar'}
                </button>
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button
                onClick={() => window.print()}
                style={{
                  padding: '10px 18px', border: '1.5px solid var(--border)', background: 'var(--surface)',
                  borderRadius: 9, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--ink-2)',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                <Printer size={15} /> Imprimir
              </button>
              <button
                onClick={onComplete}
                style={{
                  padding: '10px 22px', border: 'none', background: 'var(--action)',
                  borderRadius: 9, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#fff',
                }}
              >
                Nueva venta
              </button>
            </div>

            {/* Hidden ticket — visible only on print */}
            <PrintTicket
              items={items}
              subtotal={subtotal}
              discountAmt={discountAmt}
              discount={discount}
              discountType={discountType}
              total={total}
              method={method}
              canal={canal}
              orderId={orderId}
              orderNumber={orderNumber}
              receivedAmt={method === 'efectivo' ? receivedNum : undefined}
              sedeName={sede?.name ?? 'Nodo'}
              sedeAddress={sede?.address}
            />
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Held orders (ventas en espera) ──────────────────────────────

function heldItemCount(h: HeldOrder): number {
  return h.items.reduce((a, x) => a + x.qty, 0)
}

function heldTotal(h: HeldOrder): number {
  const subtotal = h.items.reduce((a, x) => a + cartItemTotal(x), 0)
  const disc = h.discountType === 'pct'
    ? Math.round((subtotal * h.discount) / 100)
    : Math.min(h.discount, subtotal)
  return subtotal - disc
}

function formatHeldElapsed(createdAt: number): string {
  const mins = Math.floor((Date.now() - createdAt) / 60000)
  if (mins < 1) return 'recién'
  if (mins < 60) return `hace ${mins} min`
  const h = Math.floor(mins / 60)
  const r = mins % 60
  return r > 0 ? `hace ${h}h ${r}m` : `hace ${h}h`
}

// Mini-modal para capturar la referencia (label) al poner en espera.
function HoldLabelModal({ onConfirm, onClose }: {
  onConfirm: (label: string) => void
  onClose: () => void
}) {
  const [label, setLabel] = useState('')

  return (
    <div
      style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,.55)', display: 'grid', placeItems: 'center', zIndex: 60 }}
      onClick={onClose}
    >
      <div
        style={{ background: 'var(--surface)', borderRadius: 14, width: 420, maxWidth: '92%', boxShadow: '0 25px 50px -12px rgba(0,0,0,.25)', overflow: 'hidden' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border-2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Pause size={16} color="var(--warning-on-soft)" />
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>Poner en espera</span>
          </div>
          <button onClick={onClose} style={{ background: 'var(--border-2)', border: 'none', width: 30, height: 30, borderRadius: 8, cursor: 'pointer', color: 'var(--ink-3)', display: 'grid', placeItems: 'center' }}>
            <X size={15} />
          </button>
        </div>
        <div style={{ padding: 22 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 6 }}>
            Referencia
          </label>
          <input
            autoFocus
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onConfirm(label.trim())}
            placeholder="Ej: Señor de gorra, Mesa azul…"
            style={{
              width: '100%', padding: '11px 13px', border: '1.5px solid var(--border)',
              borderRadius: 10, fontSize: 14, color: 'var(--ink)', outline: 'none', boxSizing: 'border-box',
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--action)')}
            onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
          />
          <p style={{ fontSize: 11.5, color: 'var(--ink-4)', marginTop: 6, marginBottom: 0 }}>
            Opcional. Si lo dejas vacío se usará la hora actual.
          </p>
          <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
            <button
              onClick={onClose}
              style={{ flex: 1, padding: '12px', border: '1.5px solid var(--border)', background: 'var(--surface)', borderRadius: 9, cursor: 'pointer', fontSize: 13.5, fontWeight: 600, color: 'var(--ink-2)' }}
            >
              Cancelar
            </button>
            <button
              onClick={() => onConfirm(label.trim())}
              style={{ flex: 2, padding: '12px', border: 'none', background: 'var(--action)', borderRadius: 'var(--r-2)', cursor: 'pointer', fontSize: 13.5, fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
            >
              <Pause size={15} /> Guardar en espera
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// Panel con la lista de ventas en espera.
function HeldOrdersPanel({ held, onResume, onDiscard, onClose }: {
  held: HeldOrder[]
  onResume: (id: string) => void
  onDiscard: (id: string) => void
  onClose: () => void
}) {
  return (
    <div
      style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,.55)', display: 'grid', placeItems: 'center', zIndex: 55 }}
      onClick={onClose}
    >
      <div
        style={{ background: 'var(--surface)', borderRadius: 14, width: 460, maxWidth: '94%', maxHeight: '85%', boxShadow: '0 25px 50px -12px rgba(0,0,0,.25)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Pause size={16} color="var(--warning-on-soft)" />
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>
              Ventas en espera ({held.length})
            </span>
          </div>
          <button onClick={onClose} style={{ background: 'var(--border-2)', border: 'none', width: 30, height: 30, borderRadius: 8, cursor: 'pointer', color: 'var(--ink-3)', display: 'grid', placeItems: 'center' }}>
            <X size={15} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {held.length === 0 ? (
            <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--ink-4)', fontSize: 13.5 }}>
              No hay ventas en espera
            </div>
          ) : (
            held.map((h) => (
              <div key={h.id} style={{ border: '1px solid var(--border)', borderRadius: 11, padding: '12px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--ink)', letterSpacing: -0.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {h.label}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3, fontSize: 12, color: 'var(--ink-3)' }}>
                      <span>{heldItemCount(h)} {heldItemCount(h) === 1 ? 'ítem' : 'ítems'}</span>
                      <span style={{ color: 'var(--ink-4)' }}>·</span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                        <Clock size={11} /> {formatHeldElapsed(h.createdAt)}
                      </span>
                    </div>
                  </div>
                  <MoneyCell value={heldTotal(h)} style={{ fontSize: 16, fontWeight: 700, flexShrink: 0 }} />
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button
                    onClick={() => onResume(h.id)}
                    style={{ flex: 1, padding: '9px', border: 'none', background: 'var(--action)', borderRadius: 'var(--r-2)', cursor: 'pointer', fontSize: 13, fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                  >
                    <Play size={14} /> Retomar
                  </button>
                  <button
                    onClick={() => onDiscard(h.id)}
                    style={{ flexShrink: 0, padding: '9px 14px', border: '1px solid var(--danger-soft)', background: 'var(--surface)', borderRadius: 'var(--r-2)', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: 6 }}
                  >
                    <Trash size={14} /> Descartar
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

// Diálogo: qué hacer con el carrito activo al retomar otra venta.
function ResumeConflictDialog({ onKeep, onDiscardCurrent, onCancel }: {
  onKeep: () => void
  onDiscardCurrent: () => void
  onCancel: () => void
}) {
  return (
    <div
      style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,.6)', display: 'grid', placeItems: 'center', zIndex: 65 }}
      onClick={onCancel}
    >
      <div
        style={{ background: 'var(--surface)', borderRadius: 14, width: 420, maxWidth: '92%', boxShadow: '0 25px 50px -12px rgba(0,0,0,.25)', overflow: 'hidden', padding: 22 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>
          Tienes una venta activa
        </div>
        <p style={{ fontSize: 13, color: 'var(--ink-3)', margin: '0 0 18px', lineHeight: 1.5 }}>
          El carrito actual tiene ítems. ¿Qué hacer antes de retomar la otra venta?
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button
            onClick={onKeep}
            style={{ width: '100%', padding: '12px', border: '1px solid var(--warning-border)', background: 'var(--warning-soft)', borderRadius: 'var(--r-2)', cursor: 'pointer', fontSize: 13.5, fontWeight: 700, color: 'var(--warning-on-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}
          >
            <Pause size={15} /> Guardar la actual en espera
          </button>
          <button
            onClick={onDiscardCurrent}
            style={{ width: '100%', padding: '12px', border: '1px solid var(--danger-soft)', background: 'var(--surface)', borderRadius: 'var(--r-2)', cursor: 'pointer', fontSize: 13.5, fontWeight: 700, color: 'var(--danger)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}
          >
            <Trash size={15} /> Descartar la actual
          </button>
          <button
            onClick={onCancel}
            style={{ width: '100%', padding: '11px', border: '1.5px solid var(--border)', background: 'var(--surface)', borderRadius: 9, cursor: 'pointer', fontSize: 13.5, fontWeight: 600, color: 'var(--ink-2)' }}
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main page export ────────────────────────────────────────────
export function POSPage() {
  const [query, setQuery] = useState('')
  const [canal, setCanal] = useState<Canal>(DEFAULT_CANAL)
  const [checkout, setCheckout] = useState(false)
  const [showOpenShift, setShowOpenShift] = useState(false)
  const [notingIdx, setNotingIdx] = useState<number | null>(null)
  const [buscadorEnfocado, setBuscadorEnfocado] = useState(false)
  const [showHoldModal, setShowHoldModal] = useState(false)
  const [showHeldPanel, setShowHeldPanel] = useState(false)
  const [resumeTarget, setResumeTarget] = useState<string | null>(null)
  // Configuración de extras: producto a agregar, o ítem del carrito a editar.
  const [configProduct, setConfigProduct] = useState<ProductWithCategory | null>(null)
  const [editingItem, setEditingItem] = useState<CartItem | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const { isOpen: isShiftOpen } = useCashShift()
  const productsWithExtras = useProductsWithExtras()

  // Cobrar exige turno abierto: si no hay, abre el modal de apertura primero.
  const handleCheckout = () => {
    if (!isShiftOpen) { setShowOpenShift(true); return }
    setCheckout(true)
  }

  const { data: products = [], isLoading: prodsLoading } = useProducts()

  // Atajos del MOSTRADOR (§5): F2 buscar producto, F12 cobrar. El `/` ya
  // estaba y se conserva — es el único atajo impreso además de F12.
  //
  // 🔴 F12 es la razón de todo esto: el botón decía «Cobrar — F12» desde el
  //    primer día y la tecla no existía, así que apretarla abría las
  //    herramientas del navegador. §5 la llama «la única excepción permanente»
  //    a no imprimir atajos; imprimir uno muerto es peor que no imprimirlo.
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const tag = (document.activeElement as HTMLElement)?.tagName
      if (e.key === '/' && tag !== 'INPUT' && tag !== 'TEXTAREA') {
        e.preventDefault()
        searchRef.current?.focus()
        return
      }
      if (e.key === teclaDe('Buscar producto')) {
        e.preventDefault()
        searchRef.current?.focus()
        return
      }
      if (e.key === teclaDe('Cobrar')) {
        e.preventDefault()
        // Mismo camino que el botón: si no hay ítems no hay nada que cobrar, y
        // sin turno abre primero la apertura de caja.
        if (itemsRef.current.length > 0) checkoutRef.current()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])

  // Inject print CSS
  useEffect(() => {
    const existing = document.getElementById('nodo-ticket-print')
    if (existing) return
    const style = document.createElement('style')
    style.id = 'nodo-ticket-print'
    style.textContent = PRINT_CSS
    document.head.appendChild(style)
    return () => style.remove()
  }, [])

  /**
   * La lista del mostrador: **todo el catálogo**, y el buscador lo acota.
   *
   * 🔴 ACÁ VIVÍA EL DEFECTO QUE DESTAPÓ SACAR EL STRIP, y no era de layout.
   *    La versión anterior filtraba por `resolvedCat = activeCat ?? categories[0].id`,
   *    con un `useEffect` que fijaba la primera categoría al cargar. **No había
   *    opción «Todos».** O sea que, sin escribir en el buscador, el mostrador
   *    mostraba UNA sola categoría —la primera por `sort_order`— y las otras
   *    siete estaban a un clic que nadie veía. Con el catálogo real del cliente
   *    eso deja la mayor parte del producto inalcanzable por defecto.
   *    El strip no filtraba: **poblaba**.
   *
   * 🔴 Y LA CATEGORÍA ENTRA AL BUSCADOR, que es la mitad sin la cual sacar el
   *    strip habría RETIRADO una capacidad en vez de moverla. El argumento que
   *    justificó la decisión —«teclear es más rápido que navegar por
   *    pestañas»— **era falso mientras el buscador no mirara la categoría**:
   *    teclear «farma» no encontraba nada. La decisión se apoyaba en una
   *    capacidad que no existía todavía.
   */
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return products
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.description ?? '').toLowerCase().includes(q) ||
        (p.categories?.name ?? '').toLowerCase().includes(q),
    )
  }, [products, query])

  const items = useCartStore((s) => s.items)
  // El atajo se suscribe una sola vez y lee por ref, para no re-suscribir el
  // listener en cada cambio del carrito.
  const itemsRef = useRef(items)
  itemsRef.current = items
  const checkoutRef = useRef(handleCheckout)
  checkoutRef.current = handleCheckout
  const discount = useCartStore((s) => s.discount)
  const discountType = useCartStore((s) => s.discountType)
  const discountReason = useCartStore((s) => s.discountReason)
  const add = useCartStore((s) => s.add)
  const addItem = useCartStore((s) => s.addItem)
  const updateItemExtras = useCartStore((s) => s.updateItemExtras)
  const clear = useCartStore((s) => s.clear)
  const heldOrders = useCartStore((s) => s.heldOrders)
  const holdCurrentOrder = useCartStore((s) => s.holdCurrentOrder)
  const resumeHeldOrder = useCartStore((s) => s.resumeHeldOrder)
  const discardHeldOrder = useCartStore((s) => s.discardHeldOrder)

  // ── Ventas en espera ──
  const confirmHold = (label: string) => {
    holdCurrentOrder(label)
    setShowHoldModal(false)
    toast.success('Venta puesta en espera')
  }

  const handleResume = (id: string) => {
    // Si el carrito actual tiene ítems, preguntar qué hacer con él primero.
    if (items.length > 0) {
      setResumeTarget(id)
    } else {
      resumeHeldOrder(id)
      setShowHeldPanel(false)
    }
  }

  const resumeKeepingCurrent = () => {
    if (!resumeTarget) return
    holdCurrentOrder('')          // guarda el carrito actual con label automático
    resumeHeldOrder(resumeTarget) // restaura la venta elegida
    setResumeTarget(null)
    setShowHeldPanel(false)
  }

  const resumeDiscardingCurrent = () => {
    if (!resumeTarget) return
    resumeHeldOrder(resumeTarget) // sobrescribe el carrito actual
    setResumeTarget(null)
    setShowHeldPanel(false)
  }

  const handleDiscardHeld = (id: string) => {
    if (!window.confirm('¿Descartar esta venta en espera? No se puede deshacer.')) return
    discardHeldOrder(id)
  }

  // Agregar producto: si tiene extras asignados, abrir el modal de
  // configuración; si no, agregar directo (sin fricción).
  const handleAddProduct = (product: ProductWithCategory) => {
    if (productsWithExtras.has(product.id)) setConfigProduct(product)
    else add(product)
  }

  const subtotal = useMemo(
    () => items.reduce((a, x) => a + cartItemTotal(x), 0),
    [items],
  )
  const discountAmt =
    discountType === 'pct'
      ? Math.round((subtotal * discount) / 100)
      : Math.min(discount, subtotal)
  const afterDiscount = subtotal - discountAmt
  const total = afterDiscount

  if (prodsLoading) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400 text-sm">
        Cargando productos...
      </div>
    )
  }

  return (
    <div
      className="flex h-full overflow-hidden"
      style={{
        background: 'var(--surface-2)', color: 'var(--ink)',
        fontFamily: 'Inter, system-ui, sans-serif', position: 'relative',
      }}
    >
      {/* ─── LEFT: Catalog 60% ─── */}
      {/*
        `minWidth: 0` NO es cosmético: sin él este flex item conserva el
        `min-width: auto` por defecto y se NIEGA a bajar de su ancho min-content.
        Cuando los tabs de categorías no entran, el panel crece más allá del 60%
        y SE COME EL CARRITO. Medido a 1024px (área útil 800 = viewport − 224 del
        sidebar): con 5 categorías de nombres reales el catálogo pasaba de 480 a
        548 y el carrito caía de 320 a 253; con 7 el carrito quedaba en 86 y el
        cajero NO PODÍA COBRAR. G-10 tiene 5 categorías reales.
        El `overflowX: auto` del strip no alcanzaba: nunca llegaba a activarse
        porque el panel le cedía el ancho antes de que hubiera algo que scrollear.
      */}
      <div style={{ flex: '0 0 60%', minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0, background: 'var(--bg)' }}>

        {/* Search + category tabs */}
        <div style={{ padding: '18px 24px 4px', background: 'var(--surface-3)', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 14 }}>
            {/* El envoltorio hace de campo: lleva la lupa, la X y el atajo.
                Por eso el estado de FOCO se pinta acá y no en el <input> — si
                lo llevara el input, el anillo aparecería dentro del recuadro.
                Los valores son los del §4: borde --action + anillo de 3px en
                --action-soft. */}
            <div
              data-focus={buscadorEnfocado || undefined}
              style={{
                flex: 1, display: 'flex', alignItems: 'center', gap: 10,
                background: 'var(--surface)', borderRadius: 'var(--r-2)',
                padding: '11px 14px',
                border: `1px solid ${buscadorEnfocado ? 'var(--action)' : 'var(--border)'}`,
                boxShadow: buscadorEnfocado ? '0 0 0 3px var(--action-soft)' : 'none',
                transition: 'border-color .12s, box-shadow .12s',
              }}
            >
              <Search size={17} color="var(--ink-3)" />
              <input
                ref={searchRef}
                data-testid="pos-search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') { setQuery(''); e.currentTarget.blur() }
                }}
                onFocus={() => setBuscadorEnfocado(true)}
                onBlur={() => setBuscadorEnfocado(false)}
                placeholder="Buscar producto..."
                style={{
                  flex: 1, border: 'none', outline: 'none',
                  background: 'transparent', fontSize: 14, color: 'var(--ink)',
                  fontFamily: 'inherit',
                }}
              />
              {/* La X borra la búsqueda; sin búsqueda se ve el atajo "/".
                  El único atajo IMPRESO del producto es "Cobrar — F12" (§5) y
                  los demás se revelan; este ya estaba impreso antes del
                  re-skin y se conserva — sacarlo es decisión de producto, no
                  de estilo. Lo que sí se va es la monoespaciada del `kbd`, que
                  no existe en el producto (§2). */}
              {query ? (
                <button
                  onClick={() => setQuery('')}
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--ink-4)', padding: 0, display: 'grid', placeItems: 'center' }}
                >
                  <X size={14} />
                </button>
              ) : (
                <kbd style={{
                  fontSize: 10, color: 'var(--ink-4)', border: '1px solid var(--border)',
                  borderRadius: 'var(--r-1)', padding: '1px 5px', fontFamily: 'inherit',
                  background: 'var(--border-2)', userSelect: 'none',
                }}>/</kbd>
              )}
            </div>
          </div>

          {/* ── ACÁ VIVÍA EL STRIP DE CATEGORÍAS, Y SE RETIRÓ (2026-09-03) ────
              La lista muestra el catálogo entero, como la maqueta, y el
              buscador lo acota. Se anota en negativo porque el motivo no es
              estético y no se puede reconstruir mirando el código que queda:

              1. 🔴 EL STRIP NO FILTRABA: POBLABA. Sin escribir en el buscador
                 el mostrador mostraba UNA sola categoría —la primera— porque
                 no existía la opción «Todos». Con las ocho categorías reales
                 del cliente, siete octavos del catálogo estaban a un clic que
                 nadie ve. Eso no es layout: es el producto no mostrando lo que
                 tiene.
              2. **Su tamaño lo decidían los datos del CLIENTE.** Con 8
                 categorías ya desborda a 1280 y aparece la máscara; en agosto
                 empujó el carrito fuera de pantalla. Un elemento que crece con
                 el catálogo es un defecto de layout esperando el dato correcto.
              3. El brief dice que **la velocidad de búsqueda es el cuello de
                 botella**, y navegar por pestañas es más lento que teclear tres
                 letras — pero eso exigió que el buscador mirara la categoría,
                 ver `filtered`.

              ⚠️ Lo que se fue con él, enumerado antes de tocarlo: elegir una
              tab limpiaba el buscador; el color de la categoría pintaba la
              barra y la pastilla del encabezado; la máscara era la ÚNICA señal
              de que había más (la scrollbar está oculta); y un `useEffect`
              fijaba la primera categoría al cargar — que es lo que producía (1).
              `useScrollOverflow` NO se poda: lo usa `CategoryTabs` en Productos. */}
        </div>

        {/* Encabezado de la lista.
            🔴 EL CONTEO SE CONSERVA, Y SUBE DE VALOR AL SACAR SU VECINO. Con el
               strip, «N productos» era una nota al margen: el rótulo de al lado
               ya decía qué se estaba mirando y la lista era corta. Con el
               catálogo entero a la vista es **la única señal de cuánto hay** —y
               la única forma de notar que el buscador acotó a tres de treinta y
               dos—. Es un (d) que no cambió de código y cambió de importancia.
            ⚠️ Se fue la PASTILLA DE COLOR: pintaba `activeCatObj.color`, y sin
               categoría activa no tiene qué afirmar. Ver la nota de la columna
               CATEGORÍA en `ProductRow` para por qué el color no se muda ahí. */}
        <div style={{ padding: '16px 24px 8px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', letterSpacing: -0.3 }}>
            {query ? `"${query}"` : 'Todos los productos'}
          </div>
          <div
            data-testid="pos-conteo-productos"
            style={{ fontSize: 12, color: 'var(--ink-4)', fontVariantNumeric: 'tabular-nums' }}
          >
            {filtered.length} {filtered.length === 1 ? 'producto' : 'productos'}
          </div>
        </div>

        {/* Product grid */}
        <div style={{ flex: 1, overflow: 'auto', padding: '4px 24px 24px' }}>
          {filtered.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-4)', fontSize: 13 }}>
              Sin resultados para "{query}"
            </div>
          ) : (
            <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-3)', overflow: 'hidden' }}>
              {/* ── CABECERA DE LA TABLA (§3: 30-32px, `--surface-2`, pegajosa) ──
                  Los rótulos van en `--fs-label` de §2: 11/600, `.04em`, en
                  mayúsculas y en `--ink-3`.

                  🔴 SON TRES Y NO CUATRO. El indicador de stock NO lleva título
                     porque no es una columna: es **condicional** —sólo aparece
                     con stock bajo o en cero— y vive pegado al nombre. Un título
                     sobre él encabezaría una columna vacía en la mayoría de las
                     filas, que es peor que no tenerlo: promete un dato que casi
                     nunca está.
                  ⚠️ Los anchos se copian de `ProductRow` a mano, y ése es un
                     contrato en dos lados (R1): si la fila cambia `minWidth`,
                     esta cabecera deja de alinear y **nada lo avisa**. El spec
                     `pos-layout` asevera la alineación por eso. */}
              <div
                data-testid="pos-lista-cabecera"
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  height: 32, padding: '0 12px',
                  position: 'sticky', top: 0, zIndex: 1,
                  background: 'var(--surface-2)',
                  borderBottom: '1px solid var(--border)',
                  fontSize: 11, fontWeight: 600, letterSpacing: '.04em',
                  textTransform: 'uppercase', color: 'var(--ink-3)',
                }}
              >
                <span style={{ flex: 1, minWidth: 0 }}>Producto</span>
                <span style={{ flexShrink: 0, minWidth: 108, maxWidth: 132 }}>Categoría</span>
                <span style={{ flexShrink: 0, minWidth: 96, textAlign: 'right' }}>Precio</span>
              </div>
              {/* Cabecera de columnas. Mayúscula sostenida: es de los dos
                  únicos lugares donde la skill la permite (etiqueta de columna
                  y de KPI, --fs-label). */}
              <div style={{
                position: 'sticky', top: 0, zIndex: 1,
                display: 'flex', alignItems: 'center', gap: 10,
                height: 32, padding: '0 12px',
                background: 'var(--surface-2)', borderBottom: '1px solid var(--border)',
                fontSize: 11, fontWeight: 600, letterSpacing: '.04em',
                textTransform: 'uppercase', color: 'var(--ink-3)',
              }}>
                <span style={{ flex: 1 }}>Producto</span>
                <span style={{ minWidth: 88, textAlign: 'right' }}>Precio</span>
              </div>
              {filtered.map((p) => (
                <ProductRow key={p.id} product={p} onAdd={() => handleAddProduct(p)} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ─── RIGHT: Cart 40% ─── */}
      <CartPanel
        subtotal={subtotal}
        discountAmt={discountAmt}
        total={total}
        canal={canal}
        setCanal={setCanal}
        notingIdx={notingIdx}
        setNotingIdx={setNotingIdx}
        onCheckout={handleCheckout}
        onHold={() => setShowHoldModal(true)}
        heldCount={heldOrders.length}
        onShowHeld={() => setShowHeldPanel(true)}
        productsWithExtras={productsWithExtras}
        onEditExtras={(item) => setEditingItem(item)}
      />

      {/* Configurar extras al AGREGAR un producto */}
      {configProduct && (
        <ItemConfigModal
          product={configProduct}
          onConfirm={(extras) => { addItem(configProduct, extras); setConfigProduct(null) }}
          onClose={() => setConfigProduct(null)}
        />
      )}

      {/* Editar extras de un ítem ya en el carrito */}
      {editingItem && (
        <ItemConfigModal
          product={editingItem.product}
          precioUnitario={editingItem.price}
          initial={editingItem.extras}
          confirmLabel="Guardar extras"
          onConfirm={(extras) => { updateItemExtras(editingItem.id, extras); setEditingItem(null) }}
          onClose={() => setEditingItem(null)}
        />
      )}

      {showHoldModal && (
        <HoldLabelModal
          onConfirm={confirmHold}
          onClose={() => setShowHoldModal(false)}
        />
      )}

      {showHeldPanel && (
        <HeldOrdersPanel
          held={heldOrders}
          onResume={handleResume}
          onDiscard={handleDiscardHeld}
          onClose={() => setShowHeldPanel(false)}
        />
      )}

      {resumeTarget && (
        <ResumeConflictDialog
          onKeep={resumeKeepingCurrent}
          onDiscardCurrent={resumeDiscardingCurrent}
          onCancel={() => setResumeTarget(null)}
        />
      )}

      {showOpenShift && (
        <OpenShiftModal
          onClose={() => setShowOpenShift(false)}
          onOpened={() => { setShowOpenShift(false); setCheckout(true) }}
        />
      )}

      {checkout && (
        <CheckoutModal
          items={items}
          total={total}
          subtotal={subtotal}
          discountAmt={discountAmt}
          discount={discount}
          discountType={discountType}
          discountReason={discountReason}
          canal={canal}
          onClose={() => setCheckout(false)}
          // El canal vuelve al default tras CUALQUIER venta. `canal` es estado local
          // de la página y `clear()` (del cartStore) no lo tocaba, así que quedaba
          // pegado: la siguiente venta de mostrador se grababa con el canal anterior
          // y ensuciaba el desglose del reporte Financiero. Un dato mal clasificado
          // pesa más que el clic de más para quien toma varios pedidos seguidos por
          // el mismo canal.
          // ⚠️ Con TRES canales el ciclo ya no es "exactamente un clic" como cuando
          //    eran dos. Si el reset molesta en uso real, la respuesta NO es sacarlo:
          //    es que el selector deje de ser cíclico.
          onComplete={() => { setCheckout(false); clear(); setCanal(DEFAULT_CANAL) }}
        />
      )}
    </div>
  )
}
