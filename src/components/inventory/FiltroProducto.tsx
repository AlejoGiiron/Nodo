import { useState } from 'react'
import { Search, X } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { useBuscarProductos } from '@/hooks/useBuscarProductos'
import { mensajeDeError } from '@/lib/errores'

export interface ProductoFiltrado {
  id: string
  name: string
  /** null = no se sabe todavía (vino de un clic en una fila sin ese dato). */
  is_active: boolean | null
}

interface Props {
  value: ProductoFiltrado | null
  onChange: (producto: ProductoFiltrado | null) => void
}

/**
 * Filtro por producto de los movimientos de stock.
 *
 * Un buscador y no un desplegable: el desplegable se armaría con el catálogo
 * cargado, que se corta en 1000 filas y trae sólo activos (ver
 * `buscarProductos`). Con un producto elegido el campo se reemplaza por un chip
 * con su ✕, que es la forma de volver a «todos los productos» — el estado por
 * defecto.
 */
export function FiltroProducto({ value, onChange }: Props) {
  const [termino, setTermino] = useState('')
  const [abierto, setAbierto] = useState(false)
  const { data, isFetching, error } = useBuscarProductos(termino)

  if (value) {
    return (
      <div
        data-testid="mov-producto-chip"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 8, height: 32, padding: '0 6px 0 12px',
          borderRadius: 8, border: '1px solid var(--action)', background: 'var(--action-soft)',
          color: 'var(--action-on-soft)', fontSize: 12.5, fontWeight: 600, maxWidth: 320,
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value.name}</span>
        {value.is_active === false && <Badge tone="neutral">Archivado</Badge>}
        <button
          type="button"
          data-testid="mov-producto-quitar"
          aria-label="Quitar filtro de producto"
          onClick={() => onChange(null)}
          style={{ display: 'grid', placeItems: 'center', width: 22, height: 22, border: 'none', borderRadius: 4, background: 'transparent', color: 'var(--action-on-soft)', cursor: 'pointer' }}
        >
          <X size={13} />
        </button>
      </div>
    )
  }

  const hayTermino = termino.trim().length > 0
  const opciones = data ?? []

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 10px', width: 240 }}>
        <Search size={15} color="var(--ink-4)" />
        <input
          data-testid="mov-producto-buscar"
          value={termino}
          onChange={(e) => { setTermino(e.target.value); setAbierto(true) }}
          onFocus={() => setAbierto(true)}
          onBlur={() => setAbierto(false)}
          onKeyDown={(e) => { if (e.key === 'Escape') setAbierto(false) }}
          placeholder="Filtrar por producto o código..."
          style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 12.5, color: 'var(--ink)' }}
        />
      </div>

      {abierto && hayTermino && (
        <div
          data-testid="mov-producto-lista"
          style={{
            position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 20, width: 320, maxHeight: 280, overflowY: 'auto',
            background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8,
          }}
        >
          {error ? (
            <div style={{ padding: '10px 12px', fontSize: 12.5, color: 'var(--danger-on-soft)' }}>
              No se pudo buscar: {mensajeDeError(error, 'error desconocido')}
            </div>
          ) : opciones.length === 0 ? (
            <div style={{ padding: '10px 12px', fontSize: 12.5, color: 'var(--ink-3)' }}>
              {isFetching ? 'Buscando…' : 'Ningún producto coincide'}
            </div>
          ) : opciones.map((p) => (
            <button
              key={p.id}
              type="button"
              data-testid="mov-producto-opcion"
              // onMouseDown y no onClick: el blur del campo cierra la lista antes
              // de que el click llegue.
              onMouseDown={(e) => {
                e.preventDefault()
                onChange({ id: p.id, name: p.name, is_active: p.is_active })
                setTermino('')
                setAbierto(false)
              }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%', minHeight: 34, padding: '0 12px',
                border: 'none', borderBottom: '1px solid var(--border-2)', background: 'var(--surface)',
                textAlign: 'left', cursor: 'pointer', fontSize: 13, color: 'var(--ink)',
              }}
            >
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
              {p.codigo && <span style={{ fontSize: 12, color: 'var(--ink-3)', fontVariantNumeric: 'tabular-nums' }}>{p.codigo}</span>}
              {!p.is_active && <Badge tone="neutral">Archivado</Badge>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
