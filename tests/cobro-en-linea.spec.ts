import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { loginAsOwner, ownerCreds } from './helpers/auth'
import { openShiftIfClosed } from './helpers/shift'
import { waitPosReady, addPosProduct, POS_PRODUCTO } from './helpers/pos'
import { formatoCOP } from '../src/lib/formato'

// ============================================================================
// COBRO EN LÍNEA — corte 1: la venta simple se cobra en la columna
//
// §8.15 se reabrió el 2026-09-03: el cobro va EN LÍNEA, como la maqueta. Se
// hace por cortes, y el modal NO desaparece hasta que los tres flujos —simple,
// mixto, fiado— estén en la columna. Este corte trae el simple.
//
// 🔴 EL PRIMER CASO ES LA DEUDA QUE DEJÓ ABIERTA EL CABLEADO DE LOS ATAJOS, y
//    va primero a propósito: los medios de pago se atajan con LETRAS (E·T·C) y
//    no con dígitos porque el campo de dinero descarta letras, así que el atajo
//    puede mandar con el foco adentro. Esa propiedad —la razón entera de la
//    decisión— NO SE PODÍA ASEVERAR con el modal, porque partía el cobro en dos
//    pasos y la grilla de medios nunca convivía con el campo de dinero.
//    Estaba probada en dos mitades (la regla en `src/lib/atajos.test.ts`, la
//    declaración del campo en `tests/atajos.spec.ts`) y **dos mitades que pasan
//    por separado son un verde que no puede fallar.** Acá conviven.
//
// 🔴 Y EL SEGUNDO ES LA CONDICIÓN DE LOS CORTES: mientras las dos superficies
//    cobren, el spec asevera que hacen LO MISMO, no sólo que la nueva funciona.
//    «Comparten la escritura» es una afirmación de diseño y no ejecuta. Se mide
//    cobrando el mismo escenario por las dos y comparando **lo que quedó en la
//    base** —orden, líneas, pagos—, no lo que muestran: comparar dos pantallas
//    es comparar dos vistas, que no es lo que está en duda.
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

let db: SupabaseClient
let SEDE: string

/** Lo que quedó PERSISTIDO de una orden: es lo único que las dos superficies comparten. */
async function loQueQuedo(orderId: string) {
  const { data: order, error } = await db
    .from('orders')
    .select('total, discount_amount, payment_status, status, canal, customer_id')
    .eq('id', orderId).single()
  if (error) throw error
  const { data: lineas } = await db
    .from('order_items').select('qty, unit_price').eq('order_id', orderId)
  const { data: pagos } = await db
    .from('payments').select('method, amount').eq('order_id', orderId)
  return {
    total: Number(order.total),
    descuento: Number(order.discount_amount),
    estadoDePago: order.payment_status,
    estado: order.status,
    canal: order.canal,
    lineas: (lineas ?? []).map((l) => ({ qty: l.qty, precio: Number(l.unit_price) }))
      .sort((a, b) => a.precio - b.precio),
    pagos: (pagos ?? []).map((p) => ({ metodo: p.method, monto: Number(p.amount) }))
      .sort((a, b) => a.monto - b.monto),
  }
}

/** La última orden numerada de la sede — la que se acaba de cobrar. */
async function ultimaOrden(): Promise<string> {
  const { data, error } = await db
    .from('orders').select('id')
    .eq('sede_id', SEDE).not('order_number', 'is', null)
    .order('created_at', { ascending: false }).limit(1).single()
  if (error) throw error
  return data.id as string
}

