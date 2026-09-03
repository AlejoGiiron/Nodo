import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { loginAsOwner } from './helpers/auth'
import { openShiftIfClosed, closeShiftIfOpen } from './helpers/shift'

// Arqueo multi-método (cierre de turno con conciliación por método). Corre en LAB.
// Verifica el snapshot persistido (close_reconciliation), el esperado por método
// (efectivo con apertura+mov, otros solo ventas), el aporte del pago mixto,
// sales_count por órdenes distintas, no-bloqueo con diferencia y la reimpresión P3.

const PRODUCT = 'Lab Coctel'
const PRICE = 18000

const SUFFIX = Date.now().toString().slice(-6)

// ── Supabase directo (lectura del snapshot con RLS del owner) ──────────
function loadEnv(path: string) {
  try {
    for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  } catch { /* ignore */ }
}
loadEnv('.env')
loadEnv('.env.test')

let _client: SupabaseClient | null = null
async function db(): Promise<SupabaseClient> {
  if (_client) return _client
  const c = createClient(process.env.VITE_NODO_SUPABASE_URL!, process.env.VITE_NODO_SUPABASE_ANON_KEY!)
  const { error } = await c.auth.signInWithPassword({
    email: process.env.E2E_OWNER_EMAIL!, password: process.env.E2E_OWNER_PASSWORD!,
  })
  if (error) throw error
  _client = c
  return c
}

// Id del turno ABIERTO de la sede activa (el que vamos a cerrar y leer).
async function openShiftId(): Promise<string> {
  const c = await db()
  const { data, error } = await c
    .from('jornadas').select('id').is('closed_at', null)
    .order('opened_at', { ascending: false }).limit(1).single()
  if (error) throw error
  return data.id as string
}

type MethodRec = { expected: number; declared: number; difference: number }
type Reconciliation = {
  methods: Record<'cash' | 'card' | 'transfer' | 'nequi', MethodRec>
  expected_total: number; declared_total: number; difference_total: number; sales_count: number
}
async function reconciliationOf(shiftId: string): Promise<{ rec: Reconciliation; comment: string | null }> {
  const c = await db()
  const { data, error } = await c
    .from('jornadas').select('close_reconciliation, close_comment').eq('id', shiftId).single()
  if (error) throw error
  return { rec: data.close_reconciliation as Reconciliation, comment: data.close_comment as string | null }
}

