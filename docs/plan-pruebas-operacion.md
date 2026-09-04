# Plan de pruebas de operación — un día completo contra el lab

*Escrito el 2026-09-03. Se ejecuta **A MANO**, contra `https://nodo-rust.vercel.app`
o `pnpm dev`, con las credenciales del laboratorio.*

---

## 🔴 Por qué esto NO es una suite, y por qué no se automatiza

La suite tiene **253 casos en verde**. Este guion existe para la clase que esos
253 no pueden ver, y ya hay **tres casos medidos** que lo prueban:

| defecto | por qué la suite no lo vio |
|---|---|
| el botón **«Cobrar» deshabilitado se veía MÁS CLARO** que habilitado | `toBeDisabled()` pasaba: el botón *sí* estaba deshabilitado. El defecto estaba entero en lo que el ojo recibe |
| **Login prometía «mesas y comandas»**, dos módulos que ya no existían | el compilador ve un string; ningún test asevera que el copy diga la verdad |
| la **lista del carrito colapsada a CERO** con el cobro en línea *(2026-09-03; el cobro volvió al modal ese mismo día y el defecto ya no puede ocurrir — el caso se conserva como tripwire de su clase)* | el ítem seguía en el DOM con bounding box, así que **para Playwright era `visible`** aunque estuviera clipeado |

⚠️ **Y por eso no lo puede correr quien lo escribió, con Playwright.** Un guion
automatizado por su propio autor es **otra suite**: verde por construcción y ciega
a la misma clase que motivó el plan. Lo que sí se hizo antes de entregarlo fue
**recorrerlo verificando que cada paso TENGA CAMINO** en la UI — eso es
enumeración, no prueba, y está reportado al final.

**Cómo se llena:** la tercera columna se completa **ejecutando**. Un paso sin
tercera columna no se dio por bueno: se dio por no hecho.

---

## Antes de empezar

- **Sesión:** el owner del lab (`tests/README.md` tiene las credenciales).
- **Estado esperado del catálogo:** **9 categorías y 32 productos activos** — las
  8 de Muscle Pro con sus 29 productos, **más** la categoría `Lab` con sus 3
  (`Lab Coctel`, `Lab Vaso`, `Lab Cerveza`), que se conservan porque son los
  únicos que ejercitan producto compuesto y sin inventario.
  ⚠️ Se dice el número **con** los `Lab` a propósito: si el guion dijera «29
  productos», el ejecutor reportaría una discrepancia que no existe.
- **Anotá la hora de inicio.** Varios pasos dependen del día (`hoy_bogota`).

---

## El guion

### 1 · Entrar y abrir la jornada

| qué se hace | qué debería pasar | qué pasó |
|---|---|---|
| Ingresar con el usuario del lab | Entra al **Mostrador**. El sidebar muestra **LAB** arriba y **LAB Principal** debajo | |
| Mirar el banner superior | Dice **«No hay turno de caja abierto»** con botón **Abrir turno** | |
| Abrir turno con base 100.000 | El banner desaparece. La píldora del encabezado deja de decir «Sin turno» | |
| Mirar el botón **Cobrar** con el carrito vacío | Está **apagado y legible** — no más claro que cuando está activo | |

### 2 · Mirar el catálogo

| qué se hace | qué debería pasar | qué pasó |
|---|---|---|
| Ir a **Catálogo** | **Filas, no tarjetas.** Encabezados `PRODUCTO · CATEGORÍA · EXISTENCIA · PRECIO` | |
| Contar categorías y productos | **9 categorías**, **32 productos** activos | |
| Buscar `CLEMBUTEROL` | Aparece **uno solo**: `CLEMBUTEROL 100 TBL VENOM`. ⚠️ Si aparecen dos, el catálogo se importó por nombre en vez de curarse | |
| Mirar los precios de Farmacología | Cifras reales: `TESTONOM C` 109.000 · `MASTENOM E` 150.000 · `OXANDRONOM` 133.000. **Sin `$`** en la columna, alineadas a la derecha | |
| Buscar `CREMA DE ARROZ` | Aparecen **cuatro** (Mani · Mani XL · Oreo · Tradicional). Son sabores distintos, no duplicados | |

