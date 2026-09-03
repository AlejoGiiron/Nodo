# A6 · Visual contra la maqueta — pantalla por pantalla

*Auditoría del plan `docs/PLAN-2026-09-02.md` §2, iniciada el 2026-09-03. **No arregla nada**: produce
la lista de divergencias clasificadas, y la lista (a) es lo que después se ejecuta, en orden.*

> **Estado: par de calibración.** Sólo el **Mostrador + sidebar**, para calibrar la clasificación con
> el producto antes de hacer las otras nueve. Las demás pantallas se agregan a este mismo archivo.

---

## 0 · Método, y dos decisiones de instrumento que hay que decir antes de mirar

**Qué se compara con qué.** Cada par es **la app** y **la maqueta `Nodo.html`**, las dos renderizadas
por Playwright al **mismo viewport (1440×900)**, con el mismo nombre de archivo:

```
docs/auditorias/A6/app/<pantalla>-normal.png       ← la app
docs/auditorias/A6/maqueta/<pantalla>-normal.png   ← Nodo.html, misma pantalla
node docs/auditorias/A6/capturar.mjs <baseURL> mostrador      # reproduce el par
```

🔴 **Por qué NO se comparan contra los `.png` de `docs/reskin-referencia/`, que era lo pedido
literalmente.** Al enumerarlos resultaron ser **JPEG con extensión `.png`**, de ~30 KB, y su propio
`LEEME.md` (nota 7) lo dice: *"las capturas están escaladas para entrar en una sola imagen; las
medidas de verdad son las de §3, no las del PNG"*. Son un proxy con pérdida de la maqueta.
`Nodo.html` **es** la maqueta —`JERARQUIA.md`: *"las capturas ilustran la maqueta"*—, y renderizada al
mismo viewport que la app da un par honesto. Es R4: la cosa real, no el proxy.

⚠️ **La app NO es la desplegada: es el bundle de producción servido en local** (`vite preview`, mismo
`index-vgFVNSMS.js` que construiría Vercel). El deploy todavía no tiene URL. Cuando exista, **se
recaptura con el mismo comando** apuntando a esa URL, y esta nota se reemplaza. Lo que puede diferir
entre las dos es el hosting, no el bundle.

**"Normal" en la maqueta es una venta EN CURSO.** Su selector de estado arranca en `normal` y muestra
cuatro líneas y un cliente. Para que el par compare lo mismo, la app se captura con un producto en el
carrito. El estado *sin jornada abierta* que se ve en la app no existe en la maqueta (ver 2.3).

**Las tres clases, tal como se acordaron:**

| clase | qué es | qué se hace |
|---|---|---|
| **(a) INFIEL** | la maqueta muestra algo y el código lo hizo distinto **sin una decisión que lo respalde** | se arregla, en orden |
| **(b) DECIDIDO** | hay una decisión documentada (§8 de la skill, DEUDAS, BITÁCORA) que explica la diferencia | se confirma o se reabre; **no se toca sin decisión** |
| **(c) NO EXISTE** | la maqueta muestra una pantalla o bloque que el producto no tiene | es alcance, no re-skin |

---

## 1 · Mostrador + sidebar — el par de calibración

`docs/auditorias/A6/app/mostrador-normal.png` ↔ `docs/auditorias/A6/maqueta/mostrador-normal.png`

### 1.1 Sidebar

