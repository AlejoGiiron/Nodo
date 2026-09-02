# A3 · Rótulos, exportes y colores que afirman — la clase de la 53 y del sobrante

*Auditoría del plan `docs/PLAN-2026-09-02.md` §2, corrida el 2026-09-02 sobre `src/`. **No modifica
código.** Cada fila de las tablas se leyó contra la consulta o condición que la alimenta, no contra
el nombre.*

> **Veredicto en tres líneas.** De ~340 superficies (11 KPI, 35 encabezados, 36 etiquetas, 22 columnas
> de Excel, 3 comprobantes impresos, 186 usos de color de estado), **la mayoría dice lo que calcula**.
> Tres no, y las tres **salen de la app o deciden plata**: el ticket afirma un **IVA del 19 % que no
> existe en ningún dato**; Reportes y su Excel dicen **"Ventas"** donde suman **cobros** (la 53), y en
> la misma pantalla "Revenue" suma **vendido**; y el **cierre de caja sigue pintando el sobrante en
> verde** — el control del plan apareció, y apareció **abierto** donde se decide, pese a una nota de
> BITÁCORA que lo da por corregido.

---

## 0 · La predicción, escrita antes de leer una sola condición

*`scratchpad/a3/prediccion.md`, 17:26:53Z, después del censo de conteos y antes de abrir el código.*

> Predicho: entre 6 y 9 desajustes sobre ~300 superficies; 2 o 3 🔴 (salen de la app o deciden
> plata), el resto 🟡. Controles: la 53 tiene que aparecer abierta; el sobrante en verde tiene que
> aparecer, y como CORREGIDO (BITÁCORA 2026-09-02).

| sospecha escrita | resultado |
|---|---|
| 1. El Excel de Reportes copia los rótulos de los KPI → la 53 sale de la app | ✅ **confirmada** (§3) |
| 2. "Ventas" en arqueo y ticket de cierre = cobros del turno | ✅ confirmada, 🟡 (§3) |
| 3. "Total gastos" suma todos los `out` (compra, retiro) o solo `gasto` | ✅ **confirmada**: suma todo `type = 'out'` sin filtrar `categoria` (§4) |
| 4. KPI de Inventario cuentan productos sin tracking | ❌ no: filtra `simple && stock_tracking` antes de contar |
| 5. `pending` pintado warning/danger en Historial de ventas | ❌ no ahí; en Fiado "Pendiente" es `warning` (🟢 nota) |
| 6. `--danger` usado para deuda | ❌ no: Fiado usa `--debt` en las 6 cifras; `--danger` solo en validación |
| 7. `--success` fuera de confirmación | parcial: canal WhatsApp del POS, gradiente del login (§5) |
| 8. Ticket: total con descuento, cambio con pago mixto | **más de lo predicho**: no era el descuento, era el **IVA** (§3) |

**Medido: 3 🔴 · 4 🟡 · 4 🟢**, dentro del rango predicho, con el 🔴 más grave (IVA) **fuera de la
lista de sospechas**. Los dos controles aparecieron: la 53 abierta; el sobrante **abierto en el
cierre y corregido en el historial** — lo contrario de lo que la predicción esperaba (§6).

---

## 1 · Método y censo

Enumerar antes de contar. Los comandos, para reproducirlo:

| superficie | comando | n |
|---|---|---|
| KPI | `grep -rn "<KpiCard" src/` | 11 (Fiado 1, Inventario 4, Reportes 6) |
| encabezados `<th>` | `grep -rn "<th" src/` | 35 (5 archivos) + 4 cabeceras en `div` grid |
| etiquetas mayúsculas (`--fs-label`) | `grep -rn "textTransform: 'uppercase'"` | 36 |
| exports | `grep -rn -i "xlsx\|createObjectURL"` | 1 módulo, 2 libros, 4 hojas, 22 columnas |
| comprobantes | `grep -rln "window.print\|printThermal"` | 3: ticket POS, reimpresión, arqueo |
| colores de estado | `grep -rnoE "var\(--(success\|debt\|danger\|warning\|d[1-4])[a-z0-9-]*\)"` | 186 en 29 archivos |
| la palabra "venta" en UI | `grep -rnoiE "['\"\`>][^'\"\`<>]*ventas?[^'\"\`<>]*['\"\`<]" src/pages src/components` | 66 |

