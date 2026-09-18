import { test, expect } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { ownerCreds } from './helpers/auth'
import { clienteDeServicio } from './helpers/servicio'

// ============================================================================
// DEUDA 114 · TANDA A — borrar una sede NO se lleva a quien tiene acceso a ella
//
// 🔴 ESTE ARCHIVO NACE ROJO, Y ESE ES EL RESULTADO ESPERADO.
//    Contra el esquema de HOY, borrar una sede con un perfil apuntándole
//    **funciona**: `profiles.sede_id` es `on delete cascade`, así que el perfil
//    se va con ella. La migración `20260916120000` es la que lo cambia. O sea
//    que el rojo de antes no es un defecto: es la medición del estado que la
//    tanda viene a mover.
//
// ✅ POR QUÉ EL ORDEN DE LAS ASERCIONES NO ES ESTÉTICO, y es la parte que
//    decide si el rojo sirve:
//
//      ① EL SUJETO primero  → «la sede se borró y SE LLEVÓ el perfil»
//      ② la razón después   → `23503`, y que el mensaje NOMBRE la tabla
//
//    Invertido, el rojo de hoy diría `expected undefined to be '23503'` — cierto
//    y mudo. No nombra lo único que pasó, que es que un perfil desapareció.
//    (CLAUDE.md: «el sujeto va primero, el control después».)
//
// 🔴 Y EL 23503 SOLO NO ALCANZA, POR UNA RAZÓN QUE ANTES NO EXISTÍA: ya no son
//    dos mecanismos capaces de negar, son CUATRO. Después de la tanda A hay
//    TRES FK que pueden levantar 23503 sobre un borrado de sede —`profiles`,
//    `user_stores` y `cash_movements`— más RLS con su `count 0 / error null`.
//    Un caso que creara sede + perfil + movimiento y asevera «23503» **no diría
//    cuál negó**. Por eso cada caso crea ÚNICAMENTE el hijo que mide, lo
//    asevera en el montaje, y exige que el mensaje nombre SU tabla.
//
// ⚠️ NO VA EN `describe.serial`, a propósito. El caso ③ es el control que
//    distingue «la FK niega» de «no se puede borrar nada nunca»; ① nace rojo, y
//    en serial ③ quedaría en `did not run` — el control desaparecido por el
//    fallo del caso que venía a controlar, que es un caso ya medido en este
//    proyecto.
//
// ⚠️ NO ES DESTRUCTIVO: la sede, el perfil y el acceso los crea cada caso. Si la
//    FK no frenara, lo que el cascade se llevaría son filas que el caso acaba de
//    crear. Sobre una sede REAL sería inaceptable — sería seguro justo cuando no
//    hace falta y destructivo cuando encontraría algo.
// ============================================================================

let db: SupabaseClient
let admin: SupabaseClient | null = null
let ORG = ''
let MI_SEDE = ''
let MI_UID = ''

const SUF = Math.floor(Math.random() * 900000 + 100000)

// Lo creado, para que la limpieza sepa qué sacar. Se rastrea SIEMPRE, incluso
// cuando el caso va a fallar: la limpieza corre en `afterAll` justamente para
// que el rojo de un caso no le impida limpiar.
const sedesCreadas: string[] = []
const usuariosCreados: string[] = []
const accesosCreados: Array<{ user: string; sede: string }> = []

test.beforeAll(async () => {
  db = createClient(process.env.VITE_NODO_SUPABASE_URL!, process.env.VITE_NODO_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  })
  const { error } = await db.auth.signInWithPassword(ownerCreds())
  if (error) throw error
  MI_UID = (await db.auth.getUser()).data.user!.id
  const p = await db.from('profiles').select('sede_id, organization_id').eq('id', MI_UID).single()
  if (p.error) throw p.error
  MI_SEDE = p.data.sede_id as string
  ORG = p.data.organization_id as string

// 🔴 SUJETO, no atajo: el caso mide la FK, y RLS niega ANTES de que la FK
//    hable. Los dos rechazos se distinguen por la respuesta -- RLS da
//    `count 0` con error null; la FK da `23503`-- y sin saltear RLS el caso
//    no llega a preguntarle a la FK.
  admin = clienteDeServicio('medir-fk')
})

