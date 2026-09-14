import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { ownerCreds } from './helpers/auth'

// ============================================================================
// DEUDA 97 · LA EXCEPCIÓN NOMBRADA · `cerrar_jornada_con_fecha`
//
// 🔴 QUÉ SOSTIENE. Al cerrar la 97 quedó escrito que el día que hubiera que
//    fechar un cierre, el mecanismo **no** era aflojar el trigger sino una RPC
//    con fecha explícita y motivo. Este archivo es el que impide que esa RPC se
//    convierta, con el tiempo, en el agujero que la 97 cerró.
//
// 🔴 LA VALIDACIÓN QUE LO SOSTIENE TODO ES «EL MISMO DÍA». Sin ella, la RPC
//    permite mover un cierre a cualquier fecha pasada — o sea exactamente lo
//    que se midió en LAB Pruebas el 2026-09-06: un segundo `update` movió
//    `closed_at` 59 días atrás sin resistencia.
//
// ⚠️ Y el día se compara en **America/Bogota**, no en UTC (R7): una jornada
//    abierta a las 20:00 locales es 01:00 UTC del día siguiente. Con la
//    comparación en UTC, un cierre legítimo de esa jornada se rechazaría y uno
//    del día siguiente se aceptaría — el caso que la fixture de abajo ejercita.
//
// ⚠️ NO va en `describe.serial`. Cada caso abre y cierra SU jornada, y el
//    `afterEach` cierra la que haya quedado abierta: un rojo no puede dejar al
//    siguiente sin poder abrir (hay UNA jornada abierta por sede como máximo).
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
const MOTIVO = 'cierre-con-fecha.spec: reconstrucción de histórico'

let db: SupabaseClient
let SEDE = ''
let PERFIL = ''
let jornada: string | null = null

/** Abre una jornada con `opened_at` en el pasado y devuelve su id. */
async function abrir(opened: string) {
  const { data, error } = await db.from('jornadas')
    .insert({ sede_id: SEDE, opened_by: PERFIL, opening_amount: 0, opened_at: opened })
    .select('id').single()
  if (error) throw new Error('no se pudo abrir la jornada: ' + error.message)
  jornada = data.id
  return data.id as string
}

async function leer(id: string) {
  const { data, error } = await db.from('jornadas').select('opened_at, closed_at, closed_by').eq('id', id).single()
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

  const abierta = await db.from('jornadas').select('id').eq('sede_id', SEDE).is('closed_at', null)
  if (abierta.data?.length) {
    throw new Error(
      'quedó una jornada ABIERTA de otra corrida: este spec necesita abrir las suyas, y sólo ' +
      'puede haber una abierta por sede. Cerrar una ajena dejaría el lab en un estado que nadie eligió',
    )
  }
})

// 🔴 La limpieza es lo que hace que los casos NO sean seriales: un rechazo deja
//    la jornada abierta, y sin esto el caso siguiente no podría abrir la suya.
//
// ⚠️ Y NO usa la RPC que este archivo prueba, aunque sería lo natural. La primera
//    versión sí la usaba, y falló exactamente donde importaba: con la migración
//    sin aplicar la RPC no existe, la limpieza no pudo limpiar, y el guard del
//    `beforeAll` abortó los seis casos siguientes — **el rojo quedó sin decir
//    nada sobre cinco de los seis**.
//    Una limpieza que depende del sujeto no puede limpiar justo cuando el sujeto
//    está roto, que es cuando hace falta. Va por el `update` directo: el trigger
//    le estampa `now()`, y para cerrar una jornada de laboratorio eso alcanza.
test.afterEach(async () => {
  if (!db || !jornada) return
  const f = await db.from('jornadas').select('closed_at').eq('id', jornada).single()
  if (f.data && f.data.closed_at === null) {
    await db.from('jornadas')
      .update({ closed_at: new Date().toISOString(), closed_by: PERFIL, closing_amount: 0 })
      .eq('id', jornada)
  }
  jornada = null
})

