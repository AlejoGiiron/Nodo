import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { expect } from '@playwright/test'

// ============================================================================
// FIXTURE POR API — crear el escenario sin pasar por los modales
//
// 🔴 POR QUÉ EXISTE, y la razón NO es que la suite tarde menos (deuda 131):
//    **es la VARIANZA.** Medido el 2026-09-24 corriendo `extras-pos` tres veces
//    seguidas, sin tocar nada entre corridas:
//
//      setup    (7 flujos de escritura por modal)  25,4 · 23,2 · 19,5 s  → ~30%
//      limpieza (desactivar por la UI)             15,2 · 15,6 · 15,3 s  → 2,6%
//
//    Con las dos históricas, el setup va de **19,5 a 30,4 s** — y el tope por
//    caso es 30. **Un caso que tarda 11 s o 30 s según cuándo corra no tiene
//    margen que defender**, y por eso cruza el tope sin que nada cambie.
//
// ⚠️ Y el contraste está DENTRO DEL MISMO ARCHIVO, que es lo que descarta la
//    explicación cómoda: si «andamio por UI» fuera la causa, la limpieza variaría
//    igual. No varía. La varianza la tiene el que ESCRIBE, no el que navega.
//
// 🔴 ESTE ARCHIVO ES UN LADO DEL CONTRATO DE LAS COLUMNAS DE `products`
//    (deuda 78). El payload de abajo se copió del de `ProductModal.tsx`, y ese
//    contrato no lo sincroniza nada.
//    ⚠️ Está en UN solo lugar a propósito: los 23 setups que lo usan **no
//    repiten el payload**. El precedente de lo que pasa al copiarlo ya está
//    medido — `scripts/cargar-catalogo.mjs` se declara copia de `ProductModal`
//    *campo por campo* y por eso se congela cuando el formulario cambia.
//    **Veintitrés copias serían veintitrés lados; esto es uno.**
//
// ⚠️ LO QUE ESTE HELPER **NO** REEMPLAZA: la cobertura de crear por la UI.
//    Esos 23 setups la ejercitaban **de paso**, así que moverlos podría
//    retirarla sin que nada se ponga rojo. Medido antes de escribir esto:
//    `productos.spec.ts` la cubre **como sujeto** —«crear una categoría aparece
//    en los tabs», «crear un producto en esa categoría aparece en el grid»,
//    «desactivar producto pide confirmación»—. Si esos casos se borran, esta
//    migración pasa a ser una pérdida de cobertura.
// ============================================================================

let cache: SupabaseClient | null = null

/** Cliente anon con la sesión del owner. Se reusa dentro del mismo worker. */
export async function db(): Promise<SupabaseClient> {
  if (cache) return cache
  const c = createClient(
    process.env.VITE_NODO_SUPABASE_URL!,
    process.env.VITE_NODO_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } },
  )
  const { error } = await c.auth.signInWithPassword({
    email: process.env.E2E_OWNER_EMAIL!,
    password: process.env.E2E_OWNER_PASSWORD!,
  })
  expect(error, `fixture: no se pudo entrar como owner — ${error?.message}`).toBeNull()
  cache = c
  return c
}

/** La sede del owner. El escenario se siembra siempre ahí. */
export async function sedeDelOwner(): Promise<string> {
  const c = await db()
  const uid = (await c.auth.getUser()).data.user!.id
  const { data, error } = await c.from('profiles').select('sede_id').eq('id', uid).single()
  expect(error, `fixture: no se pudo leer el perfil — ${error?.message}`).toBeNull()
  return data!.sede_id as string
}

export async function crearCategoria(nombre: string, sede?: string): Promise<string> {
  const c = await db()
  const sede_id = sede ?? (await sedeDelOwner())
  const { data, error } = await c.from('categories')
    .insert({ sede_id, name: nombre, color: '#3B82F6' }).select('id').single()
  expect(error, `fixture: no se pudo crear la categoría "${nombre}" — ${error?.message}`).toBeNull()
  return data!.id as string
}

