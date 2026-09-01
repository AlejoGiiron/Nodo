-- ============================================================================
-- VERIFICACIÓN DE LAS RPC CONTRA LA BASE YA APLICADA
--
-- 🔴 POR QUÉ EXISTE, en una línea:
--    Postgres NO valida los cuerpos plpgsql al crear la función. Una RPC puede
--    nombrar una tabla, una columna o una función que no existe y **crearse
--    igual, sin una advertencia**. El error aparece recién al EJECUTARLA.
--    Un `db push` verde es un proxy del esquema funcionando, no el esquema
--    funcionando (R4).
--
-- ── QUÉ PRUEBA Y QUÉ NO ─────────────────────────────────────────────────────
--    ✅ RESOLUCIÓN: que cada cuerpo encuentre las tablas, columnas y funciones
--       que nombra. Los dos mensajes que NO queremos ver son
--       `relation ... does not exist` y `column ... does not exist`.
--    ❌ NO prueba que las policies NIEGUEN lo que deben negar. Eso es E2E.
--    ❌ NO prueba la lógica de negocio (promedio ponderado, cuadres). Eso es E2E.
--
-- ── POR QUÉ SE IMPERSONA AL OWNER ───────────────────────────────────────────
--    Las RPC autorizan por `auth.uid()`: `register_purchase` aborta con
--    "No tienes una sede activa" antes de tocar una sola tabla si no hay sesión.
--    Correrlas sin sesión probaría solo las tres primeras líneas de cada cuerpo
--    — un verde que no puede salir mal donde importa.
--    Por eso se fija `request.jwt.claims` y se toma el rol `authenticated`.
--    Precedente en el repo: la sonda `_t_priv` del esquema heredado usaba
--    `set local role authenticated` para exactamente esto.
--
-- ── CÓMO SE CORRE ───────────────────────────────────────────────────────────
--    Supabase Studio → SQL Editor → pegar todo → Run.
--    Todo va dentro de UNA transacción que termina en **ROLLBACK**: no deja
--    datos. La resolución de un cuerpo plpgsql ocurre al ejecutarlo, así que
--    revertir prueba exactamente lo mismo que confirmar.
--    Los `raise notice` van al panel de mensajes. **El último notice antes de un
--    error dice qué RPC lo tiró.**
--
-- ⚠️ ESTE ARCHIVO NO SE EJECUTÓ NUNCA. Se escribió con las firmas verificadas
--    contra `supabase/migrations/`, no de memoria —ese chequeo ya corrigió dos
--    errores: `register_purchase` toma DOS jsonb, y la columna es
--    `products.stock_qty`, no `stock`—. Pero R4 vale también acá: hasta que
--    corra, esto es una declaración. Si falla por una firma o un fixture, el
--    error lo dice con nombre propio y se arregla; eso NO es un esquema roto.
--    Lo que importa distinguir:
--      · `relation/column does not exist`  → 🔴 la migración creó una función rota
--      · cualquier otro error              → ⚠️ este script, o un guard haciendo
--                                              su trabajo
-- ============================================================================

begin;

do $verificacion$
declare
  v_user   uuid;
  v_sede   uuid;
  v_org    uuid;
  v_cat    uuid;
  v_prod   uuid;
  v_insumo uuid;
  v_extra  uuid;
  v_order  uuid;
  v_cred   uuid;
  v_jorn   uuid;
  v_cli    uuid;
  v_prov   uuid;
  v_num    integer;
  v_ok     boolean;
