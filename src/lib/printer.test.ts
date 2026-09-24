import { describe, it, expect } from 'vitest'
import { buildSaleTicketHtml, type SaleTicketData } from './printer'

// ============================================================================
// EL COMPROBANTE QUE SALE EN PAPEL
//
// 🔴 POR QUÉ ESTE ARCHIVO EXISTE (deuda 62, auditoría A3 §3.1). El ticket
//    afirmaba **"IVA 19% incl."** con un número calculado por una constante
//    —`total − total/1,19`— sobre un dato que NO EXISTE en ninguna tabla:
//    `grep -rni "iva|tax" supabase/migrations` daba cero. No hay tasa por
//    producto, ni régimen del tenant, ni impuesto en el esquema.
//
//    Una distribuidora de alimentos, aseo o consumo masivo mezcla excluidos,
//    exentos, 5 % y 19 %: el papel declaraba 19 % sobre todo. Y el primer
//    cliente **no está constituido y no factura**, así que el ticket afirmaba
//    cobrar un impuesto que el negocio no puede declarar.
//
//    Un ticket sin línea de IVA es incompleto; uno con IVA inventado es FALSO.
//
// Y lo que el papel SÍ tiene que decir ahora: **qué es**. Antes no lo decía —
// ni "Factura" (que habría sido una segunda afirmación falsa) ni nada. Sin eso
// se entrega y el que lo recibe supone que es soporte tributario.
//
// Este archivo es unitario a propósito: el HTML sale de una función pura, así
// que se asevera sin abrir el diálogo de impresión del navegador. Hasta el
// 2026-09-02 el builder era anónimo y por eso nadie podía mirar lo que imprimía.
// ============================================================================

const VENTA: SaleTicketData = {
  sedeName: 'Distribuidora Lab',
  sedeAddress: 'Cra 12 #4-38',
  orderNumber: 1247,
  orderId: '3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
  canal: 'mostrador',
  method: 'cash',
  createdAt: '2026-09-02T15:30:00.000Z',
  items: [
    { qty: 2, name: 'Arroz 500g', unitPrice: 3500 },
    { qty: 1, name: 'Aceite 1L', unitPrice: 12000, notes: 'sin bolsa' },
  ],
  total: 19000,
}

