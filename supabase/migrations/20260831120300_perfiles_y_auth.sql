-- ============================================================
-- G-Nexo — Esquema base · 03 · Perfiles y auth
--
-- ORIGEN: consolidado de G-Vento `d848852`. Versiones tomadas segun
-- docs/paso-0-funciones-duplicadas.md (pares 1 y 6):
--   · profiles                     ← schema.sql + multi-tenant-rbac.sql (organization_id,
--                                    role_id) + config-profile-active.sql (is_active)
--   · handle_new_user              ← profiles-organization-invariant.sql  (v2)
--   · enforce_profile_organization ← fix-...-definer.sql                  (v2, SECURITY DEFINER)
--   · protect_owner_role           ← protect-owner-role.sql
--   · protect_profile_self_escalation ← protect-profile-self-escalation.sql
--
-- R5: no aplicado en G-Nexo (base vacia). Desde el primer `db push`, R5 manda.
--
-- ── POR QUE enforce_profile_organization ES SECURITY DEFINER ────────────────
-- Es R6 en persona, y el archivo del que sale ES la evidencia de esa regla en
-- G-Vento. Sin el modificador, el `select` sobre sedes pasa por RLS y la
-- funcion evalua DATOS FILTRADOS POR EL OBSERVADOR — pero la organizacion de
-- una sede es la misma la mire quien la mire. El modo de fallo es rechazar
-- operaciones validas con un mensaje que apunta al lugar equivocado. Alla salio
-- fail-closed por suerte, no por diseño.
--
-- Y VALIDA, NO FUERZA: si en vez de rechazar corrigiera new.organization_id, el
-- resultado dependeria del orden de disparo de los triggers y la correccion
-- seria silenciosa. Rechazar es ruidoso, que es lo que queremos.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- profiles
--
-- 🔴 `role` NO TIENE DEFAULT, Y ESO ES EL ARREGLO DE UN DEFECTO.
-- El default heredado era 'waiter', el rol MENOS privilegiado. Al podar ese
-- valor del enum (migracion `extensiones_y_tipos`), el default habria pasado a 'cashier' — o sea que
-- un borrado, por si solo, habria vuelto el default MAS PRIVILEGIADO. Nadie
-- eligio eso: fue el efecto colateral de otra decision, y es fail-open, que R2
-- prohibe.
--
-- Que hoy quede acotado —los permisos efectivos salen de role_id, que nace nulo,
-- y has_permission con role_id nulo devuelve false— es SUERTE, no diseño: basta
-- una policy que mire el enum directo para que deje de estarlo.
--
-- Sin default, todo insert TIENE QUE declarar el rol. Lo que no se declara, no
-- pasa: fail-closed. handle_new_user, mas abajo, tampoco inventa un fallback —
-- exige el rol igual que exige la sede.
-- ------------------------------------------------------------
create table public.profiles (
  id              uuid             primary key references auth.users on delete cascade,
  email           text             not null,
  full_name       text             not null,
  role            public.user_role not null,
  role_id         uuid             references public.roles,
  sede_id         uuid             not null references public.sedes         on delete cascade,
  organization_id uuid             not null references public.organizations on delete cascade,
  is_active       boolean          not null default true,
  created_at      timestamptz      not null default now(),
  updated_at      timestamptz      not null default now()
);

comment on table public.profiles is
  'Perfil de negocio del usuario. Siempre 1:1 con auth.users.';
comment on column public.profiles.role is
  'Rol grueso heredado. admin: gestion total | cashier: caja y ventas. '
  'Los permisos finos NO salen de aca: salen de role_id.';
comment on column public.profiles.role_id is
  'Rol RBAC. Nulo = sin permisos finos (has_permission devuelve false).';
comment on column public.profiles.sede_id is
  'Sede ACTIVA del usuario. Las sedes a las que tiene acceso estan en user_stores.';
comment on column public.profiles.organization_id is
  'DERIVADO de la sede, nunca recibido de quien llama. Lo garantiza el trigger '
  'trg_profiles_org_consistency.';

create index idx_profiles_sede_id         on public.profiles (sede_id);
create index idx_profiles_organization_id on public.profiles (organization_id);

create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.handle_updated_at();

-- La FK que la migracion `organizaciones_y_sedes` dejo pendiente, ahora que profiles existe.
alter table public.user_stores
  add constraint user_stores_user_id_fkey
  foreign key (user_id) references public.profiles on delete cascade;


-- ------------------------------------------------------------
-- handle_new_user — v2 (paso 0, par 6)
--
-- Que le agrega a la v1 de schema.sql, que es por lo que gana:
--   · tres guards FAIL-CLOSED donde la v1 seguia adelante: sin sede, sede
--     inexistente, sede sin organizacion.
--   · organization_id DERIVADO de la sede, no recibido del user_metadata. Si se
--     recibiera, un metadata mal armado crearia el perfil en la organizacion
--     equivocada: datos cruzados entre tenants, en silencio.
-- ------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_sede_id uuid := (new.raw_user_meta_data->>'sede_id')::uuid;
  v_role    text := nullif(trim(new.raw_user_meta_data->>'role'), '');
  v_org     uuid;
