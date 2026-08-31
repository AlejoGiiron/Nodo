-- ============================================================
-- G-Nexo — Esquema base · 02 · Organizaciones, sedes y roles
--
-- ORIGEN: consolidado de G-Vento `d848852`:
--   · public.restaurants      ← supabase/schema.sql, seccion 3
--   · organizations/roles/user_stores ← supabase/multi-tenant-rbac.sql
--   · handle_updated_at       ← supabase/schema.sql, seccion 6
-- Ver docs/plan-esquema-base.md y docs/paso-0-funciones-duplicadas.md.
--
-- R5: no aplicado en G-Nexo (base vacia). Desde el primer `db push`, R5 manda.
--
-- ── EL RENOMBRE: restaurants -> sedes ───────────────────────────────────────
-- Decidido en R1 punto 7. En G-Vento "restaurant" es CIERTO; aca seria FALSO, y
-- un nombre falso dirige mal. No inventa vocabulario: el repo heredado YA dice
-- "sede" —el permiso `sedes.gestionar` existe, R6 habla de "la organizacion de
-- una sede", y el propio comentario de organizations en G-Vento dice "agrupa
-- las sedes (restaurants)"—. Este archivo alinea la tabla con la palabra que el
-- proyecto ya usa.
--
-- ⚠️ src/ sigue diciendo restaurant_id (1.017 ocurrencias al 2026-08-31). El
--    arbol queda inconsistente hasta la pasada de renombre (deudas #3 y #21),
--    que ahora tiene un criterio de exito limpio: el conteo en src/ llega a
--    CERO. Nada esta aplicado, asi que no hay ruptura en runtime.
--
-- ⚠️ `user_stores` conserva su nombre en ingles a proposito: cambiarlo aca
--    seria divergir del plan sin haberlo decidido. Queda anotado como
--    candidato para la pasada de renombre, no resuelto de contrabando.
--
-- ── RLS SE HABILITA ACA, LAS POLICIES VAN EN EL 11 ──────────────────────────
-- Una tabla con RLS habilitada y sin policies NIEGA TODO. Por eso el orden es
-- este y no el inverso: la ventana entre el archivo 02 y el 11 es fail-closed.
-- Crear la tabla sin RLS y "agregarla despues" seria fail-open, que es el modo
-- de fallo que R2 prohibe: lo que nadie se acordo de cubrir, pasa.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- Funcion compartida de updated_at
-- Vive aca porque es el primer archivo que la necesita. NO es SECURITY
-- DEFINER: solo escribe un campo de la fila que ya se esta escribiendo.
-- ------------------------------------------------------------
create or replace function public.handle_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;


-- ------------------------------------------------------------
-- organizations — tenant raiz
-- ------------------------------------------------------------
create table public.organizations (
  id         uuid        primary key default gen_random_uuid(),
  name       text        not null,
  logo_url   text,
  config     jsonb       not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.organizations is
  'Tenant raiz del sistema. Agrupa las sedes de un mismo negocio.';

create trigger trg_organizations_updated_at
  before update on public.organizations
  for each row execute function public.handle_updated_at();


-- ------------------------------------------------------------
-- sedes — ex `restaurants`
--
-- organization_id es NOT NULL DESDE EL ARRANQUE. En G-Vento nacio nullable y
-- se endurecia al final del seed, porque alla habia datos vivos que migrar.
-- Aca no hay datos: la ventana en que una sede podia existir sin organizacion
-- no tiene ninguna razon de existir, y esa ventana es justamente por donde se
-- cuelan los datos sin tenant.
-- ------------------------------------------------------------
create table public.sedes (
  id              uuid        primary key default gen_random_uuid(),
  organization_id uuid        not null references public.organizations on delete cascade,
  name            text        not null,
  address         text,
  phone           text,
  logo_url        text,
  config          jsonb       not null default '{}',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.sedes is
  'Un registro por local/punto de venta. Pertenece siempre a una organizacion.';
comment on column public.sedes.organization_id is
  'Obligatorio. Es el eje de aislamiento multi-tenant: sin el, las filas '
  'colgadas de esta sede quedan fuera de todo filtro por organizacion.';

create index idx_sedes_organization_id on public.sedes (organization_id);

create trigger trg_sedes_updated_at
  before update on public.sedes
  for each row execute function public.handle_updated_at();

-- NO se crea `uses_kitchen`. Enumeracion previa (regla de poda: no se borra
-- salvo que se demuestre que no sostiene nada): la referencian AppLayout,
-- ProductModal, ConfigPage, TablesPage y database.types.ts en src/, mas SQL de
-- clase B/D. La enumeracion NO vuelve vacia — pero todos esos consumidores
-- estan ellos mismos dentro de la poda de cocina. Se deja escrito para que la
-- proxima sesion no tenga que rehacer el grep.


-- ------------------------------------------------------------
-- roles — RBAC
--
-- 🔴 La columna `permissions` se puebla SOLO via seed_system_roles(), que se
--    GENERA desde src/lib/permissions.ts con `pnpm gen:rbac`. Ningun archivo
--    del esquema base escribe una lista de permisos a mano: eso es lo que dejo
--    las 4 copias de G-Vento con 16/20/18/23 permisos segun el archivo, y lo
--    que el `update roles set permissions` de sale-void.sql hacia (hallazgo H4
--    del plan; no viaja).
-- ------------------------------------------------------------
create table public.roles (
  id              uuid        primary key default gen_random_uuid(),
  organization_id uuid        not null references public.organizations on delete cascade,
  name            text        not null,
  is_system       boolean     not null default false,
  permissions     jsonb       not null default '[]',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, name)
);

comment on table public.roles is
  'Rol RBAC. permissions es un array jsonb de claves del catalogo. Se siembra '
  'con seed_system_roles(), generado desde src/lib/permissions.ts. No editar a mano.';
comment on column public.roles.is_system is
  'true = rol de sistema sembrado; no deberia borrarse.';

create trigger trg_roles_updated_at
  before update on public.roles
  for each row execute function public.handle_updated_at();


-- ------------------------------------------------------------
-- user_stores — sedes a las que un usuario tiene acceso
--
-- La FK a profiles se agrega en el archivo 03, cuando esa tabla exista: aca
-- solo se declara la columna. Se hace asi para no invertir el orden de los
-- archivos por una sola dependencia.
-- ------------------------------------------------------------
create table public.user_stores (
  user_id    uuid        not null,
  sede_id    uuid        not null references public.sedes on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, sede_id)
);

comment on table public.user_stores is
  'Sedes a las que un usuario tiene acceso. profiles.sede_id es la sede ACTIVA. '
  'La FK de user_id -> profiles se agrega en 03-perfiles-y-auth.sql.';


-- ------------------------------------------------------------
-- RLS: habilitada aca, policies en el 11. Ver la cabecera.
-- ------------------------------------------------------------
alter table public.organizations enable row level security;
alter table public.sedes         enable row level security;
alter table public.roles         enable row level security;
alter table public.user_stores   enable row level security;

commit;
