import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { crearUsuarioConPerfil } from '../_shared/crear-usuario.ts'

// ============================================================================
// ALTA DE UNA ORGANIZACIÓN NUEVA — deuda 36.
//
// Dos piezas, y la división es el punto: **esta función AUTORIZA, la RPC HACE.**
// `onboard_organization` no recibe quién la llama ni lo consulta; toda la
// decisión de «¿esta persona puede crear un tenant?» vive acá.
//
// 🔴 POR QUÉ ASÍ, y es la condición con la que se diseñó: el día que exista el
//    registro autoservicio, **la RPC no se toca**. Lo que cambia es esta capa —
//    en vez de exigir la service_role key va a verificar correo confirmado,
//    límites de alta y estado de suscripción—. Si la autorización estuviera
//    adentro de la RPC, el autoservicio la reescribiría en vez de reusarla.
//
// ── EL LÍMITE DE ATOMICIDAD, SIN SUAVIZAR ──────────────────────────────────
//    Es atómico org + sede + roles (lo hace la RPC en una transacción).
//    El usuario de Auth y su perfil son atómicos ENTRE SÍ —el trigger
//    `handle_new_user` corre dentro del insert— pero quedan FUERA de esa
//    transacción.
//
//    🔴 Si el paso 2 o el 3 fallan, queda una ORGANIZACIÓN SIN NINGÚN USUARIO.
//       Es recuperable corriendo esto de nuevo, pero NO es la nada: la
//       organización existe, con su sede y sus roles.
//
//    Por eso TODA respuesta —de éxito o de error— dice en qué `paso` quedó. Un
//    «error» a secas no alcanza: la acción de recuperación es distinta según si
//    la organización llegó a crearse o no.
// ============================================================================

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/** Dónde quedó el alta. Va en toda respuesta, incluidas las de error. */
type Paso = 'autorizacion' | 'organizacion' | 'usuario' | 'completo'

const json = (body: Record<string, unknown> & { paso: Paso }, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

    // ── PASO 0 · AUTORIZACIÓN ────────────────────────────────────────────
    // Hoy: hay que presentar la service_role key. Es la única autorización
    // posible mientras el alta la corra una persona con un script — no existe
    // todavía ningún usuario de esa organización a quien pedirle un permiso.
    //
    // ⚠️ Y ES LA LÍNEA QUE EL AUTOSERVICIO VA A REEMPLAZAR, no borrar: ahí el
    //    invocante sigue siendo el servidor, después de verificar correo
    //    confirmado, límites y suscripción. Ver la deuda del registro
    //    autoservicio.
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
    if (!SERVICE_KEY || token !== SERVICE_KEY) {
      return json({
        paso: 'autorizacion',
        error: 'Esta funcion solo se invoca con la service_role key.',
      }, 403)
    }

    const body = await req.json().catch(() => null)
    if (!body) {
      return json({ paso: 'autorizacion', error: 'Cuerpo invalido' }, 400)
    }

    const { org_name, sede_name, admin_email, admin_password, admin_full_name } = body
    const faltan = [
      ['org_name', org_name], ['sede_name', sede_name],
      ['admin_email', admin_email], ['admin_password', admin_password],
      ['admin_full_name', admin_full_name],
    ].filter(([, v]) => !v || String(v).trim() === '').map(([k]) => k)

    if (faltan.length) {
      return json({
        paso: 'autorizacion',
        error: `Faltan campos obligatorios: ${faltan.join(', ')}`,
      }, 400)
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY)

    // ── PASO 1 · ORGANIZACIÓN + SEDE + ROLES (atómico) ───────────────────
    const { data: org, error: orgErr } = await admin.rpc('onboard_organization', {
      p_org_name: String(org_name).trim(),
      p_sede_name: String(sede_name).trim(),
    })

    if (orgErr) {
      // Falló ANTES de crear nada, o la transacción se revirtió entera: no
      // quedó organización a medias. Volver a correr es seguro.
      return json({
        paso: 'organizacion',
        error: orgErr.message,
        recuperacion: 'No se creo la organizacion. Corregi el error y volve a correr.',
      }, 400)
    }

    const o = org as {
      organization_id: string
      sede_id: string
      owner_role_id: string
      usuarios_existentes: number
      organizacion_creada: boolean
      sede_creada: boolean
    }

    // ── IDEMPOTENCIA, la mitad que importa ───────────────────────────────
    // 🔴 No alcanza con «la organización ya existe»: el escenario real de
    //    re-corrida es una organización creada Y SIN USUARIOS, porque el alta
    //    murió en el paso 2. Ahí hay que COMPLETARLA, no fallar — si fallara,
    //    la herramienta no serviría justo cuando hace falta.
    //    Y al revés: si ya tiene usuarios, NO se crea un segundo admin. Volver
    //    a correr una organización completa tiene que ser inocuo.
    if (o.usuarios_existentes > 0) {
      return json({
        paso: 'completo',
        ya_estaba: true,
        organization_id: o.organization_id,
        sede_id: o.sede_id,
        usuarios_existentes: o.usuarios_existentes,
        detalle:
          `La organizacion ya tiene ${o.usuarios_existentes} usuario(s): no se creo ninguno ` +
          'nuevo. Si querias agregar otro usuario, se hace desde Configuracion > Usuarios.',
      })
    }

    // ── PASO 2+3 · EL PRIMER ADMIN ───────────────────────────────────────
    // 🔴 Se REUSA el camino de `create-user` (`_shared/crear-usuario.ts`), no se
    //    copia: el alta de usuarios en dos lados sería R1 en el flujo que da
    //    acceso al sistema. Lo que NO se comparte es la autorización, que es lo
    //    único distinto entre los dos casos.
    const alta = await crearUsuarioConPerfil(admin, {
      email: String(admin_email).trim(),
      password: String(admin_password),
      full_name: String(admin_full_name).trim(),
      role: 'admin',
      sede_id: o.sede_id,
      role_id: o.owner_role_id,
    })

    if (!alta.ok) {
      return json({
        paso: 'usuario',
        error: alta.error,
        organization_id: o.organization_id,
        sede_id: o.sede_id,
        recuperacion:
          'LA ORGANIZACION QUEDO CREADA Y SIN USUARIOS. No es un estado vacio: existe con su ' +
          'sede y sus roles. Corregi el error y volve a correr esta misma herramienta con los ' +
          'MISMOS nombres de organizacion y sede — va a encontrar lo que ya existe y solo ' +
          'creara el usuario.',
      }, alta.status)
    }

    return json({
      paso: 'completo',
      ya_estaba: false,
      organization_id: o.organization_id,
      sede_id: o.sede_id,
      user_id: alta.user_id,
      organizacion_creada: o.organizacion_creada,
      sede_creada: o.sede_creada,
    })
  } catch (err) {
    // Sin `paso` conocido no se puede decir dónde quedó, y decirlo mal es peor
    // que no decirlo: mandaría a la acción de recuperación equivocada.
    return json({
      paso: 'organizacion',
      error: String(err),
      recuperacion:
        'No se pudo determinar en que paso quedo. Consulta si la organizacion existe ANTES de ' +
        'volver a correr: si existe y no tiene usuarios, re-correr la completa.',
    }, 500)
  }
})
