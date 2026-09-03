import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { loginAsOwner } from './helpers/auth'
import { openShiftIfClosed, closeShiftIfOpen } from './helpers/shift'

// Descuentos en el POS. Corre en LAB.
//
// ⚠️ ERA `vale-descuento.spec.ts`. El VALE (ruletazo) se podó el 2026-09-01:
//    `orders.discount_kind` no viajó al esquema base, y la decisión estaba
//    escrita y enumerada en la migración `ventas` — el vale es la mecánica
//    promocional de Vento, no el descuento. Lo que SÍ viajó y sigue cubierto acá:
//    `discount_amount`, `discount_type` y `discount_reason`.
//
// Cubre: descuento fijo y porcentual (bajan el total y persisten), y la venta
// GRATIS por descuento del 100% —que NO era una propiedad del vale: el camino de
// POSPage es `total > 0`, no `kind === 'vale'`—.

const PRODUCT = 'Lab Coctel'
const PRICE = 18000

// ── Supabase directo (RLS del owner) ──────────────────────────────────
function loadEnv(path: string) {
  try {
    for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  } catch { /* ignore */ }
}
loadEnv('.env')
loadEnv('.env.test')

let _client: SupabaseClient | null = null
async function db(): Promise<SupabaseClient> {
  if (_client) return _client
  const c = createClient(process.env.VITE_NODO_SUPABASE_URL!, process.env.VITE_NODO_SUPABASE_ANON_KEY!)
  const { error } = await c.auth.signInWithPassword({
    email: process.env.E2E_OWNER_EMAIL!, password: process.env.E2E_OWNER_PASSWORD!,
  })
  if (error) throw error
  _client = c
  return c
}

type OrderRow = {
  id: string; total: number
  discount_amount: number; discount_type: string | null
}
async function orderByNumber(n: number): Promise<OrderRow> {
  const c = await db()
  const { data, error } = await c
    .from('orders')
    .select('id, total, discount_amount, discount_type')
    .eq('order_number', n)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()
  if (error) throw error
  return data as OrderRow
}

async function paymentCount(orderId: string): Promise<number> {
  const c = await db()
  const { count, error } = await c
    .from('payments').select('id', { count: 'exact', head: true }).eq('order_id', orderId)
  if (error) throw error
  return count ?? 0
}

// ── Helpers de UI ──────────────────────────────────────────────────────
async function addProductPOS(page: Page) {
  await page.getByTestId('product-card').filter({ hasText: PRODUCT }).first().click()
  await expect(page.getByTestId('item-config-modal')).toBeVisible()
  await page.getByTestId('item-config-confirm').click()
}
function orderNumberFromBanner(text: string): number {
  return Number(text.match(/#(\d+)/)![1])
}
async function payNequiAndFinish(page: Page): Promise<number> {
  await page.getByTestId('cobro-medio-nequi').click()
  await page.getByTestId('cobro-confirmar').click()
  const banner = page.getByText(/Venta #\d+ registrada/)
  await expect(banner).toBeVisible({ timeout: 15_000 })
  const n = orderNumberFromBanner(await banner.innerText())
  return n
}

// ── Suite ───────────────────────────────────────────────────────────────
test.describe.serial('Descuentos', () => {
  test('POS: descuento FIJO baja el total y persiste amount/type', async ({ page }) => {
    await loginAsOwner(page)
    await page.goto('/ventas')
    await openShiftIfClosed(page, 0)

    await addProductPOS(page)
    // 4.000 fijos sobre 18.000 → total 14.000.
    await page.getByRole('button', { name: '$', exact: true }).click()
    await page.getByTestId('discount-amount').fill('4000')
    await expect(page.getByTestId('cart-total')).toContainText('14.000')

      const n = await payNequiAndFinish(page)
    await page.getByRole('button', { name: 'Nueva venta' }).click()

    const order = await orderByNumber(n)
    expect(order.total).toBe(PRICE - 4000)
    expect(order.discount_amount).toBe(4000)
    expect(order.discount_type).toBe('fixed')
  })

  test('POS: descuento PORCENTUAL persiste type=pct y el monto calculado', async ({ page }) => {
    await loginAsOwner(page)
    await page.goto('/ventas')
    await openShiftIfClosed(page, 0)

    await addProductPOS(page)
    await page.getByRole('button', { name: '10%', exact: true }).click()

      const n = await payNequiAndFinish(page)
    await page.getByRole('button', { name: 'Nueva venta' }).click()

    const order = await orderByNumber(n)
    expect(order.discount_type).toBe('pct')
    expect(order.discount_amount).toBe(Math.round(PRICE * 0.1))  // 1.800
  })

  test('VENTA GRATIS: descuento del 100% → total 0, se cierra sin pago, queda registrada', async ({ page }) => {
    await loginAsOwner(page)
    await page.goto('/ventas')
    await openShiftIfClosed(page, 0)

    await addProductPOS(page)

    // 25.000 fijos sobre 18.000. El clamp vive en el CÁLCULO
    // (`discountAmt = Math.min(discount, subtotal)` en POSPage), NO en el input:
    // el campo conserva lo tecleado y el total no se va a negativo.
    // ⚠️ La versión anterior de este test afirmaba que el INPUT se clampeaba a
    //    "18.000". Era falso en el POS —venía de la caja de Mesas, que sí
    //    formateaba— y se coló al migrar el test sin poder ejecutarlo.
    await page.getByRole('button', { name: '$', exact: true }).click()
    await page.getByTestId('discount-amount').fill('25000')

      // El re-skin sacó el símbolo de moneda de las cifras (§2 del design system:
    // sin símbolo, el rótulo ya dice qué es). La EXPECTATIVA no cambió — el total
    // a cobrar de una venta gratis es cero —, cambió el formato en que se
    // escribe. Y se aprovecha para endurecerla: `toContainText('0')` habría
    // pasado con "10.000"; `toHaveText` exige que el total SEA cero.
    await expect(page.getByTestId('cart-total')).toHaveText('0')

    // Se cierra SIN pago: continuar dispara handleConfirm, que salta el cobro.
    const n = await payNequiAndFinish(page)

    const order = await orderByNumber(n)
    expect(order.total).toBe(0)
    expect(order.discount_amount).toBe(PRICE)       // clampeado al subtotal
    expect(await paymentCount(order.id)).toBe(0)    // sin filas en payments

    // Historial: se muestra como "Cortesía" (no en blanco, no "Fiado").
    await page.goto('/historial')
    const row = page.getByRole('button', { name: new RegExp(`^#${n}\\s`) })
    await expect(row).toBeVisible({ timeout: 15_000 })
    await expect(row.getByTestId('sale-row-method')).toContainText('Cortesía')
  })

  test('limpieza: cerrar turno', async ({ page }) => {
    page.on('dialog', (d) => d.accept())
    await loginAsOwner(page)
    await page.goto('/ventas')
    await closeShiftIfOpen(page)
  })
})
