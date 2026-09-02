import { useState, useMemo } from 'react'
import {
  format, startOfMonth, endOfMonth, startOfWeek,
  subMonths, subDays, parseISO, differenceInDays,
} from 'date-fns'
import { es } from 'date-fns/locale'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line,
  PieChart, Pie, Cell,
} from 'recharts'
import { Download, Wallet, Boxes } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { useReports } from '@/hooks/useReports'
import { KpiCard } from '@/components/ui/KpiCard'
import { buildFinancieroWorkbook, buildStockWorkbook } from '@/lib/exportes'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const COP = (n: number) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP', maximumFractionDigits: 0,
  }).format(n)

function pctChange(current: number, prev: number): number | null {
  if (prev === 0) return null
  return ((current - prev) / prev) * 100
}

// ─── Colores de serie de gráfico ──────────────────────────────────────────────
//
// ⚠️ `#3b82f6` y `#8b5cf6` SE QUEDAN COMO HEXES, y es la misma decisión que los
//    dos on-dark del arqueo: LA SKILL NO DEFINE UNA PALETA DE GRÁFICOS y §8 dice
//    que lo que no está no se infiere.
//
// 🔴 Y ojo: NO es el caso de "una categoría no se pinta con la paleta de los
//    estados" (§1.2). Esa regla tiene un corolario —distinguir con ícono,
//    etiqueta o posición— y en una serie de gráfico **ninguna de las tres
//    existe**: el color ES el mecanismo de distinción, por eso hay leyenda.
//    Así que acá el color no afirma un estado; identifica una serie. Lo que
//    falta no es quitarlo: es que la skill diga CUÁLES.
//
// Precedente para cuando se pida: la escala `--d1…--d4` de AgingBar ya
// distingue cuatro cosas con una rampa DENTRO de un rol, sin tomar prestadas
// familias ajenas. Una rampa de `--action-900/800/700/500` haría lo mismo para
// series — pero es una decisión de diseño, no una inferencia.
const CH_COLOR: Record<string, string> = {
  mostrador: 'var(--warning-700)', whatsapp: 'var(--action)', telefono: '#3b82f6',
}
const CH_LABEL: Record<string, string> = {
  mostrador: 'Mostrador', whatsapp: 'WhatsApp', telefono: 'Teléfono',
}
const PAY_COLORS = ['var(--action)', '#3b82f6', '#8b5cf6', 'var(--warning-700)']

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton({ h }: { h: number }) {
  return <div className="animate-pulse bg-slate-100 rounded-xl" style={{ height: h }} />
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────


// ─── Chart card wrapper ───────────────────────────────────────────────────────

function ChartCard({
  title, subtitle, children, isLoading, skeletonH = 240,
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
  isLoading: boolean
  skeletonH?: number
}) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '20px 20px 14px' }}>
      <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', marginBottom: 2 }}>{title}</p>
      {subtitle && <p style={{ fontSize: 11.5, color: 'var(--ink-4)', marginBottom: 14 }}>{subtitle}</p>}
      {isLoading ? <Skeleton h={skeletonH} /> : children}
    </div>
  )
}

// ─── ReportsPage ──────────────────────────────────────────────────────────────

const SHORTCUTS = [
  { key: 'hoy',          label: 'Hoy' },
  { key: 'semana',       label: 'Esta semana' },
  { key: 'mes',          label: 'Este mes' },
  { key: 'mes_anterior', label: 'Mes anterior' },
] as const

