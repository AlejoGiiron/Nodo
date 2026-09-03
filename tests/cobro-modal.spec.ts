import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { loginAsOwner, ownerCreds } from './helpers/auth'
import { openShiftIfClosed } from './helpers/shift'
import { waitPosReady, addPosProduct, abrirCobro, POS_PRODUCTO } from './helpers/pos'

// ============================================================================
// EL COBRO — en MODAL. §8.15, revertida el 2026-09-03.
//
// 🔴 ESTE ARCHIVO ERA `cobro-en-linea.spec.ts` Y SE RENOMBRÓ, no se editó de
//    costado: el nombre de un spec dice cuál es su sujeto, y el sujeto cambió.
//    Un archivo llamado «cobro en línea» lleno de casos que abren un modal es
//    la misma clase de nota falsa que el botón que imprimía una tecla muerta.
//
// 🔴 POR QUÉ VOLVIÓ EL MODAL, y sale de USO y no de diseño. El cobro en línea
//    era lo que dibuja la maqueta, y la maqueta tenía razón sobre el papel: un
//    paso menos. Contra la pantalla real, «en la columna todo queda chico y
//    amontonado, y el scroll dentro del panel es el síntoma de que no cabe» —
//    y ese scroll lo habíamos puesto NOSOTROS, como arreglo, dos días antes.
//    Un arreglo que consiste en hacer scroll dentro de un panel de 420px de
//    ancho es la confesión de que el contenido no entra.
//    El modal compra 540px de ancho a cambio de un clic. El cobro es la
//    pantalla del producto que menos tolera apretar.
//
// ⚠️ QUÉ SE PERDIÓ AL VOLVER, dicho acá y no descubierto por el próximo:
//    el caso que aseveraba que la grilla de medios y el campo de dinero
//    CONVIVEN. El modal parte el cobro en dos pasos, así que no conviven. Lo
//    que sobrevive —y se re-derivó, ver abajo— es la propiedad que importaba:
//    que la letra mande con el foco adentro del campo de dinero.
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

/** Lo que quedó PERSISTIDO de una orden — que es lo único que no es una vista. */
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

/** Un cliente estable para los casos que no miden la elección en sí. */
const CLIENTE_EQ = 'E2E Cobro Equivalencia'
/** El del caso del plazo congelado: su plazo se muta DENTRO del caso. */
const CLIENTE_PLAZO = 'E2E Cobro Plazo'
let CLIENTE_PLAZO_ID: string

/**
 * Deja un cliente del lab ACTIVO y con el plazo pedido, exista o no.
 *
 * ⚠️ El `is_active` no es un detalle: los specs de fiado dan de baja a sus
 * clientes al limpiar y `getCustomers` filtra por activos. Sin esto el picker
 * dice «Aún no hay clientes» y el caso falla por el estado del lab, no por el
 * cobro.
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
 * Elige un cliente en el picker del cobro — POR NOMBRE, no con `.first()`.
 * El primero de la lista depende de qué dejó otro spec: es exactamente la clase
 * «un locator apoyado en unicidad no declarada» que este proyecto ya pagó.
 */
async function elegirCliente(page: Page, nombre = CLIENTE_EQ): Promise<void> {
  await page.getByTestId('customer-search').fill(nombre)
  await page.getByTestId('customer-option').filter({ hasText: nombre }).first().click()
}

/** Abre el cobro con el crédito ya elegido: es el prólogo de media docena de casos. */
async function abrirCredito(page: Page): Promise<void> {
  await addPosProduct(page)
  await abrirCobro(page)
  await page.getByTestId('pay-method-fiado').click()
}

