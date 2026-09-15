import { test, expect, type Page } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { loginAsOwner, ownerCreds } from './helpers/auth'
import { waitPosReady, addPosProduct, cobrarCon } from './helpers/pos'
import { openShiftIfClosed } from './helpers/shift'

// ============================================================================
// EL CLIENTE SE PERSISTE EN LA VENTA — TAMBIÉN CUANDO EL PAGO NO ES FIADO
//
// 🔴 EL DEFECTO QUE ESTE ARCHIVO EXISTE PARA CAZAR, y es de los que PIERDEN
//    DATOS: `useCobro` escribía `customer_id` y `customer_name` **dentro** del
//    `...(esFiado ? {…} : {})`. O sea que una venta de contado con cliente
//    elegido guardaba `null` en las dos columnas, y eso no se recupera después:
//    no hay de dónde derivar a quién se le vendió.
//
// ⚠️ Y ES LA HERMANA DEL BUG DE PRODUCCIÓN QUE DIMOS POR CERRADO. Aquel arreglo
//    —el picker fuera de `isFiado`— tocó `CustomerPicker.tsx`, `POSPage.tsx` y
//    su spec, y NO tocó `useCobro.ts`. Resultado: la clienta ya podía elegir el
//    cliente en una venta de efectivo, y la venta seguía guardando nada. Se
//    arregló la mitad visible.
//
// 🔴 POR QUÉ EL CASO QUE YA EXISTÍA NO PODÍA CAZARLO, y es la lección que este
//    archivo carga: `listas-de-precios.spec` asevera que el precio se re-cotiza
//    y que `cobro-abrir` queda habilitado — **y ahí se detiene**. Nunca cobra,
//    así que nunca mira la base. Es «el arreglo se detuvo exactamente donde el
//    rojo se puso verde», escrito por mí un día después de citar esa regla.
//
//    > Un caso sobre una ESCRITURA tiene que llegar a la base. Todo lo que pase
//    > antes del `insert` mide la pantalla, y la pantalla ya estaba bien.
//
// ── EL CONTROL QUE HACE SEGURO EL ARREGLO, y se midió ANTES de escribirlo ──
// La pregunta que decide si escribir el cliente en una venta de contado es
// inocuo: **¿alguien lo va a leer como una deuda?** Medido en `getDebts`:
// filtra `payment_status in ('pending','partial')`. Una venta de contado queda
// en `'paid'`, así que NO entra a Cartera. El caso lo asevera abajo en vez de
// confiar en la lectura — es la diferencia entre citar una medición y que la
// medición pueda ponerse roja.
// ============================================================================

let db: SupabaseClient
let SEDE = ''
let CLIENTE = ''       // el nombre exacto de un cliente activo del lab

/**
 * La orden que ESTE caso acaba de cobrar, nombrada por su número.
 *
 * 🔴 NO «la última por `created_at`»: eso es una apuesta a que nadie más escriba
 *    después, y ya se pagó (deuda 100) — una sonda fechada MAÑANA mató cuatro
 *    specs que no hablaban de fechas. El correlativo es un valor DEL PROPIO
 *    FLUJO: el producto acaba de mostrarlo.
 */
async function ordenDelFlujo(page: Page) {
  const texto = await page.getByText(/Venta #\d+ registrada/).innerText()
  const m = /Venta #(\d+)/.exec(texto)
  expect(m, `el aviso de venta registrada no trae correlativo: «${texto}»`).not.toBeNull()
  const { data, error } = await db.from('orders')
    .select('id, order_number, payment_status, customer_id, customer_name')
    .eq('sede_id', SEDE)
    .eq('order_number', Number(m![1]))
    .single()
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

  // 🔴 El cliente se ELIGE ACÁ, por nombre exacto, y no con `.first()` sobre la
  //    lista de la pantalla. Dos razones medidas: `.first()` es la deuda 67 —el
  //    orden lo decide el catálogo y basta que otro spec deje un cliente que
  //    ordene antes—, y sobre todo que el nombre esperado tiene que venir de un
  //    lugar INDEPENDIENTE de lo que la pantalla muestre. Si se derivara del
  //    propio DOM, el caso compararía la vista contra la base pasando por la
  //    vista, y un error de la vista se cancelaría solo.
  const c = await db.from('customers').select('name')
    .eq('sede_id', SEDE).eq('is_active', true).order('name').limit(1)
  if (c.error) throw c.error
  expect(
    c.data?.length,
    'el lab necesita al menos un cliente ACTIVO en esta sede, o el caso no puede montar su escenario',
  ).toBe(1)
  CLIENTE = c.data![0].name as string
})

