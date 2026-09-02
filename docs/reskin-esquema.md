# Cada campo que la skill dibuja, contra las columnas que existen

*2026-09-01. Enumeración completa de las nueve pantallas, hecha de una vez y a propósito: el cupo
y el código/unidad aparecieron **el mismo día** enumerando columnas, y descubrirlos de a uno cuesta
una interrupción por pantalla.*

## Cómo se hizo, y su límite

**Fuente del diseño:** las nueve capturas de `docs/reskin-referencia/` — cada campo que se ve
dibujado, no lo que el documento dice en prosa.

**Fuente del esquema:** `src/types/database.types.ts`, que es **generado** por
`supabase gen types typescript --linked`, más los `CHECK` y enums leídos directo del SQL de
`supabase/migrations/`.

⚠️ **El límite que tenía — y su cierre.** Cuando se escribió esta enumeración la sesión **no tenía
el token de Supabase**, así que la comparación se hizo contra el archivo generado en una sesión
anterior: un proxy, aunque uno **generado por la herramienta desde la base** y no escrito a mano.

✅ **RECONFIRMADO el 2026-09-01**, regenerando los tipos contra la base real. El diff es
**puramente aditivo**: las dos columnas de la deuda 43 recién creadas, la firma de
`seed_system_roles` y el bloque `graphql_public` que el generador ahora emite. **Cero columnas
removidas y cero modificadas**, así que ningún hueco de esta lista era un artefacto del proxy ni
falta ninguno por haberlo mirado ahí. La tabla de abajo se lee como verificada contra la base.

*(Volver a comprobarlo después de cualquier migración:
`pnpm db:types && git diff --exit-code src/types/database.types.ts`.)*

**27 tablas y vistas** en el esquema. Lo que sigue es campo por campo.

⚠️ **Lo que esta tabla NO contesta, y aparecio despues:** enumerar columnas dice *dónde se
guarda* cada dato — no dice *cómo llega*. El bloqueo de arranque más grande (no hay import masivo
de catálogo, deuda 50) es invisible para este método por construcción. Ver
`docs/balance-esquema-alta.md`.

---

## Resumen: 10 huecos, en 6 pantallas — **1 ya cerrado**

*(Eran 9. El décimo apareció al construir Compras, no al enumerar: el §4 reserva su color más fuerte para "Anular compra", y esa acción no existe en ninguna capa. Confirma el corolario — construir una pantalla audita un esquema aún mejor que leerla.)*

| # | Hueco | Pantallas | Deuda |
|---|---|---|---|
| 1 | **Código de producto** | Mostrador, Pedidos, Compras, Catálogo, Inventario | 41 |
| 2 | **Unidad de medida** | Mostrador, Catálogo, Inventario | 41 |
| 3 | **Cupo de crédito** (asignado · consumido · disponible) | Mostrador, Pedidos, Clientes | 40 |
| 4 | ~~Unidad de COMPRA y su equivalencia~~ | Compras | ✅ **43 CERRADA** (2026-09-01) |
| 5 | **Fecha del documento ≠ fecha de registro** | Compras, Gastos | **44** |
| 6 | **Subcategoría de gasto + "Pagado a"** | Gastos | **45** |
| 7 | **Plazo de crédito** — sin él "VENCIDO" no se puede calcular | Cartera, Clientes | **46** |
| 8 | **Marca de despacho y forma de entrega** | Pedidos | **47** |
| 9 | **Dirección del cliente** | Clientes | **48** |
| 10 | **Anulación de compra** — el §4 reserva el rojo sólido para una acción que no existe | Compras | **49** |

**Lo que sí existe y alcanza:** todo lo demás. Seis de las nueve pantallas se pueden construir
completas salvo por estos campos, y **ninguno bloquea el re-skin** — bloquean la fidelidad al
dibujo.

---

## Pantalla por pantalla

Leyenda: ✅ existe · 🔶 se deriva (no es columna, se calcula) · ❌ no existe.

> 🔴 **DOS CLASES DE HUECO, y las resuelve gente distinta.** Un **hueco de esquema** (❌) es un dato
> que no existe en ninguna tabla: se resuelve con migración + RPC, y **espera perdiendo datos**. Un
> **hueco de pantalla** es un dato que **existe y nadie muestra**: se resuelve con una decisión, con
> **cero SQL**, y **espera gratis** porque el dato se sigue guardando.
> Los diez primeros de esta lista son de esquema. El primero de pantalla apareció construyendo
> Inventario — ver la nota de esa sección.

### 1 · Mostrador

| Campo dibujado | Estado | Origen |
|---|---|---|
| Código | ❌ | — (deuda 41) |
| Producto | ✅ | `products.name` |
| Unidad | ❌ | — (deuda 41) |
| Precio | ✅ | `products.price` |
| Costo | ✅ | `products.cost_price` — **decidido no mostrarlo** (deuda 42) |
| Cliente · NIT | ✅ | `customers.name` · `customers.document` |
| Cupo: disponible − esta venta → queda | ❌ | — (deuda 40) |
| Líneas: producto · cant · precio · total | ✅ | `order_items` |
| Subtotal · descuento · total | ✅ / 🔶 | `orders.discount_amount`, `discount_type`, `total` |

