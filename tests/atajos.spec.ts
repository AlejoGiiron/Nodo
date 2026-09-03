import { test, expect, type Page } from '@playwright/test'
import { loginAsOwner } from './helpers/auth'
import { openShiftIfClosed } from './helpers/shift'
import { waitPosReady, addPosProduct } from './helpers/pos'

// ============================================================================
// LOS ATAJOS DE §5 HACEN LA ACCIÓN — no la anuncian
//
// 🔴 POR QUÉ ESTE SPEC EXISTE, Y POR QUÉ NO ASEVERA NINGÚN RÓTULO.
//    El producto imprimía «Cobrar — F12» en el botón del POS y **F12 no estaba
//    cableada**: cero `key === 'F…'` en todo `src/`. La cajera apretaba F12 y le
//    abría las herramientas del navegador. §5 declara a F12 *la única excepción
//    permanente* a «los atajos no se imprimen», o sea que la maqueta cuenta con
//    que exista.
//
//    Lo que dejó pasar el defecto fue exactamente un test de rótulo: aseverar
//    que el botón dice «Cobrar — F12» está VERDE con la tecla muerta. Así que
//    acá **cada caso aprieta la tecla y asevera el efecto**: la URL que cambia,
//    el foco que se mueve, el modal que abre, el medio de pago que queda
//    seleccionado.
//
// 🔴 Y CÓMO SE MIDE EL `preventDefault`, QUE NO ES OBVIO Y YA FALLÓ UNA VEZ.
//    La primera versión de este spec ponía una marca en `window`, apretaba F5 y
//    aseveraba que la marca sobrevivía —o sea, que la página no se había
//    recargado—. **El mutante la sobrevivió:** con `preventDefault` quitado el
//    caso seguía verde, porque en Chromium bajo automatización la tecla NO
//    dispara la acción del navegador. El caso no medía nada, y el comentario
//    que estaba acá afirmaba que sí.
//
//    El instrumento que discrimina no observa la CONSECUENCIA (que el navegador
//    no haga lo suyo, invisible acá): observa el HECHO —que el evento salió con
//    su default cortado—. Un listener registrado DESPUÉS del de la aplicación
//    corre después y ve `defaultPrevented`. Con eso se puede medir incluso F12,
//    cuya consecuencia no es observable de ninguna manera.
//
// ✅ ACTUALIZADO en el corte 1 del cobro en línea: la propiedad «E con el foco en
//    el campo de dinero elige efectivo» —la razón entera de haber elegido letras
//    sobre 1…5— ya NO está probada en dos mitades. Con la columna montada, la
//    grilla de medios y el campo de dinero conviven, y el caso de punta a punta
//    vive en `tests/cobro-en-linea.spec.ts`. Dos mitades que pasan por separado
//    eran un verde que no podía fallar.
// ============================================================================

test.describe.configure({ mode: 'serial' })

/**
 * Registra un listener DESPUÉS del de la aplicación, así que corre después y ve
 * si el evento quedó con su default cortado. Es la única forma de aseverar un
 * `preventDefault` sobre una tecla cuya consecuencia el navegador de prueba no
 * ejecuta.
 */
async function espiarDefaultPrevented(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as Record<string, unknown>
    w.__nodoEspia = {}
    // 🔴 Se guarda EL EVENTO, no el valor. Leer `defaultPrevented` adentro del
    //    listener lo ata al orden de suscripción — y `useAtajos` se re-suscribe
    //    al navegar, así que el espía terminaba corriendo ANTES que la
    //    aplicación y veía `false` sobre una tecla que sí estaba cortada. El
    //    valor se lee al final, cuando el despacho ya terminó.
    window.addEventListener('keydown', (e) => {
      ;(w.__nodoEspia as Record<string, KeyboardEvent>)[e.key] = e
    })
  })
}
async function loEspiado(page: Page): Promise<Record<string, boolean>> {
  return page.evaluate(() => {
    const evs = (window as unknown as Record<string, unknown>).__nodoEspia as Record<string, KeyboardEvent>
    return Object.fromEntries(Object.entries(evs).map(([k, e]) => [k, e.defaultPrevented]))
  })
}

