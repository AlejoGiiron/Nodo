import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { ownerCreds } from './helpers/auth'
import { clienteDeServicio } from './helpers/servicio'

// ============================================================================
// ALTA DE USUARIO ENTRE SEDES — deuda 92
//
// 🔴 EL PRODUCTO ES MULTI-SEDE Y SU ALTA DE USUARIOS NO LO ERA. `create-user`
//    recibía `sede_id` pero **para validarlo contra la del llamante**, no como
//    destino: un admin de la sede A no podía dar de alta a nadie en la sede B
//    de su propia organización, aunque tuviera `usuarios.gestionar`.
//
//    Estuvo dormido porque LAB tuvo UNA sola sede desde siempre — igual que la
//    deuda 61. La segunda sede es lo que lo destapa.
//
// ⛔ EL ARREGLO NO FUE AFLOJAR EL GUARD: fue cambiar la PREGUNTA. De «¿es TU
//    sede?» a «¿es una sede de tu organización?».
//
// 🔴 Y POR ESO ESTE SPEC TIENE DOS DIRECCIONES, no una. Medido el 2026-09-04
//    contra la función desplegada: la línea vieja devolvía 403 en los DOS casos
//    —otra sede de mi organización, y sede de otra organización— o sea que
//    **una sola línea hacía los dos trabajos**. Relajarla quita las dos
//    protecciones a la vez, y un spec que sólo probara la primera dirección
//    daría verde sobre un alta cruzada entre tenants.
//
//    Y no hay red debajo: `enforce_profile_organization` NO impide el cruce
//    —deriva la organización DESDE la sede y sólo exige que el par sea
//    coherente— y `handle_new_user` deriva `organization_id` de la sede, así
//    que el par siempre es coherente. Esta función es el único guard.
// ============================================================================

// ⛔ NO va `describe.configure({ mode: 'serial' })`, y es a propósito: en serial
//    el fallo del primero SALTEA a los que siguen — y el que sigue acá es el
//    CONTROL NEGATIVO, el único que impide aflojar de más. Los dos casos son
//    independientes: comparten la fixture del `beforeAll`, no estado entre sí.
//    (Se descubrió en la primera corrida: el rojo de la dirección 1 dejó la 2
//    en «did not run», o sea SIN MEDIR, que es exactamente lo que este spec no
//    puede permitirse.)

function loadEnv(path: string) {
  try {
    for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  } catch { /* ignore */ }
}
loadEnv('.env'); loadEnv('.env.test')

const URL_BASE = process.env.VITE_NODO_SUPABASE_URL!
const ANON = process.env.VITE_NODO_SUPABASE_ANON_KEY!
const SUFFIX = Date.now().toString().slice(-6)
// 🔴 El nombre de la función es un PARÁMETRO para poder correr este spec contra
//    un despliegue de prueba ANTES de publicar sobre el nombre real. Por defecto
//    apunta al real, así que en CI y en la suite normal no cambia nada.
const FUNCION = process.env.E2E_CREATE_USER_FN ?? 'create-user'

let db: SupabaseClient
let comoServicio: SupabaseClient | null = null
let TOKEN = ''
let ORG = ''
let SEDE_PROPIA = ''
let SEDE_HERMANA = ''
let ROL_CAJERO = ''
const creados: string[] = []      // auth users a borrar
const orgsCreadas: string[] = []  // organizaciones desechables

