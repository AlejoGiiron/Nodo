-- ============================================================================
-- Nodo — Semilla del LABORATORIO · PARTE A: organización, sede y roles
--
-- 🔴 POR QUÉ EL SEED ESTÁ PARTIDO EN DOS — es un ARRANQUE EN FRÍO, no un
--    capricho de organización:
--
--    El trigger `handle_new_user` EXIGE `sede_id` en el `user_metadata` de la
--    cuenta de Auth, y falla si la sede no existe. Pero la sede la crea este
--    seed. Entonces:
--      · No se puede crear la cuenta antes de la sede → falta el `sede_id`.
--      · No se pueden armar los perfiles antes de la cuenta → no hay UID.
--    La única salida es en dos tiempos, con la creación de cuentas EN EL MEDIO.
--
--    ⚠️ Esto NO es un problema del laboratorio: le pasa a **cada organización
--    nueva** de Nodo. Está anotado como deuda en `docs/DEUDAS.md`.
--
-- ORDEN COMPLETO:
--    1. Esta PARTE A          → crea org, sede y roles. Imprime el UUID de la sede.
--    2. Crear las 2 cuentas   → Studio > Authentication > Users (ver la salida).
--    3. `lab-seed-b.sql`      → perfiles, catálogo y purga.
--
-- Idempotente: se puede re-correr sin duplicar.
-- ============================================================================

begin;

do $seed_a$
declare
  v_org  uuid;
  v_sede uuid;
  c_org  constant text := 'LAB';
  c_sede constant text := 'LAB Principal';
begin
  -- Identidad por NOMBRE: no hay unique en organizations/sedes. Patrón
  -- "buscar; si no está, insertar".
  select id into v_org from public.organizations where name = c_org;
  if v_org is null then
    insert into public.organizations (name) values (c_org) returning id into v_org;
    raise notice 'organizacion % creada', c_org;
  end if;

  select id into v_sede from public.sedes
   where organization_id = v_org and name = c_sede;
  if v_sede is null then
    insert into public.sedes (organization_id, name) values (v_org, c_sede)
      returning id into v_sede;
    raise notice 'sede % creada', c_sede;
  end if;

  -- Los roles de sistema. 🔴 NO se enumera un solo permiso acá: la función es la
  -- fuente única y sale generada de src/lib/permissions.ts (R1 punto 1).
  perform public.seed_system_roles(v_org);

  -- Guard fail-closed: si la función no dejó los roles, seguir sería sembrar un
  -- LAB sin RBAC y descubrirlo recién cuando un test no pueda hacer nada.
  if not exists (select 1 from public.roles where organization_id = v_org and name = 'owner')
     or not exists (select 1 from public.roles where organization_id = v_org and name = 'cajero') then
    raise exception
      'seed_system_roles no dejo los roles owner/cajero en la org %.'
      '  Revisa que supabase/seed-system-roles.sql este aplicado en esta base.', v_org;
  end if;

  raise notice ' ';
  raise notice '════════════════════════════════════════════════════════════';
  raise notice ' PARTE A LISTA.  org=%  sede=%', v_org, v_sede;
  raise notice ' ';
  raise notice ' AHORA: Studio > Authentication > Users > Add user';
  raise notice '        Marca "Auto Confirm User" (sin eso no pueden loguear).';
  raise notice ' ';
  raise notice '   owner.test@nodo.test    User Metadata:';
  raise notice '   {"sede_id": "%", "role": "admin", "full_name": "Owner Lab"}', v_sede;
  raise notice ' ';
  raise notice '   cajero.test@nodo.test   User Metadata:';
  raise notice '   {"sede_id": "%", "role": "cashier", "full_name": "Cajero Lab"}', v_sede;
  raise notice ' ';
  raise notice ' El metadata NO es opcional: handle_new_user EXIGE sede_id y role,';
  raise notice ' y rechaza la cuenta si faltan. Es fail-closed a proposito — un rol';
  raise notice ' implicito seria una autorizacion que nadie decidio.';
  raise notice ' ';
  raise notice ' DESPUES: correr supabase/lab-seed-b.sql';
  raise notice '════════════════════════════════════════════════════════════';
end
$seed_a$;

commit;
