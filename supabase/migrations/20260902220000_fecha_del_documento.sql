-- ============================================================================
-- La fecha del DOCUMENTO no es la fecha de REGISTRO — deuda 44
--
-- 🔴 EL CASO REAL, no hipotetico: en `Control_Mp.xlsx` el cliente **registro el
--    2 de septiembre compras fechadas el 31 de agosto**. Con una sola fecha esas
--    facturas caen en septiembre, el costo de agosto queda corto, y el numero es
--    plausible — perfil exacto del fallo silencioso de R7.
--
-- ⚠️ CORRECCION A LA PREMISA DE LA DEUDA, verificada contra el codigo: la deuda
--    decia que las pantallas de alta "dejan elegir" la fecha y que solo faltaba
--    la columna. Es FALSO. `grep 'type="date"' src/` da diez apariciones y las
--    diez son FILTROS de historiales; ningun formulario de alta tiene campo de
--    fecha. Venia de la maqueta, no de la app.
--
-- ── LAS DOS PREGUNTAS, Y POR QUE SON DOS COLUMNAS ─────────────────────────
--   created_at    -> cuando se TECLEO. Es lo que cuadra la CAJA.
--   document_date -> de cuando es el PAPEL. Es lo que ordena los REPORTES.
-- Un gasto fechado la semana pasada IGUAL salio del cajon hoy: el arqueo lo
-- cuenta hoy y el reporte del mes lo cuenta en su mes. Mezclarlas hace que una
-- de las dos preguntas deje de tener respuesta — el criterio "un valor que
-- significa dos cosas no es un dato", quinta aparicion.
--
-- ── LAS CUATRO PREGUNTAS DE R0 ────────────────────────────────────────────
-- 1 · CLASE. Fail-closed sobre una fecha futura, y un VALIDAR-no-forzar (R6):
--     el trigger rechaza, no corrige.
-- 2 · PRECEDENTE. R7 entera (toda frontera de dia se calcula en America/Bogota).
--     Y la deuda 61: cuando la escritura NO pasa por una RPC, el invariante vive
--     en un trigger o no vive.
-- 3 · MODO DE FALLO. Un typo de anio manda el gasto a un reporte que nadie mira:
--     no desaparece con ruido, desaparece en silencio. Fail-closed.
-- 4 · OBJETIVO. Allowlist temporal por el lado que importa (nada en el futuro);
--     el pasado queda abierto a proposito, ver el final del archivo.
--
-- Filas contadas ANTES de tocar (2026-09-02): purchase_invoices 91,
-- cash_movements 291. Las dos columnas nacen NULL, se rellenan y recien
-- despues se ponen NOT NULL.
--
-- R5: archivo nuevo.
-- ============================================================================

begin;

-- ── 1 · LA FRONTERA DE DIA, EN UN SOLO LUGAR ───────────────────────────────
-- 🔴 `current_date` NO SIRVE, y es R7 literal: el servidor corre en UTC, asi que
--    entre las 19:00 y la medianoche de Bogota `current_date` ya esta en el dia
--    siguiente. Toda la franja del cierre de caja nacería fechada MAÑANA.
--    Medido el 2026-09-02 a las 21:40 de Bogota: current_date = 2026-09-03.
--    Va como funcion y no copiada en cada default para que sea UN solo lado (R1).
create or replace function public.hoy_bogota()
returns date
language sql
stable
set search_path = public
as $hoy$ select (now() at time zone 'America/Bogota')::date $hoy$;

comment on function public.hoy_bogota() is
  'Hoy en America/Bogota. Existe para que ningun default ni guard use '
  'current_date, que en este servidor es UTC y adelanta el dia a partir de las '
  '19:00 hora local — justo la franja del cierre de caja (R7).';

grant execute on function public.hoy_bogota() to authenticated, service_role;


