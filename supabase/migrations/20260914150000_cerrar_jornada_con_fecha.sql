-- ============================================================================
-- CIERRE DE JORNADA CON FECHA EXPLICITA — la excepcion que la deuda 97 nombro
--
-- 🔴 POR QUE EXISTE, Y POR QUE HOY. Al cerrar la deuda 97 quedo escrito:
--    *«el dia que haya que corregir un cierre REAL, el mecanismo NO es aflojar
--    este trigger: es una RPC de correccion con fecha explicita y motivo»*.
--    Ese dia es hoy: la reconstruccion del historico de Muscle Pro necesita
--    **15 jornadas, una por dia**, porque `register_purchase` exige jornada
--    abierta y solo puede haber UNA abierta por sede. Sin esto, los 15 cierres
--    quedarian estampados el mismo dia — un dato falso sobre el que se apoyan el
--    arqueo, los reportes por periodo y cualquier auditoria.
--
-- R0 — las cuatro preguntas:
--
--  1. CLASE · EXCEPCION NOMBRADA a un guard, con validacion estricta y rastro.
--     Es *«un caso de borde gana su propio camino, no se afloja el guard de
--     todos»* — el mismo intercambio que se rechazo con `handle_new_user`.
--
--  2. PRECEDENTE · `adjust_cost` y `adjust_stock`: motivo obligatorio y rastro
--     persistido. La tabla de rastro copia la forma de
--     `product_cost_adjustments`, que ya existe para exactamente esto.
--
--  3. MODO DE FALLO · si la validacion afloja, **se reabre el agujero que la 97
--     cerro**: mover un cierre a otro dia, en silencio. Por eso las tres
--     validaciones son fail-closed y la del MISMO DIA es la que sostiene todo.
--
--  4. OBJETIVO · la jornada por UUID, nunca por nombre ni por «la ultima». Y el
--     NULL de `get_my_sede_id()` se chequea PRIMERO: con un usuario desactivado
--     esa funcion devuelve NULL, `x <> NULL` da NULL, y un `if` sobre NULL **no
--     dispara** — la clase que midio la auditoria A2.
--
-- ----------------------------------------------------------------------------
-- 🔴 POR QUE «EL MISMO DIA» Y NO «CUALQUIER FECHA POSTERIOR»
--
-- La deuda 97 nombro tambien el caso de *«una jornada que quedo abierta toda la
-- noche»*. **Ese caso NO es de fecha arbitraria: es de FRONTERA DE DIA** —una
-- jornada que cierra a las 2 AM— y eso es R7, que manda calcular la frontera en
-- `America/Bogota`. Resolverlo con fecha libre seria un mecanismo ancho para un
-- problema angosto, y de paso reabriria el agujero. Cuando aparezca, se resuelve
-- con su propia forma.
--
-- ⚠️ Y la comparacion del dia va **en America/Bogota, no en UTC** (R7). Una
--    jornada abierta 20:00 hora local es 01:00 UTC del dia siguiente: comparar
--    en UTC rechazaria cierres legitimos y aceptaria los de otro dia.
--
-- ----------------------------------------------------------------------------
-- 🔴 EL PERMISO ES `caja.cerrar`, Y NO SE INVENTA NINGUNA CLAVE. Dos razones:
--
--   ① **La validacion estricta hace que esta RPC no otorgue poder nuevo.** Quien
--      tiene `caja.cerrar` ya puede cerrar la jornada hoy; lo unico que esto
--      agrega es elegir la HORA dentro de ese mismo dia. El poder peligroso
--      —mover el cierre a otro dia— lo quita la validacion, no el permiso.
--   ② **Una clave nueva no llegaria a las organizaciones YA CREADAS.** El propio
--      hook del catalogo lo dice: nacen con el catalogo que tenian, y la
--      reconciliacion es una migracion aparte que tiene que ser UNION. Muscle
--      Pro ya existe: una clave nueva dejaria a NADIE pudiendo correr esto hasta
--      esa segunda migracion.
--
-- ----------------------------------------------------------------------------
-- ⚠️ EL TRIGGER GANA UNA CONDICION, Y HAY QUE DECIRLO ASI: hoy fuerza
--    `new.closed_at := now()` en TODA transicion de cierre, asi que sin tocarlo
--    esta RPC no podria escribir su fecha. Lo que **no** cambia es lo que
--    rechaza: el `update` directo sobre una jornada ya cerrada, la reapertura y
--    el movimiento de `opened_at` siguen bloqueados exactamente igual.
--    La marca es un GUC **local a la transaccion** que solo pone esta funcion.
--    Un cliente no puede ponerlo: no hay ninguna RPC que exponga `set_config`.
-- ============================================================================