test.beforeAll(async () => {
  db = createClient(process.env.VITE_NODO_SUPABASE_URL!, process.env.VITE_NODO_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  })
  const { error } = await db.auth.signInWithPassword(ownerCreds())
  if (error) throw error
  const uid = (await db.auth.getUser()).data.user!.id
  SEDE = (await db.from('profiles').select('sede_id').eq('id', uid).single()).data!.sede_id as string

  // Cliente fijo para la equivalencia: se elige por NOMBRE y no con `.first()` —
  // el primero de la lista depende de qué dejó otro spec, que es la clase
  // «locator apoyado en unicidad no declarada» (deuda 67).
  //
  // 🔴 Y SE ASEGURA QUE QUEDE **ACTIVO**, que es lo que la primera versión de
  //    esto no miraba. El lab tiene 151 clientes y **todos desactivados**: los
  //    specs de fiado los dan de baja al limpiar, y `getCustomers` filtra por
  //    `is_active`. Así que el picker mostraba «Aún no hay clientes» y el caso
  //    fallaba por un estado del lab, no por el cobro.
  //    La primera versión además IGNORABA el error del insert —fail-open—: si
  //    fallaba, el spec seguía y el rojo aparecía trescientas líneas después.
  await clienteDelLab(CLIENTE_EQ, 30)
  // 🔴 El del caso del plazo se crea ACÁ y no dentro del test: `useCustomers`
  //    cachea 60 s, así que un cliente insertado con la app ya cargada NO
  //    aparece en el picker. La primera versión lo creaba en el test y el caso
  //    fallaba esperando una opción que la consulta nunca había vuelto a pedir.
  //    Y se RESETEA a 15: el propio caso le pone 90 al final, así que sin el
  //    reset la segunda corrida arrancaría desde el estado que dejó la primera.
  CLIENTE_PLAZO_ID = await clienteDelLab(CLIENTE_PLAZO, 15)
})

/** Un cliente estable para los casos que no miden la eleccion en si. */
const CLIENTE_EQ = 'E2E Cobro Equivalencia'
/** El del caso del plazo congelado: su plazo se muta DENTRO del caso. */
const CLIENTE_PLAZO = 'E2E Cobro Plazo'
let CLIENTE_PLAZO_ID: string

/**
 * Deja un cliente del lab ACTIVO y con el plazo pedido, exista o no.
 *
 * ⚠️ El `is_active` no es un detalle: el lab tiene 151 clientes y **todos
 * desactivados** —los specs de fiado los dan de baja al limpiar— y
 * `getCustomers` filtra por activos. Sin esto el picker dice «Aún no hay
 * clientes» y el caso falla por el estado del lab, no por el cobro.
 */
async function clienteDelLab(nombre: string, plazo: number): Promise<string> {
  const { data, error } = await db.from('customers')
    .select('id').eq('sede_id', SEDE).eq('name', nombre).limit(1)
  if (error) throw error
  if (data?.length) {
    const { error: e2 } = await db.from('customers')
      .update({ is_active: true, plazo_dias: plazo }).eq('id', data[0].id)
    if (e2) throw e2
    return data[0].id as string
  }
  const { data: nuevo, error: e3 } = await db.from('customers')
    .insert({ sede_id: SEDE, name: nombre, plazo_dias: plazo, is_active: true })
    .select('id').single()
  if (e3) throw e3
  return nuevo!.id as string
}

/**
 * Elige el cliente estable del spec — POR NOMBRE, no con `.first()`.
 * El primero de la lista depende de qué dejó otro spec: es exactamente la clase
 * «un locator apoyado en unicidad no declarada» que este proyecto ya pagó cuatro
 * veces.
 */
async function elegirCliente(page: Page, nombre = CLIENTE_EQ, prefijo = 'cobro-cliente'): Promise<void> {
  await page.getByTestId(`${prefijo}-search`).fill(nombre)
  await page.getByTestId(`${prefijo}-option`).filter({ hasText: nombre }).first().click()
}

test.beforeEach(async ({ page }) => {
  await loginAsOwner(page)
  await page.goto('/ventas')
  await openShiftIfClosed(page, 0)
  await page.goto('/ventas')
  await waitPosReady(page)
})

test('🔴 la columna del mostrador tiene el cobro: medios, recibe y cambio, sin abrir nada', async ({ page }) => {
  await addPosProduct(page)
  await expect(
    page.getByTestId('cobro-medio-efectivo'),
    'el cobro va EN LÍNEA (§8.15): los medios de pago viven en la columna, no detrás de un botón',
  ).toBeVisible()
  await expect(page.getByTestId('cobro-recibe'), 'y el campo de dinero también').toBeVisible()
  await expect(page.getByTestId('cobro-confirmar')).toBeVisible()
})