Para cada rótulo: **qué consulta o expresión lo alimenta**, y si el texto afirma lo mismo. Para cada
color: **qué AFIRMA** (verde = salió bien · `--debt` = alguien debe · `--danger` = algo está mal ·
`--warning` = se puede seguir con una decisión) contra el estado que pinta.

Leyenda: ✅ coincide · 🔴 no coincide y sale de la app o decide plata · 🟡 no coincide · 🟢 nota.

---

## 2 · KPI — rótulo · fuente · ¿coincide?

| pantalla | rótulo | fuente | ¿coincide? |
|---|---|---|---|
| Reportes | **Ventas totales** | `Σ daily_sales_summary.total_revenue` = `sum(payments.amount)` de órdenes no anuladas | 🔴 **NO — es lo COBRADO.** Una venta a fiado aporta 0. Deuda 53, abierta; medido 993.200 donde lo vendido era 2.357.200 |
| Reportes | **Órdenes** | `Σ order_count` = `count(distinct o.id)` con **join a payments** | 🟡 cuenta solo órdenes **con algún pago**: una venta a fiado sin abono no entra. El rótulo dice órdenes; la vista dice órdenes cobradas |
| Reportes | **Ticket promedio** | `Ventas totales / Órdenes` | 🔴 **NO — cobrado / órdenes con pago**; la segunda mitad de la 53. Medido 6.286 vs 14.919 |
| Reportes · Stock | Unidades vendidas | `Σ product_performance.total_qty` = `sum(oi.qty)` no anuladas | ✅ (vendido, todas las órdenes) |
| Reportes · Stock | Productos vendidos | productos distintos con líneas | ✅ |
| Reportes · Stock | Categorías | categorías distintas con líneas | ✅ |
| Inventario | Insumos con inventario | `products` con `kind='simple' && stock_tracking` | ✅ el conteo; 🟢 "insumo" es vocabulario de cocina (§7) |
| Inventario | Sin stock (0) | `stock_qty === 0` sobre los anteriores | ✅ |
| Inventario | Stock bajo | `0 < stock ≤ min_stock`; tono `warning` si > 0 | ✅ |
| Inventario | En negativo | `stock < 0`; tono `debt` si > 0 | ✅ el conteo; 🟢 el tono: negativo es "algo mal contado" — `danger` según la regla que el propio archivo escribe para el badge (`negative → danger`). KPI y badge de la misma pantalla eligen roles distintos para el mismo estado |
| Fiado | Total por cobrar · Clientes con deuda · Fiados abiertos | `Σ saldo` con `saldo = total − Σ debt_payments`, agrupado por cliente | ✅ (`register_sale_payment` rechaza órdenes no `paid`, así que una orden a crédito no tiene `payments`: la resta es completa) |

🔴 **Y la contradicción dentro de Reportes:** la pestaña **Financiero** llama "Ventas" a `sum(payments)`
(cobrado, población: órdenes con pago) y la pestaña **Stock** llama "Revenue" a `sum(qty × unit_price)`
(vendido, población: todas las órdenes no anuladas). **Dos definiciones de la misma palabra en la misma
pantalla**, y la tabla "Top 10 productos · Por revenue" del tab financiero usa la del stock: su
columna "Total" y "% rev." **no suman al "Ventas totales" de arriba** en cuanto haya un fiado.

---

## 3 · Lo que SALE de la app — lista aparte, porque ahí no hay pantalla que corrija

### 3.1 Ticket de venta (POS `PrintTicket`) y reimpresión (`printer.ts · printSaleTicket`)

