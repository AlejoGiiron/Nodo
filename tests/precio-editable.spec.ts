import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { loginAsOwner, ownerCreds } from './helpers/auth'
import { waitPosReady, addPosProduct, POS_PRODUCTO } from './helpers/pos'
import { openShiftIfClosed } from './helpers/shift'

// ============================================================================
// EL PRECIO SE NEGOCIA POR VENTA — deuda 75
//
// 🔴 EL DATO DEL CLIENTE, medido en `Control_Mp.xlsx` (2026-09-02): **el mismo
//    producto vendido a 109.000, 110.000 y 115.000**. No son descuentos sobre
//    una lista: son precios pactados, y el del catálogo es una SUGERENCIA.
//
// ── DOS EJES QUE CONVIVEN, Y NO SE TOCAN ENTRE SÍ ─────────────────────────
//   precio de la LÍNEA  → lo acordado con este cliente por este producto
//   discount_amount     → una rebaja sobre lo acordado, de la ORDEN entera
// El descuento no cambia de significado. Su única superficie compartida es el
// subtotal, que ahora suma precios pactados en vez de precios de catálogo.
//
// ── LA CONFIRMACIÓN ES LA ÚNICA RED, Y POR ESO ES REQUISITO ───────────────
// 🔴 Medido enumerando: el servidor **nunca** compara `unit_price` contra
//    `products.price`. `add_order_items_with_extras` lo toma DIRECTO del
//    payload y lo único que existe es `check (unit_price >= 0)`. O sea que el
//    precio ya era libre en la base desde el primer día: lo que falta no es
//    soltar una restricción, es poner la única red que va a haber. Con precio
//    libre, un typo de 15.000 por 115.000 no lo detecta absolutamente nada.
//
// ⚠️ Umbral decidido: **±20%**, advierte y deja seguir. Negociar 109.000 sobre
//    110.000 no molesta; un typo de un dígito cae holgado afuera.
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

const parseCOP = (s: string) => Number(s.replace(/[^\d]/g, ''))

let db: SupabaseClient
let SEDE = ''
let CATALOGO = 0        // el precio de lista de POS_PRODUCTO
let PRODUCTO_ID = ''

/** Última orden de la sede, para leer lo que realmente se persistió. */
async function ultimaOrden() {
  const { data, error } = await db.from('orders')
    .select('id, total, discount_amount, order_items(product_id, qty, unit_price)')
    .eq('sede_id', SEDE)
    .order('created_at', { ascending: false })
    .limit(1).single()
  if (error) throw error
  return data
}

test.beforeAll(async () => {
  db = createClient(process.env.VITE_NODO_SUPABASE_URL!, process.env.VITE_NODO_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  })
  const { error } = await db.auth.signInWithPassword(ownerCreds())
  if (error) throw error
  const owner = (await db.auth.getUser()).data.user!.id
  SEDE = (await db.from('profiles').select('sede_id').eq('id', owner).single()).data!.sede_id as string

  const p = await db.from('products').select('id, price')
    .eq('sede_id', SEDE).eq('name', POS_PRODUCTO).eq('is_active', true).single()
  if (p.error) throw p.error
  PRODUCTO_ID = p.data.id as string
  CATALOGO = Number(p.data.price)
  // El umbral se calcula contra el precio REAL del lab, no contra una constante
  // del test: si alguien cambia ese producto, el spec sigue midiendo lo mismo.
  expect(CATALOGO, `"${POS_PRODUCTO}" necesita un precio > 0 para medir el ±20%`).toBeGreaterThan(0)
})