test('🔴 una venta de CONTADO con cliente elegido guarda customer_id y customer_name', async ({ page }) => {
  await loginAsOwner(page)
  await waitPosReady(page)
  await addPosProduct(page)
  await openShiftIfClosed(page, 0)

  // Se elige el cliente SIN tocar el medio de pago: el escenario es una venta
  // de contado corriente, que es exactamente el camino que no estaba cubierto.
  // Se teclea el nombre exacto para que la lista quede en UNA sola opción: así
  // el clic no depende del orden del catálogo.
  await page.getByTestId('cart-customer-search').fill(CLIENTE)
  const opcion = page.getByTestId('cart-customer-option')
  await expect(
    opcion,
    `buscar «${CLIENTE}» tiene que dejar exactamente una opción en el picker`,
  ).toHaveCount(1, { timeout: 15_000 })
  await opcion.click()

  // ⚠️ Acá NO se asevera `aria-pressed` sobre la opción, y la primera versión de
  //    este caso lo hacía: en la variante COMPACTA —la del carrito— el `onClick`
  //    cierra la lista, así que el elemento deja de existir y el rojo sale como
  //    «element(s) not found», que no habla del sujeto. El estado observable
  //    después de elegir es el RESUMEN, que es lo que la cajera ve.
  await expect(
    page.getByTestId('cart-customer-resumen'),
    'después de elegir, el carrito tiene que decir a quién se le está vendiendo',
  ).toContainText(CLIENTE)

  // Nequi es el camino de cobro más corto —no pide monto recibido— y NO es
  // fiado, que es lo único que este caso necesita del medio de pago.
  await cobrarCon(page, 'nequi')
  await expect(page.getByText(/Venta #\d+ registrada/)).toBeVisible({ timeout: 15_000 })

  const orden = await ordenDelFlujo(page)

  // ── EL SUJETO VA PRIMERO ────────────────────────────────────────────────
  // Si el control fuera antes, el mutante mataría el caso con el mensaje
  // equivocado y mandaría a revisar el lab en vez de la escritura.
  expect(
    orden.customer_id,
    'EL CLIENTE NO SE PERSISTIÓ: `useCobro` escribe `customer_id` sólo dentro de ' +
    'la rama `esFiado`, así que una venta de contado con cliente elegido guarda ' +
    'null — y ese dato no se recupera después',
  ).not.toBeNull()

  expect(
    orden.customer_name,
    'EL NOMBRE NO SE PERSISTIÓ: el Historial y el comprobante leen ' +
    '`orders.customer_name`, no la tabla de clientes, así que sin esta columna ' +
    'la venta queda sin cliente en las dos pantallas',
  ).toBe(CLIENTE)

  // ── Y LOS CONTROLES, DESPUÉS ────────────────────────────────────────────
  // ⚠️ Éste NO es decoración: es lo que separa «guardar el cliente» de
  //    «convertir la venta en una deuda». `getDebts` filtra por
  //    `payment_status in ('pending','partial')`; si el arreglo hubiera tocado
  //    también el estado, la clienta vería una cartera falsa.
  expect(
    orden.payment_status,
    'una venta de contado con cliente NO puede quedar pendiente: entraría a ' +
    'Cartera como una deuda que nadie contrajo',
  ).toBe('paid')
})
