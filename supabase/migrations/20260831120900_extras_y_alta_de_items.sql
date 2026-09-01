-- ============================================================
-- Nodo — Esquema base · 07b · Extras y alta de items
--
-- ORIGEN: Vento `d848852`:
--   · extras, product_extras, order_item_extras ← product-extras.sql
--   · add_order_items_with_extras               ← order-items-stock-recipes.sql (v2)
--
-- 🔴 ESTE ARCHIVO NO ESTABA EN EL PLAN DE 12. Es una enmienda: al escribir el
--    07 aparecio que la RPC de alta de items depende de tres tablas de extras
--    que ningun archivo tenia asignadas. Un plan de consolidacion no detecta
--    sus propios huecos hasta que se escribe el codigo.
--
--    Va DESPUES del 07 porque necesita las tres cosas a la vez: products (05),
--    order_items (06) y stock_movements (07). Se numera 07b para no renumerar
--    lo ya commiteado.
--
-- R5: no aplicado en Nodo (base vacia). Desde el primer `db push`, R5 manda.
--
-- ── ENUMERACION DE EXTRAS (regla de poda) — resultado: NEUTRAS ─────────────
-- Columnas de las tres tablas: sede_id, name, price, linked_product_id,
-- is_active · product_id, extra_id · order_item_id, extra_id, qty, unit_price.
-- CERO columnas de bar: no hay nota a cocina ni orden de preparacion. Van tal
-- cual; lo unico que se toca son los comentarios. Segundo caso, despues de
-- product_components, donde la pieza estaba bien y la etiqueta estaba en la
-- documentacion.
--
-- QUE ES UN EXTRA EN NODO: un cargo por linea que no es un producto con stock
-- propio. Casos reales de los nichos firmados: corte de lamina o tubo en
-- ferreteria, envase retornable en bebidas, domicilio. `linked_product_id`
-- —heredado y neutro— cubre justo el caso del envase, que SI es un producto con
-- stock.
--
-- ⚠️ Un order_item_extras VACIO es un sistema que funciona: una distribuidora
--    que no cobra nada por linea opera con cero filas ahi. El esquema no
--    bloquea a la decision de producto sobre que extras existiran.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- extras — catalogo de cargos por linea, por sede
-- ------------------------------------------------------------
create table public.extras (
  id                uuid           primary key default gen_random_uuid(),
  sede_id           uuid           not null references public.sedes    on delete cascade,
  name              text           not null,
  price             numeric(12, 2) not null default 0 check (price >= 0),
  linked_product_id uuid           references public.products on delete set null,
  is_active         boolean        not null default true,
  created_at        timestamptz    not null default now(),
  updated_at        timestamptz    not null default now()
);

comment on table public.extras is
  'Catalogo de cargos por linea reutilizables por sede: cargos que se suman a '
  'una linea de venta y que NO son un producto con stock propio. Ejemplos: '
  'corte de lamina o tubo, envase retornable, domicilio. Se asignan a productos '
  'via product_extras.';
comment on column public.extras.linked_product_id is
  'Si esta presente, vender este extra descuenta stock del producto vinculado. '
  'Caso tipico: el envase retornable, que si es un producto inventariado.';

create index idx_extras_sede_id on public.extras (sede_id);

create trigger trg_extras_updated_at
  before update on public.extras
  for each row execute function public.handle_updated_at();


-- ------------------------------------------------------------
-- product_extras — N:N producto <-> extra
-- Es la ALLOWLIST de que cargos aplican a cada producto. La RPC la verifica:
-- un extra que no este asignado se RECHAZA, no se acepta "por las dudas".
-- ------------------------------------------------------------
create table public.product_extras (
  id         uuid        primary key default gen_random_uuid(),
  product_id uuid        not null references public.products on delete cascade,
  extra_id   uuid        not null references public.extras   on delete cascade,
  created_at timestamptz not null default now(),
  unique (product_id, extra_id)
);

comment on table public.product_extras is
  'Que cargos del catalogo estan disponibles para cada producto. Allowlist.';

