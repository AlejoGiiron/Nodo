---
name: nodo-design-system
description: Fuente de verdad visual de Nodo (de Giiron). Usar SIEMPRE antes de construir o modificar cualquier pantalla, componente o estilo de Nodo — tokens exactos, tipografía, densidad, componentes con estados, navegación, estados obligatorios por pantalla y reglas de comportamiento visual. Si un valor no está acá, no está decidido y se pregunta, no se infiere.
---

# Nodo · Design System — Entrega 1

Fuente de verdad visual del producto. Nodo, de Giiron.
Cerrada el 2026-09-01. Implementación: app Vite única, CSS variables en `:root`, sin capa de tema para React Native.

> **Jerarquía de fuentes (R1).** Desde esta captura, **esta skill es la fuente de verdad**; el
> archivo de Claude Design (`Nodo.dc.html`) es la maqueta. Si divergen, gana la skill y se
> corrige la maqueta. Todo cambio visual se hace ACÁ primero y se propaga — nunca en dos lados
> a mano.

> **Correcciones de captura (2026-09-01).** Cuatro puntos de la entrega chocaban con decisiones
> ya tomadas en el hilo del producto y se corrigieron al capturar, marcados `[CORREGIDO]`:
> 1. El método de costeo NO está pendiente: se decidió el 2026-08-31 (§8.1).
> 2. La nota de `requiere_conciliacion` afirmaba un bloqueo de cierre de período que nadie
>    decidió (§6, movido a §8 como pregunta abierta).
> 3. Se agregó el requisito de Utilidades: las vistas miden cobrado, no vendido (§7.13).
> 4. "La ruta del conductor" no existe en el alcance de Nodo — no hay rutas ni despacho (§8.4).

Todo valor de este documento es exacto y literal. Si algo no está acá, no está decidido — ver sección 8.

---

## 1. Tokens

### 1.1 Capa de marca — por organización

Dos tokens. Los define el tenant, no el sistema. Se inyectan en `:root` al cargar la organización.

```css
--brand:      #111114;   /* superficie de identidad */
--brand-ink:  #FFFFFF;   /* texto/glifo sobre --brand */
```

**Dónde puede aparecer:** el cuadro de identidad de la barra lateral (el tile con la inicial), la pantalla de login, el lugar del logo en documentos impresos, el favicon.

**Dónde está PROHIBIDA:** botones, chips, insignias, filas de tabla, barras de progreso, bordes de foco, iconos de navegación, encabezados de tabla, cualquier fondo de fila y cualquier elemento que comunique estado.

> **Regla — el color de marca nunca comunica estado.** La fila del cliente en mora se ve idéntica en un tenant negro, uno rojo y uno azul. Si al cambiar `--brand` cambia la lectura de un estado, es un defecto.

Contraste: `--brand-ink` sobre `--brand` debe alcanzar 4.5:1. Un tenant con marca clara usa `--brand-ink:#0F172A`.

### 1.2 Capa de sistema — fija

Ninguna organización la tematiza. No es configurable por tenant.

#### Acción principal

```css
--action-900:   #0C4A6E;
--action-800:   #075985;   /* link:hover */
--action-700:   #0369A1;   /* link en reposo, texto sobre --action-soft */
--action:       #0284C7;   /* relleno de botón primario */
--action-500:   #0EA5E9;   /* tramo de venta en curso en la barra de cupo */
--action-soft:  #E0F2FE;   /* fila seleccionada, chip de pestaña activa */
--action-on-soft:#075985;  /* texto sobre --action-soft */
--action-border:#BAE6FD;   /* borde de chip suave, primer tramo de antigüedad */
```

**Se usa para:** cobrar, guardar, agregar, entregar un pedido, aplicar compra, registrar abono, la fila seleccionada, la pestaña activa, el foco.
**No se usa para:** ningún estado del dominio. Un chip de estado nunca es azul, salvo el estado propio del pedido (`Sin entregar · sin cobrar`), que es de flujo, no de salud del dato.

> **Regla — acción y estado jamás comparten familia de color.** Si hay que mirar dos veces para saber si algo es un botón o una insignia, la paleta está mal. Esta es la razón por la que acción es fría: deja todo el rango cálido libre para deuda, mora y advertencia, y el verde libre para confirmación.

#### Deuda y cartera vencida

```css
--debt-700:    #9F1239;
--debt:        #BE123C;   /* barra de cupo al 95%+, franja de fila en mora */
--debt-soft:   #FFE4E6;   /* fondo de aviso, KPI vencido */
--debt-on-soft:#9F1239;   /* texto sobre --debt-soft, cifra vencida */
--debt-border: #FDA4AF;   /* borde de insignia de mora, borde de KPI vencido */
```

**Se usa para:** saldo en mora, valor vencido, cupo consumido, proyección de cupo en negativo.
**No se usa para:** errores de validación — ese es `--danger`. Un cliente en mora no es un error del usuario.

#### Antigüedad de la deuda — escala del rol de deuda

