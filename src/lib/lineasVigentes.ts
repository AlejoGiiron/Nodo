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

/** La forma en que `getSaleDetail` trae los cambios. */
export interface CambioDeLaBase {
  created_at: string
  sale_change_items: {
    direction: 'in' | 'out'
    product_id: string
    qty: number
    unit_price: number
    products: { name: string } | null
  }[]
}

/** Los ítems de todos los cambios, en orden de fecha: el orden en que ocurrieron. */
export function itemsDeCambio(cambios: CambioDeLaBase[]): ItemDeCambio[] {
  return [...cambios]
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .flatMap((c) => c.sale_change_items.map((i) => ({
      direction: i.direction,
      productId: i.product_id,
      qty: i.qty,
      unitPrice: Number(i.unit_price),
      name: i.products?.name ?? '—',
    })))
}

/**
 * Qué volvió y qué se llevó, en una frase por lado — para que la pantalla diga
 * QUÉ cambió además de que algo cambió. Sin esto, mostrar las líneas vigentes
 * borraría de la vista lo que se vendió originalmente.
 */
export function resumenDeCambios(items: ItemDeCambio[]): { devolvio: string; sellevo: string } {
  const junta = (dir: 'in' | 'out') => {
    const porNombre = new Map<string, number>()
    for (const i of items.filter((x) => x.direction === dir)) {
      porNombre.set(i.name, (porNombre.get(i.name) ?? 0) + i.qty)
    }
    return [...porNombre].map(([n, q]) => `${q}× ${n}`).join(', ')
  }
  return { devolvio: junta('in'), sellevo: junta('out') }
}