| línea impresa | fuente | ¿coincide? |
|---|---|---|
| `IVA 19% incl. $X` | `Math.round(total − total / 1.19)` — **una constante**. No hay columna de tasa ni de impuesto en ninguna tabla (`grep -rni "iva\|tax" supabase/migrations` → cero) | 🔴 **NO. El ticket AFIRMA un impuesto que nadie registró.** Una distribuidora de alimentos, aseo o consumo masivo vende **excluidos, exentos y al 5 %** mezclados con el 19 %; el ticket declara 19 % sobre todo, al cliente, en papel. El panel de cobro lo repite en pantalla ("IVA 19 % (incluido)") |
| `TOTAL` | `orders.total` (con descuento aplicado) | ✅ |
| Líneas `qty × precio` | `product.price × qty` (POS) · `unit_price × qty` (reimpresión) | ✅ |
| `Subtotal` · `Descuento (n%)` | solo en el ticket del POS | 🟡 **la reimpresión no las tiene**: `SaleTicketData` no lleva `subtotal` ni `discount` aunque `SalesHistoryPage` ya los calcula (`discount = subtotal − total`). Un ticket reimpreso con descuento tiene líneas que **no suman al TOTAL** y ninguna línea que lo explique |
| Método (`Efectivo`, `Fiado`, "Efectivo + Nequi") | `payments` de la orden; `null` si fiado sin pagos | ✅ |
| `Vuelto` | `receivedAmt − total` solo en POS | ✅ (la reimpresión no lo tiene; es estado del momento, no del hecho) |

### 3.2 Arqueo de caja impreso (`printer.ts · buildCashReportHtml`) — al cerrar y al reimprimir

| línea impresa | fuente | ¿coincide? |
|---|---|---|
| `VENTAS POR MÉTODO` · `Total ventas $X · N vta(s)` | ventas por método = `payments` del turno (efectivo derivado del esperado); `sales_count` = órdenes **con pago** en la ventana + órdenes con `total = 0` | 🟡 son **cobros**, no ventas: un fiado del turno **no aparece ni se cuenta**. El rótulo correcto es "Cobros por método". Va impreso y se archiva |
| `Apertura` · `Ingresos` · `Egresos` | snapshot + movimientos | ✅ |
| `ARQUEO (esperado / declarado)` · `Diferencia total` | `close_reconciliation` (snapshot, no recomputa) | ✅ |

### 3.3 Excel financiero (`nodo_financiero_<fecha>.xlsx`)

| hoja · columna | fuente | ¿coincide? |
|---|---|---|
| Resumen · **Ventas totales (COP)** | `totalRev` = cobrado | 🔴 **la 53 sale de la app** con el mismo rótulo |
| Resumen · **Cantidad de órdenes** | `totalOrd` = órdenes con pago | 🟡 |
| Resumen · **Ticket promedio (COP)** | cobrado / órdenes con pago | 🔴 aritmética inválida, exportada |
| Resumen · Efectivo · Tarjeta · Transferencia · Nequi | `Σ *_total` | ✅ |
| Ventas por día · **Órdenes** · **Total** | `order_count` · `total_revenue` por día y canal | 🟡 misma clase, por fila |
| Ventas por día · Fecha · Canal · 4 métodos | vista | ✅ |

### 3.4 Excel de stock (`nodo_stock_<fecha>.xlsx`)

| hoja · columna | fuente | ¿coincide? |
|---|---|---|
| Detalle de productos · **Revenue (COP)** · Categorías · **Revenue (COP)** | `Σ qty × unit_price` = vendido | ✅ el número; 🟡 **es la otra definición**: quien abra los dos libros del mismo período verá "Ventas totales" y la suma de "Revenue" **distintas**, sin que ninguna hoja diga por qué |
| Unidades vendidas · Producto · Categoría | vista | ✅ |

---

## 4 · Encabezados de columna y rótulos de bloque

Los 35 `<th>` y las 4 cabeceras en grid, por pantalla. Se listan solo los que afirman algo sobre un
cálculo; "Fecha", "Producto", "Categoría", "Usuario" no se evalúan.

