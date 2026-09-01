import { test, expect } from '@playwright/test'
import { loginAsOwner } from './helpers/auth'
import { closeShiftIfOpen, openShiftIfClosed } from './helpers/shift'

test.describe.serial('Caja', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsOwner(page)
  })

  test('abrir turno con monto inicial muestra turno activo', async ({ page }) => {
    await closeShiftIfOpen(page)
    await openShiftIfClosed(page, 50000)

    await expect(page.getByText(/Turno desde/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Cerrar turno', exact: true })).toBeVisible()
  })

  test('registrar un movimiento de caja (ingreso, texto libre)', async ({ page }) => {
    await openShiftIfClosed(page, 0)

    await page.getByRole('button', { name: 'Movimientos' }).click()
    await expect(page.getByText('Movimientos manuales', { exact: true })).toBeVisible()

    // Ingreso seleccionado por defecto: motivo en texto libre.
    await page.getByTestId('movement-amount').fill('20000')
    // ⚠️ El modal de movimientos se reescribio para mandar `categoria`: el
    //    motivo dejo de ser texto libre y paso a ser CATEGORIA (allowlist) +
    //    DETALLE. `reason` ya no es la fuente de los reportes, es detalle.
    await page.getByTestId('movement-categoria').selectOption('otro')
    await page.getByTestId('movement-detalle').fill('Ingreso de prueba E2E')
    await page.getByTestId('movement-submit').click()

    await expect(page.getByText('Ingreso de prueba E2E')).toBeVisible()
  })

  // ⚠️ BORRADO el 2026-09-01: 'registrar egreso con motivo de la lista
  //    configurable'. Probaba que la CATEGORIA del movimiento saliera de
  //    `sedes.config.cash_out_reasons` — una funcion que se elimino a proposito
  //    al pasar a la allowlist FIJA de `categoria` (in: base|otro;
  //    out: gasto|retiro|otro), decidida en el esquema y no por config de sede.
  //    Un test que prueba algo que ya no existe no es cobertura: es un rojo
  //    permanente esperando, y un rojo permanente esconde a los rojos nuevos.
  //
  //    🔴 `cash_out_reasons` NO murio: cambio de ROL. Ahora son SUGERENCIAS de
  //    DETALLE —el texto libre que acompaña a la categoria— no la categoria en
  //    si. Ver MovementsModal y ConfigPage. Si ese rol merece cobertura, es OTRO
  //    test (que las sugerencias configuradas aparezcan como tales), no este
  //    reescrito: el sujeto cambio, no el selector.

  test('egreso que supera el efectivo disponible advierte sobregiro y permite confirmar', async ({ page }) => {
    // Estado limpio: turno nuevo con apertura 0 → cualquier egreso grande sobregira.
    await closeShiftIfOpen(page)
    await openShiftIfClosed(page, 0)

    await page.getByRole('button', { name: 'Movimientos' }).click()
    await expect(page.getByText('Movimientos manuales', { exact: true })).toBeVisible()

    await page.getByRole('button', { name: 'Egreso', exact: true }).click()
    const select = page.getByTestId('movement-categoria')
    await select.selectOption({ index: 1 })
    const chosen = (await select.locator('option:checked').textContent())?.trim() ?? ''
    await page.getByTestId('movement-amount').fill('5000000')

    // Primer click: NO registra; muestra la advertencia de sobregiro.
    await page.getByTestId('movement-submit').click()
    await expect(page.getByTestId('overdraft-warning')).toBeVisible()
    await expect(page.getByText('Este egreso supera el efectivo disponible')).toBeVisible()
    // La advertencia muestra el MONTO concreto en que queda negativa la caja.
    await expect(page.getByTestId('overdraft-amount')).toContainText('5.000.000')
    await expect(page.getByRole('button', { name: 'Registrar de todos modos' })).toBeVisible()

    // Segundo click: confirma y registra el egreso de todos modos.
    await page.getByTestId('movement-submit').click()
    await expect(page.getByTestId('overdraft-warning')).toBeHidden()
    // Acotado a la LISTA (movement-item): el motivo también existe como <option>
    // oculto del select, que getByText(chosen).first() resolvía por error.
    await expect(page.getByTestId('movement-item').filter({ hasText: chosen })).toBeVisible()
  })

  test('cerrar turno muestra esperado y diferencia', async ({ page }) => {
    // Estado limpio para que el esperado sea determinista (apertura 50k, sin ventas/movs).
    await closeShiftIfOpen(page)
    await openShiftIfClosed(page, 50000)
    await page.waitForLoadState('networkidle').catch(() => {})

    const closeBtn = page.getByRole('button', { name: 'Cerrar turno', exact: true })
    await expect(closeBtn).toBeVisible()
    await closeBtn.click()
    await expect(page.getByText('Cerrar turno de caja')).toBeVisible()
    await expect(page.getByText('Efectivo esperado', { exact: true })).toBeVisible()

    // Declarar de más → sobrante con diferencia positiva.
    await page.getByTestId('close-shift-declared').fill('60000')
    await expect(page.getByText('Sobrante', { exact: true })).toBeVisible()
    // Acotado al monto de diferencia del bloque F1 (efectivo): el total del arqueo
    // muestra el MISMO +10.000 cuando solo el efectivo difiere (sin testid = 2 matches, strict mode).
    await expect(page.getByTestId('shift-cash-difference')).toContainText('10.000')

    // Declarar de menos → faltante.
    await page.getByTestId('close-shift-declared').fill('40000')
    await expect(page.getByText('Faltante', { exact: true })).toBeVisible()

    // Cuadre exacto.
    await page.getByTestId('close-shift-declared').fill('50000')
    await expect(page.getByText('Cuadre exacto', { exact: true })).toBeVisible()

    await page.getByRole('button', { name: 'Confirmar cierre' }).click()
    await expect(page.getByText('Sin turno')).toBeVisible()
  })

  test('idempotente: cerrar turno si quedó abierto', async ({ page }) => {
    await closeShiftIfOpen(page)
    await expect(page.getByText('Sin turno')).toBeVisible()
  })
})