### 3 · Registrar una compra fechada ANTES de hoy

| qué se hace | qué debería pasar | qué pasó |
|---|---|---|
| Ir a **Compras** → *Nueva factura* | Abre el formulario con **Fecha de la factura** editable | |
| Poner una fecha de **hace 5 días**, proveedor `MP Venom` | La fecha queda en el pasado y el formulario la acepta | |
| Agregar `CREATINA IRON NUTRITION`, 10 unidades a **80.000** | Aparece el **panel de efecto**: costo antes → después | |
| 🔴 **Anotar el costo ANTES y el DESPUÉS que muestra el panel** | El costo actual es **63.000**. El nuevo es el **promedio ponderado**, no 80.000 | |
| Aplicar la compra | La factura queda registrada | |
| Volver a **Compras** y mirar la lista | La factura aparece con **la fecha del documento**, no la de hoy | |
| Ir a **Inventario** y buscar el producto | El stock subió 10 | |

### 4 · Vender de contado con precio negociado

| qué se hace | qué debería pasar | qué pasó |
|---|---|---|
| Ir a **Mostrador** y **no tocar nada** | 🔴 Se ve **todo el catálogo**: 32 productos, de las 9 categorías. ⚠️ Si se ve una sola categoría, volvió el defecto que escondía el strip | |
| Mirar el encabezado de la lista | Dice **«Todos los productos»** y el conteo. Ese número es la única señal de cuánto hay | |
| Mirar la **cabecera de la lista** | Tres títulos: `PRODUCTO · CATEGORÍA · PRECIO`. Se queda fija al hacer scroll | |
| Mirar la columna **CATEGORÍA** | Está, en **gris** — sin el color del cliente. ⚠️ Si trae colores, van a competir con el badge de stock en la misma fila (§1.2) | |
| Mirar los precios de la lista | Llevan **`$`** adelante: `$140.000`. ⚠️ Es una **excepción a §2**, sólo de esta lista — en Catálogo, Cartera y Compras la cifra va sin símbolo | |
| Teclear `farmacolog` en el buscador | Filtra **por categoría**: sólo productos de Farmacología. El conteo baja | |
| Borrar la búsqueda y buscar `CREATINA OPTIMUN` | Aparece con precio **110.000** | |
| Agregarlo al carrito | La línea muestra el precio **editable** | |
| Cambiar el precio de la línea a **125.000** | El total sube. Puede aparecer un aviso de que el precio está lejos del catálogo | |
| Apretar **F12** | **Abre el cobro** — y NO cobra | |
| Mirar la grilla de medios | Están **los cinco**: efectivo, tarjeta, transferencia, Nequi, fiado. No hay que desplegar nada | |
| Elegir **Efectivo** y apretar **Continuar** | Pasa al paso del monto. El campo de dinero **ya tiene el foco** | |
| Teclear 150.000 | El **Vuelto** se calcula: 25.000, en verde | |
| Apretar la tecla **T** | ⚠️ **NO pasa nada** — ni se escribe una «t» en el campo, ni cambia el medio. Sin la grilla a la vista el atajo se apaga a propósito | |
| Apretar **Enter** | Cobra. Aparece el diálogo con el **número de venta** | |
| Cerrar el diálogo | El carrito queda vacío, listo para la siguiente | |

### 5 · Vender a crédito con plazo

