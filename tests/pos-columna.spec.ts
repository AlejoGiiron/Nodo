import { test, expect, type Page } from '@playwright/test'
import { loginAsOwner } from './helpers/auth'
import { waitPosReady } from './helpers/pos'

// ============================================================================
// LA COLUMNA DEL MOSTRADOR FUNCIONA EN CUALQUIER ALTO — no en los que medimos
//
// 🔴 POR QUÉ EXISTE, y es UNA sola causa detrás de TRES arreglos anteriores: el
//    mínimo de tres filas, el picker compacto y el pie pegajoso fueron tres
//    constantes movidas para que un contenido FIJO entrara en UN viewport.
//
//    **Medido el 2026-09-24: en la columna no cedía NADA.** El contenido medía
//    937px con el picker cerrado y 1114 abierto —**constante en los seis
//    altos**— y la lista del carrito medía **351px siempre**. Lo único que
//    pasaba es que la columna entera scrolleaba.
//
// 🔴 QUÉ SE ASEVERA, Y POR QUÉ NO ES «SE VEN LAS TRES LÍNEAS»:
//
//    «Ves tres» tiene un **piso de viewport implícito**. Medido: con el
//    buscador de cliente abierto el cromo de la columna suma 554px (encabezado
//    69 · picker 244 · pie 241), así que tres filas exigen ~1010px de alto. En
//    cualquier pantalla más chica esa promesa es **falsa, y falsa en silencio**
//    — y el descarte de achicar más el cromo va con su aritmética: para que
//    tres filas entren a 600, el cromo tendría que bajar de 554 a 144, y no hay
//    de dónde sacar 410px de encabezado, buscador y pie.
//
//    «Ves lo que cabe y llegás al resto» es cierta a 600 **y** a 1080. Así que
//    eso es lo que se mide: que la lista tenga **alto usable** —al menos una
//    fila VISIBLE— y que su **última línea sea alcanzable** scrolleando la
//    lista. Con un control a 1080 de que las tres se ven de una: sin él,
//    «alto usable» podría degradarse a una fila donde caben tres.
//
// 🔴 LA ASERCIÓN ES GEOMÉTRICA, no `toBeVisible()`. Una línea clipeada por su
//    contenedor sigue teniendo caja: para Playwright es visible. Y se mide
//    contra la INTERSECCIÓN de la lista con el viewport, no contra su caja: una
//    lista de 300px que cae 250 fuera de pantalla tiene 50 usables, no 300.
//
// ⚠️ Y BARRE LOS SEIS ALTOS a propósito: con uno solo, el arreglo siguiente
//    vuelve a ser una constante que sirve ahí.
// ============================================================================

const ALTOS = [600, 640, 700, 768, 900, 1080]
const LINEAS = 3

async function montar(page: Page, alto: number) {
  await page.setViewportSize({ width: 1366, height: alto })
  await loginAsOwner(page)
  await waitPosReady(page)
  // Tres productos DISTINTOS. La identidad no importa —esto mide geometría—;
  // lo que importa es que sean tres líneas.
  for (let i = 0; i < LINEAS; i++) await page.getByTestId('product-card').nth(i).click()
  await expect(
    page.getByTestId('cart-item-price'),
    'el escenario necesita tres líneas: con una, «entra una» y «entran tres» no se distinguen',
  ).toHaveCount(LINEAS)
}

/**
 * 🔴 LLEVA LA LISTA HASTA EL FONDO — es la mitad «llegás al resto» de la
 *    promesa. Scrollea LA LISTA, no la columna: que la columna scrollee sola
 *    es justamente lo que enmascaraba el defecto.
 */
async function alFondoDeLaLista(page: Page) {
  await page.getByTestId('cart-lista').evaluate((el) => { el.scrollTop = el.scrollHeight })
  await page.waitForTimeout(150)
}

