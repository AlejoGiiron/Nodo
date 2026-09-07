# Histórico de Muscle Pro — enumeración previa al plan

*2026-09-06. **Esto NO es el plan**: es lo medido antes de armarlo, para que el plan se apoye en
mediciones y no en el enunciado del encargo. Fuente: `docs/Control Mp 2.xlsx` (fuera de git, PII) y
la base de Nodo.*

> **Todo lo de acá se midió.** Lo que no se pudo medir está marcado ⛔ y dice por qué. Los comandos
> y sondas viven en el scratchpad de la sesión; lo que importa —el resultado y cómo se obtuvo— está
> escrito acá.

---

## 0 · El encargo decía 55 ventas. Son 55 LÍNEAS y 30 tickets

🔴 **El número 55 lo puso el encargo y se repitió sin medir.** Queda anotado con esa atribución
porque es el caso exacto del criterio *«la deuda es una hipótesis fechada; el código es el dato»*,
esta vez sobre el archivo del cliente en vez de sobre el código.

### 🔴 El número pasó por tres valores, y lo que lo fijó no fue contar mejor

| valor | de dónde salió | por qué se cayó |
|---|---|---|
| **55** | del encargo, escrito sin medir | son líneas, no ventas |
| **28** | agrupando por (fecha, cliente) | **produce un objeto imposible** |
| **30** | agrupando por (fecha, cliente, tipo de pago) | ✅ vigente |

> **Lo que fijó el número no fue contar con más cuidado: fue CHOCAR CONTRA UNA RESTRICCIÓN DEL
> MODELO.** Un ticket de 28 contenía líneas de contado y de crédito a la vez, y una orden tiene **un
> solo `payment_status`. No es que 28 fuera impreciso: es que 28 describe algo que la base no puede
> representar.**

⚠️ **Y por eso vale como método y no como anécdota.** Las tres primeras cifras se podían defender
con argumentos razonables y ninguna medición de conteo las separaba — contar mejor daba 28 igual.
Lo que discriminó fue preguntarle **al modelo** si el objeto resultante existía. Es el hermano del
criterio *«un valor que significa dos cosas no es un dato»*, leído desde el otro lado: acá **dos
hechos distintos estaban siendo forzados dentro de un objeto que sólo admite uno**.

| | medido |
|---|---|
| líneas de venta | **55** |
| tickets, agrupando por (fecha, cliente) | 28 |
| 🔴 **tickets, agrupando por (fecha, cliente, TIPO DE PAGO)** | **30** |
| líneas a crédito | 17 |
| **deudas en cartera** | **9** |
| clientes distintos | 20 |
| suma de `Venta Total` | 3.263.100 |
| saldo a cobrar (líneas a crédito) | 876.000 |

**Por qué 30 y no 28 — y esto se midió porque se pidió verificarlo:** agrupar por (fecha, cliente)
**fusiona ventas distintas**. Dos grupos contienen líneas `DEBITO` **y** `CREDITO` a la vez:

```
2026-08-31  C01  5 líneas  DEBITO + CREDITO   total 588.500
2026-09-02  C07  3 líneas  DEBITO + CREDITO   total 233.000
```

🔴 **Es concluyente, no una sospecha:** una orden tiene **un** `payment_status`. Una venta cobrada y
una fiada no pueden ser la misma orden. Así que el agrupador correcto incluye el tipo de pago, y da
**30**.

⚠️ **Lo que sigue siendo indistinguible, y hay que decirlo:** el archivo **no tiene hora ni número
de factura**. Si un cliente compró dos veces el mismo día **con el mismo tipo de pago**, esas dos
compras quedan fusionadas y **nada en el archivo permite separarlas**. Hay una señal débil de que
podría haber pasado una vez:

```
2026-09-03  C10  el MISMO producto (GALLETA OREO MUTANTES) en dos líneas del mismo grupo
```

Eso es o dos visitas, o una línea tecleada dos veces. **No se puede resolver desde el archivo: se le
pregunta al cliente.**