| # | la maqueta | la app | clase | respaldo |
|---|---|---|---|---|
| S1 | Tile de marca **`M`** (`--brand`) + **organización** "Muscle Pro" + "Nodo" | Sin tile. Texto "LAB Principal" (la **sede**) + "Nodo" | **(a)** | §1.1: el tile de identidad es una de las cuatro superficies de `--brand`. §5: *"bloque de identidad arriba"*. ⚠️ Si mostrar la sede en vez de la organización es intencional, no hay documento que lo diga: **decidir** |
| S2 | Grupos: `(sin título) Mostrador · Movimientos · Existencias · Cartera · Resultados · pie` | Grupos: `OPERACIÓN · CATÁLOGO E INVENTARIO · CLIENTES Y COBROS · ANÁLISIS Y ADMIN` | **(a)** | §5 *Estructura de grupos* fija los nombres y la pertenencia, y la **ADICIÓN 2026-09-01** ubica explícitamente Historial, Turnos y Configuración. Ninguna decisión documenta la agrupación de la app |
| S3 | Títulos de grupo en **caja de oración** ("Movimientos") | Títulos en **MAYÚSCULA SOSTENIDA** con letter-spacing, y chevrones colapsables | **(a)** | §5 *Reglas*: *"La mayúscula sostenida se reserva a etiquetas de columna y de KPI"* |
| S4 | **Mostrador** · **Catálogo** · **Cartera** | **Ventas** · **Productos** · **Fiado** | **(a)** | §5 nombra las entradas. Son rótulos, no pantallas: la pantalla existe en los tres casos |
| S5 | **Clientes** como entrada propia (grupo Cartera) | No hay entrada: Clientes es una **pestaña dentro de `/fiado`** | **(a)** | §5. El contenido existe (`CustomersTab`); lo que falta es la entrada de nav. No es (c) |
| S6 | **Pedidos** | No existe: ni ruta ni pantalla | **(c)** | Alcance firmado (CLAUDE.md: *"pedidos"*); sin deuda numerada encontrada — **abrirla** |
| S7 | **Utilidades** (grupo Resultados) | No existe. La app tiene **Reportes**, que la maqueta **no dibuja** | **(c)** | "Utilidades sin pantalla" ya está en la lista de lo que falta. ⚠️ Y el inverso: **Reportes existe en la app y no tiene lugar en la maqueta** — el `LEEME.md` ubica Historial/Turnos/Configuración/Login, no Reportes. **Decidir** si Reportes ES Utilidades o convive con ella |
| S8 | Compras y Gastos bajo **Movimientos**; Turnos bajo **Resultados** | Compras bajo *Catálogo e inventario*; Gastos y Turnos bajo *Clientes y cobros* | **(a)** | §5 + ADICIÓN 2026-09-01 (*"Turnos → grupo Resultados, antes de Utilidades"*) |
| S9 | Rótulo **"Turnos"** | Rótulo "Turnos" | **(b)** ✅ coincide | §5 ADICIÓN: *"la ETIQUETA sigue siendo 'Turnos' por ahora, a propósito"*; el renombre a jornada es la **deuda 38**, en su turno y después del MVP |
| S10 | **Configuración** en el **pie**, junto al usuario | Configuración como ítem del grupo *Análisis y admin*, dentro del cuerpo | **(a)** | ADICIÓN 2026-09-01: *"Configuración → el pie, junto al bloque de usuario: no es un momento del día, es el sistema"* |
| S11 | Bloque de **usuario y rol en el pie** (avatar `MR` · Marta R. · Admin) | Usuario en el **encabezado superior derecho** (Owner Lab · Administrador · `OL`); el pie tiene "Cerrar sesión" | **(a)** | §5: *"Bloque de identidad arriba, bloque de sistema y usuario abajo"* |
| — | "Tokens" y "Componentes" en el pie | No están | — | §5: *"andamiaje del archivo de diseño — NO van a la aplicación"*. **No es divergencia** |

### 1.2 Encabezado (56px)

