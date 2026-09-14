import { NIVELES, etiquetaDeNivel, precioDeNivel, type PrecioDeNivel } from '@/lib/niveles'
import { formatoCOP } from '@/lib/formato'

/**
 * PriceLevel — el nivel de lista de UNA LÍNEA DE VENTA (diseño §4, §7.19-23).
 *
 * 🔴 EL NIVEL ES DE LA LÍNEA, NO DEL CLIENTE (§7.19). El cliente tiene una lista
 *    por defecto; cada línea arranca ahí y se puede cambiar por producto sin
 *    tocar al cliente. Por eso este componente recibe `nivelDelCliente` sólo
 *    para COMPARAR, y nunca lo escribe.
 *
 * LOS CUATRO ESTADOS, y son los del diseño, no una simplificación:
 *   · igual al del cliente  → texto 11px/600 en `--ink-4`, sin borde. Está pero
 *                             no llama.
 *   · distinto              → chip con borde. Es la ÚNICA señal de que la línea
 *                             se apartó del cliente.
 *   · abierto               → el chip se marca como distinto y debajo se
 *                             despliega la fila de cinco opciones con su precio.
 *   · sin precio en el nivel→ `—` en `--warning-on-soft`. La línea no suma.
 *
 * 🔴 SE MUESTRA SIEMPRE, no sólo cuando difiere (§7.21) — y la decisión está
 *    escrita: *«ocultar el nivel esconde información que el cajero necesita para
 *    responder "¿a cuánto se lo estás dando?" sin abrir nada»*. El prop
 *    `nivelSoloSiDifiere` existe para comparar y descartar, como pide el diseño.
 *
 * ⚠️ LOS CINCO NIVELES SON UNA ESCALA, NO CINCO ESTADOS: no se pintan con la
 *    paleta de rol. `--action-soft` aparece SÓLO en la opción elegida del
 *    desplegable, porque ahí sí es una selección.
 */
export interface PriceLevelProps {
  /** El nivel de ESTA línea. `null` = la línea no salió de ninguna lista. */
  nivel: number | null
  /** El nivel por defecto del cliente. Sólo para COMPARAR; no se escribe. */
  nivelDelCliente: number | null
  /** Los cinco precios del producto. Vacío o nulo = producto sin listas. */
  precios: PrecioDeNivel[] | null | undefined
  /** `products.price`, la fuente de la etapa 1 para productos sin listas. */
  precioLegado?: number | null
  abierto: boolean
  onToggle: () => void
  onElegir: (nivel: number) => void
  /** ⚠️ Existe para comparar y descartar (§7.21). El diseño dice SIEMPRE. */
  nivelSoloSiDifiere?: boolean
  /** ⚠️ Existe para comparar (§7.23). Hoy los niveles se nombran L0–L4. */
  nombresNivel?: Record<number, string>
  testid?: string
}

export function PriceLevel({
  nivel,
  nivelDelCliente,
  precios,
  precioLegado,
  abierto,
  onToggle,
  onElegir,
  nivelSoloSiDifiere = false,
  nombresNivel,
  testid = 'price-level',
}: PriceLevelProps) {
  const nombre = (n: number) => nombresNivel?.[n] ?? etiquetaDeNivel(n)
  const difiere = nivel !== nivelDelCliente
  const precioActual = nivel === null ? null : precioDeNivel(precios, nivel, precioLegado)
  const sinPrecio = nivel !== null && precioActual === null

  // §7.21: el prop existe para comparar y descartar. El diseño dice SIEMPRE.
  if (nivelSoloSiDifiere && !difiere && !sinPrecio) return null

  // El chip se marca como distinto también cuando está ABIERTO (§4).
  const marcado = difiere || abierto || sinPrecio

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <button
        type="button"
        data-testid={testid}
        // 🔴 El ESTADO no vive sólo en el color y el borde: sin un portador
        //    semántico no se puede aseverar que existe, y un re-skin puede
        //    borrarlo sin que nada se ponga rojo.
        aria-expanded={abierto}
        data-nivel={nivel ?? ''}
        data-estado={sinPrecio ? 'sin-precio' : abierto ? 'abierto' : difiere ? 'distinto' : 'igual'}
        onClick={onToggle}
        style={
          marcado
            ? {
                height: 20,
                padding: '0 6px',
                borderRadius: 'var(--r-1)',
                background: sinPrecio ? 'var(--warning-soft)' : 'var(--surface-2)',
                border: `1px solid ${sinPrecio ? 'var(--warning)' : 'var(--border)'}`,
                color: sinPrecio ? 'var(--warning-on-soft)' : 'var(--ink)',
                font: '600 11px/1 inherit',
                cursor: 'pointer',
                alignSelf: 'flex-start',
              }
            : {
                // Igual al del cliente: está pero NO LLAMA. Sin borde ni fondo.
                padding: 0,
                background: 'none',
                border: 'none',
                color: 'var(--ink-4)',
                font: '600 11px/1 inherit',
                cursor: 'pointer',
                alignSelf: 'flex-start',
              }
        }
      >
        {nivel === null ? '—' : nombre(nivel)}
        {sinPrecio ? ' · sin precio' : ''}
      </button>

      {abierto && (
        <div
          data-testid={testid + '-opciones'}
          role="group"
          aria-label="Nivel de lista de esta línea"
          style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}
        >
          {NIVELES.map((n) => {
            const p = precioDeNivel(precios, n, precioLegado)
            const vacio = p === null
            const activo = n === nivel
            return (
              <button
                key={n}
                type="button"
                data-testid={testid + '-opcion-' + n}
                // El estado elegido, aseverable — no sólo pintado.
                aria-pressed={activo}
                // ⚠️ Un nivel sin precio NO SE PUEDE ELEGIR (§4). Y el guard va
                //    también en el manejador: `disabled` lo respeta el framework
                //    de pruebas por su cuenta, así que un caso escrito sobre el
                //    atributo mediría a Playwright y no al producto.
                disabled={vacio}
                onClick={() => { if (!vacio) onElegir(n) }}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-end',
                  gap: 1,
                  minWidth: 56,
                  padding: '3px 6px',
                  borderRadius: 'var(--r-1)',
                  // 🔴 `--action-soft` SÓLO acá: es el único lugar del componente
                  //    donde el nivel es una SELECCIÓN y no un punto de la escala.
                  background: activo ? 'var(--action-soft)' : 'var(--surface-2)',
                  border: `1px solid ${activo ? 'var(--action)' : 'var(--border)'}`,
                  color: vacio ? 'var(--ink-4)' : 'var(--ink)',
                  opacity: vacio ? 0.6 : 1,
                  cursor: vacio ? 'not-allowed' : 'pointer',
                  font: 'inherit',
                }}
              >
                <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--ink-3)' }}>
                  {nombre(n)}
                  {n === nivelDelCliente ? ' · cliente' : ''}
                </span>
                <span style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
                  {vacio ? '—' : formatoCOP(p)}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
