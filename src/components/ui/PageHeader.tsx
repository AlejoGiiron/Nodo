import type { ReactNode } from 'react'
import './ui.css'

/**
 * PageHeader — el encabezado de pantalla, para las nueve.
 *
 * 🔴 SIN EYEBROW. Las pantallas heredadas abren con un rótulo de sección
 *    ("ADMINISTRACIÓN", "OPERACIÓN") en mayúscula sostenida y color de acento.
 *    La skill reserva la mayúscula sostenida a DOS lugares —etiqueta de columna
 *    y de KPI (`--fs-label`)— y el §5 pide títulos en caja de oración. Un
 *    eyebrow además repite lo que la navegación ya dice: el ítem activo del
 *    sidebar es el que ubica al usuario.
 *
 * 🔴 EL TÍTULO ES `--fs-head`: 16px/600. Las pantallas heredadas usan 22/700,
 *    que compite con el único número grande del producto (el total a cobrar,
 *    44px — regla 7.4). El encabezado ubica; no es el contenido.
 *
 * ⚠️ Nota de estructura, porque diverge de la maqueta y conviene decirlo: la
 *    maqueta pone el título en la barra de 56px del §3, junto a "Atajos" y el
 *    selector de estado. En Nodo esa barra la ocupa la BARRA DE JORNADA, que la
 *    maqueta no modela porque no dibuja turnos de caja. Así que el título vive
 *    debajo. Es una divergencia de estructura, no de tokens.
 */

export type PageTab = {
  id: string
  label: string
  testid?: string
}

export function PageHeader({
  titulo,
  descripcion,
  accion,
  tabs,
  tabActivo,
  onTab,
}: {
  /**
   * En CAJA DE ORACIÓN (§5): "Despachos del día", no "DESPACHOS DEL DÍA".
   *
   * 🔴 Y ES EL TÍTULO QUE YA TENÍA LA PANTALLA, no uno más corto. Un título
   *    es INFORMACIÓN, no estilo: acortarlo es un cambio de producto colado en
   *    un cambio visual. Un re-skin es la misma información con el design
   *    system nuevo — la misma línea que hace que no se agreguen KPI ni
   *    columnas de paso. (Medido: acorté "Historial de turnos" a "Turnos" y un
   *    spec lo cazó.)
   */
  titulo: string
  /**
   * Va en la misma línea, en gris: dice qué es la pantalla, no la repite.
   * ⚠️ Mismo criterio que el título: se puede acortar la redacción, no quitar
   * información. El "por sede" de estas pantallas dice el ALCANCE de lo que se
   * está mirando, que en un producto multi-sede no es relleno.
   *
   * 🔴 EL CASO COMPLETO, porque las dos mitades se cazaron distinto:
   *    · el TÍTULO acortado lo cazó un test — `historiales.spec` lo aserta.
   *    · las CUATRO DESCRIPCIONES no las cazó nada. Aparecieron auditando la
   *      clase después de la primera instancia (R3: cuando una aparece, se
   *      busca la forma en todo el repo).
   *    O sea: el verificador cubría UNA de las cinco. Las otras cuatro dependían
   *    de acordarse de buscar, que es justo lo que R3 existe para no dejar
   *    librado a la memoria.
   */
  descripcion?: string
  /** La acción primaria de la pantalla, alineada a la derecha. */
  accion?: ReactNode
  tabs?: PageTab[]
  tabActivo?: string
  onTab?: (id: string) => void
}) {
  return (
    <div
      style={{
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        padding: tabs ? '16px 24px 0' : '16px 24px',
        position: 'sticky',
        top: 0,
        zIndex: 10,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, minHeight: 24 }}>
        <h1
          style={{
            fontSize: 16,
            fontWeight: 600,
            letterSpacing: '-0.015em',
            color: 'var(--ink)',
            margin: 0,
          }}
        >
          {titulo}
        </h1>
        {descripcion && (
          <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{descripcion}</span>
        )}
        {accion && <div style={{ marginLeft: 'auto' }}>{accion}</div>}
      </div>

      {tabs && (
        // Tabs del §4: el activo lleva borde --action, fondo --action-soft y
        // texto --action-on-soft — el MISMO par que la fila seleccionada y el
        // NavItem activo. Marca una elección, no un estado del dominio.
        <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
          {tabs.map((t) => (
            <button
              key={t.id}
              data-testid={t.testid}
              onClick={() => onTab?.(t.id)}
              className={`nodo-tab${tabActivo === t.id ? ' nodo-tab--activo' : ''}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
