import { useState } from 'react'
import { X, Loader2, HandCoins, Banknote } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { useRegisterDebtPayment, useDebtPayments } from '@/hooks/useDebts'
import type { Debt } from '@/hooks/useDebts'
import { PAYMENT_METHODS, paymentMethodLabel, type PaymentMethodValue } from '@/components/purchases/paymentMethods'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { MoneyCell } from '@/components/ui/MoneyCell'
import { formatoCOP } from '@/lib/formato'

interface DebtPaymentModalProps {
  debt: Debt
  onClose: () => void
}


const fmtDate = (iso: string) =>
  new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))

const fieldLabel: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 6,
}
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 13px', border: '1.5px solid var(--border)', borderRadius: 9,
  fontSize: 14, color: 'var(--ink)', outline: 'none', boxSizing: 'border-box', background: 'var(--surface)',
}

export function DebtPaymentModal({ debt, onClose }: DebtPaymentModalProps) {
  const { registerDebtPayment, isRegistering } = useRegisterDebtPayment()
  const { payments, isLoading } = useDebtPayments(debt.id)

  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<PaymentMethodValue>('cash')

  const amountNum = parseInt(amount.replace(/\D/g, ''), 10) || 0
  const exceeds = amountNum > debt.saldo
  const isValid = amountNum > 0 && !exceeds

  const handleSubmit = async () => {
    if (amountNum <= 0) { toast.error('Ingresa el monto del abono'); return }
    if (exceeds) { toast.error('El abono no puede exceder el saldo pendiente'); return }
    await registerDebtPayment({ orderId: debt.id, amount: amountNum, paymentMethod: method })
    onClose()
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'var(--overlay)', display: 'grid', placeItems: 'center', zIndex: 50, fontFamily: 'inherit', padding: 20 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        data-testid="debt-payment-modal"
        style={{ background: 'var(--surface)', borderRadius: 14, width: 480, maxWidth: '100%', maxHeight: '92vh', boxShadow: 'var(--shadow-1)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
      >
        {/* Header */}
        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border-2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--action)', textTransform: 'uppercase', letterSpacing: 1 }}>Registrar abono</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--ink)', letterSpacing: -0.3, marginTop: 1 }}>
              {debt.customerName}{debt.order_number != null ? ` · Venta #${debt.order_number}` : ''}
            </div>
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--border-2)', border: 'none', cursor: 'pointer', color: 'var(--ink-3)', display: 'grid', placeItems: 'center' }}><X size={16} /></button>
        </div>

        <div style={{ padding: 22, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Resumen de saldo */}
          <div style={{ display: 'flex', gap: 10 }}>
            {[
              { label: 'Total', value: debt.total, color: 'var(--ink)' },
              { label: 'Abonado', value: debt.abonado, color: 'var(--success-700)' },
              { label: 'Saldo', value: debt.saldo, color: 'var(--debt)' },
            ].map((box) => (
              <div key={box.label} style={{ flex: 1, background: 'var(--surface-2)', border: '1px solid var(--border-2)', borderRadius: 10, padding: '10px 12px' }}>
                <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{box.label}</div>
                <div data-testid={`debt-${box.label.toLowerCase()}`} style={{ fontSize: 16, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: box.color, marginTop: 2 }}>{formatoCOP(box.value)}</div>
              </div>
            ))}
          </div>

          {/* Monto del abono */}
          <div>
            <label style={fieldLabel}>Monto del abono <span style={{ color: 'var(--debt)' }}>*</span></label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, border: `1px solid ${exceeds ? 'var(--danger)' : 'var(--border)'}`, boxShadow: exceeds ? '0 0 0 3px var(--danger-soft)' : 'none', borderRadius: 'var(--r-2)', padding: '10px 13px', background: 'var(--surface)' }}>
              <Banknote size={16} color="var(--ink-4)" />
              <input
                data-testid="debt-amount"
                value={amount ? formatoCOP(amountNum) : ''}
                onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))}
                placeholder={formatoCOP(debt.saldo)}
                inputMode="numeric"
                style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 18, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--ink)' }}
                autoFocus
              />
              <button
                data-testid="debt-amount-full"
                onClick={() => setAmount(String(debt.saldo))}
                style={{ padding: '5px 10px', border: '1.5px solid var(--action-border)', background: 'var(--action-soft)', borderRadius: 7, cursor: 'pointer', fontSize: 11.5, fontWeight: 700, color: 'var(--success-on-soft)', flex: '0 0 auto' }}
              >
                Saldar
              </button>
            </div>
            {exceeds && (
              <div data-testid="debt-amount-error" style={{ marginTop: 6, fontSize: 11.5, color: 'var(--debt-on-soft)', fontWeight: 600 }}>
                El abono no puede exceder el saldo ({formatoCOP(debt.saldo)}).
              </div>
            )}
          </div>

          {/* Método de pago */}
          <div>
            <label style={fieldLabel}>Método de pago</label>
            <select
              data-testid="debt-method"
              value={method}
              onChange={(e) => setMethod(e.target.value as PaymentMethodValue)}
              style={{ ...inputStyle, cursor: 'pointer' }}
            >
              {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
            <div style={{ marginTop: 6, fontSize: 11, color: 'var(--ink-4)' }}>
              El efectivo entra a la caja del turno abierto como ingreso. Otros métodos no tocan caja.
            </div>
          </div>

          {/* Historial de abonos */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 6 }}>Abonos anteriores</div>
            {isLoading ? (
              <div style={{ fontSize: 12, color: 'var(--ink-4)' }}>Cargando...</div>
            ) : payments.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--ink-4)' }}>Aún no hay abonos.</div>
            ) : (
              <div style={{ border: '1px solid var(--border-2)', borderRadius: 9, overflow: 'hidden' }}>
                {payments.map((p, idx) => (
                  <div key={p.id} data-testid="debt-payment-row" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: idx < payments.length - 1 ? '1px solid var(--border-2)' : 'none', fontSize: 12.5 }}>
                    <span style={{ color: 'var(--ink-3)' }}>{fmtDate(p.created_at)} · {paymentMethodLabel(p.payment_method)}</span>
                    {/* 🔴 Estado obligatorio de Cartera (§6): el abono quedó
                        contra el saldo pero SIN contrapartida en caja. Sale de
                        la columna que la RPC escribe, NO de `cash_movement_id
                        == null` — un abono con tarjeta tampoco crea movimiento
                        y no está pendiente de conciliar. Es `warning` y no
                        `danger`: no bloquea nada, pide una decisión. */}
                    {p.requiere_conciliacion && (
                      <Badge
                        tone="warning"
                        data-testid="abono-requiere-conciliacion"
                        title="El abono quedó registrado contra el saldo, pero el efectivo no entró a ninguna caja: no había jornada abierta."
                      >
                        Sin caja
                      </Badge>
                    )}
                    <MoneyCell value={p.amount} style={{ marginLeft: 'auto', fontWeight: 600, color: 'var(--success-700)' }} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 22px', borderTop: '1px solid var(--border-2)', display: 'flex', gap: 10, justifyContent: 'flex-end', flexShrink: 0, background: 'linear-gradient(180deg, var(--surface-2) 0%, #fff 100%)' }}>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button data-testid="debt-submit" onClick={handleSubmit} disabled={!isValid || isRegistering}>
            {isRegistering ? <Loader2 size={14} className="animate-spin" /> : <HandCoins size={15} />}
            {isRegistering ? 'Registrando...' : 'Registrar abono'}
          </Button>
        </div>
      </div>
    </div>
  )
}
