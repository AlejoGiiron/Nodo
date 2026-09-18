-- ============================================================================
-- MUSCLE PRO · anular #113 y #134 (mal registro) y atribuir cliente a #125,
-- #127 y #128. Pedido por la clienta, confirmado por Alejandro el 2026-09-17.
--
-- ⛔ NO APLICADA. Se muestra antes de aplicar, como manda el acceso a infra.
-- ⛔ Y NO VIAJA A `develop` hasta estar aplicada: una migracion commiteada y
--    sin aplicar la empuja el proximo `db push` de cualquier tanda, sin que
--    nadie la mire. Criterio escrito el 2026-09-17.
-- ============================================================================
--
-- R0 — LAS CUATRO PREGUNTAS
--
-- 1 · CLASE — son DOS, y la segunda hay que decirla fuerte:
--     (a) POR-ID. Los cinco objetivos van fijados por UUID y con `sede_id` en
--         cada `where`. No se usa `order_number`: NO ES UNICO ENTRE SEDES y ya
--         mordio hoy — una sonda pidio 5 numeros y devolvio 10 filas, 5 de LAB
--         Principal, y el informe que iba a salir era plausible y de otro
--         tenant. El indice `idx_orders_sede_order_number` es unico sobre el
--         PAR `(sede_id, order_number)`, no sobre el numero.
--     (b) 🔴 FORZAR, NO VALIDAR. Esto SALTEA `register_sale_void`. Se escribe
--         porque se lee como una anulacion normal y no lo es.
--
-- 2 · PRECEDENTE —
--     · `scripts/anular-fantasma-update-directo.mjs`: el mismo movimiento, en
--       el mismo tenant, ya hecho una vez. Y su leccion: «limpiar residuo
--       produjo residuo» — intentar pasar por la RPC costo una jornada vacia
--       que tampoco se puede borrar. POR ESO ACA NO SE ABRE NINGUNA JORNADA.
--     · «no se quita un guard del camino normal para habilitar un caso de
--       borde»: el guard de `register_sale_void` NO SE TOCA. Se saltea una vez,
--       por migracion, con su razon escrita — no se afloja para todos.
--     · La transicion de Muscle Pro (2026-09-14): una migracion de datos fijada
--       por UUID, con sus chequeos ADENTRO de la transaccion, gano sobre pedir
--       la `service_role` key. Mismo criterio aca: no suma ninguna credencial.
--
-- 3 · MODO DE FALLO — devolver stock de mas o de menos FALLA CALLADO: no hay
--     error, queda un numero plausible en Inventario. Y correr esto dos veces
--     devolveria el stock dos veces. ⇒ fail-closed Y idempotente: cada orden
--     lleva su guard por `cancelled_at`, los conteos se verifican ADENTRO con
--     `raise exception`, el efecto de cada `update` se comprueba, y si no hay
--     nada que hacer sale con `notice` SIN excepcion — para que un `db push`
--     repetido sea un no-op limpio y no obligue a llevar la cuenta a mano.
--
-- 4 · OBJETIVO — 5 UUID literales + `sede_id` literal. Ningun nombre, ningun
--     numero de orden, ningun `like`, ninguna regex.
--
-- ----------------------------------------------------------------------------
-- 🔴 POR QUE SE SALTEA `register_sale_void`, Y POR QUE EL DAÑO QUE SU GUARD
--    PROTEGE NO SE MATERIALIZA ACA — medido, no argumentado.
--
--    Sus guards rechazan las dos y ninguno se puede satisfacer:
--      · No hay jornada abierta en la sede -> «Abri la jornada de caja antes de
--        anular una venta».
--      · Y si se abriera una hoy, el guard siguiente compara
--        `created_at < jornada_abierta.opened_at`, cierto para las dos ->
--        «Esta venta pertenece a una jornada cerrada». No hay orden de pasos
--        que lo destrabe: el guard no pregunta si la jornada DE LA VENTA esta
--        cerrada, pregunta si la venta es anterior a la jornada abierta.
--
--    La razon escrita de ese guard es: «anular una venta de una jornada ya
--    cerrada reescribiria un arqueo firmado». MEDIDO, aca no reescribe ninguno:
--      · `expected_amount` es un SNAPSHOT: se escribe al cerrar y no se
--        recalcula (por eso el arqueo se reimprime igual para siempre).
--      · Y aunque se recalculara, el arqueo cuenta SOLO EFECTIVO. Verificado
--        contra la jornada de #134: 3.852.000 + 8.500 − 4.979.100 = −1.118.600,
--        que es exactamente su `expected_amount` firmado.
--      · #113 no tiene ningun pago: es credito vivo (0 payments, 0 abonos).
--      · #134 se cobro por `transfer`, que no entra al efectivo.
--    => aporte de las dos al efectivo de su jornada: CERO.
--
-- ⚠️ LO QUE SI CAMBIA, Y NO ES EL ARQUEO: #113 SALE DE LA CARTERA.
--    Hoy la cartera son 7 filas y 1.175.500 de saldo; #113 aporta 195.000
--    (16,6%). Al anularla queda en 6 filas y 980.500. Si esa deuda fuera real,
--    esto se la perdona al cliente. Alejandro confirmo que la venta no ocurrio,
--    asi que la deuda tampoco existe — pero el efecto se escribe aca porque es
--    el unico que NO es reversible por si solo: volver a crear la venta seria
--    otro hecho, con otro numero.
--
-- ⚠️ `cancelled_by` QUEDA EN NULL, a proposito. Es nullable. En la sede hay dos
--    perfiles `admin` y NO SE CUAL ES LA CLIENTA; atribuirle a una persona una
--    anulacion que no hizo seria escribir un hecho falso. Que sea null, y que
--    el motivo lo diga, es la version honesta: esto no lo hizo nadie por el
--    producto — lo hizo esta migracion.
--
-- ⚠️ LAS 7 LINEAS SON `kind = 'simple'`, medido. La rama de receta de
--    `register_sale_void` es inalcanzable aca, y si alguna dejara de serlo esta
--    migracion ABORTA en vez de devolver mal.
-- ============================================================================

