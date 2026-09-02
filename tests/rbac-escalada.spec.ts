import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { ownerCreds, cashierCreds } from './helpers/auth'

// ============================================================================
// RBAC — escalada por auto-edición de profiles (trigger
// protect_profile_self_escalation, migración protect-profile-self-escalation.sql)
//
// ⚠️  REQUIERE la migración P1 APLICADA en LAB. Sin ella los 3 casos "DEBE
//     FALLAR" fallan (que es exactamente lo que el spec denuncia).
//
// Todo por Supabase directo con SESIÓN DE USUARIO REAL (anon key + login), NO
// service role: el trigger solo muerde con current_user = 'authenticated', que
// es lo que hace PostgREST. Desde el SQL Editor (postgres) se saltea por diseño
// y daría un falso negativo.
//
// Serial y con red de seguridad: beforeAll captura el estado de los perfiles
// tocados y afterAll lo restaura SIEMPRE con el cliente owner. Un fallo a mitad
// no puede dejar al cajero del lab desactivado ni con el rol cambiado.
// ============================================================================

test.describe.configure({ mode: 'serial' })

// ── Supabase directo (misma convención que anular-venta.spec.ts) ─────────────
function loadEnv(path: string) {
  try {
    for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  } catch { /* ignore */ }
}
loadEnv('.env'); loadEnv('.env.test')

const anon = () =>
  createClient(process.env.VITE_NODO_SUPABASE_URL!, process.env.VITE_NODO_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  })

async function signIn(creds: { email: string; password: string }): Promise<SupabaseClient> {
  const c = anon()
  const { error } = await c.auth.signInWithPassword(creds)
  if (error) throw error
  return c
}

type ProfileSnap = {
  id: string
  role: string
  role_id: string | null
  organization_id: string | null
  sede_id: string
  full_name: string
  is_active: boolean
}

const SNAP_COLS = 'id, role, role_id, organization_id, sede_id, full_name, is_active'

let owner: SupabaseClient
let cajero: SupabaseClient
let ownerSnap: ProfileSnap
let cajeroSnap: ProfileSnap

// 🔴 SEGUNDA SEDE, creada por el propio spec (deuda 61). El caso "cambio de
//    sede activa" estaba `test.skip` porque el lab tiene UNA sede — y ése era
//    justamente el motivo por el que el hueco no se veía: con una sola sede,
//    `sede_id` no tiene a dónde ir. La fixture la crea acá y `afterAll` la
//    borra, así el spec deja de depender de la forma del lab.
const SUFFIX_61 = Date.now().toString().slice(-6)
let SEDE_B = ''          // en la MISMA organización (si no, enforce_profile_organization rechaza)
let US_OWNER_B = false   // el owner SÍ la tiene en user_stores; el cajero NO

/** Lee un perfil con el cliente owner (ve toda la sede por RLS). */
async function readProfile(id: string): Promise<ProfileSnap> {
  const { data, error } = await owner.from('profiles').select(SNAP_COLS).eq('id', id).single()
  if (error) throw error
  return data as ProfileSnap
}

/** Restaura un perfil a su snapshot. Idempotente. */
async function restore(snap: ProfileSnap): Promise<void> {
  await owner
    .from('profiles')
    .update({
      role: snap.role,
      role_id: snap.role_id,
      organization_id: snap.organization_id,
      sede_id: snap.sede_id,
      full_name: snap.full_name,
      is_active: snap.is_active,
    })
    .eq('id', snap.id)
}

/**
 * Un UPDATE está BLOQUEADO si devolvió error (trigger / RLS) o si no afectó
 * ninguna fila. Se usa .select() para distinguir "0 filas" de "ok": sin él,
 * PostgREST no reporta error cuando la RLS deja el UPDATE en cero filas.
 */
function bloqueado(res: { error: unknown; data: unknown[] | null }): boolean {
  return !!res.error || (res.data ?? []).length === 0
}

/**
 * Los 3 casos rojos deben ser rechazados por el TRIGGER, con su mensaje — NO
 * por la RLS dejando el UPDATE en cero filas. La distinción importa: un rechazo
 * por RLS sería verde por la razón equivocada y dejaría de medir el trigger
 * (mismo patrón que mordió en anular-venta:279). Por eso se exige `error` con
 * el texto del raise, no el `bloqueado()` laxo.
 */
