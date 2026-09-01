# Poda de `src` — ENUMERACIÓN. Ninguna línea borrada todavía.

*Levantada el 2026-08-31. Este documento es el paso previo obligatorio: la regla de poda de
`CLAUDE.md` dice que **el que borra tiene que mostrar la enumeración**, y que la carga de la
prueba está invertida — no se borra salvo que se demuestre que no sostiene nada.*

---

## 0 · Por qué esta poda NO es opcional

Las cuatro podas anteriores que salieron mal (extras, turnos, recetas, `waiter_performance`) se
propusieron por **sonar a bar**. Ésta no. El esquema base ya está escrito y **no tiene las columnas**, así que los
consumidores no están "de más": están **rotos**.

Verificado leyendo `supabase/migrations/`, no el plan:

| Lo que `src/` consume | En el esquema base |
|---|---|
| tabla `tables` | **no existe** — ninguna migración la crea |
| `orders.table_id` | **no existe** — `20260831120600_ventas.sql:14` lo dice explícito |
| `orders.order_type` | **no existe** — `orders` no tiene esa columna |
| enum `order_status` con `preparing` / `ready` | **`('pending', 'delivered', 'cancelled')`** — tres valores |
| `sedes.uses_kitchen` | **no se creó** — `20260831120100:107` |
| `products.routes_to_kitchen` | **no viaja** — `20260831120500:13` |
| `order_items.sent_to_kitchen` | **no existe** |
| `daily_sales_summary.order_type` | **la vista no tiene esa columna** |

> ## ⛔ NO LEAS EL VERDE DE ESTA PODA COMO VALIDACIÓN
>
> **`tsc` va a dar exit 0 durante toda esta tarea, y va a estar verde por una razón falsa.**
> `src/types/database.types.ts` está **escrito a mano** (R1 punto 5) y todavía declara
> `order_type`, `preparing`, `ready` y la tabla `tables`. El compilador no compara contra la base:
> compara contra ese archivo. **Está validando `src/` contra un esquema que ya no existe.**
>
> El rojo real aparece **al regenerar los tipos después del push**, no antes. Cualquier "quedó
> verde" que se diga en el medio de esta poda mide la coherencia de `src/` con una ficción — es
> exactamente el corolario de R4: *una verificación que no podía haber salido mal no es una
> verificación*.

---

## 1 · Sin consumidor fuera de sí mismos — borrado limpio

Un `grep` que vuelve vacío es demostración válida y barata. Estos la tienen.

| Archivo | Líneas | Quién lo consume |
|---|---|---|
| `src/pages/TablesPage.tsx` | 1.882 | solo `App.tsx` (import + ruta `mesas`) |
| `src/pages/KitchenPage.tsx` | 823 | solo `App.tsx` (import + ruta `cocina`) |
| `src/pages/DeliveryPage.tsx` | 872 | solo `App.tsx` (import + ruta `delivery`) |
| `src/hooks/useTables.ts` | 129 | solo `TablesPage` |
| `src/hooks/useDelivery.ts` | 209 | solo `DeliveryPage` |
| `src/hooks/useDeliveryCount.ts` | 52 | solo `AppLayout` (el badge del nav) |

**Subtotal: 3.967 líneas.**

Ediciones que arrastran, todas mecánicas:

- `src/App.tsx` — 3 imports (13–15) y 3 rutas (58 `cocina`, 65 `mesas`, 69 `delivery`).
- `src/components/layout/AppLayout.tsx` — 3 ítems de nav (59–61), el import y la llamada a
  `useDeliveryCount` (27, 107), y `sedeUsesKitchen` (125).

---

## 2 · 🔴 SOSTIENE PESO — acá está el riesgo real

### 2.1 · `tests/helpers/tables.ts` es fixture de tres specs que SOBREVIVEN

Éste es el hallazgo que cambia la forma de la tarea. `openTableAndAddItems()` (25 líneas) no lo usan
solo los specs de mesas: lo usan specs de **módulos que se quedan**, porque la mesa era el camino
más corto para dejar una venta armada.

