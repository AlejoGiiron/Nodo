import { test, expect } from '@playwright/test'
import { loginAsOwner } from './helpers/auth'

test.describe('Reportes', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsOwner(page)
    await page.goto('/reportes')
  })

  test('las pestañas Financiero y Stock cargan', async ({ page }) => {
    await expect(page.getByTestId('report-tab-financiero')).toBeVisible()
    await expect(page.getByTestId('report-tab-stock')).toBeVisible()
    // Financiero por defecto: KPIs financieros.
    await expect(page.getByTestId('kpi-vendido')).toBeVisible()
  })

  test('cambiar entre tabs funciona', async ({ page }) => {
    await expect(page.getByTestId('kpi-vendido')).toBeVisible() // financiero por defecto

    await page.getByTestId('report-tab-stock').click()
    await expect(page.getByText('Productos vendidos', { exact: true })).toBeVisible() // KPI de stock
    await expect(page.getByTestId('export-stock')).toBeVisible()

    await page.getByTestId('report-tab-financiero').click()
    await expect(page.getByTestId('kpi-vendido')).toBeVisible()
    await expect(page.getByTestId('export-financiero')).toBeVisible()
  })

  test('el selector de fechas es compartido y afecta ambos tabs', async ({ page }) => {
    await page.getByRole('button', { name: 'Hoy' }).click()
    await expect(page.getByTestId('kpi-vendido')).toBeVisible() // financiero responde

    await page.getByTestId('report-tab-stock').click()
    await expect(page.getByText('Unidades vendidas', { exact: true })).toBeVisible() // stock usa el mismo rango
  })

  test('cada métrica dice QUÉ mide: vendido y cobrado son distintos y ambos están', async ({ page }) => {
    // 🔴 DEUDA 53. Antes había UN rótulo —"Ventas totales"— para tres números
    //    distintos: vendido (`sum orders.total`), cobrado (`sum payments.amount`)
    //    y venta bruta (`sum qty × precio`). Medido en el lab, mismo período:
    //    9.647.600 · 6.100.600 · 9.838.000. Y las "órdenes" eran solo las que
    //    tenían pago (431 de 691).
    //
    //    Lo que este caso fija: los cuatro KPI existen, y cada uno lleva SU
    //    definición al lado. Si alguien vuelve a fusionarlos, se pone rojo.
    for (const [testid, etiqueta, nota] of [
      ['kpi-vendido', 'Vendido', 'facturado, con descuento'],
      ['kpi-cobrado', 'Cobrado', 'pagos recibidos'],
      ['kpi-ordenes', 'Órdenes', 'ventas no anuladas'],
      ['kpi-ticket',  'Ticket promedio', 'vendido / órdenes'],
    ] as const) {
      const card = page.getByTestId(testid)
      await expect(card, `falta el KPI ${etiqueta}`).toBeVisible()
      await expect(card, `${etiqueta} tiene que decir qué mide`).toContainText(nota)
    }

    // Y ningún rótulo dice "ventas" a secas, que es lo que escondía los tres.
    await expect(page.getByText('Ventas totales')).toHaveCount(0)

    // El ticket promedio sale de la misma población que las órdenes: si el KPI
    // de vendido y el de órdenes están, el cociente es verificable a ojo — acá
    // se asevera que el número no es el de cobrado/órdenes-con-pago, que era el
    // cociente entre poblaciones distintas. El valor exacto lo cubre el unitario
    // del export; esto sólo fija que las dos cifras no son la misma.
    const vendidoTxt = await page.getByTestId('kpi-vendido-value').innerText()
    const cobradoTxt = await page.getByTestId('kpi-cobrado-value').innerText()
    expect(vendidoTxt, 'vendido y cobrado no pueden ser el mismo número en un lab con fiados').not.toBe(cobradoTxt)
  })

  test('cada tab tiene su botón de exportar', async ({ page }) => {
    await expect(page.getByTestId('export-financiero')).toBeVisible()

    await page.getByTestId('report-tab-stock').click()
    await expect(page.getByTestId('export-stock')).toBeVisible()
  })

  // 🔴 REESCRITO EN A6 · tanda 1. Este spec apuntaba a `sidebar-brand-name`, un
  //    testid que dejo de existir cuando el bloque de identidad paso a ser DOS
  //    lineas: la ORGANIZACION arriba y la SEDE debajo (§1.1 — `--brand` la
  //    define el tenant, y hasta ahora el tile del cliente se pintaba sobre el
  //    nombre de la sede, que no es su identidad).
  //    La ASERCION sobrevivio al cambio de modelo —el sidebar sigue teniendo que
  //    nombrar la sede— asi que no se borra: se re-deriva de la pantalla nueva.
  //    Y asevera de mas que antes: el ORDEN, que es la decision que se tomo.
  test('el sidebar nombra la organizacion arriba y la sede debajo', async ({ page }) => {
    const org = page.getByTestId('sidebar-org-name')
    const sede = page.getByTestId('sidebar-sede-name')
    await expect(org, 'la organizacion es el tenant: va en el bloque de identidad').toBeVisible()
    await expect(sede, 'y la sede no se pierde: el producto es multi-sede').toBeVisible()
    await expect(org).not.toHaveText('')
    await expect(sede).not.toHaveText('')

    // El orden es la mitad que importa y la unica que puede invertirse sin que
    // nada mas se rompa: con la sede arriba, el tile de marca vuelve a pintarse
    // sobre un dato que no es la identidad del cliente.
    const cajaOrg = await org.boundingBox()
    const cajaSede = await sede.boundingBox()
    expect(cajaOrg!.y, 'la ORGANIZACION va ARRIBA de la sede').toBeLessThan(cajaSede!.y)
  })
})
