# A6 · Visual contra la maqueta — las once pantallas

*Auditoría del plan `docs/PLAN-2026-09-02.md` §2, corrida el 2026-09-03. **No arregla nada**: produce
la lista de divergencias clasificadas. La lista (a) es lo que después se ejecuta, en orden.*

> **Veredicto en tres líneas.** De las once pantallas, **ninguna coincide con la maqueta en el
> sidebar** —que es lo primero que se ve y el único elemento presente en las once—. Las dos
> divergencias más caras no son de color: **Catálogo usa tarjetas donde §7.3 dice "filas, no
> tarjetas"**, y **Gastos no puede registrar un gasto** aunque §7.8 le pide formulario lateral. Y la
> pantalla que nadie había mirado —**Login**— afirma tres cosas falsas sobre el producto.

---

## 0 · Método, y dos decisiones de instrumento

Cada par es **la app** y **la maqueta `Nodo.html`**, renderizadas por Playwright al **mismo viewport
(1440×900)**, con el mismo nombre:

```
docs/auditorias/A6/app/<pantalla>-normal.png
docs/auditorias/A6/maqueta/<pantalla>-normal.png
node docs/auditorias/A6/capturar.mjs http://localhost:4173 <pantalla ...>
```

🔴 **No se comparó contra los `.png` de `docs/reskin-referencia/`, que era lo pedido literalmente.**
Al enumerarlos resultaron ser **JPEG con extensión `.png`**, de ~30 KB, y su propio `LEEME.md`
(nota 7) lo dice: *"escaladas para entrar en una sola imagen; las medidas de verdad son las de §3, no
las del PNG"*. Es R4 aplicada a la referencia: **la captura de la maqueta no es la maqueta**. Anotado
en `docs/reskin-referencia/JERARQUIA.md`, que deja de ser fuente para A6.

⚠️ **La app es el bundle de producción servido en local** (`vite preview`, el mismo
`index-vgFVNSMS.js` que construiría Vercel). El deploy aún no tiene URL; cuando exista se recaptura
con el mismo comando.

### 🔴 Un defecto del instrumento, encontrado y corregido a mitad de camino

La primera pasada capturó **Clientes** bajo el nombre `historial`: el selector
`getByText('Historial').last()` tomó el encabezado *"Historial · últimos 6 movimientos"* del panel de
detalle de Clientes y **nunca navegó**. La captura se veía perfecta y era de otra pantalla.

Se corrigió acotando el selector al sidebar **por posición** (`boundingBox().x < 214`) y agregando un
control que confirma que el título de la pantalla dice lo que se pidió. Se re-capturaron `clientes`,
`historial` y `turnos`.

> **Es la octava falla de instrumento del proyecto**, y de la especie más silenciosa: no dio error,
> no dio un número raro, **dio una imagen creíble de la pantalla equivocada**.

⚠️ Y la corrección destapó un hallazgo real: **la pestaña Clientes no es direccionable por URL**
(`/fiado?tab=customers` se ignora). Hay que hacer clic. Eso es evidencia de **S5**.

### 🔴 Y el mismo instrumento volvió a fallar en la tanda 5 — con el control en verde

*2026-09-03. **Novena falla de instrumento**, y la primera que es una REINCIDENCIA.*

Al cerrar la tanda 5, la captura `maqueta/cartera-normal.png` era **el Mostrador**. La causa: en el
sidebar, `Cartera` es a la vez **título de grupo** e **ítem de navegación**; los dos caen dentro de
los 214px, y el primero en orden de DOM es el título, que no navega.

🔴 **Lo grave no es el selector: es que el control agregado en la corrección anterior NO PODÍA DAR
ROJO.** Miraba los primeros 200 caracteres de `body.innerText`, **que son el sidebar** — donde el
rótulo pedido está siempre, se haya navegado o no. Un control que da verde con el defecto puesto no
es un control (corolario de R4), y éste avaló una captura de la pantalla equivocada.

⚠️ **La segunda causa raíz casi se repite otra vez.** El arreglo intermedio fue geométrico —*"el
ítem lleva icono, el título de grupo no, así que el ítem no empieza en el margen"*— y dejó afuera a
**Configuración**, que vive en el pie y tampoco tiene icono. **La propiedad que separa un ítem de un
rótulo no es dónde está: es que NAVEGA.** La versión final prueba los candidatos del sidebar y se
queda con el que hace cambiar el título del área de contenido: **el control elige en vez de
confirmar**, así que no puede quedar de adorno.