-- ── 2 · LAS DOS COLUMNAS ───────────────────────────────────────────────────
-- Nacen NULL para poder rellenarlas con la verdad y no con un default que
-- mentiria sobre las filas viejas.
alter table public.purchase_invoices add column document_date date;
alter table public.cash_movements    add column document_date date;

-- Relleno: para las filas que ya existen, la fecha del documento ES la de
-- registro — no porque coincidan, sino porque **no habia otra forma de
-- decirlo**. Convertido a Bogota, no tomado crudo de un timestamptz UTC (R7).
update public.purchase_invoices
   set document_date = (created_at at time zone 'America/Bogota')::date
 where document_date is null;

update public.cash_movements
   set document_date = (created_at at time zone 'America/Bogota')::date
 where document_date is null;

alter table public.purchase_invoices
  alter column document_date set not null,
  alter column document_date set default public.hoy_bogota();

alter table public.cash_movements
  alter column document_date set not null,
  alter column document_date set default public.hoy_bogota();

comment on column public.purchase_invoices.document_date is
  'Fecha del PAPEL del proveedor. Es la que ordena los reportes de compras y de '
  'costo. NO es created_at: el cliente registra el 2 de septiembre facturas del '
  '31 de agosto, medido en su archivo real. Las filas anteriores a esta '
  'migracion se rellenaron con su fecha de registro convertida a Bogota, porque '
  'no habia otra fuente.';

comment on column public.cash_movements.document_date is
  'Fecha del gasto o del documento que lo respalda. Ordena el HISTORIAL DE '
  'GASTOS. ⚠️ El ARQUEO no la usa y no debe: la plata salio del cajon cuando se '
  'tecleo, asi que el cierre cuadra por created_at y la jornada. Son dos '
  'preguntas distintas sobre la misma fila.';

create index idx_purchase_invoices_document_date
  on public.purchase_invoices (sede_id, document_date desc);
create index idx_cash_movements_document_date
  on public.cash_movements (sede_id, document_date desc);


-- ── 3 · EL GUARD DE GASTOS ES UN TRIGGER, Y LA RAZON ES ESTRUCTURAL ────────
-- Los movimientos de caja se escriben por INSERT DIRECTO desde el cliente
-- (policy "cash_movements: registrar movimiento manual"): **no hay RPC donde
-- poner el guard**. Mismo caso que la deuda 61 — cuando la escritura no pasa por
-- una funcion, el invariante vive en un trigger o no vive.
--
-- ⚠️ NO es SECURITY DEFINER, y es la lectura fina de R6: DEFINER hace falta
--    cuando la funcion VALIDA CONTRA DATOS que RLS podria filtrarle. Esta no lee
--    ninguna tabla — compara una fecha contra el reloj—, asi que correr como el
--    invocante no cambia nada de lo que ve.
--
-- Y VALIDA, NO FUERZA (R6): no recorta la fecha al maximo permitido. Forzar
-- dejaria el gasto guardado con una fecha que nadie escribio, y el cajero nunca
-- se enteraria del typo.
create or replace function public.validar_fecha_de_documento()
returns trigger
language plpgsql
set search_path = public
as $val$
begin
  if new.document_date > public.hoy_bogota() then
    raise exception 'La fecha del documento (%) esta en el futuro: revisa el ano', new.document_date
      using errcode = 'check_violation';
  end if;
  return new;
end;
$val$;

create trigger trg_cash_movements_fecha_de_documento
  before insert or update of document_date on public.cash_movements
  for each row execute function public.validar_fecha_de_documento();

-- ⚠️ `purchase_invoices` NO lleva trigger, y la asimetria es deliberada: esa
--    tabla NO tiene policy de INSERT — solo la escriben register_purchase y
--    register_purchase_return, que son SECURITY DEFINER. El guard vive ahi, en
--    el unico camino que existe. Agregar un trigger seria un segundo lado del
--    mismo invariante sin nada que los sincronice (R1).