test('🔴 E·T·C mandan CON EL FOCO en el campo de dinero — la razón de haber elegido letras', async ({ page }) => {
  await addPosProduct(page)
  const dinero = page.getByTestId('cobro-recibe')
  await dinero.focus()
  await expect(dinero, 'el foco arranca donde la cajera lo tiene al cobrar').toBeFocused()

  await page.keyboard.press('t')
  await expect(
    page.getByTestId('cobro-medio-transferencia'),
    'con el foco en el campo de dinero, T TIENE que elegir transferencia: ese campo descarta ' +
    'letras por diseño, y ésa es la razón entera por la que los atajos son letras y no dígitos',
  ).toHaveAttribute('aria-pressed', 'true')

  await page.keyboard.press('e')
  await expect(page.getByTestId('cobro-medio-efectivo')).toHaveAttribute('aria-pressed', 'true')

  // ⚠️ Acá NO se asevera que el foco sobreviva a la T, y la primera versión de
  //    este caso lo hacía: al pasar a transferencia el campo de dinero
  //    DESAPARECE —en una transferencia no hay vuelto que dar—, así que el foco
  //    se pierde por diseño. Aseverarlo habría forzado a dejar en pantalla un
  //    campo que no aplica, o sea a empeorar la pantalla para que pase el test.
  //    Lo que sí se asevera es que la letra **no se escribe** en el campo, y eso
  //    se mide sin desmontarlo: con efectivo ya elegido, la E no cambia nada.
  const monto = formatoCOP(20_000)
  await dinero.fill('20000')
  await expect(dinero).toHaveValue(monto)
  await dinero.focus()
  await page.keyboard.press('e')
  await expect(
    dinero,
    'la letra NO se escribió en el campo de dinero: el atajo le corta el paso',
  ).toHaveValue(monto)
  await expect(dinero, 'y el foco se queda donde la cajera lo tenía').toBeFocused()
  await expect(page.getByTestId('cobro-medio-efectivo')).toHaveAttribute('aria-pressed', 'true')

  // Control negativo del propio caso: una letra que no es atajo no hace nada.
  await page.keyboard.press('z')
  await expect(page.getByTestId('cobro-medio-efectivo')).toHaveAttribute('aria-pressed', 'true')
})

test('🔴 la columna cobra sin abrir el modal, y la venta queda en la base', async ({ page }) => {
  await addPosProduct(page)
  await page.getByTestId('cobro-medio-efectivo').click()
  await page.getByTestId('cobro-recibe').fill('20000')
  await expect(page.getByTestId('cobro-cambio'), 'el cambio se calcula en la columna').toContainText('12.000')

  await page.getByTestId('cobro-confirmar').click()
  // §8.17: el DESPUÉS del cobro sí tiene diálogo propio — número, y el estado de
  // «sin número» con su reintento. Es un error sobre una venta YA cobrada.
  await expect(
    page.getByTestId('success-order-number').or(page.getByTestId('success-sin-numero')),
    'el después del cobro tiene diálogo propio (§8.17)',
  ).toBeVisible({ timeout: 20_000 })

  const quedo = await loQueQuedo(await ultimaOrden())
  expect(quedo.total, 'el total lo deriva el servidor de las líneas (deuda 80)').toBe(8_000)
  expect(quedo.pagos).toEqual([{ metodo: 'cash', monto: 8_000 }])
  expect(quedo.estadoDePago).toBe('paid')
})

