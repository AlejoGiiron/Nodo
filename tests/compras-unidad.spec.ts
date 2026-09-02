import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { loginAsOwner, ownerCreds } from './helpers/auth'
import { openShiftIfClosed } from './helpers/shift'

// ============================================================================
// UNIDAD DE COMPRA Y FACTOR DE EQUIVALENCIA — deuda 43.
//
// 🔴 ESTE SPEC PRUEBA ARITMÉTICA, NO QUE LA PANTALLA ACEPTE UN CAMPO.
// Se compra por bulto y se vende por unidad. Antes del factor, comprar 3 bultos
// de 50 dejaba el stock en +3 —debería ser +150— y el costo unitario en el del
// bulto: 50 veces el real. Y `cost_price` alimenta `order_items.unit_cost`, que
// se CONGELA al vender (R1 punto 8), así que el error quedaba grabado para
// siempre en las utilidades.
//
// Por eso las aserciones son sobre NÚMEROS leídos de la base, no sobre texto de
// la UI: un formato puede cambiar; el costo unitario no puede estar mal.
//
// Y por eso cada caso lleva su CONTRASTE (R10): un test que solo mira el camino
// con factor pasaría igual si el factor se ignorara en alguna rama.
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
const CAT = `E2E UndCompra ${SUFFIX}`
const CON_FACTOR = `E2E ConFactor ${SUFFIX}`
const SIN_FACTOR = `E2E SinFactor ${SUFFIX}`
const PROVEEDOR = `E2E ProvUnd ${SUFFIX}`

let db: SupabaseClient

test.beforeAll(async () => {
  db = createClient(
    process.env.VITE_NODO_SUPABASE_URL!,
    process.env.VITE_NODO_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } },
  )
  const { error } = await db.auth.signInWithPassword(ownerCreds())
  if (error) throw error
})

// ── Helpers ───────────────────────────────────────────────────────

async function crearProducto(page: Page, name: string) {
  await page.goto('/productos')
  await page.getByRole('button', { name: 'Nuevo producto' }).click()
  await page.getByPlaceholder('Ej: Mojito Cubano').fill(name)
  await page.getByPlaceholder('0').first().fill('1000')
  await page.getByTestId('product-category-select').selectOption({ label: CAT })
  await page.getByTestId('product-stock-tracking').click()
  await page.getByRole('button', { name: 'Crear producto' }).click()
  await expect(page.getByText(name)).toBeVisible()
}

/** Lee stock y costo de la BASE, no de la pantalla: son las cifras que importan. */
async function leerProducto(name: string): Promise<{ stock: number; costo: number | null }> {
  const { data, error } = await db
    .from('products')
    .select('stock_qty, cost_price')
    .eq('name', name)
    .single()
  if (error) throw error
  return { stock: data!.stock_qty ?? 0, costo: data!.cost_price }
}

async function comprar(
  page: Page,
  { producto, qty, cost, unidad, factor }:
    { producto: string; qty: number; cost: number; unidad?: string; factor?: number },
) {
  await page.goto('/compras')
  await page.getByTestId('new-invoice-btn').click()
  await expect(page.getByTestId('new-invoice-modal')).toBeVisible()
  await page.getByTestId('invoice-supplier').selectOption({ label: PROVEEDOR })
  await page.getByTestId('invoice-item-product').first().selectOption({ label: producto })
  await page.getByTestId('invoice-item-qty').first().fill(String(qty))
  if (unidad) {
    await page.getByTestId('invoice-item-unidad').first().fill(unidad)
    await page.getByTestId('invoice-item-factor').first().fill(String(factor))
  }
  await page.getByTestId('invoice-item-cost').first().fill(String(cost))
  await page.getByTestId('invoice-submit').click()
  await expect(page.getByTestId('new-invoice-modal')).toHaveCount(0)
  await expect(page.getByText(/Compra registrada/)).toBeVisible()
}

// ── Suite ─────────────────────────────────────────────────────────

