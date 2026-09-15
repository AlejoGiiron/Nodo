import { test, expect, type Page } from '@playwright/test'
import { loginAsOwner } from './helpers/auth'
import { openShiftIfClosed } from './helpers/shift'
import { waitPosReady, addPosProduct, abrirCobro } from './helpers/pos'

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
      ['F8',  /\/productos/],
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
    // F3 buscar, F11 pantalla completa. Sin cortarles el paso el atajo pelea y
    // pierde.
    // ⚠️ F5 SALIÓ DE ESTA LISTA el 2026-09-03 y no porque dejara de importar:
    //    dejó de estar cableada. Ver el control negativo, abajo.
    for (const t of ['F3', 'F6', 'F7', 'F8', 'F9', 'F10', 'F1']) await page.keyboard.press(t)

    const espiadas = await loEspiado(page)
    for (const t of ['F3', 'F6', 'F7', 'F8', 'F9', 'F10', 'F1']) {
      expect(
        espiadas[t],
        `${t} llegó al navegador con su default intacto: el atajo pelea con el navegador y pierde`,
      ).toBe(true)
    }

    // 🔴 CONTROL NEGATIVO. Sin él este caso no distingue «lo corté» de «el
    //    espía siempre dice true»: se aprieta una tecla de §5 que NO está
    //    cableada, y tiene que salir con su default INTACTO.
    //
    // ⚠️ ESTE CONTROL YA SE MOVIÓ DOS VECES, y las dos por la misma razón: se
    //    apoya en una propiedad del producto —«esta tecla no hace nada»— así que
    //    **caduca cuando el producto crece**.
    //      · era F4  → el corte 3 del cobro la cableó (cambiar cliente)
    //      · pasó a F8 → el 2026-09-03 F8 se volvió Catálogo, al liberar F5
    //    En las dos el control se puso rojo, y en las dos **no falló el producto:
    //    falló la premisa del control**. Es lo que un control existe para hacer.
    //
    // 🔴 AHORA ES F5, Y ESTA VEZ NO CADUCA — que es la diferencia que importa.
    //    Las anteriores eran teclas «todavía no cableadas», o sea una propiedad
    //    temporal. F5 está en `TECLAS_RESERVADAS`: **el producto decidió no
    //    tomarla nunca** porque recargar borra el carrito a medio armar. Que
    //    salga con su default INTACTO no es un accidente del estado actual — es
    //    la decisión, aseverada. Y `atajos.test.ts` impide que se reasigne.
    await page.keyboard.press('F5')
    const conNoCableada = await loEspiado(page)
    expect(
      conNoCableada['F5'],
      'F5 salió con el default cortado: o alguien la cableó —y no se puede, recargar borra el ' +
      'carrito— o el espía dice que TODO viene cortado y no está midiendo nada',
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

  test('🔴 F12 ABRE el cobro', async ({ page }) => {
    // 🔴 TERCERA REDACCIÓN DE ESTE CASO, y las tres midieron lo mismo: que F12
    //    ACTÚE sobre el cobro. Lo que cambió tres veces es qué significa actuar.
    //      · el modal original      → F12 abre el modal
    //      · el cobro en línea      → no hay nada que abrir: F12 pone el foco en
    //                                 Cobrar, y Enter confirma (§5 pidió dos
    //                                 actos: cobrar de una convertiría la tecla
    //                                 en una venta irreversible sin aviso)
    //      · el modal de vuelta     → F12 abre el modal, otra vez
    //    La aserción se RE-DERIVA de la pantalla cada vez; lo que no se toca es
    //    el sujeto. El botón imprime «Cobrar — F12» desde el primer día y esa
    //    promesa no depende de dónde viva el cobro.
    await openShiftIfClosed(page, 0)
    await page.goto('/ventas')
    await waitPosReady(page)
    await addPosProduct(page)

    // El control de la propia lectura: si el modal ya estuviera abierto, la
    // aserción de abajo pasaría sin que F12 hiciera nada.
    await expect(
      page.getByTestId('checkout-total'),
      'el modal NO puede estar abierto antes de la tecla, o el caso no mide',
    ).toHaveCount(0)

    await page.keyboard.press('F12')
    await expect(
      page.getByTestId('checkout-total'),
      'el botón dice «Cobrar — F12» desde el primer día; la tecla tiene que abrir el cobro',
    ).toBeVisible({ timeout: 10_000 })
  })

  test('🔴 F4 lleva al BUSCADOR DE CLIENTES, que es donde se cambia de cliente', async ({ page }) => {
    // 🔴 F4 SOBREVIVIÓ A LAS DOS MUDANZAS, y cambió a qué apunta las dos veces.
    //    En la columna apuntaba a un botón «Cambiar cliente» que existía porque
    //    el picker COLAPSABA al elegir. El picker del modal no colapsa: muestra
    //    la lista entera con el elegido marcado, así que se cambia de cliente
    //    sin ningún control extra — y agregar un botón sólo para darle destino a
    //    la tecla habría sido inventar el control en vez de encontrarlo.
    //    Lo que no podía pasar es que F4 volviera a `ATAJOS_SIN_DESTINO`.
    await openShiftIfClosed(page, 0)
    await page.goto('/ventas')
    await waitPosReady(page)
    // 🔴 YA NO HACE FALTA ABRIR EL COBRO NI ELEGIR CREDITO: el picker vive en el
    //    CARRITO desde el corte 3, y F4 bajo al mostrador CON su control. El
    //    escenario se acorto porque el producto se simplifico, no porque el caso
    //    se ablandara — sigue midiendo lo mismo: que la tecla enfoque el control.
    await addPosProduct(page)

    const buscador = page.getByTestId('cart-customer-search')
    await expect(buscador, 'el control tiene que existir ANTES de la tecla').toBeVisible()
    await buscador.blur()
    await expect(buscador, 'y NO estar enfocado, o la aserción no mide').not.toBeFocused()

    await page.keyboard.press('F4')
    await expect(
      buscador,
      'F4 es «Cambiar cliente» (§5): tiene que dejar el cursor donde se elige el cliente',
    ).toBeFocused()
  })

  test('🔴 Enter confirma el primario del paso', async ({ page }) => {
    // El segundo acto que §5 pidió para no volver F12 irreversible: la tecla
    // ABRE, y otra tecla CONFIRMA. Se asevera sobre nequi porque su primario
    // cobra en el acto — con efectivo el primario lleva al paso del monto, que
    // es otro caso y vive en `cobro-modal.spec`.
    await openShiftIfClosed(page, 0)
    await page.goto('/ventas')
    await waitPosReady(page)
    await addPosProduct(page)
    await abrirCobro(page)
    await page.getByTestId('pay-method-nequi').click()

    // 🔴 El foco NO puede estar en un botón: ahí Enter lo acciona el navegador y
    //    el caso pasaría con el manejador borrado. Es el mismo control negativo
    //    que ya nos salvó con `document.fonts.check`.
    await page.getByTestId('checkout-total').click()
    await page.keyboard.press('Enter')

    await expect(
      page.getByText(/Venta #\d+ registrada|registrada/),
      'Enter tiene que hacer lo mismo que el botón primario del paso',
    ).toBeVisible({ timeout: 20_000 })
    await page.getByRole('button', { name: 'Nueva venta' }).click()
  })

  // ==========================================================================
  // MEDIOS DE PAGO: E · T · C — y las teclas de función se quedan con navegar
  //
  // 🔴 POR QUÉ CAMBIARON (decisión 2026-09-03). §5 le daba DOBLE significado a
  //    tres teclas —«F9 Gastos / efectivo», «F10 Inventario / transferencia»,
  //    «F11 Utilidades / crédito»—: un valor que significa dos cosas.
  //
  // ⚠️ UNA DE LAS DOS RAZONES SE MURIÓ CUANDO EL COBRO VOLVIÓ AL MODAL, y se
  //    deja escrito en vez de dejar el argumento entero en pie. La secundaria
  //    era «con el cobro en línea no hay modo, y sin modo el doble significado
  //    no se puede desambiguar»: con el modal de vuelta HAY modo otra vez, así
  //    que ese argumento ya no sostiene nada.
  //    La PRINCIPAL no depende de dónde viva el cobro y sigue entera: el campo
  //    de dinero tiene `autoFocus` y consume dígitos, así que `1/2/3` pelearían
  //    con el único control que la cajera está usando en ese momento; las letras
  //    le son inertes. Ese campo es el sujeto del último caso de esta sección.
  // ==========================================================================
  test('🔴 E/T/C eligen medio de pago dentro del cobro', async ({ page }) => {
    await openShiftIfClosed(page, 0)
    await page.goto('/ventas')
    await waitPosReady(page)
    await addPosProduct(page)
    await abrirCobro(page)

    await page.keyboard.press('t')
    await expect(
      page.getByTestId('pay-method-transferencia'),
      'T elige transferencia (la que §5 nombra; tarjeta queda SIN atajo a propósito)',
    ).toHaveAttribute('aria-pressed', 'true')

    await page.keyboard.press('c')
    await expect(page.getByTestId('pay-method-fiado')).toHaveAttribute('aria-pressed', 'true')

    await page.keyboard.press('e')
    await expect(page.getByTestId('pay-method-efectivo')).toHaveAttribute('aria-pressed', 'true')

    // ⚠️ ACÁ TERMINA, y el corte es a propósito. Este caso mide el EFECTO DE LA
    //    TECLA, que es el sujeto del archivo. La propiedad del campo de dinero
    //    —que las letras le sean inertes, y que en el paso del monto el atajo se
    //    APAGUE— vive en `cobro-modal.spec`, en un solo caso con sus dos
    //    mitades. Repetir acá una de las dos mitades sería tener el contrato en
    //    dos lados sin nada que los sincronice.
  })

  // ══════════════════════════════════════════════════════════════════════════
  // 🔴 EL CASO «con el foco en un campo de TEXTO, las letras NO eligen medio de
  //    pago» SE RETIRÓ EL 2026-09-15 — Y NO PORQUE SE FUERA SU SUJETO.
  //
  //    Su historia, que es lo que hay que entender antes de re-escribirlo: el
  //    campo empezó siendo `discount-reason`; al volver el cobro al modal ese
  //    campo quedó detrás del velo y se re-derivó a `cart-customer-search`. Con
  //    la deuda 101 el picker BAJÓ AL CARRITO y se retiró del modal a propósito
  //    —con su mensaje que dirige—, así que ese campo también quedó detrás del
  //    velo. El caso empezó a morir con `<div> intercepts pointer events`, que
  //    es el velo haciendo exactamente lo que tiene que hacer.
  //
  // 📋 ENUMERADO, no supuesto — campos DENTRO de `CheckoutModal`: **uno solo**,
  //    `checkout-received`, y es el de dinero, que DECLARA `data-letras-inertes`
  //    o sea que es justo la excepción donde las letras SÍ mandan. No queda
  //    ningún campo de escritura adentro del modal.
  //
  // 🔴 Y LA OPCIÓN CÓMODA —mover el caso al buscador del carrito con el cobro
  //    CERRADO— SE DESCARTÓ POR MEDICIÓN, NO POR OPINIÓN. El manejador de las
  //    letras vive DENTRO de `CheckoutModal`, que se monta con `{checkout && …}`:
  //    con el cobro cerrado su `useEffect` ya limpió el listener y la tecla no
  //    llega a ningún lado. Verificado con el mutante —borrado
  //    `if (elFocoEstaEscribiendo()) return`—:
  //
  //      sonda en el carrito, cobro cerrado  → VERDE con el guard borrado ⛔
  //      este caso, cobro abierto            → ROJO  con el guard borrado ✅
  //
  //    O sea que el caso movido habría sido un verde que no puede fallar, con
  //    el nombre de una protección que no estaría midiendo.
  //
  // ✅ DÓNDE VIVE HOY LA COBERTURA, para que «retirado» no se lea como «sin
  //    probar» — y son dos mitades distintas:
  //      · LA REGLA (qué cuenta como escribir) → `src/lib/atajos.test.ts`,
  //        `describe('esCampoDeEscritura')`. Cubre el default que protege, la
  //        excepción del campo de dinero y un tipo de HTML inventado. La
  //        función recibe el elemento en vez de leer `document` EXACTAMENTE
  //        para poder aseverarse sin navegador; está dicho en su comentario.
  //      · EL CABLEADO (que el manejador consulte esa regla) → 🔴 **SIN MEDIR**,
  //        y se declara así en vez de taparse. No hay escenario que lo ejerza
  //        mientras el modal no tenga un campo de escritura.
  //
  // ⚠️ Lo que NO se hizo, y se nombra para que nadie lo proponga como atajo:
  //    bajar la aserción hasta que pase. Eso es acomodar el test al código.
  // ══════════════════════════════════════════════════════════════════════════

  test('🔴 tripwire: el modal de cobro NO tiene campos de escritura', async ({ page }) => {
    // Este caso NO mide un comportamiento: vigila la PREMISA por la que el caso
    // de arriba se retiró. El día que el modal gane un campo de texto —una nota,
    // un número de referencia, una cédula— el cableado del guard vuelve a ser
    // ejercitable y hay que volver a escribirlo. Sin esto, la premisa envejece
    // en un comentario que nadie relee.
    //
    // ⚠️ Y no caduca por «todavía»: se apoya en una DECISIÓN —el picker se retiró
    //    del modal a propósito— así que si se pone rojo, el rojo es correcto:
    //    está diciendo que la decisión cambió.
    await openShiftIfClosed(page, 0)
    await page.goto('/ventas')
    await waitPosReady(page)
    await addPosProduct(page)
    await abrirCobro(page)

    const modal = page.getByTestId('checkout-modal')
    await expect(modal, 'el cobro tiene que estar abierto, o el tripwire no mira nada').toBeVisible()

    // Se leen los campos REALES del modal, no una lista escrita a mano.
    const camposDe = () => modal.locator('input, textarea, [contenteditable="true"]').evaluateAll(
      (els) => els.map((el) => ({
        testid: el.getAttribute('data-testid') ?? '(sin testid)',
        inertes: el.hasAttribute('data-letras-inertes'),
      })),
    )

    // ⚠️ LOS DOS PASOS, y el recorrido no es de más: el modal monta cosas
    //    distintas en cada uno —`width` incluso cambia— así que mirar sólo el
    //    primero sería «capturar un estado no es capturar la pantalla».
    const enMetodo = await camposDe()
    await page.getByTestId('pay-method-efectivo').click()
    await page.getByTestId('checkout-continue').click()
    await expect(page.getByTestId('checkout-received')).toBeVisible()
    const enMonto = await camposDe()

    const deEscritura = [...enMetodo, ...enMonto].filter((c) => !c.inertes).map((c) => c.testid)
    expect(
      [...new Set(deEscritura)].join(', ') || 'ninguno',
      'EL MODAL DE COBRO GANÓ UN CAMPO DE ESCRITURA. Eso vuelve ejecutable el caso ' +
      '«con el foco en un campo de TEXTO, las letras NO eligen medio de pago», que se ' +
      'retiró el 2026-09-15 por falta de escenario: escribilo contra este campo, con su ' +
      'mutante (borrar `if (elFocoEstaEscribiendo()) return` tiene que ponerlo rojo)',
    ).toBe('ninguno')

    // 🔴 CONTROL POSITIVO DE LA PROPIA LECTURA, y no es adorno: si el selector no
    //    encontrara NADA, el filtro de arriba daría «ninguno» y el caso pasaría
    //    sin haber mirado — un cero indistinguible de un selector roto. El campo
    //    de dinero tiene que aparecer, y tiene que aparecer marcado como inerte.
    expect(
      enMonto.map((c) => c.testid),
      'el paso del monto monta `checkout-received`; si este control no lo ve, el que ' +
      'está roto es el selector y el «ninguno» de arriba no significa nada',
    ).toContain('checkout-received')
    expect(
      enMonto.find((c) => c.testid === 'checkout-received')?.inertes,
      '`checkout-received` tiene que DECLARAR `data-letras-inertes`: es la excepción por ' +
      'la que los atajos de cobro pueden ser letras',
    ).toBe(true)
  })

  test('🔴 control negativo: una letra que NO es atajo no hace nada', async ({ page }) => {
    // Sin este caso, un manejador que respondiera a CUALQUIER tecla pasaría los
    // dos de arriba.
    await openShiftIfClosed(page, 0)
    await page.goto('/ventas')
    await waitPosReady(page)
    await addPosProduct(page)
    await abrirCobro(page)
    await page.keyboard.press('t')
    await expect(page.getByTestId('pay-method-transferencia')).toHaveAttribute('aria-pressed', 'true')

    await page.keyboard.press('z')
    await expect(
      page.getByTestId('pay-method-transferencia'),
      'Z no es atajo de nada: el medio elegido tiene que quedarse donde estaba',
    ).toHaveAttribute('aria-pressed', 'true')
    await expect(page, 'y tampoco navega').toHaveURL(/\/ventas/)
  })

  test('🔴 F9 y F10 navegan SIEMPRE, también con el cobro ABIERTO', async ({ page }) => {
    // El otro lado de la decisión: las teclas de función recuperaron su único
    // significado. Antes se las quedaba el cobro; ahora navegan siempre, que es
    // lo que §5 promete. El carrito vive en el store, así que no se pierde.
    //
    // 🔴 Y CON EL MODAL DE VUELTA EL CASO MIDE MÁS QUE ANTES, no menos: un modal
    //    ES un modo, así que ésta es exactamente la situación en la que un
    //    manejador con excepción por modo se saldría temprano y F10 no haría
    //    nada. Contra la columna el escenario era más flojo — no había modo del
    //    que salirse.
    await openShiftIfClosed(page, 0)
    await page.goto('/ventas')
    await waitPosReady(page)
    await addPosProduct(page)
    await abrirCobro(page)
    await expect(page.getByTestId('pay-method-efectivo'), 'el cobro está abierto').toBeVisible()

    await page.keyboard.press('F10')
    await expect(
      page,
      'F10 es Inventario y nada más: ya no depende de si hay un cobro en pantalla',
    ).toHaveURL(/\/inventario/, { timeout: 10_000 })
  })
})
