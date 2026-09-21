import { supabase } from './supabase'
import { captureIssue } from './sentry'
import type { Enums, Json, Tables, TablesInsert, TablesUpdate } from '@/types/database.types'
import { esMetodoReal, type ValorDeFiltro } from './clases-de-venta'

// --- Profiles ---

export const getProfile = (userId: string) =>
  supabase.from('profiles').select('*').eq('id', userId).single()

export const upsertProfile = (profile: TablesInsert<'profiles'>) =>
  supabase.from('profiles').upsert(profile).select().single()

// --- Sedes ---

export const getSede = (sedeId: string) =>
  supabase.from('sedes').select('*').eq('id', sedeId).single()

export const updateSede = (sedeId: string, data: TablesUpdate<'sedes'>) =>
  supabase.from('sedes').update(data).eq('id', sedeId).select().single()

// --- Organization / suscripcion ---

/**
 * Lee la bandera de suscripcion que escribe Centro. SOLO LECTURA: Nodo
 * nunca escribe estas columnas (el privilegio de UPDATE esta en allowlist y no
 * las incluye; ver supabase/organization-subscription.sql).
 *
 * Se seleccionan las columnas explicitamente en vez de `*` para que el dia que
 * organizations gane una columna sensible no viaje sola al navegador.
 */
export const getOrganizationSubscription = (organizationId: string) =>
  supabase
    .from('organizations')
    .select('subscription_status, subscription_message, subscription_updated_at')
    .eq('id', organizationId)
    .single()

// --- Categories ---

export const getCategories = (sedeId: string) =>
  supabase
    .from('categories')
    .select('*')
    .eq('sede_id', sedeId)
    .eq('is_active', true)
    .order('sort_order')

export const upsertCategory = (category: TablesInsert<'categories'>) =>
  supabase.from('categories').upsert(category).select().single()

export const deleteCategory = (categoryId: string) =>
  supabase.from('categories').update({ is_active: false }).eq('id', categoryId)

export const countActiveProductsByCategory = (categoryId: string) =>
  supabase
    .from('products')
    .select('*', { count: 'exact', head: true })
    .eq('category_id', categoryId)
    .eq('is_active', true)

// --- Products ---

// 🔴 `product_prices` viaja CON el producto (deuda 101). El catálogo ya se trae
//    entero para el Mostrador —la búsqueda filtra en memoria—, así que los cinco
//    niveles llegan en la misma consulta y la resolución del precio no necesita
//    ningún viaje extra. Un producto sin filas es «sin nivel configurado», que es
//    un estado válido y no un hueco: ver `src/lib/niveles.ts`.
export const getProducts = (sedeId: string, categoryId?: string) => {
  const base = supabase
    .from('products')
    .select('*, categories(id, name, color), product_prices(nivel, precio)')
    .eq('sede_id', sedeId)
    .eq('is_active', true)
    .order('name')

  return categoryId ? base.eq('category_id', categoryId) : base
}

export const upsertProduct = (product: TablesInsert<'products'>) =>
  supabase.from('products').upsert(product).select().single()

export const archiveProduct = (productId: string) =>
  supabase.from('products').update({ is_active: false }).eq('id', productId)

// 🔴 `updateProductStock` SE BORRÓ el 2026-09-07 con la deuda 78. Escribía
// `stock_qty` por la tabla —sin motivo, sin permiso propio y sin movimiento— y
// no tenía UN SOLO consumidor: código muerto que era un arma cargada. Con el
// allowlist de columnas puesto habría dejado de funcionar igual, en runtime y
// sin que nada lo dijera. El camino con rastro es la RPC `adjust_stock`.
//
// ⚠️ Segunda vez que un escritor directo MUERTO aparece al cerrar un camino: el
// primero fue `addOrderItems` antes de la RLS. Cerrar un camino no solo tapa el
// hueco — DESTAPA a los que lo usaban, y los muertos son los que nadie enumera.

// --- Extras (catálogo de subproductos reutilizables) ---

// Solo activos: para asignación a productos y selección en POS (prompt 2).
export const getExtras = (sedeId: string) =>
  supabase
    .from('extras')
    .select('*')
    .eq('sede_id', sedeId)
    .eq('is_active', true)
    .order('name')

// Incluye inactivos: para el catálogo de configuración.
export const getAllExtras = (sedeId: string) =>
  supabase
    .from('extras')
    .select('*')
    .eq('sede_id', sedeId)
    .order('is_active', { ascending: false })
    .order('name')

export const upsertExtra = (extra: TablesInsert<'extras'>) =>
  supabase.from('extras').upsert(extra).select().single()

export const deactivateExtra = (extraId: string) =>
  supabase.from('extras').update({ is_active: false }).eq('id', extraId)

// Cuántas líneas de venta usan este extra (para impedir su borrado).
export const countOrderItemsUsingExtra = (extraId: string) =>
  supabase
    .from('order_item_extras')
    .select('*', { count: 'exact', head: true })
    .eq('extra_id', extraId)

// --- product_extras (qué extras aplican a cada producto) ---

export const getProductExtras = (productId: string) =>
  supabase
    .from('product_extras')
    .select('*, extras(*)')
    .eq('product_id', productId)

export const addProductExtra = (productId: string, extraId: string) =>
  supabase
    .from('product_extras')
    .insert({ product_id: productId, extra_id: extraId })
    .select()
    .single()

export const removeProductExtra = (productId: string, extraId: string) =>
  supabase
    .from('product_extras')
    .delete()
    .eq('product_id', productId)
    .eq('extra_id', extraId)

// IDs de productos de la sede que tienen al menos un extra ACTIVO asignado.
// Se usa en el POS para decidir si abrir el modal de configuración.
export const getProductsWithActiveExtras = (sedeId: string) =>
  supabase
    .from('product_extras')
    .select('product_id, products!inner(sede_id), extras!inner(is_active)')
    .eq('products.sede_id', sedeId)
    .eq('extras.is_active', true)

// --- Venta con extras (RPC atómica) ---

// La RPC lee precio y producto vinculado de la BD (datos de confianza); el
// cliente solo aporta extra_id y qty (por unidad del ítem).
export type OrderItemExtraPayload = {
  extra_id: string
  qty: number
}

export type OrderItemPayload = {
  product_id: string
  qty: number
  unit_price: number
  notes: string | null
  extras: OrderItemExtraPayload[]
}

// Inserta order_items + order_item_extras y descuenta stock vinculado, atómico.
export const addOrderItemsWithExtras = (orderId: string, items: OrderItemPayload[]) =>
  supabase.rpc('add_order_items_with_extras', {
    p_order_id: orderId,
    p_items: items as unknown as Json,
  })

// --- Inventario por recetas: product_components (receta / BOM) ---

// Insumo de una receta, con datos del producto componente para mostrarlo.
export type ProductComponentRow = Tables<'product_components'> & {
  component: Pick<Tables<'products'>, 'id' | 'name' | 'stock_qty' | 'stock_tracking' | 'kind'> | null
}

export const getProductComponents = (parentId: string) =>
  supabase
    .from('product_components')
    .select(
      '*, component:products!product_components_component_id_fkey(id, name, stock_qty, stock_tracking, kind)',
    )
    .eq('parent_id', parentId)
    .order('created_at')

export const addProductComponent = (row: TablesInsert<'product_components'>) =>
  supabase.from('product_components').insert(row).select().single()

export const updateProductComponentQty = (id: string, qty: number) =>
  supabase.from('product_components').update({ qty }).eq('id', id)

export const removeProductComponent = (id: string) =>
  supabase.from('product_components').delete().eq('id', id)

// --- Inventario: ajuste manual de stock (RPC atómica SECURITY DEFINER) ---

// qty CON SIGNO (+entrada / -salida). La RPC valida sede + permiso
// productos.editar, actualiza stock e inserta el movimiento en una transacción.
export const adjustStock = (productId: string, qty: number, reason: string) =>
  supabase.rpc('adjust_stock', {
    p_product_id: productId,
    p_qty: qty,
    p_reason: reason,
  })

