import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { loginAsOwner, ownerCreds } from './helpers/auth'

// ============================================================================
// MOVIMIENTOS DE STOCK · corte de fechas en Bogotá, filtro por producto
//
// 🔴 EL CORTE DE FECHAS SE ASEVERA SOBRE EL HECHO, NO SOBRE LA CONSECUENCIA.
//    La consecuencia —«un movimiento de las 21:00 no aparece filtrando el día
//    siguiente»— exige un movimiento con esa hora, y ninguna RPC deja elegir
//    `created_at`. Así que el caso mira LO QUE LA PANTALLA LE PIDE A LA BASE: los
//    límites que manda en la URL. La consecuencia se midió aparte contra LAB el
//    2026-09-17 (un movimiento de las 21:23 del 15 aparecía filtrando el 16).
//
// 🔴 EL FILTRO POR PRODUCTO TIENE TRES MITADES, y cada una tiene su caso:
//    · sin filtro se ve TODO — es el estado por defecto y no puede perderse;
//    · con filtro se ve SÓLO ese producto, y el ✕ vuelve a todo;
//    · un producto ARCHIVADO se puede encontrar — es la razón de que el buscador
//      consulte a la base y no al catálogo cargado, que trae sólo activos.
//
// ⚠️ NO va en `describe.serial`: los casos comparten la fixture, no el resultado.
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

const SUFFIX = Date.now().toString().slice(-6)
const ACTIVO = `E2E MovActivo ${SUFFIX}`
const ARCHIVADO = `E2E MovArchivado ${SUFFIX}`
const CODIGO_ACTIVO = `E2EMOV-${SUFFIX}`

let db: SupabaseClient
let CAT_ID = ''
let ID_ACTIVO = ''
let ID_ARCHIVADO = ''

async function ajustar(id: string, qty: number) {
  const { error } = await db.rpc('adjust_stock', { p_product_id: id, p_qty: qty, p_reason: 'movimientos-stock.spec' })
  expect(error?.message ?? null, `adjust_stock falló armando la fixture (${qty})`).toBeNull()
}

test.beforeAll(async () => {
  db = createClient(process.env.VITE_NODO_SUPABASE_URL!, process.env.VITE_NODO_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  })
  const { error } = await db.auth.signInWithPassword(ownerCreds())
  if (error) throw error
  const uid = (await db.auth.getUser()).data.user!.id
  const sede = (await db.from('profiles').select('sede_id').eq('id', uid).single()).data!.sede_id as string

  const cat = await db.from('categories').insert({ sede_id: sede, name: `E2E Movimientos ${SUFFIX}` }).select('id').single()
  expect(cat.error?.message ?? null).toBeNull()
  CAT_ID = cat.data!.id

  const base = { sede_id: sede, category_id: CAT_ID, price: 1000, kind: 'simple' as const, stock_tracking: true }
  // ACTIVO nace en 0: su historia entera está en movimientos.
  const a = await db.from('products').insert({ ...base, name: ACTIVO, codigo: CODIGO_ACTIVO, stock_qty: 0 }).select('id').single()
  // ARCHIVADO nace con 10 SIN movimiento: existencia inicial fuera del registro.
  const b = await db.from('products').insert({ ...base, name: ARCHIVADO, stock_qty: 10 }).select('id').single()
  expect(a.error?.message ?? null).toBeNull()
  expect(b.error?.message ?? null).toBeNull()
  ID_ACTIVO = a.data!.id
  ID_ARCHIVADO = b.data!.id

  await ajustar(ID_ACTIVO, 7)
  await ajustar(ID_ACTIVO, -2)
  await ajustar(ID_ARCHIVADO, 4)

  const arch = await db.from('products').update({ is_active: false }).eq('id', ID_ARCHIVADO)
  expect(arch.error?.message ?? null, 'no se pudo archivar el producto de la fixture').toBeNull()
})

test.afterAll(async () => {
  if (!db) return
  // Productos con movimientos no se borran (FK restrict): se archivan. La
  // limpieza ASEVERA el estado, porque supabase-js no lanza (deuda 115).
  const p = await db.from('products').update({ is_active: false }).in('id', [ID_ACTIVO, ID_ARCHIVADO])
  const c = await db.from('categories').update({ is_active: false }).eq('id', CAT_ID)
  const vivos = await db.from('products').select('id').in('id', [ID_ACTIVO, ID_ARCHIVADO]).eq('is_active', true)
  expect(
    [p.error?.message, c.error?.message, vivos.error?.message, (vivos.data ?? []).length],
    `LIMPIEZA de movimientos-stock.spec: quedaron productos E2E activos (${ID_ACTIVO}, ${ID_ARCHIVADO})`,
  ).toEqual([undefined, undefined, undefined, 0])
})

