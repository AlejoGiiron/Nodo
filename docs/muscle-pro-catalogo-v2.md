# Muscle Pro — Hoja de ruta del catálogo · v2

*2026-09-06. Salida del cruce de `Control_Mp_2.xlsx`. Reemplaza a la v1 del 2026-09-03.*
*Todo medido contra el archivo, no estimado.*

---

## Lo que cambió respecto del archivo anterior

| | v1 (03-sep) | v2 (06-sep) |
|---|---|---|
| Productos en el maestro | 20 | **42**, todos con código |
| Nombres en movimientos fuera del maestro | 17 | **0** — el cruce cierra |
| Ventas | 26 líneas | 55 líneas, 20 clientes |
| Compras | 29 líneas, 3 proveedores | 44 líneas, **6 proveedores** |
| Columnas nuevas en ventas | — | `Precio Base` · `Precio real` · `TIPO DE PAGO` · `METODO DE PAGO` |
| Hoja nueva | — | `Hoja1`: cotización GMN de 14 productos |

**El cliente resolvió las fusiones él mismo.** Las variantes de nombre desaparecieron y el maestro es la fuente.

---

## Las cinco preguntas, resueltas por el archivo

| # | Pregunta | Respuesta que trae el archivo |
|---|---|---|
| 1 | Los 8 sin precio | **Tienen precio por fórmula.** `Precio Base` = `Costo × 1,15` en 55 de 55 ventas. Es su regla de margen mínimo, y se deriva para todos |
| 2 | ¿Galleta Oreo una o dos? | **Una.** `GALLETA OREO CHOCOLATE` ya no existe en el maestro ni en ventas |
| 3 | ¿Clenbunom / Clembuterol / Oxandronom? | **Clenbunom era Clembuterol** — desapareció y sus ventas figuran bajo `CLEMBUTEROL 100 TBL VENOM`. **Oxandronom es aparte** (001-4) |
| 4 | ¿Cuál precio de catálogo? | **El `Precio Base`.** Vendió por encima 33 veces y por debajo 22: no hay techo ni piso, solo su base y la negociación |
| 5 | Intenze 14 a costo | Sigue sin respuesta directa, pero ya no es raro: vende por debajo de su base 22 de 55 veces |

---

## 🔴 Decisión: el precio de catálogo es su `Precio Base`

Es su número, existe para los 42, y es una sola regla. Vos pediste *tal cual el Excel*.

**Consecuencia que hay que aceptar con los ojos abiertos:** los 17 ya cargados tienen otro precio —"el más alto observado", que fue invención nuestra—. Pasan a base. Y como vende por encima del base en 33 de 55 ventas, **la cajera va a editar el precio hacia arriba en la mayoría de las ventas**, y la confirmación del ±20% va a saltar en ventas normales (Best Whey: base 102.350, vende a 140.000 = +37%).

Eso se anota como deuda de producto, no se resuelve acá: un guard que salta en cada venta se aprende a ignorar.

---

## 🔴 Un error en su archivo

**El código `001-7` está dos veces:** `HALOTESTIN` y `TRENBONOM A X AMPOLLAS`. La hoja de compras usa `001-7` para Trenbonom, así que **Halotestin es el que necesita otro código** — probablemente `001-10`.

No bloquea la carga (la columna de código no existe todavía, deuda 41), pero hay que decírselo.

---

## Las 8 categorías — no cambian

Su maestro sigue con `Suplementación` para 20 productos; sus hojas de movimiento los parten en Proteína / Creatina / Aminoácidos, y la cotización de GMN también. La decisión de la v1 se mantiene: **las categorías son las que usa al operar.**

`Farmacología` · `Proteína` · `Creatina` · `Aminoácidos` · `Pre entrenos` · `Quemadores` · `Snack` · `Crema de arroz`

*(Nota: escribe `AMOACIDOS` dos veces en compras. Es `Aminoácidos`.)*

---

## Los 25 por cargar

Precio = `Precio Base` de ventas; si nunca se vendió, `costo × 1,15` redondeado a peso. Los costos de GMN traen decimales por la cotización — se redondean.

