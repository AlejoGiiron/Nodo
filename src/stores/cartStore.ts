import { create } from 'zustand'
import type { Tables } from '@/types/database.types'

export type ProductWithCategory = Tables<'products'> & {
  categories: Pick<Tables<'categories'>, 'id' | 'name' | 'color'> | null
}

/**
 * Extra seleccionado en un ítem del carrito. `qty` es POR UNIDAD del producto:
 * el total consumido de la línea es `qty × item.qty` (así lo descuenta la RPC).
 * `price` y `name` son snapshots; `linked_product_id` decide si descuenta stock.
 */
export interface CartExtra {
  extra_id: string
  name: string
  price: number
  qty: number
  linked_product_id: string | null
}

export interface CartItem {
  id: string
  product: ProductWithCategory
  qty: number
  note: string
  extras: CartExtra[]
  /**
   * 🔴 PRECIO UNITARIO PACTADO EN ESTA LÍNEA — deuda 75. Nace copiando
   * `product.price`, que pasa a ser una **sugerencia**: el cliente negocia el
   * mismo producto a 109.000, 110.000 y 115.000 (medido en `Control_Mp.xlsx`).
   *
   * ⚠️ Es un SNAPSHOT, igual que `CartExtra.price`: si el catálogo cambia con la
   * venta a medio armar, esta línea sigue diciendo lo que se acordó. Y es lo que
   * viaja como `unit_price` a la RPC — el precio del catálogo ya no se persiste
   * en ningún lado.
   */
  price: number
}

export type DiscountType = 'pct' | 'fixed'

/** Suma de extras de UNA unidad del ítem. */
export function cartItemExtrasUnit(item: Pick<CartItem, 'extras'>): number {
  return item.extras.reduce((a, e) => a + e.price * e.qty, 0)
}

/**
 * Total de la línea: (precio PACTADO + extras por unidad) × qty.
 *
 * ⚠️ Lee `item.price`, no `item.product.price` (deuda 75). El del producto es la
 * sugerencia con la que nació la línea; el de la línea es lo acordado.
 */
export function cartItemTotal(item: Pick<CartItem, 'price' | 'qty' | 'extras'>): number {
  return (item.price + cartItemExtrasUnit(item)) * item.qty
}

/**
 * Cuánto se aleja el precio pactado del catálogo, en tanto por uno con signo.
 * `null` cuando el catálogo es 0: no hay contra qué comparar, y devolver 0
 * afirmaría que coincide.
 */
export function desvioDelCatalogo(item: Pick<CartItem, 'price' | 'product'>): number | null {
  const lista = item.product.price
  if (!lista) return null
  return (item.price - lista) / lista
}

/**
 * 🔴 EL UMBRAL QUE DISPARA LA CONFIRMACIÓN — deuda 75, RE-MEDIDO en la 94.
 *
 * Es la ÚNICA red que existe: el servidor nunca compara `unit_price` contra
 * `products.price` — la RPC lo toma directo del payload y lo único que hay es
 * `check (unit_price >= 0)`.
 *
 * ── POR QUÉ ES ASIMÉTRICO, Y NO HAY QUE "CORREGIRLO" POR CONSISTENCIA ───────
 * 🔴 Las dos direcciones NO son el mismo hecho, así que un umbral simétrico
 *    trata como iguales dos cosas que no lo son:
 *
 *    HACIA ARRIBA es SU NEGOCIO. El precio de catálogo es su `Precio Base`
 *    (costo × 1,15): un PISO, no un precio. Medido en su archivo: vende por
 *    encima del base en 33 de 55 ventas, con un máximo de +65,6%. Un cartel que
 *    salta cuando el negocio funciona normal se aprende a ignorar, y entonces
 *    deja de existir el día que hace falta.
 *
 *    HACIA ABAJO es donde vive el typo caro Y donde el sistema pierde plata.
 *    Ninguna venta real del histórico bajó más de −13,0% del base.
 *
 * ── LOS NÚMEROS QUE LO FIJARON (55 líneas del histórico, 2026-09-07) ────────
 *    venta real más alta:  +65,6%   ·  typo hacia arriba más chico:  +769,6%
 *    venta real más baja:  −13,0%   ·  typo hacia abajo menos hondo:  −60,9%
 *    Hay hueco limpio en las dos direcciones. Con +100 / −35:
 *      salta en 0 de 55 ventas reales  ·  caza 151 de 151 typos simulados.
 *    ⚠️ El simétrico ±75% también da 0 falsos, pero PIERDE 5 typos. Por eso no.
 *
 * ── LO QUE ESTE UMBRAL NO PUEDE ARREGLAR, Y CUÁL ES LA SALIDA SI APARECE ────
 * 🔴 La desviación escala con el PRECIO, no con la categoría: redondear a plata
 *    cómoda cuesta lo mismo en pesos y muchísimo más en porcentaje.
 *      `8.395 → 10.000` es **+19%** y son **1.605 pesos**.
 *    Un umbral porcentual castiga a los productos baratos por ser baratos, y
 *    **ningún ajuste del porcentaje lo arregla** — es la forma del instrumento.
 *    Si algún día aparece ruido, la salida es un **piso ABSOLUTO en pesos**
 *    (no avisar por debajo de N), NO un umbral por producto ni por categoría.
 */