| Spec | Módulo que prueba | ¿Sobrevive? | Dónde llama al helper |
|---|---|---|---|
| `cocina.spec.ts` | cocina | ✗ se va | :73 |
| `observaciones-cocina.spec.ts` | cocina | ✗ se va | :49 |
| `recibo-mesa.spec.ts` | mesas | ✗ se va | :45 |
| **`fiado.spec.ts`** | **cartera** | **✓ SE QUEDA** | **:321** |
| **`pago-mixto.spec.ts`** | **pagos** | **✓ SE QUEDA** | **:263** |
| **`vale-descuento.spec.ts`** | **descuentos** | **✓ SE QUEDA** | **:112** |

**Borrar `TablesPage` sin tocar esto deja tres specs de módulos vivos apuntando a una pantalla que
no existe.** No fallan al compilar: fallan al correr, buscando un botón "Abrir mesa" que ya no está
— y el mensaje va a hablar de un locator, no de la poda.

🔴 **QUINTO CASO del patrón, y una VARIANTE que las cuatro anteriores no tenían.** En turnos,
extras, recetas y `waiter_performance`, la pieza que sostenía peso estaba **en el producto**. Acá
la pantalla **sí se va** —esa parte de la clasificación era correcta—: lo que sostiene peso es el
**camino de fixture**, y vive en `tests/`.

**Lo que agrega al procedimiento de poda:** la lista de "¿qué cuelga de esto?" incluye
`seeds y tests`, pero se lee como *"¿quién la puebla?"*. Este caso dice que hay que leerla más
ancha: **¿quién la usa para LLEGAR a otra cosa?** Una pantalla puede no tener ningún consumidor de
producto y ser, aun así, el único camino por el que tres specs vivos arman su estado inicial.

### 2.2 · `src/lib/supabase-helpers.ts` — bloque `// --- Tables ---` (~281–335)

| Función | Se va | Nota |
|---|---|---|
| `getTables` · `createTable` · `updateTable` · `deleteTable` · `updateTableStatus` | ✓ | tabla inexistente |
| `getTableActiveOrderCount` · `getActiveOrderByTable` · `getActiveOrdersForTables` | ✓ | usan `table_id` **y** `.in('status', [...preparing, ready])` |
| `markItemsSentToKitchen` | ✓ | `sent_to_kitchen` |
| **`ORDER_ITEMS_WITH_EXTRAS`** | ⚠️ **NO se borra: se corrige** | la constante nombra `sent_to_kitchen` y `routes_to_kitchen`, pero es el `select` de ítems con extras — **extras se queda** |

### 2.3 · Componentes de módulos que se quedan

| Archivo | Qué tiene | Decisión |
|---|---|---|
| `src/components/products/ProductModal.tsx` | toggle `routesToKitchen` (73, 78, 154) | el modal **se queda**; se le saca el campo |
| `src/pages/ConfigPage.tsx` | `usesKitchen` + `toggleUsesKitchen` (869–873) | ConfigPage **se queda**; se le saca la sección |
| `src/lib/printer.ts` | `printComanda` + `ComandaData` (79–113) | **solo lo usa `TablesPage:1418`**. `printSaleTicket` lo usan `SalesHistoryPage` y `TablesPage` → **se queda** |

---

## 3 · 🔴 Lo que la lista original NO tenía — aparecido al enumerar

Sexto caso del patrón "aparece al ejecutar/enumerar, no al planificar/leer" — el quinto fue la
regex de `global-setup`. La lista de la que
veníamos era *"KitchenPage, DeliveryPage, mucho de TablesPage, más POSPage/routing/nav/3 hooks"*.
Faltaba esto:

### 3.1 · Reportes rotos por `order_type`, no por mesas

> ✅ **DECIDIDO: la dimensión "Canal" NO se saca — se RE-VALORIZA.** Con `order_type` vivo deja de
> ser una etiqueta heredada y pasa a ser la pregunta que el cliente va a querer hacer: **cuánto
> entra por mostrador contra cuánto por WhatsApp.** Sede y vendedor son dimensiones **distintas**,
> no reemplazos. Lo que hay que arreglar es que la **vista** perdió la columna, no la pantalla.

