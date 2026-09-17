-- ============================================================
-- Nodo · Movimientos de stock CON SALDO, y existencia sin movimiento
--
-- Pedido de la clienta (2026-09-17): «eso nos ayuda a cuadrar». El uso es
-- AUDITAR UN DESCUADRE, así que el saldo tiene que ser confiable bajo cualquier
-- filtro de la pantalla.
--
-- ── R0 ────────────────────────────────────────────────────────────────────
-- 1 · CLASE. Contrato compartido —el ORDEN de la ventana y el orden de la tabla
--     son dos lados— y fail-closed de RLS en una vista.
-- 2 · PRECEDENTE. `20260831121400_vistas.sql`: `security_invoker = true` es «lo
--     más importante del archivo». Sin él la vista corre como su dueño y saltea
--     el RLS de las tablas de abajo.
-- 3 · MODO DE FALLO. Sin invoker: movimientos de OTRAS organizaciones, sin error
--     y con números plausibles — falla ABIERTO, así que va con invoker, `revoke`
--     a anon, y un caso E2E. Un saldo mal anclado falla CALLADO: por eso el ancla
--     se midió antes de elegirla (abajo).
-- 4 · OBJETIVO. Sólo lectura: dos vistas, ninguna fila tocada. Sin DELETE,
--     UPDATE ni DROP.
--
-- ── 🔴 EL SALDO SE ANCLA EN EL PRESENTE Y SE RESTA HACIA ATRÁS ─────────────
--   saldo_despues(m) = products.stock_qty − Σ qty de los movimientos POSTERIORES
--                      a m, del mismo producto, SIN IMPORTAR EL FILTRO.
--
--   Dos alternativas descartadas, con su razón:
--   · Sumar las filas VISIBLES: arranca en cero dentro del rango y no corresponde
--     a nada. Un número plausible en la dirección agradable.
--   · Acumular DESDE EL ORIGEN (desde cero hacia adelante): medido contra LAB el
--     2026-09-17, 269 de 1.537 productos tienen `stock_qty ≠ Σ qty`, porque el
--     alta de un producto admite existencia inicial SIN escribir movimiento
--     («AV Simple»: stock_qty 56, Σ qty −4). Desde el origen, TODAS sus filas
--     saldrían corridas en 60 y ninguna se vería rara.
--   Anclado en el presente, la fila más nueva coincide con el número de
--   Inventario, y lo que no está registrado aparece como número propio
--   (`existencia_sin_movimiento`) en vez de repartirse en silencio.
--   ⚠️ LÍMITE, dicho: si un cambio sin movimiento ocurrió A MITAD de la historia,
--   las filas anteriores a él quedan corridas. No hay forma de ubicarlo en el
--   tiempo; el total del descuadre sí sale, en la segunda vista.
--
-- ── 🔴 ORDEN: `created_at, id`, EN LA VENTANA Y EN LA TABLA ────────────────
--   El empate es CONSTRUIBLE: dos líneas del mismo producto en una venta
--   comparten el `now()` de la transacción. Sin desempate el motor elige, y el
--   saldo intermedio de esas filas cambia entre dos lecturas. En LAB se midieron
--   0 empates — una muestra, no una garantía. `getStockMovements` ordena por las
--   MISMAS dos columnas y en el mismo sentido; si uno cambia, el otro también.
--
-- ── ⚠️ LEFT JOIN a products, no inner ──────────────────────────────────────
--   Nada garantiza que la sede del movimiento sea la del producto. Con inner,
--   un movimiento cuyo producto el RLS no deja ver DESAPARECERÍA — la forma que
--   escondió una clase entera de ventas en el Historial. Con left, la fila está
--   y su saldo es nulo: un hueco visible.
--
-- ── Nulos que NO se convierten en cero ─────────────────────────────────────
--   · `stock_tracking = false` → el producto no lleva existencia: saldo nulo.
--   · `stock_qty` nulo → no hay de dónde anclar: saldo nulo.
--   La pantalla pinta «—». Un 0 afirmaría una existencia que nadie contó.
--
-- ── Filtros de la pantalla y la ventana ────────────────────────────────────
--   PostgREST filtra sobre la vista. Postgres NO empuja un filtro por
--   `created_at` o `type` por debajo de una ventana, así que el saldo se calcula
--   sobre TODA la historia del producto y el filtro sólo elige filas — que es la
--   semántica pedida. `sede_id` y `product_id` sí se empujan: son las columnas
--   de la partición, y un producto vive en una sola sede.
-- ============================================================

begin;

create or replace view public.stock_movements_con_saldo
  with (security_invoker = true)
as
select
  m.id,
  m.sede_id,
  m.product_id,
  m.type,
  m.qty,
  m.reference_id,
  m.notes,
  m.created_by,
  m.created_at,
  case
    when p.stock_tracking and p.stock_qty is not null then
      p.stock_qty - coalesce(sum(m.qty) over (
        partition by m.sede_id, m.product_id
        order by m.created_at desc, m.id desc
        rows between unbounded preceding and 1 preceding
      ), 0)
  end as saldo_despues
from public.stock_movements m
left join public.products p on p.id = m.product_id;

comment on view public.stock_movements_con_saldo is
  'Movimientos de stock con la existencia DESPUÉS de cada uno, anclada en '
  'products.stock_qty y restando hacia atrás los movimientos posteriores. '
  'Orden de la ventana: created_at desc, id desc — el mismo que usa la pantalla. '
  'Nulo si el producto no lleva existencia o no tiene stock_qty. '
  'Ver 20260917120000_movimientos_con_saldo.sql.';

create or replace view public.productos_existencia_sin_movimiento
  with (security_invoker = true)
as
select
  p.id as product_id,
  p.sede_id,
  case
    when p.stock_tracking and p.stock_qty is not null then
      p.stock_qty - coalesce(sum(m.qty), 0)
  end as existencia_sin_movimiento
from public.products p
left join public.stock_movements m on m.product_id = p.id
group by p.id, p.sede_id, p.stock_tracking, p.stock_qty;

comment on view public.productos_existencia_sin_movimiento is
  'products.stock_qty − Σ stock_movements.qty. Distinto de cero = existencia '
  'que ningún movimiento explica (típicamente la inicial del alta). Nulo si no '
  'lleva existencia. Es la otra mitad del saldo de stock_movements_con_saldo.';

-- Las dos leen tablas con RLS por invoker, así que anon no vería filas igual.
-- El revoke es fail-closed explícito, no la protección.
revoke all on public.stock_movements_con_saldo from anon;
revoke all on public.productos_existencia_sin_movimiento from anon;
grant select on public.stock_movements_con_saldo to authenticated;
grant select on public.productos_existencia_sin_movimiento to authenticated;

commit;