export const UMBRAL_PRECIO_ARRIBA = 1.00
export const UMBRAL_PRECIO_ABAJO = 0.35

export function precioLejosDelCatalogo(item: Pick<CartItem, 'price' | 'product'>): boolean {
  const d = desvioDelCatalogo(item)
  if (d === null) return false
  return d > UMBRAL_PRECIO_ARRIBA || d < -UMBRAL_PRECIO_ABAJO
}

/**
 * Venta pausada ("en espera"). Vive SOLO en memoria (Zustand); no se persiste
 * en Supabase ni en localStorage — son ventas efímeras que aún no se concretan.
 * Si se recarga la página se pierden (aceptable).
 */
export interface HeldOrder {
  id: string
  items: CartItem[]
  discount: number
  discountType: DiscountType
  discountReason: string
  customer: string | null
  label: string
  createdAt: number
}

function genId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function fallbackLabel(): string {
  const t = new Date().toLocaleTimeString('es-CO', {
    hour: '2-digit', minute: '2-digit', timeZone: 'America/Bogota',
  })
  return `Venta ${t}`
}

interface CartStore {
  items: CartItem[]
  discount: number
  discountType: DiscountType
  discountReason: string
  heldOrders: HeldOrder[]
  add: (product: ProductWithCategory) => void
  addItem: (product: ProductWithCategory, extras: CartExtra[]) => void
  setQty: (index: number, qty: number) => void
  setPrice: (index: number, price: number) => void
  setNote: (index: number, note: string) => void
  updateItemExtras: (id: string, extras: CartExtra[]) => void
  remove: (index: number) => void
  clear: () => void
  setDiscount: (discount: number, type?: DiscountType) => void
  setDiscountReason: (reason: string) => void
  holdCurrentOrder: (label: string) => void
  resumeHeldOrder: (id: string) => void
  discardHeldOrder: (id: string) => void
  /** Limpia TODO el estado de venta (carrito + descuento + ventas en espera).
   *  A diferencia de clear() (que deja vivas las ventas en espera), esto resetea
   *  la sesión completa. Se usa al cerrar sesión. */
  resetSession: () => void
}

