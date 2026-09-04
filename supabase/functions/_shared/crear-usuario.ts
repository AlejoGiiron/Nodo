import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

/**
 * CREAR UN USUARIO CON SU PERFIL Y SU ROL — el camino, una sola vez.
 *
 * 🔴 POR QUÉ EXISTE ESTE ARCHIVO. `onboard-organization` necesita crear el
 *    primer admin de una organización nueva, que es exactamente lo que
 *    `create-user` ya sabe hacer. Pero `create-user` NO se puede reusar tal
 *    cual: su cuerpo empieza exigiendo `usuarios.gestionar` al llamante, y en
 *    una organización nueva **no existe todavía nadie que lo tenga** — ésa es
 *    la deuda 36 entera.
 *
 *    Copiar sus treinta líneas en la función nueva habría dejado el camino de
 *    alta de usuarios **en dos lados sin nada que los sincronice** (R1), y el
 *    lado que se congela es siempre el que nadie toca. Así que lo que se
 *    comparte es el CAMINO; lo que NO se comparte es la AUTORIZACIÓN, que es
 *    justamente lo distinto entre los dos casos:
 *
 *      create-user           → autoriza con `usuarios.gestionar` + sede propia
 *      onboard-organization  → autoriza con service_role (y mañana, con lo que
 *                              el autoservicio verifique: correo, límites,
 *                              suscripción)
 *      ────────────────────────────────────────────────────────────────────
 *      los dos                → llaman a esto
 *
 * ⚠️ Y ES DELIBERADO QUE ESTA FUNCIÓN NO SEPA NADA DE QUIÉN LA LLAMA. No
 *    recibe el token, no consulta permisos, no mira `auth.uid()`. Si lo
 *    hiciera, volvería a mezclar autorización con acción y el próximo caso de
 *    alta tendría que reescribirla en vez de usarla.
 */

export interface DatosDeUsuario {
  email: string
  password: string
  full_name: string
  /** Enum grueso de `profiles.role`. Los permisos finos salen de `role_id`. */
  role: 'admin' | 'cashier'
  /** DEBE existir: `handle_new_user` lo exige y deriva la organización de él. */
  sede_id: string
  /** Rol RBAC. Opcional — sin él el perfil queda sin permisos finos. */
  role_id?: string | null
}

export type ResultadoDeAlta =
  | { ok: true; user_id: string }
  | { ok: false; status: number; error: string; usuarioBorrado?: boolean }

/**
 * Crea la cuenta de Auth y deja el perfil con su rol.
 *
 * 🔴 EL PERFIL NO SE CREA ACÁ, y conviene saberlo para leer los errores: lo
 *    crea el trigger `handle_new_user` **dentro de la misma transacción** que
 *    el insert en `auth.users`. Si el trigger rechaza —falta `sede_id`, la sede
 *    no existe, la sede no tiene organización— el insert se aborta entero y
 *    **la cuenta no queda creada**. O sea que no hay ningún estado
 *    «usuario sin perfil» que compensar: usuario y perfil son atómicos entre sí.
 *
 * ⚠️ Lo que SÍ hay que compensar es el paso siguiente. `role_id` se asigna con
 *    un UPDATE aparte, y si ése falla el perfil queda SIN ROL y por lo tanto
 *    sin ningún permiso (`has_permission` hace JOIN contra `roles`). Ahí se
 *    deshace la creación: `profiles.id` referencia `auth.users` ON DELETE
 *    CASCADE, así que borrar la cuenta se lleva el perfil y no queda residuo.
 */
export async function crearUsuarioConPerfil(
  admin: SupabaseClient,
  d: DatosDeUsuario,
): Promise<ResultadoDeAlta> {
  const { data, error: createErr } = await admin.auth.admin.createUser({
    email: d.email,
    password: d.password,
    email_confirm: true,
    // Lo lee `handle_new_user` para armar el perfil, que además DERIVA
    // `organization_id` de la sede. `role_id` NO va acá: `user_metadata` es
    // editable por el propio usuario en Supabase, y meterlo convertiría esa
    // deuda en escalada directa a owner.
    user_metadata: { full_name: d.full_name, role: d.role, sede_id: d.sede_id },
  })

  if (createErr) return { ok: false, status: 400, error: createErr.message }

  const userId = data.user?.id
  if (!userId) return { ok: false, status: 500, error: 'No se pudo crear el usuario' }

  if (d.role_id) {
    const { error: roleErr } = await admin
      .from('profiles')
      .update({ role_id: d.role_id })
      .eq('id', userId)

    if (roleErr) {
      const { error: delErr } = await admin.auth.admin.deleteUser(userId)
      if (delErr) {
        return {
          ok: false,
          status: 500,
          usuarioBorrado: false,
          error:
            'No se pudo asignar el rol y tampoco revertir la creacion. ' +
            `Revisa manualmente el usuario ${d.email}.`,
        }
      }
      return {
        ok: false,
        status: 500,
        usuarioBorrado: true,
        error: 'No se pudo asignar el rol; el usuario no fue creado',
      }
    }
  }

  return { ok: true, user_id: userId }
}