begin
  -- ── 0 · Precondición: fail-closed ────────────────────────────────────────
  select p.id, p.sede_id, p.organization_id
    into v_user, v_sede, v_org
    from public.profiles p
   order by p.created_at
   limit 1;

  if v_user is null then
    raise exception
      'PRECONDICION NO CUMPLIDA: no hay ningun perfil. Crea el primer usuario '
      'desde la app y volve a correr esto. Sin perfil, un verde aca no '
      'significaria nada.';
  end if;

  raise notice '== contexto: user=% sede=% org=%', v_user, v_sede, v_org;

  -- ── 1 · Fixtures, ANTES de bajar de privilegios ─────────────────────────
  insert into public.categories (sede_id, name)
       values (v_sede, 'VERIF Categoria') returning id into v_cat;

  insert into public.products (sede_id, category_id, name, price, kind, stock_tracking, stock_qty, cost_price)
       values (v_sede, v_cat, 'VERIF Producto', 10000, 'simple', true, 100, 6000)
    returning id into v_prod;

  insert into public.products (sede_id, category_id, name, price, kind, stock_tracking, stock_qty, cost_price)
       values (v_sede, v_cat, 'VERIF Insumo', 0, 'simple', true, 100, 500)
    returning id into v_insumo;

  insert into public.extras (sede_id, name, price, linked_product_id)
       values (v_sede, 'VERIF Extra', 1000, v_insumo) returning id into v_extra;

  insert into public.customers (sede_id, name)
       values (v_sede, 'VERIF Cliente') returning id into v_cli;

  insert into public.suppliers (sede_id, name)
       values (v_sede, 'VERIF Proveedor') returning id into v_prov;

  insert into public.jornadas (sede_id, opened_by, opening_amount)
       values (v_sede, v_user, 50000) returning id into v_jorn;

  insert into public.orders (sede_id, created_by, canal, status, total)
       values (v_sede, v_user, 'mostrador', 'pending', 0) returning id into v_order;

  insert into public.orders (sede_id, created_by, canal, status, total, customer_id, payment_status)
       values (v_sede, v_user, 'mostrador', 'pending', 20000, v_cli, 'pending')
    returning id into v_cred;

  -- ── 2 · seed_system_roles ───────────────────────────────────────────────
  -- ⚠️ Vive en supabase/seed-system-roles.sql (GENERADO), NO en migrations/.
  --    Si tira "function does not exist", ese archivo no se aplicó: no es una
  --    función rota, es una que falta correr.
  raise notice '-> seed_system_roles';
  perform public.seed_system_roles(v_org);

  -- ── 3 · Impersonar al owner ─────────────────────────────────────────────
  -- Sin esto, las RPC abortan en su primer guard y el resto del cuerpo NUNCA
  -- se resuelve: sería un verde que no puede salir mal donde importa.
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_user::text, 'role', 'authenticated')::text,
    true   -- true = local a la transacción
  );
  set local role authenticated;
  raise notice '== impersonando al owner (auth.uid() = %)', v_user;

  -- ── 4 · get_my_* y has_permission ───────────────────────────────────────
  raise notice '-> get_my_sede_id';         perform public.get_my_sede_id();
  raise notice '-> get_my_organization_id'; perform public.get_my_organization_id();
  raise notice '-> get_my_role';            perform public.get_my_role();
  raise notice '-> has_permission';
  select public.has_permission('pos.vender') into v_ok;
  raise notice '   has_permission(pos.vender) = %  (el owner tiene comodin)', v_ok;

  -- ── 5 · next_order_number ───────────────────────────────────────────────
  raise notice '-> next_order_number';
  select public.next_order_number(v_sede) into v_num;
  raise notice '   next_order_number = %', v_num;

  -- ── 6 · add_order_items_with_extras ─────────────────────────────────────
  raise notice '-> add_order_items_with_extras';
  perform public.add_order_items_with_extras(
    v_order,
    jsonb_build_array(jsonb_build_object(
      'product_id', v_prod,
      'qty', 1,
      'unit_price', 10000,
      'notes', null,
      'extras', jsonb_build_array(jsonb_build_object(
        'extra_id', v_extra, 'qty', 1, 'unit_price', 1000))
    ))
  );

  -- ── 7 · register_sale_payment ───────────────────────────────────────────
  raise notice '-> register_sale_payment';
  perform public.register_sale_payment(
    v_order,
    jsonb_build_array(jsonb_build_object('method', 'cash', 'amount', 11000))
  );

  -- ── 8 · register_sale_void ──────────────────────────────────────────────
  raise notice '-> register_sale_void';
  perform public.register_sale_void(v_order, 'VERIF: anulacion de prueba');

  -- ── 9 · adjust_stock ────────────────────────────────────────────────────
  raise notice '-> adjust_stock';
  perform public.adjust_stock(v_prod, 5, 'VERIF: ajuste de prueba');

  -- ── 10 · register_purchase ──────────────────────────────────────────────
  -- Firma verificada: DOS jsonb. p_invoice lleva supplier_id / invoice_number /
  -- notes; p_items es un array de {product_id, qty, unit_cost}.
  raise notice '-> register_purchase';
  perform public.register_purchase(
    jsonb_build_object(
      'supplier_id', v_prov,
      'invoice_number', 'VERIF-001',
      'notes', 'verificacion de RPC'),
    jsonb_build_array(jsonb_build_object(
      'product_id', v_prod, 'qty', 10, 'unit_cost', 7000))
  );

  -- ── 11 · register_debt_payment ──────────────────────────────────────────
  raise notice '-> register_debt_payment';
  perform public.register_debt_payment(v_cred, 5000, 'cash');

  reset role;

  raise notice ' ';
  raise notice '=========================================================';
  raise notice ' TODAS LAS RPC RESOLVIERON.';
  raise notice ' Ninguna tiro "relation does not exist" ni "column does';
  raise notice ' not exist" — que es lo unico que este script prueba.';
  raise notice ' Autorizacion y logica de negocio: eso es E2E.';
  raise notice '=========================================================';
end
$verificacion$;

-- 🔴 ROLLBACK, no commit. Ver la cabecera.
rollback;
