import { test, expect, type Page } from '@playwright/test'
import { loginAsOwner } from './helpers/auth'
import { crearCategoria as sembrarCategoria, desactivar } from './helpers/fixture'

// Sufijo único por corrida → datos idempotentes y aislados.
const SUFFIX = Date.now().toString().slice(-6)
// Nombres LARGOS a propósito: el objetivo es forzar el desborde del strip de tabs
// con pocas categorías, para no ensuciar el lab con veinte filas.
const CATS = [1, 2, 3, 4].map((n) => `E2E Categoria Larga ${n} ${SUFFIX}`)

const TABS = 'category-tabs-scroll'

// Ids de lo sembrado por API (deuda 131).
const IDS: string[] = []

// Medir el strip antes de que lleguen las categorías da un falso negativo: con
// solo "Todos" no hay desborde. Esperar a que el tab de la última categoría esté
// en el DOM es la señal de que el fetch ya pintó.
async function esperarCategorias(page: Page) {
  await expect(page.getByRole('button', { name: new RegExp(CATS[CATS.length - 1]) })).toBeVisible()
}

test.describe.serial('Scroll de categorías en Productos', () => {
  // 🔴 Sembrado POR API (deuda 131). Pregunta obligatoria: nada de paso — lo que
  //    este archivo mide es que el STRIP no desborde, no que crear una categoría
  //    funcione. Las cuatro sólo tienen que existir y estar activas.
  test('preparación: crear categorías hasta desbordar el strip', async () => {
    for (const cat of CATS) IDS.push(await sembrarCategoria(cat))
  })

  test('el strip de tabs NO desborda su contenedor y es scrolleable', async ({ page }) => {
    // Viewport angosto: garantiza el desborde sin depender de cuántas categorías
    // tenga el lab. El bug original se veía igual en pantalla ancha con muchas.
    await page.setViewportSize({ width: 900, height: 720 })
    await loginAsOwner(page)
    await page.goto('/productos')

    const tabs = page.getByTestId(TABS)
    await expect(tabs).toBeVisible()
    await esperarCategorias(page)

    // 1. HAY desborde: si esto falla el test es vacuo (no probaría nada) y hay
    //    que endurecer la preparación, no relajar la aserción.
    const { scrollWidth, clientWidth } = await tabs.evaluate((el) => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    }))
    expect(scrollWidth).toBeGreaterThan(clientWidth)

    // 2. LA ASERCIÓN DEL BUG: el strip se queda DENTRO del ancho de la ventana.
    //    Sin `flex:1` + `minWidth:0` el flex item crecía con su contenido y los
    //    tabs de más quedaban fuera de alcance en vez de scrollear. Un assert de
    //    "scrollWidth > clientWidth" solo NO caza esto: un contenedor desbordado
    //    también lo cumple.
    const box = await tabs.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.x + box!.width).toBeLessThanOrEqual(900)

    // 3. Scrollea de verdad: el último tab se vuelve alcanzable.
    await tabs.evaluate((el) => { el.scrollLeft = el.scrollWidth })
    expect(await tabs.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0)
    await expect(page.getByRole('button', { name: new RegExp(CATS[CATS.length - 1]) })).toBeVisible()
  })

  test('la máscara de continuación aparece solo si queda contenido a la derecha', async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 720 })
    await loginAsOwner(page)
    await page.goto('/productos')

    const tabs = page.getByTestId(TABS)
    const fade = page.getByTestId('category-tabs-fade')
    await esperarCategorias(page)

    // Al inicio del scroll: hay más a la derecha → máscara visible.
    await expect(fade).toBeVisible()

    // Al final del scroll: no queda nada → la máscara se va. Es el punto del
    // diseño: un degradado permanente miente igual que no tener ninguno.
    await tabs.evaluate((el) => { el.scrollLeft = el.scrollWidth })
    await expect(fade).toHaveCount(0)
  })

  // 🔴 POR API (deuda 131). El `scrollIntoViewIfNeeded` de acá era una
  //    dependencia del estado de la pantalla —el tab podía quedar fuera de vista
  //    tras el scroll de los casos anteriores— y por API deja de existir.
  test('limpieza: desactivar las categorías creadas', async () => {
    await desactivar('categories', IDS)
  })
})