async function abrirMovimientos(page: Page) {
  await loginAsOwner(page)
  await page.goto('/inventario')
  await page.getByTestId('inventory-tab-movements').click()
}

const filas = (page: Page) => page.getByTestId('stock-movement-row')

// ── fechas ───────────────────────────────────────────────────────────────────
test('🔴 el rango de fechas corta en Bogotá: del 16 es 05:00Z del 16 a 04:59:59.999Z del 17', async ({ page }) => {
  await abrirMovimientos(page)
  await page.getByTestId('mov-desde').fill('2026-09-16')
  const pedido = page.waitForRequest((r) =>
    r.url().includes('/stock_movements') && decodeURIComponent(r.url()).includes('created_at=lte.'))
  await page.getByTestId('mov-hasta').fill('2026-09-16')
  const url = decodeURIComponent((await pedido).url())

  expect(
    url.match(/created_at=gte\.[^&]+/)?.[0],
    'el DESDE no empieza a medianoche de Bogotá — con `new Date(día)` sale 00:00Z, las 19:00 del día anterior',
  ).toBe('created_at=gte.2026-09-16T05:00:00.000Z')
  expect(
    url.match(/created_at=lte\.[^&]+/)?.[0],
    'el HASTA no termina a medianoche de Bogotá',
  ).toBe('created_at=lte.2026-09-17T04:59:59.999Z')
})

// ── filtro por producto ─────────────────────────────────────────────────────
test('sin filtro se ven TODOS los productos — es el estado por defecto', async ({ page }) => {
  await abrirMovimientos(page)
  await expect(page.getByTestId('mov-producto-chip')).toHaveCount(0)
  const sinFiltro = 'sin filtro NO se ven todos los productos: el estado por defecto quedó filtrando'
  await expect(filas(page).filter({ hasText: ACTIVO }).first(), sinFiltro).toBeVisible()
  await expect(filas(page).filter({ hasText: ARCHIVADO }).first(), sinFiltro).toBeVisible()
})

test('buscar por código elige el producto, muestra SÓLO sus movimientos, y el ✕ vuelve a todos', async ({ page }) => {
  await abrirMovimientos(page)
  await page.getByTestId('mov-producto-buscar').fill(CODIGO_ACTIVO)
  const opcion = page.getByTestId('mov-producto-opcion').filter({ hasText: ACTIVO })
  await expect(opcion).toHaveCount(1)
  await opcion.click()

  await expect(page.getByTestId('mov-producto-chip')).toContainText(ACTIVO)
  // El SUJETO primero: sólo ese producto, y sus dos movimientos.
  await expect(filas(page), 'el filtro no acota: aparecen movimientos de OTROS productos').toHaveCount(2)
  const nombres = await page.getByTestId('stock-movement-product').allInnerTexts()
  expect([...new Set(nombres)], 'con el filtro puesto aparecen movimientos de otros productos').toEqual([ACTIVO])

  await page.getByTestId('mov-producto-quitar').click()
  await expect(page.getByTestId('mov-producto-chip')).toHaveCount(0)
  await expect(filas(page).filter({ hasText: ARCHIVADO }).first(), 'el ✕ no devolvió la vista completa').toBeVisible()
})

test('🔴 un producto ARCHIVADO se encuentra y se filtra — es el que se busca cuando algo no cuadra', async ({ page }) => {
  await abrirMovimientos(page)
  await page.getByTestId('mov-producto-buscar').fill(ARCHIVADO)
  const opcion = page.getByTestId('mov-producto-opcion').filter({ hasText: ARCHIVADO })
  await expect(opcion, 'el buscador no devuelve productos archivados').toHaveCount(1)
  await expect(opcion).toContainText('Archivado')
  await opcion.click()

  await expect(page.getByTestId('mov-producto-chip')).toContainText('Archivado')
  await expect(filas(page), 'el filtro no acota: aparecen movimientos de OTROS productos').toHaveCount(1)
  await expect(filas(page).first().getByTestId('stock-movement-qty')).toContainText('+4')
})

test('clic en el nombre de una fila filtra por ese producto', async ({ page }) => {
  await abrirMovimientos(page)
  await filas(page).filter({ hasText: ACTIVO }).first().getByTestId('stock-movement-product').click()

  await expect(page.getByTestId('mov-producto-chip')).toContainText(ACTIVO)
  await expect(filas(page), 'el filtro no acota: aparecen movimientos de OTROS productos').toHaveCount(2)
  const nombres = await page.getByTestId('stock-movement-product').allInnerTexts()
  expect([...new Set(nombres)]).toEqual([ACTIVO])
})
