-- ============================================================
-- Nodo · BALANCE DE LA SEDE — «cuánto deberíamos tener»
--
-- Pedido de la clienta (2026-09-21), textual: «lo que iniciamos, quince
-- millones, lo que hemos vendido, lo que hemos gastado y cuánto deberíamos
-- tener. Necesito sí o sí tener ese balance».
--
-- ── R0 ────────────────────────────────────────────────────────────────────
-- 1 · CLASE. FUENTE ÚNICA POR CONCEPTO —un contrato compartido entre la vista,
--     la pantalla y el Excel— más una ALLOWLIST de categorías de caja. Y
--     fail-closed de RLS por `security_invoker`.
-- 2 · PRECEDENTE. La hoja `Definiciones` de `src/lib/exportes.ts`: existe
--     porque dos libros del mismo período no cerraban entre sí y ninguna hoja
--     decía por qué. Es el mismo defecto que esta vista puede cometer, una capa
--     más abajo. Y la allowlist cruzada de `cash_movements.categoria`
--     (20260831121000): la categoría válida depende de la dirección.
-- 3 · MODO DE FALLO. DOBLE CONTEO, y es CALLADO: dos conceptos viven en dos
--     tablas cada uno.
--       · Los ABONOS están en `debt_payments` y también en `cash_movements`
--         como `abono_cliente`.
--       · Las COMPRAS están en `purchase_invoices` y también en
--         `cash_movements` como `compra`.
--     Sumar las dos fuentes no produce ningún error: produce un balance
--     inflado, que es exactamente el número que nadie revisa porque es el que
--     uno quiere ver.
--     🔴 Y NO SON INTERCAMBIABLES, medido el 2026-09-21 sobre la sede real:
--         debt_payments .................. 1.810.600
--         cash_movements abono_cliente ......  495.500
--     Difieren en 1.315.100 porque un abono con la JORNADA CERRADA no escribe
--     movimiento de caja —deja `requiere_conciliacion`—. O sea que elegir mal
--     la fuente no es una cuestión de estilo: pierde plata real.
-- 4 · OBJETIVO. Dos columnas nuevas NULLABLES y una vista de sólo lectura.
--     Ninguna fila tocada, sin DELETE ni UPDATE ni DROP. La sede la acota RLS
--     por la organización del que mira, nunca un nombre ni un patrón.
--
-- ── 🔴 DE DÓNDE SALE CADA NÚMERO, Y POR QUÉ DE AHÍ ────────────────────────
--   ENTRADAS de plata
--     cobrado_ventas .. `payments`. Las ventas NO escriben movimiento de caja,
--                       así que ésta es la única fuente.
--     abonos .......... `debt_payments`. El HECHO del abono. No la caja, por lo
--                       medido arriba.
--     otras_entradas .. `cash_movements` in, EXCLUYENDO dos categorías:
--                       · `abono_cliente` → ya está contado en `debt_payments`;
--                       · `base` → no es plata nueva, es mover plata al cajón.
--   SALIDAS de plata
--     compras ......... `purchase_invoices` (kind purchase). El DOCUMENTO, que
--                       es lo que ella ve en Compras. Al editar una compra,
--                       `update_purchase` actualiza este total, así que ya viene
--                       corregido y no hay que sumar `correccion_compra` aparte.
--     devoluciones .... `purchase_invoices` (kind return): plata que vuelve.
--     gastos/retiros/otras_salidas .. `cash_movements` out, por categoría.
--   ⛔ `cash_movements` out categoría `compra` y `correccion_compra` NO se
--      suman: las compras ya entran por el documento. Sumarlas sería el doble
--      conteo que esta cabecera describe.
--
-- ── ⚠️ LO QUE ESTA VISTA NO HACE: LA ARITMÉTICA ───────────────────────────
--   Devuelve los COMPONENTES, no el balance. Las restas viven en
--   `src/lib/balance.ts`, en una sola función que usan la pantalla Y el Excel,
--   con tests unitarios. Si la cuenta viviera acá y otra vez en el TS, serían
--   dos lados de un contrato sin nada que los sincronice (R1) — y el lado que
--   se congela siempre es el que nadie mira.
--
-- ── ⚠️ LOS TRES CONTADORES DE HONESTIDAD, y no son adorno ────────────────
--   `productos_sin_costo`, `unidades_sin_costo` y `lineas_venta_sin_costo`
--   existen porque un costo ausente se convierte en CERO al sumar, y un costo
--   cero es un margen del 100% — «un número plausible en la dirección
--   agradable no lo investiga nadie». Medido el 2026-09-21 en la sede real: 5
--   productos y 29 unidades en bodega sin costo, y 8 líneas de venta sin costo.
--   Esos 29 unidades valen 0 en `inventario_a_costo`, y son la explicación
--   principal de los 272.200 que no cerraban. El reporte los MUESTRA en vez de
--   repartir el descuadre en silencio.
--
-- ── ⚠️ CAPITAL INICIAL: NULLABLE A PROPÓSITO ──────────────────────────────
--   Sin configurar es NULL, nunca 0. Un 0 afirmaría que arrancó sin plata, que
--   es un dato falso y plausible; el NULL dice que nadie lo cargó todavía, y la
--   pantalla puede pedirlo en vez de mostrar un balance que miente.
-- ============================================================

