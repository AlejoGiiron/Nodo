-- ============================================================================
-- Nodo — DIAGNÓSTICO: qué hay REALMENTE aplicado en la base
--
-- Contesta las cinco preguntas en UNA sola tabla de resultados, porque el SQL
-- Editor de Studio muestra solo el resultado del último SELECT.
--
-- 🔴 Solo LEE. No crea, no borra, no modifica nada. Se puede correr siempre.
--
-- Ejecutar en: Studio → SQL Editor → pegar todo → Run.
-- ============================================================================

with
-- 1 · Migraciones aplicadas (la tabla que mantiene el CLI)
migraciones as (
  select
    '1. migraciones aplicadas'                     as pregunta,
    count(*)::text                                 as valor,
    coalesce(string_agg(version, ', ' order by version), '(ninguna)') as detalle
  from supabase_migrations.schema_migrations
),

-- 2 · Funciones del esquema public
funciones as (
  select
    '2. funciones en public'                       as pregunta,
    count(*)::text                                 as valor,
    coalesce(string_agg(p.proname, ', ' order by p.proname), '(ninguna)') as detalle
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
),

-- 2b · La que nos mordió dos veces, aislada para que no se pierda en la lista
seed_roles as (
  select
    '2b. seed_system_roles'                        as pregunta,
    case when exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'seed_system_roles'
    ) then 'EXISTE' else '🔴 NO EXISTE' end        as valor,
    'vive fuera de migrations/: el db push no la aplica' as detalle
),

-- 3 · Tablas del esquema public (sin vistas)
tablas as (
  select
    '3. tablas en public'                          as pregunta,
    count(*)::text                                 as valor,
    coalesce(string_agg(table_name, ', ' order by table_name), '(ninguna)') as detalle
  from information_schema.tables
  where table_schema = 'public' and table_type = 'BASE TABLE'
),

vistas as (
  select
    '3b. vistas en public'                         as pregunta,
    count(*)::text                                 as valor,
    coalesce(string_agg(table_name, ', ' order by table_name), '(ninguna)') as detalle
  from information_schema.views
  where table_schema = 'public'
),

-- 4 · El laboratorio
lab_org as (
  select
    '4. organizacion LAB'                          as pregunta,
    coalesce((select id::text from public.organizations where name = 'LAB'), '🔴 NO EXISTE') as valor,
    coalesce((select string_agg(name, ', ') from public.organizations), '(sin organizaciones)') as detalle
),

lab_sede as (
  select
    '4b. sede del LAB'                             as pregunta,
    coalesce((
      select s.id::text from public.sedes s
      join public.organizations o on o.id = s.organization_id
      where o.name = 'LAB'
      limit 1
    ), '🔴 NO EXISTE')                             as valor,
    '⬅️ ESTE es el sede_id que va en el user_metadata' as detalle
),

lab_roles as (
  select
    '4c. roles de la org LAB'                      as pregunta,
    count(*)::text                                 as valor,
    coalesce(string_agg(r.name, ', ' order by r.name), '(ninguno)') as detalle
  from public.roles r
  join public.organizations o on o.id = r.organization_id
  where o.name = 'LAB'
),

lab_profiles as (
  select
    '4d. perfiles en LAB'                          as pregunta,
    count(*)::text                                 as valor,
    coalesce(string_agg(p.email || ' [' || coalesce(r.name, 'SIN role_id') || ']', ', '
                        order by p.email), '(ninguno)') as detalle
  from public.profiles p
  join public.organizations o on o.id = p.organization_id
  left join public.roles r on r.id = p.role_id
  where o.name = 'LAB'
),

lab_productos as (
  select
    '4e. productos del LAB'                        as pregunta,
    count(*)::text                                 as valor,
    coalesce(string_agg(pr.name, ', ' order by pr.name), '(ninguno)') as detalle
  from public.products pr
  join public.sedes s on s.id = pr.sede_id
  join public.organizations o on o.id = s.organization_id
  where o.name = 'LAB'
),

-- 5 · Cuentas de Auth
cuentas as (
  select
    '5. cuentas de Auth'                           as pregunta,
    count(*)::text                                 as valor,
    coalesce(string_agg(email, ', ' order by email), '(ninguna)') as detalle
  from auth.users
),

cuentas_lab as (
  select
    '5b. las dos del lab'                          as pregunta,
    (select count(*)::text from auth.users
      where email in ('owner.test@nodo.test', 'cajero.test@nodo.test')) || ' de 2' as valor,
    coalesce((select string_agg(email, ', ' order by email) from auth.users
               where email in ('owner.test@nodo.test', 'cajero.test@nodo.test')),
             '🔴 NINGUNA — hay que crearlas en Studio > Authentication') as detalle
)

select * from migraciones
union all select * from funciones
union all select * from seed_roles
union all select * from tablas
union all select * from vistas
union all select * from lab_org
union all select * from lab_sede
union all select * from lab_roles
union all select * from lab_profiles
union all select * from lab_productos
union all select * from cuentas
union all select * from cuentas_lab;
