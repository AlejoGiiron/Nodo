# Reconstrucción del histórico de Muscle Pro — PLAN

*2026-09-06. Se apoya en `docs/historico-muscle-pro-enumeracion.md`, que es lo **medido**. Este
archivo es lo **decidido**: qué se carga, en qué orden, por qué camino y cómo se verifica.*

> **Nada de acá se ejecutó todavía.** Y hay **dos bloqueos** y **una dependencia de orden** que se
> resuelven antes de la primera escritura — §7.

---

## 1 · Qué se carga

| conjunto | cuántos | cómo entra |
|---|---|---|
| clientes | 20 | insert directo (`customers`) |
| compras | 44 líneas → **7 facturas** | `register_purchase`, una por proveedor y por día |
| ventas | 55 líneas → **30 tickets** | `orders` + `add_order_items_with_extras` + `register_sale_payment` |
| deudas | **9** de esos 30 tickets | son ventas a fiado: sin `payments` |
| abonos | **1** (20.000, 06-sep) | `register_debt_payment` |
| gastos | **7** de 8 — ver §7 | insert directo en `cash_movements` |
| inventario inicial | **nada que cargar** | los cinco conteos son cero; el stock sale de compras − ventas |

**Rango: 2026-08-30 → 2026-09-07. Nueve días.**

---

## 2 · El orden, y por qué es el único posible

**Cronológico estricto, día por día, y dentro de cada día las compras antes que las ventas.**

No es una preferencia: el costo se **congela** al vender y sale del promedio ponderado móvil, así
que una venta ejecutada antes de su compra congela un costo distinto —o ninguno—. Medido: con las
compras primero, los costos reproducen el archivo en 54 de 54; con las ventas primero, **21 líneas
quedan sin costo**.

⚠️ **Con la salvedad ya escrita en la enumeración §3: esa coincidencia NO prueba que el método sea
el correcto**, porque en estos datos el promedio ponderado y el último costo son el mismo número. La
carga es consistente con el archivo; eso es todo lo que se puede afirmar.

### El bucle, por cada uno de los nueve días

```
1. abrir jornada          opened_at = D                     (insert directo)
2. compras del día D      register_purchase(document_date=D) (exige jornada abierta)
3. ventas del día D       en el orden en que están en la hoja
     3a. orders           created_at = D  ← la única fecha que se puede fijar
     3b. items            add_order_items_with_extras
     3c. pago             register_sale_payment   … salvo si el ticket es a crédito
     3d. número           assignOrderNumber
4. gastos del día D       cash_movements(document_date = D)
5. abonos del día D       register_debt_payment
6. cerrar jornada         closed_at queda en HOY (trigger)
7. corregir el cierre     segundo update: closed_at = D      ← deuda 97, ver §7
```

🔴 **El paso 7 usa un defecto conocido.** `set_jornada_closed_at` sólo pisa la fecha en la
transición de `null` a no-`null`, así que un segundo `update` la mueve. Está anotado como **deuda
97** y **la carga depende de que esa deuda siga abierta**.

### Lo que queda fechado hoy, y no tiene arreglo por este camino

Las **líneas**, los **movimientos de stock**, los **pagos** y los **abonos**. Sus RPC no aceptan
fecha. La orden sí queda con su fecha real, y eso alcanza para el historial de ventas, los reportes
por período y **la antigüedad de cartera**, que deriva de `orders.created_at`.

---

## 3 · Decisiones tomadas, con su razón

