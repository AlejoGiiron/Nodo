import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { ownerCreds } from './helpers/auth'

// ============================================================================
// ALTA DE ORGANIZACIÓN — deuda 36. `onboard_organization`.
//
// 🔴 EL ESTADO RARO QUE ESTA HERRAMIENTA PUEDE PRODUCIR, Y QUE NADIE VA A
//    PROBAR A MANO: una ORGANIZACIÓN CREADA Y SIN NINGÚN USUARIO.
//
//    El alta son dos transacciones: la RPC hace org+sede+roles atómicamente, y
//    el usuario de Auth queda afuera —no puede estar adentro: `handle_new_user`
//    exige `sede_id`, así que el usuario sólo puede nacer DESPUÉS—. Si el
//    segundo paso falla, la organización queda hecha y vacía. Es recuperable,
//    pero **no es la nada**.
//
//    El camino feliz lo va a ejercer el primer cliente. Este estado no: aparece
//    cuando algo sale mal, que es exactamente cuando nadie está mirando y la
//    herramienta tiene que funcionar. Por eso el caso central de este spec no
//    es el alta — es **la RE-CORRIDA sobre una organización a medias**.
//
// ⚠️ Se prueba contra la RPC y no contra la Edge Function porque la Edge exige
//    la service_role key por HTTP y no está desplegada en el lab. Lo que la
//    Edge agrega —autorizar y traducir el resultado a un `paso`— no toca la
//    base; lo que puede dejar estado inconsistente es esto.
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

const SUFIJO = Date.now().toString().slice(-6)
const ORG = `E2E Onboard ${SUFIJO}`
const SEDE = `E2E OnboardSede ${SUFIJO}`

let comoUsuario: SupabaseClient
let comoServicio: SupabaseClient | null = null
const creadas: string[] = []

test.beforeAll(async () => {
  const url = process.env.VITE_NODO_SUPABASE_URL!
  comoUsuario = createClient(url, process.env.VITE_NODO_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  })
  const { error } = await comoUsuario.auth.signInWithPassword(ownerCreds())
  if (error) throw error

  const key = process.env.E2E_SERVICE_ROLE_KEY
  if (key) comoServicio = createClient(url, key, { auth: { persistSession: false } })
})

test.afterAll(async () => {
  // Las organizaciones de prueba se borran: no tienen historia que conservar
  // —nacen y mueren dentro del spec— y dejarlas rompería el guard de homónimas
  // de la propia función en la corrida siguiente.
  if (comoServicio && creadas.length) {
    await comoServicio.from('sedes').delete().in('organization_id', creadas)
    await comoServicio.from('roles').delete().in('organization_id', creadas)
    await comoServicio.from('organizations').delete().in('id', creadas)
  }
})

// ── LA MITAD QUE CORRE SIEMPRE: la función NO se puede invocar desde la app ──

test('🔴 un usuario logueado NO puede crear organizaciones', async () => {
  // 🔴 Esto es lo que separa «una herramienta de alta» de «cualquiera se crea
  //    un tenant». La función está revocada de `public`, `anon` Y
  //    `authenticated`, y este caso lo asevera con el cliente de la app —el
  //    mismo que usa el navegador— y no leyendo el ACL.
  // ⚠️ Y asevera que NIEGUE, no sólo que falle: si algún día la función dejara
  //    de existir el error sería otro, y este caso pasaría por la razón
  //    equivocada. Por eso mira el mensaje.
  const { error } = await comoUsuario.rpc('onboard_organization', {
    p_org_name: `${ORG} intruso`,
    p_sede_name: SEDE,
  })

  expect(error, 'un usuario autenticado NO puede crear una organización').not.toBeNull()
  expect(
    `${error?.message} ${error?.code ?? ''}`.toLowerCase(),
    'tiene que negar por PERMISOS. Si dice "does not exist", la función no está aplicada y ' +
    'este caso estaría verde por la razón equivocada',
  ).toMatch(/permission denied|no autorizado|not authorized/)
})

// ── LA MITAD QUE EXIGE LA SERVICE KEY ───────────────────────────────────────