function expectRechazoDelTrigger(
  res: { error: { message: string } | null; data: unknown[] | null },
  mensaje: RegExp,
): void {
  expect(
    res.error,
    'debía rechazar el TRIGGER (con mensaje); si es null, lo frenó la RLS con cero filas',
  ).not.toBeNull()
  expect(res.error!.message).toMatch(mensaje)
}

test.beforeAll(async () => {
  owner = await signIn(ownerCreds())
  cajero = await signIn(cashierCreds())

  const ownerId = (await owner.auth.getUser()).data.user!.id
  const cajeroId = (await cajero.auth.getUser()).data.user!.id
  ownerSnap = await readProfile(ownerId)
  cajeroSnap = await readProfile(cajeroId)

  const sb = await owner
    .from('sedes')
    .insert({ organization_id: ownerSnap.organization_id!, name: `E2E Sede B ${SUFFIX_61}` })
    .select('id')
    .single()
  if (sb.error) throw new Error(`[61] no se pudo crear la sede B: ${sb.error.message}`)
  SEDE_B = sb.data.id as string

  // Al OWNER se le asigna: es la precondición del caso que DEBE pasar.
  // Al CAJERO no: es la precondición del caso que DEBE fallar.
  const us = await owner.from('user_stores').insert({ user_id: ownerSnap.id, sede_id: SEDE_B }).select('user_id')
  if (us.error) throw new Error(`[61] no se pudo asignar la sede B al owner: ${us.error.message}`)
  US_OWNER_B = true
})

test.afterAll(async () => {
  // Red de seguridad: pase lo que pase, el lab queda como estaba. Los perfiles
  // PRIMERO — si alguno quedó apuntando a la sede B, borrarla antes fallaría por
  // la FK y dejaría al usuario en una sede que ya no existe.
  if (owner && cajeroSnap) await restore(cajeroSnap)
  if (owner && ownerSnap) await restore(ownerSnap)
  if (owner && SEDE_B) {
    if (US_OWNER_B) await owner.from('user_stores').delete().eq('user_id', ownerSnap.id).eq('sede_id', SEDE_B)
    await owner.from('sedes').delete().eq('id', SEDE_B)
  }
})

// ── DEBEN FALLAR ────────────────────────────────────────────────────────────

test('el cajero NO puede auto-asignarse el role_id del owner de su org', async () => {
  // Materia prima de la escalada: la policy "roles: ver los de la org" deja al
  // cajero LEER el id del rol owner. Se asserta a propósito — documenta por qué
  // el trigger es necesario: el atacante no necesita conocimiento externo.
  // OJO: `permissions` es jsonb, no un array de Postgres. El filtro de
  // contención va como JSON string ('["*"]'); pasar ['*'] lo serializa como
  // array PG ({*}) y Postgres responde 22P02 'Token "*" is invalid'.
  const { data: ownerRole, error: readErr } = await cajero
    .from('roles')
    .select('id, name, permissions')
    .contains('permissions', '["*"]')
    .limit(1)
    .single()
  expect(readErr, 'el cajero debería poder leer los roles de su org (expectativa actual)').toBeNull()
  expect(ownerRole!.id).toBeTruthy()
  expect(ownerRole!.id).not.toBe(cajeroSnap.role_id)

  const res = await cajero
    .from('profiles')
    .update({ role_id: ownerRole!.id })
    .eq('id', cajeroSnap.id)
    .select(SNAP_COLS)

  expectRechazoDelTrigger(res, /No podes cambiar tu propio rol/i)

  // Lo que importa: el estado persistido no cambió.
  const after = await readProfile(cajeroSnap.id)
  expect(after.role_id).toBe(cajeroSnap.role_id)
})