describe('ticket de venta — lo que el papel AFIRMA', () => {
  it('NO menciona IVA ni impuesto: no existe el dato para calcularlo', () => {
    const html = buildSaleTicketHtml(VENTA)
    // Se mira el texto plano: `IVA` dentro de un atributo o un nombre de clase
    // no sería una afirmación al cliente, pero acá no debe estar en ninguno.
    expect(html, 'el ticket no puede afirmar un impuesto que el esquema no tiene').not.toMatch(/\bIVA\b/i)
    expect(html).not.toMatch(/impuesto/i)
    // El 1,19 de la fórmula vieja: si vuelve, vuelve el cálculo inventado.
    expect(html, 'ni el divisor de la fórmula vieja').not.toContain('1.19')
  })

  it('dice QUÉ ES — comprobante de venta, no factura', () => {
    const html = buildSaleTicketHtml(VENTA)
    expect(html, 'el papel tiene que identificarse').toMatch(/comprobante de venta/i)
    // 🔴 Y no puede llamarse factura: Nodo no hace facturación electrónica
    //    (deuda 72, límite conocido del producto). Decirlo sería la misma clase
    //    de afirmación falsa que el IVA, en el mismo papel.
    expect(html, 'Nodo no emite facturas: no hay facturación electrónica').not.toMatch(/factura/i)
  })

  it('sigue diciendo lo que sí es cierto: total, líneas, método y número', () => {
    // Control de que el cambio no se llevó puesto el resto del comprobante —
    // el riesgo real de quitar una línea de un template.
    const html = buildSaleTicketHtml(VENTA)
    expect(html).toContain('Venta #1247')
    expect(html).toContain('Arroz 500g')
    expect(html).toContain('Aceite 1L')
    expect(html).toContain('sin bolsa')
    expect(html).toMatch(/TOTAL/)
    expect(html).toContain('Efectivo')
    expect(html).toContain('DISTRIBUIDORA LAB')
  })

  it('una venta sin número usa el id corto, y sigue sin IVA', () => {
    const html = buildSaleTicketHtml({ ...VENTA, orderNumber: null, method: null })
    expect(html).toContain('2A3B4C5D')   // slice(-8), no doce: lo dijo el rojo
    expect(html).not.toMatch(/\bIVA\b/i)
    expect(html).toMatch(/comprobante de venta/i)
  })

  // ── EL CLIENTE, Y LA REGLA DEL HUECO ─────────────────────────────────────

  it('con cliente, el comprobante dice a quién se le vendió', () => {
    const html = buildSaleTicketHtml({ ...VENTA, customerName: 'Ferretería El Tornillo' })
    expect(html).toContain('Ferretería El Tornillo')
    expect(html).toMatch(/Cliente:/)
  })

  it('🔴 SIN cliente no hay línea vacía ni guion — la línea NO APARECE', () => {
    // Las ventas anteriores al 2026-09-15 no tienen cliente guardado: `useCobro`
    // sólo lo escribía en la rama de fiado. Ese hueco NO se rellena, y el papel
    // tampoco lo disimula — un guion donde no hubo dato es una afirmación.
    const html = buildSaleTicketHtml({ ...VENTA, customerName: null })
    expect(html).not.toMatch(/Cliente:/)

    // ⚠️ Control de la propia lectura: si el builder devolviera algo vacío o
    //    roto, el `not.toMatch` de arriba pasaría sin haber mirado nada.
    expect(html).toMatch(/comprobante de venta/i)
    expect(html).toContain('Arroz 500g')
  })

  it('un cliente vacío se trata como ausente, no como un nombre en blanco', () => {
    // El mostrador guarda `''` mientras nadie elige: no es un nombre.
    const html = buildSaleTicketHtml({ ...VENTA, customerName: '' })
    expect(html).not.toMatch(/Cliente:/)
  })

  // ── EL MÉTODO, CUANDO NO HUBO PAGO ───────────────────────────────────────

  it('🔴 una venta a CRÉDITO dice cómo se cobró — no calla', () => {
    // Medido el 2026-09-15: el ticket del POS decía «Fiado» y la reimpresión
    // OMITÍA la línea entera, porque `SalesHistoryPage` pasaba `method: null`
    // cuando no había filas en `payments`. Dos papeles del mismo hecho diciendo
    // cosas distintas (deuda 108). El builder ya sabía imprimir lo que le den;
    // lo que faltaba era que le dieran algo.
    const html = buildSaleTicketHtml({ ...VENTA, method: 'Crédito' })
    expect(html).toContain('Crédito')
  })
})

describe('ticket de una venta CON cambio de producto', () => {
  // Caso real, venta #162: el ticket reimpreso seguía diciendo el producto que
  // volvió. Las líneas y el total que llegan acá ya son los VIGENTES
  // (`lineasVigentes`); lo que se asevera es que el papel lo diga y cierre.
  const CON_CAMBIO: SaleTicketData = {
    ...VENTA,
    method: 'Crédito (parcial)',
    items: [{ qty: 1, name: 'OXANDRONOM 100 TABS', unitPrice: 178000 }],
    total: 948000,
    cambio: { cantidad: 1, abonado: 470000, saldoActual: 478000 },
  }

  it('🔴 dice que incluye el cambio, con lo abonado y el saldo', () => {
    const html = buildSaleTicketHtml(CON_CAMBIO)
    expect(html).toContain('OXANDRONOM 100 TABS')
    expect(html).toMatch(/Incluye 1 cambio de producto/)
    expect(html).toContain('470.000')
    expect(html).toContain('478.000')
    expect(html).toContain('948.000')
    // 🔴 La frase vieja afirmaba que el total era el ORIGINAL. Ahora es mentira.
    expect(html, 'el total impreso ya es el vigente').not.toMatch(/venta original/i)
  })

  it('CONTROL: una venta sin cambio no habla de cambios, abonos ni saldo', () => {
    const html = buildSaleTicketHtml(VENTA)
    expect(html).not.toMatch(/cambio de producto/i)
    expect(html).not.toMatch(/SALDO|Abonado/)
  })
})
