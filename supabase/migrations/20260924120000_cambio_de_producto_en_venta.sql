-- ============================================================
-- Nodo · CAMBIO DE PRODUCTO EN UNA VENTA A CRÉDITO
--
-- Caso real (2026-09-24): un cliente vuelve y cambia un producto por otro en
-- una venta a crédito que todavía debe.
--
-- 🔴 POR QUÉ ES UN DOCUMENTO PROPIO Y NO UNA EDICIÓN DE LA VENTA — y es EL
--    discriminador, no un detalle de implementación:
--
--      `editar compra` existe porque ella SE EQUIVOCÓ AL DIGITAR. Esto no es
--      un error: el cliente DE VERDAD se llevó el producto A, y DE VERDAD
--      volvió y se llevó el B.
--
--    Reescribir la venta borraría que eso pasó. El criterio del proyecto lo
--    decide solo: *si el cambio hace que un reporte ya impreso deje de
--    reproducirse, no es una corrección — es una reescritura, y lo que
--    corresponde es AGREGAR UN HECHO*. Por eso `order_items` NO SE TOCA.
--
-- ✅ Y EL DISCRIMINADOR SE PAGA SOLO, que es lo que no esperábamos:
--    · el producto que VUELVE lleva su costo CONGELADO de la venta
--      (`order_items.unit_cost`): existe, es exacto, y es literalmente lo que
--      salió ese día;
--    · el que SALE lleva el costo de HOY, que es lo correcto porque sale hoy;
--    · y como la venta conserva sus líneas y su fecha, **la utilidad del
--      período viejo NO SE MUEVE**. El delta cae en el período de hoy, que es
--      cuando ocurrió el hecho.
--    Con una edición de la venta, las tres cosas habrían salido al revés.
--
-- ── R0 ────────────────────────────────────────────────────────────────────
-- 1 · CLASE. Allowlist en tres ejes (dirección del ítem, tipo de movimiento,
--     estado de la venta) + fail-closed, y un CONTRATO COMPARTIDO nuevo: el
--     saldo de una venta deja de ser `total − abonos` y pasa a ser
--     `total + Σ deltas − abonos`. Ese cambio tiene TRES lados: la cartera, el
--     balance de la sede, y el detalle del Historial.
-- 2 · PRECEDENTE. `register_purchase_return` (20260902210000): valida contra
--     EL DOCUMENTO y nunca contra el payload —quien devuelve no elige a qué
--     precio le devuelven—, e impide devolver más de lo comprado CONTANDO LO
--     YA DEVUELTO. Acá es igual, contra `order_items`. Y `update_purchase`
--     (20260918120000): corrige agregando hechos con fecha de hoy, sin tocar
--     el egreso original, «porque el arqueo de su jornada ya pudo cerrarse».
-- 3 · MODO DE FALLO. CALLADO y caro: si la cartera o el balance no miran este
--     documento, el saldo de la venta queda en el viejo SIN NINGÚN ERROR — y
--     ella le cobra al cliente el precio del producto que ya no tiene. Por eso
--     los tres lados se mueven en esta misma migración y hay una aserción que
--     lo comprueba.
-- 4 · OBJETIVO. Fijado por UUID en todos lados. Ninguna fila de la venta se
--     reescribe: sólo se AGREGAN filas en tablas nuevas y movimientos de stock.
--     Sin DELETE, sin DROP; el único UPDATE es sobre `products.stock_qty` y
--     sobre `orders.payment_status` cuando el saldo llega exactamente a cero.
--
-- ── 🔴 EL HALLAZGO QUE DECIDE EL GUARD DE JORNADA ─────────────────────────
--   `update_purchase` exige jornada abierta porque SIEMPRE mueve plata. Acá no
--   siempre: en una venta a crédito no pagada **no hay plata que mover** — lo
--   que cambia es qué se vendió y cuánto se debe.
--   Así que el guard se ata a SI SE MUEVE PLATA, no a la operación:
--     · total nuevo ≥ lo abonado → no hay plata → NO hace falta jornada.
--     · total nuevo < lo abonado → quedaría pagada de más → hay plata → hoy se
--       RECHAZA (ver abajo).
--   Consecuencia deliberada: un cambio se puede hacer sobre una venta de una
--   JORNADA YA CERRADA. El guard de `register_sale_void` no aplica y no se
--   toca: aquél existe porque anular reescribiría un arqueo firmado, y una
--   venta fiada aportó CERO efectivo a su jornada — medido para #113 y #134.
--
-- ── ⚠️ EL RECORTE, DELIBERADO Y NO TÉCNICO ────────────────────────────────
--   Sólo ventas `pending`/`partial`. Una venta PAGADA con cambio de producto
--   es otro caso —ahí hay plata ya cobrada contra algo que volvió— y no entra
--   hoy. No es que no se pueda: es que no se decidió.
--
-- ── ⚠️ PAGADA DE MÁS: SE RECHAZA, Y EL MENSAJE DICE QUÉ HACER ─────────────
--   De las tres salidas —devolver efectivo, dejar saldo a favor, rechazar— se
--   eligió rechazar porque es la única que NO INVENTA UN CONCEPTO: el saldo a
--   favor no existe en ninguna tabla y la cartera deriva por orden. Devolver
--   efectivo es irreal: el 100% de lo que cobra desde que usa Nodo es
--   transferencia (0 de 17 ventas en efectivo).
--   🔴 Y el mensaje NO SÓLO NIEGA: trae los tres números y nombra la salida.
--   El aviso falso que sacamos hoy nació justamente de negar sin nombrar el
--   camino real. → El saldo a favor queda como deuda con su alcance.
--
-- ── ⚠️ POR QUÉ `ventas.anular` Y NO UNA CLAVE NUEVA ───────────────────────
--   Una clave nueva NO LLEGARÍA A ELLA: «las organizaciones ya creadas siguen
--   con el catálogo con el que nacieron», así que su rol no la tendría y la
--   función quedaría inusable sin una migración de reconciliación aparte.
--   `ventas.anular` es además la potestad correcta POR CONSECUENCIA, no por
--   parecido de nombre: las dos operaciones revierten stock y cambian lo que el
--   cliente debe. Quien puede anular la venta ENTERA puede cambiarle una línea
--   — es MENOS poder, no más.
-- ── 🔴 EL HUECO DEL GUARD 5, Y SU FORMA ───────────────────────────────────
--   La pregunta fue por DOS CAMBIOS ENCADENADOS sobre la misma venta. La
--   respuesta era correcta: el saldo acumula `delta_total` de todos, no del
--   último. Y destapó otra cosa, PEOR: **dos líneas del mismo producto dentro
--   de UN SOLO cambio.**
--
--   Es peor porque el encadenado tiene dos documentos —hay algo que mirar—; éste
--   pasa adentro de uno, en el mismo bucle, sin dejar rastro de que pasó.
--
--   LA CAUSA, y es lo que vale registrar: la exclusión `ci.change_id <>
--   v_change_id` era CORRECTA para la pregunta que contestaba —«¿cuánto volvió
--   en cambios ANTERIORES?»— y FALSA para la que nadie hizo —«¿cuánto lleva
--   devuelto esta venta EN TOTAL, incluido lo que este documento ya escribió?»—.
--   Los ítems se insertan de a uno en el mismo bucle, así que «lo ya devuelto»
--   tenía que incluir lo que este mismo documento lleva.
--
--   > Es «la respuesta correcta a la pregunta equivocada», que tranquiliza
--   > igual que la correcta. Van DOS en dos semanas.
--
-- ── ⚠️ UN HALLAZGO DE MÉTODO, ANOTADO ─────────────────────────────────────
--   La primera versión de este archivo tenía un `raise exception` con UN
--   ARGUMENTO Y SIN SU `%`. Eso no lo caza ningún compilador: revienta EN
--   EJECUCIÓN, con «too many parameters specified for RAISE» — o sea en el
--   primer cliente que dispare ese camino de error, que además es el camino
--   que ya venía mal.
--   Lo cazó MOSTRAR ANTES DE APLICAR. Y el arreglo no fue corregir el que
--   falló: fue pasar un verificador sobre LOS 19 `raise` del archivo,
--   comparando placeholders contra argumentos. Cero desajustes. Arreglar la
--   instancia habría dejado a los otros 18 sin mirar.
-- ============================================================