```css
--d1: #FFF1F2;   /*  0–30 días */
--d2: #FECDD3;   /* 31–60 días */
--d3: #FB7185;   /* 61–90 días */
--d4: #BE123C;   /*   +90 días */
```

Cuatro cuadros de 16×16 con radio 2px. La antigüedad se lee por color, no leyendo una fecha.
Nota de implementación: el primer tramo del componente `AgingBar` usa `--action-border` como casilla apagada; `--d1` es el fondo de fila, no el cuadro.

#### Error y acción destructiva

```css
--danger:        #DC2626;
--danger-soft:   #FEE2E2;
--danger-on-soft:#991B1B;
```

**Se usa para:** validación fallida, anular compra, eliminar, línea con cantidad inválida.
**No se usa para:** deuda ni mora. Separado de `--debt` a propósito: "el cliente debe" y "hiciste algo mal" no son el mismo mensaje.

#### Advertencia

```css
--warning-700:   #B45309;
--warning-500:   #F59E0B;   /* barra de aviso sobre fondo oscuro */
--warning-soft:  #FEF3C7;
--warning-on-soft:#92400E;
--warning-border:#FCD34D;
```

**Se usa para:** cupo consumido, venta que excede el cupo, productos sin costo, barra de cupo entre 80% y 94%.
**No se usa para:** nada bloqueante. Advertencia significa "se puede seguir, con una decisión del dueño".

#### Confirmación

```css
--success-700:   #047857;
--success-soft:  #D1FAE5;
--success-on-soft:#065F46;
--success-border:#A7F3D0;
```

**Se usa para:** al día, abono aplicado, pedido entregado, compra aplicada, entrada de inventario en positivo.

> **Regla — verde es solo confirmación y ninguna acción lo usa.** No hay botón verde en el producto. Si aparece uno, el usuario deja de poder distinguir "esto está bien" de "hacé clic acá".

> **🔴 Regla — UNA CATEGORÍA NO SE PINTA CON LA PALETA DE LOS ESTADOS.** *[Agregada el 2026-09-02
> tras encontrar la misma forma en dos pantallas distintas.]*
>
> Las familias de esta sección **afirman algo**: `--success` dice *"salió bien"*, `--warning` dice
> *"decidí vos"*, `--danger` dice *"esto está mal"*, `--action` dice *"hacé clic"*. Usarlas para
> distinguir **clases de una cosa** —que no son ni estados ni acciones— hace que el color afirme
> cosas que nadie quiso decir.
>
> | Dónde | Qué estaba pintado | Qué afirmaba sin querer |
> |---|---|---|
> | **Inventario**, tipos de movimiento | venta azul · ajuste **violeta** · compra y devolución verdes | que una compra es una confirmación, y el violeta ni siquiera existe en el sistema |
> | **Historial**, canales de venta | mostrador ámbar · WhatsApp verde · teléfono azul | que una venta por WhatsApp confirma algo, y que una de mostrador pide una decisión |
>
> ✅ **Y en los dos casos el color era REDUNDANTE**, que es lo que hace la regla fácil de aceptar:
> los íconos ya distinguían las categorías. Al quitarlo **no se pierde información** — se deja de
> afirmar de más.
>
> **Corolario:** si hay que distinguir N cosas que no son estados ni acciones, se distinguen con
> **ícono, etiqueta o posición**. Si aun así hace falta color, se pide — no se toma prestada una
> familia que ya significa otra cosa (§8).

#### Neutros y superficies

```css
--ink:       #0F172A;   /* texto principal */
--ink-2:     #334155;   /* etiquetas de formulario, texto secundario fuerte */
--ink-3:     #64748B;   /* metadatos, encabezados de tabla, texto de apoyo */
--ink-4:     #94A3B8;   /* unidades, texto deshabilitado, guión de dato ausente */
--border:    #E2E8F0;   /* borde de tarjeta, panel, input */
--border-2:  #F1F5F9;   /* separador entre filas */
--surface:   #FFFFFF;   /* fila, tarjeta, panel */
--surface-2: #F8FAFC;   /* cabecera de tabla pegajosa, fila de resultado */
--surface-3: #FBFCFE;   /* barra de herramientas, pie de formulario */
--bg:        #F4F6F9;   /* lienzo de la aplicación */
--attention: #FFFDF5;   /* fila que reclama atención sin ser error (producto sin costo) */
```

`--ink-4` es el límite: no se usa para texto que haya que leer, solo para apoyo y para el guión de dato ausente.

#### Sobre fondo oscuro — panel de cobro y diálogos

El panel de cobro del mostrador va sobre `--ink`. Estos tokens son los únicos que se usan encima.

```css
--on-dark-2:   #94A3B8;   /* etiquetas: Subtotal, Descuento, Recibe, Cambio */
--on-dark-3:   #CBD5E1;   /* texto secundario */
--on-dark-fill:#1E293B;   /* relleno de avatar y superficie elevada sobre tinta */
--on-dark-warn:#FDE68A;   /* texto del aviso de cupo sobre tinta */
--overlay:     rgba(15,23,42,.5);
--shadow-1:    0 20px 50px rgba(15,23,42,.3);
```