-- ── 4 · register_purchase v3 ───────────────────────────────────────────────
-- Cuerpo copiado LITERAL de 20260901140000_unidad_de_compra.sql. El diff es solo
-- la fecha del documento: la variable, su guard, y la columna en el insert.
create or replace function public.register_purchase(
  p_invoice jsonb,
  p_items   jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sede_id        uuid := get_my_sede_id();
  v_supplier_id    uuid := (p_invoice->>'supplier_id')::uuid;
  v_invoice_number text := nullif(p_invoice->>'invoice_number', '');
  v_notes          text := nullif(p_invoice->>'notes', '');
  v_doc_date       date := coalesce((p_invoice->>'document_date')::date, public.hoy_bogota());
  v_supplier_name  text;
  v_jornada_id     uuid;
  v_invoice_id     uuid;
  v_total          numeric(12, 2) := 0;
  v_item           jsonb;
  v_product_id     uuid;
  v_qty            integer;
  v_unit_cost      numeric(12, 2);
  v_subtotal       numeric(12, 2);
  v_unidad         text;
  v_factor         integer;
  v_unidades       integer;
  v_tracking       boolean;
  v_stock_actual   integer;
  v_costo_actual   numeric(12, 2);
  v_cash_amount    integer;
  v_cash_mov_id    uuid;
begin
  -- 1. Sede y permiso.
  if v_sede_id is null then
    raise exception 'No tienes una sede activa';
  end if;
  if not has_permission('compras.gestionar') then
    raise exception 'No autorizado para registrar compras';
  end if;

  -- 1b. 🔴 La fecha del papel no puede estar en el futuro. Fail-closed: un typo
  --     de anio manda la compra a un periodo que nadie revisa todavia.
  if v_doc_date > public.hoy_bogota() then
    raise exception 'La fecha de la factura (%) esta en el futuro: revisa el ano', v_doc_date
      using errcode = 'check_violation';
  end if;

  -- 2. 🔴 JORNADA ABIERTA — FAIL-CLOSED. Se valida ANTES de escribir nada.
  select id into v_jornada_id
  from public.jornadas
  where sede_id = v_sede_id and closed_at is null
  limit 1;

  if v_jornada_id is null then
    raise exception 'Abri la jornada de caja antes de registrar una compra'
      using errcode = 'check_violation';
  end if;

  -- 3. Proveedor: por UUID y de la sede propia.
  select name into v_supplier_name
  from public.suppliers
  where id = v_supplier_id and sede_id = v_sede_id;

  if v_supplier_name is null then
    raise exception 'El proveedor no existe o no pertenece a tu sede';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'La compra no tiene items';
  end if;

  -- 5. Cabecera. total arranca en 0 y se persiste al final con la suma REAL.
  insert into public.purchase_invoices
    (sede_id, supplier_id, invoice_number, total, notes, created_by, document_date)
  values
    (v_sede_id, v_supplier_id, v_invoice_number, 0, v_notes, auth.uid(), v_doc_date)
  returning id into v_invoice_id;

  -- 6. Items.
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_product_id := (v_item->>'product_id')::uuid;
    v_qty        := (v_item->>'qty')::integer;
    v_unit_cost  := (v_item->>'unit_cost')::numeric;
    v_unidad     := nullif(v_item->>'purchase_unit', '');
    v_factor     := (v_item->>'units_per_purchase_unit')::integer;

    -- 🔴 EL FACTOR SE VALIDA, NO SE CORRIGE (R6).
    if v_unidad is null then
      if v_factor is not null and v_factor <> 1 then
        raise exception 'Hay un factor de equivalencia (%) sin unidad de compra para el producto %',
          v_factor, v_product_id
          using errcode = 'check_violation';
      end if;
      v_factor := 1;
    else
      if v_factor is null then
        raise exception 'Falta el factor de equivalencia para la unidad de compra "%" del producto %',
          v_unidad, v_product_id
          using errcode = 'check_violation';
      end if;
      if v_factor < 1 then
        raise exception 'El factor de equivalencia de "%" tiene que ser 1 o mas (llego %)',
          v_unidad, v_factor
          using errcode = 'check_violation';
      end if;
    end if;

    if v_qty is null or v_qty <= 0 then
      raise exception 'Cantidad invalida para el producto %', v_product_id;
    end if;
    if v_unit_cost is null or v_unit_cost < 0 then
      raise exception 'Costo unitario invalido para el producto %', v_product_id;
    end if;

    select stock_tracking, stock_qty, cost_price
    into v_tracking, v_stock_actual, v_costo_actual
    from public.products
    where id = v_product_id and sede_id = v_sede_id;

    if not found then
      raise exception 'El producto % no pertenece a tu sede', v_product_id;
    end if;

    v_unidades := v_qty * v_factor;
    v_subtotal := v_qty * v_unit_cost;
    v_total    := v_total + v_subtotal;

    insert into public.purchase_invoice_items
      (invoice_id, product_id, qty, unit_cost, subtotal,
       purchase_unit, units_per_purchase_unit)
    values
      (v_invoice_id, v_product_id, v_qty, v_unit_cost, v_subtotal,
       v_unidad, v_factor);

    if v_tracking then
      update public.products
         set stock_qty = coalesce(stock_qty, 0) + v_unidades
       where id = v_product_id;

      insert into public.stock_movements
        (sede_id, product_id, type, qty, reference_id, notes, created_by)
      values
        (v_sede_id, v_product_id, 'purchase', v_unidades, v_invoice_id,
         'Compra a ' || v_supplier_name, auth.uid());
    end if;

    update public.products
       set cost_price = case
             when not v_tracking                   then round(v_unit_cost / v_factor, 2)
             when v_costo_actual is null           then round(v_unit_cost / v_factor, 2)
             when coalesce(v_stock_actual, 0) <= 0 then round(v_unit_cost / v_factor, 2)
             else round(
               (v_stock_actual * v_costo_actual + v_subtotal)
               / (v_stock_actual + v_unidades), 2)
           end
     where id = v_product_id;
  end loop;

  update public.purchase_invoices
     set total = v_total
   where id = v_invoice_id;

  -- 8. 🔴 LA COMPRA SALE DE LA CAJA. El movimiento se fecha con el DOCUMENTO
  --    para que el historial de gastos y el de compras cuenten lo mismo; la
  --    caja del dia sigue cuadrando por created_at y por la jornada.
  v_cash_amount := round(v_total)::integer;

  if v_cash_amount > 0 then
    insert into public.cash_movements
      (jornada_id, sede_id, type, categoria, amount, reason, created_by, document_date)
    values
      (v_jornada_id, v_sede_id, 'out', 'compra', v_cash_amount,
       'Compra a proveedor ' || v_supplier_name
         || coalesce(' (factura ' || v_invoice_number || ')', ''),
       auth.uid(), v_doc_date)
    returning id into v_cash_mov_id;
  end if;

  return jsonb_build_object(
    'invoice_id',       v_invoice_id,
    'total',            v_total,
    'cash_movement_id', v_cash_mov_id
  );
end;
$$;


-- ── 5 · register_purchase_return, con la fecha de la nota credito ──────────
-- Se DROPEA y se recrea porque gana un parametro: `create or replace` con una
-- firma distinta dejaria DOS funciones y PostgREST no sabria cual llamar. Tiene
-- un commit de vida y ningun consumidor en src/, asi que es barato hacerlo bien
-- ahora en vez de dejar la asimetria escrita.
drop function if exists public.register_purchase_return(uuid, jsonb, text);

create or replace function public.register_purchase_return(
  p_invoice_id    uuid,
  p_items         jsonb,
  p_notes         text default null,
  p_document_date date default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sede_id            uuid := get_my_sede_id();
  v_doc_date           date := coalesce(p_document_date, public.hoy_bogota());
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
  if v_sede_id is null then
    raise exception 'No tienes una sede activa';
  end if;
  if not has_permission('compras.gestionar') then
    raise exception 'No autorizado para registrar devoluciones de compra';
  end if;
  if v_doc_date > public.hoy_bogota() then
    raise exception 'La fecha de la devolucion (%) esta en el futuro: revisa el ano', v_doc_date
      using errcode = 'check_violation';
  end if;

  select id into v_jornada_id
  from public.jornadas
  where sede_id = v_sede_id and closed_at is null
  limit 1;

  if v_jornada_id is null then
    raise exception 'Abri la jornada de caja antes de registrar una devolucion de compra'
      using errcode = 'check_violation';
  end if;

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
     kind, returns_invoice_id, document_date)
  values
    (v_sede_id, v_supplier_id, v_invoice_number, 0,
     nullif(btrim(coalesce(p_notes, '')), ''), auth.uid(),
     'return', p_invoice_id, v_doc_date)
  returning id into v_return_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_product_id := (v_item->>'product_id')::uuid;
    v_qty        := (v_item->>'qty')::integer;

    if v_qty is null or v_qty <= 0 then
      raise exception 'Cantidad invalida para el producto %', v_product_id
        using errcode = 'check_violation';
    end if;

    -- 🔴 EL COSTO Y EL FACTOR SALEN DE LA FACTURA, NO DEL PAYLOAD.
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

    if v_costos_distintos > 1 or v_factores_distintos > 1 then
      raise exception 'El producto % aparece en esa factura con costos o presentaciones distintas: no se puede decidir cual devolver',
        v_product_id
        using errcode = 'check_violation';
    end if;

    select coalesce(sum(i.qty), 0)
    into v_devuelto
    from public.purchase_invoice_items i
    join public.purchase_invoices d on d.id = i.invoice_id
    where d.returns_invoice_id = p_invoice_id
      and d.id <> v_return_id
      and i.product_id = v_product_id;

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

    -- 🔴🔴 `cost_price` NO SE TOCA. Ver 20260902210000.
  end loop;

  update public.purchase_invoices
     set total = v_total
   where id = v_return_id;

  v_cash_amount := round(v_total)::integer;

  if v_cash_amount > 0 then
    insert into public.cash_movements
      (jornada_id, sede_id, type, categoria, amount, reason, created_by, document_date)
    values
      (v_jornada_id, v_sede_id, 'in', 'devolucion_compra', v_cash_amount,
       'Devolucion a proveedor ' || coalesce(v_supplier_name, 'sin nombre')
         || coalesce(' (factura ' || v_invoice_number || ')', ''),
       auth.uid(), v_doc_date)
    returning id into v_cash_mov_id;
  end if;

  return jsonb_build_object(
    'return_invoice_id', v_return_id,
    'total',             v_total,
    'cash_movement_id',  v_cash_mov_id
  );
end;
$$;

revoke execute on function public.register_purchase_return(uuid, jsonb, text, date) from public;
revoke execute on function public.register_purchase_return(uuid, jsonb, text, date) from anon;
grant  execute on function public.register_purchase_return(uuid, jsonb, text, date) to authenticated;


-- ── 6 · LO QUE ESTE ARCHIVO NO HACE, DICHO ────────────────────────────────
-- · NO pone piso a la fecha pasada. Una factura del 2019 entra. Cualquier limite
--   seria arbitrario y bloquearia una carga historica legitima; el lado que
--   miente en silencio —el futuro— si esta cerrado. Si algun dia molesta, el
--   disparador concreto es una carga inicial que meta anios viejos por typo.
-- · NO toca el ARQUEO. El cierre sigue cuadrando por jornada y created_at, que
--   es cuando la plata salio del cajon. Hay un caso en el spec que lo asevera
--   justamente para impedir que se "arregle" de mas.
-- · NO agrega el campo de fecha a los formularios de alta: eso va en src/, en
--   este mismo commit.

commit;
