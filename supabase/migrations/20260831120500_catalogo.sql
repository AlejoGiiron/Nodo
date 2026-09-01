-- ============================================================
-- Nodo — Esquema base · 05 · Catalogo (categorias y productos)
--
-- ORIGEN: consolidado de Vento `d848852`:
--   · categories, products      ← schema.sql, seccion 3
--   · products.stock_qty sin check ← products-allow-negative-stock.sql
--   · products.min_stock        ← inventory-min-stock.sql
--   · products.kind             ← inventory-recipes.sql
--   · products.cost_price       ← compras-proveedores.sql  (semantica ADAPTADA, ver abajo)
--
-- R5: no aplicado en Nodo (base vacia). Desde el primer `db push`, R5 manda.
--
-- NO viaja `routes_to_kitchen` (cocina, clase B). Enumeracion en la migracion `organizaciones_y_sedes`.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- categories
-- ------------------------------------------------------------
create table public.categories (
  id          uuid        primary key default gen_random_uuid(),
  sede_id     uuid        not null references public.sedes on delete cascade,
  name        text        not null,
  description text,
  color       text        not null default '#6366f1',
  sort_order  integer     not null default 0,
  is_active   boolean     not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.categories is 'Agrupan los productos del catalogo.';

create index idx_categories_sede_id on public.categories (sede_id);

create trigger trg_categories_updated_at
  before update on public.categories
  for each row execute function public.handle_updated_at();


-- ------------------------------------------------------------
-- products
--
-- ⚠️ `on delete restrict` en category_id es deliberado y se conserva: borrar una
--    categoria con productos adentro tiene que FALLAR, no arrastrarlos. Es
--    fail-closed sobre datos del cliente.
-- ------------------------------------------------------------
create table public.products (
  id             uuid           primary key default gen_random_uuid(),
  sede_id        uuid           not null references public.sedes      on delete cascade,
  category_id    uuid           not null references public.categories on delete restrict,
  name           text           not null,
  description    text,
  price          numeric(12, 2) not null check (price >= 0),
  cost_price     numeric(12, 2) check (cost_price >= 0),
  image_url      text,
  is_active      boolean        not null default true,
  kind           text           not null default 'simple'
                                check (kind in ('simple', 'composite')),
  stock_tracking boolean        not null default false,
  stock_qty      integer,
  min_stock      integer        not null default 0,
  created_at     timestamptz    not null default now(),
  updated_at     timestamptz    not null default now()
);

-- ── stock_qty: SIN check >= 0, y esto es una decision, no un olvido ─────────
comment on column public.products.stock_qty is
  'Nulo cuando stock_tracking = false. PUEDE SER NEGATIVO a proposito: el '
  'negativo señala sobreventa (estimacion, no verdad de caja) e indica cuanto '
  'reponer. Con un check >= 0, una sobreventa REVENTARIA LA VENTA en el '
  'mostrador en vez de registrar el faltante. No agregar el check.';

-- ── cost_price: SEMANTICA ADAPTADA, no copiada ──────────────────────────────
-- En Vento el comentario dice "ultimo costo conocido". En Nodo el metodo de
-- costeo decidido es PROMEDIO PONDERADO MOVIL (deuda #18): el cliente describe
-- un solo costo por producto, lo que descarta PEPS y lotes, y frente a "ultimo
-- costo" el promedio evita que una compra cara desplome la utilidad en el papel.
-- Copiar el comentario habria dejado una nota que dirige mal desde el dia uno.
comment on column public.products.cost_price is
  'Costo unitario por PROMEDIO PONDERADO MOVIL, recalculado en cada compra. '
  'Nulo hasta la primera compra registrada. Lo mantiene register_purchase '
  '(migracion `compras`). 🔴 NO es la fuente del costo historico: el costo de una venta '
  'se CONGELA en la linea de venta al vender (R1 punto 8, migracion `ventas`). Leer '
  'este campo para calcular utilidades pasadas da un numero distinto cada vez '
  'que se abre el reporte.';

comment on column public.products.kind is
  'simple = tiene stock propio. composite = no tiene stock propio; al venderse '
  'explota product_components y descuenta sus componentes. En Nodo composite '
  'es el BULTO que se vende por unidad (ver migracion `inventario`); en Vento era la '
  'receta. Mismo mecanismo, otro nombre de negocio.';

comment on column public.products.min_stock is
  'Umbral de alerta de stock bajo. Default 0 = sin alerta hasta configurarlo.';

create index idx_products_sede_id     on public.products (sede_id);
create index idx_products_category_id on public.products (category_id);

create trigger trg_products_updated_at
  before update on public.products
  for each row execute function public.handle_updated_at();


-- RLS habilitada aca; policies en el 11 (ver la cabecera de la migracion `organizaciones_y_sedes`).
alter table public.categories enable row level security;
alter table public.products   enable row level security;

commit;