`--shadow-1` es el único nivel de elevación del producto y está reservado a diálogos. Todo lo demás se separa con borde de 1px. **Las filas nunca llevan sombra.**

---

## 2. Tipografía

**Familia única: Inter.** Pesos 400, 450, 500, 600, 700.
Fallback: `Inter, system-ui, sans-serif`.

> **Regla — una sola familia proporcional. La monoespaciada no existe en el producto.** Las cifras se alinean por dígito con `font-variant-numeric: tabular-nums`, no cambiando de familia. Ningún peso por debajo de 400 en ninguna parte.

### Escala

| Token | Tamaño / peso | Uso |
|---|---|---|
| `--fs-total` | 44 / 700 / `-.03em` | Total a cobrar. El único número grande del producto |
| `--fs-hero` | 30 / 700 / `-.02em` | Margen neto en Utilidades |
| `--fs-kpi` | 26 / 600 | KPI de Cartera, Inventario, Gastos |
| `--fs-result` | 22 / 700 | Utilidad bruta y neta en la cascada |
| `--fs-title` | 20 / 600 / `-.015em` | Nombre de cliente en ficha, número de pedido |
| `--fs-head` | 16 / 600 / `-.015em` | Título de pantalla en el encabezado |
| `--fs-section` | 15 / 600 | Título de bloque, fila de resultado |
| `--fs-row` | 14 / 400 | Nombre de producto y cliente en fila. Cuerpo por defecto |
| `--fs-num` | 13 / 500 | Precio, costo, cantidad, total, saldo |
| `--fs-meta` | 12 / 400 | Metadatos, unidad, categoría, nota bajo un campo |
| `--fs-label` | 11 / 600 / `.04em` / mayúsculas | Etiqueta de columna y de KPI |

*(Los `--fs-*` están documentados pero no tokenizados como variables CSS todavía — ver §8.2.)*

### tabular-nums

Obligatorio en: precio, costo, cantidad, total, subtotal, descuento, saldo, valor vencido, cupo (asignado, consumido, disponible, proyectado), existencia, bultos, peso, monto de gasto, margen, fecha en formato corto y **código de producto**.

Prohibido en: texto corrido, nombres, descripciones, etiquetas. Aplicarlo a prosa la afea sin beneficio.

Formato de moneda: **COP sin decimales, separador de miles con punto.** Sin símbolo de peso en columnas de tabla; el encabezado ya dice qué es.

---

## 3. Espaciado, radios y densidad

### Escala de espaciado

`2 · 4 · 6 · 8 · 10 · 12 · 16 · 20 · 24 · 32 · 40` (px)

Fuera de escala no se usa. El padding lateral de una pantalla de listado es 20px; el de un panel, 16px.

### Radios

```css
--r-1: 4px;   /* chip pequeño, casilla de antigüedad, barra */
--r-2: 6px;   /* botón, input, fila seleccionada, tarjeta pequeña */
--r-3: 8px;   /* tarjeta, panel, diálogo */
999px         /* insignia de estado — píldora */
```

### Alturas

| Elemento | Alto |
|---|---|
| Barra lateral (ancho) | 214px |
| Encabezado de pantalla | 56px |
| Cabecera de tabla | 30–32px |
| **Fila de lista** | **34px** (por defecto) |
| Fila de venta / con envoltura | 38px mínimo |
| Fila de cartera | 40px |
| Fila de entrega de pedido | 44px |
| Input | 34px |
| Botón secundario | 36px |
| Botón primario de pantalla | 38–40px |
| Selector de medio de pago | 52px |
| Botón Cobrar | 52px |
| Objetivo táctil en móvil | 48px mínimo |

### Control `densidadFila`

Prop editable. Rango **30–44px, paso 2, por defecto 34px**. Afecta la fila del mostrador, la del catálogo y la de existencias. No afecta cabeceras, formularios ni el panel de cobro.

---

## 4. Componentes

Inventario de la entrega. Cada uno con sus estados y los tokens que consume.

### Button
Estados: **normal · hover · activo · deshabilitado · destructivo**.
- Primario: fondo `--action`, texto `#FFFFFF`, radio `--r-2`, peso 600. Hover: `--action-700`.
- Secundario: fondo `--surface`, borde `--border`, texto `--ink-2`.
- Destructivo: fondo `--surface`, borde `--danger-soft`, texto `--danger`. El relleno sólido `--danger` se reserva a "Anular compra".
- Deshabilitado: fondo `--border-2`, texto `--ink-4`, `cursor:not-allowed`. Nunca se oculta: se apaga y se explica al lado.
- POS: alto 52px, 16px/700.

### Badge
Estados: **al día · en mora · sin disponible · sin cupo asignado · sin entregar/sin cobrar · entregado · sin costo · borrador · aplicada · anulada**.
Píldora 999px, 11px/600, padding `3px 9px`. Fondo `*-soft`, texto `*-on-soft`, borde `*-border` cuando va sobre superficie del mismo tono.

