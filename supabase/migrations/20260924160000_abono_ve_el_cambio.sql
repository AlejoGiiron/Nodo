-- ============================================================
-- Nodo · EL ABONO VE EL CAMBIO DE PRODUCTO
--
-- Caso real (2026-09-24, venta #162 de Muscle Pro): después de un cambio de
-- producto, Cartera mostraba saldo 478.000 y el abono de 478.000 se rechazaba
-- con «excede el saldo pendiente (469.000)».
--
--   939.000 (documento) + 9.000 (delta del cambio) − 470.000 abonado = 478.000   ← Cartera
--   939.000 (documento)                            − 470.000 abonado = 469.000   ← el abono
--
-- 🔴 ES EL CUARTO LADO DEL CONTRATO, Y LA MIGRACIÓN QUE LO CREÓ ENUMERÓ TRES.
--    20260924120000 declaró en su R0: «el saldo de una venta deja de ser
--    `total − abonos` y pasa a ser `total + Σ deltas − abonos`. Ese cambio
--    tiene TRES lados: la cartera, el balance de la sede, y el detalle del
--    Historial». Los tres son LECTORES. El que faltaba es el ESCRITOR que
--    decide con ese saldo: `register_debt_payment`.
--
-- ⚠️ Y FALLA EN LAS DOS DIRECCIONES, que es lo que lo hace caro:
--    · RECHAZA el saldo real → se ve; la clienta lo reportó.
--    · ACEPTA el saldo viejo y marca la venta `paid` → la saca de Cartera con
--      el delta del cambio sin cobrar. Sin error, sin aviso. Es la mitad que
--      nadie reporta, y es la salida natural del rechazo: «si no me deja
--      478.000, abono 469.000».
--
-- ── R0 ────────────────────────────────────────────────────────────────────
-- 1 · CLASE. Contrato compartido (R1): la fórmula del saldo vive en la
--     cartera (`deriveDebt`), el detalle (`SalesHistoryPage`), el balance
--     (`balance_de_sede`), `register_sale_change` y —desde acá— esta función.
--     Validar, no forzar: el abono se sigue rechazando si excede; lo que cambia
--     es contra qué número.
-- 2 · PRECEDENTE. `register_sale_change` ya calcula `v_total + Σ delta_total`
--     y bloquea la venta `for update`. Esta función copia las dos cosas.
--     Y el caso de `shift_open` (R1 punto 5b): un lado que declara algo que el
--     otro no manda elige una rama en silencio.
-- 3 · MODO DE FALLO. Callado hacia el lado de marcar pagada lo que no está
--     pagado. Por eso el spec mide el ESTADO resultante, no sólo el rechazo.
-- 4 · OBJETIVO. Se reemplaza UNA función por su firma exacta. Sin UPDATE ni
--     DELETE de datos. Las ventas que ya tengan este desajuste —marcadas
--     `paid` con el delta de un cambio sin cobrar— NO se tocan: la
--     verificación de abajo las ENUMERA con un notice, para decidir con el
--     número en la mano y no con una reparación a ciegas.
--
-- 🔴 EL CUERPO ES COPIA DEL DE 20260831121200, CON CUATRO CAMBIOS Y NADA MÁS.
--    Verificado con `diff` al armar el archivo, más una lista de imprescindibles
--    (guards, mensajes y las cinco claves del jsonb) que aborta si falta alguna:
--      1 · la variable `v_delta`;
--      2 · `for update of o` en la lectura de la venta: el saldo ahora sale de
--          dos tablas que escriben dos RPC distintas, y `register_sale_change`
--          ya bloquea esa misma fila. Sin el lock, un cambio y un abono
--          simultáneos podían dejar la venta pagada de más;
--      3 · la suma de `sale_changes.delta_total` antes de calcular el saldo;
--      4 · el saldo posterior, que decide `paid` vs `partial`, con el mismo delta.
--
-- ⚠️ LO QUE ESTO NO CUBRE, anotado como deuda 132:
--    `register_sale_void` tampoco sabe de `sale_changes`: anular una venta con
--    cambio devuelve al stock las líneas ORIGINALES y no lo que salió con el
--    cambio. Queda esperando la decisión de si se rechaza o se revierte.
-- ============================================================

begin;

create or replace function public.register_debt_payment(
  p_order_id       uuid,
  p_amount         numeric,
  p_payment_method text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sede_id       uuid := get_my_sede_id();
  v_order_total   numeric(12, 2);
  v_pay_status    text;
  v_customer_name text;
  v_order_number  int;
  v_paid          numeric(12, 2);
  v_delta         numeric(12, 2);
  v_saldo         numeric(12, 2);
  v_new_paid      numeric(12, 2);
  v_new_saldo     numeric(12, 2);
  v_new_status    text;
  v_jornada_id    uuid;
  v_cash_amount   integer;
  v_cash_mov_id   uuid    := null;
  v_conciliar     boolean := false;
begin
  if v_sede_id is null then
    raise exception 'No tienes una sede activa';
  end if;
  if not has_permission('fiado.gestionar') then
    raise exception 'No autorizado para registrar abonos de cartera';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'El abono debe ser mayor a cero';
  end if;
  if p_payment_method is null
     or p_payment_method not in ('cash', 'card', 'transfer', 'nequi') then
    raise exception 'Metodo de pago invalido: %', coalesce(p_payment_method, '(null)');
  end if;

  select o.total, o.payment_status, o.order_number, c.name
    into v_order_total, v_pay_status, v_order_number, v_customer_name
  from public.orders o
  left join public.customers c on c.id = o.customer_id
  where o.id = p_order_id and o.sede_id = v_sede_id
  for update of o;

  if not found then
    raise exception 'La venta no existe o no pertenece a tu sede';
  end if;
  if v_pay_status not in ('pending', 'partial') then
    raise exception 'La venta no tiene saldo pendiente';
  end if;

  -- El saldo se DERIVA, nunca se lee de una columna: un saldo persistido se
  -- desincroniza en silencio.
  select coalesce(sum(amount), 0) into v_paid
  from public.debt_payments
  where order_id = p_order_id;

  -- 🔴 EL TOTAL VIGENTE, NO EL DEL DOCUMENTO. Desde 20260924120000 el saldo
  --    es `total + Σ deltas − abonos`. Sin esto el abono rechaza el saldo
  --    que Cartera muestra, y acepta el viejo marcando la venta pagada con
  --    el delta del cambio sin cobrar. Ver la cabecera de 20260924160000.
  select coalesce(sum(c.delta_total), 0) into v_delta
  from public.sale_changes c
  where c.order_id = p_order_id;

  v_saldo := v_order_total + v_delta - v_paid;

  if p_amount > v_saldo then
    raise exception 'El abono (%) excede el saldo pendiente (%)', p_amount, v_saldo;
  end if;

  -- Efectivo → ingreso de caja si hay jornada abierta. Si NO la hay, el abono
  -- se registra igual y queda MARCADO para conciliar. Ver la cabecera.
  if p_payment_method = 'cash' then
    select id into v_jornada_id
    from public.jornadas
    where sede_id = v_sede_id and closed_at is null
    limit 1;   -- idx_jornadas_una_abierta_por_sede garantiza a lo sumo una

    v_cash_amount := round(p_amount)::integer;

    if v_jornada_id is not null and v_cash_amount > 0 then
      insert into public.cash_movements
        (jornada_id, sede_id, type, categoria, amount, reason, created_by)
      values
        (v_jornada_id, v_sede_id, 'in', 'abono_cliente', v_cash_amount,
         'Abono de ' || coalesce(v_customer_name, 'cliente')
           || coalesce(' (venta #' || v_order_number || ')', ''),
         auth.uid())
      returning id into v_cash_mov_id;
    else
      -- Entro efectivo y NO pudo registrarse en caja. Esto es lo que separa
      -- este null del null legitimo de una transferencia.
      v_conciliar := true;
    end if;
  end if;

  insert into public.debt_payments
    (sede_id, order_id, amount, payment_method, cash_movement_id,
     requiere_conciliacion, created_by)
  values
    (v_sede_id, p_order_id, p_amount, p_payment_method::public.payment_method,
     v_cash_mov_id, v_conciliar, auth.uid());

  v_new_paid   := v_paid + p_amount;
  v_new_saldo  := v_order_total + v_delta - v_new_paid;
  v_new_status := case when v_new_saldo <= 0 then 'paid' else 'partial' end;

  update public.orders
     set payment_status = v_new_status
   where id = p_order_id;

  return jsonb_build_object(
    'new_status',            v_new_status,
    'saldo_restante',        v_new_saldo,
    'cash_movement_created', (v_cash_mov_id is not null),
    'jornada_abierta',       (v_jornada_id is not null),
    'requiere_conciliacion', v_conciliar
  );
end;
$$;

-- `create or replace` conserva los privilegios; se re-declaran igual porque el
-- revoke a `anon` es el que una función nueva NO trae (ver CLAUDE.md, DEFINER).
revoke execute on function public.register_debt_payment(uuid, numeric, text) from public;
revoke execute on function public.register_debt_payment(uuid, numeric, text) from anon;
grant  execute on function public.register_debt_payment(uuid, numeric, text) to authenticated;

-- ── VERIFICACIÓN, adentro de la transacción y con raise ───────────────────
do $$
declare
  v_fn    bigint;
  v_row   record;
  v_malas integer := 0;
begin
  select count(*) into v_fn from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'register_debt_payment';
  if v_fn <> 1 then
    raise exception 'register_debt_payment: se esperaba 1 definicion y hay %.', v_fn;
  end if;

  -- El cuerpo NUEVO es el que quedó: mira los cambios y bloquea la venta.
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'register_debt_payment'
       and p.prosrc like '%public.sale_changes%'
       and p.prosrc like '%for update of o%'
  ) then
    raise exception 'register_debt_payment no quedo con el cuerpo nuevo.';
  end if;

  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'register_debt_payment'
       and array_to_string(p.proacl, ',') like '%anon=X%'
  ) then
    raise exception 'register_debt_payment quedo ejecutable por anon.';
  end if;

  -- Las que el calculo viejo ya pudo dejar PAGADAS debiendo el delta.
  for v_row in
    select o.id, o.order_number,
           o.total + coalesce((select sum(c.delta_total) from public.sale_changes c where c.order_id = o.id), 0)
                   - coalesce((select sum(d.amount) from public.debt_payments d where d.order_id = o.id), 0) as saldo
      from public.orders o
     where o.payment_status = 'paid' and o.cancelled_at is null
       and exists (select 1 from public.sale_changes c where c.order_id = o.id)
  loop
    if v_row.saldo > 0 then
      v_malas := v_malas + 1;
      raise notice 'PAGADA CON SALDO: venta #% (%) debe %', v_row.order_number, v_row.id, v_row.saldo;
    end if;
  end loop;
  raise notice 'El abono ve el cambio de producto: listo. Ventas pagadas con delta pendiente: %.', v_malas;
end $$;

commit;