// ── Helpers de UI ──────────────────────────────────────────────────────
async function addProductPOS(page: Page) {
  await page.getByTestId('product-card').filter({ hasText: PRODUCT }).first().click()
  await expect(page.getByTestId('item-config-modal')).toBeVisible()
  await page.getByTestId('item-config-confirm').click()
}
async function finishSale(page: Page) {
  await expect(page.getByText(/Venta #\d+ registrada/)).toBeVisible({ timeout: 15_000 })
  await page.getByRole('button', { name: 'Nueva venta' }).click()
}
async function sellCash(page: Page) {
  await addProductPOS(page)
  await page.getByRole('button', { name: 'Cobrar' }).click()
  await page.getByTestId('pay-method-efectivo').click()
  await page.getByTestId('checkout-continue').click()
  await page.getByTestId('checkout-received').fill(String(PRICE))
  await page.getByRole('button', { name: /Confirmar cobro/ }).click()
  await finishSale(page)
}
async function sellNequi(page: Page) {
  await addProductPOS(page)
  await page.getByRole('button', { name: 'Cobrar' }).click()
  await page.getByTestId('pay-method-nequi').click()
  await page.getByTestId('checkout-continue').click()
  await finishSale(page)
}
async function sellMixed(page: Page, cash: number, nequi: number) {
  await addProductPOS(page)
  await page.getByRole('button', { name: 'Cobrar' }).click()
  await page.getByTestId('pay-split-toggle').click()
  await page.getByTestId('pay-line-amount-0').fill(String(cash))
  await page.getByTestId('pay-add-method').click()
  await page.getByTestId('pay-line-method-1').selectOption('nequi')
  await page.getByTestId('pay-line-amount-1').fill(String(nequi))
  await page.getByTestId('checkout-confirm').click()
  await finishSale(page)
}
async function addMovement(page: Page, kind: 'in' | 'out', amount: number) {
  await page.goto('/ventas')
  await page.getByTestId('open-movements').click()
  await expect(page.getByText('Movimientos manuales', { exact: true })).toBeVisible()
  if (kind === 'out') {
    await page.getByRole('button', { name: 'Egreso', exact: true }).click()
    // ⚠️ El modal de movimientos se reescribio para mandar `categoria`: el
    //    motivo dejo de ser texto libre y paso a ser CATEGORIA (allowlist) +
    //    DETALLE. `reason` ya no es la fuente de los reportes, es detalle.
    await page.getByTestId('movement-categoria').selectOption('gasto')
  } else {
    await page.getByTestId('movement-categoria').selectOption('otro')
    // 'otro' EXIGE detalle (chk_otro_exige_detalle): sin esto la RPC rechaza.
    await page.getByTestId('movement-detalle').fill(`Ingreso arqueo ${SUFFIX}`)
  }
  await page.getByTestId('movement-amount').fill(String(amount))
  await page.getByTestId('movement-submit').click()
  // El movimiento quedó en la lista (sin .first() ciego: basta que exista ≥1).
  await expect(page.getByTestId('movement-item')).not.toHaveCount(0)
  await page.getByTestId('movements-close').click()
}
async function openCloseModal(page: Page) {
  await page.goto('/ventas')
  await page.getByRole('button', { name: 'Cerrar turno', exact: true }).click()
  await expect(page.getByText('Cerrar turno de caja')).toBeVisible()
  await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {})
}

// ── Suite ───────────────────────────────────────────────────────────────
test.describe.serial('Arqueo multi-método', () => {
  // Stub de impresión: captura el HTML del comprobante en vez de abrir diálogo
  // (headless). Sirve además para verificar la reimpresión de P3.
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      ;(window as unknown as { __arqueoPrinted: string | null }).__arqueoPrinted = null
      window.print = () => {
        ;(window as unknown as { __arqueoPrinted: string | null }).__arqueoPrinted =
          document.getElementById('nodo-cash-report-content')?.innerHTML ?? null
      }
    })
  })

  test('cierre persiste el snapshot: esperado por método, pago mixto, sales_count y comentario', async ({ page }) => {
    await loginAsOwner(page)
    await page.goto('/ventas')
    await closeShiftIfOpen(page)
    await openShiftIfClosed(page, 50000)           // apertura 50.000
    const shiftId = await openShiftId()

    // Ventas: 1 efectivo (18.000) + 1 nequi (18.000) + 1 MIXTA (10.000 efvo + 8.000 nequi).
    await sellCash(page)
    await sellNequi(page)
    await sellMixed(page, 10000, 8000)
    // Movimientos de EFECTIVO: +10.000 ingreso, −5.000 egreso.
    await addMovement(page, 'in', 10000)
    await addMovement(page, 'out', 5000)

    // Esperado por método:
    //   efectivo = apertura + ventas_efvo(18.000+10.000) + ing(10.000) − egr(5.000)
    //            = 50.000 + 28.000 + 10.000 − 5.000 = 83.000  (con apertura+movimientos)
    //   nequi    = ventas_nequi(18.000+8.000) = 26.000        (solo ventas, sin apertura/mov)
    // Si la MIXTA hubiera cargado mal (18.000 al efvo), efvo=91.000 y nequi=18.000.
    const EXP_CASH = 83000
    const EXP_NEQUI = 26000

    await openCloseModal(page)
    await page.getByTestId('close-shift-declared').fill('80000')   // efvo declarado (dif −3.000)
    await page.getByTestId('pay-declared-nequi').fill(String(EXP_NEQUI)) // nequi exacto (dif 0)
    await page.getByTestId('close-shift-comment').fill(`Cierre arqueo E2E ${SUFFIX}`)
    await page.getByRole('button', { name: 'Confirmar cierre' }).click()
    await expect(page.getByText('Sin turno')).toBeVisible({ timeout: 15_000 })

    // Snapshot persistido (leído directo, sin recomputar nada en el test).
    const { rec, comment } = await reconciliationOf(shiftId)
    expect(rec.methods.cash).toEqual({ expected: EXP_CASH, declared: 80000, difference: -3000 })
    expect(rec.methods.nequi).toEqual({ expected: EXP_NEQUI, declared: EXP_NEQUI, difference: 0 })
    expect(rec.methods.card).toEqual({ expected: 0, declared: 0, difference: 0 })
    expect(rec.methods.transfer).toEqual({ expected: 0, declared: 0, difference: 0 })
    expect(rec.expected_total).toBe(EXP_CASH + EXP_NEQUI)        // 109.000
    expect(rec.declared_total).toBe(80000 + EXP_NEQUI)           // 106.000
    expect(rec.difference_total).toBe(-3000)
    // sales_count = 3 VENTAS distintas, aunque hubo 4 filas payments (la mixta = 2).
    expect(rec.sales_count).toBe(3)
    expect(comment).toBe(`Cierre arqueo E2E ${SUFFIX}`)
  })

  test('no bloquea con diferencia: declarar de menos en un método cierra igual', async ({ page }) => {
    await loginAsOwner(page)
    await page.goto('/ventas')
    await closeShiftIfOpen(page)
    await openShiftIfClosed(page, 0)
    const shiftId = await openShiftId()

    await sellNequi(page)   // nequi esperado = 18.000

    await openCloseModal(page)
    await page.getByTestId('close-shift-declared').fill('0')   // efvo requerido (esperado 0)
    // nequi en blanco = declarado 0 → diferencia −18.000 (informativa, no bloquea).
    await expect(page.getByTestId('pay-diff-nequi')).toContainText('18.000')
    await page.getByRole('button', { name: 'Confirmar cierre' }).click()
    await expect(page.getByText('Sin turno')).toBeVisible({ timeout: 15_000 })

    const { rec } = await reconciliationOf(shiftId)
    expect(rec.methods.nequi).toEqual({ expected: 18000, declared: 0, difference: -18000 })
  })

  test('reimpresión desde P3 arma el comprobante desde el snapshot (sin recomputar)', async ({ page }) => {
    await loginAsOwner(page)
    await page.goto('/ventas')
    await closeShiftIfOpen(page)

    // Apertura ÚNICA para localizar la fila del turno sin .first() ciego.
    const OPEN = 70000 + Number(SUFFIX.slice(-4))
    const EXP_CASH = OPEN + PRICE
    await openShiftIfClosed(page, OPEN)

    await sellCash(page)   // cashSales = 18.000 → cash.expected = OPEN + 18.000

    await openCloseModal(page)
    await page.getByTestId('close-shift-declared').fill(String(EXP_CASH))   // exacto
    await page.getByRole('button', { name: 'Confirmar cierre' }).click()
    await expect(page.getByText('Sin turno')).toBeVisible({ timeout: 15_000 })

    // P3: localizar la fila por su apertura única y reimprimir.
    await page.goto('/historial-turnos')
    const aperturaText = OPEN.toLocaleString('es-CO')   // "7X.XXX"
    // Por la CELDA de apertura, no por el texto de la fila entera (ver la nota
    // en historiales.spec.ts y la colisión #14/#141 de anular-venta.spec.ts).
    const row = page.getByTestId('shift-history-row')
      .filter({ has: page.getByTestId('shift-opening').filter({ hasText: aperturaText }) })
    await expect(row).toBeVisible({ timeout: 15_000 })

    await page.evaluate(() => { (window as unknown as { __arqueoPrinted: string | null }).__arqueoPrinted = null })
    await row.getByTestId('shift-reprint').click()

    // El comprobante se armó (stub capturó el HTML). Debe reflejar el SNAPSHOT:
    // apertura única + cash esperado (OPEN+18.000) + 1 venta → prueba que leyó
    // close_reconciliation y no recomputó.
    await expect
      .poll(async () => page.evaluate(() => (window as unknown as { __arqueoPrinted: string | null }).__arqueoPrinted), { timeout: 10_000 })
      .not.toBeNull()
    const html = await page.evaluate(() => (window as unknown as { __arqueoPrinted: string | null }).__arqueoPrinted)
    expect(html).toContain('ARQUEO DE CAJA')
    expect(html).toContain(aperturaText)
    expect(html).toContain(EXP_CASH.toLocaleString('es-CO'))
    expect(html).toContain('1 vta')
  })

  test('🔴 no se puede cerrar con un insumo sin cargar: el arqueo se PERSISTE y se reimprime', async ({ page }) => {
    // ════════════════════════════════════════════════════════════════════
    // DEUDA 55 · A1 §3.1 — el más grave de los cuatro rojos de A1, y por una
    // razón que ningún otro tiene: **el dato malo no se recomputa nunca**.
    // `expected_amount`, `difference` y el snapshot `close_reconciliation` se
    // PERSISTEN, y la reimpresión los lee tal cual (por diseño: recomputar un
    // turno cerrado sumaría pagos posteriores). Un cierre hecho un segundo
    // antes de que responda la consulta de pagos queda guardado con el arqueo
    // equivocado **para siempre**, y cada reimpresión lo repite.
    //
    // La carrera es real —hay una vuelta de red— pero no se puede ganar a mano
    // de forma determinista, así que se PROVOCA: se bloquea la respuesta de
    // `payments` (el insumo `salesSummary`) y se intenta cerrar en esa ventana.
    //
    // Criterio (CLAUDE.md): *una escritura que persiste un cálculo se
    // deshabilita hasta que TODOS sus insumos hayan cargado; no es un spinner,
    // es que el botón no exista*.
    // ════════════════════════════════════════════════════════════════════
    const APERTURA = 40000 + Number(SUFFIX.slice(-4))
    await loginAsOwner(page)
    await page.goto('/ventas')
    await closeShiftIfOpen(page)
    await openShiftIfClosed(page, APERTURA)
    await sellCash(page)                    // 18.000 en efectivo, ya en la base
    const shiftId = await openShiftId()

    // Lo que el arqueo TIENE que decir si los insumos cargaron.
    const ESPERADO_REAL = APERTURA + PRICE

    // 🔒 La consulta de pagos no responde: `salesSummary` queda en null y
    //    `salesSummary?.cash ?? 0` da 0 — el default que no distingue "todavía
    //    no sé" de "no hubo ventas".
    // Sólo la consulta del RESUMEN (`getShiftPayments`, `select=*`), no la del
    // conteo de ventas (`getShiftSalesCount`, `select=order_id`) que la mutación
    // hace al cerrar: bloquear las dos colgaría el cierre entero y el test
    // mediría otra cosa — el primer intento dio `expected_amount` inexistente en
    // vez de un arqueo falso, que es un rojo por la razón equivocada.
    await page.route('**/rest/v1/payments*', async (route) => {
      const url = route.request().url()
      const esElResumen = route.request().method() === 'GET' && /select=\*/.test(url)
      if (esElResumen) return                       // colgada a propósito
      await route.continue()
    })

    await page.goto('/ventas')
    await page.getByRole('button', { name: 'Cerrar turno', exact: true }).click()
    await expect(page.getByText('Cerrar turno de caja')).toBeVisible()
    await page.getByTestId('close-shift-declared').fill(String(ESPERADO_REAL))

    const confirmar = page.getByRole('button', { name: 'Confirmar cierre' })
    const seOfrece = (await confirmar.count()) > 0

    // Si el botón EXISTE en esta ventana, el defecto está vivo. Se aprieta a
    // propósito para que el rojo diga QUÉ se persistió, no sólo que el botón
    // estaba habilitado: el número guardado es la mitad del hallazgo.
    if (seOfrece) {
      await confirmar.click()
      await page.waitForTimeout(2_000)
      const c = await db()
      const { data } = await c
        .from('jornadas')
        .select('expected_amount, difference')
        .eq('id', shiftId)
        .single()
      expect(
        Number(data?.expected_amount ?? -1),
        `SE PERSISTIÓ UN ARQUEO FALSO: expected_amount quedó calculado sobre salesSummary vacío ` +
        `(apertura ${APERTURA} + ventas 0) en vez de apertura + ${PRICE}. Y no se recomputa: ` +
        `la reimpresión lee este snapshot`,
      ).toBe(ESPERADO_REAL)
      expect(
        Number(data?.difference ?? -1),
        'y la diferencia quedó guardada como un sobrante que no existió',
      ).toBe(0)
    }

    expect(
      seOfrece,
      'el botón de cerrar NO debe existir hasta que TODOS los insumos hayan cargado ' +
      '(apertura, pagos y movimientos): lo que se escribe es permanente y se reimprime',
    ).toBe(false)

    // Con la carga liberada, el botón vuelve y el cierre es correcto: sin esto,
    // un botón que nunca aparece también pasaría el caso de arriba.
    await page.unroute('**/rest/v1/payments*')
    await page.reload()
    await page.getByRole('button', { name: 'Cerrar turno', exact: true }).click()
    await expect(page.getByText('Cerrar turno de caja')).toBeVisible()
    await page.getByTestId('close-shift-declared').fill(String(ESPERADO_REAL))
    await expect(
      page.getByRole('button', { name: 'Confirmar cierre' }),
      'liberada la carga, el cierre TIENE que poder hacerse',
    ).toBeVisible({ timeout: 15_000 })
    await page.getByRole('button', { name: 'Confirmar cierre' }).click()
    await expect(page.getByText('Sin turno')).toBeVisible({ timeout: 15_000 })

    const c2 = await db()
    const { data: fin } = await c2
      .from('jornadas').select('expected_amount, difference').eq('id', shiftId).single()
    expect(Number(fin?.expected_amount), 'el arqueo bueno: apertura + ventas en efectivo').toBe(ESPERADO_REAL)
    expect(Number(fin?.difference), 'declarado igual al esperado: cuadre exacto').toBe(0)
  })

  test('limpieza: cerrar turno del lab', async ({ page }) => {
    await loginAsOwner(page)
    await page.goto('/ventas')
    await closeShiftIfOpen(page)
    await expect(page.getByText('Sin turno')).toBeVisible({ timeout: 15_000 })
  })
})
