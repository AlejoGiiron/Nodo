import type { CSSProperties } from 'react'
import { formatoCOP } from '@/lib/formato'

/**
 * MoneyCell — §4. Estados: normal · negativo · sin dato · oculto por rol.
 *
 * 🔴 LA MONOESPACIADA NO EXISTE EN EL PRODUCTO (§2). Las cifras se alinean por
 *    dígito con `font-variant-numeric: tabular-nums`, no cambiando de familia.
 *    Este componente es el que hace que esa regla se cumpla sola: mientras las
 *    cifras pasen por acá, nadie tiene que acordarse.
 *
 * 🔴 `—` NO ES UN CERO (regla 7.5). Significa que falta un insumo del cálculo.
 *    Es el modo de fallo que este producto paga caro: un número inventado se
 *    ve igual de bien que uno correcto.
 *
 * 🔴 `ocultarPlata` (regla 7.6) apaga la CELDA, no la columna: la tabla no
 *    cambia de forma según quién la mire. Quien decide el título de la columna
 *    es la tabla, no esta celda.
 *
 * 🔴 `simbolo` — OPT-IN, y por defecto APAGADO (2026-09-03). §2 dice «sin
 *    símbolo de peso en columnas de tabla; el encabezado ya dice qué es», y ése
 *    sigue siendo el default del producto: las seis columnas de dinero que
 *    existen hoy lo omiten. La lista del Mostrador lo pide por decisión
 *    explícita, así que se declara **en el llamador** en vez de cambiar el
 *    componente para todos.
 *    ⚠️ El default protege, igual que `data-letras-inertes`: una celda nueva
 *    nace SIN símbolo y por lo tanto cumpliendo §2, y desviarse exige escribirlo.
 *    Si algún día el símbolo se vuelve la regla, se invierte acá —un lado— y no
 *    en seis llamadores.
 */

export function MoneyCell({
  value,
  oculto = false,
  simbolo = false,
  style,
  'data-testid': testId,
  title,
}: {
  /** `null` / `undefined` ⇒ dato ausente ⇒ `—`. NUNCA se sustituye por 0. */
  value: number | null | undefined
  /** Rol sin permiso de ver plata: la celda muestra `—`, la columna se queda. */
  oculto?: boolean
  /** Antepone `$`. Opt-in: §2 lo omite por defecto en columnas de tabla. */
  simbolo?: boolean
  style?: CSSProperties
  'data-testid'?: string
  title?: string
}) {
  const ausente = oculto || value === null || value === undefined
  const negativo = !ausente && (value as number) < 0

  return (
    <span
      data-testid={testId}
      title={title}
      style={{
        display: 'inline-block',
        textAlign: 'right',
        fontVariantNumeric: 'tabular-nums',
        fontSize: 13,
        fontWeight: 500,
        color: ausente ? 'var(--ink-4)' : negativo ? 'var(--success-700)' : 'var(--ink)',
        ...style,
      }}
    >
      {ausente ? '—' : `${simbolo ? '$' : ''}${formatoCOP(value as number)}`}
    </span>
  )
}