test.beforeAll(async () => {
  db = createClient(process.env.VITE_NODO_SUPABASE_URL!, process.env.VITE_NODO_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  })
  const { error } = await db.auth.signInWithPassword(ownerCreds())
  if (error) throw error
  const uid = (await db.auth.getUser()).data.user!.id
  SEDE = (await db.from('profiles').select('sede_id').eq('id', uid).single()).data!.sede_id as string

  await clienteDelLab(CLIENTE_EQ, 30)
  // 🔴 El del caso del plazo se crea ACÁ y no dentro del test: `useCustomers`
  //    cachea 60 s, así que un cliente insertado con la app ya cargada NO
  //    aparece en el picker. Y se RESETEA a 15: el propio caso le pone 90 al
  //    final, así que sin el reset la segunda corrida arrancaría desde el
  //    estado que dejó la primera.
  CLIENTE_PLAZO_ID = await clienteDelLab(CLIENTE_PLAZO, 15)
})

test.beforeEach(async ({ page }) => {
  await loginAsOwner(page)
  await page.goto('/ventas')
  await openShiftIfClosed(page, 0)
  await page.goto('/ventas')
  await waitPosReady(page)
})

// ============================================================================
// LA VENTA SIMPLE
// ============================================================================

test('🔴 la venta simple queda en la base: total, pago y estado', async ({ page }) => {
  // 🔴 RE-ALOJADO. Este caso era «la columna cobra SIN ABRIR EL MODAL», y ese
  //    sujeto murió con la columna. Sus aserciones NO: lo que valía era lo que
  //    quedaba escrito, no por dónde se escribió. Comparar pantallas es comparar
  //    vistas; la base es la única que no es una vista.
  await addPosProduct(page)
  await abrirCobro(page)
  await page.getByTestId('pay-method-efectivo').click()
  await page.getByTestId('checkout-continue').click()
  await page.getByTestId('checkout-received').fill('20000')
  await expect(page.getByTestId('checkout-change'), 'el vuelto se calcula antes de cobrar')
    .toContainText('12.000')
  await page.getByTestId('checkout-confirm-efectivo').click()
  await expect(page.getByTestId('success-order-number').or(page.getByTestId('success-sin-numero')))
    .toBeVisible({ timeout: 20_000 })

  const quedo = await loQueQuedo(await ultimaOrden())
  expect(quedo.total, 'el total lo deriva el servidor de las líneas (deuda 80)').toBe(8_000)
  expect(quedo.pagos, 'una fila de pago, con su método y su monto')
    .toEqual([{ metodo: 'cash', monto: 8_000 }])
  expect(quedo.estadoDePago, 'y la venta queda pagada').toBe('paid')
})

