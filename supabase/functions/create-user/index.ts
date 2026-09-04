import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { crearUsuarioConPerfil } from '../_shared/crear-usuario.ts'

// ⚠️ EL CAMINO DE ALTA SALIÓ DE ACÁ A `_shared/crear-usuario.ts` el 2026-09-03,
//    y no por estética: `onboard-organization` necesita exactamente lo mismo y
//    NO puede llamar a esta función —su primer guard exige `usuarios.gestionar`,
//    que en una organización nueva no tiene nadie—. Copiarlo habría dejado el
//    alta de usuarios en dos lados sin nada que los sincronice (R1), en el flujo
//    que da acceso al sistema.
//    Lo que se comparte es el CAMINO; lo que se queda acá es la AUTORIZACIÓN,
//    que es lo único distinto entre los dos casos.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    // Admin client — usa service role para crear usuarios
    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    // Cliente del llamante — verifica que esté autenticado
    const caller = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
    )

    const { data: { user }, error: authErr } = await caller.auth.getUser()
    if (authErr || !user) return json({ error: 'No autorizado' }, 401)

    // Verifica que el llamante esté ACTIVO y tenga permiso sobre la sede.
    const { data: callerProfile, error: profErr } = await admin
      .from('profiles')
      .select('is_active, sede_id, organization_id')
      .eq('id', user.id)
      .single()

    if (profErr || !callerProfile) return json({ error: 'Perfil no encontrado' }, 403)

    // is_active explícito ANTES del permiso: un admin desactivado con sesión viva
    // podía crear usuarios nuevos vía service role (persistencia: te desactivan,
    // te creás otra cuenta). has_permission ya filtra is_active por su cuenta,
    // pero este chequeo da el mensaje correcto en vez de "sin permiso".
    if (!callerProfile.is_active)
      return json({ error: 'Tu usuario está desactivado' }, 403)

    // Gate por PERMISO RBAC, no por el enum legacy `role`. Se ejecuta con el
    // cliente del LLAMANTE: has_permission() resuelve por auth.uid().
    const { data: puede, error: permErr } = await caller.rpc('has_permission', {
      perm: 'usuarios.gestionar',
    })
    if (permErr) return json({ error: 'No se pudo verificar el permiso' }, 403)
    if (!puede) return json({ error: 'Se requiere el permiso usuarios.gestionar' }, 403)

    // Parsea y valida el cuerpo. `role_id` (RBAC) es opcional por compatibilidad
    // con llamantes viejos, pero la UI siempre lo manda.
    const { email, password, full_name, role, role_id, sede_id } = await req.json()

    if (!email || !password || !full_name || !role || !sede_id)
      return json({ error: 'Faltan campos requeridos' }, 400)

    if (password.length < 8)
      return json({ error: 'La contraseña debe tener mínimo 8 caracteres' }, 400)

    if (!['admin', 'cashier'].includes(role))
      return json({ error: 'Rol inválido' }, 400)

    // La sede debe coincidir con la del llamante.
    if (sede_id !== callerProfile.sede_id)
      return json({ error: 'No tienes permiso sobre esa sede' }, 403)

    // Validación del rol RBAC ANTES de crear la cuenta: si el rol es inválido
    // conviene rechazar sin haber creado nada, y así la compensación de abajo
    // queda solo para el fallo genuino del UPDATE (raro), no para el caso comun.
    // Cross-org: el rol DEBE pertenecer a la organización del llamante. La UI
    // solo lista los de su org, pero la Edge Function es un endpoint directo.
    if (role_id) {
      const { data: rol, error: rolErr } = await admin
        .from('roles')
        .select('id, organization_id')
        .eq('id', role_id)
        .maybeSingle()

      if (rolErr) return json({ error: 'No se pudo verificar el rol' }, 500)
      if (!rol) return json({ error: 'El rol indicado no existe' }, 400)
      if (rol.organization_id !== callerProfile.organization_id)
        return json({ error: 'El rol no pertenece a tu organización' }, 403)
    }

    // Crea el usuario — email_confirm:true para que no necesite verificar correo.
    // user_metadata es leído por el trigger handle_new_user para crear el profile
    // (que ademas DERIVA organization_id de la sede). role_id NO va en la
    // metadata a propósito: es un canal que el usuario controla en un signUp
    // abierto, y ya se confía en él para el enum `role` (deuda anotada). Meter
    // role_id ahí convertiría esa deuda en escalada directa a owner.
    const alta = await crearUsuarioConPerfil(admin, {
      email, password, full_name, role, sede_id, role_id,
    })
    if (!alta.ok) return json({ error: alta.error }, alta.status)

    return json({ success: true, user_id: alta.user_id })
  } catch (err) {
    return json({ error: String(err) }, 500)
  }
})