✅ **Control que cierra:** la suma de los tickets es idéntica a la suma de las 55 líneas
(3.263.100). La agrupación no puede cambiar el total, y no lo cambia.

**Qué se rompía cargando 55 órdenes de una línea:** 25 ventas que no ocurrieron, la numeración
correlativa inflada, el total por venta convertido en el total por línea, y la cartera mostrando
**17 deudas donde hay 9**.

---

## 1 · La fecha

### Ventas NO tiene equivalente a `document_date`

Sólo compras y gastos lo tienen (deuda 44). Pero la conclusión *«entonces el histórico queda fechado
hoy»* es **sólo medio cierta**, y la mitad que no lo es cambia el plan.

### Quién escribe cada columna de fecha

| tabla · columna | quién la escribe | ¿acepta fecha pasada? |
|---|---|---|
| `orders.created_at` | **insert directo del cliente** (policy «orders: vender») | ✅ **sí — medido** |
| `orders.updated_at` | trigger `trg_orders_updated_at` | no |
| `order_items.created_at` | `add_order_items_with_extras` (definer) | ⛔ no, sin parámetro |
| `payments.created_at` | `register_sale_payment` (definer) | ⛔ no, sin parámetro |
| `stock_movements.created_at` | RPC definer | ⛔ no |
| `debt_payments.created_at` | `register_debt_payment` (definer) | ⛔ no, sin parámetro |
| `cash_movements.created_at` | insert directo | (default `now()`) |
| `cash_movements.document_date` | insert directo | ✅ sí, con guard de futuro |
| `purchase_invoices.document_date` | `register_purchase` | ✅ sí, con guard de futuro |
| `jornadas.opened_at` | insert directo | ✅ **sí — medido** |
| `jornadas.closed_at` | trigger `set_jornada_closed_at` | 🔴 **forzado a `now()`** — ver §2 |

**Cómo se midió `orders.created_at`:** en LAB, insert con `created_at` a 60 días atrás → la base lo
guardó tal cual. **Control negativo**, sin mandar la columna → quedó hoy. O sea que el instrumento
discrimina y el valor no lo pisa nadie.

**Cómo se midió que las RPC no aceptan fecha:** llamándolas con un `p_created_at` de más.
PostgREST responde que la función no existe con esa firma — no es que lo ignore, es que **no está en
la firma**.

### Consecuencia: la venta reconstruida queda PARTIDA

La orden lleva su fecha real; sus líneas, su movimiento de stock y su pago quedan **fechados hoy**.

✅ **Lo que SÍ funciona, y corrige la premisa del encargo: la antigüedad de cartera no arranca en
cero.** `useDebts` deriva el vencimiento de `orders.created_at` más el `plazo_dias` congelado en la
venta (deudas 46 y 89). Como la orden sí se puede fechar, **la cartera reconstruida envejece bien**.

⛔ **Lo que NO funciona:** cualquier reporte que ordene por la fecha de las **líneas**, de los
**pagos** o de los **movimientos de stock**. Y el arqueo, que cuadra por `created_at` de los
movimientos de caja y por jornada — ver §2.

### 🔴 Y un hallazgo lateral que no se buscaba: `orders` acepta fecha FUTURA

Medido: se insertó una orden fechada **mañana** y la base la aceptó. Compras y gastos rechazan el
futuro con un guard explícito; ventas **no tiene ninguno**. Es asimétrico y no fue una decisión.

**Deuda 96**, abierta con esta medición. Urge más que el histórico, porque el archivo del cliente
**ya trae 2 ventas fechadas 2026-09-07**.

---

## 2 · Las jornadas

### Lo que exige jornada abierta

| operación | ¿exige jornada abierta? |
|---|---|
| `register_purchase` | 🔴 **sí, aborta** si no hay |
| `cash_movements` | `jornada_id` es `not null` |
| crear una orden / cobrarla | no |
| `register_debt_payment` en efectivo | no aborta: si no hay jornada **no** crea el movimiento de caja y marca `requiere_conciliacion` |

