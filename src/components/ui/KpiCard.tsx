import type { ReactNode } from 'react'
import { TrendingUp, TrendingDown } from 'lucide-react'

/**
 * KpiCard — §4. La tarjeta de cifra de una pantalla.
 *
 * 🔴 UNIFICA TRES FORMAS que vivían separadas: la función `KpiCard` de
 *    InventoryPage, el bloque inline de FiadoPage (el único con `data-testid`,
 *    por eso los testids salen de ahí) y los de ReportsPage. Tres copias del
 *    mismo componente es R1 en su forma más barata de arreglar y más fácil de
 *    dejar divergir: la de Inventario ya usaba otro tamaño de cifra.
 *
 * Estructura del §4: etiqueta `--fs-label` en `--ink-3`, cifra `--fs-kpi`
 * (26/600) en `tabular-nums`, nota opcional de 12px.
 *
 * `tono` NO es decoración: es el rol del dato.
 *   · `normal`  — una cifra de trabajo.
 *   · `debt`    — plata que se debe (vencido, por cobrar).
 *   · `warning` — algo que pide una decisión del dueño (productos sin costo).
 * No hay tono `action`: una tarjeta no es un botón.
 */

export type KpiTono = 'normal' | 'debt' | 'warning'

const TONO: Record<KpiTono, { bg: string; bd: string; fg: string }> = {
  normal: { bg: 'var(--surface)', bd: 'var(--border)', fg: 'var(--ink)' },
  debt: { bg: 'var(--debt-soft)', bd: 'var(--debt-border)', fg: 'var(--debt-on-soft)' },
  warning: { bg: 'var(--warning-soft)', bd: 'var(--warning-border)', fg: 'var(--warning-on-soft)' },
}

export function KpiCard({
  etiqueta,
  valor,
  nota,
  tono = 'normal',
  cambio,
  testid,
}: {
  etiqueta: string
  /** Ya formateado. La tarjeta no decide el formato de la cifra. */
  valor: ReactNode
  nota?: string
  tono?: KpiTono
  /**
   * Variación porcentual contra el período anterior. `null` = no hay
   * comparable; `undefined` = esta tarjeta no compara.
   *
   * ⚠️ ARRIBA SE PINTA VERDE Y ABAJO ROJO, y eso solo es correcto para métricas
   * donde MÁS ES MEJOR — que son las tres que hoy la usan (ventas, órdenes,
   * ticket). El día que aparezca un KPI donde menos es mejor —gastos, costo de
   * lo vendido, productos sin costo— este componente necesita un prop
   * `sentido`, porque si no va a afirmar que gastar más salió bien. Es la misma
   * clase que el sobrante en verde: el color afirma, y acá afirmaría al revés.
   */
  cambio?: number | null
  /** Se emiten `kpi-<testid>` y `kpi-<testid>-value`, como en Cartera. */
  testid?: string
}) {
  const t = TONO[tono]
  return (
    <div
      data-testid={testid ? `kpi-${testid}` : undefined}
      style={{
        background: t.bg,
        border: `1px solid ${t.bd}`,
        borderRadius: 'var(--r-3)',
        padding: '14px 16px',
        minWidth: 0,
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '.04em',
          textTransform: 'uppercase',
          color: tono === 'normal' ? 'var(--ink-3)' : t.fg,
        }}
      >
        {etiqueta}
      </div>
      <div
        data-testid={testid ? `kpi-${testid}-value` : undefined}
        style={{
          fontSize: 26,
          fontWeight: 600,
          fontVariantNumeric: 'tabular-nums',
          color: t.fg,
          marginTop: 2,
          lineHeight: 1.15,
        }}
      >
        {valor}
      </div>
      {nota && (
        <div style={{ fontSize: 12, color: tono === 'normal' ? 'var(--ink-3)' : t.fg, marginTop: 2 }}>
          {nota}
        </div>
      )}
      {cambio !== undefined && (
        <div style={{
          marginTop: 6, display: 'flex', alignItems: 'center', gap: 4,
          fontSize: 11.5, fontWeight: 600, fontVariantNumeric: 'tabular-nums',
          color: cambio === null ? 'var(--ink-4)'
            : cambio >= 0 ? 'var(--success-700)' : 'var(--danger)',
        }}>
          {cambio !== null && (cambio >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />)}
          {cambio !== null
            ? `${cambio >= 0 ? '+' : ''}${cambio.toFixed(1)}% vs período anterior`
            : 'Sin período anterior comparable'}
        </div>
      )}
    </div>
  )
}
