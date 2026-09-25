import { test, expect, type Page } from '@playwright/test'
import { loginAsOwner } from './helpers/auth'
import { crearCategoria, crearProducto, crearReceta, desactivar } from './helpers/fixture'
import { cobrarEnEfectivo } from './helpers/pos'
import { openShiftIfClosed, closeShiftIfOpen } from './helpers/shift'

const SUFFIX = Date.now().toString().slice(-6)
const CAT = `E2E Inv ${SUFFIX}`
const INSUMO = `E2E Vaso ${SUFFIX}`     // producto simple con inventario
const COCTEL = `E2E Coctel ${SUFFIX}`   // producto compuesto (receta: 1 vaso)

// Par FRESCO y aislado para el test de venta del compuesto: no lo tocan los
// tests de ajuste (+20/−5) sobre INSUMO, así el before/after es determinista.
const INSUMO_VENTA = `E2E VasoVenta ${SUFFIX}`
const COCTEL_VENTA = `E2E CoctelVenta ${SUFFIX}`

// ── Helpers ───────────────────────────────────────────────────────

// 🔴 Los ids del escenario, sembrado POR API (deuda 131). Los casos siguen
//    buscando por NOMBRE en la pantalla: no cambió nada de lo que miden.
let ID_CAT = ''
let ID_INSUMO = ''
let ID_COCTEL = ''
let ID_INSUMO_VENTA = ''
let ID_COCTEL_VENTA = ''

// Lee el stock de un insumo desde la pestaña Niveles de Inventario.
async function readStock(page: Page, name: string): Promise<number> {
  await page.goto('/inventario')
  await page.getByTestId('inventory-tab-levels').click()
  await page.getByPlaceholder('Buscar producto...').fill(name)
  const row = page.getByTestId('stock-level-row').filter({ hasText: name })
  await expect(row).toBeVisible()
  return Number(await row.getByTestId('stock-level-qty').innerText())
}

// Ajuste manual (+entrada / -salida) desde el modal de Inventario.
async function adjustStock(page: Page, name: string, sign: '+' | '-', amount: number, reason: string) {
  await page.goto('/inventario')
  await page.getByTestId('inventory-adjust-btn').click()
  await page.getByTestId('adjust-product').selectOption({ label: name })
  await page.getByTestId(sign === '+' ? 'adjust-sign-in' : 'adjust-sign-out').click()
  await page.getByTestId('adjust-amount').fill(String(amount))
  await page.getByTestId('adjust-reason').fill(reason)
  await page.getByTestId('adjust-confirm').click()
  await expect(page.getByTestId('stock-adjust-modal')).toHaveCount(0)
}