begin;

-- ── 1 · El tipo de movimiento ─────────────────────────────────────────────
-- 🔴 VALOR PROPIO, y no `return`. `return` ya significa «reverso de una venta
--    ANULADA» y su `reference_id` apunta a una ORDEN; acá apunta al cambio.
--    Reusarlo habría hecho que Movimientos buscara una orden con el id de un
--    cambio, no la encontrara, y pintara nulos — el mismo valor diciendo dos
--    cosas. La dirección la lleva el signo de `qty`, como en `adjustment`.
alter table public.stock_movements drop constraint if exists stock_movements_type_check;
alter table public.stock_movements add constraint stock_movements_type_check
  check (type in ('sale', 'adjustment', 'return', 'purchase', 'purchase_return', 'sale_change'));

comment on column public.stock_movements.type is
  'sale (venta) · adjustment (ajuste manual) · return (reverso de una venta '
  'ANULADA: entra stock) · purchase (entrada por compra) · purchase_return '
  '(devolucion AL PROVEEDOR: sale stock) · sale_change (cambio de producto en '
  'una venta: el signo de qty dice si vuelve o se lleva; reference_id apunta a '
  'sale_changes). Allowlist: lo que no esta, no entra.';

-- ── 2 · El documento ──────────────────────────────────────────────────────
create table if not exists public.sale_changes (
  id          uuid           primary key default gen_random_uuid(),
  sede_id     uuid           not null references public.sedes  on delete cascade,
  order_id    uuid           not null references public.orders on delete restrict,
  reason      text           not null check (btrim(reason) <> ''),
  -- DERIVADO de las líneas por trigger, igual que `orders.total` (deuda 80).
  -- Escribirlo a mano sería un contrato sin sincronizador.
  delta_total numeric(12, 2) not null default 0,
  created_by  uuid           references public.profiles on delete set null,
  created_at  timestamptz    not null default now()
);

