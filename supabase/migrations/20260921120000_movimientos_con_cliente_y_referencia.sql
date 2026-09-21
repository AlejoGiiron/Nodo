-- ============================================================
-- Nodo · Movimientos de stock: A QUIÉN se le vendió, y una referencia legible
--
-- Pedido de la clienta (2026-09-21): «en los movimientos, cuando sea venta,
-- mostrar el cliente al que se le vendió si lo tiene». El uso es el mismo que
-- motivó el saldo: AUDITAR UN DESCUADRE — y para eso «Venta −2 · #a1b2c3d4» no
-- sirve, porque ese `#a1b2c3d4` son los primeros 8 caracteres de un UUID y no
-- se puede buscar por ningún lado del producto.
--
-- ── R0 ────────────────────────────────────────────────────────────────────
-- 1 · CLASE. ALLOWLIST POR `type` para resolver un FK LÓGICO Y POLIMÓRFICO.
--     `stock_movements.reference_id` no tiene FK declarada a propósito: apunta
--     a `orders` o a `purchase_invoices` según el `type`, y el comment de esa
--     columna (20260831120800) lo dice con todas las letras. Así que el salto
--     lo hace esta vista, y sólo para los types donde el destino está definido.
--     Además: fail-closed de RLS por `security_invoker`, que se CONSERVA.
-- 2 · PRECEDENTE. `20260917120000`, esta misma vista: «security_invoker = true
--     es lo más importante del archivo». Y `chk_numero_solo_en_compras`
--     (20260917210000): una factura de DEVOLUCIÓN no lleva `purchase_number`,
--     por eso el número de compra se atribuye sólo a `type = 'purchase'`.
-- 3 · MODO DE FALLO. Dos, y los dos CALLADOS — por eso los dos llevan una
--     aserción que ABORTA, no un número que se cite:
--       (a) Si un join duplicara filas, la ventana de `saldo_despues` se
--           recalcula sobre más filas y el saldo queda mal SIN ERROR. No puede
--           pasar —los dos joins son contra una PRIMARY KEY— pero «no puede
--           pasar» es una afirmación, así que se mide: el conteo de la vista
--           tiene que ser IGUAL al de la tabla.
--       (b) Si una condición del join nunca matcheara —un `type` mal escrito,
--           una columna cambiada— todo volvería nulo y la pantalla diría
--           «ninguna venta tenía cliente», que es la dirección que nadie
--           reporta. Va un CONTROL POSITIVO: lo que las tablas dicen que se
--           puede resolver, la vista TIENE que resolverlo.
--     Un tercero, ya resuelto y que se conserva: sin `security_invoker` la
--     vista correría como su dueño y mostraría NOMBRES DE CLIENTES de otras
--     organizaciones. Es PII de terceros y falla ABIERTO.
-- 4 · OBJETIVO. `create or replace view`: sólo lectura, CERO filas tocadas, sin
--     DELETE, UPDATE ni DROP. La atribución es por UUID (`o.id = m.reference_id`),
--     nunca por nombre ni por patrón.
--
-- ── 🔴 QUÉ NOMBRE SE MUESTRA: EL CONGELADO, NO EL VIVO ─────────────────────
--   `orders.customer_name`, no `customers.name`. Son dos datos distintos y la
--   diferencia se paga sola:
--   · `orders.customer_id` es ON DELETE SET NULL, así que el nombre congelado es
--     lo ÚNICO que sobrevive si borran al cliente.
--   · Movimientos es una auditoría append-only. Leer el nombre vivo haría que
--     una fila de enero cambiara de respuesta cuando alguien corrige una ficha
--     —«la historia no se reescribe, se le agrega»—.
--   Es además lo que ya hace el Historial de ventas (`SalesHistoryPage`), así
--   que las dos pantallas no pueden discrepar sobre la misma venta.
--   ⚠️ Cartera sí prefiere el vivo (`useDebts`: `customers?.name ?? customer_name`)
--   y está bien: ahí la pregunta es a quién hay que cobrarle HOY.
--
-- ── 🔴 POR QUÉ UN NULO ACÁ SIGNIFICA UNA SOLA COSA ─────────────────────────
--   Un `customer_name` nulo podría significar dos cosas —«esa venta no tenía
--   cliente» o «no puedo ver esa orden»— y entonces no sería un dato. Se midió
--   contra `20260831121300_rls.sql` antes de escribir esto: las políticas de
--   SELECT de `stock_movements`, `orders` y `purchase_invoices` son IDÉNTICAS
--   —`sede_id = get_my_sede_id()`, sin permiso adicional—. O sea que quien ve
--   el movimiento ve su orden, y el nulo sólo puede querer decir que no tenía
--   cliente. Si algún día una de las tres gana un `has_permission`, esa
--   equivalencia se rompe y el nulo vuelve a ser ambiguo.
--
-- ── ⚠️ LOS TYPES, UNO POR UNO — es una allowlist, no una conveniencia ──────
--   sale            → `orders`: la venta. Cliente + número.
--   return          → `orders` TAMBIÉN: es la ANULACIÓN de esa venta y lleva el
--                     mismo `p_order_id` (verificado en 20260901120000). La fila
--                     dice de qué venta salió y a quién se le había vendido.
--   purchase        → `purchase_invoices`: número de compra.
--   purchase_return → NO SE RESUELVE. Apunta a una factura de devolución, y por
--                     `chk_numero_solo_en_compras` ésa tiene `purchase_number`
--                     NULL por construcción. Resolverla daría «Compra #—», que
--                     es peor que no decir nada.
--   adjustment      → NO SE RESUELVE. Su `reference_id` es a veces la factura
--                     que lo originó (`update_purchase`) y a veces nulo. Su
--                     referencia sigue siendo `notes`, que es texto que alguien
--                     escribió a propósito.
--   La condición de `type` va DENTRO del join, no en un `where`: un `where`
--   sobre una columna de la tabla derecha convierte el LEFT JOIN en INNER y
--   haría DESAPARECER filas — la forma que escondió una clase entera de ventas
--   en el Historial.
--
-- ── ⚠️ LA VENTANA DEL SALDO NO SE TOCA ─────────────────────────────────────
--   `partition by`, `order by` y el marco quedan idénticos, carácter por
--   carácter. Siguen siendo un lado del contrato con el `order()` de
--   `getStockMovements`. Las tres columnas nuevas se AGREGAN AL FINAL, que es
--   lo único que `create or replace view` admite.
-- ============================================================