test.describe('Atajos de teclado (§5)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsOwner(page)
    await page.goto('/ventas')
    await waitPosReady(page)
  })

  test('🔴 las teclas de navegación LLEVAN a su pantalla', async ({ page }) => {
    // Cada par es (tecla, ruta que §5 le asigna). Se prueban en cadena porque
    // el atajo tiene que funcionar DESDE cualquier pantalla, no sólo desde el
    // mostrador.
    const destinos: [string, RegExp][] = [
      ['F3',  /\/compras/],
      ['F5',  /\/productos/],
      ['F6',  /\/clientes/],
      ['F7',  /\/fiado/],
      ['F9',  /\/historial-gastos/],
      ['F10', /\/inventario/],
      ['F1',  /\/ventas/],
    ]
    for (const [tecla, ruta] of destinos) {
      await page.keyboard.press(tecla)
      await expect(
        page,
        `${tecla} tiene que LLEVAR a ${ruta.source}, no sólo estar impresa en algún lado`,
      ).toHaveURL(ruta, { timeout: 10_000 })
    }
  })

  test('🔴 las teclas que el navegador usa salen con el default CORTADO', async ({ page }) => {
    // El manejador vive en `AppLayout`: la tecla no existe hasta que montó.
    await expect(page.getByTestId('sidebar-org-name')).toBeVisible({ timeout: 15_000 })
    await espiarDefaultPrevented(page)

    // Las siete globales, y entre ellas las que el navegador ya usa: F1 ayuda,
    // F3 buscar, F5 recargar. Sin cortarles el paso el atajo pelea y pierde.
    for (const t of ['F3', 'F5', 'F6', 'F7', 'F9', 'F10', 'F1']) await page.keyboard.press(t)

    const espiadas = await loEspiado(page)
    for (const t of ['F3', 'F5', 'F6', 'F7', 'F9', 'F10', 'F1']) {
      expect(
        espiadas[t],
        `${t} llegó al navegador con su default intacto: el atajo pelea con el navegador y pierde`,
      ).toBe(true)
    }

    // 🔴 CONTROL NEGATIVO. Sin él este caso no distingue «lo corté» de «el
    //    espía siempre dice true»: F4 es la tecla de §5 que NO se cableó a
    //    propósito, así que tiene que salir con su default INTACTO.
    await page.keyboard.press('F4')
    const conF4 = await loEspiado(page)
    expect(
      conF4['F4'],
      'el espía dice que TODO viene con el default cortado: no está midiendo nada',
    ).toBe(false)
  })

  test('🔴 F12 y F2 tampoco llegan al navegador desde el mostrador', async ({ page }) => {
    // F12 es la única cuya consecuencia no se puede observar de ninguna forma
    // —Chromium bajo automatización no abre herramientas—, así que el hecho de
    // que salga con el default cortado es TODA la evidencia que hay.
    await espiarDefaultPrevented(page)
    await page.keyboard.press('F2')
    await page.keyboard.press('F12')
    const espiadas = await loEspiado(page)
    expect(espiadas['F2'], 'F2 llegó al navegador').toBe(true)
    expect(espiadas['F12'], 'F12 llegó al navegador: le abre las herramientas a la cajera').toBe(true)
  })

  test('🔴 F2 pone el foco en el buscador del mostrador', async ({ page }) => {
    const buscador = page.getByTestId('pos-search')
    await expect(buscador).not.toBeFocused()
    await page.keyboard.press('F2')
    await expect(
      buscador,
      'F2 es «buscar producto» en §5: tiene que dejar el cursor listo para teclear',
    ).toBeFocused()
  })

  test('🔴 F12 actúa sobre el cobro: pone el FOCO en Cobrar', async ({ page }) => {
    // 🔴 REESCRITO en el corte 1 del cobro en línea. Este caso aseveraba que F12
    //    ABRÍA el modal de cobro, y eso era cierto mientras el cobro fuera un
    //    modal. Con el panel en línea no hay nada que abrir, y §5 decidió que la
    //    tecla **pone el foco en Cobrar** — cobrar de una convertiría F12 de un
    //    acto reversible en una venta irreversible sin que la cajera tenga cómo
    //    notarlo.
    //    La ASERCIÓN sobrevivió al cambio de modelo —F12 sigue actuando sobre el
    //    cobro— así que se re-derivó de la pantalla nueva en vez de borrarse.
    // ⚠️ El flujo completo de los DOS ACTOS (foco + Enter que confirma, y que
    //    F12 sola NO cobra) vive en `tests/cobro-en-linea.spec.ts`: acá se mide
    //    el efecto del ATAJO, allá el flujo del cobro.
    await openShiftIfClosed(page, 0)
    await page.goto('/ventas')
    await waitPosReady(page)
    await addPosProduct(page)

    const boton = page.getByTestId('cobro-confirmar')
    await expect(boton).not.toBeFocused()
    await page.keyboard.press('F12')
    await expect(
      boton,
      'el botón dice «Cobrar — F12» desde el primer día; la tecla tiene que actuar sobre él',
    ).toBeFocused()
  })

  // ==========================================================================
  // MEDIOS DE PAGO: E · T · C — y las teclas de función se quedan con navegar
  //
  // 🔴 POR QUÉ CAMBIARON (decisión 2026-09-03). §5 le daba DOBLE significado a
  //    tres teclas —«F9 Gastos / efectivo», «F10 Inventario / transferencia»,
  //    «F11 Utilidades / crédito»— y eso sólo se sostenía porque el cobro era un
  //    MODAL: un modal crea un MODO, y el modo desambigua. Con el cobro EN LÍNEA
  //    el panel está siempre visible, no hay modo, y queda un valor que
  //    significa dos cosas. Cede lo LOCAL: la navegación es global y §5 promete
  //    que los atajos funcionan siempre.
  //
  // ⚠️ Estos casos corren contra LA COLUMNA y ya no abren el modal: desde el
  //    corte 1 la grilla de medios está montada con sólo tener ítems en el
  //    carrito, así que el escenario es más corto y —lo que importa— es el que
  //    la cajera usa de verdad.
  // ==========================================================================
  test('🔴 E/T/C eligen medio de pago en la columna', async ({ page }) => {
    await openShiftIfClosed(page, 0)
    await page.goto('/ventas')
    await waitPosReady(page)
    await addPosProduct(page)

    await page.keyboard.press('t')
    await expect(
      page.getByTestId('cobro-medio-transferencia'),
      'T elige transferencia (la que §5 nombra; tarjeta queda SIN atajo a propósito)',
    ).toHaveAttribute('aria-pressed', 'true')

    await page.keyboard.press('c')
    await expect(page.getByTestId('cobro-medio-fiado')).toHaveAttribute('aria-pressed', 'true')

    await page.keyboard.press('e')
    await expect(page.getByTestId('cobro-medio-efectivo')).toHaveAttribute('aria-pressed', 'true')
    // El campo de dinero DECLARA que las letras le son inertes: es lo que
    // permite que el atajo mande con el foco adentro, y la razón entera por la
    // que los atajos de cobro son letras y no dígitos.
    await expect(page.getByTestId('cobro-recibe'))
      .toHaveAttribute('data-letras-inertes', '')
  })

  test('🔴 con el foco en un campo de TEXTO, las letras NO eligen medio de pago', async ({ page }) => {
    // La otra mitad, sin la cual la primera no prueba nada: un manejador que
    // dispara siempre pasaría el caso de arriba y rompería el de acá.
    await openShiftIfClosed(page, 0)
    await page.goto('/ventas')
    await waitPosReady(page)
    await addPosProduct(page)
    await page.keyboard.press('t')
    await expect(page.getByTestId('cobro-medio-transferencia')).toHaveAttribute('aria-pressed', 'true')

    // El motivo del descuento es un campo de texto de verdad: ahí la letra se
    // escribe, no manda.
    const motivo = page.getByTestId('discount-reason')
    await motivo.click()
    await motivo.fill('')
    await page.keyboard.press('e')
    await expect(
      motivo,
      'la letra tiene que ESCRIBIRSE en un campo de texto, no ejecutar un atajo',
    ).toHaveValue('e')
    await expect(
      page.getByTestId('cobro-medio-transferencia'),
      'y el medio elegido NO cambia: escribir «efectivo» en un motivo no es elegir efectivo',
    ).toHaveAttribute('aria-pressed', 'true')
  })

  test('🔴 control negativo: una letra que NO es atajo no hace nada', async ({ page }) => {
    // Sin este caso, un manejador que respondiera a CUALQUIER tecla pasaría los
    // dos de arriba.
    await openShiftIfClosed(page, 0)
    await page.goto('/ventas')
    await waitPosReady(page)
    await addPosProduct(page)
    await page.keyboard.press('t')
    await expect(page.getByTestId('cobro-medio-transferencia')).toHaveAttribute('aria-pressed', 'true')

    await page.keyboard.press('z')
    await expect(
      page.getByTestId('cobro-medio-transferencia'),
      'Z no es atajo de nada: el medio elegido tiene que quedarse donde estaba',
    ).toHaveAttribute('aria-pressed', 'true')
    await expect(page, 'y tampoco navega').toHaveURL(/\/ventas/)
  })

  test('🔴 F9 y F10 navegan SIEMPRE, también con el cobro en pantalla', async ({ page }) => {
    // El otro lado de la decisión: las teclas de función recuperaron su único
    // significado. Antes se las quedaba el cobro; ahora navegan siempre, que es
    // lo que §5 promete. El carrito vive en el store, así que no se pierde.
    await openShiftIfClosed(page, 0)
    await page.goto('/ventas')
    await waitPosReady(page)
    await addPosProduct(page)
    await expect(page.getByTestId('cobro-medio-efectivo'), 'el cobro está en pantalla').toBeVisible()

    await page.keyboard.press('F10')
    await expect(
      page,
      'F10 es Inventario y nada más: ya no depende de si hay un cobro en pantalla',
    ).toHaveURL(/\/inventario/, { timeout: 10_000 })
  })
})
