import { useState } from 'react'
import { Clock, ArrowRightLeft, PowerOff, MoonStar } from 'lucide-react'
import { useCashShift } from '@/hooks/useCashShift'
import { usePermissions } from '@/hooks/usePermissions'
import { CloseShiftModal } from './CloseShiftModal'
import { MovementsModal } from './MovementsModal'

const formatCOP = (n: number) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(n)

const formatTime = (isoStr: string) =>
  new Intl.DateTimeFormat('es-CO', {
    hour: '2-digit', minute: '2-digit',
    timeZone: 'America/Bogota', hour12: false,
  }).format(new Date(isoStr))

export function ShiftBanner() {
  const { currentShift, salesSummary } = useCashShift()
  const { can } = usePermissions()
  const [showClose, setShowClose] = useState(false)
  const [showMovements, setShowMovements] = useState(false)

  // Sin turno activo: píldora gris "Sin turno" (no bloquea la navegación)
  if (!currentShift) {
    return (
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 7,
        padding: '6px 12px', borderRadius: 9,
        background: 'var(--border-2)', border: '1px solid var(--border)',
        fontFamily: 'inherit',
      }}>
        <MoonStar size={13} color="var(--ink-4)" strokeWidth={2} />
        <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink-3)' }}>
          Sin turno
        </span>
      </div>
    )
  }

  const totalSales = salesSummary?.total ?? 0

  return (
    <>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        fontFamily: 'inherit',
      }}>
        {/* Shift info pill */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '6px 12px', borderRadius: 9,
          background: 'var(--success-soft)', border: '1px solid var(--success-border)',
        }}>
          {/* Green pulse dot */}
          <span style={{
            width: 7, height: 7, borderRadius: '50%',
            background: 'var(--success-700)', flexShrink: 0,
            boxShadow: '0 0 0 2px rgba(16,185,129,.25)',
          }} />

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Clock size={13} color="var(--success-700)" strokeWidth={2} />
            <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--success-on-soft)' }}>
              Turno desde {formatTime(currentShift.opened_at)}
            </span>
          </div>

          <span style={{ width: 1, height: 14, background: 'var(--success-border)' }} />

          <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--success-700)', fontVariantNumeric: 'tabular-nums' }}>
            {formatCOP(totalSales)}
          </span>
        </div>

        {/* Movements button */}
        <button
          onClick={() => setShowMovements(true)}
          title="Movimientos de caja"
          // 🔴 Testid propio (A6 · tanda 1): al renombrar el grupo del nav a
          //    "Movimientos" (§5) este botón dejó de ser localizable por su
          //    nombre accesible — hay dos "Movimientos" en la misma pantalla.
          //    El nombre visible NO se toca: el que cambia es el arnés.
          data-testid="open-movements"
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '6px 10px', borderRadius: 8,
            border: '1px solid var(--border)', background: 'var(--surface)',
            cursor: 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--ink-3)',
            transition: 'all .12s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'var(--action)'
            e.currentTarget.style.color = 'var(--action-700)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'var(--border)'
            e.currentTarget.style.color = 'var(--ink-3)'
          }}
        >
          <ArrowRightLeft size={13} />
          Movimientos
        </button>

        {/* Close shift button — requiere permiso caja.cerrar */}
        {can('caja.cerrar') && (
        <button
          onClick={() => setShowClose(true)}
          title="Cerrar turno"
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '6px 10px', borderRadius: 8,
            border: '1px solid var(--danger-soft)', background: 'var(--danger-soft)',
            cursor: 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--danger)',
            transition: 'all .12s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--danger-soft)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'var(--danger-soft)'
          }}
        >
          <PowerOff size={13} />
          Cerrar turno
        </button>
        )}
      </div>

      {showClose && <CloseShiftModal onClose={() => setShowClose(false)} />}
      {showMovements && <MovementsModal onClose={() => setShowMovements(false)} />}
    </>
  )
}