| pantalla | encabezado / rótulo | fuente | ¿coincide? |
|---|---|---|---|
| Gastos | título **"Historial de gastos"** · contador "N egresos" · **"Total del período"** | `cash_movements` con `type = 'out'` **sin filtrar `categoria`**: entran `compra`, `gasto`, `retiro`, `otro` | 🟡 **el título dice gastos, la consulta dice egresos**. Una compra pagada en efectivo (`register_purchase` inserta `out · compra`) y un retiro del dueño aparecen como "gastos" y suman al total. El contador de la misma barra dice "egresos": la pantalla se contradice sola. Y `categoria` —la columna que se creó para separar exactamente esto— no se muestra ni se filtra |
| Gastos | Monto (en `--danger`, con "−") | `amount` | 🟡 ver §5: un egreso no es un error |
| Fiado | Total · **Pagado** · Saldo | `total` · `Σ debt_payments` · `total − abonado` | ✅ ("Pagado" = abonado; no hay pagos iniciales posibles en una orden a crédito) |
| Fiado | Total adeudado | `Σ saldo` del cliente | ✅ |
| Inventario · Niveles | Stock · Mínimo · Estado | `stock_qty` · `min_stock` · `stockStatus()` | ✅ |
| Inventario · Movimientos | Cantidad (`+`/`−`) | `qty` con signo | ✅ el número; 🟡 el color (§5) |
| Compras · lista y detalle | Total · Cant. · Costo · Subtotal | `purchase_invoices.total` · `qty` · `unit_cost` · `subtotal` | ✅ (con la 43 aplicada, `qty` es unidades de compra y `subtotal` = `qty × unit_cost`) |
| Reportes | Top 10: Unidades · **Total** · **% rev.** | `product_performance` = vendido | 🟡 "Total" al lado de "Ventas totales" con otra población (§2) |
| Historial de ventas | Total (fila) · Subtotal · Descuento · Total (detalle) | `orders.total` · `Σ líneas` · `subtotal − total` | ✅ |
| Historial de ventas | subtítulo "ventas cobradas y anuladas, por sede" | las filas son órdenes con `order_number`, cobradas o a crédito | 🟢 un fiado abierto **también** aparece; "cobradas" es más angosto que la lista |
| Turnos | Declarado · Esperado · Diferencia | snapshot | ✅ |
| Cierre de caja | "Ventas por método de pago" · **"Total ventas"** · "Ventas en efectivo" | `payments` del turno | 🟡 misma clase que el arqueo impreso (§3.2): son cobros |
| Cierre de caja | Esperado · Declarado · Dif. por método | `calcShiftBalance` + `salesSummary[m]` | ✅ |
| Cierre de caja | rótulo de cabecera "Resumen del turno" en `--success-700` | — | 🟢 un título en verde afirma que el resumen "salió bien" antes de verlo; es decorativo, pero es el único título verde del producto |

---

## 5 · Colores que afirman — 186 usos, leídos por condición

### 5.1 Los que están bien, agrupados (para no volver a auditarlos por costumbre)

