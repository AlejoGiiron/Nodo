import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { loginAsOwner, ownerCreds } from './helpers/auth'

// ============================================================================
// PLAZO DE CRÉDITO — deuda 46
//
// 🔴 EL PLAZO SE GUARDA EN LOS DOS LADOS, Y NO ES REDUNDANCIA.
//    En el CLIENTE es lo pactado hoy: lo que se precarga en la próxima venta.
//    En la VENTA es lo que se pactó ESA VEZ, congelado.
//
//    Y la razón por la que la segunda mitad es indispensable la da la forma de
//    la cartera: **no guarda la deuda, la DERIVA de `orders`** (`getDebts` lee
//    las órdenes con `payment_status in ('pending','partial')`). Si el plazo
//    viviera sólo en `customers`, cambiarle el plazo a un cliente en marzo no
//    movería el vencimiento "conceptualmente": el mismo `select` **calcularía
//    otro número mañana** para una venta de enero.
//
//    Quinto caso del mismo principio: el costo congelado al vender, la fecha
//    del documento separada de la de registro, la devolución como hecho nuevo,
//    la subcategoría retirada. La historia no se reescribe, se le agrega.
//
// ⚠️ La aritmética del vencimiento NO se prueba acá: vive en `src/lib/cartera.ts`
//    con tests unitarios, porque es una frontera de día (R7) y una función pura
//    se puede poner roja con una fecha inventada. Acá se prueba lo que sólo se
//    puede probar contra la base: que el plazo se guarda y que NO se mueve.
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
const PLAZO_PACTADO = 15
const PLAZO_NUEVO = 8

let db: SupabaseClient
let SEDE = ''
let OWNER = ''
let CLIENTE = ''
let CONFIG_ORIGINAL: Record<string, unknown> = {}

test.beforeAll(async () => {
  db = createClient(process.env.VITE_NODO_SUPABASE_URL!, process.env.VITE_NODO_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  })
  const { error } = await db.auth.signInWithPassword(ownerCreds())
  if (error) throw error
  OWNER = (await db.auth.getUser()).data.user!.id
  SEDE = (await db.from('profiles').select('sede_id').eq('id', OWNER).single()).data!.sede_id as string

  const sede = await db.from('sedes').select('config').eq('id', SEDE).single()
  if (sede.error) throw sede.error
  CONFIG_ORIGINAL = (sede.data.config ?? {}) as Record<string, unknown>
})

test.afterAll(async () => {
  if (!db) return
  if (CLIENTE) await db.from('customers').update({ is_active: false }).eq('id', CLIENTE)
  if (SEDE) await db.from('sedes').update({ config: CONFIG_ORIGINAL }).eq('id', SEDE)
})

test('🔴 el cliente guarda su plazo pactado', async () => {
  const r = await db.from('customers').insert({
    sede_id: SEDE, name: 'E2E Plazo ' + SUFFIX, plazo_dias: PLAZO_PACTADO,
  }).select('id, plazo_dias').single()

  expect(
    r.error,
    'EL PLAZO DE CRÉDITO NO EXISTE (deuda 46): `customers` tiene nombre, teléfono, ' +
    'documento y notas, y ningún plazo. Por eso la cartera no puede decir ' +
    '"vencido" y la AgingBar sólo mide antigüedad',
  ).toBeNull()

  CLIENTE = r.data!.id as string
  expect(r.data!.plazo_dias, 'se guarda el ENTERO de días, no una etiqueta').toBe(PLAZO_PACTADO)
})