`daily_sales_summary` **ya no tiene `order_type`** en el esquema base. Rompe a:

- `src/hooks/useDailySummary.ts:30` — `.order('order_type')` sobre una vista sin esa columna.
  Y `by_channel: DailySalesRow[]` deja de tener sentido: **la vista ahora devuelve una fila por
  día/sede**, no una por canal.
- `src/pages/ReportsPage.tsx:147-149` — agrupa por `r.order_type`.
- `src/pages/ReportsPage.tsx:292, 302` — **la columna "Canal" del export a Excel.**

⚠️ **Esto no es poda de bar: es un reporte que sale mal.** `useDailySummary` reduce con
`?? 0`, así que ante columnas ausentes **no revienta: devuelve totales plausibles**. Perfil exacto
de R7 — el cliente lo detecta antes que nosotros.

### 3.2 · `SalesHistoryPage` y `POSPage` — el tipo de venta

- `src/pages/POSPage.tsx` — `OrderType`, `DEFAULT_ORDER_TYPE`, el selector de canal (487–511), el
  `type: orderType` que se manda al crear (900), el reset (1943), y la etiqueta del ticket (123–135).
  **~18 puntos.** La página **se queda**: se le saca el concepto.
- `src/pages/SalesHistoryPage.tsx` — `ORDER_TYPE` (47–52), la etiqueta en la fila (187) y en el
  export (586). **Se queda; se le saca la columna.**

### 3.3 · `src/lib/sentry.ts:277` y `src/lib/sentry.test.ts`

El comentario nombra `orders.order_type` como uno de los tres enums `type`. Es un **contrato
enumerado a mano** (R1 punto 6): la tabla de columnas de `sentry.test.ts` tiene 74 entradas y hay
que revisarla en la misma pasada, no después.

---

## 4 · Specs E2E

| Spec | Líneas | Decisión |
|---|---|---|
| `cocina.spec.ts` | 164 | borrar |
| `observaciones-cocina.spec.ts` | 105 | borrar |
| `recibo-mesa.spec.ts` | 95 | borrar |
| `mesas.spec.ts` | 60 | borrar |
| `delivery.spec.ts` | 28 | borrar |
| `tipo-venta-reset.spec.ts` | 74 | borrar — prueba el reset de `orderType` |
| `tests/helpers/tables.ts` | 25 | borrar **después** de migrar a sus 3 consumidores vivos |
| `fiado.spec.ts` · `pago-mixto.spec.ts` · `vale-descuento.spec.ts` | 413 · 347 · 331 | ⚠️ **editar**, no borrar (ver 2.1) |
| `anular-venta.spec.ts:116` | 477 | ⚠️ **editar** — siembra `status: 'preparing'`, valor que el enum ya no tiene |
| `rbac.spec.ts` | 71 | ⚠️ **editar** — 6 menciones a permisos ya eliminados del catálogo |
| `config.spec.ts` | 77 | ⚠️ **editar** — 1 mención (toggle de cocina) |

---

## 5 · Cuenta total

| | Líneas |
|---|---|
| Borrado limpio en `src/` (grupo 1) | **3.967** |
| Borrado limpio en `tests/` | **551** |
| Archivos que se **editan**, no se borran | 9 en `src/`, 5 en `tests/` |

---

## 6 · ✅ DECIDIDO (2026-09-01) — las cuatro, resueltas

1. **`order_type` SE QUEDA.** El argumento que ganó es el de `unit_cost`: *"pedido por
   WhatsApp/teléfono"* está en el **alcance firmado**, y eso es un canal. Borrar la columna es
   barato hoy; **un canal que no se registró es irrecuperable** — re-agregarla no rellena las
   ventas anteriores. Se queda la **columna**; se van los **valores de bar**.
   ⛔ El **allowlist de valores** es decisión de producto y está en revisión (ver §8).
2. **"Canal" en Reportes se RE-VALORIZA**, no se saca. Ver 3.1.
3. **El fixture nuevo va en el MISMO commit** que borra `TablesPage`. La suite no queda roja ni un
   commit — *un rojo permanente esconde a los rojos nuevos*.
4. **Orden de commits aprobado** tal como estaba propuesto.

