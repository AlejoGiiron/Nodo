/**
 * AgingBar — §4. Cuatro casillas de 16×16, radio 2px, escala `--d1`…`--d4`,
 * apagadas en `--border-2`. Junto a los días en `tabular-nums`.
 *
 * 🔴 ESTO MIDE ANTIGÜEDAD, NO VENCIMIENTO, Y ASÍ SE ROTULA.
 *    La antigüedad se deriva de `created_at` de la orden y existe hoy.
 *    **"Vencido" exige un PLAZO** —"a 30 días"— y no hay `due_date` en `orders`
 *    ni plazo de crédito en `customers` (deuda 46). Por eso:
 *      · la columna se titula "Antigüedad", que es lo que de verdad calcula;
 *      · el KPI `VENCIDO` y la columna `VENCIDO` de la maqueta NO SE PINTAN —
 *        no van en `—`: no van.
 *
 *    Poner la antigüedad bajo el título "vencido" daría un número plausible y
 *    falso, y quien lo lee **actúa como si algo hubiera vencido**: llama al
 *    cliente, retiene mercadería, bloquea crédito. Un rótulo falso es peor que
 *    una columna ausente — misma familia que la advertencia falsa que induce el
 *    error que dice prevenir.
 *
 * ⚠️ La leyenda es OBLIGATORIA (§4) y va ARRIBA de la lista, no al pie
 *    — corregido en la skill el 2026-09-02: una leyenda que explica un código de
 *    color va donde se ve el color. Al pie de nueve filas queda debajo del
 *    pliegue: cumple la letra y falla el propósito.
 */

import { TRAMOS, tramoDe, diasDeAntiguedad } from '@/lib/antiguedad'

export function AgingBar({
  /** Fechas de creación de las deudas abiertas del cliente. */
  fechas,
  testid,
}: {
  fechas: string[]
  testid?: string
}) {
  if (fechas.length === 0) return null

  const edades = fechas.map(diasDeAntiguedad)
  const maxima = Math.max(...edades)
  // Se enciende un tramo si HAY deuda en él, no solo el de la más vieja: un
  // cliente con una deuda de 5 días y otra de 95 tiene las dos cosas, y
  // mostrar solo la peor esconde que la mayoría es reciente.
  const encendidos = new Set(edades.map(tramoDe))

  return (
    <span
      data-testid={testid}
      data-antiguedad-dias={maxima}
      title={`Deuda más antigua: ${maxima} días`}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
    >
      <span style={{ display: 'inline-flex', gap: 2 }}>
        {TRAMOS.map((t, i) => (
          <span
            key={i}
            style={{
              width: 16,
              height: 16,
              borderRadius: 2,
              background: encendidos.has(i) ? t.token : 'var(--border-2)',
            }}
          />
        ))}
      </span>
      <span style={{ fontSize: 12, color: 'var(--ink-3)', fontVariantNumeric: 'tabular-nums' }}>
        {maxima}d
      </span>
    </span>
  )
}

/** Leyenda obligatoria (§4). Va ARRIBA de la lista que use AgingBar. */
export function AgingBarLeyenda() {
  return (
    <div
      data-testid="aging-leyenda"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '8px 16px',
        borderTop: '1px solid var(--border-2)',
        fontSize: 11,
        color: 'var(--ink-3)',
      }}
    >
      {/* 🔴 SIGUE DICIENDO "ANTIGÜEDAD" AUNQUE YA EXISTA EL VENCIMIENTO
          (deuda 46). Son dos preguntas distintas sobre la misma fila —cuánto
          hace que se vendió, y cuánto hace que se pasó el plazo— y las dos son
          verdaderas. Renombrar la barra a "vencido" la volvería falsa: una
          venta de 40 días con plazo de 30 está en el tramo 31–60 de antigüedad
          y lleva 10 días vencida. Dos números distintos para la misma fila SIN
          rótulo es cómo nace la próxima deuda 53. */}
      <span style={{ fontWeight: 600, letterSpacing: '.04em', textTransform: 'uppercase' }}>
        Antigüedad
      </span>
      <span style={{ color: 'var(--ink-4)' }}>desde la venta, no el vencimiento</span>
      {[
        { t: 'var(--d1)', l: '0–30 días' },
        { t: 'var(--d2)', l: '31–60' },
        { t: 'var(--d3)', l: '61–90' },
        { t: 'var(--d4)', l: '+90' },
      ].map((x) => (
        <span key={x.l} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: x.t }} />
          {x.l}
        </span>
      ))}
    </div>
  )
}
