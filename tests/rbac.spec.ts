import { test, expect } from '@playwright/test'
import { loginAsOwner, loginAsCashier } from './helpers/auth'

// Ítems del sidebar según §5 de la skill (AppLayout NAV_GROUPS).
//
// 🔴 REESCRITO el 2026-09-03 (A6 · tanda 1) CONTRA §5, y esta vez el spec no
//    describe lo que hay: describe lo que la skill manda. La versión anterior
//    aseveraba `Ventas · Productos · Fiado`, que son los rótulos de VENTO —
//    **un test que asierta lo que hay protege lo que hay**, y por eso las tres
//    etiquetas equivocadas sobrevivieron un re-skin entero con la suite verde.
//
// §5 pide `Pedidos` en Movimientos y `Utilidades` en Resultados; ninguna de las
// dos existe (deudas 85 y 86) y §5 también dice que **no se dejan huecos de
// navegación para pantallas que no existen**: por eso no están en esta lista.
const ALL_NAV = [
  'Mostrador',
  'Compras', 'Gastos', 'Historial',
  'Catálogo', 'Inventario',
  'Clientes', 'Cartera',
  'Turnos', 'Reportes',
  'Configuración',
]
// El cajero tiene 8 de 21: pos.*, caja.*, fiado.gestionar, ventas.historial.
const CASHIER_HIDDEN = ['Catálogo', 'Inventario', 'Compras', 'Reportes', 'Configuración']
const CASHIER_VISIBLE = ['Mostrador', 'Gastos', 'Historial', 'Clientes', 'Cartera', 'Turnos']

// 🔴 ESTE SPEC MIDE LA UI, NO LA BASE — dicho en el nombre desde el 2026-09-02
//    (deuda 66). El mutante M6 de A4 lo dejó 7/7 VERDE con `has_permission`
//    devolviendo `true` para todo: lo que prueba es `can()` sobre el rol ya
//    cargado en el cliente, o sea qué ítems y rutas se muestran. Quien lea
//    "RBAC" y suponga que acá se prueba el enforcement del servidor, se equivoca.
//    La BASE la prueba `tests/rls-negacion.spec.ts` (la sonda de A2) y el
//    trigger de auto-edición, `tests/rbac-escalada.spec.ts`.
test.describe('RBAC — gating de UI por permiso', () => {
  test('owner ve todos los items del sidebar', async ({ page }) => {
    await loginAsOwner(page)
    for (const label of ALL_NAV) {
      await expect(page.getByRole('link', { name: label })).toBeVisible()
    }
  })

  test('owner ve los grupos de §5, y Mostrador NO está en ninguno', async ({ page }) => {
    await loginAsOwner(page)
    for (const id of ['movimientos', 'existencias', 'cartera', 'resultados']) {
      await expect(page.getByTestId(`group-header-${id}`)).toBeVisible()
    }
    // §5: «Mostrador va suelto arriba, sin título de grupo: es la pantalla del
    // día y no pertenece a una categoría».
    await expect(
      page.getByTestId('nav-mostrador-suelto'),
      'Mostrador va suelto arriba, fuera de todo grupo (§5)',
    ).toBeVisible()
  })

  test('los títulos de grupo van en caja de oración, no en mayúscula sostenida', async ({ page }) => {
    // §5 Reglas: «la mayúscula sostenida se reserva a etiquetas de columna y de
    // KPI». Se mide el texto RENDERIZADO, no el CSS: `text-transform` es
    // exactamente lo que hacía que el DOM dijera "Movimientos" y la pantalla
    // mostrara "MOVIMIENTOS".
    await loginAsOwner(page)
    const h = page.getByTestId('group-header-movimientos')
    const visible = await h.evaluate((el) => (el as HTMLElement).innerText)
    expect(visible, 'el título se ve tal como se escribió').toContain('Movimientos')
    expect(visible, 'no en mayúscula sostenida').not.toContain('MOVIMIENTOS')
  })

  test('cajero NO ve Productos, Inventario, Compras, Reportes ni Configuración', async ({ page }) => {
    await loginAsCashier(page)
    // CONTRASTE primero: lo que SÍ debe ver (sin esto, un nav roto entero
    // pasaría el test de ausencias — R10).
    for (const label of CASHIER_VISIBLE) {
      await expect(page.getByRole('link', { name: label })).toBeVisible()
    }
    // Ítems ocultos por permiso
    for (const label of CASHIER_HIDDEN) {
      await expect(page.getByRole('link', { name: label })).toHaveCount(0)
    }
  })

  test('cajero: grupos completos sin permiso desaparecen; los que tienen ≥1 item se ven', async ({ page }) => {
    await loginAsCashier(page)
    // Sin productos.editar ni inventario.ver → "Existencias" no aparece.
    await expect(page.getByTestId('group-header-existencias')).toHaveCount(0)
    // Con fiado.gestionar → "Cartera" SÍ aparece, con sus dos entradas.
    await expect(page.getByTestId('group-header-cartera')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Cartera' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Clientes' })).toBeVisible()
    // Con caja.cerrar → "Resultados" aparece por Turnos, aunque no vea Reportes.
    await expect(page.getByTestId('group-header-resultados')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Reportes' })).toHaveCount(0)
  })

  test('cajero SÍ ve Turnos y Gastos (caja.cerrar / caja.movimientos)', async ({ page }) => {
    // Era 'cajero SÍ ve Ventas, Mesas y Delivery' — dos de los tres se podaron y
    // delivery.gestionar ya no existe en el catálogo. Lo que distingue al cajero
    // HOY es que sus permisos de caja le muestran los historiales de caja.
    await loginAsCashier(page)
    await expect(page.getByRole('link', { name: 'Turnos' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Gastos' })).toBeVisible()
  })

  test('cajero que navega a /configuracion por URL es redirigido a /ventas', async ({ page }) => {
    await loginAsCashier(page)
    await page.goto('/configuracion')
    await expect(page).toHaveURL(/\/ventas/, { timeout: 15_000 })
  })

  test('owner que entra a /configuracion ve la página', async ({ page }) => {
    await loginAsOwner(page)
    await page.goto('/configuracion')
    await expect(page).toHaveURL(/\/configuracion/)
    await expect(page.getByText('Ajustes', { exact: true })).toBeVisible()
  })
})
