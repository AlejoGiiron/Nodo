import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { loginAsOwner, ownerCreds } from './helpers/auth'

// ============================================================================
// UNA ESCRITURA NO EXISTE HASTA QUE TODOS SUS INSUMOS HAYAN CARGADO
//
// Los tres rojos que quedaban de la auditoría A1 (`docs/auditorias/A1`), que son
// la misma forma: un hook devuelve un default vacío mientras carga —`new Set()`,
// `[]`, `{}`— y un consumidor **escribe** con ese vacío. El resultado es
// plausible (una lista vacía, un cero) y por eso nadie lo mira.
//
//   56 · guardar un producto antes de que carguen sus extras/receta LOS BORRA
//   57 · el modal de extras deja confirmar mientras dice "Cargando extras…"
//   59 · agregar al carrito antes de que cargue el Set de extras LOS SALTEA
//
// ⚠️ El índice decía además «58 · config de caja: `{}` muestra los defaults como
//    si fueran lo guardado», y **ese caso no está escrito en ningún archivo**
//    —verificado con un grep sobre `tests/`—. El encabezado prometía tres y hay
//    dos. Queda anotado acá en vez de borrado: la fila de A1 sigue viva y sin
//    cubrir, y borrar la línea la haría desaparecer del único lugar donde
//    alguien la va a volver a leer.
//
// 🔴 LA 56 ES DISTINTA DE LAS OTRAS DOS EN GRAVEDAD: no persiste un dato malo,
//    **destruye uno bueno ya guardado**. `reconcile` re-lee la base y calcula
//    `toRemove` contra la selección en memoria; con la selección vacía, toRemove
//    es todo. En un compuesto eso borra la receta, y un compuesto sin receta
//    **deja de descontar stock al venderse**.
//
// La carrera es real —hay una vuelta de red por producto— pero no se gana a mano
// de forma determinista, así que se PROVOCA bloqueando la respuesta. Y cuando el
// defecto está vivo, el test **ejecuta la acción** para que el rojo diga qué se
// rompió: el destrozo es la mitad del hallazgo, no el botón habilitado.
// ============================================================================

test.describe.configure({ mode: 'serial' })

function loadEnv(path: string) {
  try {
    for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  } catch { /* ignore */ }
}
loadEnv('.env'); loadEnv('.env.test')

const SUFFIX = Date.now().toString().slice(-6)
const CAT = `E2E Carga ${SUFFIX}`
const INSUMO = `E2E CargaInsumo ${SUFFIX}`
const COMPUESTO = `E2E CargaCompuesto ${SUFFIX}`
const EXTRA = `E2E CargaExtra ${SUFFIX}`

let db: SupabaseClient
let SEDE = ''
let CAT_ID = ''
let INSUMO_ID = ''
let COMPUESTO_ID = ''
let EXTRA_ID = ''

async function conectar(): Promise<SupabaseClient> {
  const c = createClient(process.env.VITE_NODO_SUPABASE_URL!, process.env.VITE_NODO_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  })
  const { error } = await c.auth.signInWithPassword(ownerCreds())
  if (error) throw error
  return c
}

/** Filas de receta del compuesto — lo que la 56 puede borrar. */
async function filasReceta(): Promise<number> {
  const { count, error } = await db
    .from('product_components')
    .select('id', { count: 'exact', head: true })
    .eq('parent_id', COMPUESTO_ID)
  if (error) throw error
  return count ?? 0
}

/** Extras asignados al compuesto — lo otro que la 56 puede borrar. */
async function filasExtras(): Promise<number> {
  const { count, error } = await db
    .from('product_extras')
    .select('id', { count: 'exact', head: true })
    .eq('product_id', COMPUESTO_ID)
  if (error) throw error
  return count ?? 0
}

test.beforeAll(async () => {
  db = await conectar()
  const uid = (await db.auth.getUser()).data.user!.id
  SEDE = (await db.from('profiles').select('sede_id').eq('id', uid).single()).data!.sede_id as string

  CAT_ID = (await db.from('categories').insert({ sede_id: SEDE, name: CAT }).select('id').single()).data!.id
  INSUMO_ID = (await db.from('products').insert({
    sede_id: SEDE, category_id: CAT_ID, name: INSUMO, price: 1000,
    kind: 'simple', stock_tracking: true, stock_qty: 100,
  }).select('id').single()).data!.id
  COMPUESTO_ID = (await db.from('products').insert({
    sede_id: SEDE, category_id: CAT_ID, name: COMPUESTO, price: 9000,
    kind: 'composite', stock_tracking: false,
  }).select('id').single()).data!.id
  EXTRA_ID = (await db.from('extras').insert({
    sede_id: SEDE, name: EXTRA, price: 500, is_active: true,
  }).select('id').single()).data!.id

  // Lo que hay que NO perder: una receta y un extra asignado, ya en la base.
  await db.from('product_components').insert({
    sede_id: SEDE, parent_id: COMPUESTO_ID, component_id: INSUMO_ID, qty: 2,
  })
  await db.from('product_extras').insert({ product_id: COMPUESTO_ID, extra_id: EXTRA_ID })

  expect(await filasReceta(), 'fixture: el compuesto tiene su receta').toBe(1)
  expect(await filasExtras(), 'fixture: el compuesto tiene su extra').toBe(1)
})

