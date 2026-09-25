import { test, expect, type Page } from '@playwright/test'
import { loginAsOwner } from './helpers/auth'
import { cobrarEnEfectivo } from './helpers/pos'
import { openShiftIfClosed, closeShiftIfOpen } from './helpers/shift'
import { crearCategoria, crearProducto, desactivar } from './helpers/fixture'

/**
 * ⚠️  Suite para el LABORATORIO. NO correr contra producción.
 *
 * Cubre el fallo que antes era MUDO: la venta se cobra, `assignOrderNumber`
 * falla y la venta queda SIN número — invisible en el Historial (ordena por
 * número), sin ticket reimprimible y sin contar en getShiftSalesCount.
 *
 * El fallo se fuerza interceptando la RPC `next_order_number` con
 * `page.route`, que es la única forma limpia de provocarlo desde afuera: la
 * secuencia no falla sola en un lab sano.
 *
 * Lo que se verifica:
 *   1. La venta SE COBRA igual (el fallo del número no tumba el cobro).
 *   2. El cajero VE el aviso en vez de un "¡Cobro exitoso!" que miente.
 *   3. "Reintentar" completa el número una vez que la RPC vuelve.
 *   4. El reintento NO quema un número extra cuando el que falló fue el UPDATE
 *      (la secuencia ya había entregado uno y se reusa).
 */

const SUFFIX = Date.now().toString().slice(-6)
const CAT = `E2E NumFail ${SUFFIX}`
const PROD = `E2E NumFailProd ${SUFFIX}`

// Ids de lo sembrado por API (deuda 131). Los casos siguen buscando por NOMBRE.
let ID_CAT = ''
let ID_PROD = ''

const RPC_NEXT = '**/rest/v1/rpc/next_order_number'
const PATCH_ORDERS = '**/rest/v1/orders?id=eq.*'

