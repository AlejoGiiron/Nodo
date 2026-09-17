import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { ownerCreds } from './helpers/auth'
import { limpiarOrganizaciones } from './helpers/limpieza'

// ============================================================================
// SALDO DE MOVIMIENTOS — `stock_movements_con_saldo` (migración 20260917120000)
//
// 🔴 EL CASO ① VA PRIMERO Y NO ES UN DETALLE DE ORDEN. Si PostgREST empujara el
//    filtro por `created_at` POR DEBAJO de la ventana, el saldo se calcularía
//    sólo sobre las filas visibles — que es exactamente la forma que se
//    descartó por mentir (arranca en cero dentro del rango), reintroducida por
//    el motor. Con eso roto, los otros cuatro casos medirían un número mal
//    calculado y darían verde igual.
//    El discriminador: el saldo de LA MISMA FILA con y sin filtro de fechas
//    tiene que ser IDÉNTICO.
//
// 🔴 EL ANCLA (caso ②): la fila más nueva tiene que dar `products.stock_qty`.
//    Es el número que la clienta ya ve en Inventario; si el saldo no cierra
//    ahí, no cierra en ningún lado.
//
// 🔴 EL HUECO VA EN DOS DIRECCIONES (caso ③). Sin el control de «sin hueco da
//    0», un defecto de «siempre muestra la línea» pasaría verde.
//
// ⚠️ NO va en `describe.serial`: los casos comparten la fixture, no el
//    resultado. El ⑤ es el control del modo de fallo y no puede quedar en
//    `did not run` por un rojo de los anteriores.
// ============================================================================

function loadEnv(path: string) {
  try {
    for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  } catch { /* ignore */ }
}
loadEnv('.env'); loadEnv('.env.test')

const SUF = Date.now().toString().slice(-6)
const URL = () => process.env.VITE_NODO_SUPABASE_URL!
const ANON = () => process.env.VITE_NODO_SUPABASE_ANON_KEY!

let db: SupabaseClient              // sesión del owner de LAB (pasa por RLS)
let admin: SupabaseClient | null = null   // service role: monta el tenant ajeno
let SEDE = ''
let CAT = ''
let CON_HISTORIA = ''   // 3 movimientos, existencia inicial 0
let CON_HUECO = ''      // existencia inicial 10 y un movimiento: hueco = 10
let SIN_TRACKING = ''   // no lleva existencia: saldo «—», nunca 0
const orgsCreadas: string[] = []
const productosAjenos: string[] = []

async function ajustar(id: string, qty: number) {
  const { error } = await db.rpc('adjust_stock', { p_product_id: id, p_qty: qty, p_reason: 'movimientos-saldo.spec' })
  expect(error?.message ?? null, `adjust_stock falló armando la fixture (${qty})`).toBeNull()
}

/** Filas de la vista para un producto, de la más nueva a la más vieja. */
async function saldos(cliente: SupabaseClient, productId: string, filtro?: { lte?: string }) {
  let q = cliente.from('stock_movements_con_saldo')
    .select('id, qty, created_at, saldo_despues')
    .eq('product_id', productId)
  if (filtro?.lte) q = q.lte('created_at', filtro.lte)
  const { data, error } = await q.order('created_at', { ascending: false }).order('id', { ascending: false })
  expect(error?.message ?? null, 'la vista no se pudo leer').toBeNull()
  return data ?? []
}

async function hueco(productId: string): Promise<number | null> {
  const { data, error } = await db.from('productos_existencia_sin_movimiento')
    .select('existencia_sin_movimiento').eq('product_id', productId).single()
  expect(error?.message ?? null, 'la vista del hueco no se pudo leer').toBeNull()
  return data!.existencia_sin_movimiento
}

test.beforeAll(async () => {
  db = createClient(URL(), ANON(), { auth: { persistSession: false } })
  const { error } = await db.auth.signInWithPassword(ownerCreds())
  if (error) throw error
  const uid = (await db.auth.getUser()).data.user!.id
  SEDE = (await db.from('profiles').select('sede_id').eq('id', uid).single()).data!.sede_id as string
  const key = process.env.E2E_SERVICE_ROLE_KEY
  if (key) admin = createClient(URL(), key, { auth: { persistSession: false } })

  CAT = (await db.from('categories').insert({ sede_id: SEDE, name: `E2E Saldo ${SUF}` }).select('id').single()).data!.id
  const base = { sede_id: SEDE, category_id: CAT, price: 1000, kind: 'simple' as const }

  CON_HISTORIA = (await db.from('products')
    .insert({ ...base, name: `E2E SaldoHist ${SUF}`, stock_tracking: true, stock_qty: 0 })
    .select('id').single()).data!.id
  CON_HUECO = (await db.from('products')
    .insert({ ...base, name: `E2E SaldoHueco ${SUF}`, stock_tracking: true, stock_qty: 10 })
    .select('id').single()).data!.id
  SIN_TRACKING = (await db.from('products')
    .insert({ ...base, name: `E2E SaldoSinStock ${SUF}`, stock_tracking: false })
    .select('id').single()).data!.id

  // Tres movimientos con instantes distintos: el caso ① necesita poder cortar
  // ENTRE ellos, y el ② que el último deje el stock en un número conocido.
  await ajustar(CON_HISTORIA, 7)
  await ajustar(CON_HISTORIA, -2)
  await ajustar(CON_HISTORIA, 5)
  await ajustar(CON_HUECO, 4)
})

