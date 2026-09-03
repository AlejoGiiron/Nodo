import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { loginAsOwner, ownerCreds } from './helpers/auth'

// ============================================================================
// "GASTOS" NO ES "TODO LO QUE SALIÓ DE LA CAJA" — deuda 63, auditoría A3 §4
//
// 🔴 EL DATO QUE HACE URGENTE ESTO, medido en el archivo real del cliente
//    (`Control_Mp.xlsx`, 2026-09-02): Muscle Pro mete "Compra de inventario"
//    como concepto en su hoja de gastos, y **3.511.500 de sus 5.495.500 de
//    gastos son compras** — el 64 %. Si nuestra pantalla no filtra por
//    `categoria`, le devolvemos **el mismo número inflado que ya tiene**, y con
//    la autoridad de un sistema.
//
//    `register_purchase` inserta un `cash_movements` con `type='out'` y
//    `categoria='compra'` cada vez que se paga una compra en efectivo. La
//    pantalla filtraba sólo por `type='out'`, así que esas compras entraban al
//    "Total del período" de Gastos. También los retiros del dueño, que no son
//    un gasto del negocio.
//
// ⚠️ LO QUE NO SE TOCA: el arqueo. En el cierre de caja, `movementsOut` suma
//    TODOS los `out` — y está bien: todos salieron del cajón, compras incluidas.
//    Son dos preguntas distintas sobre la misma tabla, y ésa es exactamente la
//    razón por la que `categoria` existe como columna aparte de `reason`.
//
// Y el segundo caso es M7 de la auditoría A4: el CHECK que cruza `type` con
// `categoria` **no lo ejercitaba ningún test** — con el constraint borrado,
// `caja.spec` quedaba 5/5 verde porque la UI sólo manda combinaciones válidas.
// Es la misma columna: una sin usar y otra sin probar.
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
const GASTO = 40_000
const OTRO = 7_000
const COMPRA = 500_000        // como las del cliente: la que infla el total
const RETIRO = 300_000

let db: SupabaseClient
let SEDE = ''
let OWNER = ''
let JORNADA = ''

test.beforeAll(async () => {
  db = createClient(process.env.VITE_NODO_SUPABASE_URL!, process.env.VITE_NODO_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  })
  const { error } = await db.auth.signInWithPassword(ownerCreds())
  if (error) throw error
  OWNER = (await db.auth.getUser()).data.user!.id
  SEDE = (await db.from('profiles').select('sede_id').eq('id', OWNER).single()).data!.sede_id as string

  const abierta = (await db.from('jornadas').select('id').eq('sede_id', SEDE).is('closed_at', null).maybeSingle()).data
  JORNADA = abierta
    ? (abierta.id as string)
    : ((await db.from('jornadas').insert({ sede_id: SEDE, opened_by: OWNER, opening_amount: 0 }).select('id').single()).data!.id as string)

  // Las cuatro categorías de egreso que el esquema permite, todas del mismo día.
  const filas = [
    { categoria: 'gasto', amount: GASTO, reason: `E2E gasto ${SUFFIX}` },
    { categoria: 'otro', amount: OTRO, reason: `E2E otro ${SUFFIX}` },
    { categoria: 'compra', amount: COMPRA, reason: `E2E compra ${SUFFIX}` },
    { categoria: 'retiro', amount: RETIRO, reason: `E2E retiro ${SUFFIX}` },
  ]
  for (const f of filas) {
    const { error: e } = await db.from('cash_movements').insert({
      jornada_id: JORNADA, sede_id: SEDE, type: 'out', created_by: OWNER, ...f,
    })
    if (e) throw new Error(`fixture ${f.categoria}: ${e.message}`)
  }
})

// ⚠️ NO hay limpieza, y no es un olvido: `cash_movements` **no tiene policy de
//    DELETE** — un movimiento de caja es un asiento, no se borra: se compensa.
//    (Medido: el `delete` que había acá fallaba en silencio por RLS.) Por eso el
//    caso de arriba fija el rango en HOY y calcula el esperado contra la base en
//    vez de contra una constante: está escrito para tolerar el residuo, que es
//    lo correcto cuando la tabla no admite borrado.
//
// 🔴 Y la consecuencia para el caso M7: mientras el CHECK esté mutado, una fila
//    inválida ENTRA y ya no se puede sacar desde el cliente. Si se vuelve a
//    correr ese mutante, hay que borrarla con privilegios ANTES de restaurar el
//    constraint — si no, el `add constraint` falla con 23514.


