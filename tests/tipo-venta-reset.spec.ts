import { test, expect, type Page } from '@playwright/test'
import { loginAsOwner } from './helpers/auth'
import { waitPosReady } from './helpers/pos'
import { openShiftIfClosed } from './helpers/shift'

// El CANAL del POS debe volver al default ("Mostrador") tras CUALQUIER venta.
// Antes quedaba pegado: `canal` es estado local de POSPage y `clear()` (del
// cartStore) no lo tocaba → la siguiente venta de mostrador se grababa con el
// canal anterior y ensuciaba el desglose por canal del reporte Financiero.
//
// ⚠️ ESTE SPEC NO SE BORRO CON LA PODA DE MESAS, y la distincion es la del
//    corolario nuevo: no dependia de mesas ni de los valores de bar, dependia de
//    que EXISTA un selector de canal en el POS. El canal sobrevivio (mostrador /
//    whatsapp / telefono), asi que el invariante sobrevive con el.

const PRODUCT = 'Lab Coctel'
const PRICE = 18000

async function addProductPOS(page: Page) {
  await page.getByTestId('product-card').filter({ hasText: PRODUCT }).first().click()
  await expect(page.getByTestId('item-config-modal')).toBeVisible()
  await page.getByTestId('item-config-confirm').click()
}

// El selector cicla entre los TRES canales. El limite del bucle es
// CANALES + 1: con exactamente CANALES clicks se vuelve al punto de partida, asi
// que un limite igual al numero de canales no distingue "no esta" de "no llegue".
const CANALES = 3
async function setCanal(page: Page, label: 'Mostrador' | 'WhatsApp' | 'Teléfono') {
  for (let i = 0; i <= CANALES; i++) {
    if ((await page.getByTestId('canal-label').textContent()) === label) return
    await page.getByTestId('canal-toggle').click()
  }
  throw new Error(`No se pudo seleccionar el canal "${label}"`)
}

test.describe.serial('Reset del canal de venta', () => {
  test('tras cobrar una venta por WHATSAPP vuelve al canal por defecto', async ({ page }) => {
    await loginAsOwner(page)
    await page.goto('/ventas')
    await waitPosReady(page)
    await openShiftIfClosed(page, 50000)

    await setCanal(page, 'WhatsApp')
    await expect(page.getByTestId('canal-label')).toHaveText('WhatsApp')

    await addProductPOS(page)
      await page.getByTestId('cobro-medio-efectivo').click()
    // (el paso «Continuar» del modal no existe: el monto se teclea en la columna)
    await page.getByTestId('cobro-recibe').fill(String(PRICE))
    await page.getByTestId('cobro-confirmar').click()
    await expect(page.getByText(/Venta #\d+ registrada/)).toBeVisible({ timeout: 15_000 })
    await page.getByRole('button', { name: 'Nueva venta' }).click()

    // EL ASSERT DEL BUG: el canal volvió solo, sin recargar la página.
    await expect(page.getByTestId('canal-label')).toHaveText('Mostrador')
  })

  test('tras cobrar una venta de MOSTRADOR el canal sigue siendo el default', async ({ page }) => {
    // Contraste: el reset es incondicional, así que una venta que ya era del canal
    // por defecto tiene que terminar igual. Sin este caso, un reset que rompiera
    // el canal en otras condiciones pasaría desapercibido.
    await loginAsOwner(page)
    await page.goto('/ventas')
    await waitPosReady(page)
    await openShiftIfClosed(page, 50000)

    await setCanal(page, 'Mostrador')
    await addProductPOS(page)
      await page.getByTestId('cobro-medio-efectivo').click()
    // (el paso «Continuar» del modal no existe: el monto se teclea en la columna)
    await page.getByTestId('cobro-recibe').fill(String(PRICE))
    await page.getByTestId('cobro-confirmar').click()
    await expect(page.getByText(/Venta #\d+ registrada/)).toBeVisible({ timeout: 15_000 })
    await page.getByRole('button', { name: 'Nueva venta' }).click()

    await expect(page.getByTestId('canal-label')).toHaveText('Mostrador')
  })
})
