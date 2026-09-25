import { test, expect, type Page } from '@playwright/test'
import { loginAsOwner } from './helpers/auth'
import { cobrarEnEfectivo } from './helpers/pos'
import { openShiftIfClosed, closeShiftIfOpen } from './helpers/shift'
import { crearCategoria, crearProducto, crearExtra, asignarExtras, desactivar } from './helpers/fixture'

// ⚠️  Suite para el LABORATORIO (opción C). NO correr contra producción.
// En un Supabase de laboratorio recién sembrado, la primera venta de la sede
// es #1; aquí se valida la SECUENCIA (N, N+1) para ser robusto sin depender
// del estado previo del backend compartido.

const SUFFIX = Date.now().toString().slice(-6)
const CAT = `E2E Hist ${SUFFIX}`
const P_SIMPLE = `E2E HistProd ${SUFFIX}`   // producto sin extras
const P_BASE = `E2E HistBase ${SUFFIX}`     // producto con un extra
const E_LIBRE = `E2E HistExtra ${SUFFIX}`   // extra sin vínculo de stock

// Ids de lo sembrado por API (deuda 131). Los casos siguen buscando por NOMBRE.
let ID_CAT = ''
let ID_SIMPLE = ''
let ID_BASE = ''
let ID_EXTRA = ''

// "Venta #12" → 12
function parseVentaNumber(text: string): number {
  const m = text.match(/#(\d+)/)
  if (!m) throw new Error(`No se encontró número de venta en: "${text}"`)
  return Number(m[1])
}

// ── Helpers ───────────────────────────────────────────────────────

// Vende un producto SIN extras al contado y devuelve el número de venta asignado.
async function sellSimple(page: Page, productName: string): Promise<number> {
  await page.goto('/ventas')
  await openShiftIfClosed(page, 0)
  await page.getByPlaceholder('Buscar producto...').fill(productName)
  await page.getByTestId('product-card').filter({ hasText: productName }).first().click()

  // Camino, no sujeto: este spec mide otra cosa. Los dos botones del efectivo
  // viven en `cobrarEnEfectivo`.
  await cobrarEnEfectivo(page, 200_000)

  await expect(page.getByText('¡Cobro exitoso!').or(page.getByText(/¡Venta #\d+ registrada!/)))
    .toBeVisible({ timeout: 15_000 })
  const num = parseVentaNumber(await page.getByTestId('success-order-number').innerText())
  await page.getByRole('button', { name: 'Nueva venta' }).click()
  return num
}

// Vende P_BASE con el extra libre (qty 1) al contado. Devuelve el número.
async function sellWithExtra(page: Page): Promise<number> {
  await page.goto('/ventas')
  await openShiftIfClosed(page, 0)
  await page.getByPlaceholder('Buscar producto...').fill(P_BASE)
  await page.getByTestId('product-card').filter({ hasText: P_BASE }).first().click()

  await expect(page.getByTestId('item-config-modal')).toBeVisible()
  await page.getByTestId('item-config-extra').filter({ hasText: E_LIBRE })
    .getByTestId('extra-qty-inc').click()
  await page.getByTestId('item-config-confirm').click()

  // Camino, no sujeto: este spec mide otra cosa. Los dos botones del efectivo
  // viven en `cobrarEnEfectivo`.
  await cobrarEnEfectivo(page, 200_000)

  await expect(page.getByText(/¡Venta #\d+ registrada!|¡Cobro exitoso!/)).toBeVisible({ timeout: 15_000 })
  const num = parseVentaNumber(await page.getByTestId('success-order-number').innerText())
  await page.getByRole('button', { name: 'Nueva venta' }).click()
  return num
}

// ── Suite ─────────────────────────────────────────────────────────

test.describe.serial('Numeración e historial de ventas', () => {
  let firstNum = 0
  let secondNum = 0
  let extraNum = 0

  // 🔴 Sembrado POR API (deuda 131). Pregunta obligatoria: los dos helpers
  //    locales que reemplaza sólo llenaban nombre y precio, y la asignación del
  //    extra es una fila en `product_extras` que el helper crea y asevera.
  //    Respuesta: nada de paso.
  test('setup: categoría, productos y extra', async () => {
    ID_CAT = await crearCategoria(CAT)
    ID_SIMPLE = await crearProducto({ nombre: P_SIMPLE, precio: 10000, categoria: ID_CAT })
    ID_BASE = await crearProducto({ nombre: P_BASE, precio: 12000, categoria: ID_CAT })
    ID_EXTRA = await crearExtra(E_LIBRE, 2000)
    await asignarExtras(ID_BASE, [ID_EXTRA])
  })

  test('la venta recibe número y la siguiente es consecutiva (#N, #N+1)', async ({ page }) => {
    await loginAsOwner(page)
    firstNum = await sellSimple(page, P_SIMPLE)
    secondNum = await sellSimple(page, P_SIMPLE)
    expect(secondNum).toBe(firstNum + 1)
  })

  test('el historial lista las ventas por número descendente', async ({ page }) => {
    await loginAsOwner(page)
    await page.goto('/historial')

    // La primera fila (orden desc) debe ser la venta más reciente.
    const firstRow = page.getByTestId('sale-row').first()
    await expect(firstRow).toContainText(`#${secondNum}`)
  })

  test('búsqueda por número de venta', async ({ page }) => {
    await loginAsOwner(page)
    await page.goto('/historial')
    await page.getByTestId('sales-search').fill(String(firstNum))

    const rows = page.getByTestId('sale-row')
    await expect(rows).toHaveCount(1)
    await expect(rows.first()).toContainText(`#${firstNum}`)
  })

  test('el detalle muestra ítems y extras + reimpresión disponible', async ({ page }) => {
    await loginAsOwner(page)
    extraNum = await sellWithExtra(page)

    await page.goto('/historial')
    await page.getByTestId('sales-search').fill(String(extraNum))
    await page.getByTestId('sale-row').first().click()

    await expect(page.getByTestId('sale-detail-modal')).toBeVisible()
    await expect(page.getByTestId('sale-detail-item').first()).toContainText(P_BASE)
    await expect(page.getByTestId('sale-detail-extras').first()).toContainText(E_LIBRE)
    await expect(page.getByTestId('sale-reprint')).toBeEnabled()
  })

  test('limpieza: cerrar turno, desactivar extra, productos y categoría', async ({ page }) => {
    page.on('dialog', (d) => d.accept())
    await loginAsOwner(page)

    await page.goto('/ventas')
    await closeShiftIfOpen(page)

    // 🔴 POR API (deuda 131).
    await desactivar('extras', [ID_EXTRA])
    await desactivar('products', [ID_SIMPLE, ID_BASE])

    await desactivar('categories', [ID_CAT])
  })
})
