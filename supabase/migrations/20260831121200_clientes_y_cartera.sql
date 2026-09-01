-- ============================================================
-- G-Nexo — Esquema base · 09 · Clientes y cartera (por cobrar)
--
-- ORIGEN: G-Vento `d848852`, supabase/fiado-clientes.sql.
-- "Fiado" pasa a llamarse CARTERA: mismo mecanismo, palabra del negocio nuevo.
--
-- R5: no aplicado en G-Nexo (base vacia). Desde el primer `db push`, R5 manda.
--
-- ⛔ ESTE ARCHIVO ESTA INCOMPLETO A PROPOSITO: falta `register_debt_payment`.
--    La razon esta al final, y NO es un olvido: hay una decision abierta sobre
--    que pasa cuando se abona sin jornada abierta, y es de negocio.
--
-- ── LA CADENA DE DOS SALTOS, QUE ES LO QUE HACE ESPECIAL A ESTE MODULO ─────
--    debt_payments.cash_movement_id → cash_movements  (on delete SET NULL)
--    cash_movements.jornada_id      → jornadas        (NOT NULL, on delete CASCADE)
--
-- Es la unica dependencia ESTRUCTURAL de la cartera a la caja, y fue la
-- evidencia que revirtio la poda de los turnos: borrar jornadas cascadeaba a
-- cash_movements y dejaba los abonos SIN SU RASTRO DE CAJA, en silencio. Los
-- abonos sobrevivian; su trazabilidad no.
--
-- Se conserva `set null` y no `cascade` a proposito: si algun dia se borra un
-- movimiento de caja, el abono TIENE QUE quedar — es plata que el cliente
-- pago. Perder el vinculo es malo; perder el abono es perder dinero ajeno.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- customers
-- ------------------------------------------------------------
create table public.customers (
  id         uuid        primary key default gen_random_uuid(),
  sede_id    uuid        not null references public.sedes on delete cascade,
  name       text        not null,
  phone      text,
  document   text,
  notes      text,
  is_active  boolean     not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.customers is
  'Clientes de la sede. Soportan la venta a credito (orders.customer_id). '
  'Borrado LOGICO via is_active: un cliente con historial de cartera no se '
  'borra, se desactiva.';
comment on column public.customers.document is 'Cedula o NIT. Opcional.';

create index idx_customers_sede_id on public.customers (sede_id);

create trigger trg_customers_updated_at
  before update on public.customers
  for each row execute function public.handle_updated_at();


-- ------------------------------------------------------------
-- Columnas que la cartera agrega a `orders`.
-- La migracion `ventas` las dejo declaradas como pendientes hasta que existiera
-- `customers`. Mismo patron que la FK de user_stores en el 03.
-- ------------------------------------------------------------
alter table public.orders
  add column customer_id uuid references public.customers on delete set null;

alter table public.orders
  add column payment_status text not null default 'paid'
    check (payment_status in ('paid', 'pending', 'partial'));

comment on column public.orders.customer_id is
  'Cliente de la venta a credito. Nullable: la mayoria de las ventas no lo son.';
comment on column public.orders.payment_status is
  'paid | pending | partial. Allowlist. Default paid: una venta de mostrador se '
  'cobra en el acto; la excepcion es la venta a credito, que se marca al crearla.';

create index idx_orders_payment_status
  on public.orders (sede_id, payment_status)
  where payment_status <> 'paid';


-- ------------------------------------------------------------
-- debt_payments — abonos. APPEND-ONLY: sin update ni delete.
--
-- No lleva `updated_at` a proposito, igual que payments: un abono es un hecho,
-- no un estado. Corregir = anular y volver a registrar, dejando las dos filas.
-- ------------------------------------------------------------
create table public.debt_payments (
  id               uuid                  primary key default gen_random_uuid(),
  sede_id          uuid                  not null references public.sedes  on delete cascade,
  order_id         uuid                  not null references public.orders on delete cascade,
  amount           numeric(12, 2)        not null check (amount > 0),
  payment_method   public.payment_method not null,
  cash_movement_id uuid                  references public.cash_movements on delete set null,
  requiere_conciliacion boolean          not null default false,
  created_by       uuid                  references public.profiles on delete set null,
  created_at       timestamptz           not null default now()
);

comment on table public.debt_payments is
  'Abonos a una venta a credito. Append-only. El saldo pendiente es '
  'orders.total menos la suma de abonos: NO se guarda, se deriva — un saldo '
  'persistido es un dato que se desincroniza en silencio.';
comment on column public.debt_payments.cash_movement_id is
  'Ingreso de caja generado por el abono, si aplica. Nullable y `set null`: el '
  'abono es plata que el cliente pago y tiene que sobrevivir aunque el '
  'movimiento de caja no.';
comment on column public.debt_payments.requiere_conciliacion is
  'true = entro efectivo que NO pudo registrarse en caja porque no habia '
  'jornada abierta. Queda pendiente de conciliar a mano. '
  '🔴 POR QUE EXISTE, si ya esta cash_movement_id: porque ese null significa '
  'DOS COSAS DISTINTAS — "no correspondia movimiento" (el abono fue por '
  'transferencia o tarjeta) y "correspondia y no se pudo" (efectivo sin '
  'jornada). Solo la segunda necesita conciliacion. Un valor que significa dos '
  'cosas no es un dato: es el mismo error de clase que `reason` cumpliendo dos '
  'funciones en caja. Esta columna separa la segunda. '
  'NOT NULL con default false a proposito: si fuera nullable, el "no se" '
  'volveria a colapsar con el "no" y el filtro de pendientes mentiria POR '
  'OMISION. Lo que no se marco explicitamente como pendiente, no lo esta.';
comment on column public.debt_payments.payment_method is
  'Usa el ENUM payment_method, no una copia. Es el contrato de R1 punto 4 y '
  'este es uno de sus lados legitimos.';

create index idx_debt_payments_order on public.debt_payments (order_id);
create index idx_debt_payments_sede_created
  on public.debt_payments (sede_id, created_at desc);


-- ------------------------------------------------------------
-- register_debt_payment
--
-- 🔴 ASIMETRIA DELIBERADA CON LA COMPRA (decidido el 2026-08-31)
-- La migracion `compras` RECHAZA la compra si no hay jornada abierta. Acá NO se
-- rechaza, y la asimetria es el punto, no un descuido:
--
--   · Rechazar una SALIDA de plata protege la caja.
--   · Rechazar una ENTRADA no protege nada: el cliente ya vino a pagar, y su
--     deuda seguiria viva por un motivo administrativo.
--   · Y lo peor: si el cajero no puede registrar el abono, la salida natural es
--     recibir la plata igual y anotarla despues. Un rechazo que empuja al
--     usuario FUERA del sistema es peor que una degradacion que lo mantiene
--     adentro.
--
-- Lo que el heredado ya hacia bien y se conserva: la degradacion es DECLARADA
-- —devuelve `jornada_abierta:false` y el front avisa "el efectivo no entro a
-- caja"—, no silenciosa. Esa era la diferencia real con el caso de la compra,
-- donde no habia ningun aviso.
--
-- Lo que se AGREGA: `requiere_conciliacion`. El aviso vivia solo en un toast,
-- que se cierra y se olvida; ahora queda en el dato.
--
-- ⛔ DESCARTADO: crear el movimiento al abrir la jornada siguiente. Diferiria
--    plata a otro dia y romperia R7 — la frontera del dia en America/Bogota
--    dejaria de coincidir con cuando entro el efectivo, y el cierre del dia
--    siguiente mostraria un ingreso que no ocurrio ese dia. Cambiaria un
--    descuadre VISIBLE por uno plausible y equivocado, que es el peor negocio
--    que este proyecto conoce.
-- ------------------------------------------------------------
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
  where o.id = p_order_id and o.sede_id = v_sede_id;

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

  v_saldo := v_order_total - v_paid;

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
  v_new_saldo  := v_order_total - v_new_paid;
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

revoke execute on function public.register_debt_payment(uuid, numeric, text) from public;
revoke execute on function public.register_debt_payment(uuid, numeric, text) from anon;
grant  execute on function public.register_debt_payment(uuid, numeric, text) to authenticated;


-- RLS habilitada aca; policies en el 11 (ver la cabecera de la migracion `organizaciones_y_sedes`).
alter table public.customers     enable row level security;
alter table public.debt_payments enable row level security;

commit;
