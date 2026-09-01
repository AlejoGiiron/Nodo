-- ============================================================================
-- register_sale_void v2 — expone `was_fiado`
--
-- 🔴 MIGRACION NUEVA, NO EDICION. La v1 vive en
--    `20260831120700_rpc_de_venta.sql` y esta APLICADA: R5 rige desde el primer
--    push. Este archivo la reemplaza con `create or replace`; el anterior queda
--    como registro historico y no se toca.
--
-- ── QUE CAMBIA, Y ES UNA SOLA COSA ──────────────────────────────────────────
--    El `return jsonb_build_object` suma `was_fiado`. NADA MAS: ni un guard, ni
--    la reversion de stock, ni el borrado de pagos. El cuerpo se copio literal
--    de la v1 para que el diff entre las dos migraciones sea exactamente el
--    cambio, y no haya que leer 170 lineas para saber que se movio.
--
-- ── POR QUE FALTABA ─────────────────────────────────────────────────────────
--    No fue un typo. `register_sale_void` vive en la migracion `rpc_de_venta`, y
--    `orders.payment_status` / `orders.customer_id` los agrega
--    `clientes_y_cartera`, que corre DESPUES. Cuando se escribio la funcion, el
--    fiado NO EXISTIA en el esquema. Es una dependencia de ORDEN que se llevo
--    puesta una clave del contrato.
--
-- ── LO QUE SE VERIFICO ANTES DE ESCRIBIR ESTO ───────────────────────────────
--    Se sospecho un bug de plata: "si nadie usa was_fiado para revertir la
--    deuda, anular una venta a fiado deja al cliente debiendo algo que ya no
--    compro".
--    🔴 NO ES EL CASO, y la razon vale escribirla porque es de diseño:
--
--    · LA DEUDA NO ES UNA ENTIDAD APARTE: ES LA ORDEN. `getDebts` lista
--      `orders` con payment_status in ('pending','partial') Y
--      `cancelled_at is null`. Anular pone `cancelled_at`, asi que la deuda sale
--      de Cartera SOLA. No hay saldo que devolver porque no hay saldo
--      almacenado: se DERIVA.
--    · Y el caso peligroso —una venta a credito CON abonos— NO SE PUEDE ANULAR:
--      la funcion corta con "La venta a credito ya tiene abonos; anulala
--      mediante una devolucion". Fail-closed, y dirige al hecho de negocio
--      correcto en vez de inventar una reversion.
--
--    Entonces `was_fiado` es INFORMATIVO, no operativo: le permite al consumidor
--    distinguir dos casos que se muestran distinto, sin re-consultar la orden
--    —que a esa altura ya esta cancelada—. El sistema ya hacia lo correcto.
--
-- ⚠️ CONTRATO EN TRES LADOS (R1 punto 5b): este jsonb, la interfaz
--    `SaleVoidResult` de `src/lib/supabase-helpers.ts`, y su consumidor en
--    `useSalesHistory`. Los tres se mueven en la misma pasada.
-- ============================================================================

begin;

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
    -- descuenta (migracion `extras_y_alta_de_items`). Sin esto, el envase retornable no volveria.
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
    'payments_deleted', v_payments_del,
    -- v2: la clave que faltaba. Se deriva de v_pay_status, que esta funcion YA
    -- leyo al principio — NO de una consulta nueva: al llegar aca la orden ya
    -- tiene cancelled_at puesto y volver a preguntar daria otra cosa.
    'was_fiado',        (v_pay_status in ('pending', 'partial'))
  );
end;
$$;

-- Los permisos se re-declaran: `create or replace` conserva los del objeto, pero
-- repetirlos deja este archivo autocontenido — no hay que leer la v1 para saber
-- quien puede ejecutarla.
revoke execute on function public.register_sale_void(uuid, text) from public;
revoke execute on function public.register_sale_void(uuid, text) from anon;
grant  execute on function public.register_sale_void(uuid, text) to authenticated;

commit;
