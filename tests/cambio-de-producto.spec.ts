import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { loginAsOwner, ownerCreds } from './helpers/auth'

// ============================================================================
// CAMBIO DE PRODUCTO EN UNA VENTA A CRÉDITO
//
// 🔴 TODOS LOS CASOS CREAN UN CAMBIO DE VERDAD, y eso NO es rigor de más: hoy
//    no hay ninguno registrado, así que tanto la cartera como la vista de
//    movimientos dan lo mismo que antes — y un verde sobre «da lo mismo» es un
//    verde QUE NO PUEDE FALLAR. La cobertura empieza cuando existe un cambio.
//
// 🔴 Y EL ENLACE SE PRUEBA CON DOS SALTOS, no con uno. Un movimiento
//    `sale_change` apunta al CAMBIO y el cambio a la VENTA. Aseverar que
//    «apunta a algo» pasaría igual con la vista a mitad de camino; lo que
//    discrimina es exigir EL NÚMERO DE LA VENTA.
//
// ⚠️ La fixture de venta está duplicada de `anular-venta.spec` (crear orden +
//    `add_order_items_with_extras`). Es el tercer spec que la necesita y
//    debería vivir en `tests/helpers/`; se anota como deuda en vez de hacerlo
//    en la misma tanda que toca la RPC que estos casos miden.
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
const PROD_A = `E2E CambioA ${SUFFIX}`   // el que se vende y después vuelve
const PROD_B = `E2E CambioB ${SUFFIX}`   // el que se lleva a cambio
const CLIENTE = `E2E CambioCli ${SUFFIX}`

let db: SupabaseClient
let SEDE = ''
let OWNER = ''
let CAT = ''
let ID_A = ''
let ID_B = ''
let ID_CLIENTE = ''
// 🔴 La jornada que ABRE este spec, si la abre. Solo se cierra ESA: hay una
//    sola abierta por sede, y cerrar la de otro dejaria el lab en un estado
//    que nadie eligio — que es exactamente lo que el spec del cierre con
//    fecha reclama cuando encuentra una ajena.
let JORNADA_MIA: string | null = null

async function ensureShift(): Promise<void> {
  const abierta = (await db.from('jornadas').select('id').eq('sede_id', SEDE).is('closed_at', null).maybeSingle()).data
  if (abierta) return
  const ins = await db.from('jornadas').insert({ sede_id: SEDE, opened_by: OWNER, opening_amount: 0 }).select('id').single()
  expect(ins.error?.message ?? null, 'no se pudo abrir jornada para la fixture').toBeNull()
  JORNADA_MIA = ins.data!.id as string
}

/** Una venta A CRÉDITO: queda `pending`, sin pago. */
async function ventaFiada(items: { product_id: string; qty: number; unit_price: number }[]) {
  await ensureShift()
  const total = items.reduce((s, i) => s + i.qty * i.unit_price, 0)
  // 🔴 EL NUMERO SE ASIGNA A MANO, y no es capricho de la fixture: un `insert`
  //    directo deja `order_number` en NULL porque `next_order_number` DEVUELVE
  //    el correlativo y no lo escribe — lo hace la app, en dos pasos. Es el
  //    mismo defecto que dejo invisibles las 30 ventas del historico cargado:
  //    el Historial y Cartera ordenan y muestran POR NUMERO, asi que una venta
  //    sin el no aparece. Sin esto, este caso no encuentra su fila.
  const num = await db.rpc('next_order_number', { p_sede_id: SEDE })
  expect(num.error?.message ?? null, 'no se pudo tomar el correlativo').toBeNull()
  const o = await db.from('orders').insert({
    canal: 'mostrador', status: 'pending', payment_status: 'pending',
    sede_id: SEDE, created_by: OWNER, order_number: num.data as number,
    customer_id: ID_CLIENTE, customer_name: CLIENTE,
  }).select('id, order_number').single()
  expect(o.error?.message ?? null, 'no se pudo crear la venta de la fixture').toBeNull()
  const it = await db.rpc('add_order_items_with_extras', {
    p_order_id: o.data!.id,
    p_items: items.map((i) => ({ ...i, extras: [] })),
  })
  expect(it.error?.message ?? null, 'no se pudieron agregar los items').toBeNull()
  return { id: o.data!.id as string, numero: o.data!.order_number as number, total }
}

