import { useState, useMemo } from 'react'
import { Search, X, Plus, Package } from 'lucide-react'
import { useProducts } from '@/hooks/useProducts'
import { useCategories } from '@/hooks/useCategories'
import { useProductMutations } from '@/hooks/useProductMutations'
import { ProductRow } from '@/components/products/ProductRow'
import { ProductModal } from '@/components/products/ProductModal'
import { CategoryTabs } from '@/components/products/CategoryTabs'
import { CategoryModal } from '@/components/products/CategoryModal'
import type { ProductWithCategory } from '@/stores/cartStore'
import type { Tables } from '@/types/database.types'

// ─── Empty state ─────────────────────────────────────────────────
function EmptyState({ query, onNew }: { query: string; onNew: () => void }) {
  if (query) {
    return (
      <div style={{ gridColumn: '1 / -1', padding: '60px 20px', textAlign: 'center' }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>🔍</div>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 6 }}>
          Sin resultados para "{query}"
        </div>
        <div style={{ fontSize: 13, color: 'var(--ink-4)' }}>
          Intenta con otro nombre o revisa la categoría seleccionada
        </div>
      </div>
    )
  }

  return (
    <div style={{ gridColumn: '1 / -1', padding: '60px 20px', textAlign: 'center' }}>
      <div style={{
        width: 64, height: 64, borderRadius: '50%',
        background: 'var(--action-soft)', margin: '0 auto 16px',
        display: 'grid', placeItems: 'center', color: 'var(--action)',
      }}>
        <Package size={28} strokeWidth={1.5} />
      </div>
      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 6 }}>
        No hay productos en esta categoría
      </div>
      <div style={{ fontSize: 13, color: 'var(--ink-4)', marginBottom: 20 }}>
        Agrega el primero para que aparezca en el POS
      </div>
      <button
        onClick={onNew}
        style={{
          padding: '10px 20px', border: 'none',
          background: 'var(--action)', borderRadius: 'var(--r-2)',
          cursor: 'pointer', fontSize: 13, fontWeight: 700, color: 'var(--surface)',
          display: 'inline-flex', alignItems: 'center', gap: 6,
        }}
      >
        <Plus size={15} /> Crear primer producto
      </button>
    </div>
  )
}

// ─── Main page ───────────────────────────────────────────────────
export function ProductsPage() {
  const [activeCat, setActiveCat] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [modalProduct, setModalProduct] = useState<ProductWithCategory | 'new' | null>(null)
  const [modalCategory, setModalCategory] = useState<Tables<'categories'> | 'new' | null>(null)

  const { data: categories = [], isLoading: catsLoading } = useCategories()
  const { data: products = [], isLoading: prodsLoading } = useProducts()
  const { deactivateProduct } = useProductMutations()

  const isLoading = catsLoading || prodsLoading

  const productCounts = useMemo(() =>
    categories.reduce<Record<string, number>>((acc, c) => {
      acc[c.id] = products.filter(p => p.category_id === c.id).length
      return acc
    }, {}),
    [categories, products],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    let list = activeCat ? products.filter(p => p.category_id === activeCat) : products
    if (q) list = list.filter(p => p.name.toLowerCase().includes(q) || (p.description ?? '').toLowerCase().includes(q))
    return list
  }, [products, activeCat, query])

  // ── Shimmer keyframe injected once ──
  if (typeof document !== 'undefined' && !document.getElementById('gv-shimmer')) {
    const s = document.createElement('style')
    s.id = 'gv-shimmer'
    s.textContent = `@keyframes gv-shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }`
    document.head.appendChild(s)
  }

  const modalProductData = modalProduct !== null && modalProduct !== 'new' ? modalProduct : null

  return (
    <div
      style={{
        height: '100%', overflow: 'auto',
        background: 'var(--surface-2)',
        fontFamily: 'inherit',
        color: 'var(--ink)',
      }}
    >
      {/* ── Page header ── */}
      <div style={{
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        padding: '20px 28px 0',
        position: 'sticky', top: 0, zIndex: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--action)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
              Administración
            </div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--ink)', letterSpacing: -0.5, margin: 0 }}>
              Productos
            </h1>
            <p style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 3, marginBottom: 0 }}>
              {isLoading ? 'Cargando...' : `${products.length} productos · ${categories.length} categorías`}
            </p>
          </div>

          <button
            onClick={() => setModalProduct('new')}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '10px 18px', border: 'none',
              background: 'var(--action)', borderRadius: 'var(--r-2)',
              cursor: 'pointer', fontSize: 13.5, fontWeight: 700, color: 'var(--surface)',
                  flexShrink: 0,
            }}
          >
            <Plus size={16} strokeWidth={2.5} /> Nuevo producto
          </button>
        </div>

        {/* Toolbar: tabs + search */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16 }}>
          <CategoryTabs
            categories={categories}
            activeId={activeCat}
            productCounts={productCounts}
            onSelect={(id) => { setActiveCat(id); setQuery('') }}
            onEdit={(cat) => setModalCategory(cat)}
            onNew={() => setModalCategory('new')}
          />

          {/* Search */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'var(--surface-2)', border: '1px solid var(--border)',
            borderRadius: 'var(--r-2)', padding: '8px 12px',
            marginBottom: 4, flexShrink: 0, width: 220,
          }}>
            <Search size={15} color="var(--ink-4)" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') setQuery('') }}
              placeholder="Buscar producto..."
              style={{
                flex: 1, border: 'none', outline: 'none',
                background: 'transparent', fontSize: 13,
                color: 'var(--ink)', fontFamily: 'inherit',
              }}
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-4)', padding: 0, display: 'grid', placeItems: 'center' }}
              >
                <X size={13} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Catálogo: FILAS, no tarjetas (§7.3) ── */}
      <div style={{ padding: '16px 28px 28px' }}>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-3)', overflow: 'hidden' }}>
          {/* El encabezado de columnas es lo que permite que el precio vaya sin
              símbolo de peso (§4 MoneyCell). Una tarjeta no lo tiene, y por eso
              la tarjeta necesitaba el "$". */}
          <div
            data-testid="catalogo-encabezado"
            style={{
              display: 'grid', gridTemplateColumns: '34px 1fr 130px 190px 110px 150px', gap: 12,
              padding: '9px 16px', background: 'var(--surface-2)',
              borderBottom: '1px solid var(--border)',
              fontSize: 11, fontWeight: 600, color: 'var(--ink-3)',
              textTransform: 'uppercase', letterSpacing: '.04em',
            }}
          >
            <span />
            <span>Producto</span>
            <span>Categoría</span>
            <span style={{ textAlign: 'right' }}>Existencia</span>
            <span style={{ textAlign: 'right' }}>Precio</span>
            <span />
          </div>

          {isLoading ? (
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="nodo-skeleton" style={{ width: `${80 - i * 7}%` }} />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState query={query} onNew={() => setModalProduct('new')} />
          ) : (
            filtered.map(product => (
              <ProductRow
                key={product.id}
                product={product}
                onEdit={() => setModalProduct(product)}
                onDeactivate={() => deactivateProduct.mutate(product.id)}
              />
            ))
          )}
        </div>
      </div>

      {/* ── Product modal ── */}
      {modalProduct !== null && (
        <ProductModal
          product={modalProductData}
          categories={categories}
          onClose={() => setModalProduct(null)}
        />
      )}

      {/* ── Category modal ── */}
      {modalCategory !== null && (
        <CategoryModal
          category={modalCategory === 'new' ? null : modalCategory}
          onClose={() => setModalCategory(null)}
        />
      )}
    </div>
  )
}
