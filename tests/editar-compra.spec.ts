import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { loginAsOwner, ownerCreds } from './helpers/auth'

// ============================================================================
// EDITAR UNA COMPRA — update_purchase (2026-09-18)
//
// Pedido por la clienta: errores de digitación mientras se acopla al sistema,
// y el documento original tiene que cambiar. Ventana decidida: «siempre».
//
// Lo que se asevera, y el mutante que mata cada caso:
//   ① quitar, agregar y cambiar ítems: el documento cambia, el número NO, la
//      diferencia de stock va como ajuste por producto y la de plata como
//      `correccion_compra` de salida      ← mutante: no mover stock / caja
//   ② bajar el costo: el promedio se revierte EXACTO cuando la compra fue lo
//      último que movió el producto, y la plata vuelve como ingreso
//                                          ← mutante: aplicar sin deshacer lo viejo
//   ③ una compra con devolución NO se edita ← mutante: borrar el guard
//   ④ por la UI: Editar abre el formulario precargado y el detalle dice «Editada»
// ============================================================================

test.describe.configure({ mode: 'serial' })

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
const FACTURA_1 = 'E2E-EDIT-1-' + SUFFIX

let db: SupabaseClient
let SEDE = ''
let CAT = ''
let PROVEEDOR = ''
const P: Record<'A' | 'B' | 'C' | 'D' | 'E', string> = { A: '', B: '', C: '', D: '', E: '' }
let COMPRA_1 = ''
let NUM_1 = 0

type Res = { invoice_id: string; purchase_number: number; total: number; cash_movement_id: string | null }

const producto = async (clave: keyof typeof P, extra: Record<string, unknown> = {}) => {
  const r = await db.from('products').insert({
    sede_id: SEDE, category_id: CAT, name: `E2E Edit ${clave} ${SUFFIX}`,
    price: 5000, kind: 'simple', stock_tracking: true, stock_qty: 0, ...extra,
  }).select('id').single()
  expect(r.error, `no se pudo crear el producto ${clave}`).toBeNull()
  P[clave] = r.data!.id
}

const stockYCosto = async (id: string) => {
  const r = await db.from('products').select('stock_qty, cost_price').eq('id', id).single()
  expect(r.error).toBeNull()
  return { stock: r.data!.stock_qty as number, costo: Number(r.data!.cost_price) }
}

const correccionDe = async (cashId: string | null) => {
  expect(cashId, 'la edición cambió el total y no escribió movimiento de caja').not.toBeNull()
  const r = await db.from('cash_movements').select('type, categoria, amount').eq('id', cashId!).single()
  expect(r.error).toBeNull()
  return r.data!
}

test.beforeAll(async () => {
  db = createClient(process.env.VITE_NODO_SUPABASE_URL!, process.env.VITE_NODO_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  })
  const { error } = await db.auth.signInWithPassword(ownerCreds())
  if (error) throw error
  const owner = (await db.auth.getUser()).data.user!.id
  SEDE = (await db.from('profiles').select('sede_id').eq('id', owner).single()).data!.sede_id as string

  const abierta = await db.from('jornadas').select('id')
    .eq('sede_id', SEDE).is('closed_at', null).maybeSingle()
  if (!abierta.data) {
    const j = await db.from('jornadas').insert({ sede_id: SEDE, opened_by: owner, opening_amount: 0 })
    expect(j.error, 'no se pudo abrir la jornada del caso').toBeNull()
  }

  const c = await db.from('categories').insert({ sede_id: SEDE, name: 'E2E Editar ' + SUFFIX }).select('id').single()
  expect(c.error).toBeNull()
  CAT = c.data!.id
  const s = await db.from('suppliers').insert({ sede_id: SEDE, name: 'E2E Prov Editar ' + SUFFIX }).select('id').single()
  expect(s.error).toBeNull()
  PROVEEDOR = s.data!.id

  await producto('A'); await producto('B'); await producto('C')
  // D arranca con historia: 10 unidades a 1.000, para ejercer la rama del
  // promedio (sin stock previo, la RPC cae a último costo y no se prueba nada).
  await producto('D', { stock_qty: 10, cost_price: 1000 })
  await producto('E')
})

