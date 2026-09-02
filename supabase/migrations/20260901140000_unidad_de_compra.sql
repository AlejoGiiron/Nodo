-- ============================================================================
-- Unidad de compra y factor de equivalencia — deuda 43
--
-- 🔴 EL DEFECTO QUE ARREGLA, Y ES EN DINERO.
-- Se compra por bulto y se vende por unidad. Hasta acá `qty` se sumaba directo
-- a `stock_qty` y se ponderaba directo en el costo, así que comprar 12 bultos
-- de 50 dejaba el stock en +12 —debería ser +600— y el costo unitario en el
-- del bulto: CINCUENTA VECES el real. Y `cost_price` alimenta
-- `order_items.unit_cost`, que se CONGELA al vender (R1 punto 8): el error
-- quedaba grabado para siempre en las utilidades.
--
-- Se encuentra a tiempo por una sola razón: todavía no hay clientes operando.
--
-- ── POR QUÉ NO SIRVE `product_components`, que ya existe ───────────────────
-- Esa tabla relaciona DOS PRODUCTOS (padre compuesto → componente). Sirve para
-- VENDER un bulto que descuenta unidades. Acá el caso es el inverso —comprar
-- por bulto, vender por unidad— y no encaja por tres razones medidas:
--   · `unique (parent_id, component_id)` permite UNA sola conversión por par, y
--     un producto llega en bulto, canasta y caja.
--   · Cada presentación sería una fila en `products`: el catálogo real tiene
--     4.212 referencias y se duplicaría con bultos que nadie vende, ensuciando
--     la búsqueda, que es el cuello de botella del mostrador.
--   · Un compuesto no recibe stock (`if v_tracking`), así que registrar la
--     compra contra el bulto no mueve nada.
-- La presentación de compra NO es otro producto: es un empaque del mismo.
--
-- ── POR QUÉ EL FACTOR VA EN LA LÍNEA Y NO EN UN CATÁLOGO ───────────────────
-- Mismo criterio que congela `unit_cost` en la línea de venta (R1 punto 8): si
-- mañana el bulto pasa a traer 48, las compras pasadas NO deben recalcularse.
-- La línea tiene que seguir diciendo lo que dijo. Un catálogo de presentaciones
-- por producto es deseable después — como AUTOCOMPLETADO, no como fuente de
-- verdad histórica.
--
-- ── `qty` NO CAMBIA DE SIGNIFICADO ─────────────────────────────────────────
-- Siempre quiso decir "cuántas unidades de compra": pasa que hasta hoy la
-- unidad de compra era siempre la de venta. Con `default 1`, cada fila
-- existente queda `qty × 1` = lo mismo que antes. No hay backfill y ninguna
-- fila vieja cambia de sentido.
--
-- R5: archivo nuevo. La migración de compras aplicada NO se toca.
-- ============================================================================

-- ── 1 · Las dos columnas ────────────────────────────────────────────────────
alter table public.purchase_invoice_items
  add column purchase_unit           text,
  add column units_per_purchase_unit integer not null default 1;

comment on column public.purchase_invoice_items.purchase_unit is
  'Etiqueta de la presentacion comprada: bulto, canasta, caja, arroba. NULL = '
  'se compro en la misma unidad en que se vende. '
  'TEXTO LIBRE A PROPOSITO, y es R2 leida sobre QUE SE ROMPE, no una excepcion '
  'a R2: este es el lado que falla PERMITIENDO, y lo que se cuela es un typo en '
  'una ETIQUETA, no un dato que mienta. El factor —lo unico que toca dinero— si '
  'esta validado. Una allowlist cerrada bloquearia al cliente el dia que llegue '
  'una presentacion nueva, que es un costo real contra un riesgo cosmetico. '
  'DISPARADOR PARA NORMALIZARLO, concreto y no un "algun dia": el dia que haya '
  'un reporte POR PRESENTACION. Ahi "bulto" y "Bulto" son dos filas distintas y '
  'el texto libre deja de servir.';

comment on column public.purchase_invoice_items.units_per_purchase_unit is
  'Cuantas unidades de VENTA trae una unidad de compra. 1 = se compro suelto. '
  'Se graba en la linea y no se resuelve contra un catalogo: si el empaque '
  'cambia de tamano, esta compra tiene que seguir diciendo lo que dijo.';