begin
  -- El rol se EXIGE, no se rellena. La v1 heredada hacia
  -- `coalesce(..., 'waiter')`, y con 'waiter' podado ese fallback habria pasado
  -- a 'cashier': un default mas privilegiado nacido de un borrado. Un fallback
  -- que inventa autorizacion es fail-open (R2), asi que este guard va con los
  -- otros tres.
  if v_role is null then
    raise exception using
      errcode = 'check_violation',
      message = 'No se puede crear el perfil: falta role en user_metadata',
      hint    = 'Valores validos: admin | cashier. No hay default a proposito: '
                'un rol implicito es una autorizacion que nadie decidio.';
  end if;

  if v_sede_id is null then
    raise exception using
      errcode = 'check_violation',
      message = 'No se puede crear el perfil: falta sede_id en user_metadata',
      hint    = 'Crea el usuario desde Configuracion > Usuarios. Si lo creas desde '
                'el Dashboard de Supabase, agrega en User Metadata: '
                '{"sede_id": "<uuid de la sede>", "full_name": "...", "role": "cashier"}';
  end if;

  select s.organization_id into v_org
    from public.sedes s
   where s.id = v_sede_id;

  if not found then
    raise exception using
      errcode = 'check_violation',
      message = format('No se puede crear el perfil: la sede %s no existe', v_sede_id);
  end if;

  if v_org is null then
    raise exception using
      errcode = 'check_violation',
      message = format('No se puede crear el perfil: la sede %s no tiene organizacion', v_sede_id);
  end if;

  insert into public.profiles
    (id, email, full_name, role, sede_id, organization_id)
  values (
    new.id,
    new.email,
    coalesce(
      nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
      split_part(new.email, '@', 1)
    ),
    v_role::public.user_role,   -- exigido arriba, nunca inventado
    v_sede_id,
    v_org  -- derivado, no recibido: la sede es la fuente de verdad.
  );
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public;
revoke execute on function public.handle_new_user() from anon;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ------------------------------------------------------------
-- enforce_profile_organization — v2 (paso 0, par 1). Ver la cabecera.
-- ------------------------------------------------------------
create or replace function public.enforce_profile_organization()
returns trigger
language plpgsql
security definer                    -- R6: el invariante no depende de quien mira
set search_path = public
as $$
declare
  v_org uuid;
begin
  select s.organization_id into v_org
    from public.sedes s
   where s.id = new.sede_id;

  if not found then
    raise exception
      'profiles.sede_id (%) no corresponde a ninguna sede', new.sede_id
      using errcode = 'check_violation';
  end if;

  if v_org is null then
    raise exception
      'la sede % no tiene organizacion asignada', new.sede_id
      using errcode = 'check_violation';
  end if;

  if new.organization_id is distinct from v_org then
    raise exception
      'profiles.organization_id (%) no corresponde a la organizacion de su sede (%)',
      new.organization_id, v_org
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

revoke execute on function public.enforce_profile_organization() from public;
revoke execute on function public.enforce_profile_organization() from anon;

create trigger trg_profiles_org_consistency
  before insert or update on public.profiles
  for each row execute function public.enforce_profile_organization();


-- ------------------------------------------------------------
-- protect_owner_role — el rol propietario ("*") no se edita ni se borra, y el
-- comodin no se puede asignar a mano desde la UI.
--
-- El guard mira `current_user = 'authenticated'`: los seeds y el service_role
-- pasan de largo a proposito, porque seed_system_roles ES quien siembra el
-- owner. Es allowlist por actor, no denylist por operacion.
-- ------------------------------------------------------------
create or replace function public.protect_owner_role()
returns trigger
language plpgsql
as $$
begin
  if current_user = 'authenticated' then
    if tg_op in ('UPDATE', 'DELETE')
       and coalesce(old.permissions, '[]'::jsonb) @> '["*"]'::jsonb then
      raise exception 'El rol propietario no puede editarse ni eliminarse'
        using errcode = 'check_violation';
    end if;
    if tg_op in ('INSERT', 'UPDATE')
       and coalesce(new.permissions, '[]'::jsonb) @> '["*"]'::jsonb then
      raise exception 'No se puede asignar el permiso comodin "*" a un rol'
        using errcode = 'check_violation';
    end if;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger trg_protect_owner_role
  before insert or update or delete on public.roles
  for each row execute function public.protect_owner_role();


-- ------------------------------------------------------------
-- protect_profile_self_escalation — nadie se cambia a si mismo el rol, el
-- estado activo ni la organizacion. Sin esto, un usuario con permiso de editar
-- perfiles se auto-asciende.
-- ------------------------------------------------------------
create or replace function public.protect_profile_self_escalation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user = 'authenticated' and new.id = auth.uid() then
    if new.role_id is distinct from old.role_id then
      raise exception 'No podes cambiar tu propio rol'
        using errcode = 'check_violation';
    end if;
    if new.role is distinct from old.role then
      raise exception 'No podes cambiar tu propio rol de sistema'
        using errcode = 'check_violation';
    end if;
    if new.is_active is distinct from old.is_active then
      raise exception 'No podes activar ni desactivar tu propio usuario'
        using errcode = 'check_violation';
    end if;
    if new.organization_id is distinct from old.organization_id then
      raise exception 'No podes cambiar tu propia organizacion'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_protect_profile_self_escalation
  before update on public.profiles
  for each row execute function public.protect_profile_self_escalation();


-- RLS habilitada aca; policies en el 11 (ver la cabecera de la migracion `organizaciones_y_sedes`).
alter table public.profiles enable row level security;

commit;