-- ── 1 · El rastro. Sin esto, una jornada cerrada con fecha ajena es
--        INDISTINGUIBLE de una cerrada normalmente — y esa indistinguibilidad
--        es justo lo que la deuda 97 existia para impedir.
create table public.jornada_cierres_con_fecha (
  id                uuid        primary key default gen_random_uuid(),
  jornada_id        uuid        not null references public.jornadas on delete cascade,
  sede_id           uuid        not null references public.sedes    on delete cascade,
  -- la fecha que se PIDIO y la que el sistema habria puesto. Guardar las dos es
  -- lo que permite responder «cuanto se corrio» sin recalcular nada.
  closed_at_pedido  timestamptz not null,
  closed_at_sistema timestamptz not null,
  motivo            text        not null check (btrim(motivo) <> ''),
  created_by        uuid        references public.profiles on delete set null,
  created_at        timestamptz not null default now()
);

comment on table public.jornada_cierres_con_fecha is
  'Rastro de cada jornada cerrada con fecha EXPLICITA en vez de la del sistema '
  '(deuda 97). Existe para que esa jornada no sea indistinguible de una cerrada '
  'normalmente: guarda quien, cuando, con que motivo, y cual era la fecha que el '
  'sistema habria puesto.';

create index jornada_cierres_por_sede on public.jornada_cierres_con_fecha (sede_id, created_at desc);

alter table public.jornada_cierres_con_fecha enable row level security;

create policy "jornada_cierres_con_fecha: ver de mi sede"
  on public.jornada_cierres_con_fecha for select to authenticated
  using (sede_id = get_my_sede_id());
-- Sin policy de escritura: lo escribe la RPC, que es SECURITY DEFINER. Mismo
-- criterio que `product_cost_adjustments`.

-- ── 2 · El trigger gana la excepcion NOMBRADA ──────────────────────────────
create or replace function public.set_jornada_closed_at()
returns trigger
language plpgsql
as $$
begin
  -- ── 1 · EL CIERRE · la fecha la pone el SERVIDOR, no el llamante ──────────
  if old.closed_at is null and new.closed_at is not null then
    -- ⚠️ LA UNICA EXCEPCION, y es nombrada: `cerrar_jornada_con_fecha` pone esta
    --    marca local a la transaccion justo antes de su update. Ninguna otra
    --    cosa la pone, y un cliente no puede: no hay RPC que exponga
    --    `set_config`. Sin la marca, el comportamiento es el de siempre.
    if coalesce(current_setting('app.cierre_con_fecha', true), '') = 'on' then
      return new;
    end if;
    new.closed_at := now();
    return new;
  end if;

  -- ── 2 · YA CERRADA · `closed_at` es inmutable ─────────────────────────────
  if old.closed_at is not null and new.closed_at is null then
    raise exception 'Una jornada cerrada no se reabre. Cerro el %, y reabrirla '
                    'moveria las ventas de dos dias al mismo turno',
                    to_char(old.closed_at at time zone 'America/Bogota', 'DD/MM/YYYY HH24:MI');
  end if;

  if old.closed_at is not null and new.closed_at is distinct from old.closed_at then
    raise exception 'La fecha de cierre de una jornada cerrada no se puede cambiar '
                    '(cerro el %). El arqueo y los reportes por periodo se apoyan en ella',
                    to_char(old.closed_at at time zone 'America/Bogota', 'DD/MM/YYYY HH24:MI');
  end if;

  -- ── 3 · `opened_at` es inmutable SIEMPRE ──────────────────────────────────
  if new.opened_at is distinct from old.opened_at then
    raise exception 'La hora de apertura de una jornada no se puede cambiar '
                    '(abrio el %). De ella depende que ventas son de este turno',
                    to_char(old.opened_at at time zone 'America/Bogota', 'DD/MM/YYYY HH24:MI');
  end if;

  return new;
end;
$$;

