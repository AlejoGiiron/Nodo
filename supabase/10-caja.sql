-- ============================================================
-- G-Nexo — Esquema base · 10 · Caja: jornadas y movimientos
--
-- ORIGEN: G-Vento `d848852`:
--   · cash_shifts            ← schema.sql, seccion 3      → renombrada `jornadas`
--   · columnas de cierre     ← caja-cierre-cuadre.sql, shift-reconciliation.sql
--   · set_shift_closed_at    ← shift-closed-at-server-time.sql
--   · movement_type, cash_movements ← cash-movements.sql
--
-- R5: no aplicado en G-Nexo (base vacia). Desde el primer `db push`, R5 manda.
--
-- ── POR QUE ESTO EXISTE, CONTRA EL PLAN ORIGINAL ───────────────────────────
-- El documento de traspaso ponia los turnos en la poda. Se revirtio con
-- evidencia: cash_movements.jornada_id es not null con cascade, TRES RPC leen
-- la jornada abierta, y borrarla dejaba los abonos de cartera sin rastro de
-- caja EN SILENCIO. Un turno de bar es un cambio de mesero; aca es el CIERRE DE
-- CAJA DEL DIA. El mecanismo sirve, la palabra no: se renombra.
--
-- ── REGLA DE NEGOCIO DEL CLIENTE (2026-08-31), y es la que manda acá ───────
-- La compra SALE DE LA CAJA DEL DIA. Si el efectivo no alcanza, se registra un
-- INGRESO de caja (categoria 'base') y con eso se paga. No existe "pagada por
-- fuera": el faltante se resuelve inyectando plata, no marcando la compra.
-- Por eso la factura de compra pierde su forma de pago (deuda #27).
-- ============================================================

begin;

-- ------------------------------------------------------------
-- jornadas — ex `cash_shifts`. Apertura y cierre de caja del dia.
-- ------------------------------------------------------------
create table public.jornadas (
  id             uuid           primary key default gen_random_uuid(),
  sede_id        uuid           not null references public.sedes    on delete cascade,
  opened_by      uuid           not null references public.profiles on delete restrict,
  closed_by      uuid           references public.profiles on delete set null,
  opening_amount numeric(12, 2) not null check (opening_amount >= 0),
  closing_amount numeric(12, 2) check (closing_amount >= 0),
  expected_amount numeric(12, 2),
  difference      numeric(12, 2),
  close_reconciliation jsonb,
  close_comment        text,
  opened_at      timestamptz    not null default now(),
  closed_at      timestamptz,
  updated_at     timestamptz    not null default now(),

  constraint chk_jornada_cierre_posterior check (
    closed_at is null or closed_at > opened_at
  )
);

comment on table public.jornadas is
  'Apertura y cierre de caja de una sede. Ex cash_shifts: en G-Vento era el '
  'turno de un mesero, aca es el cierre del dia del mostrador.';
comment on column public.jornadas.expected_amount is
  'Efectivo esperado al cierre = apertura + ventas en efectivo + ingresos - egresos. '
  'Puede ser negativo (sobregiro).';
comment on column public.jornadas.difference is
  'Declarado - esperado. Negativo = faltante, positivo = sobrante.';
comment on column public.jornadas.close_reconciliation is
  'Snapshot del arqueo por metodo al cerrar. Se CONGELA al cierre porque '
  'payments no tiene jornada_id y su ventana es solo temporal: recomputar el '
  'esperado de una jornada cerrada sumaria pagos de jornadas posteriores. '
  'Es el mismo motivo por el que el costo se congela en la linea de venta.';

-- 🔴 UN SOLO indice, no dos. En G-Vento habia DOS indices unicos parciales
-- identicos sobre la misma tabla, columna y predicado, con nombres distintos:
-- idx_cash_shifts_one_open (schema.sql) e idx_one_open_shift_per_store
-- (sale-void.sql). Hallazgo H3 del inventario. Aca va uno.
create unique index idx_jornadas_una_abierta_por_sede
  on public.jornadas (sede_id) where closed_at is null;

create index idx_jornadas_sede_opened on public.jornadas (sede_id, opened_at desc);

create trigger trg_jornadas_updated_at
  before update on public.jornadas
  for each row execute function public.handle_updated_at();


-- ------------------------------------------------------------
-- set_jornada_closed_at — el reloj del cierre es el del SERVIDOR.
-- VALIDA/FUERZA: acá si fuerza, y es correcto, porque no valida un invariante
-- de negocio sino que sustituye un dato que el cliente no debe elegir. Si la
-- hora de cierre viniera del navegador, el corte del dia dependeria del reloj
-- de cada maquina — R7 en su version mas barata de evitar.
-- ------------------------------------------------------------
create or replace function public.set_jornada_closed_at()
returns trigger
language plpgsql
as $$
begin
  if new.closed_at is not null and old.closed_at is null then
    new.closed_at := now();
  end if;
  return new;
end;
$$;

create trigger trg_jornada_closed_at
  before update on public.jornadas
  for each row execute function public.set_jornada_closed_at();


-- ------------------------------------------------------------
-- movement_type — DIRECCION del movimiento, no categoria.
-- Se hereda tal cual: dos valores, ya existia, no se invento nada.
-- ------------------------------------------------------------
create type public.movement_type as enum ('in', 'out');


-- ------------------------------------------------------------
-- cash_movements
--
-- ── POR QUE `categoria` EXISTE, Y POR QUE NO ALCANZABA CON `reason` ────────
-- En G-Vento la unica clasificacion era `reason`, TEXTO LIBRE not null.
-- Enumerado el 2026-08-31, el resultado fue peor que "poco estructurado":
--
--   · Los egresos tenian allowlist (config.cash_out_reasons: 'Compra de
--     insumos', 'Pago a proveedor', 'Retiro de caja', 'Servicios', 'Otro').
--   · Los ingresos NO tenian ninguna: texto libre puro.
--   · Y los movimientos AUTOMATICOS de las RPC no usaban ese allowlist: la
--     compra escribia "Compra a proveedor Acme (factura 123)", que no es
--     ninguno de los cinco valores.
--
-- O sea que el vocabulario manual y el automatico ya estaban DIVORCIADOS, y
-- "cuanto salio por compras este mes" solo se podia responder parseando
-- strings: numero plausible y equivocado, el perfil de fallo de R7 que este
-- proyecto paga caro. El cliente pidio gastos y utilidades; sin categoria
-- estructurada esos dos modulos nacen apoyados en un parseo.
--
-- 🔴 EL ARREGLO NO ES UNIFICAR EL TEXTO: es dejar de pedirle al texto que sea
--    un dato. `categoria` es el dato; `reason` queda como DETALLE libre al
--    lado, no en su lugar. Los motivos automaticos se conservan tal cual —son
--    buen detalle— pero ahora viajan con su categoria.
--
-- ── EL CORTE ES "DE QUE PARTE DEL NEGOCIO SALIO/ENTRO LA PLATA" ────────────
-- No "que se compro". Por eso 'servicios' NO es una categoria: se fusiona en
-- 'gasto', y QUE gasto lo sabe el modulo de Gastos, que tiene su propia
-- categoria. Duplicarla aca crearia otro lado del mismo contrato (R1).
-- Y 'pago a proveedor' no existe: bajo la regla del cliente es lo mismo que
-- 'compra', y dos etiquetas para un hecho es la ambiguedad que no se hereda.
--
-- ── CHECK, NO ENUM ─────────────────────────────────────────────────────────
-- La asimetria ya se aplico dos veces en este esquema: un CHECK se amplia con
-- un `alter table` trivial, y de un enum NO se puede quitar un valor sin
-- recrear el tipo. Esta taxonomia seguro crece. `profiles.role` siendo enum ya
-- costo una advertencia sobre ALTER TYPE en produccion; no se repite el patron.
-- ------------------------------------------------------------
create table public.cash_movements (
  id         uuid                 primary key default gen_random_uuid(),
  jornada_id uuid                 not null references public.jornadas (id) on delete cascade,
  sede_id    uuid                 not null references public.sedes (id),
  type       public.movement_type not null,
  categoria  text                 not null,
  amount     integer              not null check (amount > 0),
  reason     text,
  created_by uuid                 not null references public.profiles (id),
  created_at timestamptz          not null default now(),

  -- ALLOWLIST CRUZADA: la categoria valida depende de la direccion. Lo que no
  -- esta enumerado, no entra. Una sola constraint declarativa en vez de un
  -- trigger: no depende del orden de disparo y no se puede saltear.
  constraint chk_categoria_segun_tipo check (
    (type = 'out' and categoria in ('compra', 'gasto', 'retiro', 'otro'))
    or
    (type = 'in'  and categoria in ('abono_cliente', 'base', 'otro'))
  ),

  -- FAIL-CLOSED: 'otro' es la escotilla del allowlist, y sin detalle ese
  -- bucket queda CIEGO — justo lo que la categoria vino a evitar. Mismo patron
  -- que el motivo obligatorio de adjust_stock. Declarativo, no confiado a la UI.
  constraint chk_otro_exige_detalle check (
    categoria <> 'otro' or (reason is not null and btrim(reason) <> '')
  )
);

comment on table public.cash_movements is
  'Movimientos de caja de una jornada. `categoria` es el dato para reportes; '
  '`reason` es detalle libre.';
comment on column public.cash_movements.categoria is
  'ALLOWLIST, cruzada con `type`. '
  'out: compra (la escribe register_purchase) · gasto (cajero; QUE gasto lo '
  'sabe el modulo de Gastos) · retiro (cajero) · otro (cajero, exige reason). '
  'in: abono_cliente (la escribe register_debt_payment) · base (cajero: '
  'inyeccion de efectivo para poder pagar una compra) · otro (exige reason). '
  'El corte es DE QUE PARTE DEL NEGOCIO salio o entro la plata, no que se '
  'compro. Mutuamente excluyente a proposito.';
comment on column public.cash_movements.reason is
  'Detalle libre. NO es la fuente de los reportes: para eso esta `categoria`. '
  'Las RPC lo escriben con texto util ("Compra a proveedor Acme (factura 123)", '
  '"Abono de Ana (venta #47)") y eso se conserva. Obligatorio solo cuando '
  'categoria = otro.';
comment on column public.cash_movements.amount is
  'Entero: COP no usa decimales. Siempre POSITIVO; la direccion la da `type`.';

create index idx_cash_movements_jornada on public.cash_movements (jornada_id);
create index idx_cash_movements_sede_cat
  on public.cash_movements (sede_id, categoria, created_at desc);


-- ============================================================
-- QUE PASA CON config.cash_out_reasons — enumerado antes de decidir
--
-- Consumidores al 2026-08-31: MovementsModal (el select de motivos),
-- useRestaurantConfig (el tipo), ConfigPage x2 (la pantalla que los EDITA), y
-- 2 specs (caja.spec.ts, historiales.spec.ts). La enumeracion NO vuelve vacia.
--
-- DECISION: se CONSERVA, con rol nuevo y explicito. Deja de ser "la lista de
-- categorias" —eso ahora es `categoria`, fija en el esquema— y pasa a ser la
-- lista de SUGERENCIAS de `reason` para egresos, editable por sede.
--
-- Por que no se elimina: tiene pantalla propia, tests y valor real (el cajero
-- elige de una lista en vez de tipear). Por que no puede seguir siendo la
-- categoria: si el cliente inventa categorias, los reportes entre sedes y
-- entre meses dejan de ser comparables — y ese es justo el problema que
-- `categoria` vino a cerrar.
--
-- ⏳ Queda para la poda de src/: MovementsModal tiene que mandar `categoria`
--    ademas de `reason`, y ConfigPage debe decir que edita sugerencias, no
--    categorias. Sin eso el front escribe movimientos sin categoria y la
--    constraint los RECHAZA — ruidoso, que es lo que queremos.
-- ============================================================


-- RLS habilitada aca; policies en el 11 (ver la cabecera del archivo 02).
alter table public.jornadas       enable row level security;
alter table public.cash_movements enable row level security;

commit;