/**
 * Revisa la promesa entera y devuelve lo que la incumple, CON SUS NÚMEROS — un
 * rojo que no dice cuántos píxeles se salió manda a mirar sin saber qué mover.
 */
async function loQueIncumple(page: Page, alto: number): Promise<string[]> {
  const mal: string[] = []
  const lista = await page.getByTestId('cart-lista').boundingBox()
  if (!lista) return ['la lista del carrito no tiene caja']

  // 🔴 LA UNIDAD ES EL PASO ENTRE DOS LÍNEAS, NO EL ALTO DE UNA CAJA. Se
  //    DERIVA, no se copia de POSPage —dos constantes iguales en dos archivos
  //    son R1 esperando— y se mide como lo dice el comentario de
  //    `ALTO_MINIMO_LISTA`: contando el paso entre dos `cart-item-price`
  //    consecutivos.
  // ⚠️ La primera versión usaba el ALTO de `cart-item-price`, y eso NO es la
  //    fila: es el precio adentro de la fila. Daba **25px** donde la fila mide
  //    **117**, así que el umbral de «alto usable» era casi cinco veces más
  //    flojo de lo que decía — un instrumento que medía otra cosa. Lo destapó
  //    leer el número del mutante, no releer el código.
  const cajas = await page.getByTestId('cart-item-price').all()
  const b0 = await cajas[0]?.boundingBox()
  const b1 = await cajas[1]?.boundingBox()
  const unaFila = b0 && b1 ? Math.abs(b1.y - b0.y) : (b0?.height ?? 0)
  if (unaFila === 0) mal.push('la primera línea no tiene caja (colapsada)')

  // ① ALTO USABLE — la parte de la lista que cae DENTRO del viewport.
  // ⚠️ CON UNA TOLERANCIA DE 1px, Y NO ES LAXITUD: el piso de la lista ES una
  //    fila, así que a 600 el valor cae EXACTAMENTE en el umbral y la
  //    comparación queda a merced del sub-píxel. Sin la tolerancia el caso
  //    imprimía «tiene 117px usables y una fila mide 117», que se lee como una
  //    contradicción — un rojo que no se puede creer ni desmentir.
  // 🔴 Y por eso los números van con decimal: dos cifras que redondean igual y
  //    deciden distinto son exactamente lo que no se puede reportar redondeado.
  const usable = Math.min(lista.y + lista.height, alto) - Math.max(lista.y, 0)
  if (usable < unaFila - 1) {
    mal.push(
      `la lista tiene ${usable.toFixed(1)}px usables y una fila mide ${unaFila.toFixed(1)}: ` +
      `no se ve NINGUNA línea (caja y=${lista.y.toFixed(1)} alto=${lista.height.toFixed(1)}, viewport ${alto})`,
    )
  }

  // ② LA ÚLTIMA LÍNEA ES ALCANZABLE — con la lista ya en el fondo.
  const ultima = await page.getByTestId('cart-item-price').last().boundingBox()
  if (!ultima || ultima.height === 0) {
    mal.push('la última línea no tiene caja (colapsada)')
  } else {
    const dentroDeLaLista = ultima.y >= lista.y - 1 && ultima.y + ultima.height <= lista.y + lista.height + 1
    const dentroDelViewport = ultima.y >= 0 && ultima.y + ultima.height <= alto
    if (!dentroDeLaLista) {
      mal.push(`la última línea queda fuera de su lista aun con la lista al fondo (y=${Math.round(ultima.y)})`)
    } else if (!dentroDelViewport) {
      mal.push(
        `la última línea es INALCANZABLE: con la lista al fondo cae en y=${Math.round(ultima.y)}..` +
        `${Math.round(ultima.y + ultima.height)} sobre un viewport de ${alto}`,
      )
    }
  }

  // ③ EL PIE — el total y cobrar son lo que no se negocia en ningún alto.
  for (const tid of ['cart-total', 'cobro-abrir']) {
    const b = await page.getByTestId(tid).first().boundingBox()
    if (!b) { mal.push(`${tid}: no está`); continue }
    if (b.y < 0 || b.y + b.height > alto) {
      mal.push(`${tid}: fuera del viewport (y=${Math.round(b.y)}, alto ${alto})`)
    }
  }
  return mal
}

