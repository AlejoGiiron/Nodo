-- ============================================================================
-- DEUDA 60 · UN GUARD QUE NO EVALUA DEJA PASAR
--
-- Origen: auditoria A2 (2026-09-02), `docs/auditorias/A2-negacion-policies.md`
-- §3. La sonda impersono a un usuario DESACTIVADO con el token todavia vivo y
-- midio el efecto como postgres antes del rollback:
--
--     order_items de la orden ajena     1 -> 2
--     products.stock_qty                10 -> 7
--     stock_movements                   1 -> 2
--     store_sequences de la sede ajena  0 -> 1
--
-- ...en una orden de OTRA ORGANIZACION. La app corta la sesion del desactivado
-- en el cliente, pero el token no se revoca: la base era el unico guard, y
-- estaba abierto.
--
-- LA CAUSA, y es una clase (CLAUDE.md, "un guard que compara contra un posible
-- NULL no falla cerrado ni abierto: NO EVALUA"): `get_my_sede_id()` filtra
-- `is_active`, asi que para un inactivo devuelve NULL. En SQL `x <> NULL` es
-- NULL —ni verdadero ni falso— y el `if` NO DISPARA.
--
-- TRES SITIOS, UNA CLASE (R3), los tres en esta migracion:
--   · add_order_items_with_extras   ABIERTO   (no habia nada despues)
--   · next_order_number             ABIERTO   (no habia nada despues)
--   · adjust_stock                  TAPADO    por el has_permission siguiente
--     ⚠️ Un guard tapado no es un guard arreglado: el dia que un rol tenga
--        `inventario.ajustar`, se abre. Va en el mismo commit por eso.
--
-- LA FORMA es la que las otras cuatro RPC (`register_sale_payment`,
-- `register_sale_void`, `register_purchase`, `register_debt_payment`) ya usaban
-- y que A2 midio 8/8 negando: leer la sede del llamante, rechazar si es NULL
-- ANTES de comparar nada, y comparar con `is distinct from`.
--
-- ⛔ LO QUE NO SE HIZO, A PROPOSITO: agregar un `has_permission` de parche. Tapa
--    el sintoma en un sitio y deja la comparacion NULL viva para el proximo que
--    copie la linea. (A2-1 sugiere ademas un `has_permission('pos.vender')` en
--    `add_order_items_with_extras`, que hoy NO pide permiso alguno: es alcance
--    NUEVO, no la correccion de esta clase, y queda anotado aparte.)
--
-- R5: migracion nueva; las aplicadas no se editan. Los cuerpos NO se reescriben
-- de memoria: salen de `pg_get_functiondef` del texto vivo, con las anclas
-- sustituidas. `create or replace` conserva ACL y comentarios.
--
-- Verificacion: `tests/rls-negacion.spec.ts` (la sonda de A2 como spec). Antes
-- de esta migracion daba 3 rojos —error `null` en las dos abiertas y
-- 'No autorizado para ajustar inventario' en la tapada— con sus dos controles
-- negativos en verde.
-- ============================================================================

begin;

CREATE OR REPLACE FUNCTION public.add_order_items_with_extras(p_order_id uuid, p_items jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_sede_id          uuid;
  v_order_created_by uuid;
  v_created_by       uuid;
  v_item             jsonb;
  v_item_id          uuid;
  v_item_qty         integer;
  v_product_id       uuid;
  v_kind             text;
  v_stock_tracking   boolean;
  v_unit_cost        numeric(12, 2);
  v_comp             record;
  v_comp_total       integer;
  v_extra            jsonb;
  v_extra_id         uuid;
  v_extra_qty        integer;
  v_extra_price      numeric(12, 2);
  v_extra_linked     uuid;
  v_mi_sede          uuid;   -- sede del LLAMANTE (deuda 60); v_sede_id es la de la ORDEN
  v_total_qty        integer;
begin
  -- 🔴 PRIMER GUARD, ANTES DE CUALQUIER COMPARACION (deuda 60, auditoria A2).
  --    get_my_sede_id() filtra is_active: para un usuario DESACTIVADO devuelve
  --    NULL, y `x <> NULL` no es verdadero ni falso — es NULL, asi que el `if`
  --    NO DISPARA y lo que sigue se ejecuta como si hubiera aceptado.
  --    Medido: un desactivado escribio items y descontó stock en una orden de
  --    OTRA organizacion. Es la forma que las otras cuatro RPC ya usaban.
  v_mi_sede := get_my_sede_id();
  if v_mi_sede is null then
    raise exception 'No tienes una sede activa';
  end if;

  select sede_id, created_by
  into v_sede_id, v_order_created_by
  from public.orders
  where id = p_order_id;

  if v_sede_id is null then
    raise exception 'La orden % no existe', p_order_id;
  end if;
  -- `is distinct from` y no `<>`: con NULL de cualquier lado, `<>` no evalua.
  if v_sede_id is distinct from v_mi_sede then
    raise exception 'La orden no pertenece a tu sede';
  end if;

  v_created_by := coalesce(auth.uid(), v_order_created_by);

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_item_qty   := (v_item->>'qty')::integer;
    v_product_id := (v_item->>'product_id')::uuid;

    -- El producto se valida POR UUID contra la sede propia, no por nombre.
    select kind, stock_tracking, cost_price
    into v_kind, v_stock_tracking, v_unit_cost
    from public.products
    where id = v_product_id and sede_id = v_sede_id;

    if not found then
      raise exception 'El producto % no pertenece a tu sede', v_product_id;
    end if;

    -- unit_cost: congelado acá. Nulo si el producto nunca se compro — eso es
    -- informacion, no un hueco (ver el comentario de la columna en el 06).
    insert into public.order_items
      (order_id, product_id, qty, unit_price, unit_cost, notes)
    values (
      p_order_id,
      v_product_id,
      v_item_qty,
      (v_item->>'unit_price')::numeric,
      v_unit_cost,
      nullif(v_item->>'notes', '')
    )
    returning id into v_item_id;

    if v_item_qty > 0 then
      if v_kind = 'simple' then
        if v_stock_tracking then
          update public.products
          set stock_qty = coalesce(stock_qty, 0) - v_item_qty
          where id = v_product_id and sede_id = v_sede_id;

          insert into public.stock_movements
            (sede_id, product_id, type, qty, reference_id, created_by)
          values
            (v_sede_id, v_product_id, 'sale', -v_item_qty, p_order_id, v_created_by);
        end if;

      elsif v_kind = 'composite' then
        -- Explota la descomposicion bulto -> unidad y descuenta cada componente.
        for v_comp in
          select pc.component_id, pc.qty as component_qty
          from public.product_components pc
          join public.products p on p.id = pc.component_id
          where pc.parent_id = v_product_id
            and pc.sede_id   = v_sede_id
            and p.stock_tracking = true
        loop
          v_comp_total := v_comp.component_qty * v_item_qty;

          update public.products
          set stock_qty = coalesce(stock_qty, 0) - v_comp_total
          where id = v_comp.component_id and sede_id = v_sede_id;

          insert into public.stock_movements
            (sede_id, product_id, type, qty, reference_id, created_by)
          values
            (v_sede_id, v_comp.component_id, 'sale', -v_comp_total, p_order_id, v_created_by);
        end loop;
      end if;
    end if;

    for v_extra in
      select * from jsonb_array_elements(coalesce(v_item->'extras', '[]'::jsonb))
    loop
      v_extra_id  := (v_extra->>'extra_id')::uuid;
      v_extra_qty := (v_extra->>'qty')::integer;

      if v_extra_qty <= 0 then
        continue;  -- se ignoran cargos con qty 0 o negativa
      end if;

      select price, linked_product_id
      into v_extra_price, v_extra_linked
      from public.extras
      where id = v_extra_id
        and sede_id = v_sede_id
        and is_active = true;

      if not found then
        raise exception 'El extra % no es valido para esta sede', v_extra_id;
      end if;

      -- ALLOWLIST: el cargo tiene que estar asignado a ESE producto.
      perform 1 from public.product_extras
      where product_id = v_product_id and extra_id = v_extra_id;

      if not found then
        raise exception 'El extra % no esta asignado al producto %',
          v_extra_id, v_product_id;
      end if;

      v_total_qty := v_extra_qty * v_item_qty;

      insert into public.order_item_extras (order_item_id, extra_id, qty, unit_price)
      values (v_item_id, v_extra_id, v_total_qty, v_extra_price);

      if v_extra_linked is not null then
        update public.products
        set stock_qty = coalesce(stock_qty, 0) - v_total_qty
        where id = v_extra_linked
          and sede_id = v_sede_id
          and stock_tracking = true;

        -- 🔴 ARREGLO respecto de la version heredada: esta salida de stock
        -- TAMBIEN deja movimiento. Sin esto, el envase retornable bajaba el
        -- stock sin rastro. `found` evita anotar un movimiento que el update
        -- no hizo (producto sin stock_tracking o de otra sede).
        if found then
          insert into public.stock_movements
            (sede_id, product_id, type, qty, reference_id, notes, created_by)
          values
            (v_sede_id, v_extra_linked, 'sale', -v_total_qty, p_order_id,
             'Consumo por extra', v_created_by);
        end if;
      end if;
    end loop;
  end loop;
end;
$function$;

CREATE OR REPLACE FUNCTION public.adjust_stock(p_product_id uuid, p_qty integer, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_sede_id uuid;
  v_kind    text;
  v_mi_sede uuid;   -- sede del LLAMANTE (deuda 60)
begin
  -- 🔴 PRIMER GUARD, ANTES DE CUALQUIER COMPARACION (deuda 60, auditoria A2).
  --    get_my_sede_id() filtra is_active: para un usuario DESACTIVADO devuelve
  --    NULL, y `x <> NULL` no es verdadero ni falso — es NULL, asi que el `if`
  --    NO DISPARA y lo que sigue se ejecuta como si hubiera aceptado.
  --    Medido: un desactivado escribio items y descontó stock en una orden de
  --    OTRA organizacion. Es la forma que las otras cuatro RPC ya usaban.
  v_mi_sede := get_my_sede_id();
  if v_mi_sede is null then
    raise exception 'No tienes una sede activa';
  end if;

  if p_qty = 0 then
    raise exception 'El ajuste de stock no puede ser 0';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'El ajuste de stock requiere un motivo';
  end if;

  select sede_id, kind into v_sede_id, v_kind
  from public.products
  where id = p_product_id;

  if v_sede_id is null then
    raise exception 'El producto % no existe', p_product_id;
  end if;
  -- `is distinct from` y no `<>`: con NULL de cualquier lado, `<>` no evalua.
  if v_sede_id is distinct from v_mi_sede then
    raise exception 'El producto no pertenece a tu sede';
  end if;
  if not has_permission('inventario.ajustar') then
    raise exception 'No autorizado para ajustar inventario';
  end if;
  if v_kind <> 'simple' then
    raise exception 'Solo los productos simples tienen stock ajustable';
  end if;

  update public.products
  set stock_qty = coalesce(stock_qty, 0) + p_qty
  where id = p_product_id;

  insert into public.stock_movements
    (sede_id, product_id, type, qty, reference_id, notes, created_by)
  values
    (v_sede_id, p_product_id, 'adjustment', p_qty, null, p_reason, auth.uid());
end;
$function$;

CREATE OR REPLACE FUNCTION public.next_order_number(p_sede_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_next integer;
  v_mi_sede uuid;   -- sede del LLAMANTE (deuda 60)
begin
  -- 🔴 PRIMER GUARD, ANTES DE CUALQUIER COMPARACION (deuda 60, auditoria A2).
  --    get_my_sede_id() filtra is_active: para un usuario DESACTIVADO devuelve
  --    NULL, y `x <> NULL` no es verdadero ni falso — es NULL, asi que el `if`
  --    NO DISPARA y lo que sigue se ejecuta como si hubiera aceptado.
  --    Medido: un desactivado escribio items y descontó stock en una orden de
  --    OTRA organizacion. Es la forma que las otras cuatro RPC ya usaban.
  v_mi_sede := get_my_sede_id();
  if v_mi_sede is null then
    raise exception 'No tienes una sede activa';
  end if;

  -- `is distinct from` y no `<>`: con NULL de cualquier lado, `<>` no evalua.
  if p_sede_id is null or p_sede_id is distinct from v_mi_sede then
    raise exception 'No autorizado para numerar ventas de esta sede';
  end if;

  insert into public.store_sequences (sede_id, last_order_number)
  values (p_sede_id, 1)
  on conflict (sede_id) do update
    set last_order_number = public.store_sequences.last_order_number + 1
  returning last_order_number into v_next;

  return v_next;
end;
$function$;

commit;
