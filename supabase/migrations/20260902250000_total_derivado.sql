-- ============================================================================
-- `orders.total` SE DERIVA EN EL SERVIDOR — deuda 80
--
-- 🔴 POR QUE, Y POR QUE AHORA. Hoy el total y las lineas salen del MISMO
--    `item.product.price` en el MISMO render del cliente, asi que coinciden
--    **por construccion**: no estan verificados, es que no pueden diferir. El
--    precio editable (deuda 75) destruye esa propiedad y la convierte en una
--    **convencion** entre dos calculos del cliente — R1 nacido a proposito,
--    sobre el numero que sostiene la plata. Por eso esto va ANTES.
--
-- LA FORMULA:
--   total = Σ(order_items.qty × unit_price)
--         + Σ(order_item_extras.qty × unit_price)
--         − orders.discount_amount
--
-- ── LAS CUATRO PREGUNTAS DE R0 ────────────────────────────────────────────
-- 1 · CLASE. Se DERIVA en el servidor lo que hoy se recibe del cliente: el
--     invariante deja de depender de quien escribe.
-- 2 · PRECEDENTE. R6 (un invariante no depende de quien mira) y la deuda 60
--     (el guard vive donde no depende del llamador). Es la misma familia que
--     RLS, que el CHECK del factor de equivalencia y que el de la fecha futura.
-- 3 · MODO DE FALLO. El total discrepa de sus lineas **sin error**, y de ahi
--     comen la validacion de pagos, los reportes y la cartera. Fail-closed por
--     construccion: no hay forma de escribir un total que no salga de las
--     lineas.
-- 4 · OBJETIVO. Derivado, nunca recibido.
--
-- ── MEDICION PREVIA, y cambio el alcance ──────────────────────────────────
-- Antes de escribir esto se comparo el total guardado contra la formula en las
-- **1.424 ordenes** existentes: **18 difieren**, con 416.000 de diferencia
-- absoluta. Al caracterizarlas, las 18 tienen `order_number is null`:
--
--   · 14 con lineas y total 0  -> ordenes que los E2E insertan sin total
--   · 4 sin lineas y total > 0 -> ordenes que los E2E insertan con total y sin
--                                 items (fixtures de cartera y de plazo)
--
-- 🔴 **Entre las ordenes NUMERADAS —las ventas reales— no hay ni una
--    divergencia.** Una venta real siempre recibe numero (`assignOrderNumber`).
--    O sea: la coincidencia por construccion se sostuvo donde importaba, y lo
--    que diverge es residuo de nuestros propios specs.
--
-- ⚠️ **NO SE HACE BACKFILL, y es deliberado.** Reescribir totales existentes
--    para que cumplan un invariante que se acaba de inventar es la misma forma
--    que editar la lista de un tripwire para que pase. Ninguna de las 18 es una
--    venta; el trigger rige de aca en adelante y la medicion queda escrita.
--
-- R5: archivo nuevo.
-- ============================================================================

begin;

