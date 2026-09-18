import { test, expect } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { ownerCreds } from './helpers/auth'
import { clienteDeServicio } from './helpers/servicio'

// ============================================================================
// DEUDA 114 · TANDA B — borrar una sede NO se lleva la HISTORIA DEL NEGOCIO
//
// 🔴 ESTE ARCHIVO NACE ROJO Y ESE ES EL RESULTADO ESPERADO, igual que el de la
//    tanda A: contra el esquema previo, borrar una sede con órdenes, jornadas o
//    su secuencia de numeración **funciona** y se las lleva en cascada. La
//    migración `20260916140000` es la que lo cambia.
//
// ✅ EL ORDEN DE LAS ASERCIONES ES EL DE LA TANDA A, y por la misma razón:
//      ① EL SUJETO  → «la sede se borró y SE LLEVÓ el hecho»
//      ② la razón   → `23503`, y que el mensaje NOMBRE la tabla
//    Invertido, el rojo de hoy diría `expected undefined to be '23503'`, que es
//    cierto y no dice nada de lo que pasó.
//
// 🔴 Y EL 23503 SIN SUJETO NO SIRVE: después de la tanda B hay DOCE FK en NO
//    ACTION apuntando a `sedes`. Un código sin nombre no dice cuál negó, así que
//    cada caso crea UN SOLO hijo y lo asevera en el montaje.
//
// ⛔ ALCANCE DE LO QUE ESTE ARCHIVO MIDE — dicho explícitamente para que nadie
//    lo lea como «las nueve están probadas»:
//
//    | medido por COMPORTAMIENTO aquí | declarado, NO medido |
//    |---|---|
//    | `store_sequences` · `jornadas` · `orders` | `payments` · `stock_movements` · `debt_payments` · `purchase_invoices` · `product_cost_adjustments` · `jornada_cierres_con_fecha` |
//
//    Las seis de la derecha las cubre **el guard de la migración**, que nombra a
//    las doce y aborta si alguna falta. Eso es una afirmación del CATÁLOGO, no
//    un rechazo efectivo — y este proyecto ya tiene medido que no son lo mismo.
//    Se eligieron estas tres porque se pueden crear con UN SOLO hijo: las otras
//    seis exigen montar una orden, un producto o un proveedor, y entonces el
//    23503 dejaría de tener un único acusado.
//
// ⚠️ NO VA EN `describe.serial`: el caso ④ es el control que distingue «la FK
//    niega» de «no se borra nada nunca», y los tres de arriba nacen rojos. En
//    serial, ④ quedaría en `did not run`.
//
// ⚠️ NO ES DESTRUCTIVO: cada caso crea su sede y su hecho. Si la FK no frenara,
//    lo que el cascade se llevaría son filas que el caso acaba de crear.
// ============================================================================

let db: SupabaseClient
let admin: SupabaseClient | null = null
let ORG = ''
let MI_UID = ''

const SUF = Math.floor(Math.random() * 900000 + 100000)

const sedesCreadas: string[] = []
const jornadasCreadas: string[] = []
const ordenesCreadas: string[] = []
const secuenciasCreadas: string[] = []

test.beforeAll(async () => {
  db = createClient(process.env.VITE_NODO_SUPABASE_URL!, process.env.VITE_NODO_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  })
  const { error } = await db.auth.signInWithPassword(ownerCreds())
  if (error) throw error
  MI_UID = (await db.auth.getUser()).data.user!.id
  const p = await db.from('profiles').select('organization_id').eq('id', MI_UID).single()
  if (p.error) throw p.error
  ORG = p.data.organization_id as string

// 🔴 SUJETO, no atajo: el caso mide la FK, y RLS niega ANTES de que la FK
//    hable. Con el cliente del owner el delete da `count 0` sin error, asi
//    que el caso estaria midiendo RLS y reportando que midio la FK.
  admin = clienteDeServicio('medir-fk')
})

