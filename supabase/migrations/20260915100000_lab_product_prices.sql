-- ============================================================================
-- SEMILLA DEL LAB · `product_prices` — el prerrequisito de los 4 rojos de la 101
--
-- 🔴 POR QUE EXISTE: el lab NO TIENE NINGUNA FILA de `product_prices` —medido
--    con control positivo: los seeds mencionan `products` y dan CERO para
--    `product_prices` en los cuatro archivos—. Con el lab asi, TODO nivel
--    resuelve al `products.price` por la rama de ETAPA 1 de `precioDeNivel`:
--    elegir L3 es un no-op REAL, ningun nivel esta vacio, y el re-aplicado mueve
--    cero lineas.
--
--    O sea que los 4 casos rojos de `listas-de-precios.spec` NO se arreglan
--    escribiendo mejor el caso: **ningun escenario construido sobre esa entrada
--    puede distinguir los dos comportamientos, porque la entrada no tiene la
--    variacion que los separa.** El limite no esta en el caso: esta en los datos.
--
-- ── LAS TRES CONDICIONES DEL ESCENARIO, Y COMO LAS CUMPLE ───────────────────
--   1 · LOS CINCO NIVELES DISTINTOS ENTRE SI, no cinco copias. Si L1 y L3
--       coinciden, elegir L3 vuelve a ser un no-op y el caso vuelve a no medir.
--   2 · AL MENOS UN PRODUCTO CON UN NIVEL SIN FILA — es el estado que necesitan
--       el chip «sin precio», el Alert y el bloqueo del cobro. `Lab Cerveza`
--       queda SIN L0 y SIN L3 a proposito.
--   3 · AL MENOS UNO CON LOS CINCO PUESTOS, para el contraste: `Lab Vaso`.
--
-- 🔴 L1 = `products.price`, SIEMPRE Y EN TODOS. No es estetica:
--    `nivelInicial(null, config)` devuelve 1, asi que toda linea NACE en L1. Si
--    L1 fuera otro numero, cambiarian los totales de los ~30 specs que hoy estan
--    en verde y este sembrado se leeria como una regresion masiva. Ademas es la
--    decision ya tomada: «el campo unico del formulario ES L1».
--
-- ── R0 ──────────────────────────────────────────────────────────────────────
-- 1 · CLASE · siembra de datos de LABORATORIO, acotada por identidad e
--     idempotente. No es un cambio de esquema.
-- 2 · PRECEDENTE · los `lab-seed-*.sql` hacen exactamente esto, y la migracion
--     de transicion de Muscle Pro establecio el patron de datos guardados por
--     identidad con no-op ruidoso donde no aplican.
-- 3 · MODO DE FALLO · si el guard de organizacion fallara, esto sembraria
--     precios EN EL TENANT DE LA CLIENTA. Es «toca datos ajenos» ⇒ fail-closed:
--     la org `LAB` se resuelve PRIMERO y si no existe no se hace nada.
-- 4 · OBJETIVO · por organizacion `LAB`; los productos, por nombre DENTRO de esa
--     sede. Ningun `where` global.
--
-- ⚠️ POR QUE VA COMO MIGRACION Y NO COMO `lab-seed-e.sql`, dicho porque es una
--    tension real y no una preferencia: los seeds del lab se corren A MANO y
--    desde esta sesion no hay forma de ejecutar SQL suelto —el CLI tiene
--    `diff · dump · push · pull · reset` y ningun `execute`—. Esta es la unica
--    via ejecutable.
-- 🔴 Y LA CONSECUENCIA QUE HAY QUE SABER: si algun dia el lab se re-siembra
--    desde cero con `lab-seed-a..d`, ESTOS PRECIOS NO VUELVEN — una migracion
--    aplicada no se re-ejecuta. El bloque de abajo es idempotente a proposito
--    para poder correrlo a mano en ese caso.
-- ============================================================================
do $$
declare
  v_org     uuid;
  v_sede    uuid;
  v_antes   int;
  v_despues int;
  v_prod    uuid;
  v_precio  numeric(12,2);
  r         record;
  -- 🔴 Los factores producen cinco numeros DISTINTOS para cualquier precio > 0.
  --    L1 es el ancla (= products.price) y los demas se separan de el.
  c_factores constant numeric[] := array[0.85, 1.00, 1.15, 1.30, 1.50];
