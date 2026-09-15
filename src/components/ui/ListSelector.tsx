import { NIVELES, etiquetaDeNivel } from '@/lib/niveles'
import { NIVEL_PRECIO_DEFAULT } from '@/lib/sedeConfig'

/**
 * ListSelector — la lista POR DEFECTO de un cliente (diseño §4, §7.19).
 *
 * 🔴 ES UN DEFECTO, NO UNA ATADURA. Lo que elige acá es dónde ARRANCA cada línea
 *    de sus ventas; cada línea se puede mover después sin tocar al cliente. Por
 *    eso el control vive en la ficha y no en el cobro: es un dato del cliente,
 *    no de la venta.
 *
 * ⚠️ L0 VA DESHABILITADA mientras no tenga precios. Hoy está vacía en todo el
 *    catálogo (§7.22) y qué significa no está decidido (§8.20). Ofrecerla
 *    pudiendo elegirse dejaría al cliente cotizado contra una lista que no
 *    existe — y el síntoma sería todas sus líneas en `—`.
 *
 * ⚠️ SIN LISTA ASIGNADA NO SE MARCA NINGUNA, y la nota dice a qué nivel se vende
 *    mientras tanto. Marcar L1 por defecto afirmaría que alguien la eligió: un
 *    dato nuestro escrito como si fuera de ella, que es lo que este proyecto
 *    viene separando en cada carga.
 */
export interface ListSelectorProps {
  value: number | null
  onChange: (nivel: number | null) => void
  /** Niveles sin ningún precio cargado en el catálogo: no se pueden elegir. */
  nivelesVacios?: number[]
  disabled?: boolean
  testid?: string
}

export function ListSelector({
  value,
  onChange,
  nivelesVacios = [0],
  disabled = false,
  testid = 'list-selector',
}: ListSelectorProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div
        data-testid={testid}
        role="radiogroup"
        aria-label="Lista de precios por defecto"
        style={{
          display: 'flex',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r-2)',
          overflow: 'hidden',
          width: 'fit-content',
        }}
      >
        {NIVELES.map((n) => {
          const vacio = nivelesVacios.includes(n)
          const activo = value === n
          return (
            <button
              key={n}
              type="button"
              data-testid={`${testid}-${n}`}
              role="radio"
              // El estado va en un portador semántico, no sólo en el fondo: un
              // re-skin puede llevarse el color sin que nada se ponga rojo.
              aria-checked={activo}
              disabled={disabled || vacio}
              title={vacio ? `L${n} no tiene precios cargados todavía` : undefined}
              onClick={() => { if (!vacio && !disabled) onChange(activo ? null : n) }}
              style={{
                width: 30,
                height: 30,
                border: 'none',
                borderRight: n === 4 ? 'none' : '1px solid var(--border)',
                background: activo ? 'var(--action-soft)' : 'var(--surface)',
                color: vacio ? 'var(--ink-4)' : activo ? 'var(--action-on-soft)' : 'var(--ink-2)',
                boxShadow: activo ? 'inset 0 -2px 0 var(--action)' : 'none',
                font: '600 12px/1 inherit',
                cursor: vacio || disabled ? 'not-allowed' : 'pointer',
              }}
            >
              {etiquetaDeNivel(n)}
            </button>
          )
        })}
      </div>

      {value === null && (
        <div
          data-testid={`${testid}-sin-lista`}
          style={{ fontSize: 11.5, color: 'var(--warning-on-soft)', lineHeight: 1.4 }}
        >
          {/* 🔴 DICE A QUÉ NIVEL SE VENDE MIENTRAS TANTO, y por qué esa frase y
              no otra: §8.19 declara que «a qué nivel se le vende a un cliente
              sin lista» es una regla de NEGOCIO sin confirmar. El diseño asume
              L{NIVEL_PRECIO_DEFAULT} y **lo dice en pantalla** en vez de
              esconderlo — una suposición visible se puede corregir; una
              silenciosa se convierte en premisa. */}
          Sin lista asignada: sus ventas arrancan en {etiquetaDeNivel(NIVEL_PRECIO_DEFAULT)}.
        </div>
      )}
    </div>
  )
}
