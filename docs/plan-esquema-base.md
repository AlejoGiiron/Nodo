# G-Nexo — Inventario del SQL heredado y plan de esquema base

*2026-08-31. Producido por el prompt `docs/prompt-02-inventario-sql.md`. **Este documento no
escribe SQL**: inventaría, clasifica y planifica. La consolidación va en el prompt 3.*

**Cómo reproducir los conteos** (preferido sobre los números, que caducan):

```bash
find supabase -type f | wc -l                      # archivos
find supabase -type f -exec cat {} + | wc -l       # líneas
```

Al 2026-08-31: **48 archivos, 9.280 líneas** (46 `.sql` + 2 edge functions en TypeScript).

---

## 0 · La decisión que enmarca todo esto, y por qué NO viola R5

**Decisión:** los `.sql` heredados se consolidan en un esquema base limpio **antes** de aplicar
nada, en vez de aplicar el esquema de G-Vento y después borrar mesas, cocina y turnos con
migraciones.

**Por qué no viola R5.** R5 dice que una migración **aplicada** es inmutable. Estos archivos **no
están aplicados en G-Nexo**: la base del proyecto de Supabase está vacía (verificado el
2026-08-31, cero tablas en la salida de `gen types`; es la misma evidencia que cerró la deuda #2).
Son **archivos, no migraciones ejecutadas**. La regla protege el registro de lo que ya le pasó a
una base; acá no le pasó nada a ninguna base.

Queda escrito porque dentro de seis meses alguien va a ver SQL heredado editado y va a concluir
que se rompió la regla. El discriminador no es "el archivo es viejo" sino **"¿esto se ejecutó
contra la base de este producto?"**. Para G-Nexo, hoy, la respuesta es no. **A partir del primer
`supabase db push`, deja de serlo y R5 aplica con todo su peso.**

**Por qué esta opción y no la otra:** con la otra, la historia de G-Nexo arrancaría con
"creo mesas / borro mesas" para siempre, en un producto que nunca tuvo mesas. Y como el catálogo
de permisos de G-Nexo es distinto (deuda #23), aplicar primero obligaría a una reconciliación por
unión que con esta opción sencillamente no existe.

---

## 1 · Inventario de `supabase/`

Uno por uno, sin agrupar. Es la línea base contra la que se verifica la consolidación después.

| # | Archivo | Líneas | Qué crea o modifica | Seed |
|---|---|---:|---|:--:|
| 1 | `caja-cierre-cuadre.sql` | 12 | `alter cash_shifts`: columnas `expected_amount`, `difference` + comments | |
| 2 | `cash-movements.sql` | 35 | tipo `movement_type`; tabla `cash_movements` (FK `shift_id` **not null** → `cash_shifts` on delete cascade); RLS + 1 policy | |
| 3 | `cocina-por-sede.sql` | 51 | `alter restaurants`: `uses_kitchen`; `alter products`: `routes_to_kitchen` + comments | |
| 4 | `compra-no-toca-caja.sql` | 150 | **redefine** `register_purchase` (inserta en `purchase_invoices`, `purchase_invoice_items`, `stock_movements`) | |
| 5 | `compras-proveedores.sql` | 399 | tablas `suppliers`, `purchase_invoices`, `purchase_invoice_items`; 5 índices; RLS + 7 policies; trigger `trg_suppliers_updated_at`; función `register_purchase` | |
| 6 | `config-profile-active.sql` | 2 | `alter profiles`: `is_active` | |
| 7 | `delivery-couriers.sql` | 82 | tabla `couriers`; 3 índices; RLS + 4 policies; trigger `trg_couriers_updated_at` | |
| 8 | `demo-seed-cafeteria.sql` | 1.077 | datos demo: productos, órdenes, pagos, turnos, movimientos, fiado, extras, recetas | ✅ |
| 9 | `demo-seed.sql` | 1.202 | datos demo completos; incluye `restaurants`, `tables`, `couriers` | ✅ |
| 10 | `fiado-clientes.sql` | 329 | tablas `customers`, `debt_payments` (FK `cash_movement_id`); 4 índices; RLS + 6 policies; trigger; función `register_debt_payment` | |
| 11 | `fix-enforce-profile-organization-definer.sql` | 123 | **redefine** `enforce_profile_organization` como `SECURITY DEFINER` (evidencia de R6) | |
| 12 | `fix-profiles-store-switch-rls.sql` | 69 | drop + create policy sobre `profiles` | |
| 13 | `functions/aplicar-estado/index.ts` | 216 | edge function: lee/escribe `organizations` (estado de suscripción) | |
| 14 | `functions/create-user/index.ts` | 141 | edge function: alta de usuario; lee `profiles`, `roles`; llama `has_permission` | |
| 15 | `inventory-min-stock.sql` | 23 | `alter products`: `min_stock` + comment | |
| 16 | `inventory-recipes.sql` | 219 | tablas `product_components`, `stock_movements`; 3 índices; RLS + 5 policies; función `adjust_stock` | |
| 17 | `lab-seed.sql` | 618 | seed de laboratorio: orgs, sedes, perfiles, productos, mesas | ✅ |
| 18 | `labcentro-org.sql` | 85 | inserta una `organizations` | ✅ |
| 19 | `multi-tenant-rbac.sql` | 336 | tablas `organizations`, `roles`, `user_stores`; RLS + 10 policies; 2 triggers; funciones `has_permission`, `get_my_organization_id`; inserta 4 `roles` | parcial |
| 20 | `onboard-org-paso1.sql` | 171 | inserta `organizations` + `restaurants`; `uses_kitchen` como parámetro | ✅ |
| 21 | `onboard-org-paso3.sql` | 281 | inserta `roles` + `user_stores` | ✅ |
| 22 | `onboard-org.sql` | 236 | inserta `organizations`, `restaurants`, `profiles`, `user_stores` | ✅ |
| 23 | `order-extras-rpc.sql` | 146 | función `add_order_items_with_extras` (v1, **sin** descuento de stock) + grants | |
| 24 | `order-items-stock-recipes.sql` | 214 | **redefine** `add_order_items_with_extras` (v2, **con** descuento por receta) + grants | |
| 25 | `order-numbering.sql` | 117 | tabla `store_sequences`; RLS + 1 policy; índice; función `next_order_number` | |
| 26 | `orders-discount-vale.sql` | 43 | `alter orders`: constraint de vale; índice `idx_orders_vale` | |
| 27 | `orders-waiter-name.sql` | 15 | `alter orders`: `waiter_name` + comment | |
| 28 | `organization-subscription.sql` | 342 | tabla `_t_priv`; función + trigger `protect_organization_subscription` | |
| 29 | `product-extras.sql` | 170 | tablas `extras`, `product_extras`, `order_item_extras`; 3 índices; RLS + 9 policies; trigger | |
| 30 | `products-allow-negative-stock.sql` | 45 | drop dinámico del check de `stock_qty`; comment | |
| 31 | `profiles-active-store-rls.sql` | 30 | drop + create policy sobre `profiles` | |
| 32 | `profiles-is-active-enforced.sql` | 157 | **redefine** `has_permission`, `get_my_role`, `get_my_restaurant_id`, `get_my_organization_id` para exigir `is_active` | |
| 33 | `profiles-organization-invariant.sql` | 339 | **redefine** `handle_new_user` y `enforce_profile_organization`; trigger `trg_profiles_org_consistency` | |
| 34 | `protect-owner-role.sql` | 131 | función + trigger `protect_owner_role`; inserta `roles` | parcial |
| 35 | `protect-profile-self-escalation.sql` | 150 | función + trigger `protect_profile_self_escalation` | |
| 36 | `register-sale-payment.sql` | 96 | función `register_sale_payment` (inserta `payments`) | |
| 37 | `register-sale-void.sql` | 238 | función `register_sale_void`; revierte stock; **exige turno abierto** | |
| 38 | `reports-views.sql` | 134 | vistas `daily_sales_summary`, `product_performance`, `hourly_sales`, `waiter_performance` | |
| 39 | `restaurants-sedes-rls.sql` | 43 | 4 policies sobre `restaurants` | |
| 40 | `sale-void.sql` | 97 | `alter orders`: `cancelled_at/by`, `cancel_reason`; índice; **`update roles set permissions`**; índice único `idx_one_open_shift_per_store` | |
| 41 | `schema.sql` | 582 | 5 tipos enum; 9 tablas; 12 índices; funciones auxiliares; 9 triggers; RLS + 31 policies | parcial |
| 42 | `security-definer-revoke.sql` | 85 | `revoke execute ... from public` + `grant ... to authenticated` sobre 3 funciones; 2 `select` de verificación | |
| 43 | `seed-system-roles.sql` | 115 | **generado** desde `src/lib/permissions.ts`: función `seed_system_roles` | ✅ |
| 44 | `sent-to-kitchen.sql` | 2 | `alter order_items`: `sent_to_kitchen` | |
| 45 | `shift-closed-at-server-time.sql` | 60 | función + trigger `set_shift_closed_at` | |
| 46 | `shift-reconciliation.sql` | 29 | `alter cash_shifts`: `close_reconciliation`, `close_comment`; `select` de verificación | |
| 47 | `storage-product-images.sql` | 35 | bucket de storage + 4 policies | |
| 48 | `tables-waiting-bill.sql` | 8 | `alter type table_status add value 'waiting_bill'` | |

---

## 2 · Clasificación

### 2.1 · Asignación

**A — BASE TÉCNICA (viaja tal cual).** Multi-tenant, RLS, RBAC, auth, patrones de RPC.
`multi-tenant-rbac` · `seed-system-roles` · `profiles-is-active-enforced` ·
`profiles-organization-invariant` · `fix-enforce-profile-organization-definer` ·
`fix-profiles-store-switch-rls` · `profiles-active-store-rls` · `protect-owner-role` ·
`protect-profile-self-escalation` · `security-definer-revoke` · `restaurants-sedes-rls` ·
`config-profile-active` · `organization-subscription` · `storage-product-images` ·
`functions/create-user` · `functions/aplicar-estado` · `order-numbering`.

`order-numbering` va acá y no en zona gris a propósito: numera **ventas**, no mesas. Un mostrador
necesita el mismo consecutivo por sede que un restaurante.

**B — DOMINIO DE BAR (se borra).**
`cocina-por-sede` · `sent-to-kitchen` · `tables-waiting-bill` · `orders-waiter-name` ·
`delivery-couriers`.

⚠️ **Corregido el 2026-08-31 (decisión 1 de 4.4):** `shift-closed-at-server-time`,
`shift-reconciliation` y `caja-cierre-cuadre` **salieron de B y pasaron a C**. No se borran: los
turnos se quedan renombrados a jornada/caja. Son 101 líneas que cambiaron de clase por evidencia,
no por criterio.

**C — ZONA GRIS (sirve, necesita cambios).**
`compras-proveedores` · `compra-no-toca-caja` · `fiado-clientes` · `inventory-recipes` ·
`inventory-min-stock` · `products-allow-negative-stock` · `order-extras-rpc` ·
`order-items-stock-recipes` · `product-extras` · `register-sale-payment` · `register-sale-void` ·
`sale-void` · `orders-discount-vale` · `reports-views` · `cash-movements` ·
`shift-closed-at-server-time` · `shift-reconciliation` · `caja-cierre-cuadre`.

**D — SEED (se reescribe).**
`demo-seed` · `demo-seed-cafeteria` · `lab-seed` · `labcentro-org` · `onboard-org` ·
`onboard-org-paso1` · `onboard-org-paso3`.

### 2.2 · Los que caen en más de una clase — esto es la zona gris de verdad

**`schema.sql` (582 líneas) es tres clases a la vez, y se parte por tramos medidos**, no por
nombre de archivo:

| Parte | Líneas | Clase |
|---|---:|:--:|
| header, extensiones, `user_role` | 18 | A |
| `table_status` | 1 | **B** |
| `order_type`, `order_status`, `payment_method` | 5 | C |
| `restaurants`, `profiles`, funciones auxiliares, `handle_new_user`, sus policies y triggers | 211 | A |
| `categories`, `products`, `orders`, `order_items`, `payments` + índices, triggers y policies | 266 | C |
| `tables`: tabla, FK `orders.table_id`, `chk_dine_in_has_table`, 2 índices, trigger, 4 policies | 49 | **B** |
| `cash_shifts`: tabla, 2 índices, trigger, 3 policies | 56 | **C** (era B; ver 4.4) |

**`sale-void.sql` (97) cae en tres a la vez**: las columnas de anulación y su índice son **C** (la
anulación sobrevive en G-Nexo), el `idx_one_open_shift_per_store` es **B** (turnos), y el
`update roles set permissions` no va a ninguna clase porque es un **defecto** — ver H4.

**`inventory-recipes.sql` (219) es C entero — corregido el 2026-08-31.** `stock_movements` y
`adjust_stock` son la base del inventario de G-Nexo. Y `product_components`, que estaba anotado
como **B** por sonar a recetas, **pasa a C**: se conserva renombrado a la relación **bulto→unidad**
(paso 0, par 8). La unidad de compra difiere de la de venta y es estructuralmente el mismo
mecanismo. ⚠️ Los totales de 2.3 **no cambian**: el archivo ya estaba contado entero en C.

**`compras-proveedores.sql` (399)**: las tres tablas viajan como **C**, pero `register_purchase`
mezcla compra con caja y turno; `compra-no-toca-caja.sql` (150) ya lo redefine para desacoplarlo.

**`reports-views.sql` (134)**: tres vistas son **C** tal cual; `waiter_performance` es **C con
rename** — ver H7.

### 2.3 · Distribución medida, y por qué NO se puede comparar con el diagnóstico

| Clase | Líneas | % de `supabase/` | Diagnóstico |
|---|---:|---:|---:|
| A · base técnica | 2.642 | 28,5% | 21,7% |
| B · dominio de bar | 207 | **2,2%** | 24,6% |
| C · zona gris | 2.761 | 29,8% | 43,3% |
| D · seed | 3.670 | **39,5%** | 9,5% |
| | **9.280** | 100% | |

🔴 **Estas dos columnas no son comparables, y compararlas sería el error de proxy de R4 aplicado a
nuestra propia medición.** Los cuatro porcentajes del diagnóstico son sobre el **repo entero**
(39.351 líneas en 179 archivos: `src` + `supabase` + `tests`). Los míos son sobre **`supabase/`
solo**, que son 9.280 líneas — menos de una cuarta parte del repo. Las diferencias se explican por
el denominador, no por un fork que trajo algo que el diagnóstico no vio:

- **D salta a 39,5%** porque `demo-seed` + `demo-seed-cafeteria` + `lab-seed` son 2.897 líneas
  ellos solos, el 31% de `supabase/`. Diluidos en el repo entero pesan mucho menos.
- **B cae a 2,2%** —y bajó de 3,9% cuando los turnos pasaron a C (4.4)— porque el dominio de bar
  vive sobre todo en `src/` —pantallas de mesas, KDS,
  comanda—, no en SQL. En la base, mesas y cocina son **columnas y policies, no módulos**.

**Lo que esto sí significa para el plan:** borrar bar del SQL es barato (364 líneas). El trabajo
caro está en `src/` y en la zona gris. **No** significa que el diagnóstico esté desactualizado;
significa que todavía no lo verificamos, porque para eso hay que medir `src/` y `tests/` con este
mismo criterio. ⛔ **Pendiente, no hecho** (ver sección 5).

---

## 3 · Grafo de dependencias de lo que se borra (clase B)

### 3.1 · Los tres puntos que el prompt pedía verificar contra el SQL

**1 · `payments` NO tiene `shift_id` — CONFIRMADO.** Ninguna columna `shift_id` en `payments`; la
pertenencia al turno es temporal. Quien sí la tiene es `cash_movements`, y es **`not null`**.

**2 · `debt_payments.cash_movement_id` es FK real — CONFIRMADO, y la cadena es peor de lo que dice
la lista.** No es un salto, son dos, y el segundo es el que muerde:

```
debt_payments.cash_movement_id  →  cash_movements   (on delete SET NULL)
cash_movements.shift_id         →  cash_shifts      (NOT NULL, on delete CASCADE)
```

🔴 **Consecuencia:** borrar `cash_shifts` **borraría en cascada sus `cash_movements`**, y eso
**pondría en null el `cash_movement_id` de los abonos de cartera**. No falla y no avisa: la
cartera quedaría con los abonos intactos y **sin su rastro de caja**. Es el perfil de fallo
silencioso de R7 —número plausible, historia perdida— y ocurriría **durante la poda**, no en
producción.

✅ **Este hallazgo es el que revirtió la decisión: los turnos NO se podan** (4.4, decisión 1). La
cadena no se rompe — se conserva entera, y la FK `not null` pasa a ser una garantía deseada.

**3 · `add_order_items_with_extras` — REFUTADO PARCIALMENTE. No es "el único camino": es el único
camino *usado*.** La diferencia es la que importa:

- Camino vivo: `POSPage` y `TablesPage` llaman `addOrderItemsWithExtras`, que va a la RPC.
- **Pero `src/lib/supabase-helpers.ts` exporta `addOrderItems`, que hace
  `supabase.from('order_items').insert(items)` directo**, sin pasar por la RPC y por lo tanto
  **sin descontar stock**. Hoy no tiene ningún llamador (`updateOrderItem` tampoco; `removeOrderItem`
  **sí** lo tiene, en `TablesPage`).
- Y la policy `"order_items: staff crea"` **permite ese insert directo desde el cliente**: la RPC
  no es un cuello de botella impuesto por la base.

**La garantía real, con su límite (la regla nueva sin número):** *"todo ítem descuenta stock"* no
está garantizada por la base ni por RLS. Está garantizada **porque la UI llama a la RPC y nadie
usa el helper directo**. Es una convención, no un mecanismo. Un `import { addOrderItems }` en una
pantalla nueva rompe el inventario **sin un solo error**.

### 3.2 · Qué referencia a cada cosa que se borra

| Objeto B | Lo referencia | Tipo |
|---|---|---|
| `tables` | `orders.table_id` | FK `on delete set null` |
| `tables` | `chk_dine_in_has_table` en `orders` | constraint: obliga mesa si `type='dine_in'` |
| `tables` | `idx_tables_restaurant_id`, `idx_tables_restaurant_status` | índices |
| `tables` | `trg_tables_updated_at` | trigger |
| `tables` | 4 policies en `schema.sql` | RLS |
| `tables` | enum `table_status`, extendido por `tables-waiting-bill.sql` | tipo |
| `tables` | `demo-seed`, `lab-seed` | seeds |
| `cash_shifts` | `cash_movements.shift_id` | **FK not null, on delete cascade** |
| `cash_shifts` | `register_sale_void`, `register_debt_payment`, `register_purchase` | 3 RPC leen el turno abierto — **la razón por la que no se poda** (4.4) |
| `cash_shifts` | `idx_cash_shifts_one_open` **y** `idx_one_open_shift_per_store` | 2 índices duplicados (H3) |
| `cash_shifts` | `set_shift_closed_at` + `trg_shift_closed_at` | trigger |
| `cash_shifts` | `caja-cierre-cuadre`, `shift-reconciliation` | columnas agregadas |
| `cash_shifts` | 3 policies en `schema.sql` | RLS |
| cocina | `restaurants.uses_kitchen`, `products.routes_to_kitchen`, `order_items.sent_to_kitchen` | columnas |
| cocina | valores `preparing`, `ready` del enum `order_status` | tipo |
| `couriers` | `orders.courier_id`, `idx_orders_courier_id` | FK + índice |
| `orders.waiter_name` | vista `waiter_performance` | vista |

### 3.3 · Hallazgos — lo que la lista del prompt NO tenía

**H1 · La garantía del único camino de alta es una convención, no un mecanismo.** Detallado en
3.1.3. Al consolidar hay tres salidas: borrar `addOrderItems` del helper, cerrar la policy de
insert directo, o aceptarlo **y escribir que es una convención**. Lo que no se puede es seguir
diciendo "es el único camino" sin nombrar el mecanismo que lo sostiene.

**H2 · Tres RPC dependen del turno, no una.** El prompt dice que fiado es el único módulo con
dependencia estructural. Medido: `register_sale_void` **exige** turno abierto (la anulación solo
aplica al turno actual), `register_debt_payment` lo busca, y `register_purchase` también. Fiado es
el único con **FK**, pero los tres tienen **dependencia de comportamiento** y los tres sobreviven
en G-Nexo. Sacar turnos toca a los tres, no a uno.

**H3 · Índice único duplicado sobre `cash_shifts`.** `idx_cash_shifts_one_open` (en `schema.sql`)
e `idx_one_open_shift_per_store` (en `sale-void.sql`) son **el mismo índice con dos nombres**:
misma tabla, misma columna, mismo predicado `where closed_at is null`. Uno sobra. Y el comentario
de `compras-proveedores.sql` cita el primero, así que borrar "el otro" sin mirar deja un
comentario apuntando a un objeto inexistente.

**H4 · 🔴 `sale-void.sql` escribe el catálogo de permisos a mano.** Contiene
`update public.roles set permissions = permissions || '["ventas.anular"]'`. Es **exactamente el
lado que el generador de RBAC existe para eliminar** (deuda #7, R1 punto 1), y es el origen
documentado del residuo `ventas.anular`. Al esquema base **no entra**.

**H5 · 🔴 Ocho funciones están definidas en dos archivos cada una. Es un defecto de CLASE (R3) y
el riesgo principal de la consolidación.**

| Función | v1 | v2 — la que gana hoy por orden de aplicación |
|---|---|---|
| `add_order_items_with_extras` | `order-extras-rpc` | `order-items-stock-recipes` — **agrega descuento de stock** |
| `has_permission` | `multi-tenant-rbac` | `profiles-is-active-enforced` — **exige `is_active`** |
| `get_my_organization_id` | `multi-tenant-rbac` | `profiles-is-active-enforced` |
| `get_my_role` | `schema` | `profiles-is-active-enforced` |
| `get_my_restaurant_id` | `schema` | `profiles-is-active-enforced` |
| `handle_new_user` | `schema` | `profiles-organization-invariant` |
| `enforce_profile_organization` | `profiles-organization-invariant` | `fix-…-definer` — **`SECURITY DEFINER`**, R6 |
| `register_purchase` | `compras-proveedores` | `compra-no-toca-caja` — **desacopla caja** |

**Modo de fallo, y por qué es el riesgo principal:** hoy el **orden de aplicación** decide cuál
queda. Al consolidar ese orden **desaparece** y hay que elegir a mano. Elegir mal **no da error**:
da un `has_permission` que no verifica `is_active`, un `enforce_profile_organization` que evalúa
datos filtrados por RLS (el fallo de R6, ya pagado una vez en G-Vento), o un
`add_order_items_with_extras` que no descuenta stock. Los cuatro fallan **callados**.
**Regla para el prompt 3: de cada par entra la v2, y el archivo consolidado declara qué versión
tomó y qué le agregaba a la anterior.**

**H6 · Las vistas de reportes ya cumplen R7.** Las cuatro calculan
`(o.created_at at time zone 'America/Bogota')::date`. Viajan sin tocar la zona horaria — se anota
en positivo, para que nadie "arregle" lo que ya está bien.

**H7 · `waiter_performance` no mide mozos: mide usuarios.** Une por `o.created_by` contra
`profiles`; de mesas no tiene nada. El nombre miente, el contenido sirve. **Se renombra, no se
borra** — mismo caso que "extras" en el orden de poda de `CLAUDE.md`.

**H8 · Los enums son contratos rígidos y hay cuatro en juego.** `table_status`, `order_type`
(`dine_in`, `delivery`), `order_status` (`preparing`, `ready`) y `user_role` (`waiter`). Con el
esquema base sin aplicar, cambiarlos es **editar una línea**; después del primer `db push` es un
`ALTER TYPE` en producción referenciado por policies — el punto 8 del inventario de R1, que hoy
solo nombra `profiles.role`. **Es ahora, o es caro.** `payment_method` no se toca: es el contrato
de 8 lados del inventario de R1.

**H9 · Los dos demo-seeds replican a mano el descuento de stock.** Los dos traen el comentario
*"replicando `add_order_items_with_extras`"* y hacen sus propios `insert into stock_movements`. Es
un lado más del mismo contrato: si la RPC cambia, los seeds mienten en silencio. Se reescriben
igual (clase D), pero el plan deja dicho que **llamen a la RPC en vez de copiarla**.

---

## 4 · Plan de consolidación

### 4.1 · Los archivos propuestos

| Orden | Archivo | Qué entra |
|---:|---|---|
| 1 | `01-extensiones-y-tipos.sql` | extensiones; `user_role` (sin `waiter`), `order_status` (sin `preparing`/`ready`), `payment_method` **sin cambios**. **No** `table_status`, **no** `order_type` |
| 2 | `02-organizaciones-y-sedes.sql` | `organizations`, `restaurants`→**`sedes`**, `user_stores`, `roles`; triggers e índices |
| 3 | `03-perfiles-y-auth.sql` | `profiles` (+`is_active`), `handle_new_user` **v2**, `enforce_profile_organization` **v2 (`SECURITY DEFINER`)**, `protect_owner_role`, `protect_profile_self_escalation` |
| 4 | `04-funciones-auxiliares.sql` | `has_permission`, `get_my_role`, `get_my_sede_id`, `get_my_organization_id` — **todas v2, las que exigen `is_active`**; `revoke execute from public` en cada `SECURITY DEFINER` |
| 5 | `05-catalogo.sql` | `categories`, `products` (+`min_stock`, stock negativo permitido, **sin** `routes_to_kitchen`) |
| 6 | `06-ventas.sql` | `orders` (sin `table_id`, sin `chk_dine_in_has_table`, sin `waiter_name`, con anulación), `order_items` (sin `sent_to_kitchen`, **con costo unitario congelado — DECIDIDO, ver 4.4**), `payments`, `store_sequences`, `next_order_number` |
| 7 | `07-inventario.sql` | `stock_movements`, `adjust_stock`, y **`product_components` renombrado a bulto→unidad** (paso 0, par 8) |
| 8 | `08-compras.sql` | `suppliers`, `purchase_invoices`, `purchase_invoice_items`, `register_purchase` **v2** |
| 9 | `09-clientes-y-cartera.sql` | `customers`, `debt_payments`, `register_debt_payment` **conservando** su búsqueda de jornada abierta (4.4, decisión 1) |
| 10 | `10-caja.sql` | **`jornadas`** (ex `cash_shifts`, renombrada) y `cash_movements` con su FK **not null** intacta — ver 4.4, decisión 1 |
| 11 | `11-rls.sql` | todas las policies, en un solo lugar |
| 12 | `12-vistas.sql` | `daily_sales_summary`, `product_performance`, `hourly_sales`, `user_performance` (ex-`waiter_performance`) |

**Se descarta entero:** `tables`, `couriers` y todo lo de cocina
(**`cash_shifts` NO** — se renombra, ver 4.4); los 7 seeds de clase D; y los `fix-*` y `*-rls.sql`, cuyo contenido **no se pierde: se
absorbe** como v2 en los archivos 3 y 4.

### 4.2 · Qué pasa con los que en G-Vento son registro histórico

`multi-tenant-rbac.sql`, `schema.sql`, los `fix-*` y los `*-rls.sql` son, **en G-Vento**, el
registro de migraciones aplicadas: su valor allá es contar qué pasó y cuándo, y por eso su
comentario-catálogo está desactualizado **a propósito** (R5).

**En G-Nexo no son historia de nada**, porque nunca se aplicaron acá. Decisión: **su contenido
entra al esquema base ya consolidado, y los archivos no se conservan.**

Justificación: conservarlos crearía **dos descripciones del mismo esquema** —el archivo
consolidado y el histórico ajeno— sin nada que las sincronice. Es R1 en su forma más pura, con el
agravante de que la copia ajena **está desactualizada por diseño**: quien la lea va a razonar
sobre el esquema de otro producto en otro momento. Una nota que dirige mal cuesta más que una
ausente.

⚠️ Lo que sí se conserva es la **atribución**: cada archivo consolidado abre diciendo de qué
archivos de G-Vento `d848852` salió y **qué versión** tomó de cada función redefinida (H5). Es lo
único del registro histórico que tiene valor en este repo.

### 4.3 · El catálogo de permisos no se escribe a mano

Fuente `SYSTEM_ROLES` en `src/lib/permissions.ts` → `pnpm gen:rbac` →
`supabase/seed-system-roles.sql` → verifica `pnpm gen:rbac:check` (exit 0 confirmado el
2026-08-31). **Ningún `.sql` del esquema base lleva una lista de permisos**, y los seeds llaman
`seed_system_roles(v_org)`.

**Salen:** `cocina.acceder`, `mesas.cobrar`, `mesas.gestionar`, `delivery.gestionar`.
**Entran:** `compras.*`, `inventario.*`, `gastos.*`, `utilidades.*`.

Es la **deuda #23** y va **después** de este plan, no ahora: las claves nuevas se derivan de las
tablas que existan, no al revés. Tres condiciones que ya están escritas y son justo las que se
olvidan: cada clave nueva necesita su `can()` que la consuma (en G-Vento 6 no gateaban nada y
fallaban **abierto**); toda clave enforzada tiene que estar en `PERMISSION_GROUPS` o no se puede
conceder desde la UI (le pasó a `ventas.anular`); y `admin` sigue siendo `ALL_PERMISSION_KEYS`
**derivado**, nunca enumerado.

🔴 **El `update roles set permissions` de `sale-void.sql` (H4) no viaja.**

### 4.4 · Las dos decisiones que este plan dejaba abiertas — RESUELTAS el 2026-08-31

✅ **1 · G-Nexo SÍ tiene turnos de caja. Se quedan, renombrados a jornada/caja.** Contradice el
documento de traspaso y el orden de poda original; **la evidencia mandó**. Las razones están
medidas en 3.1.2 y H2: `cash_movements.shift_id` es `not null` con `on delete cascade`, tres RPC
leen el turno abierto —incluida `register_purchase`, y compras está en el alcance firmado—, y
borrarlos deja los abonos de cartera **sin rastro de caja, en silencio**.

**Un turno de bar es un cambio de mesero; acá es el cierre de caja del día.** El mecanismo sirve,
la palabra no. Mismo patrón que `extras` y `waiter_performance`: suena a bar y sostiene peso.

**Consecuencia para el plan:** el archivo 10 deja de ser "caja sin turnos". `cash_shifts` viaja
renombrada, `cash_movements` conserva su FK **not null** —que ahora es una garantía deseada, no un
estorbo—, y `register_debt_payment` **mantiene** su búsqueda de jornada abierta en vez de
desacoplarse. El punto 1 de 4.5 (romper la cadena antes de tocar turnos) **queda sin objeto**: la
cadena se conserva entera.

✅ **2 · El costo unitario congelado entra en `order_items` desde el día uno.** Y la razón no es
que ahora sea barato: **es que después no se puede.** Si la tabla nace sin la columna, las ventas
ya registradas **no se pueden rellenar** —el costo al momento de vender es irrecuperable y
cualquier backfill sería inventado—, y las utilidades de ese período quedan mal **para siempre**,
con la forma de fallo de R7: plausibles, estables y equivocadas. No es una decisión cara, es una
**irreversible**. Ver R1 punto 8 y la deuda #18.

### 4.5 · Orden de ejecución para el prompt 3

✅ **Paso 0 — HECHO el 2026-08-31: `docs/paso-0-funciones-duplicadas.md`** (commit propio, antes
del esquema). Las ocho decididas: seis por evidencia técnica y **dos preguntadas**, porque la
diferencia era de negocio y de modelo de datos, no un defecto. Lo que sigue vale como criterio
para la novena que aparezca:
Para cada par de H5: **diff de las dos definiciones, cuál gana, y por qué — escrito**. No se elige
por fecha ni por archivo: **por lo que hace el cuerpo**. Un `create or replace` posterior no es
evidencia de que sea el bueno, es evidencia de que se aplicó después.

Dos ya están verificadas contra el SQL, y las dos muestran por qué el criterio corto no alcanza:

| Función | Gana | Verificado |
|---|---|---|
| `enforce_profile_organization` | `fix-enforce-profile-organization-definer` | Es la única con `security definer`, **y además agrega los `revoke execute`**. ⚠️ `profiles-organization-invariant.sql` **sí contiene** un `security definer`, pero es de `handle_new_user`, otra función del mismo archivo: grepear el modificador sin mirar de quién es da la respuesta **contraria**. Es la evidencia de R6, ya pagada una vez en G-Vento. |
| `has_permission` | `profiles-is-active-enforced` | Agrega **dos** cosas, no una: `p.is_active` **y** `r.permissions ? '*'`. Con la v1, un owner cuyo rol tiene el comodín `'*'` **se queda sin permisos**. Elegir por "la que verifica `is_active`" acierta por la razón incompleta. |

Las otras seis —`add_order_items_with_extras`, `get_my_role`, `get_my_restaurant_id`,
`get_my_organization_id`, `handle_new_user`, `register_purchase`— siguen **sin diff hecho**. La
presunción es que gana la v2 de la tabla de H5, pero **presunción no es verificación** (R4): las
dos que sí se miraron tenían algo que la presunción no veía.

Después de eso:

1. Escribir los 12 archivos, tomando la versión decidida en el paso 0 y **anotando cuál es y qué
   le agregaba a la otra**.
2. Renombrar `restaurant_id` → `sede_id`, `cash_shifts` → jornada/caja, y la marca heredada
   **en la misma pasada** (deudas #3 y #21).
3. Regenerar el catálogo (deuda #23) y correr `pnpm gen:rbac:check`.
4. Recién ahí, el primer `db push`. **Desde ese momento R5 aplica con todo su peso.**
---

## 5 · Lo que NO pude verificar — pendiente, no hecho

- ⛔ **Nada de esto se ejecutó contra una base.** Es lectura de archivos: `tsc` no prueba el SQL, y
  esto ni siquiera es `tsc` (R4). Las FK, las cascadas y las policies están leídas del texto, no
  observadas en `information_schema`. La cadena de 3.1.2 es la que más merece verificarse contra
  la base real antes de actuar sobre ella.
- ⛔ **La distribución de `src/` y `tests/` no está medida**, así que la comparación con los cuatro
  porcentajes del diagnóstico sigue abierta (2.3).
- ⛔ **No verifiqué que las 31 policies de `schema.sql` sean las vigentes.** Varios archivos hacen
  `drop policy if exists` + `create policy` sobre `profiles` y `restaurants`; el conteo real de
  policies vivas solo se sabe contra la base.
- ⛔ **Los `grant`/`revoke` no están auditados uno por uno.** `security-definer-revoke.sql` cubre
  3 funciones, y en el repo hay más funciones `SECURITY DEFINER` que ésas.