// --- Inventario: movimientos de stock (auditoría append-only, paginada) ---

// ⚠️ `return` y `purchase_return` NO son lo mismo, y por eso son dos valores.
//    `return` es el reverso de una VENTA —lo escribe register_sale_void y el
//    stock ENTRA—; `purchase_return` es una devolución AL PROVEEDOR y el stock
//    SALE. Van en direcciones opuestas del negocio y los mira gente distinta.
export type StockMovementType =
  | 'sale' | 'adjustment' | 'return' | 'purchase' | 'purchase_return'

export interface StockMovementsFilters {
  sedeId: string
  type?: StockMovementType | null
  /** null = todos los productos, que es el estado por defecto de la pantalla. */
  productId?: string | null
  from?: string        // ISO inicio (createdAt >=)
  to?: string          // ISO fin (createdAt <=)
  page: number         // 0-based
  pageSize: number
}

export interface StockMovementRow {
  id: string
  created_at: string
  type: string
  qty: number
  reference_id: string | null
  notes: string | null
  product_id: string
  /**
   * Existencia DESPUÉS de este movimiento, anclada en `products.stock_qty`
   * (migración 20260917120000). **Nulo es un dato**: el producto no lleva
   * existencia o no tiene `stock_qty`. Se pinta «—», nunca 0 — un 0 afirmaría
   * que se contó y dio cero.
   */
  saldo_despues: number | null
  /**
   * A quién se le vendió. Sólo `type` sale y return (la anulación de esa misma
   * venta); en compras y ajustes es nulo por construcción.
   *
   * 🔴 Es el nombre CONGELADO en la venta (`orders.customer_name`), no el vivo
   * de `customers`. `orders.customer_id` es ON DELETE SET NULL, así que el
   * congelado es lo único que sobrevive si borran al cliente — y una auditoría
   * no puede cambiar de respuesta porque alguien corrigió una ficha.
   *
   * ⚠️ Nulo significa UNA sola cosa: esa venta no tenía cliente. No es «no pude
   * verla»: las policies de SELECT de `stock_movements` y de `orders` son
   * idénticas —`sede_id = get_my_sede_id()`, sin permiso extra—, medido en
   * 20260921120000. Si alguna gana un `has_permission`, el nulo vuelve a ser
   * ambiguo y esto deja de valer.
   */
  customer_name: string | null
  /** N.° de la venta (sale) o de la venta que se anuló (return). */
  order_number: number | null
  /** N.° de la compra. Sólo `type` purchase: una devolución a proveedor no lleva número. */
  purchase_number: number | null
  products: { name: string; is_active: boolean } | null
  profiles: { full_name: string | null } | null
}

export const getStockMovements = ({
  sedeId, type, productId, from, to, page, pageSize,
}: StockMovementsFilters) => {
  // 🔴 Lee la VISTA, no la tabla: trae el saldo acumulado y admite los mismos
  //    embebidos (verificado contra la base el 2026-09-17). El filtro por fecha
  //    o tipo NO se empuja por debajo de la ventana —también medido, y es el
  //    primer caso de `movimientos-saldo.spec`—, así que el saldo se calcula
  //    sobre toda la historia del producto y el filtro sólo elige qué filas se
  //    muestran. Costo medido en LAB con 4.957 movimientos: +14 ms por página.
  let q = supabase
    .from('stock_movements_con_saldo')
    .select(
      // `customer_name`, `order_number` y `purchase_number` son COLUMNAS de la
      // vista, no embebidos: `reference_id` es un FK lógico y polimórfico —según
      // el type apunta a `orders` o a `purchase_invoices`— así que PostgREST no
      // tiene ninguna relación que seguir. El salto lo hace la vista, con su
      // allowlist de types (20260921120000).
      'id, created_at, type, qty, reference_id, notes, product_id, saldo_despues, ' +
        'customer_name, order_number, purchase_number, products(name, is_active), profiles(full_name)',
      { count: 'exact' },
    )
    .eq('sede_id', sedeId)

  if (type) q = q.eq('type', type)
  // 🔴 Filtra por la COLUMNA de stock_movements, no por el embebido. Un
  //    `products!inner(...)` con filtro es la forma que escondió una clase entera
  //    de ventas en el Historial. Acá además no hace falta: `product_id` es
  //    `not null` con `on delete restrict`, así que no hay movimiento sin producto.
  if (productId) q = q.eq('product_id', productId)
  if (from) q = q.gte('created_at', from)
  if (to) q = q.lte('created_at', to)

  const fromIdx = page * pageSize
  // 🔴 ESTE ORDEN ES UN LADO DEL CONTRATO CON LA VENTANA de
  //    `stock_movements_con_saldo`: la vista acumula con `order by created_at
  //    desc, id desc`. Si acá cambia y allá no, el saldo de una fila deja de ser
  //    el de la fila de arriba menos su cantidad, y nada se pone rojo.
  //
  // 🔴 `created_at, id`, los dos descendentes. Sólo `created_at` NO define un
  //    orden: dos movimientos pueden empatar —dos líneas del mismo producto en
  //    una venta comparten el `now()` de la transacción— y entre empatados el
  //    motor elige distinto en cada consulta. Con `range()` eso hace que una
  //    fila aparezca en dos páginas y otra en ninguna. El `id` desempata.
  return q
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(fromIdx, fromIdx + pageSize - 1)
}

/**
 * `products.stock_qty − Σ stock_movements.qty` de un producto. Distinto de cero
 * = existencia que ningún movimiento explica, típicamente la inicial del alta.
 * Nulo = el producto no lleva existencia. Alimenta la línea del pie de
 * Movimientos, que es la herramienta para cuadrar.
 */
export const getExistenciaSinMovimiento = (productId: string) =>
  supabase
    .from('productos_existencia_sin_movimiento')
    .select('existencia_sin_movimiento')
    .eq('product_id', productId)
    .maybeSingle()

/**
 * Los componentes del balance de una sede, acumulados desde el inicio
 * (`balance_de_sede`, migración 20260921160000).
 *
 * ⚠️ Son COMPONENTES, no el balance: las restas viven en `src/lib/balance.ts`,
 * una sola vez, porque la pantalla y el Excel tienen que dar el mismo número.
 */
export const getBalanceDeSede = (sedeId: string) =>
  supabase
    .from('balance_de_sede')
    .select(
      'sede_nombre, capital_inicial, capital_inicial_desde, cobrado_ventas, abonos, otras_entradas, ' +
        'compras, devoluciones_proveedor, gastos, retiros, otras_salidas, ' +
        'vendido, costo_vendido, inventario_a_costo, cartera, ' +
        'productos_sin_costo, unidades_sin_costo, lineas_venta_sin_costo',
    )
    .eq('sede_id', sedeId)
    .maybeSingle()

/** El capital inicial lo edita Configuración. Nulo = sin configurar, nunca 0. */
export const setCapitalInicial = (
  sedeId: string,
  capital: number | null,
  desde: string | null,
) =>
  supabase
    .from('sedes')
    .update({ capital_inicial: capital, capital_inicial_desde: desde })
    .eq('id', sedeId)

export interface ProductoBuscado {
  id: string
  name: string
  codigo: string | null
  is_active: boolean
}

/** Escapa los comodines de LIKE para que el texto tecleado se busque literal. */
const literalLike = (s: string) => s.replace(/[\\%_]/g, (c) => '\\' + c)

/**
 * Búsqueda de productos EN EL SERVIDOR, para elegir un producto en un filtro.
 *
 * 🔴 NO sale de `getProducts`, y son dos razones medidas:
 *   1. `getProducts` no pagina, y PostgREST corta en 1000 filas SIN AVISAR —
 *      LAB Principal tenía 1.206 productos (2026-09-14). Un desplegable armado
 *      con eso pierde productos en silencio.
 *   2. `getProducts` trae sólo ACTIVOS, y un producto archivado conserva sus
 *      movimientos. Es justo el que se busca cuando algo no cuadra con un
 *      producto que ya se retiró. Por eso acá NO se filtra `is_active`.
 *
 * Nombre y código van en DOS consultas y no en un `.or()`: el texto del usuario
 * adentro de un `.or()` rompe la sintaxis del filtro con una coma o un
 * paréntesis. El código NO es único (varios productos comparten línea), así que
 * buscar por código puede devolver varios, y eso es lo esperado.
 */
