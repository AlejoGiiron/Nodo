-- ============================================================
-- G-Nexo — Esquema base · 08 · Compras a proveedor
--
-- ORIGEN: G-Vento `d848852`, supabase/compras-proveedores.sql y
-- supabase/compra-no-toca-caja.sql. Paso 0, par 7: gana la v2
-- (compra-no-toca-caja) por su ESTRUCTURA — pero su REGLA se invierte, porque
-- la regla del cliente de G-Nexo es la contraria. Ver docs/paso-0-...md.
--
-- R5: no aplicado en G-Nexo (base vacia). Desde el primer `db push`, R5 manda.
--
-- ── LA REGLA DEL CLIENTE (2026-08-31) Y POR QUE INVIERTE LA HEREDADA ───────
-- G-Vento:  la compra NO toca la caja; el egreso lo hace el cajero a mano.
-- G-Nexo:   la compra SALE DE LA CAJA DEL DIA, siempre. Si el efectivo no
--           alcanza, se inyecta plata con un ingreso (categoria 'base') y con
--           eso se paga. No existe "pagada por fuera".
--
-- Que se toma de la v2 igual: que el retorno no lleve flags de caja heredados,
-- la validacion de proveedor por sede, el total DERIVADO de los items (nunca
-- recibido del cliente) y el orden de las guardas.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- suppliers
-- ------------------------------------------------------------
create table public.suppliers (
  id         uuid        primary key default gen_random_uuid(),
  sede_id    uuid        not null references public.sedes on delete cascade,
  name       text        not null,
  nit        text,
  phone      text,
  contact    text,
  notes      text,
  is_active  boolean     not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.suppliers is 'Proveedores por sede.';

create index idx_suppliers_sede_id on public.suppliers (sede_id);

create trigger trg_suppliers_updated_at
  before update on public.suppliers
  for each row execute function public.handle_updated_at();


-- ------------------------------------------------------------
-- purchase_invoices
--
-- ⚠️ `payment_method` SE CONSERVA A PROPOSITO, aunque la regla del cliente lo
--    volvio irrelevante (la compra siempre sale de caja). Es `not null` y el
--    frontend lo envia: eliminarlo ahora rompe el front. El orden obligatorio
--    es primero el consumidor y despues la columna — deuda #29.3.
--    🔴 Y arrastra un hallazgo: NO usa el enum `payment_method`, es un CHECK
--    con los cuatro valores copiados a mano. Es el NOVENO lado del contrato de
--    R1 punto 4, duplicado con otro mecanismo. Al eliminarlo, ese lado muere.
--
-- ⚠️ SIN cuentas por pagar: toda compra es de CONTADO. La compra a credito no
--    existe en el heredado (verificado) y esta pospuesta como deuda #28.
-- ------------------------------------------------------------
create table public.purchase_invoices (
  id             uuid           primary key default gen_random_uuid(),
  sede_id        uuid           not null references public.sedes     on delete cascade,
  supplier_id    uuid           not null references public.suppliers on delete restrict,
  invoice_number text,
  total          numeric(12, 2) not null default 0 check (total >= 0),
  payment_method text           not null
                                check (payment_method in ('cash', 'card', 'transfer', 'nequi')),
  notes          text,
  created_by     uuid           references public.profiles on delete set null,
  created_at     timestamptz    not null default now()
);

comment on table public.purchase_invoices is
  'Factura de compra a proveedor. Pago COMPLETO al registrar, siempre contra la '
  'caja del dia. Sin cuentas por pagar (deuda #28). total lo DERIVA '
  'register_purchase de los items: nunca se recibe del cliente.';
comment on column public.purchase_invoices.payment_method is
  'DEPRECADA (deuda #29.3): la regla del cliente es que la compra siempre sale '
  'de la caja del dia, asi que la forma de pago no aporta. Se conserva porque '
  'es not null y el front todavia la envia. Primero el consumidor, despues la '
  'columna.';

create index idx_purchase_invoices_sede_created
  on public.purchase_invoices (sede_id, created_at desc);
create index idx_purchase_invoices_supplier
  on public.purchase_invoices (supplier_id);


-- ------------------------------------------------------------
-- purchase_invoice_items
-- `on delete restrict` en product_id: no se borra un producto con historial de
-- compra. El historial de costos es lo unico que hace calculable la utilidad.
-- ------------------------------------------------------------
create table public.purchase_invoice_items (
  id         uuid           primary key default gen_random_uuid(),
  invoice_id uuid           not null references public.purchase_invoices on delete cascade,
  product_id uuid           not null references public.products          on delete restrict,
  qty        integer        not null check (qty > 0),
  unit_cost  numeric(12, 2) not null check (unit_cost >= 0),
  subtotal   numeric(12, 2) not null check (subtotal >= 0),
  created_at timestamptz    not null default now()
);

create index idx_purchase_invoice_items_invoice on public.purchase_invoice_items (invoice_id);
create index idx_purchase_invoice_items_product on public.purchase_invoice_items (product_id);


-- ------------------------------------------------------------
-- register_purchase
--
-- ── EL CAMBIO FAIL-CLOSED, Y NO ES UN BUG DEL ORIGINAL ────────────────────
-- La version heredada creaba el movimiento de caja solo `if v_shift_id is not
-- null`: sin turno abierto, la compra se registraba igual y NO tocaba la caja,
-- en silencio. Con la regla de G-Vento eso era coherente (la caja la movia el
-- cajero a mano).
--
-- Con la regla de G-Nexo pasa a ser fail-open: una compra que DEBIA salir de
-- caja y no salio descuadra el cierre sin un solo error. Por eso acá se
-- RECHAZA. Se invierte por la decision del cliente, no porque el original
-- estuviera mal.
--
-- Y se rechaza en vez de abrir la jornada sola: abrirla inventaria un hecho de
-- negocio que no ocurrio y esconderia el problema real, que es que estan
-- comprando con la caja cerrada.
--
-- ── COSTO: PROMEDIO PONDERADO MOVIL, NO ULTIMO COSTO ──────────────────────
-- El heredado hacia `cost_price = v_unit_cost` (ultimo costo). La deuda #18 lo
-- descarto: con ultimo costo, UNA compra cara desploma la utilidad en el papel
-- y sobrevalua el inventario entero.
--
--   nuevo = (stock_actual * costo_actual + qty * costo_compra)
--           / (stock_actual + qty)
--
-- Tres casos donde la formula NO aplica y se cae a `unit_cost`, dichos porque
-- son justo los que producen numeros absurdos en silencio:
--   · costo_actual nulo  → primera compra: no hay nada que promediar.
--   · stock_actual <= 0  → hubo sobreventa (permitida a proposito, ver el
--     migracion `catalogo`). Ponderar contra un stock negativo da un costo negativo o
--     una division por cero.
--   · sin stock_tracking → no hay cantidad contra la cual ponderar.
-- ------------------------------------------------------------
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
  v_payment_method text := p_invoice->>'payment_method';
  v_invoice_number text := nullif(p_invoice->>'invoice_number', '');
  v_notes          text := nullif(p_invoice->>'notes', '');
  v_supplier_name  text;
  v_jornada_id     uuid;
  v_invoice_id     uuid;
  v_total          numeric(12, 2) := 0;
  v_item           jsonb;
  v_product_id     uuid;
  v_qty            integer;
  v_unit_cost      numeric(12, 2);
  v_subtotal       numeric(12, 2);
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

  -- 2. 🔴 JORNADA ABIERTA — FAIL-CLOSED. Se valida ANTES de escribir nada.
  --    El mensaje dice la ACCION, no el estado: quien lo lee tiene que saber
  --    que hacer, no solo que fallo.
  select id into v_jornada_id
  from public.jornadas
  where sede_id = v_sede_id and closed_at is null
  limit 1;   -- idx_jornadas_una_abierta_por_sede garantiza a lo sumo una

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

  -- 4. Forma de pago: allowlist. DEPRECADA (deuda #29.3) pero todavia not null.
  if v_payment_method is null
     or v_payment_method not in ('cash', 'card', 'transfer', 'nequi') then
    raise exception 'Metodo de pago invalido: %', coalesce(v_payment_method, '(null)');
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'La compra no tiene items';
  end if;

  -- 5. Cabecera. total arranca en 0 y se persiste al final con la suma REAL.
  insert into public.purchase_invoices
    (sede_id, supplier_id, invoice_number, total, payment_method, notes, created_by)
  values
    (v_sede_id, v_supplier_id, v_invoice_number, 0, v_payment_method, v_notes, auth.uid())
  returning id into v_invoice_id;

  -- 6. Items.
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_product_id := (v_item->>'product_id')::uuid;
    v_qty        := (v_item->>'qty')::integer;
    v_unit_cost  := (v_item->>'unit_cost')::numeric;

    if v_qty is null or v_qty <= 0 then
      raise exception 'Cantidad invalida para el producto %', v_product_id;
    end if;
    if v_unit_cost is null or v_unit_cost < 0 then
      raise exception 'Costo unitario invalido para el producto %', v_product_id;
    end if;

    -- stock_tracking y el costo vigente se LEEN DE LA BD, no del payload.
    select stock_tracking, stock_qty, cost_price
    into v_tracking, v_stock_actual, v_costo_actual
    from public.products
    where id = v_product_id and sede_id = v_sede_id;

    if not found then
      raise exception 'El producto % no pertenece a tu sede', v_product_id;
    end if;

    v_subtotal := v_qty * v_unit_cost;
    v_total    := v_total + v_subtotal;

    insert into public.purchase_invoice_items
      (invoice_id, product_id, qty, unit_cost, subtotal)
    values
      (v_invoice_id, v_product_id, v_qty, v_unit_cost, v_subtotal);

    -- Sube stock solo si el producto se inventaria. Un compuesto (bulto) no
    -- recibe stock propio: se compran sus componentes.
    if v_tracking then
      update public.products
         set stock_qty = coalesce(stock_qty, 0) + v_qty
       where id = v_product_id;

      insert into public.stock_movements
        (sede_id, product_id, type, qty, reference_id, notes, created_by)
      values
        (v_sede_id, v_product_id, 'purchase', v_qty, v_invoice_id,
         'Compra a ' || v_supplier_name, auth.uid());
    end if;

    -- Promedio ponderado movil, con sus tres caidas a unit_cost. Ver cabecera.
    update public.products
       set cost_price = case
             when not v_tracking                              then v_unit_cost
             when v_costo_actual is null                      then v_unit_cost
             when coalesce(v_stock_actual, 0) <= 0            then v_unit_cost
             else round(
               (v_stock_actual * v_costo_actual + v_qty * v_unit_cost)
               / (v_stock_actual + v_qty), 2)
           end
     where id = v_product_id;
  end loop;

  -- 7. Total derivado.
  update public.purchase_invoices
     set total = v_total
   where id = v_invoice_id;

  -- 8. 🔴 LA COMPRA SALE DE LA CAJA. Categoria estructurada, no texto libre:
  --    `reason` queda como detalle (migracion `caja`). amount es entero: COP no usa
  --    decimales.
  v_cash_amount := round(v_total)::integer;

  if v_cash_amount > 0 then
    insert into public.cash_movements
      (jornada_id, sede_id, type, categoria, amount, reason, created_by)
    values
      (v_jornada_id, v_sede_id, 'out', 'compra', v_cash_amount,
       'Compra a proveedor ' || v_supplier_name
         || coalesce(' (factura ' || v_invoice_number || ')', ''),
       auth.uid())
    returning id into v_cash_mov_id;
  end if;

  return jsonb_build_object(
    'invoice_id',      v_invoice_id,
    'total',           v_total,
    'cash_movement_id', v_cash_mov_id
  );
end;
$$;

revoke execute on function public.register_purchase(jsonb, jsonb) from public;
revoke execute on function public.register_purchase(jsonb, jsonb) from anon;
grant  execute on function public.register_purchase(jsonb, jsonb) to authenticated;


-- RLS habilitada aca; policies en el 11 (ver la cabecera de la migracion `organizaciones_y_sedes`).
alter table public.suppliers             enable row level security;
alter table public.purchase_invoices     enable row level security;
alter table public.purchase_invoice_items enable row level security;

commit;