// ── EL CASO QUE LA RPC EXISTE PARA HABILITAR ────────────────────────────────
test('cierra con una fecha del MISMO DÍA, y queda esa fecha — no la del sistema', async () => {
  // 20:00 hora local de anteayer: en UTC es del día SIGUIENTE, que es lo que
  // hace que este caso pruebe también la comparación en America/Bogota.
  const abrio = new Date(Date.now() - 2 * DIA)
  abrio.setUTCHours(1, 0, 0, 0)            // 01:00 UTC = 20:00 del día anterior en Bogotá
  const id = await abrir(abrio.toISOString())
  // +2h = 03:00 UTC = 22:00 del MISMO dia local. Con +4h serian las 00:00 del
  // dia siguiente en Bogota, y la RPC lo rechazaria — con razon. La primera
  // version de este caso lo tenia asi y el rojo era CORRECTO: el defecto estaba
  // en la fixture, no en la RPC.
  const cierre = new Date(abrio.getTime() + 2 * 3600 * 1000).toISOString()

  const { error } = await db.rpc('cerrar_jornada_con_fecha', {
    p_jornada_id: id, p_closed_at: cierre, p_motivo: MOTIVO,
  })
  expect(error?.message ?? null, 'la RPC rechazó un cierre legítimo del mismo día').toBeNull()

  const f = await leer(id)
  expect(
    f.closed_at && Math.abs(Date.parse(f.closed_at) - Date.parse(cierre)) < 1000,
    `quedó ${f.closed_at} en vez de ${cierre}: el servidor pisó la fecha pedida, que es ` +
    'justamente lo que esta RPC existe para evitar',
  ).toBe(true)
  expect(f.closed_by, 'no registró quién cerró').toBe(PERFIL)
})

test('deja RASTRO con las dos fechas y el motivo', async () => {
  const abrio = new Date(Date.now() - 3 * DIA)
  abrio.setUTCHours(15, 0, 0, 0)
  const id = await abrir(abrio.toISOString())
  const cierre = new Date(abrio.getTime() + 3600 * 1000).toISOString()
  await db.rpc('cerrar_jornada_con_fecha', { p_jornada_id: id, p_closed_at: cierre, p_motivo: MOTIVO })

  const { data } = await db.from('jornada_cierres_con_fecha')
    .select('closed_at_pedido, closed_at_sistema, motivo, created_by').eq('jornada_id', id)
  expect(data ?? [], 'sin rastro, esta jornada es INDISTINGUIBLE de una cerrada normalmente').toHaveLength(1)
  const r = data![0]
  expect(Math.abs(Date.parse(r.closed_at_pedido) - Date.parse(cierre)) < 1000).toBe(true)
  expect(
    Math.abs(Date.parse(r.closed_at_sistema) - Date.now()) < 5 * 60 * 1000,
    'no guardó la fecha que el sistema HABRÍA puesto: sin ella no se puede decir cuánto se corrió',
  ).toBe(true)
  expect(r.motivo).toBe(MOTIVO)
  expect(r.created_by).toBe(PERFIL)
})

// ── LOS RECHAZOS ────────────────────────────────────────────────────────────
test('🔴 rechaza una fecha de OTRO DÍA — es la validación que sostiene todo', async () => {
  const abrio = new Date(Date.now() - 2 * DIA)
  abrio.setUTCHours(15, 0, 0, 0)
  const id = await abrir(abrio.toISOString())

  const { error } = await db.rpc('cerrar_jornada_con_fecha', {
    p_jornada_id: id, p_closed_at: new Date(abrio.getTime() + DIA).toISOString(), p_motivo: MOTIVO,
  })
  expect(
    error?.message ?? '(no hubo error: el cierre PASÓ)',
    'SE PUDO CERRAR CON FECHA DE OTRO DÍA. Eso es el agujero que la deuda 97 cerró, ' +
    'reabierto por la excepción que existía para no reabrirlo',
  ).toMatch(/MISMO DIA|MISMO DÍA/i)
  expect((await leer(id)).closed_at, 'la jornada quedó cerrada igual').toBeNull()
})

