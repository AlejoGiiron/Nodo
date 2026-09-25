import { test, expect, type Page } from '@playwright/test'
import { loginAsOwner } from './helpers/auth'
import { waitPosReady, addPosProduct, abrirCobro, cobrarCon } from './helpers/pos'
import { openShiftIfClosed } from './helpers/shift'
import { sacarDeCartera, desactivarClientes } from './helpers/cartera'

// ============================================================================
// EL FILTRO DE MÉTODO DEL HISTORIAL ALCANZA A TODAS LAS VENTAS
//
// 🔴 EL DEFECTO, y no era «falta una opción en un combo»: el filtro usaba
//    `payments!inner`, o sea un INNER JOIN. Una orden SIN filas en `payments`
//    —crédito, cortesía, anulada— **desaparece de la consulta**, no de la
//    pantalla. Así que con CUALQUIER valor del filtro se caían las ventas a
//    crédito: no faltaba una opción, había una clase entera de ventas
//    inalcanzable por todos los valores.
//
// 🔴 Y ERA R1 CON EL ÍNDICE DE UNA LISTA: el combo era una lista LITERAL de los
//    4 valores del enum; la columna la producía `methodDisplay()`, que para una
//    venta sin pagos deriva el rótulo de `payment_status`. Dos fuentes para la
//    misma pregunta, y la clienta veía «Fiado» en una y no lo encontraba en la
//    otra.
//
// ── LO QUE SE MIDIÓ ANTES DE ELEGIR EL ARREGLO (lab, 2.988 ventas) ─────────
//   sin `!inner`, el filtro embebido NO acota al padre  →  2.988 (todas)
//   `.is('payments', null)` SÍ lo expresa               →  1.384
//     anuladas 570 · cortesía 110 · fiado vivo 528 · fiado saldado 176 = 1.384
//
//   Los dos números descartan las dos salidas que parecían obvias: sacar el
//   join deja un no-op silencioso, y una sección por clase serían TRES —el
//   molde de «Anuladas (N)» resolvió UN MIEMBRO de la clase, no la clase—.
//
// ⚠️ ESTE ARCHIVO TIENE DOS MITADES Y LAS DOS HACEN FALTA. Sin la segunda, el
//    arreglo cómodo —sacar el `!inner` y listo— pasaría verde: el filtro
//    devolvería TODO y «las de crédito aparecen» sería cierto por vacío.
// ============================================================================

const CLIENTE = `E2E Credito ${Date.now()}`
// 🔴 Las ventas a credito de este spec SE SACAN DE CARTERA, y va en `afterAll` y
//    no en un caso: un caso es lo primero que se saltea cuando otro falla (deuda
//    129) y `afterAll` corre igual. Desactivar al cliente NO alcanza — Cartera
//    filtra ORDENES, no clientes (deuda 130).
test.afterAll(async () => {
  await sacarDeCartera([CLIENTE])
  await desactivarClientes([CLIENTE])
})

async function crearCliente(page: Page, nombre: string) {
  await page.goto('/fiado')
  await page.getByTestId('fiado-tab-customers').click()
  await page.getByTestId('new-customer-btn').click()
  await page.getByTestId('customer-name').fill(nombre)
  await page.getByTestId('customer-save').click()
  await expect(page.getByTestId('customer-form-modal')).toHaveCount(0)
}

