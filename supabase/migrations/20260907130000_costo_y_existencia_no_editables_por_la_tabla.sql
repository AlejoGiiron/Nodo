-- ============================================================================
-- DEUDA 78 · `cost_price` y `stock_qty` dejan de ser escribibles POR LA TABLA
--
-- R0 — las cuatro preguntas, contestadas antes de escribir:
--
--  1. CLASE · ALLOWLIST DE COLUMNAS. Lo permitido se declara positivamente; lo
--     prohibido no se enumera. Una columna nueva de `products` nace NO editable
--     por el cliente, o sea que el olvido falla CERRADO.
--
--  2. PRECEDENTE · R2 (allowlist, nunca deny-list) y la deuda 71 — «revoke ...
--     from public NO quita a `anon`: Supabase deja DEFAULT PRIVILEGES en el
--     esquema public». Por eso el revoke de abajo nombra a los dos roles.
--
--  3. MODO DE FALLO · HOY FALLA ABIERTO. La policy `products: gestionar` es
--     `for all` con `productos.editar`, asi que cualquiera con ese permiso hace
--     `update products set cost_price = ...` desde el cliente: cambia PLATA, sin
--     autor y sin motivo, y ese numero alimenta utilidades. Con el allowlist
--     puesto, el error es «permission denied» — falla cerrado y nombra la columna.
--
--  4. OBJETIVO · por PRIVILEGIO DE COLUMNA del motor, no por trigger.
--
-- ⛔ Esta migracion NO toca una sola fila: no hay insert, update, delete ni drop.
--    Solo cambia quien puede escribir que columna.
--
-- ----------------------------------------------------------------------------
-- POR QUE UN PRIVILEGIO Y NO UN TRIGGER
--
-- Un trigger se puede desactivar, y el que este proyecto habria escrito dependia
-- de `current_user` — que dentro de una funcion SECURITY DEFINER es `postgres`
-- por como estan definidas hoy, no por una garantia. Un privilegio que no existe
-- no se puede saltar: es el mismo argumento con el que se acoto el token al
-- proyecto —«un alcance que no incluye el recurso no se puede saltar»— y la
-- misma diferencia entre un GUARD y un RECORDATORIO.
--
-- 🔴 Y POR QUE ES UN REVOKE DE TABLA Y NO UN `revoke update (cost_price)`:
--    en Postgres NO se puede restar una columna de un grant de tabla. Mientras
--    exista el UPDATE a nivel de tabla, cubre TODAS las columnas y el revoke por
--    columna queda INERTE — sin error, sin aviso, y con la sensacion de haberlo
--    cerrado. Hay que quitar el de tabla y conceder la lista.
--
-- ----------------------------------------------------------------------------
-- QUIEN SIGUE PUDIENDO ESCRIBIR ESAS DOS COLUMNAS, Y CON QUE RASTRO
--
--   cost_price  ->  `register_purchase` (promedio ponderado movil)
--                   `adjust_cost`       (exige motivo; escribe el ajuste)
--   stock_qty   ->  `adjust_stock`      (exige motivo; escribe stock_movements)
--                   `register_purchase` · `add_order_items_with_extras`
--                   `register_sale_void` · `register_purchase_return`
--
-- Las siete son SECURITY DEFINER: corren como su OWNER, no como `authenticated`,
-- asi que este revoke no las alcanza. Eso no es un efecto colateral afortunado:
-- es la razon por la que el mecanismo es este y no otro.
--
-- ----------------------------------------------------------------------------
-- ⚠️ LADO NUEVO DEL CONTRATO DE R1 — la lista de abajo.
--
-- Cada columna que se agregue a `products` decide si entra o no. Olvidarlo falla
-- CERRADO, que es la direccion correcta, PERO se manifiesta como «no puedo
-- editar el campo nuevo» — un sintoma que nadie asocia con un grant si no esta
-- escrito. Queda escrito aca y en el inventario de R1 de CLAUDE.md.
-- ============================================================================

-- 1 · Se quita el UPDATE de TABLA. `anon` va nombrado a proposito: los DEFAULT
--     PRIVILEGES de Supabase se lo dan ademas de a `authenticated`, y `anon` no
--     es lo mismo que `public` (deuda 71).
revoke update on public.products from authenticated, anon;

-- 2 · Y se concede, columna por columna, SOLO lo que el cliente edita de verdad.
--     La lista sale de enumerar el payload de `ProductModal.tsx` y de
--     `archiveProduct`, no de recordarla.
--
--     `id` esta en la lista porque el alta y la edicion pasan las dos por un
--     UPSERT (`upsertProduct`), y PostgREST arma un `on conflict do update set`
--     con las columnas del payload. Postgres verifica esos privilegios AL
--     PLANIFICAR, haya conflicto o no. Cambiar un id de verdad lo frenan las FK
--     de `order_items`/`stock_movements`, y RLS confina la fila a la sede.
--
--     `sede_id` idem: viaja en el payload, y moverlo a otra sede ya lo frena el
--     `with check (sede_id = get_my_sede_id())` de la policy.
grant update (
  id,
  sede_id,
  category_id,
  name,
  description,
  price,
  image_url,
  is_active,
  kind,
  stock_tracking,
  min_stock,
  codigo,
  unidad
) on public.products to authenticated;

-- 3 · Lo que queda FUERA, dicho en positivo para que se lea sin comparar listas:
--       cost_price  · stock_qty  · created_at · updated_at
--
--     `updated_at` no hace falta en la lista: lo pone el trigger
--     `trg_products_updated_at` asignando `new.updated_at`, y una asignacion
--     sobre el registro NEW no pasa por el privilegio de columna.

comment on column public.products.cost_price is
  'Costo unitario vigente. NO editable por la tabla (deuda 78): solo lo escriben '
  '`register_purchase` (promedio ponderado movil) y `adjust_cost` (con motivo, y '
  'dejando el ajuste registrado). Se congela en `order_items.unit_cost` al vender.';

comment on column public.products.stock_qty is
  'Existencia. NO editable por la tabla (deuda 78): solo la mueven las RPC, y '
  '`adjust_stock` exige motivo y escribe `stock_movements`. Un producto sin '
  'seguimiento la conserva en vez de perderla: todos los consumidores filtran '
  'por `stock_tracking`, asi que el valor viejo es invisible y reaparece intacto '
  'si el seguimiento se vuelve a encender.';