export async function buscarProductos(
  sedeId: string, termino: string, limite = 20,
): Promise<ProductoBuscado[]> {
  const patron = `%${literalLike(termino)}%`
  const cols = 'id, name, codigo, is_active'
  const [porNombre, porCodigo] = await Promise.all([
    supabase.from('products').select(cols).eq('sede_id', sedeId).ilike('name', patron).order('name').limit(limite),
    supabase.from('products').select(cols).eq('sede_id', sedeId).ilike('codigo', patron).order('name').limit(limite),
  ])
  if (porNombre.error) throw porNombre.error
  if (porCodigo.error) throw porCodigo.error
  const unicos = new Map<string, ProductoBuscado>()
  for (const p of [...(porNombre.data ?? []), ...(porCodigo.data ?? [])]) unicos.set(p.id, p)
  return [...unicos.values()]
    .sort((a, b) => a.name.localeCompare(b.name, 'es'))
    .slice(0, limite)
}

// --- Storage: product-images ---

export const uploadProductImage = async (
  sedeId: string,
  productId: string,
  file: File,
): Promise<string> => {
  const ext = file.name.split('.').pop() ?? 'jpg'
  const path = `${sedeId}/${productId}.${ext}`
  const { data, error } = await supabase.storage
    .from('product-images')
    // `cacheControl` es POR SUBIDA, no del bucket: no degrada el cache de
    // ningun otro objeto. El default de supabase-js es '3600' —una hora— y esa
    // es la mitad del problema de la deuda 111; la otra mitad la resuelve el
    // `?v=` derivado de `updated_at` en el render.
    .upload(path, file, { upsert: true, cacheControl: '60' })
  // Propaga: quien llama decide como mostrarlo, con el mensaje REAL.
  if (error) throw error
  if (!data) throw new Error('El almacenamiento no devolvio la ruta del archivo')
  const { data: { publicUrl } } = supabase.storage
    .from('product-images')
    .getPublicUrl(data.path)
  return publicUrl
}

export const deleteProductImage = async (imageUrl: string): Promise<void> => {
  try {
    const path = new URL(imageUrl).pathname.split('/product-images/')[1]
    if (path) await supabase.storage.from('product-images').remove([path])
  } catch {
    // URL inválida — ignorar silenciosamente
  }
}

// --- Orders ---

/**
 * 🔴 NO ACEPTA `total` — deuda 80. Lo DERIVA el servidor de las líneas de la
 * orden (`recalcular_total_de_orden`, disparado por un trigger diferido sobre
 * `order_items` y `order_item_extras`).
 *
 * El `Omit` es la parte que importa: mientras el parámetro existiera y el
 * trigger lo pisara, **un valor que el sistema recibe y descarta es
 * indistinguible de uno que respeta**. Quien lo mandara creería estar
 * decidiendo el total.
 *
 * ⚠️ El cliente sigue calculando el total para MOSTRARLO y para pasarlo a
 * `registerSalePayment` — y eso ahora es un cruce real: esa RPC compara la
 * suma de pagos contra el total DERIVADO, así que si los dos cálculos se
 * separaran, el cobro falla en vez de guardar plata mal contada.
 */
export const createOrder = (order: Omit<TablesInsert<'orders'>, 'total'>) =>
  supabase.from('orders').insert(order).select().single()

export const updateOrderStatus = (orderId: string, status: Tables<'orders'>['status']) =>
  supabase.from('orders').update({ status }).eq('id', orderId).select().single()

// 🔴 ACÁ VIVÍAN `updateOrderTotal` y `applyOrderDiscount`, borrados con la
// deuda 80 (2026-09-02). Los dos escribían `orders.total` desde el cliente y
// los dos tenían CERO consumidores — verificado con
// `grep -rn '<nombre>' src/ --include='*.ts*' | grep -v supabase-helpers`.
//
// No se borraron por higiene: se borraron porque el total ahora lo DERIVA un
// trigger, y **un escritor muerto del dato más sensible es una puerta abierta
// al lado del guard que se acaba de poner**. Sin consumidores, nadie los
// extraña; con consumidores futuros, habrían pisado el invariante en silencio.

// --- Numeración secuencial de ventas (por sede) ---

// Devuelve el siguiente número correlativo de la sede (incremento atómico en
// la BD). Solo debe llamarse para una venta YA cobrada.
export const nextOrderNumber = (sedeId: string) =>
  supabase.rpc('next_order_number', { p_sede_id: sedeId })

// Graba el número correlativo en la orden ya cobrada.
export const setOrderNumber = (orderId: string, orderNumber: number) =>
  supabase.from('orders').update({ order_number: orderNumber }).eq('id', orderId)

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * ARREGLO DE FONDO PENDIENTE (opción C): asignar el correlativo DENTRO de
 * `register_sale_payment`, no acá.
 *
 * Lo de abajo (reintento del UPDATE + aviso al cajero) reduce la ventana y la
 * hace visible, pero NO la cierra: entre que la RPC de cobro hace commit y que
 * el navegador graba el número hay un hueco donde se puede cerrar la pestaña,
 * morir la red o cortarse la luz — y la venta queda cobrada sin número.
 * `register_sale_payment` ya es una transacción SECURITY DEFINER: asignar el
 * número ahí lo vuelve atómico con el pago y elimina la ventana en vez de
 * reportarla.
 *
 * 🔴 `store_sequences` es una TABLA, no una sequence de Postgres — NO migrarla
 *    a una sequence real "para optimizar". Esa diferencia es la que hace que la
 *    opción C sea limpia: al ser una tabla, el incremento del contador vive
 *    dentro de la transacción, así que un ROLLBACK del cobro devuelve también
 *    el número y NO deja hueco. Las sequences de Postgres son deliberadamente
 *    NO transaccionales (`nextval` no se revierte en un rollback, justamente
 *    para no serializar a los escritores): con una sequence real, cada cobro
 *    fallido quemaría un número para siempre. La contención extra de la fila no
 *    es problema a escala de un sede.
 *
 * Falta cubrir los dos caminos que NO pasan por `register_sale_payment`:
 * el fiado (no hay pago) y la venta gratis por descuento del 100% (total 0).
 * ─────────────────────────────────────────────────────────────────────────────
 */