begin;

alter table public.sedes
  add column if not exists capital_inicial       numeric(14, 2) check (capital_inicial >= 0),
  add column if not exists capital_inicial_desde date;

comment on column public.sedes.capital_inicial is
  'Plata con la que se arrancó el negocio, en COP. NULL = no configurado, '
  'nunca 0: un 0 afirmaria que arranco sin nada. Alimenta el Balance de '
  'Reportes. Ver 20260921160000.';
comment on column public.sedes.capital_inicial_desde is
  'Fecha desde la que cuenta ese capital. El Balance es ACUMULADO desde aca '
  'hasta hoy, no un reporte de periodo. NULL = no configurado.';

create or replace view public.balance_de_sede
  with (security_invoker = true)
as
select
  s.id as sede_id,
  -- El nombre viaja con los componentes porque el EXCEL lo necesita: un archivo
  -- guardado sin decir de qué sede es se vuelve indistinguible de otro en una
  -- carpeta, y el perfil del usuario no lo trae.
  s.name as sede_nombre,
  s.capital_inicial,
  s.capital_inicial_desde,

  -- ── ENTRADAS ────────────────────────────────────────────────────────────
  (select coalesce(sum(p.amount), 0) from public.payments p
    where p.sede_id = s.id) as cobrado_ventas,
  (select coalesce(sum(d.amount), 0) from public.debt_payments d
     join public.orders o on o.id = d.order_id
    where o.sede_id = s.id) as abonos,
  -- Allowlist por EXCLUSIÓN declarada: las dos que se sacan están nombradas
  -- arriba con su razón. Una categoría nueva entra acá por defecto, que es la
  -- dirección correcta — aparece en el balance y se ve, en vez de perderse.
  (select coalesce(sum(c.amount), 0) from public.cash_movements c
    where c.sede_id = s.id and c.type = 'in'
      and c.categoria not in ('abono_cliente', 'base')) as otras_entradas,

  -- ── SALIDAS ─────────────────────────────────────────────────────────────
  (select coalesce(sum(f.total), 0) from public.purchase_invoices f
    where f.sede_id = s.id and f.kind = 'purchase') as compras,
  (select coalesce(sum(f.total), 0) from public.purchase_invoices f
    where f.sede_id = s.id and f.kind = 'return') as devoluciones_proveedor,
  (select coalesce(sum(c.amount), 0) from public.cash_movements c
    where c.sede_id = s.id and c.type = 'out' and c.categoria = 'gasto') as gastos,
  (select coalesce(sum(c.amount), 0) from public.cash_movements c
    where c.sede_id = s.id and c.type = 'out' and c.categoria = 'retiro') as retiros,
  (select coalesce(sum(c.amount), 0) from public.cash_movements c
    where c.sede_id = s.id and c.type = 'out' and c.categoria = 'otro') as otras_salidas,

  -- ── EL RESULTADO DEL NEGOCIO ────────────────────────────────────────────
  (select coalesce(sum(o.total), 0) from public.orders o
    where o.sede_id = s.id and o.cancelled_at is null) as vendido,
  -- Costo CONGELADO en la línea (R1 punto 8). No se lee el costo actual del
  -- producto: si se leyera, cada compra nueva cambiaria la utilidad de meses
  -- pasados y el reporte daria distinto cada vez que se abre.
  (select coalesce(sum(i.qty * i.unit_cost), 0) from public.order_items i
     join public.orders o on o.id = i.order_id
    where o.sede_id = s.id and o.cancelled_at is null) as costo_vendido,

  -- ── DÓNDE ESTÁ LA PLATA ─────────────────────────────────────────────────
  (select coalesce(sum(p.stock_qty * p.cost_price), 0) from public.products p
    where p.sede_id = s.id and p.stock_tracking and p.cost_price is not null) as inventario_a_costo,
  (select coalesce(sum(o.total), 0) from public.orders o
    where o.sede_id = s.id and o.cancelled_at is null
      and o.payment_status in ('pending', 'partial'))
  - (select coalesce(sum(d.amount), 0) from public.debt_payments d
       join public.orders o on o.id = d.order_id
      where o.sede_id = s.id and o.cancelled_at is null
        and o.payment_status in ('pending', 'partial')) as cartera,

  -- ── CONTADORES DE HONESTIDAD ────────────────────────────────────────────
  (select count(*) from public.products p
    where p.sede_id = s.id and p.stock_tracking and p.cost_price is null) as productos_sin_costo,
  (select coalesce(sum(p.stock_qty), 0) from public.products p
    where p.sede_id = s.id and p.stock_tracking and p.cost_price is null) as unidades_sin_costo,
  (select count(*) from public.order_items i
     join public.orders o on o.id = i.order_id
    where o.sede_id = s.id and o.cancelled_at is null
      and i.unit_cost is null) as lineas_venta_sin_costo

