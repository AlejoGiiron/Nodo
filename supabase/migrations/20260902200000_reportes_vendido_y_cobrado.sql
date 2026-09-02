-- ============================================================================
-- DEUDA 53 · REPORTES TENIA DOS DEFINICIONES DE "VENTAS", Y NINGUNA LO DECIA
--
-- Origen: auditoria A3 (2026-09-02), `docs/auditorias/A3-rotulos-que-afirman.md`
-- §2 y §3. La pestaña Financiero llamaba "Ventas totales" a `sum(payments.amount)`
-- —COBRADO— y "Ordenes" a un conteo que exige JOIN a payments —solo las que ya
-- cobraron—; la pestaña Stock y el Top 10 llamaban "Revenue" a
-- `sum(qty * unit_price)` —VENDIDO BRUTO—. Y los dos Excel del mismo periodo no
-- cerraban entre si, sin que ninguna hoja dijera por que.
--
-- MEDIDO EN EL LAB el 2026-09-02, periodo desde el 01-09 (consulta con
-- subqueries, sin el fan-out del join a payments):
--
--     ordenes no anuladas ............. 691
--     ordenes CON PAGO ................ 431   <- lo que la vista contaba
--     vendido  (sum orders.total) ..... 9.647.600
--     cobrado  (sum payments.amount) .. 6.100.600   <- lo que la vista sumaba
--     suma de lineas (Top 10) ......... 9.838.000   <- ni una ni la otra
--
-- Tres numeros distintos. La diferencia vendido-vs-lineas son los descuentos;
-- la diferencia vendido-vs-cobrado es la cartera. Las tres preguntas son
-- legitimas y **se miran a diario en un negocio que fia** — lo que no es
-- legitimo es que las tres se llamen "ventas".
--
-- ── QUE CAMBIA ──────────────────────────────────────────────────────────────
--
-- `total_revenue` DESAPARECE. Era el corazon del problema: un nombre que no dice
-- que mide, leido como vendido y calculado como cobrado. Es el criterio "un
-- valor que significa dos cosas no es un dato", aplicado a un nombre.
--
--   sold_total ......... suma de `orders.total` de ordenes no anuladas. VENDIDO
--                        (facturado, con el descuento ya aplicado).
--   collected_total .... suma de `payments.amount`. COBRADO.
--   order_count ........ ordenes no anuladas, TODAS. Antes exigia pago.
--   paid_order_count ... ordenes con al menos un pago. Para el ticket de lo
--                        cobrado, si alguna vez se pide: numerador y denominador
--                        de la MISMA poblacion.
--   avg_ticket ......... `sold_total / order_count`. Antes era
--                        `cobrado / ordenes_con_pago`... no: era `cobrado /
--                        ordenes_con_pago` en la vista y `cobrado / ordenes` en
--                        la pantalla. Ninguna de las dos significaba nada.
--   cash/card/transfer/nequi_total ... siguen siendo de lo COBRADO, que es lo
--                        unico que un metodo de pago puede medir.
--
-- 🔴 EL FAN-OUT, que es la razon de las subconsultas: unir `orders` con
--    `payments` y sumar `o.total` MULTIPLICA el total por la cantidad de pagos
--    de cada orden — una venta mixta cuenta doble. Ya nos mordio una vez, en una
--    consulta de diagnostico (165 ordenes donde la app decia 158). Por eso
--    `sold_total` y `order_count` salen de un agregado de `orders` SOLO, y lo de
--    `payments` se agrega aparte y se une por (dia, sede, canal).
--
-- R5: migracion nueva. Es `drop view` + `create view` y no `create or replace`
-- porque se QUITA una columna, y `replace` no lo permite.
--
-- Verificacion: `src/lib/exportes.test.ts` (el contenido de los dos Excel) y
-- `tests/reportes.spec.ts`. Y el contraste contra los numeros de arriba.
-- ============================================================================

begin;

drop view if exists public.daily_sales_summary;

create view public.daily_sales_summary
  with (security_invoker = true)
as
with ordenes as (
  select
    (o.created_at at time zone 'America/Bogota')::date as day,
    o.sede_id,
    o.canal,
    count(*)                                           as order_count,
    coalesce(sum(o.total), 0)                          as sold_total
  from public.orders o
  where o.cancelled_at is null
  group by 1, 2, 3
),
cobros as (
  select
    (o.created_at at time zone 'America/Bogota')::date as day,
    o.sede_id,
    o.canal,
    count(distinct o.id)                                             as paid_order_count,
    coalesce(sum(p.amount), 0)                                       as collected_total,
    coalesce(sum(p.amount) filter (where p.method = 'cash'),     0)  as cash_total,
    coalesce(sum(p.amount) filter (where p.method = 'card'),     0)  as card_total,
    coalesce(sum(p.amount) filter (where p.method = 'transfer'), 0)  as transfer_total,
    coalesce(sum(p.amount) filter (where p.method = 'nequi'),    0)  as nequi_total
  from public.orders o
  join public.payments p on p.order_id = o.id
  where o.cancelled_at is null
  group by 1, 2, 3
)
select
  o.day,
  o.sede_id,
  o.canal,
  o.order_count,
  o.sold_total,
  coalesce(c.paid_order_count, 0) as paid_order_count,
  coalesce(c.collected_total, 0)  as collected_total,
  coalesce(c.cash_total, 0)       as cash_total,
  coalesce(c.card_total, 0)       as card_total,
  coalesce(c.transfer_total, 0)   as transfer_total,
  coalesce(c.nequi_total, 0)      as nequi_total,
  round(o.sold_total / nullif(o.order_count, 0), 2) as avg_ticket
from ordenes o
left join cobros c
  on  c.day     = o.day
  and c.sede_id = o.sede_id
  and c.canal   = o.canal;

comment on view public.daily_sales_summary is
  'Resumen diario por sede y canal. VENDIDO (sold_total) y COBRADO (collected_total) son cifras distintas y ambas se exponen: en un negocio con cartera son dos preguntas que se miran a diario. order_count cuenta TODAS las ordenes no anuladas; paid_order_count solo las que tienen algun pago. avg_ticket = vendido / ordenes, misma poblacion en numerador y denominador. Deuda 53.';

commit;