test.describe('con service_role', () => {
  test.beforeEach(() => {
    test.skip(!comoServicio, 'Requiere E2E_SERVICE_ROLE_KEY')
  })

  test('el alta deja org + sede + roles, y NINGÚN usuario', async () => {
    const { data, error } = await comoServicio!.rpc('onboard_organization', {
      p_org_name: ORG, p_sede_name: SEDE,
    })
    expect(error).toBeNull()

    const o = data as Record<string, unknown>
    creadas.push(o.organization_id as string)

    expect(o.organizacion_creada, 'la primera vez la crea').toBe(true)
    expect(o.sede_creada).toBe(true)
    expect(o.sede_id, 'devuelve la sede: es lo que el usuario necesita para nacer').toBeTruthy()
    expect(o.owner_role_id, 'y el rol owner, para asignárselo al primer admin').toBeTruthy()

    // 🔴 EL ESTADO QUE ESTA HERRAMIENTA PRODUCE, ASEVERADO: la organización
    //    existe y no tiene usuarios. No es un defecto — es el límite de
    //    atomicidad, y el caso siguiente prueba que se puede salir de él.
    expect(
      o.usuarios_existentes,
      'la RPC no crea usuarios: ése es el límite de atomicidad, y el llamador tiene que verlo',
    ).toBe(0)

    // Los roles quedaron: sin esto la organización no puede operar y nadie se
    // entera hasta que el cliente intenta hacer algo.
    const { count } = await comoServicio!
      .from('roles').select('id', { count: 'exact', head: true })
      .eq('organization_id', o.organization_id as string)
    expect(count ?? 0, 'seed_system_roles corrió adentro del alta').toBeGreaterThan(0)
  })

  test('🔴 RE-CORRER sobre una organización SIN USUARIOS la completa, no falla', async () => {
    // 🔴 EL CASO CENTRAL. Es el escenario de recuperación: el alta murió en el
    //    paso del usuario, la organización quedó creada y vacía, y el operador
    //    vuelve a correr la herramienta con los mismos nombres.
    //    Si acá fallara, la herramienta no serviría justo cuando hace falta.
    const { data, error } = await comoServicio!.rpc('onboard_organization', {
      p_org_name: ORG, p_sede_name: SEDE,
    })
    expect(error, 're-correr sobre una organización a medias NO puede fallar').toBeNull()

    const o = data as Record<string, unknown>
    expect(o.organizacion_creada, 'la encuentra, no crea una segunda').toBe(false)
    expect(o.sede_creada, 'y la sede también').toBe(false)
    expect(
      o.organization_id, 'y es LA MISMA organización: si fuera otra, habría duplicado el tenant',
    ).toBe(creadas[0])
    expect(o.usuarios_existentes, 'sigue sin usuarios, así que el llamador sabe que debe crearlo')
      .toBe(0)
  })

  test('🔴 con la organización YA COMPLETA, avisa en vez de crear un segundo admin', async () => {
    // La otra mitad de la idempotencia: re-correr algo terminado tiene que ser
    // inocuo. `usuarios_existentes` es lo que deja al llamador distinguir
    // «completala» de «ya está», y sin ese número tendría que adivinar — y
    // adivinar acá significa un admin de más en el tenant del cliente.
    const sede = (await comoServicio!
      .from('sedes').select('id').eq('organization_id', creadas[0]).limit(1).single()).data!.id

    // Un perfil cualquiera de esa organización alcanza para el conteo; no hace
    // falta una cuenta de Auth real, y crearla dejaría residuo en el lab.
    const { error: insErr } = await comoServicio!.from('profiles').insert({
      id: crypto.randomUUID(),
      email: `e2e-onboard-${SUFIJO}@nodo.test`,
      full_name: 'E2E Onboard',
      role: 'admin',
      sede_id: sede,
      organization_id: creadas[0],
    })
    // Si `profiles.id` exige FK contra auth.users, este atajo no sirve y el
    // caso se salta diciéndolo — mejor que un verde que no midió nada.
    test.skip(insErr != null, `no se pudo sembrar el perfil de prueba: ${insErr?.message}`)

    const { data, error } = await comoServicio!.rpc('onboard_organization', {
      p_org_name: ORG, p_sede_name: SEDE,
    })
    expect(error).toBeNull()
    expect(
      (data as Record<string, unknown>).usuarios_existentes,
      'ahora la organización tiene usuarios: el llamador NO debe crear otro admin',
    ).toBe(1)

    await comoServicio!.from('profiles').delete().eq('organization_id', creadas[0])
  })

  test('🔴 con DOS organizaciones homónimas falla CERRADO, en vez de elegir una', async () => {
    // `organizations` no tiene unique en `name`, así que la idempotencia por
    // nombre puede volverse ambigua. Elegir al azar sembraría la sede del
    // cliente en el tenant equivocado: datos partidos, sin error y sin forma de
    // notarlo. Se prefiere el rojo.
    const homonima = `${ORG} dup`
    for (let i = 0; i < 2; i++) {
      const { data } = await comoServicio!
        .from('organizations').insert({ name: homonima }).select('id').single()
      if (data) creadas.push(data.id)
    }

    const { error } = await comoServicio!.rpc('onboard_organization', {
      p_org_name: homonima, p_sede_name: SEDE,
    })
    expect(error, 'con dos homónimas tiene que negarse').not.toBeNull()
    expect(
      error!.message,
      'y el mensaje tiene que decir CUÁNTAS y CUÁL, o el operador no sabe qué resolver',
    ).toMatch(/2 organizaciones/)
  })
})
