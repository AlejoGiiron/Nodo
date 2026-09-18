-- ============================================================================
-- MUSCLE PRO · atribuir cliente a #122 y #123.
-- Pedido por la clienta, pasado por Alejandro el 2026-09-17.
--
-- ⛔ NO APLICADA al escribirse. Se muestra antes de aplicar.
-- ⛔ Y NO VIAJA A `develop` hasta estar aplicada: una migracion commiteada y
--    sin aplicar la empuja el proximo `db push` de cualquier tanda.
-- ============================================================================
--
-- R0 — LAS CUATRO PREGUNTAS
--
-- 1 · CLASE — POR-ID, y nada mas. A diferencia de la 20260917190000, aca NO
--     hay nada forzado: `orders` tiene policy de UPDATE para `authenticated`
--     (`sede_id = get_my_sede_id() and has_permission('pos.vender')`) y NO
--     tiene allowlist de columnas, a diferencia de `products`. O sea que esto
--     esta dentro de lo que el producto ya autoriza; va por migracion solo
--     porque NO HAY CAMINO EN LA UI: los unicos update a `orders` en `src/`
--     son `status` y `order_number`.
--
-- 2 · PRECEDENTE — `20260917190000`, de hoy, misma forma y misma sede. De ahi
--     viene lo que no se repite: se fija por UUID porque `order_number` NO es
--     unico entre sedes (medido hoy: #122 y #123 dan 4 filas en el proyecto y
--     2 en esta sede), y el cliente se fija por UUID porque el nombre no
--     desambigua -- "Coach" matchea DOS clientas, y solo una matchea tambien
--     "Javier".
--
-- 3 · MODO DE FALLO — pisar un `customer_id` ya puesto reescribiria una
--     atribucion que hizo otro, y falla CALLADO: la venta queda con el cliente
--     equivocado y nada lo dice. ⇒ guard por `customer_id is null`, e
--     idempotente: si ya tiene cliente sale con notice y SIN excepcion, para
--     que un `db push` repetido sea un no-op limpio.
--
-- 4 · OBJETIVO — 2 UUID de orden + 2 UUID de cliente + `sede_id` literal en
--     cada `where`. Ningun nombre, ningun numero de orden, ningun `like`.
--
-- ----------------------------------------------------------------------------
-- 📋 LO MEDIDO ANTES DE ESCRIBIR (2026-09-17), y por que no hay mas que hacer:
--
--   #122  a4b0411d-…  total 200.000  payment_status=paid  transfer  customer NULL
--   #123  8e363068-…  total  70.000  payment_status=paid  transfer  customer NULL
--
--   Las dos estan `paid`, asi que NO entran a Cartera (la pantalla filtra
--   payment_status in ('pending','partial')). Es ATRIBUCION PURA: no mueve
--   plata, no mueve stock, no toca el arqueo, y es reversible poniendo las dos
--   columnas en NULL de nuevo.
--
--   Clientes, con patron ORDENADO y su control negativo:
--     David Villate -> 77e6e19d-…   ilike '%David%Villate%'  = 1 fila
--     Javier Coach  -> 0d2484d8-…   ilike '%Javier%Coach%'   = 1 fila
--     control negativo: '%Coach%Javier%' = 0 filas, o sea que el patron
--     discrimina y no matchea cualquier cosa.
--
-- ⚠️ Se escriben LAS DOS columnas. `customer_name` no es redundante: la FK
--    `orders.customer_id` es ON DELETE SET NULL, asi que el nombre es lo que
--    sobrevive si el cliente se borra -- el repo lo dice en
--    `supabase-helpers.ts`: «conservamos el customer_name».
-- ============================================================================

begin;

