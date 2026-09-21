import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { loginAsOwner, ownerCreds } from './helpers/auth'
import { waitPosReady, cobrarCon } from './helpers/pos'
import { openShiftIfClosed } from './helpers/shift'

// ============================================================================
// MOVIMIENTOS DE STOCK · corte de fechas en Bogotá, filtro por producto, y
// A QUIÉN se le vendió
//
// 🔴 EL CORTE DE FECHAS SE ASEVERA SOBRE EL HECHO, NO SOBRE LA CONSECUENCIA.
//    La consecuencia —«un movimiento de las 21:00 no aparece filtrando el día
//    siguiente»— exige un movimiento con esa hora, y ninguna RPC deja elegir
//    `created_at`. Así que el caso mira LO QUE LA PANTALLA LE PIDE A LA BASE: los
//    límites que manda en la URL. La consecuencia se midió aparte contra LAB el
//    2026-09-17 (un movimiento de las 21:23 del 15 aparecía filtrando el 16).
//
// 🔴 EL FILTRO POR PRODUCTO TIENE TRES MITADES, y cada una tiene su caso:
//    · sin filtro se ve TODO — es el estado por defecto y no puede perderse;
//    · con filtro se ve SÓLO ese producto, y el ✕ vuelve a todo;
//    · un producto ARCHIVADO se puede encontrar — es la razón de que el buscador
//      consulte a la base y no al catálogo cargado, que trae sólo activos.
//
// ⚠️ NO va en `describe.serial`: los casos comparten la fixture, no el resultado.
// ============================================================================

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
const ACTIVO = `E2E MovActivo ${SUFFIX}`
const ARCHIVADO = `E2E MovArchivado ${SUFFIX}`
const SIN_STOCK = `E2E MovSinStock ${SUFFIX}`
// Producto PROPIO para la venta, y no uno de los de arriba: vender mueve el
// stock y agrega una fila, así que usar ACTIVO correría los saldos que los
// otros casos aseveran («0 +7 −2 = 5»). Un sujeto compartido es la deuda 67.
const VENDIDO = `E2E MovVendido ${SUFFIX}`
const CODIGO_ACTIVO = `E2EMOV-${SUFFIX}`

let db: SupabaseClient
let CAT_ID = ''
let ID_ACTIVO = ''
let ID_ARCHIVADO = ''
let ID_SIN_STOCK = ''
let ID_VENDIDO = ''
let CLIENTE = ''       // nombre exacto de un cliente activo de la sede

async function ajustar(id: string, qty: number) {
  const { error } = await db.rpc('adjust_stock', { p_product_id: id, p_qty: qty, p_reason: 'movimientos-stock.spec' })
  expect(error?.message ?? null, `adjust_stock falló armando la fixture (${qty})`).toBeNull()
}