// ── LA LIMPIEZA ─────────────────────────────────────────────────────────────
// 🔴 ES LA QUE «NADIE ESCRIBIÓ» hasta esta tanda. Mientras las FK eran cascade,
//    borrar la sede se llevaba jornadas, órdenes y la secuencia de numeración
//    sola — así que ninguna limpieza del repo las nombraba. Con NO ACTION hay
//    que borrarlas EXPLÍCITAMENTE y en orden, o la sede no se va.
//
// ⚠️ `store_sequences` es la más fácil de olvidar de las tres: su fila **no la
//    pide nadie** — la crea `next_order_number` al numerar una venta. Una sede
//    que vendió una sola vez ya tiene una, y nada en el código la menciona.
//
// Y asevera EL ESTADO, no la operación: «no queda ninguna sede» cierra tanto si
// el propio caso se la llevó (antes de la migración) como si la sacó esta
// limpieza (después). «El delete borró 1» sería falso en el primer mundo.
test.afterAll(async () => {
  if (!admin) return

  for (const id of ordenesCreadas) {
    const r = await admin.from('orders').delete().eq('id', id)
    expect(r.error?.message ?? 'sin error', `no se pudo borrar la orden ${id}`).toBe('sin error')
  }
  for (const id of jornadasCreadas) {
    const r = await admin.from('jornadas').delete().eq('id', id)
    expect(r.error?.message ?? 'sin error', `no se pudo borrar la jornada ${id}`).toBe('sin error')
  }
  for (const id of secuenciasCreadas) {
    const r = await admin.from('store_sequences').delete().eq('sede_id', id)
    expect(
      r.error?.message ?? 'sin error',
      `no se pudo borrar la secuencia de numeración de ${id} — es la fila que ` +
      'nadie pide y que nada en el código nombra',
    ).toBe('sin error')
  }

  const quedaron: string[] = []
  for (const id of sedesCreadas) {
    await admin.from('sedes').delete().eq('id', id)
    const r = await admin.from('sedes').select('id', { count: 'exact', head: true }).eq('id', id)
    if ((r.count ?? 0) > 0) quedaron.push(id)
  }
  expect(
    quedaron,
    `QUEDARON SEDES HUÉRFANAS EN EL LAB: ${quedaron.join(', ')}. Algo quedó ` +
    'apuntándoles que esta limpieza no nombra — y con las FK en NO ACTION eso ya ' +
    'no se va solo.',
  ).toEqual([])
})

async function crearSede(rotulo: string): Promise<string> {
  const r = await admin!.from('sedes')
    .insert({ name: `E2E FKB ${rotulo} ${SUF}`, organization_id: ORG })
    .select('id').single()
  expect(r.error?.message ?? 'sin error', 'el montaje tiene que poder crear la sede').toBe('sin error')
  const id = r.data!.id as string
  sedesCreadas.push(id)
  return id
}

async function hijasEn(tabla: string, sede: string): Promise<number> {
  const r = await admin!.from(tabla).select('*', { count: 'exact', head: true }).eq('sede_id', sede)
  expect(r.count, `no se pudo contar ${tabla} para ${sede} — count null no es cero`).not.toBeNull()
  return r.count ?? -1
}

/** Que el único hijo de la sede sea el de `salvo`. Es lo que deja UN acusado. */
async function soloTiene(sede: string, salvo: string) {
  for (const t of ['orders', 'jornadas', 'store_sequences', 'profiles', 'user_stores']) {
    if (t === salvo) continue
    expect(
      await hijasEn(t, sede),
      `el montaje necesita CERO filas en ${t}: con doce FK en NO ACTION, otra ` +
      `fila haría que el 23503 pudiera venir de ${t} y el caso lo atribuiría mal`,
    ).toBe(0)
  }
}

// ── ① LA SECUENCIA DE NUMERACIÓN ───────────────────────────────────────────
test('① una sede con su SECUENCIA DE NUMERACIÓN no se puede borrar — la fila que nadie pide', async () => {
  test.skip(!admin, 'Requiere E2E_SERVICE_ROLE_KEY: el caso mide la FK, así que saltea RLS')

  const sede = await crearSede('Secuencia')

  // Esta fila la crea `next_order_number` al numerar una venta, no un trigger al
  // crear la sede. Acá se inserta directo porque el sujeto es la FK, no el
  // camino que la produce.
  const s = await admin!.from('store_sequences').insert({ sede_id: sede, last_order_number: 7 })
  expect(s.error?.message ?? 'sin error', 'el montaje tiene que poder crear la secuencia').toBe('sin error')
  secuenciasCreadas.push(sede)

  expect(await hijasEn('store_sequences', sede), 'el montaje necesita la secuencia').toBe(1)
  await soloTiene(sede, 'store_sequences')

  const borrado = await admin!.from('sedes').delete({ count: 'exact' }).eq('id', sede)

  // ① EL SUJETO
  expect(
    await hijasEn('store_sequences', sede),
    'LA SEDE SE BORRÓ Y SE LLEVÓ SU SECUENCIA DE NUMERACIÓN. El correlativo de ' +
    'ventas de esa sede desapareció en cascada: si la sede se recreara, la ' +
    'numeración volvería a empezar en 1 y el salto no lo explicaría nadie.',
  ).toBe(1)

  // ② LA RAZÓN
  expect(
    (borrado.error as { code?: string } | null)?.code ?? 'ninguno',
    'la sede no se borró, pero el rechazo no fue una violación de clave foránea',
  ).toBe('23503')
  expect(
    borrado.error?.message ?? '',
    'el 23503 tiene que nombrar a `store_sequences`, no a otra de las doce',
  ).toContain('store_sequences')
})

