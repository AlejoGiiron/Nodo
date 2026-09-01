-- ============================================================
-- G-Nexo — Esquema base · 12 · Vistas de reportes
--
-- ORIGEN: G-Vento `d848852`, supabase/reports-views.sql (clase C: viaja con
-- cambios). Ultimo archivo del esquema base.
--
-- R5: no aplicado en G-Nexo (base vacía). Desde el primer `db push`, R5 manda.
--
-- ── security_invoker = true — LO MAS IMPORTANTE DE ESTE ARCHIVO ────────────
-- Sin esto, una vista corre con los permisos de su DUEÑO y NO aplica el RLS de
-- las tablas de abajo: cualquier usuario veria las ventas de TODAS las sedes.
-- Es la peor falla posible acá y seria silenciosa —los numeros se ven bien,
-- solo que son de otro negocio—. Con security_invoker, el RLS de orders,
-- payments, products y profiles se aplica con las credenciales de quien
-- consulta, asi que las vistas no necesitan policies propias.
-- Requiere PostgreSQL 15+.
--
-- ── R7 YA ESTABA BIEN, Y SE CONSERVA TAL CUAL ─────────────────────────────
-- Las cuatro calculan la frontera del dia como
-- `(created_at at time zone 'America/Bogota')::date`. Es el hallazgo H6 del
-- inventario: se anota en positivo para que nadie lo "simplifique" a
-- `created_at::date`, que daria dias corridos en UTC y numeros plausibles y
-- equivocados a partir de las 19:00 hora local.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1 · daily_sales_summary — ventas por dia y metodo de pago
--
-- CAMBIO: se cae la dimension `order_type`. El eje dine_in/takeaway/delivery no
-- existe en G-Nexo (migracion `extensiones_y_tipos`).
--
-- 🔴 CAMBIO DE FONDO: la exclusion de anuladas pasa de `status != 'cancelled'`
--    a `cancelled_at is null`. Las dos marcan el mismo hecho, y tener DOS
--    marcadores para un hecho es la misma clase de defecto que `reason`
--    cumpliendo dos funciones. `cancelled_at` es el canonico —es el que la
--    anulacion escribe primero, el que documenta el comentario de la columna y
--    el que tiene indice parcial (idx_orders_cancelled)—; `status` es un
--    proxy que podria quedar desincronizado sin que nadie lo note.
--
-- ⚠️ SEMANTICA QUE IMPORTA MAS DE LO QUE PARECE: el `join` con payments hace
--    que esto sea INGRESO COBRADO, no VENDIDO. Una venta a credito sin abonos
--    no aparece. Con cartera en el alcance eso deja de ser un detalle: quien
--    lea "ventas del dia" y espere lo facturado, va a leer menos. El nombre
--    dice `revenue` y el dato es caja.
-- ------------------------------------------------------------
create or replace view public.daily_sales_summary
  with (security_invoker = true)
as
select
  (o.created_at at time zone 'America/Bogota')::date               as day,
  o.sede_id,
  count(distinct o.id)                                             as order_count,
  coalesce(sum(p.amount), 0)                                       as total_revenue,
  round(coalesce(sum(p.amount), 0) / nullif(count(distinct o.id), 0), 2)
                                                                   as avg_ticket,
  coalesce(sum(p.amount) filter (where p.method = 'cash'),     0)  as cash_total,
  coalesce(sum(p.amount) filter (where p.method = 'card'),     0)  as card_total,
  coalesce(sum(p.amount) filter (where p.method = 'transfer'), 0)  as transfer_total,
  coalesce(sum(p.amount) filter (where p.method = 'nequi'),    0)  as nequi_total
from public.orders o
join public.payments p on p.order_id = o.id
where o.cancelled_at is null
group by
  (o.created_at at time zone 'America/Bogota')::date,
  o.sede_id;


-- ------------------------------------------------------------
-- 2 · product_performance — unidades y venta por producto y dia
--
-- ⏳ NO calcula margen todavia, y es deliberado. `order_items.unit_cost` ya
--    existe (migracion `ventas`) y con el margen es `sum(qty * (unit_price -
--    unit_cost))` — pero utilidades tiene una condicion sin resolver: que hacer
--    cuando `unit_cost` es nulo, o sea cuando se vendio algo que nunca se
--    compro. Eso es la deuda #19: la pantalla debe DECLARARLO, no promediarlo
--    ni tratarlo como cero. Agregarlo acá sin resolver eso produciria un margen
--    que se ve bien y esta mal.
-- ------------------------------------------------------------
create or replace view public.product_performance
  with (security_invoker = true)
as
select
  (o.created_at at time zone 'America/Bogota')::date as day,
  o.sede_id,
  oi.product_id,
  p.name                                             as product_name,
  c.id                                               as category_id,
  c.name                                             as category_name,
  sum(oi.qty)                                        as total_qty,
  sum(oi.qty * oi.unit_price)                        as total_revenue
from public.order_items oi
join public.orders     o on o.id = oi.order_id
join public.products   p on p.id = oi.product_id
join public.categories c on c.id = p.category_id
where o.cancelled_at is null
group by
  (o.created_at at time zone 'America/Bogota')::date,
  o.sede_id,
  oi.product_id,
  p.name,
  c.id,
  c.name;


-- ------------------------------------------------------------
-- 3 · hourly_sales — ordenes e ingreso por hora (zona Bogota)
-- Sirve para ver las horas pico del mostrador.
-- ------------------------------------------------------------
create or replace view public.hourly_sales
  with (security_invoker = true)
as
select
  (o.created_at at time zone 'America/Bogota')::date                       as day,
  extract(hour from (o.created_at at time zone 'America/Bogota'))::integer as hour,
  o.sede_id,
  count(distinct o.id)                                                     as order_count,
  coalesce(sum(p.amount), 0)                                               as total_revenue
from public.orders o
join public.payments p on p.order_id = o.id
where o.cancelled_at is null
group by
  (o.created_at at time zone 'America/Bogota')::date,
  extract(hour from (o.created_at at time zone 'America/Bogota')),
  o.sede_id;


-- ------------------------------------------------------------
-- 4 · user_performance — ex `waiter_performance`
--
-- 🔴 EL RENOMBRE NO ES COSMETICO: esta vista NUNCA midio mozos. Une por
--    `o.created_by` contra `profiles`, o sea que mide QUIEN REGISTRO LA VENTA.
--    De mesas no tiene nada. El nombre mentia ya en G-Vento (hallazgo H7).
--    Es el segundo caso —despues de product_components— en que lo especifico
--    de bar estaba en la etiqueta y no en la pieza.
-- ------------------------------------------------------------
create or replace view public.user_performance
  with (security_invoker = true)
as
select
  (o.created_at at time zone 'America/Bogota')::date as day,
  o.sede_id,
  o.created_by                                       as user_id,
  pr.full_name                                       as user_name,
  count(distinct o.id)                               as order_count,
  coalesce(sum(p.amount), 0)                         as total_revenue,
  round(coalesce(sum(p.amount), 0) / nullif(count(distinct o.id), 0), 2)
                                                     as avg_ticket
from public.orders   o
join public.payments p  on p.order_id = o.id
join public.profiles pr on pr.id      = o.created_by
where o.cancelled_at is null
group by
  (o.created_at at time zone 'America/Bogota')::date,
  o.sede_id,
  o.created_by,
  pr.full_name;

commit;
