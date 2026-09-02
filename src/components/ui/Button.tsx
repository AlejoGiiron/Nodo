import type { ButtonHTMLAttributes } from 'react'
import './ui.css'

/**
 * Button — §4 del design system.
 *
 * Estados: normal · hover · activo · deshabilitado · destructivo.
 * Los de interacción viven en ui.css; acá van solo tamaño y variante.
 *
 * 🔴 NO HAY BOTÓN VERDE. El verde es confirmación (§1.2): si una acción lo usa,
 *    el usuario deja de poder distinguir "esto está bien" de "hacé clic acá".
 * 🔴 Deshabilitado NO se oculta. Se apaga y se explica al lado — un control que
 *    desaparece no dice qué falta.
 */

export type ButtonVariant = 'primary' | 'secondary' | 'destructive' | 'destructive-solid'
/** `pos` es el alto 52px del mostrador: el botón que la cajera usa todo el día. */
export type ButtonSize = 'sm' | 'md' | 'pos'

const ALTO: Record<ButtonSize, number> = { sm: 36, md: 38, pos: 52 }
const TIPO: Record<ButtonSize, { fontSize: number; padding: string }> = {
  sm: { fontSize: 13, padding: '0 14px' },
  md: { fontSize: 14, padding: '0 18px' },
  pos: { fontSize: 16, padding: '0 20px' },
}

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: ButtonSize
  /** Ocupa el ancho disponible (el Cobrar del mostrador, el primario de un pie). */
  block?: boolean
}

export function Button({
  variant = 'primary',
  size = 'md',
  block = false,
  style,
  className,
  type = 'button',
  ...rest
}: Props) {
  return (
    <button
      type={type}
      className={`nodo-btn nodo-btn--${variant}${className ? ` ${className}` : ''}`}
      style={{
        height: ALTO[size],
        ...TIPO[size],
        // 700 solo en el tamaño POS: es el peso de la maqueta para "Cobrar — F12".
        fontWeight: size === 'pos' ? 700 : 600,
        width: block ? '100%' : undefined,
        ...style,
      }}
      {...rest}
    />
  )
}
