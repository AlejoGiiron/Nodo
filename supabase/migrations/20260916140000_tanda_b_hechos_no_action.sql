-- ============================================================================
-- DEUDA 114 · TANDA B — los NUEVE HECHOS a NO ACTION
--
-- QUE HACE
-- ------------------------------------------------------------------
-- Las nueve FK que apuntan a `sedes` desde tablas de HECHOS dejan de
-- `cascade` y pasan a NO ACTION. Despues de esto, borrar una sede con
-- operacion devuelve 23503 en vez de llevarse la historia del negocio.
--
--   orders · payments · stock_movements · jornadas · debt_payments
--   purchase_invoices · product_cost_adjustments · jornada_cierres_con_fecha
--   store_sequences
--
-- Queda para la TANDA C el catalogo: products, categories, extras, suppliers,
-- customers, product_components.
--
--
-- POR QUE EN UNA SOLA TRANSACCION Y NO CON `not valid` + `validate`
-- ------------------------------------------------------------------
-- `alter table ... add constraint ... foreign key` toma ACCESS EXCLUSIVE y
-- ESCANEA la tabla para validar. El patron para tablas grandes es agregarla
-- `not valid` y validarla despues — pero eso **solo sirve en transacciones
-- SEPARADAS**: dentro de una sola, el ACCESS EXCLUSIVE del `add` se sostiene
-- hasta el commit y el lock mas liviano del `validate` no compra nada.
--
-- 📋 MEDIDO el 2026-09-16, contado en el servidor:
--
--     orders                      4100      jornada_cierres_con_fecha   54
--     payments                    2320      store_sequences              4
--     stock_movements             5029      ---------------------------------
--     jornadas                    1679      SUMA                     14349
--     debt_payments                578
--     purchase_invoices            534      (la tanda A revalido 1476 y fue
--     product_cost_adjustments      51       instantanea; esto es x9.7)
--
-- Un seq scan de 5.029 filas contra una tabla de 4 es de milisegundos, asi que
-- partirlo en dos migraciones agrega un estado intermedio y un archivo mas
-- para ahorrar un lock que dura menos que la latencia de red.
--
-- ⚠️ EL DISPARADOR, porque elegir el lado barato obliga a escribirlo: **el dia
--    que cualquiera de estas tablas pase el orden del millon de filas, esto se
--    parte en `not valid` + `validate constraint` en migraciones separadas.**
--    No es «algun dia se revisa»: es un numero concreto y se mide con el mismo
--    conteo de arriba.
--
--
-- R0 · LAS CUATRO PREGUNTAS
-- ------------------------------------------------------------------
-- 1 · CLASE — `validar/forzar` sobre un contrato compartido, igual que la
--     tanda A: nueve FK dejan de ARRASTRAR y pasan a RECHAZAR.
--
-- 2 · PRECEDENTE — la tanda A (`20260916120000`), aplicada y verde; y
--     `cash_movements.sede_id`, que estaba en NO ACTION **por accidente** y es
--     lo que hizo visible la clase entera.
--
-- 3 · MODO DE FALLO — si me equivoco, una sede sigue arrastrando la historia
--     del negocio EN SILENCIO. Es «falla callado», asi que va FAIL-CLOSED: el
--     conteo por accion corre DENTRO de la transaccion, nombra las doce que
--     tienen que quedar, exige el total exacto, y **aborta revirtiendo todo**
--     si no cierra. Es un numero que decide, no uno que tranquiliza.
--
-- 4 · OBJETIVO — por CATALOGO, no por nombre tecleado: cada constraint se
--     deriva de `pg_constraint` y se exige que HOY sea `cascade`.
--
-- ⚠️ CERO FILAS TOCADAS. El unico `drop` es de constraint. Los conteos de
--    filas van igual porque son los que dimensionan la revalidacion — ver
--    arriba, medidos con su fecha.
--
--
-- LO QUE SE ENUMERO ANTES DE ESCRIBIR ESTO (y cambio lo que esperabamos)
-- ------------------------------------------------------------------
-- La hipotesis era que en la B se romperian limpiezas, porque no hay una
-- cadena equivalente a la de Auth que salvo a la tanda A — una orden no cuelga
-- de `auth.users`. **Medido: se rompen CERO**, en tres ejes:
--   · solo CINCO specs borran sedes;
--   · ninguno crea hechos de esta tanda en esas sedes — verificado por
--     `from('<tabla>')`, por `.rpc(` y por sus imports;
--   · `store_sequences` parecia el peligro (4 filas, 4 sedes) y NO la crea un
--     trigger al crear la sede: la crea `next_order_number` perezosamente al
--     numerar una venta, y TODOS sus llamadores operan sobre la sede del owner
--     o la de Muscle Pro, nunca sobre una sede desechable.
-- La unica excepcion es `sedes-sin-delete` caso ②, que crea una jornada en su
-- sede y **ya la borra explicitamente antes**.
-- ============================================================================