test('🔴 E·T·C mandan donde HAY GRILLA, y se apagan en el paso del monto', async ({ page }) => {
  // ==========================================================================
  // 🔴 EL CASO MÁS IMPORTANTE DEL ARCHIVO, Y EL QUE MÁS CAMBIÓ AL VOLVER EL
  //    MODAL. Tiene DOS MITADES y ninguna sirve sola.
  //
  //    Los medios de pago se atajan con LETRAS y no con dígitos por UNA razón:
  //    el campo «Efectivo recibido» tiene `autoFocus` y consume dígitos, así que
  //    `1/2/3` pelearían con el único control que la cajera está usando en ese
  //    momento. Ese campo DESCARTA las letras. **Esa razón sigue entera.**
  //
  // 🔴 LO QUE CAMBIÓ ES QUE EN EL PASO DEL MONTO NO HAY QUÉ MOSTRAR. Con el
  //    cobro en línea la grilla estaba siempre visible y la letra daba
  //    retroalimentación inmediata. El modal parte el cobro en dos pasos: ahí
  //    la letra cambiaría el medio **en silencio**, con el foco adentro del
  //    campo del dinero. Un cambio invisible sobre el estado que decide a dónde
  //    va la plata es la peor combinación posible, así que el atajo se apaga.
  //
  // ⚠️ SIN LA SEGUNDA MITAD ESTE CASO NO MIDE NADA. Un manejador que responde
  //    SIEMPRE pasaría la primera; uno borrado del todo pasaría la segunda. Las
  //    dos juntas son las que fijan el comportamiento.
  // ==========================================================================
  await addPosProduct(page)
  await abrirCobro(page)

  // ── MITAD 1 · con la grilla en pantalla, la letra MANDA ───────────────────
  await page.keyboard.press('t')
  await expect(
    page.getByTestId('pay-method-transferencia'),
    'T elige transferencia (la que §5 nombra; tarjeta queda SIN atajo a propósito)',
  ).toHaveAttribute('aria-pressed', 'true')

  await page.keyboard.press('c')
  await expect(page.getByTestId('pay-method-fiado')).toHaveAttribute('aria-pressed', 'true')

  await page.keyboard.press('e')
  await expect(page.getByTestId('pay-method-efectivo')).toHaveAttribute('aria-pressed', 'true')

  // ── MITAD 2 · en el paso del MONTO, la misma tecla NO hace nada ───────────
  await page.getByTestId('checkout-continue').click()

  const dinero = page.getByTestId('checkout-received')
  await expect(dinero, 'el paso del monto enfoca el campo solo: es la razón de todo esto')
    .toBeFocused()
  await expect(
    dinero,
    'y DECLARA que las letras le son inertes — la razón principal de haber elegido letras, ' +
    'que no depende de dónde viva el cobro',
  ).toHaveAttribute('data-letras-inertes', '')

  await dinero.fill('9000')
  await page.keyboard.press('t')

  expect(
    await dinero.inputValue(),
    'la letra NO se escribe en el campo de dinero: el campo descarta lo que no es dígito',
  ).toBe('9.000')

  // Y el medio TAMPOCO cambió. Se comprueba volviendo al paso donde el medio se
  // puede leer: es el único lugar donde la diferencia entre «cambió en silencio»
  // y «no cambió» es observable — que es exactamente el argumento por el que el
  // atajo se apagó.
  await page.getByRole('button', { name: 'Atrás' }).click()
  await expect(
    page.getByTestId('pay-method-efectivo'),
    'el medio sigue siendo el que se eligió con la grilla a la vista',
  ).toHaveAttribute('aria-pressed', 'true')
  await expect(
    page.getByTestId('pay-method-transferencia'),
    'la T apretada en el paso del monto NO cambió el medio: sin grilla en pantalla el atajo ' +
    'no manda, porque un cambio invisible sobre el medio de pago es peor que no tener atajo',
  ).toHaveAttribute('aria-pressed', 'false')
})

// ============================================================================
// GEOMETRÍA — el carrito cabe en la pantalla
// ============================================================================

