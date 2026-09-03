import { useState } from 'react'
import { X, DollarSign, TrendingUp, TrendingDown, Minus, AlertTriangle } from 'lucide-react'
import { useCashShift } from '@/hooks/useCashShift'
import { useSedeConfig } from '@/hooks/useSedeConfig'
import { calcShiftBalance, cuadreTone } from '@/lib/shiftCalc'
import type { ShiftReconciliation, MethodReconciliation } from '@/lib/shiftCalc'
import { printCashReport, buildCashReportData } from '@/lib/printer'

const formatCOP = (n: number) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(n)

const METHOD_LABELS: Record<string, string> = {
  cash: 'Efectivo',
  card: 'Tarjeta',
  transfer: 'Transferencia',
  nequi: 'Nequi',
}

// Métodos NO-efectivo: su esperado = solo ventas de ese método (sin apertura ni
// movimientos, que son solo de efectivo). El efectivo conserva su bloque F1.
const OTHER_METHODS = ['card', 'transfer', 'nequi'] as const
type OtherMethod = (typeof OTHER_METHODS)[number]

interface CloseShiftModalProps {
  onClose: () => void
}

export function CloseShiftModal({ onClose }: CloseShiftModalProps) {
  const {
    currentShift, salesSummary, movements, closeShift, isClosingShift,
    isLoadingShift, isLoadingSales, isLoadingMovements,
    shiftFallo, salesFallo, movementsFallo,
  } = useCashShift()
  const { sede } = useSedeConfig()
  const [rawAmount, setRawAmount] = useState('')
  // Arqueo multi-método: declarado por método NO-efectivo (blanco = 0) + comentario.
  const [declaredOther, setDeclaredOther] = useState<Record<OtherMethod, string>>({
    card: '', transfer: '', nequi: '',
  })
  const [comment, setComment] = useState('')

  const declared = parseInt(rawAmount.replace(/\D/g, ''), 10) || 0

  const cashSales = salesSummary?.cash ?? 0
  const movementsIn = movements.filter(m => m.type === 'in').reduce((s, m) => s + m.amount, 0)
  const movementsOut = movements.filter(m => m.type === 'out').reduce((s, m) => s + m.amount, 0)

  const { expectedCash, difference, isOverdraft } = calcShiftBalance({
    openingAmount: currentShift?.opening_amount ?? 0,
    cashSales,
    movementsIn,
    movementsOut,
    declared,
  })

  // Arqueo por método: efectivo = expectedCash (apertura+ventas+ing−egr, ya calculado);
  // los demás = solo ventas de ese método. Diferencia = declarado − esperado (informativa).
  const otherRows = OTHER_METHODS.map((m) => {
    const expected = salesSummary?.[m] ?? 0
    const declaredM = parseInt(declaredOther[m].replace(/\D/g, ''), 10) || 0
    return { method: m, expected, declared: declaredM, difference: declaredM - expected }
  })
  const expectedTotal = expectedCash + otherRows.reduce((s, r) => s + r.expected, 0)
  const declaredTotal = declared + otherRows.reduce((s, r) => s + r.declared, 0)
  const differenceTotal = declaredTotal - expectedTotal

  // ════════════════════════════════════════════════════════════════════════
  // 🔴 DEUDA 55 · UNA ESCRITURA QUE PERSISTE UN CÁLCULO NO EXISTE HASTA QUE
  //    TODOS SUS INSUMOS HAYAN CARGADO.
  //
  //    Lo que este modal escribe —`expected_amount`, `difference` y el snapshot
  //    `close_reconciliation`— es PERMANENTE, y la reimpresión lo lee tal cual
  //    (por diseño: recomputar un turno cerrado sumaría pagos posteriores). Un
  //    cierre hecho antes de que respondan las consultas quedaba guardado con
  //    `salesSummary ?? 0` y `movements = []`, o sea un arqueo falso que se
  //    reimprime igual para siempre. Medido: `expected_amount` 47.987 donde lo
  //    real era 65.987 (A1 §3.1).
  //
  //    Son TRES insumos y se exigen los tres: con uno solo cargado el arqueo
  //    sigue siendo falso. Y NO es un spinner sobre el botón —eso invita a
  //    esperar y volver a intentar—: el botón NO EXISTE hasta entonces.
  //
  //    `declared` no entra: es la entrada humana, no un dato que se carga.
  // ════════════════════════════════════════════════════════════════════════
  const insumoFallo = shiftFallo || salesFallo || movementsFallo
  const insumosListos =
    !insumoFallo && !isLoadingShift && !isLoadingSales && !isLoadingMovements && !!currentShift
  const canClose = insumosListos && rawAmount.length > 0

  // 🔴 DEUDA 64. Los cinco sitios de este bloque decidian su color con
  //    `difference > 0 ? success : danger`, o sea: **el sobrante en verde**, en
  //    la pantalla donde se decide cerrar. Ahora salen de `cuadreTone`, que es
  //    la fuente unica — la misma que usa el historial.
  const tono = cuadreTone(difference)
  const TONO_COLOR = {
    success: { bg: 'var(--success-soft)', bd: 'var(--success-border)', fg: 'var(--success-on-soft)', fuerte: 'var(--success-700)' },
    warning: { bg: 'var(--warning-soft)', bd: 'var(--warning-border)', fg: 'var(--warning-on-soft)', fuerte: 'var(--warning-700)' },
    danger: { bg: 'var(--danger-soft)', bd: 'var(--danger-soft)', fg: 'var(--danger-on-soft)', fuerte: 'var(--danger)' },
  } as const
  const c = TONO_COLOR[tono.rol]

  const handleClose = async () => {
    // Redundante con el botón ausente, y a propósito: es la garantía que no
    // depende de que el render haya llegado a tiempo.
    if (!insumosListos || !canClose || isClosingShift) return
    // Snapshot del arqueo: efectivo (F1) + los 3 otros métodos + totales.
    // sales_count lo completa la mutación al cerrar.
    const otherMethodsObj = Object.fromEntries(
      otherRows.map((r) => [r.method, { expected: r.expected, declared: r.declared, difference: r.difference }]),
    ) as Record<OtherMethod, MethodReconciliation>
    const reconciliation: Omit<ShiftReconciliation, 'sales_count'> = {
      methods: {
        cash: { expected: expectedCash, declared, difference },
        ...otherMethodsObj,
      },
      expected_total: expectedTotal,
      declared_total: declaredTotal,
      difference_total: differenceTotal,
    }
    try {
      const closedRow = await closeShift({
        closingAmount: declared,
        expectedAmount: expectedCash,
        difference,
        reconciliation,
        comment,
      })
      // Auto-imprimir el comprobante tras el cierre exitoso (el modal fue el
      // preview; confirmar persiste + imprime en un gesto). Mismo builder que la
      // reimpresión del historial → salida idéntica; usa el snapshot, no recomputa.
      if (closedRow?.close_reconciliation) {
        printCashReport(buildCashReportData(closedRow, {
          sedeName: sede?.name,
          sedeAddress: sede?.address,
          movementsIn,
          movementsOut,
        }))
      }
      onClose()
    } catch {
      // error toast handled in hook
    }
  }

  const rowStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '8px 0',
    fontSize: 13.5, color: 'var(--ink-2)',
  }

  const totalRowStyle: React.CSSProperties = {
    ...rowStyle,
    borderTop: '1px solid var(--border)',
    marginTop: 4, paddingTop: 12,
    fontWeight: 700, fontSize: 14, color: 'var(--ink)',
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '12px 14px 12px 32px',
    border: '1.5px solid var(--border)', borderRadius: 10,
    fontSize: 18, fontWeight: 600, color: 'var(--ink)',
    fontVariantNumeric: 'tabular-nums', outline: 'none',
    boxSizing: 'border-box', background: 'var(--surface-2)',
    transition: 'border .12s, background .12s',
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'var(--overlay)',
        display: 'grid', placeItems: 'center',
        zIndex: 50, fontFamily: 'inherit',
        padding: '20px',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: 'var(--surface)', borderRadius: 14,
        width: 520, maxWidth: '100%',
        boxShadow: 'var(--shadow-1)',
        overflow: 'hidden', maxHeight: '92vh',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{
          padding: '18px 22px', borderBottom: '1px solid var(--border-2)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--success-700)', textTransform: 'uppercase', letterSpacing: 1 }}>
              Resumen del turno
            </div>
            <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--ink)', letterSpacing: -0.3, marginTop: 1 }}>
              Cerrar turno de caja
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 32, height: 32, borderRadius: 8,
              background: 'var(--border-2)', border: 'none',
              cursor: 'pointer', color: 'var(--ink-3)',
              display: 'grid', placeItems: 'center',
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div style={{ overflow: 'auto', flex: 1, padding: '22px' }}>

          {/* Sales breakdown */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
              Ventas por método de pago
            </div>
            <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '4px 14px' }}>
              {(['cash', 'card', 'transfer', 'nequi'] as const).map((method) => {
                const amount = salesSummary?.[method] ?? 0
                return (
                  <div key={method} style={{ ...rowStyle, borderBottom: '1px solid var(--border-2)' }}>
                    <span style={{ color: 'var(--ink-3)' }}>{METHOD_LABELS[method]}</span>
                    <span data-testid={`shift-sales-${method}`} style={{ fontVariantNumeric: 'tabular-nums', fontWeight: amount > 0 ? 600 : 400, color: amount > 0 ? 'var(--ink)' : 'var(--ink-4)' }}>
                      {formatCOP(amount)}
                    </span>
                  </div>
                )
              })}
              <div style={totalRowStyle}>
                <span>Total ventas</span>
                <span style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--success-700)' }}>
                  {formatCOP(salesSummary?.total ?? 0)}
                </span>
              </div>
            </div>
          </div>

          {/* Expected cash calculation */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
              Cálculo de efectivo esperado
            </div>
            <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '4px 14px' }}>
              <div style={{ ...rowStyle, borderBottom: '1px solid var(--border-2)' }}>
                <span style={{ color: 'var(--ink-3)' }}>Monto de apertura</span>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatCOP(currentShift?.opening_amount ?? 0)}</span>
              </div>
              <div style={{ ...rowStyle, borderBottom: '1px solid var(--border-2)' }}>
                <span style={{ color: 'var(--ink-3)' }}>Ventas en efectivo</span>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>+ {formatCOP(cashSales)}</span>
              </div>
              {movementsIn > 0 && (
                <div style={{ ...rowStyle, borderBottom: '1px solid var(--border-2)' }}>
                  <span style={{ color: 'var(--ink-3)' }}>Ingresos manuales</span>
                  <span style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--success-700)' }}>+ {formatCOP(movementsIn)}</span>
                </div>
              )}
              {movementsOut > 0 && (
                <div style={{ ...rowStyle, borderBottom: '1px solid var(--border-2)' }}>
                  <span style={{ color: 'var(--ink-3)' }}>Egresos manuales</span>
                  <span style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--danger)' }}>− {formatCOP(movementsOut)}</span>
                </div>
              )}
              <div style={totalRowStyle}>
                <span>Efectivo esperado</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {isOverdraft && (
                    <span
                      data-testid="overdraft-badge"
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        padding: '2px 8px', borderRadius: 6,
                        background: 'var(--danger-soft)', border: '1px solid var(--danger-soft)',
                        color: 'var(--danger-on-soft)', fontSize: 10.5, fontWeight: 700,
                        textTransform: 'uppercase', letterSpacing: 0.5,
                      }}
                    >
                      <AlertTriangle size={11} />
                      Sobregiro
                    </span>
                  )}
                  <span style={{ fontVariantNumeric: 'tabular-nums', color: isOverdraft ? 'var(--danger)' : undefined }}>
                    {formatCOP(expectedCash)}
                  </span>
                </span>
              </div>
            </div>
            {isOverdraft && (
              <p style={{ fontSize: 11.5, color: 'var(--danger-on-soft)', marginTop: 8, lineHeight: 1.4 }}>
                Los egresos superaron el efectivo disponible (apertura + ventas en efectivo +
                ingresos). El esperado quedó negativo.
              </p>
            )}
          </div>

          {/* Declared amount input */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 8 }}>
              Monto declarado en caja <span style={{ color: 'var(--danger)' }}>*</span>
            </label>
            <div style={{ position: 'relative' }}>
              <div style={{
                position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)',
                color: 'var(--ink-4)', pointerEvents: 'none',
              }}>
                <DollarSign size={14} />
              </div>
              <input
                type="text"
                inputMode="numeric"
                data-testid="close-shift-declared"
                value={rawAmount ? formatCOP(declared).replace('$', '').trim() : ''}
                onChange={(e) => setRawAmount(e.target.value.replace(/\D/g, ''))}
                placeholder="0"
                autoFocus
                style={inputStyle}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = 'var(--success-700)'
                  e.currentTarget.style.background = 'var(--surface)'
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border)'
                  e.currentTarget.style.background = 'var(--surface-2)'
                }}
              />
            </div>
          </div>

          {/* Difference */}
          {canClose && (
            <div style={{
              padding: '14px 16px', borderRadius: 10,
              background: c.bg,
              border: `1px solid ${c.bd}`,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {/* El icono sigue al ROL, no al signo: la flecha hacia arriba
                    del sobrante iba en verde y ahora va en ambar. */}
                {difference > 0
                  ? <TrendingUp size={16} color={c.fuerte} />
                  : difference < 0
                    ? <TrendingDown size={16} color={c.fuerte} />
                    : <Minus size={16} color={c.fuerte} />
                }
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: c.fg }}>
                    {tono.etiqueta}
                  </div>
                  {/* Y la frase dice QUE SIGNIFICA, no solo el signo: "hay mas
                      efectivo del esperado" se lee como una buena noticia. */}
                  <div style={{ fontSize: 11.5, color: c.fg, marginTop: 1 }}>
                    {difference === 0
                      ? 'El monto declarado coincide exactamente'
                      : difference > 0
                        ? 'Sobra efectivo: algo no se registró — una venta cobrada por fuera, un vuelto, la base'
                        : 'Falta efectivo respecto de lo esperado'}
                  </div>
                </div>
              </div>
              <span
                data-testid="shift-cash-difference"
                style={{
                  fontVariantNumeric: 'tabular-nums', fontSize: 17, fontWeight: 700,
                  color: c.fuerte,
                }}
              >
                {difference >= 0 ? '+' : ''}{formatCOP(difference)}
              </span>
            </div>
          )}

          {/* ── Otros métodos (arqueo multi-método) ── */}
          <div style={{ marginTop: 22 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
              Otros métodos <span style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 500, color: 'var(--ink-4)' }}>· declarado opcional</span>
            </div>
            <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '8px 14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 82px 86px 76px', gap: 6, fontSize: 10.5, fontWeight: 600, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: 0.4, paddingBottom: 6, borderBottom: '1px solid var(--border-2)' }}>
                <span>Método</span>
                <span style={{ textAlign: 'right' }}>Esperado</span>
                <span style={{ textAlign: 'right' }}>Declarado</span>
                <span style={{ textAlign: 'right' }}>Dif.</span>
              </div>
              {otherRows.map((r) => (
                <div key={r.method} style={{ display: 'grid', gridTemplateColumns: '1fr 82px 86px 76px', gap: 6, alignItems: 'center', padding: '7px 0', borderBottom: '1px solid var(--border-2)' }}>
                  <span style={{ fontSize: 13, fontWeight: r.expected > 0 ? 500 : 400, color: r.expected > 0 ? 'var(--ink-2)' : 'var(--ink-4)' }}>{METHOD_LABELS[r.method]}</span>
                  <span style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums', textAlign: 'right', fontWeight: r.expected > 0 ? 600 : 400, color: r.expected > 0 ? 'var(--ink)' : 'var(--ink-4)' }}>
                    {formatCOP(r.expected)}
                  </span>
                  <input
                    data-testid={`pay-declared-${r.method}`}
                    inputMode="numeric"
                    value={declaredOther[r.method] ? formatCOP(r.declared).replace('$', '').trim() : ''}
                    onChange={(e) => setDeclaredOther((s) => ({ ...s, [r.method]: e.target.value.replace(/\D/g, '') }))}
                    placeholder="0"
                    style={{ width: '100%', boxSizing: 'border-box', padding: '6px 8px', border: '1.5px solid var(--border)', borderRadius: 7, fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums', textAlign: 'right', outline: 'none', background: 'var(--surface)' }}
                  />
                  <span
                    data-testid={`pay-diff-${r.method}`}
                    style={{ fontSize: 12.5, fontVariantNumeric: 'tabular-nums', textAlign: 'right', fontWeight: 600, color: r.difference === 0 ? 'var(--ink-3)' : TONO_COLOR[cuadreTone(r.difference).rol].fuerte }}
                  >
                    {r.difference > 0 ? '+' : ''}{formatCOP(r.difference)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* ── Comentario del cierre ── */}
          <div style={{ marginTop: 20 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 8 }}>
              Comentario del cierre
            </label>
            <textarea
              data-testid="close-shift-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Nota o justificación de diferencias (opcional)"
              rows={2}
              style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', border: '1.5px solid var(--border)', borderRadius: 10, fontSize: 13, color: 'var(--ink)', outline: 'none', resize: 'vertical', fontFamily: 'inherit', background: 'var(--surface-2)' }}
            />
          </div>

          {/* ── Total del arqueo ── */}
          <div data-testid="shift-arqueo-total" style={{ marginTop: 20, padding: '12px 16px', borderRadius: 10, background: 'var(--ink)', display: 'flex', flexDirection: 'column', gap: 5 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
              <span style={{ color: 'var(--ink-4)' }}>Esperado total</span>
              <span style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--border)' }}>{formatCOP(expectedTotal)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
              <span style={{ color: 'var(--ink-4)' }}>Declarado total</span>
              <span style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--border)' }}>{formatCOP(declaredTotal)}</span>
            </div>
            {/* ⚠️ #34d399 (cuadrado) y #f87171 (faltante) se quedan como hexes A
                PROPÓSITO: son verde y rojo SOBRE TINTA, y la skill define solo
                cuatro tokens on-dark. No hay --success ni --danger sobre
                oscuro, y §8 dice que lo que no está no se infiere.
                ✅ El SOBRANTE sí pasó a token: `--on-dark-warn` es exactamente
                "texto del aviso sobre tinta", y un sobrante ES una advertencia
                — la caja no cuadra. Estaba en el mismo verde que el cuadre, o
                sea que el color decía "bien hecho" cuando falta explicar de
                dónde salió esa plata. */}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 700, borderTop: '1px solid var(--on-dark-fill)', paddingTop: 7, marginTop: 1, color: 'var(--surface)' }}>
              <span>Diferencia total</span>
              <span style={{ fontVariantNumeric: 'tabular-nums', color: differenceTotal === 0 ? '#34d399' : differenceTotal > 0 ? 'var(--on-dark-warn)' : '#f87171' }}>
                {differenceTotal >= 0 ? '+' : ''}{formatCOP(differenceTotal)}
              </span>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div style={{
          padding: '16px 22px', borderTop: '1px solid var(--border-2)',
          display: 'flex', gap: 10, flexShrink: 0,
          background: 'linear-gradient(180deg, var(--surface-2) 0%, var(--surface) 100%)',
        }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              flex: 1, padding: '11px 16px',
              border: '1.5px solid var(--border)', background: 'var(--surface)',
              borderRadius: 9, cursor: 'pointer',
              fontSize: 13.5, fontWeight: 600, color: 'var(--ink-2)',
            }}
          >
            Cancelar
          </button>
          {/* 🔴 El botón NO SE RENDERIZA hasta que los tres insumos cargaron
              (deuda 55). En su lugar va lo que la pantalla sí sabe: que todavía
              no puede ofrecer la acción, o que un insumo falló — y un error de
              carga es un ESTADO del formulario, no un cero. */}
          {insumoFallo ? (
            <div
              data-testid="close-shift-insumo-fallo"
              style={{
                flex: 2, padding: '11px 16px', borderRadius: 9,
                background: 'var(--danger-soft)', border: '1px solid var(--danger-soft)',
                color: 'var(--danger-on-soft)', fontSize: 12.5, fontWeight: 600,
                display: 'flex', alignItems: 'center', gap: 8, lineHeight: 1.35,
              }}
            >
              <AlertTriangle size={16} style={{ flexShrink: 0 }} />
              No se pudo cargar el resumen del turno. No se puede cerrar sin él:
              el arqueo quedaría guardado mal. Recargá la página.
            </div>
          ) : !insumosListos ? (
            <div
              data-testid="close-shift-cargando"
              style={{
                flex: 2, padding: '11px 16px', borderRadius: 9,
                background: 'var(--surface-2)', border: '1px solid var(--border)',
                color: 'var(--ink-3)', fontSize: 12.5, fontWeight: 600,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              Cargando el resumen del turno…
            </div>
          ) : (
            <button
              onClick={handleClose}
              disabled={!canClose || isClosingShift}
              style={{
                flex: 2, padding: '11px 16px', border: 'none',
                background: !canClose || isClosingShift ? 'var(--ink-4)' : 'var(--ink)',
                borderRadius: 9,
                cursor: !canClose || isClosingShift ? 'not-allowed' : 'pointer',
                fontSize: 13.5, fontWeight: 700, color: 'var(--surface)',
                transition: 'all .15s',
              }}
            >
              {isClosingShift ? 'Cerrando turno...' : 'Confirmar cierre'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