Y hay `idx_jornadas_una_abierta_por_sede`: **una sola jornada abierta por sede**. Los días van en
serie: abrir, cargar, cerrar, abrir el siguiente.

### Medido en LAB Pruebas

| | enviado | quedó |
|---|---|---|
| `opened_at` | hace 60 días | **hace 60 días** ✅ honrado |
| `closed_at` | hace 59 días | 🔴 **hoy** — forzado por el trigger |

La jornada quedó abarcando 60 días. **El arqueo de una jornada reconstruida se calcula sobre toda su
ventana**, así que con el cierre forzado abarca desde su apertura hasta hoy.

### 🔴 El control negativo encontró lo que no se buscaba

El trigger sólo pisa en la **transición** de `null` a no-`null`. Un **segundo** update **sí** mueve
`closed_at` al pasado, y quedó medido: la fecha se movió a hace 59 días sin que nada avisara.

**Dos lecturas, y las dos importan:**

1. **Para la reconstrucción es un camino:** cerrar y después corregir la fecha, en dos pasos.
2. 🔴 **Es un defecto, no una función — deuda 97.** La fecha de cierre de una jornada ya cerrada se
   puede reescribir sin dejar rastro. Es una garantía que **sólo protege la primera vez**.

⚠️ **Las dos deudas están atadas: si se arregla la 97, la reconstrucción pierde ese camino.** Está
dicho en las dos para que nadie cierre una rompiendo la otra.

### ⛔ Lo que quedó sin medir por el camino del producto

La sonda de la jornada entró con la `service_role` key, porque la contraseña de la cuenta de LAB
Pruebas se mostró una sola vez. Con service_role **RLS no se evalúa**, así que esto midió **la
base** —el default y el trigger, que disparan para cualquier rol— y **no** el camino del producto.
Que un cajero pueda hacerlo lo contesta la policy «jornadas: abrir», leída aparte: exige
`caja.abrir` y sede propia, y **no restringe `opened_at`**. Anotado en la deuda 92.1 como **atajo de
acceso, no sujeto**.

---

## 3 · El orden y el costo

### La simulación

Se replicó el promedio ponderado móvil de `register_purchase` con sus tres caídas a `unit_cost`, y
se ejecutaron los eventos **intercalados por fecha**, comparando el costo congelado contra el
`Costo Unitario` que las ventas del archivo ya traen.

| empate del mismo día | coinciden | sin costo |
|---|---|---|
| **compras antes que ventas** | **54** | 1 |
| ventas antes que compras | 34 | 21 |

### 🔴 Ese 54 de 54 NO prueba lo que parece

**Ningún producto se compró dos veces a costos distintos.** Medido: 2 productos tienen más de una
compra, y **0** tienen costos distintos entre ellas. Entonces promedio ponderado y **último costo**
dan el mismo número en las 54 líneas — de hecho el último costo también coincide **54 de 54**.

> **La simulación es consistente con el archivo y no discrimina entre los dos métodos de costeo.**
> No podía dar rojo.

⚠️ **Y no se arregla escribiendo mejor la simulación: el límite está en los DATOS.** Ningún
escenario construido sobre este archivo puede separar los dos métodos, porque el archivo no contiene
la variación que los separa. Anotado en `CLAUDE.md` como séptima aparición de *«un verde que no
discrimina»*, y es la primera de esa familia cuya causa es la entrada y no el caso.

### El orden dentro del día es una decisión nuestra, no un dato

El archivo **no tiene hora**. Y hay **16 casos del mismo producto comprado y vendido el mismo día**:

```
2026-08-31  BIPRO 2 LBS · CREATINA IRON NUTRITION · INTENZE 14 · INTENZE 30 ·
            MASTENOM E · MASTENOM P · TESTONOM C · TESTONOM P
2026-09-02  BEST WHEY · CREATINA IRON · CREATINA OPTIMUN · las 5 galletas
```

Poner las compras primero es lo que reproduce el archivo, y es **una convención que estamos
eligiendo**. Con el orden contrario, 21 líneas quedan sin costo.

### Dos cosas más