✅ **Alcance de la contaminación, enumerado y no supuesto:** se re-capturaron **las once** pantallas
de la maqueta con el control nuevo. `Cartera` era la única cuyo rótulo colisiona con un título de
grupo, y fue la única que cambió. Las diez restantes ya eran correctas.

### Las clases

| clase | qué es | qué se hace |
|---|---|---|
| **(a) INFIEL** | la maqueta muestra algo y el código lo hizo distinto **sin decisión que lo respalde** | se arregla, en orden |
| **(b) DECIDIDO** | hay una decisión documentada que explica la diferencia | se confirma o se reabre; no se toca sin decisión |
| **(c) NO EXISTE** | la maqueta muestra algo que el producto no tiene | es alcance, no re-skin |
| **(d) NO DIBUJADO** | el producto tiene algo que la maqueta no previó **y nadie decidió** | 🔴 **NO SE TOCA en el re-skin.** Se anota y se decide aparte |

🔴 **La regla de (d), y es la que protege lo que ya funciona:** un (d) **no puede desaparecer porque
la maqueta no lo tenía**. Eso sería la maqueta borrando funcionalidad probada. Se decide aparte si se
dibuja o se quita.

---

## 1 · El sidebar — está en las once pantallas y no coincide en ninguna

*Se audita una vez porque es el mismo componente en las once.*

| # | la maqueta | la app | clase | respaldo |
|---|---|---|---|---|
| **S1** | Tile `--brand` + **organización** "Muscle Pro" + "Nodo" | Sin tile. **"LAB Principal"** (la sede) + "Nodo" | **(a)** | ✅ **DECIDIDO 2026-09-03 y escrito en §5**: tile + **organización** arriba + **sede** debajo; **el nombre del producto sale del sidebar** — ese bloque es del tenant |
| **S2** | `(sin título) Mostrador · Movimientos · Existencias · Cartera · Resultados` | `OPERACIÓN · CATÁLOGO E INVENTARIO · CLIENTES Y COBROS · ANÁLISIS Y ADMIN` | **(a)** | §5 *Estructura de grupos* + ADICIÓN 2026-09-01 |
| **S3** | Títulos de grupo en **caja de oración** | **MAYÚSCULA SOSTENIDA** + chevrones colapsables | **(a)** | §5 *Reglas*: *"la mayúscula sostenida se reserva a etiquetas de columna y de KPI"* |
| **S4** | **Mostrador · Catálogo · Cartera** | **Ventas · Productos · Fiado** | **(a)** | §5. Son rótulos: la pantalla existe en los tres casos |
| **S5** | **Clientes**, entrada propia | Pestaña dentro de `/fiado`, **sin dirección propia** | **(a)** | §5. El contenido existe (`CustomersTab`); falta la entrada. Medido: `?tab=` se ignora |
| **S6** | **Pedidos** | No existe | **(c)** | Alcance firmado (CLAUDE.md). **Sin deuda numerada — abrirla** |
| **S7** | **Utilidades** | No existe | **(c)** | Ver §4.2 |
| **S8** | Compras/Gastos en *Movimientos*; Turnos en *Resultados* | Compras en *Catálogo e inventario*; Gastos y Turnos en *Clientes y cobros* | **(a)** | §5 + ADICIÓN 2026-09-01 |
| **S9** | Rótulo **"Turnos"** | "Turnos" | **(b)** ✅ | §5 ADICIÓN: la etiqueta se conserva a propósito; el renombre es la **deuda 38** |
| **S10** | **Configuración** en el **pie** | Ítem del grupo *Análisis y admin* | **(a)** | ADICIÓN 2026-09-01 |
| **S11** | **Usuario y rol en el pie** | Usuario en el **encabezado**; el pie tiene "Cerrar sesión" | **(a)** | §5: *"bloque de sistema y usuario abajo"* |
| **S12** | (nada) | **Reportes** | **(d)** | ✅ **RESUELTO 2026-09-03**: entra a §5 en `Resultados`, entre Turnos y Utilidades |
| — | "Tokens"/"Componentes" | No están | — | §5: andamiaje. **No es divergencia** |

**El encabezado, también en las once:**