| # | la maqueta | la app | clase | respaldo |
|---|---|---|---|---|
| H1 | Título de pantalla **"Mostrador"** + subtítulo "venta en curso" a la izquierda | **Sin título de pantalla.** A la izquierda hay una píldora "Sin turno" | **(a)** | §3 *Alturas*: encabezado de pantalla 56px con título (`--fs-head`). Misma clase que el hueco de título ya registrado en Configuración (deuda 52) |
| H2 | Control **"Atajos ?"** | No existe | **(a)** ⚠️ funcional | §5 *Reglas*: *"Los atajos se revelan con Alt o con `?`, y también con el control 'Atajos' del encabezado"*. Es más que re-skin: el mecanismo de revelado no existe. **Priorizar bajo** |
| H3 | Chip **"Costos visibles"** | No existe | **(b)** | **Deuda 42**: no hay clave de permiso para ver el costo, y la maqueta asume que la hay. Espera a la 42 |
| H4 | Selector **ESTADO** | No existe | — | andamiaje de la maqueta. **No es divergencia** |
| H5 | (nada) | Píldora **"Sin turno"** + banda amarilla *"No hay turno de caja abierto · Abrir turno"* | **(b)** | La jornada abierta es regla de producto **fail-closed** (migración `compras`: *"Abrí la jornada de caja antes de registrar una compra"*; el POS: *"cobrar requiere turno abierto"*). La maqueta no dibuja ese estado (§6 no lo lista). La banda usa `--warning-soft` y el patrón `Alert` de §4. ⚠️ La palabra "turno" es la **deuda 38** |
| H6 | (nada) | Usuario + avatar a la derecha | **(a)** | es la otra mitad de **S11** |

### 1.3 Columna izquierda — el catálogo

| # | la maqueta | la app | clase | respaldo |
|---|---|---|---|---|
| C1 | Buscador **grande** (§4 *Input POS grande: alto 52px*), con anillo de foco `--action` | Buscador más bajo (~44px por captura; **medir**) con atajo "/" | **(a)** menor | §4 *Input / SearchField*: "POS grande: alto 52px" |
| C2 | Sin fila de chips en `normal` (muestra un resultado de búsqueda) | Pestañas de categoría **subrayadas** ("Lab · E2E UndCompra…") | **(a)** menor, sólo el estilo | Las chips **sí** son del diseño (§8.10: *"Solo hay campo de texto y chips de categoría"*). Lo que difiere es la forma: §4 *Tabs / Chips*: activo = borde `--action`, fondo `--action-soft`, texto `--action-on-soft` — no subrayado |
| C3 | Columnas **CÓDIGO · PRODUCTO · UNIDAD · PRECIO · COSTO** | Columnas **PRODUCTO · PRECIO** | **(b)** | **Deuda 41**: `codigo` y `unidad` **no existen en el esquema**; **deuda 42**: `COSTO` sin permiso que lo gatee. Las dos columnas de más son hueco de esquema, no de re-skin |
| C4 | Lista plana | Encabezado de grupo por categoría ("Lab · 3 productos", con barra de color) | — | No especificado en ningún lado. **Filas, no tarjetas** (§7.3) se cumple. Se anota, no se clasifica |
| C5 | Filas de 34px, `tabular-nums` a la derecha | Filas de ~34px, precio a la derecha | ✅ coincide | §3, §7.9 |

### 1.4 Columna derecha — el cobro