### 2 · Pedidos

| Campo dibujado | Estado | Origen |
|---|---|---|
| Número (`P-1043`) | ✅ | `orders.order_number` (el prefijo es formato) |
| Cliente | ✅ | `orders.customer_name` / `customer_id` |
| Total | ✅ | `orders.total` |
| Estado `Pendiente` / `Despachado` | ✅ | enum `order_status` = `pending`·`delivered`·`cancelled` |
| Canal (WhatsApp · Teléfono) | ✅ | `orders.canal` |
| Tomado el… · recibió *quién* | ✅ | `created_at` · `created_by` |
| **"Despachado 30 ago"** | ❌ | no hay `dispatched_at`; `updated_at` es genérico (deuda 47) |
| **"Entrega: retira en mostrador, hoy"** | ❌ | no hay campo de entrega (deuda 47) |
| `Sin entregar · sin cobrar` | ✅ | `status` + `payment_status` |
| Disponible de cupo | ❌ | deuda 40 |
| Líneas: código · producto · cant · precio · total | ❌ / ✅ | código: deuda 41; el resto `order_items` |

### 3 · Compras

| Campo dibujado | Estado | Origen |
|---|---|---|
| Proveedor | ✅ | `suppliers.name` |
| Documento (`FV-88214`) | ✅ | `purchase_invoices.invoice_number` |
| **Fecha (editable: `31/08/2026`)** | ❌ | solo `created_at`, que es cuándo se REGISTRÓ (deuda 44) |
| Código | ❌ | deuda 41 |
| Producto | ✅ | `products.name` |
| **Unidad de compra (`12 bulto`, `20 canasta`)** | ✅ | `purchase_invoice_items.purchase_unit` — deuda 43 cerrada |
| **Equivale a (`1 bulto = 50 UND`)** | ✅ / ❌ | el FACTOR existe (`units_per_purchase_unit`); el `UND` del final es la etiqueta de la unidad de VENTA — deuda 41 |
| Costo unitario · total de línea | ✅ | `purchase_invoice_items.unit_cost` · `subtotal` |
| Costo del producto: antes → después | 🔶 | `products.cost_price` actual vs. el que resultaría |
| Entrada al inventario (`+600 UND`) | 🔶 | de las cantidades de la compra |
| Badge `Borrador` | — | **decidido sin persistencia** (skill §6) |
| Badge `aplicada` / `anulada` | ❌ | 🔴 **anular una compra NO EXISTE**: ni columna, ni RPC, ni UI (deuda 49) |

### 4 · Gastos

| Campo dibujado | Estado | Origen |
|---|---|---|
| **Fecha (elegible)** | ❌ | solo `created_at` (deuda 44) |
| **Categoría: Arriendo · Servicios · Transporte · Sueldos · Impuestos · Otros** | ❌ | 🔴 ver abajo (deuda 45) |
| Descripción | ✅ | `cash_movements.reason` |
| **Pagado a** | ❌ | no hay beneficiario (deuda 45) |
| Monto | ✅ | `cash_movements.amount` |
| Total del período | 🔶 | suma |

> 🔴 **El hallazgo más importante de esta pasada, y es del tipo que ya tiene criterio escrito.**
> `cash_movements.categoria` tiene la allowlist `('compra','gasto','retiro','otro')` para `type='out'`.
> Las seis categorías del dibujo —Arriendo, Servicios, Transporte, Sueldos, Impuestos, Otros— **no
> son valores de esa lista: son otro EJE.** Todas serían `categoria = 'gasto'`.
>
> Hoy la única forma de guardarlas sería meterlas en `reason`, **que es el detalle libre** — y eso
> es exactamente la mezcla que este proyecto ya separó una vez: *"un valor que significa dos cosas
> no es un dato"*, caso 1 de esa tabla, donde `reason` cargaba clasificación **y** detalle y se le
> agregó `categoria` para partirlo. Volver a meter una clasificación en `reason` sería **deshacer
> esa separación seis meses después**, con la misma consecuencia: los reportes por tipo de gasto no
> se podrían hacer ni reprocesando.

### 5 · Catálogo

| Campo dibujado | Estado | Origen |
|---|---|---|
| Código | ❌ | deuda 41 |
| Producto · Categoría · Precio · Costo | ✅ | `products` + `categories.name` |
| **Unidad (`UND`, `KG`, `PAR`, `PAQ`)** | ❌ | deuda 41 |
| Margen % | 🔶 | `(price − cost_price) / price` |
| Panel editar: nombre · precio · costo · categoría | ✅ | `products` |
| Panel editar: **unidad de venta** | ❌ | deuda 41 |
| "4.212 productos" | 🔶 | conteo |

### 6 · Inventario