begin;

do $tanda_b$
declare
  -- las nueve de esta tanda
  v_objetivo text[] := array[
    'orders', 'payments', 'stock_movements', 'jornadas', 'debt_payments',
    'purchase_invoices', 'product_cost_adjustments', 'jornada_cierres_con_fecha',
    'store_sequences'
  ];
  -- las tres que ya estaban: la tanda A puso dos, y cash_movements era la
  -- accidental. Se nombran para que el guard final cubra las DOCE.
  v_previas text[] := array['profiles', 'user_stores', 'cash_movements'];
  v_esperadas text[];
  v_tabla     text;
  v_conname   text;
  v_deltype   "char";
  v_filas     bigint;
  v_total     bigint := 0;
  v_cascade   int;
  v_noaction  int;
  v_cambiadas int := 0;
  v_faltan    text[] := array[]::text[];
begin
  v_esperadas := v_objetivo || v_previas;

  -- ── CONTEO DE FILAS ANTES DE TOCAR (R0), que ademas dimensiona el lock ──
  foreach v_tabla in array v_objetivo loop
    execute format('select count(*) from public.%I', v_tabla) into v_filas;
    v_total := v_total + v_filas;
    raise notice 'ANTES · %: % filas', v_tabla, v_filas;
  end loop;
  raise notice 'ANTES · total a revalidar: % filas', v_total;

  -- ── CONTROL CRUZADO ①: el reparto de HOY tiene que ser 15/3 ────────────
  -- Es lo que dejo la tanda A. Si no da eso, el esquema no es el que esta
  -- migracion cree estar tocando y no se toca nada.
  select count(*) into v_cascade
    from pg_constraint
   where contype = 'f' and confrelid = 'public.sedes'::regclass and confdeltype = 'c';
  select count(*) into v_noaction
    from pg_constraint
   where contype = 'f' and confrelid = 'public.sedes'::regclass and confdeltype = 'a';

  raise notice 'ANTES · FK -> sedes: % cascade · % no-action', v_cascade, v_noaction;

  if v_cascade + v_noaction <> 18 then
    raise exception
      'ABORTA: las FK que apuntan a sedes son % y esta migracion se escribio '
      'contra 18.', v_cascade + v_noaction;
  end if;

  if v_noaction <> 3 then
    raise exception
      'ABORTA: esperaba 3 FK en no-action (las dos de la tanda A mas '
      'cash_movements) y hay %. O la tanda A no esta aplicada, o alguien mas '
      'movio una.', v_noaction;
  end if;

  -- ── EL CAMBIO, con el nombre DERIVADO del catalogo ─────────────────────
  foreach v_tabla in array v_objetivo loop

    select c.conname, c.confdeltype
      into v_conname, v_deltype
      from pg_constraint c
      join pg_attribute a
        on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
     where c.contype   = 'f'
       and c.conrelid  = ('public.' || v_tabla)::regclass
       and c.confrelid = 'public.sedes'::regclass
       and array_length(c.conkey, 1) = 1
       and a.attname   = 'sede_id';

    if v_conname is null then
      raise exception
        'ABORTA: no existe una FK de public.%.sede_id -> public.sedes.', v_tabla;
    end if;

    -- IDEMPOTENCIA: si ya esta, no-op limpio con notice. Asi un estado
    -- desincronizado se arregla solo al correr el camino normal.
    if v_deltype = 'a' then
      raise notice 'SALTA · %.sede_id (%) ya esta en NO ACTION', v_tabla, v_conname;
      continue;
    end if;

    if v_deltype <> 'c' then
      raise exception
        'ABORTA: %.sede_id (%) esta en "%", que no es cascade ni no-action. '
        'Alguien la puso en otra cosa y esta migracion no sabe a que volver.',
        v_tabla, v_conname, v_deltype;
    end if;

    execute format('alter table public.%I drop constraint %I', v_tabla, v_conname);
    -- Sin `on delete`: el default de Postgres ES NO ACTION.
    execute format(
      'alter table public.%I add constraint %I foreign key (sede_id) '
      'references public.sedes (id)', v_tabla, v_conname);

    execute format(
      'comment on constraint %I on public.%I is %L',
      v_conname, v_tabla,
      'NO ACTION a proposito (deuda 114, tanda B, 2026-09-16). Borrar una sede '
      'con hechos apuntandole devuelve 23503 en vez de llevarse la historia del '
      'negocio en cascada. Vaciar una sede es una DECISION que se toma hecho '
      'por hecho, no un efecto colateral de borrarla.');

    v_cambiadas := v_cambiadas + 1;
    raise notice 'CAMBIADA · %.sede_id (%) cascade -> NO ACTION', v_tabla, v_conname;
  end loop;

  -- ── CONTROL CRUZADO ②: EL TOTAL. 15-9=6 cascade · 3+9=12 no-action ─────
  select count(*) into v_cascade
    from pg_constraint
   where contype = 'f' and confrelid = 'public.sedes'::regclass and confdeltype = 'c';
  select count(*) into v_noaction
    from pg_constraint
   where contype = 'f' and confrelid = 'public.sedes'::regclass and confdeltype = 'a';

  raise notice 'DESPUES · FK -> sedes: % cascade · % no-action (cambiadas: %)',
    v_cascade, v_noaction, v_cambiadas;

  if v_cascade <> 6 or v_noaction <> 12 then
    raise exception
      'ABORTA: esperaba 6 cascade y 12 no-action, hay % y %. La cuenta no cierra, '
      'asi que algo se cambio de mas o de menos — y se revierte todo.',
      v_cascade, v_noaction;
  end if;

  -- ── CONTROL CRUZADO ③: LAS DOCE, POR NOMBRE ────────────────────────────
  -- 🔴 El total solo NO alcanza: un total correcto con los sujetos equivocados
  --    sobrevive al conteo. Es la leccion del 157 — 127+30=157 cerraba y el
  --    sujeto estaba mal. Asi que se nombran las doce, y el total de arriba
  --    garantiza ademas que no haya una decimotercera que nadie pidio.
  foreach v_tabla in array v_esperadas loop
    perform 1
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
     where c.contype     = 'f'
       and c.confrelid   = 'public.sedes'::regclass
       and c.confdeltype = 'a'
       and a.attname     = 'sede_id'
       and c.conrelid    = ('public.' || v_tabla)::regclass;
    if not found then
      v_faltan := v_faltan || v_tabla;
    end if;
  end loop;

  if array_length(v_faltan, 1) > 0 then
    raise exception
      'ABORTA: estas tablas tenian que quedar en NO ACTION y no quedaron: %. '
      'El total daba bien, asi que sin este guard habria pasado.',
      array_to_string(v_faltan, ', ');
  end if;

  raise notice 'TANDA B OK · las 12 en NO ACTION por nombre, 6 cascade para la tanda C';
end
$tanda_b$;

commit;