- **`OXANDRONOM 100 TABS` se vendió y nunca se compró.** En Nodo nacería con `unit_cost` nulo; el
  archivo le asigna 118.000. Es un hueco del archivo, no del producto.
- ✅ **Control cruzado que sí cierra:** `Precio Base = Costo Unitario × 1,15` en **55 de 55**.

---

## 4 · Las ventas a crédito

**El camino del producto es binario:** si la venta es a fiado **no se escribe ningún pago**
(`useCobro`: `if (!esFiado && d.total > 0)`). No existe «venta a crédito con abono parcial» como un
solo acto.

> **Una venta a crédito con un abono ya hecho son DOS actos:** la venta a fiado, y después
> `register_debt_payment`.

Y `register_debt_payment(p_order_id, p_amount, p_payment_method)` **no acepta fecha**: el abono
queda fechado hoy. Si el método es efectivo y no hay jornada abierta, no crea movimiento de caja y
marca la fila `requiere_conciliacion`.

**El caso concreto del archivo — el «ABONO 20 MIL»:**

| | |
|---|---|
| fecha | 2026-09-06 |
| líneas | 1 · `GALLETA NUTELLA MUTANTES` × 3 |
| total | 36.000 |
| abonado | 20.000 |
| **saldo** | **16.000** |

Está escrito en la columna **METODO DE PAGO**, que es donde va el medio, no el estado — el caso
exacto de *«un valor que significa dos cosas»*, esta vez en el archivo del cliente. Además hay **13
líneas con método vacío, y las 13 son a crédito**: el método vacío ahí significa *«todavía no
pagó»*, no *«falta el dato»*.

---

## 5 · Los otros tres conjuntos

| conjunto | medido | nota |
|---|---|---|
| **compras** | **44 líneas**, en **3 fechas** y **6 proveedores** → **7 facturas** | ver abajo |
| **gastos** | **8**, del 30-ago al 06-sep | ninguno fechado en el futuro |
| **inventario inicial** | 🔴 **cero en las cinco galletas** | esa hoja compara **teórico contra físico**; no aporta saldo de apertura. Dos de las cinco quedaron en cero físico |

⚠️ **El «inventario inicial de las galletas» del encargo no existe como saldo de apertura.** Lo que
existe es un **conteo de verificación** que ya cuadra con el teórico. Si lo que se quiere es dejar
el stock actual correcto, sale solo de cargar compras y ventas — no hay nada que sembrar.

### Las 7 facturas de compra — decisión: una por PROVEEDOR y por DÍA

*Razón: es lo que un proveedor emite, y `purchase_invoices` tiene proveedor.*

| fecha | proveedor | líneas | unidades | total |
|---|---|---|---|---|
| 2026-08-31 | ANABOLI | 4 | 31 | 540.000 |
| 2026-08-31 | VENOM | 10 | 20 | 1.959.500 |
| 2026-08-31 | VIDA FIT | 2 | 2 | 162.000 |
| 2026-09-02 | GOMEISA | 1 | 1 | 63.000 |
| 2026-09-02 | MUTANTES | 5 | 100 | 755.000 |
| 2026-09-02 | VIDA FIT | 8 | 8 | 601.000 |
| 2026-09-04 | GMN | 14 | 71 | 4.916.773 |
| | | **44** | | **8.997.273** |

✅ **Control de que la decisión era necesaria, no estética:** agrupar **sólo por día** habría fundido
**3 proveedores el 31-ago** (Venom + Vida Fit + Anaboli) y **3 el 02-sep** (Vida Fit + Mutantes +
Gomeisa) en documentos que nunca existieron. Sólo el 04-sep tiene un proveedor único.

🔴 **Y hay UN caso de producto repetido dentro de una misma factura**, que era lo que había que
verificar:

```
2026-09-02 · VIDA FIT · CREATINA IRON NUTRITION    ×2 → 1u a 63.000  |  1u a 63.000
2026-09-02 · VIDA FIT · CREATINA OPTIMUN NUTRITIO  ×2 → 1u a 84.000  |  1u a 84.000
```