| Campo dibujado | Estado | Origen |
|---|---|---|
| Valor del inventario | 🔶 | Σ `stock_qty × cost_price` |
| Referencias con existencia | 🔶 | conteo `stock_qty > 0` |
| Productos sin costo | 🔶 | conteo `cost_price is null` |
| Código | ❌ | deuda 41 |
| Producto · Existencia · Costo | ✅ | `products.name` · `stock_qty` · `cost_price` |
| **Unidad** | ❌ | deuda 41 |
| Valor de línea | 🔶 | producto |
| Badge `Sin costo` | 🔶 | `cost_price is null` |
| Pestaña Movimientos | ✅ | `stock_movements` |

> ⚠️ **HUECO DE FUNCIONALIDAD, no de datos — encontrado el 2026-09-02 re-skineando la pantalla.**
> Los tres KPI de la maqueta son de DINERO —valor del inventario, referencias con existencia,
> productos sin costo— y la pantalla real muestra **cuatro conteos**: insumos con inventario, sin
> stock, stock bajo, en negativo. La tabla tampoco tiene `COSTO` ni `VALOR`.
> **Los cinco se derivan de datos que YA EXISTEN** (`stock_qty`, `cost_price`): no falta esquema,
> falta pantalla. No se agregaron en el re-skin porque eso es información NUEVA, y el re-skin es
> misma información con el design system. Queda como decisión de producto.

### 7 · Clientes

| Campo dibujado | Estado | Origen |
|---|---|---|
| Nombre · NIT · teléfono | ✅ | `customers.name` · `document` · `phone` |
| **Dirección (`Cra 12 #4-38`)** | ❌ | deuda 48 |
| "318 activos" | 🔶 | `is_active` |
| Badge `Al día` / `62 días de mora` | 🔶 | de `created_at` de las órdenes `pending`/`partial` |
| **Cupo asignado · Disponible** | ❌ | deuda 40 |
| Saldo actual | 🔶 | Σ saldos pendientes |
| Historial: fecha · movimiento · valor | ✅ | `orders` + `debt_payments` |
| Historial: **saldo corrido** | 🔶 | acumulado |
| `Sin cupo asignado` | ❌ | deuda 40 |

### 8 · Cartera

| Campo dibujado | Estado | Origen |
|---|---|---|
| Por cobrar | 🔶 | Σ pendientes |
| Recaudado hoy | ✅ | `debt_payments` del día |
| Cliente · Saldo | ✅ / 🔶 | `customers.name` · Σ |
| AgingBar (0–30 · 31–60 · 61–90 · +90) | 🔶 | `orders.created_at` |
| Badge `Mora N días` | 🔶 | ídem |
| **KPI `VENCIDO` y columna `VENCIDO`** | ❌ | 🔴 ver abajo (deuda 46) |
| Abonar | ✅ | `register_debt_payment` |
| `requiere_conciliacion` | ✅ | `debt_payments.requiere_conciliacion` |

> 🔴 **"Vencido" NO es lo mismo que "antiguo", y el esquema solo permite calcular lo segundo.**
> La antigüedad sale de `created_at` y ya existe. **Vencido exige un PLAZO** —"a 30 días"— y no hay
> `due_date` en `orders` ni plazo de crédito en `customers`. La pantalla muestra dos cifras
> distintas por cliente (saldo 4.000.000, vencido 940.000): **hoy esa segunda columna no se puede
> calcular, ni aproximar.**
>
> ⚠️ Y es de la clase que este proyecto paga caro: **poner ahí la antigüedad y llamarla "vencido"
> daría un número plausible y falso** — R7 en su enunciado exacto. Mejor `—` hasta que exista el
> plazo.

### 9 · Utilidades

| Campo dibujado | Estado | Origen |
|---|---|---|
| Ventas del período | 🔶 | `orders` |
| Costo de lo vendido | ✅ | `order_items.unit_cost` — **congelado al vender** (R1 punto 8) |
| Utilidad bruta · neta · margen | 🔶 | cascada |
| Gastos del período | ✅ | `cash_movements` |
| "12 productos vendidos sin costo registrado" | 🔶 | `order_items.unit_cost is null` |
| Detalle de costo por categoría | 🔶 | join con `categories` |
| Períodos (mes · trimestre · año corrido) | 🔶 | ⚠️ **fronteras en `America/Bogota`, no sobre el UTC crudo (R7)** |
| "Costeo: promedio ponderado móvil" | — | decidido (skill §8.1) |

**Utilidades es la única pantalla sin un solo hueco.** Y no es casualidad: es la que se diseñó
después de leer el esquema.

---

## Lo que esta pasada dice del método

Las nueve pantallas dan **9 huecos**, y **6 de los 9 son campos que el negocio SÍ usa** —la unidad
de compra, el plazo de crédito, la subcategoría del gasto, el beneficiario, la fecha del documento,
la dirección—. No son adornos del diseño: son **cosas que el esquema base no modeló** y que el
diseño descubrió porque tuvo que dibujarlas.

⚠️ **El diseño encontró huecos de modelo de datos que ninguna sesión de backend había encontrado.**
Vale anotarlo como lo que es: dibujar una pantalla es una forma de auditar un esquema, porque
obliga a nombrar cada dato que hace falta para que la pantalla signifique algo. Un `select *` no
hace esa pregunta.
