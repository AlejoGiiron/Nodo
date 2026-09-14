import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { ownerCreds } from './helpers/auth'

// ============================================================================
// DEUDA 97 · LA FECHA DE UNA JORNADA CERRADA NO SE MUEVE
//
// 🔴 QUÉ SOSTIENE. `set_jornada_closed_at` forzaba `closed_at := now()` pero
//    sólo en la transición `null → no null`. Después no miraba más, y la policy
//    «jornadas: cerrar» es `for update` sin restricción de columna — así que
//    cualquiera con `caja.cerrar` movía la fecha de cierre de una jornada ya
//    cerrada. Medido en LAB Pruebas el 2026-09-06: **59 días atrás, sin
//    resistencia.**
//
//    Una garantía que sólo aplica la primera vez es PEOR que no tenerla: el
//    trigger existe y hace creer que la fecha está sellada. Es la familia de
//    «una garantía falsa donde se decide».
//
// 🔴 Y `opened_at` ENTRA ACÁ PORQUE CARGA PESO, no por simetría. No tenía sello
//    ninguno, y `getShiftSalesCount` cuenta las ventas del turno **desde**
//    ella: moverla cambia qué ventas son de este turno sin tocar una sola venta.
//
// ⚠️ EL CONTROL POSITIVO NO ES DECORATIVO, y es la mitad que decide si este
//    archivo mide algo. Un trigger que lanzara excepción ante CUALQUIER update
//    dejaría los tres casos negativos en verde y la caja imposible de cerrar.
//    Por eso hay dos controles de cosas distintas:
//      ① el cierre SIGUE funcionando, y el servidor estampa la fecha
//      ② una columna NO sellada (`close_comment`) se sigue pudiendo corregir
//
// ⚠️ NO va en `describe.serial`: el cierre se hace en el `beforeAll` —es
//    fixture, no sujeto— así que los cinco casos son independientes. Si fueran
//    seriales, el control ② quedaría en `did not run` justo cuando un negativo
//    se pone rojo, que es cuando el control hace falta.
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

const DIA = 24 * 3600 * 1000
const HACE_2_DIAS = new Date(Date.now() - 2 * DIA).toISOString()   // apertura de la fixture
const HACE_1_DIA = new Date(Date.now() - 1 * DIA).toISOString()    // el destino del ataque
const HACE_30_DIAS = new Date(Date.now() - 30 * DIA).toISOString() // lo que manda el cliente al cerrar

// 🔴 POR QUÉ LA FIXTURE ABRE HACE DOS DÍAS Y EL ATAQUE APUNTA A AYER — y no es
//    un detalle: la primera versión de este spec abría la jornada AHORA y movía
//    el cierre 30 días atrás. **Contestó otro guard**: la constraint
//    `chk_jornada_cierre_posterior` (`closed_at > opened_at`), que rechaza por
//    una razón que no tiene nada que ver con el sello. El caso estaba rojo y el
//    agujero NO se había ejercido — *un test de negación tiene que exigir que
//    niegue por la razón correcta*.
//    Con la apertura dos días atrás, mover el cierre a ayer **cumple la
//    constraint** y llega al trigger, que es el sujeto. Y ayer es otro DÍA, que
//    es exactamente lo que rompe un reporte por período.

let db: SupabaseClient
let SEDE = ''
let PERFIL = ''
let JORNADA = ''
let cerradaEn = ''   // lo que el SERVIDOR estampó
let abiertaEn = ''

async function leer() {
  const { data, error } = await db
    .from('jornadas').select('opened_at, closed_at, close_comment').eq('id', JORNADA).single()
  if (error) throw error
  return data
}

test.beforeAll(async () => {
  db = createClient(process.env.VITE_NODO_SUPABASE_URL!, process.env.VITE_NODO_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  })
  const { error } = await db.auth.signInWithPassword(ownerCreds())
  if (error) throw error
  PERFIL = (await db.auth.getUser()).data.user!.id
  SEDE = (await db.from('profiles').select('sede_id').eq('id', PERFIL).single()).data!.sede_id as string

  // ⚠️ Hay un índice único de UNA jornada abierta por sede. Si quedó una de otro
  //    spec, este caso NO la secuestra ni se saltea: falla diciéndolo. Un `skip`
  //    porque la fixture no se pudo armar es un verde por omisión.
  const abierta = await db.from('jornadas').select('id').eq('sede_id', SEDE).is('closed_at', null)
  if (abierta.data?.length) {
    throw new Error(
      'quedó una jornada ABIERTA en el lab de otra corrida: este spec necesita abrir la suya, ' +
      'y cerrar una ajena dejaría el lab en un estado que nadie eligió',
    )
  }

  JORNADA = (await db.from('jornadas')
    .insert({ sede_id: SEDE, opened_by: PERFIL, opening_amount: 0, opened_at: HACE_2_DIAS })
    .select('id').single()).data!.id

  // El cierre es FIXTURE, no sujeto: los casos de abajo miden qué pasa DESPUÉS.
  // Se manda una fecha de hace 30 días a propósito — el control ① verifica que
  // el servidor la ignore.
  const { error: eC } = await db.from('jornadas')
    .update({ closed_at: HACE_30_DIAS, closed_by: PERFIL, closing_amount: 0 })
    .eq('id', JORNADA)
  if (eC) throw eC

  const fila = await leer()
  cerradaEn = fila.closed_at as string
  abiertaEn = fila.opened_at as string
})