### Lo que era esto antes de decidirse

1. **El fixture de los tres specs vivos.** ¿Se reemplaza `openTableAndAddItems` por un helper
   equivalente sobre el POS —`abrirVentaConItems()`— **en el mismo commit** que borra `TablesPage`?
   Es la opción que no deja los specs rotos ni un commit. La alternativa (borrar ahora, arreglar
   después) deja la suite roja en el medio, y **un rojo permanente esconde a los rojos nuevos** —
   la lección de ayer.

2. **`ReportsPage` y el canal.** Sacar la dimensión "Canal" es **quitar una columna del export a
   Excel** que un cliente podría estar usando. Hoy no hay clientes con datos, así que el costo es
   cero — pero es una decisión de producto, no de poda. ¿Se saca, o se reemplaza por otra dimensión
   (sede, vendedor)?

3. **`order_type` en el POS: ¿se va del todo, o queda un canal?** Nodo vende sobre mostrador y el
   cliente carga y se lleva. Si mañana aparece "pedido por WhatsApp/teléfono" —que **sí está en el
   alcance**— eso es un canal de venta. Borrar la columna es barato hoy; **volver a agregarla no
   rellena las ventas anteriores**, que es el mismo argumento que ganó con `unit_cost`.
   🔴 **Ésta es la única de las cuatro que es irreversible.**

4. **Orden de los commits.** Propongo: (a) fixture nuevo + los 3 specs vivos migrados; (b) borrado
   de páginas/hooks/rutas/nav; (c) `order_type` y `preparing`/`ready` en los consumidores que se
   quedan; (d) `sentry.test.ts` y el catálogo de columnas. `tsc` verde entre cada uno — sabiendo
   que **`tsc` verde no prueba nada acá** hasta regenerar los tipos.

---

## 7 · Lo que este documento NO cubre

- **`database.types.ts`** se regenera después del push; no se edita a mano de nuevo.
- **`supabase/_heredado/`** no se toca: es registro de procedencia.
- El **renombre `restaurant_id` → `sede_id`** en `src/` es otro trabajo, con su propia enumeración
  (R1 punto 7 dice que va **después** de podar, justamente para tener menos ocurrencias).


---

## 8 · ⛔ EN REVISIÓN — el allowlist de `order_type` para Nodo

*Levantado el 2026-09-01, después de que la decisión "la columna se queda" quedara tomada. Esto es
lo único de este documento que **no** está decidido.*

### 8.1 · Qué hay hoy — enumerado, no recordado

```sql
-- supabase/_heredado/schema.sql:20
create type public.order_type as enum ('dine_in', 'takeaway', 'delivery');
```

**Tres valores. Ni uno más.** Uso en todo el repo: `'delivery'` ×20 · `'takeaway'` ×19 ·
`'dine_in'` ×14.

Y hay **un solo lugar del producto que escribe el valor**: `POSPage.tsx:900` (`type: orderType`).
Los otros dos escritores se van con la poda — `TablesPage.tsx:212` (`'dine_in'` fijo) y el seed de
`anular-venta.spec.ts:116`.

⚠️ **La columna se llama `orders.type`, no `orders.order_type`.** `order_type` es el nombre del
*tipo*. Lo anoto porque los tres greps que hice buscando `order_type` **no encontraban la columna**.

📋 **Estado en el esquema base: no existe nada.** Ni el tipo ni la columna. Y la decisión de
sacarlo está escrita en **tres lugares** que hay que revertir en la misma pasada:
`20260831120000_extensiones_y_tipos.sql:80` · `20260831120600_ventas.sql:12` ·
`20260831121400_vistas.sql:31`. Las migraciones **no se aplicaron todavía**, así que se editan;
R5 empieza a regir después del push.

### 8.2 · Propuesta

| Valor | Qué significa | Por qué |
|---|---|---|
| `mostrador` | el cliente está físicamente en el mostrador | el caso dominante; reemplaza a `takeaway` |
| `whatsapp` | el pedido entra por WhatsApp | **está en el alcance firmado** |
| `telefono` | el pedido entra por teléfono | **está en el alcance firmado** |

