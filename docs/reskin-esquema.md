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

⚠️ **El límite, dicho:** esta sesión **no tenía el token de Supabase en el entorno**, así que la
comparación no se hizo contra `information_schema` sino contra el archivo generado en la sesión
anterior. Es un proxy —y R4 dice que un proxy no es la cosa—, pero uno **generado por la
herramienta desde la base**, no escrito a mano. Desde entonces se aplicó una sola migración
(`20260901120000_void_expone_was_fiado.sql`) y **solo cambia el retorno de una función, ninguna
columna**. Reconfirmar con `pnpm db:types && git diff --exit-code src/types/database.types.ts`
cuando haya token.

**27 tablas y vistas** en el esquema. Lo que sigue es campo por campo.

---

## Resumen: 9 huecos, en 6 pantallas

| # | Hueco | Pantallas | Deuda |
|---|---|---|---|
| 1 | **Código de producto** | Mostrador, Pedidos, Compras, Catálogo, Inventario | 41 |
| 2 | **Unidad de medida** | Mostrador, Catálogo, Inventario | 41 |
| 3 | **Cupo de crédito** (asignado · consumido · disponible) | Mostrador, Pedidos, Clientes | 40 |
| 4 | **Unidad de COMPRA y su equivalencia** (1 bulto = 50 UND) | Compras | **43** |
| 5 | **Fecha del documento ≠ fecha de registro** | Compras, Gastos | **44** |
| 6 | **Subcategoría de gasto + "Pagado a"** | Gastos | **45** |
| 7 | **Plazo de crédito** — sin él "VENCIDO" no se puede calcular | Cartera, Clientes | **46** |
| 8 | **Marca de despacho y forma de entrega** | Pedidos | **47** |
| 9 | **Dirección del cliente** | Clientes | **48** |

**Lo que sí existe y alcanza:** todo lo demás. Seis de las nueve pantallas se pueden construir
completas salvo por estos campos, y **ninguno bloquea el re-skin** — bloquean la fidelidad al
dibujo.

---

## Pantalla por pantalla

Leyenda: ✅ existe · 🔶 se deriva (no es columna, se calcula) · ❌ no existe.

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
| **Unidad de compra (`12 bulto`, `20 canasta`)** | ❌ | deuda 43 |
| **Equivale a (`1 bulto = 50 UND`)** | ❌ | deuda 43 |
| Costo unitario · total de línea | ✅ | `purchase_invoice_items.unit_cost` · `subtotal` |
| Costo del producto: antes → después | 🔶 | `products.cost_price` actual vs. el que resultaría |
| Entrada al inventario (`+600 UND`) | 🔶 | de las cantidades de la compra |
| Badge `Borrador` | — | **decidido sin persistencia** (skill §6) |

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