async function alta(sedeId: string, email: string) {
  const r = await fetch(`${URL_BASE}/functions/v1/${FUNCION}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email, password: 'PruebaSede' + SUFFIX, full_name: 'E2E Sede ' + SUFFIX,
      role: 'cashier', role_id: ROL_CAJERO, sede_id: sedeId,
    }),
  })
  return { status: r.status, body: await r.json() as { error?: string; user_id?: string } }
}

test.beforeAll(async () => {
  db = createClient(URL_BASE, ANON, { auth: { persistSession: false } })
  const { data, error } = await db.auth.signInWithPassword(ownerCreds())
  if (error) throw error
  TOKEN = data.session!.access_token
  const perfil = await db.from('profiles')
    .select('sede_id, organization_id').eq('id', data.user!.id).single()
  SEDE_PROPIA = perfil.data!.sede_id as string
  ORG = perfil.data!.organization_id as string

  const hermanas = await db.from('sedes').select('id, name').eq('organization_id', ORG)
  SEDE_HERMANA = (hermanas.data ?? []).find((s) => s.id !== SEDE_PROPIA)?.id ?? ''

  const rol = await db.from('roles').select('id').eq('organization_id', ORG).eq('name', 'cajero').single()
  ROL_CAJERO = rol.data!.id as string

  // 🔴 La key NO se toma de `process.env` acá: se pide por la puerta, con el
  //    motivo declarado. El tripwire `src/lib/arnes-service-role.test.ts` se
  //    pone rojo si algún spec la toma por su cuenta — con service_role las
  //    policies ni se evalúan, así que un atajo deja de medir RLS en silencio.
  comoServicio = clienteDeServicio('crear-organizacion')
})

test.afterAll(async () => {
  if (!comoServicio) return
  for (const id of creados) await comoServicio.auth.admin.deleteUser(id)
  if (orgsCreadas.length) {
    await comoServicio.from('sedes').delete().in('organization_id', orgsCreadas)
    await comoServicio.from('roles').delete().in('organization_id', orgsCreadas)
    await comoServicio.from('organizations').delete().in('id', orgsCreadas)
  }
})

// ── DIRECCIÓN 1 · lo que la deuda venía a habilitar ─────────────────────────
test('🔴 un admin SÍ puede dar de alta en otra sede de SU organización', async () => {
  // La segunda sede es una precondición del ESCENARIO, no del producto: sin
  // ella este caso no puede distinguir nada y tiene que decirlo, no saltarse.
  expect(
    SEDE_HERMANA,
    'la organización del owner necesita DOS sedes para que este caso mida algo. ' +
    'Con una sola, «su sede» y «una sede de su organización» son el mismo conjunto ' +
    '— que es exactamente por lo que esta deuda estuvo dormida.',
  ).not.toBe('')

  const email = `e2e-sede-ok-${SUFFIX}@nodo.test`
  const r = await alta(SEDE_HERMANA, email)
  if (r.body.user_id) creados.push(r.body.user_id)

  expect(
    `${r.status} ${r.body.error ?? 'ok'}`,
    'EL ALTA ENTRE SEDES DE LA MISMA ORGANIZACIÓN SIGUE BLOQUEADA. El producto es ' +
    'multi-sede: un admin con `usuarios.gestionar` tiene que poder crear al cajero ' +
    'de la sede que su organización acaba de abrir, sin mudarse a ella.',
  ).toBe('200 ok')

  // Y nace EN esa sede, no en la del llamante: un 200 que lo cree en la sede
  // equivocada sería peor que el 403.
  const perfil = await db.from('profiles').select('sede_id').eq('id', r.body.user_id!).single()
  expect(
    perfil.data?.sede_id,
    'el usuario se creó, pero NO en la sede pedida — el `sede_id` se ignoró',
  ).toBe(SEDE_HERMANA)
})

// ── DIRECCIÓN 2 · la que impide aflojar de más ──────────────────────────────
//
// ⚠️ SIN ESTE CASO, RELAJAR EL GUARD PASA VERDE. Es el control negativo del
//    arreglo: la dirección 1 sola no distingue «se cambió la pregunta» de «se
//    borró el guard».
test('🔴 un admin NO puede dar de alta en una sede de OTRA organización', async () => {
  // Skip de ENTORNO, no por un atajo roto: hace falta una segunda organización
  // y la única forma de crearla es `onboard_organization`, que es service_role.
  // ⛔ Mientras esté salteado, esta mitad está SIN MEDIR — no en verde.
  test.skip(!comoServicio, 'Requiere E2E_SERVICE_ROLE_KEY para crear una organización desechable')

  const alta_org = await comoServicio!.rpc('onboard_organization', {
    p_org_name: 'E2E OtraOrg ' + SUFFIX,
    p_sede_name: 'E2E OtraOrg Sede ' + SUFFIX,
  })
  expect(alta_org.error, 'no se pudo sembrar la organización ajena').toBeNull()
  const ajena = alta_org.data as { organization_id: string; sede_id: string }
  orgsCreadas.push(ajena.organization_id)

  const r = await alta(ajena.sede_id, `e2e-sede-cruzada-${SUFFIX}@nodo.test`)
  if (r.body.user_id) creados.push(r.body.user_id)

  // 🔴 Se asevera EL MENSAJE, no «que haya error»: el guard de la sede y el del
  //    rol pueden negar el mismo caso, y si contesta el otro, el que estamos
  //    probando no está funcionando.
  expect(
    `${r.status} ${r.body.error ?? 'ok'}`,
    'ALTA CRUZADA ENTRE ORGANIZACIONES. Un admin creó un usuario en el tenant de ' +
    'otro cliente. La base NO lo impide: `handle_new_user` deriva la organización ' +
    'DESDE la sede, así que el par siempre es coherente y ningún trigger se queja.',
  ).toBe('403 Esa sede no pertenece a tu organización')
})
