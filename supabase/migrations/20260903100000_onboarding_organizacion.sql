-- ============================================================================
-- ONBOARDING DE ORGANIZACIÓN — deuda 36, el arranque en frío
--
-- 🔴 EL PROBLEMA QUE CIERRA. Hasta hoy no había forma de crear el PRIMER
--    usuario de una organización nueva, y los dos caminos estaban cerrados por
--    razones correctas:
--      · `create-user` exige `usuarios.gestionar` — y en una organización nueva
--        no existe nadie que lo tenga. Además exige que la sede pedida sea LA
--        DEL LLAMANTE, así que ni con el permiso concedido serviría.
--      · el panel de Studio no tiene campo de User Metadata, y
--        `handle_new_user` EXIGE `sede_id` y `role`.
--    Entre los dos no quedaba ninguna puerta. Se resolvía a mano en dos tiempos.
--
-- ── QUÉ HACE ESTA FUNCIÓN, Y QUÉ NO ────────────────────────────────────────
--    Hace: organización + sede + roles de sistema, EN UNA TRANSACCIÓN.
--    NO hace: el usuario de Auth. Y eso es una decisión, no una omisión.
--
-- 🔴 EL LÍMITE DE ATOMICIDAD, ESCRITO SIN SUAVIZAR:
--
--      Es atómico org + sede + roles. El usuario de Auth y su perfil son
--      atómicos ENTRE SÍ —el trigger `handle_new_user` corre en la misma
--      transacción que el insert en `auth.users`— pero quedan FUERA de esta
--      transacción. Si el alta falla después de esta función, queda una
--      ORGANIZACIÓN SIN NINGÚN USUARIO. Es recuperable corriendo la
--      herramienta de nuevo, pero NO es la nada.
--
--    ⚠️ Por eso esta función es idempotente Y devuelve `usuarios_existentes`:
--       el llamador necesita distinguir «alta nueva» de «recuperación de una
--       organización a medias», porque la acción correcta es distinta.
--
-- ── POR QUÉ NO RECIBE EL USUARIO (`p_user_id`) ─────────────────────────────
--    Se propuso, y se descartó al verificarlo: `handle_new_user` es un trigger
--    AFTER INSERT que lanza excepción si falta `sede_id`, y una excepción en un
--    trigger aborta el insert. O sea que **un usuario de Auth no puede existir
--    sin una sede previa**: no hay `p_user_id` que pasarle en una organización
--    nueva. El orden es org → sede → usuario, y no al revés.
--
-- 🔴 Y LA MISMA FUNCIÓN SIRVE PARA EL AUTOSERVICIO el día que exista, que es
--    la condición con la que se diseñó. Ahí la persona llena UN formulario
--    —negocio + correo + contraseña— y el servidor hace estos mismos pasos en
--    este mismo orden: nunca hay un signup pelado de GoTrue. Lo que va a
--    cambiar es QUIÉN la invoca y QUÉ SE VERIFICA ANTES —correo confirmado,
--    límites, estado de suscripción—, no lo que hace. Por eso **la
--    autorización del llamante no está en el cuerpo**: la resuelve la Edge
--    Function, y esta función sólo ejecuta.
-- ============================================================================

begin;