test.afterAll(async () => {
  // 🔴 LIMPIEZA OBLIGATORIA, y la razón es el estado ROJO, no el verde. Con el
  //    agujero abierto —o sea antes del arreglo— el caso de «no se reabre» SÍ
  //    reabre la jornada, y el índice de «una abierta por sede» dejaría a la
  //    corrida siguiente sin poder abrir la suya. Una sonda que escribe necesita
  //    su limpieza EN EL MISMO TURNO, y acá la necesita justo cuando falla.
  if (!db || !JORNADA) return
  const fila = await db.from('jornadas').select('closed_at').eq('id', JORNADA).single()
  if (fila.data && fila.data.closed_at === null) {
    await db.from('jornadas')
      .update({ closed_at: new Date().toISOString(), closed_by: PERFIL, closing_amount: 0 })
      .eq('id', JORNADA)
  }
})

// ── ① CONTROL POSITIVO · cerrar funciona, y la fecha la pone el servidor ─────
test('la jornada SE CIERRA, y `closed_at` la estampa el servidor — no el cliente', async () => {
  expect(cerradaEn, 'el cierre no se persistió: la caja quedó imposible de cerrar').not.toBeNull()

  const desvio = Math.abs(Date.parse(cerradaEn) - Date.now())
  expect(
    desvio < 5 * 60 * 1000,
    `el servidor NO estampó la fecha: quedó ${cerradaEn}, que es lo que mandó el cliente ` +
    '(hace 30 días). El reloj del navegador no es una fuente de verdad',
  ).toBe(true)
})

// ── SUJETO ──────────────────────────────────────────────────────────────────
test('🔴 `closed_at` de una jornada CERRADA no se puede mover', async () => {
  const { error } = await db.from('jornadas')
    .update({ closed_at: HACE_1_DIA }).eq('id', JORNADA)

  expect(
    error?.message ?? '(no hubo error: el update PASÓ)',
    'SE MOVIÓ LA FECHA DE CIERRE DE UNA JORNADA CERRADA. El arqueo, los reportes por ' +
    'período y cualquier auditoría se apoyan en ella, y el trigger existe — o sea que ' +
    'la garantía es falsa, no ausente',
  ).toMatch(/no se puede cambiar/i)

  expect(
    (await leer()).closed_at,
    'la fecha cambió igual: el error no impidió la escritura',
  ).toBe(cerradaEn)
})

test('🔴 una jornada cerrada no se REABRE', async () => {
  const { error } = await db.from('jornadas')
    .update({ closed_at: null }).eq('id', JORNADA)

  expect(
    error?.message ?? '(no hubo error: el update PASÓ)',
    'SE REABRIÓ UNA JORNADA CERRADA. Con el índice de «una abierta por sede», las ventas ' +
    'de hoy caerían en el turno de otro día',
  ).toMatch(/no se reabre/i)

  expect((await leer()).closed_at, 'quedó reabierta').toBe(cerradaEn)
})

test('🔴 `opened_at` no se puede mover — decide qué ventas son del turno', async () => {
  const { error } = await db.from('jornadas')
    .update({ opened_at: HACE_30_DIAS }).eq('id', JORNADA)

  expect(
    error?.message ?? '(no hubo error: el update PASÓ)',
    'SE MOVIÓ LA HORA DE APERTURA. `getShiftSalesCount` cuenta las ventas del turno desde ' +
    'ella, así que esto reescribe el arqueo sin tocar una sola venta',
  ).toMatch(/no se puede cambiar/i)

  expect((await leer()).opened_at, 'la apertura se movió igual').toBe(abiertaEn)
})

// ── ② CONTROL · el trigger no bloquea TODO ──────────────────────────────────
test('una columna NO sellada de una jornada cerrada sí se corrige', async () => {
  const nota = `jornada-sellada.spec · ${Date.now()}`
  const { error } = await db.from('jornadas')
    .update({ close_comment: nota }).eq('id', JORNADA)

  expect(
    error?.message ?? null,
    'el trigger está rechazando CUALQUIER update sobre una jornada cerrada. Sin este ' +
    'control, los tres negativos de arriba pasarían igual con la caja rota',
  ).toBeNull()
  expect((await leer()).close_comment).toBe(nota)
})
