import { useMemo, useState } from 'react'
import { X, ArrowLeftRight } from 'lucide-react'
import type { SaleDetailRow, SaleChangeItem } from '@/lib/supabase-helpers'
import { formatoCOP } from '@/lib/formato'
import { useCambioProducto } from '@/hooks/useCambioProducto'
import { useProducts } from '@/hooks/useProducts'
import { FiltroProducto, type ProductoFiltrado } from '@/components/inventory/FiltroProducto'
import { Button } from '@/components/ui/Button'

// ============================================================================
// CAMBIAR UN PRODUCTO DE UNA VENTA A CRÉDITO
//
// 🔴 NO ES UNA EDICIÓN DE LA VENTA, y la pantalla lo dice: las líneas de la
//    izquierda son las que se vendieron ese día y NO se tocan. Lo que se arma
//    acá es un documento nuevo — el cliente volvió y se llevó otra cosa, que
//    es un hecho con su propia fecha, no un error de digitación.
//
// 🔴 EL SALDO NUEVO SE MUESTRA, LA DECISIÓN LA TOMA LA RPC. Acá se calcula
//    `total + delta`, que es una suma y sirve para que ella confirme viendo el
//    número. Lo que NO se re-deriva es el RECHAZO por «quedaría pagada de
//    más»: eso necesita los abonos y es la regla del servidor. Duplicarla
//    serían dos lados del mismo contrato en dos lenguajes, y el que se
//    congela es siempre el de la pantalla.
//    La RPC niega con los tres números y nombrando la salida, y ese mensaje se
//    muestra tal cual.
// ============================================================================

interface Props {
  sale: SaleDetailRow
  onClose: () => void
}

const inputStyle: React.CSSProperties = {
  padding: '8px 10px', border: '1.5px solid var(--border)', borderRadius: 8,
  fontSize: 13, color: 'var(--ink)', outline: 'none', background: 'var(--surface)',
}

