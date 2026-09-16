-- ============================================================================
-- DEUDA 114 · TANDA A — `profiles.sede_id` y `user_stores.sede_id` a NO ACTION
--
-- QUE HACE Y POR QUE
-- ------------------------------------------------------------------
-- De las 18 FK que apuntan a `sedes`, diecisiete son `on delete cascade` y UNA
-- no: `cash_movements.sede_id`, que quedo en NO ACTION **sin que nadie lo
-- decidiera**. Hoy esa unica FK es lo que impide borrar una sede con operacion
-- — un desempatador accidental que nadie sabe que sostiene peso.
--
-- La deuda 114 lo convierte en decision, emparejando las FK. Esta es la TANDA A
-- y toma las dos mas baratas y mas caras de perder: las que dicen QUIEN tiene
-- acceso a una sede. Hoy borrar una sede **se lleva los perfiles en cascada**;
-- despues, la base lo rechaza con 23503.
--
--   profiles.sede_id     cascade -> NO ACTION
--   user_stores.sede_id  cascade -> NO ACTION
--
-- ⚠️ LO QUE ESTA TANDA **NO** TOCA, y es lo que la hace segura: las FK que
--    entran a estas dos tablas por el otro lado siguen en cascade —
--    `profiles.id -> auth.users` y `user_stores.user_id -> profiles`—. Asi que
--    borrar la cuenta de Auth sigue arrastrando perfil y accesos, que es como
--    limpia el arnes. Medido, no supuesto: `handle_new_user` escribe SOLO
--    `profiles`, nunca `user_stores`.
--
--
-- R0 · LAS CUATRO PREGUNTAS
-- ------------------------------------------------------------------
-- 1 · CLASE
--     `validar/forzar` sobre un contrato compartido con el arnes: se le quita a
--     dos FK la accion `cascade` para que un borrado de sede FALLE en vez de
--     ARRASTRAR. No es allowlist ni fail-open: cambia que hace la base ante un
--     borrado que hoy tiene exito.
--
-- 2 · PRECEDENTE
--     · `cash_movements.sede_id` ya esta en NO ACTION, por accidente, y
--       `tests/sedes-sin-delete.spec.ts` lo mide con su 23503.
--     · CLAUDE.md, «cerrar un camino destapa a los que lo usaban» — tres
--       apariciones, y la tercera (2026-09-15) es la que importa aca: el
--       consumidor destapado **fallaba en silencio**, no rompiendose.
--     · CLAUDE.md, «una migracion idempotente no es prolijidad»: por eso el
--       bloque de abajo sale con `notice` si ya esta hecho, en vez de abortar.
--
-- 3 · MODO DE FALLO
--     Si me equivoco en un sentido, una sede deja de poder borrarse — ruidoso,
--     se ve, se arregla. Si me equivoco en el otro, una sede sigue arrastrando
--     perfiles **y nadie se entera**: es «falla callado», asi que el diseno va
--     FAIL-CLOSED. El conteo de FK por accion se hace ANTES y DESPUES dentro de
--     la misma transaccion, y si no cierra se levanta excepcion y se revierte
--     todo. No es un numero que alguien mire despues: es uno que puede tumbar
--     la transaccion.
--
-- 4 · OBJETIVO
--     Fijado POR CATALOGO, no por un nombre tecleado: el nombre de cada
--     constraint se deriva de `pg_constraint` y se exige que HOY sea `cascade`
--     antes de tocarla. Un nombre escrito a mano que no existiera abortaria; uno
--     que existiera apuntando a otra cosa se cambiaria en silencio.
--
-- ⚠️ No hay DELETE/UPDATE/DROP sobre FILAS — el unico `drop` es de constraint.
--    Los conteos de filas van igual, porque son los que dicen cuanto cuesta
--    revalidar la FK al re-crearla (aca: instantaneo).
-- ============================================================================

begin;

