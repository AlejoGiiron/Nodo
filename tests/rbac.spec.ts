import { test, expect } from '@playwright/test'
import { loginAsOwner, loginAsCashier } from './helpers/auth'

// Items del sidebar (AppLayout NAV_GROUPS), los 10 reales de NODO.
// ⚠️ REESCRITO el 2026-09-01: la lista anterior era el nav de VENTO — tenía
//    Mesas, Delivery y Cocina (podados) y le faltaban Turnos y Gastos. Mismo
//    tratamiento que historiales.spec: el sujeto del gating es el catálogo
//    propio de 21 claves, no el heredado.
// Los grupos arrancan expandidos por defecto → los links son visibles sin abrir nada.
const ALL_NAV = [
  'Ventas',
  'Productos', 'Inventario', 'Compras',
  'Fiado', 'Historial', 'Turnos', 'Gastos',
  'Reportes', 'Configuración',
]
// El cajero tiene 8 de 21: pos.*, caja.*, fiado.gestionar, ventas.historial.
const CASHIER_HIDDEN = ['Productos', 'Inventario', 'Compras', 'Reportes', 'Configuración']
const CASHIER_VISIBLE = ['Ventas', 'Fiado', 'Historial', 'Turnos', 'Gastos']

test.describe('RBAC — gating de permisos', () => {
  test('owner ve todos los items del sidebar', async ({ page }) => {
    await loginAsOwner(page)
    for (const label of ALL_NAV) {
      await expect(page.getByRole('link', { name: label })).toBeVisible()
    }
  })

  test('owner ve los 4 grupos del sidebar', async ({ page }) => {
    await loginAsOwner(page)
    for (const id of ['operacion', 'catalogo', 'clientes', 'admin']) {
      await expect(page.getByTestId(`group-header-${id}`)).toBeVisible()
    }
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
    // Sin productos.editar ni compras.gestionar → "Catálogo e inventario" no aparece.
    await expect(page.getByTestId('group-header-catalogo')).toHaveCount(0)
    // Sin reportes.financiero ni config.acceder → "Análisis y admin" no aparece.
    await expect(page.getByTestId('group-header-admin')).toHaveCount(0)
    // Con fiado.gestionar → "Clientes y cobros" SÍ aparece, con al menos Fiado dentro.
    await expect(page.getByTestId('group-header-clientes')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Fiado' })).toBeVisible()
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