-- ── 1 · EL CALCULO, EN UN SOLO LUGAR ───────────────────────────────────────
create or replace function public.recalcular_total_de_orden(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $recalc$
declare
  v_items    numeric(12, 2);
  v_extras   numeric(12, 2);
  v_desc     numeric(12, 2);
begin
  select coalesce(sum(oi.qty * oi.unit_price), 0)
  into v_items
  from public.order_items oi
  where oi.order_id = p_order_id;

  -- 🔴🔴 LA TRAMPA DE ESTE ESQUEMA, Y ESTA ESCRITA ACA A PROPOSITO PORQUE ES
  --      DONDE SE LEE DENTRO DE UN ANO: `order_item_extras.qty` **YA VIENE
  --      MULTIPLICADA** por la cantidad de la linea. La RPC de alta hace
  --      `v_total_qty := v_extra_qty * v_item_qty` ANTES de insertar, porque esa
  --      misma qty es la que descuenta stock del producto vinculado.
  --
  --      Volver a multiplicar por `oi.qty` aca es lo natural —es lo que uno
  --      escribe sin mirar la RPC— y **DUPLICARIA los extras**. El resultado
  --      seria un total mas alto, plausible, y sin ningun error: el perfil
  --      exacto de R7. Por eso el join a `order_items` es SOLO para llegar a la
  --      orden, y `oi.qty` no aparece en la cuenta.
  select coalesce(sum(oie.qty * oie.unit_price), 0)
  into v_extras
  from public.order_item_extras oie
  join public.order_items oi on oi.id = oie.order_item_id
  where oi.order_id = p_order_id;

  select o.discount_amount
  into v_desc
  from public.orders o
  where o.id = p_order_id;

  -- La orden ya no existe: se borro y el cascade esta arrastrando sus lineas.
  -- No hay nada que recalcular, y no es un error.
  if not found then
    return;
  end if;

  update public.orders
     set total = v_items + v_extras - coalesce(v_desc, 0)
   where id = p_order_id;
end;
$recalc$;

comment on function public.recalcular_total_de_orden(uuid) is
  'Deriva orders.total de sus lineas (deuda 80). SECURITY DEFINER porque un '
  'invariante de datos no puede depender de las policies del que escribe (R6). '
  'No se concede a authenticated: la invocan los triggers, que corren como el '
  'owner. Concederla dejaria a cualquiera recalcular el total de cualquier orden.';

revoke execute on function public.recalcular_total_de_orden(uuid) from public;
revoke execute on function public.recalcular_total_de_orden(uuid) from anon;


-- ── 2 · LOS DOS DISPARADORES ───────────────────────────────────────────────
create or replace function public.trg_total_desde_items()
returns trigger
language plpgsql
security definer
set search_path = public
as $ti$
begin
  perform public.recalcular_total_de_orden(coalesce(new.order_id, old.order_id));
  return null;
end;
$ti$;

create or replace function public.trg_total_desde_extras()
returns trigger
language plpgsql
security definer
set search_path = public
as $te$
declare
  v_order_id uuid;
begin
  select oi.order_id into v_order_id
  from public.order_items oi
  where oi.id = coalesce(new.order_item_id, old.order_item_id);

  if v_order_id is not null then
    perform public.recalcular_total_de_orden(v_order_id);
  end if;
  return null;
end;
$te$;

revoke execute on function public.trg_total_desde_items()  from public, anon;
revoke execute on function public.trg_total_desde_extras() from public, anon;


-- ── 3 · DIFERIDOS, Y LA RAZON NO ES RENDIMIENTO ────────────────────────────
-- 🔴 SON `constraint trigger ... initially deferred` PORQUE UN TRIGGER INMEDIATO
--    TUMBARIA VENTAS VALIDAS. `orders.total` tiene `check (total >= 0)`, y el
--    descuento es de la ORDEN mientras que las lineas entran de a una: dos
--    lineas de 3.000 con 5.000 de descuento dan un total final de 1.000 —
--    valido— pero al insertar la PRIMERA darian 3.000 − 5.000 = −2.000 y el
--    CHECK abortaria la venta entera.
--
--    Diferido, el recalculo ocurre al cerrar la transaccion, con todas las
--    lineas ya puestas. El estado intermedio no existe para nadie.
--
-- ⚠️ Dispara una vez por fila y todas las veces calculan lo mismo: es idempotente
--    y redundante. Se acepta — un carrito de mostrador son pocas lineas, y la
--    alternativa (un trigger por sentencia) no puede ser `constraint trigger`.
create constraint trigger trg_orders_total_desde_items
  after insert or update or delete on public.order_items
  deferrable initially deferred
  for each row execute function public.trg_total_desde_items();

create constraint trigger trg_orders_total_desde_extras
  after insert or update or delete on public.order_item_extras
  deferrable initially deferred
  for each row execute function public.trg_total_desde_extras();


-- ── 4 · LO QUE ESTE ARCHIVO NO HACE, DICHO ────────────────────────────────
-- · NO hace backfill. Ver la medicion en la cabecera: las 18 que difieren son
--   fixtures de los E2E, ninguna es una venta numerada.
-- · NO pone trigger sobre `orders.discount_amount`. Hoy el descuento se escribe
--   UNA vez, al crear la orden, y despues nadie lo toca: los dos helpers que
--   podian hacerlo (`updateOrderTotal`, `applyOrderDiscount`) estaban muertos y
--   se borran en este mismo commit. Si algun dia el descuento se edita, ese
--   trigger hace falta — y el disparador concreto es ese, no "algun dia".
-- · NO toca `register_sale_payment`. Su `raise 'La suma de pagos no cuadra con
--   el total'` seguia validando los pagos contra un total **que nadie validaba**
--   —el mismo perfil que la deuda 60, un guard apoyado en un dato sin
--   verificar—. Con esto pasa a comparar contra un total DERIVADO, asi que el
--   guard se cierra **de rebote y no por diseno**. Queda escrito porque un
--   arreglo que nadie busco es el que nadie va a saber que existe.

commit;
