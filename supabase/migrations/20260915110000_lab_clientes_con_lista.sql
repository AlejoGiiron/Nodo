-- ============================================================================
-- SEMILLA DEL LAB · `customers.nivel_default` — la otra mitad del escenario
--
-- 🔴 POR QUE HACE FALTA: el re-aplicado solo mueve lineas si el nivel del
--    cliente DIFIERE del que tienen. Toda linea nace en L1 (`nivelInicial`), asi
--    que con todos los clientes del lab en `nivel_default = null` el re-aplicado
--    mueve CERO y su caso no puede medir nada — la misma forma que los precios
--    ausentes, un nivel mas arriba.
--
-- ⚠️ VA EN MIGRACION APARTE Y NO EDITANDO LA ANTERIOR: `20260915100000` ya esta
--    APLICADA y R5 la congela. Editarla dejaria el archivo y la base divergiendo
--    en silencio.
--
-- ── R0 ──────────────────────────────────────────────────────────────────────
-- 1 · CLASE · siembra de laboratorio acotada por identidad, idempotente.
-- 2 · PRECEDENTE · `20260915100000`, el mismo patron, con el mismo guard.
-- 3 · MODO DE FALLO · sin el guard de organizacion esto le pondria una lista por
--     defecto a LOS CLIENTES DE LA CLIENTA — o sea cambiaria a que precio se les
--     vende. Es «toca datos ajenos» ⇒ fail-closed: org LAB primero.
-- 4 · OBJETIVO · por organizacion `LAB`, y los clientes por su sede.
--
-- ⚠️ `nivel_default = 2` y no 3: `Lab Cerveza` TIENE L2 y NO tiene L3. Con 2, el
--    re-aplicado mueve la linea a un precio REAL y el caso mide el numero del
--    anuncio. Con 3 la linea quedaria sin precio y el caso mediria otra cosa —
--    que tambien hay que probar, pero en su propio caso.
-- ============================================================================
do $$
declare
  v_org   uuid;
  v_sede  uuid;
  v_antes int;
  v_toca  int;
begin
  select id into v_org from public.organizations where name = 'LAB';
  if v_org is null then
    raise notice 'SEMILLA OMITIDA: no hay organizacion LAB en esta base.';
    return;
  end if;
  select id into v_sede from public.sedes
   where organization_id = v_org and name = 'LAB Principal';
  if v_sede is null then
    raise notice 'SEMILLA OMITIDA: LAB no tiene sede "LAB Principal".';
    return;
  end if;

  select count(*) into v_antes from public.customers
   where sede_id = v_sede and nivel_default is not null;
  raise notice 'LAB · clientes con lista ANTES: %', v_antes;

  -- A TODOS los del lab, para que el caso no dependa de CUAL elija el picker.
  update public.customers set nivel_default = 2 where sede_id = v_sede;
  get diagnostics v_toca = row_count;
  raise notice 'LAB · clientes con nivel_default = 2: % filas', v_toca;

  if v_toca = 0 then
    raise exception 'El lab no tiene clientes: el caso del re-aplicado no puede '
                    'elegir ninguno y seguiria sin medir. TODO SE DESHACE.';
  end if;
end $$;