function parseVentaNumber(text: string): number {
  const m = text.match(/#(\d+)/)
  if (!m) throw new Error(`No se encontró número de venta en: "${text}"`)
  return Number(m[1])
}

/**
 * Cobra el producto al contado y deja el diálogo del DESPUÉS en pantalla.
 *
 * 🔴 RE-DERIVADO en el corte 4 del cobro en línea, y este spec se re-derivó
 * PRIMERO y SOLO porque es el único de los siete cuyo SUJETO vive en el cobro:
 * los otros seis lo usan de camino. Acá el sujeto es una venta **cobrada** cuyo
 * número falló, y su reintento — que §8.17 decidió que tiene diálogo propio.
 *
 * ⚠️ QUÉ CAMBIÓ Y QUÉ NO, comparado caso por caso contra el original antes de
 * borrar nada. Lo que cambió es el CAMINO: cinco pasos del modal —abrir, elegir
 * método, «Continuar», el monto en el segundo paso, «Confirmar cobro»— pasan a
 * tres en la columna. **Ninguna aserción se movió**: las cuatro del original
 * vivían todas acá adentro, en el camino, y los casos no tenían ninguna sobre el
 * modal. Por eso el helper queda más corto y los casos quedan **idénticos** —
 * la simplificación es del camino, no de lo que se asevera, que es la distinción
 * que había que comprobar antes de dar el paso.
 */
async function cobrar(page: Page) {
  await page.goto('/ventas')
  await openShiftIfClosed(page, 0)
  await page.getByPlaceholder('Buscar producto...').fill(PROD)
  // Por NOMBRE y no `.first()`: el buscador acota, pero apoyarse en que acote a
  // uno es la clase «locator apoyado en unicidad no declarada» (deuda 67).
  await page.getByTestId('product-card').filter({ hasText: PROD }).first().click()

  // Camino, no sujeto: este spec mide otra cosa. Los dos botones del efectivo
  // viven en `cobrarEnEfectivo`.
  await cobrarEnEfectivo(page, 200_000)
}

test.describe.serial('Numeración: fallo visible + reintento', () => {
  // 🔴 Sembrado POR API (deuda 131). Pregunta obligatoria: nada de paso — nombre,
  //    precio y categoría, y el seguimiento que nace prendido lo verifica el
  //    helper releyendo la fila.
  test('setup: categoría y producto', async () => {
    ID_CAT = await crearCategoria(CAT)
    ID_PROD = await crearProducto({ nombre: PROD, precio: 10000, categoria: ID_CAT })
  })

  test('si falla next_order_number: la venta se cobra y el cajero VE el aviso', async ({ page }) => {
    await loginAsOwner(page)
    await page.route(RPC_NEXT, (route) => route.abort())

    await cobrar(page)

    // El cobro llega a éxito igual: el número no es condición para cobrar.
    await expect(page.getByText('¡Cobro exitoso!')).toBeVisible({ timeout: 15_000 })
    // Y el fallo YA NO ES MUDO.
    await expect(page.getByTestId('success-sin-numero')).toBeVisible()
    await expect(page.getByText('Venta registrada — sin número asignado')).toBeVisible()
    await expect(page.getByTestId('retry-order-number')).toBeEnabled()

    await page.unroute(RPC_NEXT)
    await page.getByRole('button', { name: 'Nueva venta' }).click()
  })

  test('"Reintentar" asigna el número cuando la RPC vuelve', async ({ page }) => {
    await loginAsOwner(page)
    await page.route(RPC_NEXT, (route) => route.abort())

    await cobrar(page)
    await expect(page.getByTestId('success-sin-numero')).toBeVisible({ timeout: 15_000 })

    // Se restablece la RPC y el cajero reintenta.
    await page.unroute(RPC_NEXT)
    await page.getByTestId('retry-order-number').click()

    // El aviso desaparece y aparece el número.
    await expect(page.getByTestId('success-sin-numero')).toBeHidden({ timeout: 15_000 })
    await expect(page.getByText(/¡Venta #\d+ registrada!/)).toBeVisible()
    const num = parseVentaNumber(await page.getByTestId('success-order-number').innerText())
    expect(num).toBeGreaterThan(0)

    await page.getByRole('button', { name: 'Nueva venta' }).click()
  })

  test('si falla el UPDATE: el reintento REUSA el número, no quema otro', async ({ page }) => {
    await loginAsOwner(page)

    // Deja pasar next_order_number (entrega el número) pero tumba el PATCH que
    // lo graba. Es el modo de fallo PEOR: el contador de la sede ya avanzó.
    // El helper reintenta el UPDATE 3 veces solo; todas caen acá.
    await page.route(PATCH_ORDERS, (route) =>
      route.request().method() === 'PATCH' ? route.abort() : route.continue(),
    )

    await cobrar(page)
    await expect(page.getByTestId('success-sin-numero')).toBeVisible({ timeout: 20_000 })

    await page.unroute(PATCH_ORDERS)
    await page.getByTestId('retry-order-number').click()
    await expect(page.getByTestId('success-sin-numero')).toBeHidden({ timeout: 15_000 })

    const reusado = parseVentaNumber(await page.getByTestId('success-order-number').innerText())
    await page.getByRole('button', { name: 'Nueva venta' }).click()

    // La venta siguiente debe ser EXACTAMENTE reusado + 1. Si el reintento
    // hubiera pedido un número nuevo en vez de reusar el reservado, acá habría
    // un salto — que es justo el hueco que la asimetría de reintento evita.
    await cobrar(page)
    await expect(page.getByText(/¡Venta #\d+ registrada!/)).toBeVisible({ timeout: 15_000 })
    const siguiente = parseVentaNumber(await page.getByTestId('success-order-number').innerText())
    expect(siguiente).toBe(reusado + 1)

    await page.getByRole('button', { name: 'Nueva venta' }).click()
  })

  test('limpieza: cerrar turno, desactivar producto y categoría', async ({ page }) => {
    // 🔴 ESTA LIMPIEZA NO LIMPIABA NADA, y no fallaba: fallaba en SILENCIO.
    // Eran dos defectos encadenados:
    //  1. La confirmación de "Desactivar" un producto es un MODAL DE LA APP con
    //     botón "Sí, desactivar", no un `window.confirm` nativo. El test esperaba
    //     el nativo (`page.once('dialog')`), que nunca llega ⇒ el producto seguía
    //     activo.
    //  2. La categoría se "limpiaba" con un `click({button:'right'}).catch(()=>{})`
    //     — un no-op que además se tragaba su propio error. Y aunque se hubiera
    //     hecho bien, la app RECHAZA desactivar una categoría con productos
    //     activos ("Hay 1 producto en esta categoría"), así que sin (1) tampoco
    //     habría funcionado.
    // Resultado: cada corrida dejaba una categoría `E2E NumFail ...` viva.
    // Consecuencia real (2026-08-19): con 5 acumuladas, el strip de categorías del
    // POS empujaba el carrito fuera de pantalla y tumbó 3 tests AJENOS (pos.spec y
    // venta-espera) por residuo que no era de ellos.
    // Por eso cada paso ahora TERMINA EN UNA ASERCIÓN: una limpieza que no
    // verifica es indistinguible de una que no corre.
    //
    // ⚠️ LO DE ARRIBA ES HISTÓRICO y se conserva a propósito: describe cómo se
    //    veía este bloque cuando limpiaba por la pantalla, y es el origen de la
    //    deuda 67. Los dos defectos que nombra son **de la UI**, así que por API
    //    no pueden ocurrir — pero la lección que dejaron sí sigue viva, y es la
    //    que `desactivar` cumple: **cada paso termina en una aserción.**
    //
    // 🔴 CORRECCIÓN DE CLASIFICACIÓN (deuda 131): este bloque se había anotado como
    //    uno de los que NO se mueven, por su `expect(sw).toHaveAttribute
    //    ('aria-checked', 'true')`. Esa aserción **es un CONTROL** —comprueba que
    //    el interruptor está encendido ANTES de apagarlo, para que el clic no lo
    //    prenda— y no el sujeto de este archivo, que es el fallo de numeración.
    //    Un control del andamio se va con el andamio; un sujeto no. **Confundir
    //    las dos cosas deja por UI un bloque que no prueba nada de lo que el
    //    archivo dice probar.**
    await loginAsOwner(page)
    // 🔴 EL TURNO SE CIERRA POR LA PANTALLA Y NO SE MUEVE: es un RECURSO ÚNICO de
    //    la sede —hay una sola jornada abierta— y dejarlo abierto no ensucia,
    //    **impide que el spec siguiente exista**. Y no necesita `goto`: el
    //    encabezado del turno es global, así que opera sobre donde deje el login.
    await closeShiftIfOpen(page)

    // 🔴 POR API (deuda 131). El orden importa y por eso son dos llamadas y no
    //    una: la app RECHAZA desactivar una categoría con productos activos, y
    //    aunque por API no pase por esa validación, dejar el producto activo en
    //    una categoría apagada es un estado que nadie eligió.
    await desactivar('products', [ID_PROD])
    await desactivar('categories', [ID_CAT])
  })
})