from public.sedes s;

comment on view public.balance_de_sede is
  'Los COMPONENTES del balance de una sede, acumulados desde el inicio. NO trae '
  'el balance hecho: las restas viven en src/lib/balance.ts, una sola vez, para '
  'la pantalla y el Excel. Cada concepto tiene UNA fuente declarada porque '
  'abonos y compras viven en dos tablas cada uno y sumarlas infla el balance '
  'sin error visible. Ver 20260921160000.';

-- ── VERIFICACIÓN, adentro de la transacción y con raise ────────────────────
do $$
declare
  v_sedes  bigint;
  v_filas  bigint;
  v_dupli  bigint;
begin
  -- UNA FILA POR SEDE. Si una subconsulta se volviera correlacionada de más o
  -- alguien metiera un join en el FROM, la vista multiplicaría filas y todos
  -- los totales saldrían repetidos SIN ERROR.
  select count(*) into v_sedes from public.sedes;
  select count(*) into v_filas from public.balance_de_sede;
  if v_sedes <> v_filas then
    raise exception
      'LA VISTA NO DEVUELVE UNA FILA POR SEDE: sedes % vs filas %. Los totales '
      'saldrian multiplicados. Se revierte.', v_sedes, v_filas;
  end if;

  select count(*) into v_dupli from (
    select sede_id from public.balance_de_sede group by sede_id having count(*) > 1
  ) t;
  if v_dupli > 0 then
    raise exception 'LA VISTA REPITE SEDES: % con mas de una fila.', v_dupli;
  end if;

  raise notice 'balance_de_sede creada: % sedes.', v_filas;
end $$;

revoke all on public.balance_de_sede from anon;
grant select on public.balance_de_sede to authenticated;

commit;
