import type { ReactNode } from 'react'
import { formatoCOP } from '@/lib/formato'
import './ui.css'

/**
 * TenderSelector — §4, re-especificado el 2026-09-01 al cerrar §8.15.
 *
 * 🔴 VIVE SOBRE SUPERFICIE CLARA, no sobre `--ink`. La entrega lo definía sobre
 *    tinta porque dibujaba el cobro EN LÍNEA; el cobro de Nodo es EN MODAL, y
 *    esa decisión se cerró a favor del producto. Los tokens `--on-dark-*`
 *    siguen siendo del panel de cobro del mostrador y de los diálogos.
 *
 * 🔴 SELECCIONADO USA EL PAR DE ACCIÓN (`--action-soft` / `--action`), el mismo
 *    de la fila seleccionada y la pestaña activa: el selector marca UNA
 *    ELECCIÓN, no un estado del dominio. Ningún estado del dominio es azul.
 *
 * 🔴 CUANDO UN MEDIO ESTÁ BLOQUEADO, EL FALTANTE SE DICE EN PESOS (regla 7.2).
 *    Un botón apagado sin cifra no es información: el cajero no sabe si faltan
 *    mil pesos o un millón, ni qué decirle al cliente.
 *
 * ⚠️ N CELDAS, NO TRES (§8.16). La skill dibuja tres medios y el producto tiene
 *    cinco; `payment_method` es un contrato en 8 lados (R1) y recortarlo sería
 *    cambiar el producto para que quepa en el diseño. La grilla se acomoda; la
 *    celda conserva sus 52px, que es el objetivo táctil del cobro.
 */

export type Tender = {
  id: string
  label: string
  icon?: ReactNode
  /** Bloqueado. Exige `faltante` o `motivo`: apagar sin decir por qué está prohibido. */
  bloqueado?: boolean
  /** Cuánto falta, en pesos. Se imprime bajo la grilla. */
  faltante?: number
  /** Alternativa a `faltante` cuando el motivo no es una cifra. */
  motivo?: string
}

export function TenderSelector({
  tenders,
  seleccionado,
  onSelect,
  columnas = 4,
}: {
  tenders: Tender[]
  seleccionado: string
  onSelect: (id: string) => void
  columnas?: number
}) {
  const bloqueados = tenders.filter((t) => t.bloqueado && (t.faltante != null || t.motivo))

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columnas}, 1fr)`, gap: 10 }}>
        {tenders.map((t) => (
          <button
            key={t.id}
            type="button"
            data-testid={`pay-method-${t.id}`}
            className="nodo-tender"
            aria-pressed={seleccionado === t.id}
            disabled={t.bloqueado}
            onClick={() => onSelect(t.id)}
          >
            {t.icon}
            <span style={{ fontSize: 11.5, lineHeight: 1.2, textAlign: 'center' }}>{t.label}</span>
          </button>
        ))}
      </div>
      {bloqueados.map((t) => (
        <div
          key={t.id}
          data-testid={`pay-method-bloqueado-${t.id}`}
          style={{ marginTop: 8, fontSize: 12, color: 'var(--warning-on-soft)' }}
        >
          {t.label}: {t.faltante != null ? `faltan ${formatoCOP(t.faltante)} de cupo` : t.motivo}
        </div>
      ))}
    </div>
  )
}
