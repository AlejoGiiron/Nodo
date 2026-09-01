-- ============================================================
-- Nodo — Esquema base · 06 · Ventas
--
-- ORIGEN: consolidado de Vento `d848852`:
--   · orders, order_items, payments ← schema.sql, seccion 3
--   · columnas de anulacion         ← sale-void.sql
--   · store_sequences, next_order_number ← order-numbering.sql
--
-- R5: no aplicado en Nodo (base vacia). Desde el primer `db push`, R5 manda.
--
-- ── LO QUE NO VIAJA, Y POR QUE ─────────────────────────────────────────────
--   · orders.type (order_type)  → el eje dine_in/takeaway/delivery es de
--     restaurante. Nodo vende sobre mostrador y no tiene rutas ni despacho.
--   · orders.table_id y chk_dine_in_has_table → mesas.
--   · orders.waiter_name        → mozos.
--   · el `update roles set permissions` de sale-void.sql → hallazgo H4: el
--     catalogo se GENERA. El permiso de anular se declara en permissions.ts.
--   · el indice idx_one_open_shift_per_store de sale-void.sql → es de jornada
--     de caja y va con la migracion `caja`, no aca. Ojo: es un DUPLICADO exacto de
--     idx_cash_shifts_one_open (hallazgo H3); en el 10 va UNO SOLO.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- orders
-- ------------------------------------------------------------
create table public.orders (
  id             uuid                primary key default gen_random_uuid(),
  sede_id        uuid                not null references public.sedes    on delete cascade,
  created_by     uuid                not null references public.profiles on delete restrict,
  order_number   integer,
  status         public.order_status not null default 'pending',
  customer_name  text,
  customer_phone text,
  notes          text,
  total          numeric(12, 2)      not null default 0 check (total >= 0),
  discount_amount numeric(12, 2)     not null default 0 check (discount_amount >= 0),
  discount_type   text               check (discount_type in ('pct', 'fixed')),
  discount_reason text,
  cancelled_at   timestamptz,
  cancelled_by   uuid                references public.profiles on delete set null,
  cancel_reason  text,
  created_at     timestamptz         not null default now(),
  updated_at     timestamptz         not null default now()
);

comment on column public.orders.total is
  'Calculado en el cliente y persistido. Verificar contra sum(order_items) si '
  'se necesita auditoria.';
comment on column public.orders.order_number is
  'Consecutivo POR SEDE, entregado por next_order_number(). Nulo hasta que se '
  'asigna.';
comment on column public.orders.cancelled_at is
  'Marca de anulacion. null = venta vigente. La venta NUNCA se borra: se marca.';

create index idx_orders_sede_id      on public.orders (sede_id);
create index idx_orders_status       on public.orders (sede_id, status);
create index idx_orders_created_at   on public.orders (created_at desc);
create unique index idx_orders_sede_order_number
  on public.orders (sede_id, order_number) where order_number is not null;
create index idx_orders_cancelled
  on public.orders (sede_id) where cancelled_at is not null;

create trigger trg_orders_updated_at
  before update on public.orders
  for each row execute function public.handle_updated_at();

comment on column public.orders.discount_amount is
  'Descuento aplicado en COP, ya reflejado en orders.total. 0 = sin descuento. '
  'Persiste el descuento REAL: derivarlo como subtotal - total es una '
  'estimacion, y esa deuda ya se pago una vez en Vento.';
comment on column public.orders.discount_type is
  'Como se ingreso: pct | fixed. null si no hubo descuento.';

-- ── ENUMERACION DE vale/descuento — hecha el 2026-08-31 ────────────────────
-- En el commit anterior estas columnas quedaron como PENDIENTE DE ENUMERAR, no
-- como descartadas. Enumerado, el grupo se parte en dos y por eso no se trataba
-- como un bloque:
--
--   VIAJAN (neutras y sostienen peso): discount_amount, discount_type,
--   discount_reason. Una distribuidora hace descuentos como cualquier negocio.
--   Consumidores: supabase-helpers (applyDiscount, idempotente), SalesHistory,
--   y 4 filas de la tabla de 74 columnas de sentry.test.ts (R1 punto 6).
--
--   NO VIAJAN (mecanica promocional de Vento): discount_kind con su valor
--   'vale' (el "ruletazo"), la constraint chk_vale_is_fixed y el indice parcial
--   idx_orders_vale. Sus consumidores —getVouchersTotal en shiftCalc, el KPI
--   "total regalado" de useReports y CloseShiftModal— son TODOS features del
--   vale, no del descuento. Cuelgan de la mecanica, no del mecanismo.
--
-- ⚠️ Asimetria que hace barata esta decision, al reves que con los enums:
--    discount_kind se restringia con un CHECK, no con un tipo enumerado. Un
--    CHECK se amplia con un `alter table` trivial. Si aparece una promocion en
--    Nodo, la columna vuelve sin recrear nada.
--
-- ⏳ PENDIENTE QUE SIGUE ABIERTO: orders.payment_status y orders.customer_id
--    (cartera) se agregan en la migracion `clientes_y_cartera`, cuando exista la tabla customers.
--    Mismo patron que la FK de user_stores en el 03.


