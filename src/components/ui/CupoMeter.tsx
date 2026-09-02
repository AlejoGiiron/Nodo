import { formatoCOP } from '@/lib/formato'

/**
 * CupoMeter — §4. Estados: holgado · ajustado · consumido · excedido por la
 * venta en curso · sin dato.
 *
 * 🔴 VIVE DENTRO DEL MODAL DE COBRO, en el paso donde se elige crédito, junto
 *    al bloque de cliente — no en la columna derecha del mostrador. Ubicación
 *    fijada el 2026-09-01 al cerrar §8.15 (el cobro se queda en modal).
 *
 * 🔴 EL CUPO SE PROYECTA CON LA VENTA EN CURSO (regla 7.1). No muestra el
 *    disponible de ANTES: muestra "Disponible ahora − esta venta → Queda tras
 *    esta venta", con el proyectado como cifra dominante. Vender por encima del
 *    cupo es una decisión del dueño, no un accidente del cajero.
 *
 * ⚠️ ESTADO `sin dato` POR AHORA SIEMPRE: el cupo NO EXISTE en el esquema —
 *    cero columnas (deuda 40). Mientras esa deuda no se pague, este
 *    componente se pinta con `asignado = null` y muestra `—` con la invitación.
 *    Es exactamente el estado que la skill contempla, no un placeholder.
 */

export function CupoMeter({
  asignado,
  consumido,
  ventaEnCurso = 0,
}: {
  /** `null` ⇒ el cliente no tiene cupo asignado (o el dato no existe todavía). */
  asignado: number | null
  consumido: number
  ventaEnCurso?: number
}) {
  if (asignado === null) {
    return (
      <div data-testid="cupo-meter" data-cupo-estado="sin-dato">
        <Etiqueta />
        <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--ink-4)' }}>—</div>
        <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 2 }}>
          Sin cupo asignado. Asignale uno desde la ficha del cliente.
        </div>
      </div>
    )
  }

  const disponible = asignado - consumido
  const proyectado = disponible - ventaEnCurso
  const pctConsumido = Math.min(100, (consumido / asignado) * 100)
  const pctVenta = Math.min(100 - pctConsumido, (ventaEnCurso / asignado) * 100)

  // ≥95% deuda · ≥80% advertencia · resto acción. El umbral mira el consumido
  // real, no el proyectado: el color dice dónde está el cliente, no dónde
  // quedaría.
  const tono =
    pctConsumido >= 95 ? 'var(--debt)' : pctConsumido >= 80 ? 'var(--warning-700)' : 'var(--action)'
  const estado =
    proyectado < 0 ? 'excedido' : pctConsumido >= 95 ? 'consumido' : pctConsumido >= 80 ? 'ajustado' : 'holgado'

  return (
    <div data-testid="cupo-meter" data-cupo-estado={estado}>
      <Etiqueta />
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ fontSize: 13, color: 'var(--ink-3)', fontVariantNumeric: 'tabular-nums' }}>
          {formatoCOP(disponible)}
          {ventaEnCurso > 0 && <> − {formatoCOP(ventaEnCurso)}</>}
        </div>
        <div
          data-testid="cupo-proyectado"
          style={{
            fontSize: 20,
            fontWeight: 700,
            fontVariantNumeric: 'tabular-nums',
            color: proyectado < 0 ? 'var(--debt)' : 'var(--ink)',
          }}
        >
          {formatoCOP(proyectado)}
        </div>
      </div>
      <div style={{ height: 8, borderRadius: 'var(--r-1)', background: 'var(--border-2)', display: 'flex', overflow: 'hidden', marginTop: 6 }}>
        <div style={{ width: `${pctConsumido}%`, background: tono }} />
        <div style={{ width: `${pctVenta}%`, background: 'var(--action-500)', opacity: 0.55 }} />
      </div>
      <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 5, fontVariantNumeric: 'tabular-nums' }}>
        consumido {formatoCOP(consumido)}
        {ventaEnCurso > 0 && <> · esta venta {formatoCOP(ventaEnCurso)}</>} · asignado{' '}
        {formatoCOP(asignado)}
      </div>
    </div>
  )
}

function Etiqueta() {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '.04em',
        textTransform: 'uppercase',
        color: 'var(--ink-3)',
        marginBottom: 4,
      }}
    >
      Cupo de crédito
    </div>
  )
}
