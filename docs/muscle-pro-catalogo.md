# Muscle Pro — catálogo curado para la carga inicial

*Escrito el 2026-09-04, al preparar la carga. **Este archivo es la entrada del script**
`scripts/cargar-catalogo.mjs`: las tablas de §4 y §5 se parsean, no se leen a ojo.*

---

## 1 · De dónde salen estos datos

| fuente | qué aporta |
|---|---|
| la lista explícita del cliente (2026-09-04) | **los 17 productos, sus categorías y sus precios** — es la autoridad |
| `supabase/lab-seed-c.sql` | el curado de `Control Mp.xlsx`: 29 productos, 8 categorías, y qué se fusiona |
| `docs/lab/preguntas-para-el-cliente.md` | las tres preguntas abiertas que definen las exclusiones |

⚠️ **No sale del Excel.** `Control Mp.xlsx` tiene **37 nombres para 29 productos** —ocho pares son
el mismo producto escrito distinto en hojas distintas—. Un import por nombre habría fabricado ocho
duplicados. Por eso es curado.

🔴 **Y no se carga por SQL directo.** El script llama al mismo camino que la pantalla de Catálogo
(§7). El criterio de éxito es §6, leído **de la base**.

---

## 2 · Qué queda AFUERA, a propósito

**29 curados − 4 (preguntas 1 y 2) − 8 (sin precio de venta) = 17.**

### Los 4 que esperan una fusión

| producto | pregunta | por qué espera |
|---|---|---|
| `CLENBUNOM 100 TABS` | 2 | podría ser el mismo que `CLEMBUTEROL 100 TBL VENOM` |
| `CLEMBUTEROL 100 TBL VENOM` | 2 | ídem |
| `OXANDRONOM 100 TABS` | 2 | par pendiente de confirmar |
| `GALLETA OREO CHOCOLATE` | 1 | podría ser `GALLETA OREO MUTANTES` |

🔴 **La razón de excluirlos es asimétrica y es la que manda:** *si un producto queda cargado y
después resulta que era el mismo que otro, ya va a tener movimientos encima y deshacerlo no es
desactivar* — se pierde qué se vendió. Al revés cuesta dos clics.

### Los 8 sin precio de venta

Nunca se vendieron: sólo aparecen en Compras, así que el archivo no dice a cuánto se venden.

`CREMA DE ARROZ MANI` · `CREMA DE ARROZ MANI XL` · `CREMA DE ARROZ OREO` ·
`CREMA DE ARROZ TRADICIONAL` · `DECANOM X AMPOLLAS` · `TESTONOM E X AMPOLLAS` ·
`TRENBONOM A X AMPOLLAS` · `GALLETA ARANDANOS CHOCOLATE`

⚠️ **`Crema de arroz` se crea igual, vacía.** Sus cuatro productos son de este grupo. Es la única
categoría que nace sin productos, y es correcto: la categoría existe en el negocio.

---

## 3 · 🔴 Tres precios que el archivo da DOS VECES — y por qué se eligió el alto

Los tres productos de la **pregunta 4**: vendidos a más de un precio **el mismo día, a clientes
distintos, con el costo idéntico**. Eso no es un cambio de lista: es **negociación por venta**.

| producto | precios en el archivo | acá | `lab-seed-c` |
|---|---|---|---|
| `TESTONOM C X AMPOLLAS` | 109.000 · 110.000 · 115.000 | **115.000** | 109.000 |
| `CREATINA IRON NUTRITION` | 83.000 · 87.000 | **87.000** | 83.000 |
| `CREATINA OPTIMUN NUTRITIO` | 110.000 · 118.000 | **118.000** | 110.000 |

**Se elige el más alto, y la razón es la dirección de la negociación:** el precio de lista es el
**techo** desde el que se baja, no el piso desde el que se sube. Cargar el bajo obliga a subirlo a
mano en la venta que se cobra completa; cargar el alto deja el descuento donde el negocio ya lo
hace — en la línea, que es editable (deuda 75).