create index idx_product_extras_product_id on public.product_extras (product_id);


-- ------------------------------------------------------------
-- order_item_extras — cargos elegidos en una linea de venta
-- cascade en order_item_id (al borrar la linea se borran sus cargos);
-- restrict en extra_id (no se borra un extra que ya esta en ventas).
-- ------------------------------------------------------------
create table public.order_item_extras (
  id            uuid           primary key default gen_random_uuid(),
  order_item_id uuid           not null references public.order_items on delete cascade,
  extra_id      uuid           not null references public.extras      on delete restrict,
  qty           integer        not null check (qty > 0),
  unit_price    numeric(12, 2) not null check (unit_price >= 0),
  created_at    timestamptz    not null default now()
);

comment on column public.order_item_extras.unit_price is
  'Snapshot del precio del cargo al momento de vender. No referencia '
  'extras.price en tiempo real.';

create index idx_order_item_extras_order_item_id
  on public.order_item_extras (order_item_id);

-- ⏳ PENDIENTE DECLARADO: order_item_extras NO tiene unit_cost. Para utilidades
--    eso significa ingreso sin costo asociado. En los casos conocidos puede ser
--    correcto (un corte de lamina es mano de obra, no mercaderia) o no serlo (un
--    envase retornable tiene costo, aunque hoy se descuenta via
--    linked_product_id). No lo decido ahora: exige el diseño de utilidades
--    (deuda #19). Se anota para que el hueco no se descubra al leer un reporte.


-- ------------------------------------------------------------
-- add_order_items_with_extras — v2 (paso 0, par 8)
--
-- Es el UNICO CAMINO DE ALTA DE ITEMS que se usa, y donde se descuenta stock.
-- ⚠️ Pero eso NO lo garantiza la base: supabase-helpers todavia exporta
--    addOrderItems, que inserta directo, y la policy de insert lo permite
--    (deuda #24). La garantia es una convencion, no un mecanismo — dicho aca
--    porque este es el archivo donde alguien va a buscarla.
--
-- DOS ADAPTACIONES sobre la v2 heredada, ninguna cosmetica:
--
--  1. 🔴 GRABA unit_cost. La v2 no lo hacia porque en Vento la columna no
--     existia. Congela el costo al vender, leyendo products.cost_price en ese
--     instante. Sin esto, la migracion `ventas` tendria la columna y nadie la llenaria:
--     el peor de los mundos, porque el hueco se descubre cuando ya no se puede
--     reconstruir (R1 punto 8).
--
--  2. 🔴 AUDITA el descuento del producto vinculado a un extra. La version
--     heredada descontaba stock del linked_product_id SIN escribir
--     stock_movements: un cambio de stock sin rastro de por que, que es
--     exactamente lo que esa tabla existe para impedir. Las ventas y las
--     recetas si se auditaban; los extras no. Es un defecto de CLASE —"toda
--     salida de stock deja movimiento"— con una instancia huerfana (R3), y se
--     arregla acá en vez de replicarse.
-- ------------------------------------------------------------
create or replace function public.add_order_items_with_extras(
  p_order_id uuid,
  p_items    jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
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
  v_total_qty        integer;
begin
  select sede_id, created_by
  into v_sede_id, v_order_created_by
  from public.orders
  where id = p_order_id;

  if v_sede_id is null then
    raise exception 'La orden % no existe', p_order_id;
  end if;
  if v_sede_id <> get_my_sede_id() then
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
$$;

revoke execute on function public.add_order_items_with_extras(uuid, jsonb) from public;
revoke execute on function public.add_order_items_with_extras(uuid, jsonb) from anon;
grant  execute on function public.add_order_items_with_extras(uuid, jsonb) to authenticated;


-- RLS habilitada aca; policies en el 11 (ver la cabecera de la migracion `organizaciones_y_sedes`).
alter table public.extras            enable row level security;
alter table public.product_extras    enable row level security;
alter table public.order_item_extras enable row level security;

commit;