comment on table public.sale_changes is
  'Un CAMBIO de producto en una venta: el cliente volvio y se llevo otra cosa. '
  'NO reescribe la venta —order_items queda intacto— porque no es un error de '
  'digitacion sino un hecho nuevo con su propia fecha. delta_total: cuanto mas '
  '(+) o menos (-) se debe por este cambio. Ver 20260924120000.';

create table if not exists public.sale_change_items (
  id         uuid           primary key default gen_random_uuid(),
  change_id  uuid           not null references public.sale_changes on delete cascade,
  -- Allowlist. `in` = vuelve a la tienda · `out` = se lo lleva el cliente.
  direction  text           not null check (direction in ('in', 'out')),
  product_id uuid           not null references public.products on delete restrict,
  qty        integer        not null check (qty > 0),
  unit_price numeric(12, 2) not null check (unit_price >= 0),
  -- 🔴 El que VUELVE trae el costo congelado de la venta (order_items.unit_cost):
  --    existe y es exacto. El que SALE trae el costo de HOY, porque sale hoy.
  --    Nullable: un producto puede no tener costo cargado, y eso es un hueco
  --    visible, no un cero.
  unit_cost  numeric(12, 2) check (unit_cost >= 0),
  subtotal   numeric(12, 2) not null check (subtotal >= 0)
);

create index if not exists idx_sale_changes_order on public.sale_changes (order_id);
create index if not exists idx_sale_change_items_change on public.sale_change_items (change_id);

-- ── 3 · delta_total derivado ──────────────────────────────────────────────
create or replace function public.recalcular_delta_de_cambio(p_change_id uuid)
returns void language plpgsql security definer set search_path = public as $fn$
begin
  update public.sale_changes c
     set delta_total = coalesce((
           select sum(case when i.direction = 'out' then i.subtotal else -i.subtotal end)
             from public.sale_change_items i
            where i.change_id = c.id
         ), 0)
   where c.id = p_change_id;
