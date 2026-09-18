import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { loginAsOwner, ownerCreds } from './helpers/auth'

// ============================================================================
// NUMERACIÓN DE COMPRAS — consecutivo por sede (2026-09-17)
//
// Reportado por la clienta mirando la compra PED46038: «la compra no tiene
// numeración, ¿cómo se sabe qué número de compra es?». Lo único visible era
// `invoice_number`, el número del PAPEL del proveedor: texto libre, nulo
// posible y repetido.
//
// Lo que se asevera, y el mutante que mata cada caso:
//   ① dos compras seguidas llevan N y N+1, y la RPC devuelve el mismo número
//      que quedó en la fila          ← mutante: no asignar / asignar fijo
//   ② una compra RECHAZADA no consume número: el incremento vive en la misma
//      transacción que la cabecera   ← mutante: numerar fuera de la transacción
//   ③ la lista y el detalle muestran «#N»   ← mutante: no pedir la columna
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
const FACTURA_A = 'E2E-NUM-A-' + SUFFIX
const FACTURA_B = 'E2E-NUM-B-' + SUFFIX

let db: SupabaseClient
let SEDE = ''
let CAT = ''
let PROVEEDOR = ''
let PRODUCTO = ''
let NUM_A = 0
let NUM_B = 0

type Resultado = { invoice_id: string; purchase_number: number }

async function comprar(factura: string, qty: number) {
  return db.rpc('register_purchase', {
    p_invoice: { supplier_id: PROVEEDOR, invoice_number: factura, notes: null },
    p_items: [{ product_id: PRODUCTO, qty, unit_cost: 1000 }],
  })
}

test.beforeAll(async () => {
  db = createClient(process.env.VITE_NODO_SUPABASE_URL!, process.env.VITE_NODO_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  })
  const { error } = await db.auth.signInWithPassword(ownerCreds())
  if (error) throw error
  const owner = (await db.auth.getUser()).data.user!.id
  SEDE = (await db.from('profiles').select('sede_id').eq('id', owner).single()).data!.sede_id as string

  // register_purchase exige jornada abierta (deuda 26).
  const abierta = await db.from('jornadas').select('id')
    .eq('sede_id', SEDE).is('closed_at', null).maybeSingle()
  if (!abierta.data) {
    const j = await db.from('jornadas').insert({ sede_id: SEDE, opened_by: owner, opening_amount: 0 })
    expect(j.error, 'no se pudo abrir la jornada del caso').toBeNull()
  }

  const c = await db.from('categories').insert({ sede_id: SEDE, name: 'E2E Numeracion ' + SUFFIX }).select('id').single()
  expect(c.error).toBeNull()
  CAT = c.data!.id
  const s = await db.from('suppliers').insert({ sede_id: SEDE, name: 'E2E Prov Numeracion ' + SUFFIX }).select('id').single()
  expect(s.error).toBeNull()
  PROVEEDOR = s.data!.id
  const p = await db.from('products').insert({
    sede_id: SEDE, category_id: CAT, name: 'E2E Numerado ' + SUFFIX,
    price: 3000, kind: 'simple', stock_tracking: true, stock_qty: 0,
  }).select('id').single()
  expect(p.error).toBeNull()
  PRODUCTO = p.data!.id
})

test.afterAll(async () => {
  if (!db) return
  // Limpieza por el camino más tonto que funciona, y asevera el ESTADO.
  const a = await db.from('products').update({ is_active: false }).eq('id', PRODUCTO)
  const b = await db.from('categories').update({ is_active: false }).eq('id', CAT)
  const c = await db.from('suppliers').update({ is_active: false }).eq('id', PROVEEDOR)
  expect([a.error, b.error, c.error], 'LIMPIEZA de numeracion-compras falló').toEqual([null, null, null])
  const vivo = await db.from('products').select('is_active').eq('id', PRODUCTO).single()
  expect(vivo.data?.is_active, `LIMPIEZA de numeracion-compras: quedó activo el producto ${PRODUCTO}`).toBe(false)
})

test('🔴 dos compras seguidas llevan números consecutivos, y la RPC devuelve el de la fila', async () => {
  const ra = await comprar(FACTURA_A, 1)
  expect(ra.error).toBeNull()
  const a = ra.data as Resultado
  NUM_A = a.purchase_number
  expect(Number.isInteger(NUM_A) && NUM_A > 0,
    `la RPC no devolvió purchase_number (recibido: ${String(NUM_A)})`).toBe(true)

  const fila = await db.from('purchase_invoices').select('purchase_number').eq('id', a.invoice_id).single()
  expect(fila.error).toBeNull()
  expect(fila.data!.purchase_number, 'la fila y el retorno de la RPC dicen números distintos')
    .toBe(NUM_A)

  const rb = await comprar(FACTURA_B, 1)
  expect(rb.error).toBeNull()
  NUM_B = (rb.data as Resultado).purchase_number
  expect(NUM_B, 'la segunda compra no es la siguiente de la serie').toBe(NUM_A + 1)
})

test('🔴 una compra RECHAZADA no consume número', async () => {
  // qty 0 se rechaza DENTRO del loop de ítems, o sea DESPUÉS de haber tomado
  // el número: si el incremento no vive en la misma transacción, esto deja un
  // hueco en la serie.
  const mala = await comprar('E2E-NUM-MALA-' + SUFFIX, 0)
  expect(mala.error?.message ?? '', 'la compra con cantidad 0 tenía que rechazarse')
    .toContain('Cantidad invalida')

  const rc = await comprar('E2E-NUM-C-' + SUFFIX, 1)
  expect(rc.error).toBeNull()
  expect((rc.data as Resultado).purchase_number,
    'el rechazo consumió un número: la serie quedó con un hueco').toBe(NUM_B + 1)
})

test('la lista y el detalle muestran el número de compra', async ({ page }) => {
  await loginAsOwner(page)
  await page.goto('/compras')
  const fila = page.getByTestId('purchase-row').filter({ hasText: FACTURA_A })
  await expect(fila).toHaveCount(1)
  await expect(fila.getByTestId('purchase-number')).toHaveText(`#${NUM_A}`)

  await fila.click()
  await expect(page.getByTestId('purchase-detail-numero')).toHaveText(`Compra #${NUM_A}`)
})