| # | la maqueta | la app | clase | respaldo |
|---|---|---|---|---|
| **H1** | Título de pantalla + subtítulo | Presente en 9 de 11; **falta en Mostrador** (lo ocupa la píldora "Sin turno") y en **Turnos** (sin subtítulo) | **(a)** | §3 *Alturas*: encabezado 56px con título |
| **H2** | Control **"Atajos ?"** | No existe en ninguna | **(a)** ⚠️ prioridad baja | §5 *Reglas*. Confirmado 2026-09-03: es (a) y no rompe nada, pero es lo que hace que los atajos se descubran |
| **H3** | Chip **"Costos visibles"** | No existe | **(b)** | **Deuda 42**: no hay clave de permiso para ver el costo |
| **H4** | (nada) | Banda **"No hay turno de caja abierto · Abrir turno"** en las once | **(b)** | La jornada abierta es regla fail-closed del producto; la maqueta no dibuja ese estado. Usa `--warning-soft` y el patrón `Alert` de §4 |

---

## 2 · Mostrador

`app/mostrador-normal.png` ↔ `maqueta/mostrador-normal.png`

### 2.1 🔴 La columna de cobro — RECLASIFICADA de (b) a (a) el 2026-09-03

*Cuando se escribió el par de calibración, §8.15 decía que el cobro se quedaba en modal y la app
estaba en lo correcto. **§8.15 se reabrió y se revirtió**: el cobro va en línea, como la maqueta.*

| # | la maqueta | la app | clase |
|---|---|---|---|
| D1 | **Cliente** + NIT + "Cambiar cliente" en la columna | Encabezado "Mostrador · Nueva orden" (el canal) | **(a)** |
| D2 | **CupoMeter** proyectado con la venta en curso | No está | **(a)** ⚠️ bloqueado por la **deuda 40**: el cupo no existe en el esquema |
| D3 | **TenderSelector** sobre `--ink` + **RECIBE / CAMBIO** en la columna | Cobro en **modal de tres pasos** | **(a)** ⚠️ **son cinco medios, no tres** (§8.16 sigue en pie) |
| D4 | Tabla de líneas `PRODUCTO · CANT · PRECIO · TOTAL` | Fila con barra de color, precio editable, stepper, íconos | **(a)** parcial: la **forma** de la fila. El precio editable es la **deuda 75**, decidida |
| D5 | Fila "Descuento 0" siempre visible | Sólo aparece con descuento > 0 | **(a)** menor |
| D8 | **TOTAL A COBRAR** 44px | Igual | ✅ §7.4 |
| D9 | **"Cobrar — F12"** | Igual | ✅ §5 |

🔴 **El cambio de flujo va en su propio turno, DESPUÉS de la lista (a) del Mostrador.** Son dos
cambios sobre la misma pantalla y un rojo no se atribuiría. Y los 51 specs del modal siguen siendo la
definición de "cobrar funciona": el flujo nuevo no sale hasta que pasen contra él.

### 2.2 Columna izquierda

| # | la maqueta | la app | clase | respaldo |
|---|---|---|---|---|
| C1 | Buscador **52px** (§4 *Input POS grande*) | ~44px | **(a)** menor | §4 |
| C2 | Chips de categoría | Pestañas **subrayadas** | **(a)** menor | §4 *Tabs/Chips*: activo = borde `--action`, fondo `--action-soft` |
| C3 | `CÓDIGO · PRODUCTO · UNIDAD · PRECIO · COSTO` | `PRODUCTO · PRECIO` | **(b)** | **Deudas 41 y 42** |
| C4 | Lista plana | Encabezado de grupo por categoría | **(d)** | No especificado. §7.3 se cumple (filas) |
| C5 | Filas 34px, `tabular-nums` | Igual | ✅ | §3, §7.9 |

### 2.3 Los (d) del Mostrador — enumerados antes de tocarlo

*Regla acordada: **ninguno se toca** en el re-skin.*

1. **"En espera"** (venta pausada, `HeldOrder`). Funcionalidad probada, la maqueta no la dibuja.
2. **Editor de descuento en la columna** con chips 5/10/15/20 % y motivo. §8.15 dice que la columna
   lleva *"descuento"*, pero **no dice con qué forma**; los porcentajes no están especificados.
3. **Encabezado de grupo por categoría** en la lista de productos (C4).
4. **Stepper de cantidad y botón de nota** en la línea del carrito. La maqueta muestra `CANT` como
   número y no dice cómo se cambia.
5. **Píldora "Sin turno"** en el encabezado (además de la banda H4).

---

## 3 · Catálogo — 🔴 la divergencia más cara del re-skin

`app/catalogo-normal.png` ↔ `maqueta/catalogo-normal.png`