| qué se hace | qué debería pasar | qué pasó |
|---|---|---|
| Agregar `BEST WHEY 2 LBS` al carrito | Precio 140.000 | |
| Apretar **F12** | Abre el cobro | |
| Apretar la tecla **C** | Se elige **Fiado** sin tocar el mouse | |
| Buscar `MP Cliente a credito` | Aparece en el buscador | |
| Elegirlo | Queda **marcado con un check** y la lista **sigue ahí**: se puede cambiar de cliente clickeando otro, sin ningún botón | |
| Apretar **F4** | El cursor vuelve al **buscador de clientes**, con el texto seleccionado | |
| Mirar el plazo | Se precargó en **30 días**, y es un **desplegable** — no un campo donde se teclea un número | |
| Mirar el bloque de **cupo** | Dice **«sin dato»** y explica dónde asignarlo. ⚠️ **Es lo esperado** — el cupo no existe en el esquema (deuda 40) | |
| Leer la nota bajo el plazo | Dice que cambiarle el plazo al cliente después **no mueve** el vencimiento de esta venta | |
| Apretar **Registrar fiado** | ⚠️ El botón **dice eso y no «Continuar»**: a crédito no hay paso de monto, cobra ahí mismo | |
| Mirar el resultado | La venta queda **pendiente de pago**, y el aviso dice que **no entra dinero a la caja** | |

### 6 · Registrar dos gastos

| qué se hace | qué debería pasar | qué pasó |
|---|---|---|
| Ir a **Gastos** | Hay un **formulario lateral**, no hay que ir al Mostrador | |
| Registrar 45.000, subcategoría **Servicios**, pagado a `EPM` | Aparece en la lista **sin recargar** | |
| Registrar 900.000 con una subcategoría de **activo** | Aparece la **nota de activo** explicando que no es gasto del período | |
| Mirar la lista | Los dos gastos, con su subcategoría y a quién se le pagó | |

### 7 · Ajustar inventario con motivo

| qué se hace | qué debería pasar | qué pasó |
|---|---|---|
| Ir a **Inventario** → *Ajuste manual* | Abre el formulario | |
| Elegir `GALLETA MANI MUTANTES`, **−2**, sin motivo | El botón de guardar **no deja** continuar | |
| Escribir el motivo «avería» | Ahora sí guarda | |
| Ver el movimiento | Queda registrado con su motivo y su autor | |

### 8 · Registrar un abono de cartera

| qué se hace | qué debería pasar | qué pasó |
|---|---|---|
| Ir a **Cartera** | El KPI **Total por cobrar** en **neutro**, y **Vencido** en rojo. ⚠️ Si los dos están en rojo, es un defecto | |
| Buscar `MP Cliente a credito` | Aparece con la deuda del paso 5 | |
| Abrir su detalle y registrar un abono de 50.000 | El saldo baja. **No** aparece un aviso de que el efectivo no entró a caja (sí entró) | |
| Volver a la lista | El **Total por cobrar** bajó 50.000 | |

### 9 · Cerrar la jornada y cuadrar

| qué se hace | qué debería pasar | qué pasó |
|---|---|---|
| Abrir el cierre de caja | Muestra el **esperado por método** | |
| 🔴 Comparar el efectivo esperado contra la cuenta a mano | base 100.000 **+** venta del paso 4 **+** abono del paso 8 **−** gastos del paso 6. La venta a crédito **no suma** | |
| Contar exactamente lo esperado y cerrar | El resultado dice **cuadrado**, y **no** en verde por sobrante | |
| En otra jornada de prueba, contar 20.000 de más | El sobrante **no se pinta de verde**: un sobrante es un descuadre igual que un faltante | |

### 10 · Mirar los números

| qué se hace | qué debería pasar | qué pasó |
|---|---|---|
| **Historial** | Están las ventas del día, ordenadas por número descendente | |
| Abrir una venta | El detalle muestra el precio **pactado**, no el del catálogo | |
| Reimprimir el ticket | Dice **COMPROBANTE DE VENTA** y **no** menciona IVA | |
| **Cartera** | El saldo del cliente refleja la venta menos el abono | |
| **Reportes** → Financiero | *Vendido* y *cobrado* son **cifras distintas** y cada una dice qué mide | |
| Exportar el Excel | Trae una hoja **Definiciones** que explica por qué no coinciden | |
| 🔴 Cuadrar contra lo hecho | Ventas del día = paso 4 + paso 5. Cobrado = paso 4 + abono | |

---

## 🔴 LO QUE YA SABEMOS QUE FALTA

*Un hueco conocido reportado como hallazgo cuesta el diagnóstico entero de nuevo.
**Nada de esta lista es un defecto.***