const cambiar = (orderId: string, motivo: string, items: unknown[]) =>
  db.rpc('register_sale_change', { p_order_id: orderId, p_reason: motivo, p_items: items })

const linea = (dir: 'in' | 'out', product_id: string, qty: number, unit_price: number) =>
  ({ direction: dir, product_id, qty, unit_price })

test.beforeAll(async () => {
  db = createClient(process.env.VITE_NODO_SUPABASE_URL!, process.env.VITE_NODO_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  })
  const { error } = await db.auth.signInWithPassword(ownerCreds())
  if (error) throw error
  OWNER = (await db.auth.getUser()).data.user!.id
  SEDE = (await db.from('profiles').select('sede_id').eq('id', OWNER).single()).data!.sede_id as string

  const cat = await db.from('categories').insert({ sede_id: SEDE, name: `E2E Cambio ${SUFFIX}` }).select('id').single()
  expect(cat.error?.message ?? null).toBeNull()
  CAT = cat.data!.id

  const base = { sede_id: SEDE, category_id: CAT, kind: 'simple' as const, stock_tracking: true, stock_qty: 20 }
  const a = await db.from('products').insert({ ...base, name: PROD_A, price: 5000, cost_price: 3000 }).select('id').single()
  const b = await db.from('products').insert({ ...base, name: PROD_B, price: 8000, cost_price: 4000 }).select('id').single()
  expect(a.error?.message ?? null).toBeNull()
  expect(b.error?.message ?? null).toBeNull()
  ID_A = a.data!.id
  ID_B = b.data!.id

  // Cliente PROPIO: con uno compartido, la fila de Cartera traería deudas de
  // otros specs y el saldo aseverado dejaría de ser el de este caso.
  const c = await db.from('customers').insert({ sede_id: SEDE, name: CLIENTE }).select('id').single()
  expect(c.error?.message ?? null).toBeNull()
  ID_CLIENTE = c.data!.id
})

test.afterAll(async () => {
  if (!db || !SEDE) return
  const ids = [ID_A, ID_B].filter(Boolean)
  await db.from('products').update({ is_active: false }).in('id', ids)
  await db.from('categories').update({ is_active: false }).eq('id', CAT)
  await db.from('customers').update({ is_active: false }).eq('id', ID_CLIENTE)
  // 🔴 LA JORNADA PRIMERO, y es lo que esta corrida costo: sin esto quedaba
  //    ABIERTA y `cierre-con-fecha.spec` abortaba — 1 failed y 7 casos SIN
  //    MEDIR, en un archivo que no habla de cambios de producto. Un spec que
  //    no limpia no falla solo: cambia lo que ven los demas.
  if (JORNADA_MIA) {
    await db.from('jornadas').update({
      closed_at: new Date().toISOString(), closed_by: OWNER, closing_amount: 0,
    }).eq('id', JORNADA_MIA)
    const j = await db.from('jornadas').select('closed_at').eq('id', JORNADA_MIA).single()
    expect(
      j.data?.closed_at ?? null,
      `LIMPIEZA de cambio-de-producto.spec: quedo ABIERTA la jornada ${JORNADA_MIA}, y el proximo spec que necesite abrir la suya va a abortar`,
    ).not.toBeNull()
  }
  const vivos = await db.from('products').select('id').in('id', ids).eq('is_active', true)
  const cli = await db.from('customers').select('is_active').eq('id', ID_CLIENTE).single()
  expect(
    [vivos.error?.message, (vivos.data ?? []).length, cli.data?.is_active],
    `LIMPIEZA de cambio-de-producto.spec: quedo fixture activa (${ids.join(', ')})`,
  ).toEqual([undefined, 0, false])
})