test('🔴 los chips de monto rápido viajaron a la columna — son un (d) del producto', async ({ page }) => {
  // 🔴 CASI SE PIERDEN EN ESTE CORTE, igual que los cuatro (d) del catálogo en
  //    la tanda 4. El modal tenía «Exacto» y los redondeos de `cashQuickAmounts`;
  //    la maqueta del cobro en línea dibuja sólo RECIBE y CAMBIO. Un (d) NO
  //    DIBUJADO no se toca: la maqueta no puede borrar una capacidad probada.
  await addPosProduct(page)
  await page.getByTestId('cobro-medio-efectivo').click()
  await page.getByTestId('cobro-monto-exacto').click()
  await expect(
    page.getByTestId('cobro-cambio'),
    'el chip «Exacto» deja el cambio en cero: es para lo que existe',
  ).toContainText('0')
  await expect(page.getByTestId('cobro-recibe')).toHaveValue(formatoCOP(8_000))
})

test('🔴 EQUIVALENCIA: columna y modal escriben lo mismo sobre el mismo escenario', async ({ page }) => {
  // La condición de los cortes. Si `useCobro` es de verdad una sola escritura,
  // las dos superficies tienen que dejar filas idénticas.
  await addPosProduct(page)
  await page.getByTestId('cobro-medio-transferencia').click()
  await page.getByTestId('cobro-confirmar').click()
  await expect(page.getByTestId('success-order-number').or(page.getByTestId('success-sin-numero')))
    .toBeVisible({ timeout: 20_000 })
  const porLaColumna = await loQueQuedo(await ultimaOrden())

  // Y ahora el MISMO cobro por el modal, que sigue vivo hasta el corte 4.
  await page.goto('/ventas')
  await waitPosReady(page)
  await addPosProduct(page)
  await page.getByTestId('cobro-mas-opciones').click()
  await expect(page.getByTestId('checkout-total')).toBeVisible({ timeout: 10_000 })
  await page.getByTestId('pay-method-transferencia').click()
  await page.getByTestId('checkout-continue').click()
  await expect(page.getByTestId('success-order-number').or(page.getByTestId('success-sin-numero')))
    .toBeVisible({ timeout: 20_000 })
  const porElModal = await loQueQuedo(await ultimaOrden())

  expect(
    porLaColumna,
    'columna y modal tienen que dejar la MISMA fila: si no, «comparten la escritura» era una ' +
    'afirmación de diseño y no un hecho',
  ).toEqual(porElModal)
})

test('🔴 F12 pone el FOCO en Cobrar; el Enter confirma — dos actos', async ({ page }) => {
  // §5, decidido con el cobro en línea: con el panel siempre visible, F12
  // pasaría de «abrir un diálogo» a «cobrar de una» — de reversible a
  // irreversible, sin que la cajera tenga cómo notar el cambio.
  await addPosProduct(page)
  const boton = page.getByTestId('cobro-confirmar')
  await expect(boton).not.toBeFocused()

  await page.keyboard.press('F12')
  await expect(boton, 'F12 mueve el foco al botón, no cobra').toBeFocused()
  await expect(
    page.getByTestId('success-order-number').or(page.getByTestId('success-sin-numero')),
    'y NO cobró: una venta es irreversible y pide dos actos',
  ).toHaveCount(0)

  await page.keyboard.press('Enter')
  await expect(
    page.getByTestId('success-order-number').or(page.getByTestId('success-sin-numero')),
    'el Enter sí confirma: es el acto que quien teclea ya asocia con confirmar',
  ).toBeVisible({ timeout: 20_000 })
})

test('🔴 con crédito el botón COBRA — ya no deriva a otra pantalla', async ({ page }) => {
  // 🔴 RE-DERIVADO EN EL CORTE 3. Este caso aseveraba que el botón decía
  //    «Continuar» y ABRÍA el cobro completo: era cierto mientras el fiado
  //    viviera en el modal, y el rótulo distinto era la forma honesta de decir
  //    que el botón hacía dos cosas.
  //    Con el crédito en la columna el botón vuelve a hacer UNA sola, así que la
  //    aserción se re-deriva de la pantalla nueva: el rótulo es siempre
  //    «Cobrar», y con crédito elegido NO se abre ningún modal.
  //    Se re-deriva y no se borra porque su expectativa sobrevive: el botón
  //    tiene que decir lo que hace.
  await addPosProduct(page)
  await page.getByTestId('cobro-medio-fiado').click()
  await expect(
    page.getByTestId('cobro-confirmar'),
    'el botón hace una sola cosa otra vez: cobrar',
  ).toContainText('Cobrar')
  await elegirCliente(page)
  await page.getByTestId('cobro-confirmar').click()
  await expect(
    page.getByTestId('checkout-total'),
    'el crédito ya no deriva al cobro completo: se cobra en la columna',
  ).toHaveCount(0)
  await expect(page.getByTestId('success-order-number').or(page.getByTestId('success-sin-numero')))
    .toBeVisible({ timeout: 20_000 })
})