| # | decisión | razón |
|---|---|---|
| 1 | **30 tickets**, agrupando por fecha + cliente + tipo de pago | 28 producía **un objeto que el modelo no admite**: una orden con un solo `payment_status` y líneas de contado y crédito |
| 2 | **7 facturas**, una por proveedor y día | es lo que un proveedor emite. Agrupar sólo por día fundía 3 proveedores en dos de los tres días |
| 3 | dentro de una factura, el **producto repetido se SUMA** | el único caso (Vida Fit, 02-sep) tiene **costo unitario idéntico** en las dos líneas: sumar no pierde información |
| 4 | las **2 ventas del 07-sep se cargan con su fecha** | el encargo es reconstruir el archivo tal cual; cambiarles la fecha sería falsearlo. Son futuro hoy y pasado mañana |
| 5 | **`OXANDRONOM` se carga sin costo** | un costo nulo es verdadero y se ve como «—»; uno inventado es falso y se ve bien — y se congela en la línea |
| 6 | las **camisas son gasto**, no mercancía | son uniformes. No entran al catálogo ni al inventario |
| 7 | las dos líneas de **Galleta Oreo del 03-sep son un ticket** | **confirmado por el cliente**, no inferido |
| 8 | canal = **`mostrador`** en los 30 | `orders.canal` es `not null` y sin default a propósito. El archivo no distingue canal, y el negocio es de mostrador |
| 9 | 🔴 **las jornadas reconstruidas se cierran SIN ARQUEO** | ver abajo |
| 10 | el abono de 20.000 entra como **`transfer`** | 🔴 **INFERIDO, no es dato del archivo** — ver abajo |

### 🔴 Decisión 9 · las jornadas se cierran con `closing_amount`, `expected_amount` y `difference` en NULO

**Alguien que vea tres nulos va a querer llenarlos. No hay que llenarlos.**

> **Un cero ahí no es «sin diferencia»: es un arqueo FALSO persistido.**

Esos tres campos son el resultado de **contar la plata del cajón**. En estos nueve días **nadie
contó nada** —son jornadas administrativas, creadas porque `register_purchase` exige una abierta y
`cash_movements.jornada_id` es `not null`—. Escribir `closing_amount = 0` afirmaría que se contó y
que había cero.

Es exactamente el defecto que documentó la **auditoría A1** en el cierre de caja: persistir un
cálculo hecho sobre insumos vacíos produce un número plausible que después **se reimprime sin
recomputar**. Un nulo se lee como *no hay dato*; un cero se lee como *dato*.

⚠️ Y hay una razón más, específica de esta carga: el arqueo de una jornada reconstruida **no podría
ser correcto aunque lo calculáramos**, porque los pagos y los movimientos de stock quedan fechados
hoy (§2). El único valor honesto es la ausencia.

### 🔴 Decisión 10 · el método del abono es INFERIDO — no está en el archivo

El archivo dice **`ABONO 20 MIL`** en la columna de método de pago, y eso **no nombra un método**:
dice que hubo un abono. Se carga como `transfer` porque 37 de sus 39 métodos conocidos son
transferencia, **pero es una inferencia nuestra y queda marcada como tal**.

⚠️ **Y no es cosmética: si fue en EFECTIVO, `register_debt_payment` crea un movimiento de caja y
cambia el arqueo de ese día.** En transferencia no toca la caja.

⛔ **Pendiente de preguntarle al cliente.** Hasta que conteste, el dato en la base es una inferencia
con un origen distinto al resto del histórico, que es transcripción.

🔴 **SI CONTESTA QUE FUE EN EFECTIVO, SE CORRIGE CON UN MOVIMIENTO DE CAJA — NO editando el abono.**

| ⛔ NO | ✅ SÍ |
|---|---|
| cambiar `debt_payments.payment_method` | registrar el **ingreso de caja** que faltó |

El abono ya ocurrió y su fila lo registra: el saldo del cliente es correcto en las dos versiones.
Lo único que cambia es **si entró plata al cajón**, y eso es un hecho **de caja**, no del abono.
Editarlo hacia atrás reescribiría la historia y **dejaría el arqueo de ese día sin explicación**: la
caja mostraría un ingreso que ninguna fila justifica. Es *la historia no se reescribe, se le agrega*
aplicado a este caso.

### 🔴 Si aparece la compra de Oxandronom — el procedimiento, para que nadie lo haga al revés

| ⛔ NO | ✅ SÍ |
|---|---|
| editar la venta para ponerle costo | registrar **la compra que faltó** |
| recalcular la utilidad hacia atrás | y `adjust_cost` para el costo del producto |

