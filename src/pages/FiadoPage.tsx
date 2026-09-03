import { useMemo, useState } from 'react'
import { Plus, Pencil, Trash2, HandCoins, UserRound, Search, Phone } from 'lucide-react'
import { useCustomers, useCustomerMutations, type Customer } from '@/hooks/useCustomers'
import { useDebts, type Debt } from '@/hooks/useDebts'
import { CustomerFormModal } from '@/components/fiado/CustomerFormModal'
import { DebtPaymentModal } from '@/components/fiado/DebtPaymentModal'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { KpiCard } from '@/components/ui/KpiCard'
import { MoneyCell } from '@/components/ui/MoneyCell'
import { AgingBar, AgingBarLeyenda } from '@/components/ui/AgingBar'
import { diasVencidosMax } from '@/lib/cartera'
import { PageHeader } from '@/components/ui/PageHeader'
import { formatoCOP } from '@/lib/formato'

type Tab = 'debts' | 'customers'


const fmtDate = (iso: string) =>
  new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))

// Estado de pago del fiado. Los tonos son ROLES, no colores elegidos:
// `pending` pide una decisión del dueño (cobrar) -> warning; `partial` es
// información de flujo, no salud del dato -> action.
const STATUS_BADGE: Record<string, { label: string; tone: BadgeTone }> = {
  pending: { label: 'Pendiente', tone: 'warning' },
  partial: { label: 'Parcial', tone: 'action' },
}

const inputStyle: React.CSSProperties = {
  flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 13.5, color: 'var(--ink)',
}

