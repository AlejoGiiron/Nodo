import { describe, it, expect } from 'vitest'
import { derivarBalance, type ComponentesBalance } from './balance'

// ============================================================================
// EL BALANCE · la aritmética que ve la clienta
//
// 🔴 LOS NÚMEROS DE `REAL` SON MEDIDOS, no inventados: salen de la sede de
//    Muscle Pro el 2026-09-21, por consulta de sólo lectura. Un caso escrito
//    con cifras redondas habría pasado igual y no habría probado que la
//    aritmética aguanta decimales ni un resultado NEGATIVO, que es justamente
//    lo que estos datos tienen.
//
// 🔴 Y EL CASO QUE DE VERDAD VERIFICA ES LA IDENTIDAD, no los totales. Un total
//    se puede reproducir copiando la misma cuenta dos veces —eso es escribir la
//    afirmación dos veces, no verificarla—. La identidad relaciona DOS caminos
//    independientes (el patrimonio, que sale de la caja y el inventario; y el
//    resultado, que sale de ventas y gastos) y sólo cierra si los dos están
//    bien:
//
//        patrimonio  =  capital + resultado − retiros − descuadre
//                       + entradasSinClasificar
//
//    🔴 Y NO ES UN TEST DECORATIVO: la primera versión de la aritmética se puso
//    ROJA acá por 75.000 — las entradas de caja sin clasificar subían el
//    patrimonio y no estaban en ninguna cuenta. El defecto era mío y lo encontró
//    esta aserción, no una relectura.
// ============================================================================

/** Sede real, 2026-09-21. Ver la cabecera. */
const REAL: ComponentesBalance = {
  sede_nombre: 'Muscle Pro',
  capital_inicial: 15_000_000,
  capital_inicial_desde: '2026-08-31',
  cobrado_ventas: 10_117_600,
  abonos: 1_810_600,
  otras_entradas: 0,
  compras: 19_762_523.38,
  devoluciones_proveedor: 0,
  gastos: 5_631_200,
  retiros: 0,
  otras_salidas: 0,
  vendido: 13_024_300,
  costo_vendido: 10_230_224.67,
  inventario_a_costo: 9_260_098.72,
  cartera: 1_096_100,
  productos_sin_costo: 5,
  unidades_sin_costo: 29,
  lineas_venta_sin_costo: 8,
}

/** El verificador de verdad: los dos caminos tienen que encontrarse. */
function identidadCierra(c: ComponentesBalance) {
  const b = derivarBalance(c)
  if (b.patrimonio == null || b.capital == null) return null
  return b.patrimonio - (
    b.capital + b.resultado - b.retiros - b.descuadreDeMercancia + b.entradasSinClasificar
  )
}

describe('balance de la sede', () => {
  it('🔴 la identidad cierra: patrimonio = capital + resultado − retiros − descuadre', () => {
    expect(
      identidadCierra(REAL),
      'los dos caminos del balance no se encuentran: el patrimonio (caja + mercancía + ' +
      'cartera) tiene que dar lo mismo que el capital más el resultado, descontando ' +
      'retiros y la mercancía sin explicar',
    ).toBeCloseTo(0, 6)
  })

  it('la identidad cierra TAMBIÉN con retiros, devoluciones y salidas sin clasificar', () => {
    // CONTROL: con todo en cero, la identidad se cumple por construcción y no
    // prueba nada. Acá los cuatro términos que el caso de arriba tiene en cero
    // valen algo, así que cada uno puede romperla.
    const variado: ComponentesBalance = {
      ...REAL,
      retiros: 2_000_000,
      devoluciones_proveedor: 450_000,
      otras_salidas: 130_000,
      otras_entradas: 75_000,
    }
    expect(identidadCierra(variado)).toBeCloseTo(0, 6)
  })

  it('los totales que va a ver la clienta', () => {
    const b = derivarBalance(REAL)
    expect(b.efectivo, 'plata que debería haber hoy').toBeCloseTo(1_534_476.62, 2)
    expect(b.inventario).toBeCloseTo(9_260_098.72, 2)
    expect(b.cartera).toBeCloseTo(1_096_100, 2)
    expect(b.patrimonio, 'todo lo que tiene hoy').toBeCloseTo(11_890_675.34, 2)
    expect(b.contraCapital, 'puso 15 millones y hoy vale menos').toBeCloseTo(-3_109_324.66, 2)
    expect(b.utilidadBruta, 'lo que dejan las ventas').toBeCloseTo(2_794_075.33, 2)
    expect(b.resultado, 'los gastos se comen el margen').toBeCloseTo(-2_837_124.67, 2)
    expect(b.descuadreDeMercancia, 'mercancía comprada que no está ni vendida ni en bodega')
      .toBeCloseTo(272_199.99, 2)
  })

  it('🔴 SIN capital cargado no inventa un cero: deja el hueco en nulo', () => {
    // Un 0 afirmaría que arrancó sin plata — plausible y falso, y arrastraría un
    // patrimonio y una diferencia igual de falsos. El nulo deja que la pantalla
    // pida el dato en vez de mostrar un balance que miente.
    const b = derivarBalance({ ...REAL, capital_inicial: null })
    expect(b.configurado).toBe(false)
    expect(b.efectivo).toBeNull()
    expect(b.patrimonio).toBeNull()
    expect(b.contraCapital).toBeNull()
    // Y lo que NO depende del capital se sigue calculando: el resultado del
    // negocio no necesita saber con cuánto arrancó.
    expect(b.resultado).toBeCloseTo(-2_837_124.67, 2)
  })

  it('🔴 un retiro baja el patrimonio pero NO es una pérdida del negocio', () => {
    const b = derivarBalance({ ...REAL, retiros: 1_000_000 })
    const base = derivarBalance(REAL)
    expect(
      b.resultado,
      'sacar plata no puede leerse como que el negocio perdió: es una distribución',
    ).toBeCloseTo(base.resultado, 2)
    expect(b.patrimonio!, 'pero sí hay un millón menos adentro').toBeCloseTo(base.patrimonio! - 1_000_000, 2)
  })

  it('una devolución al proveedor DEVUELVE plata: baja las salidas', () => {
    const b = derivarBalance({ ...REAL, devoluciones_proveedor: 500_000 })
    const base = derivarBalance(REAL)
    expect(b.efectivo!).toBeCloseTo(base.efectivo! + 500_000, 2)
  })

  it('los huecos se declaran: hay productos y líneas sin costo', () => {
    expect(derivarBalance(REAL).hayHuecos).toBe(true)
    // CONTROL NEGATIVO: sin huecos tiene que decir que no los hay, o el aviso
    // sería permanente y dejaría de informar.
    expect(
      derivarBalance({ ...REAL, productos_sin_costo: 0, unidades_sin_costo: 0, lineas_venta_sin_costo: 0 }).hayHuecos,
    ).toBe(false)
  })
})
