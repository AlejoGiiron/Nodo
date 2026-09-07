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
| **compras** | **44 líneas**, en **3 fechas** (31-ago: 16 · 02-sep: 14 · 04-sep: 14) | agrupables como 3 facturas por día, o por proveedor |
| **gastos** | **8**, del 30-ago al 06-sep | ninguno fechado en el futuro |
| **inventario inicial** | 🔴 **cero en las cinco galletas** | esa hoja compara **teórico contra físico**; no aporta saldo de apertura. Dos de las cinco quedaron en cero físico |

⚠️ **El «inventario inicial de las galletas» del encargo no existe como saldo de apertura.** Lo que
existe es un **conteo de verificación** que ya cuadra con el teórico. Si lo que se quiere es dejar
el stock actual correcto, sale solo de cargar compras y ventas — no hay nada que sembrar.

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

## 7 · Preguntas abiertas para el cliente

1. **¿`GALLETA OREO MUTANTES` del 2026-09-03 (C10) son dos ventas o una línea repetida?** Es el
   único caso donde la fusión por (fecha, cliente, tipo) podría estar juntando dos visitas.
2. **¿Las 2 ventas fechadas 2026-09-07 son de mañana, o es un typo?**
3. **¿`OXANDRONOM 100 TABS` se compró y no se registró?** Se vendió sin compra previa.
4. **¿Las 3 fechas de compra son 3 facturas, o varias facturas por día?** De eso depende cuántas
   `purchase_invoices` se crean y con qué número.

---

## 8 · Residuo de las mediciones

Ninguna tabla tiene policy de `DELETE`, así que lo que una sonda escribe **no se puede borrar**.

| dónde | qué quedó |
|---|---|
| LAB Principal | 3 órdenes de sonda, **anuladas** con motivo |
| LAB Pruebas | 1 jornada cerrada |
| Muscle Pro | **nada** |
