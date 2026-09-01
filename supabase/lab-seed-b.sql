-- ============================================================================
-- Nodo — Semilla del LABORATORIO · PARTE B: perfiles, catálogo y purga
--
-- Corre DESPUÉS de `lab-seed-a.sql` y DESPUÉS de crear las dos cuentas de Auth.
-- Ver la cabecera de la parte A para el porqué del arranque en frío.
--
-- ⚠️ El PROFILE ya existe cuando esto corre: lo creó el trigger
--    `handle_new_user` al crearse la cuenta, derivando `organization_id` de la
--    sede. Esta parte NO lo crea: **reconcilia** lo que el trigger no puede
--    saber — el `role_id` de RBAC — y agrega `user_stores`.
--
-- Idempotente: se puede re-correr sin duplicar.
--
-- ── LAS TRES SECCIONES (ver la cabecera de la parte A sobre la divergencia) ──
--    § 1 DATOS      qué contiene el lab. Literales. Entrada de un futuro generador.
--    § 2 ESTRUCTURA el mapeo al esquema. La única parte que se pudre.
--    § 3 POLÍTICA   ya resuelta en la parte A por `seed_system_roles`.
-- ============================================================================

begin;

-- ════════════════════════════════════════════════════════════════════════════
-- § 1 · DATOS DEL LABORATORIO — lo único que se edita a mano
--
-- ⚠️ Estos nombres están HARDCODEADOS en los specs (`Lab Coctel` ×6,
--    `Lab Vaso` ×2, `Lab Cerveza` ×1). Cambiar uno obliga a tocar los 30 specs:
--    son etiquetas de laboratorio, no copy de producto.
--
-- ⚠️ Dominio `@nodo.test`, NO `@gvento.com`. El corolario del renombre protege
--    lo que existe afuera y no controlamos; estas cuentas se crean para Nodo.
--    Reusar el dominio de Vento haría que, dentro de un año, nadie distinga una
--    cuenta ajena de una mal nombrada.
-- ════════════════════════════════════════════════════════════════════════════
create temporary table _lab_datos on commit drop as
select * from (values
  ('org',           'LAB'),
  ('sede',          'LAB Principal'),
  ('categoria',     'Lab'),
  ('email_owner',   'owner.test@nodo.test'),
  ('email_cajero',  'cajero.test@nodo.test')
) as t(clave, valor);

-- `kind` y `stock_tracking` NO son decoración: los specs dependen de los tres
-- perfiles distintos.
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
do $seed_b$
declare
  v_org        uuid;
  v_sede       uuid;
  v_cat        uuid;
  v_coctel     uuid;
  v_vaso       uuid;
  v_rol_owner  uuid;
  v_rol_cajero uuid;
  v_uid        uuid;
  v_p          record;
  v_faltan     text := '';
  d            jsonb;
begin
  select jsonb_object_agg(clave, valor) into d from _lab_datos;

  -- ── Precondición: la parte A tiene que haber corrido ────────────────────
  select id into v_org  from public.organizations where name = d->>'org';
  if v_org is null then
    raise exception
      'No existe la organizacion %. Corre primero supabase/lab-seed-a.sql.', d->>'org';
  end if;

  select id into v_sede from public.sedes
   where organization_id = v_org and name = d->>'sede';
  if v_sede is null then
    raise exception
      'No existe la sede % en la org %. Corre primero supabase/lab-seed-a.sql.',
      d->>'sede', d->>'org';
  end if;

  select id into v_rol_owner  from public.roles where organization_id = v_org and name = 'owner';
  select id into v_rol_cajero from public.roles where organization_id = v_org and name = 'cajero';
  if v_rol_owner is null or v_rol_cajero is null then
    raise exception
      'Faltan los roles de sistema en la org %. Corre supabase/lab-seed-a.sql.', v_org;
  end if;

  -- ── Perfiles: se RECONCILIAN, no se crean ───────────────────────────────
  -- El trigger handle_new_user ya creó el profile con role/sede/organization al
  -- crearse la cuenta. Lo que el trigger NO puede saber es el role_id de RBAC:
  -- eso se completa acá.
  --
  -- 🔴 Si falta una cuenta, esto FALLA EN ROJO y revierte todo. Un `raise
  --    notice` dejaría la transaccion en COMMIT y el SQL Editor mostraria su
  --    banner de "Success" igual: el aviso quedaria enterrado en el panel de
  --    mensajes y el resultado SE LEERIA COMO EXITO — la clase "indistinguible
  --    de", justo donde ya sabemos que va a pasar si se corre esto antes de
  --    crear las cuentas.
  select id into v_uid from auth.users where email = d->>'email_owner' limit 1;
  if v_uid is null then
    v_faltan := v_faltan || (d->>'email_owner') || ' ';
  else
    update public.profiles
       set role_id = v_rol_owner, sede_id = v_sede,
           organization_id = v_org, is_active = true
     where id = v_uid;
    insert into public.user_stores (user_id, sede_id) values (v_uid, v_sede)
      on conflict do nothing;
  end if;

  select id into v_uid from auth.users where email = d->>'email_cajero' limit 1;
  if v_uid is null then
    v_faltan := v_faltan || (d->>'email_cajero') || ' ';
  else
    update public.profiles
       set role_id = v_rol_cajero, sede_id = v_sede,
           organization_id = v_org, is_active = true
     where id = v_uid;
    insert into public.user_stores (user_id, sede_id) values (v_uid, v_sede)
      on conflict do nothing;
  end if;

  if v_faltan <> '' then
    raise exception
      'SEED INCOMPLETO — faltan cuentas de Auth: %'
      '  Crealas en Studio > Authentication > Users con Auto Confirm y el'
      '  user_metadata que imprimio lab-seed-a.sql, y volve a correr esto.'
      '  NADA se sembro: la transaccion se revirtio entera, a proposito.', v_faltan;
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

  -- La receta: 1 Lab Coctel consume 1 Lab Vaso. Es lo que permite que los specs
  -- de stock midan "bajó exactamente 1".
  insert into public.product_components (sede_id, parent_id, component_id, qty)
  values (v_sede, v_coctel, v_vaso, 1)
  on conflict (parent_id, component_id) do nothing;

  -- ── Purga de los usuarios que crean los specs ───────────────────────────
  -- 🔴 Allowlist por PREFIJO y acotada a la org LAB: no se borra "todo lo que no
  --    reconozco". Y va sobre `profiles`, NUNCA sobre `auth.users` — borrar
  --    cuentas de Auth desde un seed es el objetivo destructivo resuelto por
  --    nombre que R2 prohíbe.
  delete from public.profiles
   where organization_id = v_org
     and email like 'e2e-%@nodo.test';

  raise notice ' ';
  raise notice 'LAB LISTO.  org=%  sede=%', v_org, v_sede;
  raise notice 'Ya podes definir .env.test y correr: pnpm test:e2e';
end
$seed_b$;

commit;
