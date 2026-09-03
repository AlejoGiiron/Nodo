# Preguntas para Muscle Pro — salidas de curar su archivo

*Abierta el 2026-09-03, al construir el lab con la forma de su operación.*
**Se llevan TODAS JUNTAS, no de a una.** Cada una nace de una ambigüedad real del
archivo `Control Mp.xlsx`, no de una duda de diseño.

---

## 1 · ¿`GALLETA OREO CHOCOLATE` es la galleta Oreo, u otra?

**Dónde aparece:** sólo en *Ventas Diarias*, categoría `GALLETA`. Nunca en el
maestro de Productos ni en Compras.

**Por qué se pregunta y no se decide:** hay dos galletas más con el mismo patrón
—`GALLETA ALMENDRA CHOCOLATE` y `GALLETA ARANDANOS CHOCOLATE`— y en esos dos
casos el sufijo `CHOCOLATE` **sí** resultó ser otro nombre de la variante
`MUTANTES`. La analogía dice que ésta también.

🔴 **Pero la analogía es evidencia débil y el costo es asimétrico:**

| decisión | si me equivoco |
|---|---|
| **fusionarla** con `GALLETA OREO MUTANTES` | una venta real cambia de producto, y **no se puede deshacer**: se pierde qué se vendió |
| **dejarla aparte** | queda una fila de más en el catálogo — dos clics |

**Decidido mientras tanto: producto propio.** Es el mismo criterio que
`stock_movements.type='return'`: dos cosas que comparten nombre y de las que no
se sabe si son la misma, **no comparten valor**.

---

## 2 · El catálogo tiene 37 nombres para 29 productos — ¿confirma las fusiones?

Ocho pares son el mismo producto escrito distinto en hojas distintas. **Ninguna
fusión se aplica sin confirmar**, porque cada una junta el historial de ventas de
dos nombres:

| se propone dejar | se propone fusionar con | qué los separa |
|---|---|---|
| `CLEMBUTEROL 100 TBL VENOM` | `CLEMBUTEROL VENOM` | la presentación omitida |
| `CREATINA OPTIMUN NUTRITIO` | `CREATINA ON` | *ON* = Optimum Nutrition |
| `GLUTAMINA IRON NUTRITION` | `GLUTAMINA` | la marca omitida |
| `GALLETA MANI MUTANTES` | `GALLETAS M MANI MUTANTES` | plural y una `M` suelta |
| `GALLETA NUTELLA MUTANTES` | `GALLETA NUTELL MUTANTES` | falta una `A` |
| `GALLETA OREO MUTANTES` | `GALLETAOREO MUTANTES` | falta el espacio |
| `GALLETA ALMENDRA CHOCOLATE` | `GALLETA ALMENDRAS MUTANTES` | dos apellidos distintos |
| `GALLETA ARANDANOS CHOCOLATE` | `GALLETA ARANDANOS MUTANTES` | dos apellidos distintos |

⚠️ **Las cuatro `CREMA DE ARROZ` (Mani · Mani XL · Oreo · Tradicional) NO se
fusionan**: son cuatro sabores reales, y un detector automático las marcó como
variantes. Por eso la lista es curada y no importada.

---

## 3 · `Suplementación`: ¿es una categoría, o el nombre viejo de tres?

En el maestro de *Productos*, **Suplementación** engloba proteína, creatina y
aminoácidos. En *Ventas* y *Compras* los tres están **al mismo nivel** que ella.

**Decidido: nueve categorías planas**, y la razón no es de diseño sino de uso —
las nueve se usaron **operando**, `Suplementación` se escribió **una vez** al
armar el maestro. No hay una jerarquía del negocio: hay dos hojas escritas en
momentos distintos con criterios distintos.

✅ **Y la salida está escrita:** las categorías son **por sede**, así que agrupar
después es un `update`, no una migración. Si el negocio necesitara jerarquía de
verdad sería un hueco de esquema —hoy son planas— pero **no hay evidencia de que
la necesite**: sólo de que una hoja quedó más gruesa que la otra.

---

## 4 · El precio se negocia por venta — MEDIDO, y ya no es pregunta

*No entra en la lista para el cliente: el archivo la contesta solo. Queda como
hallazgo.*

**Tres productos se vendieron a más de un precio.** El discriminador entre
«subió el precio» y «se negoció con ese cliente» es la FECHA:

| producto | ventas | fechas | precios | costo |
|---|---|---|---|---|
| `CREATINA OPTIMUN NUTRITIO` | 2 | **el mismo día** | 110.000 · 118.000 | idéntico |
| `TESTONOM C X AMPOLLAS` | 3 | 2 días | 109.000 y 110.000 **el mismo día** · 115.000 | idéntico |
| `CREATINA IRON NUTRITION` | 3 | 2 días | 83.000 y 87.000 **el mismo día** | idéntico |

🔴 **Dos precios distintos EL MISMO DÍA, a clientes distintos, con el costo
idéntico.** Un cambio de lista no produce eso. **Es negociación por venta.**

✅ **Y valida la deuda 75 con datos reales:** el precio editable en la línea no era
una hipótesis de producto — es lo que el negocio **ya hace en papel**, en 3 de sus
21 productos vendidos.

⚠️ **Y el dato complementario, que importa para otra cosa:** **cero** productos
tienen más de un costo unitario de compra. El promedio ponderado móvil (§8.1) **no
se ejercita con estos datos** — el lab tiene que sembrar dos compras del mismo
producto a costos distintos a propósito, o esa decisión queda sin verificar contra
nada.
