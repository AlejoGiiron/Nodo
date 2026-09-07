import { useState } from 'react'
import { Pencil, Archive, ImageOff } from 'lucide-react'
import { MoneyCell } from '@/components/ui/MoneyCell'
import { Badge } from '@/components/ui/Badge'
import type { ProductWithCategory } from '@/stores/cartStore'

/**
 * Fila del Catálogo — A6 · tanda 4, §7.3.
 *
 * 🔴 «**Filas, no tarjetas.** Un catálogo de cuatro mil referencias en tarjetas
 * redondeadas es ilegible y lento. La tarjeta se reserva para KPI, ficha y
 * formularios.» El catálogo se dibujaba con `ProductCard` en una rejilla de
 * tres columnas.
 *
 * ⚠️ **Con los productos del lab las tarjetas se veían bien, y ése es el
 * argumento a favor de cambiarlo ahora y no después:** cuando el catálogo
 * crezca, nadie va a asociar la lentitud con esta decisión.
 *
 * ── LOS (d) QUE SOBREVIVEN, Y POR QUÉ ─────────────────────────────────────
 * La maqueta del Catálogo **no dibuja** ni imagen de producto ni existencia.
 * Son **(d) NO DIBUJADO**: el producto los tiene y nadie decidió quitarlos, así
 * que migrar a filas **no puede hacerlos desaparecer** — eso sería la maqueta
 * borrando funcionalidad probada. La imagen pasa a miniatura y la existencia a
 * su propia columna.
 *
 * ── CÓDIGO Y UNIDAD, DESDE EL 2026-09-07 (deuda 41) ───────────────────────
 * Las dos ya existen en el esquema y se pintan como las dibuja la maqueta:
 * `CÓDIGO` primero —con `tabular-nums`, que el §2 hace obligatorio para el
 * código de producto— y `UNID` en una columna angosta.
 * ⚠️ Cuando falten van con `—`: §7.5, el guión no es un cero, dice que el dato
 * no aplica. Eso es distinto de pintar una columna que **nadie** puede llenar,
 * que es lo que se evitaba antes de que la columna existiera.
 *
 * ── LO QUE SIGUE SIN ESTAR, Y NO ES UN OLVIDO ─────────────────────────────
 * La maqueta muestra además `COSTO` y `MARGEN`. No se pintan: **no tienen
 * permiso que los gatee** (deuda 42).
 */