begin
  select id into v_org from public.organizations where name = 'LAB';
  if v_org is null then
    raise notice 'SEMILLA OMITIDA: no hay organizacion LAB en esta base. '
                 'Es lo esperado fuera del entorno de laboratorio.';
    return;
  end if;
  select id into v_sede from public.sedes
   where organization_id = v_org and name = 'LAB Principal';
  if v_sede is null then
    raise notice 'SEMILLA OMITIDA: la organizacion LAB no tiene sede "LAB Principal".';
    return;
  end if;

  select count(*) into v_antes from public.product_prices where sede_id = v_sede;
  raise notice 'LAB · product_prices antes: %', v_antes;

  -- ── LOS TRES PRODUCTOS DEL LAB, por nombre y dentro de la sede ────────────
  -- `Lab Cerveza` (8.000)  : L1, L2, L4   ← SIN L0 y SIN L3, a proposito
  -- `Lab Coctel`  (18.000) : los cinco    ← el contraste
  --
  -- 🔴 `Lab Vaso` QUEDA AFUERA, Y NO ES UN OLVIDO: su precio es CERO. Es el
  --    insumo que `Lab Coctel` descuenta por receta, no se vende suelto, y
  --    `0 x cualquier factor = 0` — sus cinco niveles saldrian IDENTICOS, que es
  --    justo el escenario que no discrimina.
  -- ⚠️ Lo cazo la asercion de abajo en el primer intento: la migracion abortó y
  --    revirtió todo. El guard hizo exactamente lo que existe para hacer, y por
  --    eso el precio 0 se descubrio ANTES de sembrar y no despues, leyendo un
  --    caso verde que no medía nada.
  for r in
    select * from (values
      ('Lab Cerveza', array[1, 2, 4]),
      ('Lab Coctel',  array[0, 1, 2, 3, 4])
    ) as t(nombre, niveles)
  loop
    select id, price into v_prod, v_precio
      from public.products
     where sede_id = v_sede and name = r.nombre and is_active
     limit 1;
    if v_prod is null then
      raise notice 'LAB · "%" no existe en la sede: se saltea', r.nombre;
      continue;
    end if;
    -- 🔴 Un producto con precio 0 NO PUEDE tener cinco niveles distintos. Sembrarlo
    --    produce cinco ceros, que es un escenario que no discrimina disfrazado de
    --    escenario sembrado — el peor de los dos, porque las filas existen.
    if coalesce(v_precio, 0) = 0 then
      raise notice 'LAB · "%" tiene precio 0: NO se le siembran niveles', r.nombre;
      continue;
    end if;

    -- Idempotente: `on conflict` sobre la PK (product_id, nivel).
    -- ⚠️ `do update set precio` y NADA MAS: `product_prices` tiene
    --    `grant update (precio)` y ON CONFLICT DO UPDATE verifica privilegios en
    --    tiempo de plan. Acá corre como owner, pero se escribe igual que el
    --    camino de la aplicacion para no dejar un patron que no se puede copiar.
    insert into public.product_prices (product_id, sede_id, nivel, precio)
    select v_prod, v_sede, n,
           round(v_precio * c_factores[n + 1], 0)
      from unnest(r.niveles) as n
    on conflict (product_id, nivel) do update set precio = excluded.precio;

    raise notice 'LAB · % (base %) -> niveles %', r.nombre, v_precio, r.niveles;
  end loop;

  select count(*) into v_despues from public.product_prices where sede_id = v_sede;
  raise notice 'LAB · product_prices despues: % (+%)', v_despues, v_despues - v_antes;

  -- ── ASERCIONES · si el escenario no DISCRIMINA, esto no sirvio de nada ────
  -- 🔴 La condicion que hace util el sembrado no es «hay filas»: es que los
  --    niveles de un mismo producto sean DISTINTOS entre si. Con cinco copias
  --    del mismo numero las filas existen y los casos siguen sin medir.
  if exists (
    select 1 from public.product_prices p
     where p.sede_id = v_sede
     group by p.product_id, p.precio
    having count(*) > 1
  ) then
    raise exception 'Hay un producto con dos niveles al MISMO precio: el escenario '
                    'no discrimina y los casos volverian a no medir. TODO SE DESHACE.';
  end if;

  -- Y que siga existiendo al menos un nivel SIN fila, que es el otro estado.
  if not exists (
    select 1 from public.products pr
     where pr.sede_id = v_sede and pr.is_active
       and exists (select 1 from public.product_prices x where x.product_id = pr.id)
       and (select count(*) from public.product_prices x where x.product_id = pr.id) < 5
  ) then
    raise exception 'Todos los productos con listas tienen los cinco niveles: falta el '
                    'estado «nivel SIN precio», que es el que necesitan el chip, el '
                    'Alert y el bloqueo del cobro. TODO SE DESHACE.';
  end if;

  raise notice 'LAB · ✅ escenario que DISCRIMINA: niveles distintos entre si, y '
               'al menos un producto con un nivel sin fila.';
end $$;
