-- ============================================================
-- G-Nexo — Esquema base · 11 · Row Level Security: todas las policies
--
-- ORIGEN: consolidado de G-Vento `d848852` (schema.sql seccion 9,
-- multi-tenant-rbac, product-extras, inventory-recipes, compras-proveedores,
-- fiado-clientes, restaurants-sedes-rls, profiles-*-rls).
--
-- R5: no aplicado en G-Nexo (base vacia). Desde el primer `db push`, R5 manda.
--
-- ── POR QUE TODO JUNTO ─────────────────────────────────────────────────────
-- RLS ya quedo HABILITADA en cada archivo al crear su tabla. Una tabla con RLS
-- y sin policies NIEGA TODO, asi que la ventana entre aquel archivo y este es
-- fail-closed. Este archivo solo ABRE lo que corresponde.
--
-- ── EL CAMBIO MAS IMPORTANTE RESPECTO DEL HEREDADO ─────────────────────────
-- 🔴 En G-Vento las policies gatean por `get_my_role() = 'admin'` — el ENUM —
--    y NO por `has_permission()`. Esa es la causa mecanica del residuo medido:
--    6 permisos del catalogo no gateaban nada y fallaban ABIERTO. El catalogo
--    existia y no enforceaba: era decoracion.
--
--    Aca se gatea por `has_permission('clave')`. El catalogo pasa a ser la
--    fuente real de autorizacion, que es para lo que existe.
--
--    ⚠️ CONSECUENCIA, dicha antes de que muerda: un perfil con `role_id` nulo
--    NO PUEDE HACER NADA. Es fail-closed —se nota al instante, no en silencio—
--    pero significa que el onboarding TIENE que asignar rol. `seed_system_roles`
--    y el alta de usuarios ya lo hacen; si algo queda a medias, el sintoma es
--    "no puedo hacer nada", que dirige bien.
--
-- ── LAS TABLAS QUE SOLO ESCRIBEN LAS RPC ───────────────────────────────────
-- 🔴 A `order_items`, `order_item_extras`, `payments`, `stock_movements`,
--    `cash_movements`, `debt_payments`, `purchase_invoice_items` y
--    `store_sequences` NO se les da policy de INSERT/UPDATE/DELETE.
--
--    Con RLS habilitada eso significa que un cliente autenticado NO PUEDE
--    escribirlas por ningun camino. Solo entran por las RPC `SECURITY DEFINER`,
--    que corren como owner y no pasan por RLS.
--
--    Esto CIERRA LA DEUDA #24 POR CONSTRUCCION. El helper `addOrderItems` de
--    supabase-helpers insertaba directo en order_items, salteando el descuento
--    de stock, y lo unico que lo impedia era que nadie lo llamara: una
--    CONVENCION. Ahora lo impide la base. La garantia deja de ser "nadie usa el
--    helper" y pasa a ser "la policy no existe" — que es un mecanismo.
--
-- ⛔ HUECO DEL PLAN QUE ESTO DEJA AL DESCUBIERTO — ver el bloque final.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- organizations · sedes · roles · user_stores
-- Alcance: la ORGANIZACION, no la sede (un usuario ve las sedes hermanas).
-- ------------------------------------------------------------
create policy "organizations: ver la propia"
  on public.organizations for select to authenticated
  using (id = get_my_organization_id());

create policy "sedes: ver las de mi organizacion"
  on public.sedes for select to authenticated
  using (organization_id = get_my_organization_id());

create policy "sedes: gestionar"
  on public.sedes for all to authenticated
  using      (organization_id = get_my_organization_id() and has_permission('sedes.gestionar'))
  with check (organization_id = get_my_organization_id() and has_permission('sedes.gestionar'));

create policy "roles: ver los de mi organizacion"
  on public.roles for select to authenticated
  using (organization_id = get_my_organization_id());

create policy "roles: gestionar"
  on public.roles for all to authenticated
  using      (organization_id = get_my_organization_id() and has_permission('roles.gestionar'))
  with check (organization_id = get_my_organization_id() and has_permission('roles.gestionar'));

create policy "user_stores: ver los de mi organizacion"
  on public.user_stores for select to authenticated
  using (sede_id in (select id from public.sedes where organization_id = get_my_organization_id()));

create policy "user_stores: gestionar"
  on public.user_stores for all to authenticated
  using      (sede_id in (select id from public.sedes where organization_id = get_my_organization_id())
              and has_permission('usuarios.gestionar'))
  with check (sede_id in (select id from public.sedes where organization_id = get_my_organization_id())
              and has_permission('usuarios.gestionar'));


