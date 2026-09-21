import { useState } from 'react'
import { Download, AlertTriangle } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { useBalance } from '@/hooks/useBalance'
import { buildBalanceWorkbook } from '@/lib/exportes'
import { descargarWorkbook } from '@/lib/descargarExcel'
import { Button } from '@/components/ui/Button'

// ============================================================================
// EL BALANCE · «cuánto deberíamos tener»
//
// 🔴 ES ACUMULADO DESDE EL INICIO Y LO DICE EN PANTALLA. Reportes tiene un
//    selector de fechas arriba que NO aplica acá: un balance de siete días
//    diría que arrancó con quince millones el lunes. `ReportsPage` esconde el
//    selector mientras esta pestaña está activa, y acá se declara el período
//    real. Un control visible que no hace nada es una nota que dirige mal, y en
//    la pantalla eso cuesta más caro que en un documento.
//
// 🔴 NO SE PINTA UN SOLO NÚMERO HASTA QUE EL DATO ESTÁ CONFIRMADO. Esto afirma
//    cuánta plata debería haber, y ella lo va a cruzar contra lo que tiene en la
//    mano: mostrar el caché de otra sede un instante sería una confirmación
//    falsa sobre plata ajena.
// ============================================================================

const COP = (n: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n)

function Linea({ rotulo, valor, fuerte, tono, testid }: {
  rotulo: string
  valor: string
  fuerte?: boolean
  tono?: 'normal' | 'malo'
  testid?: string
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
      padding: '9px 0', borderTop: '1px solid var(--border-2)', gap: 16,
    }}>
      <span style={{ fontSize: 13, color: fuerte ? 'var(--ink)' : 'var(--ink-2)', fontWeight: fuerte ? 700 : 500 }}>
        {rotulo}
      </span>
      <span
        data-testid={testid}
        style={{
          fontSize: fuerte ? 16 : 13.5,
          fontWeight: fuerte ? 700 : 600,
          fontVariantNumeric: 'tabular-nums',
          color: tono === 'malo' ? 'var(--danger)' : 'var(--ink)',
          whiteSpace: 'nowrap',
        }}
      >
        {valor}
      </span>
    </div>
  )
}

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 18px' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
        {titulo}
      </div>
      {children}
    </div>
  )
}

