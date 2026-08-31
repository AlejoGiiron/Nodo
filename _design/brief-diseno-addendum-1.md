# G-Nexo · Addendum 1 al brief de diseño

*Sobre la Entrega 1 en curso. 2026-08-31.*

La entrega va bien y está cumpliendo lo que más importa: el catálogo de muestra mezcla tornillo,
jabón, gaseosa y papel higiénico —la prueba anti-vertical pasa—, el costo del aceite muestra "—"
en vez de un número inventado, y el cupo de crédito aparece **antes** de cobrar.

Estas son cuatro correcciones. Ninguna cambia el alcance de la entrega.

---

## 1. Separar tokens de marca de tokens semánticos

Es la corrección más importante y es estructural, no cosmética.

El primer cliente (Muscle Pro) tiene identidad negra con rojo. **El rojo no puede ser el acento de
la aplicación**, porque en un producto con cartera el rojo ya significa mora, vencido y error — y
la cartera es el dominio crítico. Si el rojo pasa a ser marca, se pierde la señal más importante
de la interfaz.

La solución no es negarle el color. Es partir la paleta en dos capas:

**Tokens de marca — por organización, tematizables:**
```
--brand          color de identidad del cliente
--brand-ink      texto legible sobre --brand
```
Viven **solamente** en superficies de identidad: barra lateral, encabezado, pantalla de login,
lugar del logo. En ningún otro lado.

**Tokens de sistema — fijos, NO tematizables por ningún cliente:**
```
--action         acción principal (cobrar, guardar, agregar)
--debt           deuda y cartera vencida
--warning        advertencia
--danger         error de validación y acción destructiva
--success        confirmado, al día
--bg --surface --border --ink --ink-2 --ink-3
```
Cada uno con su variante suave para fondos de fila, chips y badges.

**Regla dura:** el color de marca **nunca comunica estado**. El botón "Cobrar" usa `--action`, no
`--brand`, aunque en un tenant coincidan.

**Prueba de que quedó bien:** dos organizaciones con marcas opuestas —una roja, una azul— abren la
misma pantalla de cartera. La fila del cliente en mora se tiene que ver **igual en las dos**. Si
cambia, los tokens están mezclados.

El producto es multi-tenant desde la base técnica, así que esto no es trabajo extra: es la forma
correcta de que el tema por organización funcione sin romper la semántica.

---

## 2. Cifras tabulares, no tipografía monoespaciada

Acá el brief original se prestó a confusión y la corrección es mía.

Pedí "cifras tabulares" y la entrega usa una **familia monoespaciada** para códigos y precios. No
es lo mismo, y la diferencia es justo la que produce el aire de terminal:

- **Cifras tabulares** = dígitos de ancho fijo **dentro de una tipografía proporcional**
  (`font-variant-numeric: tabular-nums`). Las columnas de plata se alinean por dígito, que es el
  requisito funcional, y el resto de la interfaz sigue leyéndose como una aplicación moderna.
- **Monoespaciada** = toda la familia de ancho fijo, letras incluidas. `TR-0812` en mono se lee
  como una consola.

**Corrección:** una sola familia proporcional en toda la aplicación. `tabular-nums` aplicado
únicamente a las columnas de precio, costo, cantidad y total, y a los códigos de producto.

---

## 3. Los atajos de teclado funcionan, pero no se imprimen

El brief pidió que la pantalla se opere entera por teclado y eso está bien resuelto. Pero **tener
atajos y rotularlos en pantalla son dos cosas distintas**, y rotularlos todos es lo que hace que se
vea a software de hace veinte años.

- **Mantener:** todos los atajos funcionando, F1–F12 incluidos.
- **Quitar:** las etiquetas `F1`…`F8` impresas permanentemente en cada ítem del menú lateral, y las
  de cada botón de medio de pago.
- **Reemplazar por:** revelarlas al mantener `Alt`, o en una ayuda accesible con `?`. El usuario es
  un experto repetitivo: las aprende en una semana y después el rótulo es ruido permanente.
- **Única excepción:** la acción principal ("Cobrar — F12"). Es la más repetida del día y ahí el
  rótulo se gana el espacio.

---

## 4. La silueta todavía es la de G-Vento

Barra lateral oscura + contenido claro es exactamente el layout del producto hermano, que
especifica su sidebar en `#0f172a`. Cambiar el acento a azul no alcanza: la silueta se reconoce
antes que el color.

Esto no es una preferencia estética. Las dos aplicaciones las mantiene **una sola persona**, en
paralelo, con bases de código que hoy se parecen mucho. Si comparten silueta se van a confundir
las capturas de pantalla, las pestañas de staging y los issues de Sentry.

**Pedido:** buscar una estructura de navegación que se reconozca de un vistazo y a distancia, sin
leer el contenido. Navegación superior, lateral clara, o cualquier otra cosa — pero no la barra
lateral oscura.

---

## 5. Listados, no tarjetas — confirmación

El principio del brief se mantiene y aplica a **todas** las pantallas, incluido el panel de la
venta en curso: la unidad de lista es la **fila**, nunca la tarjeta redondeada. Un catálogo de
miles de referencias en tarjetas es ilegible y lento.

Si alguna pantalla de la entrega todavía usa tarjetas para listar ítems, convertirla a filas.

---

## Lo que NO cambia en esta entrega

El alcance sigue siendo **cinco pantallas**: mostrador, catálogo, clientes, cartera y pedidos.

Inventario, compras, gastos y utilidades **siguen fuera**, a la espera de una decisión comercial
que no está tomada. No inventar pantallas para ellos ni dejar huecos de navegación que los
prometan.
