import { test, expect } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { ownerCreds } from './helpers/auth'

// ============================================================================
// EL AISLAMIENTO DE STORAGE ENTRE SEDES — y por qué este archivo existe
//
// 🔴 LA POLICY SOLA NO AVISA CUANDO SU PREMISA CAMBIA. El aislamiento de los dos
//    buckets se apoya en `(storage.foldername(name))[1] = get_my_sede_id()`, o
//    sea en que **el cliente suba a `${sedeId}/...`**. Esas son dos puntas —la
//    ruta en `supabase-helpers.ts` y la policy en SQL— y **nada las
//    sincroniza**: el día que alguien cambie la ruta del cliente, la policy deja
//    de proteger y no hay nada que se ponga rojo.
//
//    Con este caso, cambiar la ruta rompe UN TEST en vez de romper el
//    aislamiento en silencio.
//
// ⚠️ Es la sonda de la auditoría A2 convertida en spec. Allá el aislamiento se
//    midió sobre 828 celdas de tablas; Storage nunca se midió — y cuando se
//    escribieron sus policies, el único precedente del repo
//    (`_heredado/storage-product-images.sql`) tenía `WITH CHECK (bucket_id =
//    '...')` **sin acotar la carpeta**, o sea el agujero entero.
//
// 🔴 EL CONTROL POSITIVO NO ES OPCIONAL, y es lo que separa este caso de uno
//    decorativo: si sólo se aseverara el rechazo, **el caso pasaría en verde con
//    el bucket inexistente** — que es exactamente el estado del que venimos. Un
//    «no pudo subir» no distingue «la policy lo rechazó» de «no hay bucket».
//    Por eso cada bucket se prueba en las DOS direcciones, y la negativa se lee
//    sólo después de que la positiva funcionó.
// ============================================================================

const BUCKETS = ['sede-logos', 'product-images'] as const

/** PNG de 1×1 real: el bucket filtra por `allowed_mime_types`. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

let db: SupabaseClient
let MI_SEDE = ''
let OTRA_SEDE = ''

test.beforeAll(async () => {
  db = createClient(process.env.VITE_NODO_SUPABASE_URL!, process.env.VITE_NODO_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  })
  const { error } = await db.auth.signInWithPassword(ownerCreds())
  if (error) throw error
  const uid = (await db.auth.getUser()).data.user!.id
  MI_SEDE = (await db.from('profiles').select('sede_id').eq('id', uid).single()).data!.sede_id as string

  // La OTRA sede sale de la base, no de una constante: el lab tiene dos y
  // cuál es «la propia» depende de la cuenta con la que se corra.
  const { data: sedes, error: eSedes } = await db.from('sedes').select('id, name').neq('id', MI_SEDE)
  if (eSedes) throw eSedes
  expect(
    sedes?.length ?? 0,
    'ESTE CASO NECESITA DOS SEDES. Con una sola no hay «carpeta ajena» a la que ' +
    'intentar escribir, y el caso pasaría sin haber medido nada — es «un eje que ' +
    'el producto dice soportar y que el lab tiene en N=1»',
  ).toBeGreaterThan(0)
  OTRA_SEDE = sedes![0].id as string
})

for (const bucket of BUCKETS) {
  test(`🔴 ${bucket}: se puede escribir en la carpeta PROPIA y NO en la de otra sede`, async () => {
    const propio = `${MI_SEDE}/e2e-aislamiento.png`
    const ajeno = `${OTRA_SEDE}/e2e-aislamiento.png`

    // ── ① EL CONTROL POSITIVO, PRIMERO ──────────────────────────────────
    // Sin esto, el rechazo de abajo no significa nada: un bucket inexistente
    // rechaza igual, y ése era el estado real hasta el 2026-09-15.
    const ok = await db.storage.from(bucket).upload(propio, PNG, {
      upsert: true, contentType: 'image/png',
    })
    expect(
      ok.error?.message ?? 'sin error',
      `no se pudo escribir en la carpeta PROPIA de ${bucket}. Si esto falla, el ` +
      'rechazo de la carpeta ajena NO prueba el aislamiento — puede ser que el ' +
      'bucket no exista o que falte la policy de escritura',
    ).toBe('sin error')

    // ── ② EL SUJETO ─────────────────────────────────────────────────────
    const rechazado = await db.storage.from(bucket).upload(ajeno, PNG, {
      upsert: true, contentType: 'image/png',
    })
    expect(
      rechazado.error,
      `ESCRIBIÓ EN LA CARPETA DE OTRA SEDE (${bucket}). La policy se apoya en que ` +
      'el cliente suba a `${sedeId}/…`; si la ruta del cliente cambió, la policy ' +
      'dejó de proteger y el aislamiento entre tenants está abierto',
    ).not.toBeNull()

    // ── ③ Y QUE NO HAYA QUEDADO NADA EN LA CARPETA AJENA ────────────────
    // ⚠️ `upload` puede devolver error y haber escrito igual en un mundo raro.
    //    Se asevera el HECHO —la lista de la carpeta ajena— y no sólo la
    //    respuesta de la API.
    const { data: enAjena } = await db.storage.from(bucket).list(OTRA_SEDE)
    expect(
      (enAjena ?? []).map((f) => f.name),
      'y la carpeta de la otra sede no puede contener el archivo del intento',
    ).not.toContain('e2e-aislamiento.png')

    // ── LIMPIEZA, en el mismo turno que la escritura ────────────────────
    // Una sonda que escribe y no limpia es una sonda a medio escribir.
    await db.storage.from(bucket).remove([propio])
  })
}