| grupo | n | por qué está bien |
|---|---|---|
| asterisco de campo obligatorio en `--danger` | 9 | validación: "esto falta" es un error del usuario |
| bordes/anillos de error de `Input`, login, `DebtPaymentModal` (`exceeds`), `ui.css` | 8 | validación fallida — §1.2 lo asigna a `--danger` |
| botones destructivos (`.nodo-btn--destructive`, anular, desactivar, eliminar) | 14 | acción destructiva — `--danger` por diseño |
| `Badge` y `KpiCard` (definiciones de tonos) | 9 | son la primitiva; el tono lo decide el consumidor |
| `AgingBar` + `antiguedad.ts` (`--d1…--d4`) | 8 | escala del rol de deuda, con leyenda |
| Fiado: saldos en `--debt`, abonado en `--success-700` | 7 | deuda ≠ error; abono aplicado = confirmación |
| `CupoMeter` (`--warning-700` ≥ 80 %, `--debt` ≥ 95 %, proyectado < 0) | 2 | umbrales de la skill |
| POS: `Vuelto` verde / `Falta` `--danger`; disco de éxito; `PaymentSplitEditor` `valid` | 12 | vuelto = la cuenta cierra (confirmación); falta = error de la operación en curso |
| `MoneyCell` negativo en `--success-700` | 1 | la skill lo fija así (abono, entrada de caja) |
| `TenderSelector` faltante en `--warning-on-soft` sobre tinta | 1 | bloqueo con cifra, como pide §7.2 |
| `StockAdjustModal` resultante < 0 en `--danger` | 5 | dejar el stock negativo por un ajuste manual sí es "algo mal" |
| Inventario: badge `negative → danger`, `out → neutral`, `low → warning`, `ok → success` | 4 | la corrección del re-skin, bien hecha |
| Historial de turnos: faltante `--danger`, **sobrante `--warning`**, cuadrado `--success` | 3 | **la corrección del sobrante — en el historial** |
| `ShiftBanner` "turno abierto" en `--success` | 8 | estado "al día" del turno; aceptable como confirmación de que la caja está operando |
| Config: `is_active` en `--success-on-soft` | 4 | "activo" como al día |
| toasts, `ItemConfigModal`, `CustomerPicker`, avisos `--warning` de cupo/sin número/en espera | ~30 | avisos y confirmaciones donde corresponden |

### 5.2 Los que afirman algo falso

| dónde | condición | qué afirma el color | qué es en realidad | |
|---|---|---|---|---|
| **`CloseShiftModal` 300–328** (bloque "Diferencia") | `difference > 0 → --success-soft / --success-700`, ícono `TrendingUp` verde, "Hay más efectivo del esperado" en verde | **que sobrar plata salió bien** | un descuadre: algo no se registró | 🔴 |
| **`CloseShiftModal` 364** (Dif. por método) | `r.difference > 0 → --success-700` | ídem, por método | ídem | 🔴 |
| `CloseShiftModal` 409 (Diferencia total, sobre tinta) | `=== 0 → #34d399` (verde), sobrante → `--on-dark-warn`, faltante → rojo hex | cuadre verde ✅, sobrante ámbar ✅ | — la media corrección que la BITÁCORA describe **es ésta**, la del pie; el bloque grande de arriba quedó igual | ✅ |
| `ExpensesHistoryPage` 82 y 167 | total y monto de cada egreso en `--danger` | **que gastar es un error** | un egreso es una categoría de movimiento; el rojo de error se gasta en lo normal y no le queda nada al anormal | 🟡 |
| `MovementsModal` 215–223, 337, 369–397 | `type === 'out' → --danger` (botón, borde, fondo, cifra, ícono); `'in' → --success` | egreso = error · ingreso = confirmación | dirección del movimiento: una **categoría** pintada con la paleta de estados (§1.2, regla agregada el 2026-09-01) | 🟡 |
| `InventoryPage` 293 | `m.qty >= 0 → --success-700 : --danger` | una salida de stock es un error | una venta descuenta stock: es lo normal del negocio | 🟡 |
| `POSPage` 479–480 (canal) | `mostrador → --warning-soft`, `whatsapp → --success-soft`, `telefono → --action-soft` | mostrador advierte, WhatsApp confirma | tres **canales**: categoría con paleta de estados. `SalesHistoryPage` ya lo corrigió (los tres en `--border-2` + ícono); el POS no | 🟡 |
| `ReportsPage` 47 (`CH_COLOR.mostrador = --warning-700`) | serie de gráfico | — | la excepción de series está argumentada en la skill §8.3-bis y en el código: el color identifica una serie con leyenda. Se acepta, con la deuda de paleta de gráficos abierta | 🟢 |
| `LoginPage` 85 | gradiente `--action → --success-700` | — | decorativo; único uso de verde en una superficie de marca. §1.2: "verde es solo confirmación" | 🟢 |
| `FiadoPage` 25 (`STATUS_BADGE.pending → warning`) | fiado sin abonos | "se puede seguir con una decisión del dueño" | un crédito recién otorgado es el estado normal de la cartera; la skill lista `sin cobrar` como estado de **flujo** (azul), no de advertencia | 🟢 |
| `KpiCard` 105 | `cambio >= 0 → --success-700` | subir es bueno | cierto para ventas, órdenes y ticket; **falso el día que la tarjeta muestre un costo o una mora**. La primitiva asume la dirección; debería recibirla | 🟢 |