| # | la maqueta | la app | clase | respaldo |
|---|---|---|---|---|
| D1 | **Cliente** + NIT + "Cambiar cliente" arriba de la columna | Encabezado **"Mostrador · Nueva orden"** (el canal) + papelera | **(b)** ✅ la app es lo decidido | **§8.15** (cerrada 2026-09-01): *"La columna derecha del mostrador NO lleva cliente ni medios de pago. Lo que lleva es canal, líneas, descuento y el panel de cobro sobre `--ink`."* **La maqueta está desactualizada respecto de la skill** |
| D2 | **CupoMeter** en la columna | No está | **(b)** | §8.15: *"CupoMeter y el bloque de cliente viven DENTRO del modal"*. Y **deuda 40**: el cupo no existe en el esquema |
| D3 | **TenderSelector** (Efectivo · Transferencia · Crédito) sobre `--ink`, **RECIBE / CAMBIO** | No están en la columna | **(b)** | §8.15: cobro en **modal de tres pasos**; §8.16: son **cinco** medios, no tres |
| D4 | Tabla de líneas **PRODUCTO · CANT · PRECIO · TOTAL** | Fila con barra de color, nombre, **precio editable** ("8.000 c/u"), stepper de cantidad, íconos de nota/quitar | **(a)** parcial | La tabla de 4 columnas es lo dibujado. El **precio editable** es la **deuda 75** (decidida), y el stepper es funcional — la maqueta no dice cómo se cambia una cantidad. Lo (a) es la **forma** de la fila, no sus controles |
| D5 | Fila "Descuento 0" siempre visible en el panel oscuro | La fila Descuento sólo aparece con descuento > 0 | **(a)** menor | La maqueta la muestra en cero |
| D6 | (nada) | Editor de **DESCUENTO** (%/$, chips 5–20%, motivo) en la columna | **(b)** | §8.15: la columna lleva *"descuento"*. Los porcentajes de las chips no están especificados |
| D7 | (nada) | Botón **"En espera"** (venta pausada) | ⚠️ **sin clase** | Es una función del producto (`HeldOrder`) que la maqueta **no dibuja** y sobre la que **no hay decisión escrita**. No es (a) —no contradice nada—, no es (b) —nadie lo decidió—, no es (c) —existe. **Ver la pregunta de calibración 2** |
| D8 | **TOTAL A COBRAR** 44px, único número grande | Igual | ✅ coincide | §7.4 |
| D9 | **"Cobrar — F12"** | Igual | ✅ coincide | §5, única excepción impresa |

### 1.5 Lo que NO es divergencia, dicho para que no se reporte

- Productos y cliente distintos (tornillos vs "Lab Cerveza"): §7.15 el contenido de ejemplo es neutro a propósito.
- Inter en las dos: verificado por medición el 2026-09-01.
- Proporción de columnas (~65/35 en la maqueta, ~60/40 en la app): las dos cumplen §7.7 (panel ≥ 360px, sin scroll horizontal).

---

## 2 · Preguntas de calibración — antes de clasificar las otras nueve

1. **S1 · ¿La identidad muestra la organización o la sede?** La maqueta muestra la organización con el
   tile de marca; la app muestra la sede sin tile. Si la sede es intencional (multi-sede), es (b) sin
   documento y hay que escribirlo; si no, es (a) entera.

2. **D7 · ¿Qué clase es "existe en el producto, la maqueta no lo dibuja y nadie lo decidió"?** Las tres
   clases acordadas no la cubren. Casos en esta pantalla: **"En espera"**, y en menor medida las chips
   de porcentaje del descuento. Propuesta: una **cuarta clase (d) NO DIBUJADO** — *el producto tiene
   algo que la maqueta no previó; se decide si se dibuja o se quita, y hasta entonces no se toca*. Es
   la imagen espejo de (c).

3. **S7 · ¿Reportes ES Utilidades?** La app tiene Reportes (vendido, cobrado, órdenes, ticket, Excel) y
   la maqueta dibuja Utilidades (cascada de utilidad con costo). Si son la misma pantalla, la (c) se
   convierte en "Reportes está a medio camino" y cambia el tamaño del hueco; si conviven, Reportes
   necesita un lugar en §5 que hoy no tiene.

4. **H2 · ¿"Atajos" entra en el re-skin o es alcance?** El control está en §5, pero revelar atajos es un
   mecanismo, no un color. Propongo (a) con prioridad baja, y que quede explícito.

---

## 3 · Lo que la calibración deja como método para las otras nueve

- **El par se captura de la maqueta, no de los JPEG.** Ya está en el script.
- **Cada fila cita el respaldo por sección o número de deuda**, no por memoria. Donde no hay respaldo
  y la app difiere, es (a); donde no hay respaldo y la app **agrega**, es la pregunta 2.
- **Las coincidencias también se listan** (✅): la ausencia de hallazgo es un hallazgo, y sin la fila
  no se distingue "no divergió" de "no se miró".