| # | la maqueta | la app | clase | respaldo |
|---|---|---|---|---|
| **K1** | **Tabla de filas** con `CÓDIGO · PRODUCTO · CATEGORÍA · UNID · PRECIO · COSTO · MARGEN` | **Rejilla de tarjetas** con marcador de imagen, badge de categoría, precio y dos botones | **(a)** 🔴 | **§7.3, literal:** *"**Filas, no tarjetas.** Un catálogo de cuatro mil referencias en tarjetas redondeadas es ilegible y lento. La tarjeta se reserva para KPI, ficha y formularios."* |
| **K2** | Panel de **edición en línea** a la derecha (nombre, precio, costo, unidad, categoría) | **Modal** (`ProductModal`) | **(a)** ⚠️ es un cambio de flujo, no de piel: priorizar aparte |
| **K3** | Columna **MARGEN** (%) | No existe | **(b)** | Deriva de precio y costo; bloqueada por la **deuda 42** (permiso de costo) |
| **K4** | Chips `Todas · Ferretería · Aseo · Alimentos · Bebidas` | Pestañas subrayadas con contador | **(a)** menor | §4 *Tabs/Chips* |
| **K5** | Buscador a la izquierda del filtro | Buscador a la derecha | **(a)** menor | |
| **K6** | (nada) | **Imagen de producto** (marcador) | **(d)** | La maqueta no dibuja imágenes en ninguna pantalla |
| **K7** | (nada) | **"+ Nueva categoría"** como pestaña | **(d)** | La maqueta no muestra cómo se crea una categoría |
| **K8** | Título "Catálogo · 4.212 productos" | "Productos · 5 productos · 2 categorías" + kicker "ADMINISTRACIÓN" | **(a)** | El rótulo es S4; el kicker no está en el sistema |

⚠️ **K1 no es cosmético.** Con 37 productos las tarjetas se ven bien; el criterio de §7.3 es sobre
**miles de referencias**, y el catálogo real del cliente va a crecer. Es la fila (a) que más trabajo
implica y la que más rinde.

---

## 4 · Inventario, Reportes y Utilidades

### 4.1 Inventario

| # | la maqueta | la app | clase | respaldo |
|---|---|---|---|---|
| **I1** | KPI **VALOR DEL INVENTARIO · REFERENCIAS CON EXISTENCIA · PRODUCTOS SIN COSTO** | KPI **INSUMOS CON INVENTARIO · SIN STOCK · STOCK BAJO · EN NEGATIVO** (cuatro conteos, ningún valor) | **(b)** | **Deuda 52**, ya abierta: hueco de **pantalla**, no de esquema — los cinco se derivan de `stock_qty` y `cost_price` |
| **I2** | Tabla `CÓDIGO · PRODUCTO · EXISTENCIA · UNIDAD · COSTO · VALOR` | `Insumo · Categoría · Stock · Mínimo · Estado` | **(b)** | Deudas 41, 42 y 52 |
| **I3** | Badge **"Sin costo"** en la fila + fondo `--attention` | No existe | **(b)** | Deuda 52. §4 *DataRow*: *"Atención: fondo `--attention` (producto sin costo)"* |
| **I4** | Pestañas con subtítulo (*"la foto"* / *"la película"*) | Pestañas sin subtítulo | **(a)** menor | |
| **I5** | Palabra **"producto"** | Palabra **"insumo"** | **(a)** | §7.15 *Vocabulario neutro*: *"Productos, clientes, pedidos"*. "Insumo" es vocabulario heredado de Vento |
| **I6** | "Registrar ajuste" | "+ Ajuste manual" | **(a)** menor | |
| **I7** | (nada) | Chips de filtro `Todos · Negativo · Sin stock · Bajo · Disponible` | **(d)** | |

### 4.2 Utilidades **(c)** y Reportes **(d)** — no son la misma pantalla

✅ **Resuelto 2026-09-03.** La maqueta dibuja **Utilidades**: la cascada `Ventas − Costo de lo vendido
= Utilidad bruta − Gastos = Utilidad neta`, con margen neto, detalle de costo por categoría, aviso de
*"12 productos vendidos sin costo registrado"* y **"Ver detalle" en cada fila** (§7.13: *ningún total
existe sin su detalle*). **No existe en la app: (c).**

La app tiene **Reportes** —vendido, cobrado, órdenes, ticket promedio, vendido por día y canal,
cobrado por hora, métodos de pago, top 10 productos y dos Excel—, que la maqueta **no dibuja: (d)**.

