/**
 * LO QUE EL CLIENTE TIENE HOY de una venta: sus líneas originales, menos lo que
 * volvió en cambios de producto, más lo que se llevó a cambio.
 *
 * 🔴 ES UNA LECTURA, NO UNA REESCRITURA. `order_items` no se toca nunca (ver
 *    20260924120000): lo que se vendió ese día sigue siendo cierto. Esto sólo
 *    COMPONE las dos capas para el papel que se le entrega al cliente, que
 *    tiene que decir qué se llevó — caso real, venta #162: el ticket seguía
 *    diciendo OXIMETHANON cuando el cliente tenía OXANDRONOM.
 *
 * ⚠️ Lo que vuelve se descuenta POR PRODUCTO, en el orden de las líneas. La RPC
 *    del cambio garantiza que sólo vuelve lo que salió en ESA venta y nunca más
 *    de lo que queda, así que el descuento siempre alcanza. Si no alcanzara, la
 *    función LANZA: un comprobante que dice algo que no cuadra con la base es
 *    peor que no poder imprimirlo.
 */

export interface LineaDeTicket {
  productId: string | null
  qty: number
  name: string
  unitPrice: number
  notes?: string | null
  extras?: { name: string; qty: number; unitPrice: number }[]
}

export interface ItemDeCambio {
  direction: 'in' | 'out'
  productId: string
  qty: number
  unitPrice: number
  name: string
}

export function lineasVigentes(originales: LineaDeTicket[], cambios: ItemDeCambio[]): LineaDeTicket[] {
  const lineas = originales.map((l) => ({ ...l }))

  for (const c of cambios.filter((x) => x.direction === 'in')) {
    let falta = c.qty
    for (const l of lineas) {
      if (falta === 0) break
      if (l.productId !== c.productId || l.qty === 0) continue
      const baja = Math.min(l.qty, falta)
      l.qty -= baja
      falta -= baja
    }
    if (falta > 0) {
      throw new Error(
        `El cambio devuelve ${c.qty} de «${c.name}» y la venta no tiene tantas: ` +
        'el comprobante no se puede armar sin contradecir la base.',
      )
    }
  }

  const vigentes = lineas.filter((l) => l.qty > 0)

  for (const c of cambios.filter((x) => x.direction === 'out')) {
    const igual = vigentes.find(
      (l) => l.productId === c.productId && l.unitPrice === c.unitPrice && !l.extras?.length && !l.notes,
    )
    if (igual) igual.qty += c.qty
    else vigentes.push({ productId: c.productId, qty: c.qty, name: c.name, unitPrice: c.unitPrice })
  }

  return vigentes
}