/** Deja una venta A CRÉDITO y una DE CONTADO hechas hoy. Devuelve sus números. */
async function dosVentas(page: Page): Promise<{ credito: number; contado: number }> {
  await page.goto('/ventas')
  await waitPosReady(page)
  await openShiftIfClosed(page, 0)

  // ── la de crédito ──
  await addPosProduct(page)
  await page.getByTestId('cart-customer-search').fill(CLIENTE)
  await page.getByTestId('cart-customer-option').filter({ hasText: CLIENTE }).first().click()
  await abrirCobro(page)
  await page.getByTestId('pay-method-fiado').click()
  // A crédito el primario del paso de método cobra ahí mismo: no hay segundo paso.
  await page.getByTestId('checkout-continue').click()
  const b1 = page.getByText(/Venta #\d+ registrada/)
  await expect(b1).toBeVisible({ timeout: 15_000 })
  const credito = Number((await b1.innerText()).match(/#(\d+)/)![1])

  // ── la de contado, que es el CONTROL del otro lado ──
  await page.goto('/ventas')
  await waitPosReady(page)
  await addPosProduct(page)
  await cobrarCon(page, 'nequi')
  const b2 = page.getByText(/Venta #\d+ registrada/)
  await expect(b2).toBeVisible({ timeout: 15_000 })
  const contado = Number((await b2.innerText()).match(/#(\d+)/)![1])

  return { credito, contado }
}

/**
 * Filtra el Historial por un valor del combo.
 *
 * 🔴 NO DEVUELVE UNA FOTO DE LOS RÓTULOS, y la primera versión sí lo hacía.
 *    `useSalesHistory` usa `keepPreviousData`: mientras el refetch está en
 *    vuelo la lista SIGUE MOSTRANDO las filas del filtro anterior. Leer un
 *    array ahí devuelve el resultado viejo y la aserción acusa al producto de
 *    algo que hizo el test — pasó, y el rojo decía «filtrando por Nequi
 *    aparecen ventas Fiado» sobre un filtro que estaba bien.
 *
 * ✅ Quien espera es una aserción que REINTENTA. Por eso acá sólo se cambia el
 *    valor y el caso asevera con locators, que Playwright vuelve a evaluar
 *    hasta que la lista se estabiliza.
 */
async function filtrarPor(page: Page, valor: string) {
  await page.getByTestId('sales-method').selectOption(valor)
}

test('🔴 el filtro alcanza las ventas a CRÉDITO — y sigue excluyéndolas de un método real', async ({ page }) => {
  await loginAsOwner(page)
  await crearCliente(page, CLIENTE)
  const { credito, contado } = await dosVentas(page)

  await page.goto('/historial')

  // ── ① EL COMBO OFRECE LA CLASE ─────────────────────────────────────────
  // Sin esto el resto no se puede ni intentar: la opción no existía.
  //
  // ⚠️ LA ESPERA NO ES CORTESÍA, ES EL CONTROL POSITIVO DE LA LECTURA. La
  //    primera versión leía las opciones apenas navegaba y devolvía `[]` — un
  //    array vacío hace FALLAR el `toContain` igual que una opción faltante, con
  //    el mismo mensaje, y manda a buscar el defecto donde no está. Un cero de
  //    un selector que no encontró nada es indistinguible de un cero real.
  const combo = page.getByTestId('sales-method')
  await expect(combo, 'el Historial tiene que haber montado su filtro de método').toBeVisible({ timeout: 15_000 })
  const opciones = await combo.locator('option')
    .evaluateAll((els) => els.map((e) => (e as HTMLOptionElement).value))
  expect(
    opciones.length,
    'si el combo no tiene NINGUNA opción, lo roto es la lectura y el resto del caso no significa nada',
  ).toBeGreaterThan(1)
  expect(
    opciones,
    'el combo tiene que ofrecer la clase «fiado»: la columna la MUESTRA desde ' +
    'siempre, y ofrecer menos valores de los que se muestran es el contrato partido',
  ).toContain('fiado')

  // ── ② EL SUJETO: filtrando por crédito, la venta a crédito APARECE ──────
  await filtrarPor(page, 'fiado')
  await expect(
    page.getByTestId('sale-row').filter({ hasText: `#${credito}` }),
    `LA VENTA A CRÉDITO #${credito} NO APARECE CON SU PROPIO FILTRO. El filtro usa ` +
    '`payments!inner` y una venta a crédito no escribe fila en `payments`: el join ' +
    'la elimina de la consulta, no de la pantalla',
  ).toHaveCount(1)

  // Y el cliente se ve en la fila — que es el item 4 medido desde el Historial.
  await expect(
    page.getByTestId('sale-row').filter({ hasText: `#${credito}` }),
    'la fila de una venta a crédito tiene que decir a quién se le vendió',
  ).toContainText(CLIENTE)

  // ── ③ EL CONTROL QUE IMPIDE EL ARREGLO CÓMODO ──────────────────────────
  // 🔴 Sin esto, «sacar el !inner y listo» pasaría verde: medido, sin el join el
  //    filtro embebido NO acota al padre y devuelve las 2.988 — un no-op que se
  //    ve exactamente igual que un filtro que anda.
  await filtrarPor(page, 'nequi')

  // Esta aserción reintenta, así que además de ser el control es lo que espera
  // a que el refetch reemplace las filas del filtro anterior.
  await expect(
    page.getByTestId('sale-row').filter({ hasText: `#${credito}` }),
    `la venta a CRÉDITO #${credito} NO puede aparecer filtrando por Nequi: el ` +
    'filtro por un método real tiene que seguir excluyendo lo que no tiene pago',
  ).toHaveCount(0, { timeout: 15_000 })
  await expect(
    page.getByTestId('sale-row').filter({ hasText: `#${contado}` }),
    `la venta de contado #${contado} sí tiene que estar bajo su método`,
  ).toHaveCount(1)

  // Y el barrido, ya con la lista estabilizada: NINGUNA fila puede ser de una
  // clase sin pago. Sin esto, «sacar el !inner y listo» pasaría verde — medido,
  // sin el join el filtro devuelve las 2.988 y deja de filtrar en silencio.
  const rotulosNequi = await page.getByTestId('sale-row-method').allInnerTexts()
  expect(
    rotulosNequi.filter((r) => /Fiado|Cortesía|Anulada/.test(r)),
    'filtrando por un método REAL no puede aparecer ninguna venta sin pago: si ' +
    'aparecen, el filtro dejó de filtrar y sólo parece que funciona',
  ).toEqual([])
  expect(
    rotulosNequi.length,
    'y el control de la propia lectura: si no hay filas, el «ninguna» de arriba ' +
    'es cierto por vacío y no midió nada',
  ).toBeGreaterThan(0)
})
