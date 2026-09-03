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
 * Abre el COBRO COMPLETO — el que todavía tiene los pasos de método y monto, el
 * pago dividido y el flujo de fiado.
 *
 * 🔴 POR QUÉ EXISTE, y es el corte 1 del cobro en línea (§8.15, 2026-09-03). El
 * mostrador ahora cobra EN LA COLUMNA: el botón «Cobrar — F12» confirma la venta
 * simple en el acto, ya no abre nada. Los specs cuyo sujeto **no es la pantalla
 * de cobro** —descuento, mixto, fiado, arqueo, numeración, extras, inventario—
 * usaban ese botón sólo como CAMINO, y su sujeto sigue vivo: se les cambia el
 * camino, no las aserciones.
 *
 * ⚠️ Y es un helper y no 26 ediciones a mano a propósito: el camino va a cambiar
 * otra vez en los cortes 2 y 3, y de nuevo en el 4 cuando el modal se reduzca al
 * después del cobro. Un camino repetido 26 veces es R1 dentro de la suite.
 */
export async function abrirCobroCompleto(page: Page): Promise<void> {
  await page.getByTestId('cobro-mas-opciones').click()
  await expect(
    page.getByTestId('checkout-total'),
    'el cobro completo sigue vivo hasta que los tres flujos estén en la columna',
  ).toBeVisible({ timeout: 15_000 })
}
