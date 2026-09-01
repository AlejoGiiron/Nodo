-- ============================================================
-- G-Nexo — Esquema base · 06b · RPC de venta: cobro y anulacion
--
-- ORIGEN: G-Vento `d848852`, supabase/register-sale-payment.sql y
-- supabase/register-sale-void.sql.
--
-- 🔴 ESTE ARCHIVO NO ESTABA EN EL PLAN DE 12 — es la TERCERA enmienda, y la
--    encontro el archivo 11: al negar la escritura directa de `payments`, quedo
--    a la vista que la consolidacion nunca escribio estas dos RPC, aunque el
--    plan las clasifico y les asigno el archivo 06. Sin ellas, con las policies
--    puestas, COBRAR UNA VENTA ES IMPOSIBLE.
--
--    Se numera 06b y no se renumera lo commiteado. La leccion accionable —una
--    verificacion de que toda RPC nombrada en el plan exista— esta en
--    docs/plan-esquema-base.md.
--
-- R5: no aplicado en G-Nexo (base vacia). Desde el primer `db push`, R5 manda.
--
-- ── IDEMPOTENCIA: COMO LA RESUELVE EL HEREDADO, Y QUE NO RESUELVE ─────────
-- Verificado antes de escribir, no inventado. Las dos se protegen por RECHAZO
-- EXPLICITO, no por idempotencia real:
--   · cobro:     si la venta ya tiene pagos → excepcion.
--   · anulacion: si la venta ya esta anulada → excepcion.
--
-- Eso cierra el agujero que importa —cobrar dos veces, devolver stock dos
-- veces— y falla ruidoso, que es lo correcto para plata.
--
-- ⚠️ PERO NO ES IDEMPOTENCIA EN EL SENTIDO DE REINTENTO: si la respuesta se
--    pierde por un timeout de red y el cliente reintenta, recibe un ERROR, no
--    un exito. El llamador no puede distinguir "ya lo hice yo" de "lo hizo
--    otro". Se conserva el comportamiento heredado —es fail-closed y no
--    duplica dinero— y se anota el limite en vez de inventar un mecanismo de
--    claves de idempotencia que nadie pidio.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- register_sale_payment — cobro de una venta de contado
--
-- 🔴 CAMBIO: el gate pasa de `get_my_role() in ('admin','cashier')` a
--    `has_permission('pos.vender')`. El propio archivo heredado lo pedia:
--    "Deuda anotada: pasar a has_permission cuando se elimine el enum". Y es la
--    causa mecanica del residuo de G-Vento —las policies miraban el enum, asi
--    que el catalogo no enforceaba nada—. Coherente con el archivo 11.
-- ------------------------------------------------------------
create or replace function public.register_sale_payment(
  p_order_id uuid,
  p_payments jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sede_id     uuid := get_my_sede_id();
  v_order_total numeric(12, 2);
  v_pay_status  text;
  v_sum         numeric(12, 2);
  v_bad         int;
  v_count       int;
begin
  if v_sede_id is null then
    raise exception 'No tienes una sede activa';
  end if;
  if not has_permission('pos.vender') then
    raise exception 'No autorizado para registrar cobros';
  end if;

  select o.total, o.payment_status
    into v_order_total, v_pay_status
  from public.orders o
  where o.id = p_order_id and o.sede_id = v_sede_id;

  if not found then
    raise exception 'La venta no existe o no pertenece a tu sede';
  end if;

  -- Solo ventas de CONTADO. La venta a credito se salda con abonos
  -- (register_debt_payment): no debe crear payments por esta via.
  if v_pay_status <> 'paid' then
    raise exception
      'La venta no es de contado (estado de pago: %). El credito se salda con abonos.',
      v_pay_status;
  end if;

  -- 🔴 EL GUARD QUE IMPIDE EL DOBLE COBRO. Ver la cabecera.
  if exists (select 1 from public.payments where order_id = p_order_id) then
    raise exception 'La venta ya tiene pagos registrados';
  end if;

  if p_payments is null or jsonb_typeof(p_payments) <> 'array'
     or jsonb_array_length(p_payments) = 0 then
    raise exception 'Debe enviar al menos una linea de pago';
  end if;

  -- Allowlist de metodo + monto positivo, en una pasada.
  select count(*) into v_bad
  from jsonb_array_elements(p_payments) e
  where coalesce(e->>'method', '') not in ('cash', 'card', 'transfer', 'nequi')
     or coalesce((e->>'amount')::numeric, 0) <= 0;

  if v_bad > 0 then
    raise exception 'Lineas con metodo invalido o monto no positivo';
  end if;

  -- La suma se compara contra el total DE LA BD, no contra uno del JSON: el
  -- cliente no decide cuanto vale la venta.
  select coalesce(sum((e->>'amount')::numeric), 0) into v_sum
  from jsonb_array_elements(p_payments) e;

  if round(v_sum, 2) <> round(v_order_total, 2) then
    raise exception 'La suma de pagos (%) no cuadra con el total (%)', v_sum, v_order_total;
  end if;

  insert into public.payments (order_id, sede_id, method, amount)
  select p_order_id,
         v_sede_id,
         (e->>'method')::public.payment_method,
         (e->>'amount')::numeric(12, 2)
  from jsonb_array_elements(p_payments) e;

  get diagnostics v_count = row_count;

  return jsonb_build_object(
    'order_id',         p_order_id,
    'payments_created', v_count,
    'total',            v_order_total
  );
end;
$$;

revoke execute on function public.register_sale_payment(uuid, jsonb) from public;
revoke execute on function public.register_sale_payment(uuid, jsonb) from anon;
grant  execute on function public.register_sale_payment(uuid, jsonb) to authenticated;


-- ------------------------------------------------------------
-- register_sale_void — anulacion de una venta de la jornada actual
--
-- La reversion de stock es ESPEJO EXACTO de add_order_items_with_extras
-- (archivo 07b): simple, compuesto por componentes, y el producto vinculado a
-- un extra. Si una rama del alta no tiene su reversa, el stock queda mal y no
-- avisa — es un contrato entre las dos funciones.
--
-- La venta NUNCA se borra: se marca con cancelled_at. El historico es lo unico
-- que hace auditable la caja.
-- ------------------------------------------------------------
create or replace function public.register_sale_void(
  p_order_id uuid,
  p_reason   text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sede_id        uuid := get_my_sede_id();
  v_actor          uuid := auth.uid();
  v_order_sede     uuid;
  v_created_at     timestamptz;
  v_cancelled_at   timestamptz;
  v_pay_status     text;
  v_jornada_opened timestamptz;
  v_oi             record;
  v_comp           record;
  v_ex             record;
  v_kind           text;
  v_tracking       boolean;
  v_ex_tracking    boolean;
  v_comp_total     integer;
  v_stock_returned int := 0;
  v_payments_del   int := 0;
begin
  if v_sede_id is null then
    raise exception 'No tienes una sede activa';
  end if;
  if not has_permission('ventas.anular') then
    raise exception 'No autorizado para anular ventas';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'La anulacion requiere un motivo';
  end if;

  select o.sede_id, o.created_at, o.cancelled_at, o.payment_status
    into v_order_sede, v_created_at, v_cancelled_at, v_pay_status
  from public.orders o
  where o.id = p_order_id and o.sede_id = v_sede_id;

  if not found then
    raise exception 'La venta no existe o no pertenece a tu sede';
  end if;

  -- 🔴 EL GUARD QUE IMPIDE LA DOBLE ANULACION (y con ella, devolver stock dos
  -- veces). Ver la cabecera.
  if v_cancelled_at is not null then
    raise exception 'La venta ya esta anulada';
  end if;

  -- La anulacion solo aplica a la jornada ACTUAL. Anular una venta de una
  -- jornada ya cerrada reescribiria un arqueo firmado: para eso va una
  -- devolucion, que es otro hecho de negocio y deja su propio rastro.
  select j.opened_at into v_jornada_opened
  from public.jornadas j
  where j.sede_id = v_sede_id and j.closed_at is null
  order by j.opened_at desc
  limit 1;

  if not found then
    raise exception 'Abri la jornada de caja antes de anular una venta'
      using errcode = 'check_violation';
  end if;
  if v_created_at < v_jornada_opened then
    raise exception
      'Esta venta pertenece a una jornada cerrada y no puede anularse; para corregirla se necesita una devolucion';
  end if;

  if exists (select 1 from public.debt_payments where order_id = p_order_id) then
    raise exception 'La venta a credito ya tiene abonos; anulala mediante una devolucion';
  end if;

  -- ── Reversion de stock, espejo del alta ──────────────────────────────────
  for v_oi in
    select id, product_id, qty
    from public.order_items
    where order_id = p_order_id
  loop
    select kind, stock_tracking
      into v_kind, v_tracking
    from public.products
    where id = v_oi.product_id and sede_id = v_sede_id;

    if found and v_oi.qty > 0 then
      if v_kind = 'simple' then
        if v_tracking then
          update public.products
          set stock_qty = coalesce(stock_qty, 0) + v_oi.qty
          where id = v_oi.product_id and sede_id = v_sede_id;

          insert into public.stock_movements
            (sede_id, product_id, type, qty, reference_id, notes, created_by)
          values
            (v_sede_id, v_oi.product_id, 'return', v_oi.qty, p_order_id,
             'Anulacion de venta', v_actor);
          v_stock_returned := v_stock_returned + 1;
        end if;

      elsif v_kind = 'composite' then
        for v_comp in
          select pc.component_id, pc.qty as component_qty
          from public.product_components pc
          join public.products p on p.id = pc.component_id
          where pc.parent_id = v_oi.product_id
            and pc.sede_id   = v_sede_id
            and p.stock_tracking = true
        loop
          v_comp_total := v_comp.component_qty * v_oi.qty;

          update public.products
          set stock_qty = coalesce(stock_qty, 0) + v_comp_total
          where id = v_comp.component_id and sede_id = v_sede_id;

          insert into public.stock_movements
            (sede_id, product_id, type, qty, reference_id, notes, created_by)
          values
            (v_sede_id, v_comp.component_id, 'return', v_comp_total, p_order_id,
             'Anulacion de venta', v_actor);
          v_stock_returned := v_stock_returned + 1;
        end loop;
      end if;
    end if;

    -- Extras con producto vinculado: tienen su reversa porque el alta los
    -- descuenta (archivo 07b). Sin esto, el envase retornable no volveria.
    for v_ex in
      select oie.qty as ex_qty, e.linked_product_id
      from public.order_item_extras oie
      join public.extras e on e.id = oie.extra_id
      where oie.order_item_id = v_oi.id
    loop
      if v_ex.linked_product_id is not null and v_ex.ex_qty > 0 then
        select stock_tracking into v_ex_tracking
        from public.products
        where id = v_ex.linked_product_id and sede_id = v_sede_id;

        if found and v_ex_tracking then
          update public.products
          set stock_qty = coalesce(stock_qty, 0) + v_ex.ex_qty
          where id = v_ex.linked_product_id and sede_id = v_sede_id;

          insert into public.stock_movements
            (sede_id, product_id, type, qty, reference_id, notes, created_by)
          values
            (v_sede_id, v_ex.linked_product_id, 'return', v_ex.ex_qty, p_order_id,
             'Anulacion de venta (extra)', v_actor);
          v_stock_returned := v_stock_returned + 1;
        end if;
      end if;
    end loop;
  end loop;

  -- Los pagos se BORRAN: la venta anulada no cobro nada. `payments` no tiene
  -- update por diseño, asi que corregir es borrar y recrear — y acá no se
  -- recrea. La huella queda en la orden (cancelled_at, cancelled_by, motivo),
  -- no en un pago fantasma.
  delete from public.payments where order_id = p_order_id;
  get diagnostics v_payments_del = row_count;

  update public.orders
     set cancelled_at  = now(),
         cancelled_by  = v_actor,
         cancel_reason = btrim(p_reason),
         status        = 'cancelled'
   where id = p_order_id;

  return jsonb_build_object(
    'order_id',         p_order_id,
    'stock_returned',   v_stock_returned,
    'payments_deleted', v_payments_del
  );
end;
$$;

revoke execute on function public.register_sale_void(uuid, text) from public;
revoke execute on function public.register_sale_void(uuid, text) from anon;
grant  execute on function public.register_sale_void(uuid, text) to authenticated;

commit;
