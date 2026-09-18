import { test, expect, type Page, type Locator } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { loginAsOwner, ownerCreds } from './helpers/auth'

// ============================================================================
// MODALES DE COMPRA CON MUCHOS ÍTEMS, Y EL CLIC AFUERA (2026-09-18)
//
// Reportado por la clienta con la compra #81 (20 ítems):
//   1. el detalle y el formulario de edición NO dejan llegar a los últimos
//      ítems — no hay scroll;
//   2. un clic fuera del formulario de crear/editar lo cierra y se pierde el
//      trabajo.
//
// 🔴 El lab no tenía NINGUNA compra de más de 2 ítems (medido: 475 compras,
//    máximo 2). Con 2 ítems el defecto no se puede observar — una fixture con
//    N=1 no ejerce una capacidad de N. Por eso el caso arma la suya: 20 ítems.
//
// 🔴 La aserción es GEOMÉTRICA, no de presencia: un ítem recortado por un
//    contenedor sigue siendo «visible» para Playwright. Lo que se mide es que la
//    última fila, llevada al final del scroll, caiga DENTRO del modal.
// ============================================================================

// ⚠️ NO es `serial`: los casos comparten la fixture, no el resultado. En serie,
//    el primer rojo dejaría sin correr al CONTRASTE, que es el control del caso
//    del clic afuera (criterio de `describe.serial`, CLAUDE.md).

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
const FACTURA = 'E2E-MUCHOS-' + SUFFIX
const N_ITEMS = 20

let db: SupabaseClient
let CAT = ''
let PROVEEDOR = ''
const PRODUCTOS: string[] = []

test.beforeAll(async () => {
  db = createClient(process.env.VITE_NODO_SUPABASE_URL!, process.env.VITE_NODO_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  })
  const { error } = await db.auth.signInWithPassword(ownerCreds())
  if (error) throw error
  const owner = (await db.auth.getUser()).data.user!.id
  const sede = (await db.from('profiles').select('sede_id').eq('id', owner).single()).data!.sede_id as string

  const abierta = await db.from('jornadas').select('id').eq('sede_id', sede).is('closed_at', null).maybeSingle()
  if (!abierta.data) {
    const j = await db.from('jornadas').insert({ sede_id: sede, opened_by: owner, opening_amount: 0 })
    expect(j.error, 'no se pudo abrir la jornada del caso').toBeNull()
  }

  const c = await db.from('categories').insert({ sede_id: sede, name: 'E2E Muchos ' + SUFFIX }).select('id').single()
  expect(c.error).toBeNull()
  CAT = c.data!.id
  const s = await db.from('suppliers').insert({ sede_id: sede, name: 'E2E Prov Muchos ' + SUFFIX }).select('id').single()
  expect(s.error).toBeNull()
  PROVEEDOR = s.data!.id

  const p = await db.from('products').insert(
    Array.from({ length: N_ITEMS }, (_, i) => ({
      sede_id: sede, category_id: CAT, name: `E2E Muchos ${String(i + 1).padStart(2, '0')} ${SUFFIX}`,
      price: 5000, kind: 'simple', stock_tracking: true, stock_qty: 0,
    })),
  ).select('id')
  expect(p.error).toBeNull()
  PRODUCTOS.push(...p.data!.map(r => r.id as string))

  const r = await db.rpc('register_purchase', {
    p_invoice: { supplier_id: PROVEEDOR, invoice_number: FACTURA, notes: null },
    p_items: PRODUCTOS.map(id => ({ product_id: id, qty: 1, unit_cost: 1000 })),
  })
  expect(r.error, 'montaje: la compra de 20 ítems').toBeNull()
})

test.afterAll(async () => {
  if (!db) return
  const a = await db.from('products').update({ is_active: false }).in('id', PRODUCTOS)
  const b = await db.from('categories').update({ is_active: false }).eq('id', CAT)
  const c = await db.from('suppliers').update({ is_active: false }).eq('id', PROVEEDOR)
  expect([a.error, b.error, c.error], 'LIMPIEZA de modales-compra falló').toEqual([null, null, null])
  const vivos = await db.from('products').select('id').in('id', PRODUCTOS).eq('is_active', true)
  expect(vivos.data ?? [], 'LIMPIEZA de modales-compra: quedaron productos activos').toEqual([])
})