**La venta vieja se queda sin ganancia y eso es correcto.** El costo está congelado en
`order_items.unit_cost` (R1 punto 8) para que una compra de hoy no cambie las utilidades de ayer. Se
corrige **de ahí en adelante**.

---

## 4 · Por qué NO se hace por SQL directo

Mismo criterio que la carga del catálogo: **el camino del producto es el que tiene los guards**.
`register_purchase` calcula el promedio ponderado, escribe el movimiento de stock y el de caja, y
valida jornada y permiso. Replicar eso con `insert` sería reimplementar la lógica de negocio en un
script — y el script no tiene tests.

**La excepción declarada:** `orders`, `customers` y `cash_movements` **se escriben por insert
directo porque así los escribe la app** (tienen policy de insert; no hay RPC). Eso no es un atajo:
es el camino.

**Con sesión de la admin, no con `service_role`** — así las policies se evalúan.

---

## 5 · Verificación: números que ya conocemos

**El criterio de éxito no es que el script termine sin error.** Es que estos números cierren, leídos
de la base:

| qué | valor esperado | de dónde sale el esperado |
|---|---|---|
| órdenes no anuladas | **30** | agrupación medida |
| suma de `orders.total` | **3.263.100** | suma de las 55 líneas |
| suma de `payments.amount` | **2.387.100** | vendido − crédito |
| órdenes a fiado pendientes | **9** | tickets a crédito |
| saldo de cartera | **856.000** | 876.000 − el abono de 20.000 |
| facturas de compra | **7** | proveedor × día |
| suma de compras | **8.997.273** | suma de qty × costo |
| movimientos de gasto | **7** | ver §7 |
| productos con `cost_price` nulo | **1** (`OXANDRONOM`) | decisión 5 |

### 🔴 EL CRITERIO DE STOCK CAMBIÓ — y lo cambió el ensayo, que es para lo que existía

*Corregido el 2026-09-07, con el ensayo en LAB Pruebas. **La versión anterior de esta sección era el
criterio equivocado**, y se reemplaza en vez de agregarse al lado.*

**Lo que decía:** que `products.stock_qty` tenía que dar el **conteo físico** del cliente —0, 20, 7,
2, 0— y que si no daba eso, la reconstrucción estaba mal.

**Lo que el ensayo midió:** el stock quedó en **0, 17, 2, 2, 0**. Dos no coincidían.

🔴 **Y el defecto no era del cargador: era del criterio.** Medido sobre el archivo:

| producto | su hoja de inventario dice | sus líneas de venta dicen |
|---|---|---|
| GALLETA NUTELLA MUTANTES | ventas **20** | ventas **23** |
| GALLETA OREO MUTANTES | ventas **18** | ventas **23** |

> **Dos hojas del cliente se contradicen entre sí**, y el conteo físico está calculado contra la que
> tiene menos ventas. `40 − 23 = 17` y `25 − 23 = 2` es exactamente lo que el cargador escribió: el
> cargador **transcribió bien**.

⚠️ **Y no es un corte por fecha:** se probó cada fecha de corte y **ninguna** reproduce las cinco
cifras. La más cercana es el 04-sep, donde tres coinciden y dos quedan a uno de distancia. El conteo
físico **no es reproducible desde el archivo**, y por lo tanto no puede ser criterio de aceptación.

**EL CRITERIO QUE SÍ SIRVE, y es el que el cargador asevera ahora:**

> **`products.stock_qty` = Σ compras − Σ ventas del archivo, para los 42 productos.**

Sale del mismo archivo, cubre **todo** el catálogo en vez de cinco filas, y falla en las dos
direcciones. ✅ **Verde en el ensayo: los 42 cierran.**

**El conteo físico queda como INFORMACIÓN y como pregunta para el cliente:** difiere en 3 en Nutella
y en 5 en Oreo, y esa diferencia es entre **dos hojas suyas**, no algo que la carga pueda arreglar.

⚠️ Es el mismo error que este proyecto ya tiene escrito, en un eje nuevo: *un número que viene de
otro camino* es un gran control cruzado **siempre que ese número sea reproducible**. Éste no lo era,
y darlo por criterio habría hecho fallar una carga correcta — la misma forma que la suma de control
inventada del 2026-09-06.