**Las dos veces el costo unitario es idéntico**, así que sumar las cantidades **no pierde
información** y da el mismo promedio ponderado. Decisión: **se suman** (2 unidades en una línea).
Si los costos hubieran diferido habría que dejarlas separadas, porque la línea de factura congela
un costo por unidad.

---

## 6 · Rangos de fecha, y las dos ventas de mañana

| hoja | mín | máx | posteriores a hoy |
|---|---|---|---|
| Ventas | 2026-08-31 | **2026-09-07** | 🔴 **2** |
| Compras | 2026-08-31 | 2026-09-04 | 0 |
| Gastos | 2026-08-30 | 2026-09-06 | 0 |

⚠️ *La primera versión de esta medición reportó el máximo de ventas como 2026-09-06. Era un defecto
del instrumento: imprimí el primer y el último elemento del array como si fuera el rango, y las
filas del archivo no están ordenadas. Se corrigió midiendo mínimo y máximo.*

**Las 2 ventas del 2026-09-07 son una pregunta para el cliente**, y hoy nada las frena: ver deuda 96.

---

## 7 · Las preguntas, CONTESTADAS por el cliente (2026-09-06)

| # | pregunta | respuesta |
|---|---|---|
| 1 | ¿`GALLETA OREO MUTANTES` del 03-sep son dos ventas o una? | **Es la MISMA venta.** Las dos líneas se fusionan en un ticket. **Confirmado por él, no inferido** |
| 2 | ¿Las 2 ventas del 07-sep son de mañana o un typo? | **Se cargan con su fecha.** Ver §1 y la deuda 96 |
| 3 | ¿`OXANDRONOM` se compró y no se registró? | **La venta se carga SIN COSTO.** Ver abajo |
| 4 | ¿Las camisas son mercancía o uniformes? | **Uniformes → GASTO**, con subcategoría. No entra al catálogo ni al inventario |

⚠️ **Sobre la 1, y hay que dejarlo escrito antes de cargar:** la fusión ahora está **confirmada por
el cliente**, no deducida de la ausencia de hora. Pero el principio general sigue en pie — **una
fusión no se puede deshacer después de cargar**: dos visitas cargadas como un ticket quedan como una
sola venta, con un solo número correlativo y un solo total, y nada en la base recuerda que eran dos.

### 🔴 `OXANDRONOM 100 TABS` — la venta se carga y el costo queda NULO

**No se inventa una compra.** Confirmado por el cliente.

> **Un costo nulo es VERDADERO y la pantalla lo dice con «—». Un costo inventado es FALSO y se ve
> bien.**

**La razón, entera:** fabricar una compra que no ocurrió agrega un hecho falso al inventario **y**
le pone un costo elegido por nosotros — que después **se congela en la línea de venta** (R1 punto 8)
y alimenta utilidades para siempre. El daño no queda en la compra inventada: se propaga al margen de
una venta real y ya no se puede distinguir de un dato medido.

Es el mismo criterio del **«—» para dato insuficiente**, y **la primera vez que se aplica sobre
datos de un cliente** en vez de sobre una pantalla nuestra.

🔴 **CÓMO SE CORRIGE SI APARECE LA COMPRA — y va escrito para que nadie lo intente al revés:**

| ⛔ lo que NO se hace | ✅ lo que se hace |
|---|---|
| editar la venta vieja para ponerle costo | **registrar la compra que faltó** |
| recalcular su utilidad hacia atrás | y usar **`adjust_cost`** para el costo del producto |

**La venta vieja se queda sin ganancia, y eso es correcto.** El costo está **congelado** en
`order_items.unit_cost` justamente para que una compra registrada hoy no cambie las utilidades de
ayer — si se pudiera editar, el reporte daría distinto cada vez que se abre, que es el fallo
silencioso que esa columna existe para evitar. **Se corrige de ahí en adelante, no hacia atrás.**

### La pregunta que queda abierta