test.afterAll(async () => {
  if (!db) return
  if (admin) {
    for (const id of productosAjenos) {
      await admin.from('stock_movements').delete().eq('product_id', id)
      const cat = (await admin.from('products').select('category_id').eq('id', id).maybeSingle()).data?.category_id
      const r = await admin.from('products').delete().eq('id', id)
      expect(r.error?.message ?? 'sin error', `no se pudo borrar el producto ajeno ${id}`).toBe('sin error')
      if (cat) {
        const rc = await admin.from('categories').delete().eq('id', cat)
        expect(rc.error?.message ?? 'sin error', `no se pudo borrar la categoría ajena ${cat}`).toBe('sin error')
      }
    }
    await limpiarOrganizaciones(admin, [], orgsCreadas)
  }
  const ids = [CON_HISTORIA, CON_HUECO, SIN_TRACKING].filter(Boolean)
  await db.from('products').update({ is_active: false }).in('id', ids)
  await db.from('categories').update({ is_active: false }).eq('id', CAT)
  const vivos = await db.from('products').select('id').in('id', ids).eq('is_active', true)
  expect(
    (vivos.data ?? []).length,
    `LIMPIEZA de movimientos-saldo.spec: quedaron productos E2E activos (${ids.join(', ')})`,
  ).toBe(0)
})

// ── ① EL FILTRO NO PUEDE CAMBIAR EL SALDO ───────────────────────────────────
test('🔴 filtrar por fecha NO cambia el saldo de una fila — la ventana mira toda la historia', async () => {
  const todas = await saldos(db, CON_HISTORIA)
  expect(todas, 'el montaje tiene que dejar tres movimientos').toHaveLength(3)

  const [nueva, media, vieja] = todas
  const sinFiltro = vieja.saldo_despues

  // Corta ANTES de la más nueva: si el filtro se empujara por debajo de la
  // ventana, la más vieja dejaría de tener posteriores y su saldo subiría.
  const recortadas = await saldos(db, CON_HISTORIA, { lte: media.created_at })
  expect(recortadas.map(r => r.id), 'el filtro tiene que dejar fuera a la más nueva').toEqual([media.id, vieja.id])

  const conFiltro = recortadas[1].saldo_despues
  expect(
    conFiltro,
    'EL FILTRO CAMBIÓ EL SALDO: PostgREST empujó el `lte` por debajo de la ventana, ' +
    `así que el saldo se calcula sólo sobre lo visible (sin filtro ${sinFiltro}, con filtro ${conFiltro}). ` +
    'Eso es el saldo que arranca en cero dentro del rango, que es la forma que se descartó por mentir.',
  ).toBe(sinFiltro)

  // Y que el número además sea el correcto, no sólo estable: 0 +7 −2 +5 = 10,
  // la más vieja deja 7 (10 − (−2) − 5).
  expect(vieja.saldo_despues, 'la más vieja tiene que dejar 7').toBe(7)
  expect(nueva.saldo_despues, 'la más nueva tiene que dejar 10').toBe(10)
})

// ── ② EL ANCLA ──────────────────────────────────────────────────────────────
test('el saldo de la fila más nueva es `products.stock_qty` — el número de Inventario', async () => {
  const filas = await saldos(db, CON_HISTORIA)
  const p = await db.from('products').select('stock_qty').eq('id', CON_HISTORIA).single()
  expect(p.error?.message ?? null).toBeNull()
  expect(
    filas[0].saldo_despues,
    'el saldo más nuevo no coincide con stock_qty: el ancla se soltó, y entonces ' +
    'ninguna fila de la columna corresponde a lo que la pantalla de Inventario muestra',
  ).toBe(p.data!.stock_qty)
})