test('🔴 el precio de la línea se edita, manda el total, y es el que se persiste', async ({ page }) => {
  const PACTADO = Math.round(CATALOGO * 0.95)   // dentro del ±20%: sin confirmación

  await loginAsOwner(page)
  await waitPosReady(page)
  await addPosProduct(page)
  await openShiftIfClosed(page, 0)

  const input = page.getByTestId('cart-item-price')
  await expect(
    input,
    'EL PRECIO NO SE PUEDE EDITAR EN LA LÍNEA (deuda 75): el mostrador manda ' +
    '`unit_price: item.product.price` directo del catálogo, y el cliente negocia ' +
    'el mismo producto a 109.000, 110.000 y 115.000',
  ).toBeVisible({ timeout: 15_000 })

  await input.fill(String(PACTADO))
  await input.blur()

  expect(
    parseCOP(await page.getByTestId('cart-total').innerText()),
    'el total del carrito sale del precio PACTADO, no del de lista',
  ).toBe(PACTADO)

  // Nequi es el camino de cobro más corto (no pide monto recibido); el sujeto
  // de este caso es el precio, no el método.
  await page.getByRole('button', { name: 'Cobrar' }).click()
  await expect(page.getByTestId('checkout-total')).toBeVisible()
  await page.getByTestId('pay-method-nequi').click()
  await page.getByTestId('checkout-continue').click()
  await expect(page.getByText(/Venta #\d+ registrada/)).toBeVisible({ timeout: 15_000 })

  const orden = await ultimaOrden()
  const linea = (orden.order_items as { product_id: string; qty: number; unit_price: number }[])
    .find((i) => i.product_id === PRODUCTO_ID)!
  expect(
    Number(linea.unit_price),
    `la línea tiene que guardar el precio PACTADO (${PACTADO}), no el del catálogo (${CATALOGO})`,
  ).toBe(PACTADO)

  // 🔴 Y el cruce con la deuda 80: el total lo DERIVA el servidor de las líneas,
  //    así que si el precio pactado no hubiera llegado, este número lo delata.
  expect(
    Number(orden.total),
    'el total derivado por el servidor tiene que salir del precio pactado',
  ).toBe(PACTADO)
})

test('🔴 fuera del ±20% pide confirmación; adentro no molesta', async ({ page }) => {
  await loginAsOwner(page)
  await waitPosReady(page)
  await addPosProduct(page)
  await openShiftIfClosed(page, 0)

  const input = page.getByTestId('cart-item-price')
  const aviso = page.getByTestId('precio-lejos-del-catalogo')

  // Dentro del umbral: negociar un 5% abajo es el caso NORMAL de este cliente.
  await input.fill(String(Math.round(CATALOGO * 0.95)))
  await input.blur()
  await expect(
    aviso,
    'un precio negociado normal no puede pedir confirmación: un aviso que sale ' +
    'siempre deja de leerse',
  ).toHaveCount(0)

  // Fuera del umbral: la mitad del precio de lista. Es la forma que tiene un
  // typo de un dígito, y es lo único que puede atajarlo.
  await input.fill(String(Math.round(CATALOGO * 0.5)))
  await input.blur()
  await expect(
    aviso,
    'un precio 50% por debajo del catálogo tiene que pedir confirmación: el ' +
    'servidor nunca compara contra products.price',
  ).toBeVisible()

  // Y el aviso dice CUÁNTO se aleja, no sólo que se aleja.
  await expect(aviso).toContainText(/%/)
})

test('🔴 el descuento sigue siendo una rebaja SOBRE lo pactado', async ({ page }) => {
  const PACTADO = Math.round(CATALOGO * 0.95)
  const DESCUENTO = 10

  await loginAsOwner(page)
  await waitPosReady(page)
  await addPosProduct(page)
  await openShiftIfClosed(page, 0)

  await page.getByTestId('cart-item-price').fill(String(PACTADO))
  await page.getByTestId('cart-item-price').blur()
  await page.getByRole('button', { name: `${DESCUENTO}%` }).click()

  const esperado = PACTADO - Math.round(PACTADO * DESCUENTO / 100)
  expect(
    parseCOP(await page.getByTestId('cart-total').innerText()),
    'el descuento se aplica sobre el precio PACTADO, no sobre el de lista: son ' +
    'dos ejes distintos y el descuento no cambió de significado',
  ).toBe(esperado)
})