-- ------------------------------------------------------------
-- profiles
-- Lectura: los de mi organizacion (la UI necesita nombres de otras sedes).
-- Escritura del propio: acotada — protect_profile_self_escalation impide que
-- alguien se cambie rol, estado u organizacion aunque la policy lo deje pasar.
-- INSERT no tiene policy: los perfiles los crea handle_new_user (definer).
-- ------------------------------------------------------------
create policy "profiles: ver los de mi organizacion"
  on public.profiles for select to authenticated
  using (organization_id = get_my_organization_id());

create policy "profiles: editar el propio"
  on public.profiles for update to authenticated
  using      (id = auth.uid())
  with check (id = auth.uid());

create policy "profiles: gestionar usuarios"
  on public.profiles for update to authenticated
  using      (organization_id = get_my_organization_id() and has_permission('usuarios.gestionar'))
  with check (organization_id = get_my_organization_id() and has_permission('usuarios.gestionar'));


-- ------------------------------------------------------------
-- categories · products — catalogo de la sede
-- ------------------------------------------------------------
create policy "categories: ver de mi sede"
  on public.categories for select to authenticated
  using (sede_id = get_my_sede_id());

create policy "categories: gestionar"
  on public.categories for all to authenticated
  using      (sede_id = get_my_sede_id() and has_permission('productos.editar'))
  with check (sede_id = get_my_sede_id() and has_permission('productos.editar'));

create policy "products: ver de mi sede"
  on public.products for select to authenticated
  using (sede_id = get_my_sede_id());

create policy "products: gestionar"
  on public.products for all to authenticated
  using      (sede_id = get_my_sede_id() and has_permission('productos.editar'))
  with check (sede_id = get_my_sede_id() and has_permission('productos.editar'));


-- ------------------------------------------------------------
-- extras — mismo criterio que el catalogo: los administra quien edita productos
-- ------------------------------------------------------------
create policy "extras: ver de mi sede"
  on public.extras for select to authenticated
  using (sede_id = get_my_sede_id());

create policy "extras: gestionar"
  on public.extras for all to authenticated
  using      (sede_id = get_my_sede_id() and has_permission('productos.editar'))
  with check (sede_id = get_my_sede_id() and has_permission('productos.editar'));

create policy "product_extras: ver por producto de mi sede"
  on public.product_extras for select to authenticated
  using (product_id in (select id from public.products where sede_id = get_my_sede_id()));

create policy "product_extras: gestionar"
  on public.product_extras for all to authenticated
  using      (product_id in (select id from public.products where sede_id = get_my_sede_id())
              and has_permission('productos.editar'))
  with check (product_id in (select id from public.products where sede_id = get_my_sede_id())
              and has_permission('productos.editar'));

create policy "product_components: ver por padre de mi sede"
  on public.product_components for select to authenticated
  using (sede_id = get_my_sede_id());

create policy "product_components: gestionar"
  on public.product_components for all to authenticated
  using      (sede_id = get_my_sede_id() and has_permission('productos.editar'))
  with check (sede_id = get_my_sede_id() and has_permission('productos.editar'));


-- ------------------------------------------------------------
-- orders — la cabecera SI la escribe el cliente (crear la venta).
-- Las LINEAS no: van por RPC. Ver el bloque de arriba.
-- ------------------------------------------------------------
create policy "orders: ver de mi sede"
  on public.orders for select to authenticated
  using (sede_id = get_my_sede_id());

create policy "orders: vender"
  on public.orders for insert to authenticated
  with check (sede_id = get_my_sede_id() and has_permission('pos.vender'));

create policy "orders: actualizar la venta"
  on public.orders for update to authenticated
  using      (sede_id = get_my_sede_id() and has_permission('pos.vender'))
  with check (sede_id = get_my_sede_id());

-- SIN policy de DELETE: una venta NUNCA se borra, se anula (cancelled_at).
-- La ausencia es la regla, y por eso se escribe.


-- ------------------------------------------------------------
-- Solo lectura para el cliente. Todo lo demas entra por RPC SECURITY DEFINER.
-- ------------------------------------------------------------
create policy "order_items: ver por venta de mi sede"
  on public.order_items for select to authenticated
  using (order_id in (select id from public.orders where sede_id = get_my_sede_id()));

create policy "order_item_extras: ver por linea de mi sede"
  on public.order_item_extras for select to authenticated
  using (order_item_id in (
    select oi.id from public.order_items oi
    join public.orders o on o.id = oi.order_id
    where o.sede_id = get_my_sede_id()));

