import { useState } from 'react'
import { DollarSign, Wallet, X } from 'lucide-react'
import { useCashShift } from '@/hooks/useCashShift'

const formatCOP = (n: number) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(n)

export function OpenShiftModal({ onClose, onOpened }: {
  onClose?: () => void
  onOpened?: () => void
} = {}) {
  const { openShift, isOpeningShift } = useCashShift()
  const [rawAmount, setRawAmount] = useState('')

  const amount = parseInt(rawAmount.replace(/\D/g, ''), 10) || 0
  const isValid = amount >= 0

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isValid || isOpeningShift) return
    try {
      await openShift(amount)
      onOpened?.()
    } catch {
      // error toast handled in hook
    }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(15,23,42,.85)',
        display: 'grid', placeItems: 'center',
        zIndex: 100,
        fontFamily: 'inherit',
        padding: '20px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--surface)', borderRadius: 16,
          width: 420, maxWidth: '100%',
          boxShadow: '0 25px 60px -12px rgba(0,0,0,.4)',
          overflow: 'hidden', position: 'relative',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button — solo cuando el modal es descartable */}
        {onClose && (
          <button
            onClick={onClose}
            style={{
              position: 'absolute', top: 14, right: 14, zIndex: 1,
              background: 'var(--border-2)', border: 'none', width: 30, height: 30,
              borderRadius: 8, cursor: 'pointer', color: 'var(--ink-3)',
              display: 'grid', placeItems: 'center',
            }}
          >
            <X size={16} />
          </button>
        )}
        {/* Top accent */}
        <div style={{ height: 4, background: 'var(--action)' }} />

        <div style={{ padding: '32px 32px 28px' }}>
          {/* Icon + heading */}
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <div style={{
              width: 56, height: 56, borderRadius: 16,
              background: 'var(--action-soft)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 16px',
            }}>
              <Wallet size={26} color="var(--action)" strokeWidth={1.8} />
            </div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--action)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
              Antes de comenzar
            </div>
            <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--ink)', letterSpacing: -0.5, margin: 0 }}>
              Abrir turno de caja
            </h2>
            <p style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 8, marginBottom: 0, lineHeight: 1.5 }}>
              Ingresa el efectivo que hay en caja al iniciar el turno. Este monto se usará para calcular diferencias al cierre.
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 8 }}>
                Efectivo en caja al inicio
              </label>
              <div style={{ position: 'relative' }}>
                <div style={{
                  position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)',
                  display: 'flex', alignItems: 'center', gap: 4,
                  color: 'var(--ink-4)', pointerEvents: 'none',
                }}>
                  <DollarSign size={14} />
                </div>
                <input
                  type="text"
                  inputMode="numeric"
                  data-testid="open-shift-amount"
                  value={rawAmount ? formatCOP(amount).replace('$', '').trim() : ''}
                  onChange={(e) => setRawAmount(e.target.value.replace(/\D/g, ''))}
                  placeholder="0"
                  autoFocus
                  style={{
                    width: '100%', padding: '12px 14px 12px 32px',
                    border: '1.5px solid var(--border)', borderRadius: 10,
                    fontSize: 18, fontWeight: 600, color: 'var(--ink)',
                    fontVariantNumeric: 'tabular-nums',
                    outline: 'none', boxSizing: 'border-box',
                    background: 'var(--surface-2)',
                    transition: 'border .12s, background .12s',
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = 'var(--action)'
                    e.currentTarget.style.background = 'var(--surface)'
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = 'var(--border)'
                    e.currentTarget.style.background = 'var(--surface-2)'
                  }}
                />
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--ink-4)', marginTop: 6 }}>
                Puedes ingresar 0 si la caja está vacía
              </div>
            </div>

            <button
              type="submit"
              disabled={isOpeningShift}
              style={{
                width: '100%', padding: '13px',
                border: 'none', borderRadius: 10,
                background: isOpeningShift ? 'var(--ink-4)' : 'var(--action)',
                color: 'var(--surface)', fontSize: 14, fontWeight: 700,
                cursor: isOpeningShift ? 'not-allowed' : 'pointer',
                boxShadow: isOpeningShift ? 'none' : '0 6px 16px rgba(16,185,129,.35)',
                transition: 'all .15s',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              {isOpeningShift ? 'Abriendo turno...' : 'Abrir turno de caja →'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