test('🔴 el producto del lab sigue siendo el que arma el carrito', async ({ page }) => {
  // Control del propio spec: si el catálogo cambia y `Lab Cerveza` deja de estar,
  // los casos de arriba fallarían por una razón que no es el cobro (deuda 67).
  await expect(
    page.getByTestId('product-card').filter({ hasText: POS_PRODUCTO }),
    `el lab necesita "${POS_PRODUCTO}" activo`,
  ).toHaveCount(1)
})

// ============================================================================
// CORTE 2 · el PAGO MIXTO baja a la columna
//
// 🔴 LA MAQUETA NO DIBUJA EL PAGO DIVIDIDO EN ABSOLUTO — no lo dibuja distinto:
//    no está. El panel tiene tres celdas, un RECIBE y un CAMBIO. **El flujo
//    entero es (d) NO DIBUJADO**, y sus ocho capacidades quedaron enumeradas en
//    `docs/auditorias/A6-visual-contra-la-maqueta.md` §12 ANTES de tocar nada,
//    porque durante una migración por cortes la superficie vieja sostiene toda
//    la cobertura: una capacidad que no viaje **no rompe nada**.
// ============================================================================

test('🔴 el reparto vive en la columna: no hay que abrir nada para dividir', async ({ page }) => {
  await addPosProduct(page)
  await page.getByTestId('cobro-dividir').click()
  await expect(
    page.getByTestId('cobro-line-method-0'),
    'dividir el pago es parte del cobro, y el cobro está en la columna',
  ).toBeVisible()
  await expect(page.getByTestId('checkout-total'), 'sin abrir el modal').toHaveCount(0)
})

test('🔴 un método NO se repite entre líneas del reparto', async ({ page }) => {
  // Capacidad 6 de la enumeración. Sin control visible: es una regla de
  // comportamiento, de las que un rediseño mirando la maqueta borra sin notarlo.
  // Dos líneas del mismo método dan un reparto que la RPC acepta —la suma cuadra—
  // y que el reporte por medio de pago no puede explicar.
  await addPosProduct(page)
  await page.getByTestId('cobro-dividir').click()
  await page.getByTestId('cobro-line-method-0').selectOption('cash')
  await page.getByTestId('cobro-add-method').click()

  const opciones = await page.getByTestId('cobro-line-method-1').locator('option')
    .allTextContents()
  expect(
    opciones,
    'el método ya usado por otra línea NO puede estar entre las opciones de la nueva',
  ).not.toContain('Efectivo')
  expect(opciones.length, 'y sí quedan los otros').toBeGreaterThan(0)
})

test('🔴 el reparto dice CUÁNTO FALTA antes de que la RPC lo rechace', async ({ page }) => {
  // Capacidad 4. Sin esto el cajero se entera de que no cuadra cuando el cobro
  // ya falló, que es el peor momento.
  await addPosProduct(page)
  await page.getByTestId('cobro-dividir').click()
  await page.getByTestId('cobro-line-amount-0').fill('3000')
  await expect(
    page.getByTestId('cobro-remaining'),
    'faltan 5.000 de los 8.000: la cifra tiene que estar antes de confirmar',
  ).toContainText('5.000')
})

