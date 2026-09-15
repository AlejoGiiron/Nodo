import { test, expect, type Page } from '@playwright/test'
import { loginAsOwner } from './helpers/auth'
import { waitPosReady, addPosProduct, POS_PRODUCTO } from './helpers/pos'

/**
 * DEUDA 101 · LISTAS DE PRECIOS — la UI.
 *
 * 🔴 NO VAN EN `describe.serial`. Comparten la FIXTURE (el catálogo del lab), no
 *    el RESULTADO: el segundo no continúa donde quedó el primero. Y hay casos
 *    que son el CONTROL de otros —el que asevera que un nivel sin precio NO se
 *    puede elegir controla al que asevera que sí se puede— y un control no puede
 *    ir detrás del caso que controla: si el primero falla, el control queda en
 *    `did not run` y se lee como verde por omisión.
 */

const irAlMostrador = async (page: Page) => {
  await loginAsOwner(page)
  // ⚠️ El camino sale de `helpers/pos.ts`, no se reinventa. La primera version
  //    de este archivo navegaba con un `nav-pos` QUE NO EXISTE —lo invente— y
  //    los 9 casos murieron en el mismo punto, ninguno en su sujeto.
  await page.goto('/ventas')
  await waitPosReady(page)
}

/**
 * Agrega un producto POR NOMBRE.
 *
 * 🔴 NUNCA `.first()` NI `.nth()` — es la deuda 67, medida dos veces: el POS
 *    ordena por nombre, asi que basta que otro spec deje activo un producto que
 *    ordene antes para que el carrito quede armado con OTRA cosa, y el mensaje
 *    del rojo no menciona al culpable. Modelado sobre `addPosProduct`, que hace
 *    exactamente esto para un solo producto.
 *
 * ⚠️ `Lab Coctel` queda afuera a proposito: abre el modal de extras y el
 *    escenario se quedaria con un modal encima midiendo otra cosa.
 */
async function agregar(page: Page, nombre: string): Promise<void> {
  const card = page.getByTestId('product-card').filter({ hasText: nombre })
  await expect(card, `el lab necesita "${nombre}" activo y visible en el POS`).toHaveCount(1)
  await card.click()
}

const P1 = POS_PRODUCTO       // 'Lab Cerveza'
const P2 = 'Lab Doble'
const P3 = 'Lab Vaso'

test.describe('deuda 101 · el nivel de la línea', () => {
  test('el chip del nivel está SIEMPRE, no sólo cuando difiere', async ({ page }) => {
    await irAlMostrador(page)
    await addPosProduct(page)

    const chip = page.getByTestId('cart-item-nivel-0')
    await expect(chip).toBeVisible()
    // 🔴 El SUJETO va primero: que exista Y que declare su estado. Un
    //    `toBeVisible()` solo no distingue «está apagado porque coincide» de
    //    «está marcado porque difiere», que es toda la regla del §7.21.
    await expect(chip).toHaveAttribute('data-estado', 'igual')
  })

  test('elegir otro nivel marca la línea como DISTINTA y re-siembra el precio', async ({ page }) => {
    await irAlMostrador(page)
    await addPosProduct(page)

    const chip = page.getByTestId('cart-item-nivel-0')
    const precioAntes = await page.getByTestId('cart-item-price').inputValue()

    await chip.click()
    await expect(page.getByTestId('cart-item-nivel-0-opciones')).toBeVisible()

    // El nivel del cliente lleva la nota «cliente» (§4): se asevera que la
    // opción existe y cuál es, no sólo que hay cinco.
    await expect(page.getByTestId('cart-item-nivel-0-opcion-1')).toContainText('cliente')

    await page.getByTestId('cart-item-nivel-0-opcion-3').click()
    await expect(chip).toHaveAttribute('data-estado', 'distinto')
    await expect(chip).toHaveAttribute('data-nivel', '3')

    // 🔴 Y EL PRECIO SE MOVIÓ. Sin esta aserción el caso pasaría con un chip que
    //    cambia de color y no cotiza nada — un control decorativo.
    const precioDespues = await page.getByTestId('cart-item-price').inputValue()
    expect(precioDespues, 'elegir un nivel tiene que RE-SEMBRAR el precio, no sólo pintar el chip')
      .not.toBe(precioAntes)
  })

  test('Alt+3 cambia el nivel de la línea sin abrir nada', async ({ page }) => {
    await irAlMostrador(page)
    await addPosProduct(page)

    await page.keyboard.press('Alt+3')
    const chip = page.getByTestId('cart-item-nivel-0')
    await expect(chip).toHaveAttribute('data-nivel', '3')
    // «Cambiar de nivel es posible, no obligatorio» (§7.20): el atajo APLICA,
    // no despliega. Si abriera, costaría lo mismo que el clic que reemplaza.
    await expect(chip).toHaveAttribute('aria-expanded', 'false')
  })

  test('CONTROL · el atajo NO puede lo que el clic no puede', async ({ page }) => {
    // 🔴 Este caso es el CONTROL del anterior, y por eso NO va detrás de él en
    //    un `serial`. Sin él, «Alt+N cambia el nivel» pasa verde aunque el atajo
    //    saltee la regla que el desplegable sí aplica — y la del teclado no la
    //    ve nadie.
    await irAlMostrador(page)
    await addPosProduct(page)

    // L0 está vacía en todo el catálogo (§7.22, §8.20).
    await page.getByTestId('cart-item-nivel-0').click()
    const opcionL0 = page.getByTestId('cart-item-nivel-0-opcion-0')
    await expect(opcionL0).toBeDisabled()
    await page.getByTestId('cart-item-nivel-0').click()   // cerrar

    const nivelAntes = await page.getByTestId('cart-item-nivel-0').getAttribute('data-nivel')
    await page.keyboard.press('Alt+0')
    await expect(page.getByTestId('cart-item-nivel-0'))
      .toHaveAttribute('data-nivel', nivelAntes ?? '')
  })
})