test.beforeAll(async () => {
  db = createClient(process.env.VITE_NODO_SUPABASE_URL!, process.env.VITE_NODO_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  })
  const { error } = await db.auth.signInWithPassword(ownerCreds())
  if (error) throw error
  const uid = (await db.auth.getUser()).data.user!.id
  const sede = (await db.from('profiles').select('sede_id').eq('id', uid).single()).data!.sede_id as string

  const cat = await db.from('categories').insert({ sede_id: sede, name: `E2E Movimientos ${SUFFIX}` }).select('id').single()
  expect(cat.error?.message ?? null).toBeNull()
  CAT_ID = cat.data!.id

  const base = { sede_id: sede, category_id: CAT_ID, price: 1000, kind: 'simple' as const, stock_tracking: true }
  // ACTIVO nace en 0: su historia entera está en movimientos.
  const a = await db.from('products').insert({ ...base, name: ACTIVO, codigo: CODIGO_ACTIVO, stock_qty: 0 }).select('id').single()
  // ARCHIVADO nace con 10 SIN movimiento: existencia inicial fuera del registro.
  const b = await db.from('products').insert({ ...base, name: ARCHIVADO, stock_qty: 10 }).select('id').single()
  // SIN_STOCK no lleva existencia: `adjust_stock` igual le escribe movimiento
  // —sólo exige que sea simple— y la vista le da NULO, que es el caso del «—».
  const c = await db.from('products').insert({ ...base, name: SIN_STOCK, stock_tracking: false }).select('id').single()
  expect(a.error?.message ?? null).toBeNull()
  expect(b.error?.message ?? null).toBeNull()
  expect(c.error?.message ?? null).toBeNull()
  ID_ACTIVO = a.data!.id
  ID_ARCHIVADO = b.data!.id
  ID_SIN_STOCK = c.data!.id

  // VENDIDO nace en 0 y entra con UN ajuste: su segunda fila va a ser la venta.
  const d = await db.from('products').insert({ ...base, name: VENDIDO, stock_qty: 0 }).select('id').single()
  expect(d.error?.message ?? null).toBeNull()
  ID_VENDIDO = d.data!.id

  await ajustar(ID_ACTIVO, 7)
  await ajustar(ID_ACTIVO, -2)
  await ajustar(ID_ARCHIVADO, 4)
  await ajustar(ID_SIN_STOCK, 3)
  await ajustar(ID_VENDIDO, 5)

  // 🔴 El cliente se elige por nombre exacto desde la BASE, no con `.first()`
  //    sobre la pantalla: el valor esperado tiene que venir de un lugar
  //    INDEPENDIENTE de lo que la vista muestre, o el caso compararía la vista
  //    contra sí misma y un error de la vista se cancelaría solo.
  const cli = await db.from('customers').select('name')
    .eq('sede_id', sede).eq('is_active', true).order('name').limit(1)
  expect(cli.error?.message ?? null).toBeNull()
  expect(
    cli.data?.length,
    'el lab necesita al menos un cliente ACTIVO en esta sede, o el caso de la venta no puede montar su escenario',
  ).toBe(1)
  CLIENTE = cli.data![0].name as string

  const arch = await db.from('products').update({ is_active: false }).eq('id', ID_ARCHIVADO)
  expect(arch.error?.message ?? null, 'no se pudo archivar el producto de la fixture').toBeNull()
})

test.afterAll(async () => {
  if (!db) return
  // Productos con movimientos no se borran (FK restrict): se archivan. La
  // limpieza ASEVERA el estado, porque supabase-js no lanza (deuda 115).
  const ids = [ID_ACTIVO, ID_ARCHIVADO, ID_SIN_STOCK, ID_VENDIDO].filter(Boolean)
  const p = await db.from('products').update({ is_active: false }).in('id', ids)
  const c = await db.from('categories').update({ is_active: false }).eq('id', CAT_ID)
  const vivos = await db.from('products').select('id').in('id', ids).eq('is_active', true)
  expect(
    [p.error?.message, c.error?.message, vivos.error?.message, (vivos.data ?? []).length],
    `LIMPIEZA de movimientos-stock.spec: quedaron productos E2E activos (${ids.join(', ')})`,
  ).toEqual([undefined, undefined, undefined, 0])
})

async function abrirMovimientos(page: Page) {
  await loginAsOwner(page)
  await page.goto('/inventario')
  await page.getByTestId('inventory-tab-movements').click()
}

const filas = (page: Page) => page.getByTestId('stock-movement-row')

// ── fechas ───────────────────────────────────────────────────────────────────
test('🔴 el rango de fechas corta en Bogotá: del 16 es 05:00Z del 16 a 04:59:59.999Z del 17', async ({ page }) => {
  await abrirMovimientos(page)
  await page.getByTestId('mov-desde').fill('2026-09-16')
  const pedido = page.waitForRequest((r) =>
    r.url().includes('/stock_movements') && decodeURIComponent(r.url()).includes('created_at=lte.'))
  await page.getByTestId('mov-hasta').fill('2026-09-16')
  const url = decodeURIComponent((await pedido).url())

  expect(
    url.match(/created_at=gte\.[^&]+/)?.[0],
    'el DESDE no empieza a medianoche de Bogotá — con `new Date(día)` sale 00:00Z, las 19:00 del día anterior',
  ).toBe('created_at=gte.2026-09-16T05:00:00.000Z')
  expect(
    url.match(/created_at=lte\.[^&]+/)?.[0],
    'el HASTA no termina a medianoche de Bogotá',
  ).toBe('created_at=lte.2026-09-17T04:59:59.999Z')
})