begin;

do $$
declare
  c_sede  constant uuid := 'd11e803c-298d-41fe-806f-ae71e84653f8';  -- Muscle Pro
  c_113   constant uuid := 'c628d92a-5102-4742-96b8-b6c0596f852c';
  c_134   constant uuid := '13688812-c9df-4217-ae14-9487af097b91';
  c_125   constant uuid := '9cf0342a-1009-430f-870f-1ebc74602005';
  c_127   constant uuid := '38259d33-9274-41d9-ad04-e401cde1ebad';
  c_128   constant uuid := 'a4e863ef-79d8-4b4f-8838-3b8862964660';
  -- los tres CLIENTES, por UUID. El nombre NO desambigua: hay DOS clientas que
  -- empiezan con «Karen», y «Ramirez» sin tilde no matchea ninguna.
  c_karen constant uuid := '75ec9514-ac0a-44df-a16b-42aee8225422';
  c_nat   constant uuid := 'd2b6284a-2243-4450-8acd-a65baf69180e';
  c_alexa constant uuid := '1b548e48-a3d4-4533-9498-50f90156111e';

  v_motivo constant text :=
    'Mal registro. Anulada por la migracion 20260917190000: register_sale_void '
    'la rechaza (la venta es anterior a la jornada abierta) y la venta no '
    'ocurrio. Sin efecto sobre el arqueo firmado: no aporto efectivo.';

  v_ord     uuid;
  v_n       int;
  v_items   int;
  v_pays    int;
  v_abonos  int;
  v_hechas  int := 0;
  v_atrib   int := 0;
  v_oi      record;
  v_par     record;
  v_track   boolean;
  v_kind    text;
  v_antes   int;
  v_despues int;
  v_del     int;
  v_filas   int;
  v_saldo   numeric;