| qué se va a notar | qué es | deuda |
|---|---|---|
| **No hay forma de devolver una compra** | existe en la base (`register_purchase_return`) y **no tiene UI** | 77 |
| **Inventario no muestra dinero**: ni valor del inventario, ni costo, ni margen | hueco de pantalla — los datos existen | 52 |
| El **cupo de crédito** siempre dice «sin dato» | no existe en el esquema. Está en el alcance firmado | 40 |
| **No hay pantalla de Pedidos** | no existe ni ruta ni tabla. Alcance firmado | 85 |
| **No hay pantalla de Utilidades** | no existe. Es la pantalla por la que el cliente compró | 86 |
| **Configuración se ve distinta** al resto | la maqueta dice que su diseño **no es parte de la Entrega 1** | §8 skill |
| **No hay «RECAUDADO HOY»** en Cartera | necesita una consulta que no existe; inventar el número sería peor | A6 |
| **Cartera es maestro-detalle**, no la tabla ancha de la maqueta | decisión pendiente: mueve dónde se cobra | A6 |
| **El emerald de otro producto** aparece en varios modales | 52 ocurrencias en 20 archivos, casi todas en modales | 88 |
| ~~«Cambio» en la columna y «Vuelto» en el ticket~~ | ✅ **CERRADO el 2026-09-03, y no por una decisión: la palabra «Cambio» la había introducido la columna del cobro en línea, y murió con ella.** Hoy el producto dice **Vuelto** en los tres sitios —paso del monto, diálogo del éxito y ticket—, verificado grepeando el fuente. La duda tenía un sujeto y el sujeto dejó de existir | A6 §13 |
| Ventas con **utilidad cero** en el catálogo sembrado | el archivo del cliente las tiene. **Es una pregunta abierta para él**, no un defecto | preguntas §4 |
| La **Cartera está llena de `E2E Fiado`** | 162 órdenes del laboratorio. Se archivan por prefijo, no por antigüedad | política del lab |

---

## Enumeración previa — cada paso TIENE camino

*Recorrida el 2026-09-03 verificando que exista la ruta, el control y el testid.
**No es una ejecución**: no dice que funcione, dice que hay por dónde.*

| paso | camino verificado |
|---|---|
| 1 | banner de turno + `Abrir turno` ✅ |
| 2 | `/productos` con filas ✅ |
| 3 | **Fecha de la factura** editable ✅ · panel de efecto `invoice-efecto` ✅ |
| 4 | precio editable en la línea ✅ · F12 → **abre el modal** ✅ · Enter confirma ✅ |
| 5 | `CustomerPicker` **dentro del modal** ✅ · F4 → su buscador ✅ · plazo desplegable ✅ · `CupoMeter` ✅ |
| 6 | formulario lateral con subcategoría y nota de activo ✅ |
| 7 | el ajuste **exige motivo** (`isValid` lo incluye) ✅ |
| 8 | abono desde el detalle del cliente ✅ |
| 9 | `CloseShiftModal` ✅ |
| 10 | `/historial`, `/fiado`, `/reportes` ✅ |

⚠️ **Dos trabas de ORDEN que la enumeración encontró, y que el guion ya evita:**

1. **El paso 3 exige jornada abierta.** `register_purchase` la rechaza —«Abri la
   jornada de caja antes de registrar una compra»— porque la compra sale del
   cajón del día (deuda 26). Por eso el paso 1 va primero y **no es un trámite**.
2. **El paso 6 ni siquiera ofrece el formulario sin jornada.** `cash_movements
   .jornada_id` es `not null`, así que la pantalla muestra un aviso en vez del
   formulario. Si el paso 6 se hiciera después del 9, no se podría registrar
   nada — y parecería un defecto.

⚠️ **Y una advertencia sobre el paso 3 que sale de haber escrito el spec del
costeo:** el promedio ponderado **sólo corre si el producto ya tiene costo y
stock > 0**. `CREATINA IRON NUTRITION` los tiene (63.000 y stock del seed), por
eso se eligió ése. Con un producto recién creado el costo caería al de la compra
—correctamente— y el paso parecería roto sin estarlo.