// ── ② LA JORNADA ───────────────────────────────────────────────────────────
test('② una sede con una JORNADA no se puede borrar, y niega la FK de jornadas', async () => {
  test.skip(!admin, 'Requiere E2E_SERVICE_ROLE_KEY')

  const sede = await crearSede('Jornada')

  const j = await admin!.from('jornadas')
    .insert({ sede_id: sede, opened_by: MI_UID, opening_amount: 0 })
    .select('id').single()
  expect(j.error?.message ?? 'sin error', 'el montaje tiene que poder abrir la jornada').toBe('sin error')
  jornadasCreadas.push(j.data!.id as string)

  expect(await hijasEn('jornadas', sede), 'el montaje necesita una jornada').toBe(1)
  await soloTiene(sede, 'jornadas')

  const borrado = await admin!.from('sedes').delete({ count: 'exact' }).eq('id', sede)

  expect(
    await hijasEn('jornadas', sede),
    'LA SEDE SE BORRÓ Y SE LLEVÓ LA JORNADA. Un día de caja —con su apertura, ' +
    'su cierre y su arqueo— desapareció como efecto colateral de borrar la sede.',
  ).toBe(1)

  expect(
    (borrado.error as { code?: string } | null)?.code ?? 'ninguno',
    'la sede no se borró, pero el rechazo no fue una violación de clave foránea',
  ).toBe('23503')
  expect(
    borrado.error?.message ?? '',
    'el 23503 tiene que nombrar a `jornadas`',
  ).toContain('jornadas')
})

// ── ③ LA ORDEN ─────────────────────────────────────────────────────────────
test('③ una sede con una ORDEN no se puede borrar, y niega la FK de orders', async () => {
  test.skip(!admin, 'Requiere E2E_SERVICE_ROLE_KEY')

  const sede = await crearSede('Orden')

  const o = await admin!.from('orders')
    .insert({ sede_id: sede, created_by: MI_UID, canal: 'mostrador' })
    .select('id').single()
  expect(o.error?.message ?? 'sin error', 'el montaje tiene que poder crear la orden').toBe('sin error')
  ordenesCreadas.push(o.data!.id as string)

  expect(await hijasEn('orders', sede), 'el montaje necesita una orden').toBe(1)
  await soloTiene(sede, 'orders')

  const borrado = await admin!.from('sedes').delete({ count: 'exact' }).eq('id', sede)

  expect(
    await hijasEn('orders', sede),
    'LA SEDE SE BORRÓ Y SE LLEVÓ LA VENTA. Ésta es la forma más cara de la ' +
    'deuda 114: la historia de lo que el negocio vendió desaparece sin aviso y ' +
    'sin vuelta, porque ninguna tabla tiene policy de DELETE para reponerla.',
  ).toBe(1)

  expect(
    (borrado.error as { code?: string } | null)?.code ?? 'ninguno',
    'la sede no se borró, pero el rechazo no fue una violación de clave foránea',
  ).toBe('23503')
  expect(
    borrado.error?.message ?? '',
    'el 23503 tiene que nombrar a `orders`',
  ).toContain('orders')
})

// ── ④ EL CONTROL ───────────────────────────────────────────────────────────
test('④ una sede SIN nada apuntándole SÍ se borra — o los tres de arriba pasan por otra razón', async () => {
  test.skip(!admin, 'Requiere E2E_SERVICE_ROLE_KEY')

  // 🔴 Si alguien pusiera las dieciocho FK en `restrict`, o le revocara el
  //    DELETE a `service_role`, los tres casos de arriba seguirían VERDES
  //    midiendo «no se puede borrar nada». Este caso es lo único que los separa.
  const sede = await crearSede('Vacia')
  await soloTiene(sede, '')

  const borrado = await admin!.from('sedes').delete({ count: 'exact' }).eq('id', sede)

  expect(
    borrado.error?.message ?? 'sin error',
    'borrar una sede VACÍA salteando RLS tiene que seguir funcionando. Si esto ' +
    'falla, los casos ① ② ③ están verdes porque NADA se borra, y no porque la FK ' +
    'que dicen medir esté restringiendo',
  ).toBe('sin error')
  expect(borrado.count, 'y tiene que haber borrado exactamente esa fila').toBe(1)
})