do $tanda_a$
declare
  v_perfiles    bigint;
  v_accesos     bigint;
  v_sedes       bigint;
  v_cascade_ini int;
  v_cascade_fin int;
  v_noaction    int;
  v_conname     text;
  v_deltype     "char";
  v_tabla       text;
  v_cambiadas   int := 0;
begin
  -- ── CONTEO DE FILAS ANTES DE TOCAR (R0) ────────────────────────────────
  select count(*) into v_perfiles from public.profiles;
  select count(*) into v_accesos  from public.user_stores;
  select count(*) into v_sedes    from public.sedes;
  raise notice 'ANTES · profiles=% · user_stores=% · sedes=%', v_perfiles, v_accesos, v_sedes;

  -- ── CONTROL CRUZADO ①: cuantas FK a `sedes` son cascade HOY ────────────
  -- Numero que ya conocemos: 17 de 18. Si no da 17, el esquema no es el que
  -- esta migracion cree estar tocando y no se toca nada.
  select count(*) into v_cascade_ini
    from pg_constraint
   where contype = 'f'
     and confrelid = 'public.sedes'::regclass
     and confdeltype = 'c';

  select count(*) into v_noaction
    from pg_constraint
   where contype = 'f'
     and confrelid = 'public.sedes'::regclass
     and confdeltype = 'a';

  raise notice 'ANTES · FK -> sedes: % cascade · % no-action', v_cascade_ini, v_noaction;

  if v_cascade_ini + v_noaction <> 18 then
    raise exception
      'ABORTA: las FK que apuntan a sedes son % (% cascade + % no-action) y esta '
      'migracion se escribio contra 18. El esquema no es el que cree estar tocando.',
      v_cascade_ini + v_noaction, v_cascade_ini, v_noaction;
  end if;

  -- ── EL CAMBIO, tabla por tabla, con el nombre DERIVADO del catalogo ─────
  foreach v_tabla in array array['profiles', 'user_stores'] loop

    select c.conname, c.confdeltype
      into v_conname, v_deltype
      from pg_constraint c
      join pg_attribute a
        on a.attrelid = c.conrelid
       and a.attnum   = c.conkey[1]
     where c.contype       = 'f'
       and c.conrelid      = ('public.' || v_tabla)::regclass
       and c.confrelid     = 'public.sedes'::regclass
       and array_length(c.conkey, 1) = 1
       and a.attname       = 'sede_id';

    if v_conname is null then
      raise exception
        'ABORTA: no existe una FK de public.%.sede_id -> public.sedes. '
        'El objetivo se fija por catalogo justamente para que esto se vea.', v_tabla;
    end if;

    -- IDEMPOTENCIA: si ya esta en NO ACTION, esto es un no-op LIMPIO. Sale con
    -- notice, no con excepcion — asi un estado desincronizado (una aplicacion a
    -- mano, un `migration repair` pendiente) se arregla solo al correr el
    -- camino normal, en vez de exigir una escritura decidida a mano.
    if v_deltype = 'a' then
      raise notice 'SALTA · %.sede_id (%) ya esta en NO ACTION', v_tabla, v_conname;
      continue;
    end if;

    if v_deltype <> 'c' then
      raise exception
        'ABORTA: %.sede_id (%) no esta en cascade ni en no-action, esta en "%". '
        'Alguien la cambio a otra cosa y esta migracion no sabe a que volver.',
        v_tabla, v_conname, v_deltype;
    end if;

    execute format('alter table public.%I drop constraint %I', v_tabla, v_conname);
    -- Sin `on delete`: el default de Postgres ES NO ACTION. Se escribe explicito
    -- en el comment de abajo para que nadie lo lea como un olvido.
    execute format(
      'alter table public.%I add constraint %I foreign key (sede_id) '
      'references public.sedes (id)', v_tabla, v_conname);

    -- El comentario va con el nombre DERIVADO, igual que el alter. Tecleado
    -- aparte abortaria la migracion entera si el nombre real difiriera — y por
    -- una razon cosmetica, que es el peor motivo posible para revertir.
    execute format(
      'comment on constraint %I on public.%I is %L',
      v_conname, v_tabla,
      case v_tabla
        when 'profiles' then
          'NO ACTION a proposito (deuda 114, tanda A, 2026-09-16). Borrar una '
          'sede con perfiles apuntandole devuelve 23503 en vez de llevarselos '
          'en cascada: quitar un perfil de una sede es una DECISION, no un '
          'efecto colateral. El camino para vaciarla es borrar la cuenta de '
          'Auth, que sigue arrastrando el perfil por profiles.id -> auth.users '
          'on delete cascade.'
        else
          'NO ACTION a proposito (deuda 114, tanda A, 2026-09-16). Mismo '
          'criterio que profiles.sede_id: retirar un acceso es una decision. '
          'user_stores.user_id -> profiles sigue en cascade, asi que borrar la '
          'cuenta limpia los accesos.'
      end);

    v_cambiadas := v_cambiadas + 1;
    raise notice 'CAMBIADA · %.sede_id (%) cascade -> NO ACTION', v_tabla, v_conname;
  end loop;

  -- ── CONTROL CRUZADO ②: el numero tiene que cerrar, o se revierte todo ───
  -- 17 cascade - 2 = 15 · 1 no-action + 2 = 3. Este conteo no es un dato que
  -- alguien lea despues: corre DENTRO de la transaccion y puede tumbarla.
  select count(*) into v_cascade_fin
    from pg_constraint
   where contype = 'f' and confrelid = 'public.sedes'::regclass and confdeltype = 'c';

  select count(*) into v_noaction
    from pg_constraint
   where contype = 'f' and confrelid = 'public.sedes'::regclass and confdeltype = 'a';

  raise notice 'DESPUES · FK -> sedes: % cascade · % no-action (cambiadas: %)',
    v_cascade_fin, v_noaction, v_cambiadas;

  if v_cascade_fin <> 15 or v_noaction <> 3 then
    raise exception
      'ABORTA: esperaba 15 cascade y 3 no-action, hay % y %. La cuenta no cierra, '
      'asi que algo se cambio de mas o de menos.', v_cascade_fin, v_noaction;
  end if;

  -- ── Y QUE LAS DOS SEAN LAS QUE SON, no dos cualesquiera ────────────────
  -- Un total correcto con los sujetos equivocados sobrevive al conteo: es la
  -- leccion del 157. Asi que se nombran.
  perform 1
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
   where c.contype = 'f'
     and c.confrelid = 'public.sedes'::regclass
     and c.confdeltype = 'a'
     and a.attname = 'sede_id'
     and c.conrelid = 'public.profiles'::regclass;
  if not found then
    raise exception 'ABORTA: profiles.sede_id no quedo en NO ACTION';
  end if;

  perform 1
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
   where c.contype = 'f'
     and c.confrelid = 'public.sedes'::regclass
     and c.confdeltype = 'a'
     and a.attname = 'sede_id'
     and c.conrelid = 'public.user_stores'::regclass;
  if not found then
    raise exception 'ABORTA: user_stores.sede_id no quedo en NO ACTION';
  end if;

  -- ── Y QUE `cash_movements` SIGA SIENDO LA TERCERA ──────────────────────
  -- No la tocamos, y el spec de la deuda 103 depende de que siga restringiendo.
  perform 1
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
   where c.contype = 'f'
     and c.confrelid = 'public.sedes'::regclass
     and c.confdeltype = 'a'
     and a.attname = 'sede_id'
     and c.conrelid = 'public.cash_movements'::regclass;
  if not found then
    raise exception
      'ABORTA: cash_movements.sede_id dejo de estar en NO ACTION. Esta migracion '
      'no la toca, asi que si cambio fue por otra via — y sedes-sin-delete.spec '
      'mide justamente eso.';
  end if;

  raise notice 'TANDA A OK · profiles y user_stores en NO ACTION, cash_movements intacta';
end
$tanda_a$;


commit;