-- ── 3 · La RPC ─────────────────────────────────────────────────────────────
create or replace function public.cerrar_jornada_con_fecha(
  p_jornada_id uuid,
  p_closed_at  timestamptz,
  p_motivo     text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sede_id   uuid;
  v_jornada   public.jornadas%rowtype;
  v_sistema   timestamptz := now();
  v_dia_ap    date;
  v_dia_ci    date;
begin
  -- 🔴 EL NULL PRIMERO. `get_my_sede_id()` devuelve NULL con un usuario
  --    desactivado, y `x <> NULL` da NULL: el `if` no dispara y lo que sigue se
  --    ejecuta como si hubiera aceptado (auditoria A2).
  v_sede_id := get_my_sede_id();
  if v_sede_id is null then
    raise exception 'No tenes una sede activa';
  end if;

  if not has_permission('caja.cerrar') then
    raise exception 'No autorizado para cerrar la caja';
  end if;

  if p_motivo is null or btrim(p_motivo) = '' then
    raise exception 'Cerrar una jornada con fecha explicita REQUIERE un motivo. '
                    'Sin el, esta jornada seria indistinguible de una cerrada normalmente';
  end if;

  select * into v_jornada from public.jornadas where id = p_jornada_id;
  if not found then
    raise exception 'La jornada % no existe', p_jornada_id;
  end if;
  if v_jornada.sede_id <> v_sede_id then
    raise exception 'La jornada no pertenece a tu sede';
  end if;
  if v_jornada.closed_at is not null then
    raise exception 'Esa jornada ya esta cerrada (el %). Una fecha de cierre no se cambia',
                    to_char(v_jornada.closed_at at time zone 'America/Bogota', 'DD/MM/YYYY HH24:MI');
  end if;

  if p_closed_at is null then
    raise exception 'Falta la fecha de cierre';
  end if;
  if p_closed_at > v_sistema then
    raise exception 'La fecha de cierre no puede ser futura (se pidio %, ahora son las %)',
                    to_char(p_closed_at at time zone 'America/Bogota', 'DD/MM/YYYY HH24:MI'),
                    to_char(v_sistema  at time zone 'America/Bogota', 'DD/MM/YYYY HH24:MI');
  end if;
  if p_closed_at <= v_jornada.opened_at then
    raise exception 'El cierre tiene que ser POSTERIOR a la apertura (abrio el %)',
                    to_char(v_jornada.opened_at at time zone 'America/Bogota', 'DD/MM/YYYY HH24:MI');
  end if;

  -- 🔴 LA VALIDACION QUE SOSTIENE TODO, y va en America/Bogota (R7): una jornada
  --    abierta a las 20:00 locales es 01:00 UTC del dia siguiente.
  v_dia_ap := (v_jornada.opened_at at time zone 'America/Bogota')::date;
  v_dia_ci := (p_closed_at         at time zone 'America/Bogota')::date;
  if v_dia_ci <> v_dia_ap then
    raise exception 'El cierre tiene que ser del MISMO DIA que la apertura: abrio el % y '
                    'se pidio cerrar el %. Mover un cierre a otro dia es lo que esta funcion '
                    'existe para impedir',
                    to_char(v_dia_ap, 'DD/MM/YYYY'), to_char(v_dia_ci, 'DD/MM/YYYY');
  end if;

  -- El rastro va ANTES del update: si el update fallara, no queda un rastro de
  -- algo que no paso — y si el rastro fallara, no queda un cierre sin rastro.
  insert into public.jornada_cierres_con_fecha
    (jornada_id, sede_id, closed_at_pedido, closed_at_sistema, motivo, created_by)
  values
    (p_jornada_id, v_sede_id, p_closed_at, v_sistema, btrim(p_motivo), auth.uid());

  perform set_config('app.cierre_con_fecha', 'on', true);
  update public.jornadas
     set closed_at = p_closed_at,
         closed_by = auth.uid()
   where id = p_jornada_id;
  perform set_config('app.cierre_con_fecha', '', true);
end;
$$;

comment on function public.cerrar_jornada_con_fecha(uuid, timestamptz, text) is
  'Cierra una jornada con una fecha EXPLICITA del MISMO DIA de su apertura '
  '(deuda 97). Exige motivo y deja rastro en `jornada_cierres_con_fecha`. Es la '
  'unica excepcion al sello de `closed_at`, y es nombrada: el trigger sigue '
  'rechazando el update directo, la reapertura y el movimiento de `opened_at`.';

revoke execute on function public.cerrar_jornada_con_fecha(uuid, timestamptz, text) from public;
revoke execute on function public.cerrar_jornada_con_fecha(uuid, timestamptz, text) from anon;
grant  execute on function public.cerrar_jornada_con_fecha(uuid, timestamptz, text) to authenticated;