end $fn$;

revoke execute on function public.recalcular_delta_de_cambio(uuid) from public;
revoke execute on function public.recalcular_delta_de_cambio(uuid) from anon;
revoke execute on function public.recalcular_delta_de_cambio(uuid) from authenticated;

create or replace function public.trg_delta_de_cambio()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  perform public.recalcular_delta_de_cambio(coalesce(new.change_id, old.change_id));
  return null;
end $fn$;

drop trigger if exists trg_sale_change_items_delta on public.sale_change_items;
create trigger trg_sale_change_items_delta
  after insert or update or delete on public.sale_change_items
  for each row execute function public.trg_delta_de_cambio();

-- ── 4 · RLS: se LEE de la sede, se ESCRIBE solo por la RPC ────────────────
alter table public.sale_changes      enable row level security;
alter table public.sale_change_items enable row level security;

drop policy if exists "sale_changes: ver los de mi sede" on public.sale_changes;
create policy "sale_changes: ver los de mi sede"
  on public.sale_changes for select to authenticated
  using (sede_id = public.get_my_sede_id());

drop policy if exists "sale_change_items: ver por cambio de mi sede" on public.sale_change_items;
create policy "sale_change_items: ver por cambio de mi sede"
  on public.sale_change_items for select to authenticated
  using (change_id in (select id from public.sale_changes where sede_id = public.get_my_sede_id()));

-- Sin policy de INSERT/UPDATE/DELETE a propósito: igual que `order_items`, se
-- escribe SOLO por la RPC SECURITY DEFINER. Un camino directo sería la ruta
-- más corta al hueco que los guards de abajo existen para cerrar.

-- ── 5 · La RPC ────────────────────────────────────────────────────────────
create or replace function public.register_sale_change(
  p_order_id uuid,
  p_reason   text,
  p_items    jsonb   -- [{direction:'in'|'out', product_id:uuid, qty:int, unit_price:numeric}]
) returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare
  v_sede_id     uuid;
  v_actor       uuid;
  v_total       numeric(12, 2);
  v_status      text;
  v_cancelled   timestamptz;
  v_number      integer;
  v_change_id   uuid;
  v_it          jsonb;
  v_dir         text;
  v_product     uuid;
  v_qty         integer;
  v_price       numeric(12, 2);
  v_cost        numeric(12, 2);
  v_tracking    boolean;
  v_vendido     integer;
  v_costos      integer;
  v_ya_vuelto   integer;
  v_ins         integer := 0;
  v_outs        integer := 0;
  v_abonado     numeric(12, 2);
  v_delta_prev  numeric(12, 2);
  v_delta       numeric(12, 2);
  v_total_nuevo numeric(12, 2);