export function BalancePanel() {
  const { balance: b, confirmado, error } = useBalance()
  const [exportando, setExportando] = useState(false)

  if (error) {
    return (
      <div data-testid="balance-error" style={{ padding: 24, color: 'var(--danger)', fontSize: 13 }}>
        No se pudo cargar el balance. Volvé a intentar; si sigue, avisanos antes de sacar cuentas con otro número.
      </div>
    )
  }

  // Un número viejo acá afirma plata. Mientras no esté confirmado, no hay cifras.
  if (!confirmado || !b) {
    return (
      <div data-testid="balance-cargando" style={{ padding: 24, color: 'var(--ink-4)', fontSize: 13 }}>
        Calculando el balance...
      </div>
    )
  }

  async function exportar() {
    if (!b) return
    setExportando(true)
    try {
      const { default: ExcelJS } = await import('exceljs')
      const wb = new ExcelJS.Workbook()
      wb.creator = 'Nodo'
      buildBalanceWorkbook(wb, {
        balance: b,
        sede: b.sedeNombre,
        generado: format(new Date(), "d 'de' MMMM yyyy, HH:mm", { locale: es }),
      })
      await descargarWorkbook(wb, 'balance')
    } catch {
      toast.error('Error al exportar el balance')
    } finally {
      setExportando(false)
    }
  }

  const desde = b.desde
    ? format(new Date(`${b.desde}T12:00:00`), "d 'de' MMMM 'de' yyyy", { locale: es })
    : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* 🔴 El período REAL, dicho. El selector de arriba no aplica a esto. */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div data-testid="balance-periodo" style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>
          {desde
            ? <>Todo lo que pasó <strong style={{ color: 'var(--ink-2)' }}>desde el {desde}</strong> hasta hoy. No depende del rango de fechas.</>
            : <>Acumulado desde que arrancó el negocio hasta hoy. No depende del rango de fechas.</>}
        </div>
        <Button variant="secondary" data-testid="balance-exportar" onClick={exportar} disabled={exportando}>
          <Download size={14} /> {exportando ? 'Exportando...' : 'Exportar a Excel'}
        </Button>
      </div>

      {!b.configurado && (
        <div
          data-testid="balance-sin-capital"
          style={{ background: 'var(--attention)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', fontSize: 13, color: 'var(--ink-2)' }}
        >
          <strong>Falta decir con cuánta plata arrancaste.</strong> Sin ese dato no se puede calcular
          cuánto deberías tener hoy — y poner cero diría que arrancaste sin nada, que no es cierto.
          Se carga en <strong>Configuración → Sede</strong>. Lo de abajo, cómo le fue al negocio, no
          depende de ese dato y ya está calculado.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>

        {b.configurado && (
          <Bloque titulo="Cuánto deberías tener">
            <Linea rotulo="Con lo que arrancaste" valor={COP(b.capital!)} />
            <Linea rotulo="Entró (ventas cobradas y abonos)" valor={`+ ${COP(b.entradas)}`} />
            <Linea rotulo="Salió (mercancía, gastos, retiros)" valor={`− ${COP(b.salidas)}`} />
            <Linea rotulo="Deberías tener hoy" valor={COP(b.efectivo!)} fuerte testid="balance-efectivo" />
            <div style={{ fontSize: 11.5, color: 'var(--ink-4)', marginTop: 6 }}>
              Es plata en caja <em>y</em> en banco junta: la mayoría de los cobros no son en efectivo.
            </div>
          </Bloque>
        )}

        {b.configurado && (
          <Bloque titulo="Dónde está tu plata">
            <Linea rotulo="En caja y banco" valor={COP(b.efectivo!)} />
            <Linea rotulo="En mercancía (a costo)" valor={COP(b.inventario)} />
            <Linea rotulo="Te deben (cartera)" valor={COP(b.cartera)} />
            <Linea rotulo="Total hoy" valor={COP(b.patrimonio!)} fuerte testid="balance-patrimonio" />
            <Linea
              rotulo="Contra lo que pusiste"
              valor={`${b.contraCapital! >= 0 ? '+' : '−'} ${COP(Math.abs(b.contraCapital!))}`}
              tono={b.contraCapital! < 0 ? 'malo' : 'normal'}
              testid="balance-contra-capital"
            />
          </Bloque>
        )}

        <Bloque titulo="Cómo le fue al negocio">
          <Linea rotulo="Vendido" valor={COP(b.vendido)} />
          <Linea rotulo="Lo que costó esa mercancía" valor={`− ${COP(b.costoVendido)}`} />
          <Linea rotulo="Deja la venta" valor={COP(b.utilidadBruta)} />
          <Linea rotulo="Gastos" valor={`− ${COP(b.gastos)}`} />
          <Linea
            rotulo="Resultado"
            valor={COP(b.resultado)}
            fuerte
            tono={b.resultado < 0 ? 'malo' : 'normal'}
            testid="balance-resultado"
          />
          {b.retiros > 0 && (
            <div style={{ fontSize: 11.5, color: 'var(--ink-4)', marginTop: 6 }}>
              Aparte, sacaste {COP(b.retiros)}. Eso baja lo que hay adentro pero no es una pérdida
              del negocio: es plata tuya que te llevaste.
            </div>
          )}
        </Bloque>
      </div>

      {/* 🔴 El descuadre se MUESTRA. Repartirlo en silencio haría que los dos
          bloques de arriba cerraran sin que nadie supiera por qué. */}
      {(Math.round(b.descuadreDeMercancia) !== 0 || b.hayHuecos || b.entradasSinClasificar > 0) && (
        <div
          data-testid="balance-falta-explicar"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 18px' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
            <AlertTriangle size={14} color="var(--ink-3)" />
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: 1 }}>
              Lo que falta explicar
            </span>
          </div>
          {Math.round(b.descuadreDeMercancia) !== 0 && (
            <Linea rotulo="Mercancía comprada que no está ni vendida ni en bodega" valor={COP(b.descuadreDeMercancia)} testid="balance-descuadre" />
          )}
          {b.entradasSinClasificar > 0 && (
            <Linea rotulo="Entradas de caja sin clasificar (no se cuentan como ganancia)" valor={COP(b.entradasSinClasificar)} />
          )}
          {b.productosSinCosto > 0 && (
            <div data-testid="balance-sin-costo" style={{ fontSize: 12.5, color: 'var(--ink-2)', marginTop: 10, lineHeight: 1.5 }}>
              Hay <strong>{b.productosSinCosto} producto{b.productosSinCosto !== 1 ? 's' : ''}</strong> con
              existencia y sin costo cargado, <strong>{b.unidadesSinCosto} unidad{b.unidadesSinCosto !== 1 ? 'es' : ''}</strong> en
              total. Valen cero al sumar el inventario, así que son la causa más probable del
              descuadre: cargándoles el costo, la cuenta cierra sola.
            </div>
          )}
          {b.lineasVentaSinCosto > 0 && (
            <div style={{ fontSize: 12.5, color: 'var(--ink-2)', marginTop: 8, lineHeight: 1.5 }}>
              Y hay <strong>{b.lineasVentaSinCosto} línea{b.lineasVentaSinCosto !== 1 ? 's' : ''} de venta</strong> sin
              costo: esas ventas aparecen con toda la plata como ganancia, así que la ganancia real
              es algo menor que la de arriba.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