---

## 6 · Idempotencia y reversa — decidir ANTES de escribir

🔴 **Ninguna de estas tablas tiene policy de `DELETE`.** Una venta se anula, no se borra; una compra
se devuelve, no se borra. **Una carga a medias no se limpia: se convive con ella.**

Por eso:

1. El script corre **día por día**, y cada día es un paso que se puede reintentar.
2. Antes de escribir cualquier cosa, **cuenta lo que ya hay** y aborta si no es lo que espera —el
   mismo guard 2 de `cargar-catalogo.mjs`.
3. **Marca de origen:** cada orden lleva en `notes` una marca del ticket del archivo, para poder
   enumerar después qué entró por la reconstrucción y qué es operación real. Sin esa marca, dentro
   de un mes nadie va a poder separarlas.
4. Se corre **primero entero contra LAB Pruebas**, y recién con los nueve controles de §5 en verde
   se corre contra Muscle Pro.

---

## 7 · Bloqueos y dependencias — se resuelven antes de la primera escritura

### 🔴 Bloqueo 1 · La deuda 96 y la carga se pisan

La deuda 96 es *«una venta se puede fechar en el futuro y nada lo impide»*, y su arreglo es un
trigger que rechaza fechas futuras en `orders`.

> **Si la 96 se arregla ANTES de la carga, las 2 ventas del 2026-09-07 se rechazan.**

**Las dos salidas, y las dos son legítimas:**

| salida | consecuencia |
|---|---|
| cargar primero, arreglar después | el histórico entra completo; la 96 queda abierta unos días más |
| arreglar primero | hay que esperar al 08-sep para cargar esas dos, o cargarlas aparte |

⚠️ **Está anotado en las dos puntas —acá y en la deuda 96— para que nadie cierre una rompiendo la
otra.** Es la misma forma que la dependencia con la 97.

### 🔴 Bloqueo 2 · La deuda 97 es el mecanismo del paso 7

Si la 97 se arregla —`closed_at` inmutable— **la reconstrucción pierde el único camino** para dejar
las jornadas con su fecha real. Anotado en las dos puntas.

### ✅ RESUELTO · «Compra Gmn» es la MISMA factura → **7 gastos, no 8**

| dónde | concepto | monto |
|---|---|---|
| hoja `Gasto` | `Compra Gmn` | 5.049.000 |
| hoja `Compra de inventario` | factura GMN del 04-sep | 4.916.773 |

**Confirmado por el cliente: es la misma.** La línea de gastos **se descarta** y la compra entra como
compra. Cargar las dos habría contado 5.049.000 dos veces.

✅ **Y la diferencia de 132.227 quedó explicada al medir Hoja1** (enumeración §9): son los **3 puntos
entre el 16% que la cotización calcula y el 19% que pagó** —`4.238.597 × 0,03 = 127.158`— más unos
5.070 de redondeo entre el total calculado y el redondo que anotó como gasto. **No era un flete ni
un anticipo: era la tasa.**

### ✅ RESUELTO · plazo de crédito: **15 días** en las 9 ventas a crédito

**Confirmado por el cliente**, ya no es un supuesto. Se escribe en `orders.plazo_dias`, que **se
congela en la venta** (deuda 46): la cartera lo lee de ahí y no del cliente, así que cambiarle el
plazo mañana no mueve el vencimiento de estas nueve.

---

## 8 · Lo que este plan NO hace

- **No replica el «Resumen General».** Ver enumeración §8: su hoja contesta *dónde está mi plata* y
  necesita dos conceptos que Nodo no tiene —aporte de capital y cuentas con saldo—. Es un módulo de
  tesorería, no un re-skin de Reportes, y además **la hoja que quiere replicar hoy no funciona**: 8
  celdas en `#REF!`.
- **No arregla las deudas 96 ni 97.** Las usa y las deja anotadas.
- **No carga códigos de producto.** La columna no existe (deuda 41). `HALOTESTIN` → `001-10` está
  verificado contra el maestro y anotado para cuando exista.
