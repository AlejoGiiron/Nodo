import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { loginAsOwner, ownerCreds } from './helpers/auth'

// ============================================================================
// BALANCE · «cuánto deberíamos tener»
//
// 🔴 LOS DOS CASOS QUE IMPORTAN SON LOS DE LA AUSENCIA DEL DATO. El balance
//    arranca de un número que no está en ninguna tabla —con cuánta plata
//    arrancó el negocio— y la tentación es tratarlo como cero. Un cero ahí no
//    da error: da un balance completo, plausible y FALSO, que además falla
//    hacia el lado agradable (parece que tiene más de lo que puso). Por eso hay
//    un caso para «sin configurar avisa» y su control: «con el dato, calcula».
//
// 🔴 Y EL TERCERO ES SOBRE UN CONTROL QUE NO DEBE APLICAR: Reportes tiene un
//    selector de fechas arriba, y el Balance es acumulado desde el inicio.
//    Dejarlo visible sin efecto le diría a la clienta que puede pedir «el
//    balance de esta semana», que es una pregunta sin respuesta.
//
// ⚠️ NO va en `describe.serial`: cada caso deja el capital como lo necesita, y
//    comparten la fixture, no el resultado.
// ============================================================================

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
let SEDE = ''

/** Deja el capital como lo necesita el caso. Asignado: supabase-js no lanza. */
async function ponerCapital(valor: number | null, desde: string | null) {
  const r = await db.from('sedes')
    .update({ capital_inicial: valor, capital_inicial_desde: desde })
    .eq('id', SEDE)
  expect(r.error?.message ?? null, 'no se pudo preparar el capital de la fixture').toBeNull()
}

test.beforeAll(async () => {
  db = createClient(process.env.VITE_NODO_SUPABASE_URL!, process.env.VITE_NODO_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  })
  const { error } = await db.auth.signInWithPassword(ownerCreds())
  if (error) throw error
  const uid = (await db.auth.getUser()).data.user!.id
  SEDE = (await db.from('profiles').select('sede_id').eq('id', uid).single()).data!.sede_id as string
})

test.afterAll(async () => {
  if (!db || !SEDE) return
  // El capital es config de la sede y queda puesto para los demás specs si no
  // se limpia. La limpieza ASEVERA EL ESTADO, no la operación (deuda 115).
  await db.from('sedes').update({ capital_inicial: null, capital_inicial_desde: null }).eq('id', SEDE)
  const fin = await db.from('sedes').select('capital_inicial').eq('id', SEDE).single()
  expect(
    [fin.error?.message, fin.data?.capital_inicial],
    `LIMPIEZA de balance.spec: quedó capital cargado en la sede ${SEDE}`,
  ).toEqual([undefined, null])
})

async function abrirBalance(page: Page) {
  await loginAsOwner(page)
  await page.goto('/reportes')
  await page.getByTestId('report-tab-balance').click()
  // El panel no pinta cifras hasta confirmar el dato: se espera al período.
  await expect(page.getByTestId('balance-periodo')).toBeVisible({ timeout: 15_000 })
}

test('🔴 SIN capital cargado avisa y NO inventa un «deberías tener»', async ({ page }) => {
  await ponerCapital(null, null)
  await abrirBalance(page)

  await expect(
    page.getByTestId('balance-sin-capital'),
    'sin el dato, la pantalla tiene que pedirlo',
  ).toBeVisible()
  await expect(
    page.getByTestId('balance-efectivo'),
    'sin saber con cuánto arrancó NO puede haber un «deberías tener»: ese número ' +
    'saldría de suponer cero, que es plausible y falso',
  ).toHaveCount(0)
  await expect(page.getByTestId('balance-patrimonio')).toHaveCount(0)

  // CONTROL: lo que NO depende del capital se sigue mostrando. Sin esto, una
  // pantalla que se apagara entera pasaría este caso igual.
  await expect(
    page.getByTestId('balance-resultado'),
    'cómo le fue al negocio no necesita el capital inicial: tiene que estar',
  ).toBeVisible()
})

test('🔴 CON capital cargado calcula cuánto debería tener', async ({ page }) => {
  await ponerCapital(15_000_000, '2026-08-31')
  await abrirBalance(page)

  await expect(page.getByTestId('balance-sin-capital')).toHaveCount(0)
  await expect(page.getByTestId('balance-efectivo')).toBeVisible()
  await expect(page.getByTestId('balance-patrimonio')).toBeVisible()
  await expect(
    page.getByTestId('balance-contra-capital'),
    'tiene que decir cómo está contra lo que puso: es la pregunta de la clienta',
  ).toBeVisible()
  // La fecha configurada se DECLARA: es el período que el balance cubre.
  await expect(page.getByTestId('balance-periodo')).toContainText('2026')
})

test('🔴 el selector de fechas NO aplica al balance, y por eso no se ve', async ({ page }) => {
  await ponerCapital(15_000_000, '2026-08-31')
  await abrirBalance(page)

  const desde = page.locator('input[type="date"]').first()
  await expect(
    desde,
    'un control visible que no hace nada le diría que puede pedir «el balance de esta semana»',
  ).toBeHidden()
  await expect(page.getByTestId('balance-periodo')).toContainText('No depende del rango de fechas')

  // CONTROL: en Financiero el MISMO selector sí se ve. Sin esto, un defecto que
  // escondiera las fechas en toda la pantalla pasaría verde.
  await page.getByTestId('report-tab-financiero').click()
  await expect(
    desde,
    'en Financiero el rango sí aplica: si tampoco se ve acá, se escondió de más',
  ).toBeVisible()
})