-- ── 2 · El invariante, en la base ───────────────────────────────────────────
-- El guard tambien vive en la RPC. Va en los dos lugares a proposito: la RPC da
-- el mensaje accionable, y el CHECK garantiza que NINGUN camino —un insert
-- directo, un seed, una correccion a mano— pueda dejar una linea que mienta
-- sobre dinero. Un invariante de datos no depende de por donde entraron.
alter table public.purchase_invoice_items
  add constraint chk_factor_segun_unidad check (
    (purchase_unit is null     and units_per_purchase_unit = 1) or
    (purchase_unit is not null and units_per_purchase_unit >= 1)
  );

-- ── 3 · register_purchase v2 ────────────────────────────────────────────────
-- Cuerpo copiado LITERAL de 20260831121100_compras.sql. El diff es solo la
-- aritmetica del factor: el guard nuevo, `v_unidades = v_qty * v_factor` para
-- stock y ponderacion, y las dos columnas nuevas en el insert. Todo lo demas
-- —los guards de sede, permiso, jornada, proveedor y producto, el movimiento de
-- caja, el retorno— queda igual.
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

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'La compra no tiene items';
  end if;

  -- 5. Cabecera. total arranca en 0 y se persiste al final con la suma REAL.
  insert into public.purchase_invoices
    (sede_id, supplier_id, invoice_number, total, notes, created_by)
  values
    (v_sede_id, v_supplier_id, v_invoice_number, 0, v_notes, auth.uid())
  returning id into v_invoice_id;

  -- 6. Items.
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_product_id := (v_item->>'product_id')::uuid;
    v_qty        := (v_item->>'qty')::integer;
    v_unit_cost  := (v_item->>'unit_cost')::numeric;
    v_unidad     := nullif(v_item->>'purchase_unit', '');
    v_factor     := (v_item->>'units_per_purchase_unit')::integer;

    -- 🔴 EL FACTOR SE VALIDA, NO SE CORRIGE (R6). Un default silencioso acá es
    --    un costo unitario multiplicado por el tamaño del empaque —50x para un
    --    bulto de 50— y cost_price se CONGELA en order_items.unit_cost al
    --    vender (R1 punto 8): el error quedaria grabado para siempre en las
    --    utilidades de todas las ventas de ese producto.
    --    Direccion del fallo: por este lado se MIENTE sobre dinero, asi que es
    --    fail-closed. Sin unidad de compra, el factor tiene que ser 1 o venir
    --    ausente; con unidad de compra, tiene que venir y ser >= 1.
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

    -- stock_tracking y el costo vigente se LEEN DE LA BD, no del payload.
    select stock_tracking, stock_qty, cost_price
    into v_tracking, v_stock_actual, v_costo_actual
    from public.products
    where id = v_product_id and sede_id = v_sede_id;

    if not found then
      raise exception 'El producto % no pertenece a tu sede', v_product_id;
    end if;

    -- qty son UNIDADES DE COMPRA (bultos); v_unidades son unidades de venta.
    -- El subtotal es plata de la factura y NO se toca: qty * unit_cost sigue
    -- siendo lo que dice el papel del proveedor.
    v_unidades := v_qty * v_factor;
    v_subtotal := v_qty * v_unit_cost;
    v_total    := v_total + v_subtotal;

    insert into public.purchase_invoice_items
      (invoice_id, product_id, qty, unit_cost, subtotal,
       purchase_unit, units_per_purchase_unit)
    values
      (v_invoice_id, v_product_id, v_qty, v_unit_cost, v_subtotal,
       v_unidad, v_factor);

    -- Sube stock solo si el producto se inventaria. Un compuesto (bulto) no
    -- recibe stock propio: se compran sus componentes.
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

    -- Promedio ponderado movil, con sus tres caidas a unit_cost. Ver cabecera.
    -- El promedio se pondera en UNIDADES DE VENTA, que es la unidad en que
    -- vive stock_qty y en la que se vende.
    --
    -- El numerador NO divide: (v_unidades * (v_unit_cost / v_factor)) es
    -- identicamente v_qty * v_unit_cost = v_subtotal. Se escribe asi a
    -- proposito — dividir y volver a multiplicar perderia centavos en cada
    -- compra con factor que no divide exacto.
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

-- ── 4 · Lo que este archivo NO hace, dicho ─────────────────────────────────
-- · No toca las lineas existentes: `default 1` las deja significando lo mismo.
-- · No agrega el catalogo de presentaciones por producto. Es autocompletado y
--   va cuando teclear el factor moleste, no antes.
-- · No resuelve la etiqueta de la unidad de VENTA (deuda 41). El chip
--   "1 bulto = 50 UND" de la maqueta necesita ese "UND". La PLATA funciona
--   solo con el factor; el rotulo completo espera a la 41.
