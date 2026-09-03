import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { loginAsOwner, ownerCreds } from './helpers/auth'

// ============================================================================
// SUBCATEGORÍA DE GASTO Y "PAGADO A" — deuda 45
//
// 🔴 SON TRES PREGUNTAS DISTINTAS SOBRE LA MISMA FILA, y por eso tres columnas:
//      categoria    → ¿qué clase de MOVIMIENTO es?  (compra · gasto · retiro · otro)
//      subcategoria → ¿qué clase de GASTO es?       (publicidad · adecuación · activo)
//      pagado_a     → ¿a QUIÉN se le pagó?
//    Meter la subcategoría en `reason` sería deshacer la separación que ya se
//    hizo una vez —el caso 1 de "un valor que significa dos cosas no es un
//    dato"— y el reporte por tipo de gasto no se podría hacer ni reprocesando.
//
// ── LA LISTA ES POR SEDE, Y NO ES LO MISMO QUE `categoria` ────────────────
// `categoria` es allowlist FIJA en el esquema porque es estructural y **cruza
// sedes**: si el cliente la inventara, los reportes dejarían de ser comparables.
// Una subcategoría de gasto **vive adentro de una sede** y es del negocio: las
// de una ferretería no son las de una distribuidora, y clavar el vocabulario de
// un cliente en un CHECK choca con que el producto es horizontal.
//
// ⚠️ PERO DE UN DESPLEGABLE, NUNCA TEXTO LIBRE: "publicidad" y "Publicidad"
//    parten el reporte en dos filas, y el desplegable lo evita sin tener que
//    normalizar después.
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
const RETIRADA = 'adecuacion'   // la que se saca de la lista a mitad del spec
const VIGENTE = 'publicidad'

let db: SupabaseClient
let SEDE = ''
let OWNER = ''
let JORNADA = ''
let CONFIG_ORIGINAL: Record<string, unknown> = {}

async function insertar(fila: Record<string, unknown>) {
  return db.from('cash_movements').insert({
    jornada_id: JORNADA, sede_id: SEDE, created_by: OWNER, ...fila,
  }).select('id')
}

/** Escribe la lista de subcategorías de la sede, preservando el resto del config. */
async function ponerLista(lista: string[]) {
  const { error } = await db.from('sedes')
    .update({ config: { ...CONFIG_ORIGINAL, expense_subcategories: lista } })
    .eq('id', SEDE)
  if (error) throw error
}

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

  const abierta = await db.from('jornadas').select('id')
    .eq('sede_id', SEDE).is('closed_at', null).maybeSingle()
  JORNADA = abierta.data
    ? (abierta.data.id as string)
    : ((await db.from('jornadas')
        .insert({ sede_id: SEDE, opened_by: OWNER, opening_amount: 0 })
        .select('id').single()).data!.id as string)
})

test.afterAll(async () => {
  // La configuración SÍ se restaura: a diferencia de cash_movements, `sedes` es
  // estado de la sede y no un asiento. Dejarla cambiada rompería otras specs.
  if (db && SEDE) await db.from('sedes').update({ config: CONFIG_ORIGINAL }).eq('id', SEDE)
})

test('🔴 un gasto guarda su subcategoría y a quién se le pagó', async () => {
  const r = await insertar({
    type: 'out', categoria: 'gasto', amount: 45_000,
    reason: 'E2E volantes ' + SUFFIX,
    subcategoria: VIGENTE,
    pagado_a: 'Litografia El Sol',
  })
  expect(
    r.error,
    'LA SUBCATEGORÍA DE GASTO NO EXISTE (deuda 45): toda subcategoría sería ' +
    'categoria=gasto, y "Pagado a" no tiene columna. Meterlas en `reason` ' +
    'desharía la separación que ya se hizo una vez',
  ).toBeNull()

  const fila = await db.from('cash_movements')
    .select('categoria, subcategoria, pagado_a')
    .eq('id', r.data![0].id).single()
  expect(fila.data!.categoria, 'el eje estructural no cambia').toBe('gasto')
  expect(fila.data!.subcategoria, 'y el eje del negocio vive aparte').toBe(VIGENTE)
  expect(fila.data!.pagado_a).toBe('Litografia El Sol')
})

test('🔴 la subcategoría SOLO existe para un gasto — un retiro o una compra la rechazan', async () => {
  // Un retiro del dueño y una compra a proveedor no tienen "clase de gasto":
  // permitirla dejaría filas donde el eje del negocio no significa nada, y el
  // reporte por subcategoría sumaría cosas que no son gastos. Es el mismo
  // criterio de la deuda 63, un nivel más abajo.
  for (const categoria of ['retiro', 'compra']) {
    const r = await insertar({
      type: 'out', categoria, amount: 10_000,
      reason: `E2E ${categoria} con subcat ${SUFFIX}`,
      subcategoria: VIGENTE,
    })
    expect(r.error, `un ${categoria} con subcategoría de gasto tiene que rechazar`).not.toBeNull()
    expect(r.error!.code, 'y rechaza el CHECK, no otra cosa').toBe('23514')
  }

  // CONTRASTE: los mismos movimientos SIN subcategoría entran. Sin esto, el caso
  // de arriba pasaría con una tabla rota o con RLS negando todo.
  const ok = await insertar({
    type: 'out', categoria: 'retiro', amount: 10_000,
    reason: 'E2E retiro limpio ' + SUFFIX,
  })
  expect(ok.error, 'un retiro sin subcategoría es válido y debe entrar').toBeNull()
})

