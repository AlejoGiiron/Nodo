# Poda de `src` — ENUMERACIÓN. Ninguna línea borrada todavía.

*Levantada el 2026-08-31. Este documento es el paso previo obligatorio: la regla de poda de
`CLAUDE.md` dice que **el que borra tiene que mostrar la enumeración**, y que la carga de la
prueba está invertida — no se borra salvo que se demuestre que no sostiene nada.*

---

## 0 · Por qué esta poda NO es opcional

Las tres podas anteriores que salieron mal (extras, turnos, recetas) se propusieron por **sonar a
bar**. Ésta no. El esquema base ya está escrito y **no tiene las columnas**, así que los
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

⚠️ **`tsc` NO ve nada de esto.** `src/types/database.types.ts` está **escrito a mano** (R1 punto 5)
y todavía declara `order_type`, `preparing`, `ready` y la tabla `tables`. El compilador está en
verde contra un tipo que describe un esquema que ya no existe. **El rojo recién aparece al regenerar
los tipos después del push** — que es exactamente el orden en que esto va a explotar si no se poda
antes.

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

⚠️ Es literalmente el patrón de las cuatro podas anteriores: **la etiqueta era de bar, la pieza
sostenía peso.** Acá la pieza no es la pantalla —esa sí se va— es el **camino de fixture**.

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

Cuarto caso del patrón "aparece al ejecutar/enumerar, no al planificar". La lista de la que
veníamos era *"KitchenPage, DeliveryPage, mucho de TablesPage, más POSPage/routing/nav/3 hooks"*.
Faltaba esto:

### 3.1 · Reportes rotos por `order_type`, no por mesas

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

## 6 · 🔴 Lo que NO decido solo — cuatro preguntas

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