test('🔴 el plazo se CONGELA en la venta: cambiarlo en el cliente NO mueve el vencimiento de una venta vieja', async () => {
  // Una venta a crédito con el plazo vigente en ese momento.
  const venta = await db.from('orders').insert({
    sede_id: SEDE, created_by: OWNER, canal: 'mostrador', total: 90_000,
    status: 'pending', payment_status: 'pending',
    customer_id: CLIENTE, customer_name: 'E2E Plazo ' + SUFFIX,
    plazo_dias: PLAZO_PACTADO,
  }).select('id, plazo_dias').single()
  expect(venta.error, 'la venta tiene que poder guardar SU plazo').toBeNull()
  expect(Number(venta.data!.plazo_dias)).toBe(PLAZO_PACTADO)

  // Meses después se renegocia el plazo con el cliente.
  const upd = await db.from('customers')
    .update({ plazo_dias: PLAZO_NUEVO }).eq('id', CLIENTE).select('plazo_dias').single()
  expect(upd.error).toBeNull()
  expect(upd.data!.plazo_dias, 'precondición: el plazo del cliente cambió').toBe(PLAZO_NUEVO)

  // 🔴 LA ASERCIÓN. La cartera DERIVA de `orders`: si el plazo viviera sólo en
  //    el cliente, este mismo select devolvería 8 y el vencimiento de una venta
  //    de enero se habría movido diez días hacia atrás — sin error y sin aviso.
  const despues = await db.from('orders')
    .select('plazo_dias').eq('id', venta.data!.id).single()
  expect(
    Number(despues.data!.plazo_dias),
    'LA VENTA YA HECHA CAMBIÓ DE VENCIMIENTO: el plazo se pactó al vender y es un ' +
    'hecho ocurrido. La cartera deriva de orders, así que un plazo que vive sólo ' +
    'en el cliente reescribe el pasado cada vez que se renegocia',
  ).toBe(PLAZO_PACTADO)
})

test('🔴 la lista de plazos sale de la SEDE y es un desplegable, no un número libre', async ({ page }) => {
  // Con tres valores conocidos, elegir gana a teclear: el typo de 3 por 30 no lo
  // detecta nada, y una venta a 3 días se lee como vencida a los cuatro.
  await db.from('sedes').update({
    config: { ...CONFIG_ORIGINAL, plazos_credito: [8, 15, 30], plazo_credito_default: 30 },
  }).eq('id', SEDE)

  await loginAsOwner(page)
  await page.goto('/fiado')
  // El formulario de cliente vive en la pestaña CLIENTES; /fiado abre en
  // Cartera. Y 'Nuevo cliente' aparece dos veces —vacío y con datos—, así que
  // el testid es el único locator no ambiguo.
  await page.getByTestId('fiado-tab-customers').click()
  await page.getByTestId('new-customer-btn').click()
  await expect(page.getByTestId('customer-form-modal')).toBeVisible({ timeout: 10_000 })

  const select = page.getByTestId('customer-plazo')
  await expect(select, 'el formulario de cliente tiene que ofrecer el plazo').toBeVisible()
  await expect(
    select,
    'desplegable y no input: con tres valores conocidos, teclear sólo agrega el typo',
  ).toHaveJSProperty('tagName', 'SELECT')

  const opciones = await select.locator('option').allTextContents()
  expect(opciones.join('|'), 'las opciones salen de la config de la sede').toMatch(/8/)
  expect(opciones.join('|')).toMatch(/15/)
  expect(opciones.join('|')).toMatch(/30/)
})

test('🔴 la cartera ordena por DÍAS VENCIDOS y dice qué mide cada columna', async ({ page }) => {
  // Dos números distintos para la misma fila —antigüedad y vencido— sin rótulo
  // es cómo nació la deuda 53. Los dos son verdaderos y contestan preguntas
  // distintas: la barra mide cuánto hace que se vendió; la columna, cuánto hace
  // que se pasó el plazo.
  await loginAsOwner(page)
  await page.goto('/fiado')

  await expect(
    page.getByTestId('debt-orden-por'),
    'la pantalla tiene que decir por qué está ordenada, no dejarlo adivinar',
  ).toBeVisible({ timeout: 15_000 })
  await expect(page.getByTestId('debt-orden-por')).toContainText(/vencid/i)

  // La leyenda de la barra sigue diciendo ANTIGÜEDAD: no cambia de significado
  // porque ahora exista el vencimiento.
  await expect(page.getByTestId('aging-leyenda')).toContainText(/antigüedad/i)
})
