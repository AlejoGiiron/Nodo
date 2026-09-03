-- ============================================================================
-- Devolución de compra y ajuste de costo — deuda 49
--
-- 🔴 LA DECISIÓN QUE ESTE ARCHIVO ENCARNA, Y NO ES UNA LIMITACIÓN TÉCNICA.
-- El promedio ponderado móvil NO es reversible, y no porque falte información:
-- el costo que dejó la compra YA SE PROPAGÓ a las ventas que ocurrieron en el
-- medio, congelado en cada `order_items.unit_cost` (R1 punto 8). Deshacer la
-- compra no puede deshacer eso — y no debería: esas ventas se cobraron con ese
-- costo, y su utilidad es un hecho ocurrido.
--
-- Por eso una devolución NO es la negación de un hecho viejo: es un hecho
-- nuevo con su propia fecha. Mismo criterio que impide editar una compra
-- aplicada y que congela el costo al vender: **la historia no se reescribe, se
-- le agrega.**
--
-- ── LAS CUATRO PREGUNTAS DE R0 ────────────────────────────────────────────
-- 1 · CLASE. Tres a la vez: se AMPLÍAN dos allowlists (`cash_movements.
--     categoria` del lado `in`, `stock_movements.type`); la aritmética de la
--     devolución VALIDA en vez de forzar (R6); y el motivo de `adjust_cost` es
--     FAIL-CLOSED.
-- 2 · PRECEDENTE. `chk_factor_segun_unidad` (unidad de compra) es el molde del
--     CHECK cruzado. El guard de sede nulo es el de la deuda 60, misma forma en
--     las cinco RPC. R1 punto 8 decide que la devolución no toque el costo.
-- 3 · MODO DE FALLO. Si la devolución recalculara el promedio, reescribiría
--     utilidades ya cobradas SIN ERROR — el perfil de R7. Si el motivo de
--     `adjust_cost` fuera opcional, el costo cambiaría sin rastro. Fail-closed
--     los dos.
-- 4 · OBJETIVO. La factura original POR UUID; el costo y el factor se LEEN DE
--     LA FACTURA, jamás del payload; las dos listas se extienden
--     positivamente.
--
-- Filas contadas ANTES de tocar (2026-09-02): cash_movements 291,
-- stock_movements 1.557, purchase_invoices 91. Los dos CHECK nuevos son
-- superconjuntos estrictos de los viejos: 0 filas violarían (verificado).
--
-- R5: archivo nuevo. Ninguna migración aplicada se edita.
-- ============================================================================

begin;

-- ── 1 · `kind` Y LA FACTURA QUE REVIERTE ────────────────────────────────────
-- El SIGNO lo lleva la cabecera, no las cantidades: `qty > 0` y `total >= 0`
-- siguen intactos. Relajarlos habría hecho que una línea negativa fuera
-- indistinguible de un error de carga, y que todo consumidor de
-- purchase_invoice_items tuviera que acordarse del signo.
alter table public.purchase_invoices
  add column kind text not null default 'purchase',
  add column returns_invoice_id uuid references public.purchase_invoices (id) on delete restrict;

alter table public.purchase_invoices
  add constraint chk_kind_de_factura check (kind in ('purchase', 'return'));

-- CHECK cruzado, mismo molde que chk_factor_segun_unidad: una devolución sin su
-- factura no se puede auditar, y una compra que apunta a otra no significa nada.
alter table public.purchase_invoices
  add constraint chk_devolucion_apunta_a_su_compra check (
    (kind = 'purchase' and returns_invoice_id is null) or
    (kind = 'return'   and returns_invoice_id is not null)
  );

comment on column public.purchase_invoices.kind is
  'purchase (compra) · return (devolucion al proveedor). Allowlist: lo que no '
  'esta, no entra. El signo vive ACA y no en las cantidades: qty > 0 y '
  'total >= 0 siguen valiendo para las dos, asi que ninguna consulta tiene que '
  'acordarse de un signo escondido en una linea.';

comment on column public.purchase_invoices.returns_invoice_id is
  'Solo en kind=return: la compra que esta devolucion revierte. Es lo que hace '
  'calculable "cuanto queda por devolver" — sin esto no hay forma de impedir '
  'devolver mas de lo comprado.';