### DataRow
Estados: **normal · hover · seleccionada · en mora · con error · reclama atención · skeleton**.
- Normal: fondo `--surface`, separador inferior `--border-2`.
- Seleccionada: fondo `--action-soft` + `box-shadow: inset 3px 0 0 var(--action)`.
- En mora: fondo `--d1` + `inset 3px 0 0 var(--debt)`.
- Con error: fondo `--danger-soft`.
- Atención: fondo `--attention` (producto sin costo).
- Skeleton: barra de 9px en `--border-2` con `@keyframes shimmer`, 1.4s. **Nunca un spinner en blanco.**

### MoneyCell
Estados: **normal · negativo · sin dato · oculto por rol**.
Alineada a la derecha, `tabular-nums`, 13px/500. Negativo (abono, entrada de caja) en `--success-700`. Sin dato y oculto por rol: `—` en `--ink-4`.

### Input / SearchField
Estados: **normal · foco · error · POS grande · deshabilitado**.
- Foco: borde `--action` + `box-shadow: 0 0 0 3px var(--action-soft)`.
- Error: borde `--danger` + `0 0 0 3px var(--danger-soft)`, con mensaje debajo en `--danger-on-soft`.
- POS grande: alto 52px, 24–28px/700, alineado a la derecha.

### CupoMeter
Estados: **holgado · ajustado · consumido · excedido por la venta en curso · sin dato**.

> **[UBICACIÓN FIJADA 2026-09-01 al cerrar §8.15.]** Vive **dentro del modal de cobro**, en el paso
> donde se elige crédito, junto al bloque de cliente. **No** en la columna derecha del mostrador.
> La regla 7.1 se cumple igual: el cupo se proyecta con la venta en curso **antes de
> comprometerlo** — cambia dónde, no cuándo.
> ⚠️ Hoy arranca siempre en **`sin dato`**: el cupo no existe en el esquema (deuda 40).
Dos tramos en una barra de 8px: consumido en `--action` (o `--warning-700` ≥80%, `--debt` ≥95%) y venta en curso en `--action-500` al 55% de opacidad. Muestra "Disponible ahora − esta venta → Queda tras esta venta". Sin dato: `—` y nota de invitación.

### AgingBar
Cuatro casillas de 16×16, radio 2px, escala `--d1`…`--d4`, apagadas en `--border-2`. Junto a los días en `tabular-nums`. Leyenda obligatoria.

> **[CORREGIDO 2026-09-02 — la leyenda va ARRIBA de la lista, no al pie.]** La entrega decía "al pie
> de la tabla". Medido en la implementación: con nueve clientes la leyenda queda **debajo del
> pliegue**, así que cumple la letra y falla el propósito.
>
> **La razón, que generaliza a cualquier leyenda:** una leyenda que explica un CÓDIGO DE COLOR va
> donde se ve el color. Al pie sirve para una nota al margen —una aclaración que se consulta
> después—; un código de color hay que poder decodificarlo **mientras se mira la primera fila**, no
> después de recorrer todas.

> **[COMPORTAMIENTO FIJADO 2026-09-02 — se encienden TODOS los tramos con deuda, no solo el de la
> más vieja.]** Un cliente con una deuda de 5 días y otra de 95 tiene las dos cosas. Encender solo
> `--d4` diría "este cliente está a +90" y esconde que **la mayoría de su saldo es reciente** — que
> es exactamente lo que cambia si conviene llamarlo o esperar. El número en `tabular-nums` al lado
> sigue siendo el de la MÁS VIEJA, que es el peor caso.

> **[DECISIÓN 2026-09-01 — la columna `VENCIDO` de Cartera NO SE PINTA todavía.]** La AgingBar
> calcula **antigüedad** (días desde `created_at` de la orden) y eso sí existe. **"Vencido" exige un
> PLAZO** — *"a 30 días"* — y no hay `due_date` ni plazo de crédito en el esquema (deuda 46). Hasta
> que exista:
> - la barra y su columna se rotulan **"Antigüedad"**, que es lo que de verdad miden;
> - el KPI `VENCIDO` y la columna `VENCIDO` **no se dibujan** — no van en `—`: no van.
>
> 🔴 **Un rótulo falso es peor que una columna ausente.** Poner la antigüedad bajo el título
> "vencido" daría un número plausible y falso, y quien lo lee **actúa como si algo hubiera
> vencido**. Es la misma familia que la advertencia falsa que induce el error que dice prevenir.

### TenderSelector
Estados: **normal · seleccionado · bloqueado**.