**¿De dónde salió el Oxandronom?** Se vendió sin haberse comprado nunca. Puede ser una compra que no
anotó, y entonces **la respuesta la tiene él**. Si aparece, se aplica el procedimiento de arriba.

### `HALOTESTIN` → `001-10` · verificado contra el maestro

*No bloquea nada: la columna de código no existe (deuda 41). Se anota para cuando exista.*

La serie de Farmacología en la hoja `Productos`, enumerada:

```
001-1 CLEMBUTEROL · 001-2 MASTENOM E · 001-3 MASTENOM P · 001-4 OXANDRONOM
001-5 TESTONOM C  · 001-6 TESTONOM P · 001-7 HALOTESTIN 🔴 · 001-7 TRENBONOM A 🔴
001-8 DECANOM     · 001-9 TESTONOM E
```

| candidato | estado |
|---|---|
| `001-8` | ⛔ ocupado por `DECANOM X AMPOLLAS` |
| `001-9` | ⛔ ocupado por `TESTONOM E X AMPOLLAS` |
| **`001-10`** | ✅ **libre** |

La serie llega a 9 **sin huecos**, así que el siguiente libre es el 10. `001-7` es el único
duplicado, y la hoja de compras lo usa para Trenbonom: **el que se mueve es Halotestin**.

### Las camisas → gasto con subcategoría

`Camisas` **520.800**, en la hoja `Gasto`. Son uniformes, así que **no son mercancía**: no entran al
catálogo, no entran al inventario y no tienen costo de venta. Van como gasto con su subcategoría
(deuda 45, que hizo la subcategoría un desplegable editable por sede justamente para esto).

---

## 8 · La hoja «Resumen General» — qué es, y qué tendría que pasar para replicarla

*Enumerada celda por celda con sus fórmulas. **No se construyó nada**: esto es el informe previo.*

### 🔴 Primero, el dato que cambia la conversación: la hoja NO CALCULA — está rota

**8 de sus celdas están en `#REF!`**, y no es un detalle de una esquina: es la **columna del saldo
entera**.

| celda | fórmula | resultado |
|---|---|---|
| `D3` compras | `='Compra de inventario'!#REF!` | 🔴 `#REF!` |
| `E3` `E4` `E5` `E6` saldo | encadenadas sobre `D3` | 🔴 `#REF!` |
| `J9` `L9` `E10` cuadre | encadenadas sobre `E6` | 🔴 `#REF!` |

**El cliente no está mirando esos números: está mirando errores.** Lo que sí ve son las tres celdas
que sobreviven, y dos de ellas son valores **escritos a mano**.

### Qué muestra, fila por fila

No es un reporte de ventas: es un **flujo de caja / posición de capital**.

| fila | concepto | de dónde sale | medido |
|---|---|---|---|
| 2 | Capital inicial (entrada) | **escrito a mano** | 5.000.000 |
| 3 | Compra de inventario (salida) | fórmula a la hoja de compras | 🔴 `#REF!` |
| 4 | Ventas acumuladas (entrada) | **escrito a mano, sin fórmula** | 2.343.100 |
| 5 | Gastos (salida) | `=Gasto!C6` | 30.500 |
| 6 | Total | `=E5` | 🔴 `#REF!` |
| 7 | «lo que hay en nequi» | `=1131300+36000` **a mano** | 1.167.300 |
| 8 | «Lo de nelly» | **a mano** | 90.500 |
| 9 | «cuadre de caja 04 sep» | `=E7+E8` | 1.257.800 |
| 10 | diferencia | `=E9-E6` | 🔴 `#REF!` |

### 🔴 Y los dos números que sí muestra tampoco cuadran con sus propias hojas

| lo que el resumen dice | lo que suman sus hojas | diferencia |
|---|---|---|
| Gastos **30.500** (`=Gasto!C6`, **una celda**) | la hoja `Gasto` suma **8.617.300** en 8 filas | toma **una fila de ocho** |
| Ventas acumuladas **2.343.100** (a mano) | vendido **3.263.100** · cobrado **2.387.100** | 920.000 · **44.000** |
| Compras `#REF!` | 44 líneas suman **8.997.273** | no se calcula |