// ── filtro por producto ─────────────────────────────────────────────────────
test('sin filtro se ven TODOS los productos — es el estado por defecto', async ({ page }) => {
  await abrirMovimientos(page)
  await expect(page.getByTestId('mov-producto-chip')).toHaveCount(0)
  const sinFiltro = 'sin filtro NO se ven todos los productos: el estado por defecto quedó filtrando'
  await expect(filas(page).filter({ hasText: ACTIVO }).first(), sinFiltro).toBeVisible()
  await expect(filas(page).filter({ hasText: ARCHIVADO }).first(), sinFiltro).toBeVisible()
})

test('buscar por código elige el producto, muestra SÓLO sus movimientos, y el ✕ vuelve a todos', async ({ page }) => {
  await abrirMovimientos(page)
  await page.getByTestId('mov-producto-buscar').fill(CODIGO_ACTIVO)
  const opcion = page.getByTestId('mov-producto-opcion').filter({ hasText: ACTIVO })
  await expect(opcion).toHaveCount(1)
  await opcion.click()

  await expect(page.getByTestId('mov-producto-chip')).toContainText(ACTIVO)
  // El SUJETO primero: sólo ese producto, y sus dos movimientos.
  await expect(filas(page), 'el filtro no acota: aparecen movimientos de OTROS productos').toHaveCount(2)
  const nombres = await page.getByTestId('stock-movement-product').allInnerTexts()
  expect([...new Set(nombres)], 'con el filtro puesto aparecen movimientos de otros productos').toEqual([ACTIVO])

  await page.getByTestId('mov-producto-quitar').click()
  await expect(page.getByTestId('mov-producto-chip')).toHaveCount(0)
  await expect(filas(page).filter({ hasText: ARCHIVADO }).first(), 'el ✕ no devolvió la vista completa').toBeVisible()
})

test('🔴 un producto ARCHIVADO se encuentra y se filtra — es el que se busca cuando algo no cuadra', async ({ page }) => {
  await abrirMovimientos(page)
  await page.getByTestId('mov-producto-buscar').fill(ARCHIVADO)
  const opcion = page.getByTestId('mov-producto-opcion').filter({ hasText: ARCHIVADO })
  await expect(opcion, 'el buscador no devuelve productos archivados').toHaveCount(1)
  await expect(opcion).toContainText('Archivado')
  await opcion.click()

  await expect(page.getByTestId('mov-producto-chip')).toContainText('Archivado')
  await expect(filas(page), 'el filtro no acota: aparecen movimientos de OTROS productos').toHaveCount(1)
  await expect(filas(page).first().getByTestId('stock-movement-qty')).toContainText('+4')
})

// ── la columna de existencia y la línea para cuadrar ────────────────────────
test('🔴 la línea «existencia sin movimiento» aparece con hueco y NO aparece sin él', async ({ page }) => {
  await abrirMovimientos(page)
  const linea = page.getByTestId('mov-existencia-sin-movimiento')

  // Sin producto elegido no se pinta: el número es de UN producto.
  await expect(linea, 'la línea se pintó sin producto elegido: ese número no es de nadie').toHaveCount(0)

  // ARCHIVADO nació con 10 de existencia y sólo tiene +4 de movimiento.
  await page.getByTestId('mov-producto-buscar').fill(ARCHIVADO)
  await page.getByTestId('mov-producto-opcion').filter({ hasText: ARCHIVADO }).click()
  await expect(linea).toContainText('10')

  // CONTROL: ACTIVO nació en 0, así que NO tiene hueco. Sin este caso, un
  // defecto de «siempre muestra la línea» pasaría verde.
  await page.getByTestId('mov-producto-quitar').click()
  await page.getByTestId('mov-producto-buscar').fill(CODIGO_ACTIVO)
  await page.getByTestId('mov-producto-opcion').filter({ hasText: ACTIVO }).click()
  await expect(filas(page)).toHaveCount(2)
  await expect(linea, 'un producto sin hueco NO lleva la línea').toHaveCount(0)
})

