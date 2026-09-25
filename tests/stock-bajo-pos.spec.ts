import { test, expect, type Page } from '@playwright/test'
import { loginAsOwner } from './helpers/auth'
import { crearCategoria, crearProducto, desactivar } from './helpers/fixture'

// Stock bajo en el POS. Antes el indicador solo conocía "≤ 0" (sin stock /
// sobreventa): `min_stock` existía, se editaba en la ficha y lo usaba Inventario,
// pero el POS lo ignoraba. La regla ahora es ÚNICA (src/lib/stockStatus.ts), así
// que las dos pantallas no pueden contestar distinto sobre el mismo producto.
//
// Los 4 estados se recorren sobre el MISMO producto bajando su stock, que es lo
// que verifica las FRONTERAS (5 > 5 > 0 > negativo) y no solo un caso feliz.

const SUFFIX = Date.now().toString().slice(-6)
const CAT = `E2E Bajo ${SUFFIX}`
const PROD = `E2E Insumo Bajo ${SUFFIX}`
const MIN_STOCK = 5

// Ids de lo sembrado por API (deuda 131). Los casos siguen buscando por NOMBRE.
let ID_CAT = ''
let ID_PROD = ''

async function irAlProductoEnPOS(page: Page) {
  await page.goto('/ventas')
  await page.getByPlaceholder('Buscar producto...').fill(PROD)
  return page.getByTestId('product-card').filter({ hasText: PROD }).first()
}

const badge = (card: ReturnType<Page['getByTestId']>) => card.getByTestId('pos-stock-indicator')

async function ajustar(page: Page, sign: '+' | '-', amount: number) {
  await page.goto('/inventario')
  await page.getByTestId('inventory-adjust-btn').click()
  await page.getByTestId('adjust-product').selectOption({ label: PROD })
  await page.getByTestId(sign === '+' ? 'adjust-sign-in' : 'adjust-sign-out').click()
  await page.getByTestId('adjust-amount').fill(String(amount))
  await page.getByTestId('adjust-reason').fill('E2E stock bajo')
  await page.getByTestId('adjust-confirm').click()
  await expect(page.getByTestId('stock-adjust-modal')).toHaveCount(0)
}

test.describe.serial('Stock bajo en el POS', () => {
  // 🔴 Sembrado POR API (deuda 131). La pregunta obligatoria acá tiene DOS
  //    respuestas que NO son «nada», y las dos son el escenario:
  //      · `min_stock = 5` — este archivo mide UMBRALES de stock bajo; sin el
  //        mínimo no hay umbral que cruzar;
  //      · la existencia inicial de 20 — es el «holgado» contra el que los casos
  //        siguientes bajan a 5, a 0 y a −3.
  //    Las dos van al helper: `minStock` y `stock`, y la existencia la carga por
  //    `adjust_stock`, igual que `ajustar` por la pantalla.
  // ⚠️ `ajustar` NO se borra: los cinco casos siguientes lo usan para mover el
  //    stock a través de los umbrales, y ESO sí es el sujeto.
  test('preparación: categoría + insumo con mínimo 5 y stock 20', async () => {
    ID_CAT = await crearCategoria(CAT)
    ID_PROD = await crearProducto({
      nombre: PROD, precio: 4000, categoria: ID_CAT, minStock: MIN_STOCK, stock: 20,
    })
  })

  test('stock holgado (20 > mínimo 5): SIN indicador', async ({ page }) => {
    // Caso negativo. Sin él, un indicador que se mostrara SIEMPRE pasaría todos
    // los casos positivos de abajo y el test sería verde por la razón equivocada.
    await loginAsOwner(page)
    const card = await irAlProductoEnPOS(page)
    await expect(card).toBeVisible()
    await expect(badge(card)).toHaveCount(0)
  })

  test('stock EN el mínimo (5): indicador "Stock bajo" — el caso que no existía', async ({ page }) => {
    await loginAsOwner(page)
    await ajustar(page, '-', 15)   // 20 → 5, exactamente el mínimo

    const card = await irAlProductoEnPOS(page)
    const b = badge(card)
    await expect(b).toBeVisible()
    await expect(b).toHaveText(/Stock bajo/)
    // El umbral es `<=`, no `<`: en el mínimo exacto YA avisa.
    await expect(b).toHaveAttribute('data-stock-status', 'low')
  })

  test('stock en 0: "Sin stock", no "Stock bajo"', async ({ page }) => {
    await loginAsOwner(page)
    await ajustar(page, '-', 5)    // 5 → 0

    const card = await irAlProductoEnPOS(page)
    const b = badge(card)
    await expect(b).toHaveText(/Sin stock/)
    await expect(b).toHaveAttribute('data-stock-status', 'out')
  })

  test('stock negativo: "Reponer" (sobreventa), estado propio', async ({ page }) => {
    await loginAsOwner(page)
    await ajustar(page, '-', 3)    // 0 → −3

    const card = await irAlProductoEnPOS(page)
    const b = badge(card)
    await expect(b).toHaveText(/Reponer/)
    await expect(b).toHaveAttribute('data-stock-status', 'negative')
  })

  test('Inventario y POS coinciden en el estado del mismo producto', async ({ page }) => {
    // El punto de extraer la regla: dos pantallas, una sola respuesta.
    await loginAsOwner(page)
    await ajustar(page, '+', 6)    // −3 → 3, por debajo del mínimo 5 → low

    await page.goto('/inventario')
    await page.getByTestId('inventory-tab-levels').click()
    await page.getByPlaceholder('Buscar producto...').fill(PROD)
    const row = page.getByTestId('stock-level-row').filter({ hasText: PROD })
    await expect(row.getByTestId('stock-status-badge')).toHaveText('Stock bajo')

    const card = await irAlProductoEnPOS(page)
    await expect(badge(card)).toHaveText(/Stock bajo/)
  })

  // 🔴 POR API (deuda 131). El `scrollIntoViewIfNeeded` que había acá existía
  //    porque el tab podía quedar fuera de vista tras el scroll de los casos
  //    anteriores — una dependencia del ESTADO DE LA PANTALLA que por API
  //    desaparece.
  test('limpieza: desactivar producto y categoría', async () => {
    await desactivar('products', [ID_PROD])
    await desactivar('categories', [ID_CAT])
  })
})
