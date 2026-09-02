import type { ReactNode } from 'react'

/**
 * Badge — §4. Píldora 999px, 11px/600, padding 3px 9px.
 *
 * El TONO es el rol semántico, no un color: `success` = al día, `debt` = mora,
 * `warning` = decisión del dueño, `danger` = error del usuario, `action` = el
 * estado propio del pedido (flujo, no salud del dato), `neutral` = sin dato.
 *
 * 🔴 `debt` y `danger` están separados a propósito (§1.2): "el cliente debe" y
 *    "hiciste algo mal" no son el mismo mensaje.
 *
 * ⚠️ BADGES INLINE QUE TODAVÍA NO PASAN POR acá, enumerados el 2026-09-02 para
 *    que la deuda quede contada y no descubierta de a una. Cada uno muere
 *    cuando su pantalla migre — absorberlos ahora sería tocar cuatro pantallas
 *    sin abrir ninguna:
 *      · `stock-badge`        — ProductCard (Catálogo)
 *      · `stock-status-badge` — InventoryPage (Inventario)
 *      · `sale-voided-badge`  — SalesHistoryPage, TRES apariciones (Historial)
 *      · `overdraft-badge`    — CloseShiftModal (Turnos)
 *      · `overdraft-warning`  — MovementsModal (Turnos)
 *    Reproducir la lista:
 *      grep -rn 'data-testid="[a-z-]*\(badge\|status\)[a-z-]*"' src/
 *    ✅ Ya migrados: `pos-stock-indicator` (Mostrador) y el badge de estado de
 *    fiado (Cartera), que fue el primer consumidor de esta primitiva.
 */

export type BadgeTone = 'success' | 'debt' | 'warning' | 'danger' | 'action' | 'neutral'

const TONO: Record<BadgeTone, { bg: string; fg: string; bd: string }> = {
  success: { bg: 'var(--success-soft)', fg: 'var(--success-on-soft)', bd: 'var(--success-border)' },
  debt: { bg: 'var(--debt-soft)', fg: 'var(--debt-on-soft)', bd: 'var(--debt-border)' },
  warning: { bg: 'var(--warning-soft)', fg: 'var(--warning-on-soft)', bd: 'var(--warning-border)' },
  danger: { bg: 'var(--danger-soft)', fg: 'var(--danger-on-soft)', bd: 'var(--danger-soft)' },
  action: { bg: 'var(--action-soft)', fg: 'var(--action-on-soft)', bd: 'var(--action-border)' },
  neutral: { bg: 'var(--border-2)', fg: 'var(--ink-3)', bd: 'var(--border)' },
}

export function Badge({
  tone = 'neutral',
  children,
  title,
  'data-testid': testId,
}: {
  tone?: BadgeTone
  children: ReactNode
  title?: string
  'data-testid'?: string
}) {
  const t = TONO[tone]
  return (
    <span
      data-testid={testId}
      title={title}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '3px 9px',
        borderRadius: 999,
        background: t.bg,
        color: t.fg,
        border: `1px solid ${t.bd}`,
        fontSize: 11,
        fontWeight: 600,
        lineHeight: 1.4,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  )
}
