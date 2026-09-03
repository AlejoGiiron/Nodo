import { useMemo, useState } from 'react'
import { Search, Plus, Check, UserRound } from 'lucide-react'
import { useCustomers, type Customer } from '@/hooks/useCustomers'
import { CustomerFormModal } from '@/components/fiado/CustomerFormModal'

interface CustomerPickerProps {
  value: string | null
  onChange: (customerId: string, customerName: string) => void
  /**
   * Prefijo de los `data-testid`.
   *
   * 🔴 Tercera vez la misma lección en este corte: con el cobro en línea las DOS
   * superficies pueden estar montadas a la vez —la columna y el modal encima—,
   * así que dos instancias con el mismo testid hacen que cada locator resuelva a
   * dos elementos. Es la clase «un locator apoyado en unicidad no declarada».
   * ⚠️ Los sufijos NO cambian: con el default, los testids quedan byte a byte
   * como estaban y ningún spec existente se toca.
   */
  prefijo?: string
}

const inputStyle: React.CSSProperties = {
  flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 14, color: 'var(--ink)',
}

/**
 * Selector de cliente con búsqueda y alta rápida inline. Componente controlado
 * (value = customerId). Reutilizado por el cobro del POS, el cierre de mesa y
 * (potencialmente) cualquier flujo que exija elegir cliente.
 */
export function CustomerPicker({ value, onChange, prefijo = 'customer' }: CustomerPickerProps) {
  const { customers } = useCustomers()
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return customers
    return customers.filter(
      (c) => c.name.toLowerCase().includes(q) || (c.phone ?? '').includes(q) || (c.document ?? '').includes(q),
    )
  }, [customers, search])

  return (
    <div data-testid={`${prefijo}-picker`}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1.5px solid var(--border)', borderRadius: 9, padding: '10px 12px', background: 'var(--surface)' }}>
        <Search size={15} color="var(--ink-4)" />
        <input
          data-testid={`${prefijo}-search`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar cliente por nombre, teléfono o documento"
          style={inputStyle}
        />
        <button
          data-testid={`${prefijo}-quick-create`}
          onClick={() => setCreating(true)}
          title="Crear cliente"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 10px', border: '1.5px dashed var(--success-border)', background: 'var(--action-soft)', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700, color: 'var(--action-on-soft)', flex: '0 0 auto' }}
        >
          <Plus size={13} /> Nuevo
        </button>
      </div>

      <div style={{ marginTop: 8, maxHeight: 180, overflowY: 'auto', border: '1px solid var(--border-2)', borderRadius: 9 }}>
        {filtered.length === 0 ? (
          <div style={{ padding: '20px 12px', textAlign: 'center', color: 'var(--ink-4)', fontSize: 12.5 }}>
            {customers.length === 0 ? 'Aún no hay clientes. Crea el primero.' : 'Sin coincidencias.'}
          </div>
        ) : (
          filtered.map((c, idx) => {
            const selected = c.id === value
            return (
              <button
                key={c.id}
                data-testid={`${prefijo}-option`}
                onClick={() => onChange(c.id, c.name)}
                style={{
                  width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 12px', border: 'none', cursor: 'pointer',
                  borderBottom: idx < filtered.length - 1 ? '1px solid var(--surface-2)' : 'none',
                  background: selected ? 'var(--action-soft)' : 'var(--surface)',
                }}
              >
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: selected ? 'var(--action)' : 'var(--border-2)', display: 'grid', placeItems: 'center', color: selected ? 'var(--surface)' : 'var(--ink-4)', flex: '0 0 auto' }}>
                  {selected ? <Check size={15} /> : <UserRound size={15} />}
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</div>
                  {(c.phone || c.document) && (
                    <div style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>
                      {[c.phone, c.document].filter(Boolean).join(' · ')}
                    </div>
                  )}
                </div>
              </button>
            )
          })
        )}
      </div>

      {creating && (
        <CustomerFormModal
          customer="new"
          onClose={() => setCreating(false)}
          onSaved={(c: Customer) => { onChange(c.id, c.name); setSearch('') }}
        />
      )}
    </div>
  )
}