interface ProductoNuevo {
  nombre: string
  precio: number
  categoria: string
  /** `false` para un producto sin seguimiento de existencias. */
  tracking?: boolean
  /** Existencia inicial. Sólo con `tracking`. */
  stock?: number
  minStock?: number
  kind?: 'simple' | 'composite'
  codigo?: string | null
  unidad?: string | null
}

/**
 * Crea un producto y **VERIFICA LO QUE SEMBRÓ**.
 *
 * 🔴 LOS CONTROLES NO SE PIERDEN AL PASAR A API — SE MUEVEN ACÁ. Los 23 setups
 *    aseveraban `stock 0` y `costo null` por la UI, y esas aserciones eran lo
 *    que hacía que el escenario significara algo: un producto que arranca con
 *    stock o con costo cambia lo que miden los casos de inventario y de costeo.
 * ⚠️ Y por eso el helper se asevera a SÍ MISMO: si dejara de verificarse, **un
 *    helper roto sembraría mal y los 23 casos medirían sobre datos equivocados**
 *    — sin un solo rojo que lo señale, porque ninguno de ellos mira el sembrado.
 */
export async function crearProducto(p: ProductoNuevo): Promise<string> {
  const c = await db()
  const sede_id = await sedeDelOwner()
  const tracking = p.kind === 'composite' ? false : (p.tracking ?? true)
  // El payload sigue al de `ProductModal.tsx`, campo por campo. Ver la nota de
  // R1 en la cabecera: esto es UN lado del contrato de la deuda 78.
  const { data, error } = await c.from('products').insert({
    sede_id,
    category_id: p.categoria,
    name: p.nombre,
    description: null,
    codigo: p.codigo ?? null,
    unidad: p.unidad ?? null,
    price: p.precio,
    image_url: null,
    is_active: true,
    kind: p.kind ?? 'simple',
    stock_tracking: tracking,
    min_stock: tracking ? (p.minStock ?? 0) : 0,
  }).select('id, stock_qty, cost_price, price, stock_tracking').single()
  expect(error, `fixture: no se pudo crear "${p.nombre}" — ${error?.message}`).toBeNull()

  const f = data!
  // ── LOS CONTROLES, que antes vivían en los setups por UI ───────────────────
  expect(Number(f.price), `fixture: "${p.nombre}" quedó con otro precio`).toBe(p.precio)
  expect(f.stock_tracking, `fixture: "${p.nombre}" quedó con el seguimiento al revés`).toBe(tracking)
  expect(
    f.cost_price,
    `fixture: "${p.nombre}" arrancó CON costo. Un costo de arranque cambia lo que miden ` +
    'los casos de costeo: el promedio ponderado tiene una rama distinta según si hay costo previo',
  ).toBeNull()
  // 🔴 LA EXISTENCIA NO SE INSERTA: SE CARGA POR `adjust_stock`, que es lo que
  //    hacía el setup por UI —`setStock`— y por la misma razón que la deuda 78:
  //    `stock_qty` no se escribe por la tabla, la mueven las RPC y cada movida
  //    deja su `stock_movement` con motivo.
  // ⚠️ Insertarla directo «funcionaría» y dejaría el lab con existencia SIN
  //    movimiento — la desalineación exacta que este proyecto ya midió (269 de
  //    1.537 productos con `stock_qty` distinto de la suma de sus movimientos).
  //    Un atajo del arnés no puede sembrar un estado que el producto no sabe
  //    producir.
  if (tracking && (p.stock ?? 0) > 0) {
    const { error: eAj } = await c.rpc('adjust_stock', {
      p_product_id: f.id, p_qty: p.stock, p_reason: 'Fixture del arnes E2E: existencia inicial',
    })
    expect(eAj, `fixture: no se pudo cargar la existencia de "${p.nombre}" — ${eAj?.message}`).toBeNull()
  }
  if (tracking) {
    const { data: v, error: eV } = await c.from('products').select('stock_qty').eq('id', f.id).single()
    expect(eV, `fixture: no se pudo releer "${p.nombre}" — ${eV?.message}`).toBeNull()
    expect(
      v!.stock_qty ?? 0,
      `fixture: "${p.nombre}" quedó con otra existencia que la pedida`,
    ).toBe(p.stock ?? 0)
  }
  return f.id as string
}