test.afterAll(async () => {
  if (!db) return
  await db.from('product_components').delete().eq('parent_id', COMPUESTO_ID)
  await db.from('product_extras').delete().eq('product_id', COMPUESTO_ID)
  await db.from('products').update({ is_active: false }).in('id', [INSUMO_ID, COMPUESTO_ID])
  await db.from('extras').update({ is_active: false }).eq('id', EXTRA_ID)
  await db.from('categories').update({ is_active: false }).eq('id', CAT_ID)
})

/** Abre el modal de edición de un producto desde el catálogo. */
async function abrirEdicion(page: Page, nombre: string) {
  await page.goto('/productos')
  // Se filtra por el buscador y se entra por el botón "Editar" de la tarjeta,
  // que es el flujo real (la tarjeta entera no abre el modal).
  await page.getByPlaceholder('Buscar producto...').fill(nombre)
  const card = page.getByTestId('catalogo-row').filter({ hasText: nombre }).first()
  await expect(card).toBeVisible({ timeout: 15_000 })
  await card.getByTitle('Editar', { exact: true }).click()
  await expect(page.getByTestId('product-modal')).toBeVisible({ timeout: 10_000 })
}

// ── 56 ──────────────────────────────────────────────────────────────────────

test('56 · guardar un producto sin que carguen sus extras y su receta NO puede borrarlos', async ({ page }) => {
  await loginAsOwner(page)

  // 🔒 Las dos consultas que alimentan la selección en memoria. Con ellas
  //    colgadas al MONTAR, `selectedExtras` queda `new Set()` y `recipeRows`
  //    `[]` — los defaults que no distinguen "todavía no sé" de "no tiene nada".
  //
  // ⚠️ El bloqueo se LEVANTA antes de guardar, y es deliberado: `reconcile` hace
  //    su propio GET a las mismas tablas para calcular el diff. Si siguiera
  //    bloqueado, la mutación no leería nada y no borraría — el rojo diría "el
  //    botón se ofrece" sin demostrar el destrozo, que es la mitad del hallazgo.
  //    (Pasó: primer intento, la receta quedó intacta y el rojo no probaba nada.)
  //    Levantarlo reproduce el escenario real: el modal montó sin datos, el
  //    usuario guarda, y el reconcile SÍ lee la base.
  let bloquear = true
  const colgarGet = async (route: import('@playwright/test').Route) => {
    if (bloquear && route.request().method() === 'GET') return
    await route.continue()
  }
  await page.route('**/rest/v1/product_extras*', colgarGet)
  await page.route('**/rest/v1/product_components*', colgarGet)

  await abrirEdicion(page, COMPUESTO)

  const guardar = page.getByRole('button', { name: 'Guardar cambios' })
  const seOfrece = (await guardar.count()) > 0 && await guardar.isEnabled()

  if (seOfrece) {
    bloquear = false          // el reconcile lee la base, como en la realidad
    await guardar.click()
    await page.waitForTimeout(3_000)
    expect(
      await filasReceta(),
      'SE BORRÓ LA RECETA: reconcile re-leyó la base y calculó toRemove contra una ' +
      'selección vacía que nunca había cargado. Un compuesto sin receta deja de ' +
      'descontar stock al venderse',
    ).toBe(1)
    expect(
      await filasExtras(),
      'SE BORRARON LOS EXTRAS ASIGNADOS, por la misma razón',
    ).toBe(1)
  }

  expect(
    seOfrece,
    'Guardar no debe ofrecerse hasta que extras y receta hayan cargado: guardar con ' +
    'la selección vacía BORRA lo que ya estaba en la base',
  ).toBe(false)

  // Control: liberadas las consultas, guardar funciona y NO destruye nada.
  bloquear = false
  await page.unroute('**/rest/v1/product_extras*')
  await page.unroute('**/rest/v1/product_components*')
  await abrirEdicion(page, COMPUESTO)
  await expect(page.getByRole('button', { name: 'Guardar cambios' })).toBeEnabled({ timeout: 15_000 })
  await page.getByRole('button', { name: 'Guardar cambios' }).click()
  await page.waitForTimeout(3_000)
  expect(await filasReceta(), 'con los insumos cargados, la receta sobrevive').toBe(1)
  expect(await filasExtras(), 'y los extras también').toBe(1)
})

