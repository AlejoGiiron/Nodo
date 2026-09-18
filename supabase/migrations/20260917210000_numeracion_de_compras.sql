-- ============================================================
-- Numeracion de compras: un consecutivo por sede
-- ============================================================
--
-- Reportado por la clienta el 2026-09-17 mirando la compra PED46038: «la compra
-- no tiene numeracion, ¿como se sabe que numero de compra es?». Es cierto:
-- `purchase_invoices` no tenia correlativo. Lo unico visible era
-- `invoice_number`, el numero del PAPEL del proveedor: texto libre, nulo
-- posible y repetido («00000» varias veces en su historial). Las ventas tienen
-- `order_number` desde el esquema base; las compras no tenian nada.
--
-- R0
-- 1. CLASE — contrato compartido (R1): el numero vive en el esquema, en la RPC,
--    en la interfaz de retorno (5b) y en las pantallas. Y validar-vs-forzar:
--    el numero lo ASIGNA la RPC, el cliente no lo manda ni lo puede elegir.
-- 2. PRECEDENTE — `store_sequences` + `next_order_number` (migracion `ventas`).
--    Se reusa la TABLA, no la forma de dos pasos: aquella devuelve el numero y
--    el cliente lo escribe despues, y ese hueco dejo 30 ventas sin numero el
--    2026-09-07 (criterio «que se puedan ver»). Aca se asigna dentro de
--    register_purchase, en la misma transaccion que la cabecera.
-- 3. MODO DE FALLO — un numero repetido o una compra sin numero FALLA CERRADO:
--    indice unico parcial + CHECK. El backfill se verifica adentro y aborta.
-- 4. OBJETIVO — todas las filas `kind = 'purchase'`, por sede, sin filtro por
--    nombre. Filas contadas ANTES, medidas el 2026-09-17 contra la base:
--      purchase_invoices kind='purchase': 532 · kind='return': 72
--      sedes con compras: 4 · sin fila en store_sequences: 0
--      empates (sede_id, created_at): 0
--
-- DECISIONES
-- · Solo se numeran las COMPRAS. Una devolucion (`kind = 'return'`) queda con
--   `purchase_number` nulo y se identifica por la compra que revierte
--   (`returns_invoice_id`). Dos series en una columna seria un valor que
--   significa dos cosas.
-- · El backfill numera por ORDEN DE REGISTRO (`created_at`, `id` de desempate),
--   igual que las ventas: el numero dice en que orden entraron al sistema, no
--   de cuando es el papel — eso ya lo dice `document_date`.
--   ⚠️ Numerar las compras viejas NO reescribe un hecho: agrega un dato que no
--   existia. Ningun total, costo ni movimiento cambia.
-- · `register_purchase` se copia VERBATIM de `20260902220000_fecha_del_documento`
--   (verificado idéntico al cuerpo desplegado con pg_get_functiondef el
--   2026-09-17) y gana exactamente cuatro cosas: la variable, el paso 4b, la
--   columna en el insert y la clave `purchase_number` en el retorno.
--   `create or replace` con la misma firma conserva los grants.
-- ============================================================

begin;

-- ── 1 · Columnas ───────────────────────────────────────────────────────────
alter table public.store_sequences
  add column last_purchase_number integer not null default 0;

comment on column public.store_sequences.last_purchase_number is
  'Ultimo numero de COMPRA entregado en la sede. Lo incrementa register_purchase '
  'dentro de la misma transaccion que inserta la cabecera.';

alter table public.purchase_invoices
  add column purchase_number integer;

comment on column public.purchase_invoices.purchase_number is
  'Consecutivo de COMPRA por sede, asignado por register_purchase. Nulo en las '
  'devoluciones (kind = return), que se identifican por returns_invoice_id. NO '
  'es el numero del papel del proveedor: ese es invoice_number, texto libre.';

