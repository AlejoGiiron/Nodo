import { type Page, expect } from '@playwright/test'

/**
 * Espera a que el POS (/ventas) esté MONTADO y visible antes de afirmar sobre el
 * carrito. Bajo carga, una aserción de estado del carrito justo tras navegar
 * puede resolverse contra la raíz del POS aún no visible (el placeholder
 * "Carrito vacío" existe pero queda oculto durante el render) → flaky.
 *
 * `cart-total` está SIEMPRE en el footer del carrito (no depende de items), así
 * que su visibilidad confirma que la raíz del POS ya renderizó.
 */
export async function waitPosReady(page: Page): Promise<void> {
  await expect(page.getByTestId('cart-total')).toBeVisible({ timeout: 15_000 })
}

/**
 * Producto del lab-seed que `pos.spec` usa para armar un carrito. Precio 8.000 y
 * **sin `stock_tracking`**, así que las ventas del spec no mueven inventario.
 *
 * 🔴 POR QUÉ EXISTE, y es la deuda 67. Antes cada caso hacía
 *    `getByTestId('product-card').first()`, y el POS ordena por nombre: bastaba
 *    que otro spec dejara activo un producto que ordenara antes para que el
 *    carrito quedara armado con OTRA cosa. Pasó y se midió dos veces (A4 y el
 *    cierre del bloque 0): `anular-venta.spec` dejaba `AV Insumo …` **activo y
 *    con precio 0**, `AV…` ordena antes que `Lab…`, y los cinco casos de cobro
 *    fallaban con un total de cero — sin que el mensaje mencionara al culpable.
 *
 * Elegir por nombre hace el test independiente del contenido del catálogo. Si el
 * producto no está, falla nombrándolo, que es la mitad del diagnóstico.
 */
export const POS_PRODUCTO = 'Lab Cerveza'

export async function addPosProduct(page: Page): Promise<void> {
  const card = page.getByTestId('product-card').filter({ hasText: POS_PRODUCTO })
  await expect(card, `el lab necesita "${POS_PRODUCTO}" activo y visible en el POS`).toHaveCount(1)
  await card.click()
}

/**
 * Abre el MODAL DE COBRO. Es el paso que la columna no tenía: con el cobro en
 * línea el panel estaba siempre montado y no había nada que abrir.
 *
 * 🔴 POR QUÉ VUELVE A HABER UN PASO, y sale de USO y no de diseño (§8.15,
 * revertida el 2026-09-03): en la columna «todo queda chico y amontonado, y el
 * scroll dentro del panel es el síntoma de que no cabe». El modal compra ancho
 * —540px— a cambio de un clic, y el cobro es la pantalla del producto que menos
 * tolera apretar.
 *
 * ⚠️ Sigue siendo UN helper y no N ediciones a mano por la misma razón por la
 * que existía `abrirCobroCompleto`: un camino repetido en trece archivos es R1
 * adentro de la suite. Este año ya cambió tres veces.
 */
export async function abrirCobro(page: Page): Promise<void> {
  await page.getByTestId('cobro-abrir').click()
  await expect(
    page.getByTestId('checkout-total'),
    'el modal de cobro tiene que abrir: «Cobrar» ya no confirma en el acto',
  ).toBeVisible({ timeout: 15_000 })
}

/**
 * El camino COMPLETO de una venta en efectivo, de carrito armado a venta hecha.
 *
 * 🔴 Son DOS botones y no uno, y ésa es la diferencia estructural con la
 * columna: con efectivo y total > 0 el primario del paso de método NO cobra —
 * lleva al paso del monto—, y el que cobra es el del monto. En la columna los
 * dos eran el mismo `cobro-confirmar`, que es justamente por qué el retiro no
 * fue un renombre sino una decisión por sitio.
 */
export async function cobrarEnEfectivo(page: Page, recibido: number | string): Promise<void> {
  await abrirCobro(page)
  await page.getByTestId('pay-method-efectivo').click()
  await page.getByTestId('checkout-continue').click()
  await page.getByTestId('checkout-received').fill(String(recibido))
  await page.getByTestId('checkout-confirm-efectivo').click()
}

/**
 * Una venta con un medio que NO pide monto —nequi, tarjeta, transferencia—.
 * Ahí el primario del paso de método cobra directo: no hay segundo paso.
 */
export async function cobrarCon(page: Page, medio: string): Promise<void> {
  await abrirCobro(page)
  await page.getByTestId(`pay-method-${medio}`).click()
  await page.getByTestId('checkout-continue').click()
}
