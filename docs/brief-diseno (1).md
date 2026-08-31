# G-Nexo · Brief de diseño — Entrega 1

*Para la sesión de Claude Design. 2026-08-31.*

La salida de esta sesión se captura después como skill `g-nexo-design-system` y pasa a ser la
fuente de verdad visual del producto, igual que `g-cresco-design-system`.

---

## 1. Qué se diseña, y qué no

**Entrega 1 cubre:** mostrador (venta), catálogo, clientes, cartera y pedido (preventa /
WhatsApp). Cinco pantallas.

**Fuera de alcance, a propósito:** inventario y compras. No están descartados — están **esperando
cliente firmado**. Diseñarlos ahora es el riesgo que el proyecto ya nombró: construir para alguien
que puede no comprar. No inventes pantallas para ellos ni dejes huecos de navegación que los
prometan.

---

## 2. Quién lo usa — la restricción que manda

Una persona detrás de un mostrador, **ocho horas al día, todos los días**. Es un experto
repetitivo: va a aprenderse la interfaz en una semana y después la va a usar sin mirarla.

Esto invierte las decisiones del producto hermano G-Cresco, que optimiza para un usuario
**ocasional**, en el campo, con guantes y a pleno sol — de ahí su escala tipográfica de hasta 52px
y su FAB gigante. **Acá eso sería un error.** Lo que se optimiza es distinto:

- **Densidad.** Ver muchas filas sin scrollear vale más que un objetivo táctil cómodo.
- **Teclado antes que mouse.** Hay un teclado en el mostrador. Toda la pantalla de venta tiene que
  poder operarse sin soltar las manos: buscar producto, fijar cantidad, agregar, cobrar.
- **Velocidad de búsqueda.** Una ferretería tiene miles de referencias. Encontrar el producto es
  **el cuello de botella real del producto**, no el cobro. Si una sola cosa sale excelente de esta
  entrega, que sea esa.

No se diseña para móvil en la Entrega 1. Es una app de escritorio en un mostrador.

---

## 3. La restricción horizontal — la más difícil

El mismo producto lo usan distribuidoras, mayoristas, comercializadoras, ferreterías, droguerías,
repuestos, productos de aseo, alimentos, bebidas y consumo masivo.

**Nada puede delatar un vertical.** Si la interfaz se ve a droguería, la ferretería no la compra.
En concreto:

- **Iconografía neutra.** Ni frascos, ni llaves inglesas, ni botellas, ni cajas de medicamento. Un
  producto es un producto.
- **Vocabulario neutro.** "Productos", "clientes", "pedidos". Nunca "medicamentos", "repuestos",
  "referencias" ni "artículos" si alguno suena a un gremio.
- **Contenido de ejemplo mezclado a propósito.** Al poblar las pantallas, que el catálogo de
  muestra tenga tornillos, jabón y gaseosa en la misma lista. Sirve como prueba: si la pantalla se
  ve rara con esa mezcla, el diseño está asumiendo un vertical.

---

## 4. Distinguirse de G-Vento — y esto no es de marca

G-Nexo es un fork de G-Vento y ambos los mantiene **una sola persona**, en paralelo, con bases de
código que hoy se parecen mucho.

Si las dos apps se ven iguales, se van a confundir: capturas de pantalla, pestañas de staging,
issues de Sentry, sesiones de Claude Code. **La distinción visual es una salvaguarda operativa,
no una decisión estética.**

Por eso: **el acento de G-Nexo no es verde esmeralda.** G-Vento usa `#10b981` con sidebar oscuro
`#0f172a`. Elegí una dirección que se reconozca de un vistazo y a distancia, sin mirar el
contenido.

---

## 5. Ejes que este brief fija

**Color por rol semántico, no decorativo.** Los roles que el producto necesita:

- *Acción principal* — cobrar, guardar, agregar.
- *Deuda y cartera vencida* — el rol crítico del dominio. Un cliente en mora tiene que saltar a la
  vista en una lista de sesenta.
- *Cupo de crédito* — necesita mostrar disponible contra consumido. Considerá si es un rol propio
  o una escala del rol de deuda.
- *Advertencia* — reservá el rol aunque en la Entrega 1 casi no se use (inventario está afuera).
- *Neutros* — superficies, texto, bordes.