test('🔴 EQUIVALENCIA DEL REPARTO: columna y modal escriben las MISMAS FILAS', async ({ page }) => {
  // 🔴 ES LA ASERCIÓN QUE EL CORTE 1 ESCRIBIÓ Y NO PUDO EJERCER. Allá el
  //    escenario tenía UNA fila de pago, y con una fila comparar la lista y
  //    comparar el total son la misma aserción. Acá hay dos, y la propiedad que
  //    la comparación por filas existe para atrapar —**dos repartos distintos
  //    que suman lo mismo**— por fin se puede medir.
  const reparto = async (prefijo: string) => {
    await page.getByTestId(`${prefijo}-line-amount-0`).fill('5000')
    await page.getByTestId(`${prefijo}-add-method`).click()
    await page.getByTestId(`${prefijo}-line-method-1`).selectOption('nequi')
    await page.getByTestId(`${prefijo}-line-amount-1`).fill('3000')
  }

  await addPosProduct(page)
  await page.getByTestId('cobro-dividir').click()
  await page.getByTestId('cobro-line-method-0').selectOption('cash')
  await reparto('cobro')
  await page.getByTestId('cobro-confirmar').click()
  await expect(page.getByTestId('success-order-number').or(page.getByTestId('success-sin-numero')))
    .toBeVisible({ timeout: 20_000 })
  const porLaColumna = await loQueQuedo(await ultimaOrden())
  expect(porLaColumna.pagos.length, 'el escenario TIENE que tener dos filas, o no mide nada')
    .toBe(2)

  // El mismo reparto por el modal, que sigue vivo hasta el corte 4.
  await page.goto('/ventas')
  await waitPosReady(page)
  await addPosProduct(page)
  await page.getByTestId('cobro-mas-opciones').click()
  await expect(page.getByTestId('checkout-total')).toBeVisible({ timeout: 10_000 })
  await page.getByTestId('pay-split-toggle').click()
  await page.getByTestId('pay-line-method-0').selectOption('cash')
  await reparto('pay')
  await page.getByTestId('checkout-confirm').click()
  await expect(page.getByTestId('success-order-number').or(page.getByTestId('success-sin-numero')))
    .toBeVisible({ timeout: 20_000 })
  const porElModal = await loQueQuedo(await ultimaOrden())

  expect(
    porLaColumna.pagos,
    'las FILAS de pago tienen que ser idénticas: dos repartos distintos suman lo mismo, ' +
    'así que el total es justamente lo que NO distingue',
  ).toEqual(porElModal.pagos)
  expect(porLaColumna, 'y el resto de la orden también').toEqual(porElModal)
})

test('🔴 con crédito NO se ofrece dividir — y la base lo respalda', async ({ page }) => {
  // Capacidad 8. ⚠️ Y se asevera con el peso correcto: NO es lo único que
  // sostiene la regla. `register_sale_payment` la guarda en la base —
  //   «Solo ventas de CONTADO. La venta a credito se salda con abonos»
  //   if v_pay_status <> 'paid' then raise exception …
  // — y una orden a fiado nace `payment_status='pending'`, así que la RPC la
  // rechaza. Esto de acá es la mitad de UI: que el cajero no vea un control que
  // la base va a negar.
  await addPosProduct(page)
  await expect(page.getByTestId('cobro-dividir')).toBeVisible()
  await page.getByTestId('cobro-medio-fiado').click()
  await expect(
    page.getByTestId('cobro-dividir'),
    'una venta a crédito no se reparte entre medios: no se cobra nada hoy',
  ).toHaveCount(0)
})

// ============================================================================
// CORTE 3 · el FIADO baja a la columna
//
// La maqueta dibuja tres cosas del crédito —nombre del cliente, `Cambiar
// cliente` y el bloque de cupo—. **Todo el resto del flujo es (d)**, enumerado
// en A6 §12 antes de tocarlo: buscar cliente, alta rápida, el plazo como
// DESPLEGABLE (no input libre), la precarga, «Sin plazo», la frase que explica
// el congelado, el aviso de que no entra dinero a caja, y Cobrar deshabilitado
// sin cliente.
// ============================================================================