> **[RE-ESPECIFICADO 2026-09-01 al cerrar §8.15 — vive sobre SUPERFICIE CLARA.]** La entrega lo
> definía sobre `--ink` porque dibujaba el cobro en línea; el cobro es en modal, así que el
> selector va sobre `--surface`.
>
> Celdas de **52px** (el alto no cambia: es el objetivo táctil del cobro), radio `--r-2`.
> · **normal** — fondo `--surface`, borde `--border`, texto `--ink-2`. Hover: fondo `--surface-2`.
> · **seleccionado** — fondo `--action-soft`, borde `--action`, texto `--action-on-soft`. Es el
>   mismo par que la fila seleccionada y la pestaña activa: **el selector marca una elección, no
>   un estado del dominio**.
> · **bloqueado** — fondo `--border-2`, texto `--ink-4`, `cursor:not-allowed`, **con el faltante
>   dicho en pesos debajo** (regla 7.2). Un botón apagado sin cifra no es información.
>
> ⚠️ **N celdas, no tres** (§8.16). La grilla se acomoda; la celda conserva sus 52px.
>
> *La versión sobre `--ink` —fondo `--action-700`, borde `--action-500`, bloqueado en
> `--on-dark-2` al 50%— queda documentada como la que aplicaría si algún día el cobro pasa a ser
> en línea. Hoy no se usa.*

### Alert
Variantes: **error · advertencia · informativa**.
Barra lateral de 3px + fondo `*-soft` + texto `*-on-soft`, radio `--r-2`. Sobre tinta usa `--warning-500` y `--on-dark-warn`.

### EmptyState
Título 15–16px/600, cuerpo 13–14px en `--ink-3`, y **siempre** al menos un botón. Una pantalla vacía es una invitación a actuar, no un mensaje de ánimo.

### Dialog
Ancho 392–404px, radio `--r-3`, `--shadow-1`, fondo del velo `--overlay`. Cabecera con título y contexto, cuerpo, pie con secundario + primario alineados a la derecha.

### Tabs / Chips de filtro
Estados: **normal · activo**. Activo: borde `--action`, fondo `--action-soft`, texto `--action-on-soft`.

### NavItem
Estados: **normal · hover · activo**. Activo: fondo `--action-soft`, texto `--action-on-soft`, `inset 2px 0 0 var(--action)`, peso 600.

### KpiCard
Etiqueta `--fs-label` en `--ink-3`, cifra `--fs-kpi` en `tabular-nums`, nota opcional 12px. Variante de alerta: fondo `--debt-soft` o `--warning-soft` con borde del mismo rol.

---

## 5. Navegación

Barra lateral de 214px sobre `--surface`, borde derecho `--border`. Bloque de identidad arriba, bloque de sistema y usuario abajo.

### Estructura de grupos

```
(sin título)     Mostrador
Movimientos      Pedidos · Compras · Gastos · Historial
Existencias      Catálogo · Inventario
Cartera          Clientes · Cartera
Resultados       Turnos · Utilidades
─────────────────────────────────────
(pie)            usuario y rol · Configuración
```

Mostrador va suelto arriba, sin título de grupo: es la pantalla del día y no pertenece a una categoría. *(Los ítems Tokens y Componentes del pie son andamiaje del archivo de diseño — NO van a la aplicación.)*

> **[ADICIÓN 2026-09-01 — ubicación de las cuatro pantallas que existían y la entrega no nombraba.]**
> - **Historial** (de ventas) → grupo **Movimientos**, después de Gastos: es el registro de lo que
>   se movió — mismo criterio de "momento del día".
> - **Turnos** → grupo **Resultados**, antes de Utilidades: el cierre de caja es el resultado del
>   día. ⚠️ La ETIQUETA sigue siendo "Turnos" por ahora, a propósito: renombrar solo el ítem del
>   nav mientras los tooltips dicen "turno" y las RPC "jornada" crearía un TERCER vocabulario. La
>   deuda #38 renombra las 24 apariciones juntas, en su turno.
> - **Configuración** → el **pie**, junto al bloque de usuario: no es un momento del día, es el
>   sistema.
> - **Login** → fuera del nav. Es una de las cuatro superficies donde `--brand` está permitida
>   (§1.1).

### Reglas

- **Títulos en caja de oración.** "Despachos del día", no "DESPACHOS DEL DÍA" ni "Despachos Del Día". La mayúscula sostenida se reserva a etiquetas de columna y de KPI (`--fs-label`).
- **Los atajos funcionan siempre pero no se imprimen.** La interfaz no lleva rótulos de tecla en reposo.
- **Los atajos se revelan con Alt o con `?`**, y también con el control "Atajos" del encabezado. Al revelarse aparecen junto a cada destino de navegación, en el campo de búsqueda y en los medios de pago.
- **Única excepción permanente: "Cobrar — F12"**, impreso en el botón. Es el atajo que la cajera usa cientos de veces al día y el que justifica la excepción.
- Teclas asignadas: F1 Mostrador · F2 buscar producto · F3 Compras · F4 cambiar cliente · F5 Catálogo · F6 Clientes · F7 Cartera · F8 Pedidos · F9 Gastos / efectivo · F10 Inventario / transferencia · F11 Utilidades / crédito · F12 cobrar.

### Alcance de la navegación

Nueve pantallas. **No se agregan huecos de navegación para pantallas que no existen.** Lo que no está en la lista de arriba no aparece deshabilitado ni "próximamente".

