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
