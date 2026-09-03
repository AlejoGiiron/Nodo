-- ============================================================================
-- Nodo — Semilla del LABORATORIO · PARTE C: la FORMA de la operación de Muscle Pro
--
-- Corre DESPUÉS de `lab-seed-a.sql` y `lab-seed-b.sql`. Idempotente.
--
-- 🔴 AGREGA, NO REEMPLAZA. `Lab Coctel`, `Lab Vaso` y `Lab Cerveza` SE QUEDAN:
--    son los únicos que ejercitan producto COMPUESTO y SIN stock_tracking, y
--    ningún producto de Muscle Pro los reemplaza. Además están hardcodeados en
--    ocho specs. Son etiquetas de laboratorio, no catálogo.
--
-- ⚠️ LA FORMA, NO LAS FILAS. El catálogo es real —sale de `Control Mp.xlsx`—
--    pero los CLIENTES son inventados: sembrar los nombres reales metería datos
--    personales del cliente en una base de pruebas que comparte proyecto con la
--    de producción. Lo que se copia es la forma: uno con deuda y plazo, otro al
--    día, otro sin compras.
--
-- ── EL CATÁLOGO ES CURADO, NO IMPORTADO ─────────────────────────────────────
--    El archivo tiene 37 nombres para 29 productos: ocho pares son el mismo
--    producto escrito distinto en hojas distintas (`CLEMBUTEROL 100 TBL VENOM`
--    vs `CLEMBUTEROL VENOM`, `GALLETAOREO MUTANTES` sin el espacio, `CREATINA
--    ON` por Optimum Nutrition…). Un import por nombre habría fabricado ocho
--    duplicados. Las fusiones están en `docs/lab/preguntas-para-el-cliente.md`
--    y NINGUNA se aplica sin confirmar: cada una junta el historial de dos
--    nombres.
--    ⚠️ Y las cuatro `CREMA DE ARROZ` NO se fusionan: son sabores reales que un
--    detector automático marcó como variantes. Por eso es curado.
--
-- ── OCHO CATEGORÍAS, NO NUEVE ───────────────────────────────────────────────
--    Se decidieron nueve planas, y al aplicar la taxonomía quedaron OCHO con
--    productos: cada producto tomó su categoría específica y `Suplementación`
--    no se quedó con ninguno. No se siembra vacía — una categoría sin productos
--    es un rótulo que nadie eligió.
--    Las 14 etiquetas del archivo colapsan así: FARMACO=Farmacología,
--    PRE ENTRENO=Pre entrenos, QUEMADOR=Quemadores, SNACK=GALLETA=Snack.
--    Y no hay jerarquía del negocio: hay dos hojas escritas en momentos
--    distintos. Las ocho se usaron OPERANDO; `Suplementación` se escribió una
--    vez al armar el maestro. Son por sede, así que agrupar después es un
--    update, no una migración.
--
-- ⛔ LO QUE ESTE SEED **NO** PUEDE HACER, Y HAY QUE DECIRLO:
--    El promedio ponderado móvil (§8.1) se calcula DENTRO de `register_purchase`
--    (`compras.sql`). Un seed que inserte compras por SQL **no mueve
--    `cost_price`** — habría que escribirlo a mano, y eso es SEMBRAR LA
--    RESPUESTA, no ejercitar la decisión: lo mismo que editar la lista de un
--    tripwire para que pase.
--    Acá se siembran los DATOS del escenario (dos compras del mismo producto a
--    costos distintos con una venta en el medio) para que se pueda MIRAR.
--    La VERIFICACIÓN vive en `tests/costeo-promedio.spec.ts`, que llama la RPC.
-- ============================================================================

begin;

do $$
declare
  v_org   uuid;
  v_sede  uuid;
  v_cat   uuid;
  v_prod  uuid;
  r       record;