begin
  -- 🔴 EL NULL PRIMERO. `get_my_sede_id()` devuelve NULL para un usuario
  --    desactivado, y en plpgsql `x <> NULL` no es falso: es NULL, y el `if`
  --    NO DISPARA. Un guard que no evalúa deja pasar.
  v_sede_id := public.get_my_sede_id();
  if v_sede_id is null then
    raise exception 'No tienes una sede activa';
  end if;
  v_actor := auth.uid();

  if not public.has_permission('ventas.anular') then
    raise exception 'No autorizado para cambiar productos de una venta';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'El cambio requiere un motivo';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'El cambio no tiene items';
  end if;

  -- La venta, bloqueada hasta el commit: dos cambios simultáneos no se pisan.
  select o.total, o.payment_status, o.cancelled_at, o.order_number
    into v_total, v_status, v_cancelled, v_number
    from public.orders o
   where o.id = p_order_id and o.sede_id = v_sede_id
   for update;
  if not found then
    raise exception 'La venta no existe o no pertenece a tu sede';
  end if;
  if v_cancelled is not null then
    raise exception 'La venta #% esta anulada: no se le pueden cambiar productos', v_number;
  end if;
  -- EL RECORTE. Deliberado, no técnico: ver la cabecera.
  if v_status not in ('pending', 'partial') then
    raise exception
      'La venta #% ya esta pagada. Cambiar un producto de una venta cobrada mueve plata que ya se recibio, y ese caso todavia no existe: pedilo por soporte',
      v_number;
  end if;

  insert into public.sale_changes (sede_id, order_id, reason, created_by)
  values (v_sede_id, p_order_id, btrim(p_reason), v_actor)
  returning id into v_change_id;

  for v_it in select * from jsonb_array_elements(p_items) loop
    v_dir     := v_it ->> 'direction';
    v_product := (v_it ->> 'product_id')::uuid;
    v_qty     := (v_it ->> 'qty')::integer;
    v_price   := (v_it ->> 'unit_price')::numeric;

    if v_dir is null or v_dir not in ('in', 'out') then
      raise exception 'Direccion invalida "%": tiene que ser in (vuelve) u out (se lleva)', coalesce(v_dir, 'null');
    end if;
    if v_qty is null or v_qty <= 0 then
      raise exception 'Cantidad invalida para el producto %', v_product;
    end if;
    if v_price is null or v_price < 0 then
      raise exception 'Precio invalido para el producto %', v_product;
    end if;

    select p.stock_tracking into v_tracking
      from public.products p
     where p.id = v_product and p.sede_id = v_sede_id;
    if not found then
      raise exception 'El producto % no pertenece a tu sede', v_product;
    end if;

    if v_dir = 'in' then
      v_ins := v_ins + 1;

      -- 🔴 SOLO PUEDE VOLVER LO QUE SALIÓ EN ESTA VENTA, y no más de lo que
      --    queda. Es el guard de `register_purchase_return` leído del otro
      --    lado: el documento manda, no el payload.
      select coalesce(sum(oi.qty), 0), count(distinct oi.unit_cost), min(oi.unit_cost)
        into v_vendido, v_costos, v_cost
        from public.order_items oi
       where oi.order_id = p_order_id and oi.product_id = v_product;

      if v_vendido = 0 then
        raise exception
          'Ese producto no esta en la venta #%: no puede volver de una venta donde nunca salio', v_number;
      end if;
      -- Mismo límite conocido que la devolución de compra, y por la misma
      -- razón: con dos costos distintos no hay forma de decidir cuál vuelve.
      if v_costos > 1 then
        raise exception
          'Ese producto esta dos veces en la venta #% con costos distintos: no se puede decidir cual vuelve. Pedilo por soporte',
          v_number;
      end if;

      -- 🔴 SIN EXCLUIR EL CAMBIO EN CURSO, y la primera version SI lo excluia.
      --    Los items se insertan de a uno dentro de este mismo bucle, asi que
      --    excluirlo hacia que DOS lineas `in` del mismo producto en el MISMO
      --    payload no se vieran entre si: de una venta con 3 unidades volvian
      --    4, sin ningun error. Incluyendolo, la cuenta es el acumulado real
      --    —cambios anteriores MAS lo que ya lleva este— que es lo que el
      --    limite tiene que mirar.
      select coalesce(sum(ci.qty), 0) into v_ya_vuelto
        from public.sale_change_items ci
        join public.sale_changes c on c.id = ci.change_id
       where c.order_id = p_order_id and ci.direction = 'in'
         and ci.product_id = v_product;

      if v_qty > v_vendido - v_ya_vuelto then
        raise exception
          'No se pueden devolver % de ese producto: la venta #% tiene % y ya volvieron %',
          v_qty, v_number, v_vendido, v_ya_vuelto;
      end if;
      -- v_cost quedó con el COSTO CONGELADO de la venta. Exacto.
    else
      v_outs := v_outs + 1;
      -- El costo de HOY, porque sale hoy.
      select p.cost_price into v_cost from public.products p where p.id = v_product;
    end if;

    insert into public.sale_change_items
      (change_id, direction, product_id, qty, unit_price, unit_cost, subtotal)
    values (v_change_id, v_dir, v_product, v_qty, v_price, v_cost, v_qty * v_price);

    if v_tracking then
      update public.products
         set stock_qty = coalesce(stock_qty, 0) + (case when v_dir = 'in' then v_qty else -v_qty end)
       where id = v_product and sede_id = v_sede_id;

      insert into public.stock_movements
        (sede_id, product_id, type, qty, reference_id, notes, created_by)
      values (v_sede_id, v_product, 'sale_change',
              case when v_dir = 'in' then v_qty else -v_qty end,
              v_change_id,
              'Cambio en la venta #' || v_number, v_actor);
    end if;
  end loop;

  -- Un cambio necesita las dos mitades, o es otra operación con otro nombre.
  if v_ins = 0 or v_outs = 0 then
    raise exception
      'Un cambio necesita al menos un producto que vuelve y uno que se lleva. Solo lo que vuelve seria una devolucion; solo lo que sale, una venta nueva';
  end if;

  -- ── LA PLATA. El guard se ata a si se mueve, no a la operación ──────────
  select coalesce(sum(d.amount), 0) into v_abonado
    from public.debt_payments d where d.order_id = p_order_id;
  select coalesce(sum(c.delta_total), 0) into v_delta_prev
    from public.sale_changes c where c.order_id = p_order_id and c.id <> v_change_id;
  select c.delta_total into v_delta from public.sale_changes c where c.id = v_change_id;

  v_total_nuevo := v_total + v_delta_prev + v_delta;

  -- 🔴 RECHAZA, Y DICE QUÉ HACER. Negar sin nombrar la salida es el defecto
  --    que sacamos de producción hoy mismo.
  if v_total_nuevo < v_abonado then
    raise exception
      'Con este cambio la venta #% quedaria pagada de mas: el cliente abono %, el total nuevo seria % y sobrarian %. Hoy no hay forma de devolverle esa plata ni de dejarsela a favor: elegi un producto de igual o mayor valor, o pedilo por soporte',
      v_number, v_abonado, v_total_nuevo, v_abonado - v_total_nuevo;
  end if;

  -- Si el saldo llegó exactamente a cero, la venta queda PAGADA.
  -- 🔴 Y NO se deja en `partial` con saldo 0 para «que se vea que hubo un
  --    cambio»: eso sería un valor significando DOS cosas —«debe algo» y «hubo
  --    un cambio»— y además es exactamente el residuo que ya pagamos, la orden
  --    fantasma que quedó en Cartera con saldo 0 y que nadie podía explicar.
  --    Que el cambio se vea es trabajo de la franja del detalle, no del estado.
  if v_total_nuevo = v_abonado and v_abonado > 0 then
    update public.orders set payment_status = 'paid' where id = p_order_id;
  end if;

  return jsonb_build_object(
    'change_id',    v_change_id,
    'order_number', v_number,
    'delta',        v_delta,
    'total_nuevo',  v_total_nuevo,
    'abonado',      v_abonado,
    'saldo',        v_total_nuevo - v_abonado
  );