export async function crearExtra(nombre: string, precio: number, insumoId?: string): Promise<string> {
  const c = await db()
  const sede_id = await sedeDelOwner()
  const { data, error } = await c.from('extras')
    .insert({ sede_id, name: nombre, price: precio, is_active: true, linked_product_id: insumoId ?? null })
    .select('id, linked_product_id').single()
  expect(error, `fixture: no se pudo crear el extra "${nombre}" — ${error?.message}`).toBeNull()
  expect(
    data!.linked_product_id,
    `fixture: el extra "${nombre}" quedó con otro vínculo que el pedido — y el vínculo ` +
    'decide si vender el extra mueve inventario',
  ).toBe(insumoId ?? null)
  return data!.id as string
}

export async function asignarExtras(productoId: string, extraIds: string[]): Promise<void> {
  const c = await db()
  const { error } = await c.from('product_extras')
    .insert(extraIds.map((extra_id) => ({ product_id: productoId, extra_id })))
  expect(error, `fixture: no se pudieron asignar los extras — ${error?.message}`).toBeNull()
  const { data, error: e2 } = await c.from('product_extras').select('extra_id').eq('product_id', productoId)
  expect(e2, `fixture: no se pudo verificar la asignación — ${e2?.message}`).toBeNull()
  expect(
    (data ?? []).map((r) => r.extra_id).sort(),
    'fixture: los extras asignados no son los pedidos — y de eso depende que el modal se abra',
  ).toEqual([...extraIds].sort())
}

/**
 * Crea la RECETA de un compuesto: qué insumos consume y cuánto de cada uno.
 *
 * 🔴 NO ES UN PASO DE PASO — ES EL ESCENARIO. `inventario.spec` se llama
 *    «Inventario por recetas»: lo que mide es que vender un compuesto descuente
 *    su insumo. Su setup por UI armaba la receta clickeando `recipe-add-*`, y
 *    esa parte **no se puede saltear**: sin `product_components` el compuesto no
 *    descuenta nada y los casos medirían un producto sin receta con nombres de
 *    producto con receta.
 * ⚠️ Es la misma pregunta que destapó el `setStock` del piloto: *¿qué hace este
 *    setup DE PASO que sea parte del escenario?* Acá la respuesta es la receta.
 */
export async function crearReceta(
  compuestoId: string,
  insumos: { insumoId: string; qty: number }[],
): Promise<void> {
  const c = await db()
  const sede_id = await sedeDelOwner()
  const { error } = await c.from('product_components').insert(
    insumos.map((i) => ({ sede_id, parent_id: compuestoId, component_id: i.insumoId, qty: i.qty })),
  )
  expect(error, `fixture: no se pudo crear la receta — ${error?.message}`).toBeNull()
  const { data, error: e2 } = await c.from('product_components')
    .select('component_id, qty').eq('parent_id', compuestoId)
  expect(e2, `fixture: no se pudo verificar la receta — ${e2?.message}`).toBeNull()
  expect(
    (data ?? []).map((r) => `${r.component_id}:${Number(r.qty)}`).sort(),
    'fixture: la receta no quedó con los insumos pedidos — y de eso depende que vender ' +
    'el compuesto descuente inventario',
  ).toEqual(insumos.map((i) => `${i.insumoId}:${i.qty}`).sort())
}

/** Las tablas cuya fixture se retira desactivando — nunca borrando. */
export type Desactivable = 'products' | 'categories' | 'extras' | 'suppliers' | 'customers'