export interface AssignOrderNumberResult {
  /** Número asignado, o null si no se pudo. */
  orderNumber: number | null
  /**
   * Número que la secuencia YA entregó pero que no se pudo grabar en la orden.
   *
   * Es la pieza que hace barato el reintento manual: si viene, hay que
   * reintentar con ESTE número (`setOrderNumber` es idempotente) en vez de
   * pedir otro. Sin esto, cada reintento llamaría de nuevo a
   * `next_order_number` —que NO es idempotente— y quemaría un número más,
   * agrandando el hueco que justamente estamos tratando de cerrar.
   */
  numeroReservado: number | null
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Backoff del reintento del UPDATE: 3 intentos en total (~0,8 s peor caso). */
const BACKOFF_UPDATE_MS = [200, 600]

/**
 * Graba el correlativo REINTENTANDO.
 *
 * ⚠️ Se reintenta SOLO este paso, nunca `next_order_number`. La asimetría es
 * la que decide el diseño:
 *   · `next_order_number` NO es idempotente — cada llamada incrementa el
 *     contador de la sede, así que reintentarla genera huecos permanentes.
 *   · `setOrderNumber` SÍ lo es — mismo número, misma fila: reintentar sale
 *     gratis y no tiene efecto acumulativo.
 * Cubre el caso dominante (un hipo de red en el UPDATE) que además es el modo
 * de fallo PEOR, porque es el único que quema un número.
 */
const setOrderNumberConReintento = async (
  orderId: string,
  orderNumber: number,
): Promise<{ ok: boolean; error: unknown; intentos: number }> => {
  let ultimoError: unknown = null
  for (let i = 0; i <= BACKOFF_UPDATE_MS.length; i++) {
    const { error } = await setOrderNumber(orderId, orderNumber)
    if (!error) return { ok: true, error: null, intentos: i + 1 }
    ultimoError = error
    if (i < BACKOFF_UPDATE_MS.length) await sleep(BACKOFF_UPDATE_MS[i])
  }
  return { ok: false, error: ultimoError, intentos: BACKOFF_UPDATE_MS.length + 1 }
}

// Asigna el número correlativo a una venta completada: pide el siguiente número
// a la sede y lo graba en la orden. NO tumba el cobro si falla (la venta ya
// quedó registrada con su pago), pero SÍ lo reporta y deja al llamante la
// posibilidad de reintentar.
export const assignOrderNumber = async (
  orderId: string,
  sedeId: string,
): Promise<AssignOrderNumberResult> => {
  // Una venta sin número no aparece en el Historial (ordena por número), no se
  // puede reimprimir su ticket, y getShiftSalesCount cuenta las ventas gratis
  // por `order_number not null`. Devolver null en silencio dejaba un cobro real
  // con el registro incompleto y CERO señal de que pasó.
  const { data, error } = await nextOrderNumber(sedeId)
  if (error || typeof data !== 'number') {
    captureIssue('Venta cobrada sin número: falló next_order_number', 'numeracion', {
      orderId,
      sedeId,
      error,
      tipoDeDato: typeof data,
    })
    // Sin número reservado: la secuencia no llegó a entregar nada, así que un
    // reintento puede pedirlo de nuevo sin quemar de más.
    return { orderNumber: null, numeroReservado: null }
  }

  const res = await setOrderNumberConReintento(orderId, data)
  if (!res.ok) {
    // Peor caso: el contador de la sede YA avanzó pero la orden no lo guardó →
    // hueco permanente en la numeración además de la venta sin número.
    captureIssue('Venta cobrada sin número: falló el UPDATE del correlativo', 'numeracion', {
      orderId,
      sedeId,
      numeroPerdido: data,
      error: res.error,
      intentos: res.intentos,
    })
    return { orderNumber: null, numeroReservado: data }
  }
  return { orderNumber: data, numeroReservado: null }
}

/**
 * Reintento a pedido del cajero desde la pantalla de éxito.
 *
 * Reusa el número ya reservado si lo hay (no quema uno nuevo); si la secuencia
 * nunca llegó a entregar, hace el flujo completo.
 */
export const retryOrderNumber = async (
  orderId: string,
  sedeId: string,
  numeroReservado: number | null,
): Promise<AssignOrderNumberResult> => {
  if (numeroReservado === null) return assignOrderNumber(orderId, sedeId)

  const res = await setOrderNumberConReintento(orderId, numeroReservado)
  if (!res.ok) {
    captureIssue('Reintento manual del correlativo falló', 'numeracion', {
      orderId,
      sedeId,
      numeroPerdido: numeroReservado,
      error: res.error,
      intentos: res.intentos,
    })
    return { orderNumber: null, numeroReservado }
  }
  return { orderNumber: numeroReservado, numeroReservado: null }
}

// --- Historial de ventas (ventas completadas, con número) ---

export interface SalesHistoryFilters {
  sedeId: string
  from?: string        // ISO inicio (createdAt >=)
  to?: string          // ISO fin (createdAt <=)
  /**
   * Qué se está filtrando. **Ya no es sólo un método**: puede ser una de las
   * clases que no escriben fila en `payments` (ver `src/lib/clases-de-venta.ts`).
   */
  method?: ValorDeFiltro | null
  orderNumber?: number | null
  page: number         // 0-based
  pageSize: number
}

export interface SalesHistoryRow {
  id: string
  order_number: number | null
  created_at: string
  canal: string
  customer_name: string | null
  total: number
  payment_status: string   // 'paid' | 'pending' | 'partial' — el fiado no tiene fila en payments
  cancelled_at: string | null   // no null = venta anulada
  cancel_reason: string | null
  payments: { method: Enums<'payment_method'>; amount: number }[]
  profiles: { full_name: string | null } | null
}

export const getSalesHistory = ({
  sedeId, from, to, method, orderNumber, page, pageSize,
}: SalesHistoryFilters) => {
  // 🔴 EL `!inner` SÓLO VA PARA UN MÉTODO REAL, y esto es el arreglo de fondo.
  //    Un INNER JOIN sobre `payments` no filtra: ELIMINA de la consulta toda
  //    orden sin filas de pago —crédito, cortesía, anulada—. Con el join puesto
  //    para cualquier valor del filtro, esas ventas eran inalcanzables por TODOS
  //    los valores: no faltaba una opción, faltaba una clase entera.
  //
  // ⚠️ Y sacarlo a secas NO era el arreglo: medido, sin `!inner` el filtro
  //    embebido no acota al padre y devuelve las 2.988 — un no-op silencioso,
  //    que es peor que el join porque se ve como un filtro que funciona.
  const real = method != null && method !== '' && esMetodoReal(method)
  const paymentsSel = real ? 'payments!inner(method, amount)' : 'payments(method, amount)'
  const select =
    `id, order_number, created_at, canal, customer_name, total, payment_status, cancelled_at, cancel_reason, ` +
    `${paymentsSel}, profiles!orders_created_by_fkey(full_name)`

  let q = supabase
    .from('orders')
    .select(select, { count: 'exact' })
    .eq('sede_id', sedeId)
    .not('order_number', 'is', null)

  if (orderNumber != null) q = q.eq('order_number', orderNumber)
  if (from) q = q.gte('created_at', from)
  if (to) q = q.lte('created_at', to)

  if (real) {
    q = q.eq('payments.method', method)
  } else if (method) {
    // Las clases derivadas comparten la condición que las define —no hay pago
    // registrado— y se separan entre sí por columnas propias de `orders`.
    // `.is('payments', null)` está MEDIDO contra la base: devuelve 1.384 donde
    // el total es 2.988, y las cuatro clases lo particionan sin resto.
    q = q.is('payments', null)
    if (method === 'anulada') q = q.not('cancelled_at', 'is', null)
    if (method === 'cortesia') q = q.eq('total', 0).is('cancelled_at', null)
    // Crédito: lo que queda sin pago, con importe y vivo. Incluye el fiado ya
    // SALDADO, que se liquida por `debt_payments` y por eso tampoco escribe en
    // `payments` — 176 en el lab, y sin esto quedaban fuera de su propio filtro.
    if (method === 'fiado') q = q.gt('total', 0).is('cancelled_at', null)
  }

  const fromIdx = page * pageSize
  return q
    .order('order_number', { ascending: false })
    .range(fromIdx, fromIdx + pageSize - 1)
}

export interface SaleDetailRow {
  id: string
  order_number: number | null
  created_at: string
  canal: string
  customer_name: string | null
  customer_phone: string | null
  notes: string | null
  total: number
  payment_status: string
  cancelled_at: string | null
  cancel_reason: string | null
  payments: { method: Enums<'payment_method'>; amount: number }[]
  profiles: { full_name: string | null } | null
  canceller: { full_name: string | null } | null   // quién anuló (orders_cancelled_by_fkey)
  order_items: {
    id: string
    qty: number
    unit_price: number
    notes: string | null
    products: { name: string } | null
    order_item_extras: {
      id: string
      qty: number
      unit_price: number
      extras: { name: string } | null
    }[]
  }[]
}

export const getSaleDetail = (orderId: string) =>
  supabase
    .from('orders')
    .select(`
      id, order_number, created_at, canal, customer_name, customer_phone, notes, total, payment_status,
      cancelled_at, cancel_reason,
      payments(method, amount),
      profiles!orders_created_by_fkey(full_name),
      canceller:profiles!orders_cancelled_by_fkey(full_name),
      order_items(
        id, qty, unit_price, notes,
        products(name),
        order_item_extras(id, qty, unit_price, extras(name))
      )
    `)
    .eq('id', orderId)
    .single()

// Ventas ANULADAS en un rango (sin filtro de método). Para la sección
// "Anuladas (N)" del historial cuando hay un filtro de método activo: una
// anulada perdió sus payments → no tiene método → no puede bucketizarse; se
// muestra aparte. Son pocas (índice parcial idx_orders_cancelled). Trae quién
// anuló (canceller) y el motivo para la auditoría. Ordenadas por número desc.
export const getCancelledSales = (sedeId: string, from?: string, to?: string) => {
  let q = supabase
    .from('orders')
    .select(
      `id, order_number, created_at, canal, customer_name, total, payment_status, ` +
        `cancelled_at, cancel_reason, ` +
        `payments(method, amount), profiles!orders_created_by_fkey(full_name), ` +
        `canceller:profiles!orders_cancelled_by_fkey(full_name)`,
    )
    .eq('sede_id', sedeId)
    .not('order_number', 'is', null)
    .not('cancelled_at', 'is', null)

  if (from) q = q.gte('created_at', from)
  if (to) q = q.lte('created_at', to)

  return q.order('order_number', { ascending: false })
}

// --- Anulación de venta (RPC atómica register_sale_void) ---

// Retorno de register_sale_void. ⚠️ Interfaz a mano: ver la nota de
// RegisterDebtPaymentResult — TS valida contra ESTO, no contra la funcion.
// Las 4 claves se verificaron contra el jsonb_build_object de
// `20260901120000_void_expone_was_fiado.sql` el 2026-09-01.
export interface SaleVoidResult {
  order_id: string
  /** La venta era a credito. La RPC la expone desde v2; antes la declaraba esta
   *  interfaz y la funcion NO la mandaba — `undefined` silencioso. */
  was_fiado: boolean
  payments_deleted: number
  stock_returned: number
}

// Anula una venta del turno actual: revierte stock, borra payments y marca la
// orden. Las 6 guardas viven en la RPC (server-side); acá solo se invoca.
export const registerSaleVoid = (orderId: string, reason: string) =>
  supabase.rpc('register_sale_void', { p_order_id: orderId, p_reason: reason })

// --- Order Items ---

export const addOrderItems = (items: TablesInsert<'order_items'>[]) =>
  supabase.from('order_items').insert(items).select()

export const updateOrderItem = (itemId: string, data: TablesUpdate<'order_items'>) =>
  supabase.from('order_items').update(data).eq('id', itemId).select().single()

export const removeOrderItem = (itemId: string) =>
  supabase.from('order_items').delete().eq('id', itemId)

// --- Payments ---

export const createPayment = (payment: TablesInsert<'payments'>) =>
  supabase.from('payments').insert(payment).select().single()

// Una parte de un pago (mixto o simple): método del enum + monto imputado.
// El vuelto NO se persiste: la fila de efectivo va por el monto imputado.
export type SalePaymentPart = { method: Enums<'payment_method'>; amount: number }

// Registra atómicamente N pagos de una venta de contado (pago mixto). La RPC
// SECURITY DEFINER valida sede, que sea venta de contado (no fiado), que no
// tenga pagos previos y que Σ amounts = total de la orden (rechaza si no cuadra).
// NO crea cash_movement: el efectivo se deriva de payments en el cuadre de caja.
export const registerSalePayment = (orderId: string, parts: SalePaymentPart[]) =>
  supabase.rpc('register_sale_payment', {
    p_order_id: orderId,
    p_payments: parts as unknown as Json,
  })

export const getOrderPayments = (orderId: string) =>
  supabase.from('payments').select('*').eq('order_id', orderId)

export const getShiftPayments = (sedeId: string, from: string) =>
  supabase
    .from('payments')
    .select('*')
    .eq('sede_id', sedeId)
    .gte('created_at', from)

// Nº de VENTAS (órdenes distintas) del turno. Una venta mixta = varias filas
// payments pero UNA orden → order_id distintos. Incluye las ventas GRATIS (descuento
// 100%, total 0, sin payment): se anclan por total=0 + order_number asignado
// (marca de venta completada) + created_at en
// la ventana. Fiado (total>0, sin payment) NO cuenta (igual que antes).
export const getShiftSalesCount = async (sedeId: string, from: string): Promise<number> => {
  const { data: pays, error: e1 } = await supabase
    .from('payments')
    .select('order_id')
    .eq('sede_id', sedeId)
    .gte('created_at', from)
  if (e1) throw e1
  const ids = new Set((pays ?? []).map((p) => p.order_id as string))

  const { data: free, error: e2 } = await supabase
    .from('orders')
    .select('id')
    .eq('sede_id', sedeId)
    .eq('total', 0)
    .not('order_number', 'is', null)
    .is('cancelled_at', null)   // una venta gratis anulada NO cuenta
    .gte('created_at', from)
  if (e2) throw e2
  for (const o of free ?? []) ids.add(o.id as string)
  return ids.size
}

// --- Cash Movements ---

export const getCashMovements = (shiftId: string) =>
  supabase
    .from('cash_movements')
    .select('*')
    .eq('jornada_id', shiftId)
    .order('created_at', { ascending: false })

// Totales de ingresos/egresos de un turno (para reimprimir su arqueo). Los
// cash_movements persisten por jornada_id → re-leíbles tras el cierre sin snapshot.
export const getShiftMovementTotals = async (shiftId: string): Promise<{ in: number; out: number }> => {
  const { data, error } = await getCashMovements(shiftId)
  if (error) throw error
  const rows = data ?? []
  return {
    in: rows.filter((m) => m.type === 'in').reduce((s, m) => s + m.amount, 0),
    out: rows.filter((m) => m.type === 'out').reduce((s, m) => s + m.amount, 0),
  }
}

export const createCashMovement = (movement: TablesInsert<'cash_movements'>) =>
  supabase.from('cash_movements').insert(movement).select().single()

// --- Cash Shifts ---

export const getOpenShift = (sedeId: string) =>
  supabase
    .from('jornadas')
    .select('*')
    .eq('sede_id', sedeId)
    .is('closed_at', null)
    .maybeSingle()

export const openShift = (shift: TablesInsert<'jornadas'>) =>
  supabase.from('jornadas').insert(shift).select().single()

export const closeShift = (
  shiftId: string,
  data: Pick<
    TablesUpdate<'jornadas'>,
    'closing_amount' | 'closed_by' | 'closed_at' | 'expected_amount' | 'difference'
    | 'close_reconciliation' | 'close_comment'
  >,
) => supabase
  .from('jornadas')
  .update(data)
  .eq('id', shiftId)
  // Mismos joins que getClosedShifts: el comprobante del cierre usa los mismos
  // nombres (abrió/cerró) que la reimpresión → salida idéntica.
  .select(
    'id, opening_amount, opened_at, opened_by, closing_amount, expected_amount, ' +
    'difference, closed_at, closed_by, close_reconciliation, close_comment, ' +
    'abrio:profiles!jornadas_opened_by_fkey(full_name), ' +
    'cerro:profiles!jornadas_closed_by_fkey(full_name)',
  )
  .single()

// --- Historial de turnos y de gastos (solo lectura, paginado) ---

/** Fila de turno cerrado con el nombre de quién abrió/cerró. */
export type ClosedShiftRow = {
  id: string
  opening_amount: number
  opened_at: string
  opened_by: string
  closing_amount: number | null
  expected_amount: number | null
  difference: number | null
  closed_at: string | null
  closed_by: string | null
  // Arqueo multi-método persistido (snapshot). null en turnos pre-migración →
  // la reimpresión del comprobante se deshabilita (degradación con gracia).
  close_reconciliation: Json | null
  close_comment: string | null
  abrio: { full_name: string | null } | null
  cerro: { full_name: string | null } | null
}

export interface ClosedShiftsFilters {
  sedeId: string
  /** Filtro de PRESENTACIÓN (no seguridad): solo turnos abiertos/cerrados por
   *  este usuario. La RLS ya limita a la sede. */
  userId?: string | null
  from?: string
  to?: string
  page: number
  pageSize: number
}

export const getClosedShifts = ({
  sedeId, userId, from, to, page, pageSize,
}: ClosedShiftsFilters) => {
  let q = supabase
    .from('jornadas')
    .select(
      'id, opening_amount, opened_at, opened_by, closing_amount, expected_amount, ' +
      'difference, closed_at, closed_by, close_reconciliation, close_comment, ' +
      'abrio:profiles!jornadas_opened_by_fkey(full_name), ' +
      'cerro:profiles!jornadas_closed_by_fkey(full_name)',
      { count: 'exact' },
    )
    .eq('sede_id', sedeId)
    .not('closed_at', 'is', null)
  if (userId) q = q.or(`opened_by.eq.${userId},closed_by.eq.${userId}`)
  if (from) q = q.gte('closed_at', from)
  if (to) q = q.lte('closed_at', to)
  return q
    .order('closed_at', { ascending: false })
    .range(page * pageSize, page * pageSize + pageSize - 1)
}

/** Fila de egreso (movimiento 'out') con el nombre de quién lo registró. */
export type CashOutRow = {
  id: string
  amount: number
  reason: string
  /**
   * 🔴 Fecha del gasto (deuda 44). Es la que FILTRA y ORDENA esta pantalla.
   * `created_at` sigue existiendo y sigue siendo lo que cuadra la caja: son dos
   * preguntas distintas sobre la misma fila.
   */
  document_date: string
  /** Qué clase de gasto (deuda 45). Null = sin clasificar, que es un dato. */
  subcategoria: string | null
  /** A quién se le pagó. Texto libre; PII, por eso está en el censo de Sentry. */
  pagado_a: string | null
  /** `gasto` u `otro` (ver CATEGORIAS_DE_GASTO): se muestra por fila para que
   *  `otro` sea visible como tal y no se confunda con un gasto clasificado. */
  categoria: string
  created_at: string
  created_by: string
  jornada_id: string
  autor: { full_name: string | null } | null
}

export interface CashOutFilters {
  sedeId: string
  userId?: string | null
  from?: string
  to?: string
  page: number
  pageSize: number
}

/**
 * 🔴 CATEGORIAS DE GASTO — deuda 63. `type='out'` es "salió de la caja", NO "es
 *    un gasto". `register_purchase` registra cada compra pagada en efectivo como
 *    `out · compra`, y un retiro del dueño es `out · retiro`: ninguno de los dos
 *    es un gasto del negocio.
 *
 *    Medido en el archivo real del cliente (2026-09-02): mete "Compra de
 *    inventario" en su hoja de gastos y **3.511.500 de sus 5.495.500 son
 *    compras**. Sin este filtro le devolvemos su mismo número inflado.
 *
 *    Se incluye `otro` a propósito: el CHECK le exige detalle libre, así que
 *    siempre viene explicado, y dejarlo afuera **escondería** plata — que en un
 *    reporte de gastos es peor que mostrar de más (dirección del fallo).
 *
 * ⚠️ El ARQUEO no usa esto y no debe: allí `movementsOut` suma todos los `out`
 *    porque todos salieron del cajón. Son dos preguntas sobre la misma tabla.
 */
export const CATEGORIAS_DE_GASTO = ['gasto', 'otro'] as const

export const getCashOutMovements = ({
  sedeId, userId, from, to, page, pageSize,
}: CashOutFilters) => {
  let q = supabase
    .from('cash_movements')
    .select(
      'id, amount, reason, categoria, subcategoria, pagado_a, ' +
      'created_at, document_date, created_by, jornada_id, ' +
      'autor:profiles!cash_movements_created_by_fkey(full_name)',
      { count: 'exact' },
    )
    .eq('sede_id', sedeId)
    .eq('type', 'out')
    .in('categoria', CATEGORIAS_DE_GASTO)
  if (userId) q = q.eq('created_by', userId)
  // 🔴 EL RANGO SE APLICA SOBRE `document_date` (deuda 44). Un gasto del 24
  // cargado el 31 pertenece al 24. Y como es una columna `date`, el filtro son
  // fechas planas: desaparece la conversión a ISO con -05:00 que hacía el hook,
  // y con ella el riesgo de R7 en este filtro.
  if (from) q = q.gte('document_date', from)
  if (to) q = q.lte('document_date', to)
  return q
    .order('document_date', { ascending: false })
    .order('created_at', { ascending: false })
    .range(page * pageSize, page * pageSize + pageSize - 1)
}

/** Suma de egresos del período (para el total; consulta sin paginar, solo amount). */
export const getCashOutTotal = ({
  sedeId, userId, from, to,
}: Omit<CashOutFilters, 'page' | 'pageSize'>) => {
  let q = supabase
    .from('cash_movements')
    .select('amount')
    .eq('sede_id', sedeId)
    .eq('type', 'out')
    .in('categoria', CATEGORIAS_DE_GASTO)   // el total y la lista, la misma pregunta
  if (userId) q = q.eq('created_by', userId)
  if (from) q = q.gte('document_date', from)   // ...y el mismo rango, ver arriba
  if (to) q = q.lte('document_date', to)
  return q
}

// --- Profiles (sede users, for admin config) ---

export const getSedeProfiles = (sedeId: string) =>
  supabase.from('profiles').select('*').eq('sede_id', sedeId).order('full_name')

export const updateProfile = (userId: string, data: TablesUpdate<'profiles'>) =>
  supabase.from('profiles').update(data).eq('id', userId).select().single()

export const createUser = (params: {
  email: string
  password: string
  full_name: string
  /** Rol enum legacy que consume el trigger handle_new_user. */
  role: 'admin' | 'cashier'
  /**
   * Rol RBAC. Lo asigna la propia Edge Function, en el mismo request.
   * 🔴 NO admite null desde el 2026-09-07 (deuda 99): una cuenta sin rol entra
   *    y no puede hacer nada. La Edge Function lo rechaza con 400.
   */
  role_id: string
  sede_id: string
}) => supabase.functions.invoke('create-user', { body: params })

// --- Storage: sede-logos (logo + nequi QR) ---
//
// 🔴 LAS TRES SUBIDAS PROPAGAN EL ERROR, y hasta el 2026-09-15 lo TIRABAN.
//    La linea era `if (error || !data) return null`, asi que el `StorageError`
//    —el unico que sabe si falto el bucket, si falto la policy, si el archivo
//    era muy grande o si no hay permiso— se descartaba ANTES de que nadie lo
//    leyera, y el llamador solo podia decir «Error al subir el logo».
//
//    No era un mensaje pobre: **el dato ya no existia** cuando el toast se
//    escribia. Es la misma clase que el `toast.error` plano de `saveProduct`, y
//    la misma familia que «un catch que convierte un error en '' es fail-open».
//
// ⚠️ SON TRES INSTANCIAS, NO DOS: `uploadSedeLogo`, `uploadNequiQR` y
//    `uploadProductImage`. Las dos primeras comparten bucket; la tercera es de
//    otro. Se arreglan juntas a proposito — arreglar la que duele y dejar las
//    hermanas es el defecto que este repo ya pago varias veces.

export const uploadSedeLogo = async (
  sedeId: string,
  file: File,
): Promise<string> => {
  const ext = file.name.split('.').pop() ?? 'png'
  const path = `${sedeId}/logo.${ext}`
  const { data, error } = await supabase.storage
    .from('sede-logos')
    // `cacheControl` es POR SUBIDA, no del bucket: no degrada el cache de
    // ningun otro objeto. El default de supabase-js es '3600' —una hora— y esa
    // es la mitad del problema de la deuda 111; la otra mitad la resuelve el
    // `?v=` derivado de `updated_at` en el render.
    .upload(path, file, { upsert: true, cacheControl: '60' })
  // Propaga: quien llama decide como mostrarlo, con el mensaje REAL.
  if (error) throw error
  if (!data) throw new Error('El almacenamiento no devolvio la ruta del archivo')
  const { data: { publicUrl } } = supabase.storage
    .from('sede-logos')
    .getPublicUrl(data.path)
  return publicUrl
}

export const uploadNequiQR = async (
  sedeId: string,
  file: File,
): Promise<string> => {
  const ext = file.name.split('.').pop() ?? 'png'
  const path = `${sedeId}/nequi-qr.${ext}`
  const { data, error } = await supabase.storage
    .from('sede-logos')
    // `cacheControl` es POR SUBIDA, no del bucket: no degrada el cache de
    // ningun otro objeto. El default de supabase-js es '3600' —una hora— y esa
    // es la mitad del problema de la deuda 111; la otra mitad la resuelve el
    // `?v=` derivado de `updated_at` en el render.
    .upload(path, file, { upsert: true, cacheControl: '60' })
  // Propaga: quien llama decide como mostrarlo, con el mensaje REAL.
  if (error) throw error
  if (!data) throw new Error('El almacenamiento no devolvio la ruta del archivo')
  const { data: { publicUrl } } = supabase.storage
    .from('sede-logos')
    .getPublicUrl(data.path)
  return publicUrl
}

// --- Compras / Proveedores (F3) ---

export type Supplier = Tables<'suppliers'>

// Proveedores ACTIVOS de la sede (borrado = soft-deactivate, ver deleteSupplier).
export const getSuppliers = (sedeId: string) =>
  supabase
    .from('suppliers')
    .select('*')
    .eq('sede_id', sedeId)
    .eq('is_active', true)
    .order('name')

export const upsertSupplier = (data: TablesInsert<'suppliers'>) =>
  supabase.from('suppliers').upsert(data).select().single()

// Soft delete: purchase_invoices.supplier_id es ON DELETE RESTRICT, así que un
// proveedor con facturas no se puede borrar. Se desactiva (patrón couriers).
export const deleteSupplier = (supplierId: string) =>
  supabase.from('suppliers').update({ is_active: false }).eq('id', supplierId)

// Payload de la compra. La RPC register_purchase DERIVA total/subtotales y el
// sede_id; del cliente solo se usan estos campos (unit_cost es el costo
// capturado del documento físico).
export type PurchaseInvoicePayload = {
  supplier_id: string
  invoice_number: string | null
  notes: string | null
  /**
   * 🔴 La fecha del PAPEL del proveedor, `YYYY-MM-DD` (deuda 44). No es cuándo
   * se teclea: el cliente registra el 2 de septiembre facturas del 31 de
   * agosto, medido en su archivo real. Si se omite, la RPC la fecha hoy en
   * Bogotá — nunca con `current_date`, que en el servidor es UTC.
   */
  document_date: string
}

export type PurchaseItemPayload = {
  product_id: string
  /**
   * 🔴 SON UNIDADES DE COMPRA, NO DE VENTA. Si se compran 12 bultos, acá va 12.
   * Las unidades que entran al inventario son `qty × units_per_purchase_unit`,
   * y ese cálculo lo hace la RPC — no el cliente.
   */
  qty: number
  /** Costo de UNA unidad de compra (lo que dice la factura del proveedor). */
  unit_cost: number
  /**
   * Etiqueta de la presentación: 'bulto', 'canasta', 'caja'. `null` o ausente =
   * se compró en la misma unidad en que se vende.
   */
  purchase_unit?: string | null
  /**
   * Cuántas unidades de VENTA trae una unidad de compra.
   * ⚠️ Si mandás `purchase_unit`, esto es OBLIGATORIO: la RPC rechaza la compra
   * entera si falta. No hay default silencioso a propósito — un factor que se
   * asume 1 cuando era 50 deja el costo unitario 50 veces más alto, y
   * `cost_price` se congela en la línea de venta: el error queda grabado.
   */
  units_per_purchase_unit?: number
}

/**
 * Resultado de register_purchase — las TRES claves que el `jsonb_build_object`
 * de la RPC manda, verificadas contra la migración.
 *
 * ⚠️ Declaraba dos de tres: faltaba `cash_movement_id`, que la RPC manda desde
 * la deuda 26. Es el lado que DESPERDICIA de la asimetría (el dato existía y
 * nadie podía usarlo), no el que miente — por eso no era urgente, y por eso se
 * arregla ahora que se abre el archivo por otra razón (R3).
 *
 * 🔴 Y el comentario que estaba acá decía *"la compra NO toca la caja: no crea
 * egreso automático"*. **Era falso desde la deuda 26**, que invirtió justamente
 * eso: la compra SALE de la caja del día y se rechaza sin jornada abierta. Un
 * comentario no lo mira ningún verificador — es la clase entera de "lo que no es
 * una referencia de código".
 */
export interface RegisterPurchaseResult {
  invoice_id: string
  total: number
  /** `null` si el total redondeado dio 0 (no se crea movimiento por cero). */
  cash_movement_id: string | null
  /** Consecutivo de compra de la sede (migración `numeracion_de_compras`). */
  purchase_number: number
}

// Registra la compra de forma atómica: sube stock (en unidades de VENTA, ya
// convertidas por el factor), recalcula cost_price con promedio ponderado móvil
// y genera el egreso de caja. Exige jornada abierta y la rechaza si no la hay.
// SECURITY DEFINER.
export const registerPurchase = (
  invoice: PurchaseInvoicePayload,
  items: PurchaseItemPayload[],
) =>
  supabase.rpc('register_purchase', {
    p_invoice: invoice as unknown as Json,
    p_items: items as unknown as Json,
  })

/**
 * Resultado de update_purchase — las CUATRO claves del `jsonb_build_object` de
 * la migración `editar_compra`, verificadas contra ella (R1 punto 5b).
 */
export interface UpdatePurchaseResult {
  invoice_id: string
  purchase_number: number
  total: number
  /** Movimiento `correccion_compra` por la diferencia de plata; `null` si el
   *  total redondeado no cambió. */
  cash_movement_id: string | null
}

/**
 * Reescribe una compra: ítems y cabecera (decisión 2026-09-17, ventana
 * «siempre»). La RPC asienta la diferencia de stock como ajuste y la de plata
 * en la jornada ABIERTA; rechaza compras con devoluciones. El costo promedio es
 * exacto sólo si la compra fue lo último que movió el producto — ver la
 * migración `20260918120000_editar_compra`.
 */
export const updatePurchase = (
  invoiceId: string,
  invoice: PurchaseInvoicePayload,
  items: PurchaseItemPayload[],
) =>
  supabase.rpc('update_purchase', {
    p_invoice_id: invoiceId,
    p_invoice: invoice as unknown as Json,
    p_items: items as unknown as Json,
  })

// Historial de compras (cabeceras), paginado y ordenado por fecha desc.
export interface PurchaseInvoicesFilters {
  sedeId: string
  page: number
  pageSize: number
}

/** Compra o devolución: `kind` es lo único que las distingue. */
export type PurchaseInvoiceKind = 'purchase' | 'return'

export interface PurchaseInvoiceListRow {
  id: string
  created_at: string
  /** Consecutivo de COMPRA por sede. `null` en las devoluciones. */
  purchase_number: number | null
  invoice_number: string | null
  total: number
  /** Fecha del papel del proveedor. Es la que ORDENA esta lista. */
  document_date: string
  // 🔴 `kind` SE PIDE SIEMPRE. `purchase_invoices` guarda las devoluciones en la
  // misma tabla y con `total` POSITIVO —el signo lo lleva la cabecera, no las
  // cantidades—, así que una lista que no lo mire muestra una devolución como si
  // fuera una compra y suma al revés. Misma clase que la deuda 63.
  kind: PurchaseInvoiceKind
  // ⚠️ SIN `payment_method`: la columna no existe (deuda 26) y el select no la
  // pide. Estaba declarada igual, así que TS habría dejado leerla y en runtime
  // era `undefined` — misma clase que el retorno de arriba, y del lado que
  // MIENTE: un `undefined` es falsy y el código elige una rama. Nadie la leía;
  // se saca antes de que alguien lo haga.
  suppliers: { name: string } | null
  profiles: { full_name: string | null } | null
}

export const getPurchaseInvoices = ({
  sedeId, page, pageSize,
}: PurchaseInvoicesFilters) => {
  const fromIdx = page * pageSize
  return supabase
    .from('purchase_invoices')
    .select(
      // ⚠️ SIN payment_method: la columna no existe (deuda 26 — la compra sale
      //    de caja, siempre). Pedirla hacia fallar la consulta ENTERA y la lista
      //    de compras se veia vacia. Nadie la leia: era solo el select.
      'id, created_at, purchase_number, invoice_number, total, kind, document_date, ' +
        'suppliers(name), profiles!purchase_invoices_created_by_fkey(full_name)',
      { count: 'exact' },
    )
    .eq('sede_id', sedeId)
    // Ordena por la fecha del DOCUMENTO: una factura vieja cargada hoy va donde
    // le corresponde. `created_at` queda de desempate para dos papeles del
    // mismo día, y así el orden es estable.
    .order('document_date', { ascending: false })
    .order('created_at', { ascending: false })
    .range(fromIdx, fromIdx + pageSize - 1)
}

// Detalle de una factura: cabecera + ítems con nombre de producto.
export interface PurchaseInvoiceDetailRow {
  id: string
  created_at: string
  /** Consecutivo de COMPRA por sede. `null` en las devoluciones. */
  purchase_number: number | null
  invoice_number: string | null
  total: number
  kind: PurchaseInvoiceKind
  document_date: string
  /** Solo en `kind: 'return'`: la compra que esta devolución revierte. */
  returns_invoice_id: string | null
  // ⚠️ Tercera aparición del mismo campo muerto en este archivo: declarado y
  // nunca pedido. El select de abajo ya decía "sin payment_method: no existe" y
  // la interfaz lo declaraba igual — las dos mitades del contrato en el mismo
  // archivo, contradiciéndose, y TS mirando solo una.
  notes: string | null
  /** Para precargar el formulario al editar. */
  supplier_id: string
  /** Última edición con update_purchase; `null` = nunca se editó. */
  edited_at: string | null
  suppliers: { name: string; contact: string | null; phone: string | null } | null
  profiles: { full_name: string | null } | null
  purchase_invoice_items: {
    id: string
    product_id: string
    /** Unidades de COMPRA. Las de venta son `qty × units_per_purchase_unit`. */
    qty: number
    unit_cost: number
    subtotal: number
    purchase_unit: string | null
    units_per_purchase_unit: number
    /** `codigo` se agrego el 2026-09-07 (deuda 41) Y CON SU `select`: declarar
     *  una clave que la consulta no pide devuelve `undefined`, que es falsy. */
    products: { name: string; codigo: string | null } | null
  }[]
}

export const getPurchaseInvoiceDetail = (invoiceId: string) =>
  supabase
    .from('purchase_invoices')
    .select(
      'id, created_at, purchase_number, invoice_number, total, notes, kind, returns_invoice_id, ' +
        'document_date, supplier_id, edited_at, ' +
        'suppliers(name, contact, phone), ' +
        'profiles!purchase_invoices_created_by_fkey(full_name), ' +
        'purchase_invoice_items(id, product_id, qty, unit_cost, subtotal, ' +
        'purchase_unit, units_per_purchase_unit, products(name, codigo))',
    )
    .eq('id', invoiceId)
    .single()

// --- Fiado / Clientes (CRM) ---

export type Customer = Tables<'customers'>

// Clientes ACTIVOS de la sede (borrado = soft-deactivate, patrón suppliers).
export const getCustomers = (sedeId: string) =>
  supabase
    .from('customers')
    .select('*')
    .eq('sede_id', sedeId)
    .eq('is_active', true)
    .order('name')

export const upsertCustomer = (data: TablesInsert<'customers'>) =>
  supabase.from('customers').upsert(data).select().single()

// Soft delete: orders.customer_id es ON DELETE SET NULL, pero conservamos el
// cliente para no perder la trazabilidad de la deuda. Se desactiva.
export const deleteCustomer = (customerId: string) =>
  supabase.from('customers').update({ is_active: false }).eq('id', customerId)

// --- Cuentas por cobrar (deudas a fiado) ---

// Una orden a fiado con sus abonos (para derivar el saldo en el cliente).
export interface DebtRow {
  id: string
  order_number: number | null
  created_at: string
  total: number
  payment_status: string             // 'pending' | 'partial'
  /** Plazo CONGELADO de esta venta (deuda 46). null = sin plazo pactado. */
  plazo_dias: number | null
  customer_id: string | null
  customer_name: string | null
  customers: { name: string } | null
  debt_payments: { amount: number }[]
}

// Órdenes a fiado pendientes/parciales de la sede, con sus abonos. El saldo se
// deriva en el cliente: total − suma(debt_payments.amount).
export const getDebts = (sedeId: string) =>
  supabase
    .from('orders')
    .select(
      // `plazo_dias` es el plazo CONGELADO de esta venta (deuda 46). No se lee
      // del cliente: renegociarlo no puede mover el vencimiento de una venta
      // vieja, y esta consulta es justamente la que lo calcularía distinto.
      'id, order_number, created_at, total, payment_status, customer_id, customer_name, ' +
        'plazo_dias, customers(name), debt_payments(amount)',
    )
    .eq('sede_id', sedeId)
    .in('payment_status', ['pending', 'partial'])
    .is('cancelled_at', null)   // una venta fiada anulada sale de Cartera
    .order('created_at', { ascending: false })

// Historial de abonos de una orden (mayor append-only), más reciente primero.
export interface DebtPaymentRow {
  id: string
  amount: number
  payment_method: string
  created_at: string
  /**
   * 🔴 El abono quedó contra el saldo del cliente pero SIN contrapartida en
   * caja (no había jornada abierta a la cual atribuirlo). Es un estado
   * obligatorio de la pantalla Cartera (§6) y hasta hoy **se escribía y no se
   * leía nunca**: la RPC lo setea desde el primer día y ningún select lo pedía.
   *
   * ⚠️ NO se re-deriva de `cash_movement_id == null`, y por eso ese campo salió
   * del select. No son lo mismo: un abono con TARJETA tampoco crea movimiento
   * de caja y **no** está pendiente de conciliar. Confundirlos es exactamente
   * lo que hizo nacer esta columna — el caso 2 de "un valor que significa dos
   * cosas no es un dato", donde `cash_movement_id` nulo cargaba "no tocó caja"
   * Y "la jornada estaba cerrada". Dejar el campo en el select invitaba a
   * rehacer la mezcla.
   */
  requiere_conciliacion: boolean
  profiles: { full_name: string | null } | null
}

export const getDebtPayments = (orderId: string) =>
  supabase
    .from('debt_payments')
    .select('id, amount, payment_method, requiere_conciliacion, created_at, ' +
            'profiles!debt_payments_created_by_fkey(full_name)')
    .eq('order_id', orderId)
    .order('created_at', { ascending: false })

// Resultado de register_debt_payment (el jsonb que retorna la RPC).
//
// 🔴 ESTA INTERFAZ SE ESCRIBE A MANO Y NADA LA VERIFICA. `rpc()` devuelve `Json`,
//    así que TS valida los accesos contra ESTO, no contra la función. Si una
//    clave no coincide, el compilador aprueba una lectura que en runtime da
//    `undefined` — y `undefined` es falsy, así que el código toma la rama
//    equivocada EN SILENCIO. Es R1 punto 5 fuera de database.types.ts.
//    Pasó: decía `shift_open` y la RPC devuelve `jornada_abierta`. Ver BITACORA.
//    Las cinco claves de abajo se copiaron del `jsonb_build_object` de la
//    migración `clientes_y_cartera` el 2026-09-01. Al tocar la RPC, tocar esto.
export interface RegisterDebtPaymentResult {
  new_status: string                 // 'paid' | 'partial'
  saldo_restante: number
  cash_movement_created: boolean
  jornada_abierta: boolean
  requiere_conciliacion: boolean
}

// Registra un abono de forma atómica (valida saldo, y si es efectivo con turno
// abierto genera el ingreso de caja). SECURITY DEFINER.
export const registerDebtPayment = (
  orderId: string,
  amount: number,
  paymentMethod: string,
) =>
  supabase.rpc('register_debt_payment', {
    p_order_id: orderId,
    p_amount: amount,
    p_payment_method: paymentMethod,
  })