// ── 57 ──────────────────────────────────────────────────────────────────────

test('57 · el modal de extras no deja confirmar mientras dice "Cargando extras…"', async ({ page }) => {
  await loginAsOwner(page)

  // ⚠️ El bloqueo arranca APAGADO y se enciende recién antes del clic. Razón
  //    medida: `useProductsWithExtras` —el hook que decide si el POS abre este
  //    modal o agrega directo— consulta la MISMA tabla. Bloqueando desde el
  //    principio, ese Set quedaba vacío, el POS agregaba sin abrir nada, y el
  //    test fallaba por una razón que no era el defecto. Tercera vez en la
  //    sesión que un bloqueo alcanza de más (ver CLAUDE.md: un rojo que no
  //    reproduce el defecto es tan inútil como un verde que no lo mide).
  let bloquear57 = false
  await page.route('**/rest/v1/product_extras*', async (route) => {
    if (bloquear57 && route.request().method() === 'GET') return
    await route.continue()
  })

  await page.goto('/ventas')
  await expect(page.getByTestId('cart-total')).toBeVisible({ timeout: 15_000 })
  // Por el buscador: el POS abre en una categoría y el compuesto está en la suya.
  await page.getByPlaceholder('Buscar producto...').fill(COMPUESTO)
  const card = page.getByTestId('product-card').filter({ hasText: COMPUESTO }).first()
  await expect(card, 'el compuesto con extras tiene que estar en el POS').toBeVisible({ timeout: 15_000 })
  await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {})

  bloquear57 = true          // desde acá, los extras DEL PRODUCTO no llegan
  await card.click()

  // El modal se abre porque el producto SÍ tiene extras (lo dice
  // `useProductsWithExtras`, que ya cargó); los suyos todavía no llegaron.
  await expect(page.getByTestId('item-config-modal')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText('Cargando extras...')).toBeVisible()

  const confirmar = page.getByTestId('item-config-confirm')
  const seOfrece = (await confirmar.count()) > 0 && await confirmar.isEnabled()

  if (seOfrece) {
    await confirmar.click()
    // La línea entró al carrito SIN extras: vale menos de lo que debería, y así
    // se cobra. `available` era [] mientras cargaba, así que `onConfirm([])`.
    await expect(page.getByTestId('cart-item-extras')).toHaveCount(0)
    expect(
      seOfrece,
      'SE AGREGÓ LA LÍNEA SIN EXTRAS: `available` estaba vacío porque la consulta no ' +
      'había respondido, y la venta se cobra de menos',
    ).toBe(false)
  }

  expect(
    seOfrece,
    'confirmar no debe ofrecerse mientras los extras del producto no hayan cargado',
  ).toBe(false)

  // Control: liberada la consulta, el modal ofrece confirmar y el extra está.
  bloquear57 = false
  await page.unroute('**/rest/v1/product_extras*')
  await page.reload()
  await expect(page.getByTestId('cart-total')).toBeVisible({ timeout: 15_000 })
  await page.getByPlaceholder('Buscar producto...').fill(COMPUESTO)
  await page.getByTestId('product-card').filter({ hasText: COMPUESTO }).first().click()
  await expect(page.getByTestId('item-config-modal')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByTestId('item-config-extra')).toHaveCount(1, { timeout: 15_000 })
  await expect(page.getByTestId('item-config-confirm')).toBeEnabled()
})

const PRODUCTO_CON_EXTRA = 'Lab Coctel'
const parseCOP = (t: string) => Number(t.replace(/[^\d]/g, ''))