**Los dos conviven.** Reportes ya tiene lugar en §5 (`Resultados: Turnos · Reportes · Utilidades`).
⚠️ **Falta abrir la deuda de Utilidades**: no está numerada.

---

## 5 · Compras y Gastos

### 5.1 Compras

| # | la maqueta | la app | clase | respaldo |
|---|---|---|---|---|
| **P1** | La pantalla **ES el formulario de una compra** en borrador, con **panel de efecto** a la derecha: `COSTO DEL PRODUCTO antes → después` y `ENTRADA AL INVENTARIO +N UND` | La pantalla es la **lista de facturas**; el alta es un **modal** | **(a)** 🔴 | **§7.10:** *"El efecto de una compra se muestra **antes** de aplicarla: costo antes → después y entrada al inventario por producto."* La app no muestra ese efecto **en ningún lado** |
| **P2** | Columnas `UNIDAD DE COMPRA` y `EQUIVALE A (1 bulto = 50 UND)` visibles en la línea | Existen en el modal de alta, no en la lista | **(a)** parcial | La deuda 43 ya puso el dato; falta mostrarlo |
| **P3** | Badge **"Borrador"** y botones `Aplicar compra` / `Guardar borrador` | No existe: la compra se aplica al confirmar | **(c)** | El estado `borrador` es de §6 y **no existe en el esquema** (`purchase_invoices.kind` sólo tiene `purchase`/`return`). Sin deuda — **abrirla** |
| **P4** | (nada) | Columna **Devolución** con total en negativo | **(d)** ✅ | Es la **deuda 49**, cerrada ayer. La maqueta es anterior |
| **P5** | (nada) | Pestaña **Proveedores** | **(d)** | |
| **P6** | "Compras · factura de proveedor" | "Compras · facturas de proveedor y proveedores, por sede" | ✅ | |

### 5.2 Gastos — 🔴 la segunda divergencia cara

| # | la maqueta | la app | clase | respaldo |
|---|---|---|---|---|
| **G1** | **Formulario "Registrar gasto" a la derecha**: fecha, categoría en chips, descripción, monto, pagado a | **No existe.** La pantalla sólo LISTA. Un gasto se registra desde el **banner de turno**, en `/ventas` | **(a)** 🔴 | **§7.8:** *"Gastos usa un lienzo más frío, **formulario lateral** y franja de período"* |
| **G2** | Banner **"Gasto del período"** con el total del mes a la derecha | Total en el encabezado | **(a)** menor | §7.8 *"franja de período"* |
| **G3** | Columnas `FECHA · CATEGORÍA · DESCRIPCIÓN · PAGADO A · MONTO`, categoría como **badge** | `TIPO · MOTIVO · QUIÉN·FECHA · TURNO · MONTO`, con subcategoría y "Pagado a" como segunda línea | **(a)** parcial | Los datos están (deuda 45, cerrada); la **forma** difiere |
| **G4** | (nada) | Nota de alcance: *"las compras no están acá…"* | **(d)** ✅ | Deuda 63. Criterio del artefacto autoexplicativo |
| **G5** | (nada) | Columna **TURNO** y filtro `Todos / Míos` | **(d)** | |
| **G6** | (nada) | **Paginación** (1–25 de 148) | **(d)** | §8.9: la paginación no está decidida |

⚠️ **G1 no es re-skin: hoy no se puede registrar un gasto desde Gastos.** Y el camino que existe pasa
por una pantalla que se llama Ventas. Es la fila (a) con más impacto operativo, y va a aparecer en el
plan de pruebas del día completo.

---

## 6 · Cartera y Clientes