⚠️ **El 2.343.100 se parece al cobrado (2.387.100) pero no es igual**: se quedó 44.000 atrás. Es un
número que fue cierto en algún momento y nadie volvió a tocar — exactamente lo que este proyecto
llama *una afirmación de estado sin fecha*.

⚠️ **Y la hoja de gastos tiene adentro `Compra Gmn = 5.049.000`**, que es una **compra**, no un
gasto. Es la conflación que la deuda 63 corrige, otra vez en el archivo real. Los gastos reales, sin
esa fila, son **3.568.300**.

### Qué de su resumen ya existe en Nodo, qué se deriva, y qué falta

| lo que su resumen muestra | estado en Nodo |
|---|---|
| **Ventas acumuladas** | ✅ **ya existe** — `Vendido` y `Cobrado` en Reportes, y **separados**, que es más de lo que su hoja distingue |
| **Gastos del período** | ✅ **ya existe** — `cash_movements` con `categoria` y `subcategoria`, y con `document_date` para ordenarlos por período |
| **Compra de inventario del período** | 🟡 **se deriva** — `purchase_invoices` tiene todo (total, proveedor, `document_date`); no hay pantalla que lo muestre como una línea del flujo |
| **Saldo / caja teórica** | 🟡 **se deriva** — capital inicial + cobrado − compras − gastos. Todos los sumandos existen salvo el primero |
| **Capital inicial** | 🔴 **ESQUEMA NUEVO** — no existe el concepto de aporte de capital. `cash_movements` es de jornada, no de patrimonio |
| **«lo que hay en nequi» / «lo de nelly»** | 🔴 **ESQUEMA NUEVO** — es **saldo por cuenta o por lugar de la plata**. Nodo tiene `payment_method` en la transacción, pero **no tiene cuentas con saldo** |
| **Cuadre contra la plata real** | 🟡 parcial — el arqueo de caja cuadra **el cajón de una jornada**, no todas las cuentas |

### Contra lo que Reportes muestra hoy

| Reportes hoy | su resumen |
|---|---|
| `Vendido` · `Cobrado` · `Órdenes` · `Ticket promedio` | no distingue vendido de cobrado |
| períodos: hoy / semana / mes / mes anterior | un solo acumulado sin período |
| «Vendido por día y canal», «Cobrado por hora» | — |
| pestañas Financiero y Stock, con export | — |
| — | 🔴 **capital, cuentas y cuadre patrimonial** |

**Las cuatro vistas del archivo 12** (`daily_sales_summary`, `product_performance`, `hourly_sales`,
`user_performance`): sólo la primera fue corregida para medir **vendido y cobrado** (deuda 53); las
otras tres siguen midiendo **cobrado** por su `join payments`, o sea que **una venta a crédito sin
abonos no aparece** (deuda 73). Para un cliente con **9 deudas de 30 tickets** eso no es un detalle.

### 🔴 Lo que hay que decirle antes de prometer

> **Su «Resumen General» y la pantalla de Reportes contestan preguntas distintas.** Reportes contesta
> *cuánto vendí*; su hoja contesta *dónde está mi plata*. La segunda necesita **dos conceptos que
> Nodo no tiene**: aporte de capital y cuentas con saldo.

Replicar la hoja **tal cual** no es un re-skin de Reportes: es un módulo de tesorería. Y conviene
decirle también que **la hoja que quiere replicar hoy no funciona** — 8 celdas en error y dos
números tecleados a mano que ya no cuadran con sus propias hojas.

---

## 9 · El 16% de «Hoja1» — medido, y el archivo trae DOS tasas distintas

*Enumerado el 2026-09-06 porque de esto dependía si había que rehacer el precio de 25 productos.*

### ✅ La respuesta corta: el 16% YA ESTABA ADENTRO. No hay que rehacer nada.

**14 de 14** costos de GMN en la hoja de compras son exactamente `base × 1,16`:

