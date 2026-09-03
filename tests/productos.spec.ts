import { test, expect } from '@playwright/test'
import { loginAsOwner } from './helpers/auth'

// Sufijo único por corrida → datos idempotentes y aislados.
const SUFFIX = Date.now().toString().slice(-6)
const CAT = `E2E Cat ${SUFFIX}`
const PROD = `E2E Prod ${SUFFIX}`

// Serie: cada test construye sobre el anterior (categoría → producto → ...).
// El último limpia. workers:1 garantiza el orden.
test.describe.serial('Productos', () => {
  test('crear una categoría aparece en los tabs', async ({ page }) => {
    await loginAsOwner(page)
    await page.goto('/productos')

    await page.getByRole('button', { name: 'Nueva categoría' }).click()
    await page.getByPlaceholder('Ej: Cocteles clásicos').fill(CAT)
    await page.getByRole('button', { name: 'Crear categoría' }).click()

    await expect(page.getByRole('button', { name: new RegExp(CAT) })).toBeVisible()
  })

  test('crear un producto en esa categoría aparece en el grid', async ({ page }) => {
    await loginAsOwner(page)
    await page.goto('/productos')

    await page.getByRole('button', { name: 'Nuevo producto' }).click()
    await page.getByPlaceholder('Ej: Mojito Cubano').fill(PROD)
    await page.getByPlaceholder('0').fill('12000')
    await page.getByTestId('product-category-select').selectOption({ label: CAT })
    await page.getByRole('button', { name: 'Crear producto' }).click()

    await expect(page.getByText(PROD)).toBeVisible()
  })

  test('editar el precio del producto se refleja', async ({ page }) => {
    await loginAsOwner(page)
    await page.goto('/productos')
    await page.getByPlaceholder('Buscar producto...').fill(PROD)

    // Botón editar (título "Editar") de la FILA del producto.
    await page.getByTitle('Editar', { exact: true }).first().click()
    const price = page.getByPlaceholder('0')
    await price.fill('')
    await price.fill('15000')
    await page.getByRole('button', { name: 'Guardar cambios' }).click()

    // 🔴 SIN el símbolo de peso: §7.9 y §4 MoneyCell — «sin símbolo de peso en
    //    columnas de tabla; el encabezado ya dice qué es». La tarjeta lo ponía
    //    porque una tarjeta no tiene encabezado de columna.
    await expect(
      page.getByTestId('catalogo-row').filter({ hasText: PROD }).getByTestId('catalogo-precio'),
    ).toHaveText('15.000')
  })

  test('🔴 el catálogo son FILAS, no tarjetas (§7.3)', async ({ page }) => {
    // §7.3, literal: «Filas, no tarjetas. Un catálogo de cuatro mil referencias
    // en tarjetas redondeadas es ilegible y lento. La tarjeta se reserva para
    // KPI, ficha y formularios».
    //
    // ⚠️ Con los pocos productos del lab las tarjetas se ven bien, y ése es
    //    justamente el argumento: cuando el catálogo crezca, nadie va a asociar
    //    la lentitud con esta decisión. Por eso el criterio no es "se ve mal
    //    ahora" sino la regla.
    await loginAsOwner(page)
    await page.goto('/productos')

    await expect(
      page.getByTestId('catalogo-row').first(),
      'el catálogo se lista en filas',
    ).toBeVisible({ timeout: 15_000 })
    // 🔴 EL DISCRIMINADOR ES EL ENCABEZADO DE COLUMNAS, no la ausencia de un
    //    testid muerto. Una aserción `toHaveCount(0)` sobre un testid que ya no
    //    existe en el código **no puede fallar nunca**: sería una tautología.
    //    Una rejilla de tarjetas no tiene encabezado; una tabla sí — y es
    //    justamente lo que permite que el precio vaya sin "$".
    const enc = page.getByTestId('catalogo-encabezado')
    await expect(enc).toContainText('Producto')
    await expect(enc).toContainText('Precio')
    await expect(enc).toContainText('Existencia')
  })

  test('🔴 los (d) del catálogo SOBREVIVEN a la fila', async ({ page }) => {
    // La maqueta no dibuja ni imagen de producto ni existencia en el Catálogo.
    // Son (d) NO DIBUJADO: el producto los tiene y nadie decidió quitarlos, así
    // que la migración a filas NO puede hacerlos desaparecer — eso sería la
    // maqueta borrando funcionalidad probada.
    await loginAsOwner(page)
    await page.goto('/productos')
    const fila = page.getByTestId('catalogo-row').first()
    await expect(fila, 'hay al menos una fila').toBeVisible({ timeout: 15_000 })
    await expect(
      page.getByTestId('stock-badge').first(),
      'la existencia se sigue viendo en el catálogo',
    ).toBeVisible()
  })

  test('la búsqueda filtra productos por nombre', async ({ page }) => {
    await loginAsOwner(page)
    await page.goto('/productos')

    await page.getByPlaceholder('Buscar producto...').fill(PROD)
    await expect(page.getByText(PROD)).toBeVisible()

    await page.getByPlaceholder('Buscar producto...').fill('zzz-no-existe-zzz')
    await expect(page.getByText(/Sin resultados/)).toBeVisible()
  })

  test('desactivar producto pide confirmación', async ({ page }) => {
    await loginAsOwner(page)
    await page.goto('/productos')
    await page.getByPlaceholder('Buscar producto...').fill(PROD)

    await page.getByTitle('Desactivar', { exact: true }).first().click()
    // Confirmación inline.
    await expect(page.getByRole('button', { name: 'Sí, desactivar' })).toBeVisible()
    await page.getByRole('button', { name: 'Sí, desactivar' }).click()

    // ProductsPage oculta los inactivos → con el filtro por nombre queda vacío.
    await expect(page.getByText(/Sin resultados/)).toBeVisible()
  })

  test('limpieza: desactivar la categoría creada', async ({ page }) => {
    await loginAsOwner(page)
    await page.goto('/productos')

    // Abrir el editor de la categoría (lápiz dentro del tab).
    await page.getByRole('button', { name: new RegExp(CAT) }).getByTitle('Editar categoría').click()
    // Toggle "Categoría activa" → desactivar y guardar.
    await page.getByRole('switch').click()
    await page.getByRole('button', { name: 'Guardar cambios' }).click()

    await expect(page.getByRole('button', { name: new RegExp(CAT) })).toHaveCount(0)
  })
})
