import { useMemo, useState } from 'react'
import {
  Search, X, Plus,
  ChevronLeft, ChevronRight, ArrowDownCircle, ArrowUpCircle, RotateCcw, SlidersHorizontal,
} from 'lucide-react'
import { useProducts } from '@/hooks/useProducts'
import { useStockMovements } from '@/hooks/useStockMovements'
import { StockAdjustModal } from '@/components/inventory/StockAdjustModal'
import type { ProductWithCategory } from '@/stores/cartStore'
import type { StockMovementType } from '@/lib/supabase-helpers'
// Regla ÚNICA de estado de inventario, compartida con el POS (antes duplicada).
import { stockStatus, type StockStatus } from '@/lib/stockStatus'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { KpiCard } from '@/components/ui/KpiCard'
import { PageHeader } from '@/components/ui/PageHeader'

const PAGE_SIZE = 25

// Esta pantalla pre-filtra a simple + stock_tracking, así que nunca ve
// 'untracked'; el tipo local acota los estados que sí puede mostrar.
type NivelStatus = Exclude<StockStatus, 'untracked'>

const fmtDateTime = (iso: string) =>
  new Intl.DateTimeFormat('es-CO', {
    timeZone: 'America/Bogota', dateStyle: 'short', timeStyle: 'short',
  }).format(new Date(iso))

// ─── Status badge ────────────────────────────────────────────────
// Segundo badge inline absorbido por la primitiva (§4). Los tonos son ROLES:
// 🔴 `negative` y `out` eran el MISMO rojo, y no son lo mismo. Sin stock es un
//    estado normal del catálogo — hay productos que se acaban. Existencia
//    NEGATIVA significa que se vendió más de lo que el sistema creía tener:
//    ahí hay algo mal contado, y eso sí es `danger`.
//    Darles el mismo color le quitaba al segundo su única señal.
function StatusBadge({ status, stock }: { status: StockStatus; stock: number }) {
  const cfg: Record<StockStatus, { tone: BadgeTone; label: string }> = {
    negative: { tone: 'danger', label: `Reponer (${stock})` },
    out: { tone: 'neutral', label: 'Sin stock' },
    low: { tone: 'warning', label: 'Stock bajo' },
    ok: { tone: 'success', label: 'Disponible' },
    // La tabla pre-filtra a simple+tracking, así que este caso no se alcanza;
    // se cubre igual para no depender de un cast sobre el filtro.
    untracked: { tone: 'neutral', label: 'Sin inventario' },
  }
  const { tone, label } = cfg[status]
  return <Badge tone={tone} data-testid="stock-status-badge">{label}</Badge>
}

