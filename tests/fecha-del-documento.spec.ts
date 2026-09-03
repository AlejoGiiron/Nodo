import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { loginAsOwner, ownerCreds } from './helpers/auth'

// ============================================================================
// LA FECHA DEL DOCUMENTO NO ES LA FECHA DE REGISTRO — deuda 44
//
// 🔴 EL CASO REAL, medido en el archivo del cliente (`Control_Mp.xlsx`,
//    2026-09-02): Muscle Pro **registró el 2 de septiembre compras fechadas el
//    31 de agosto**. No es hipotético ni de fin de mes: ya pasó, en el único
//    archivo real que tenemos. Con una sola fecha, esas facturas caen en
//    septiembre y el costo de agosto queda corto — sin error y sin aviso, que
//    es el perfil de R7.
//
// ⚠️ CORRECCIÓN A LA PREMISA DE LA DEUDA, verificada leyendo el código: la
//    deuda decía que "Compras deja elegir la fecha de la factura y Gastos la
//    fecha del gasto". **Es falso.** `grep 'type="date"' src/` devuelve diez
//    apariciones y las diez son FILTROS de pantallas de historial: ningún
//    formulario de ALTA tiene campo de fecha. La descripción venía de la
//    maqueta, no de la app — misma clase que los "4.212 productos".
//
// ── LAS DOS PREGUNTAS, Y POR QUÉ NO SE PUEDEN MEZCLAR ─────────────────────
//   `created_at`     → ¿cuándo se tecleó? Es lo que cuadra la CAJA.
//   `document_date`  → ¿de cuándo es el papel? Es lo que ordena los REPORTES.
// Un gasto con fecha vieja **igual salió del cajón hoy**, así que el arqueo lo
// cuenta hoy. Y el reporte del mes lo cuenta en su mes. Son dos preguntas
// distintas sobre la misma fila, y por eso son dos columnas — el criterio "un
// valor que significa dos cosas no es un dato", quinta aparición.
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

/** Hoy en América/Bogotá, que es la única frontera de día válida (R7). */
function hoyBogota(): string {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'America/Bogota',
  }).format(new Date())
}
function diasAtras(n: number): string {
  const d = new Date(hoyBogota() + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().slice(0, 10)
}
function diasAdelante(n: number): string {
  const d = new Date(hoyBogota() + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

const HOY = hoyBogota()
const FECHA_FACTURA = diasAtras(10)   // el papel del proveedor
const FECHA_GASTO = diasAtras(9)
const FUTURO = diasAdelante(3)
const GASTO = 61_000

let db: SupabaseClient
let SEDE = ''
let OWNER = ''
let JORNADA = ''
let CAT = ''
let PROVEEDOR = ''
let PRODUCTO = ''

test.beforeAll(async () => {
  db = createClient(process.env.VITE_NODO_SUPABASE_URL!, process.env.VITE_NODO_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  })
  const { error } = await db.auth.signInWithPassword(ownerCreds())
  if (error) throw error
  OWNER = (await db.auth.getUser()).data.user!.id
  SEDE = (await db.from('profiles').select('sede_id').eq('id', OWNER).single()).data!.sede_id as string

  const abierta = await db.from('jornadas').select('id')
    .eq('sede_id', SEDE).is('closed_at', null).maybeSingle()
  JORNADA = abierta.data
    ? (abierta.data.id as string)
    : ((await db.from('jornadas')
        .insert({ sede_id: SEDE, opened_by: OWNER, opening_amount: 0 })
        .select('id').single()).data!.id as string)

  CAT = (await db.from('categories')
    .insert({ sede_id: SEDE, name: 'E2E Fecha ' + SUFFIX }).select('id').single()).data!.id
  PROVEEDOR = (await db.from('suppliers')
    .insert({ sede_id: SEDE, name: 'E2E Proveedor Fecha ' + SUFFIX }).select('id').single()).data!.id
  PRODUCTO = (await db.from('products').insert({
    sede_id: SEDE, category_id: CAT, name: 'E2E Fechado ' + SUFFIX,
    price: 3000, kind: 'simple', stock_tracking: true, stock_qty: 0,
  }).select('id').single()).data!.id
})

test.afterAll(async () => {
  if (!db) return
  await db.from('products').update({ is_active: false }).eq('id', PRODUCTO)
  await db.from('categories').update({ is_active: false }).eq('id', CAT)
  await db.from('suppliers').update({ is_active: false }).eq('id', PROVEEDOR)
})

test('🔴 la compra guarda la fecha del PAPEL, distinta de la de registro', async () => {
  const r = await db.rpc('register_purchase', {
    p_invoice: {
      supplier_id: PROVEEDOR,
      invoice_number: 'E2E-FECHA-' + SUFFIX,
      notes: null,
      document_date: FECHA_FACTURA,
    },
    p_items: [{ product_id: PRODUCTO, qty: 4, unit_cost: 2000 }],
  })
  expect(
    r.error,
    'LA FECHA DEL DOCUMENTO NO EXISTE (deuda 44): la base solo tiene created_at, ' +
    'que es cuando se tecleó. El cliente ya registró el 2 de septiembre facturas ' +
    'del 31 de agosto',
  ).toBeNull()

  const id = (r.data as { invoice_id: string }).invoice_id
  const inv = await db.from('purchase_invoices')
    .select('document_date, created_at').eq('id', id).single()
  expect(inv.error).toBeNull()

  expect(
    inv.data!.document_date,
    'la factura tiene que quedar fechada como el papel del proveedor',
  ).toBe(FECHA_FACTURA)

  const registro = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'America/Bogota',
  }).format(new Date(inv.data!.created_at as string))
  expect(registro, 'y created_at sigue diciendo cuándo se tecleó: hoy').toBe(HOY)
  expect(
    inv.data!.document_date === registro,
    'las dos fechas TIENEN que poder ser distintas: si son siempre iguales, la ' +
    'columna nueva no está guardando nada',
  ).toBe(false)
})