do $$
declare
  c_sede    constant uuid := 'd11e803c-298d-41fe-806f-ae71e84653f8';  -- Muscle Pro
  c_122     constant uuid := 'a4b0411d-55bb-48e5-8c4f-b5766b760d86';
  c_123     constant uuid := '8e363068-1997-4ef0-a7c6-911a78994189';
  c_javier  constant uuid := '0d2484d8-9715-442a-ba79-66be0ec256b0';  -- #122
  c_david   constant uuid := '77e6e19d-6056-412d-a726-d5b1f8b211d7';  -- #123

  v_id    uuid;
  v_n     int;
  v_del   int;
  v_par   record;
  v_hecho int := 0;
begin
  -- ── GUARDS DE ENTRADA, fail-closed, antes de tocar nada ────────────────
  foreach v_id in array array[c_javier, c_david] loop
    if not exists (select 1 from public.customers
                    where id = v_id and sede_id = c_sede and is_active) then
      raise exception 'El cliente % no existe, no es de la sede %, o esta inactivo', v_id, c_sede;
    end if;
  end loop;

  foreach v_id in array array[c_122, c_123] loop
    if not exists (select 1 from public.orders where id = v_id and sede_id = c_sede) then
      raise exception 'La orden % no existe o no pertenece a la sede %', v_id, c_sede;
    end if;
    -- una venta anulada no se atribuye: seria ponerle dueño a algo que no ocurrio
    if exists (select 1 from public.orders where id = v_id and cancelled_at is not null) then
      raise exception 'La orden % esta ANULADA: no se le asigna cliente', v_id;
    end if;
  end loop;

  -- ── LA ATRIBUCION ──────────────────────────────────────────────────────
  for v_par in
    select * from (values (c_122, c_javier), (c_123, c_david)) as t(orden, cliente)
  loop
    select order_number into v_n from public.orders where id = v_par.orden;

    -- IDEMPOTENCIA + guard: si ya tiene cliente NO se pisa.
    if exists (select 1 from public.orders
                where id = v_par.orden and customer_id is not null) then
      raise notice 'Orden #% ya tiene cliente asignado. No se toca.', v_n;
      continue;
    end if;

    update public.orders o
       set customer_id   = c.id,
           customer_name = c.name
      from public.customers c
     where o.id = v_par.orden
       and o.sede_id = c_sede
       and c.id = v_par.cliente
       and c.sede_id = c_sede;

    get diagnostics v_del = row_count;
    if v_del <> 1 then
      raise exception 'La atribucion de #% escribio % filas (esperado 1)', v_n, v_del;
    end if;

    v_hecho := v_hecho + 1;
    raise notice '   #% -> cliente %', v_n, v_par.cliente;
  end loop;

  -- ── ASERCIONES FINALES, adentro de la transaccion: ABORTAN ─────────────
  -- Un numero medido y citado tranquiliza; uno que puede tumbar la
  -- transaccion decide.
  if (select count(*) from public.orders
       where id in (c_122, c_123) and sede_id = c_sede
         and customer_id is not null and customer_name is not null) <> 2 then
    raise exception 'Las dos ordenes tendrian que tener cliente Y nombre, y no los tienen';
  end if;

  -- y que cada una tenga EL cliente que le corresponde, no "un" cliente
  if not exists (select 1 from public.orders
                  where id = c_122 and sede_id = c_sede and customer_id = c_javier) then
    raise exception '#122 no quedo con el cliente esperado';
  end if;
  if not exists (select 1 from public.orders
                  where id = c_123 and sede_id = c_sede and customer_id = c_david) then
    raise exception '#123 no quedo con el cliente esperado';
  end if;

  -- CARTERA no se movio: las dos estan `paid`, asi que no entran.
  if exists (select 1 from public.orders
              where id in (c_122, c_123)
                and payment_status in ('pending', 'partial') and cancelled_at is null) then
    raise exception 'Alguna de las dos entro a Cartera: se esperaba atribucion pura';
  end if;

  raise notice 'RESUMEN: % atribuida(s)', v_hecho;
end $$;

commit;
