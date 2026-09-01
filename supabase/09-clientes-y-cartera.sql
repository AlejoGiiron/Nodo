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
-- El archivo 06 las dejo declaradas como pendientes hasta que existiera
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
comment on column public.debt_payments.payment_method is
  'Usa el ENUM payment_method, no una copia. Es el contrato de R1 punto 4 y '
  'este es uno de sus lados legitimos.';

create index idx_debt_payments_order on public.debt_payments (order_id);
create index idx_debt_payments_sede_created
  on public.debt_payments (sede_id, created_at desc);


-- ============================================================
-- ⛔ FALTA `register_debt_payment` — DECISION DE NEGOCIO ABIERTA
--
-- La compra (archivo 08) RECHAZA si no hay jornada abierta. La simetria diria
-- que el abono tambien, pero un abono es plata que ENTRA, y rechazarlo deja al
-- cliente sin poder pagar su deuda porque la caja esta cerrada. No es lo mismo
-- impedir que salga plata que impedir que entre.
--
-- ── QUE HACE HOY EL HEREDADO (enumerado, no supuesto) ─────────────────────
-- NO es fail-open silencioso, que es lo que yo esperaba encontrar:
--   · registra el abono igual;
--   · NO crea el movimiento de caja (deja cash_movement_id nulo);
--   · devuelve `shift_open: false` en el jsonb;
--   · y el frontend (useDebts) MUESTRA una advertencia explicita:
--     "Abono registrado. El efectivo no entro a caja (sin turno abierto)."
--
-- O sea: degradacion DECLARADA y visible, no silenciosa. Esa es la diferencia
-- con el caso de la compra, donde no habia ningun aviso.
--
-- La decision queda al usuario. Escrito acá para que el hueco no se pierda.
-- ============================================================


-- RLS habilitada aca; policies en el 11 (ver la cabecera del archivo 02).
alter table public.customers     enable row level security;
alter table public.debt_payments enable row level security;

commit;