-- ── 2 · Backfill ───────────────────────────────────────────────────────────
update public.purchase_invoices pi
   set purchase_number = n.rn
  from (
    select id, row_number() over (partition by sede_id order by created_at, id) rn
      from public.purchase_invoices
     where kind = 'purchase'
  ) n
 where n.id = pi.id;

insert into public.store_sequences (sede_id, last_purchase_number)
select sede_id, max(purchase_number)
  from public.purchase_invoices
 where kind = 'purchase'
 group by sede_id
on conflict (sede_id) do update
  set last_purchase_number = excluded.last_purchase_number;

-- ── 3 · Invariantes, fail-closed ───────────────────────────────────────────
create unique index idx_purchase_invoices_sede_purchase_number
  on public.purchase_invoices (sede_id, purchase_number)
  where purchase_number is not null;

alter table public.purchase_invoices
  add constraint chk_numero_solo_en_compras check (
    (kind = 'purchase' and purchase_number is not null) or
    (kind = 'return'   and purchase_number is null)
  );

-- ── 4 · Verificacion embebida: si no cierra, la migracion entera se revierte ─
do $$
declare
  v_compras   integer;
  v_numeradas integer;
  v_desfase   integer;
begin
  select count(*) into v_compras   from public.purchase_invoices where kind = 'purchase';
  select count(*) into v_numeradas from public.purchase_invoices where purchase_number is not null;
  if v_compras <> v_numeradas then
    raise exception 'Backfill incompleto: % compras, % numeradas', v_compras, v_numeradas;
  end if;

  -- Por sede: el contador == el maximo == la cantidad (serie 1..N sin huecos).
  select count(*) into v_desfase
    from (
      select pi.sede_id, count(*) n, max(pi.purchase_number) mx, s.last_purchase_number lp
        from public.purchase_invoices pi
        join public.store_sequences s on s.sede_id = pi.sede_id
       where pi.kind = 'purchase'
       group by pi.sede_id, s.last_purchase_number
    ) x
   where not (x.n = x.mx and x.mx = x.lp);
  if v_desfase <> 0 then
    raise exception 'Serie desfasada en % sede(s)', v_desfase;
  end if;

  raise notice 'Compras numeradas: %', v_numeradas;
end $$;

-- ── 5 · register_purchase, con el numero ───────────────────────────────────
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
  v_purchase_number integer;
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

  -- 4b. 🔴 NUMERO DE COMPRA — en la MISMA transaccion que la cabecera.
  --     No hay un paso del cliente que pida el numero y otro que lo asigne
  --     (la forma de next_order_number): ese hueco dejo 30 ventas SIN numero
  --     el 2026-09-07. Si algo de abajo aborta, el incremento se revierte con
  --     todo lo demas, asi que un rechazo no deja huecos en la serie. La fila
  --     de store_sequences queda bloqueada hasta el commit: dos compras
  --     simultaneas de la misma sede se numeran en fila, no con el mismo N.
  insert into public.store_sequences (sede_id, last_purchase_number)
  values (v_sede_id, 1)
  on conflict (sede_id) do update
    set last_purchase_number = public.store_sequences.last_purchase_number + 1
  returning last_purchase_number into v_purchase_number;

  -- 5. Cabecera. total arranca en 0 y se persiste al final con la suma REAL.
  insert into public.purchase_invoices
    (sede_id, supplier_id, invoice_number, total, notes, created_by, document_date,
     purchase_number)
  values
    (v_sede_id, v_supplier_id, v_invoice_number, 0, v_notes, auth.uid(), v_doc_date,
     v_purchase_number)
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
    'cash_movement_id', v_cash_mov_id,
    'purchase_number',  v_purchase_number
  );
end;
$$;

comment on function public.register_purchase(jsonb, jsonb) is
  'Registra una compra atomicamente y le asigna su consecutivo por sede '
  '(purchase_number). Devuelve invoice_id, total, cash_movement_id y purchase_number.';

commit;
