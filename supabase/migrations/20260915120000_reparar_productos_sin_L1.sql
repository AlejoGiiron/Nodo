-- ============================================================================
-- DEUDA (c) · LOS PRODUCTOS QUE NACIERON SIN L1 — reparacion
--
-- 🔴 EL HUECO: `useProductMutations.saveProduct` escribe la fila L1 desde el
--    corte 1 de la deuda 101, pero ESE CODIGO NO ESTA DESPLEGADO. Asi que todo
--    producto creado desde la UI entre la carga y el deploy nace con `price` y
--    SIN NINGUNA fila de `product_prices` — cae a la rama de ETAPA 1 de
--    `precioDeNivel` y se comporta como un producto ANTERIOR a las listas.
--    Funciona, y es mentira: el producto SI es de la era de las listas.
--
-- ⚠️ EL HUECO CRECE SOLO. Al escribir esto era UNO —`SACHET ENERGY`, creado a
--    las 23:32 del 2026-09-14, ocho horas y media despues de la carga—. Cada
--    producto que ella cree hasta el deploy suma otro.
--
-- 🔴 POR ESO ESTA MIGRACION VA **DESPUES** DEL DEPLOY, NO ANTES. Aplicada antes,
--    repara el conjunto de hoy y deja sin reparar todo lo que nazca en el resto
--    de la ventana — y una migracion no se re-ejecuta. Aplicada despues, la
--    ventana ya esta cerrada y el conjunto es final.
--
-- ── SE ENUMERA POR AUSENCIA DE FILA, NO POR FECHA ──────────────────────────
-- 🔴 Y es la diferencia que decide si la reparacion es correcta: una lista por
--    FECHA se escribe hoy y se aplica manana, y entre las dos cosas el conjunto
--    cambio. Una por AUSENCIA DE FILA es cierta EN EL MOMENTO DE EJECUTARSE.
--    Es la misma forma que «un numero medido y citado tranquiliza; uno que corre
--    dentro de la transaccion decide».
--
-- ── R0 ──────────────────────────────────────────────────────────────────────
-- 1 · CLASE · reparacion de datos por PREDICADO (ausencia de fila), acotada por
--     identidad de sede. Agrega filas; no modifica ni borra ninguna.
-- 2 · PRECEDENTE · `20260915100000` (semilla del lab) y la migracion de
--     transicion: mismo patron de guard por identidad con no-op ruidoso.
-- 3 · MODO DE FALLO · sin el guard de sede, esto le inventaria un L1 a productos
--     de OTRO tenant. Es «toca datos ajenos» ⇒ fail-closed: la sede se fija por
--     UUID y si no existe no se hace nada.
-- 4 · OBJETIVO · por UUID de sede + predicado de ausencia. Ningun `where` por
--     fecha ni por nombre.
--
-- ⚠️ FILAS CONTADAS ANTES: se cuentan e imprimen adentro. Al escribir esto, 1.
--
-- ── QUE QUEDA AFUERA A PROPOSITO, Y POR QUE ─────────────────────────────────
-- Medido el 2026-09-15, por sede:
--     LAB                      30 sin filas (29 con price > 0) de 32 activos
--     Muscle Pro RETIRADA      42 sin filas de 42
--     Muscle Pro ACTIVA         1 sin fila  de 63     ← el unico que se repara
--
-- 🔴 LOS 30 DE LAB NO SE TOCAN, y no es pereza: **no nacieron en el hueco**, son
--    fixtures anteriores a la funcionalidad. Y darles L1 NO es inocuo: hoy, sin
--    ninguna fila, TODOS sus niveles resuelven al precio legado; con una fila de
--    L1, L0/L2/L3/L4 pasan a devolver NULL. Eso es lo CORRECTO, y cambia lo que
--    ven ~30 specs. Es un cambio que se mide con la suite, no que se cuela
--    dentro de una reparacion.
--
-- 🔴 LOS 42 DE LA SEDE RETIRADA TAMPOCO. La sede se retiro el 2026-09-14 y es
--    inalcanzable; escribirle filas nuevas es agregarle datos a algo que
--    decidimos sacar del camino. La historia no se reescribe.
-- ============================================================================
do $$
declare
  c_sede  constant uuid := 'd11e803c-298d-41fe-806f-ae71e84653f8';
  v_nom   text;
  v_antes int;
  v_cero  int;
  v_toca  int;
  v_queda int;
begin
  select name into v_nom from public.sedes where id = c_sede;
  if v_nom is null then
    raise notice 'REPARACION OMITIDA: la sede % no existe en esta base.', c_sede;
    return;
  end if;
  raise notice 'Sede: %', v_nom;

  select count(*) filter (where p.price > 0),
         count(*) filter (where coalesce(p.price, 0) = 0)
    into v_antes, v_cero
    from public.products p
   where p.sede_id = c_sede and p.is_active
     and not exists (select 1 from public.product_prices x where x.product_id = p.id);

  raise notice 'SIN NINGUNA FILA de product_prices: % con price > 0  ·  % con price 0', v_antes, v_cero;

  if v_antes = 0 then
    raise notice 'Nada que reparar.';
    return;
  end if;

  -- 🔴 L1 = `products.price`, que es la decision ya tomada: «el campo unico del
  --    formulario ES L1». No se inventan los otros cuatro niveles: un nivel que
  --    nadie configuro tiene que seguir devolviendo NULL, que es lo que el
  --    diseño §7.22 pide y lo que hace que el chip diga «sin precio».
  insert into public.product_prices (product_id, sede_id, nivel, precio)
  select p.id, p.sede_id, 1, p.price
    from public.products p
   where p.sede_id = c_sede and p.is_active and p.price > 0
     and not exists (select 1 from public.product_prices x where x.product_id = p.id);
  get diagnostics v_toca = row_count;
  raise notice 'L1 escrito para % producto(s)', v_toca;

  -- ── VERIFICACION ADENTRO: si no cerro, se deshace ────────────────────────
  select count(*) into v_queda
    from public.products p
   where p.sede_id = c_sede and p.is_active and p.price > 0
     and not exists (select 1 from public.product_prices x where x.product_id = p.id);
  if v_queda <> 0 then
    raise exception 'Quedan % productos con price > 0 y sin fila. TODO SE DESHACE.', v_queda;
  end if;
  if v_toca <> v_antes then
    raise exception 'Se escribieron % filas y se esperaban %. TODO SE DESHACE.', v_toca, v_antes;
  end if;

  -- ⚠️ Los de price = 0 quedan SIN L1 a proposito y se nombran: un L1 en cero
  --    no es «su precio es cero», es «nadie le puso precio», y son dos cosas
  --    distintas. Un cero se suma al total; un hueco obliga a resolverlo.
  if v_cero > 0 then
    raise notice '⚠️ % producto(s) con price 0 quedan SIN L1: un cero no es un precio, '
                 'es la ausencia de uno, y sumaria al total en silencio.', v_cero;
  end if;

  raise notice '✅ Todos los productos activos con precio tienen su L1.';
end $$;