---

## 6. Estados obligatorios por pantalla

Toda pantalla se diseña y se prueba con todos sus estados, no solo el feliz. Son un prop editable (`estadoPantalla`), para construir y revisar cada uno por separado.

**Comunes a todas:** `normal` · `vacío` (con invitación a la acción) · `cargando` (skeleton) · `sin permiso` · `dato insuficiente`.

| Pantalla | Estados propios además de los comunes |
|---|---|
| **Mostrador** | `error de validación` · `cliente sin cupo` · **`venta excede el cupo`** · `cliente en mora` |
| **Pedidos** | `error de validación` · `cliente sin cupo` · `cliente en mora` |
| **Compras** | `error de validación` · **`compra en borrador`** · **`compra aplicada`** · **`compra anulada`** |

> **[DECISIÓN 2026-09-01 — `borrador` es un estado de PANTALLA, no de la base.]** El esquema no
> tiene compras en borrador: `register_purchase` es atómica — registrar ES aplicar. La regla 7.10
> ("el efecto se muestra antes de aplicarla") se cumple **en el modal**: costo antes → después y
> entrada al inventario, visibles antes de confirmar. El "borrador" es el formulario sin confirmar.
> El badge `borrador` del §4 queda **diseñado y sin uso** — decisión tomada, no un hueco: si algún
> día las compras se guardan a medias, el estado visual ya existe.
| **Gastos** | `error de validación` |
| **Catálogo** | `error de validación` |
| **Inventario** | **`producto sin costo`** |
| **Clientes** | `cliente sin cupo` · `cliente en mora` |
| **Cartera** | `registrar abono` · `cliente en mora` · **`abono sin movimiento de caja (requiere_conciliacion)`** |
| **Utilidades** | **`utilidad incompleta`** · **`período sin movimientos`** |

**No hay estado offline.** Nodo opera en un mostrador con conexión. No se diseña indicador de sincronización.

Nota sobre `requiere_conciliacion`: el abono quedó registrado contra el saldo del cliente pero no tiene contrapartida en caja. Se marca en la fila y en el detalle; no bloquea. **[CORREGIDO]** La entrega original afirmaba "no se puede cerrar el período con abonos en ese estado" — esa regla **nadie la decidió** y se movió a §8.14 como pregunta abierta.

---

## 7. Reglas de comportamiento visual

1. **El cupo se proyecta con la venta en curso.** El panel no muestra el disponible de antes de la venta: muestra "Disponible ahora − esta venta → Queda tras esta venta", con el proyectado como cifra dominante. Vender por encima del cupo es una decisión del dueño, no un accidente del cajero.
2. **Cuando la venta excede el cupo**, el medio de pago Crédito queda bloqueado, el botón principal pasa a "Cobrar de contado — F12" y **el faltante se dice en pesos**. Un botón apagado sin cifra no es información.
3. **Filas, no tarjetas.** Un catálogo de cuatro mil referencias en tarjetas redondeadas es ilegible y lento. La tarjeta se reserva para KPI, ficha y formularios.
4. **El total a cobrar es el único número grande** (44px). Todo lo demás es información de trabajo, no un tablero.
5. **`—` para dato insuficiente, nunca un número inventado.** El guión no es un cero: significa que falta un insumo del cálculo. Es el modo de fallo que este producto paga caro.
6. **Los roles ocultan plata.** Es una prop del componente, no una pantalla aparte. Con `ocultarPlata`, la celda muestra `—` y la columna cambia de título; **la columna no se elimina**, para que la tabla no cambie de forma según quién mira.
7. **El mostrador no tiene scroll horizontal.** El panel de cobro (mínimo 360px) queda siempre visible; lo que se comprime es la lista de productos, con su propio scroll. Las otras ocho pantallas sí admiten scroll horizontal.
8. **Compras y Gastos no se ven iguales.** Compra entra al inventario y mueve el costo unitario; gasto no toca ningún producto. Gastos usa un lienzo más frío, formulario lateral y franja de período; Compras usa panel de efecto y encabezado de documento. Que se distingan de un vistazo es funcional, no decorativo.
9. **Las cifras de plata se alinean por dígito.** Columnas alineadas a la derecha con `tabular-nums`. Se comparan de un vistazo.
10. **El efecto de una compra se muestra antes de aplicarla:** costo antes → después y entrada al inventario por producto. Una compra aplicada no se edita: se anula.
11. **Cobra quien entrega.** El flujo de cobro sale del mostrador, no de una caja separada.
12. **Todo ajuste manual de inventario exige motivo** (avería, vencido, consumo interno, error de conteo, faltante). Una salida sin motivo no se guarda.
13. **Ningún total de Utilidades existe sin su detalle.** Cada fila de la cascada se abre. **[AGREGADO en captura]** Y la pantalla **declara qué mide**: las vistas del esquema miden **cobrado, no vendido**. Con cartera en el alcance, "ventas del día" leído como facturado deja afuera plata real — la pantalla dice cuál de los dos muestra, y probablemente los dos.
14. **Iconografía neutra.** Trazo 1.5px, 15×15 en filas y navegación, 16×16 máximo. Ningún icono puede delatar un vertical: ni frascos, ni llaves inglesas, ni botellas.
15. **Vocabulario neutro.** "Productos", "clientes", "pedidos". El contenido de ejemplo mezcla tornillos, jabón y gaseosa a propósito: si una pantalla se ve rara con esa mezcla, el diseño está asumiendo un vertical.
16. **Los errores no piden disculpas y nunca son vagos.** El botón que dice "Cobrar" produce un mensaje que dice "Cobrado". Y una advertencia solo se muestra si su condición viene de la fuente que decidió — un mensaje de degradación no se re-deriva en el cliente.

