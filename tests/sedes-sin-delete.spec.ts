import { test, expect } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { ownerCreds } from './helpers/auth'

// ============================================================================
// `sedes` NO SE PUEDE BORRAR — y el rechazo tiene que venir de RLS
//
// 🔴 LA PRIMERA VERSIÓN DE ESTE ARCHIVO ESTABA VERDE **ANTES** DE APLICAR LA
//    MIGRACIÓN, y eso es un verde falso. Lo frenaba una CLAVE FORÁNEA, no RLS:
//    de las 18 FK que apuntan a `sedes`, diecisiete son `on delete cascade` y
//    **una no** —`cash_movements.sede_id`, que quedó en `NO ACTION`—, así que
//    restringe el borrado de cualquier sede con un movimiento de caja. Medido
//    el 2026-09-15: las cuatro sedes que existen hoy tienen movimientos.
//
//    La aserción era `count === 0`, y **un cero no distingue «RLS lo rechazó»
//    de «la FK lo bloqueó»**.
//
// ✅ LOS DOS CASOS QUE SÍ DISCRIMINAN, y son las dos direcciones:
//
//    ① una sede SIN movimientos → la FK no interviene y **RLS es lo único que
//      puede negar**. Es además la única ventana donde el agujero de la deuda
//      103 estaba de verdad abierto.
//    ② una sede CON movimientos, borrada **salteando RLS** → tiene que negar la
//      FK. Sin este caso, ① sola no prueba que la FK siga sosteniendo lo que
//      sostiene sin que nadie lo haya decidido (deuda 114).
//
// 🔴 Y EL DISCRIMINADOR ES QUE LOS DOS RECHAZOS NO SE PARECEN — que es lo que
//    le faltaba a la versión vieja:
//
//      RLS niega  →  `count: 0`  y  **error null**   (no hay fila que matchear)
//      la FK niega →  **error con code `23503`**      (violación de FK)
//
//    Por eso ① asevera que el código NO sea 23503 y ② que SÍ lo sea. Si los dos
//    dieran lo mismo, el spec seguiría sin discriminar y estaría rojo.
//
// ⚠️ POR QUÉ ② NO ES DESTRUCTIVO, que es lo que lo hacía parecer imposible: la
//    sede, la jornada y el movimiento los crea **el propio caso**. Si la FK no
//    estuviera, lo que el cascade se llevaría son esas mismas filas. Intentarlo
//    sobre una sede REAL sí sería inaceptable — sería seguro exactamente cuando
//    no hace falta y destructivo cuando encontraría algo.
// ============================================================================

let db: SupabaseClient
let admin: SupabaseClient | null = null
let ORG = ''
let MI_SEDE = ''
let MI_UID = ''

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

  const key = process.env.E2E_SERVICE_ROLE_KEY
  if (key) admin = createClient(process.env.VITE_NODO_SUPABASE_URL!, key, { auth: { persistSession: false } })
})

/** Crea una sede del laboratorio por el camino del producto y devuelve su id. */
async function crearSede(sufijo: string): Promise<string> {
  const nombre = `E2E ${sufijo} ${Date.now().toString().slice(-6)}`
  const r = await db.from('sedes').insert({ name: nombre, organization_id: ORG }).select().single()
  expect(r.error?.message ?? 'sin error', 'el INSERT de sedes tiene que seguir permitido').toBe('sin error')
  return r.data!.id as string
}

test('① una sede SIN movimientos tampoco se puede borrar — y el que niega es RLS, no la FK', async () => {
  // 🔴 La service role acá es para LIMPIAR, no para medir: aplicada la migración,
  //    `sedes` no se puede borrar desde el producto, así que la sede que este
  //    caso crea no se puede deshacer por el sujeto. Sin la key, cada corrida
  //    dejaría una sede más — y en este esquema nada tiene policy de DELETE, así
  //    que el residuo no se limpia después.
  test.skip(!admin, 'Requiere E2E_SERVICE_ROLE_KEY para limpiar la sede del caso')

  const id = await crearSede('SedeVacia')

  // Control del escenario: la sede tiene que estar VACÍA de movimientos, que es
  // la condición que saca a la FK de la ecuación. Se cuenta con la service role
  // porque la policy de lectura de `cash_movements` acota a MI sede, y ésta no
  // lo es: con el cliente del producto el cero sería el de RLS, no el real.
  const mov = await admin!.from('cash_movements').select('*', { count: 'exact', head: true }).eq('sede_id', id)
  expect(mov.count, 'la sede del caso tiene que nacer sin movimientos de caja').toBe(0)

  // ── EL SUJETO ──────────────────────────────────────────────────────────
  const borrado = await db.from('sedes').delete({ count: 'exact' }).eq('id', id)
  expect(
    borrado.count ?? 0,
    'SE BORRÓ UNA SEDE SIN MOVIMIENTOS. Ésa es la ventana real de la deuda 103: ' +
    'una sede recién creada, donde la FK de `cash_movements` no interviene y lo ' +
    'único que puede negar es la policy',
  ).toBe(0)

  // 🔴 Y QUE NIEGUE POR ESTA RAZÓN, no por cualquiera. RLS niega sin error; un
  //    23503 acá significaría que el caso volvió a medir la FK.
  expect(
    (borrado.error as { code?: string } | null)?.code ?? 'sin error',
    'el rechazo vino de una CLAVE FORÁNEA sobre una sede vacía: el caso está ' +
    'midiendo la FK otra vez y no la policy',
  ).not.toBe('23503')

  // ── EL CONTROL QUE LO CONVIERTE EN MEDICIÓN, y de paso limpia ──────────
  // Si esto NO borra, algo estructural la estaba frenando y el `count 0` de
  // arriba no probaba nada sobre la policy.
  const limpieza = await admin!.from('sedes').delete({ count: 'exact' }).eq('id', id)
  expect(
    limpieza.count,
    'la service role TIENE que poder borrarla: si no, había algo más frenando ' +
    '—FK, trigger, constraint— y el rechazo de arriba no era de RLS',
  ).toBe(1)
})