test('🔴 el crédito se arma en la columna: cliente y plazo, sin abrir nada', async ({ page }) => {
  await addPosProduct(page)
  await page.getByTestId('cobro-medio-fiado').click()
  await expect(
    page.getByTestId('cobro-cliente-picker'),
    'elegir el cliente es parte del cobro, y el cobro está en la columna',
  ).toBeVisible()
  await expect(page.getByTestId('checkout-total'), 'sin abrir el modal').toHaveCount(0)
})

test('🔴 F4 cambia de cliente — la tecla entra CON su control, no antes', async ({ page }) => {
  // §5 asigna F4 a «cambiar cliente» y hasta hoy no estaba cableada, porque el
  // mostrador no tenía control de cliente. Un atajo que lleva a nada es
  // exactamente lo que se acaba de arreglar con F12: las dos mitades juntas.
  await addPosProduct(page)
  await page.getByTestId('cobro-medio-fiado').click()
  await elegirCliente(page)
  await expect(page.getByTestId('cobro-cliente-nombre')).toBeVisible()

  await page.keyboard.press('F4')
  await expect(
    page.getByTestId('cobro-cliente-search'),
    'F4 tiene que devolver el buscador de clientes: es lo que §5 le asigna',
  ).toBeVisible()
})

test('🔴 el plazo es un DESPLEGABLE, no un número libre', async ({ page }) => {
  // Decisión tomada con su razón escrita (deuda 46): «el typo de 3 por 30 no lo
  // detecta nada, y una venta a 3 días se lee como vencida a los cuatro».
  // Convertirlo en input no rompe nada hoy y empeora la cartera meses después.
  await addPosProduct(page)
  await page.getByTestId('cobro-medio-fiado').click()
  await elegirCliente(page)
  const plazo = page.getByTestId('cobro-plazo')
  await expect(plazo).toBeVisible()
  expect(
    await plazo.evaluate((el) => el.tagName),
    'un input numérico admite el typo que este desplegable existe para impedir',
  ).toBe('SELECT')
  const opciones = await plazo.locator('option').allTextContents()
  expect(opciones, '«Sin plazo» es una opción explícita, no la ausencia de elección')
    .toContain('Sin plazo')
})

test('🔴 la FRASE que explica el congelado sigue en pantalla', async ({ page }) => {
  // 🔴 Un (d) que no es un control: es la ÚNICA explicación en pantalla de que
  //    el plazo se congela en la venta. Se borra en un re-skin sin que nada
  //    falle y sin que nadie la eche de menos — y sin ella alguien va a
  //    "arreglar" que cambiarle el plazo al cliente no mueva sus ventas viejas.
  // ⚠️ Se asevera que el bloque EXISTE, no su redacción: el copy puede cambiar,
  //    lo que no puede es desaparecer.
  await addPosProduct(page)
  await page.getByTestId('cobro-medio-fiado').click()
  await elegirCliente(page)
  await expect(page.getByTestId('cobro-plazo-nota')).toBeVisible()
})

test('🔴 sin cliente NO se puede cobrar a crédito', async ({ page }) => {
  await addPosProduct(page)
  await page.getByTestId('cobro-medio-fiado').click()
  await expect(
    page.getByTestId('cobro-confirmar'),
    'una venta a crédito sin deudor no es una venta a crédito',
  ).toBeDisabled()
})

test('🔴 el aviso de que el fiado NO entra a la caja sigue en pantalla', async ({ page }) => {
  // Otro (d)-frase: sin él, el cajero busca la plata del fiado en el arqueo.
  await addPosProduct(page)
  await page.getByTestId('cobro-medio-fiado').click()
  await expect(page.getByTestId('cobro-fiado-aviso')).toBeVisible()
})