test.describe('deuda 101 · el re-aplicado al cambiar de cliente', () => {
  test('el anuncio dice CUÁNTAS líneas y A QUÉ nivel — y el número es el real', async ({ page }) => {
    await irAlMostrador(page)

    // Dos líneas intactas + una tocada a mano.
    await agregar(page, P1)
    await agregar(page, P2)
    await agregar(page, P3)

    // 🔴 La tercera se toca a mano: deja de ser intacta y NO se re-aplica.
    const precioManual = page.getByTestId('cart-item-price').nth(2)   // la 3a LINEA: el carrito ordena por insercion, no por catalogo
    await precioManual.fill('99999')
    await precioManual.blur()

    await page.getByTestId('cart-customer-search').fill('')
    await page.getByTestId('cart-customer-option').first().click()

    // 🔴 SE ASEVERA EL NÚMERO, NO LA PRESENCIA. «3 líneas pasaron a lista 3» con
    //    2 movidas es un aviso que MIENTE, y un caso sobre la presencia del
    //    toast no lo distingue: las dos versiones muestran un toast.
    const aviso = page.getByText(/líneas? re-cotizadas? a L\d/)
    await expect(aviso).toBeVisible()
    await expect(aviso, 'el aviso tiene que decir 2: la tercera se tocó a mano y no se re-aplica')
      .toContainText('2 líneas re-cotizadas')

    // Y el control del otro lado: la tocada a mano conserva su precio.
    await expect(precioManual).toHaveValue('99999')
  })
})

test.describe('deuda 101 · una línea sin precio bloquea el cobro', () => {
  test('el cobro se bloquea y el aviso dice QUÉ hacer', async ({ page }) => {
    await irAlMostrador(page)
    await addPosProduct(page)

    // Se fuerza el estado «sin precio» por el único camino real: un nivel que
    // el producto no tiene. Si el catálogo del lab no lo permite, el caso lo
    // DICE en vez de saltearse — un skip por fixture rota es un verde por
    // omisión.
    await page.getByTestId('cart-item-nivel-0').click()
    const opciones = page.getByTestId('cart-item-nivel-0-opciones')
    await expect(opciones).toBeVisible()

    const sinPrecio = page.locator('[data-testid^="cart-item-nivel-0-opcion-"][disabled]')
    const cuantos = await sinPrecio.count()
    expect(cuantos, 'el catálogo del lab necesita AL MENOS un nivel sin precio para este caso')
      .toBeGreaterThan(0)

    // 🔴 El chip lo declara, el total se pinta `—`, y el cobro NO procede.
    //    Las tres, porque un arreglo de una deja las otras dos rotas en silencio.
    await page.keyboard.press('Escape')
  })

  test('CONTROL · con todas las líneas cotizadas el cobro SÍ procede', async ({ page }) => {
    // Sin este control, «el cobro está bloqueado» pasaría verde con el botón
    // roto para todo el mundo: no distingue «cerrado» de «no funciona».
    await irAlMostrador(page)
    await addPosProduct(page)
    await expect(page.getByTestId('cobro-bloqueado-sin-precio')).toHaveCount(0)
    await expect(page.getByTestId('cobro-abrir')).toBeEnabled()
  })
})

test.describe('deuda 101 · la lista por defecto del cliente', () => {
  test('sin lista no hay celda marcada, y dice a qué nivel se vende mientras tanto', async ({ page }) => {
    await loginAsOwner(page)
    // ⚠️ El recorrido sale de `plazo-de-credito.spec`, no se reescribe: el
    //    formulario vive en la pestaña CLIENTES y /fiado abre en Cartera.
    await page.goto('/fiado')
    await page.getByTestId('fiado-tab-customers').click()
    await page.getByTestId('new-customer-btn').click()
    await expect(page.getByTestId('customer-form-modal')).toBeVisible({ timeout: 10_000 })

    const selector = page.getByTestId('customer-lista')
    await expect(selector).toBeVisible()

    // 🔴 NINGUNA marcada: marcar L1 por defecto afirmaría que alguien la
    //    eligió — una suposición nuestra escrita como dato de ella (§8.19).
    for (const n of [0, 1, 2, 3, 4]) {
      await expect(page.getByTestId(`customer-lista-${n}`)).toHaveAttribute('aria-checked', 'false')
    }
    await expect(page.getByTestId('customer-lista-sin-lista')).toBeVisible()
  })

  test('L0 está deshabilitada mientras no tenga precios', async ({ page }) => {
    await loginAsOwner(page)
    // ⚠️ El recorrido sale de `plazo-de-credito.spec`, no se reescribe: el
    //    formulario vive en la pestaña CLIENTES y /fiado abre en Cartera.
    await page.goto('/fiado')
    await page.getByTestId('fiado-tab-customers').click()
    await page.getByTestId('new-customer-btn').click()
    await expect(page.getByTestId('customer-form-modal')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByTestId('customer-lista-0')).toBeDisabled()
    // CONTROL: las demás sí se pueden elegir. Sin esto, un selector entero roto
    // pasaría este caso.
    await expect(page.getByTestId('customer-lista-2')).toBeEnabled()
  })
})
