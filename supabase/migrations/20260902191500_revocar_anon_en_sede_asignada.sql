-- ============================================================================
-- DEUDA 61 · CIERRE — revocar `anon` en el helper `sede_asignada_al_usuario`
--
-- 🔴 DEFECTO PROPIO, encontrado al verificar contra la base y NO contra el
--    archivo (R4). La migracion anterior (`20260902190000`) hizo lo que la
--    regla del proyecto dice — *"SECURITY DEFINER → revoke execute from
--    public"* — y aun asi el ACL quedo asi:
--
--        {postgres=X, anon=X, authenticated=X, service_role=X}
--
--    `anon` no llega por `public`: llega por los DEFAULT PRIVILEGES que Supabase
--    deja puestos en el esquema `public`. `revoke ... from public` no lo quita.
--
-- El precedente del repo ya lo hacia bien y por eso se nota la omision —
-- `20260831120400_funciones_auxiliares.sql`, lineas 62-64:
--
--        revoke execute on function public.has_permission(text) from public;
--        revoke execute on function public.has_permission(text) from anon;
--        grant  execute on function public.has_permission(text) to authenticated;
--
--    Enumerado el 2026-09-02: de las 15 funciones SECURITY DEFINER del esquema,
--    **la unica con `anon=X` era esta** (aparte de `rls_auto_enable`, que es
--    andamiaje de creacion de tablas y no se invoca desde PostgREST).
--
-- QUE SE COLABA: la funcion lee `user_stores` SIN RLS. Con EXECUTE, un cliente
-- **sin login** podia preguntar "¿el usuario X tiene asignada la sede Y?" y
-- recibir un booleano — enumeracion de pertenencias conociendo los UUID. No es
-- escritura y no hay evidencia de uso, pero es fail-open: lo que no esta
-- prohibido pasa en silencio (R2).
--
-- R5: la migracion anterior ya esta aplicada y no se edita. Esto va aparte.
-- ============================================================================

begin;

revoke execute on function public.sede_asignada_al_usuario(uuid, uuid) from anon;

commit;
