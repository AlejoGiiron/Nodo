-- ============================================================================
-- DEUDA 61 · UN CAJERO SE TRASLADABA SOLO A CUALQUIER SEDE DE SU ORGANIZACION
--
-- Origen: auditoria A2 (2026-09-02), `docs/auditorias/A2-negacion-policies.md`
-- §4. Medido con la sonda: el cajero puso `sede_id` = una sede que NO tenia en
-- `user_stores`, el UPDATE paso, y acto seguido leyo un producto de esa sede —
-- la RLS por sede lo sigue a donde diga su perfil.
--
-- La policy "profiles: editar el propio" permite el UPDATE de la fila propia, y
-- el trigger protegia `role_id`, `role`, `is_active` y `organization_id` — pero
-- NO `sede_id`. La restriccion "solo a una sede asignada" vivia unicamente en
-- `StoreSelector.tsx`: misma clase que la deuda 42, la UI ocupando el lugar de
-- la autorizacion. Con UNA sede no se notaba; con dos, cualquier cajero elige.
--
-- POR QUE UN TRIGGER Y NO UNA RPC (decidido el 2026-09-02): una RPC protege el
-- camino que la app usa; el trigger protege LA TABLA. Este hallazgo es
-- exactamente un cliente escribiendo directo a `profiles` sin pasar por la app,
-- y una RPC no lo habria frenado. Mismo criterio que la deuda 24: la garantia
-- en la base, no en la convencion.
--
-- Lo cruzado a OTRA ORGANIZACION ya estaba cerrado (el trigger protege
-- `organization_id`, y `enforce_profile_organization` exige que la pareja
-- sede/org coincida). Lo que faltaba era DENTRO de la organizacion.
--
-- R5: migracion nueva. El cuerpo del trigger NO se reescribe de memoria: sale
-- de `pg_get_functiondef` del texto vivo con el bloque nuevo insertado.
--
-- Verificacion: `tests/rbac-escalada.spec.ts`. El caso positivo ("cambio de
-- sede activa") dejo de estar `test.skip` — la fixture crea la segunda sede —,
-- y el negativo estuvo ROJO antes de esta migracion: el UPDATE del cajero
-- devolvia `error: null` y el traslado se persistia.
-- ============================================================================

begin;

-- ── El helper que hace el SELECT, y por que es SECURITY DEFINER ─────────────
--
-- R6, textual: "una funcion que VALIDA DATOS debe ser SECURITY DEFINER. Sin eso
-- su select pasa por RLS y evalua DATOS FILTRADOS POR EL OBSERVADOR". Es
-- exactamente el caso: la policy de SELECT de `user_stores` filtra por
-- `get_my_organization_id()`, que devuelve NULL para un usuario desactivado —
-- asi que sin DEFINER el mismo dato contestaria distinto segun quien mire, y el
-- rechazo llegaria por la razon equivocada.
--
-- 🔴 Y POR QUE EL HELPER Y NO EL TRIGGER ENTERO — dato MEDIDO, no supuesto
--    (sonda del 2026-09-02, funcion en pg_temp dentro de una transaccion con
--    rollback):
--
--        dentro de SECURITY DEFINER  ->  current_user = postgres
--        dentro de SECURITY INVOKER  ->  current_user = authenticated
--
--    `protect_profile_self_escalation` usa `current_user = 'authenticated'`
--    como condicion de entrada a TODOS sus guards. Marcarlo DEFINER habria
--    hecho que esa condicion diera falso y habria dejado INERTES los tres
--    guards que hoy funcionan (rol, is_active, organization_id): un arreglo de
--    seguridad convertido en una regresion de seguridad, en silencio. El
--    trigger se queda INVOKER; lo que necesita ver sin RLS se aisla aca.
--
-- Es el mismo patron que `get_my_sede_id` / `has_permission`: helpers DEFINER
-- que las policies y los triggers consultan.
create or replace function public.sede_asignada_al_usuario(p_user uuid, p_sede uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $helper$
  select exists (
    select 1 from public.user_stores
     where user_id = p_user and sede_id = p_sede
  )
$helper$;

comment on function public.sede_asignada_al_usuario(uuid, uuid) is
  'Pertenencia usuario->sede leida SIN RLS (R6). La consulta protect_profile_self_escalation para validar un cambio de sede activa. Deuda 61.';

-- Postgres concede EXECUTE a PUBLIC por defecto en toda funcion nueva; en una
-- SECURITY DEFINER hay que revocarlo y conceder solo a quien la necesita.
revoke execute on function public.sede_asignada_al_usuario(uuid, uuid) from public;
grant execute on function public.sede_asignada_al_usuario(uuid, uuid) to authenticated, service_role;

CREATE OR REPLACE FUNCTION public.protect_profile_self_escalation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
    -- 🔴 DEUDA 61 (auditoria A2 §4). Sin esto, un cajero se mudaba SOLO a
    --    cualquier sede de su organizacion: la policy "profiles: editar el
    --    propio" permite el UPDATE y este trigger no miraba `sede_id`. Y la RLS
    --    lo seguia — acto seguido leia los productos de la sede nueva. La
    --    restriccion "solo a una sede de user_stores" vivia UNICAMENTE en
    --    StoreSelector.tsx: la UI ocupando el lugar de la autorizacion.
    --
    --    VALIDA, NO FUERZA (R6): rechaza el UPDATE; no corrige `sede_id` por su
    --    cuenta. Forzar reescribiria en silencio y el resultado dependeria del
    --    orden de disparo de los triggers.
    --
    --    El SELECT va en un helper SECURITY DEFINER a proposito — ver el
    --    comentario de `sede_asignada_al_usuario`, arriba.
    if new.sede_id is distinct from old.sede_id then
      if not public.sede_asignada_al_usuario(new.id, new.sede_id) then
        raise exception 'Esa sede no esta asignada a tu usuario'
          using errcode = 'check_violation';
      end if;
    end if;
  end if;
  return new;
end;
$function$;

commit;