| # | la maqueta | la app | clase | respaldo |
|---|---|---|---|---|
| **R1** | **Tabla ancha**: `CLIENTE · SALDO · ANTIGÜEDAD · VENCIDO · Abonar`, todo a la vista | **Maestro-detalle 35/65**: lista a la izquierda, detalle a la derecha | **(a)** 🔴 | Cambio de layout completo. Ninguna decisión lo respalda |
| **R2** | KPI `POR COBRAR · VENCIDO · RECAUDADO HOY` | KPI `TOTAL POR COBRAR · CLIENTES CON DEUDA · FIADOS ABIERTOS` | **(a)** | La maqueta muestra **plata**; la app, **conteos**. Mismo patrón que I1 |
| **R3** | Badge **"Mora 62 días"** + fila con fondo `--d1` y franja `--debt` | Texto "En plazo" / "Nd" bajo el nombre | **(a)** | §4 *DataRow*: *"En mora: fondo `--d1` + `inset 3px 0 0 var(--debt)`"* |
| **R4** | Columna **VENCIDO** con el monto vencido | No existe como columna | **(a)** | El dato existe desde la **deuda 46** |
| **R5** | Botón **"Abonar"** por fila | Abono desde el detalle | **(a)** menor |
| **R6** | Leyenda de antigüedad **al pie** | Leyenda **arriba** | **(b)** ✅ | Corregido a propósito el 2026-09-02: *"una leyenda que explica un código de color va donde se ve el color"* |
| **R7** | (nada) | Texto *"Ordenado por días vencidos — la barra mide antigüedad, que es otra cosa"* | **(d)** ✅ | **Deuda 46**. Es el rótulo que evita la próxima deuda 53 |
| **C-1** | **Clientes**: maestro-detalle con `CUPO ASIGNADO · SALDO ACTUAL · DISPONIBLE` e historial de movimientos | Lista plana de nombres con editar/borrar | **(a)** 🔴 | Sin ficha de cliente. El cupo es la **deuda 40** |
| **C-2** | NIT bajo cada nombre, "días de mora"/"al día" | Sólo el nombre | **(a)** | |
| **C-3** | Botones **"Vender"** y **"Editar"** en la ficha | No existe la ficha | **(a)** | |

---

## 7 · Historial, Turnos y Configuración — la maqueta no las diseñó

Las tres muestran en `Nodo.html` la nota *"existe, y se rediseña aparte — toma los tokens de este
sistema; su diseño no es parte de la Entrega 1"*, y el `LEEME.md` (nota 5) lo confirma.

> **No hay par que comparar: todo lo que difiere es (b) por definición.** Lo único auditable es que
> **consuman los tokens**, y eso ya lo verificó el re-skin del 2026-09-01/02.

**Lo que sí aplica y se anota:**

| # | qué | clase |
|---|---|---|
| **T1** | **Turnos** no tiene subtítulo en el encabezado; las otras diez sí | **(a)** menor (H1) |
| **T2** | Las tres heredan **todo el sidebar** — S1 a S12 aplican | **(a)** |
| **T3** | Configuración usa un **sub-nav lateral propio** (`AJUSTES`) que la maqueta no previó | **(d)** |
| **T4** | Configuración dice **"Nombre del sede"** | **(a)** 🔴 trivial de arreglar: error de concordancia visible al cliente |

---

## 8 · Login — la que se cerró sin mirar, y afirma tres cosas falsas

*El plan de A6 la nombraba explícitamente: *"y Login, que se cerró sin mirar"*. La maqueta no la
dibuja (§1.1 sólo dice que es una de las cuatro superficies donde `--brand` está permitida).*

| # | qué dice la pantalla | por qué es un problema | clase |
|---|---|---|---|
| **L1** | Tile con la letra **"G"** | **El producto es Nodo.** La "G" es residuo de `G-Nexo`/`gvento`, y la convención de CLAUDE.md retiró el prefijo: *"sin guion y sin «g»"*. Es la primera pantalla del producto mostrando la marca equivocada | **(a)** 🔴 |
| **L2** | Fondo y tile en **degradado turquesa/verde** | `--brand` por defecto es `#111114` y **verde es sólo confirmación** (§1.2: *"ninguna acción lo usa"*). El turquesa es el acento de **Vento** (`#10b981`) | **(a)** 🔴 |
| **L3** | *"Clientes, **cupo de crédito** y cartera al día"* | **El cupo NO EXISTE** (deuda 40). La primera pantalla promete una función que el producto no tiene | **(a)** 🔴 |
| **L4** | *"Ingresa a tu **turno** y comienza a **facturar**"* | **"Facturar"** es falso: el cliente **no factura electrónicamente** (es la fase F1 pospuesta) y el ticket dice *"Comprobante de venta"* justamente por eso. **"Turno"** es la deuda 38 | **(a)** 🔴 |
| **L5** | *"**POS** · Sedes"* bajo el nombre | **"POS"** es vocabulario de Vento; en Nodo la pantalla se llama **Mostrador** | **(a)** |
| **L6** | *"Sistema operativo · **v2.4.1**"* | Número de versión **inventado**: no corresponde a ningún artefacto del repo | **(a)** |
| **L7** | *"© 2026 Nodo"* | La convención dice que hacia afuera se dice **"Nodo, de Giiron"** | **(a)** menor |

