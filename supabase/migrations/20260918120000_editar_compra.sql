-- ============================================================================
-- Editar una compra ya registrada: ítems, proveedor, N.° de factura, fecha y
-- notas. Pedido por la clienta (2026-09-17): está teniendo errores de
-- digitación mientras se acopla al sistema, y necesita que EL DOCUMENTO
-- ORIGINAL cambie.
-- ============================================================================
--
-- 🔴 ESTO ES UNA EXCEPCIÓN DECIDIDA A «LA HISTORIA NO SE REESCRIBE».
--    Decidida por Alejandro el 2026-09-17, eligiendo la ventana «siempre» entre
--    tres (jornada abierta · sin movimientos posteriores · siempre). Lo que se
--    reescribe y lo que NO, para que nadie lo lea como un olvido:
--
--    SE REESCRIBE   el documento: purchase_invoice_items, total, proveedor,
--                   invoice_number, document_date, notes. Queda edited_at /
--                   edited_by para que la pantalla diga que se editó.
--    SE AGREGA      la diferencia de STOCK, como movimiento 'adjustment' que
--                   nombra la compra (reference_id = la compra), y la diferencia
--                   de PLATA, como movimiento 'correccion_compra' en la jornada
--                   ABIERTA. Los movimientos originales no se tocan: el arqueo
--                   de una jornada cerrada sigue siendo el que se imprimió.
--    NO SE TOCA     order_items.unit_cost de las ventas ya hechas: es la
--                   utilidad que ya ocurrió (R1 punto 8).
--
-- ⚠️ EL COSTO PROMEDIO ES EXACTO SÓLO SI LA COMPRA FUE LO ÚLTIMO QUE MOVIÓ EL
--    PRODUCTO. Se deshace la contribución vieja y se aplica la nueva sobre la
--    existencia de hoy:
--       S_base = stock_hoy − unidades_viejas
--       C_base = (costo_hoy × stock_hoy − subtotal_viejo) / S_base
--    Si después de la compra hubo ventas o compras, esa cuenta es una
--    APROXIMACIÓN (el promedio real dependió del orden). Si C_base da negativo
--    —pasa cuando se vendió mucho entre medio— se toma el costo de hoy como
--    base. Es la consecuencia aceptada de la ventana «siempre».
--
-- R0
-- 1 · CLASE — validar, no forzar: los mismos guards de register_purchase
--     (sede, permiso, fecha, jornada, proveedor, ítems, factor), y dos más.
-- 2 · PRECEDENTE — register_purchase (20260917210000) y
--     register_purchase_return (20260902220000).
-- 3 · MODO DE FALLO — editar una compra que YA TIENE DEVOLUCIONES dejaría a la
--     devolución devolviendo algo que la compra ya no tiene: falla CALLADO. ⇒
--     se rechaza. Editar la compra de otra sede ⇒ se rechaza por sede.
-- 4 · OBJETIVO — la compra por UUID, acotada por sede_id = get_my_sede_id().
-- ============================================================================

begin;

-- ── 1 · Rastro de la edición ───────────────────────────────────────────────
alter table public.purchase_invoices
  add column edited_at timestamptz,
  add column edited_by uuid references public.profiles on delete set null;

comment on column public.purchase_invoices.edited_at is
  'Ultima vez que el documento se edito con update_purchase. Nulo = nunca.';

-- ── 2 · La plata de una corrección tiene categoría propia ──────────────────
-- Ni 'compra' (no es una compra nueva) ni 'devolucion_compra' (la mercancía no
-- volvió al proveedor: fue un error de digitación). Mismo criterio que separó
-- 'devolucion_compra': un valor que significa dos cosas no es un dato.
-- Definición vieja: 20260902210000, sin cambios desde entonces.
alter table public.cash_movements drop constraint chk_categoria_segun_tipo;
alter table public.cash_movements add constraint chk_categoria_segun_tipo check (
  (type = 'out'::movement_type and categoria in ('compra', 'gasto', 'retiro', 'correccion_compra', 'otro'))
  or
  (type = 'in'::movement_type  and categoria in ('abono_cliente', 'base', 'devolucion_compra', 'correccion_compra', 'otro'))
);

