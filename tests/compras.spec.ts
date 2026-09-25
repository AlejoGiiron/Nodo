import { test, expect, type Page } from '@playwright/test'
import { loginAsOwner, loginAsCashier } from './helpers/auth'
import { openShiftIfClosed, closeShiftIfOpen } from './helpers/shift'
import { crearCategoria, crearProducto, crearProveedor, desactivar } from './helpers/fixture'

const SUFFIX = Date.now().toString().slice(-6)
const CAT = `E2E Compras ${SUFFIX}`
const INSUMO = `E2E Insumo ${SUFFIX}`         // producto simple con inventario
let ID_CAT = ''
let ID_INSUMO = ''
let ID_PROVEEDOR = ''

const PROVEEDOR = `E2E Proveedor ${SUFFIX}`

// ── Helpers ───────────────────────────────────────────────────────

// Registra una compra de UN ítem.
// ⚠️ Ya NO hay método de pago (`invoice-payment-method` no existe): la deuda 26
//    decidió que la compra SALE de la caja del día, siempre. `payment_method`
//    quedó fuera del alcance ("consumidor primero, después columna").
async function registerPurchase(
  page: Page,
  { supplier, product, qty, cost }:
    { supplier: string; product: string; qty: number; cost: number },
) {
  await page.goto('/compras')
  await page.getByTestId('new-invoice-btn').click()
  await expect(page.getByTestId('new-invoice-modal')).toBeVisible()
  await page.getByTestId('invoice-supplier').selectOption({ label: supplier })
  // ⚠️ ACOTADOS POR EL ESCENARIO, no por el locator — y queda dicho porque es
  //    literalmente la clase de «un locator apoyado en unicidad no declarada»
  //    (CLAUDE.md, política de testing). Estos `.first()` son correctos HOY
  //    porque el modal de factura nueva arranca con UNA sola línea y este helper
  //    no agrega más: la unicidad la garantiza el escenario.
  //    🔴 DISPARADOR, concreto: el día que un spec cree DOS líneas en la misma
  //    factura, estos `.first()` dejan de estar acotados y pasan a apostar —
  //    van a seguir en verde eligiendo la línea equivocada, que es el modo de
  //    fallo de esta clase. Ahí se acotan por índice explícito o por testid de
  //    fila. No se cambian antes: hoy nombran lo único que hay.
  await page.getByTestId('invoice-item-product').first().selectOption({ label: product })
  await page.getByTestId('invoice-item-qty').first().fill(String(qty))
  await page.getByTestId('invoice-item-cost').first().fill(String(cost))
  await page.getByTestId('invoice-submit').click()
}

// Lee el stock de un insumo desde la pestaña Niveles de Inventario.
async function readStock(page: Page, name: string): Promise<number> {
  await page.goto('/inventario')
  await page.getByTestId('inventory-tab-levels').click()
  await page.getByPlaceholder('Buscar producto...').fill(name)
  const row = page.getByTestId('stock-level-row').filter({ hasText: name })
  await expect(row).toBeVisible()
  return Number(await row.getByTestId('stock-level-qty').innerText())
}

// ── Suite ─────────────────────────────────────────────────────────

