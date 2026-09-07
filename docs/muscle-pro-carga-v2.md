# Muscle Pro — entrada del script para la carga v2

*Escrito el 2026-09-06. **Este archivo es la entrada de `scripts/cargar-catalogo.mjs`**: las tablas
de §4 y §5 se parsean, no se leen a ojo. Los datos salen de `docs/muscle-pro-catalogo-v2.md` —el
cruce de `Control_Mp_2.xlsx`— y están **pegados explícitos**, no derivados: si las dos tablas
divergen, la que manda es la del cruce y ésta se corrige a mano.*

---

## 1 · Qué hace esta corrida, y en qué orden

La sede ya tiene 17 productos y 8 categorías (carga v1, 2026-09-04), así que el script corre con
`--reanudar`. Ese guard exige que **todo lo que ya está** esté declarado acá — por eso §5 trae los
**42** y no sólo los 25 nuevos: los 17 ya cargados se declaran con su precio **nuevo** (el
`Precio Base`), que es lo que la verificación final compara fila por fila.

**Orden fijado, en dos commits:**

1. `scripts/actualizar-precios.mjs` pasa los 17 de *"el más alto observado"* a su `Precio Base`
   (tabla *"Los 17 ya cargados"* del cruce). Antes de eso, §5 de este archivo **no coincide** con
   la base y la verificación del script daría rojo — a propósito.
2. `scripts/cargar-catalogo.mjs --reanudar` crea los 25 nuevos y verifica los 42.

## 2 · Lo que NO se carga, a propósito

- **Costos.** El formulario no tiene ese campo y `cost_price` lo escribe `register_purchase` por
  promedio ponderado móvil. La columna *"Costo ref."* del cruce es referencia para la primera
  compra, nada más.
- **Códigos.** La columna no existe (deuda 41). ⚠️ `HALOTESTIN` se carga igual aunque en el archivo
  del cliente comparta el `001-7` con `TRENBONOM A X AMPOLLAS`; la hoja de compras usa `001-7` para
  Trenbonom, así que **Halotestin es el que necesita otro código**. Queda anotado en la deuda 41
  para el día que la columna exista.

## 3 · Precio

`Precio Base` de ventas = `costo × 1,15`, verificado en 55 de 55 ventas del archivo. Para los que
nunca se vendieron, `costo × 1,15` redondeado a peso. Formato del producto: COP, punto de miles,
sin decimales — el parser hace round-trip y aborta si un número no vuelve idéntico.

---

## 4 · Las 8 categorías

*Las ocho **ya existen** en la sede desde la v1, así que el script las encuentra y no las toca
(`= YA EXISTE`). Color y orden están acá porque el parser los exige, y son los de la v1; la
paleta del selector cambió después (deuda 91.1) y **estos valores no se escriben**.*

| nombre | color | orden |
|---|---|---|
| Aminoácidos | #0891b2 | 0 |
| Creatina | #7c3aed | 10 |
| Crema de arroz | #d97706 | 20 |
| Farmacología | #2563eb | 30 |
| Pre entrenos | #db2777 | 40 |
| Proteína | #10b981 | 50 |
| Quemadores | #059669 | 60 |
| Snack | #64748b | 70 |

## 5 · Los 42 productos

*Primero los 25 nuevos —tabla "Los 25 por cargar" del cruce, columnas Categoría · Producto ·
Precio—, después los 17 ya cargados con su precio nuevo —tabla "Los 17 ya cargados", columna
"Pasa a (base)"—. El script los verifica todos contra la base al terminar.*

| producto | categoría | precio |
|---|---|---|
| AMINOS POWDER FRUTOS TROPICALES X 200 GR | Aminoácidos | 38.594 |
| AMINOS POWDER SANDIA MENTA X 200 GR | Aminoácidos | 38.594 |
| CREATINA 100 GR | Creatina | 27.106 |
| CREATINA 300 GR | Creatina | 73.314 |
| CREMA DE ARROZ MANI | Crema de arroz | 19.550 |
| CREMA DE ARROZ MANI XL | Crema de arroz | 109.250 |
| CREMA DE ARROZ OREO | Crema de arroz | 19.550 |
| CREMA DE ARROZ TRADICIONAL | Crema de arroz | 12.075 |
| CLEMBUTEROL 100 TBL VENOM | Farmacología | 86.250 |
| DECANOM X AMPOLLAS | Farmacología | 109.250 |
| HALOTESTIN | Farmacología | 72.450 |
| OXANDRONOM 100 TABS | Farmacología | 135.700 |
| TESTONOM E X AMPOLLAS | Farmacología | 97.750 |
| TRENBONOM A X AMPOLLAS | Farmacología | 138.000 |
| TERMO ENERGY 25 SOBRES | Pre entrenos | 30.032 |
| BI ONE 3L | Proteína | 225.054 |
| BODY 2L | Proteína | 84.600 |
| MEGA GAINER CALORIAS 2L | Proteína | 56.996 |
| MEGA GAINER CALORIAS 5L | Proteína | 125.431 |
| NITRO MAX MANTENIMIENTO 2L | Proteína | 83.450 |
| NITRO MAX MANTENIMIENTO 5L | Proteína | 191.053 |
| SUPER MEGA GAINER 10L- HIPERCALORIA | Proteína | 192.012 |
| SUPER MEGA GAINER 2L- HIPERCALORIA | Proteína | 49.649 |
| SUPER MEGA GAINER 5L- HIPERCALORIA | Proteína | 109.328 |
| GALLETA ARANDANOS CHOCOLATE | Snack | 9.545 |
| BEST WHEY 2 LBS | Proteína | 102.350 |
| BIPRO 2 LBS | Proteína | 201.250 |
| BURNER | Quemadores | 109.250 |
| CREATINA IRON NUTRITION | Creatina | 72.450 |
| CREATINA OPTIMUN NUTRITIO | Creatina | 96.600 |
| EAA PROSCIENCE | Aminoácidos | 90.850 |
| GALLETA ALMENDRA CHOCOLATE | Snack | 9.545 |
| GALLETA MANI MUTANTES | Snack | 8.395 |
| GALLETA NUTELLA MUTANTES | Snack | 8.395 |
| GALLETA OREO MUTANTES | Snack | 8.395 |
| GLUTAMINA IRON NUTRITION | Aminoácidos | 50.600 |
| INTENZE 14 SERVICIOS | Pre entrenos | 60.375 |
| INTENZE 30 SERVICIOS | Pre entrenos | 113.850 |
| MASTENOM E X AMPOLLAS | Farmacología | 151.800 |
| MASTENOM P X AMPOLLAS | Farmacología | 138.000 |
| TESTONOM C X AMPOLLAS | Farmacología | 97.750 |
| TESTONOM P X AMPOLLAS | Farmacología | 86.250 |

**Suma de control de los 42 precios: la imprime el script al leer la tabla** (*"suma de precios
(control cruzado)"*) y se compara contra la que se calcula aparte del cruce. Si no cierra, alguna
fila de arriba está mal pegada.

---

## 6 · Criterio de éxito — se lee DE LA BASE

Al terminar, el script relee `products` de la sede y compara contra §5 fila por fila: nombre,
categoría y precio. **42 productos activos, 8 categorías**, ninguno de más y ninguno de menos. El
criterio no es que el script no dé error: es esa comparación, con su `carga_exit=0` escrito adentro
de la salida.
