-- ============================================================================
-- DEUDA 101 · LISTAS DE PRECIOS — CINCO NIVELES POR PRODUCTO
--
-- R0 — las cuatro preguntas:
--
--  1. CLASE · tabla nueva con PLATA adentro + allowlist de columnas sobre ella
--     (mismo mecanismo que la deuda 78) + una columna nueva en `order_items`
--     que congela un hecho de la venta.
--
--  2. PRECEDENTE · la deuda 78 (allowlist de columnas, no trigger), la deuda 46
--     (`plazo_dias` se guarda en el cliente Y se congela en la orden), y el
--     criterio *la historia no se reescribe, se le agrega*.
--
--  3. MODO DE FALLO · si me equivoco en las policies, un precio de otra sede se
--     lee o se escribe. Por eso `sede_id` va con **FK COMPUESTA** contra
--     `products (id, sede_id)`: no puede discrepar, lo impide el motor.
--
--  4. OBJETIVO · allowlist. Sin DELETE, sin DROP. Las unicas filas que se tocan
--     son las que esta migracion INSERTA (ninguna: la carga va por script).
--
-- ----------------------------------------------------------------------------
-- ⚠️ PROCEDENCIA DEL CUERPO DE `add_order_items_with_extras` — Y NO ES UN
--    DETALLE DE FORMA:
--
--    **El cuerpo se copio del ARCHIVO `20260902180000_guard_de_sede_null.sql`
--    (lineas 52..228), NO de la base.** No se pudo correr `pg_get_functiondef`:
--    el CLI de Supabase no ejecuta SQL suelto, `pg_catalog` no esta expuesto por
--    PostgREST y `db dump` necesita Docker.
--
--    **La garantia de que el archivo y la base coinciden es R5, no una
--    medicion.** Lo que si se verifico: de todas las migraciones, solo DOS
--    definen esta funcion (`20260831120900` y `20260902180000`) y la segunda es
--    la ultima, con grep insensible a mayusculas — la primera version esta en
--    minusculas y la vigente en mayusculas, y un grep sensible las pierde.
--
--    🔴 Si alguien edito la funcion A MANO fuera de migraciones, el cuerpo de
--    aca NO coincide con el que estaba corriendo, y esta migracion lo PISA. Eso
--    seria una violacion de R5 que invalida mucho mas que esta RPC — y esta nota
--    es lo que va a explicar por que el cuerpo no coincidia.
--
--    Es la diferencia entre *verificado* y *verificado contra un proxy*.
--
-- ----------------------------------------------------------------------------
-- ⛔ LO QUE ESTA MIGRACION **NO** HACE, A PROPOSITO:
--
--    **`products.price` NO se vuelve nullable.** Se pensaba incluir y la
--    medicion lo desaconseja: nullable **no habilita nada** en esta tanda —los
--    20 productos nuevos del archivo del cliente NO TIENEN PRECIO, asi que
--    crearlos no la habilita a venderlos por lista— y en cambio **abre un
--    `undefined` en el Mostrador** el dia que exista la primera fila con precio
--    nulo, porque hay lecturas que hoy asumen no-null. Queda para la ETAPA 2,
--    cuando las lecturas ya no miren `products.price`.
-- ============================================================================

-- ── 1 · La clave compuesta que hace imposible el desacuerdo de sede ─────────
-- `id` ya es unico; esto existe SOLO para que la FK compuesta de abajo pueda
-- apoyarse en el par. Es redundante a proposito.
alter table public.products
  add constraint products_id_sede_unico unique (id, sede_id);

-- ── 2 · La tabla ───────────────────────────────────────────────────────────
-- 🔴 POR QUE TABLA Y NO CINCO COLUMNAS (decidido el 2026-09-14): el sexto nivel
--    es una FILA en vez de una migracion; el allowlist de columnas de la deuda
--    78 NO crece; y —lo que manda— **la AUSENCIA DE FILA es un estado legible**:
--    *este nivel no esta configurado*. Con columnas nullable no lo seria, porque
--    `precio >= 0` acepta el CERO: `null` mezclaria «no lo puso» con «vale cero»,
--    y *un valor que significa dos cosas no es un dato*.
create table public.product_prices (
  product_id uuid           not null,
  sede_id    uuid           not null,
  nivel      smallint       not null check (nivel between 0 and 4),
  precio     numeric(12, 2) not null check (precio >= 0),
  created_at timestamptz    not null default now(),
  updated_at timestamptz    not null default now(),

  primary key (product_id, nivel),

  -- 🔴 FK COMPUESTA, no dos FK sueltas. `sede_id` esta desnormalizado para que
  --    las policies no necesiten un join, igual que en `product_components` —
  --    pero desnormalizar crea un contrato que nada sincroniza (R1). Esto lo
  --    cierra EN EL MOTOR: el par (producto, sede) tiene que existir tal cual en
  --    `products`, asi que un precio no puede quedar apuntando a otra sede.
  constraint product_prices_producto_de_su_sede
    foreign key (product_id, sede_id)
    references public.products (id, sede_id) on delete cascade
);

comment on table public.product_prices is
  'Los cinco niveles de precio de un producto (L0..L4). El NIVEL es de la LINEA '
  'DE VENTA, no del cliente: el mismo cliente puede llevar productos a niveles '
  'distintos en la misma venta. LA AUSENCIA DE FILA SIGNIFICA «este nivel no '
  'esta configurado» y es un estado valido — no se rellena con cero.

