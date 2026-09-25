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

/** Desactiva por id. Para las limpiezas que hoy lo hacen clickeando. */
export async function desactivar(tabla: 'products' | 'categories' | 'extras', ids: string[]): Promise<void> {
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