---

## 8. Lo que NO está decidido

Nada de esta lista debe leerse como resuelto. Si la implementación necesita una de estas respuestas, hay que pedirla, no inferirla.

1. **[CORREGIDO — SÍ está decidido]** Método de costeo: **promedio ponderado móvil**, decidido el 2026-08-31, con el costo unitario **congelado en la línea de venta al vender** (ver CLAUDE.md, R1 punto 8). El rótulo de Utilidades no es una recomendación pendiente. El cliente nunca ve el término.
2. **Escala tipográfica como tokens reales.** La tabla de la sección 2 está documentada pero los `--fs-*` no existen todavía como variables CSS: hoy los tamaños van literales. Falta decidir si se tokenizan.
3. **Tema oscuro.** No existe. No hay tokens de superficie oscura fuera del panel de cobro y los diálogos.
   > **[HUECO CONCRETO, encontrado el 2026-09-01 implementando el arqueo.]** Faltan **`--success` y
   > `--danger` SOBRE TINTA**. Los cuatro tokens on-dark que existen (`--on-dark-2/3/fill/warn`)
   > cubren texto, relleno y advertencia, pero no confirmación ni error. El panel de arqueo del
   > cierre de caja va sobre `--ink` y muestra la diferencia en verde o rojo según el signo — hoy
   > con dos hexes literales (`#34d399`, `#f87171`), marcados en el código como lo que son: valores
   > que la skill no define y que **no se inventaron**. Se piden cuando el arqueo tenga su turno.
3-bis. **[HUECO ENCONTRADO 2026-09-02 — PALETA DE SERIES DE GRÁFICO.]** Reportes dibuja barras,
   líneas y torta con **hasta cuatro series** y la skill no define colores para eso. Hoy usa dos
   hexes sueltos (`#3b82f6`, `#8b5cf6`) además de `--action` y `--warning-700`.
   ⚠️ **No es el caso de "una categoría no se pinta con la paleta de los estados"** (§1.2): esa
   regla se resuelve con ícono, etiqueta o posición, y **en una serie de gráfico ninguna de las tres
   existe** — el color *es* el mecanismo de distinción, por eso hay leyenda. Acá el color no afirma
   un estado: identifica una serie.
   **Precedente para decidirla:** la escala `--d1…--d4` de `AgingBar` ya distingue cuatro cosas con
   una rampa DENTRO de un rol. Una rampa de `--action-900/800/700/500` haría lo mismo para series —
   pero eso se decide, no se infiere.

4. **Móvil.** **[CORREGIDO]** La entrega decía "solo la ruta del conductor está pensada en móvil" — **en Nodo no hay conductores, rutas ni despacho**, ni están planeados (el cliente carga y se lleva; es la razón por la que el producto no se llama G-Ship). Queda: las nueve pantallas de escritorio no tienen diseño responsive por debajo de ~1100px; hoy hacen scroll horizontal. Móvil entero está sin decidir.
5. **Estados de foco por teclado.** El recorrido con Tab, el anillo de foco visible y el orden de tabulación no están especificados. Los atajos sí.
6. **Impresión.** Remisión, factura, recibo de abono y cierre de caja no tienen diseño impreso.
7. **Contenido y permisos exactos de cada rol.** Solo existe la partición binaria `ocultarPlata` y el estado `sin permiso`. La matriz completa rol × pantalla × acción no está definida. *(El catálogo real es de 21 claves: admin=21, cajero=8, owner=comodín — ver `src/lib/permissions.ts`.)*
8. **Notificaciones, toasts y confirmaciones destructivas.** No hay componente de aviso efímero ni patrón de "¿seguro?". *(La app actual usa react-hot-toast; la migración visual de los toasts está sin diseñar.)*
   > **[DECISIÓN PARCIAL 2026-09-01 — tokens mínimos, patrón aún sin diseñar.]** Los toasts toman
   > **solo color y tipografía** del sistema, mapeados a las variantes de `Alert` (§4): error →
   > `--danger-*`, advertencia → `--warning-*`, éxito → `--success-*`, con `--fs-row` en Inter. La
   > razón es de identidad, no de estética: **un toast emerald en una app sky rompe justo lo que
   > el re-skin está cambiando**, y hoy `react-hot-toast` trae su propio verde por defecto.
   > ⚠️ Lo que sigue SIN decidir y no se inventa: posición, duración, apilado, si hay acción
   > de deshacer, y el patrón de confirmación destructiva.