Cada rol con su variante suave para fondos de fila, chips y badges. Texto sobre fondo suave en el
tono fuerte de la misma familia, nunca negro plano.

**Dinero y códigos con cifras tabulares.** Las columnas de plata tienen que alinearse por dígito.
Es requisito funcional: se comparan de un vistazo. COP sin decimales, separador de miles con
punto.

**Escala tipográfica densa, con una sola excepción.** El total a cobrar es el único número que
puede ser grande. Todo lo demás es información de trabajo, no un tablero.

**Filas, no tarjetas.** Un catálogo de cuatro mil referencias en tarjetas redondeadas es
ilegible y lento. La unidad de lista es la fila.

---

## 6. Ejes libres, y cómo no gastarlos

Tipografía, forma, densidad exacta y layout quedan abiertos. Pero no los resuelvas con los
defaults que aparecen en cualquier brief:

- Fondo crema cálido (~`#F4F1EA`) con display serif y acento terracota (~`#D97757`).
- Fondo casi negro con un único acento verde ácido o bermellón.
- El kit de tarjetas SaaS: todo picado en tarjetas idénticas, un solo radio para todo, la misma
  sombra gris suave debajo de cada una, degradados de decoración.
- Cromo de plantilla: etiquetas en VERSALITAS espaciadas encima de cada título, cadenas unidas con
  puntos medios, "PALABRA — fragmento" con raya espaciada, flechas `→` pegadas a los botones.

Y sobre el texto: los errores no piden disculpas y nunca son vagos. Una pantalla vacía es una
invitación a actuar, no un mensaje de ánimo. El botón que dice "Cobrar" produce un mensaje que
dice "Cobrado".

---

## 7. Las cinco pantallas

1. **Mostrador.** La principal. Búsqueda de producto entre miles, líneas de la venta, cliente
   opcional, total, cobro. Si se elige un cliente con cupo, el **cupo disponible tiene que ser
   visible antes de cobrar**, no después. Operable entera por teclado.
2. **Catálogo.** Lista densa de productos con búsqueda y filtro. Alta y edición de producto.
3. **Clientes.** Lista, y ficha con datos, cupo asignado, saldo actual e historial.
4. **Cartera.** Quién debe, cuánto y desde cuándo. Registro de abonos. La antigüedad de la deuda
   es información visual, no una columna de fechas que hay que leer.
5. **Pedido.** Capturado por teléfono o WhatsApp por alguien que no es el comprador, y despachado
   después en el mostrador. Necesita un estado propio: existe, todavía no se entregó ni se cobró.

---

## 8. Estados obligatorios por pantalla

Toda pantalla se diseña con estos, no solo el feliz:

`normal` · `vacío` (con invitación a la acción) · `cargando` (skeleton, no spinner en blanco) ·
`error de validación` · `sin permiso` (secciones ocultas por rol) · **`cliente sin cupo
disponible`** · **`cliente en mora`** · `dato insuficiente` ("—", nunca un número inventado)

**No hay estado offline.** G-Cresco lo tiene porque captura en campo sin señal; G-Nexo opera en un
mostrador con conexión. No diseñes indicador de sincronización.

---

## 9. Reglas de comportamiento que el diseño tiene que respetar

- **El cupo se muestra antes de comprometerlo.** Vender por encima del cupo es una decisión del
  dueño, no un accidente del cajero.
- **Los roles ocultan plata.** Igual que en los hermanos: hay roles que no ven costo ni margen. Es
  una prop del componente, no una pantalla aparte.
- **Honestidad del dato.** Guión y pista cuando falta un insumo del cálculo. Nunca un número
  plausible y equivocado — es el modo de fallo que este proyecto paga caro.
- **Cobra quien entrega.** El flujo de cobro sale del mostrador, no de una caja separada.

---

## 10. Qué entregar

Igual que la Entrega 1 de G-Cresco, para que se pueda capturar como skill:

- **Tokens con valores exactos** (hex, radios, escala de espaciado, escala tipográfica), pensados
  como fuente única. G-Nexo es una app Vite única, no un monorepo: los tokens van a CSS variables,
  sin capa de tema para React Native.
- **Librería de componentes con sus estados**, no pantallas sueltas.
- **La lista de estados de cada pantalla como prop editable**, para poder construir y probar cada
  estado por separado.
- **Tipografía e iconografía nombradas**, con el set exacto.
