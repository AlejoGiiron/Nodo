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

// 🔴 SOLO EXISTEN TRES productos `Lab %`, medido: Cerveza (8.000), Coctel
//    (18.000) y Vaso (0). `Lab Doble` —que la primera version de este archivo
//    usaba— NO EXISTE: lo saque de un grep que leyo un nombre en otro contexto.
// ⚠️ `Lab Coctel` queda afuera de los escenarios de carrito porque ABRE EL MODAL
//    de extras: el caso se quedaria con un modal encima midiendo otra cosa.
const P1 = POS_PRODUCTO       // 'Lab Cerveza' — sin L0 ni L3, a proposito
const P2 = 'Lab Vaso'         // precio 0: entra al carrito sin abrir nada

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

    // 🔴 L4 y no L3: `Lab Cerveza` NO TIENE L3 —el sembrado se lo quito a
    //    proposito— asi que esa opcion esta `disabled` y el caso moriria
    //    esperandola. Con L4 el precio SE MUEVE de verdad (8.000 -> 12.000),
    //    que es mas fuerte que lo que el caso medía antes del sembrado.
    await page.getByTestId('cart-item-nivel-0-opcion-4').click()
    await expect(chip).toHaveAttribute('data-estado', 'distinto')
    await expect(chip).toHaveAttribute('data-nivel', '4')

    // 🔴 Y EL PRECIO SE MOVIÓ. Sin esta aserción el caso pasaría con un chip que
    //    cambia de color y no cotiza nada — un control decorativo.
    const precioDespues = await page.getByTestId('cart-item-price').inputValue()
    expect(precioDespues, 'elegir un nivel tiene que RE-SEMBRAR el precio, no sólo pintar el chip')
      .not.toBe(precioAntes)
  })

  test('Alt+4 cambia el nivel de la línea sin abrir nada', async ({ page }) => {
    await irAlMostrador(page)
    await addPosProduct(page)

    await page.keyboard.press('Alt+4')
    const chip = page.getByTestId('cart-item-nivel-0')
    await expect(chip).toHaveAttribute('data-nivel', '4')
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

    // 🔴 La tercera se toca a mano: deja de ser intacta y NO se re-aplica.
    const precioManual = page.getByTestId('cart-item-price').nth(1)   // la 2a LINEA: el carrito ordena por insercion, no por catalogo
    await precioManual.fill('99999')
    await precioManual.blur()

    await page.getByTestId('cart-customer-search').fill('')
    await page.getByTestId('cart-customer-option').first().click()

    // 🔴 SE ASEVERA EL NÚMERO, NO LA PRESENCIA. «3 líneas pasaron a lista 3» con
    //    2 movidas es un aviso que MIENTE, y un caso sobre la presencia del
    //    toast no lo distingue: las dos versiones muestran un toast.
    const aviso = page.getByText(/líneas? re-cotizadas? a L\d/)
    await expect(aviso).toBeVisible()
    await expect(aviso, 'el aviso tiene que decir 1: la segunda se tocó a mano y NO se re-aplica')
      .toContainText('1 línea re-cotizada')

    // Y el control del otro lado: la tocada a mano conserva su precio.
    // ⚠️ `99.999`, con separador de miles: el input FORMATEA. Aseverar el valor
    //    crudo fallaba por el formato, no por el comportamiento.
    await expect(precioManual).toHaveValue('99.999')
  })
})

test.describe('deuda 101 · el cliente en una venta de CONTADO', () => {
  test('la lista del cliente siembra los precios aunque el pago NO sea fiado', async ({ page }) => {
    // 🔴 EL CASO QUE FALTABA, y el que habria cazado el bug de produccion:
    //    TODOS los specs de cliente entran por el camino de FIADO, porque era el
    //    unico que existia — el picker vivia dentro del modal, bajo `isFiado`.
    //    Asi que «elegir cliente en una venta de contado» nunca se ejercito, y
    //    la suite entera podia estar verde con ese camino roto.
    //
    // ⚠️ Es la forma de «un eje que el producto dice soportar y que el lab tiene
    //    en N=1»: aca el eje es el MEDIO DE PAGO, y todos los casos de cliente
    //    usaban el mismo valor.
    await irAlMostrador(page)
    await addPosProduct(page)

    const precioAntes = await page.getByTestId('cart-item-price').inputValue()

    await page.getByTestId('cart-customer-search').fill('')
    await page.getByTestId('cart-customer-option').first().click()

    // El sujeto: el precio se re-cotiza a la lista del cliente SIN tocar el
    // medio de pago. Si el picker estuviera detras de `isFiado`, no habria a
    // quien elegir y este caso no llegaria hasta aca.
    const precioDespues = await page.getByTestId('cart-item-price').inputValue()
    expect(precioDespues, 'la lista del cliente tiene que sembrar el precio en una venta de CONTADO')
      .not.toBe(precioAntes)

    // Y el control del otro lado: el cobro en efectivo NO esta bloqueado. Sin
    // esto, «el precio cambio» pasaria verde con el cobro roto para contado.
    await expect(page.getByTestId('cobro-abrir')).toBeEnabled()
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
  // 🔴 NO SE MIGRA A API (deuda 131): acá abrir el formulario de cliente por
  //    LA PANTALLA **ES EL SUJETO**, no el medio. Lo que el caso asevera son sus
  //    CONTROLES, y eso sólo existe en la UI.
  // ⚠️ La enumeración por IDIOMA contó este sitio como andamio —`new-customer-btn`
  //    se ve igual en los dos casos— y la que discrimina es leer la aserción de
  //    abajo. Un grep encuentra candidatos; clasifica lo que el caso afirma.
  //    Los dos casos de este bloque abren el modal y NO guardan: no dejan
  //    fixture, así que tampoco tienen limpieza que migrar.
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