test('el total de Gastos NO incluye compras ni retiros', async ({ page }) => {
  await loginAsOwner(page)
  await page.goto('/historial-gastos')

  // El período por defecto son 30 días y el lab arrastra movimientos viejos, así
  // que se fija el rango en HOY con los propios filtros de la pantalla: el
  // esperado se vuelve calculable sin replicar la lógica de fechas de la app.
  const hoy = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'America/Bogota',
  }).format(new Date())
  await page.getByTestId('expense-from').fill(hoy)
  await page.getByTestId('expense-to').fill(hoy)

  const total = page.getByTestId('expenses-total')
  await expect(total).toBeVisible({ timeout: 15_000 })
  await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {})
  const texto = (await total.innerText()).replace(/[^\d]/g, '')
  const valor = Number(texto)

  // El total del período incluye movimientos previos del lab, así que no se
  // asevera un número exacto: se asevera que la COMPRA no está adentro. Con el
  // defecto, esos 500.000 se suman; sin él, no aparecen por ningún lado.
  const conCompra = await db
    .from('cash_movements')
    .select('amount, categoria')
    .eq('sede_id', SEDE)
    .eq('type', 'out')
    .like('reason', `%${SUFFIX}`)
  const suma = (cats: string[]) =>
    (conCompra.data ?? []).filter((m) => cats.includes(m.categoria as string))
      .reduce((s, m) => s + Number(m.amount), 0)

  expect(suma(['compra', 'retiro']), 'precondición: la fixture metió compra y retiro').toBe(COMPRA + RETIRO)

  // 🔴 La aserción: los movimientos de la fixture que el total DEBE contar son
  //    sólo gasto y otro. Se mide por diferencia contra la lista visible.
  const filasVisibles = page.getByTestId('expense-row')
  await expect(filasVisibles.filter({ hasText: `E2E gasto ${SUFFIX}` })).toHaveCount(1)
  await expect(
    filasVisibles.filter({ hasText: `E2E compra ${SUFFIX}` }),
    'UNA COMPRA NO ES UN GASTO: `register_purchase` la registra como egreso de caja ' +
    'con categoria=compra, y en la hoja del cliente ese concepto es el 64% de sus ' +
    '"gastos". Si aparece acá, le devolvemos su propio número inflado',
  ).toHaveCount(0)
  await expect(
    filasVisibles.filter({ hasText: `E2E retiro ${SUFFIX}` }),
    'un retiro del dueño tampoco es un gasto del negocio',
  ).toHaveCount(0)

  // Y el total no puede contener la compra: si la contuviera, sería ≥ 500.000
  // sólo por la fixture. Se compara contra el total que la app debería sumar.
  // ⚠️ EL RANGO SE MIDE SOBRE `document_date`, NO SOBRE `created_at` (deuda 44,
  //    2026-09-02). La aserción no cambió —el total de la pantalla tiene que ser
  //    la suma de gasto+otro del período— pero la definición de "el período" sí:
  //    la pantalla pasó a filtrar por la fecha del GASTO. Calcularlo con
  //    `created_at` daba de más justo por los gastos con fecha vieja, que es
  //    exactamente lo que la 44 vino a separar.
  const esperado = await db
    .from('cash_movements')
    .select('amount')
    .eq('sede_id', SEDE)
    .eq('type', 'out')
    .in('categoria', ['gasto', 'otro'])
    .eq('document_date', hoy)
  const totalEsperado = (esperado.data ?? []).reduce((s, m) => s + Number(m.amount), 0)
  expect(
    valor,
    `el Total del período tiene que sumar SÓLO gasto y otro (${totalEsperado}); ` +
    `si suma compras y retiros da de más, que es el error que el cliente ya tiene en su Excel`,
  ).toBe(totalEsperado)
})

test('la pantalla dice qué está contando y qué dejó afuera', async ({ page }) => {
  // Criterio del artefacto autoexplicativo: si el dueño ve un total MENOR que el
  // de su Excel, tiene que saber por qué sin preguntarle a nadie.
  await loginAsOwner(page)
  await page.goto('/historial-gastos')
  const nota = page.getByTestId('expenses-alcance')
  await expect(nota, 'sin esta nota, un total más chico parece un error nuestro').toBeVisible({ timeout: 15_000 })
  await expect(nota).toContainText(/compras/i)
  await expect(nota).toContainText(/Compras/)
})

test('M7 · el CHECK cruza type con categoria, y ningún test lo ejercitaba', async () => {
  // Mutante M7 de A4: con `chk_categoria_segun_tipo` borrado, `caja.spec` quedaba
  // 5/5 verde — la UI sólo manda combinaciones válidas, así que la garantía de la
  // base no la medía nadie.
  const invalido = await db.from('cash_movements').insert({
    jornada_id: JORNADA, sede_id: SEDE, type: 'out', categoria: 'abono_cliente',
    amount: 1000, reason: `E2E invalido ${SUFFIX}`, created_by: OWNER,
  }).select('id')
  expect(
    invalido.error,
    'un egreso con categoria de INGRESO (abono_cliente) tiene que ser rechazado por el CHECK',
  ).not.toBeNull()
  expect(invalido.error!.code, 'rechaza el constraint (23514), no otra cosa').toBe('23514')

  // Contraste: la MISMA categoría con el type que le corresponde SÍ entra. Sin
  // esto, el caso de arriba pasaría con la tabla rota o con RLS negando todo.
  const valido = await db.from('cash_movements').insert({
    jornada_id: JORNADA, sede_id: SEDE, type: 'in', categoria: 'abono_cliente',
    amount: 1000, reason: `E2E valido ${SUFFIX}`, created_by: OWNER,
  }).select('id')
  expect(valido.error, 'abono_cliente con type=in es válido y debe entrar').toBeNull()

  // Y la otra mitad del CHECK: `otro` exige detalle.
  const sinDetalle = await db.from('cash_movements').insert({
    jornada_id: JORNADA, sede_id: SEDE, type: 'out', categoria: 'otro',
    amount: 1000, reason: null, created_by: OWNER,
  }).select('id')
  expect(
    sinDetalle.error,
    'categoria "otro" sin detalle libre no dice nada: el CHECK lo exige',
  ).not.toBeNull()
})