begin
  -- ── GUARD FAIL-CLOSED ─────────────────────────────────────────────────────
  -- 🔴 El lab COMPARTE PROYECTO DE SUPABASE con Muscle Pro (decisión del
  --    2026-09-03). Un seed que resuelva mal la sede escribe datos de prueba en
  --    el tenant real. Mismo camino que `lab-seed-b`: por nombre y abortando si
  --    no está — no se inventa un segundo mecanismo (R1).
  select id into v_org from public.organizations where name = 'LAB';
  if v_org is null then
    raise exception 'No existe la organizacion LAB. Corre lab-seed-a.sql primero.';
  end if;
  select id into v_sede from public.sedes
   where organization_id = v_org and name = 'LAB Principal';
  if v_sede is null then
    raise exception 'No existe la sede "LAB Principal" en LAB.';
  end if;

  -- ══════════════════════════════════════════════════════════════════════════
  -- § 1 · CATEGORÍAS
  -- ══════════════════════════════════════════════════════════════════════════
  for r in
    select * from (values
    ('Aminoácidos', '#14b8a6', 0),
    ('Creatina', '#6366f1', 10),
    ('Crema de arroz', '#f97316', 20),
    ('Farmacología', '#0ea5e9', 30),
    ('Pre entrenos', '#f59e0b', 40),
    ('Proteína', '#10b981', 50),
    ('Quemadores', '#ef4444', 60),
    ('Snack', '#a855f7', 70)    ) as t(nombre, color, orden)
  loop
    insert into public.categories (sede_id, name, color, sort_order)
    select v_sede, r.nombre, r.color, r.orden
    where not exists (
      select 1 from public.categories
       where sede_id = v_sede and name = r.nombre
    );
  end loop;

  -- ══════════════════════════════════════════════════════════════════════════
  -- § 2 · PRODUCTOS — precio y costo REALES del archivo del cliente
  --
  -- `sin_precio_de_venta` marca los 6 que nunca se vendieron: sólo aparecen en
  -- Compras. Se siembran con precio = costo y quedan anotados, porque un
  -- producto sin precio es un caso que el mostrador tiene que saber mostrar.
  -- ══════════════════════════════════════════════════════════════════════════
  for r in
    select * from (values
    ('EAA PROSCIENCE', 'Aminoácidos', 105000, 79000, false),
    ('GLUTAMINA IRON NUTRITION', 'Aminoácidos', 60000, 44000, false),
    ('CREATINA IRON NUTRITION', 'Creatina', 83000, 63000, false),
    ('CREATINA OPTIMUN NUTRITIO', 'Creatina', 110000, 84000, false),
    ('CREMA DE ARROZ MANI', 'Crema de arroz', 255000, 255000, true),
    ('CREMA DE ARROZ MANI XL', 'Crema de arroz', 95000, 95000, true),
    ('CREMA DE ARROZ OREO', 'Crema de arroz', 85000, 85000, true),
    ('CREMA DE ARROZ TRADICIONAL', 'Crema de arroz', 105000, 105000, true),
    ('CLEMBUTEROL 100 TBL VENOM', 'Farmacología', 115000, 75000, false),
    ('CLENBUNOM 100 TABS', 'Farmacología', 113000, 75000, false),
    ('DECANOM X AMPOLLAS', 'Farmacología', 95000, 95000, true),
    ('MASTENOM E X  AMPOLLAS', 'Farmacología', 150000, 132000, false),
    ('MASTENOM P X  AMPOLLAS', 'Farmacología', 135000, 120000, false),
    ('OXANDRONOM 100 TABS', 'Farmacología', 133000, 118000, false),
    ('TESTONOM C X AMPOLLAS', 'Farmacología', 109000, 85000, false),
    ('TESTONOM E X  AMPOLLAS', 'Farmacología', 85000, 85000, true),
    ('TESTONOM P X  AMPOLLAS', 'Farmacología', 100000, 75000, false),
    ('TRENBONOM A X  AMPOLLAS', 'Farmacología', 120000, 120000, true),
    ('INTENZE 14 SERVICIOS', 'Pre entrenos', 52500, 52500, false),
    ('INTENZE 30 SERVICIOS', 'Pre entrenos', 115000, 99000, false),
    ('BEST WHEY 2 LBS', 'Proteína', 140000, 89000, false),
    ('BIPRO 2 LBS', 'Proteína', 177000, 175000, false),
    ('BURNER', 'Quemadores', 120000, 95000, false),
    ('GALLETA ALMENDRA CHOCOLATE', 'Snack', 8300, 8300, false),
    ('GALLETA ARANDANOS CHOCOLATE', 'Snack', 8000, 8000, true),
    ('GALLETA MANI MUTANTES', 'Snack', 13000, 7300, false),
    ('GALLETA NUTELLA MUTANTES', 'Snack', 12000, 7000, false),
    ('GALLETA OREO CHOCOLATE', 'Snack', 7300, 7300, false),
    ('GALLETA OREO MUTANTES', 'Snack', 12000, 7000, false)    ) as t(nombre, categoria, precio, costo, sin_precio_de_venta)
  loop
    select id into v_cat from public.categories
     where sede_id = v_sede and name = r.categoria;

    insert into public.products
      (sede_id, category_id, name, price, cost_price, kind, stock_tracking, stock_qty)
    select v_sede, v_cat, r.nombre, r.precio, r.costo, 'simple', true, 0
    where not exists (
      select 1 from public.products where sede_id = v_sede and name = r.nombre
    );
  end loop;

  raise notice 'lab-seed-c: catalogo de Muscle Pro sembrado en LAB Principal';
end $$;

commit;