| Categoría | Producto | Código | Precio | Costo ref. | Proveedor |
|---|---|---|---|---|---|
| Aminoácidos | AMINOS POWDER FRUTOS TROPICALES X 200 GR | 005-16 | 38.594 | 33.560 | GMN |
| Aminoácidos | AMINOS POWDER SANDIA MENTA X 200 GR | 005-17 | 38.594 | 33.560 | GMN |
| Creatina | CREATINA 100 GR | 005-20 | 27.106 | 23.570 | GMN |
| Creatina | CREATINA 300 GR | 005-19 | 73.314 | 63.751 | GMN |
| Crema de arroz | CREMA DE ARROZ MANI | 006-1 | 19.550 | 17.000 | ANABOLI |
| Crema de arroz | CREMA DE ARROZ MANI XL | 006-4 | 109.250 | 95.000 | ANABOLI |
| Crema de arroz | CREMA DE ARROZ OREO | 006-3 | 19.550 | 17.000 | ANABOLI |
| Crema de arroz | CREMA DE ARROZ TRADICIONAL | 006-2 | 12.075 | 10.500 | ANABOLI |
| Farmacología | CLEMBUTEROL 100 TBL VENOM | 001-1 | 86.250 | 75.000 | Venom |
| Farmacología | DECANOM X AMPOLLAS | 001-8 | 109.250 | 95.000 | Venom |
| Farmacología | HALOTESTIN | ⚠️ 001-7 | 72.450 | 63.000 | GOMEISA |
| Farmacología | OXANDRONOM 100 TABS | 001-4 | 135.700 | — | — |
| Farmacología | TESTONOM E X AMPOLLAS | 001-9 | 97.750 | 85.000 | Venom |
| Farmacología | TRENBONOM A X AMPOLLAS | 001-7 | 138.000 | 120.000 | Venom |
| Pre entrenos | TERMO ENERGY 25 SOBRES | 005-18 | 30.032 | 26.115 | GMN |
| Proteína | BI ONE 3L | 005-15 | 225.054 | 195.699 | GMN |
| Proteína | BODY 2L | 005-14 | 84.600 | 73.565 | GMN |
| Proteína | MEGA GAINER CALORIAS 2L | 005-10 | 56.996 | 49.562 | GMN |
| Proteína | MEGA GAINER CALORIAS 5L | 005-11 | 125.431 | 109.070 | GMN |
| Proteína | NITRO MAX MANTENIMIENTO 2L | 005-12 | 83.450 | 72.565 | GMN |
| Proteína | NITRO MAX MANTENIMIENTO 5L | 005-13 | 191.053 | 166.133 | GMN |
| Proteína | SUPER MEGA GAINER 10L- HIPERCALORIA | 005-9 | 192.012 | 166.967 | GMN |
| Proteína | SUPER MEGA GAINER 2L- HIPERCALORIA | 005-7 | 49.649 | 43.173 | GMN |
| Proteína | SUPER MEGA GAINER 5L- HIPERCALORIA | 005-8 | 109.328 | 95.068 | GMN |
| Snack | GALLETA ARANDANOS CHOCOLATE | 004-4 | 9.545 | 8.300 | MUTANTES |

## Los 17 ya cargados — cambian de precio

| Producto | Cargado (más alto) | Pasa a (base) |
|---|---|---|
| BEST WHEY 2 LBS | 140.000 | 102.350 |
| BIPRO 2 LBS | 177.000 | 201.250 |
| BURNER | 120.000 | 109.250 |
| CREATINA IRON NUTRITION | 87.000 | 72.450 |
| CREATINA OPTIMUN NUTRITIO | 118.000 | 96.600 |
| EAA PROSCIENCE | 105.000 | 90.850 |
| GALLETA ALMENDRA CHOCOLATE | 8.300 | 9.545 |
| GALLETA MANI MUTANTES | 13.000 | 8.395 |
| GALLETA NUTELLA MUTANTES | 12.000 | 8.395 |
| GALLETA OREO MUTANTES | 12.000 | 8.395 |
| GLUTAMINA IRON NUTRITION | 60.000 | 50.600 |
| INTENZE 14 SERVICIOS | 52.500 | 60.375 |
| INTENZE 30 SERVICIOS | 115.000 | 113.850 |
| MASTENOM E X AMPOLLAS | 150.000 | 151.800 |
| MASTENOM P X AMPOLLAS | 135.000 | 138.000 |
| TESTONOM C X AMPOLLAS | 115.000 | 97.750 |
| TESTONOM P X AMPOLLAS | 100.000 | 86.250 |

---

## Lo que el archivo dice de "lo otro" — para después del catálogo

**Crédito:** 17 de 55 ventas (31%), a 8 clientes. `SEBASTIAN SIGIN` con 6, `DAVID VILLATE` con 4. Eso es cartera real desde el día uno. Y hay un `ABONO 20 MIL` anotado como *método de pago* — es un abono en la columna equivocada.

**Método de pago:** 37 transferencias, 2 en efectivo. **Casi no entra plata al cajón**, pero las compras sí salen de él. El arqueo va a dar negativo casi siempre. No es un defecto, pero hay que decírselo antes de que lo reporte.

**Compras:** 44 líneas de 6 proveedores. Y la cotización de GMN (`Hoja1`) es la compra de 5.049.000 que está anotada en **Gastos** — la conflación que la deuda 63 corrige, otra vez en el archivo real.

**Cremas de arroz:** el costo de maní pasó de 255.000 a 17.000. El archivo viejo tenía el costo del bulto de 15 como costo unitario. Es la deuda 43 en la vida real, corregida por él.

**Inventario:** la hoja `Control de inventario` tiene conteo físico para las 5 galletas, y coincide con el teórico. Es el único inventario inicial que existe.

---

## Preguntas que quedan

1. **Halotestin:** ¿qué código le corresponde? `001-7` ya es de Trenbonom.
2. **Intenze 14 a costo:** ¿a propósito?
3. **`Camisas` 520.800 en Gastos:** ¿es mercancía para vender o uniformes? Cambia de hoja según la respuesta.
