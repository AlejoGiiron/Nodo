import type { InputHTMLAttributes } from 'react'
import './ui.css'

/**
 * Input / SearchField — §4. Estados: normal · foco · error · POS grande ·
 * deshabilitado. El foco y el error viven en ui.css (son reglas, no valores).
 *
 * `pos` es el campo de "Recibe" del panel de cobro: 52px, 24–28px/700, alineado
 * a la derecha. La plata se escribe grande porque se cuenta en voz alta.
 */

export type InputSize = 'md' | 'pos'

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> & {
  inputSize?: InputSize
  error?: boolean
  /** Mensaje bajo el campo. Solo se pinta si `error`. Un borde rojo sin texto
      no dice qué está mal. */
  mensajeError?: string
}

export function Input({
  inputSize = 'md',
  error = false,
  mensajeError,
  style,
  className,
  ...rest
}: Props) {
  const pos = inputSize === 'pos'
  return (
    <>
      <input
        className={`nodo-input${error ? ' nodo-input--error' : ''}${className ? ` ${className}` : ''}`}
        aria-invalid={error || undefined}
        style={{
          height: pos ? 52 : 34,
          padding: pos ? '0 14px' : '0 10px',
          fontSize: pos ? 26 : 13,
          fontWeight: pos ? 700 : 400,
          textAlign: pos ? 'right' : 'left',
          fontVariantNumeric: pos ? 'tabular-nums' : undefined,
          ...style,
        }}
        {...rest}
      />
      {error && mensajeError && (
        <div style={{ marginTop: 4, fontSize: 12, color: 'var(--danger-on-soft)' }}>
          {mensajeError}
        </div>
      )}
    </>
  )
}