test('🔴 rechaza una fecha FUTURA', async () => {
  const abrio = new Date(Date.now() - DIA)
  abrio.setUTCHours(15, 0, 0, 0)
  const id = await abrir(abrio.toISOString())
  const { error } = await db.rpc('cerrar_jornada_con_fecha', {
    p_jornada_id: id, p_closed_at: new Date(Date.now() + DIA).toISOString(), p_motivo: MOTIVO,
  })
  expect(error?.message ?? '(no hubo error: el cierre PASÓ)', 'aceptó cerrar en el futuro')
    .toMatch(/futura/i)
})

test('🔴 rechaza una fecha ANTERIOR a la apertura', async () => {
  const abrio = new Date(Date.now() - DIA)
  abrio.setUTCHours(15, 0, 0, 0)
  const id = await abrir(abrio.toISOString())
  const { error } = await db.rpc('cerrar_jornada_con_fecha', {
    p_jornada_id: id, p_closed_at: new Date(abrio.getTime() - 3600 * 1000).toISOString(), p_motivo: MOTIVO,
  })
  expect(error?.message ?? '(no hubo error: el cierre PASÓ)', 'aceptó cerrar antes de abrir')
    .toMatch(/POSTERIOR/i)
})

test('🔴 rechaza SIN MOTIVO — el motivo es lo que la hace auditable', async () => {
  const abrio = new Date(Date.now() - DIA)
  abrio.setUTCHours(15, 0, 0, 0)
  const id = await abrir(abrio.toISOString())
  for (const motivo of ['', '   ']) {
    const { error } = await db.rpc('cerrar_jornada_con_fecha', {
      p_jornada_id: id, p_closed_at: new Date(abrio.getTime() + 3600 * 1000).toISOString(), p_motivo: motivo,
    })
    expect(error?.message ?? '(no hubo error: el cierre PASÓ)', `aceptó el motivo ${JSON.stringify(motivo)}`)
      .toMatch(/motivo/i)
  }
})

// ── EL CONTROL · que la excepción no haya aflojado el guard ─────────────────
test('🔴 CONTROL · el update DIRECTO a closed_at sigue rechazado por el trigger', async () => {
  const abrio = new Date(Date.now() - 2 * DIA)
  abrio.setUTCHours(15, 0, 0, 0)
  const id = await abrir(abrio.toISOString())
  const cierre = new Date(abrio.getTime() + 3600 * 1000).toISOString()
  await db.rpc('cerrar_jornada_con_fecha', { p_jornada_id: id, p_closed_at: cierre, p_motivo: MOTIVO })

  // Ya cerrada: moverla por la tabla tiene que seguir fallando igual que antes.
  const { error } = await db.from('jornadas')
    .update({ closed_at: new Date(abrio.getTime() + 7200 * 1000).toISOString() }).eq('id', id)
  expect(
    error?.message ?? '(no hubo error: el update PASÓ)',
    'LA EXCEPCIÓN AFLOJÓ EL GUARD. La RPC tenía que ser la ÚNICA puerta; si el update directo ' +
    'volvió a funcionar, la deuda 97 está reabierta y este spec pasaría igual sin notarlo',
  ).toMatch(/no se puede cambiar/i)

  expect((await leer(id)).closed_at && Math.abs(Date.parse((await leer(id)).closed_at!) - Date.parse(cierre)) < 1000)
    .toBe(true)
})

test('🔴 CONTROL · una jornada YA cerrada no se puede cerrar de nuevo por la RPC', async () => {
  const abrio = new Date(Date.now() - 2 * DIA)
  abrio.setUTCHours(15, 0, 0, 0)
  const id = await abrir(abrio.toISOString())
  const cierre = new Date(abrio.getTime() + 3600 * 1000).toISOString()
  await db.rpc('cerrar_jornada_con_fecha', { p_jornada_id: id, p_closed_at: cierre, p_motivo: MOTIVO })

  const { error } = await db.rpc('cerrar_jornada_con_fecha', {
    p_jornada_id: id, p_closed_at: new Date(abrio.getTime() + 7200 * 1000).toISOString(), p_motivo: MOTIVO,
  })
  expect(
    error?.message ?? '(no hubo error: el cierre PASÓ)',
    'la RPC permitió re-cerrar: sería el mismo agujero con otra puerta',
  ).toMatch(/ya esta cerrada|ya está cerrada/i)
})
