import { useState } from 'react'
import { toast } from 'react-hot-toast'
import { useCashShift } from '@/hooks/useCashShift'
import { useSedeConfig } from '@/hooks/useSedeConfig'
import {
  DEFAULT_EXPENSE_SUBCATEGORIES, NOTA_ACTIVO, esSubcategoriaDeActivo,
} from '@/lib/sedeConfig'
import { mensajeDeError } from '@/lib/errores'

/**
 * Formulario lateral de Gastos — A6 · tanda 3, §7.8.
 *
 * 🔴 POR QUÉ EXISTE, Y POR QUÉ NO ES RE-SKIN. §7.8 pide que Gastos tenga
 * «lienzo más frío, **formulario lateral** y franja de período». La pantalla
 * sólo listaba: el único camino de alta era el modal de movimientos del banner
 * de turno, que vive en **Mostrador** — para registrar el arriendo había que ir
 * a la pantalla de vender.
 *
 * ── DECISIÓN SOBRE EL CAMINO VIEJO (2026-09-03) ───────────────────────────
 * **El modal del banner de turno SE CONSERVA**, y la razón es que **no son el
 * mismo alta**: ese modal registra *cualquier* movimiento de caja —ingresos
 * (`base`, `abono_cliente`), retiros y `otro`— y este formulario registra
 * **sólo gastos**. Retirarlo quitaría capacidades que nada reemplaza.
 *
 * ⚠️ Y R1 se cumple donde importa: **la escritura es UNA sola**
 * (`useCashShift().addMovement`). Hay dos superficies, no dos implementaciones;
 * lo que se sincroniza solo es lo que no está duplicado.
 * **Disparador para revisarlo**, concreto: el día que los dos formularios pidan
 * campos distintos para el mismo gasto. Ahí dejan de ser dos vistas de lo mismo.
 *
 * 🔴 EXIGE JORNADA ABIERTA, y no es una preferencia: `cash_movements.jornada_id`
 * es `not null`. Sin jornada **el formulario no se ofrece** y la pantalla dice
 * por qué — mismo criterio que el botón que no se renderiza hasta que sus
 * insumos cargaron: un formulario que va a fallar es peor que su ausencia.
 */
export function RegistrarGastoForm() {
  const { isOpen, addMovement, isAddingMovement } = useCashShift()
  const { config } = useSedeConfig()
  const subcategorias = config.expense_subcategories ?? DEFAULT_EXPENSE_SUBCATEGORIES

  const [rawMonto, setRawMonto] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [subcategoria, setSubcategoria] = useState('')
  const [pagadoA, setPagadoA] = useState('')

  const monto = parseInt(rawMonto || '0', 10) || 0
  const puedeGuardar = monto > 0 && !isAddingMovement

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '9px 12px', borderRadius: 'var(--r-2)',
    border: '1px solid var(--border)', background: 'var(--surface)',
    color: 'var(--ink)', fontSize: 13, outline: 'none',
  }
  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 12, fontWeight: 600,
    color: 'var(--ink-2)', marginBottom: 6,
  }

  if (!isOpen) {
    return (
      <div
        data-testid="gasto-sin-jornada"
        style={{
          padding: '14px 16px', borderRadius: 'var(--r-3)',
          background: 'var(--warning-soft)', border: '1px solid var(--warning-border)',
          color: 'var(--warning-on-soft)', fontSize: 12.5, lineHeight: 1.5,
        }}
      >
        <strong>Abrí la jornada de caja para registrar un gasto.</strong> Un gasto
        sale del cajón del día, así que necesita una jornada a la cual atribuirse.
        El formulario no se muestra a propósito: guardarlo ahora fallaría.
      </div>
    )
  }

  const guardar = async () => {
    if (!puedeGuardar) return
    try {
      await addMovement({
        type: 'out',
        // La pantalla de Gastos registra GASTOS. `otro` y `retiro` siguen
        // viviendo en el modal de movimientos, que cubre todos los tipos.
        categoria: 'gasto',
        amount: monto,
        reason: descripcion.trim() || null,
        subcategoria: subcategoria || null,
        pagado_a: pagadoA.trim() || null,
      })
      toast.success('Gasto registrado')
      setRawMonto(''); setDescripcion(''); setSubcategoria(''); setPagadoA('')
    } catch (err) {
      toast.error(mensajeDeError(err, 'No se pudo registrar el gasto'))
    }
  }

  return (
    <div
      data-testid="gasto-form"
      style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 'var(--r-3)', padding: 16,
        display: 'flex', flexDirection: 'column', gap: 12,
      }}
    >
      <div>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', margin: 0 }}>
          Registrar gasto
        </h3>
        <p style={{ fontSize: 11.5, color: 'var(--ink-3)', margin: '4px 0 0', lineHeight: 1.45 }}>
          Sale de la caja del día. Las compras a proveedor van en Compras.
        </p>
      </div>

      <div>
        <label style={labelStyle}>Monto <span style={{ color: 'var(--danger)' }}>*</span></label>
        <input
          type="text"
          inputMode="numeric"
          data-testid="gasto-monto"
          value={rawMonto}
          onChange={(e) => setRawMonto(e.target.value.replace(/\D/g, ''))}
          placeholder="0"
          style={{ ...inputStyle, fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}
        />
      </div>

      <div>
        <label style={labelStyle}>
          Subcategoría <span style={{ color: 'var(--ink-4)', fontWeight: 500 }}>(opcional)</span>
        </label>
        {/* Desplegable y no texto libre, igual que en el modal (deuda 45):
            "publicidad" y "Publicidad" serían dos filas del reporte. */}
        <select
          data-testid="gasto-subcategoria"
          value={subcategoria}
          onChange={(e) => setSubcategoria(e.target.value)}
          style={{ ...inputStyle, cursor: 'pointer', appearance: 'auto' }}
        >
          <option value="">Sin clasificar</option>
          {subcategorias.map((sc) => <option key={sc} value={sc}>{sc}</option>)}
        </select>
        {esSubcategoriaDeActivo(subcategoria) && (
          <p style={{ margin: '6px 0 0', fontSize: 11.5, color: 'var(--warning-on-soft)', lineHeight: 1.45 }}>
            {NOTA_ACTIVO}
          </p>
        )}
      </div>

      <div>
        <label style={labelStyle}>Descripción</label>
        <input
          type="text"
          data-testid="gasto-descripcion"
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          placeholder="Ej: energía — factura de agosto"
          style={inputStyle}
        />
      </div>

      <div>
        <label style={labelStyle}>
          Pagado a <span style={{ color: 'var(--ink-4)', fontWeight: 500 }}>(opcional)</span>
        </label>
        <input
          type="text"
          data-testid="gasto-pagado-a"
          value={pagadoA}
          onChange={(e) => setPagadoA(e.target.value)}
          placeholder="Nombre de la persona o del negocio"
          style={inputStyle}
        />
      </div>

      <button
        data-testid="gasto-guardar"
        onClick={guardar}
        disabled={!puedeGuardar}
        style={{
          padding: '10px 16px', borderRadius: 'var(--r-2)', border: 'none',
          background: puedeGuardar ? 'var(--action)' : 'var(--border-2)',
          color: puedeGuardar ? '#fff' : 'var(--ink-4)',
          fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
          cursor: puedeGuardar ? 'pointer' : 'not-allowed',
        }}
      >
        {isAddingMovement ? 'Guardando…' : 'Guardar gasto'}
      </button>
    </div>
  )
}