// ── ③ EL HUECO, EN LAS DOS DIRECCIONES ──────────────────────────────────────
test('el hueco aparece cuando la existencia inicial no tiene movimiento, y NO aparece cuando no lo hay', async () => {
  expect(
    await hueco(CON_HUECO),
    'un producto que nació con 10 de existencia y sólo tiene +4 de movimiento ' +
    'tiene un hueco de 10: eso es lo que la línea «Existencia sin movimiento registrado» dice',
  ).toBe(10)
  expect(
    await hueco(CON_HISTORIA),
    'CONTROL: un producto que nació en 0 NO tiene hueco. Sin este caso, un defecto ' +
    'de «siempre muestra la línea» pasaría verde',
  ).toBe(0)
})

// ── ④ SIN EXISTENCIA: «—», NO CERO ──────────────────────────────────────────
test('un producto sin `stock_tracking` da NULO, no 0 — para que la pantalla pinte «—»', async () => {
  expect(
    await hueco(SIN_TRACKING),
    'devolvió un número para un producto que no lleva existencia: un 0 afirma ' +
    '«hay cero», y lo cierto es que no hay dato',
  ).toBeNull()
})

// ── ⑤ EL MODO DE FALLO: OTRA ORGANIZACIÓN ───────────────────────────────────
test('🔴 la vista NO muestra movimientos de otra organización', async () => {
  test.skip(!admin, 'Requiere E2E_SERVICE_ROLE_KEY para montar el tenant ajeno')

  const alta = await admin!.rpc('onboard_organization', {
    p_org_name: `E2E SaldoAjena ${SUF}`, p_sede_name: `E2E SedeAjena ${SUF}`,
  })
  expect(alta.error?.message ?? null, 'el montaje no pudo crear la organización ajena').toBeNull()
  const sedeAjena = (alta.data as { sede_id: string }).sede_id
  const org = (await admin!.from('sedes').select('organization_id').eq('id', sedeAjena).single()).data!.organization_id as string
  orgsCreadas.push(org)

  // `products.category_id` es not null: el tenant ajeno necesita su categoría.
  const catAjena = await admin!.from('categories')
    .insert({ sede_id: sedeAjena, name: `E2E CatAjena ${SUF}` }).select('id').single()
  expect(catAjena.error?.message ?? null, 'el montaje no pudo crear la categoría ajena').toBeNull()

  const prod = await admin!.from('products')
    .insert({ sede_id: sedeAjena, category_id: catAjena.data!.id, name: `E2E ProdAjeno ${SUF}`, price: 500, kind: 'simple', stock_tracking: true, stock_qty: 3 })
    .select('id').single()
  expect(prod.error?.message ?? null).toBeNull()
  const idAjeno = prod.data!.id as string
  productosAjenos.push(idAjeno)

  const mov = await admin!.from('stock_movements')
    .insert({ sede_id: sedeAjena, product_id: idAjeno, type: 'adjustment', qty: 3, notes: 'fixture ajena' })
  expect(mov.error?.message ?? null, 'el montaje no pudo escribir el movimiento ajeno').toBeNull()

  // CONTROL POSITIVO: la fila existe. Sin esto, el 0 de abajo no distingue
  // «RLS lo tapó» de «nunca se creó».
  expect(
    (await saldos(admin!, idAjeno)).length,
    'el montaje no dejó el movimiento ajeno: el caso no mediría nada',
  ).toBe(1)

  // Y sin sesión tampoco: `anon` tiene el `revoke` y además no pasa el RLS.
  // ⚠️ No es un mutante — el sujeto vive en SQL y mutarlo exigiría reescribir la
  //    vista en la base: quitarle `security_invoker` expondría datos entre
  //    tenants, y sería un cambio de esquema fuera de `migrations/` (R5).
  const anon = createClient(URL(), ANON(), { auth: { persistSession: false } })
  const sinSesion = await anon.from('stock_movements_con_saldo').select('id').limit(1)
  expect(
    (sinSesion.data ?? []).length,
    'la vista devuelve filas SIN SESIÓN: el `revoke all ... from anon` no quedó, ' +
    'o la vista no está aplicando el RLS de las tablas de abajo',
  ).toBe(0)

  const { data, error } = await db.from('stock_movements_con_saldo')
    .select('id, sede_id').eq('product_id', idAjeno)
  expect(error?.message ?? null, 'RLS niega devolviendo CERO FILAS, no un error').toBeNull()
  expect(
    data ?? [],
    'LA VISTA MUESTRA MOVIMIENTOS DE OTRA ORGANIZACIÓN: se perdió `security_invoker`, ' +
    'así que corre como su dueño y saltea el RLS de stock_movements. Los números se ven ' +
    'bien y son de otro negocio.',
  ).toEqual([])
})