---

## 6 · El control del sobrante: qué pasó exactamente

El plan exigía que el sobrante en verde apareciera. Apareció, y la lectura completa es ésta:

| dónde vive el arqueo | sobrante | fuente |
|---|---|---|
| **`CloseShiftModal`, bloque "Diferencia"** — el momento de decidir | **verde** (`--success-soft`, `TrendingUp` verde, texto verde) | líneas 300–328, sin tocar |
| `CloseShiftModal`, "Dif." por método | **verde** | línea 364 |
| `CloseShiftModal`, "Diferencia total" sobre tinta (pie) | ámbar (`--on-dark-warn`) | línea 409 — la "media corrección" que la BITÁCORA menciona |
| `ShiftHistoryPage` | ámbar (`--warning`) con el comentario "CORRECCIÓN DE ROL" | líneas 51–53 |
| arqueo impreso | sin color (papel térmico) — `dif +X` | — |

La BITÁCORA del 2026-09-02 ("El arqueo — una corrección de SIGNIFICADO") dice *"El cierre de caja
pintaba el sobrante en verde"*, en pasado, y cierra con *"se corrigió también en el panel sobre tinta,
pero solo a medias"*. **Lo que se corrigió fue el historial y el pie del modal. El bloque del cierre
—el que la cajera mira mientras decide si cierra— sigue exactamente como la nota describe el
problema.** Es una nota que dirige mal en la dirección más cómoda: da por hecho lo que se quería
hacer. R4: leer la nota la confirmaba; abrir el archivo la refuta.

Y es la razón de que el control del plan pidiera que el caso **apareciera**: si la auditoría hubiera
partido de la BITÁCORA, el sobrante se habría listado como "corregido" y el modal no se habría abierto.

---

## 7 · Hallazgos, en orden de gravedad — SIN ARREGLAR

### 🔴 A3-1 · El ticket afirma "IVA 19 % incl." sobre un dato que no existe

**Dónde:** `POSPage` (`PrintTicket` línea 188 y panel de cobro 753), `printer.ts` línea 140
(reimpresión). **Fuente:** `Math.round(total − total / 1.19)`. **En el esquema:** ninguna tabla tiene
tasa, régimen ni impuesto por producto.
**Por qué es 🔴:** sale de la app en papel, al cliente final, con la palabra IVA y un porcentaje. Para
una distribuidora de alimentos, aseo o consumo masivo la canasta mezcla excluidos, exentos, 5 % y
19 %: **el ticket declara un impuesto falso en la mayoría de las ventas**. Es un documento que el
cliente puede usar frente a la DIAN, y el producto lo firma.
**Es hueco de ESQUEMA además de rótulo:** para decir el IVA hace falta una tasa por producto (o por
categoría) y el régimen del tenant. Hasta que exista, **la línea no puede imprimirse**: "—" o nada,
nunca un número inventado (§7.5 de la skill: *dato insuficiente, nunca un número inventado*).
**Alcance sugerido:** quitar la línea en los tres sitios ahora (una decisión de producto: el ticket
sin IVA es honesto; con IVA falso no), y abrir la deuda de esquema `tasa de impuesto por producto +
régimen` para cuando el cliente lo pida — heredado de Vento, donde un bar al 19 % parejo lo hacía
cierto y acá no.

### 🔴 A3-2 · "Ventas" es cobrado en Financiero y vendido en Stock, y las dos salen en Excel — la 53, medida en todas sus copias

