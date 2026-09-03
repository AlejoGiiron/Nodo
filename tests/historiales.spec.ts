import { test, expect } from '@playwright/test'
import { loginAsOwner, loginAsCashier } from './helpers/auth'
import { openShiftIfClosed, closeShiftIfOpen } from './helpers/shift'

// Historial de turnos (cuadre persistido de F1) + historial de gastos (egresos).
// Selectores por TEXTO/testid, montos distintivos por corrida (no .first() ciego).

// Montos distintivos por corrida para localizar la fila sin ambigüedad.
const SUFFIX = Date.now().toString().slice(-6)
const OPENING = 130000 + (Date.now() % 9000)   // apertura única
const EGRESO = 12000 + (Date.now() % 3000)      // egreso único
const EXPECTED = OPENING - EGRESO               // sin ventas ni ingresos
const DECLARED = EXPECTED - 5000                // diferencia fija: −5000 → faltante
const REASON = `E2E gasto ${SUFFIX}`            // motivo custom distintivo

// Formato de miles es-CO ("134.567") — substring presente en la celda COP,
// evita el símbolo/espacio de la moneda.
const cop = (n: number) => new Intl.NumberFormat('es-CO').format(n)

// Registra un egreso conocido en el turno abierto. Usa "Otro" + motivo custom:
// SIEMPRE disponible (no depende de config.cash_out_reasons, que puede estar
// vacío) y así el motivo es distintivo y localizable.
async function registrarEgreso(page: import('@playwright/test').Page) {
  await page.getByTestId('open-movements').click()
  await expect(page.getByText('Movimientos manuales', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Egreso', exact: true }).click()
  // Ver la nota de arqueo.spec: categoria + detalle, no motivo libre.
  await page.getByTestId('movement-categoria').selectOption('otro')
  await page.getByTestId('movement-detalle').fill(REASON)
  await page.getByTestId('movement-amount').fill(String(EGRESO))
  await page.getByTestId('movement-submit').click()
  await expect(page.getByText(REASON)).toBeVisible()
  await page.getByTestId('movements-close').click()
}

test.describe.serial('Historiales de turnos y gastos', () => {
  test('turno cerrado aparece en el historial con su cuadre (diferencia faltante)', async ({ page }) => {
    await loginAsOwner(page)
    await page.goto('/ventas')

    // Estado limpio → abrir con apertura conocida → egreso conocido → cerrar
    // declarando por debajo del esperado (diferencia = −5000 faltante).
    await closeShiftIfOpen(page)
    await openShiftIfClosed(page, OPENING)
    await registrarEgreso(page)

    await page.getByRole('button', { name: 'Cerrar turno', exact: true }).click()
    await expect(page.getByText('Cerrar turno de caja')).toBeVisible()
    await page.getByTestId('close-shift-declared').fill(String(DECLARED))
    await page.getByRole('button', { name: 'Confirmar cierre' }).click()
    await expect(page.getByText('Sin turno')).toBeVisible({ timeout: 15_000 })

    // Historial de turnos: la fila del turno recién cerrado (localizada por su
    // apertura única) muestra el cuadre PERSISTIDO.
    await page.goto('/historial-turnos')
    // Se filtra por la CELDA de apertura (`shift-opening`), no por el texto de
    // la fila entera: el textContent de la fila concatena los <span> SIN
    // separador, así que un `hasText` suelto puede matchear a caballo de dos
    // celdas. Misma clase de defecto que la colisión #14/#141 de
    // anular-venta.spec.ts — acá no había estallado porque los montos son
    // aleatorios y no un correlativo que crece.
    const row = page.getByTestId('shift-history-row')
      .filter({ has: page.getByTestId('shift-opening').filter({ hasText: cop(OPENING) }) })
      .first()
    await expect(row).toBeVisible({ timeout: 15_000 })
    await expect(row.getByTestId('shift-declared')).toContainText(cop(DECLARED))
    await expect(row.getByTestId('shift-expected')).toContainText(cop(EXPECTED))
    await expect(row.getByTestId('shift-diff')).toContainText('faltante')
  })

  test('el egreso aparece en el historial de gastos y suma al total', async ({ page }) => {
    await loginAsOwner(page)
    await page.goto('/historial-gastos')

    const row = page.getByTestId('expense-row').filter({ hasText: REASON })
    await expect(row).toBeVisible({ timeout: 15_000 })
    await expect(row.getByTestId('expense-reason')).toHaveText(REASON)
    await expect(row.getByTestId('expense-amount')).toContainText(cop(EGRESO))

    // El total del período está visible y es distinto de cero (incluye el egreso).
    const total = page.getByTestId('expenses-total')
    await expect(total).toBeVisible()
    await expect(total).not.toHaveText(/^\$?\s*0$/)
  })

  test('gating positivo: el cajero ve Turnos y Gastos', async ({ page }) => {
    await loginAsCashier(page)
    await page.goto('/ventas')

    // Nav visible (el cajero tiene caja.cerrar + caja.movimientos).
    await expect(page.getByRole('link', { name: 'Turnos' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Gastos' })).toBeVisible()

    // Las páginas cargan (no redirige por permiso).
    await page.goto('/historial-turnos')
    await expect(page.getByText('Historial de turnos')).toBeVisible()
    await page.goto('/historial-gastos')
    await expect(page.getByText('Historial de gastos')).toBeVisible()
  })

  // 🔴 REESCRITO el 2026-09-01. Era 'el mozo NO ve Turnos ni Gastos', y el rol
  //    `mozo` se fue con el catálogo propio de Nodo (deuda 23).
  //
  //    El sujeto CAMBIA, no solo el nombre: el cajero **SÍ tiene** `caja.cerrar`
  //    y `caja.movimientos`, así que ve Turnos y Gastos. Copiar el test cambiando
  //    el login habría afirmado lo contrario de la verdad y —peor— habría pasado
  //    igual el día que el gating se rompiera, porque estaría probando ausencias
  //    que nadie promete.
  //
  //    El cajero tiene 8 de 21 permisos, así que el gating es MÁS fino que con el
  //    mozo: se verifica lo que realmente NO tiene.
  //
  //    ⚠️ Y ya no hay `test.skip`. El skip anterior dependía de una cuenta
  //    opcional, y **un test saltado se ve igual que uno que pasa en el resumen**
  //    — la clase "indistinguible de", otra vez. Las credenciales del cajero son
  //    obligatorias para otros 8 specs, así que acá no hay nada opcional.
  test('gating negativo: el cajero NO ve Productos, Inventario, Compras, Reportes ni Configuración', async ({ page }) => {
    await loginAsCashier(page)
    await page.goto('/ventas')

    // Lo que el cajero NO tiene → el item de nav no se renderiza.
    for (const item of ['Catálogo', 'Inventario', 'Compras', 'Reportes', 'Configuración']) {
      await expect(page.getByRole('link', { name: item }), `nav "${item}" visible para el cajero`)
        .toHaveCount(0)
    }

    // CONTRASTE — sin esto el test pasaría con el nav entero roto: lo que el
    // cajero SÍ tiene tiene que seguir estando. Un test de ausencia sin su
    // positivo es exactamente lo que R10 manda mirar con lupa.
    for (const item of ['Turnos', 'Gastos', 'Historial']) {
      await expect(page.getByRole('link', { name: item }), `nav "${item}" deberia verse`)
        .toHaveCount(1)
    }

    // Navegar por URL redirige (ProtectedRoute por permiso), que es el gate real:
    // ocultar el nav es cosmético.
    await page.goto('/reportes')
    await expect(page).toHaveURL(/\/ventas/, { timeout: 15_000 })
    await page.goto('/configuracion')
    await expect(page).toHaveURL(/\/ventas/, { timeout: 15_000 })
  })
})