create index idx_purchase_invoices_devoluciones
  on public.purchase_invoices (returns_invoice_id)
  where returns_invoice_id is not null;


-- ── 2 · LA CAJA: `devolucion_compra` ENTRA A LA ALLOWLIST DEL LADO `in` ─────
-- 🔴 NO se mete en 'otro'. `otro` es el bucket que la categoria vino a evitar, y
--    una devolucion es un hecho recurrente y reportable: mezclarla con "otro"
--    la esconderia del reporte y volveria a hacer que un valor signifique dos
--    cosas. Tampoco es 'base' (inyeccion de efectivo del dueño) ni
--    'abono_cliente' (plata de un cliente).
--
-- Definicion vieja capturada de pg_get_constraintdef antes de borrarla; lo
-- unico que cambia es el valor agregado del lado `in`.
alter table public.cash_movements drop constraint chk_categoria_segun_tipo;
alter table public.cash_movements add constraint chk_categoria_segun_tipo check (
  (type = 'out'::movement_type and categoria in ('compra', 'gasto', 'retiro', 'otro'))
  or
  (type = 'in'::movement_type  and categoria in ('abono_cliente', 'base', 'devolucion_compra', 'otro'))
);


-- ── 3 · EL STOCK: `purchase_return` ES UN TYPE PROPIO ──────────────────────
-- 🔴 ESTO LO ENCONTRO LA ENUMERACION, y es el criterio "un valor que significa
--    dos cosas no es un dato" cobrando por tercera vez. `return` YA significa
--    el reverso de una VENTA: lo escribe register_sale_void y el stock ENTRA
--    (qty positivo); InventoryPage lo rotula "Devoluciones". Reusarlo para una
--    devolucion al proveedor —donde el stock SALE— dejaria un mismo valor
--    describiendo las dos direcciones, distinguibles solo por el signo, y el
--    filtro de Inventario mezclaria la devolucion de un cliente con la de un
--    proveedor. Son hechos opuestos del negocio.
alter table public.stock_movements drop constraint stock_movements_type_check;
alter table public.stock_movements add constraint stock_movements_type_check
  check (type in ('sale', 'adjustment', 'return', 'purchase', 'purchase_return'));

comment on column public.stock_movements.type is
  'sale (venta) · adjustment (ajuste manual) · return (reverso de una VENTA: '
  'entra stock, lo escribe register_sale_void) · purchase (entrada por compra) '
  '· purchase_return (devolucion AL PROVEEDOR: sale stock). Allowlist: lo que '
  'no esta, no entra. return y purchase_return son types distintos A PROPOSITO '
  'aunque los dos se llamen "devolucion" en castellano: van en direcciones '
  'opuestas y los mira gente distinta.';


-- ── 4 · EL RASTRO DE LOS AJUSTES DE COSTO ──────────────────────────────────
-- Sin esta tabla, `adjust_cost` seria un UPDATE de dinero sin autor ni motivo.
-- Es el mismo argumento por el que existe stock_movements: si el numero cambia
-- y no queda rastro de por que, el reporte se vuelve indefendible.
create table public.product_cost_adjustments (
  id         uuid           primary key default gen_random_uuid(),
  sede_id    uuid           not null references public.sedes    on delete cascade,
  product_id uuid           not null references public.products on delete restrict,
  old_cost   numeric(12, 2),
  new_cost   numeric(12, 2) not null check (new_cost >= 0),
  reason     text           not null check (btrim(reason) <> ''),
  created_by uuid           references public.profiles on delete set null,
  created_at timestamptz    not null default now()
);

comment on table public.product_cost_adjustments is
  'Auditoria append-only de correcciones manuales de cost_price. Se escribe '
  'SOLO via adjust_cost (definer). old_cost puede ser null: es un producto que '
  'nunca tuvo costo, y null ahi significa "no habia", no "valia cero".';

create index idx_cost_adjustments_producto
  on public.product_cost_adjustments (product_id, created_at desc);
create index idx_cost_adjustments_sede
  on public.product_cost_adjustments (sede_id, created_at desc);

alter table public.product_cost_adjustments enable row level security;

