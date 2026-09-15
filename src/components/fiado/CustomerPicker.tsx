import { useMemo, useState } from 'react'
import { Search, Plus, Check, UserRound } from 'lucide-react'
import { useCustomers, type Customer } from '@/hooks/useCustomers'
import { esNivel, etiquetaDeNivel } from '@/lib/niveles'
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
  /**
   * La FORMA del picker.
   *
   * 🔴 VA POR PROP Y EL DEFAULT ES LO DE HOY, a propósito: este componente nace
   *    compartible —`prefijo` existe justamente por eso— y cambiar su forma para
   *    todos porque a UN consumidor no le entra es la clase que ya pagamos con
   *    los testids. Hoy el único que lo monta es el carrito, pero «hoy hay uno»
   *    no es una razón para sacarle la variante: es la razón por la que el
   *    cambio es barato AHORA.
   *
   * · `lista`    — buscador + lista siempre abierta. Diseñado para un MODAL,
   *                donde sobra alto. Mide ~241px.
   * · `compacto` — el buscador queda, la LISTA se despliega. Para una columna.
   *
   * ⚠️ EL BUSCADOR NO SE COLAPSA, y no es una decisión de estilo: **F4 enfoca
   *    `<prefijo>-search`**. Si el input desapareciera al colapsar, la tecla
   *    quedaría apuntando a un elemento que no existe — exactamente la tecla
   *    muerta que «Cobrar — F12» costó. Lo que se colapsa son los 180px de la
   *    lista, que es donde está el alto.
   */
  variante?: 'lista' | 'compacto'
}

const inputStyle: React.CSSProperties = {
  flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 14, color: 'var(--ink)',
}

/**
 * Selector de cliente con búsqueda y alta rápida inline. Componente controlado
 * (value = customerId). Reutilizado por el cobro del POS, el cierre de mesa y
 * (potencialmente) cualquier flujo que exija elegir cliente.
 */
export function CustomerPicker({
  value, onChange, prefijo = 'customer', variante = 'lista',
}: CustomerPickerProps) {
  const { customers } = useCustomers()
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const [abierto, setAbierto] = useState(false)

  const elegido = customers.find((c) => c.id === value) ?? null

  // 🔴 En `compacto` la lista aparece al enfocar o al teclear. Con texto escrito
  //    se queda abierta aunque se pierda el foco: cerrarla al desenfocar haría
  //    desaparecer los resultados justo cuando alguien va a hacer clic en uno.
  const listaVisible = variante === 'lista' || abierto || search.trim() !== ''

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return customers
    return customers.filter(
      (c) => c.name.toLowerCase().includes(q) || (c.phone ?? '').includes(q) || (c.document ?? '').includes(q),
    )
  }, [customers, search])

  return (
    <div data-testid={`${prefijo}-picker`}>
      {/* 🔴 EL RESUMEN DICE EL CLIENTE **Y SU LISTA**, no sólo el nombre.
          El `nivel_default` es lo que SIEMBRA cada línea del carrito: sin verlo,
          el cajero no tiene forma de saber por qué los precios salen como salen
          — y el chip de cada línea le dice «igual al del cliente» contra un
          cliente cuyo nivel no está en ninguna parte de la pantalla. */}
      {variante === 'compacto' && (
        <div
          data-testid={`${prefijo}-resumen`}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6,
            fontSize: 12.5, color: elegido ? 'var(--ink)' : 'var(--ink-4)',
          }}
        >
          <UserRound size={13} style={{ color: 'var(--ink-3)', flexShrink: 0 }} />
          {elegido ? (
            <>
              <span style={{ fontWeight: 600, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {elegido.name}
              </span>
              <span
                data-testid={`${prefijo}-resumen-nivel`}
                data-nivel={elegido.nivel_default ?? ''}
                style={{ color: 'var(--ink-3)', flexShrink: 0 }}
              >
                {/* ⚠️ «sin lista» y no «L1»: sin lista asignada se vende a L1 por
                    una regla de la sede que §8.19 declara SIN CONFIRMAR. Escribir
                    «L1» acá afirmaría que alguien la eligió. */}
                · {esNivel(elegido.nivel_default) ? etiquetaDeNivel(elegido.nivel_default) : 'sin lista'}
              </span>
            </>
          ) : (
            <span>Sin cliente · las líneas salen a la lista de la sede</span>
          )}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1.5px solid var(--border)', borderRadius: 9, padding: '10px 12px', background: 'var(--surface)' }}>
        <Search size={15} color="var(--ink-4)" />
        <input
          data-testid={`${prefijo}-search`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onFocus={() => setAbierto(true)}
          placeholder="Buscar cliente por nombre, teléfono o documento"
          style={inputStyle}
        />
        {/* 🔴 «Nuevo» NO VA EN LA FILA COLAPSADA, y el hallazgo que lo decide
            es contraintuitivo: de los 79px del picker compacto, **32 los manda
            este boton y sólo 21 el buscador**. El alto no lo pagaba el campo de
            texto — lo pagaba el control de al lado.
            Sacarlo del colapsado devuelve 38px EN TODAS las ventas y cuesta dos
            clics en el caso raro: crear un cliente a mitad de venta. */}
        {(variante === 'lista' || listaVisible) && (
        <button
          data-testid={`${prefijo}-quick-create`}
          onClick={() => setCreating(true)}
          title="Crear cliente"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 10px', border: '1.5px dashed var(--success-border)', background: 'var(--action-soft)', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700, color: 'var(--action-on-soft)', flex: '0 0 auto' }}
        >
          <Plus size={13} /> Nuevo
        </button>
        )}
      </div>

      {listaVisible && (
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
                // 🔴 El «elegido» vivía SÓLO en el color de fondo y en el ícono,
                //    o sea en un lugar donde ningún verificador mira. Es la misma
                //    forma que el botón que imprimía «F12» con la tecla muerta:
                //    verdadero para el ojo, invisible para todo lo demás.
                //    `aria-pressed` lo hace aseverable Y lo anuncia el lector de
                //    pantalla — es el mismo par que usa TenderSelector.
                aria-pressed={selected}
                onClick={() => { onChange(c.id, c.name); setSearch(''); setAbierto(false) }}
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
      )}

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
