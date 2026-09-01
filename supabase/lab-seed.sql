-- ============================================================================
-- Nodo — Semilla del LABORATORIO de pruebas E2E
--
-- Crea la organización "LAB" con su sede, roles, perfiles y datos mínimos.
-- `tests/global-setup.ts` ABORTA la suite entera si la org del owner no se
-- llama exactamente `LAB`: sin este seed no corre un solo test.
--
-- Ejecutar en: Supabase Studio → SQL Editor. NO es una migración: no cambia el
-- esquema, siembra datos. R5 no aplica; lo que aplica es que sea IDEMPOTENTE.
--
-- ⚠️ NO crea cuentas de Auth. Los usuarios se crean por el panel de Supabase (o
--    por la Edge Function `create-user`) y este script los RECONCILIA: descubre
--    el UID por email y les arma el profile dentro de LAB.
--
-- 🔴 SI FALTA UNA CUENTA, ESTE SEED FALLA EN ROJO Y REVIERTE TODO. No avisa y
--    sigue. La razón es que el SQL Editor muestra su banner de "Success" cuando
--    la transacción commitea, así que un `raise notice` de advertencia queda
--    enterrado en el panel de mensajes y el resultado se LEE COMO ÉXITO — la
--    clase "indistinguible de", en el único lugar donde ya sabemos que va a
--    pasar si se corre el seed antes de crear las cuentas.
--
-- ── 🔴 RESPUESTA A "¿ESTO VA A DIVERGIR DEL ESQUEMA?" ───────────────────────
--    SÍ. Es SQL escrito a mano que nombra tablas y columnas, y nada lo
--    sincroniza: es exactamente la forma de R1, y ya sabemos cómo termina —el
--    catálogo de permisos se heredó roto por esto mismo—.
--    Lo que se hace HOY para que el día que se genere no haya que rehacerlo:
--
--    § 1  DATOS      — qué contiene el laboratorio. Literales, un solo bloque.
--                      NO diverge con el esquema; diverge con los SPECS, que
--                      hardcodean estos nombres. Es la parte que un generador
--                      tomaría como ENTRADA.
--    § 2  ESTRUCTURA — cómo esos datos se mapean al esquema. Nombres de tabla y
--                      columna. Es LA ÚNICA parte que se pudre cuando el
--                      esquema cambia, y la que un generador EMITIRÍA.
--    § 3  POLÍTICA   — los permisos de los roles. **Ya está resuelto**: se
--                      llama a `seed_system_roles(v_org)` y no se enumera ni un
--                      permiso acá. Ver R1 punto 1.
--
--    Separadas así, generar esto mañana es reemplazar § 2 y conservar § 1.
--    ⛔ Mientras no se genere, la deuda sigue viva y está anotada.
-- ============================================================================

-- Atómico: si algo falla, ROLLBACK completo. Un LAB a medias es peor que
-- ninguno — la suite correría contra datos incompletos y culparía a la app.
begin;

-- ════════════════════════════════════════════════════════════════════════════
-- § 1 · DATOS DEL LABORATORIO — lo único que se edita a mano
--
-- ⚠️ Estos nombres están HARDCODEADOS en los specs (`Lab Coctel` ×6,
--    `Lab Vaso` ×2, `Lab Cerveza` ×1). Cambiar uno acá obliga a tocar los 30
--    specs, así que NO se renombran por gusto: son etiquetas de laboratorio, no
--    copy de producto.
--
--    ⚠️ Las CUENTAS sí cambiaron de dominio: `@nodo.test`, no `@gvento.com`. El
--    corolario del renombre protege lo que existe AFUERA y no controlamos —
--    estas cuentas **no existen todavía** y se crean acá. Reusar el dominio de
--    Vento en un proyecto que no es de Vento crea justo la ambigüedad que ese
--    corolario evita: dentro de un año, `owner.test@gvento.com` en la base de
--    Nodo no se distingue de una cuenta ajena mal nombrada.
-- ════════════════════════════════════════════════════════════════════════════
create temporary table _lab_datos on commit drop as
select * from (values
  -- (clave,            valor)
  ('org',               'LAB'),
  ('sede',              'LAB Principal'),
  ('categoria',         'Lab'),
  ('email_owner',       'owner.test@nodo.test'),
  ('email_cajero',      'cajero.test@nodo.test'),
  ('nombre_owner',      'Owner Lab'),
  ('nombre_cajero',     'Cajero Lab')
) as t(clave, valor);