L1 NO ES UN NIVEL NUEVO: es el que ella ya usaba. El campo unico de precio del formulario de producto lo tecleaba como su PRECIO BASE, y su precio base ES L1 (verificado: 22 de 22 coinciden). Asi que el formulario sigue teniendo UN campo y ese campo escribe L1 — no se inventa un nivel, se nombra el que ya estaba. Cuando llegue el formulario de cinco campos, agrega L0 y L2-L4 AL LADO de uno que ya era correcto, sin cambiarle el significado a nada.';

comment on column public.product_prices.nivel is
  'L0..L4 como 0..4. CHECK y no enum, por el precedente de `subscription_status`: '
  'ampliar un CHECK es una linea y un `alter type` en produccion no lo es. El '
  'dia que haga falta un sexto nivel, se amplia este CHECK y se insertan filas.';

comment on column public.product_prices.precio is
  'El precio de este nivel, TECLEADO por el negocio. NO se deriva del costo: la '
  'formula existe medida (L1 costo x1,15 hasta L4 x1,40) y NO se implementa, '
  'porque la clienta puede no respetarla. El MARGEN se calcula al vuelo contra '
  '`products.cost_price` y no se persiste.';

create index product_prices_por_sede on public.product_prices (sede_id, nivel);

-- ── 3 · RLS ────────────────────────────────────────────────────────────────
alter table public.product_prices enable row level security;

create policy "product_prices: ver de mi sede"
  on public.product_prices for select to authenticated
  using (sede_id = get_my_sede_id());

-- ⚠️ ESCRIBE QUIEN EDITA PRODUCTOS, y es la decision que hay que mirar: un
--    precio de lista es PLATA, pero es plata que la clienta TECLEA —a diferencia
--    de `cost_price`, que lo deriva `register_purchase` y alimenta utilidades—.
--    Por eso NO va por RPC: va por la tabla, con el mismo permiso que ya gobierna
--    `products.price`, que es el mismo dato un nivel mas abajo.
-- 🔴 LO QUE ESTO NO DA, dicho para que nadie lo lea como que si: **cambiar un
--    precio de lista NO deja rastro** — ni autor, ni fecha, ni motivo. Tampoco
--    lo deja hoy cambiar `products.price`, asi que no se empeora nada; pero el
--    dia que haga falta auditar un cambio de precio, esto es lo que falta.
create policy "product_prices: gestionar"
  on public.product_prices for all to authenticated
  using      (sede_id = get_my_sede_id() and has_permission('productos.editar'))
  with check (sede_id = get_my_sede_id() and has_permission('productos.editar'));

-- ── 4 · Allowlist de columnas (deuda 78, mismo mecanismo) ──────────────────
-- Del UPDATE solo se concede `precio`. Mover `product_id`, `nivel` o `sede_id`
-- de una fila existente seria **mudar un precio a otro producto**, y eso no es
-- editar: es reescribir. Para eso se borra la fila y se crea otra.
-- El INSERT no se acota: crear una fila necesita las tres claves.
revoke update on public.product_prices from authenticated, anon;
grant  update (precio) on public.product_prices to authenticated;

-- ── 5 · El nivel por defecto del cliente ───────────────────────────────────
-- NULLABLE y con FALLBACK, no fail-closed: `orders.customer_id` es NULLABLE y la
-- mayoria de las ventas de mostrador no tienen cliente. Bloquear la venta por
-- falta de lista romperia el mostrador — el mismo intercambio que se rechazo con
-- `handle_new_user`. La cadena es LINEA -> CLIENTE -> SEDE -> L1.
alter table public.customers
  add column nivel_default smallint check (nivel_default between 0 and 4);

comment on column public.customers.nivel_default is
  'Nivel de precio por defecto de este cliente (0..4). NULL = usa el de la sede '
  '(`sedes.config`), y si tampoco hay, L1. La linea de venta ARRANCA aca y se '
  'puede cambiar por producto: el nivel es de la linea, no del cliente.';

-- ── 6 · El nivel congelado en la linea ─────────────────────────────────────
-- `unit_price` dice CUANTO; esto dice POR QUE, y no es derivable: el precio se
-- puede editar a mano (deuda 75) y dos niveles pueden coincidir en el numero.
-- Mismo patron que `plazo_dias` en la deuda 46.
alter table public.order_items
  add column nivel_aplicado smallint check (nivel_aplicado between 0 and 4);

comment on column public.order_items.nivel_aplicado is
  'El nivel con el que se cotizo esta linea, congelado. NULL = la linea NO salio '
  'de una lista. ⚠️ Eso junta dos hechos —precio pactado a mano, y linea anterior '
  'al 2026-09-14— y se ACEPTA como decision: las lineas viejas son finitas y '
  'estan fechadas, asi que el reporte de «fuera de lista» arranca en esa fecha y '
  'la pregunta se contesta mirando la fecha, no agregando una columna.';

-- ── 7 · La RPC, copiada verbatim y cambiada con dos anclas ─────────────────
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
      (order_id, product_id, qty, unit_price, unit_cost, notes, nivel_aplicado)
    values (
      p_order_id,
      v_product_id,
      v_item_qty,
      (v_item->>'unit_price')::numeric,
      v_unit_cost,
      nullif(v_item->>'notes', ''),
      -- El NIVEL con el que se cotizo esta linea (deuda 101). Viaja DENTRO del
      -- item, como `unit_price` y `notes`: la firma de la funcion no cambia.
      -- NULL = la linea no salio de una lista (precio a mano, o venta anterior
      -- a que las listas existieran). Es un dato, no un hueco.
      nullif(v_item->>'nivel_aplicado', '')::smallint
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

-- El `revoke`/`grant` de la funcion NO se repite: `create or replace` conserva
-- el ACL existente, y repetirlo seria un segundo lado del mismo contrato.