// Iniciales para el avatar del cliente (1-2 letras).
const initials = (name: string): string => {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

// Un cliente con deuda: sus fiados abiertos agrupados y su saldo consolidado.
interface CustomerGroup {
  key: string            // customer_id, o `name:<nombre>` para walk-ins sin cliente
  customerName: string
  phone: string | null
  count: number          // nº de fiados con saldo>0
  saldoTotal: number     // Σ saldos del cliente
  fiados: Debt[]         // ASC por fecha: el más viejo (más tiempo debiendo) arriba
  /**
   * 🔴 Días vencidos del cliente = el MÁXIMO de sus ventas (deuda 46). Lo que
   * dispara la acción es la deuda más atrasada, no el promedio.
   * `null` = ninguna de sus ventas tiene plazo pactado: no se puede decir.
   */
  diasVencidos: number | null
}

// ─── Cartera (maestro-detalle por cliente) ───────────────────────
function DebtsTab({ onAbono }: { onAbono: (d: Debt) => void }) {
  const { debts, isLoading } = useDebts()
  const { customers } = useCustomers()
  const [search, setSearch] = useState('')
  const [selectedKey, setSelectedKey] = useState<string | null>(null)

  // Teléfono por cliente (para el buscador) — sin queries nuevas.
  const phoneById = useMemo(() => {
    const m = new Map<string, string | null>()
    for (const c of customers) m.set(c.id, c.phone ?? null)
    return m
  }, [customers])

  // Agrupación por cliente: SOLO presentación. El saldo ya viene derivado de useDebts.
  const groups = useMemo(() => {
    const map = new Map<string, CustomerGroup>()
    for (const d of debts) {
      if (d.saldo <= 0) continue
      const key = d.customerId ?? `name:${d.customerName}`
      const g = map.get(key) ?? {
        key,
        customerName: d.customerName,
        phone: d.customerId ? phoneById.get(d.customerId) ?? null : null,
        count: 0,
        saldoTotal: 0,
        fiados: [] as Debt[],
        diasVencidos: null as number | null,
      }
      g.count += 1
      g.saldoTotal += d.saldo
      g.fiados.push(d)
      map.set(key, g)
    }
    const arr = [...map.values()]
    for (const g of arr) {
      g.fiados.sort((a, b) => a.created_at.localeCompare(b.created_at))
      g.diasVencidos = diasVencidosMax(g.fiados)
    }
    // 🔴 ORDENA POR DÍAS VENCIDOS, no por saldo (deuda 46). El saldo dice cuánto
    //    se debe; los días vencidos dicen **a quién hay que llamar hoy**, que es
    //    lo que esta pantalla existe para contestar. El saldo queda de desempate
    //    entre dos clientes igual de atrasados.
    //    ⚠️ Los `null` —sin plazo pactado— van al final: no se puede afirmar que
    //    estén al día, así que tampoco pueden competir por el primer lugar.
    return arr.sort((a, b) => {
      const av = a.diasVencidos, bv = b.diasVencidos
      if (av == null && bv == null) return b.saldoTotal - a.saldoTotal
      if (av == null) return 1
      if (bv == null) return -1
      if (av !== bv) return bv - av
      return b.saldoTotal - a.saldoTotal
    })
  }, [debts, phoneById])

  // KPIs de la cartera completa (independientes del buscador).
  const totalPorCobrar = groups.reduce((s, g) => s + g.saldoTotal, 0)
  const clientesConDeuda = groups.length
  const fiadosAbiertos = groups.reduce((s, g) => s + g.count, 0)

  // Lista de la izquierda filtrada por nombre/teléfono.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return groups
    return groups.filter(
      (g) => g.customerName.toLowerCase().includes(q) || (g.phone ?? '').toLowerCase().includes(q),
    )
  }, [groups, search])

  // Detalle DERIVADO: si el cliente saldó su última deuda tras un abono, sale de
  // `groups` y `selected` queda null → el detalle se limpia solo (sin efecto).
  const selected = groups.find((g) => g.key === selectedKey) ?? null

  // 🔴 "Por cobrar" es DEUDA (--debt), no error (--danger): que un cliente deba
  //    no es que alguien haya hecho algo mal. Los otros dos son conteos: tono
  //    normal. Antes los tres compartían el mismo rojo var(--debt).
  const kpis = [
    { key: 'por-cobrar', label: 'Total por cobrar', value: formatoCOP(totalPorCobrar), tone: 'debt' as const },
    { key: 'clientes-deuda', label: 'Clientes con deuda', value: String(clientesConDeuda), tone: 'normal' as const },
    { key: 'fiados-abiertos', label: 'Fiados abiertos', value: String(fiadosAbiertos), tone: 'normal' as const },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* KPIs */}
      {/* KpiCard (§4) — unifica las tres copias que vivían sueltas. Los testids
          `kpi-<key>` y `kpi-<key>-value` salen de acá, que es donde estaban. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        {kpis.map((k) => (
          <KpiCard key={k.key} testid={k.key} etiqueta={k.label} valor={k.value} tono={k.tone} />
        ))}
      </div>

      {/* Maestro-detalle 35 / 65 */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        {/* IZQUIERDA — clientes con deuda */}
        <div style={{ flex: '0 0 35%', maxWidth: '35%', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1.5px solid var(--border)', borderRadius: 9, padding: '8px 12px', background: 'var(--surface)' }}>
            <Search size={15} color="var(--ink-4)" />
            <input data-testid="debt-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar cliente o teléfono" style={inputStyle} />
          </div>

          {/* Leyenda ARRIBA, no al pie (§4, corregido el 2026-09-02): una
              leyenda que explica un código de color va donde se ve el color.
              Al pie de nueve filas queda debajo del pliegue — cumple la letra y
              falla el propósito. Dice "Antigüedad", que es lo que la barra
              mide: no "Vencido", que exigiría un plazo que no existe. */}
          {/* 🔴 LOS DOS RÓTULOS, JUNTOS Y A PROPÓSITO (deuda 46). La fila muestra
              dos números distintos sobre el mismo cliente —cuánto hace que se
              vendió, y cuánto hace que se pasó el plazo— y los dos son
              verdaderos. Sin decir cuál es cuál, es exactamente cómo nació la
              deuda 53: dos cifras del mismo hecho sin definición. */}
          <div data-testid="debt-orden-por" style={{ fontSize: 11.5, color: 'var(--ink-3)', padding: '0 2px', lineHeight: 1.5 }}>
            Ordenado por <strong>días vencidos</strong> — primero a quien hay que
            cobrarle. La barra de color mide <strong>antigüedad desde la venta</strong>,
            que es otra cosa.
          </div>
          {filtered.length > 0 && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-3)', overflow: 'hidden' }}>
              <AgingBarLeyenda />
            </div>
          )}

          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-3)', overflow: 'hidden', opacity: isLoading ? 0.6 : 1 }}>
            {filtered.length === 0 ? (
              <div style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--ink-4)', fontSize: 13 }}>
                {isLoading ? 'Cargando...' : search.trim() ? 'Sin resultados' : 'No hay clientes con deuda'}
              </div>
            ) : filtered.map((g, idx) => {
              const active = g.key === selectedKey
              return (
                <button
                  key={g.key}
                  data-testid="customer-row"
                  onClick={() => setSelectedKey(g.key)}
                  // Fila SELECCIONADA (§4 DataRow): fondo --action-soft +
                  // `inset 3px 0 0 var(--action)`. Es una elección del usuario,
                  // no un estado del dato — mismo par que el NavItem activo.
                  style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', border: 'none', borderTop: idx > 0 ? '1px solid var(--border-2)' : 'none', boxShadow: active ? 'inset 3px 0 0 var(--action)' : 'none', background: active ? 'var(--action-soft)' : 'var(--surface)', cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: active ? 'var(--action)' : 'var(--border)', color: active ? '#fff' : 'var(--ink-2)', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 600, flexShrink: 0 }}>
                    {initials(g.customerName)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, color: active ? 'var(--action-on-soft)' : 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.customerName}</div>
                    {/* AgingBar (§4). MIDE ANTIGÜEDAD, no vencimiento: no hay
                        plazo de crédito en el esquema (deuda 46), así que la
                        columna VENCIDO de la maqueta no se pinta. */}
                    <div style={{ marginTop: 3 }}>
                      <AgingBar fechas={g.fiados.map((d) => d.created_at)} testid="customer-row-antiguedad" />
                    </div>
                    {/* Vencido: es el número por el que se ordena, así que se ve.
                        `—` cuando no hay plazo pactado: no se puede afirmar que
                        esté al día, y un 0 lo afirmaría. */}
                    <div data-testid="customer-row-vencido" style={{ marginTop: 2, fontSize: 11.5, color: (g.diasVencidos ?? 0) > 0 ? 'var(--debt-on-soft)' : 'var(--ink-4)' }}>
                      {g.diasVencidos == null
                        ? '— sin plazo pactado'
                        : g.diasVencidos > 0
                          ? `${g.diasVencidos} ${g.diasVencidos === 1 ? 'día' : 'días'} vencido`
                          : 'En plazo'}
                    </div>
                  </div>
                  <MoneyCell
                    data-testid="customer-row-saldo"
                    value={g.saldoTotal}
                    style={{ fontWeight: 600, fontSize: 14, color: 'var(--debt-on-soft)', flexShrink: 0 }}
                  />
                </button>
              )
            })}
          </div>
        </div>

        {/* DERECHA — detalle del cliente */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {!selected ? (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '56px 16px', textAlign: 'center', color: 'var(--ink-4)' }}>
              <UserRound size={30} style={{ margin: '0 auto 10px', display: 'block', opacity: 0.5 }} />
              <div style={{ fontSize: 13.5 }}>Selecciona un cliente para ver sus fiados</div>
            </div>
          ) : (
            <div data-testid="customer-detail" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
              {/* Cabecera del cliente */}
              <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border-2)', display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 46, height: 46, borderRadius: '50%', background: 'var(--action)', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 15, fontWeight: 700, flexShrink: 0 }}>
                  {initials(selected.customerName)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--ink)', letterSpacing: -0.3 }}>{selected.customerName}</div>
                  <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 1, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    <span>{selected.count} fiado{selected.count !== 1 ? 's' : ''} abierto{selected.count !== 1 ? 's' : ''}</span>
                    {selected.phone && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Phone size={11} /> {selected.phone}</span>}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Total adeudado</div>
                  <div data-testid="detail-total" style={{ fontSize: 20, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--debt)', marginTop: 1 }}>{formatoCOP(selected.saldoTotal)}</div>
                </div>
              </div>

              {/* Fiados individuales */}
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--surface-2)', textAlign: 'left', color: 'var(--ink-3)', fontSize: 11.5 }}>
                    <th style={{ padding: '10px 16px', fontWeight: 600 }}>Venta</th>
                    <th style={{ padding: '10px 16px', fontWeight: 600 }}>Fecha</th>
                    <th style={{ padding: '10px 16px', fontWeight: 600, textAlign: 'right' }}>Total</th>
                    <th style={{ padding: '10px 16px', fontWeight: 600, textAlign: 'right' }}>Pagado</th>
                    <th style={{ padding: '10px 16px', fontWeight: 600, textAlign: 'right' }}>Saldo</th>
                    <th style={{ padding: '10px 16px', fontWeight: 600 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {selected.fiados.map((d) => {
                    const badge = STATUS_BADGE[d.payment_status] ?? STATUS_BADGE.pending
                    return (
                      <tr key={d.id} data-testid="credit-row" style={{ borderTop: '1px solid var(--border-2)' }}>
                        <td style={{ padding: '11px 16px', fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: 'var(--ink)' }}>{d.order_number != null ? `#${d.order_number}` : '—'}</td>
                        <td style={{ padding: '11px 16px', color: 'var(--ink-3)', fontVariantNumeric: 'tabular-nums', fontSize: 12 }}>{fmtDate(d.created_at)}</td>
                        <td style={{ padding: '11px 16px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--ink)' }}>{formatoCOP(d.total)}</td>
                        <td style={{ padding: '11px 16px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--success-700)' }}>{formatoCOP(d.abonado)}</td>
                        <td data-testid="credit-row-saldo" style={{ padding: '11px 16px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: 'var(--debt)' }}>{formatoCOP(d.saldo)}</td>
                        <td style={{ padding: '11px 16px', textAlign: 'right' }}>
                          <span style={{ marginRight: 8 }}>
                            <Badge tone={badge.tone}>{badge.label}</Badge>
                          </span>
                          <Button size="sm" data-testid="abonar-btn" onClick={() => onAbono(d)}>
                            <HandCoins size={13} /> Abonar
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Clientes (CRM) ──────────────────────────────────────────────
function CustomersTab({ onEdit }: { onEdit: (c: Customer | 'new') => void }) {
  const { customers, isLoading } = useCustomers()
  const { deactivate } = useCustomerMutations()

  const handleDeactivate = async (c: Customer) => {
    if (!window.confirm(`¿Desactivar el cliente "${c.name}"?`)) return
    await deactivate(c.id)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {isLoading ? (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-3)', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[0, 1, 2].map(i => <div key={i} className="nodo-skeleton" style={{ width: `${70 - i * 12}%` }} />)}
        </div>
      ) : customers.length === 0 ? (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-3)', padding: '48px 16px', textAlign: 'center' }}>
          <UserRound size={28} color="var(--ink-4)" style={{ margin: '0 auto 10px', display: 'block' }} />
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)', marginBottom: 4 }}>Aún no hay clientes</div>
          <div style={{ fontSize: 13, color: 'var(--ink-3)', marginBottom: 14 }}>
            Vender a fiado necesita un cliente. Creá el primero.
          </div>
          <Button onClick={() => onEdit('new')}><Plus size={15} /> Nuevo cliente</Button>
        </div>
      ) : (
        <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', background: 'var(--surface)' }}>
          {customers.map((c, idx) => (
            <div key={c.id} data-testid="customer-row" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: idx < customers.length - 1 ? '1px solid var(--border-2)' : 'none' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{c.name}</div>
                <div style={{ display: 'flex', gap: 14, fontSize: 12, color: 'var(--ink-3)', marginTop: 2, flexWrap: 'wrap' }}>
                  {c.phone && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Phone size={11} /> {c.phone}</span>}
                  {c.document && <span>Doc. {c.document}</span>}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => onEdit(c)} title="Editar" style={{ width: 30, height: 30, border: '1px solid var(--border)', background: 'var(--surface)', borderRadius: 7, cursor: 'pointer', color: 'var(--ink-3)', display: 'grid', placeItems: 'center' }}><Pencil size={13} /></button>
                <button data-testid="customer-deactivate" onClick={() => handleDeactivate(c)} title="Desactivar" style={{ width: 30, height: 30, border: '1px solid var(--danger-soft)', background: 'var(--danger-soft)', borderRadius: 7, cursor: 'pointer', color: 'var(--debt)', display: 'grid', placeItems: 'center' }}><Trash2 size={13} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Page ────────────────────────────────────────────────────────
export function FiadoPage() {
  const [tab, setTab] = useState<Tab>('debts')
  const [editCustomer, setEditCustomer] = useState<Customer | 'new' | null>(null)
  const [abonoDebt, setAbonoDebt] = useState<Debt | null>(null)

  return (
    <div style={{ height: '100%', overflow: 'auto', background: 'var(--bg)', color: 'var(--ink)' }}>
      {/* Mismo patrón que Compras: sin eyebrow, título en --fs-head, tabs del
          §4. Ver el porqué en src/components/ui/PageHeader.tsx. */}
      <PageHeader
        titulo="Fiado"
        descripcion="cuentas por cobrar y clientes, por sede"
        accion={tab === 'customers'
          ? <Button data-testid="new-customer-btn" onClick={() => setEditCustomer('new')}><Plus size={15} /> Nuevo cliente</Button>
          : undefined}
        tabs={[
          { id: 'debts', label: 'Cartera', testid: 'fiado-tab-debts' },
          { id: 'customers', label: 'Clientes', testid: 'fiado-tab-customers' },
        ]}
        tabActivo={tab}
        onTab={(id) => setTab(id as Tab)}
      />

      <div style={{ padding: '20px 24px' }}>
        {tab === 'debts'
          ? <DebtsTab onAbono={setAbonoDebt} />
          : <CustomersTab onEdit={setEditCustomer} />}
      </div>

      {editCustomer && <CustomerFormModal customer={editCustomer} onClose={() => setEditCustomer(null)} />}
      {abonoDebt && <DebtPaymentModal debt={abonoDebt} onClose={() => setAbonoDebt(null)} />}
    </div>
  )
}