export function CambioProductoModal({ sale, onClose }: Props) {
  const cambio = useCambioProducto()
  const { data: productos = [] } = useProducts()

  // Cuánto vuelve de cada línea de la venta. Arranca en 0: nada vuelve solo.
  const [vuelve, setVuelve] = useState<Record<string, number>>({})
  const [salePro, setSalePro] = useState<ProductoFiltrado | null>(null)
  const [saleQty, setSaleQty] = useState('1')
  const [salePrecio, setSalePrecio] = useState('')
  const [motivo, setMotivo] = useState('')

  const elegirSale = (p: ProductoFiltrado | null) => {
    setSalePro(p)
    // El precio de catálogo es un PISO y ella negocia (los datos de su propio
    // archivo lo miden), así que se precarga para ahorrar tecleo — no se fija.
    const cat = p ? productos.find((x) => x.id === p.id) : null
    setSalePrecio(cat?.price != null ? String(Math.round(Number(cat.price))) : '')
  }

  const qtySale = Number(saleQty.replace(/\D/g, '')) || 0
  const precioSale = Number(salePrecio.replace(/\D/g, '')) || 0

  const { items, entra, salen } = useMemo(() => {
    const out: SaleChangeItem[] = []
    let entra = 0
    for (const it of sale.order_items) {
      const q = vuelve[it.id] ?? 0
      if (q > 0) {
        out.push({ direction: 'in', product_id: it.product_id, qty: q, unit_price: Number(it.unit_price) })
        entra += q * Number(it.unit_price)
      }
    }
    let salen = 0
    if (salePro && qtySale > 0) {
      out.push({ direction: 'out', product_id: salePro.id, qty: qtySale, unit_price: precioSale })
      salen = qtySale * precioSale
    }
    return { items: out, entra, salen }
  }, [sale.order_items, vuelve, salePro, qtySale, precioSale])

  const delta = salen - entra
  const totalNuevo = Number(sale.total) + delta
  const hayIn = items.some((i) => i.direction === 'in')
  const hayOut = items.some((i) => i.direction === 'out')
  const puede = hayIn && hayOut && motivo.trim().length > 0 && !cambio.isPending

  const confirmar = () => {
    if (!puede) return
    cambio.mutate(
      { orderId: sale.id, motivo: motivo.trim(), items },
      { onSuccess: onClose },
    )
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'var(--overlay)', display: 'grid', placeItems: 'center', zIndex: 60, padding: 20 }}
      /* Sin cierre por clic en el fondo: acá se arma trabajo que se pierde. */
    >
      <div
        data-testid="cambio-modal"
        style={{ background: 'var(--surface)', borderRadius: 14, width: 720, maxWidth: '100%', maxHeight: '90vh', boxShadow: 'var(--shadow-1)', display: 'flex', flexDirection: 'column' }}
      >
        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border-2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--action)', textTransform: 'uppercase', letterSpacing: 1 }}>
              Cambiar producto
            </div>
            <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--ink)', letterSpacing: -0.3, marginTop: 1 }}>
              Venta #{sale.order_number ?? '—'}
            </div>
          </div>
          <button onClick={onClose} aria-label="Cerrar" style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--border-2)', border: 'none', cursor: 'pointer', color: 'var(--ink-3)', display: 'grid', placeItems: 'center' }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: 22, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ fontSize: 12.5, color: 'var(--ink-3)', lineHeight: 1.5 }}>
            La venta original <strong style={{ color: 'var(--ink-2)' }}>no se modifica</strong>: sus líneas
            quedan como están porque eso fue lo que se vendió ese día. Esto registra que el cliente
            volvió y se llevó otra cosa.
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 16, alignItems: 'start' }}>
            {/* ── qué vuelve ── */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                Qué devuelve
              </div>
              <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', flexShrink: 0 }}>
                {sale.order_items.map((it) => (
                  <div key={it.id} data-testid="cambio-linea-venta" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderBottom: '1px solid var(--border-2)' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {it.products?.name ?? '—'}
                      </div>
                      <div style={{ fontSize: 11.5, color: 'var(--ink-4)', fontVariantNumeric: 'tabular-nums' }}>
                        {it.qty} × {formatoCOP(it.unit_price)}
                      </div>
                    </div>
                    {/* Tope = lo que se vendió. La RPC además descuenta lo ya
                        devuelto en cambios anteriores, y ésa es la autoridad. */}
                    <input
                      type="number" min={0} max={it.qty}
                      data-testid="cambio-vuelve-qty"
                      value={vuelve[it.id] ?? 0}
                      onChange={(e) => {
                        const v = Math.max(0, Math.min(it.qty, Number(e.target.value) || 0))
                        setVuelve((s) => ({ ...s, [it.id]: v }))
                      }}
                      style={{ ...inputStyle, width: 62, textAlign: 'right' }}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div style={{ alignSelf: 'center', color: 'var(--ink-4)', paddingTop: 24 }}>
              <ArrowLeftRight size={18} />
            </div>

            {/* ── qué se lleva ── */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                Qué se lleva
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <FiltroProducto value={salePro} onChange={elegirSale} />
                {salePro && (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 11, color: 'var(--ink-4)', fontWeight: 600, marginBottom: 3 }}>Cantidad</div>
                      <input data-testid="cambio-sale-qty" value={saleQty} onChange={(e) => setSaleQty(e.target.value)} style={{ ...inputStyle, width: '100%' }} />
                    </div>
                    <div style={{ flex: 2 }}>
                      <div style={{ fontSize: 11, color: 'var(--ink-4)', fontWeight: 600, marginBottom: 3 }}>Precio (COP)</div>
                      <input data-testid="cambio-sale-precio" value={salePrecio} onChange={(e) => setSalePrecio(e.target.value)} style={{ ...inputStyle, width: '100%' }} />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div>
            <div style={{ fontSize: 11, color: 'var(--ink-4)', fontWeight: 600, marginBottom: 4 }}>Motivo</div>
            <input
              data-testid="cambio-motivo"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Por qué se cambió"
              style={{ ...inputStyle, width: '100%' }}
            />
          </div>

          {/* El número con el que ella confirma. El rechazo por «pagada de más»
              lo decide la RPC: necesita los abonos y es su regla. */}
          <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', fontSize: 13 }}>
            <Fila rotulo="La venta decía" valor={formatoCOP(sale.total)} />
            <Fila rotulo="Devuelve" valor={`− ${formatoCOP(entra)}`} />
            <Fila rotulo="Se lleva" valor={`+ ${formatoCOP(salen)}`} />
            <div style={{ borderTop: '1px solid var(--border)', marginTop: 6, paddingTop: 6 }}>
              <Fila rotulo="Pasa a deber" valor={formatoCOP(totalNuevo)} fuerte testid="cambio-total-nuevo" />
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--ink-4)', marginTop: 6 }}>
              Menos lo que ya haya abonado. Si el cambio la dejara pagada de más, el sistema lo avisa
              con los números antes de guardar nada.
            </div>
          </div>
        </div>

        <div style={{ padding: '14px 22px', borderTop: '1px solid var(--border-2)', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, flexShrink: 0 }}>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button data-testid="cambio-confirmar" onClick={confirmar} disabled={!puede}>
            {cambio.isPending ? 'Registrando...' : 'Registrar cambio'}
          </Button>
        </div>
      </div>
    </div>
  )
}

function Fila({ rotulo, valor, fuerte, testid }: { rotulo: string; valor: string; fuerte?: boolean; testid?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, padding: '2px 0' }}>
      <span style={{ color: fuerte ? 'var(--ink)' : 'var(--ink-3)', fontWeight: fuerte ? 700 : 500 }}>{rotulo}</span>
      <span data-testid={testid} style={{ fontVariantNumeric: 'tabular-nums', fontWeight: fuerte ? 700 : 600, color: 'var(--ink)', fontSize: fuerte ? 15 : 13 }}>
        {valor}
      </span>
    </div>
  )
}