test('el cajero NO puede cambiar su propio organization_id (aislamiento multi-tenant)', async () => {
  const otraOrg = crypto.randomUUID()

  const res = await cajero
    .from('profiles')
    .update({ organization_id: otraOrg })
    .eq('id', cajeroSnap.id)
    .select(SNAP_COLS)

  // DOS triggers lo rechazan y cualquiera de los dos es válido; lo que NO se
  // acepta es un bloqueo sin mensaje (RLS con cero filas). Gana el que dispare
  // primero, y los BEFORE ROW van por orden alfabético de nombre:
  // 'trg_profiles_org_consistency' < 'trg_protect_profile_self_escalation',
  // así que hoy contesta el del invariante de organización. No se fija el orden
  // a propósito: el invariante VALIDA en vez de forzar justamente para que el
  // rechazo no dependa de quién corra primero.
  expectRechazoDelTrigger(
    res,
    /No podes cambiar tu propia organizacion|no corresponde a la organizacion de su sede/i,
  )

  const after = await readProfile(cajeroSnap.id)
  expect(after.organization_id).toBe(cajeroSnap.organization_id)
})

test('un usuario desactivado NO puede auto-reactivarse', async () => {
  // El owner desactiva al cajero (fila ajena → el trigger no aplica, la policy
  // "admin edita cualquiera" sí). Esto DEBE funcionar.
  const off = await owner
    .from('profiles')
    .update({ is_active: false })
    .eq('id', cajeroSnap.id)
    .select(SNAP_COLS)
  expect(bloqueado(off), 'el owner debe poder desactivar a un empleado').toBe(false)
  expect((await readProfile(cajeroSnap.id)).is_active).toBe(false)

  // Sesión nueva del desactivado: auth.users está intacto, el login sigue
  // funcionando (por eso hacen falta el chequeo en login y el baneo, que van en
  // la pasada de app). Lo que NO debe poder es reactivarse.
  const desactivado = await signIn(cashierCreds())
  const res = await desactivado
    .from('profiles')
    .update({ is_active: true })
    .eq('id', cajeroSnap.id)
    .select(SNAP_COLS)

  // 🔴 REESCRITO el 2026-09-01 — el rechazo es MUDO, y queda dicho.
  //
  //    La versión anterior EXIGÍA el mensaje del trigger. Verificado con sonda
  //    SQL contra la base real: `filas_afectadas=0, sin excepción` — el trigger
  //    protect_profile_self_escalation EXISTE y su mensaje también, pero nunca
  //    dispara: P2 hace que un desactivado pierda get_my_organization_id(), la
  //    policy de SELECT le oculta SU PROPIA fila, y el UPDATE escanea 0 filas.
  //    Mismo comportamiento en Vento (la forma de policies+funciones es
  //    idéntica): NO es un hueco de consolidación, es P2 silenciando al trigger
  //    en los dos repos.
  //
  //    Para el MVP alcanza: es fail-closed. Pero es INDISTINGUIBLE de "el perfil
  //    no existe" — 0 filas sin error—, y para un usuario desactivado POR ERROR
  //    que no entiende por qué nada le funciona, callar no alcanza. Deuda #39.
  expect(res.error, 'el rechazo es MUDO: la RLS filtra la fila, sin error').toBeNull()
  expect(res.data ?? [], 'cero filas: la RLS ocultó el propio perfil').toHaveLength(0)
  expect((await readProfile(cajeroSnap.id)).is_active).toBe(false)

  // Restaura ya (no espera al afterAll: los tests siguientes usan al cajero).
  await restore(cajeroSnap)
  expect((await readProfile(cajeroSnap.id)).is_active).toBe(true)
})

// ── DEBEN PASAR ─────────────────────────────────────────────────────────────