for (const alto of ALTOS) {
  test(`🔴 a ${alto}px, con el buscador ABIERTO, la lista tiene alto usable y su última línea es alcanzable`, async ({ page }) => {
    await montar(page, alto)
    await page.getByTestId('cart-customer-search').click()
    await page.waitForTimeout(400)
    await alFondoDeLaLista(page)

    const mal = await loQueIncumple(page, alto)
    expect(
      mal.join(' · ') || 'nada',
      `a ${alto}px con el buscador abierto, la cajera no puede ver lo que está vendiendo. ` +
      'La promesa NO es «se ven las tres» —eso exige ~1010px— sino «ves lo que cabe y llegás al resto»',
    ).toBe('nada')
  })
}

// ── el control que impide que «alto usable» se degrade ──────────────────────
// 🔴 SIN ESTO, una fila alcanzaría en TODAS las pantallas y el spec pasaría con
//    una lista de 34px en un monitor de 1080. El piso es de una fila porque
//    debajo de ~1010 no hay lugar para más — no porque una fila alcance.
test('🔴 CONTROL — a 1080px SÍ se ven las tres líneas de una, sin scrollear', async ({ page }) => {
  await montar(page, 1080)
  await page.getByTestId('cart-customer-search').click()
  await page.waitForTimeout(400)

  const lista = await page.getByTestId('cart-lista').boundingBox()
  expect(lista, 'la lista del carrito no tiene caja').not.toBeNull()
  const fuera: string[] = []
  const items = page.getByTestId('cart-item-price')
  for (let i = 0; i < LINEAS; i++) {
    const b = await items.nth(i).boundingBox()
    if (!b || b.height === 0) { fuera.push(`línea ${i + 1}: sin caja`); continue }
    const dentro = b.y >= lista!.y - 1 && b.y + b.height <= lista!.y + lista!.height + 1
      && b.y >= 0 && b.y + b.height <= 1080
    if (!dentro) fuera.push(`línea ${i + 1}: y=${Math.round(b.y)}..${Math.round(b.y + b.height)}`)
  }
  expect(
    fuera.join(' · ') || 'nada',
    'a 1080px las tres líneas tienen que verse SIN scrollear. Si esto se pone rojo, ' +
    '«alto usable» se degradó a una fila donde caben tres',
  ).toBe('nada')
})

// ── el estado que nadie medía ───────────────────────────────────────────────
// 🔴 Elegir un cliente AGREGA ALTO —el resumen «le estás vendiendo a X»— y
//    ningún caso lo medía. El picker abierto empuja mientras está abierto;
//    éste empuja DESPUÉS de cerrarse, así que es un estado PERMANENTE de la
//    venta y no uno momentáneo.
for (const alto of [600, 768]) {
  test(`🔴 a ${alto}px, con un cliente YA ELEGIDO, la lista tiene alto usable y su última línea es alcanzable`, async ({ page }) => {
    await montar(page, alto)
    await page.getByTestId('cart-customer-search').click()
    const opcion = page.getByTestId('cart-customer-option').first()
    await expect(opcion, 'el lab necesita al menos un cliente activo').toBeVisible({ timeout: 15_000 })
    await opcion.click()
    await expect(page.getByTestId('cart-customer-resumen')).toBeVisible()
    await alFondoDeLaLista(page)

    const mal = await loQueIncumple(page, alto)
    expect(
      mal.join(' · ') || 'nada',
      `a ${alto}px con el cliente elegido, la cajera no puede ver lo que está vendiendo. ` +
      'Y este estado NO es momentáneo: queda así toda la venta',
    ).toBe('nada')
  })
}