begin;

create or replace view public.stock_movements_con_saldo
  with (security_invoker = true)
as
select
  m.id,
  m.sede_id,
  m.product_id,
  m.type,
  m.qty,
  m.reference_id,
  m.notes,
  m.created_by,
  m.created_at,
  case
    when p.stock_tracking and p.stock_qty is not null then
      p.stock_qty - coalesce(sum(m.qty) over (
        partition by m.sede_id, m.product_id
        order by m.created_at desc, m.id desc
        rows between unbounded preceding and 1 preceding
      ), 0)
  end as saldo_despues,
  -- Columnas nuevas, al final. Nulas en todo type que no esté en la allowlist.
  o.customer_name,
  o.order_number,
  f.purchase_number
from public.stock_movements m
left join public.products p on p.id = m.product_id
left join public.orders o
       on o.id = m.reference_id
      and m.type in ('sale', 'return')
left join public.purchase_invoices f
       on f.id = m.reference_id
      and m.type = 'purchase';

comment on view public.stock_movements_con_saldo is
  'Movimientos de stock con la existencia DESPUÉS de cada uno, anclada en '
  'products.stock_qty y restando hacia atrás los movimientos posteriores. '
  'Orden de la ventana: created_at desc, id desc — el mismo que usa la pantalla. '
  'Nulo si el producto no lleva existencia o no tiene stock_qty. '
  'Ver 20260917120000_movimientos_con_saldo.sql. '
  'customer_name / order_number: de orders, para type sale y return (reference_id '
  'es un FK LÓGICO). customer_name es el CONGELADO en la venta, no el vivo del '
  'cliente. purchase_number: de purchase_invoices, sólo para type purchase — una '
  'factura de devolución no lleva número. Ver 20260921120000.';

