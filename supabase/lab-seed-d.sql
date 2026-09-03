-- ============================================================================
-- Nodo — Semilla del LABORATORIO · PARTE D: los casos que solo aparecen con
-- datos reales.
--
-- Corre DESPUES de `lab-seed-c.sql`. Idempotente por `invoice_number` y por el
-- numero de orden.
--
-- 🔴 QUE SIEMBRA, Y POR QUE CADA UNO. No son datos de relleno: son los tres
--    escenarios que el archivo del cliente tiene y el lab no tenia, y sin los
--    cuales tres decisiones del producto no se pueden ni MIRAR.
--
--    1. COMPRA FECHADA ANTES DE SU REGISTRO — `document_date` < `created_at`.
--       Es literalmente lo que el cliente hace: la factura es del lunes y se
--       teclea el miercoles. La deuda 44 separo las dos fechas justamente por
--       esto, y hasta hoy el lab no tenia una sola fila donde difirieran.
--
--    2. DOS PRECIOS EL MISMO DIA, A CLIENTES DISTINTOS, CON EL COSTO IDENTICO.
--       Medido en `Control Mp.xlsx`: CREATINA OPTIMUN a 110.000 y 118.000 el
--       mismo dia. Un cambio de lista NO produce eso — es negociacion por
--       venta, y valida la deuda 75 con datos reales.
--
--    3. UNA VENTA A COSTO, con utilidad CERO. Tambien real: el archivo tiene
--       tres. Utilidades tiene que saber mostrar margen cero sin que parezca un
--       defecto. ⛔ Y queda ABIERTA la pregunta de si el cliente vende a costo a
--       proposito o cargo mal el costo — no se asume ninguna de las dos.
--
-- ⛔ LO QUE ESTE SEED NO SIEMBRA, y esta dicho para que nadie lo busque:
--    · GASTOS. `cash_movements.jornada_id` es `not null` porque un gasto sale
--      del cajon del dia. Un seed que abra y cierre una jornada para insertarlo
--      estaria FABRICANDO UN HECHO QUE NO OCURRIO. Los gastos los ejercita un
--      spec, que abre la jornada de verdad.
--    · EL COSTO PROMEDIO. Se calcula dentro de `register_purchase`; escribir
--      `cost_price` a mano seria sembrar la respuesta. Lo verifica
--      `tests/costeo-promedio.spec.ts`.
--    La regla que sale de las dos: SE SIEMBRA LO QUE SE PUEDE MIRAR; LO QUE
--    EXIGE UN FLUJO, LO EJERCITA UN SPEC.
-- ============================================================================

begin;

do $$
declare
  v_org      uuid;
  v_sede     uuid;
  v_perfil   uuid;
  v_prov     uuid;
  v_prod     uuid;
  v_fact     uuid;
  v_orden    uuid;
  v_galleta  uuid;
begin
  -- GUARD FAIL-CLOSED: el lab comparte proyecto de Supabase con Muscle Pro.
  select id into v_org from public.organizations where name = 'LAB';
  if v_org is null then
    raise exception 'No existe la organizacion LAB.';
  end if;
  select id into v_sede from public.sedes
   where organization_id = v_org and name = 'LAB Principal';
  if v_sede is null then
    raise exception 'No existe la sede "LAB Principal" en LAB.';
  end if;
  select id into v_perfil from public.profiles
   where sede_id = v_sede order by created_at limit 1;
  if v_perfil is null then
    raise exception 'La sede no tiene perfiles. Corre lab-seed-b.sql primero.';
  end if;

  -- ── 1 · COMPRA FECHADA ANTES DE SU REGISTRO ────────────────────────────
  insert into public.suppliers (sede_id, name)
  select v_sede, 'MP Venom'
  where not exists (select 1 from public.suppliers where sede_id=v_sede and name='MP Venom');
  select id into v_prov from public.suppliers where sede_id=v_sede and name='MP Venom';

  select id into v_prod from public.products
   where sede_id=v_sede and name='CLEMBUTEROL 100 TBL VENOM';

  if v_prod is not null and not exists (
    select 1 from public.purchase_invoices
     where sede_id=v_sede and invoice_number='MP-FACT-ATRASADA') then
    insert into public.purchase_invoices
      (sede_id, supplier_id, invoice_number, total, created_by, document_date, notes)
    values
      (v_sede, v_prov, 'MP-FACT-ATRASADA', 150000, v_perfil,
       (now() - interval '9 days')::date,
       'La factura es de hace 9 dias y se teclea hoy: document_date != created_at (deuda 44)')
    returning id into v_fact;

    insert into public.purchase_invoice_items
      (invoice_id, product_id, qty, unit_cost, subtotal)
    values (v_fact, v_prod, 2, 75000, 150000);
  end if;

  -- ── 2 · DOS PRECIOS EL MISMO DIA, MISMO COSTO, CLIENTES DISTINTOS ──────
  select id into v_prod from public.products
   where sede_id=v_sede and name='CREATINA OPTIMUN NUTRITIO';

  insert into public.customers (sede_id, name, plazo_dias)
  select v_sede, 'MP Cliente Mostrador', null
  where not exists (select 1 from public.customers where sede_id=v_sede and name='MP Cliente Mostrador');
  insert into public.customers (sede_id, name, plazo_dias)
  select v_sede, 'MP Cliente a credito', 30
  where not exists (select 1 from public.customers where sede_id=v_sede and name='MP Cliente a credito');

  if v_prod is not null then
    -- 🔴 Las lineas se insertan y el TOTAL SALE SOLO: lo deriva el trigger de la
    --    deuda 80. Escribirlo a mano seria probar el trigger contra si mismo.
    for i in 1..2 loop
      if not exists (
        select 1 from public.orders
         where sede_id=v_sede and notes = 'MP precio negociado ' || i) then
        insert into public.orders (sede_id, status, canal, created_by, notes)
        values (v_sede, 'pending', 'mostrador', v_perfil, 'MP precio negociado ' || i)
        returning id into v_orden;

        insert into public.order_items (order_id, product_id, qty, unit_price, unit_cost)
        values (v_orden, v_prod, 1, case when i = 1 then 110000 else 118000 end, 84000);
      end if;
    end loop;
  end if;

  -- ── 3 · UNA VENTA A COSTO — utilidad CERO ──────────────────────────────
  select id into v_galleta from public.products
   where sede_id=v_sede and name='GALLETA OREO CHOCOLATE';

  if v_galleta is not null and not exists (
    select 1 from public.orders where sede_id=v_sede and notes='MP venta a costo') then
    insert into public.orders (sede_id, status, canal, created_by, notes)
    values (v_sede, 'pending', 'mostrador', v_perfil, 'MP venta a costo')
    returning id into v_orden;

    insert into public.order_items (order_id, product_id, qty, unit_price, unit_cost)
    values (v_orden, v_galleta, 1, 7300, 7300);
  end if;

  raise notice 'lab-seed-d: los tres escenarios sembrados';
end $$;

commit;