```
SUPER MEGA GAINER 2L   37.218 × 1,16 =  43.172,88   ← el costo cargado
BI ONE 3L             168.706 × 1,16 = 195.698,96   ← el costo cargado
CREATINA 100 GR        20.319 × 1,16 =  23.570,04   ← el costo cargado
…14 de 14 ✅
```

Y el `Costo ref.` con el que calculamos el precio de esos 25 es **ese mismo número**. O sea que
`precio = costo(con 16%) × 1,15`: **la misma regla que el resto del catálogo, aplicada al costo que
él anotó.** Los precios quedan como están.

### Cómo está armada Hoja1

Es una **cotización de GMN**, no una factura. Por fila: `C` = precio con 40% de descuento, `D` = ese
mismo con 5% más (`D = C × 0,95`), `E` = cantidad, `F = D × E`, `G = 0,16`, `H = F × G`, `I = F + H`.

### 🔴 Y acá está lo que ninguna hipótesis contemplaba: el archivo trae DOS tasas

| celda | qué es | valor | tasa sobre el subtotal |
|---|---|---|---|
| `F16` | subtotal, sin nada | 4.238.597 | — |
| `H16` | **calculado por fórmula** | 678.175,52 | **16,0000%** |
| `I16` = `F16+H16` | **= la factura GMN de la hoja de compras** | **4.916.772,52** | 16% |
| `H17` | **escrito a mano** | 805.334 | 🔴 **19,0000%** |
| `J16` | **escrito a mano** | 5.043.936 | 🔴 **19,000%** (`F16 × 1,19` + 5,57 de redondeo) |
| gasto «Compra Gmn» | escrito a mano | 5.049.000 | 19,12% |

> **La cotización calcula 16% y el pago real fue 19%.** Los dos números están en la misma hoja, uno
> por fórmula y otro tecleado al lado.

✅ **Y eso explica los 132.227 que no cerraban:** los 3 puntos entre 16 y 19 son
`4.238.597 × 0,03 = 127.158`. El resto —unos 5.070— es la diferencia entre el `J16` calculado y el
redondo `5.049.000` que anotó como gasto.

⚠️ **El 16% no es un IVA colombiano vigente: fue la tasa general hasta 2016**, y desde 2017 es 19%.
El archivo no dice qué es —la columna `G` no tiene encabezado, sólo el número—, así que **puede ser
una plantilla vieja de GMN o un descuento comercial que coincide con la tasa vieja**. Eso lo contesta
el cliente, no el archivo.

### Consecuencia concreta sobre el margen de esos 25

Si el costo real es `base × 1,19` y el precio de lista es `base × 1,16 × 1,15`:

```
1,16 × 1,15 = 1,3340        →  1,3340 / 1,19 = 1,1210
```

**Su piso de margen en esos 25 productos no es 15%: es 12,1%.** No porque el precio esté mal
calculado, sino porque **la base sobre la que lo calculó es 3 puntos más baja de lo que pagó**.

### ¿Y los otros 5 proveedores? — no se puede saber desde el archivo

| proveedor | líneas | costos |
|---|---|---|
| GMN | 14 | **con decimales**, y los decimales salen exactamente de `× 1,16` |
| Venom · Vida Fit · Anaboli · Gomeisa · Mutantes | 30 | **enteros redondos** (120.000 · 75.000 · 17.000 · 7.300…) |

Un costo redondo es un precio acordado a mano y **no muestra su aritmética**: puede incluir IVA o
no, y el archivo no lo dice. **Los costos NO son verificablemente consistentes entre proveedores** —
de uno sabemos que lleva 16% adentro y de los otros cinco no sabemos nada. Es la pregunta que va con
la deuda 98.

---

## 10 · Residuo de las mediciones

Ninguna tabla tiene policy de `DELETE`, así que lo que una sonda escribe **no se puede borrar**.

| dónde | qué quedó |
|---|---|
| LAB Principal | 3 órdenes de sonda, **anuladas** con motivo |
| LAB Pruebas | 1 jornada cerrada |
| Muscle Pro | **nada** |