create policy "product_cost_adjustments: ver de mi sede"
  on public.product_cost_adjustments for select to authenticated
  using (sede_id = get_my_sede_id());
-- Sin policy de escritura: lo escribe adjust_cost (definer). Mismo criterio que
-- purchase_invoices — si se pudiera insertar directo, el rastro se podria
-- fabricar y dejaria de ser rastro.


-- ── 5 · register_purchase_return ───────────────────────────────────────────
create or replace function public.register_purchase_return(
  p_invoice_id uuid,
  p_items      jsonb,
  p_notes      text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sede_id            uuid := get_my_sede_id();
  v_jornada_id         uuid;
  v_supplier_id        uuid;
  v_supplier_name      text;
  v_invoice_number     text;
  v_return_id          uuid;
  v_total              numeric(12, 2) := 0;
  v_item               jsonb;
  v_product_id         uuid;
  v_qty                integer;
  v_comprado           integer;
  v_devuelto           integer;
  v_costos_distintos   integer;
  v_factores_distintos integer;
  v_unit_cost          numeric(12, 2);
  v_factor             integer;
  v_unidad             text;
  v_tracking           boolean;
  v_unidades           integer;
  v_subtotal           numeric(12, 2);
  v_cash_amount        integer;
  v_cash_mov_id        uuid;
begin
  -- 1. Sede y permiso. El guard de sede nula va PRIMERO (deuda 60): un guard
  --    que compara contra un posible NULL no falla cerrado ni abierto — NO
  --    EVALUA.
  if v_sede_id is null then
    raise exception 'No tienes una sede activa';
  end if;
  if not has_permission('compras.gestionar') then
    raise exception 'No autorizado para registrar devoluciones de compra';
  end if;

  -- 2. Jornada abierta, fail-closed y ANTES de escribir nada. Una devolucion
  --    mete plata al cajon: sin jornada, esa plata entra sin quedar en ningun
  --    arqueo. El mensaje dice la ACCION, no el estado.
  select id into v_jornada_id
  from public.jornadas
  where sede_id = v_sede_id and closed_at is null
  limit 1;

  if v_jornada_id is null then
    raise exception 'Abri la jornada de caja antes de registrar una devolucion de compra'
      using errcode = 'check_violation';
  end if;

  -- 3. La compra original, POR UUID y de la sede propia. `kind = 'purchase'`
  --    impide devolver una devolucion.
  select supplier_id, invoice_number
  into v_supplier_id, v_invoice_number
  from public.purchase_invoices
  where id = p_invoice_id and sede_id = v_sede_id and kind = 'purchase';

  if not found then
    raise exception 'La compra que queres devolver no existe, no es tuya, o ya es una devolucion'
      using errcode = 'check_violation';
  end if;

  select name into v_supplier_name from public.suppliers where id = v_supplier_id;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'La devolucion no tiene items'
      using errcode = 'check_violation';
  end if;

  insert into public.purchase_invoices
    (sede_id, supplier_id, invoice_number, total, notes, created_by,
     kind, returns_invoice_id)
  values
    (v_sede_id, v_supplier_id, v_invoice_number, 0,
     nullif(btrim(coalesce(p_notes, '')), ''), auth.uid(),
     'return', p_invoice_id)
  returning id into v_return_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_product_id := (v_item->>'product_id')::uuid;
    v_qty        := (v_item->>'qty')::integer;

    if v_qty is null or v_qty <= 0 then
      raise exception 'Cantidad invalida para el producto %', v_product_id
        using errcode = 'check_violation';
    end if;

    -- 🔴 EL COSTO Y EL FACTOR SALEN DE LA FACTURA, NO DEL PAYLOAD. Quien
    --    devuelve no elige a que precio le devuelven: eso ya lo dijo el papel
    --    del proveedor. Es la misma razon por la que register_purchase lee
    --    stock_tracking de la BD y no del cliente (R4).
    select sum(qty),
           count(distinct unit_cost),
           count(distinct units_per_purchase_unit),
           min(unit_cost),
           min(units_per_purchase_unit),
           min(purchase_unit)
    into v_comprado, v_costos_distintos, v_factores_distintos,
         v_unit_cost, v_factor, v_unidad
    from public.purchase_invoice_items
    where invoice_id = p_invoice_id and product_id = v_product_id;

    if v_comprado is null then
      raise exception 'El producto % no esta en esa factura de compra', v_product_id
        using errcode = 'check_violation';
    end if;

    -- ⚠️ LIMITE CONOCIDO, y es fail-closed a proposito: si el mismo producto
    --    entro dos veces en la misma factura con costos o presentaciones
    --    distintas, la devolucion no puede decidir cual se esta devolviendo, y
    --    elegir una a ciegas seria plata mal contada. Se rechaza y se dice.
    --    Cuando haga falta, la forma es recibir el id de la linea.
    if v_costos_distintos > 1 or v_factores_distintos > 1 then
      raise exception 'El producto % aparece en esa factura con costos o presentaciones distintas: no se puede decidir cual devolver',
        v_product_id
        using errcode = 'check_violation';
    end if;

    -- Lo ya devuelto en devoluciones ANTERIORES de esta misma compra.
    select coalesce(sum(i.qty), 0)
    into v_devuelto
    from public.purchase_invoice_items i
    join public.purchase_invoices d on d.id = i.invoice_id
    where d.returns_invoice_id = p_invoice_id
      and d.id <> v_return_id
      and i.product_id = v_product_id;

    -- 🔴 EL INVARIANTE, y el mensaje trae los TRES numeros: un rojo que no
    --    nombra que cambio cuesta el diagnostico entero de nuevo.
    if v_qty > v_comprado - v_devuelto then
      raise exception 'No podes devolver % de ese producto: la factura tiene %, ya se devolvieron % y quedan %',
        v_qty, v_comprado, v_devuelto, v_comprado - v_devuelto
        using errcode = 'check_violation';
    end if;

    select stock_tracking into v_tracking
    from public.products
    where id = v_product_id and sede_id = v_sede_id;

    if not found then
      raise exception 'El producto % no pertenece a tu sede', v_product_id
        using errcode = 'check_violation';
    end if;

    -- qty son UNIDADES DE COMPRA (bultos); v_unidades son unidades de venta,
    -- que es la unidad en la que vive stock_qty.
    v_unidades := v_qty * v_factor;
    v_subtotal := v_qty * v_unit_cost;
    v_total    := v_total + v_subtotal;

    insert into public.purchase_invoice_items
      (invoice_id, product_id, qty, unit_cost, subtotal,
       purchase_unit, units_per_purchase_unit)
    values
      (v_return_id, v_product_id, v_qty, v_unit_cost, v_subtotal,
       v_unidad, v_factor);

    if v_tracking then
      update public.products
         set stock_qty = coalesce(stock_qty, 0) - v_unidades
       where id = v_product_id;

      insert into public.stock_movements
        (sede_id, product_id, type, qty, reference_id, notes, created_by)
      values
        (v_sede_id, v_product_id, 'purchase_return', - v_unidades, v_return_id,
         'Devolucion a ' || coalesce(v_supplier_name, 'proveedor'), auth.uid());
    end if;

    -- 🔴🔴 `cost_price` NO SE TOCA, Y ES LA LINEA MAS IMPORTANTE DE ESTE
    --      ARCHIVO — por eso esta escrita como ausencia comentada y no como
    --      omision. Revertir el promedio ponderado reescribiria el costo
    --      vigente de un producto cuyas ventas del medio YA congelaron el costo
    --      viejo en order_items.unit_cost. El resultado no seria "volver
    --      atras": seria un costo que no corresponde a ninguna compra real.
    --      Si el costo quedo mal, se corrige con adjust_cost, que pide motivo y
    --      deja rastro.
  end loop;

  update public.purchase_invoices
     set total = v_total
   where id = v_return_id;

  -- La plata VUELVE al cajon. Simetrico a la compra, que sale de el.
  v_cash_amount := round(v_total)::integer;

  if v_cash_amount > 0 then
    insert into public.cash_movements
      (jornada_id, sede_id, type, categoria, amount, reason, created_by)
    values
      (v_jornada_id, v_sede_id, 'in', 'devolucion_compra', v_cash_amount,
       'Devolucion a proveedor ' || coalesce(v_supplier_name, 'sin nombre')
         || coalesce(' (factura ' || v_invoice_number || ')', ''),
       auth.uid())
    returning id into v_cash_mov_id;
  end if;

  return jsonb_build_object(
    'return_invoice_id', v_return_id,
    'total',             v_total,
    'cash_movement_id',  v_cash_mov_id
  );
end;
$$;

revoke execute on function public.register_purchase_return(uuid, jsonb, text) from public;
revoke execute on function public.register_purchase_return(uuid, jsonb, text) from anon;
grant  execute on function public.register_purchase_return(uuid, jsonb, text) to authenticated;


-- ── 6 · adjust_cost — simetrico a adjust_stock ─────────────────────────────
-- ⚠️ EL PERMISO ES `compras.gestionar`, NO `inventario.ajustar`, y la razon es
--    la direccion del fallo. Hoy lo unico que mueve cost_price es
--    register_purchase, gateada por compras.gestionar. Gatear esto con
--    inventario.ajustar le DARIA a un rol que hoy no toca dinero la capacidad
--    de tocarlo. El costo es plata; el stock es fisico.
create or replace function public.adjust_cost(
  p_product_id uuid,
  p_new_cost   numeric,
  p_reason     text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sede_id uuid;
  v_old     numeric(12, 2);
begin
  if get_my_sede_id() is null then
    raise exception 'No tienes una sede activa';
  end if;
  if p_new_cost is null or p_new_cost < 0 then
    raise exception 'El costo ajustado tiene que ser 0 o mas'
      using errcode = 'check_violation';
  end if;
  -- Fail-closed sobre el motivo: un costo que cambia sin explicacion es un
  -- cambio de dinero sin autor. Mismo guard que adjust_stock.
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'El ajuste de costo requiere un motivo'
      using errcode = 'check_violation';
  end if;

  select sede_id, cost_price into v_sede_id, v_old
  from public.products
  where id = p_product_id;

  if v_sede_id is null then
    raise exception 'El producto % no existe', p_product_id
      using errcode = 'check_violation';
  end if;
  if v_sede_id is distinct from get_my_sede_id() then
    raise exception 'El producto no pertenece a tu sede'
      using errcode = 'check_violation';
  end if;
  if not has_permission('compras.gestionar') then
    raise exception 'No autorizado para ajustar el costo de un producto'
      using errcode = 'check_violation';
  end if;

  -- 🔴 ESTO CAMBIA EL COSTO VIGENTE Y NADA MAS. Las lineas ya vendidas
  --    conservan el costo que se congelo al venderlas (R1 punto 8): una venta
  --    de ayer se cobro con el costo de ayer y su utilidad es un hecho
  --    ocurrido. Si este update reescribiera esas lineas, el reporte de
  --    utilidades de un mes cerrado daria distinto cada vez que se abre — sin
  --    error y sin aviso, que es el perfil de R7.
  update public.products
     set cost_price = p_new_cost
   where id = p_product_id;

  insert into public.product_cost_adjustments
    (sede_id, product_id, old_cost, new_cost, reason, created_by)
  values
    (v_sede_id, p_product_id, v_old, p_new_cost, btrim(p_reason), auth.uid());
end;
$$;

revoke execute on function public.adjust_cost(uuid, numeric, text) from public;
revoke execute on function public.adjust_cost(uuid, numeric, text) from anon;
grant  execute on function public.adjust_cost(uuid, numeric, text) to authenticated;


-- ── 7 · LO QUE ESTE ARCHIVO NO HACE, DICHO ────────────────────────────────
-- · NO hay UI para crear una devolucion. La accion existe en la base y en el
--   design system (el §4 le reserva el relleno solido --danger) y no en la
--   pantalla. Queda como deuda de UI, separada a proposito: el hueco de
--   esquema perdia datos, el de pantalla no.
-- · NO cierra el camino directo: quien tenga `productos.editar` puede seguir
--   haciendo UPDATE de cost_price por la tabla, sin motivo y sin rastro.
--   Cerrarlo pide un trigger sobre products y se decide aparte.
-- · NO permite devolver una linea cuando el mismo producto entro dos veces en
--   la misma factura con costos distintos: se rechaza y se explica.

commit;
