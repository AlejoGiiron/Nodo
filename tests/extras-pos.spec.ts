import { test, expect, type Page } from '@playwright/test'
import { loginAsOwner } from './helpers/auth'
import { cobrarEnEfectivo } from './helpers/pos'
import { openShiftIfClosed, closeShiftIfOpen } from './helpers/shift'
import { crearCategoria, crearProducto, crearExtra, asignarExtras, desactivar } from './helpers/fixture'

// "$ 12.000" → 12000
const parseCOP = (text: string): number => Number(text.replace(/[^\d]/g, ''))

const SUFFIX = Date.now().toString().slice(-6)
const CAT = `E2E ExP ${SUFFIX}`
const P_STOCK = `E2E Insumo ${SUFFIX}`   // producto con inventario (lo descuenta el extra)
const P_BASE = `E2E ConExtras ${SUFFIX}` // producto al que se le asignan extras
const P_SIMPLE = `E2E Simple ${SUFFIX}`  // producto SIN extras
const E_FREE = `E2E ExtraLibre ${SUFFIX}`    // extra sin vínculo de stock
const E_LINKED = `E2E ExtraInsumo ${SUFFIX}` // extra vinculado a P_STOCK

// 🔴 Los ids del escenario, que ahora se siembra POR API (deuda 131). Los casos
//    siguen buscando por NOMBRE —no cambió nada de lo que miden—; los ids son
//    para que la limpieza desactive por id en vez de clickeando fila por fila.
let ID_CAT = ''
let ID_STOCK = ''
let ID_BASE = ''
let ID_SIMPLE = ''
let ID_FREE = ''
let ID_LINKED = ''

// ── Helpers ───────────────────────────────────────────────────────

// Lee el stock de un insumo desde la pestaña Niveles de Inventario.
async function readStock(page: Page, productName: string): Promise<number> {
  await page.goto('/inventario')
  await page.getByTestId('inventory-tab-levels').click()
  await page.getByPlaceholder('Buscar producto...').fill(productName)
  const row = page.getByTestId('stock-level-row').filter({ hasText: productName })
  await expect(row).toBeVisible()
  return Number(await row.getByTestId('stock-level-qty').innerText())
}

// Fija el stock a un valor absoluto vía ajuste manual (suma/resta el delta).
async function setStock(page: Page, productName: string, value: string) {
  const target = Number(value)
  const current = await readStock(page, productName)
  const delta = target - current
  if (delta === 0) return
  await page.goto('/inventario')
  await page.getByTestId('inventory-adjust-btn').click()
  await page.getByTestId('adjust-product').selectOption({ label: productName })
  await page.getByTestId(delta > 0 ? 'adjust-sign-in' : 'adjust-sign-out').click()
  await page.getByTestId('adjust-amount').fill(String(Math.abs(delta)))
  await page.getByTestId('adjust-reason').fill('ajuste test')
  await page.getByTestId('adjust-confirm').click()
  await expect(page.getByTestId('stock-adjust-modal')).toHaveCount(0)
}