test.describe.serial('Compras / Proveedores', () => {
  // 🔴 Sembrado POR API (deuda 131). La pregunta obligatoria —*¿qué hace este
  //    setup de paso que sea parte del escenario?*— se contestó abriendo las dos
  //    funciones que reemplaza: `createSimpleTracked` sólo asevera que el
  //    seguimiento nace prendido (el helper lo verifica releyendo la fila) y
  //    `createSupplier` llena **sólo el nombre**. Respuesta: nada.
  // ⚠️ El control de que el insumo arranca en 0 se conserva POR LA PANTALLA,
  //    porque `readStock` es el instrumento de los casos siguientes.
  test('setup: categoría, insumo y proveedor', async ({ page }) => {
    ID_CAT = await crearCategoria(CAT)
    ID_INSUMO = await crearProducto({ nombre: INSUMO, precio: 1000, categoria: ID_CAT })
    ID_PROVEEDOR = await crearProveedor(PROVEEDOR)

    await loginAsOwner(page)
    expect(await readStock(page, INSUMO)).toBe(0)
  })

  test('registrar compra sube el stock del insumo y deja movimiento de compra', async ({ page }) => {
    await loginAsOwner(page)

    // La compra EXIGE jornada abierta (register_purchase rechaza sin ella).
    await page.goto('/ventas')
    await openShiftIfClosed(page, 100000)

    await registerPurchase(page, { supplier: PROVEEDOR, product: INSUMO, qty: 10, cost: 1500 })
    await expect(page.getByTestId('new-invoice-modal')).toHaveCount(0)
    await expect(page.getByText(/Compra #\d+ registrada/)).toBeVisible()

    // El stock subió 0 → 10.
    expect(await readStock(page, INSUMO)).toBe(10)

    // El ingreso de stock queda auditado como movimiento de compra (+10).
    await page.goto('/inventario')
    await page.getByTestId('inventory-tab-movements').click()
    const row = page.getByTestId('stock-movement-row').filter({ hasText: INSUMO }).first()
    await expect(row).toContainText('Compra')
    await expect(row.getByTestId('stock-movement-qty')).toContainText('+10')

    // La compra aparece en el historial.
    await page.goto('/compras')
    await expect(page.getByTestId('purchase-row').filter({ hasText: PROVEEDOR }).first()).toBeVisible()
  })

  // 🔴 REESCRITO el 2026-09-01, y la expectativa se INVIERTE. La versión
  //    anterior afirmaba "la compra NUNCA genera un egreso de caja automático" —
  //    la regla de VENTO. La deuda 26, decidida por el cliente, dice lo
  //    contrario: la compra SALE de la caja del día, y register_purchase crea el
  //    egreso con categoria='compra'. Copiar el spec de Vento habría verificado
  //    exactamente el comportamiento que revertimos.
  test('la compra SALE de la caja: egreso automático con categoria=compra', async ({ page }) => {
    await loginAsOwner(page)
    await page.goto('/ventas')
    await openShiftIfClosed(page, 100000)

    await registerPurchase(page, { supplier: PROVEEDOR, product: INSUMO, qty: 5, cost: 2000 })
    await expect(page.getByTestId('new-invoice-modal')).toHaveCount(0)
    await expect(page.getByText(/Compra #\d+ registrada/)).toBeVisible()

    // El egreso automático está en los movimientos de la jornada, con el
    // detalle que escribe la RPC ('Compra a proveedor X (factura N)').
    await page.goto('/ventas')
    await page.getByTestId('open-movements').click()
    await expect(
      page.getByTestId('movement-item').filter({ hasText: `Compra a proveedor ${PROVEEDOR}` }).first(),
    ).toBeVisible()
    // Y por el monto exacto: 5 × 2.000 = 10.000.
    await expect(
      page.getByTestId('movement-item').filter({ hasText: `Compra a proveedor ${PROVEEDOR}` }).first(),
    ).toContainText('10.000')
  })

  // 🔴 REESCRITO: antes era 'sin turno se registra sin advertencia' — Vento.
  //    En Nodo la compra sin jornada se RECHAZA (fail-closed), con el mensaje
  //    accionable de la RPC. Este es un test de AUSENCIA con su contraste: el
  //    stock NO cambió, que es lo que hace falsable al rechazo (R10).
  test('sin jornada abierta la compra se RECHAZA y el stock no se mueve', async ({ page }) => {
    await loginAsOwner(page)
    await page.goto('/ventas')
    await closeShiftIfOpen(page)

    const antes = await readStock(page, INSUMO)   // 15 tras los dos tests previos

    await registerPurchase(page, { supplier: PROVEEDOR, product: INSUMO, qty: 3, cost: 1000 })

    // El toast trae el mensaje de la RPC, que dice QUE hacer, no solo que no.
    await expect(page.getByText(/Abri la jornada de caja/)).toBeVisible()
    // El modal NO se cierra: la compra no se registró.
    await expect(page.getByTestId('new-invoice-modal')).toBeVisible()

    // CONTRASTE del rechazo: el stock quedó exactamente igual.
    expect(await readStock(page, INSUMO)).toBe(antes)
  })

  test('gating: el cajero NO ve Compras', async ({ page }) => {
    await loginAsCashier(page)
    // No está en el sidebar.
    await expect(page.getByRole('link', { name: 'Compras' })).toHaveCount(0)
    // Y por URL es redirigido a /ventas.
    await page.goto('/compras')
    await expect(page).toHaveURL(/\/ventas/, { timeout: 15_000 })
  })

  test('limpieza: cerrar turno, desactivar insumo, proveedor y categoría', async ({ page }) => {
    page.on('dialog', (d) => d.accept())
    await loginAsOwner(page)

    await page.goto('/ventas')
    await closeShiftIfOpen(page)

    // 🔴 POR API (deuda 131). El proveedor se DESACTIVA, no se borra —admite
    //    tener facturas—, que es lo mismo que hacía el botón de la pantalla.
    await desactivar('suppliers', [ID_PROVEEDOR])
    await desactivar('products', [ID_INSUMO])
    await desactivar('categories', [ID_CAT])
  })
})
