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

// 🔴 ACÁ VIVÍA «EQUIVALENCIA: columna y modal escriben lo mismo», y se BORRÓ en
//    el corte 4 junto con su sujeto: ya no hay dos superficies que comparar.
//    Sus aserciones contra la BASE no se perdieron — el caso «la columna cobra
//    sin abrir el modal» de arriba ya asevera total, filas de pago y estado de
//    pago sobre la misma venta. Lo que se fue es la comparación, que sin la
//    segunda superficie no significa nada.

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
  // ⚠️ Acá había una aserción de que NO se abría el cobro completo. Desde el
  //    corte 4 ese modal no existe, así que sería cierta siempre. Lo que queda
  //    midiendo el caso es que el botón cobra: el diálogo del después aparece.
  await expect(page.getByTestId('success-order-number').or(page.getByTestId('success-sin-numero')))
    .toBeVisible({ timeout: 20_000 })
})

test.describe('la columna cabe en la pantalla', () => {
  // ==========================================================================
  // 🔴 ASERCIONES GEOMÉTRICAS, Y NO DE VISIBILIDAD — ÉSE ES EL HALLAZGO.
  //
  // Al bajar el cobro a la columna, el panel de tinta pasó a 485px y la lista
  // del carrito **colapsó a cero** en todo viewport de hasta ~1050px de alto:
  // la cajera no veía qué estaba vendiendo. La venta salía bien, la base
  // quedaba perfecta, y la suite entera estaba VERDE.
  //
  // ⚠️ `toBeVisible()` NO lo caza, y no por falta de cobertura: el ítem sigue
  //    en el DOM y tiene bounding box, así que **para Playwright un elemento
  //    clipeado por un contenedor de altura 0 es visible**. Si lo que importa
  //    es que SE VEA, la aserción tiene que ser geométrica: que el rectángulo
  //    del elemento caiga DENTRO del rectángulo que lo contiene.
  //
  // 🔴 Y cubre las TRES cosas a propósito. El primer arreglo —scrollear el
  //    panel entero— devolvió la lista y dejó el botón Cobrar debajo del
  //    pliegue: un defecto cambiado por otro, con la suite igual de verde. Sin
  //    las tres juntas, el próximo arreglo de alto vuelve a hacer lo mismo sin
  //    que nada avise.
  // ==========================================================================
  const CASOS: [number, string][] = [
    [900, 'el viewport donde el defecto aparecía'],
    [1300, 'el control: si acá tampoco pasara, la aserción no mide'],
  ]

  for (const [alto, porque] of CASOS) {
    test(`🔴 a 1440×${alto} se ven las tres: ítem, total y Cobrar — ${porque}`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: alto })
      await page.goto('/ventas')
      await waitPosReady(page)
      // 🔴 TRES ÍTEMS DISTINTOS, y no uno. Con uno solo el caso NO DISTINGUE
      //    «entran tres filas» de «entra una» — y se comprobó: con un ítem, el
      //    mutante que pone el mínimo en cero SOBREVIVE. Es la misma forma que
      //    la comparación de `payments` con una sola fila, en otro eje: una
      //    aserción sobre una capacidad de N no está ejercida con N=1.
      //    Tres porque una venta de mostrador típica lleva tres o cuatro, que
      //    es de dónde salió el mínimo.
      //    ⚠️ El lab tiene TRES productos y dos con fricción: `Lab Coctel` abre
      //    el modal de extras y hay que confirmarlo; `Lab Vaso` está en cero y
      //    entra igual (la sobreventa se avisa, no se bloquea).
      for (const nombre of ['Lab Cerveza', 'Lab Vaso', 'Lab Coctel']) {
        await page.getByTestId('product-card').filter({ hasText: nombre }).first().click()
        const config = page.getByTestId('item-config-modal')
        if (await config.isVisible().catch(() => false)) {
          await page.getByTestId('item-config-confirm').click()
        }
      }
      await expect(
        page.getByTestId('cart-item-price'),
        'sin tres filas el caso no ejerce el mínimo: con una, el mutante que lo pone en cero sobrevive',
      ).toHaveCount(3)

      const medido = await page.evaluate(() => {
        const filas = [...document.querySelectorAll('[data-testid=cart-item-price]')]
        // La ÚLTIMA: es la que cae afuera cuando el contenedor no da el alto.
        const item = filas[filas.length - 1]
        let caja = item?.parentElement
        while (caja && getComputedStyle(caja).overflowY !== 'auto') caja = caja.parentElement
        const r = item?.getBoundingClientRect()
        const c = caja?.getBoundingClientRect()
        const enViewport = (sel: string) => {
          const b = document.querySelector(sel)?.getBoundingClientRect()
          return b ? b.top >= 0 && b.bottom <= window.innerHeight + 1 : false
        }
        return {
          hayItem: !!item,
          filas: filas.length,
          altoCaja: c ? Math.round(c.height) : 0,
          itemDentro: !!(r && c) && r.top >= c.top - 1 && r.bottom <= c.bottom + 1,
          totalEnViewport: enViewport('[data-testid=cart-total]'),
          cobrarEnViewport: enViewport('[data-testid=cobro-confirmar]'),
        }
      })

      expect(medido.hayItem, 'control de la propia sonda: sin ítem no mide nada').toBe(true)
      expect(medido.filas, 'y con menos de tres filas el caso no ejerce el mínimo').toBe(3)
      expect(
        medido.itemDentro,
        `la TERCERA línea del carrito quedó FUERA de su contenedor (alto ${medido.altoCaja}px): ` +
        'la cajera no ve qué está vendiendo. `toBeVisible()` pasa igual',
      ).toBe(true)
      expect(
        medido.totalEnViewport,
        'el total a cobrar quedó fuera de la pantalla',
      ).toBe(true)
      expect(
        medido.cobrarEnViewport,
        'el botón Cobrar quedó debajo del pliegue: se puede ver la venta y no cerrarla',
      ).toBe(true)
    })
  }
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
  // ⚠️ Ya no se asevera «sin abrir el modal»: desde el corte 4 el modal de cobro
  //    NO EXISTE, así que la aserción sería cierta siempre — un verde que no
  //    puede fallar. Lo que queda medido es que el control esté en la columna,
  //    arriba.
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