test.afterAll(async () => {
  if (!db) return
  const ids = Object.values(P).filter(Boolean)
  const a = await db.from('products').update({ is_active: false }).in('id', ids)
  const b = await db.from('categories').update({ is_active: false }).eq('id', CAT)
  const c = await db.from('suppliers').update({ is_active: false }).eq('id', PROVEEDOR)
  expect([a.error, b.error, c.error], 'LIMPIEZA de editar-compra falló').toEqual([null, null, null])
  const vivos = await db.from('products').select('id').in('id', ids).eq('is_active', true)
  expect(vivos.data ?? [], `LIMPIEZA de editar-compra: quedaron productos activos`).toEqual([])
})

test('🔴 quitar, agregar y cambiar ítems: el documento cambia y la diferencia se asienta', async () => {
  const r = await db.rpc('register_purchase', {
    p_invoice: { supplier_id: PROVEEDOR, invoice_number: FACTURA_1, notes: null },
    p_items: [
      { product_id: P.A, qty: 3, unit_cost: 1000 },
      { product_id: P.B, qty: 2, unit_cost: 500 },
    ],
  })
  expect(r.error).toBeNull()
  const reg = r.data as Res
  COMPRA_1 = reg.invoice_id
  NUM_1 = reg.purchase_number

  // A: 3 → 5 · B: se quita · C: se agrega. Total 4.000 → 7.000.
  const e = await db.rpc('update_purchase', {
    p_invoice_id: COMPRA_1,
    p_invoice: { supplier_id: PROVEEDOR, invoice_number: FACTURA_1, notes: 'corregida' },
    p_items: [
      { product_id: P.A, qty: 5, unit_cost: 1000 },
      { product_id: P.C, qty: 1, unit_cost: 2000 },
    ],
  })
  expect(e.error).toBeNull()
  const ed = e.data as Res
  expect(ed.purchase_number, 'editar no puede cambiar el número de compra').toBe(NUM_1)
  expect(Number(ed.total)).toBe(7000)

  const inv = await db.from('purchase_invoices')
    .select('total, notes, edited_at, purchase_invoice_items(product_id, qty)').eq('id', COMPRA_1).single()
  expect(inv.error).toBeNull()
  expect(Number(inv.data!.total)).toBe(7000)
  expect(inv.data!.edited_at, 'la compra editada no quedó marcada').not.toBeNull()
  const items = (inv.data!.purchase_invoice_items as { product_id: string; qty: number }[])
    .map(i => `${i.product_id === P.A ? 'A' : i.product_id === P.C ? 'C' : '?'}:${i.qty}`).sort()
  expect(items, 'el documento no quedó con los ítems editados').toEqual(['A:5', 'C:1'])

  expect((await stockYCosto(P.A)).stock, 'A: 3 comprados, editados a 5').toBe(5)
  expect((await stockYCosto(P.B)).stock, 'B: se quitó de la compra, su stock tiene que volver a 0').toBe(0)
  expect((await stockYCosto(P.C)).stock, 'C: se agregó con 1').toBe(1)
  expect((await stockYCosto(P.C)).costo).toBe(2000)

  const movs = await db.from('stock_movements').select('product_id, type, qty')
    .eq('reference_id', COMPRA_1).eq('type', 'adjustment')
  expect(movs.error).toBeNull()
  const porProducto = Object.fromEntries((movs.data ?? []).map(m => [m.product_id, m.qty]))
  expect([porProducto[P.A], porProducto[P.B], porProducto[P.C]],
    'la diferencia de stock no quedó asentada como ajuste por producto').toEqual([2, -2, 1])

  const caja = await correccionDe(ed.cash_movement_id)
  expect(caja).toEqual({ type: 'out', categoria: 'correccion_compra', amount: 3000 })
})