/**
 * Desactiva por NOMBRE EXACTO. Es para las limpiezas cuya fixture **la creó el
 * sujeto**, no el andamio.
 *
 * 🔴 POR QUÉ HACE FALTA además de `desactivar` por id: en `extras.spec` crear un
 *    extra por la pantalla **ES el sujeto** —«crear un extra simple en el
 *    catálogo»—, así que esos extras nacen en los casos y el `afterAll` no tiene
 *    sus ids. Que la creación se quede por UI **no obliga a que la limpieza
 *    también**: son dos decisiones distintas y sólo la primera es cobertura.
 * ⚠️ Por NOMBRE EXACTO y no por prefijo: acá el sujeto sí es de esta corrida, y
 *    barrer la familia podría pisar lo que otro caso está midiendo. La regla del
 *    prefijo es para el residuo que nadie reclama (deuda 130), no para esto.
 */
export async function desactivarPorNombre(tabla: Desactivable, nombres: string[]): Promise<void> {
  if (nombres.length === 0) return
  const c = await db()
  const { error } = await c.from(tabla).update({ is_active: false }).in('name', nombres)
  expect(error, `fixture: no se pudo desactivar en ${tabla} — ${error?.message}`).toBeNull()
  const { data, error: e2 } = await c.from(tabla).select('name').in('name', nombres).eq('is_active', true)
  expect(e2, `fixture: no se pudo verificar la desactivación — ${e2?.message}`).toBeNull()
  expect(
    (data ?? []).map((r) => r.name).join(' · ') || 'ninguno',
    `QUEDÓ FIXTURE ACTIVA en ${tabla}: se cuela en el POS de specs que no hablan de ella (deuda 67)`,
  ).toBe('ninguno')
}

/**
 * Crea un proveedor.
 *
 * ⚠️ LA PREGUNTA OBLIGATORIA —*¿qué hace el alta por UI que sea parte del
 *    escenario?*— acá se contesta **«nada»**, y se verificó abriendo el
 *    `createSupplier` que reemplaza: llenaba **sólo el nombre**. Las demás
 *    columnas (`nit`, `contact`, `phone`, `notes`) son nullables y ninguna
 *    compra las mira. Lo único que el escenario necesita es que el proveedor
 *    exista y esté activo, para poder elegirlo al registrar la compra.
 * 🔴 Y se declara porque en las dos tandas anteriores la respuesta NO fue
 *    «nada» —era `adjust_stock` en una y la receta en otra—: escribirlo deja
 *    dicho que **se preguntó**, no que no se le ocurrió a nadie.
 */
export async function crearProveedor(nombre: string): Promise<string> {
  const c = await db()
  const sede_id = await sedeDelOwner()
  const { data, error } = await c.from('suppliers')
    .insert({ sede_id, name: nombre, is_active: true }).select('id, is_active').single()
  expect(error, `fixture: no se pudo crear el proveedor "${nombre}" — ${error?.message}`).toBeNull()
  expect(data!.is_active, `fixture: el proveedor "${nombre}" nació inactivo`).toBe(true)
  return data!.id as string
}

/** Desactiva por id. Para las limpiezas que hoy lo hacen clickeando. */
export async function desactivar(tabla: Desactivable, ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const c = await db()
  const { error } = await c.from(tabla).update({ is_active: false }).in('id', ids)
  expect(error, `fixture: no se pudo desactivar en ${tabla} — ${error?.message}`).toBeNull()
  const { data, error: e2 } = await c.from(tabla).select('id').in('id', ids).eq('is_active', true)
  expect(e2, `fixture: no se pudo verificar la desactivación — ${e2?.message}`).toBeNull()
  expect(
    (data ?? []).map((r) => r.id).join(' · ') || 'ninguno',
    `QUEDÓ FIXTURE ACTIVA en ${tabla}: se cuela en el POS de specs que no hablan de ella (deuda 67)`,
  ).toBe('ninguno')
}