// ── 3 · la cartera ve el documento nuevo ────────────────────────────────────
test('🔴 la CARTERA muestra el saldo CON el cambio, no el del documento original', async ({ page }) => {
  const venta = await ventaFiada([{ product_id: ID_A, qty: 2, unit_price: 5000 }])   // 10.000
  const ab = await db.rpc('register_debt_payment', {
    p_order_id: venta.id, p_amount: 3000, p_payment_method: 'transfer',
  })
  expect(ab.error?.message ?? null, 'no se pudo abonar en la fixture').toBeNull()

  // Vuelve 1 de A (5.000) y se lleva 1 de B (8.000): la venta pasa a deber MÁS.
  const r = await cambiar(venta.id, 'el cliente cambio el producto', [
    linea('in', ID_A, 1, 5000), linea('out', ID_B, 1, 8000),
  ])
  expect(r.error?.message ?? null, 'el cambio no se pudo registrar').toBeNull()

  // SUJETO: 10.000 + 3.000 de delta − 3.000 abonados = 10.000 de saldo.
  await loginAsOwner(page)
  await page.goto('/fiado')
  await page.getByTestId('debt-search').fill(CLIENTE)
  const cliente = page.getByTestId('customer-row').filter({ hasText: CLIENTE }).first()
  await expect(cliente, 'el cliente de la fixture tiene que aparecer en Cartera').toBeVisible({ timeout: 15_000 })
  await cliente.click()
  // CONTROL DEL ESCENARIO, y va antes del sujeto a proposito: si el detalle no
  // abre, el rojo de abajo diria «no encontre la fila» y mandaria a mirar el
  // saldo, que es justo lo que no esta mal.
  await expect(
    page.getByTestId('customer-detail'),
    'el detalle del cliente no abrio: el caso no llego a mirar ningun saldo',
  ).toBeVisible({ timeout: 15_000 })
  const fila = page.getByTestId('credit-row').filter({ hasText: `#${venta.numero}` }).first()
  await expect(
    fila.getByTestId('credit-row-saldo'),
    'la cartera muestra el saldo del documento ORIGINAL: sin mirar el cambio le cobra ' +
    'al cliente el producto que ya devolvio',
  ).toContainText('10.000')
})

// ── 5 · el enlace, con sus dos saltos ───────────────────────────────────────
test('🔴 el movimiento del cambio enlaza a la VENTA — dos saltos, no uno', async () => {
  const venta = await ventaFiada([{ product_id: ID_A, qty: 2, unit_price: 5000 }])
  const r = await cambiar(venta.id, 'enlace', [linea('in', ID_A, 1, 5000), linea('out', ID_B, 1, 8000)])
  expect(r.error?.message ?? null).toBeNull()
  const cambioId = (r.data as { change_id: string }).change_id

  const movs = await db.from('stock_movements_con_saldo')
    .select('type, qty, order_number, customer_name')
    .eq('reference_id', cambioId)
  expect(movs.error?.message ?? null).toBeNull()
  expect(movs.data?.length, 'el cambio tiene que escribir dos movimientos: uno que entra y otro que sale').toBe(2)

  for (const m of movs.data!) {
    // 🔴 EL DISCRIMINADOR, Y ESTA MEDIDO: sobre los movimientos `sale_change`
    //    de LAB, la vista de DOS saltos resuelve el numero y un solo salto
    //    resolveria **0 de 26** — `left join orders on id = reference_id` no
    //    matchea nunca, porque ese id es el del CAMBIO, no el de la orden.
    //    Por eso la asercion exige EL NUMERO DE LA VENTA y no algo mas blando:
    //    «apunta a algo» pasaria igual con la vista a mitad de camino.
    expect(
      m.order_number,
      'el movimiento del cambio no llega hasta la venta: la vista se quedo en un salto',
    ).toBe(venta.numero)
    expect(m.customer_name, 'y el cliente viaja por el mismo camino').toBe(CLIENTE)
  }
  expect(movs.data!.map((m) => m.qty).sort((a, b) => a - b), 'uno entra y otro sale').toEqual([-1, 1])
})