test('cambio de sede activa: update de una sola columna sede_id', async () => {
  // Flujo real del StoreSelector (StoreSelector.tsx:43-46).
  // ✅ SIN `test.skip` desde el 2026-09-02 (deuda 61): la sede B la crea la
  //    fixture y se le asigna al owner en `user_stores`. Estaba apagado porque
  //    el lab tiene una sola sede, que es exactamente la razón por la que el
  //    hueco de la 61 no se veía — "no va a fallar por uso; va a fallar el día
  //    que abran la segunda sede".
  const { data: sedes } = await owner
    .from('user_stores')
    .select('sede_id')
    .eq('user_id', ownerSnap.id)

  const otra = (sedes ?? []).map((s) => s.sede_id).find((r) => r !== ownerSnap.sede_id)
  expect(otra, 'la fixture asignó la sede B al owner').toBe(SEDE_B)

  const res = await owner
    .from('profiles')
    .update({ sede_id: otra! })
    .eq('id', ownerSnap.id)
    .select(SNAP_COLS)

  expect(bloqueado(res), 'el cambio de sede activa NO debe verse afectado por el trigger').toBe(false)
  expect((await readProfile(ownerSnap.id)).sede_id).toBe(otra)

  // Vuelve a la sede original: el resto de la suite asume la sede por defecto.
  await restore(ownerSnap)
  expect((await readProfile(ownerSnap.id)).sede_id).toBe(ownerSnap.sede_id)
})

test('el cajero NO puede trasladarse a una sede que no tiene asignada', async () => {
  // 🔴 EL HUECO DE LA DEUDA 61, medido en A2 §4: la policy "profiles: editar el
  //    propio" permite el UPDATE y el trigger no miraba `sede_id`, así que el
  //    cajero se mudaba solo a cualquier sede de su organización — y la RLS lo
  //    seguía: acto seguido leía los productos de esa sede. La restricción
  //    "solo a una sede de user_stores" vivía ÚNICAMENTE en `StoreSelector.tsx`.
  //    Misma clase que la deuda 42: la UI ocupando el lugar de la autorización.
  expect(SEDE_B, 'precondición: existe la sede B').toBeTruthy()
  const asignadas = await cajero.from('user_stores').select('sede_id').eq('user_id', cajeroSnap.id)
  expect(
    (asignadas.data ?? []).map((r) => r.sede_id),
    'precondición: el cajero NO tiene la sede B asignada',
  ).not.toContain(SEDE_B)

  const res = await cajero
    .from('profiles')
    .update({ sede_id: SEDE_B })
    .eq('id', cajeroSnap.id)
    .select(SNAP_COLS)

  // Se exige EL MENSAJE DEL GUARD, no "que falle": el criterio que salió de la
  // deuda 60 (un test de negación tiene que negar por la razón correcta). Acá
  // hay dos formas de fallar que se ven iguales desde afuera — el trigger de
  // consistencia de organización también podría rechazar un `sede_id` ajeno —,
  // y la que se está probando es la de pertenencia. Y el mensaje dice LA ACCIÓN.
  // El acento va tolerado: los mensajes SQL del repo se escriben SIN acentos
  // (0 de 0 los llevan, medido), y el test no debe depender de esa ortografía.
  expectRechazoDelTrigger(res, /esa sede no est. asignada a tu usuario/i)

  const after = await readProfile(cajeroSnap.id)
  expect(after.sede_id, 'el traslado no se persistió').toBe(cajeroSnap.sede_id)
})

test('el owner SÍ puede trasladarse a una sede que tiene asignada (control negativo)', async () => {
  // Sin esto, el caso de arriba pasaría también con un trigger que rechace TODO
  // cambio de sede — y eso rompería el StoreSelector, que es una función del
  // producto. El positivo ya está cubierto por "cambio de sede activa"; este lo
  // deja explícito al lado del negativo, que es donde se lee.
  const res = await owner
    .from('profiles')
    .update({ sede_id: SEDE_B })
    .eq('id', ownerSnap.id)
    .select(SNAP_COLS)

  expect(bloqueado(res), 'el owner tiene la sede B en user_stores: debe poder').toBe(false)
  expect((await readProfile(ownerSnap.id)).sede_id).toBe(SEDE_B)

  await restore(ownerSnap)
  expect((await readProfile(ownerSnap.id)).sede_id).toBe(ownerSnap.sede_id)
})

test('el usuario puede editar su propio full_name', async () => {
  const nuevo = `Cajero Lab ${Date.now().toString().slice(-6)}`

  const res = await cajero
    .from('profiles')
    .update({ full_name: nuevo })
    .eq('id', cajeroSnap.id)
    .select(SNAP_COLS)

  expect(bloqueado(res), 'editar el propio nombre debe seguir permitido').toBe(false)
  expect((await readProfile(cajeroSnap.id)).full_name).toBe(nuevo)

  await restore(cajeroSnap)
  expect((await readProfile(cajeroSnap.id)).full_name).toBe(cajeroSnap.full_name)
})

