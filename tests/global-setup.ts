import { request, type FullConfig } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'node:fs'

// Puerto dedicado de Nodo (debe coincidir con E2E_PORT de playwright.config.ts).
const BASE_URL = 'http://localhost:5180'

// Organización del LABORATORIO. Los tests SOLO deben correr contra esta org.
const LAB_ORG = 'LAB'

/**
 * Carga variables de un archivo .env (sin dotenv) en process.env, sin pisar las
 * ya definidas. playwright.config.ts ya cargó .env.test; aquí necesitamos las
 * credenciales del backend (VITE_NODO_*) que viven en .env.
 */
function loadEnvFile(file: string): void {
  if (!existsSync(file)) return
  for (const line of readFileSync(file, 'utf-8').split('\n')) {
    const m = line.match(/^\s*([\w.]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  }
}

/**
 * Health check #1 — la app servida es Nodo (no otra app en el puerto).
 */
async function checkServedAppIsGnexo(): Promise<void> {
  const ctx = await request.newContext()
  try {
    const res = await ctx.get(BASE_URL)
    const html = await res.text()
    if (!/Nodo/i.test(html)) {
      throw new Error(
        `[E2E health check] El servidor en ${BASE_URL} NO es Nodo ` +
        `(marcador "Nodo" no encontrado en el HTML servido). ¿Hay otra app ` +
        `(p. ej. Mura) ocupando el puerto? Se aborta la suite para no correr ` +
        `contra el proyecto equivocado.`,
      )
    }
    console.log('[E2E health check] OK — la app servida es Nodo.')
  } finally {
    await ctx.dispose()
  }
}

/**
 * Health check #2 (SEGURIDAD DE DATOS) — las credenciales de prueba pertenecen
 * a la organización LAB. Evita correr la suite contra datos reales (org G-10)
 * por un .env.test mal configurado: la suite muta estado (cierra caja, crea
 * datos) y NO debe tocar producción.
 *
 * Hace login real con E2E_OWNER_EMAIL contra el mismo Supabase que usa la app
 * (VITE_NODO_*), consulta su organización (RLS solo deja ver la propia) y
 * aborta si no es LAB.
 */
async function checkCredentialsAreLab(): Promise<{ supabase: SupabaseClient; orgId: string }> {
  loadEnvFile('.env')
  loadEnvFile('.env.test')

  const url = process.env.VITE_NODO_SUPABASE_URL
  const anonKey = process.env.VITE_NODO_SUPABASE_ANON_KEY
  const email = process.env.E2E_OWNER_EMAIL
  const password = process.env.E2E_OWNER_PASSWORD

  if (!url || !anonKey) {
    throw new Error(
      '[E2E health check] Faltan VITE_NODO_SUPABASE_URL / ' +
      'VITE_NODO_SUPABASE_ANON_KEY (revisa .env). No se puede verificar la ' +
      'organización de las credenciales de prueba.',
    )
  }
  if (!email || !password) {
    throw new Error(
      '[E2E health check] Faltan E2E_OWNER_EMAIL / E2E_OWNER_PASSWORD ' +
      '(revisa .env.test). No se puede verificar la organización de prueba.',
    )
  }

  const supabase = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { error: authError } = await supabase.auth.signInWithPassword({ email, password })
  if (authError) {
    throw new Error(
      `[E2E health check] No se pudo iniciar sesión con E2E_OWNER_EMAIL ` +
      `(${email}): ${authError.message}. Revisa .env.test.`,
    )
  }

  // RLS de organizations ("ver la propia") deja ver SOLO la org del usuario.
  const { data, error } = await supabase.from('organizations').select('id, name')

  if (error) {
    throw new Error(
      `[E2E health check] No se pudo consultar la organización del usuario de ` +
      `prueba: ${error.message}.`,
    )
  }

  const orgName = data?.[0]?.name ?? '(ninguna)'
  if (orgName !== LAB_ORG) {
    throw new Error(
      `PELIGRO: las credenciales de prueba no son del laboratorio ` +
      `(org actual: ${orgName}). Los tests NO deben correr contra datos reales. ` +
      `Revisa .env.test.`,
    )
  }

  console.log(`[E2E health check] OK — las credenciales pertenecen a la org "${LAB_ORG}".`)
  return { supabase, orgId: data![0]!.id as string }
}

// ── Prefijos que los specs GENERAN ────────────────────────────────────────────
// Enumerados el 2026-09-01 grepeando las constantes con sufijo de TODOS los
// specs. Se reducen a tres familias; el resto de lo que apareció en el grep
// —`Ingreso arqueo`, `Cierre arqueo E2E`, `E2E gasto`— son MOTIVOS de movimientos
// de caja, no entidades del catálogo: no ensucian el POS y viven dentro de una
// jornada.
//
// 🔴 ALLOWLIST POSITIVA. No se borra "todo lo que no reconozco": se desactiva
//    exactamente lo que empieza con estos prefijos. Un fixture nuevo con otro
//    prefijo NO se limpia — y eso es preferible a una purga que decide sola.
const PREFIJOS = ['E2E %', 'AV %'] as const

/** Tablas con `sede_id` y `is_active` cuyo residuo ensucia el POS. */
const TABLAS = ['products', 'categories', 'extras', 'customers', 'suppliers'] as const

/**
 * Deja el laboratorio limpio AL EMPEZAR.
 *
 * 🔴 POR QUÉ AL EMPEZAR Y NO AL TERMINAR — es el hallazgo que motivó esto:
 *    los tests de limpieza son los ÚLTIMOS de su bloque, así que un fallo
 *    temprano en un `describe.serial` SE LLEVA PUESTA LA LIMPIEZA. El lab queda
 *    sucio, la suciedad causa fallos nuevos, y esos fallos se llevan más
 *    limpieza: realimentación positiva. Limpiando al arrancar, el estado inicial
 *    **deja de depender de que la corrida anterior haya salido bien**.
 *
 * 🔴 DESACTIVA, NO BORRA. Es lo que hacen los propios tests de limpieza, evita
 *    pelear con las FK de `order_items`/`stock_movements`, y es reversible. Para
 *    el POS es equivalente: solo muestra productos activos.
 *
 * ⚠️ RUIDOSA A PROPÓSITO: imprime cuántas filas tocó, por tabla. Una purga
 *    silenciosa es un objetivo destructivo del que nadie sabe el alcance.
 */
async function purgarResiduo(
  supabase: SupabaseClient,
  orgId: string,
): Promise<void> {
  // Las sedes de LAB, por ID. El objetivo se fija por UUID, no por nombre (R2) —
  // y encima RLS ya limita a la org propia: dos vallas, no una.
  const { data: sedes, error: eSedes } = await supabase
    .from('sedes').select('id').eq('organization_id', orgId)
  if (eSedes) throw new Error(`[E2E purga] no se pudieron leer las sedes: ${eSedes.message}`)
  const sedeIds = (sedes ?? []).map((s) => s.id as string)
  if (sedeIds.length === 0) throw new Error('[E2E purga] la org LAB no tiene sedes')

  const conteo: Record<string, number> = {}
  let total = 0

  for (const tabla of TABLAS) {
    for (const prefijo of PREFIJOS) {
      const { data, error } = await supabase
        .from(tabla)
        .update({ is_active: false })
        .in('sede_id', sedeIds)
        .like('name', prefijo)
        .eq('is_active', true)      // solo lo que sigue vivo: el conteo es real
        .select('id')
      if (error) throw new Error(`[E2E purga] ${tabla} (${prefijo}): ${error.message}`)
      const n = data?.length ?? 0
      if (n > 0) {
        conteo[tabla] = (conteo[tabla] ?? 0) + n
        total += n
      }
    }
  }

  if (total === 0) {
    console.log('[E2E purga] el laboratorio ya estaba limpio (0 filas).')
    return
  }

  const detalle = Object.entries(conteo).map(([t, n]) => `${t}=${n}`).join(' ')
  console.log(`[E2E purga] ${total} fixtures viejos desactivados — ${detalle}`)

  // Un residuo grande significa que varias corridas seguidas abortaron antes de
  // limpiar. No es un error, pero NO puede pasar desapercibido.
  if (total > 50) {
    console.log(
      `[E2E purga] ⚠️  ${total} filas es MUCHO. Son fixtures de corridas ` +
      `anteriores que abortaron antes de su limpieza. Si este número crece ` +
      `corrida a corrida, algo esta fallando temprano y de forma sistematica.`,
    )
  }
}

/**
 * Health check previo a la suite (defensa en profundidad):
 *  1. La app servida en BASE_URL es Nodo (no otra app en el puerto).
 *  2. Las credenciales de prueba pertenecen a la organización LAB (no a datos
 *     reales). Aborta la corrida si cualquiera falla.
 */
export default async function globalSetup(_config: FullConfig): Promise<void> {
  await checkServedAppIsGnexo()
  // La purga va DESPUES del check de organización, y con su misma sesión: solo
  // se limpia una vez PROBADO que estamos en LAB. Al revés, una credencial mal
  // configurada desactivaría fixtures de datos reales.
  const { supabase, orgId } = await checkCredentialsAreLab()
  await purgarResiduo(supabase, orgId)
  await supabase.auth.signOut()
}