create policy "payments: ver de mi sede"
  on public.payments for select to authenticated
  using (sede_id = get_my_sede_id());

create policy "stock_movements: ver de mi sede"
  on public.stock_movements for select to authenticated
  using (sede_id = get_my_sede_id());

create policy "store_sequences: ver de mi sede"
  on public.store_sequences for select to authenticated
  using (sede_id = get_my_sede_id());


-- ------------------------------------------------------------
-- Caja
-- jornadas: abrir y cerrar SI las hace el cliente (es una accion de caja).
-- cash_movements: los manuales tambien — pero con categoria, que la constraint
-- de la migracion `caja` exige. Los automaticos los ponen las RPC.
-- ------------------------------------------------------------
create policy "jornadas: ver de mi sede"
  on public.jornadas for select to authenticated
  using (sede_id = get_my_sede_id());

create policy "jornadas: abrir"
  on public.jornadas for insert to authenticated
  with check (sede_id = get_my_sede_id() and has_permission('caja.abrir'));

create policy "jornadas: cerrar"
  on public.jornadas for update to authenticated
  using      (sede_id = get_my_sede_id() and has_permission('caja.cerrar'))
  with check (sede_id = get_my_sede_id());

create policy "cash_movements: ver de mi sede"
  on public.cash_movements for select to authenticated
  using (sede_id = get_my_sede_id());

create policy "cash_movements: registrar movimiento manual"
  on public.cash_movements for insert to authenticated
  with check (sede_id = get_my_sede_id() and has_permission('caja.movimientos'));

-- SIN update ni delete: un movimiento de caja es un hecho, no un estado.


-- ------------------------------------------------------------
-- Compras
-- ------------------------------------------------------------
create policy "suppliers: ver de mi sede"
  on public.suppliers for select to authenticated
  using (sede_id = get_my_sede_id());

create policy "suppliers: gestionar"
  on public.suppliers for all to authenticated
  using      (sede_id = get_my_sede_id() and has_permission('compras.gestionar'))
  with check (sede_id = get_my_sede_id() and has_permission('compras.gestionar'));

create policy "purchase_invoices: ver de mi sede"
  on public.purchase_invoices for select to authenticated
  using (sede_id = get_my_sede_id());

create policy "purchase_invoice_items: ver por factura de mi sede"
  on public.purchase_invoice_items for select to authenticated
  using (invoice_id in (select id from public.purchase_invoices where sede_id = get_my_sede_id()));

-- Las facturas y sus items los escribe register_purchase (definer): sin policy
-- de escritura, no hay forma de fabricar una compra saltandose el stock ni la
-- caja.


-- ------------------------------------------------------------
-- Clientes y cartera
-- ------------------------------------------------------------
create policy "customers: ver de mi sede"
  on public.customers for select to authenticated
  using (sede_id = get_my_sede_id());

create policy "customers: gestionar"
  on public.customers for all to authenticated
  using      (sede_id = get_my_sede_id() and has_permission('fiado.gestionar'))
  with check (sede_id = get_my_sede_id() and has_permission('fiado.gestionar'));

create policy "debt_payments: ver de mi sede"
  on public.debt_payments for select to authenticated
  using (sede_id = get_my_sede_id());

-- Los abonos los escribe register_debt_payment (definer). Sin policy de insert:
-- un abono que no pase por la RPC no recalcularia el estado de la venta ni
-- marcaria requiere_conciliacion.


-- ============================================================
-- ⛔ HUECO DEL PLAN QUE ESTE ARCHIVO DEJA AL DESCUBIERTO
--
-- Al negar la escritura directa de `payments`, queda a la vista que la
-- consolidacion NO INCLUYO DOS RPC del heredado:
--
--   · register_sale_payment  (supabase/register-sale-payment.sql, 96 lineas)
--   · register_sale_void     (supabase/register-sale-void.sql, 238 lineas)
--
-- El plan de 12 archivos las clasifico como zona gris y les asigno el archivo
-- 06, pero al escribir el 06 no entraron. Con las policies puestas, **cobrar
-- una venta es imposible hasta que exista register_sale_payment**.
--
-- Es el MISMO hueco que el de extras, y aparece por la MISMA razon: un plan
-- razona sobre pertenencia y el orden solo se manifiesta al escribir. Segunda
-- instancia de la clase, ya anotada en docs/BITACORA.md.
--
-- ⚠️ NO se abre una policy de insert sobre payments para "destrabar": seria
--    exactamente el fail-open que este archivo cierra. El camino correcto es
--    escribir las dos RPC (migracion `rpc_de_venta`), no ablandar la policy.
-- ============================================================

commit;
