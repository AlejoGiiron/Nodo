import { test, expect } from '@playwright/test'
import { loginAsOwner } from './helpers/auth'
import { openShiftIfClosed, closeShiftIfOpen } from './helpers/shift'

// ============================================================================
// UN GASTO SE REGISTRA DESDE GASTOS — A6 · tanda 3 (§7.8)
//
// 🔴 NO ES RE-SKIN: la pantalla no podía hacer lo que nombra. §7.8 pide que
//    Gastos tenga «lienzo más frío, **formulario lateral** y franja de período»,
//    y la pantalla sólo LISTABA. El único camino de alta era el modal de
//    movimientos del **banner de turno**, que vive en Mostrador — o sea que
//    para registrar un gasto había que ir a la pantalla de vender.
//
// ⚠️ Y REGISTRAR UN GASTO EXIGE JORNADA ABIERTA, y no por gusto:
//    `cash_movements.jornada_id` es `not null`, así que sin jornada no hay
//    dónde colgar el movimiento. El formulario **no se ofrece** en ese caso y
//    dice por qué — no se ofrece y falla.
// ============================================================================

test.describe.configure({ mode: 'serial' })

const SUFFIX = Date.now().toString().slice(-6)

test('🔴 sin jornada abierta el formulario NO se ofrece, y la pantalla dice por qué', async ({ page }) => {
  await loginAsOwner(page)
  await page.goto('/ventas')
  await closeShiftIfOpen(page)

  await page.goto('/historial-gastos')
  await expect(
    page.getByTestId('gasto-form'),
    'sin jornada no hay dónde colgar el movimiento: el formulario no se ofrece',
  ).toHaveCount(0)
  await expect(
    page.getByTestId('gasto-sin-jornada'),
    'y se dice por qué, en vez de dejar un formulario que va a fallar',
  ).toBeVisible({ timeout: 15_000 })
})

test('🔴 con jornada abierta, el gasto se registra DESDE Gastos y aparece en la lista', async ({ page }) => {
  await loginAsOwner(page)
  await page.goto('/ventas')
  await openShiftIfClosed(page, 0)

  await page.goto('/historial-gastos')
  const form = page.getByTestId('gasto-form')
  await expect(
    form,
    'GASTOS NO PUEDE REGISTRAR UN GASTO (§7.8): la pantalla sólo lista, y el ' +
    'único camino de alta vive en el banner de turno, en Mostrador',
  ).toBeVisible({ timeout: 15_000 })

  const MOTIVO = `E2E desde gastos ${SUFFIX}`
  await page.getByTestId('gasto-monto').fill('37000')
  await page.getByTestId('gasto-descripcion').fill(MOTIVO)
  await page.getByTestId('gasto-pagado-a').fill('Proveedor E2E')
  // La subcategoría sale de la lista de la sede (deuda 45), igual que en el modal.
  await page.getByTestId('gasto-subcategoria').selectOption({ index: 1 })
  await page.getByTestId('gasto-guardar').click()

  // Aparece en la lista SIN recargar: es la misma pantalla.
  await expect(
    page.getByTestId('expense-row').filter({ hasText: MOTIVO }),
    'el gasto recién registrado tiene que aparecer en la lista de al lado',
  ).toHaveCount(1, { timeout: 15_000 })

  // Y con lo que se escribió, no con un default.
  const fila = page.getByTestId('expense-row').filter({ hasText: MOTIVO })
  await expect(fila.getByTestId('expense-pagado-a')).toContainText('Proveedor E2E')
  await expect(fila.getByTestId('expense-amount')).toContainText('37.000')
})

test('🔴 el formulario limpia después de guardar: el próximo gasto no hereda el anterior', async ({ page }) => {
  // Un formulario que conserva el monto anterior es la forma más barata de
  // registrar dos veces lo mismo sin notarlo.
  await loginAsOwner(page)
  await page.goto('/ventas')
  await openShiftIfClosed(page, 0)
  await page.goto('/historial-gastos')

  await page.getByTestId('gasto-monto').fill('12000')
  await page.getByTestId('gasto-descripcion').fill(`E2E limpieza ${SUFFIX}`)
  await page.getByTestId('gasto-guardar').click()

  await expect(page.getByTestId('expense-row').filter({ hasText: `E2E limpieza ${SUFFIX}` }))
    .toHaveCount(1, { timeout: 15_000 })
  await expect(page.getByTestId('gasto-monto'), 'el monto se limpia').toHaveValue('')
  await expect(page.getByTestId('gasto-descripcion'), 'y la descripción también').toHaveValue('')
})