export function ProductRow({
  product, onEdit, onDeactivate,
}: {
  product: ProductWithCategory
  onEdit: () => void
  onDeactivate: () => void
}) {
  // 🔴 LA CONFIRMACIÓN DE DESACTIVAR VIAJA CON LA FILA. La tarjeta la tenía y
  //    migrar a filas por poco se la lleva puesta: desactivar es destructivo
  //    para el catálogo, y §8.8 dice que el patrón de confirmación destructiva
  //    **no está diseñado** — así que se conserva el que existe en vez de
  //    inventar otro. Lo cazó `productos.spec`, que lo aseveraba.
  const [confirmando, setConfirmando] = useState(false)
  const color = product.categories?.color ?? 'var(--ink-4)'
  const sinStock = product.stock_tracking && (product.stock_qty ?? 0) <= 0
  const negativo = product.stock_tracking && (product.stock_qty ?? 0) < 0

  return (
    <div
      data-testid="catalogo-row"
      className="nodo-fila"
      style={{
        display: 'grid',
        gridTemplateColumns: '34px 84px 1fr 130px 54px 190px 110px 150px',
        gap: 12,
        alignItems: 'center',
        padding: '8px 16px',
        borderBottom: '1px solid var(--border-2)',
        // §4 DataRow: `--attention` es para la fila que reclama atención sin ser
        // un error. Un producto sin existencia es exactamente eso.
        background: negativo ? 'var(--danger-soft)' : sinStock ? 'var(--attention)' : 'var(--surface)',
      }}
    >
      {/* Miniatura — (d): la maqueta no la dibuja, el producto la tiene. */}
      {product.image_url ? (
        <img
          src={product.image_url}
          alt=""
          style={{ width: 30, height: 30, borderRadius: 6, objectFit: 'cover' }}
        />
      ) : (
        <div
          style={{
            width: 30, height: 30, borderRadius: 6, background: 'var(--border-2)',
            display: 'grid', placeItems: 'center', color: 'var(--ink-4)',
          }}
        >
          <ImageOff size={13} />
        </div>
      )}

      {/* CÓDIGO — §2: `tabular-nums` es OBLIGATORIO en el código de producto.
          Es el modo de búsqueda del mostrador, así que se lee por dígito. */}
      <span
        data-testid="catalogo-codigo"
        style={{
          fontSize: 12.5, color: 'var(--ink-3)', fontVariantNumeric: 'tabular-nums',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}
      >
        {product.codigo ?? '—'}
      </span>

      <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 3, alignSelf: 'stretch', borderRadius: 2, background: color, flexShrink: 0 }} />
        <span
          style={{
            fontSize: 14, color: 'var(--ink)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}
        >
          {product.name}
        </span>
      </div>

      <span
        style={{
          fontSize: 12.5, color: 'var(--ink-3)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}
      >
        {product.categories?.name ?? '—'}
      </span>

      {/* UNID — §2 la tipa como `--fs-meta`: es una etiqueta, no una cifra. */}
      <span
        data-testid="catalogo-unidad"
        style={{
          fontSize: 12, color: 'var(--ink-4)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}
      >
        {product.unidad ?? '—'}
      </span>

      {/* Existencia — (d). `—` cuando el producto no se inventaría: §7.5, el
          guión no es un cero, significa que el dato no aplica.
          🔴 La ALERTA DE SOBREVENTA también viaja: es otro (d) que la migración
             a filas por poco se lleva puesto. Lo cazó `extras-pos.spec`. */}
      <span style={{ textAlign: 'right', display: 'inline-flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
        {negativo && (
          <span
            data-testid="oversold-alert"
            style={{
              padding: '2px 6px', borderRadius: 'var(--r-1)',
              background: 'var(--danger-soft)', color: 'var(--danger-on-soft)',
              fontSize: 10.5, fontWeight: 700, whiteSpace: 'nowrap',
            }}
          >
            {/* El NÚMERO va en el texto, no en un `title`: el spec asevera
                cuánto hay que reponer, y tiene razón — lo que el (d) aportaba
                era la cifra, no el hecho de que exista sobreventa. En un
                atributo no se lee. */}
            Sobreventa: reponer {Math.abs(product.stock_qty ?? 0)}
          </span>
        )}
        {product.stock_tracking ? (
          <Badge
            data-testid="stock-badge"
            tone={negativo ? 'danger' : sinStock ? 'warning' : 'success'}
          >
            {product.stock_qty ?? 0}
          </Badge>
        ) : (
          <span style={{ fontSize: 12.5, color: 'var(--ink-4)' }}>—</span>
        )}
      </span>

      {/* §7.9 + §4 MoneyCell: alineado a la derecha, `tabular-nums`, y SIN
          símbolo de peso — el encabezado ya dice qué es. */}
      <MoneyCell
        data-testid="catalogo-precio"
        value={product.price}
        style={{ fontWeight: 600 }}
      />

      <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
        <button
          onClick={onEdit}
          title="Editar"
          style={{
            width: 30, height: 30, borderRadius: 'var(--r-2)', cursor: 'pointer',
            border: '1px solid var(--border)', background: 'var(--surface)',
            color: 'var(--ink-2)', display: 'grid', placeItems: 'center',
          }}
        >
          <Pencil size={14} />
        </button>
        {!confirmando ? (
          <button
            onClick={() => setConfirmando(true)}
            title="Desactivar"
            style={{
              width: 30, height: 30, borderRadius: 'var(--r-2)', cursor: 'pointer',
              border: '1px solid var(--border)', background: 'var(--surface)',
              color: 'var(--ink-2)', display: 'grid', placeItems: 'center',
            }}
          >
            <Archive size={14} />
          </button>
        ) : (
          <>
            <button
              onClick={() => setConfirmando(false)}
              title="Cancelar"
              style={{
                height: 30, padding: '0 8px', borderRadius: 'var(--r-2)', cursor: 'pointer',
                border: '1px solid var(--border)', background: 'var(--surface)',
                color: 'var(--ink-3)', fontSize: 11.5, fontFamily: 'inherit',
              }}
            >
              No
            </button>
            <button
              onClick={onDeactivate}
              style={{
                height: 30, padding: '0 8px', borderRadius: 'var(--r-2)', cursor: 'pointer',
                border: '1px solid var(--danger-soft)', background: 'var(--surface)',
                color: 'var(--danger)', fontSize: 11.5, fontWeight: 600, fontFamily: 'inherit',
                whiteSpace: 'nowrap',
              }}
            >
              Sí, desactivar
            </button>
          </>
        )}
      </div>
    </div>
  )
}
