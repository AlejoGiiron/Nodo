-- ============================================================
-- Nodo — Esquema base · 04 · Funciones auxiliares de identidad y permisos
--
-- ORIGEN: Vento `d848852`. Las cuatro son la v2 de
-- supabase/profiles-is-active-enforced.sql (paso 0, pares 2 a 5), que es la que
-- exige is_active. Ver docs/paso-0-funciones-duplicadas.md.
--
-- R5: no aplicado en Nodo (base vacia). Desde el primer `db push`, R5 manda.
--
-- ── POR QUE LAS CUATRO VAN JUNTAS ──────────────────────────────────────────
-- Es un defecto de CLASE (R3), no cuatro funciones parecidas. Arreglar
-- has_permission y olvidar get_my_sede_id deja al usuario desactivado sin
-- permisos nominales PERO con acceso a los datos de su sede — peor que no haber
-- tocado nada, porque el arreglo parcial da la sensacion de estar cubierto.
--
-- ── HACIA DONDE FALLAN, QUE ES EL CRITERIO ─────────────────────────────────
-- Con `is_active`, un usuario desactivado obtiene NULL. Una policy que compara
-- `sede_id = null` da falso y NIEGA: fail-closed.
-- Sin `is_active`, el usuario desactivado sigue resolviendo su sede y las
-- policies lo dejan operar: fail-open, y silencioso — la UI lo muestra inactivo
-- mientras la base lo autoriza.
--
-- ── SECURITY DEFINER + REVOKE, LAS DOS COSAS ───────────────────────────────
-- Son SECURITY DEFINER porque leen `profiles` para decidir, y `profiles` esta
-- bajo RLS: sin el modificador se muerden la cola. Y Postgres concede EXECUTE a
-- PUBLIC por defecto en TODA funcion nueva, asi que hay que revocar
-- explicitamente y conceder solo a `authenticated`. Regla dura del repo.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- has_permission — v2 (paso 0, par 2)
--
-- Le agrega DOS cosas a la version de multi-tenant-rbac.sql, no una:
--   1. `p.is_active`      → desactivar un usuario le quita los permisos.
--   2. `r.permissions ? '*'` → el comodin del owner. SIN ESTO, un owner cuyo
--      rol tiene '*' se queda sin ningun permiso.
-- El criterio corto "la que verifica is_active" acierta por la razon
-- incompleta: si la v2 hubiera traido solo el comodin, ese criterio habria
-- elegido la v1 y roto a los owners.
--
-- ⚠️ Que una clave este en el catalogo NO prueba que algo este protegido. En
--    Vento 6 permisos no gateaban nada y fallaban ABIERTO. Cada clave nueva
--    necesita su `can()` que la consuma (deuda #23).
-- ------------------------------------------------------------
create or replace function public.has_permission(perm text)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    join public.roles r on r.id = p.role_id
    where p.id = auth.uid()
      and p.is_active
      and (r.permissions ? perm or r.permissions ? '*')
  )
$$;

revoke execute on function public.has_permission(text) from public;
revoke execute on function public.has_permission(text) from anon;
grant  execute on function public.has_permission(text) to authenticated;


-- ------------------------------------------------------------
-- get_my_role — v2 (paso 0, par 3). Rol grueso del enum.
-- ------------------------------------------------------------
create or replace function public.get_my_role()
returns public.user_role
language sql stable security definer
set search_path = public
as $$
  select role from public.profiles
   where id = auth.uid() and is_active
$$;

revoke execute on function public.get_my_role() from public;
revoke execute on function public.get_my_role() from anon;
grant  execute on function public.get_my_role() to authenticated;


-- ------------------------------------------------------------
-- get_my_sede_id — v2 (paso 0, par 4). Ex get_my_restaurant_id.
-- Devuelve la sede ACTIVA del perfil, que es el eje de casi toda policy.
-- ------------------------------------------------------------
create or replace function public.get_my_sede_id()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select sede_id from public.profiles
   where id = auth.uid() and is_active
$$;

revoke execute on function public.get_my_sede_id() from public;
revoke execute on function public.get_my_sede_id() from anon;
grant  execute on function public.get_my_sede_id() to authenticated;


-- ------------------------------------------------------------
-- get_my_organization_id — v2 (paso 0, par 5).
-- ------------------------------------------------------------
create or replace function public.get_my_organization_id()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select organization_id from public.profiles
   where id = auth.uid() and is_active
$$;

revoke execute on function public.get_my_organization_id() from public;
revoke execute on function public.get_my_organization_id() from anon;
grant  execute on function public.get_my_organization_id() to authenticated;

commit;