⚠️ **No es una transcripción, es una decisión**, y por eso está escrita acá y no enterrada en el
script. El seed del lab tomó el otro extremo; **ninguno de los dos es "el precio"**.

---

## 4 · Las 8 categorías

*Se crean TODAS, incluida `Crema de arroz` vacía. El `sort_order` es alfabético con paso 10 para
dejar lugar a inserciones.*

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

⚠️ **Los colores NO son los del lab: son los ocho que ofrece el selector de la pantalla**
(`CATEGORY_COLORS` en `CategoryModal.tsx`). El lab usa otros siete, y una categoría con un color
fuera de esa paleta **no se puede volver a elegir desde el modal** — el cliente abriría el selector
y no vería nada marcado. Es cosmético en dos sentidos: el Mostrador muestra la categoría como
**texto sin color** (§1.2 del design system), y cambiar cualquiera de los ocho son dos clics.

---

## 5 · Los 17 productos

*Precio en COP, punto como separador de miles, sin decimales — el formato del producto.*

| producto | categoría | precio |
|---|---|---|
| MASTENOM E X AMPOLLAS | Farmacología | 150.000 |
| MASTENOM P X AMPOLLAS | Farmacología | 135.000 |
| TESTONOM C X AMPOLLAS | Farmacología | 115.000 |
| TESTONOM P X AMPOLLAS | Farmacología | 100.000 |
| BEST WHEY 2 LBS | Proteína | 140.000 |
| BIPRO 2 LBS | Proteína | 177.000 |
| CREATINA IRON NUTRITION | Creatina | 87.000 |
| CREATINA OPTIMUN NUTRITIO | Creatina | 118.000 |
| EAA PROSCIENCE | Aminoácidos | 105.000 |
| GLUTAMINA IRON NUTRITION | Aminoácidos | 60.000 |
| INTENZE 14 SERVICIOS | Pre entrenos | 52.500 |
| INTENZE 30 SERVICIOS | Pre entrenos | 115.000 |
| BURNER | Quemadores | 120.000 |
| GALLETA ALMENDRA CHOCOLATE | Snack | 8.300 |
| GALLETA MANI MUTANTES | Snack | 13.000 |
| GALLETA NUTELLA MUTANTES | Snack | 12.000 |
| GALLETA OREO MUTANTES | Snack | 12.000 |

⚠️ **`MASTENOM E X AMPOLLAS` y sus hermanos van con UN espacio.** El seed del lab los escribe con
**dos** (`X  AMPOLLAS`), copiando el Excel. Acá se normaliza: el doble espacio es un artefacto de
tecleo, no un nombre.

🔴 **Ningún producto lleva COSTO, y es correcto.** El formulario de la pantalla **no tiene campo de
costo** (verificado: `grep -niE "costo|cost_price"` sobre `ProductModal.tsx` → cero), porque
`cost_price` se calcula por **promedio ponderado móvil dentro de `register_purchase`** (§8.1).
Escribirlo a mano acá sería sembrar la respuesta. Los 17 nacen con `cost_price = null` y lo ganan
con su primera compra registrada. Eso es lo que Inventario reporta como *"productos sin costo"*, y
en este momento es el estado honesto.

---

## 6 · 🔴 Criterio de éxito — esto se lee DE LA BASE

Al terminar, el script consulta `products` de la sede de Muscle Pro y compara contra esta lista.
**El criterio no es "el script no dio error": es que esta tabla y la base coincidan fila por fila.**