9. **Paginación y volumen.** Las listas se muestran completas. No hay patrón de paginación, scroll infinito ni virtualización decidido, y el catálogo real tiene miles de referencias.
10. **Búsqueda avanzada.** Solo hay campo de texto y chips de categoría. Sin filtros compuestos, orden por columna ni búsqueda guardada.
11. **Formato de fecha largo, zona horaria y locale.** Solo está fijado el formato corto y el de moneda. *(La app usa America/Bogota y es-CO por convención Giiron; falta el formato largo.)*
12. **Marca madre Giiron.** El endoso es texto plano; el lockup definitivo se diseña aparte. El símbolo será la doble i, pero no está construido.
13. **Pantallas futuras.** Vienen más cuando el esquema de datos esté definido. No anticiparlas ni dejarles hueco.

15. **✅ CERRADA el 2026-09-01 — EL COBRO SE QUEDA EN MODAL. La skill se adapta al producto.**

    *Era la divergencia más grande entre esta skill y el producto, y por eso el cierre lleva sus
    razones: la entrega dibujaba el cobro **en línea** —cliente, cupo, medios y "recibe" en la
    columna derecha, con `TenderSelector` sobre `--ink`— y el producto cobra en un **modal de tres
    pasos** (método → monto → éxito) sobre fondo claro.*

    **Por qué gana el producto:**
    1. **El modal está probado.** 51/51 specs verdes, incluidos pago mixto y el flujo de fiado.
       Pasar a cobro en línea es rediseñar el flujo más crítico —el que la cajera usa cientos de
       veces al día— **sin un defecto que lo motive**. El diseño no reportó un problema con el
       modal: dibujó otra cosa porque no lo conocía.
    2. **Es el mismo criterio que los 5 medios de pago (§8.16).** Recortar `payment_method` para que
       entraran 3 celdas habría sido cambiar el producto para que quepa en el dibujo; **cambiar el
       flujo de cobro es la versión grande de ese mismo error.**
    3. **El cobro en línea es una hipótesis de diseño sin validar contra un cajero real.** El primer
       tenant no operó ni un día. Si al usarlo pide menos pasos, se decide **con evidencia**.

    **🔴 CONSECUENCIAS — esto es lo que cambia en esta skill, y es normativo:**

    - **`TenderSelector` se re-especifica sobre fondo CLARO**, no sobre `--ink`. Los tokens
      `--on-dark-*` **siguen siendo** del panel de cobro del mostrador y de los diálogos: no son
      del selector.
    - **`CupoMeter` y el bloque de cliente viven DENTRO del modal**, en el paso donde se elige
      crédito. **La regla 7.1 se cumple igual** —el cupo se proyecta con la venta en curso, antes
      de comprometerlo—: solo cambia **dónde**, no **cuándo**.
    - **La columna derecha del mostrador NO lleva cliente ni medios de pago.** Lo que lleva es
      canal, líneas, descuento y el panel de cobro sobre `--ink`.
    - **El "Confirmar cobro" verde del modal es una violación directa de §1.2** —*verde es solo
      confirmación y ninguna acción lo usa*— y **pasa a `--action`**.

16. **[DATO DURO, no pregunta — 2026-09-01.]** **Esta skill dibuja TRES medios de pago** (Efectivo ·
    Transferencia · Crédito) **y el producto tiene CINCO**: efectivo, tarjeta, transferencia, nequi,
    fiado. `payment_method` es un **contrato en 8 lados** (R1 punto 4): recortar la lista para que
    entre en la maqueta sería **cambiar el producto para que quepa en el diseño**.
    **El diseño se adapta al producto, no al revés.** El `TenderSelector` acomoda N medios; la celda
    conserva sus 52px.
14. **[MOVIDO desde §6]** **¿El cierre de período exige resolver los abonos con `requiere_conciliacion`?** La entrega lo afirmaba; nadie lo decidió. Es una decisión de producto con consecuencia operativa (un cierre que se bloquea), no de diseño. Hasta que se decida: el estado se muestra y no bloquea nada.

---

## Anexo · Capa de marca del primer tenant

**Dato del cliente, no del sistema.** Estos valores no pertenecen al design system: pertenecen a la organización Muscle Pro, que es el primer tenant de Nodo. Se cargan con la organización y se reemplazan por tenant.

```css
/* organización: Muscle Pro */
--brand:     #111114;   /* tile de identidad en la barra lateral */
--brand-ink: #FFFFFF;   /* la M sobre el tile */
--brand-accent: #B91C1C; /* reservado a documentos impresos y login. NO se usa en la aplicación */
```

Muscle Pro es el tenant. **Nodo es el producto.** Los dos conviven en el bloque de identidad de la barra lateral —"Muscle Pro" arriba, "Nodo" abajo— y no se fusionan en ninguna pantalla.