🔴 **L1–L4 son la misma clase que el `LoginPage` de Vento que ya está en CLAUDE.md** —*"Gestión de
mesas y comandas en tiempo real"*, prometiendo dos módulos que no existían—. Es el corolario de los
strings: **el copy de UI afirma cosas del producto y ningún verificador lo mira.** Que haya vuelto a
pasar, en la misma pantalla y en el mismo repo, es el dato.

---

## 9 · Resumen para armar la lista (a)

*No es la lista de ejecución: es el inventario. El orden se decide aparte.*

| grupo | filas (a) | peso |
|---|---|---|
| **Sidebar + encabezado** | S1–S5, S8, S10, S11, H1, H2 | 🔴 alto — está en las once pantallas |
| **Catálogo: tarjetas → filas** | K1, K8, K4, K5 | 🔴 alto — §7.3 literal |
| **Gastos: formulario lateral** | G1, G2, G3 | 🔴 alto — hoy no se registra desde ahí |
| **Cartera y Clientes: tabla y ficha** | R1–R5, C-1, C-2, C-3 | 🔴 alto |
| **Mostrador: cobro en línea** | D1–D5 | 🔴 **turno propio, después del resto** |
| **Compras: panel de efecto** | P1, P2 | medio — §7.10 |
| **Login: cuatro afirmaciones falsas** | L1–L7 | 🔴 alto, **barato** — es copy y color |
| **Inventario: vocabulario** | I5, I4, I6 | bajo |
| **Configuración: "del sede"** | T4 | trivial |
| **Flujos (no re-skin)** | K2 (edición en línea) | decidir aparte |

**(c) — alcance, no re-skin:** Pedidos · Utilidades · compra en **borrador** (P3).
⚠️ **Ninguna de las tres tiene deuda numerada. Hay que abrirlas.**

**(d) — no se tocan:** En espera · editor de descuento · encabezado de grupo · stepper y nota ·
píldora "Sin turno" · imagen de producto · "+ Nueva categoría" · chips de filtro de Inventario ·
pestaña Proveedores · columna Devolución · nota de alcance de Gastos · columna Turno y filtro
Todos/Míos · paginación · rótulo de orden de Cartera · sub-nav de Configuración · **Reportes entero**.

---

## 10 · Resultado de las cinco tandas (2026-09-03)

Cada tanda cerró **comparando su par de capturas contra la maqueta renderizada**, no contra hexes
ni contra una suite verde. Los pares viven en `docs/auditorias/A6/{app,maqueta}/`.

| # | tanda | commit | par comparado | qué cambió |
|---|---|---|---|---|
| 1 | **Sidebar** | `2a22b0c` | `mostrador` | Mostrador suelto arriba; cuatro grupos (movimientos · existencias · cartera · resultados); Configuración al pie; bloque de identidad con **organización arriba y sede debajo** sobre el tile `--brand`; encabezados de grupo en caja de oración |
| 2 | **Login** | `983a44c` | `login` | cuatro afirmaciones falsas fuera (entre ellas una versión inventada) y el **emerald de Vento** reemplazado por `--action` |
| 3 | **Gastos** | `ffabb6b` | `gastos` | formulario lateral de §7.8: **la pantalla no podía registrar un gasto** — el único alta vivía en el banner de turno, en Mostrador |
| 4 | **Catálogo** | `79962cb` | `catalogo` | tarjetas → **filas** (§7.3), conservando los cuatro (d): miniatura, existencia, confirmación de desactivar y alerta de sobreventa **con su cifra en el texto** |
| 5 | **El resto** | `4478a49` | `cartera` · `inventario` · `configuracion` | "Nombre de la sede"; vocabulario neutro en Inventario (§7.15); KPI **Vencido**, badge de mora y fila en mora pintada como fila (§4) en Cartera |
| — | **arreglos** | `0c79c79` | — | el rojo que dejó la tanda 1 y el emerald que sobrevivió a la 4 (ver abajo) |

**Suite entera, con los cinco números verificados uno por uno y el exit leído de adentro del
archivo (R9):**

```
passed       -> 223 passed (14.8m)
failed       -> (ninguna línea: 0)
flaky        -> (ninguna línea: 0)
skipped      -> 17 skipped
did not run  -> (ninguna línea: 0)
suite_exit=0
control cruzado: 223 + 17 = 240 = el último número de test emitido ✅
```

### 🔴 Lo que la suite entera encontró y las tandas no