test.describe('Compras · unidad de compra y factor', () => {
  test('setup: categoría, dos productos y proveedor', async ({ page }) => {
    await loginAsOwner(page)

    await page.goto('/productos')
    await page.getByRole('button', { name: 'Nueva categoría' }).click()
    await page.getByPlaceholder('Ej: Cocteles clásicos').fill(CAT)
    await page.getByRole('button', { name: 'Crear categoría' }).click()
    await expect(page.getByRole('button', { name: new RegExp(CAT) })).toBeVisible()

    await crearProducto(page, CON_FACTOR)
    await crearProducto(page, SIN_FACTOR)

    await page.goto('/compras')
    await page.getByTestId('purchases-tab-suppliers').click()
    await page.getByTestId('new-supplier-btn').click()
    await page.getByTestId('supplier-name').fill(PROVEEDOR)
    await page.getByTestId('supplier-save').click()
    await expect(page.getByTestId('supplier-form-modal')).toHaveCount(0)

    // Los dos arrancan en cero y sin costo: si no, el promedio ponderado de más
    // abajo daría otro número y el test mentiría por la fixture, no por el código.
    for (const n of [CON_FACTOR, SIN_FACTOR]) {
      const p = await leerProducto(n)
      expect(p.stock, `${n} arranca en stock 0`).toBe(0)
      expect(p.costo, `${n} arranca sin costo`).toBeNull()
    }
  })

  test('3 bultos × 50 a 5.000: stock +150, subtotal 15.000 y costo unitario 100', async ({ page }) => {
    await loginAsOwner(page)
    await page.goto('/ventas')
    await openShiftIfClosed(page, 100000)

    await comprar(page, { producto: CON_FACTOR, qty: 3, cost: 5000, unidad: 'bulto', factor: 50 })

    const p = await leerProducto(CON_FACTOR)
    // 3 bultos × 50 = 150 unidades de VENTA.
    expect(p.stock, '3 bultos de 50 entran como 150 unidades').toBe(150)
    // Primera compra: no hay costo previo que promediar, así que el costo cae a
    // unit_cost / factor = 5.000 / 50.
    expect(Number(p.costo), 'el costo unitario es el del bulto dividido por el factor').toBe(100)

    // La PLATA de la factura no se toca: el subtotal es qty × unit_cost, lo que
    // dice el papel del proveedor. 3 × 5.000 = 15.000.
    const { data: linea } = await db
      .from('purchase_invoice_items')
      .select('qty, unit_cost, subtotal, purchase_unit, units_per_purchase_unit, products!inner(name)')
      .eq('products.name', CON_FACTOR)
      .single()
    expect(Number(linea!.subtotal), 'el subtotal es la plata de la factura, sin convertir').toBe(15000)
    expect(linea!.qty, 'qty son UNIDADES DE COMPRA: 3 bultos').toBe(3)
    expect(linea!.purchase_unit).toBe('bulto')
    expect(linea!.units_per_purchase_unit, 'el factor queda GRABADO en la línea').toBe(50)
  })

  test('promedio ponderado móvil: se pondera en unidades de venta, no en bultos', async ({ page }) => {
    await loginAsOwner(page)
    await page.goto('/ventas')
    await openShiftIfClosed(page, 100000)

    // Segunda compra: 1 bulto de 50 a 8.000 → 160 por unidad.
    //   (150 × 100 + 8.000) / (150 + 50) = 23.000 / 200 = 115
    // Ponderar en BULTOS daría (150×100 + 8.000)/(150+1) = 152,32 — un número
    // plausible y equivocado, que es justo el perfil de fallo que se paga caro.
    await comprar(page, { producto: CON_FACTOR, qty: 1, cost: 8000, unidad: 'bulto', factor: 50 })

    const p = await leerProducto(CON_FACTOR)
    expect(p.stock, '150 + 50 = 200 unidades').toBe(200)
    expect(Number(p.costo), 'el promedio se pondera en unidades de venta').toBe(115)
  })

  test('CONTRASTE — la misma compra sin factor da 3 de stock y costo 5.000', async ({ page }) => {
    // 🔴 Sin este test, todo lo de arriba pasaría igual si el factor se aplicara
    //    SIEMPRE (por ejemplo con un default distinto de 1 escondido). Acá se
    //    verifica que sin unidad de compra el comportamiento es el de antes:
    //    qty son unidades y el costo es el que llegó.
    await loginAsOwner(page)
    await page.goto('/ventas')
    await openShiftIfClosed(page, 100000)

    await comprar(page, { producto: SIN_FACTOR, qty: 3, cost: 5000 })

    const p = await leerProducto(SIN_FACTOR)
    expect(p.stock, 'sin unidad de compra, qty son unidades: +3').toBe(3)
    expect(Number(p.costo), 'y el costo unitario es el que llegó').toBe(5000)

    const { data: linea } = await db
      .from('purchase_invoice_items')
      .select('purchase_unit, units_per_purchase_unit, products!inner(name)')
      .eq('products.name', SIN_FACTOR)
      .single()
    expect(linea!.purchase_unit, 'sin presentación, la etiqueta queda nula').toBeNull()
    expect(linea!.units_per_purchase_unit, 'y el factor es 1, que es lo que default deja').toBe(1)
  })

  test('GUARD — unidad de compra sin factor RECHAZA, y no escribe nada', async () => {
    // 🔴 Fail-closed sobre dinero (R6: valida, no fuerza). Un default silencioso
    //    a 1 cuando el bulto traía 50 deja el costo unitario 50 veces más alto,
    //    y ese costo se congela al vender: el error queda grabado para siempre.
    //    Se llama la RPC directo porque la UI manda los dos campos juntos — el
    //    guard tiene que sostenerse también contra un cliente que no lo haga.
    const antes = await leerProducto(SIN_FACTOR)
    const { count: facturasAntes } = await db
      .from('purchase_invoices')
      .select('id', { count: 'exact', head: true })

    const { data: prod } = await db.from('products').select('id').eq('name', SIN_FACTOR).single()
    const { data: prov } = await db.from('suppliers').select('id').eq('name', PROVEEDOR).single()

    const { error } = await db.rpc('register_purchase', {
      p_invoice: { supplier_id: prov!.id, invoice_number: 'E2E-GUARD', notes: null },
      // purchase_unit SIN units_per_purchase_unit: el caso que miente.
      p_items: [{ product_id: prod!.id, qty: 2, unit_cost: 9000, purchase_unit: 'bulto' }],
    })

    expect(error, 'la RPC tiene que RECHAZAR, no asumir factor 1').not.toBeNull()
    expect(error!.message).toMatch(/factor de equivalencia/i)

    // Y el rechazo es ATÓMICO: no queda media compra escrita.
    const despues = await leerProducto(SIN_FACTOR)
    expect(despues.stock, 'el stock no se movió').toBe(antes.stock)
    expect(Number(despues.costo), 'el costo no se movió').toBe(Number(antes.costo))
    const { count: facturasDespues } = await db
      .from('purchase_invoices')
      .select('id', { count: 'exact', head: true })
    expect(facturasDespues, 'no se creó la cabecera de la factura').toBe(facturasAntes)
  })

  test('GUARD — factor sin unidad de compra también RECHAZA', async () => {
    // La otra mitad del invariante. Un factor de 50 sin decir de qué es una
    // línea que no se puede leer después: ¿50 qué?
    const { data: prod } = await db.from('products').select('id').eq('name', SIN_FACTOR).single()
    const { data: prov } = await db.from('suppliers').select('id').eq('name', PROVEEDOR).single()

    const { error } = await db.rpc('register_purchase', {
      p_invoice: { supplier_id: prov!.id, invoice_number: 'E2E-GUARD-2', notes: null },
      p_items: [{ product_id: prod!.id, qty: 2, unit_cost: 9000, units_per_purchase_unit: 50 }],
    })

    expect(error, 'un factor huérfano tiene que rechazar').not.toBeNull()
    expect(error!.message).toMatch(/sin unidad de compra/i)
  })
})