**Dónde:** KPI "Ventas totales", "Órdenes", "Ticket promedio"; gráficos "Ventas por día y canal" y
"Ventas por hora" (tooltip "Ventas"); Excel financiero hoja Resumen ("Ventas totales (COP)",
"Cantidad de órdenes", "Ticket promedio (COP)") y hoja "Ventas por día" ("Órdenes", "Total"). Todas
sobre `sum(payments.amount)` y `count(distinct o.id)` **con join a payments**.
**Y la otra definición al lado:** Top 10 ("Total", "% rev."), pestaña Stock ("Revenue") y Excel de
stock ("Revenue (COP)") sobre `sum(qty × unit_price)` de todas las órdenes no anuladas.
**Lo nuevo respecto de la 53:** (a) el Excel **lleva el rótulo afuera**, donde nadie puede releer el
código; (b) "Órdenes" tampoco es órdenes: es órdenes con pago; (c) los dos libros del mismo período
**no cierran entre sí** y ninguna hoja dice por qué.
**Alcance:** el de la 53 (bloqueante del alta): decidir qué mide el reporte y **nombrarlo** —"Cobrado"
/ "Vendido"— en KPI, gráficos, tabla y **encabezados de Excel** en la misma pasada (R1: el rótulo vive
en 4 lados). Y el ticket promedio con numerador y denominador de la misma población.

### 🔴 A3-3 · El cierre de caja sigue pintando el sobrante en verde donde se decide

**Dónde:** `CloseShiftModal` 300, 301, 306, 312, 315, 328 (bloque "Diferencia") y 364 (por método).
**Qué afirma:** con el color reservado a la confirmación, que a la caja le sobre plata salió bien. El
texto lo refuerza en verde: "Hay más efectivo del esperado".
**Por qué es 🔴 y no 🟡:** decide plata en el momento: la cajera cierra con un sobrante "en verde" y
la diferencia se persiste y se reimprime. Es la **confirmación falsa** de la tercera mitad de R? —la
BITÁCORA la describe con precisión y la da por corregida.
**Alcance:** la misma tabla de roles que `ShiftHistoryPage` ya aplica: faltante `--danger`, sobrante
`--warning`, cuadrado `--success` — en el bloque y en la columna "Dif.". Y corregir la nota de
BITÁCORA para que diga dónde se corrigió y dónde no. Ocho líneas.

### 🟡 A3-4 · "Historial de gastos" lista y suma TODOS los egresos de caja

**Dónde:** `ExpensesHistoryPage` + `getCashOutMovements` / `getCashOutTotal`: `type = 'out'` sin
`categoria`. **Qué entra:** `compra` (la que inserta `register_purchase` al pagar en efectivo),
`retiro`, `otro`, además de `gasto`. **Qué afirma el título:** gastos. **Qué dice el contador de al
lado:** egresos. Y el "Total del período" en `--danger`.
**Por qué importa:** el módulo de gastos es insumo de utilidades (alcance firmado). Un total que suma
compras de inventario como gasto **duplica el costo** el día que utilidades reste compras por otro
lado. La columna `categoria` existe, con allowlist, **para esto** — y la pantalla no la muestra ni
filtra por ella.
**Alcance:** decidir si la pantalla es "Egresos de caja" (todo `out`, con la categoría como columna y
filtro) o "Gastos" (`categoria = 'gasto'`, y `otro` con detalle). El título y la consulta tienen que
decir lo mismo. Cero SQL.

### 🟡 A3-5 · El arqueo y el cierre dicen "Ventas" donde suman cobros

**Dónde:** `CloseShiftModal` ("Ventas por método de pago", "Total ventas") y el arqueo impreso
("VENTAS POR MÉTODO", "Total ventas · N vta(s)", `sales_count` = órdenes con pago + gratis).
**Qué falta:** un fiado del turno no está en ninguna línea ni en el conteo. En una distribuidora que
fía, el arqueo dirá "3 ventas" en un turno de diez.
**Alcance:** rótulo "Cobros por método" / "Total cobrado · N cobros", o agregar la línea "A crédito
(sin cobrar): $X · N" que hoy no existe. Lo segundo es información nueva (decisión de producto); lo
primero es una palabra.