export const useCartStore = create<CartStore>((set) => ({
  items: [],
  discount: 0,
  discountType: 'pct',
  discountReason: '',
  heldOrders: [],

  // Alta rápida sin extras: fusiona con una línea existente del mismo producto
  // que no tenga nota NI extras (comportamiento original).
  add: (product) =>
    set((state) => {
      const idx = state.items.findIndex(
        (x) => x.product.id === product.id && !x.note && x.extras.length === 0,
      )
      if (idx >= 0) {
        const next = [...state.items]
        next[idx] = { ...next[idx], qty: next[idx].qty + 1 }
        return { items: next }
      }
      return { items: [...state.items, { id: genId(), product, qty: 1, note: '', extras: [], price: product.price }] }
    }),

  // Alta con extras: siempre crea una línea nueva (no fusiona) para no mezclar
  // configuraciones distintas del mismo producto.
  addItem: (product, extras) =>
    set((state) => {
      if (extras.length === 0) {
        const idx = state.items.findIndex(
          (x) => x.product.id === product.id && !x.note && x.extras.length === 0,
        )
        if (idx >= 0) {
          const next = [...state.items]
          next[idx] = { ...next[idx], qty: next[idx].qty + 1 }
          return { items: next }
        }
      }
      return { items: [...state.items, { id: genId(), product, qty: 1, note: '', extras, price: product.price }] }
    }),

  setQty: (index, qty) =>
    set((state) => {
      if (qty <= 0) return { items: state.items.filter((_, i) => i !== index) }
      const next = [...state.items]
      next[index] = { ...next[index], qty }
      return { items: next }
    }),

  // 🔴 Deuda 75. Sin clamp ni redondeo: el precio lo pacta una persona y el
  //    sistema no lo corrige — valida (R6). Lo único que se impide es el
  //    negativo, que no es un precio pactado sino un error de tipeo, y que la
  //    base rechaza igual con `check (unit_price >= 0)`.
  setPrice: (index, price) =>
    set((state) => {
      const next = [...state.items]
      next[index] = { ...next[index], price: Math.max(0, Math.round(price)) }
      return { items: next }
    }),

  setNote: (index, note) =>
    set((state) => {
      const next = [...state.items]
      next[index] = { ...next[index], note }
      return { items: next }
    }),

  updateItemExtras: (id, extras) =>
    set((state) => ({
      items: state.items.map((x) => (x.id === id ? { ...x, extras } : x)),
    })),

  remove: (index) =>
    set((state) => ({ items: state.items.filter((_, i) => i !== index) })),

  clear: () => set({ items: [], discount: 0, discountType: 'pct', discountReason: '' }),

  setDiscount: (discount, type) =>
    set((state) => {
      const nextType = type ?? state.discountType
      // Endurecer: descartar NaN/Infinity, enteros, y clampear según el tipo.
      // Porcentaje: 0–100. Monto fijo: ≥ 0.
      let value = Number.isFinite(discount) ? Math.round(discount) : 0
      value = nextType === 'pct'
        ? Math.min(100, Math.max(0, value))
        : Math.max(0, value)
      return { discount: value, discountType: nextType }
    }),

  setDiscountReason: (reason) => set({ discountReason: reason }),

  // Guarda el carrito activo en espera y lo limpia. No-op si está vacío.
  holdCurrentOrder: (label) =>
    set((state) => {
      if (state.items.length === 0) return {}
      const held: HeldOrder = {
        id: genId(),
        items: state.items,
        discount: state.discount,
        discountType: state.discountType,
        discountReason: state.discountReason,
        customer: null,
        label: label.trim() || fallbackLabel(),
        createdAt: Date.now(),
      }
      return {
        heldOrders: [...state.heldOrders, held],
        items: [],
        discount: 0,
        discountType: 'pct',
              discountReason: '',
      }
    }),

  // Restaura una venta en espera al carrito (sobrescribe el actual) y la quita
  // de la lista. La decisión de qué hacer con el carrito actual la maneja la UI.
  resumeHeldOrder: (id) =>
    set((state) => {
      const held = state.heldOrders.find((h) => h.id === id)
      if (!held) return {}
      return {
        items: held.items,
        discount: held.discount,
        discountType: held.discountType,
        discountReason: held.discountReason,
        heldOrders: state.heldOrders.filter((h) => h.id !== id),
      }
    }),

  discardHeldOrder: (id) =>
    set((state) => ({
      heldOrders: state.heldOrders.filter((h) => h.id !== id),
    })),

  // Reset total de la sesión de venta. El estado del carrito y las ventas en
  // espera son del cajero actual: no deben sobrevivir a un cambio de usuario en
  // la misma pestaña (POS compartido). Se llama al cerrar sesión.
  resetSession: () =>
    set({ items: [], discount: 0, discountType: 'pct', discountReason: '', heldOrders: [] }),
}))
