-- ============================================================
-- G-Nexo — Esquema base · 07 · Inventario
--
-- ORIGEN: G-Vento `d848852`, supabase/inventory-recipes.sql.
-- Decision del paso 0, par 8: `product_components` SE CONSERVA — es la relacion
-- bulto->unidad, que G-Nexo si necesita (se compra por bulto, se vende por
-- unidad). Ver docs/paso-0-funciones-duplicadas.md.
--
-- R5: no aplicado en G-Nexo (base vacia). Desde el primer `db push`, R5 manda.
--
-- ── HALLAZGO AL CONSOLIDAR: no habia nada que renombrar ─────────────────────
-- El paso 0 decidio "conservar renombrado a bulto/unidad". Al escribirlo se ve
-- que los NOMBRES ya eran neutros: `product_components`, `parent_id`,
-- `component_id`, `kind = composite`. Lo unico especifico de bar eran los
-- COMENTARIOS, que decian "receta" y "insumos".
--
-- O sea: la pieza estaba bien, la etiqueta estaba en la documentacion. Es la
-- regla de poda invertida en su version mas barata — enumerar costo un grep y
-- evito reescribir una tabla que no hacia falta tocar.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- stock_movements — auditoria append-only
--
-- Es la razon por la que la v2 de add_order_items_with_extras le gana a la v1
-- (paso 0, par 8): sin esta tabla el stock cambia y NO QUEDA RASTRO DE POR QUE.
-- ------------------------------------------------------------
create table public.stock_movements (
  id           uuid        primary key default gen_random_uuid(),
  sede_id      uuid        not null references public.sedes    on delete cascade,
  product_id   uuid        not null references public.products on delete restrict,
  type         text        not null check (type in ('sale', 'adjustment', 'return', 'purchase')),
  qty          integer     not null check (qty <> 0),
  reference_id uuid,
  notes        text,
  created_by   uuid        references public.profiles on delete set null,
  created_at   timestamptz not null default now()
);

comment on table public.stock_movements is
  'Auditoria append-only de movimientos de stock. qty con signo: - salida, '
  '+ entrada. Se escribe SOLO via funciones SECURITY DEFINER.';
comment on column public.stock_movements.type is
  'sale (venta) · adjustment (ajuste manual) · return (devolucion/reverso) · '
  'purchase (entrada por compra). Allowlist: lo que no esta, no entra. '
  '⚠️ purchase se agrega aca porque en G-Nexo la compra es un modulo del '
  'alcance firmado; en G-Vento register_purchase escribia con otro type.';
comment on column public.stock_movements.reference_id is
  'FK LOGICO, no declarado: para type=sale apunta a orders.id; para '
  'type=purchase, a la factura de compra. No hay FK real porque apunta a '
  'tablas distintas segun el type.';

create index idx_stock_movements_sede_created on public.stock_movements (sede_id, created_at desc);
create index idx_stock_movements_product      on public.stock_movements (product_id);


-- ------------------------------------------------------------
-- product_components — relacion bulto -> unidad
--
-- Un producto `composite` no tiene stock propio: al venderse, explota esta
-- tabla y descuenta sus componentes. En G-Vento era la receta de un plato; en
-- G-Nexo es el bulto que se vende por unidad. Mismo mecanismo, otro negocio.
-- ------------------------------------------------------------
create table public.product_components (
  id           uuid        primary key default gen_random_uuid(),
  sede_id      uuid        not null references public.sedes    on delete cascade,
  parent_id    uuid        not null references public.products on delete cascade,
  component_id uuid        not null references public.products on delete restrict,
  qty          integer     not null check (qty > 0),
  created_at   timestamptz not null default now(),
  unique (parent_id, component_id),
  check (parent_id <> component_id)
);

comment on table public.product_components is
  'Descomposicion de un nivel: que producto y en que cantidad consume un '
  'producto compuesto al venderse. qty = unidades del componente por UNA unidad '
  'del padre. Caso tipico en G-Nexo: un bulto que se vende por unidad suelta.';

create index idx_product_components_parent on public.product_components (parent_id);


-- ------------------------------------------------------------
-- adjust_stock — ajuste manual, con cuatro guards fail-closed
--
-- Los cuatro rechazan, ninguno corrige: ajuste 0, motivo vacio, producto de
-- otra sede, y sin permiso. El de la sede compara POR UUID contra
-- get_my_sede_id(); resolver por nombre ajustaria inventario ajeno.
-- ------------------------------------------------------------
create or replace function public.adjust_stock(
  p_product_id uuid,
  p_qty        integer,
  p_reason     text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sede_id uuid;
  v_kind    text;
begin
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
  if v_sede_id <> get_my_sede_id() then
    raise exception 'El producto no pertenece a tu sede';
  end if;
  if not has_permission('productos.editar') then
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
$$;

revoke execute on function public.adjust_stock(uuid, integer, text) from public;
revoke execute on function public.adjust_stock(uuid, integer, text) from anon;
grant  execute on function public.adjust_stock(uuid, integer, text) to authenticated;


-- ============================================================
-- ⛔ LO QUE FALTA ACA, Y POR QUE NO LO ESCRIBI
--
-- `add_order_items_with_extras` (paso 0, par 8: gana la v2 de
-- order-items-stock-recipes.sql) es el alta de items Y donde se descuenta el
-- stock. Deberia vivir en este archivo, porque necesita order_items (06) y
-- stock_movements (07). NO ESTA, por una razon concreta:
--
--   La v2 tambien inserta en `order_item_extras`, y las tres tablas de extras
--   —extras, product_extras, order_item_extras— NO TIENEN ARCHIVO ASIGNADO en
--   el plan de 12 archivos. Es un HUECO DEL PLAN, no un olvido de esta sesion.
--
--   Y extras no se puede resolver de contrabando: es el caso #1 de los cuatro
--   que sostenian peso (CLAUDE.md dice "extras: AL FINAL, y renombrando en vez
--   de borrando"). Que pasa a ser en G-Nexo —adiciones, variantes, presentaciones—
--   es una decision de producto, no una de esquema.
--
-- Escribir la RPC sin la rama de extras la dejaria incompleta en silencio, que
-- es peor que dejarla afuera con un cartel. Queda para el archivo que resuelva
-- extras, y esta nota existe para que el hueco no se pierda.
-- ============================================================


-- RLS habilitada aca; policies en el 11 (ver la cabecera del archivo 02).
alter table public.stock_movements    enable row level security;
alter table public.product_components enable row level security;

commit;