end $fn$;

revoke execute on function public.register_sale_change(uuid, text, jsonb) from public;
revoke execute on function public.register_sale_change(uuid, text, jsonb) from anon;
grant  execute on function public.register_sale_change(uuid, text, jsonb) to authenticated;

-- ── 6 · EL BALANCE TIENE QUE VER EL DOCUMENTO NUEVO ───────────────────────
-- 🔴 Sin esto, `balance_de_sede.cartera` seguiría siendo `total − abonos` y
--    quedaría VIEJA en cuanto exista un cambio — sin error, con un número
--    plausible. Es el mismo lado del contrato que la pantalla de Cartera.
create or replace view public.balance_de_sede
  with (security_invoker = true)
as
select
  s.id as sede_id,
  s.name as sede_nombre,
  s.capital_inicial,
  s.capital_inicial_desde,
  (select coalesce(sum(p.amount), 0) from public.payments p
    where p.sede_id = s.id) as cobrado_ventas,
  (select coalesce(sum(d.amount), 0) from public.debt_payments d
     join public.orders o on o.id = d.order_id
    where o.sede_id = s.id) as abonos,
  (select coalesce(sum(c.amount), 0) from public.cash_movements c
    where c.sede_id = s.id and c.type = 'in'
      and c.categoria not in ('abono_cliente', 'base')) as otras_entradas,
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
  -- Lo vendido incluye los cambios: es lo que realmente se llevó el cliente.
  (select coalesce(sum(o.total), 0) from public.orders o
    where o.sede_id = s.id and o.cancelled_at is null)
  + (select coalesce(sum(c.delta_total), 0) from public.sale_changes c
       join public.orders o on o.id = c.order_id
      where o.sede_id = s.id and o.cancelled_at is null) as vendido,
  (select coalesce(sum(i.qty * i.unit_cost), 0) from public.order_items i
     join public.orders o on o.id = i.order_id
    where o.sede_id = s.id and o.cancelled_at is null)
  + (select coalesce(sum(case when ci.direction = 'out' then ci.qty * ci.unit_cost
                              else -(ci.qty * ci.unit_cost) end), 0)
       from public.sale_change_items ci
       join public.sale_changes c on c.id = ci.change_id
       join public.orders o on o.id = c.order_id
      where o.sede_id = s.id and o.cancelled_at is null) as costo_vendido,
  (select coalesce(sum(p.stock_qty * p.cost_price), 0) from public.products p
    where p.sede_id = s.id and p.stock_tracking and p.cost_price is not null) as inventario_a_costo,
  (select coalesce(sum(o.total), 0) from public.orders o
    where o.sede_id = s.id and o.cancelled_at is null
      and o.payment_status in ('pending', 'partial'))
  + (select coalesce(sum(c.delta_total), 0) from public.sale_changes c
       join public.orders o on o.id = c.order_id
      where o.sede_id = s.id and o.cancelled_at is null
        and o.payment_status in ('pending', 'partial'))
  - (select coalesce(sum(d.amount), 0) from public.debt_payments d
       join public.orders o on o.id = d.order_id
      where o.sede_id = s.id and o.cancelled_at is null
        and o.payment_status in ('pending', 'partial')) as cartera,
  (select count(*) from public.products p
    where p.sede_id = s.id and p.stock_tracking and p.cost_price is null) as productos_sin_costo,
  (select coalesce(sum(p.stock_qty), 0) from public.products p
    where p.sede_id = s.id and p.stock_tracking and p.cost_price is null) as unidades_sin_costo,
  (select count(*) from public.order_items i
     join public.orders o on o.id = i.order_id
    where o.sede_id = s.id and o.cancelled_at is null
      and i.unit_cost is null) as lineas_venta_sin_costo
from public.sedes s;

-- ── VERIFICACIÓN, adentro de la transacción y con raise ───────────────────
do $$
declare
  v_sedes bigint;
  v_filas bigint;
  v_fn    bigint;
begin
  -- La vista sigue dando una fila por sede: los dos sub-selects nuevos son
  -- escalares, pero «no puede multiplicar» es una afirmación, así que se mide.
  select count(*) into v_sedes from public.sedes;
  select count(*) into v_filas from public.balance_de_sede;
  if v_sedes <> v_filas then
    raise exception 'La vista del balance dejo de dar una fila por sede: % vs %.', v_sedes, v_filas;
  end if;

  -- La RPC existe y no quedó abierta a anon.
  select count(*) into v_fn from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'register_sale_change';
  if v_fn <> 1 then
    raise exception 'register_sale_change no quedo creada (encontradas %).', v_fn;
  end if;
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'register_sale_change'
       and array_to_string(p.proacl, ',') like '%anon=X%'
  ) then
    raise exception 'register_sale_change quedo ejecutable por anon.';
  end if;

  raise notice 'Cambio de producto en venta: listo. Sedes en el balance: %.', v_filas;
end $$;

commit;
