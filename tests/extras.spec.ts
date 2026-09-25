import { test, expect } from '@playwright/test'
import { loginAsOwner } from './helpers/auth'
import { crearCategoria, crearProducto, desactivar, desactivarPorNombre } from './helpers/fixture'

// Sufijo único por corrida → datos idempotentes y aislados.
const SUFFIX = Date.now().toString().slice(-6)
const CAT = `E2E ExtCat ${SUFFIX}`
const PROD = `E2E ExtProd ${SUFFIX}`
const EXTRA_SIMPLE = `E2E Topping ${SUFFIX}`
const EXTRA_LINKED = `E2E Adición ${SUFFIX}`

// 🔴 Los ids de lo que siembra el ANDAMIO. Los EXTRAS no están acá a propósito:
//    crearlos por la pantalla es el SUJETO de este archivo, así que nacen en los
//    casos y la limpieza los desactiva por nombre.
let ID_CAT = ''
let ID_PROD = ''

// Serie: cada test construye sobre el anterior (producto → extras → asignación
// → desactivación → limpieza). workers:1 garantiza el orden.
test.describe.serial('Extras', () => {
  // 🔴 Sembrado POR API (deuda 131). La categoría y el producto son MEDIO: lo que
  //    este archivo mide es crear y vincular EXTRAS, y eso se sigue haciendo por
  //    la pantalla en los casos de abajo.
  // ⚠️ La pregunta obligatoria —*¿qué hace este setup de paso que sea parte del
  //    escenario?*— acá se contesta «nada»: el producto base sólo tiene que
  //    existir, con seguimiento de inventario y sin costo, y eso lo asevera el
  //    helper al releer la fila.
  test('setup: crear categoría y producto base', async () => {
    ID_CAT = await crearCategoria(CAT)
    ID_PROD = await crearProducto({ nombre: PROD, precio: 12000, categoria: ID_CAT })
  })

  test('crear un extra simple (sin stock) en el catálogo', async ({ page }) => {
    await loginAsOwner(page)
    await page.goto('/configuracion')
    await page.getByRole('button', { name: 'Extras', exact: true }).click()

    await page.getByTestId('extra-new').click()
    await page.getByTestId('extra-name').fill(EXTRA_SIMPLE)
    await page.getByTestId('extra-price').fill('2000')
    await page.getByTestId('extra-save').click()

    const row = page.getByTestId('extra-row').filter({ hasText: EXTRA_SIMPLE })
    await expect(row).toBeVisible()
    await expect(row).toContainText('Activo')
  })

  test('crear un extra vinculado a un producto', async ({ page }) => {
    await loginAsOwner(page)
    await page.goto('/configuracion')
    await page.getByRole('button', { name: 'Extras', exact: true }).click()

    await page.getByTestId('extra-new').click()
    await page.getByTestId('extra-name').fill(EXTRA_LINKED)
    await page.getByTestId('extra-price').fill('3500')
    // Activar "descuenta inventario" y elegir el producto vinculado.
    await page.getByTestId('extra-link-toggle').click()
    await page.getByTestId('extra-link-product').selectOption({ label: PROD })
    await page.getByTestId('extra-save').click()

    const row = page.getByTestId('extra-row').filter({ hasText: EXTRA_LINKED })
    await expect(row).toBeVisible()
    // Muestra de qué producto descuenta.
    await expect(row).toContainText(PROD)
  })

  test('asignar extras a un producto y que persistan', async ({ page }) => {
    await loginAsOwner(page)
    await page.goto('/productos')
    await page.getByPlaceholder('Buscar producto...').fill(PROD)

    await page.getByTitle('Editar', { exact: true }).first().click()

    // Marcar el extra simple en la ficha del producto.
    const option = page.getByTestId('product-extra-option').filter({ hasText: EXTRA_SIMPLE })
    await option.click()
    await page.getByRole('button', { name: 'Guardar cambios' }).click()

    // Reabrir y verificar que quedó seleccionado (cargado desde BD).
    await page.getByPlaceholder('Buscar producto...').fill(PROD)
    await page.getByTitle('Editar', { exact: true }).first().click()
    const reopened = page.getByTestId('product-extra-option').filter({ hasText: EXTRA_SIMPLE })
    // 🔴 SE ASEVERA EL ESTADO, NO EL COLOR. Antes esto miraba el fondo
    //    `#ecfdf5` y quedó ROJO cuando la deuda 88 sacó el emerald de Vento:
    //    el producto estaba bien y el spec aseveraba un valor viejo. Un color
    //    es un valor que cada re-skin mueve; `aria-pressed` es el estado.
    await expect(reopened).toHaveAttribute('aria-pressed', 'true')
  })

  test('desactivar un extra lo marca como inactivo', async ({ page }) => {
    // El catálogo confirma con window.confirm antes de desactivar (no elimina).
    page.on('dialog', (dialog) => dialog.accept())
    await loginAsOwner(page)
    await page.goto('/configuracion')
    await page.getByRole('button', { name: 'Extras', exact: true }).click()

    const row = page.getByTestId('extra-row').filter({ hasText: EXTRA_SIMPLE })
    await row.getByTitle('Desactivar').click()
    await expect(row).toContainText('Inactivo')
  })

  test('limpieza: desactivar extras, producto y categoría', async ({ page }) => {
    page.on('dialog', (dialog) => dialog.accept())
    await loginAsOwner(page)

    // 🔴 POR API (deuda 131). Los extras van por NOMBRE porque los crearon los
    //    casos —crearlos es el sujeto de este archivo— y el andamio no tiene sus
    //    ids; lo que sembró el setup va por id.
    await desactivarPorNombre('extras', [EXTRA_SIMPLE, EXTRA_LINKED])
    await desactivar('products', [ID_PROD])
    await desactivar('categories', [ID_CAT])
  })
})