test('59 · agregar al carrito antes de que cargue el Set de extras LOS SALTEA — y cobra de menos', async ({ page }) => {
  // ==========================================================================
  // 🔴 CUARTA FILA DE LA TABLA DE A1, Y LA HERMANA QUE A1 NO BARRIÓ.
  //
  //    A1 arregló el consumidor del MODAL (`onConfirm([])`) y dejó el hook
  //    mudo: `useProductsWithExtras` devolvía `query.data ?? new Set()`, o sea
  //    **el mismo valor mientras carga y cuando de verdad no hay extras**.
  //    `handleAddProduct` lee ese Set para decidir si abre el modal, así que
  //    con el Set todavía vacío el producto entra al carrito DIRECTO,
  //    salteándose sus extras. La venta se cobra de menos y no hay ningún
  //    aviso: la línea se ve perfectamente normal.
  //
  //    El corolario de A1 nombraba a este hook como el único de los cuatro
  //    donde el culpable era el hook — y estaba escrito EN LA MISMA TABLA que
  //    el arreglo parcial.
  //
  // ⚠️ LO QUE ESTE CASO ASEVERA NO ES QUE EL MODAL APAREZCA. El modal ausente
  //    es el SÍNTOMA; el defecto es la plata que falta. Por eso el rojo mide la
  //    línea y el total, y lo dice con esas palabras.
  //
  // 🔴 Y la acción NO SE OFRECE mientras el Set carga: la fila se ve pero no
  //    responde. A1 ya decidió que no es un spinner —«es que el botón no se
  //    renderiza»—; acá la fila ENTERA es el botón, y no renderizarla haría
  //    parpadear el catálogo completo por un producto que quizá ni tiene
  //    extras. Se ve, no responde.
  // ==========================================================================
  await loginAsOwner(page)

  let bloquear = true
  await page.route('**/rest/v1/product_extras*', async (route) => {
    if (bloquear && route.request().method() === 'GET') return
    await route.continue()
  })

  await page.goto('/ventas')
  await expect(page.getByTestId('cart-total')).toBeVisible({ timeout: 15_000 })

  const fila = page.getByTestId('product-card').filter({ hasText: PRODUCTO_CON_EXTRA }).first()
  await expect(fila, `el lab necesita "${PRODUCTO_CON_EXTRA}" en el mostrador`).toBeVisible()

  // La fila SE VE —esto es la mitad «se ve»— y DECLARA que no acepta la acción.
  await expect(
    fila,
    'la fila tiene que declarar que no responde mientras no sabe si el producto tiene extras',
  ).toHaveAttribute('aria-disabled', 'true')

  // 🔴 `force: true`, Y ES LA PARTE QUE HACE QUE ESTO PRUEBE ALGO.
  //    Playwright respeta `aria-disabled` y se NIEGA a clickear, así que un
  //    `.click()` normal probaría **que Playwright no clickea**, no que el
  //    producto se niega. Son cosas distintas: alguien podría borrar el guard de
  //    `handleAddProduct` y dejar el atributo, y el caso seguiría verde.
  //    Forzando el clic, el evento LLEGA al manejador y lo que se mide es el
  //    guard del producto.
  await fila.click({ force: true })
  await page.waitForTimeout(1_500)   // si va a entrar, ya entró

  const lineas = await page.getByTestId('cart-item-price').count()
  const bloquesDeExtras = await page.getByTestId('cart-item-extras').count()
  const total = parseCOP(await page.getByTestId('cart-total').innerText())

  expect(
    lineas,
    `LA FILA RESPONDIÓ AL CLIC con el Set de extras todavía cargando: entró ${lineas} línea con ` +
    `${bloquesDeExtras} bloque(s) de extras y el total quedó en ${total}. «${PRODUCTO_CON_EXTRA}» ` +
    `TIENE un extra, así que esa venta se cobra DE MENOS y nadie lo ve — la línea se lee normal. ` +
    'El modal ausente es el síntoma; la plata que falta es el defecto.',
  ).toBe(0)

  // ── CONTROL: sin el bloqueo, el MISMO clic sí abre el modal ──────────────
  // Sin esto el caso pasaría si el producto simplemente no tuviera extras — el
  // verde por la razón equivocada, que es lo que la mitad de arriba no puede
  // distinguir por sí sola.
  // 🔴 `unroute` y no un flag: dejar el handler puesto con `bloquear=false` es
  //    una condición MÁS que puede fallar, y de hecho falló —la fila seguía
  //    `aria-disabled` tras el reload—. Quitar el interceptor entero no deja
  //    ninguna: el control tiene que ser lo más simple del caso, o deja de ser
  //    control.
  bloquear = false
  await page.unroute('**/rest/v1/product_extras*')
  await page.reload()
  await expect(page.getByTestId('cart-total')).toBeVisible({ timeout: 15_000 })
  await page.getByTestId('product-card').filter({ hasText: PRODUCTO_CON_EXTRA }).first().click()
  await expect(
    page.getByTestId('item-config-modal'),
    `control del propio caso: con el Set cargado, "${PRODUCTO_CON_EXTRA}" TIENE que abrir el modal. ` +
    'Si no lo abre, el producto perdió su extra y la mitad de arriba no estaba midiendo nada',
  ).toBeVisible({ timeout: 15_000 })
})