-- Productos del lab. `kind` y `stock_tracking` NO son decoración: los specs
-- dependen de los tres perfiles distintos.
--   Lab Coctel  → compuesto, descuenta 1 Lab Vaso por venta (prueba la receta)
--   Lab Vaso    → insumo con tracking (el que baja)
--   Lab Cerveza → simple SIN tracking (prueba que NO baja)
create temporary table _lab_productos on commit drop as
select * from (values
  ('Lab Coctel',  18000, 'composite', false, 0),
  ('Lab Vaso',        0, 'simple',    true,  1000),
  ('Lab Cerveza',  8000, 'simple',    false, 0)
) as t(name, price, kind, stock_tracking, stock_qty);

-- ════════════════════════════════════════════════════════════════════════════
-- § 2 · ESTRUCTURA — el mapeo al esquema. Esta es la parte que se pudre.
-- ════════════════════════════════════════════════════════════════════════════
do $seed$
declare
  v_org      uuid;
  v_sede     uuid;
  v_cat      uuid;
  v_coctel   uuid;
  v_vaso     uuid;
  v_rol_owner  uuid;
  v_rol_cajero uuid;
  v_uid      uuid;
  v_p        record;
  v_faltan   text := '';
  d          jsonb;
begin
  select jsonb_object_agg(clave, valor) into d from _lab_datos;

  -- ── Organización ─────────────────────────────────────────────────────────
  -- Identidad por NOMBRE: no hay unique en organizations. Patrón "buscar; si no
  -- está, insertar" — el mismo del seed heredado.
  select id into v_org from public.organizations where name = d->>'org';
  if v_org is null then
    insert into public.organizations (name) values (d->>'org') returning id into v_org;
    raise notice 'organizacion % creada', d->>'org';
  end if;

  -- ── Sede ─────────────────────────────────────────────────────────────────
  select id into v_sede from public.sedes
   where organization_id = v_org and name = d->>'sede';
  if v_sede is null then
    insert into public.sedes (organization_id, name) values (v_org, d->>'sede')
      returning id into v_sede;
    raise notice 'sede % creada', d->>'sede';
  end if;

  -- ── § 3 · POLÍTICA: los roles de sistema ────────────────────────────────
  -- 🔴 NO se enumera un solo permiso acá. La función es la fuente única y sale
  --    generada de src/lib/permissions.ts (R1 punto 1). Es idempotente.
  perform public.seed_system_roles(v_org);

  select id into v_rol_owner  from public.roles where organization_id = v_org and name = 'owner';
  select id into v_rol_cajero from public.roles where organization_id = v_org and name = 'cajero';
  if v_rol_owner is null or v_rol_cajero is null then
    raise exception
      'seed_system_roles no dejo los roles owner/cajero en la org %. '
      'Revisa que supabase/seed-system-roles.sql este aplicado.', v_org;
  end if;

  -- ── Catálogo ─────────────────────────────────────────────────────────────
  select id into v_cat from public.categories
   where sede_id = v_sede and name = d->>'categoria';
  if v_cat is null then
    insert into public.categories (sede_id, name) values (v_sede, d->>'categoria')
      returning id into v_cat;
  end if;

  for v_p in select * from _lab_productos loop
    if not exists (select 1 from public.products where sede_id = v_sede and name = v_p.name) then
      insert into public.products
        (sede_id, category_id, name, price, kind, stock_tracking, stock_qty, cost_price)
      values
        (v_sede, v_cat, v_p.name, v_p.price, v_p.kind, v_p.stock_tracking, v_p.stock_qty,
         round(v_p.price * 0.6));
      raise notice 'producto % creado', v_p.name;
    end if;
  end loop;

  select id into v_coctel from public.products where sede_id = v_sede and name = 'Lab Coctel';
  select id into v_vaso   from public.products where sede_id = v_sede and name = 'Lab Vaso';

  -- La receta: 1 Lab Coctel consume 1 Lab Vaso. Es lo que hace que los specs
  -- de stock puedan medir "bajo exactamente 1".
  insert into public.product_components (sede_id, parent_id, component_id, qty)
  values (v_sede, v_coctel, v_vaso, 1)
  on conflict (parent_id, component_id) do nothing;

  -- ── Perfiles: se DESCUBREN por email, no se crean ────────────────────────
  -- El seed no puede crear cuentas de Auth. Si falta una, se anota y se sigue:
  -- fail-closed sobre la suite (los tests van a fallar al no poder loguear) pero
  -- RUIDOSO acá, que es donde se puede leer el motivo.
  select id into v_uid from auth.users where email = d->>'email_owner' limit 1;
  if v_uid is null then
    v_faltan := v_faltan || (d->>'email_owner') || ' ';
  else
    insert into public.profiles
      (id, email, full_name, role, role_id, sede_id, organization_id, is_active)
    values
      (v_uid, d->>'email_owner', d->>'nombre_owner', 'admin', v_rol_owner, v_sede, v_org, true)
    on conflict (id) do update set
      role_id = excluded.role_id, sede_id = excluded.sede_id,
      organization_id = excluded.organization_id, is_active = true;
    insert into public.user_stores (user_id, sede_id) values (v_uid, v_sede)
      on conflict do nothing;
  end if;

  select id into v_uid from auth.users where email = d->>'email_cajero' limit 1;
  if v_uid is null then
    v_faltan := v_faltan || (d->>'email_cajero') || ' ';
  else
    insert into public.profiles
      (id, email, full_name, role, role_id, sede_id, organization_id, is_active)
    values
      (v_uid, d->>'email_cajero', d->>'nombre_cajero', 'cashier', v_rol_cajero, v_sede, v_org, true)
    on conflict (id) do update set
      role_id = excluded.role_id, sede_id = excluded.sede_id,
      organization_id = excluded.organization_id, is_active = true;
    insert into public.user_stores (user_id, sede_id) values (v_uid, v_sede)
      on conflict do nothing;
  end if;

  -- ── Purga de los usuarios que crean los specs ────────────────────────────
  -- `create-user.spec.ts` crea cuentas `e2e-*@nodo.test` y no siempre puede
  -- borrarlas (necesita service role). Se limpian acá.
  -- 🔴 Allowlist por PREFIJO y acotada a la org LAB: NO se borra por "todo lo
  --    que no reconozco". Y el delete va sobre `profiles`, nunca sobre
  --    `auth.users` — borrar cuentas de Auth desde un seed es exactamente el
  --    tipo de objetivo destructivo resuelto por nombre que R2 prohíbe.
  delete from public.profiles
   where organization_id = v_org
     and email like 'e2e-%@nodo.test';

  -- 🔴 FALLA, no avisa. Un `raise notice` dejaria la transaccion en COMMIT y el
  --    SQL Editor mostraria su banner verde de "Success" igual: el aviso queda
  --    enterrado en el panel de mensajes y el resultado se lee como exito.
  --    Eso es la clase "indistinguible de" —el estado defectuoso emitiendo la
  --    senal del sano— en el unico lugar donde ya sabemos que va a pasar.
  --    Con `raise exception` el resultado es ROJO y la transaccion se revierte:
  --    no queda un LAB a medias, que la cabecera de este archivo dice que es
  --    peor que ninguno.
  if v_faltan <> '' then
    raise exception
      'SEED INCOMPLETO — faltan cuentas de Auth: %'
      '  Crealas en Supabase Studio > Authentication > Users (con Auto Confirm)'
      '  y volve a correr este seed. NADA se sembro: la transaccion se revirtio'
      '  entera, a proposito, para que no quede un LAB a medias.', v_faltan;
  end if;

  raise notice 'LAB listo: org=% sede=%', v_org, v_sede;
end
$seed$;

commit;