create or replace function public.onboard_organization(
  p_org_name  text,
  p_sede_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_org        uuid;
  v_sede       uuid;
  v_owner      uuid;
  v_homonimas  int;
  v_usuarios   int;
  v_org_nueva  boolean := false;
  v_sede_nueva boolean := false;
  c_org        text := btrim(coalesce(p_org_name, ''));
  c_sede       text := btrim(coalesce(p_sede_name, ''));
begin
  -- ── Guards de entrada. Fail-closed: sin nombre no se inventa uno ─────────
  if c_org = '' then
    raise exception using
      errcode = 'check_violation',
      message = 'onboard_organization: el nombre de la organizacion es obligatorio';
  end if;
  if c_sede = '' then
    raise exception using
      errcode = 'check_violation',
      message = 'onboard_organization: el nombre de la sede es obligatorio';
  end if;

  -- ── IDEMPOTENCIA, y por qué resuelve POR NOMBRE ──────────────────────────
  -- R0 pide fijar el objetivo por UUID. Acá no se puede: al RE-CORRER la
  -- herramienta, el nombre es el único dato que el operador tiene. Es el mismo
  -- patrón de `lab-seed-a.sql`, y es una BÚSQUEDA de idempotencia, no un
  -- objetivo destructivo — esta función no borra ni actualiza nada.
  --
  -- 🔴 El riesgo que eso abre —`organizations` NO tiene unique en `name`— se
  --    compensa fallando CERRADO ante la ambigüedad. Sin este guard, dos
  --    organizaciones homónimas harían que la herramienta eligiera una al azar
  --    y sembrara la sede del cliente en la organización equivocada: datos
  --    partidos entre dos tenants, sin error y sin forma de notarlo.
  select count(*) into v_homonimas from public.organizations where name = c_org;
  if v_homonimas > 1 then
    raise exception using
      errcode = 'check_violation',
      message = format(
        'Hay %s organizaciones llamadas "%s". No se puede decidir cual es, y elegir '
        'mal sembraria la sede en el tenant equivocado.', v_homonimas, c_org),
      hint = 'Resolve la duplicacion a mano y volve a correr la herramienta.';
  end if;

  select id into v_org from public.organizations where name = c_org;
  if v_org is null then
    insert into public.organizations (name) values (c_org) returning id into v_org;
    v_org_nueva := true;
  end if;

  -- La sede sí tiene unique (organization_id, name), así que acá el nombre es
  -- una clave de verdad dentro de la organización.
  select id into v_sede
    from public.sedes
   where organization_id = v_org and name = c_sede;
  if v_sede is null then
    insert into public.sedes (organization_id, name)
    values (v_org, c_sede)
    returning id into v_sede;
    v_sede_nueva := true;
  end if;

  -- ── Los roles de sistema ────────────────────────────────────────────────
  -- 🔴 Se llama desde ADENTRO, y no es comodidad: si el alta dejara este paso
  --    al llamador, una organización podría nacer sin RBAC y eso no se nota
  --    hasta que alguien intenta hacer algo y no puede. Ya pasó una vez.
  --    Es idempotente (`on conflict do update`), así que re-correr no rompe.
  -- ⚠️ `seed_system_roles` está revocada de public, anon Y authenticated, y NO
  --    es SECURITY DEFINER. Esta función sí lo es, así que corre como su dueño
  --    y conserva el EXECUTE. Ése es el único motivo por el que el DEFINER hace
  --    falta acá — no para saltear RLS.
  perform public.seed_system_roles(v_org);

  -- Guard fail-closed, copiado de `lab-seed-a.sql`: seguir sin roles sería
  -- entregar una organización que no puede operar, y descubrirlo recién cuando
  -- el cliente no pueda hacer nada.
  select id into v_owner
    from public.roles
   where organization_id = v_org and name = 'owner';
  if v_owner is null then
    raise exception using
      errcode = 'check_violation',
      message = format('seed_system_roles no dejo el rol owner en la org %s.', v_org),
      hint = 'Revisa que supabase/seed-system-roles.sql este aplicado en esta base.';
  end if;

  -- ── Cuántos usuarios tiene YA ───────────────────────────────────────────
  -- 🔴 Es el dato que convierte a esta función en herramienta de RECUPERACIÓN
  --    y no sólo de alta. Un fallo tardío deja la organización creada y sin
  --    usuarios; al re-correr, el llamador necesita saber si tiene que crear el
  --    primer admin o si ya está completa. Sin este número tendría que
  --    adivinarlo, y adivinar acá significa crear un segundo admin de más.
  select count(*) into v_usuarios
    from public.profiles
   where organization_id = v_org;

  return jsonb_build_object(
    'organization_id',     v_org,
    'sede_id',             v_sede,
    'owner_role_id',       v_owner,
    'usuarios_existentes', v_usuarios,
    'organizacion_creada', v_org_nueva,
    'sede_creada',         v_sede_nueva
  );
end $fn$;

comment on function public.onboard_organization(text, text) is
  'Alta de organizacion: org + sede + roles de sistema, en una transaccion. '
  'NO crea el usuario de Auth — no puede: handle_new_user exige sede_id, asi '
  'que el usuario solo puede nacer DESPUES de esta funcion. Devuelve sede_id y '
  'owner_role_id para que el llamador lo cree, y usuarios_existentes para que '
  'distinga un alta nueva de la recuperacion de una organizacion a medias. '
  'Idempotente por NOMBRE de organizacion; falla cerrado si hay homonimas. '
  'La autorizacion del llamante NO vive aca: la resuelve la Edge Function, para '
  'que el autoservicio pueda reusar esta misma funcion cambiando solo quien la '
  'invoca y que se verifica antes.';

-- ── Privilegios ────────────────────────────────────────────────────────────
-- Postgres concede EXECUTE a PUBLIC por defecto, y Supabase agrega DEFAULT
-- PRIVILEGES en el esquema `public` que se lo dan ADEMAS a `anon` — que no es
-- lo mismo que `public`, asi que el primer revoke no lo alcanza. Van los tres.
--
-- 🔴 `authenticated` tambien queda afuera, y es la decision que importa: esta
--    funcion crea TENANTS. Un usuario logueado de otra organizacion no tiene
--    ningun motivo para crear organizaciones nuevas, y el dia del autoservicio
--    tampoco lo va a tener: ahi quien invoca sigue siendo el servidor, despues
--    de verificar correo, limites y suscripcion.
revoke execute on function public.onboard_organization(text, text) from public;
revoke execute on function public.onboard_organization(text, text) from anon;
revoke execute on function public.onboard_organization(text, text) from authenticated;
grant  execute on function public.onboard_organization(text, text) to service_role;

commit;