-- ------------------------------------------------------------
-- order_items
--
-- 🔴 unit_cost — LA COLUMNA QUE NO SE PUEDE AGREGAR DESPUES
-- El costo se CONGELA aca, al vender. No se recalcula despues leyendo
-- products.cost_price.
--
-- La razon no es que ahora sea barato: es que despues NO SE PUEDE. Si la tabla
-- nace sin esta columna, las ventas ya registradas no se pueden rellenar — el
-- costo del producto al momento de vender es irrecuperable y cualquier backfill
-- seria un numero INVENTADO. Las utilidades de ese periodo quedarian mal PARA
-- SIEMPRE, con la forma de fallo de R7: plausibles, estables y equivocadas.
-- No es una decision cara: es irreversible. Ver R1 punto 8 y deuda #18.
-- ------------------------------------------------------------
create table public.order_items (
  id         uuid           primary key default gen_random_uuid(),
  order_id   uuid           not null references public.orders   on delete cascade,
  product_id uuid           not null references public.products on delete restrict,
  qty        integer        not null check (qty > 0),
  unit_price numeric(12, 2) not null check (unit_price >= 0),
  unit_cost  numeric(12, 2) check (unit_cost >= 0),
  modifiers  jsonb          not null default '[]',
  notes      text,
  created_at timestamptz    not null default now(),
  updated_at timestamptz    not null default now()
);

comment on column public.order_items.unit_price is
  'Snapshot del PRECIO al momento de vender. No referencia products.price en '
  'tiempo real.';
comment on column public.order_items.unit_cost is
  'Snapshot del COSTO unitario al momento de vender (promedio ponderado movil '
  'vigente en ese instante). Nulo solo si el producto no tenia costo conocido '
  '— y eso es informacion, no un hueco: significa que se vendio algo que nunca '
  'se compro, y utilidades debe DECLARARLO, no disimularlo (deuda #19). '
  'Grabarlo hace que el metodo de costeo se pueda cambiar sin reescribir el pasado.';

create index idx_order_items_order_id on public.order_items (order_id);

create trigger trg_order_items_updated_at
  before update on public.order_items
  for each row execute function public.handle_updated_at();


-- ------------------------------------------------------------
-- payments — inmutables por diseño. Sin updated_at.
-- `on delete restrict` sobre orders: una venta con pagos no se borra.
-- ------------------------------------------------------------
create table public.payments (
  id         uuid                  primary key default gen_random_uuid(),
  order_id   uuid                  not null references public.orders on delete restrict,
  sede_id    uuid                  not null references public.sedes  on delete cascade,
  method     public.payment_method not null,
  amount     numeric(12, 2)        not null check (amount > 0),
  created_at timestamptz           not null default now()
);

comment on table public.payments is
  'Inmutable por diseño. Para corregir: eliminar el registro incorrecto y crear '
  'uno nuevo. NO tiene shift_id: la pertenencia a la jornada de caja es '
  'TEMPORAL, no estructural (verificado en el inventario del SQL heredado).';

create index idx_payments_order_id on public.payments (order_id);
create index idx_payments_sede_id  on public.payments (sede_id, created_at desc);


-- ------------------------------------------------------------
-- store_sequences + next_order_number — consecutivo por sede
--
-- El guard compara p_sede_id contra get_my_sede_id() POR UUID y rechaza: nadie
-- numera ventas de una sede ajena. Fail-closed y por-id, no por nombre.
-- ------------------------------------------------------------
create table public.store_sequences (
  sede_id           uuid    primary key references public.sedes (id) on delete cascade,
  last_order_number integer not null default 0
);

comment on table public.store_sequences is
  'Contador de numeracion de ventas por sede. last_order_number es el ultimo '
  'numero entregado; lo incrementa next_order_number() de forma atomica.';

create or replace function public.next_order_number(p_sede_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next integer;
begin
  if p_sede_id is null or p_sede_id <> get_my_sede_id() then
    raise exception 'No autorizado para numerar ventas de esta sede';
  end if;

  insert into public.store_sequences (sede_id, last_order_number)
  values (p_sede_id, 1)
  on conflict (sede_id) do update
    set last_order_number = public.store_sequences.last_order_number + 1
  returning last_order_number into v_next;

  return v_next;
end;
$$;

revoke execute on function public.next_order_number(uuid) from public;
revoke execute on function public.next_order_number(uuid) from anon;
grant  execute on function public.next_order_number(uuid) to authenticated;


-- RLS habilitada aca; policies en el 11 (ver la cabecera de la migracion `organizaciones_y_sedes`).
alter table public.orders          enable row level security;
alter table public.order_items     enable row level security;
alter table public.payments        enable row level security;
alter table public.store_sequences enable row level security;

commit;