test('🔴 el default de la fecha nace en BOGOTÁ, no en UTC', async () => {
  // R7 sobre la columna nueva. `default current_date` usa la zona del servidor,
  // que es UTC: entre las 19:00 y la medianoche de Bogotá, UTC ya está en el día
  // siguiente y todo gasto de esa franja —la del cierre de caja— nacería fechado
  // MAÑANA.
  //
  // ⚠️ HONESTIDAD DEL INSTRUMENTO: este caso solo DISCRIMINA en esa franja.
  //    Fuera de ella, las dos fechas coinciden y pasaría igual con un default en
  //    UTC. Se deja escrito en la salida para que un verde no se lea como más de
  //    lo que es. Verificado discriminando el 2026-09-02 a las 21:40 de Bogotá,
  //    con el servidor ya en 2026-09-03.
  const utcHoy = new Date().toISOString().slice(0, 10)
  console.log(
    `[fecha-del-documento] hoy Bogotá=${HOY} · hoy UTC=${utcHoy} · ` +
    (utcHoy === HOY ? 'NO discrimina en esta franja horaria' : '✅ DISCRIMINA ahora mismo'),
  )

  const ins = await db.from('cash_movements').insert({
    jornada_id: JORNADA, sede_id: SEDE, type: 'out', categoria: 'gasto',
    amount: 1000, reason: 'E2E default fecha ' + SUFFIX, created_by: OWNER,
  }).select('document_date').single()
  expect(ins.error).toBeNull()
  expect(
    ins.data!.document_date,
    'sin fecha explícita, el movimiento se fecha HOY EN BOGOTÁ. Con `current_date` ' +
    'a secas, un gasto de las 8 de la noche nacería fechado mañana',
  ).toBe(HOY)
})