export function ReportsPage() {
  const [from, setFrom] = useState(() => format(startOfMonth(new Date()), 'yyyy-MM-dd'))
  const [to,   setTo]   = useState(() => format(new Date(), 'yyyy-MM-dd'))
  const [activeShortcut, setActiveShortcut] = useState<string>('mes')
  const [isExporting, setIsExporting] = useState(false)
  const [activeTab, setActiveTab] = useState<'financiero' | 'stock'>('financiero')

  // ─── Previous period (same length, ending day before `from`) ──────────────
  const periodLen = useMemo(
    () => differenceInDays(parseISO(to), parseISO(from)) + 1,
    [from, to],
  )
  const prevTo   = useMemo(() => format(subDays(parseISO(from), 1),         'yyyy-MM-dd'), [from])
  const prevFrom = useMemo(() => format(subDays(parseISO(from), periodLen), 'yyyy-MM-dd'), [from, periodLen])

  // ─── Data ─────────────────────────────────────────────────────────────────
  const { dailySales, productPerformance, hourlySales, isLoading } = useReports({ from, to })
  const { dailySales: prevDailySales } = useReports({ from: prevFrom, to: prevTo })

  // ─── KPI aggregates ───────────────────────────────────────────────────────
  // ✅ DEUDA 53 CERRADA (2026-09-02). Antes, esta pantalla tenía DOS
  //    definiciones de "ventas" y ninguna lo decía: el tab Financiero sumaba
  //    `total_revenue` —que era `sum(payments.amount)`, o sea COBRADO— y contaba
  //    órdenes que exigían pago; el tab Stock y el Top 10 sumaban
  //    `qty × precio`, que es VENTA BRUTA. Tres números ciertos y distintos,
  //    los tres llamados igual.
  //
  //    Medido en el lab, mismo período: vendido 9.647.600 · cobrado 6.100.600 ·
  //    venta bruta 9.838.000. Órdenes: 691 reales, 431 con pago.
  //
  //    Ahora la vista expone `sold_total` y `collected_total` por separado y la
  //    pantalla muestra LAS DOS, porque en un negocio con cartera son dos
  //    preguntas que se miran a diario y no se deducen una de la otra.
  const vendido    = useMemo(() => dailySales.reduce((s, r) => s + (r.sold_total      ?? 0), 0), [dailySales])
  const cobrado    = useMemo(() => dailySales.reduce((s, r) => s + (r.collected_total ?? 0), 0), [dailySales])
  const totalOrd   = useMemo(() => dailySales.reduce((s, r) => s + (r.order_count     ?? 0), 0), [dailySales])
  // El ticket sale de la MISMA población en numerador y denominador: vendido
  // sobre TODAS las órdenes no anuladas. Antes era cobrado sobre órdenes-con-
  // pago en la vista y cobrado sobre órdenes en la pantalla — un cociente entre
  // poblaciones distintas no es el ticket de nada, y un número que no significa
  // nada es peor que ausente, porque el ausente se nota.
  const avgTicket  = useMemo(() => totalOrd > 0 ? vendido / totalOrd : 0, [vendido, totalOrd])
  const prevVend   = useMemo(() => prevDailySales.reduce((s, r) => s + (r.sold_total      ?? 0), 0), [prevDailySales])
  const prevCobr   = useMemo(() => prevDailySales.reduce((s, r) => s + (r.collected_total ?? 0), 0), [prevDailySales])
  const prevOrd    = useMemo(() => prevDailySales.reduce((s, r) => s + (r.order_count     ?? 0), 0), [prevDailySales])
  const prevTicket = useMemo(() => prevOrd > 0 ? prevVend / prevOrd : 0, [prevVend, prevOrd])

  // ─── Bar chart: pivot daily sales by day × channel ────────────────────────
  const barData = useMemo(() => {
    const map: Record<string, { day: string; mostrador: number; whatsapp: number; telefono: number }> = {}
    for (const r of dailySales) {
      if (r.day == null || r.canal == null) continue
      if (!map[r.day]) map[r.day] = { day: r.day, mostrador: 0, whatsapp: 0, telefono: 0 }
      const key = r.canal as 'mostrador' | 'whatsapp' | 'telefono'
      map[r.day][key] += r.sold_total ?? 0
    }
    return Object.values(map).sort((a, b) => a.day.localeCompare(b.day))
  }, [dailySales])

  // ─── Line chart: hourly totals aggregated across all days ─────────────────
  const hourlyData = useMemo(() => {
    const map: Record<number, number> = {}
    for (const r of hourlySales) {
      if (r.hour == null) continue
      map[r.hour] = (map[r.hour] ?? 0) + (r.total_revenue ?? 0)
    }
    return Array.from({ length: 24 }, (_, h) => ({
      label: `${h.toString().padStart(2, '0')}h`,
      ventas: map[h] ?? 0,
    }))
  }, [hourlySales])

  // ─── Pie: payment method totals ───────────────────────────────────────────
  const payData = useMemo(() => [
    { name: 'Efectivo',      value: dailySales.reduce((s, r) => s + (r.cash_total     ?? 0), 0), color: PAY_COLORS[0] },
    { name: 'Tarjeta',       value: dailySales.reduce((s, r) => s + (r.card_total     ?? 0), 0), color: PAY_COLORS[1] },
    { name: 'Transferencia', value: dailySales.reduce((s, r) => s + (r.transfer_total ?? 0), 0), color: PAY_COLORS[2] },
    { name: 'Nequi',         value: dailySales.reduce((s, r) => s + (r.nequi_total    ?? 0), 0), color: PAY_COLORS[3] },
  ].filter(d => d.value > 0), [dailySales])

  // ─── Products: aggregate by product_id ───────────────────────────────────
  const allProducts = useMemo(() => {
    const map: Record<string, {
      product_id: string; product_name: string; category_name: string
      total_qty: number; total_revenue: number
    }> = {}
    for (const r of productPerformance) {
      if (r.product_id == null) continue
      if (!map[r.product_id]) {
        map[r.product_id] = {
          product_id: r.product_id, product_name: r.product_name ?? '—',
          category_name: r.category_name ?? '—', total_qty: 0, total_revenue: 0,
        }
      }
      map[r.product_id].total_qty     += r.total_qty     ?? 0
      map[r.product_id].total_revenue += r.total_revenue ?? 0
    }
    return Object.values(map).sort((a, b) => b.total_revenue - a.total_revenue)
  }, [productPerformance])

  const top10 = useMemo(() => {
    const total = allProducts.reduce((s, p) => s + p.total_revenue, 0)   // venta bruta
    return allProducts.slice(0, 10).map(p => ({
      ...p,
      sharePct: total > 0 ? (p.total_revenue / total) * 100 : 0,
    }))
  }, [allProducts])

  const totalUnits = useMemo(() => allProducts.reduce((s, p) => s + p.total_qty, 0), [allProducts])
  const isEmpty    = !isLoading && totalOrd === 0

  // ─── Stock: ranking de categorías (unidades + revenue) ────────────────────
  const categoryRanking = useMemo(() => {
    const map: Record<string, { category: string; total_qty: number; total_revenue: number }> = {}
    for (const p of allProducts) {
      const cat = p.category_name || '—'
      if (!map[cat]) map[cat] = { category: cat, total_qty: 0, total_revenue: 0 }
      map[cat].total_qty     += p.total_qty
      map[cat].total_revenue += p.total_revenue
    }
    return Object.values(map).sort((a, b) => b.total_revenue - a.total_revenue)
  }, [allProducts])
  // Vacío de stock: no se vendieron productos en el período.
  const isStockEmpty = !isLoading && allProducts.length === 0

  // ─── Shortcut handlers ────────────────────────────────────────────────────
  function applyShortcut(key: string) {
    const now = new Date()
    setActiveShortcut(key)
    switch (key) {
      case 'hoy': {
        const d = format(now, 'yyyy-MM-dd')
        setFrom(d); setTo(d)
        break
      }
      case 'semana':
        setFrom(format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd'))
        setTo(format(now, 'yyyy-MM-dd'))
        break
      case 'mes':
        setFrom(format(startOfMonth(now), 'yyyy-MM-dd'))
        setTo(format(now, 'yyyy-MM-dd'))
        break
      case 'mes_anterior': {
        const prev = subMonths(now, 1)
        setFrom(format(startOfMonth(prev), 'yyyy-MM-dd'))
        setTo(format(endOfMonth(prev),     'yyyy-MM-dd'))
        break
      }
    }
  }

  // ─── Excel export ─────────────────────────────────────────────────────────
  async function downloadWorkbook(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    wb: any,
    suffix: string,
  ) {
    const buf  = await wb.xlsx.writeBuffer()
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url
    a.download = `nodo_${suffix}_${format(new Date(), 'yyyy-MM-dd')}.xlsx`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  async function handleExportFinanciero() {
    setIsExporting(true)
    try {
      const { default: ExcelJS } = await import('exceljs')
      const wb = new ExcelJS.Workbook()
      wb.creator = 'Nodo'

      // 🔴 El contenido lo arma `src/lib/exportes.ts`, no esta pantalla: lo que
      //    sale del producto en un archivo tiene que ser aseverable por un test
      //    (ver CLAUDE.md). Acá quedó solo la entrega.
      buildFinancieroWorkbook(wb, {
        periodo: { from, to },
        totales: {
          vendido, cobrado, ordenes: totalOrd, ticketPromedio: avgTicket,
          efectivo:      dailySales.reduce((s, r) => s + (r.cash_total     ?? 0), 0),
          tarjeta:       dailySales.reduce((s, r) => s + (r.card_total     ?? 0), 0),
          transferencia: dailySales.reduce((s, r) => s + (r.transfer_total ?? 0), 0),
          nequi:         dailySales.reduce((s, r) => s + (r.nequi_total    ?? 0), 0),
        },
        filas: dailySales,
      })

      await downloadWorkbook(wb, 'financiero')
    } catch {
      toast.error('Error al exportar el reporte')
    } finally {
      setIsExporting(false)
    }
  }

  async function handleExportStock() {
    setIsExporting(true)
    try {
      const { default: ExcelJS } = await import('exceljs')
      const wb = new ExcelJS.Workbook()
      wb.creator = 'Nodo'

      buildStockWorkbook(wb, {
        periodo: { from, to },
        productos: allProducts.map((p) => ({
          product_name: p.product_name, category_name: p.category_name,
          total_qty: p.total_qty, total_revenue: p.total_revenue,
        })),
        categorias: categoryRanking,
      })

      await downloadWorkbook(wb, 'stock')
    } catch {
      toast.error('Error al exportar el reporte')
    } finally {
      setIsExporting(false)
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  const exportDisabled = isExporting || isLoading || isEmpty
  const exportStockDisabled = isExporting || isLoading || isStockEmpty

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ── Barra de controles ── */}
      <div style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', padding: '12px 24px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>

          {/* Título + atajos */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <div>
              <h1 style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>Reportes</h1>
              <p style={{ fontSize: 11, color: 'var(--ink-4)', marginTop: 1 }}>
                {format(parseISO(from), "d MMM yyyy", { locale: es })}
                {' — '}
                {format(parseISO(to),   "d MMM yyyy", { locale: es })}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {SHORTCUTS.map(s => (
                <button
                  key={s.key}
                  onClick={() => applyShortcut(s.key)}
                  style={{
                    fontSize: 12, fontWeight: 600, padding: '5px 10px',
                    borderRadius: 7, border: 'none', cursor: 'pointer',
                    background: activeShortcut === s.key ? 'var(--action)' : 'var(--border-2)',
                    color:      activeShortcut === s.key ? '#fff'     : 'var(--ink-2)',
                    transition: 'all .15s',
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Date pickers + Exportar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="date" value={from} max={to}
              onChange={e => { setFrom(e.target.value); setActiveShortcut('') }}
              style={{ fontSize: 13, padding: '6px 10px', border: '1.5px solid var(--border)', borderRadius: 8, color: 'var(--ink)', outline: 'none' }}
            />
            <span style={{ color: 'var(--ink-4)', fontSize: 13 }}>—</span>
            <input
              type="date" value={to} min={from}
              onChange={e => { setTo(e.target.value); setActiveShortcut('') }}
              style={{ fontSize: 13, padding: '6px 10px', border: '1.5px solid var(--border)', borderRadius: 8, color: 'var(--ink)', outline: 'none' }}
            />
          </div>
        </div>

        {/* Tabs Financiero / Stock (selector de fechas compartido arriba) */}
        <div style={{ display: 'flex', gap: 4, marginTop: 12 }}>
          {([
            { id: 'financiero' as const, label: 'Financiero', icon: <Wallet size={14} /> },
            { id: 'stock'      as const, label: 'Stock',      icon: <Boxes size={14} /> },
          ]).map(t => {
            const active = activeTab === t.id
            return (
              <button
                key={t.id}
                data-testid={`report-tab-${t.id}`}
                onClick={() => setActiveTab(t.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  fontSize: 13, fontWeight: 600, padding: '8px 16px',
                  border: 'none', cursor: 'pointer',
                  borderBottom: active ? '2px solid var(--action)' : '2px solid transparent',
                  background: 'transparent',
                  color: active ? 'var(--ink)' : 'var(--ink-3)',
                  transition: 'all .12s',
                }}
              >
                {t.icon} {t.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Contenido scrollable ── */}
      <div style={{ flex: 1, overflowY: 'auto', background: 'var(--surface-2)' }}>
        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>

          {activeTab === 'financiero' && (
          <>
          {/* Export financiero */}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              data-testid="export-financiero"
              onClick={handleExportFinanciero}
              disabled={exportDisabled}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                fontSize: 13, fontWeight: 600, padding: '7px 14px',
                borderRadius: 9, border: 'none',
                cursor:     exportDisabled ? 'not-allowed' : 'pointer',
                background: exportDisabled ? 'var(--ink-4)'     : 'var(--action)',
                color: 'var(--surface)',
                boxShadow: exportDisabled ? 'none' : '0 4px 12px rgba(16,185,129,.35)',
              }}
            >
              <Download size={14} />
              {isExporting ? 'Exportando…' : 'Exportar Excel'}
            </button>
          </div>

          {/* KPIs financieros */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
            {/* Tercera y ultima copia de KpiCard, unificada. La primitiva gano
                el indicador de cambio, que era lo unico que esta version tenia
                de mas — extenderla es unificar; borrarlo habria sido perder. */}
            {/* 🔴 CUATRO tarjetas, y cada una dice QUÉ mide (deuda 53). "Ventas"
                a secas era el rótulo que escondía tres números distintos. La
                nota de cada una no es decoración: es la definición, en el único
                lugar donde el que mira el número la va a leer. */}
            {isLoading ? <Skeleton h={110} /> : (
              <KpiCard
                testid="vendido"
                etiqueta="Vendido"
                valor={COP(vendido)}
                nota="facturado, con descuento"
                cambio={pctChange(vendido, prevVend)}
              />
            )}
            {isLoading ? <Skeleton h={110} /> : (
              <KpiCard
                testid="cobrado"
                etiqueta="Cobrado"
                valor={COP(cobrado)}
                nota="pagos recibidos"
                cambio={pctChange(cobrado, prevCobr)}
              />
            )}
            {isLoading ? <Skeleton h={110} /> : (
              <KpiCard
                testid="ordenes"
                etiqueta="Órdenes"
                valor={totalOrd.toLocaleString('es-CO')}
                nota="ventas no anuladas"
                cambio={pctChange(totalOrd, prevOrd)}
              />
            )}
            {isLoading ? <Skeleton h={110} /> : (
              <KpiCard
                testid="ticket"
                etiqueta="Ticket promedio"
                valor={COP(avgTicket)}
                nota="vendido / órdenes"
                cambio={pctChange(avgTicket, prevTicket)}
              />
            )}
          </div>

          {/* Estado vacío */}
          {isEmpty && (
            <div style={{
              background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14,
              padding: '52px 24px', textAlign: 'center',
            }}>
              <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>Sin ventas en el período</p>
              <p style={{ fontSize: 13.5, color: 'var(--ink-3)', marginTop: 6 }}>
                Ajusta el rango de fechas para ver datos de otro período.
              </p>
            </div>
          )}

          {!isEmpty && (
            <>
              {/* Fila 1: Barras diarias + Línea horaria */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

                <ChartCard
                  title="Vendido por día y canal"
                  subtitle="Mostrador · WhatsApp · Teléfono"
                  isLoading={isLoading}
                >
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={barData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border-2)" vertical={false} />
                      <XAxis
                        dataKey="day"
                        tick={{ fontSize: 10, fill: 'var(--ink-4)' }}
                        tickFormatter={(v: string) => v.slice(5)}
                        interval="preserveStartEnd"
                        axisLine={false} tickLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: 'var(--ink-4)' }}
                        tickFormatter={(v: number) => `${Math.round(v / 1000)}k`}
                        width={40} axisLine={false} tickLine={false}
                      />
                      <Tooltip
                        formatter={(v: unknown, name: unknown) =>
                          [COP(Number(v)), CH_LABEL[String(name)] ?? String(name)]
                        }
                        labelFormatter={(l: unknown) => `Fecha: ${String(l)}`}
                        contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid var(--border)', boxShadow: '0 4px 12px rgba(0,0,0,.06)' }}
                      />
                      <Legend
                        formatter={(v: string) => CH_LABEL[v] ?? v}
                        iconSize={8}
                        wrapperStyle={{ fontSize: 11.5, paddingTop: 8 }}
                      />
                      <Bar dataKey="mostrador" stackId="a" fill={CH_COLOR.mostrador} radius={[0, 0, 0, 0]} />
                      <Bar dataKey="whatsapp"  stackId="a" fill={CH_COLOR.whatsapp}  radius={[0, 0, 0, 0]} />
                      <Bar dataKey="telefono" stackId="a" fill={CH_COLOR.telefono} radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>

                <ChartCard
                  title="Cobrado por hora del día"
                  subtitle="Acumulado del período · sale de los pagos, no de lo facturado"
                  isLoading={isLoading}
                >
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={hourlyData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border-2)" vertical={false} />
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 10, fill: 'var(--ink-4)' }}
                        interval={3}
                        axisLine={false} tickLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: 'var(--ink-4)' }}
                        tickFormatter={(v: number) => `${Math.round(v / 1000)}k`}
                        width={40} axisLine={false} tickLine={false}
                      />
                      <Tooltip
                        formatter={(v: unknown) => [COP(Number(v)), 'Cobrado']}
                        contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid var(--border)', boxShadow: '0 4px 12px rgba(0,0,0,.06)' }}
                      />
                      <Line
                        type="monotone" dataKey="ventas"
                        stroke="var(--action)" strokeWidth={2.5}
                        dot={false}
                        activeDot={{ r: 4, fill: 'var(--action)', strokeWidth: 0 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </ChartCard>
              </div>

              {/* Fila 2: Pie métodos de pago + Tabla top 10 */}
              <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 16 }}>

                {/* Métodos de pago */}
                <ChartCard
                  title="Métodos de pago"
                  subtitle="Distribución de lo COBRADO en el período"
                  isLoading={isLoading}
                  skeletonH={280}
                >
                  {payData.length === 0 ? (
                    <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-4)', fontSize: 13 }}>
                      Sin datos
                    </div>
                  ) : (
                    <>
                      <ResponsiveContainer width="100%" height={160}>
                        <PieChart>
                          <Pie
                            data={payData} dataKey="value"
                            cx="50%" cy="50%"
                            outerRadius={68} innerRadius={34}
                          >
                            {payData.map((d, i) => <Cell key={i} fill={d.color} />)}
                          </Pie>
                          <Tooltip
                            formatter={(v: unknown, name: unknown) => [COP(Number(v)), String(name)]}
                            contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid var(--border)' }}
                          />
                        </PieChart>
                      </ResponsiveContainer>

                      {/* Leyenda manual */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 10 }}>
                        {payData.map(d => {
                          // Sobre COBRADO, que es lo que un método de pago puede medir.
                          const share = cobrado > 0 ? (d.value / cobrado) * 100 : 0
                          return (
                            <div key={d.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                                <div style={{ width: 8, height: 8, borderRadius: '50%', background: d.color, flexShrink: 0 }} />
                                <span style={{ color: 'var(--ink-2)', fontWeight: 500 }}>{d.name}</span>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ color: 'var(--ink-4)', fontSize: 11 }}>{share.toFixed(1)}%</span>
                                <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: 'var(--ink)' }}>{COP(d.value)}</span>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </>
                  )}
                </ChartCard>

                {/* Top 10 productos */}
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 20 }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', marginBottom: 2 }}>Top 10 productos</p>
                  <p style={{ fontSize: 11.5, color: 'var(--ink-4)', marginBottom: 16 }}>
                    Por venta bruta — cantidad × precio, sin descuentos: sirve para comparar
                    productos, no para totalizar el período
                  </p>

                  {isLoading ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} h={36} />)}
                    </div>
                  ) : top10.length === 0 ? (
                    <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-4)', fontSize: 13 }}>
                      Sin productos vendidos
                    </div>
                  ) : (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                        <thead>
                          <tr style={{ borderBottom: '2px solid var(--border-2)' }}>
                            {['#', 'Producto', 'Categoría', 'Unidades', 'Venta bruta', '% del bruto'].map((h, i) => (
                              <th key={h} style={{
                                padding: '7px 10px', fontSize: 11.5, fontWeight: 600, color: 'var(--ink-3)',
                                textAlign: i >= 3 ? 'right' : 'left', whiteSpace: 'nowrap',
                              }}>
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {top10.map((p, i) => (
                            <tr key={p.product_id} style={{ borderBottom: '1px solid var(--surface-2)' }}>
                              <td style={{ padding: '10px 10px', color: 'var(--ink-4)', fontWeight: 700, fontSize: 11 }}>{i + 1}</td>
                              <td style={{ padding: '10px 10px', color: 'var(--ink)', fontWeight: 600, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {p.product_name}
                              </td>
                              <td style={{ padding: '10px 10px', color: 'var(--ink-3)' }}>{p.category_name}</td>
                              <td style={{ padding: '10px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--ink-2)' }}>
                                {p.total_qty.toLocaleString('es-CO')}
                              </td>
                              <td style={{ padding: '10px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: 'var(--ink)' }}>
                                {COP(p.total_revenue)}
                              </td>
                              <td style={{ padding: '10px 0 10px 10px', textAlign: 'right' }}>
                                <span style={{ background: 'var(--action-soft)', color: 'var(--success-on-soft)', borderRadius: 5, padding: '2px 7px', fontSize: 11, fontWeight: 600 }}>
                                  {p.sharePct.toFixed(1)}%
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
          </>
          )}

          {activeTab === 'stock' && (
          <>
          {/* Export stock */}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              data-testid="export-stock"
              onClick={handleExportStock}
              disabled={exportStockDisabled}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                fontSize: 13, fontWeight: 600, padding: '7px 14px',
                borderRadius: 9, border: 'none',
                cursor:     exportStockDisabled ? 'not-allowed' : 'pointer',
                background: exportStockDisabled ? 'var(--ink-4)'     : 'var(--action)',
                color: 'var(--surface)',
                boxShadow: exportStockDisabled ? 'none' : '0 4px 12px rgba(16,185,129,.35)',
              }}
            >
              <Download size={14} />
              {isExporting ? 'Exportando…' : 'Exportar Excel'}
            </button>
          </div>

          {/* KPIs de stock */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
            {/* Estos tres NO comparan período: `cambio` va sin pasar (undefined),
                que es distinto de `null` — null dice "no hay comparable", sin
                pasar dice "esta tarjeta no compara". Antes los tres mandaban
                change={null} y pintaban "— sin datos anteriores", que afirma
                que la comparación existe y falló. No existe. */}
            {isLoading ? <Skeleton h={110} /> : <KpiCard etiqueta="Unidades vendidas" valor={totalUnits.toLocaleString('es-CO')} />}
            {isLoading ? <Skeleton h={110} /> : <KpiCard etiqueta="Productos vendidos" valor={allProducts.length.toLocaleString('es-CO')} />}
            {isLoading ? <Skeleton h={110} /> : <KpiCard etiqueta="Categorías" valor={categoryRanking.length.toLocaleString('es-CO')} />}
          </div>

          {isStockEmpty ? (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '52px 24px', textAlign: 'center' }}>
              <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>Sin productos vendidos en el período</p>
              <p style={{ fontSize: 13.5, color: 'var(--ink-3)', marginTop: 6 }}>Ajusta el rango de fechas para ver el consumo de productos.</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 16 }}>
              {/* Productos más vendidos */}
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 20 }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', marginBottom: 2 }}>Productos más vendidos</p>
                <p style={{ fontSize: 11.5, color: 'var(--ink-4)', marginBottom: 16 }}>Unidades y venta bruta del período</p>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid var(--border-2)' }}>
                        {['#', 'Producto', 'Categoría', 'Unidades', 'Venta bruta'].map((h, i) => (
                          <th key={h} style={{ padding: '7px 10px', fontSize: 11.5, fontWeight: 600, color: 'var(--ink-3)', textAlign: i >= 3 ? 'right' : 'left', whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {allProducts.slice(0, 15).map((p, i) => (
                        <tr key={p.product_id} style={{ borderBottom: '1px solid var(--surface-2)' }}>
                          <td style={{ padding: '10px', color: 'var(--ink-4)', fontWeight: 700, fontSize: 11 }}>{i + 1}</td>
                          <td style={{ padding: '10px', color: 'var(--ink)', fontWeight: 600, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.product_name}</td>
                          <td style={{ padding: '10px', color: 'var(--ink-3)' }}>{p.category_name}</td>
                          <td style={{ padding: '10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: 'var(--ink)' }}>{p.total_qty.toLocaleString('es-CO')}</td>
                          <td style={{ padding: '10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--ink-2)' }}>{COP(p.total_revenue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Ranking de categorías */}
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 20 }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', marginBottom: 2 }}>Ranking de categorías</p>
                <p style={{ fontSize: 11.5, color: 'var(--ink-4)', marginBottom: 16 }}>Por venta bruta del período</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {categoryRanking.map((c, i) => {
                    const max = categoryRanking[0]?.total_revenue || 1
                    const pct = (c.total_revenue / max) * 100
                    return (
                      <div key={c.category}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 4 }}>
                          <span style={{ color: 'var(--ink-2)', fontWeight: 600 }}>{c.category}</span>
                          <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: 'var(--ink)' }}>{COP(c.total_revenue)}</span>
                        </div>
                        <div style={{ height: 6, background: 'var(--border-2)', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ width: `${pct}%`, height: '100%', background: PAY_COLORS[i % PAY_COLORS.length] }} />
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--ink-4)', marginTop: 3 }}>{c.total_qty.toLocaleString('es-CO')} unidades</div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Stock/consumo: preparado para cuando los productos registren inventario */}
          <div style={{ fontSize: 11.5, color: 'var(--ink-4)', textAlign: 'center' }}>
            El control de stock por unidades disponibles se mostrará aquí cuando los productos registren inventario.
          </div>
          </>
          )}
        </div>
      </div>
    </div>
  )
}
