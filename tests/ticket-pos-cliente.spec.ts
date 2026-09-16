import { test, expect, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { loginAsOwner, ownerCreds } from './helpers/auth'
import { waitPosReady, addPosProduct, cobrarCon } from './helpers/pos'
import { openShiftIfClosed } from './helpers/shift'

// ============================================================================
// EL TICKET DEL POS MUESTRA A QUIÉN SE LE VENDIÓ — y no lo muestra si no hubo
//
// 🔴 POR QUÉ EXISTE, y la razón es de DÓNDE se mide, no de qué:
//    el 2026-09-15 se miró el ticket de la venta **#128 de producción** y no
//    traía cliente. Medido contra la base, esa venta tenía `customer_id` NULL
//    — o sea que el ticket estaba bien. Pero una observación de producción es
//    **una sola muestra y sin control**: no distingue «el ticket no lo imprime»
//    de «no había nada que imprimir».
//
// ✅ El par que SÍ discrimina es éste, y sólo se puede armar donde se puede
//    repetir: una venta CON cliente y otra SIN, en `LAB Pruebas`. En el tenant
//    de la clienta no se prueba — una venta de prueba consume correlativo,
//    descuenta stock, entra a sus reportes y NO SE PUEDE BORRAR.
//
// 🔴 Y HAY DOS IMPLEMENTACIONES DE TICKET (deuda 108), así que este archivo
//    mide **la del POS** — `PrintTicket` en `POSPage.tsx`, la que se imprime en
//    cada venta. La otra es `buildSaleTicketHtml`, la reimpresión del
//    Historial, que ya tiene su test unitario.
//
// ⚠️ CÓMO SE LEE, y no es un detalle: `.ticket-print` es `display:none` en
//    pantalla —existe sólo en `@media print`—. Entonces:
//      · `toBeVisible()` daría ROJO siempre, y no por el sujeto;
//      · `innerText` devuelve **''** para un nodo oculto, y con `''` todas las
//        aserciones de «no dice X» pasan SIN MIRAR NADA.
//    Por eso se lee con `textContent` y por eso el control de abajo —que el
//    contenido no vino vacío— no es prolijidad: es lo que separa este caso de
//    uno que pasa con la entrada vacía.
// ============================================================================

let CLIENTE = ''

test.beforeAll(async () => {
  const db = createClient(process.env.VITE_NODO_SUPABASE_URL!, process.env.VITE_NODO_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  })
  const { error } = await db.auth.signInWithPassword(ownerCreds())
  if (error) throw error
  const uid = (await db.auth.getUser()).data.user!.id
  const p = await db.from('profiles').select('sede_id').eq('id', uid).single()
  if (p.error) throw p.error

  const c = await db.from('customers')
    .select('name').eq('sede_id', p.data.sede_id).eq('is_active', true).limit(1)
  if (c.error) throw c.error
  expect(
    c.data?.length,
    'el lab necesita al menos un cliente ACTIVO en esta sede, o el caso no puede montar su escenario',
  ).toBe(1)
  CLIENTE = c.data![0].name as string
})

/** El ticket del POS, leído como se puede leer un nodo `display:none`. */
async function textoDelTicket(page: Page): Promise<string> {
  const ticket = page.locator('.ticket-print')
  await expect(ticket, 'el ticket tiene que estar en el DOM después de cobrar').toHaveCount(1, {
    timeout: 15_000,
  })
  const texto = (await ticket.textContent()) ?? ''
  // 🔴 EL CONTROL DE LA PROPIA LECTURA. Sin esto, un `''` —que es lo que
  //    devolvería `innerText` sobre este nodo— haría pasar en verde toda
  //    aserción de ausencia, incluido el control negativo de abajo.
  expect(
    texto.length,
    'el ticket se leyó VACÍO: la lectura no sirve, y con vacío las aserciones de ' +
    '«no dice X» pasan sin mirar nada',
  ).toBeGreaterThan(20)
  return texto
}

test('🔴 con cliente elegido, el ticket del POS dice a quién se le vendió', async ({ page }) => {
  await loginAsOwner(page)
  await waitPosReady(page)
  await addPosProduct(page)
  await openShiftIfClosed(page, 0)

  // El mismo camino que `cliente-en-la-venta.spec`: se teclea el nombre exacto
  // para que quede UNA opción, así el clic no depende del orden del catálogo.
  await page.getByTestId('cart-customer-search').fill(CLIENTE)
  const opcion = page.getByTestId('cart-customer-option')
  await expect(
    opcion,
    `buscar «${CLIENTE}» tiene que dejar exactamente una opción en el picker`,
  ).toHaveCount(1, { timeout: 15_000 })
  await opcion.click()
  await expect(
    page.getByTestId('cart-customer-resumen'),
    'después de elegir, el carrito tiene que decir a quién se le está vendiendo',
  ).toContainText(CLIENTE)

  await cobrarCon(page, 'nequi')
  await expect(page.getByText(/Venta #\d+ registrada/)).toBeVisible({ timeout: 15_000 })

  // ── EL SUJETO ──────────────────────────────────────────────────────────
  const texto = await textoDelTicket(page)
  expect(
    texto,
    'EL TICKET DEL POS NO NOMBRA AL CLIENTE. Es el papel que se entrega en cada ' +
    'venta, y la línea del cliente vive en una implementación INDEPENDIENTE de ' +
    'la reimpresión (deuda 108): se puede haber agregado en una sola de las dos',
  ).toContain(`Cliente: ${CLIENTE}`)

  // ⚠️ Y el SUBTOTAL, que es la divergencia MEDIDA entre los dos tickets: el del
  //    POS lo imprime SIEMPRE y `buildSaleTicketHtml` no lo tiene nunca. Va
  //    aseverado acá para que el día que alguien unifique los dos papeles
  //    (deuda 108) el rojo diga cuál de las dos formas se perdió.
  expect(
    texto,
    'el ticket del POS imprime Subtotal de forma incondicional; si desapareció, ' +
    'la unificación de los dos tickets se llevó puesta la forma del POS',
  ).toContain('Subtotal')
})

test('🔴 SIN cliente, el ticket NO inventa la línea — el control que hace que el otro caso mida', async ({ page }) => {
  // Sin este caso, el de arriba no distingue «el ticket imprime al cliente» de
  // «el ticket imprime una línea de cliente siempre». Es el mismo escenario
  // menos una acción: la única diferencia es no elegir cliente.
  await loginAsOwner(page)
  await waitPosReady(page)
  await addPosProduct(page)
  await openShiftIfClosed(page, 0)

  await cobrarCon(page, 'nequi')
  await expect(page.getByText(/Venta #\d+ registrada/)).toBeVisible({ timeout: 15_000 })

  const texto = await textoDelTicket(page)
  expect(
    texto,
    'el ticket trae una línea de CLIENTE en una venta donde no se eligió ninguno: ' +
    'ni un campo vacío ni un guion donde no hubo dato',
  ).not.toContain('Cliente:')

  // Control positivo de la lectura: el ticket SÍ trae lo que debe traer, así que
  // el `not.toContain` de arriba no está pasando por mirar el lugar equivocado.
  expect(
    texto,
    'el ticket tiene que decir qué es; si no, la lectura no está viendo el ticket',
  ).toContain('COMPROBANTE DE VENTA')
})
