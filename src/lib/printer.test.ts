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
})