| # | producto | categoría | precio |
|---|---|---|---|
| 1 | BEST WHEY 2 LBS | Proteína | 140000 |
| 2 | BIPRO 2 LBS | Proteína | 177000 |
| 3 | BURNER | Quemadores | 120000 |
| 4 | CREATINA IRON NUTRITION | Creatina | 87000 |
| 5 | CREATINA OPTIMUN NUTRITIO | Creatina | 118000 |
| 6 | EAA PROSCIENCE | Aminoácidos | 105000 |
| 7 | GALLETA ALMENDRA CHOCOLATE | Snack | 8300 |
| 8 | GALLETA MANI MUTANTES | Snack | 13000 |
| 9 | GALLETA NUTELLA MUTANTES | Snack | 12000 |
| 10 | GALLETA OREO MUTANTES | Snack | 12000 |
| 11 | GLUTAMINA IRON NUTRITION | Aminoácidos | 60000 |
| 12 | INTENZE 14 SERVICIOS | Pre entrenos | 52500 |
| 13 | INTENZE 30 SERVICIOS | Pre entrenos | 115000 |
| 14 | MASTENOM E X AMPOLLAS | Farmacología | 150000 |
| 15 | MASTENOM P X AMPOLLAS | Farmacología | 135000 |
| 16 | TESTONOM C X AMPOLLAS | Farmacología | 115000 |
| 17 | TESTONOM P X AMPOLLAS | Farmacología | 100000 |

*(Ordenada por nombre, que es como `getProducts` la devuelve. Esta tabla es DERIVADA de §5 — el
script la reconstruye de §5 y no la parsea, para que no haya dos lados que sincronizar. Está
escrita acá para poder leerla, no para alimentar nada.)*

**Y la comparación tiene que poder dar rojo.** El script imprime, por cada producto, si coincide o
en qué difiere; si un nombre no está en la base, lo dice como **FALTA**, no como silencio.

---

## 7 · Por qué el script no hace `insert` — qué garantiza el camino de la pantalla

La condición era llamar a `upsertCategory` / `upsertProduct`. **No se pueden importar desde un
script**: viven en `src/lib/supabase-helpers.ts` y dependen de `src/lib/supabase.ts`, que lee
`import.meta.env.VITE_NODO_SUPABASE_*` — eso sólo lo resuelve Vite. Así que se enumera qué hacen y
se replica exactamente.

**Lo que hacen, entero:**

```ts
export const upsertCategory = (c) => supabase.from('categories').upsert(c).select().single()
export const upsertProduct  = (p) => supabase.from('products').upsert(p).select().single()
```

Son dos líneas. **Toda la garantía está en el cliente que las ejecuta**, no en el cuerpo:

| qué garantiza el camino | cómo lo replica el script |
|---|---|
| va con la **anon key** y el **JWT del usuario**, así que **RLS aplica** | el script hace `signInWithPassword` con la cuenta admin de Muscle Pro |
| policy `products: gestionar` → `sede_id = get_my_sede_id() and has_permission('productos.editar')` | se ejecuta igual; **si la sede del argumento no es la del admin, PostgREST rechaza** |
| el trigger `trg_products_updated_at` y los `default` de la tabla | los mismos: es la misma tabla por el mismo camino |
| el payload que arma `ProductModal` | replicado campo por campo (ver abajo) |

**Payload de producto, copiado de `ProductModal.tsx`:**
`id` (uuid v4 del cliente) · `name` · `description` · `price` · `category_id` · `sede_id` ·
`image_url` · `is_active: true` · `kind: 'simple'` · `stock_tracking: true` · `min_stock: 0` ·
`stock_qty: 0` (sólo al crear).

**Payload de categoría, copiado de `CategoryModal.tsx`:**
`name` · `description` · `color` · `is_active: true` · `sede_id` · `sort_order`.

⚠️ **Lo que el script NO replica, y por qué no cambia nada:** después de guardar, `ProductModal`
llama `reconcileRecipe({rows: []})` y `reconcile({extraIds: []})`. Sobre un producto **simple recién
creado sin extras**, los dos reconcile no tienen nada que borrar ni que insertar: son no-ops. Y
`useCategoryMutations` agrega un guard **que sólo corre al DESACTIVAR** una categoría (`id` presente
+ `is_active: false`); acá nunca se desactiva nada.

🔴 **Y lo que el `upsert` NO da: idempotencia por nombre.** No hay `unique (sede_id, name)` en
ninguna de las dos tablas (verificado), así que `upsert` sin `id` es un **insert puro** — correrlo
dos veces duplicaría. La idempotencia la pone el script: **lee primero, y si el nombre ya existe lo
dice y no lo toca.**
