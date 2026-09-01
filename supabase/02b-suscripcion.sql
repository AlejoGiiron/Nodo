-- ============================================================
-- G-Nexo — Esquema base · 02b · Estado de suscripción de la organización
--
-- ORIGEN: G-Vento `d848852`, supabase/organization-subscription.sql (clase A:
-- base técnica, viaja tal cual).
--
-- 🔴 CUARTA ENMIENDA AL PLAN DE 12, y la encontró la verificación de RPC del
--    paso 4 (docs/plan-esquema-base.md): `protect_organization_subscription`
--    estaba nombrada y no existía en ningún archivo. Es de clase A — o sea, del
--    21,7% que "viaja tal cual" — y aun así se perdió en la consolidación.
--
-- Se numera 02b por DEPENDENCIA, no al final: solo necesita `organizations` y
-- `handle_updated_at`, ambos del archivo 02. Va en archivo propio y no dentro
-- del 02 porque es un dominio distinto y así se ve al leerlo.
--
-- R5: no aplicado en G-Nexo (base vacía). Desde el primer `db push`, R5 manda.
--
-- ── POR QUE ACTIVA DESDE EL ARRANQUE ───────────────────────────────────────
-- Es la pieza que decide si una organización puede operar. Arrancar
-- desactivada y activarla después sobre organizaciones ya creadas sería una
-- reconciliación por unión: el mismo trabajo que se evitó al elegir consolidar
-- el catálogo de permisos antes de aplicar.
--
-- ── EL CONTRATO: 6 LADOS, 3 REPOS ──────────────────────────────────────────
-- R1 punto 3. Los lados DENTRO de este repo, enumerados y verificados el
-- 2026-08-31 — los cuatro que viajaron están CONSISTENTES entre sí:
--   1. el CHECK de acá                                    5 valores
--   2. supabase/functions/aplicar-estado/index.ts         ESTADOS, los mismos 5
--   3. tests/suscripcion-estado.spec.ts                   ESTADOS, los mismos 5
--   4. resolveNotice() en src/hooks/useSubscriptionStatus.ts
--      → maneja SOLO 'expiring' y 'grace'. `restricted` y `suspended` caen en
--        el default. NO es drift: está documentado en el docblock del hook y
--        hay un test que asevera la no-implementación.
--   (+ src/lib/supabase-helpers.ts lo selecciona, y database.types.ts lo tipa
--      como `string` — o sea que TS NO atrapa un valor inválido.)
--
-- 🔴 NO ES UN ENUM DE POSTGRES, es `text` con CHECK — pese a que R1 punto 3 lo
--    llama "enum". La decisión ya estaba tomada en G-Vento y por NUESTRA misma
--    razón, escrita ahí: "es una bandera COMPARTIDA ENTRE DOS REPOS — ampliar
--    un CHECK es un drop/add trivial, ampliar un enum es ALTER TYPE". No hay
--    nada que bajar a CHECK: ya lo es, y por eso sumar un estado no crea
--    divergencia de tipo con G-Centro.
--
-- ⚠️ Lo que este archivo NO trae: la tabla `_t_priv` del original. No es
--    esquema — es una SONDA de verificación (hace `set local role authenticated`
--    para probar que el trigger no necesita el privilegio del llamante). El
--    plan la listaba como si fuera parte del modelo. Andamiaje no viaja.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- Columnas
--
-- Default 'active' es FAIL-CLOSED EN LA DIRECCION QUE IMPORTA: si G-Centro no
-- responde nunca, el cliente NO se degrada solo. El riesgo de dejar operando a
-- quien no pagó es comercial y reversible; el de bloquear a quien sí pagó
-- porque un servicio externo no contestó es un cliente parado sin causa.
-- ------------------------------------------------------------
alter table public.organizations
  add column subscription_status text not null default 'active'
    check (subscription_status in
      ('active', 'expiring', 'grace', 'restricted', 'suspended'));

alter table public.organizations
  add column subscription_message text;

alter table public.organizations
  add column subscription_updated_at timestamptz;

comment on column public.organizations.subscription_status is
  'Estado de suscripcion. Lo escribe SOLO G-Centro via Edge Function con '
  'service role; protegido de escritura por cliente con '
  'trg_protect_organization_subscription. Default active: si G-Centro no '
  'responde nunca, el cliente NO se degrada. '
  '🔴 CONTRATO EN 6 LADOS Y 3 REPOS (R1 punto 3): al agregar un estado hay que '
  'tocar tambien la edge function aplicar-estado, el spec, resolveNotice y '
  'AVISAR A G-CENTRO ANTES DEL DEPLOY. No existe ningun mecanismo que garantice '
  'ese aviso.';
comment on column public.organizations.subscription_message is
  'Mensaje que se le muestra al usuario, en español. El nombre de la columna va '
  'en ingles como todo el esquema; el CONTENIDO en español es lo mismo que '
  'notes o cancel_reason.';
comment on column public.organizations.subscription_updated_at is
  'Cuando CAMBIO el estado, no cuando se llamo a la funcion: re-aplicar el '
  'mismo estado es un no-op y no toca esta columna. Eso la vuelve util para '
  'contar desde cuando corre un periodo de gracia.';


-- ------------------------------------------------------------
-- Capa 1 — trigger
--
-- A diferencia de protect_profile_self_escalation, NO se acota a la fila
-- propia: no existe ningun caso legitimo en que un usuario de la app escriba el
-- estado de suscripcion de nadie, ni del suyo.
--
-- `is distinct from` y no `<>` es OBLIGATORIO: las columnas son nullables y
-- PostgREST completa el resto de NEW desde OLD, asi que un update de {name}
-- llega con las tres columnas iguales y debe pasar. Con `<>`, un null contra
-- null da null —no true— y el guard dejaria pasar cambios reales.
-- ------------------------------------------------------------
create or replace function public.protect_organization_subscription()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Solo usuarios reales: PostgREST hace SET ROLE authenticated. El
  -- service_role de la Edge Function de G-Centro, los seeds y postgres pasan.
  if current_user = 'authenticated' then
    if new.subscription_status is distinct from old.subscription_status
       or new.subscription_message is distinct from old.subscription_message
       or new.subscription_updated_at is distinct from old.subscription_updated_at
    then
      raise exception 'El estado de suscripcion solo lo escribe G-Centro'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_protect_organization_subscription
  before update on public.organizations
  for each row execute function public.protect_organization_subscription();


-- ------------------------------------------------------------
-- Capa 2 — privilegios POR COLUMNA (allowlist)
--
-- Redundante a proposito, y la redundancia es el punto: ataja incluso el caso
-- en que alguien borre el trigger. Es la misma logica con que R0 vive en
-- CLAUDE.md ademas de en el hook — un mecanismo no puede garantizar su propia
-- existencia.
--
-- ⚠️ El `revoke` de TABLA va PRIMERO: sin el, el grant por columna no hace
--    nada, porque el privilegio de tabla ya cubre todas las columnas.
-- ------------------------------------------------------------
revoke update on public.organizations from authenticated;
grant  update (name, logo_url, config) on public.organizations to authenticated;

commit;