begin
  -- ══════════════════════════════════════════════════════════════════════
  -- GUARDS DE ENTRADA — fail-closed, ANTES de tocar nada
  -- ══════════════════════════════════════════════════════════════════════
  foreach v_ord in array array[c_karen, c_nat, c_alexa] loop
    if not exists (select 1 from public.customers where id = v_ord and sede_id = c_sede) then
      raise exception 'El cliente % no existe en la sede %', v_ord, c_sede;
    end if;
  end loop;

  foreach v_ord in array array[c_113, c_134, c_125, c_127, c_128] loop
    if not exists (select 1 from public.orders where id = v_ord and sede_id = c_sede) then
      raise exception 'La orden % no existe o no pertenece a la sede %', v_ord, c_sede;
    end if;
  end loop;

  -- ══════════════════════════════════════════════════════════════════════
  -- PARTE 1 — ANULAR #113 y #134, replicando el efecto de register_sale_void
  -- ══════════════════════════════════════════════════════════════════════
  foreach v_ord in array array[c_113, c_134] loop
    select order_number into v_n from public.orders where id = v_ord;

    -- IDEMPOTENCIA: si ya esta anulada no se toca, y sale con notice — NO con
    -- excepcion — para que un push repetido sea un no-op limpio.
    if exists (select 1 from public.orders where id = v_ord and cancelled_at is not null) then
      raise notice 'Orden #% (%) ya estaba anulada. No se toca.', v_n, v_ord;
      continue;
    end if;

    -- EL GUARD QUE RECHAZABA A LA #112, RE-VERIFICADO ACA Y AHORA: si alguna
    -- gano un abono entre la medicion y el push, esto ABORTA. Un abono sobre
    -- una venta anulada quedaria colgando sin dueño — `register_sale_void`
    -- tampoco toca `debt_payments`, asi que replicarlo no lo resolveria.
    select count(*) into v_abonos from public.debt_payments where order_id = v_ord;
    if v_abonos > 0 then
      raise exception 'La orden #% tiene % abono(s): NO se anula por esta via. Es el '
        'mismo guard que aplica register_sale_void y su razon sigue valiendo.', v_n, v_abonos;
    end if;

    -- CONTEOS ANTES DE TOCAR (R0), contra lo medido el 2026-09-17.
    select count(*) into v_items from public.order_items where order_id = v_ord;
    select count(*) into v_pays  from public.payments    where order_id = v_ord;

    if v_n = 113 and (v_items <> 3 or v_pays <> 0) then
      raise exception 'La orden #113 cambio desde la medicion: order_items=% (esperado 3), '
        'payments=% (esperado 0). Se aborta.', v_items, v_pays;
    end if;
    if v_n = 134 and (v_items <> 4 or v_pays <> 1) then
      raise exception 'La orden #134 cambio desde la medicion: order_items=% (esperado 4), '
        'payments=% (esperado 1). Se aborta.', v_items, v_pays;
    end if;

    raise notice '--- #% (%) · order_items=% payments=% abonos=%',
      v_n, v_ord, v_items, v_pays, v_abonos;

    -- ── reverso de stock, espejo del alta ──────────────────────────────
    for v_oi in
      select oi.product_id, oi.qty from public.order_items oi where oi.order_id = v_ord
    loop
      select p.kind, p.stock_tracking, coalesce(p.stock_qty, 0)
        into v_kind, v_track, v_antes
        from public.products p where p.id = v_oi.product_id;

      if not found then
        raise exception 'El producto % de la orden #% no existe', v_oi.product_id, v_n;
      end if;

      if v_kind <> 'simple' then
        raise exception 'El producto % de la orden #% es kind=%, no simple. El reverso '
          'por receta NO esta contemplado aca: se aborta en vez de devolver mal.',
          v_oi.product_id, v_n, v_kind;
      end if;

      if v_track and v_oi.qty > 0 then
        update public.products
           set stock_qty = coalesce(stock_qty, 0) + v_oi.qty
         where id = v_oi.product_id
        returning coalesce(stock_qty, 0) into v_despues;

        -- el EFECTO se verifica, no se supone
        if v_despues is distinct from v_antes + v_oi.qty then
          raise exception 'El stock de % no quedo como corresponde: % -> % (esperado %)',
            v_oi.product_id, v_antes, v_despues, v_antes + v_oi.qty;
        end if;

        insert into public.stock_movements (sede_id, product_id, type, qty, reference_id, notes)
        values (c_sede, v_oi.product_id, 'return', v_oi.qty, v_ord,
                'Reverso por anulacion de la venta #' || v_n || ' (migracion 20260917190000)');

        raise notice '    stock % : % -> % (+%)', v_oi.product_id, v_antes, v_despues, v_oi.qty;
      else
        raise notice '    stock % : sin cambio (tracking=%)', v_oi.product_id, v_track;
      end if;
    end loop;

    -- ── los pagos se BORRAN, igual que register_sale_void: la venta anulada
    --    no cobro nada, y `payments` no tiene update por diseño.
    delete from public.payments where order_id = v_ord;
    get diagnostics v_del = row_count;
    if v_del <> v_pays then
      raise exception 'Se esperaba borrar % pago(s) de #% y se borraron %', v_pays, v_n, v_del;
    end if;

    update public.orders
       set cancelled_at  = now(),
           cancelled_by  = null,
           cancel_reason = v_motivo,
           status        = 'cancelled'
     where id = v_ord and sede_id = c_sede;
    get diagnostics v_del = row_count;
    if v_del <> 1 then
      raise exception 'La anulacion de #% escribio % filas (esperado 1)', v_n, v_del;
    end if;

    v_hechas := v_hechas + 1;
    raise notice '    #% ANULADA', v_n;
  end loop;

  -- ══════════════════════════════════════════════════════════════════════
  -- PARTE 2 — ATRIBUIR CLIENTE a #128, #127 y #125
  --
  -- Se escriben LAS DOS columnas. `customer_name` no es redundante: la FK
  -- `orders.customer_id` es ON DELETE SET NULL, asi que el nombre es lo que
  -- sobrevive si el cliente se borra — el propio repo lo dice en
  -- `supabase-helpers.ts`: «conservamos el customer_name».
  --
  -- Las tres estan `paid`, asi que NO entran a Cartera: es atribucion pura, y
  -- es reversible (volver a poner NULL en las dos columnas).
  -- ══════════════════════════════════════════════════════════════════════
  for v_par in
    select * from (values (c_128, c_karen), (c_127, c_nat), (c_125, c_alexa))
      as t(orden, cliente)
  loop
    select order_number into v_n from public.orders where id = v_par.orden;

    -- IDEMPOTENCIA + guard: si ya tiene cliente NO se pisa. Pisar un
    -- `customer_id` puesto seria reescribir una atribucion que hizo otro.
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

    v_atrib := v_atrib + 1;
    raise notice '    #% -> cliente %', v_n, v_par.cliente;
  end loop;

  -- ══════════════════════════════════════════════════════════════════════
  -- ASERCIONES FINALES — adentro de la transaccion, asi que ABORTAN.
  -- Un numero medido y citado tranquiliza; uno que puede tumbar la
  -- transaccion decide.
  -- ══════════════════════════════════════════════════════════════════════
  if (select count(*) from public.orders
       where id in (c_113, c_134) and sede_id = c_sede and cancelled_at is not null) <> 2 then
    raise exception 'Al cerrar, las dos ordenes tendrian que estar anuladas y no lo estan';
  end if;

  if (select count(*) from public.payments where order_id in (c_113, c_134)) <> 0 then
    raise exception 'Quedaron pagos colgando de una venta anulada';
  end if;

  if (select count(*) from public.orders
       where id in (c_125, c_127, c_128) and sede_id = c_sede
         and customer_id is not null and customer_name is not null) <> 3 then
    raise exception 'Las tres ordenes tendrian que tener cliente Y nombre, y no los tienen';
  end if;

  -- CARTERA con la consulta DEL PRODUCTO y SIN filtros propios: un verificador
  -- que filtra por id verifica el conjunto que eligio, no el que ella ve.
  select count(*),
         coalesce(sum(o.total), 0) - coalesce((
           select sum(d.amount)
             from public.debt_payments d
             join public.orders o2 on o2.id = d.order_id
            where o2.sede_id = c_sede
              and o2.payment_status in ('pending', 'partial')
              and o2.cancelled_at is null), 0)
    into v_filas, v_saldo
    from public.orders o
   where o.sede_id = c_sede
     and o.payment_status in ('pending', 'partial')
     and o.cancelled_at is null;

  raise notice ' ';
  raise notice 'RESUMEN: % anulada(s) · % atribuida(s)', v_hechas, v_atrib;
  raise notice 'CARTERA despues (consulta del producto): % fila(s) · saldo %', v_filas, v_saldo;
  raise notice 'Esperado si corre limpio: 6 fila(s) y 980.500 (hoy 7 y 1.175.500).';
end $$;

commit;