test('🔴 el gasto se reporta en SU fecha, no en la de registro', async ({ page }) => {
  const ins = await db.from('cash_movements').insert({
    jornada_id: JORNADA, sede_id: SEDE, type: 'out', categoria: 'gasto',
    amount: GASTO, reason: 'E2E gasto fechado ' + SUFFIX, created_by: OWNER,
    document_date: FECHA_GASTO,
  }).select('id').single()
  expect(ins.error, 'un gasto tiene que poder decir de cuándo es').toBeNull()

  await loginAsOwner(page)
  await page.goto('/historial-gastos')
  const fila = page.getByTestId('expense-row').filter({ hasText: 'E2E gasto fechado ' + SUFFIX })

  // Filtrando por HOY —el día en que se TECLEÓ— no tiene que aparecer.
  await page.getByTestId('expense-from').fill(HOY)
  await page.getByTestId('expense-to').fill(HOY)
  await expect(page.getByTestId('expenses-total')).toBeVisible({ timeout: 15_000 })
  await expect(
    fila,
    'el gasto es del ' + FECHA_GASTO + ': filtrando por hoy no puede salir. Si sale, ' +
    'la pantalla está mirando created_at y el reporte del mes va a estar mal',
  ).toHaveCount(0)

  // Y filtrando por SU fecha, sí. Sin esta mitad, el caso de arriba pasaría con
  // una pantalla que no muestra nada.
  await page.getByTestId('expense-from').fill(FECHA_GASTO)
  await page.getByTestId('expense-to').fill(FECHA_GASTO)
  await expect(fila, 'y en su propia fecha tiene que estar').toHaveCount(1)
})

test('🔴 el ARQUEO no cambia: el gasto viejo igual salió del cajón HOY', async () => {
  // 🔴 ESTE CASO EXISTE PARA IMPEDIR QUE SE ARREGLE DE MÁS. La tentación al
  //    agregar la fecha del documento es usarla en todas partes. En el arqueo
  //    sería un error: la plata salió del cajón cuando se tecleó, y el cierre
  //    tiene que cuadrar contra lo que hay en el cajón HOY. Misma distinción que
  //    la deuda 63.
  const { data, error } = await db.from('cash_movements')
    .select('id, amount, document_date')
    .eq('jornada_id', JORNADA)
    .eq('type', 'out')
    .like('reason', '%' + SUFFIX)
  expect(error).toBeNull()
  const fechado = (data ?? []).find((m) => m.document_date === FECHA_GASTO)
  expect(
    fechado,
    'el gasto con fecha vieja tiene que seguir perteneciendo a la jornada de hoy: ' +
    'el arqueo cuadra por lo que salió del cajón, no por la fecha del papel',
  ).toBeTruthy()
  expect(Number(fechado!.amount)).toBe(GASTO)
})

test('🔴 una fecha FUTURA se rechaza por los dos caminos', async () => {
  // Un typo de año manda el gasto a un reporte que nadie mira todavía: no
  // desaparece con ruido, desaparece en silencio. Fail-closed en las dos vías,
  // porque son dos: compras entra por RPC y los gastos por INSERT directo (no
  // hay RPC de movimientos), así que el guard de gastos tiene que ser un
  // TRIGGER — mismo caso que la deuda 61.
  const compra = await db.rpc('register_purchase', {
    p_invoice: {
      supplier_id: PROVEEDOR, invoice_number: 'E2E-FUT-' + SUFFIX,
      notes: null, document_date: FUTURO,
    },
    p_items: [{ product_id: PRODUCTO, qty: 1, unit_cost: 1000 }],
  })
  expect(compra.error, 'una factura del futuro no existe: la RPC tiene que rechazar').not.toBeNull()

  const gasto = await db.from('cash_movements').insert({
    jornada_id: JORNADA, sede_id: SEDE, type: 'out', categoria: 'gasto',
    amount: 2000, reason: 'E2E futuro ' + SUFFIX, created_by: OWNER,
    document_date: FUTURO,
  }).select('id')
  expect(
    gasto.error,
    'y el INSERT directo también: no hay RPC de movimientos, así que el invariante ' +
    'vive en un trigger o no vive',
  ).not.toBeNull()
})