/**
 * La última fila, después de girar la RUEDA sobre el modal, cae DENTRO de él.
 *
 * 🔴 NO con `scrollIntoViewIfNeeded`: ése desplaza también contenedores con
 *    `overflow: hidden` —por código se pueden mover— y la rueda de una persona
 *    no. La primera versión del caso lo usaba y dio VERDE con el defecto puesto:
 *    el framework cumplía la aserción por su cuenta. La rueda es lo que hace la
 *    clienta, así que es lo que discrimina.
 */
async function ultimaFilaAlcanzable(page: Page, modal: Locator, filas: Locator, nombre: string) {
  await expect(filas).toHaveCount(N_ITEMS)
  const ultima = filas.last()
  const caja = (await modal.boundingBox())!
  await page.mouse.move(caja.x + caja.width / 2, caja.y + caja.height / 2)
  for (let i = 0; i < 10; i++) await page.mouse.wheel(0, 600)
  await page.waitForTimeout(300)   // el scroll de la rueda es asíncrono
  const f = (await ultima.boundingBox())!
  const m = (await modal.boundingBox())!
  const alto = page.viewportSize()!.height
  expect(
    f.y >= m.y && f.y + f.height <= m.y + m.height && f.y + f.height <= alto,
    `${nombre}: la fila ${N_ITEMS} no se puede alcanzar — queda en y=${Math.round(f.y)}..` +
    `${Math.round(f.y + f.height)} y el modal termina en ${Math.round(m.y + m.height)} ` +
    `(viewport ${alto}). No hay scroll.`,
  ).toBe(true)
}

async function abrirDetalle(page: Page) {
  await loginAsOwner(page)
  await page.goto('/compras')
  await page.getByTestId('purchase-row').filter({ hasText: FACTURA }).click()
  await expect(page.getByTestId('purchase-detail-modal')).toBeVisible()
}

test('🔴 el DETALLE de una compra de 20 ítems deja llegar al último', async ({ page }) => {
  await abrirDetalle(page)
  const modal = page.getByTestId('purchase-detail-modal')
  await ultimaFilaAlcanzable(page, modal, modal.getByTestId('purchase-detail-item'), 'detalle')
})

test('🔴 el formulario de EDICIÓN de una compra de 20 ítems deja llegar al último', async ({ page }) => {
  await abrirDetalle(page)
  await page.getByTestId('purchase-edit').click()
  const modal = page.getByTestId('new-invoice-modal')
  await ultimaFilaAlcanzable(page, modal, modal.getByTestId('invoice-line-row'), 'edición')
})

test('🔴 un clic AFUERA no cierra el formulario de compra — ni al editar ni al crear', async ({ page }) => {
  await abrirDetalle(page)
  await page.getByTestId('purchase-edit').click()
  const edicion = page.getByTestId('new-invoice-modal')
  await expect(edicion).toBeVisible()
  await page.mouse.click(5, 5)   // el fondo, lejos del modal
  await expect(edicion, 'el clic afuera cerró la EDICIÓN y se perdió el trabajo').toBeVisible()

  await page.goto('/compras')
  await page.getByTestId('new-invoice-btn').click()
  const nueva = page.getByTestId('new-invoice-modal')
  await page.getByTestId('invoice-number').fill('a medio escribir')
  await page.mouse.click(5, 5)
  await expect(nueva, 'el clic afuera cerró la compra NUEVA y se perdió el trabajo').toBeVisible()
  await expect(page.getByTestId('invoice-number')).toHaveValue('a medio escribir')
})

test('CONTRASTE — el DETALLE, que es de sólo lectura, sí se cierra con un clic afuera', async ({ page }) => {
  // Sin este caso, un fondo que ya no respondiera a nada pasaría el anterior
  // igual: el control de que el clic en (5,5) SÍ llega al fondo.
  await abrirDetalle(page)
  await page.mouse.click(5, 5)
  await expect(page.getByTestId('purchase-detail-modal')).toHaveCount(0)
})