**Tres valores, igual que hoy.** No es coincidencia buscada: es que el eje **no cambió de forma**,
cambió de contenido. Sigue siendo *"¿por dónde entró el pedido?"*.

### 8.3 · 🔴 `preventa` NO entra, y quiero que mires este argumento

Estaba en la lista de candidatos y **lo dejo afuera a propósito**, porque no es del mismo eje:

> `mostrador` / `whatsapp` / `telefono` responden **por dónde entró** el pedido.
> `preventa` responde **quién lo originó**.

Un preventista que toma el pedido **por WhatsApp** obliga a elegir uno de los dos, y cualquiera de
las dos respuestas pierde información. Es la forma clásica de mezclar dos dimensiones en una
columna: el día que quieras cruzarlas, el dato **ya no está**.

Y la otra punta ya existe: **`orders.created_by`** dice quién cargó el pedido. Si preventa necesita
distinguirse, es un atributo del **usuario o del rol**, no del canal.

⚠️ Si preferís que entre igual, entra — pero entonces la columna deja de ser "canal" y pasa a ser
"origen", y el nombre tiene que decirlo.

### 8.4 · Tres decisiones de forma que van con el allowlist

1. **`text` + `CHECK`, NO enum.** Es la lección de R1 punto 3, ya pagada: Postgres **no tiene
   `ALTER TYPE ... DROP VALUE`**. Ampliar un CHECK es un `drop`/`add constraint` trivial; sacar un
   valor de un enum, no. Los canales van a crecer. El esquema base ya eligió esto dos veces
   (`subscription_status`, `cash_movements.categoria`).
2. **Renombrar la columna `orders.type` → `orders.canal`.** `type` no dice nada y ya hay tres
   columnas `type` en el esquema. Va en la misma pasada porque **todos sus consumidores se tocan
   igual** en el commit (c): el costo marginal es cero, y hacerlo después es otra enumeración.
3. **`not null` y SIN default.** Un default —`'mostrador'`— convierte un insert que se olvidó del
   canal en un dato **plausible y falso**, justo en la columna que existe para medir canales.
   Perfil de R7. Hay **un solo escritor**, así que exigirlo cuesta una línea y convierte la omisión
   en un error ruidoso. Es el mismo criterio que dejó `profiles.role` sin default.
4. **Sin `'otro'`.** En `cash_movements.categoria` sí lo pusimos, con detalle obligatorio, porque
   ahí el universo era abierto. Acá son tres valores y ampliar es trivial: **`'otro'` solo crearía
   un balde donde se esconderían los canales reales** en vez de nombrarlos.


---

## 9 · 🔴 La enumeracion tenia un hueco, y aparecio al ejecutarla

*Anotado el 2026-09-01, durante el commit de Delivery.*

Este documento decia que Delivery eran **tres archivos y dos ediciones mecanicas**: `DeliveryPage`,
`useDelivery`, `useDeliveryCount`, mas la ruta y el item de nav. Al borrarlos y grepear el residuo
aparecio que Delivery era **bastante mas**:

| Lo que faltaba | Donde |
|---|---|
| **El modulo de repartidores entero** — `CourierFormModal` + `SectionDelivery` | `ConfigPage.tsx`, ~205 lineas |
| 5 helpers de `couriers` + `getDeliveryOrders` + `assignOrderCourier` | `supabase-helpers.ts` |
| `default_delivery_time` y `delivery_sound` | `useSedeConfig.ts` |
| La seccion en `SectionId`, en `SECTIONS` y en el map de render | `ConfigPage.tsx` |
| El aviso sonoro "Delivery — nueva orden" | `ConfigPage.tsx`, seccion Notificaciones |

⚠️ **La tabla `couriers` no existe en el esquema base** — cero ocurrencias en `supabase/migrations/`.
O sea que no era residuo cosmetico: era codigo que consulta una tabla inexistente.

**Por que se escapo, que es lo unico que importa.** La enumeracion se hizo grepeando
`KitchenPage|DeliveryPage|TablesPage` y los conceptos `order_type`, `preparing`, `table_id`.
**`courier` no estaba en ninguna de las dos listas.** Un modulo satelite no se llama como el modulo
del que cuelga, y por eso ningun grep del padre lo encuentra.