test('② una sede CON movimientos también es rechazada — pero por la FK, y el error lo dice', async () => {
  // La otra dirección. Sin ella, ① sola no distingue «RLS niega» de «acá no hay
  // nada que negar»: es el caso donde la FK es lo único que contesta.
  test.skip(!admin, 'Requiere E2E_SERVICE_ROLE_KEY: el escenario y su limpieza se montan salteando RLS')

  const id = await crearSede('SedeConCaja')

  // ⚠️ La jornada y el movimiento van con la service role, no por el producto:
  //    las policies de `jornadas` y `cash_movements` exigen `sede_id =
  //    get_my_sede_id()`, y ésta no es mi sede. No es un atajo por comodidad —
  //    por el camino del producto este escenario NO SE PUEDE ARMAR.
  const jornada = await admin!.from('jornadas')
    .insert({ sede_id: id, opened_by: MI_UID, opening_amount: 0 }).select().single()
  expect(jornada.error?.message ?? 'sin error', 'el montaje de la jornada tiene que andar').toBe('sin error')

  const cm = await admin!.from('cash_movements').insert({
    jornada_id: jornada.data!.id, sede_id: id, type: 'in', categoria: 'base',
    amount: 1000, reason: 'E2E · montaje del control de la FK', created_by: MI_UID,
  }).select().single()
  expect(cm.error?.message ?? 'sin error', 'el montaje del movimiento tiene que andar').toBe('sin error')

  // ── EL SUJETO: borrar SALTEANDO RLS, para que conteste la FK y no la policy ──
  // 🔴 Seguro por construcción: si la FK no estuviera, el cascade se llevaría la
  //    sede, la jornada y el movimiento — las tres creadas por este caso.
  const borrado = await admin!.from('sedes').delete({ count: 'exact' }).eq('id', id)

  expect(
    (borrado.error as { code?: string } | null)?.code ?? 'ninguno',
    'SE BORRÓ UNA SEDE CON MOVIMIENTOS DE CAJA salteando RLS. La FK ' +
    '`cash_movements.sede_id` dejó de restringir —o se emparejó con sus ' +
    'diecisiete hermanas en `on delete cascade`— y con eso desapareció el ' +
    'desempatador que hoy tapa el camino sin que nadie lo haya decidido (deuda 114)',
  ).toBe('23503')

  // Y que la FK nombrada sea ÉSA. Si el rechazo viniera de otra, este caso
  // estaría verde por una restricción que no es la que dice medir.
  expect(
    borrado.error?.message ?? '',
    'el 23503 tiene que venir de `cash_movements`: cualquier otra FK haría que ' +
    'este caso pase por una razón distinta de la que documenta',
  ).toContain('cash_movements')

  // ── LIMPIEZA, en orden inverso al montaje ──────────────────────────────
  await admin!.from('cash_movements').delete().eq('id', cm.data!.id)
  await admin!.from('jornadas').delete().eq('id', jornada.data!.id)
  const fin = await admin!.from('sedes').delete({ count: 'exact' }).eq('id', id)
  expect(
    fin.count,
    'sacado el movimiento, la sede tiene que poder borrarse: si no, lo que la ' +
    'frenaba no era la FK de `cash_movements` y el caso midió otra cosa',
  ).toBe(1)
})

test('③ y lo demás SIGUE funcionando: sin esto, romper las tres policies pasaría verde', async () => {
  // Si este archivo sólo aseverara los rechazos, **borrar todas las policies
  // pasaría verde**: sin ninguna, RLS niega TODO —el delete incluido— y el
  // archivo diría que el aislamiento funciona sobre una tabla inutilizable.
  const antes = await db.from('sedes').select('name').eq('id', MI_SEDE).single()
  expect(antes.error?.message ?? 'sin error', 'el SELECT tiene que seguir andando').toBe('sin error')
  const original = antes.data!.name as string

  const upd = await db.from('sedes').update({ name: `${original} ✓` }).eq('id', MI_SEDE).select()
  expect(
    upd.error?.message ?? 'sin error',
    'el UPDATE tiene que seguir andando: al partir `for all` en tres, ninguna rama ' +
    'puede haberse perdido',
  ).toBe('sin error')
  expect(upd.data?.length, 'y tiene que haber tocado la fila').toBe(1)

  const vuelta = await db.from('sedes').update({ name: original }).eq('id', MI_SEDE).select()
  expect(vuelta.data?.[0]?.name, 'el nombre tiene que volver a como estaba').toBe(original)
})

test('④ no se puede crear una sede en OTRA organización', async () => {
  test.skip(!admin, 'Requiere E2E_SERVICE_ROLE_KEY para limpiar')
  const id = await crearSede('SedeOrg')

  // 🔴 Si al partir la policy el `with check` del insert se hubiera omitido,
  //    esto pasaría: se podría crear una sede DENTRO DE OTRA ORGANIZACIÓN.
  const ajeno = await db.from('sedes')
    .insert({ name: 'E2E SedeOrg AJENA', organization_id: '00000000-0000-0000-0000-000000000000' })
    .select()
  expect(
    ajeno.error,
    'SE CREÓ UNA SEDE EN OTRA ORGANIZACIÓN: el `with check` del insert no conserva ' +
    'la condición de la policy original',
  ).not.toBeNull()

  await admin!.from('sedes').delete().eq('id', id)
})