test.describe('el carrito cabe en la pantalla', () => {
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
  // 🔴🔴 HOY ESTE CASO NO DISCRIMINA, Y SE DEJA IGUAL — anotado el 2026-09-03,
  //    al volver el cobro al modal. Con el cobro afuera, el panel de tinta
  //    volvió a ~180px y a 900px de alto **todo entra con holgura**: las tres
  //    aserciones son ciertas con el mínimo puesto y también sin él. O sea que
  //    hoy es un verde que no puede fallar, que es exactamente lo que R4 manda
  //    desconfiar.
  //    Se conserva a propósito, y con el nombre puesto: es **el tripwire que no
  //    se puede matar**. La categoría existe desde el caso del plazo congelado
  //    —cuya segunda mitad también es cierta por construcción— y la regla es la
  //    misma: un tripwire mide un cambio FUTURO, no el código de hoy, y por eso
  //    se escribe la razón al lado en vez de dejar que el próximo lo lea como
  //    cobertura.
  //    Lo que ataja es la CLASE: «un bloque de alto fijo en esta columna deja a
  //    su hermano en cero». Vuelve con cualquier cosa que crezca ahí —un aviso,
  //    un resumen, el cobro otra vez—, y entonces el caso vuelve a discriminar
  //    sin que nadie tenga que acordarse de escribirlo.
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
          cobrarEnViewport: enViewport('[data-testid=cobro-abrir]'),
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
// EL PAGO MIXTO
//
// 🔴 LA MAQUETA NO DIBUJA EL PAGO DIVIDIDO EN ABSOLUTO — no lo dibuja distinto:
//    no está. **El flujo entero es (d) NO DIBUJADO**, y sus ocho capacidades
//    quedaron enumeradas en `docs/auditorias/A6-visual-contra-la-maqueta.md`
//    §12. Esa enumeración es la que hizo que ninguna se perdiera en dos
//    mudanzas seguidas.
// ============================================================================

test('🔴 un método NO se repite entre líneas del reparto', async ({ page }) => {
  // Capacidad 6. Sin control visible: es una regla de comportamiento, de las que
  // un rediseño mirando la maqueta borra sin notarlo. Dos líneas del mismo
  // método dan un reparto que la RPC acepta —la suma cuadra— y que el reporte
  // por medio de pago no puede explicar.
  await addPosProduct(page)
  await abrirCobro(page)
  await page.getByTestId('pay-split-toggle').click()
  await page.getByTestId('pay-line-method-0').selectOption('cash')
  await page.getByTestId('pay-add-method').click()

  const opciones = await page.getByTestId('pay-line-method-1').locator('option')
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
  await abrirCobro(page)
  await page.getByTestId('pay-split-toggle').click()
  await page.getByTestId('pay-line-amount-0').fill('3000')
  await expect(
    page.getByTestId('pay-remaining'),
    'faltan 5.000 de los 8.000: la cifra tiene que estar antes de confirmar',
  ).toContainText('5.000')
})

test('🔴 el reparto queda en la base FILA POR FILA, no sólo su total', async ({ page }) => {
  // Lo que este caso mide y ningún total puede medir: **dos repartos distintos
  // suman lo mismo**, así que el total es justamente lo que NO distingue.
  await addPosProduct(page)
  await abrirCobro(page)
  await page.getByTestId('pay-split-toggle').click()
  await page.getByTestId('pay-line-method-0').selectOption('cash')
  await page.getByTestId('pay-line-amount-0').fill('5000')
  await page.getByTestId('pay-add-method').click()
  await page.getByTestId('pay-line-method-1').selectOption('nequi')
  await page.getByTestId('pay-line-amount-1').fill('3000')
  await page.getByTestId('checkout-confirm-mixto').click()
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
  await abrirCobro(page)
  await expect(page.getByTestId('pay-split-toggle')).toBeVisible()
  await page.getByTestId('pay-method-fiado').click()
  await expect(
    page.getByTestId('pay-split-toggle'),
    'una venta a crédito no se reparte entre medios: no se cobra nada hoy',
  ).toHaveCount(0)
})

// ============================================================================
// EL CRÉDITO
//
// La maqueta dibuja tres cosas —nombre del cliente, «Cambiar cliente» y el
// bloque de cupo—. **Todo el resto del flujo es (d)**, enumerado en A6 §12:
// buscar cliente, alta rápida, el plazo como DESPLEGABLE (no input libre), la
// precarga, «Sin plazo», la frase que explica el congelado, el aviso de que no
// entra dinero a caja, y Cobrar deshabilitado sin cliente.
//
// ⚠️ «Cambiar cliente» NO tiene botón acá, y es una decisión: el picker del
//    modal muestra la lista completa con el elegido marcado, así que se cambia
//    de cliente clickeando otro. El botón existía en la columna porque ahí el
//    picker colapsaba. F4 apunta al buscador — el caso vive en `atajos.spec`.
// ============================================================================

test('🔴 el elegido queda MARCADO y la lista sigue clickeable — por eso no hace falta un botón', async ({ page }) => {
  // 🔴 El estado «elegido» vivía SÓLO en el color de fondo y el ícono, o sea en
  //    un lugar donde ningún verificador mira — la misma forma que el botón que
  //    imprimía «F12» con la tecla muerta. `aria-pressed` lo hizo aseverable.
  //    Y es lo que sostiene la decisión de no agregar un botón «Cambiar
  //    cliente»: si el picker no siguiera ofreciendo la lista, haría falta uno.
  await abrirCredito(page)
  await elegirCliente(page)
  const elegido = page.getByTestId('customer-option').filter({ hasText: CLIENTE_EQ }).first()
  await expect(elegido, 'el cliente elegido queda marcado').toHaveAttribute('aria-pressed', 'true')
  await expect(
    page.getByTestId('customer-search'),
    'y el buscador NO desaparece: cambiar de cliente no necesita un control aparte',
  ).toBeVisible()
})

test('🔴 el plazo es un DESPLEGABLE, no un número libre', async ({ page }) => {
  // Decisión tomada con su razón escrita (deuda 46): «el typo de 3 por 30 no lo
  // detecta nada, y una venta a 3 días se lee como vencida a los cuatro».
  // Convertirlo en input no rompe nada hoy y empeora la cartera meses después.
  await abrirCredito(page)
  await elegirCliente(page)
  const plazo = page.getByTestId('pos-plazo')
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
  await abrirCredito(page)
  await elegirCliente(page)
  await expect(page.getByTestId('pos-plazo-nota')).toBeVisible()
})

test('🔴 sin cliente NO se puede cobrar a crédito', async ({ page }) => {
  await abrirCredito(page)
  await expect(
    page.getByTestId('checkout-continue'),
    'una venta a crédito sin deudor no es una venta a crédito',
  ).toBeDisabled()
})

test('🔴 el aviso de que el fiado NO entra a la caja sigue en pantalla', async ({ page }) => {
  // Otro (d)-frase: sin él, el cajero busca la plata del fiado en el arqueo.
  await abrirCredito(page)
  await expect(page.getByTestId('pos-fiado-aviso')).toBeVisible()
})

test('🔴 PLAZO CONGELADO: cambiarle el plazo al cliente NO mueve la venta ya hecha', async ({ page }) => {
  // 🔴 LA ASERCIÓN CENTRAL DEL CRÉDITO, y la única forma de distinguir «lo
  //    congeló» de «lo lee del cliente y hoy coinciden» — que es el mismo verde
  //    por construcción que tendría una venta con una sola fila de pago.
  //    Quinto caso del principio «la historia no se reescribe, se le agrega»: la
  //    cartera DERIVA de `orders`, así que con el plazo sólo en el cliente el
  //    mismo `select` daría otro vencimiento mañana para una venta de enero.
  await abrirCredito(page)
  await elegirCliente(page, CLIENTE_PLAZO)
  await expect(page.getByTestId('pos-plazo'), 'el plazo se PRECARGA del cliente')
    .toHaveValue('15')
  await page.getByTestId('checkout-continue').click()
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
  //    hay mutante razonable que la mate sin cambiar el esquema. Misma categoría
  //    que el caso geométrico de arriba.
  //    🔴 Y lo que NO cubre, que es donde vive el riesgo real: si algún día
  //    `getDebts` leyera el plazo del CLIENTE en vez de la orden, este caso
  //    seguiría verde — mira `orders.plazo_dias` directo. Ese lado se prueba en
  //    la cartera, no acá (deuda 89).
})

test('🔴 la venta a crédito queda pendiente, SIN pago y con su plazo', async ({ page }) => {
  await abrirCredito(page)
  await elegirCliente(page, CLIENTE_EQ)
  await page.getByTestId('checkout-continue').click()
  await expect(page.getByTestId('success-order-number').or(page.getByTestId('success-sin-numero')))
    .toBeVisible({ timeout: 20_000 })

  const quedo = await loQueQuedo(await ultimaOrden())
  expect(quedo.estadoDePago, 'a crédito la orden queda pendiente de pago').toBe('pending')
  expect(quedo.pagos, 'y NO registra pago: no entró dinero a la caja').toEqual([])
  expect(quedo.total, 'el total se deriva igual: la mercancía salió').toBe(8_000)
})