test('🔴 PLAZO CONGELADO: cambiarle el plazo al cliente NO mueve la venta ya hecha', async ({ page }) => {
  // 🔴 LA ASERCIÓN CENTRAL DEL CORTE, y la única forma de distinguir «lo
  //    congeló» de «lo lee del cliente y hoy coinciden» — que es el mismo verde
  //    por construcción que tenía el corte 1 con una sola fila de pago.
  //    Quinto caso del principio «la historia no se reescribe, se le agrega»: la
  //    cartera DERIVA de `orders`, así que con el plazo sólo en el cliente el
  //    mismo `select` daría otro vencimiento mañana para una venta de enero.
  await addPosProduct(page)
  await page.getByTestId('cobro-medio-fiado').click()
  await elegirCliente(page, CLIENTE_PLAZO)
  await expect(page.getByTestId('cobro-plazo'), 'el plazo se PRECARGA del cliente')
    .toHaveValue('15')
  await page.getByTestId('cobro-confirmar').click()
  await expect(page.getByTestId('success-order-number').or(page.getByTestId('success-sin-numero')))
    .toBeVisible({ timeout: 20_000 })

  const ordenId = await ultimaOrden()
  const plazoDe = async (id: string) =>
    (await db.from('orders').select('plazo_dias').eq('id', id).single()).data!.plazo_dias
  expect(await plazoDe(ordenId), 'la venta guarda el plazo pactado').toBe(15)

  // El mutante del principio: al cliente se le cambia el plazo DESPUÉS.
  const { error: errMut } = await db.from('customers')
    .update({ plazo_dias: 90 }).eq('id', CLIENTE_PLAZO_ID)
  if (errMut) throw errMut
  expect(
    await plazoDe(ordenId),
    'la venta TIENE que conservar su plazo: si sigue al cliente, el vencimiento de una venta ' +
    'de enero cambia mañana y la cartera deja de ser reproducible',
  ).toBe(15)

  // ⚠️ LÍMITE DE ESTE CASO, dicho para que nadie lea de más en su verde.
  //    El mutante que lo mata es el de la PRIMERA mitad —no guardar el plazo en
  //    la orden—, y muere ahí. La SEGUNDA mitad —cambiarle el plazo al cliente y
  //    que la orden no se mueva— **hoy es cierta por construcción**: el plazo es
  //    una columna de `orders` y nada escribe hacia atrás. O sea que es un
  //    TRIPWIRE para un cambio futuro, no una medición del código de hoy, y no
  //    hay mutante razonable que la mate sin cambiar el esquema.
  //    🔴 Y lo que NO cubre, que es donde vive el riesgo real: si algún día
  //    `getDebts` leyera el plazo del CLIENTE en vez de la orden, este caso
  //    seguiría verde — mira `orders.plazo_dias` directo. Ese lado se prueba en
  //    la cartera, no acá.
})

test('🔴 EQUIVALENCIA A CRÉDITO: columna y modal escriben la misma orden', async ({ page }) => {
  const cobrarFiado = async (
    abrirCredito: () => Promise<void>, prefijo: string, prefijoCliente: string,
  ) => {
    await addPosProduct(page)
    await abrirCredito()
    await elegirCliente(page, CLIENTE_EQ, prefijoCliente)
    await page.getByTestId(prefijo).click()
    await expect(page.getByTestId('success-order-number').or(page.getByTestId('success-sin-numero')))
      .toBeVisible({ timeout: 20_000 })
    return loQueQuedo(await ultimaOrden())
  }

  const porLaColumna = await cobrarFiado(
    async () => { await page.getByTestId('cobro-medio-fiado').click() },
    'cobro-confirmar', 'cobro-cliente',
  )
  expect(porLaColumna.estadoDePago, 'a crédito la orden queda pendiente').toBe('pending')
  expect(porLaColumna.pagos, 'y NO registra pago: no entró dinero').toEqual([])

  await page.goto('/ventas')
  await waitPosReady(page)
  const porElModal = await cobrarFiado(async () => {
    await page.getByTestId('cobro-mas-opciones').click()
    await expect(page.getByTestId('checkout-total')).toBeVisible({ timeout: 10_000 })
    await page.getByTestId('pay-method-fiado').click()
  }, 'checkout-continue', 'customer')

  expect(porLaColumna, 'las dos superficies escriben la misma orden a crédito')
    .toEqual(porElModal)
})