// ─── Niveles tab ─────────────────────────────────────────────────
function LevelsTab({ products, onAdjust }: { products: ProductWithCategory[]; onAdjust: (id: string) => void }) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'all' | NivelStatus>('all')

  const tracked = useMemo(
    () => products.filter(p => p.kind === 'simple' && p.stock_tracking),
    [products],
  )

  const summary = useMemo(() => {
    let negative = 0, out = 0, low = 0
    for (const p of tracked) {
      const st = stockStatus(p)
      if (st === 'negative') negative++
      else if (st === 'out') out++
      else if (st === 'low') low++
    }
    return { total: tracked.length, negative, out, low }
  }, [tracked])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return tracked.filter(p => {
      if (q && !p.name.toLowerCase().includes(q)) return false
      if (filter === 'all') return true
      return stockStatus(p) === filter
    })
  }, [tracked, query, filter])

  const FILTERS: { value: 'all' | NivelStatus; label: string }[] = [
    { value: 'all', label: 'Todos' },
    { value: 'negative', label: 'Negativo' },
    { value: 'out', label: 'Sin stock' },
    { value: 'low', label: 'Bajo' },
    { value: 'ok', label: 'Disponible' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* KPIs */}
      <div style={{ display: 'flex', gap: 12 }}>
        {/* Segunda copia de KpiCard, muerta: ahora es la primitiva del §4. Y los
            tonos pasan a ser ROLES — "en negativo" es lo único que pide una
            decisión ya (se contó mal), "stock bajo" advierte, y los otros dos
            son cifras de trabajo. Antes los cuatro llevaban color de acento sin
            que el color significara nada distinto. */}
        {/* ⚠️ LA MAQUETA MUESTRA OTROS TRES KPI, y son de DINERO: valor del
            inventario, referencias con existencia, productos sin costo. Los
            tres se DERIVAN de datos que ya existen (`stock_qty`, `cost_price`)
            — no falta esquema, falta pantalla. No se agregan acá porque esto es
            un RE-SKIN: misma información, con el design system. Información
            nueva es su propia decisión. Anotado como hueco de FUNCIONALIDAD, no
            de datos, en docs/reskin-esquema.md. */}
        {/* 🔴 Decía "Insumos": vocabulario heredado de VENTO, donde un insumo
            era el ingrediente de una receta. §7.15 fija el vocabulario neutro
            del producto — «Productos, clientes, pedidos» — y acá lo que se
            cuenta son productos. */}
        <KpiCard etiqueta="Productos con existencia" valor={summary.total} />
        <KpiCard etiqueta="Sin stock (0)" valor={summary.out} />
        <KpiCard etiqueta="Stock bajo" valor={summary.low} tono={summary.low > 0 ? 'warning' : 'normal'} />
        <KpiCard etiqueta="En negativo" valor={summary.negative} tono={summary.negative > 0 ? 'debt' : 'normal'} />
      </div>

      {/* Search + filter */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 9, padding: '8px 12px', width: 240 }}>
          <Search size={15} color="var(--ink-4)" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar producto..."
            style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 13, color: 'var(--ink)' }}
          />
          {query && <button onClick={() => setQuery('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-4)', padding: 0, display: 'grid', placeItems: 'center' }}><X size={13} /></button>}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              style={{
                padding: '7px 12px', borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                border: `1px solid ${filter === f.value ? 'var(--action)' : 'var(--border)'}`,
                background: filter === f.value ? 'var(--action-soft)' : 'var(--surface)',
                color: filter === f.value ? 'var(--success-on-soft)' : 'var(--ink-3)',
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--surface-2)', textAlign: 'left', color: 'var(--ink-3)', fontSize: 11.5 }}>
              <th style={{ padding: '10px 16px', fontWeight: 600 }}>Producto</th>
              <th style={{ padding: '10px 16px', fontWeight: 600 }}>Categoría</th>
              <th style={{ padding: '10px 16px', fontWeight: 600, textAlign: 'right' }}>Stock</th>
              <th style={{ padding: '10px 16px', fontWeight: 600, textAlign: 'right' }}>Mínimo</th>
              <th style={{ padding: '10px 16px', fontWeight: 600 }}>Estado</th>
              <th style={{ padding: '10px 16px', fontWeight: 600, textAlign: 'right' }}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={6} style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--ink-4)' }}>Sin productos que coincidan</td></tr>
            ) : filtered.map(p => {
              const st = stockStatus(p)
              const stock = p.stock_qty ?? 0
              return (
                <tr key={p.id} data-testid="stock-level-row" style={{ borderTop: '1px solid var(--border-2)' }}>
                  <td style={{ padding: '11px 16px', fontWeight: 600, color: 'var(--ink)' }}>{p.name}</td>
                  <td style={{ padding: '11px 16px', color: 'var(--ink-3)' }}>{p.categories?.name ?? '—'}</td>
                  <td data-testid="stock-level-qty" style={{ padding: '11px 16px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: stock < 0 ? 'var(--danger-on-soft)' : 'var(--ink)' }}>{stock}</td>
                  <td style={{ padding: '11px 16px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--ink-4)' }}>{p.min_stock}</td>
                  <td style={{ padding: '11px 16px' }}><StatusBadge status={st} stock={stock} /></td>
                  <td style={{ padding: '8px 16px', textAlign: 'right' }}>
                    <button
                      data-testid="stock-level-adjust"
                      onClick={() => onAdjust(p.id)}
                      title="Ajustar stock"
                      style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer', color: 'var(--ink-2)', fontSize: 12, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 5 }}
                    >
                      <SlidersHorizontal size={12} /> Ajustar
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Movimientos tab ─────────────────────────────────────────────
// 🔴 LOS CUATRO TIPOS VAN EN NEUTRO, y es una decisión, no pereza.
//    Antes cada uno tenía su color —venta azul, ajuste VIOLETA, compra y
//    devolución verdes—. El violeta no existe en el design system, y los otros
//    tres usaban familias que sí significan algo (acción, confirmación) para
//    codificar algo que NO es un estado ni una acción: es una categoría.
//    §8 dice que lo que no está no se infiere, y no hay paleta de "clases de
//    movimiento".
//    Además el color era redundante: LA CANTIDAD YA LLEVA EL SIGNO, que es el
//    único eje que importa mirando la tabla — entró o salió. Un color por tipo
//    compite con esa señal en vez de reforzarla.
const MOV_META: Record<string, { label: string; icon: React.ReactNode }> = {
  sale: { label: 'Venta', icon: <ArrowDownCircle size={12} /> },
  adjustment: { label: 'Ajuste', icon: <SlidersHorizontal size={12} /> },
  return: { label: 'Devolución', icon: <RotateCcw size={12} /> },
  purchase: { label: 'Compra', icon: <ArrowUpCircle size={12} /> },
}

function MovementsTab() {
  const [type, setType] = useState<StockMovementType | null>(null)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(0)

  const { data, isLoading, isFetching } = useStockMovements({
    type,
    from: from ? new Date(from).toISOString() : undefined,
    to: to ? new Date(to + 'T23:59:59').toISOString() : undefined,
    page,
    pageSize: PAGE_SIZE,
  })

  const rows = data?.rows ?? []
  const total = data?.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const TYPES: { value: StockMovementType | null; label: string }[] = [
    { value: null, label: 'Todos' },
    { value: 'sale', label: 'Ventas' },
    { value: 'purchase', label: 'Compras' },
    { value: 'adjustment', label: 'Ajustes' },
    // Dos devoluciones OPUESTAS, y por eso dos filtros: una entra stock (venta
    // anulada) y la otra lo saca (se le devolvió al proveedor). El rótulo viejo
    // decía "Devoluciones" a secas y habría mezclado las dos.
    { value: 'return', label: 'Devoluciones de venta' },
    { value: 'purchase_return', label: 'Devoluciones a proveedor' },
  ]

  const inputStyle: React.CSSProperties = {
    padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12.5, color: 'var(--ink)', outline: 'none',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Filters */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {TYPES.map(t => (
            <button
              key={t.label}
              onClick={() => { setType(t.value); setPage(0) }}
              style={{
                padding: '7px 12px', borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                border: `1px solid ${type === t.value ? 'var(--action)' : 'var(--border)'}`,
                background: type === t.value ? 'var(--action-soft)' : 'var(--surface)',
                color: type === t.value ? 'var(--success-on-soft)' : 'var(--ink-3)',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(0) }} style={inputStyle} />
          <span style={{ color: 'var(--ink-4)', fontSize: 12 }}>→</span>
          <input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(0) }} style={inputStyle} />
        </div>
      </div>

      {/* Table */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', opacity: isFetching ? 0.6 : 1, transition: 'opacity .15s' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--surface-2)', textAlign: 'left', color: 'var(--ink-3)', fontSize: 11.5 }}>
              <th style={{ padding: '10px 16px', fontWeight: 600 }}>Fecha</th>
              <th style={{ padding: '10px 16px', fontWeight: 600 }}>Tipo</th>
              <th style={{ padding: '10px 16px', fontWeight: 600 }}>Producto</th>
              <th style={{ padding: '10px 16px', fontWeight: 600, textAlign: 'right' }}>Cantidad</th>
              <th style={{ padding: '10px 16px', fontWeight: 600 }}>Usuario</th>
              <th style={{ padding: '10px 16px', fontWeight: 600 }}>Referencia</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={6} style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--ink-4)' }}>Cargando...</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={6} style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--ink-4)' }}>Sin movimientos en el período</td></tr>
            ) : rows.map(m => {
              const meta = MOV_META[m.type] ?? { bg: 'var(--border-2)', fg: 'var(--ink-3)', label: m.type, icon: null }
              const ref = (m.type === 'sale' || m.type === 'purchase') && m.reference_id
                ? `#${m.reference_id.slice(0, 8)}`
                : (m.notes ?? '—')
              return (
                <tr key={m.id} data-testid="stock-movement-row" style={{ borderTop: '1px solid var(--border-2)' }}>
                  <td style={{ padding: '11px 16px', color: 'var(--ink-3)', fontVariantNumeric: 'tabular-nums', fontSize: 12 }}>{fmtDateTime(m.created_at)}</td>
                  <td style={{ padding: '11px 16px' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 8, fontSize: 11, fontWeight: 700 }}>
                      {meta.icon}{meta.label}
                    </span>
                  </td>
                  <td style={{ padding: '11px 16px', fontWeight: 600, color: 'var(--ink)' }}>{m.products?.name ?? '—'}</td>
                  <td data-testid="stock-movement-qty" style={{ padding: '11px 16px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: m.qty >= 0 ? 'var(--success-700)' : 'var(--danger)' }}>
                    {m.qty >= 0 ? '+' : '−'}{Math.abs(m.qty)}
                  </td>
                  <td style={{ padding: '11px 16px', color: 'var(--ink-3)' }}>{m.profiles?.full_name ?? '—'}</td>
                  <td style={{ padding: '11px 16px', color: 'var(--ink-4)', fontVariantNumeric: 'tabular-nums', fontSize: 12 }}>{ref}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>{total} movimiento{total !== 1 ? 's' : ''}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', cursor: page === 0 ? 'not-allowed' : 'pointer', color: 'var(--ink-2)', opacity: page === 0 ? 0.4 : 1, display: 'grid', placeItems: 'center' }}
          >
            <ChevronLeft size={15} />
          </button>
          <span style={{ fontSize: 12.5, color: 'var(--ink-3)', fontVariantNumeric: 'tabular-nums' }}>{page + 1} / {pageCount}</span>
          <button
            onClick={() => setPage(p => (p + 1 < pageCount ? p + 1 : p))}
            disabled={page + 1 >= pageCount}
            style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', cursor: page + 1 >= pageCount ? 'not-allowed' : 'pointer', color: 'var(--ink-2)', opacity: page + 1 >= pageCount ? 0.4 : 1, display: 'grid', placeItems: 'center' }}
          >
            <ChevronRight size={15} />
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Page ────────────────────────────────────────────────────────
export function InventoryPage() {
  const { data: products = [] } = useProducts()
  const [tab, setTab] = useState<'levels' | 'movements'>('levels')
  const [adjustOpen, setAdjustOpen] = useState(false)
  const [preselectedId, setPreselectedId] = useState<string | null>(null)

  const adjustable = useMemo(
    () => products.filter(p => p.kind === 'simple' && p.stock_tracking),
    [products],
  )

  const openAdjust = (id: string | null) => { setPreselectedId(id); setAdjustOpen(true) }

  return (
    <div style={{ height: '100%', overflow: 'auto', background: 'var(--bg)', color: 'var(--ink)' }}>
      {/* Tercera pantalla con el patrón: sin eyebrow, --fs-head, tabs del §4. */}
      <PageHeader
        titulo="Inventario"
        descripcion="existencias y movimientos, por sede"
        accion={
          <Button data-testid="inventory-adjust-btn" onClick={() => openAdjust(null)}>
            <Plus size={15} /> Ajuste manual
          </Button>
        }
        tabs={[
          { id: 'levels', label: 'Existencias', testid: 'inventory-tab-levels' },
          { id: 'movements', label: 'Movimientos', testid: 'inventory-tab-movements' },
        ]}
        tabActivo={tab}
        onTab={(id) => setTab(id as 'levels' | 'movements')}
      />

      {/* Content */}
      <div style={{ padding: '24px 28px' }}>
        {tab === 'levels'
          ? <LevelsTab products={products} onAdjust={openAdjust} />
          : <MovementsTab />}
      </div>

      {adjustOpen && (
        <StockAdjustModal
          products={adjustable}
          preselectedId={preselectedId}
          onClose={() => setAdjustOpen(false)}
        />
      )}
    </div>
  )
}