// ── LA LIMPIEZA ─────────────────────────────────────────────────────────────
// 🔴 ASEVERA EL ESTADO, NO LA OPERACIÓN. «La sede ya no existe» cierra en los
//    dos mundos: antes de la migración el propio caso se la llevó, después la
//    saca esta limpieza. «El delete borró 1» sería falso en el primero.
//    Y una limpieza SIN aserción es la única parte del arnés que puede dejar de
//    funcionar sin que nada se ponga rojo — ya nos costó sedes huérfanas.
test.afterAll(async () => {
  if (!admin) return

  // 1 · las cuentas de Auth: arrastran su perfil y sus accesos por FK que esta
  //     tanda NO toca (profiles.id -> auth.users, user_stores.user_id -> profiles)
  for (const id of usuariosCreados) await admin.auth.admin.deleteUser(id)

  // 2 · los accesos creados a mano sobre cuentas AJENAS (la del owner), que no
  //     se pueden borrar por el paso 1 — el owner no es nuestro para borrarlo
  for (const a of accesosCreados) {
    const r = await admin.from('user_stores').delete({ count: 'exact' })
      .eq('user_id', a.user).eq('sede_id', a.sede)
    expect(
      r.error?.message ?? 'sin error',
      `NO SE PUDO SACAR EL ACCESO ${a.user} -> ${a.sede}: sin esto la sede queda ` +
      'imposible de borrar y el lab acumula residuo por corrida',
    ).toBe('sin error')
  }

  // 3 · las sedes, y la comprobación es que NO QUEDEN
  const quedaron: string[] = []
  for (const id of sedesCreadas) {
    await admin.from('sedes').delete().eq('id', id)
    const r = await admin.from('sedes').select('id', { count: 'exact', head: true }).eq('id', id)
    if ((r.count ?? 0) > 0) quedaron.push(id)
  }
  expect(
    quedaron,
    `QUEDARON SEDES HUÉRFANAS EN EL LAB: ${quedaron.join(', ')}. La limpieza no ` +
    'pudo borrarlas — probablemente algo quedó apuntándoles. Una limpieza que no ' +
    'asevera es la única parte del arnés que deja de funcionar en verde.',
  ).toEqual([])
})

/** Crea una sede vacía en MI organización y la deja rastreada para la limpieza. */
async function crearSede(rotulo: string): Promise<string> {
  const r = await admin!.from('sedes')
    .insert({ name: `E2E FK ${rotulo} ${SUF}`, organization_id: ORG })
    .select('id').single()
  expect(r.error?.message ?? 'sin error', 'el montaje tiene que poder crear la sede').toBe('sin error')
  const id = r.data!.id as string
  sedesCreadas.push(id)
  return id
}

/** Cuenta filas de `tabla` que apuntan a esa sede. Sirve de montaje Y de sujeto. */
async function hijasEn(tabla: string, sede: string): Promise<number> {
  const r = await admin!.from(tabla).select('*', { count: 'exact', head: true }).eq('sede_id', sede)
  // 🔴 `count: null` NO es cero: es que la tabla no está en el cache de esquema.
  //    Tratarlo como cero convertiría un hueco en un verde.
  expect(r.count, `no se pudo contar ${tabla} para la sede ${sede} — count null no es cero`)
    .not.toBeNull()
  return r.count ?? -1
}

// ── ① PERFILES ──────────────────────────────────────────────────────────────
test('① una sede con un PERFIL apuntándole no se puede borrar, y niega la FK de profiles', async () => {
  test.skip(!admin, 'Requiere E2E_SERVICE_ROLE_KEY: el caso mide la FK, así que tiene que saltear RLS')

  const sede = await crearSede('Perfil')

  // El perfil lo crea el trigger `handle_new_user` a partir del metadata. Es el
  // camino real, no un insert a mano — y de paso ejercita el trigger.
  const cuenta = await admin!.auth.admin.createUser({
    email: `e2e-fk-perfil-${SUF}@nodo.test`,
    password: `E2E-fk-${SUF}`,
    email_confirm: true,
    user_metadata: { full_name: 'E2E FK Perfil', role: 'cashier', sede_id: sede },
  })
  expect(cuenta.error?.message ?? 'sin error', 'el montaje tiene que poder crear la cuenta').toBe('sin error')
  usuariosCreados.push(cuenta.data.user!.id)

  // 🔴 MONTAJE ASEVERADO: que el ÚNICO hijo de esta sede sea el perfil. Con tres
  //    FK capaces de levantar 23503, un caso que no lo compruebe no sabe a quién
  //    le está atribuyendo el rechazo.
  expect(await hijasEn('profiles', sede), 'el montaje necesita exactamente un perfil').toBe(1)
  expect(
    await hijasEn('user_stores', sede),
    'el montaje necesita CERO accesos: si `handle_new_user` empezara a escribir ' +
    '`user_stores`, el 23503 podría venir de la otra FK y este caso lo atribuiría mal',
  ).toBe(0)
  expect(await hijasEn('cash_movements', sede), 'y cero movimientos de caja').toBe(0)

  const borrado = await admin!.from('sedes').delete({ count: 'exact' }).eq('id', sede)

  // ① EL SUJETO PRIMERO — es la aserción que NOMBRA lo que pasa hoy.
  expect(
    await hijasEn('profiles', sede),
    'LA SEDE SE BORRÓ Y SE LLEVÓ EL PERFIL EN CASCADA. Borrar una sede está ' +
    'retirándole el acceso a una persona como efecto colateral, sin que nadie lo ' +
    'haya decidido. Eso es lo que la tanda A de la deuda 114 viene a cerrar.',
  ).toBe(1)

  // ② Y RECIÉN AHORA, que haya negado POR LA RAZÓN CORRECTA.
  expect(
    (borrado.error as { code?: string } | null)?.code ?? 'ninguno',
    'la sede no se borró, pero el rechazo NO fue una violación de clave foránea. ' +
    'Si lo negó otra cosa —RLS, un trigger—, este caso no está midiendo la FK',
  ).toBe('23503')

  expect(
    borrado.error?.message ?? '',
    'el 23503 tiene que nombrar a `profiles`: con tres FK en NO ACTION apuntando a ' +
    '`sedes`, un 23503 sin sujeto no dice cuál de las tres negó',
  ).toContain('profiles')
})