test('🔴 bajar el costo: el promedio se revierte exacto y la plata vuelve a la caja', async () => {
  // D: 10 a 1.000 de antes + esta compra de 10 a 2.000 → promedio 1.500.
  const r = await db.rpc('register_purchase', {
    p_invoice: { supplier_id: PROVEEDOR, invoice_number: 'E2E-EDIT-2-' + SUFFIX, notes: null },
    p_items: [{ product_id: P.D, qty: 10, unit_cost: 2000 }],
  })
  expect(r.error).toBeNull()
  const id = (r.data as Res).invoice_id
  expect((await stockYCosto(P.D)).costo, 'montaje: el promedio de partida').toBe(1500)

  // Era un typo: costaba 1.500. (10×1.000 + 10×1.500) / 20 = 1.250.
  const e = await db.rpc('update_purchase', {
    p_invoice_id: id,
    p_invoice: { supplier_id: PROVEEDOR, invoice_number: 'E2E-EDIT-2-' + SUFFIX, notes: null },
    p_items: [{ product_id: P.D, qty: 10, unit_cost: 1500 }],
  })
  expect(e.error).toBeNull()

  const d = await stockYCosto(P.D)
  expect(d.costo,
    'el costo promedio no deshizo la compra vieja: con 1.750 aplicó la nueva encima de la vieja').toBe(1250)
  expect(d.stock, 'cambiar sólo el costo no mueve stock').toBe(20)

  const caja = await correccionDe((e.data as Res).cash_movement_id)
  expect(caja).toEqual({ type: 'in', categoria: 'correccion_compra', amount: 5000 })
})

test('🔴 una compra con devolución no se edita', async () => {
  const r = await db.rpc('register_purchase', {
    p_invoice: { supplier_id: PROVEEDOR, invoice_number: 'E2E-EDIT-3-' + SUFFIX, notes: null },
    p_items: [{ product_id: P.E, qty: 4, unit_cost: 1000 }],
  })
  expect(r.error).toBeNull()
  const id = (r.data as Res).invoice_id

  const dev = await db.rpc('register_purchase_return', {
    p_invoice_id: id, p_items: [{ product_id: P.E, qty: 1 }], p_notes: null,
  })
  expect(dev.error, 'montaje: la devolución tenía que registrarse').toBeNull()

  const e = await db.rpc('update_purchase', {
    p_invoice_id: id,
    p_invoice: { supplier_id: PROVEEDOR, invoice_number: null, notes: null },
    p_items: [{ product_id: P.E, qty: 9, unit_cost: 1000 }],
  })
  expect(e.error?.message ?? '(sin error: la edición pasó)',
    'la compra con devolución se dejó editar').toContain('tiene devoluciones')
})

test('por la UI: Editar abre el formulario precargado y el detalle dice «Editada»', async ({ page }) => {
  await loginAsOwner(page)
  await page.goto('/compras')
  await page.getByTestId('purchase-row').filter({ hasText: FACTURA_1 }).click()
  await page.getByTestId('purchase-edit').click()

  const modal = page.getByTestId('new-invoice-modal')
  await expect(modal).toContainText(`Editar compra #${NUM_1}`)
  await expect(modal.getByTestId('invoice-line-row')).toHaveCount(2)
  await expect(modal.getByTestId('invoice-total')).toContainText('7.000')

  // A: 5 → 6. Total 7.000 → 8.000.
  const filaA = modal.getByTestId('invoice-line-row').filter({
    has: page.locator(`[data-testid="invoice-item-product"] option:checked[value="${P.A}"]`),
  })
  await filaA.getByTestId('invoice-item-qty').fill('6')
  await expect(modal.getByTestId('invoice-total')).toContainText('8.000')
  await modal.getByTestId('invoice-submit').click()
  await expect(modal).toBeHidden()

  await page.getByTestId('purchase-row').filter({ hasText: FACTURA_1 }).click()
  await expect(page.getByTestId('purchase-detail-editada')).toBeVisible()
  expect((await stockYCosto(P.A)).stock, 'la edición por la UI no llegó a la base').toBe(6)
})
