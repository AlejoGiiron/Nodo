import { test, expect } from '@playwright/test'
import { loginAsOwner } from './helpers/auth'
import { waitPosReady } from './helpers/pos'

// ============================================================================
// EL CARRITO DEL POS NO PUEDE ENCOGERSE PORQUE EL CATÁLOGO SE NIEGUE A CEDER.
//
// 🔴 BUG DE PRODUCCIÓN, no de laboratorio. El panel del catálogo es
// `flex: '0 0 60%'` y, sin `minWidth: 0`, conserva el `min-width: auto` por
// defecto: **se niega a bajar de su ancho min-content**. Cuando su contenido no
// entra, el panel CRECE más allá del 60% y se come el carrito. Medido en su
// momento: a 1024px el carrito quedaba en **86px** — el cajero no podía cobrar.
//
// ── ESTE ARCHIVO ERA `pos-categorias-layout.spec.ts` ────────────────────────
// 🔴 Y EL RENOMBRE ES EL HALLAZGO, no un trámite: **las categorías nunca fueron
//    el sujeto — eran el DISPARADOR**. El sujeto siempre fue que el panel ceda.
//    El strip de categorías se retiró el 2026-09-03 (§8.15 del mostrador: la
//    lista muestra el catálogo entero), así que el disparador de entonces ya no
//    existe. **La clase de defecto sí.**
//
// ⚠️ Y HOY EL DISPARADOR ES OTRO, más realista que el de antes: la fila del
//    catálogo ganó la **columna CATEGORÍA**, y los nombres del cliente son
//    largos —`CLEMBUTEROL 100 TBL VENOM` con `Farmacología` al lado—. Ese ancho
//    es exactamente lo que empuja el min-content del panel.
//    La versión anterior FABRICABA siete categorías con nombres de otro cliente
//    para forzar el escenario; ahora el escenario **es el catálogo real**, que
//    es mejor entrada y además elimina una fixture que insertaba y borraba
//    filas en cada corrida.
// ============================================================================

test.describe.configure({ mode: 'serial' })

// 214px desde el re-skin (§3 del design system). Era 224 (`w-56` de Tailwind).
// Es una MEDIDA de la app que el spec necesita para calcular el área útil: si
// el sidebar se vuelve a mover, esta línea también.
const SIDEBAR = 214

const ANCHOS = [
  [1024, 'la terminal chica: es donde el defecto llegaba a 86px de carrito'],
  [1280, 'el control: si acá tampoco pasara, la aserción no mide'],
] as const

for (const [W, porque] of ANCHOS) {
  test(`a ${W}px el catálogo se queda en su 60% y se puede cobrar — ${porque}`, async ({ page }) => {
    await loginAsOwner(page)
    await page.setViewportSize({ width: W, height: 720 })
    await page.goto('/ventas')
    await waitPosReady(page)

    const util = W - SIDEBAR
    const m = await page.evaluate(() => {
      const root = document.querySelector('main .flex.h-full.overflow-hidden')
      const b = (e?: Element | null) => (e ? e.getBoundingClientRect() : null)
      return {
        catW: Math.round(b(root?.children[0])?.width ?? -1),
        cartW: Math.round(b(root?.children[1])?.width ?? -1),
      }
    })

    // El catálogo se queda en su 60%: no invade al hermano. Sin `minWidth: 0`
    // acá medía 714 y el carrito 86.
    expect(m.catW, `a ${W}px el catálogo se pasó de su 60% y le comió ancho al carrito`)
      .toBe(Math.round(util * 0.6))
    expect(m.cartW).toBe(util - Math.round(util * 0.6))

    // Y el total de cobro entra entero en pantalla — la consecuencia que
    // importa, y la que un ancho en píxeles solo no expresa.
    const caja = (await page.getByTestId('cart-total').boundingBox())!
    expect(caja.width).toBeGreaterThan(0)
    expect(caja.x + caja.width, 'el total del carrito quedó fuera de la pantalla')
      .toBeLessThanOrEqual(W + 1)
  })
}

