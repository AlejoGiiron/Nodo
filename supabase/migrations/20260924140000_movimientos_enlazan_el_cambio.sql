-- ============================================================
-- Nodo · Movimientos: el CAMBIO DE PRODUCTO tambien enlaza a su venta
--
-- Cierra la deuda 121 del lado que faltaba, y lo hace porque la deuda se
-- cobro sola: el tipo `sale_change` entro esta manana (20260924120000) y sus
-- movimientos quedaron sin enlace, cayendo al `#a1b2c3d4` — que es EXACTAMENTE
-- el defecto que la 121 describe.
--
-- 🔴 LA MITAD DE TS YA SE ARREGLO COMO LA DEUDA MANDA: la pantalla dejo de
--    enumerar tipos (`type === 'sale' || 'return'`) y ahora DERIVA — pregunta si
--    hay documento, y el tipo solo decide a cual. Pero derivar no alcanza si el
--    dato no llega: para `sale_change` la vista no resolvia nada.
--
-- ── R0 ────────────────────────────────────────────────────────────────────
-- 1 · CLASE. La misma allowlist por `type` sobre el FK LOGICO `reference_id`,
--     ahora en DOS SALTOS: el movimiento apunta al CAMBIO, y el cambio a la
--     VENTA. Fail-closed de RLS por `security_invoker`, que se conserva.
-- 2 · PRECEDENTE. `20260921120000`, esta misma vista, con su razon escrita: el
--     salto lo hace la vista porque PostgREST no tiene relacion que seguir. Y
--     la deuda 121, que pedia derivar en vez de enumerar.
-- 3 · MODO DE FALLO. Los dos CALLADOS: si un join duplicara filas, la ventana
--     de `saldo_despues` se recalcula sobre mas filas y el saldo queda mal SIN
--     ERROR; si el join no matchea, todo vuelve nulo y se lee como «este
--     movimiento no tiene documento». Las dos llevan asercion que ABORTA.
-- 4 · OBJETIVO. `create or replace view`: solo lectura, CERO filas tocadas,
--     sin DELETE, UPDATE ni DROP. Por UUID, nunca por nombre.
--
-- ⚠️ EL CUERPO SE COPIO DEL ARCHIVO VIGENTE Y SE DIFFEO: la unica diferencia
--    son los dos `coalesce` y los dos joins nuevos. La ventana del saldo queda
--    identica caracter por caracter. «Copiado verbatim» es una afirmacion de
--    METODO, y las de metodo se verifican rehaciendo el trabajo — por eso el
--    diff, no esta frase.
--
-- ✅ Y de paso el CLIENTE aparece en las filas del cambio, que es correcto: el
--    cambio pertenece a la venta de esa persona.
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
  coalesce(o.customer_name, oc.customer_name) as customer_name,
  coalesce(o.order_number, oc.order_number) as order_number,
  f.purchase_number
from public.stock_movements m
left join public.products p on p.id = m.product_id
left join public.orders o
       on o.id = m.reference_id
      and m.type in ('sale', 'return')
left join public.purchase_invoices f
       on f.id = m.reference_id
      and m.type = 'purchase'
-- 🔴 EL TIPO NUEVO RESUELVE EN DOS SALTOS, y por eso no bastaba el join de
--    arriba: un movimiento `sale_change` apunta al CAMBIO, y el cambio apunta a
--    la venta. Sin esto, las filas del tipo que se agrego HOY caian al
--    `#a1b2c3d4` — el defecto exacto que la deuda 121 describe, recien creado.
left join public.sale_changes sc
       on sc.id = m.reference_id
      and m.type = 'sale_change'
left join public.orders oc
       on oc.id = sc.order_id;

comment on view public.stock_movements_con_saldo is
  'Movimientos de stock con la existencia DESPUES de cada uno, anclada en '
  'products.stock_qty. Orden de la ventana: created_at desc, id desc — el mismo '
  'que usa la pantalla. customer_name / order_number: de orders, resueltos en UN '
  'salto para sale y return, y en DOS para sale_change (movimiento -> cambio -> '
  'venta). purchase_number: solo para type purchase. Ver 20260924140000.';

do $$
declare
  v_tabla bigint;
  v_vista bigint;
  v_esp   bigint;
  v_res   bigint;
begin
  -- (a) NINGUN JOIN DUPLICA. Los cuatro son contra una PRIMARY KEY, pero «no
  --     puede pasar» es una afirmacion: se mide.
  select count(*) into v_tabla from public.stock_movements;
  select count(*) into v_vista from public.stock_movements_con_saldo;
  if v_tabla <> v_vista then
    raise exception
      'LOS JOINS CAMBIARON EL NUMERO DE FILAS: tabla % vs vista %. El saldo se '
      'calcula sobre estas filas y quedaria mal SIN ERROR.', v_tabla, v_vista;
  end if;

  -- (b) CONTROL POSITIVO sobre el tipo nuevo: lo que las tablas dicen que se
  --     puede resolver, la vista lo resuelve.
  select count(*) into v_esp
    from public.stock_movements m
    join public.sale_changes sc on sc.id = m.reference_id
    join public.orders o on o.id = sc.order_id
   where m.type = 'sale_change' and o.order_number is not null;
  select count(*) into v_res
    from public.stock_movements_con_saldo
   where type = 'sale_change' and order_number is not null;
  if v_esp <> v_res then
    raise exception
      'EL JOIN A sale_changes NO RESUELVE LO QUE DEBERIA: esperados %, resueltos %.',
      v_esp, v_res;
  end if;

  -- 🔴 Y SE DICE SI EL CONTROL PUDO EJERCERSE. Hoy no hay ningun cambio
  --    registrado, asi que el verde de arriba NO PRUEBA NADA sobre el tipo
  --    nuevo — es un verde que no podia fallar, y callarlo seria peor que no
  --    tenerlo. El spec E2E es el que lo ejerce: crea un cambio y lo mira.
  if v_esp = 0 then
    raise notice
      'CONTROL POSITIVO NO EJERCIDO para sale_change: no hay cambios registrados '
      'todavia. El chequeo paso EN VACIO y la cobertura real la da el spec.';
  end if;

  raise notice 'Vista actualizada. Filas %, cambios resueltos %.', v_vista, v_res;
end $$;

revoke all on public.stock_movements_con_saldo from anon;
grant select on public.stock_movements_con_saldo to authenticated;

commit;