-- ── 3 · update_purchase ────────────────────────────────────────────────────
create or replace function public.update_purchase(
  p_invoice_id uuid,
  p_invoice    jsonb,
  p_items      jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sede_id        uuid := get_my_sede_id();
  v_supplier_id    uuid := (p_invoice->>'supplier_id')::uuid;
  v_invoice_number text := nullif(p_invoice->>'invoice_number', '');
  v_notes          text := nullif(p_invoice->>'notes', '');
  v_doc_date       date := coalesce((p_invoice->>'document_date')::date, public.hoy_bogota());
  v_supplier_name  text;
  v_jornada_id     uuid;
  v_kind           text;
  v_number         integer;
  v_old_total      numeric(12, 2);
  v_old            jsonb;
  v_total          numeric(12, 2) := 0;
  v_item           jsonb;
  v_product_id     uuid;
  v_qty            integer;
  v_unit_cost      numeric(12, 2);
  v_unidad         text;
  v_factor         integer;
  v_pid            uuid;
  v_u_old          integer;
  v_s_old          numeric(12, 2);
  v_u_new          integer;
  v_s_new          numeric(12, 2);
  v_delta          integer;
  v_tracking       boolean;
  v_stock          integer;
  v_costo          numeric(12, 2);
  v_s_base         integer;
  v_c_base         numeric;
  v_cash_delta     integer;
  v_cash_mov_id    uuid;
begin
  -- 1. Sede y permiso — el mismo permiso que registrar.
  if v_sede_id is null then
    raise exception 'No tienes una sede activa';
  end if;
  if not has_permission('compras.gestionar') then
    raise exception 'No autorizado para editar compras';
  end if;

  if v_doc_date > public.hoy_bogota() then
    raise exception 'La fecha de la factura (%) esta en el futuro: revisa el ano', v_doc_date
      using errcode = 'check_violation';
  end if;

  -- 2. La compra: de ESTA sede, y compra (no devolución). Bloqueada hasta el
  --    commit para que dos ediciones simultáneas no se pisen.
  select kind, purchase_number, total
    into v_kind, v_number, v_old_total
    from public.purchase_invoices
   where id = p_invoice_id and sede_id = v_sede_id
   for update;

  if not found then
    raise exception 'La compra no existe o no pertenece a tu sede';
  end if;
  if v_kind <> 'purchase' then
    raise exception 'Una devolucion no se edita';
  end if;

  -- 3. 🔴 Con devoluciones, NO. La devolución se validó contra los ítems de
  --    esta compra; cambiarlos la dejaría devolviendo lo que ya no está.
  if exists (select 1 from public.purchase_invoices where returns_invoice_id = p_invoice_id) then
    raise exception 'Esta compra tiene devoluciones registradas y no se puede editar'
      using errcode = 'check_violation';
  end if;

  -- 4. Jornada abierta: la diferencia de plata sale o entra HOY.
  select id into v_jornada_id
    from public.jornadas
   where sede_id = v_sede_id and closed_at is null
   limit 1;
  if v_jornada_id is null then
    raise exception 'Abri la jornada de caja antes de editar una compra'
      using errcode = 'check_violation';
  end if;

  select name into v_supplier_name
    from public.suppliers
   where id = v_supplier_id and sede_id = v_sede_id;
  if v_supplier_name is null then
    raise exception 'El proveedor no existe o no pertenece a tu sede';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'La compra no tiene items';
  end if;

  -- 5. Foto de lo viejo, por producto, ANTES de borrar.
  select coalesce(jsonb_object_agg(product_id, jsonb_build_object('u', u, 's', s)), '{}'::jsonb)
    into v_old
    from (select product_id,
                 sum(qty * units_per_purchase_unit) u,
                 sum(subtotal) s
            from public.purchase_invoice_items
           where invoice_id = p_invoice_id
           group by product_id) x;

  delete from public.purchase_invoice_items where invoice_id = p_invoice_id;

  -- 6. Ítems nuevos — las MISMAS validaciones que register_purchase.
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_product_id := (v_item->>'product_id')::uuid;
    v_qty        := (v_item->>'qty')::integer;
    v_unit_cost  := (v_item->>'unit_cost')::numeric;
    v_unidad     := nullif(v_item->>'purchase_unit', '');
    v_factor     := (v_item->>'units_per_purchase_unit')::integer;

    if v_unidad is null then
      if v_factor is not null and v_factor <> 1 then
        raise exception 'Hay un factor de equivalencia (%) sin unidad de compra para el producto %',
          v_factor, v_product_id
          using errcode = 'check_violation';
      end if;
      v_factor := 1;
    else
      if v_factor is null then
        raise exception 'Falta el factor de equivalencia para la unidad de compra "%" del producto %',
          v_unidad, v_product_id
          using errcode = 'check_violation';
      end if;
      if v_factor < 1 then
        raise exception 'El factor de equivalencia de "%" tiene que ser 1 o mas (llego %)',
          v_unidad, v_factor
          using errcode = 'check_violation';
      end if;
    end if;

    if v_qty is null or v_qty <= 0 then
      raise exception 'Cantidad invalida para el producto %', v_product_id;
    end if;
    if v_unit_cost is null or v_unit_cost < 0 then
      raise exception 'Costo unitario invalido para el producto %', v_product_id;
    end if;

    perform 1 from public.products where id = v_product_id and sede_id = v_sede_id;
    if not found then
      raise exception 'El producto % no pertenece a tu sede', v_product_id;
    end if;

    v_total := v_total + v_qty * v_unit_cost;

    insert into public.purchase_invoice_items
      (invoice_id, product_id, qty, unit_cost, subtotal,
       purchase_unit, units_per_purchase_unit)
    values
      (p_invoice_id, v_product_id, v_qty, v_unit_cost, v_qty * v_unit_cost,
       v_unidad, v_factor);
  end loop;

  -- 7. Por producto tocado (viejo ∪ nuevo): stock y costo.
  for v_pid in
    select (k)::uuid from jsonb_object_keys(v_old) k
    union
    select product_id from public.purchase_invoice_items where invoice_id = p_invoice_id
  loop
    v_u_old := coalesce((v_old->v_pid::text->>'u')::integer, 0);
    v_s_old := coalesce((v_old->v_pid::text->>'s')::numeric, 0);
    select coalesce(sum(qty * units_per_purchase_unit), 0), coalesce(sum(subtotal), 0)
      into v_u_new, v_s_new
      from public.purchase_invoice_items
     where invoice_id = p_invoice_id and product_id = v_pid;
    v_delta := v_u_new - v_u_old;

    select stock_tracking, coalesce(stock_qty, 0), cost_price
      into v_tracking, v_stock, v_costo
      from public.products
     where id = v_pid and sede_id = v_sede_id
     for update;

    if v_tracking and v_delta <> 0 then
      update public.products
         set stock_qty = coalesce(stock_qty, 0) + v_delta
       where id = v_pid;

      insert into public.stock_movements
        (sede_id, product_id, type, qty, reference_id, notes, created_by)
      values
        (v_sede_id, v_pid, 'adjustment', v_delta, p_invoice_id,
         'Edicion de la compra #' || v_number || ' a ' || v_supplier_name, auth.uid());
    end if;

    -- Costo: ver la cabecera. Sin unidades nuevas y sin base conocida, el
    -- costo se deja como está — no hay de dónde reconstruir el anterior.
    if not v_tracking then
      if v_u_new > 0 then
        update public.products set cost_price = round(v_s_new / v_u_new, 2) where id = v_pid;
      end if;
    else
      v_s_base := v_stock - v_u_old;
      if v_costo is null or v_s_base <= 0 then
        if v_u_new > 0 then
          update public.products set cost_price = round(v_s_new / v_u_new, 2) where id = v_pid;
        end if;
      else
        v_c_base := (v_costo * v_stock - v_s_old) / v_s_base;
        if v_c_base < 0 then
          v_c_base := v_costo;
        end if;
        update public.products
           set cost_price = round((v_s_base * v_c_base + v_s_new) / (v_s_base + v_u_new), 2)
         where id = v_pid;
      end if;
    end if;
  end loop;

  -- 8. Cabecera.
  update public.purchase_invoices
     set supplier_id    = v_supplier_id,
         invoice_number = v_invoice_number,
         notes          = v_notes,
         document_date  = v_doc_date,
         total          = v_total,
         edited_at      = now(),
         edited_by      = auth.uid()
   where id = p_invoice_id;

  -- 9. La diferencia de plata, en la jornada ABIERTA. El egreso original no se
  --    toca: el arqueo de su jornada ya pudo cerrarse e imprimirse.
  v_cash_delta := round(v_total)::integer - round(v_old_total)::integer;
  if v_cash_delta <> 0 then
    insert into public.cash_movements
      (jornada_id, sede_id, type, categoria, amount, reason, created_by, document_date)
    values
      (v_jornada_id, v_sede_id,
       case when v_cash_delta > 0 then 'out' else 'in' end::movement_type,
       'correccion_compra', abs(v_cash_delta),
       'Correccion de la compra #' || v_number || ' a ' || v_supplier_name,
       auth.uid(), v_doc_date)
    returning id into v_cash_mov_id;
  end if;

  return jsonb_build_object(
    'invoice_id',       p_invoice_id,
    'purchase_number',  v_number,
    'total',            v_total,
    'cash_movement_id', v_cash_mov_id
  );
end;
$$;

revoke execute on function public.update_purchase(uuid, jsonb, jsonb) from public;
revoke execute on function public.update_purchase(uuid, jsonb, jsonb) from anon;
grant  execute on function public.update_purchase(uuid, jsonb, jsonb) to authenticated;

comment on function public.update_purchase(uuid, jsonb, jsonb) is
  'Reescribe una compra (items y cabecera). La diferencia de stock va como '
  'adjustment y la de plata como correccion_compra en la jornada abierta. '
  'Rechaza compras con devoluciones. Costo promedio exacto solo si la compra '
  'fue el ultimo movimiento del producto (ver la migracion).';

commit;
