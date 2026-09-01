import { test, expect } from '@playwright/test'
import { loginAsOwner } from './helpers/auth'

const SUFFIX = Date.now().toString().slice(-6)
const ROLE = `Rol E2E ${SUFFIX}`

// Secciones visibles para owner.
// ⚠️ Salieron 'Cocina', 'Delivery' y 'Notificaciones' con la poda (2026-09-01):
//    los dos primeros son modulos de bar; el tercero quedo VACIO al irse sus dos
//    unicos toggles (aviso de delivery y de cocina), asi que se borro entero.
const SECTIONS = [
  'Sede', 'Usuarios', 'Sedes', 'Roles y permisos', 'Extras', 'Caja',
]

test.describe('Configuración', () => {
  test('cada sección carga sin error', async ({ page }) => {
    await loginAsOwner(page)
    await page.goto('/configuracion')

    for (const label of SECTIONS) {
      // `exact` NO es opcional: sin el, 'Sede' matchea tambien 'Sedes' y
      // Playwright aborta por strict mode. Un locator por nombre donde un nombre
      // es PREFIJO de otro necesita exact, y aca los dos existen a proposito.
      await page.getByRole('button', { name: label, exact: true }).click()
      // El SectionTitle (h2) de la sección debe renderizar (exact: evita h3 anidados).
      await expect(page.getByRole('heading', { name: label, exact: true })).toBeVisible()
    }
  })

  test('Sedes y Roles son visibles para owner', async ({ page }) => {
    await loginAsOwner(page)
    await page.goto('/configuracion')
    await expect(page.getByRole('button', { name: 'Sedes' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Roles y permisos' })).toBeVisible()
  })

  test('editar el nombre del sede se guarda (toast)', async ({ page }) => {
    await loginAsOwner(page)
    await page.goto('/configuracion')

    const nameInput = page.getByTestId('config-sede-name')
    const original = await nameInput.inputValue()

    // Cambia a un valor temporal y guarda.
    await nameInput.fill(`${original} ·`)
    await page.getByRole('button', { name: 'Guardar' }).click()
    await expect(page.getByText('Cambios guardados').first()).toBeVisible()

    // Restaura el valor original (no dejar datos sucios).
    await nameInput.fill(original)
    await page.getByRole('button', { name: 'Guardar' }).click()
    await expect(page.getByText('Cambios guardados').first()).toBeVisible()
  })

  test.describe.serial('Roles custom', () => {
    test('crear un rol custom aparece en la lista', async ({ page }) => {
      await loginAsOwner(page)
      await page.goto('/configuracion')
      await page.getByRole('button', { name: 'Roles y permisos' }).click()

      // Botón de sección (abre el modal).
      await page.getByRole('button', { name: 'Crear rol' }).click()
      await page.getByPlaceholder('Ej: Supervisor').fill(ROLE)
      await page.getByRole('checkbox').first().check() // al menos un permiso
      // Botón submit del modal (último "Crear rol" del DOM).
      await page.getByRole('button', { name: 'Crear rol' }).last().click()

      await expect(page.getByText(ROLE)).toBeVisible()
    })

    test('limpieza: eliminar el rol creado', async ({ page }) => {
      page.on('dialog', (dialog) => dialog.accept())
      await loginAsOwner(page)
      await page.goto('/configuracion')
      await page.getByRole('button', { name: 'Roles y permisos' }).click()

      const row = page.locator('div').filter({ hasText: ROLE }).filter({ has: page.locator('button') }).last()
      await row.getByTitle('Eliminar').click()
      await expect(page.getByText(ROLE)).toHaveCount(0)
    })
  })
})