test('🔴 el mostrador muestra TODO el catálogo, no una categoría', async ({ page }) => {
  // ==========================================================================
  // 🔴 ESTE CASO NO EXISTÍA, Y ES EL QUE CUBRE EL DEFECTO QUE DESTAPÓ SACAR EL
  //    STRIP — que no era de layout.
  //
  //    Antes, la lista se poblaba con `products.filter(category_id ===
  //    resolvedCat)`, y `resolvedCat` caía en `categories[0]` por un
  //    `useEffect`. **No existía «Todos».** Sin escribir en el buscador el
  //    mostrador mostraba UNA categoría y las otras siete estaban a un clic que
  //    nadie ve: con el catálogo real del cliente, la mayor parte del producto
  //    era inalcanzable por defecto.
  //
  // ⚠️ Ningún test lo cazaba, y no por falta de cobertura: la lista **tenía
  //    productos**, se podía vender, y todos los specs de cobro pasaban — usan
  //    `Lab Cerveza`, que casualmente cae en la primera categoría. Un caso que
  //    pidiera «hay al menos un producto» habría estado verde con el defecto
  //    puesto. Lo que lo mide es **contar contra la base**.
  // ==========================================================================
  await loginAsOwner(page)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/ventas')
  await waitPosReady(page)

  const filas = await page.getByTestId('product-card').count()
  const categorias = new Set(
    await page.getByTestId('product-categoria').allTextContents(),
  )

  expect(filas, 'el lab necesita catálogo, o el caso no mide nada').toBeGreaterThan(10)
  expect(
    categorias.size,
    `la lista muestra productos de ${categorias.size} categoría(s). Con una sola, el mostrador ` +
    'está mostrando el filtro por defecto en vez del catálogo — el defecto que el strip escondía',
  ).toBeGreaterThan(1)
})

test('🔴 el buscador encuentra POR CATEGORÍA — sin esto, sacar el strip retiraba una capacidad', async ({ page }) => {
  // 🔴 La decisión de sacar el strip se apoyó en «teclear es más rápido que
  //    navegar por pestañas». Ese argumento era FALSO mientras el buscador
  //    mirara sólo `name` y `description`: teclear «farma» no encontraba nada, y
  //    la categoría pasaba a ser una columna que se lee y por la que no se
  //    filtra. La capacidad no se movió de lugar: se habría perdido.
  await loginAsOwner(page)
  await page.goto('/ventas')
  await waitPosReady(page)

  const todos = await page.getByTestId('product-card').count()

  await page.getByTestId('pos-search').fill('farmacolog')
  const filtrados = page.getByTestId('product-card')
  await expect(filtrados.first(), 'teclear el nombre de una categoría tiene que encontrarla')
    .toBeVisible({ timeout: 10_000 })

  const n = await filtrados.count()
  expect(n, 'y tiene que ACOTAR: si devuelve todo, el filtro no está filtrando').toBeLessThan(todos)

  const categorias = new Set(await page.getByTestId('product-categoria').allTextContents())
  expect(
    [...categorias],
    'todos los resultados son de esa categoría: el buscador matcheó la categoría, no el nombre',
  ).toEqual(['Farmacología'])
})

test('🔴 la columna CATEGORÍA es TEXTO, sin el color del cliente (§1.2)', async ({ page }) => {
  // ==========================================================================
  // §4: «una categoría NO se pinta con la paleta de los estados». Se midieron
  // los ocho colores sembrados contra los tokens, y la colisión es literal:
  //
  //   Farmacología  #0ea5e9  ===  --action-500   (venta en curso)
  //   Pre entrenos  #f59e0b  ===  --warning-500  (aviso)
  //   Proteína      #10b981  →    el emerald de VENTO (deuda 88); verde es
  //                               SÓLO confirmación
  //   Quemadores    #ef4444  →    familia --danger
  //
  // Dos son coincidencia EXACTA de byte con un token semántico. Pintado, un
  // disco verde quedaría al lado del badge «Sin stock» en la misma fila.
  //
  // ⚠️ Este caso asevera una AUSENCIA, así que lleva su control: primero
  //    comprueba que la celda EXISTE y dice algo. Sin eso pasaría con la columna
  //    borrada — el verde por la razón equivocada.
  // ==========================================================================
  await loginAsOwner(page)
  await page.goto('/ventas')
  await waitPosReady(page)

  const celda = page.getByTestId('product-categoria').first()
  await expect(celda, 'control de la propia lectura: la columna tiene que existir').toBeVisible()
  expect((await celda.innerText()).trim().length, 'y decir algo').toBeGreaterThan(0)

  const color = await celda.evaluate((el) => getComputedStyle(el).color)
  const inkTres = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--ink-3').trim(),
  )
  expect(inkTres, 'el token tiene que existir, o la comparación no mide').not.toBe('')

  // `--ink-3` es #64748b → rgb(100, 116, 139). Se compara el valor computado
  // contra el token resuelto, no contra una cadena fijada a mano.
  const aRgb = (hex: string) => {
    const h = hex.replace('#', '')
    return `rgb(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)})`
  }
  expect(
    color,
    'la categoría se pinta con --ink-3 y no con `categories.color`: el color del cliente colisiona ' +
    'byte a byte con --action-500 y --warning-500',
  ).toBe(aRgb(inkTres))
})