test('el admin puede asignar role_id a OTRO usuario de su sede', async () => {
  // El trigger solo evalúa new.id = auth.uid(); sobre filas ajenas ni se dispara.
  // Un fallo acá apunta al gate legacy get_my_role() = 'admin' de la policy
  // "profiles: admin edita cualquiera", NO al trigger.
  const { data: roles } = await owner
    .from('roles')
    .select('id, name, permissions')
    .eq('organization_id', ownerSnap.organization_id!)

  const otroRol = (roles ?? []).find(
    (r) => r.id !== cajeroSnap.role_id && !JSON.stringify(r.permissions).includes('"*"'),
  )
  expect(otroRol, 'el lab necesita ≥2 roles no-owner en la org').toBeTruthy()

  const res = await owner
    .from('profiles')
    .update({ role_id: otroRol!.id })
    .eq('id', cajeroSnap.id)
    .select(SNAP_COLS)

  expect(bloqueado(res), 'asignar rol a un empleado debe seguir funcionando').toBe(false)
  expect((await readProfile(cajeroSnap.id)).role_id).toBe(otroRol!.id)

  await restore(cajeroSnap)
  expect((await readProfile(cajeroSnap.id)).role_id).toBe(cajeroSnap.role_id)
})

// ── Capa de APP (UX del desactivado) ────────────────────────────────────────

test('el desactivado NO entra: la sesión se corta con mensaje', async ({ page }) => {
  // Server-side el acceso ya está cerrado (P2): get_my_sede_id() devuelve
  // null y la RLS no da ni una fila. Sin este chequeo el usuario entraba igual y
  // veía la app EN BLANCO, sin explicación. Esto verifica la capa de UX.
  const off = await owner
    .from('profiles')
    .update({ is_active: false })
    .eq('id', cajeroSnap.id)
    .select(SNAP_COLS)
  expect(bloqueado(off), 'el owner debe poder desactivar a un empleado').toBe(false)

  try {
    const { email, password } = cashierCreds()
    await page.goto('/login')
    await page.locator('input[autocomplete="email"]').fill(email)
    await page.locator('input[autocomplete="current-password"]').fill(password)
    await page.getByRole('button', { name: 'Ingresar' }).click()

    // El login de auth SÍ funciona (auth.users está intacto: el baneo sigue
    // pendiente). Lo que corta es AuthContext al leer el profile inactivo.
    await expect(
      page.getByText('Tu usuario está desactivado. Contactá al administrador.'),
    ).toBeVisible({ timeout: 15_000 })

    // Y no queda dentro de la app.
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 })
  } finally {
    await restore(cajeroSnap)
  }
  expect((await readProfile(cajeroSnap.id)).is_active).toBe(true)
})

test('Configuración: el toggle de is_active NO se ofrece en la fila propia', async ({ page }) => {
  // El trigger rechaza la auto-desactivación, así que ofrecer el botón solo
  // producía el toast genérico de error. Las filas ajenas lo conservan.
  const { email, password } = ownerCreds()
  await page.goto('/login')
  await page.locator('input[autocomplete="email"]').fill(email)
  await page.locator('input[autocomplete="current-password"]').fill(password)
  await page.getByRole('button', { name: 'Ingresar' }).click()
  await expect(page).toHaveURL(/\/ventas/, { timeout: 15_000 })

  await page.goto('/configuracion')
  await page.getByRole('button', { name: 'Usuarios' }).click()
  await expect(page.getByRole('heading', { name: 'Usuarios', exact: true })).toBeVisible()

  // Exactamente una fila (la propia) sin toggle...
  await expect(page.getByTestId('user-toggle-self')).toHaveCount(1)
  // ...y al menos una fila ajena que sí lo tiene (cajero.test).
  expect(await page.getByTitle(/^(Desactivar|Activar)$/).count()).toBeGreaterThan(0)
})