**Un rojo: `reportes.spec › el sidebar muestra el nombre del sede`.** Apuntaba a
`sidebar-brand-name`, un testid que **la tanda 1 eliminó** al partir el bloque de identidad en dos
líneas. La tanda cerró con *tsc + lint + el grupo afectado* y `reportes` no estaba en ese grupo.

> **El sidebar está en las once pantallas, así que el grupo afectado por un cambio de sidebar es
> cualquier spec que lo mire.** El recorte del grupo fue mío, no del criterio.

La **aserción sobrevivió al modelo nuevo** —el sidebar sigue teniendo que nombrar la sede— así que
no se borró: se re-derivó de la pantalla nueva y ahora asevera **de más**, el orden. Mutante
aplicado (los dos testids intercambiados): muere nombrando qué cambió, *"la ORGANIZACION va ARRIBA
de la sede", 42 donde esperaba < 16*.

**Y dos cosas que encontró MIRAR los pares, no ejecutar:**

- `ProductsPage` tenía dos botones con fondo `--action` (azul) y **halo `rgba(16,185,129,.35)`** —el
  emerald de Vento— más tres radios fuera de la escala del §3. Es la pantalla de la tanda 4, cerrada
  en verde. **El censo de hexes no lo vio porque un `boxShadow` no es un `background`:** el barrido
  migró el color que se ve y dejó el que se irradia. Y §1.2 es explícito: `--shadow-1` es el único
  nivel de elevación y está reservado a diálogos.
- El conteo de emerald que se venía arrastrando era falso —"49 en 18 archivos"— y son **52 en 20**,
  de las cuales **3 son comentarios que documentan la remoción**. Enumerar, no contar.

### Dudas abiertas — no se decidieron solas, por regla

**No se toca porque cambia qué puede hacer un usuario:**

1. 🔴 **`Cobrar — F12` está impreso y F12 NO EXISTE.** Enumerado: cero teclas de función cableadas en
   `src/` (ningún `key === 'F…'`), y el rótulo pintado en el botón del POS. **No es que falte el
   control "Atajos": es que el producto promete hoy un atajo que no funciona**, en el botón que la
   cajera usa cientos de veces al día. §5 lo declara *la única excepción permanente*, o sea que la
   maqueta cuenta con que exista. Construir "Atajos" antes de cablear las teclas sería revelar una
   lista de promesas falsas.
2. **Cartera sigue siendo maestro-detalle**, no la tabla ancha de la maqueta con columna `VENCIDO` y
   botón `Abonar` por fila. Convertirla mueve dónde se cobra, que es R1 sobre un flujo de plata.
3. **Los chevrones colapsables del sidebar** se conservaron: son una capacidad que la maqueta no
   dibuja.

**No se toca porque la maqueta no lo dibuja y habría que inventarlo:**

4. **KPI `RECAUDADO HOY`** de Cartera: exige sumar los abonos del día, consulta que hoy no existe.
   Inventar el número sería peor que no mostrarlo. **Hueco de pantalla, no de esquema.**
5. **Ficha de cliente (C-1/C-2/C-3)**: bloqueada por el cupo (deuda 40).
6. **Configuración no tiene diseño**: la maqueta dice literalmente *"su diseño no es parte de la
   Entrega 1"*, así que su par sólo valida el sidebar y el encabezado.

**Divergencias nuevas, no clasificadas en A6 — anotadas y sin tocar:**

7. El KPI **"Total por cobrar"** se pinta con la variante de alerta (`--debt-soft` + borde) igual que
   "Vencido"; la maqueta lo pinta neutro y reserva el rojo para lo vencido. **Pintar de rojo todo lo
   que hay por cobrar afirma que cobrar es un problema** — es la familia de *qué afirma el color*.
8. Inventario dice **"Productos con existencia"** donde la maqueta dice *"Referencias"*. Se eligió
   `Productos` por §7.15, pero es una divergencia deliberada con la maqueta.
9. Las pestañas de Inventario en la maqueta llevan **subtítulo** (*"la foto: cuánto hay y cuánto
   vale"* / *"la película: entradas y salidas"*); las de la app no.
10. **Catálogo muestra 4 KPI donde la maqueta muestra 3**, y **Cartera 4 donde muestra 3**: en los dos
    casos el de más es un **(d)**, y un (d) no se toca.
11. **52 ocurrencias del emerald de Vento en 20 archivos**, casi todas en modales — **invisibles para
    A6 por construcción**, porque una captura en estado normal no abre modales.