**Septimo caso del patron "aparece al ejecutar, no al planificar"** — y el primero en el que lo que
fallo fue *la enumeracion misma*, que es justamente el instrumento que existe para que esto no pase.

🔴 **Lo accionable, y va a la checklist de poda:** despues de borrar, **grepear la palabra del
modulo y leer el residuo**. No para confirmar que da cero —nunca da cero— sino para **descubrir los
satelites que no se llaman como el padre**. Los cinco items de la tabla salieron de un solo
`grep -rn "delivery|Delivery" src/` corrido *despues* del borrado.

### Estado del commit de Delivery

Borrado limpio: `DeliveryPage.tsx` (872) · `useDelivery.ts` (209) · `useDeliveryCount.ts` (52) ·
`tests/delivery.spec.ts` (28). Editados: `App.tsx`, `AppLayout.tsx`, `ConfigPage.tsx`,
`supabase-helpers.ts`, `useSedeConfig.ts`.
`tsc --noEmit` exit **0** · `pnpm test:unit` **280 passed, exit 0**.
⚠️ Con la advertencia del bloque de arriba puesta: **ese verde no valida el esquema.**


---

## 10 · Commit (c) — el canal, y la segunda vez que el corolario cambio una decision

*2026-09-01.*

**`orders.canal` entra al esquema base**: `text` + CHECK con allowlist de tres —`mostrador`,
`whatsapp`, `telefono`—, `not null` y **sin default**, sin `'otro'`. Se revirtieron las **tres**
notas que documentaban haber sacado el eje (`extensiones_y_tipos`, `ventas`, `vistas`) y la vista
`daily_sales_summary` recupero la dimension. Indice `idx_orders_canal (sede_id, canal)`.

⚠️ La distincion que quedo escrita en las tres notas: **lo que era de restaurante eran los VALORES,
no la pregunta.** "Por donde entro el pedido" es igual de real en una distribuidora.

### `tipo-venta-reset.spec.ts` NO se borro — la enumeracion decia que si

Este documento lo listaba en la tabla de specs con la decision **"borrar — prueba el reset de
`orderType`"**. Al aplicar la segunda pregunta del corolario —**de que propiedad depende**— resulto
que no dependia ni de mesas ni de los valores de bar: depende de que **exista un selector de canal
en el POS**. El canal sobrevivio, asi que el invariante sobrevive con el.

Y lo que ese spec protege no es cosmetico: el bug original era que el canal **quedaba pegado** entre
ventas, asi que una venta de mostrador se grababa con el canal anterior. **Es exactamente el modo de
fallo de R7** —no revienta, ensucia el reporte— sobre la columna que existe para medir canales.

🔴 **Segunda vez en dos dias que la segunda pregunta cambia una decision ya tomada.** La primera fue
VENTA GRATIS, que se salvo del borrado; esta es la simetrica: un spec que la enumeracion daba por
muerto y estaba vivo. **La primera pregunta produce una lista; la segunda produce la decision.**

⚠️ Un detalle del helper migrado, que es una trampa de fixture: el bucle que cicla el selector
tenia limite 3 con **dos** canales. Con tres canales, un limite igual al numero de canales **no
distingue "el canal no existe" de "no llegue a el"** —con exactamente N clicks se vuelve al punto de
partida—. Quedo en `CANALES + 1`.

### Estado

`tsc` exit 0 · `eslint src/` exit 0 · `test:unit` 280 passed · residuo de
`order_type|orderType|dine_in|takeaway|preparing|ready` en `src/` y `tests/`: **cero**.

⛔ **Lo que NO se toco y sale con la regeneracion de tipos:** `database.types.ts` sigue declarando
`tables`, `couriers`, `orders.table_id`, `orders.waiter_name` y `courier_id`. Se movio **solo** lo
que `src/` consume (`canal`, y el enum `order_type` que se elimino). El resto **no se edita a mano
otra vez**: sale del `supabase gen types` posterior al push. Editarlo mas seria repetir el
anti-patron de R1 punto 5, que es la razon por la que este archivo miente hoy.