-- ── VERIFICACIÓN, adentro de la transacción y con raise ────────────────────
-- Un número que se mide y se cita tranquiliza; uno que puede tumbar la
-- transacción decide. Los dos de abajo revierten la vista si no dan.
do $$
declare
  v_tabla   bigint;
  v_vista   bigint;
  v_esp_ord bigint;
  v_res_ord bigint;
  v_esp_com bigint;
  v_res_com bigint;
begin
  -- (a) NINGÚN JOIN DUPLICA. Si duplicara, el saldo se corrompe callado.
  select count(*) into v_tabla from public.stock_movements;
  select count(*) into v_vista from public.stock_movements_con_saldo;
  if v_tabla <> v_vista then
    raise exception
      'LOS JOINS NUEVOS CAMBIARON EL NÚMERO DE FILAS: tabla % vs vista %. El '
      'saldo_despues se calcula sobre estas filas, así que quedaría mal SIN '
      'ERROR. Se revierte.', v_tabla, v_vista;
  end if;

  -- (b) CONTROL POSITIVO. Lo que las tablas dicen que se puede resolver, la
  --     vista lo resuelve. Sin esto, un join que no matchea nunca devuelve
  --     nulos y se lee como «ninguna venta tenía cliente».
  select count(*) into v_esp_ord
    from public.stock_movements m
    join public.orders o on o.id = m.reference_id
   where m.type in ('sale', 'return') and o.order_number is not null;
  select count(*) into v_res_ord
    from public.stock_movements_con_saldo
   where type in ('sale', 'return') and order_number is not null;
  if v_esp_ord <> v_res_ord then
    raise exception
      'EL JOIN A orders NO RESUELVE LO QUE DEBERÍA: esperados %, resueltos %.',
      v_esp_ord, v_res_ord;
  end if;

  select count(*) into v_esp_com
    from public.stock_movements m
    join public.purchase_invoices f on f.id = m.reference_id
   where m.type = 'purchase' and f.purchase_number is not null;
  select count(*) into v_res_com
    from public.stock_movements_con_saldo
   where type = 'purchase' and purchase_number is not null;
  if v_esp_com <> v_res_com then
    raise exception
      'EL JOIN A purchase_invoices NO RESUELVE LO QUE DEBERÍA: esperados %, '
      'resueltos %.', v_esp_com, v_res_com;
  end if;

  -- El control positivo sólo vale si tuvo con qué. Si no había datos que
  -- resolver, el verde de arriba no probó nada y hay que decirlo en vez de
  -- dejarlo pasar como si hubiera medido.
  if v_esp_ord = 0 then
    raise notice
      'CONTROL POSITIVO NO EJERCIDO para orders: no hay movimientos sale/return '
      'con orden numerada. El chequeo pasó en vacío.';
  end if;
  if v_esp_com = 0 then
    raise notice
      'CONTROL POSITIVO NO EJERCIDO para purchase_invoices: no hay movimientos '
      'purchase con factura numerada. El chequeo pasó en vacío.';
  end if;

  raise notice 'Vista actualizada. Filas %, ventas resueltas %, compras resueltas %.',
    v_vista, v_res_ord, v_res_com;
end $$;

-- Se repiten porque `create or replace view` NO conserva los privilegios que se
-- hayan concedido después de crearla — y un revoke de más es gratis.
revoke all on public.stock_movements_con_saldo from anon;
grant select on public.stock_movements_con_saldo to authenticated;

commit;