test('🔴 el reparto queda en la base FILA POR FILA, no sólo su total', async ({ page }) => {
  // 🔴 RE-ALOJADO en el corte 4. Este caso era «EQUIVALENCIA DEL REPARTO:
  //    columna y modal escriben las MISMAS FILAS» y su sujeto —las dos
  //    superficies— dejó de existir. Lo que NO se pierde son sus aserciones
  //    contra la base, que son las que valían: **dos repartos distintos suman lo
  //    mismo**, así que el total es justamente lo que no distingue.
  await addPosProduct(page)
  await page.getByTestId('cobro-dividir').click()
  await page.getByTestId('cobro-line-method-0').selectOption('cash')
  await page.getByTestId('cobro-line-amount-0').fill('5000')
  await page.getByTestId('cobro-add-method').click()
  await page.getByTestId('cobro-line-method-1').selectOption('nequi')
  await page.getByTestId('cobro-line-amount-1').fill('3000')
  await page.getByTestId('cobro-confirmar').click()
  await expect(page.getByTestId('success-order-number').or(page.getByTestId('success-sin-numero')))
    .toBeVisible({ timeout: 20_000 })

  const quedo = await loQueQuedo(await ultimaOrden())
  expect(quedo.pagos.length, 'el escenario TIENE que tener dos filas, o no mide nada').toBe(2)
  expect(
    quedo.pagos,
    'cada fila con SU método y SU monto: un reparto 3.000/5.000 y uno 5.000/3.000 ' +
    'suman igual y son ventas distintas',
  ).toEqual([{ metodo: 'nequi', monto: 3_000 }, { metodo: 'cash', monto: 5_000 }])
  expect(quedo.total, 'y el total lo deriva el servidor de las líneas').toBe(8_000)
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
  // ⚠️ Ya no se asevera «sin abrir el modal»: desde el corte 4 el modal de cobro
  //    NO EXISTE, así que la aserción sería cierta siempre — un verde que no
  //    puede fallar. Lo que queda medido es que el control esté en la columna,
  //    arriba.
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

test('🔴 la venta a crédito queda pendiente, SIN pago y con su plazo', async ({ page }) => {
  // 🔴 RE-ALOJADO en el corte 4, igual que el del reparto: era «EQUIVALENCIA A
  //    CRÉDITO» y su sujeto se fue con el modal. Sus aserciones contra la base
  //    —lo que de verdad medía— quedan acá.
  await addPosProduct(page)
  await page.getByTestId('cobro-medio-fiado').click()
  await elegirCliente(page, CLIENTE_EQ)
  await page.getByTestId('cobro-confirmar').click()
  await expect(page.getByTestId('success-order-number').or(page.getByTestId('success-sin-numero')))
    .toBeVisible({ timeout: 20_000 })

  const quedo = await loQueQuedo(await ultimaOrden())
  expect(quedo.estadoDePago, 'a crédito la orden queda pendiente de pago').toBe('pending')
  expect(quedo.pagos, 'y NO registra pago: no entró dinero a la caja').toEqual([])
  expect(quedo.total, 'el total se deriva igual: la mercancía salió').toBe(8_000)
})