test('la columna de existencia muestra el saldo, y «—» cuando el producto no lleva existencia', async ({ page }) => {
  await abrirMovimientos(page)
  await page.getByTestId('mov-producto-buscar').fill(CODIGO_ACTIVO)
  await page.getByTestId('mov-producto-opcion').filter({ hasText: ACTIVO }).click()
  await expect(filas(page)).toHaveCount(2)

  // 0 +7 −2 = 5, y la fila de arriba es la más nueva.
  const saldos = await page.getByTestId('stock-movement-saldo').allInnerTexts()
  expect(saldos, 'el saldo no acumula hacia atrás desde el stock actual').toEqual(['5', '7'])

  await page.getByTestId('mov-producto-quitar').click()
  await page.getByTestId('mov-producto-buscar').fill(SIN_STOCK)
  await page.getByTestId('mov-producto-opcion').filter({ hasText: SIN_STOCK }).click()
  await expect(filas(page)).toHaveCount(1)
  await expect(
    filas(page).first().getByTestId('stock-movement-saldo'),
    'un producto sin control de existencia tiene que mostrar «—»: un 0 afirmaría que se contó y dio cero',
  ).toHaveText('—')
})

// ── a quién se le vendió, y una referencia que se puede buscar ─────────────
test('🔴 una venta muestra el CLIENTE y el número de la venta, no un pedazo de UUID', async ({ page }) => {
  await loginAsOwner(page)
  await page.goto('/ventas')
  await waitPosReady(page)
  await openShiftIfClosed(page, 0)

  await page.getByPlaceholder('Buscar producto...').fill(VENDIDO)
  await page.getByTestId('product-card').filter({ hasText: VENDIDO }).first().click()

  await page.getByTestId('cart-customer-search').fill(CLIENTE)
  const opcion = page.getByTestId('cart-customer-option')
  await expect(opcion, `buscar «${CLIENTE}» tiene que dejar UNA sola opción`).toHaveCount(1, { timeout: 15_000 })
  await opcion.click()
  await expect(page.getByTestId('cart-customer-resumen')).toContainText(CLIENTE)

  // Nequi es el camino más corto que NO es fiado: no pide monto recibido.
  await cobrarCon(page, 'nequi')
  const aviso = page.getByText(/Venta #\d+ registrada/)
  await expect(aviso).toBeVisible({ timeout: 15_000 })
  // El número sale DEL PROPIO FLUJO —el producto acaba de mostrarlo—, no de
  // «la última orden», que es una apuesta a que nadie más escriba después.
  const numero = /Venta #(\d+)/.exec(await aviso.innerText())![1]

  await page.goto('/inventario')
  await page.getByTestId('inventory-tab-movements').click()
  await page.getByTestId('mov-producto-buscar').fill(VENDIDO)
  await page.getByTestId('mov-producto-opcion').filter({ hasText: VENDIDO }).click()
  await expect(filas(page), 'el producto de este caso tiene que tener su ajuste y su venta').toHaveCount(2)

  // ── EL SUJETO PRIMERO ───────────────────────────────────────────────────
  // La venta es la fila más nueva (el orden es created_at desc).
  const venta = filas(page).first()
  await expect(
    venta.getByTestId('stock-movement-cliente'),
    'la venta no dice A QUIÉN se le vendió: `reference_id` es un FK lógico y el ' +
    'salto lo hace la vista (20260921120000). Si dice «—», el join no resolvió',
  ).toHaveText(CLIENTE)
  await expect(
    venta.getByTestId('stock-movement-referencia'),
    'la referencia no es la venta que se puede buscar: antes mostraba los 8 ' +
    'primeros caracteres del UUID, que no aparece en ninguna otra pantalla',
  ).toHaveText(`Venta #${numero}`)

  // ── CONTROL NEGATIVO ────────────────────────────────────────────────────
  // El AJUSTE del montaje NO tiene cliente. Sin esto, un defecto que pintara el
  // mismo nombre en todas las filas pasaría verde: la aserción de arriba sola
  // no distingue «resolvió esta venta» de «le pone cliente a todo».
  await expect(
    filas(page).last().getByTestId('stock-movement-cliente'),
    'un AJUSTE no tiene a quién venderle: si muestra un cliente, la vista lo está inventando',
  ).toHaveText('—')
})

test('clic en el nombre de una fila filtra por ese producto', async ({ page }) => {
  await abrirMovimientos(page)
  await filas(page).filter({ hasText: ACTIVO }).first().getByTestId('stock-movement-product').click()

  await expect(page.getByTestId('mov-producto-chip')).toContainText(ACTIVO)
  await expect(filas(page), 'el filtro no acota: aparecen movimientos de OTROS productos').toHaveCount(2)
  const nombres = await page.getByTestId('stock-movement-product').allInnerTexts()
  expect([...new Set(nombres)]).toEqual([ACTIVO])
})