test('🔴 "pagado a" solo tiene sentido en un EGRESO', async () => {
  // En un ingreso la plata viene DE alguien, no va A alguien: un `pagado_a` ahí
  // sería un valor que dice lo contrario de lo que pasó.
  const malo = await insertar({
    type: 'in', categoria: 'base', amount: 20_000,
    reason: 'E2E base con pagado_a ' + SUFFIX,
    pagado_a: 'Alguien',
  })
  expect(malo.error, 'un ingreso con "pagado a" tiene que rechazar').not.toBeNull()
  expect(malo.error!.code).toBe('23514')

  const bueno = await insertar({
    type: 'in', categoria: 'base', amount: 20_000,
    reason: 'E2E base limpia ' + SUFFIX,
  })
  expect(bueno.error, 'el mismo ingreso sin "pagado a" entra').toBeNull()
})

test('🔴 la lista sale de la SEDE: cambiarla cambia el desplegable', async ({ page }) => {
  await ponerLista([VIGENTE, RETIRADA, 'activo'])
  await loginAsOwner(page)
  await page.goto('/ventas')

  await page.getByTestId('open-movements').click()
  await expect(page.getByText('Movimientos manuales', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Egreso', exact: true }).click()
  await page.getByTestId('movement-categoria').selectOption('gasto')

  const select = page.getByTestId('movement-subcategoria')
  await expect(
    select,
    'con categoria=gasto tiene que aparecer el desplegable de subcategoría',
  ).toBeVisible({ timeout: 10_000 })

  // 🔴 ES UN <select>, NO UN INPUT. "publicidad" y "Publicidad" partirían el
  //    reporte en dos filas; el desplegable lo evita sin normalizar después.
  await expect(
    select,
    'tiene que ser un desplegable: con texto libre el reporte se parte por mayúsculas',
  ).toHaveJSProperty('tagName', 'SELECT')

  const opciones = await select.locator('option').allTextContents()
  expect(
    opciones.join('|'),
    'las opciones salen de la config de la sede, no de una allowlist del esquema',
  ).toContain(RETIRADA)
  expect(opciones.join('|')).toContain(VIGENTE)
})

test('🔴 una subcategoría RETIRADA deja de ofrecerse, pero la fila vieja la conserva', async ({ page }) => {
  // El hueco que ya tiene `cash_out_reasons`, decidido antes de heredarlo.
  const usado = await insertar({
    type: 'out', categoria: 'gasto', amount: 33_000,
    reason: 'E2E gasto retirado ' + SUFFIX,
    subcategoria: RETIRADA,
  })
  expect(usado.error).toBeNull()

  // El dueño saca esa subcategoría de la lista de su sede.
  await ponerLista([VIGENTE, 'activo'])

  // 1 · LA FILA VIEJA NO SE TOCA. Borrar de la lista es dejar de ofrecerla, no
  //     reescribir el pasado — el mismo criterio que congela el costo al vender
  //     y que separa la fecha del documento de la de registro.
  const fila = await db.from('cash_movements')
    .select('subcategoria').eq('id', usado.data![0].id).single()
  expect(
    fila.data!.subcategoria,
    'sacar una subcategoría de la lista NO puede reescribir los gastos ya cargados',
  ).toBe(RETIRADA)

  await loginAsOwner(page)

  // 2 · Y SE SIGUE MOSTRANDO, marcada como retirada: si desapareciera de la
  //     pantalla, el total del período dejaría de cuadrar con sus filas.
  await page.goto('/historial-gastos')
  const visible = page.getByTestId('expense-row')
    .filter({ hasText: 'E2E gasto retirado ' + SUFFIX })
  await expect(visible, 'la fila vieja se sigue listando').toHaveCount(1)
  await expect(
    visible.getByTestId('expense-subcategoria'),
    'y muestra su subcategoría, marcada como retirada',
  ).toContainText(new RegExp(RETIRADA, 'i'))

  // 3 · PERO YA NO SE PUEDE ELEGIR.
  await page.goto('/ventas')
  await page.getByTestId('open-movements').click()
  await expect(page.getByText('Movimientos manuales', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Egreso', exact: true }).click()
  await page.getByTestId('movement-categoria').selectOption('gasto')
  const opciones = await page.getByTestId('movement-subcategoria')
    .locator('option').allTextContents()
  expect(
    opciones.join('|'),
    'retirada de la lista = no se vuelve a ofrecer',
  ).not.toContain(RETIRADA)
})