### 🟡 A3-6 · La reimpresión del ticket omite Subtotal y Descuento

**Dónde:** `printer.ts · SaleTicketData` no lleva `subtotal` ni `discount`; `SalesHistoryPage` los
calcula y no los pasa. **Efecto:** un ticket reimpreso de una venta con descuento tiene líneas que no
suman al TOTAL. El del POS sí las imprime: **los dos comprobantes de la misma venta no son iguales**,
y el comentario de `printer.ts` promete "un recibo equivalente".

### 🟡 A3-7 · Categorías pintadas con la paleta de estados

`MovementsModal` (egreso = `--danger`, ingreso = `--success`), `ExpensesHistoryPage` (montos en
`--danger`), `InventoryPage` movimientos (`qty < 0 → --danger`), `POSPage` canal (`mostrador →
--warning`, `whatsapp → --success`). Es la regla de la skill §1.2 escrita el 2026-09-01: *una
categoría no se pinta con la paleta de estados; se distingue con ícono, etiqueta o posición*.
`SalesHistoryPage` ya lo hace para el canal. El costo es el de siempre: el rojo gastado en lo normal no
señala nada cuando algo está mal de verdad.

### 🟢 Notas

- **A3-8 · Vocabulario de cocina:** "Insumos con inventario", "Buscar insumo…", "Sin insumos que
  coincidan" (Inventario). Un insumo es lo que se transforma; una distribuidora vende referencias. Es
  el corolario de los strings de la poda: ningún verificador lo ve.
- **A3-9 · "Revenue"** en encabezados y en el Excel: la UI es en español (convención del repo).
- **A3-10 · `KpiCard.cambio`** asume que subir es bueno; documentarlo en la primitiva o recibir la
  dirección como prop antes de que una tarjeta de costo lo use.
- **A3-11 · Fiado "Pendiente" en `warning`** y "Resumen del turno" en verde: dos usos menores fuera de
  rol, sin consecuencia de decisión.

---

## 8 · Lo que esta auditoría NO cubre

- **Textos de error de las RPC** (los `raise exception`): afirman cosas sobre el estado ("no
  pertenece a tu sede", "no es de contado") y salen a un toast. No se cruzaron contra lo que la
  función verificó de verdad; A2 mostró uno que miente por omisión (`adjust_stock` niega por permiso
  cuando el problema era la sede). Es una auditoría aparte.
- **Los gráficos de Reportes** más allá del rótulo: ejes, escalas, tooltips.
- **Sentry / logs** que afirman estados hacia afuera.
- **El `.md` del design system** contra el código: la skill dice qué debe afirmar cada color; esta
  auditoría midió el código contra la skill, no la skill contra el producto.

---

## Apéndice · registro del instrumento

- El censo de colores usa el regex con `d[1-4]` incluido; sin eso la `AgingBar` quedaba fuera (8 usos).
- El grep de `<th>` no ve las cabeceras hechas con `div` + `textTransform: 'uppercase'` (Gastos, Turnos,
  Historial de ventas, Cierre): se enumeraron por el segundo grep. Un solo instrumento habría dejado
  4 pantallas sin encabezados.
- La lectura se hizo sobre volcados con número de línea (`scratchpad/a3/lectura{1,2,3}.txt`), no sobre
  el grep: el grep muestra la línea del color, no la condición de dos líneas arriba. Tres de los
  hallazgos (IVA, gastos sin `categoria`, sobrante en el bloque grande) no están en la línea que el
  grep devuelve.
- Predicción escrita a las 17:26:53Z; primer volcado de código a las 17:27. La predicción del control
  del sobrante era **la contraria** de lo medido, y eso es lo que la hace útil: una predicción que
  siempre acierta no controla nada.