// Vende un producto (sin extras) en efectivo. Deja el turno abierto.
async function sellCash(page: Page, name: string) {
  await page.goto('/ventas')
  await openShiftIfClosed(page, 0)
  await page.getByPlaceholder('Buscar producto...').fill(name)
  await page.getByTestId('product-card').filter({ hasText: name }).first().click()
  // Camino, no sujeto: este spec mide otra cosa. Los dos botones del efectivo
  // viven en `cobrarEnEfectivo`.
  await cobrarEnEfectivo(page, 200_000)
  await expect(
    page.getByText('¡Cobro exitoso!').or(page.getByText(/¡Venta #\d+ registrada!/)),
  ).toBeVisible({ timeout: 15_000 })
  await page.getByRole('button', { name: 'Nueva venta' }).click()
}

// ── Suite ─────────────────────────────────────────────────────────

test.describe.serial('Inventario por recetas', () => {
  // 🔴 Sembrado POR API (deuda 131). Lo que este setup hacía DE PASO y ES parte
  //    del escenario es la RECETA: sin `product_components` el compuesto no
  //    descuenta su insumo, y este archivo se llama «Inventario por recetas».
  //    El helper la crea y la asevera.
  // ⚠️ El control de que el insumo arranca en stock 0 no se pierde: vive dentro
  //    de `crearProducto`, que relee la fila. Acá se conserva además la lectura
  //    POR LA PANTALLA, porque `readStock` es el instrumento que usan los casos
  //    siguientes y conviene que su primera lectura esté aseverada.
  test('setup: categoría, insumo y producto compuesto con receta', async ({ page }) => {
    ID_CAT = await crearCategoria(CAT)
    ID_INSUMO = await crearProducto({ nombre: INSUMO, precio: 1000, categoria: ID_CAT })
    ID_COCTEL = await crearProducto({ nombre: COCTEL, precio: 15000, categoria: ID_CAT, kind: 'composite' })
    await crearReceta(ID_COCTEL, [{ insumoId: ID_INSUMO, qty: 1 }])

    await loginAsOwner(page)
    expect(await readStock(page, INSUMO)).toBe(0)
  })

  test('ajuste manual suma stock y registra el movimiento', async ({ page }) => {
    await loginAsOwner(page)
    await adjustStock(page, INSUMO, '+', 20, 'compra inicial')
    expect(await readStock(page, INSUMO)).toBe(20)

    // Aparece un movimiento de ajuste con la cantidad correcta.
    await page.goto('/inventario')
    await page.getByTestId('inventory-tab-movements').click()
    const row = page.getByTestId('stock-movement-row').filter({ hasText: INSUMO }).first()
    await expect(row).toContainText('Ajuste')
    await expect(row.getByTestId('stock-movement-qty')).toContainText('+20')
  })

  test('ajuste manual de salida resta stock', async ({ page }) => {
    await loginAsOwner(page)
    await adjustStock(page, INSUMO, '-', 5, 'merma')
    expect(await readStock(page, INSUMO)).toBe(15)
  })

  test('vender un compuesto descuenta su insumo y deja movimiento de venta', async ({ page }) => {
    await loginAsOwner(page)

    // Par FRESCO, aislado de los ajustes (+20/−5) que otros tests aplican sobre
    // INSUMO. Stock conocido vía UN único ajuste de entrada, y before capturado
    // justo antes de la venta (sin ajustes intermedios) → determinista.
    // 🔴 El par se siembra POR API, y va MÁS ALLÁ de los 23 casos de andamio a
    //    propósito: esta creación vive DENTRO de un caso cuyo sujeto es la venta,
    //    no la creación — es medio, no escenario. Y es el caso exacto que falló
    //    con el botón en «Guardando…» colgado, o sea el que más expuesto estaba
    //    a la varianza de las escrituras por UI.
    // ⚠️ La existencia inicial la carga `crearProducto` con `adjust_stock`, la
    //    misma RPC que usaba `adjustStock` por la pantalla: el movimiento con
    //    motivo se sigue escribiendo.
    ID_INSUMO_VENTA = await crearProducto({ nombre: INSUMO_VENTA, precio: 1000, categoria: ID_CAT, stock: 10 })
    ID_COCTEL_VENTA = await crearProducto({ nombre: COCTEL_VENTA, precio: 15000, categoria: ID_CAT, kind: 'composite' })
    await crearReceta(ID_COCTEL_VENTA, [{ insumoId: ID_INSUMO_VENTA, qty: 1 }])

    const before = await readStock(page, INSUMO_VENTA)
    expect(before).toBe(10)

    // Vender 1 compuesto descuenta exactamente 1 unidad del insumo.
    await sellCash(page, COCTEL_VENTA)
    expect(await readStock(page, INSUMO_VENTA)).toBe(before - 1)

    // El descuento queda auditado como movimiento de venta del insumo.
    await page.goto('/inventario')
    await page.getByTestId('inventory-tab-movements').click()
    const row = page.getByTestId('stock-movement-row').filter({ hasText: INSUMO_VENTA }).first()
    await expect(row).toContainText('Venta')
    await expect(row.getByTestId('stock-movement-qty')).toContainText('−1')
  })

  test('sobreventa: el stock del insumo queda NEGATIVO con alerta', async ({ page }) => {
    await loginAsOwner(page)

    // Dejar el insumo en 1 y vender 2 cocteles → 1 − 2 = −1.
    const current = await readStock(page, INSUMO)
    if (current > 1) await adjustStock(page, INSUMO, '-', current - 1, 'ajuste a 1 para test')
    else if (current < 1) await adjustStock(page, INSUMO, '+', 1 - current, 'ajuste a 1 para test')
    expect(await readStock(page, INSUMO)).toBe(1)

    await sellCash(page, COCTEL)
    await sellCash(page, COCTEL)
    expect(await readStock(page, INSUMO)).toBe(-1)

    // Badge de estado "Reponer" en Niveles.
    await page.goto('/inventario')
    await page.getByPlaceholder('Buscar producto...').fill(INSUMO)
    const row = page.getByTestId('stock-level-row').filter({ hasText: INSUMO })
    await expect(row.getByTestId('stock-status-badge')).toContainText('Reponer')

    // Indicador en la card del POS (no bloquea la venta).
    await page.goto('/ventas')
    await page.getByPlaceholder('Buscar producto...').fill(INSUMO)
    await expect(page.getByTestId('pos-stock-indicator')).toContainText('Reponer')
  })

  test('limpieza: cerrar turno, desactivar productos y categoría', async ({ page }) => {
    page.on('dialog', (d) => d.accept())
    await loginAsOwner(page)

    await page.goto('/ventas')
    await closeShiftIfOpen(page)

    // 🔴 Desactivar POR API (deuda 131). Se CONSERVA el orden —compuestos antes
    //    que insumos— aunque por API ya no haga falta: era una restricción de la
    //    pantalla y quitarlo no ahorra nada, mientras dejarlo escrito conserva la
    //    razón de por qué existía.
    await desactivar('products', [ID_COCTEL, ID_COCTEL_VENTA, ID_INSUMO, ID_INSUMO_VENTA])
    await desactivar('categories', [ID_CAT])
  })
})