// ── ② ACCESOS ───────────────────────────────────────────────────────────────
test('② una sede con un ACCESO apuntándole no se puede borrar, y niega la FK de user_stores', async () => {
  test.skip(!admin, 'Requiere E2E_SERVICE_ROLE_KEY: el caso mide la FK, así que tiene que saltear RLS')

  const sede = await crearSede('Acceso')

  // El acceso se le da al OWNER, cuyo perfil apunta a SU sede — no a ésta. Así
  // la única fila que apunta a la sede nueva es la de `user_stores`, y el 23503
  // no puede venir de `profiles`.
  const acc = await admin!.from('user_stores').insert({ user_id: MI_UID, sede_id: sede })
  expect(acc.error?.message ?? 'sin error', 'el montaje tiene que poder crear el acceso').toBe('sin error')
  accesosCreados.push({ user: MI_UID, sede })

  expect(await hijasEn('user_stores', sede), 'el montaje necesita exactamente un acceso').toBe(1)
  expect(
    await hijasEn('profiles', sede),
    'el montaje necesita CERO perfiles apuntando a esta sede: el owner apunta a la ' +
    'suya, y si apuntara acá el 23503 vendría de la otra FK',
  ).toBe(0)
  // Y la premisa de la que depende ese cero, dicha en voz alta: si el owner se
  // mudara a la sede nueva, este caso pasaría a medir la FK de `profiles` sin
  // que nada lo indique.
  const yo = await admin!.from('profiles').select('sede_id').eq('id', MI_UID).single()
  expect(
    yo.data?.sede_id,
    'el owner tiene que seguir apuntando a SU sede: es lo que deja a `user_stores` ' +
    'como único acusado del 23503',
  ).toBe(MI_SEDE)

  const borrado = await admin!.from('sedes').delete({ count: 'exact' }).eq('id', sede)

  // ① EL SUJETO PRIMERO.
  expect(
    await hijasEn('user_stores', sede),
    'LA SEDE SE BORRÓ Y SE LLEVÓ EL ACCESO EN CASCADA. Retirarle a alguien una ' +
    'sede de su lista está ocurriendo como efecto colateral de borrar la sede.',
  ).toBe(1)

  // ② LA RAZÓN DESPUÉS.
  expect(
    (borrado.error as { code?: string } | null)?.code ?? 'ninguno',
    'la sede no se borró, pero el rechazo no fue una violación de clave foránea',
  ).toBe('23503')

  expect(
    borrado.error?.message ?? '',
    'el 23503 tiene que nombrar a `user_stores`, no a otra de las tres FK en NO ACTION',
  ).toContain('user_stores')
})

// ── ③ EL CONTROL, y sin él los dos de arriba no significan nada ─────────────
test('③ una sede SIN nada apuntándole SÍ se borra — o los dos casos de arriba pasan por otra razón', async () => {
  test.skip(!admin, 'Requiere E2E_SERVICE_ROLE_KEY')

  // 🔴 POR QUÉ ESTE CASO EXISTE: si alguien pusiera las 18 FK en `restrict`, o
  //    le revocara el DELETE a `service_role`, ① y ② seguirían VERDES — estarían
  //    midiendo «no se puede borrar nada» en vez de «esta FK restringe». Este
  //    caso es lo único que separa las dos lecturas.
  const sede = await crearSede('Vacia')

  for (const t of ['profiles', 'user_stores', 'cash_movements']) {
    expect(await hijasEn(t, sede), `la sede del control tiene que nacer sin ${t}`).toBe(0)
  }

  const borrado = await admin!.from('sedes').delete({ count: 'exact' }).eq('id', sede)

  expect(
    borrado.error?.message ?? 'sin error',
    'borrar una sede VACÍA salteando RLS tiene que seguir funcionando. Si esto ' +
    'falla, los casos ① y ② están verdes porque NADA se puede borrar, y no ' +
    'porque la FK que dicen medir esté restringiendo',
  ).toBe('sin error')

  expect(borrado.count, 'y tiene que haber borrado exactamente esa fila').toBe(1)
})