// Vende P_BASE con `extraName` en cantidad `extraQty` por unidad. Deja el turno abierto.
async function sellBaseWithExtra(page: Page, extraName: string, extraQty: number) {
  await page.goto('/ventas')
  await openShiftIfClosed(page, 0)
  await page.getByPlaceholder('Buscar producto...').fill(P_BASE)
  await page.getByTestId('product-card').filter({ hasText: P_BASE }).first().click()

  // Modal de configuración de extras.
  await expect(page.getByTestId('item-config-modal')).toBeVisible()
  const row = page.getByTestId('item-config-extra').filter({ hasText: extraName })
  for (let i = 0; i < extraQty; i++) await row.getByTestId('extra-qty-inc').click()
  await page.getByTestId('item-config-confirm').click()

  // Cobro en efectivo.
  // Camino, no sujeto: este spec mide otra cosa. Los dos botones del efectivo
  // viven en `cobrarEnEfectivo`.
  await cobrarEnEfectivo(page, 200_000)
  await expect(
    page.getByText('¡Cobro exitoso!').or(page.getByText(/¡Venta #\d+ registrada!/)),
  ).toBeVisible({ timeout: 15_000 })
  await page.getByRole('button', { name: 'Nueva venta' }).click()
}

// ── Suite ─────────────────────────────────────────────────────────

test.describe.serial('Extras en POS', () => {
  // 🔴 SEMBRADO POR API, no por los modales (deuda 131). La razón NO es que tarde
  //    menos: es la VARIANZA. Este mismo setup, por UI y sin tocar nada entre
  //    corridas, dio **25,4 · 23,2 · 19,5 s** —y 30,4 en otra— contra un tope de
  //    30 s por caso. La limpieza del mismo archivo, también por UI, dio 15,2 ·
  //    15,6 · 15,3: o sea que la varianza la tiene el que ESCRIBE, no el que
  //    navega.
  // ⚠️ Los casos de abajo NO cambian: siguen buscando por NOMBRE en la pantalla.
  //    Lo que cambia es cómo llegan las filas, y los controles de que llegaron
  //    bien —precio, seguimiento, stock inicial, costo nulo, vínculo del extra—
  //    viven ahora dentro del helper, que se asevera a sí mismo.
  test('setup: categoría, productos y extras', async () => {
    ID_CAT = await crearCategoria(CAT)
    ID_STOCK = await crearProducto({ nombre: P_STOCK, precio: 5000, categoria: ID_CAT, stock: 50 })
    ID_BASE = await crearProducto({ nombre: P_BASE, precio: 10000, categoria: ID_CAT, tracking: false })
    ID_SIMPLE = await crearProducto({ nombre: P_SIMPLE, precio: 8000, categoria: ID_CAT, tracking: false })
    ID_FREE = await crearExtra(E_FREE, 2000)
    ID_LINKED = await crearExtra(E_LINKED, 3000, ID_STOCK)
    await asignarExtras(ID_BASE, [ID_FREE, ID_LINKED])
  })

  test('agregar producto con extra → el total incluye el extra', async ({ page }) => {
    await loginAsOwner(page)
    await page.goto('/ventas')
    await page.getByPlaceholder('Buscar producto...').fill(P_BASE)
    await page.getByTestId('product-card').filter({ hasText: P_BASE }).first().click()

    await expect(page.getByTestId('item-config-modal')).toBeVisible()
    await page.getByTestId('item-config-extra').filter({ hasText: E_FREE })
      .getByTestId('extra-qty-inc').click()
    await page.getByTestId('item-config-confirm').click()

    // 10.000 producto + 2.000 extra = 12.000
    expect(parseCOP(await page.getByTestId('cart-total').innerText())).toBe(12000)
  })

  test('extra con cantidad > 1 → el precio se multiplica', async ({ page }) => {
    await loginAsOwner(page)
    await page.goto('/ventas')
    await page.getByPlaceholder('Buscar producto...').fill(P_BASE)
    await page.getByTestId('product-card').filter({ hasText: P_BASE }).first().click()

    const inc = page.getByTestId('item-config-extra').filter({ hasText: E_FREE }).getByTestId('extra-qty-inc')
    await inc.click()
    await inc.click() // qty 2

    // Subtotal por unidad en el modal: 10.000 + 2×2.000 = 14.000
    expect(parseCOP(await page.getByTestId('item-config-subtotal').innerText())).toBe(14000)

    await page.getByTestId('item-config-confirm').click()
    expect(parseCOP(await page.getByTestId('cart-total').innerText())).toBe(14000)
  })

  test('producto sin extras → se agrega directo, sin modal', async ({ page }) => {
    await loginAsOwner(page)
    await page.goto('/ventas')
    await page.getByPlaceholder('Buscar producto...').fill(P_SIMPLE)
    await page.getByTestId('product-card').filter({ hasText: P_SIMPLE }).first().click()

    await expect(page.getByTestId('item-config-modal')).toHaveCount(0)
    expect(parseCOP(await page.getByTestId('cart-total').innerText())).toBe(8000)
  })

  test('vender extra vinculado a stock → baja el inventario del producto vinculado', async ({ page }) => {
    await loginAsOwner(page)
    const before = await readStock(page, P_STOCK)
    await sellBaseWithExtra(page, E_LINKED, 1)
    const after = await readStock(page, P_STOCK)
    expect(after).toBe(before - 1)
  })

  test('vender extra sin vínculo → no toca el inventario', async ({ page }) => {
    await loginAsOwner(page)
    const before = await readStock(page, P_STOCK)
    await sellBaseWithExtra(page, E_FREE, 1)
    const after = await readStock(page, P_STOCK)
    expect(after).toBe(before)
  })

  test('vender por encima del stock → queda NEGATIVO con alerta de sobreventa', async ({ page }) => {
    await loginAsOwner(page)

    // Stock del insumo en 1, luego vender el extra vinculado en cantidad 3.
    await setStock(page, P_STOCK, '1')
    await sellBaseWithExtra(page, E_LINKED, 3) // 1 − 3 = −2

    // El stock queda NEGATIVO (no en 0).
    expect(await readStock(page, P_STOCK)).toBe(-2)

    // Alerta de sobreventa en el grid (ProductCard). Se acota a la card de
    // P_STOCK: el mismo testid 'oversold-alert' existe también en el modal de
    // edición, así que sin scope el locator es ambiguo (strict mode).
    await page.goto('/productos')
    await page.getByPlaceholder('Buscar producto...').fill(P_STOCK)
    const card = page.getByTestId('catalogo-row').filter({ hasText: P_STOCK })
    await expect(card.getByTestId('oversold-alert')).toBeVisible()
    await expect(card.getByTestId('oversold-alert')).toContainText('Sobreventa: reponer')
    await expect(card.getByTestId('stock-badge')).toContainText('-2')

    // Y en el modal de edición del producto (acotado al modal).
    await page.getByTitle('Editar', { exact: true }).first().click()
    await expect(page.getByTestId('product-modal').getByTestId('oversold-alert')).toBeVisible()
  })

  test('limpieza: cerrar turno, desactivar extras, productos y categoría', async ({ page }) => {
    page.on('dialog', (d) => d.accept())
    await loginAsOwner(page)

    // Cerrar el turno abierto por las ventas de prueba.
    await page.goto('/ventas')
    await closeShiftIfOpen(page)

    // 🔴 Desactivar POR API (deuda 131). Cerrar el turno se queda por la UI: es
    //    el único paso que necesita la pantalla, y su duración es estable.
    //    El helper asevera que no quedó nada activo — la limpieza verifica su
    //    EFECTO, no la operación.
    await desactivar('extras', [ID_FREE, ID_LINKED])
    await desactivar('products', [ID_STOCK, ID_BASE, ID_SIMPLE])

    await desactivar('categories', [ID_CAT])
  })
})