// ── el límite, por los dos caminos que fallan distinto ──────────────────────
test('🔴 dos cambios ENCADENADOS: el segundo ve lo que devolvio el primero', async () => {
  const venta = await ventaFiada([{ product_id: ID_A, qty: 3, unit_price: 5000 }])

  const uno = await cambiar(venta.id, 'primer cambio', [linea('in', ID_A, 2, 5000), linea('out', ID_B, 1, 8000)])
  expect(uno.error?.message ?? null, 'el primer cambio tiene que pasar').toBeNull()

  // Quedaba 1. Pedir 2 tiene que negar, y el mensaje trae los tres numeros.
  const dos = await cambiar(venta.id, 'segundo cambio', [linea('in', ID_A, 2, 5000), linea('out', ID_B, 1, 8000)])
  expect(dos.error?.message ?? '', 'el segundo cambio no conto lo que devolvio el primero')
    .toMatch(/ya volvieron 2/i)

  // CONTROL: 1 sí entra. Sin esto, un guard que negara SIEMPRE pasaria igual.
  const tres = await cambiar(venta.id, 'segundo cambio, lo que queda', [linea('in', ID_A, 1, 5000), linea('out', ID_B, 1, 8000)])
  expect(tres.error?.message ?? null, 'devolver lo que queda tiene que poder').toBeNull()
})

test('🔴 dos LINEAS del mismo producto en UN SOLO cambio tampoco se saltean el limite', async () => {
  // 🔴 ES EL CASO QUE ESTABA ROTO, y es peor que el encadenado: aquel deja dos
  //    documentos que alguien puede mirar; este pasa entero adentro de uno.
  //    La primera version del guard excluia el cambio EN CURSO, asi que las dos
  //    lineas no se veian entre si y volvian 4 de una venta con 3, sin error.
  const venta = await ventaFiada([{ product_id: ID_A, qty: 3, unit_price: 5000 }])
  const r = await cambiar(venta.id, 'dos lineas del mismo producto', [
    linea('in', ID_A, 2, 5000), linea('in', ID_A, 2, 5000), linea('out', ID_B, 1, 8000),
  ])
  expect(r.error?.message ?? '', 'las dos lineas del mismo producto no se vieron entre si')
    .toMatch(/no se pueden devolver 2/i)

  // Y no dejo rastro: la transaccion revierte entera.
  const q = await db.from('sale_changes').select('id').eq('order_id', venta.id)
  expect(q.data?.length, 'un cambio rechazado no puede dejar el documento a medias').toBe(0)
})

// ── pagada de más: rechaza, y el mensaje dice qué hacer ─────────────────────
test('🔴 si quedaria PAGADA DE MAS rechaza, con los tres numeros y la salida', async () => {
  const venta = await ventaFiada([{ product_id: ID_A, qty: 2, unit_price: 5000 }])   // 10.000
  const ab = await db.rpc('register_debt_payment', { p_order_id: venta.id, p_amount: 8000, p_payment_method: 'transfer' })
  expect(ab.error?.message ?? null).toBeNull()

  // Vuelve uno de 5.000 y se lleva uno de 1.000: el total caeria a 6.000 contra
  // 8.000 ya abonados.
  const r = await cambiar(venta.id, 'cambio por algo mas barato', [
    linea('in', ID_A, 1, 5000), linea('out', ID_B, 1, 1000),
  ])
  const msg = r.error?.message ?? ''
  expect(msg, 'tiene que rechazar: no hay forma de devolver esa plata').toMatch(/pagada de mas/i)
  // 🔴 Y NO SOLO NEGAR. El aviso falso que sacamos de produccion esta semana
  //    nacio de negar sin nombrar el camino, asi que el mensaje trae los
  //    numeros Y la salida.
  expect(msg, 'el mensaje tiene que traer lo abonado, el total nuevo y lo que sobra').toMatch(/8000.*6000.*2000/s)
  expect(msg, 'y decir que puede hacer').toMatch(/igual o mayor valor/i)
})
