# Nodo · Anexo B al brief de diseño — Cadena de costos

*2026-08-31. El cliente firmó: se abre el alcance completo.*

Este anexo se suma al brief original y al Addendum 1, que siguen vigentes. **Las cinco correcciones
del Addendum 1 aplican también a todo lo de acá.**

El alcance pasa de cinco a **nueve pantallas**.

---

## 1. Navegación reorganizada, con títulos de grupo

Nueve destinos en una lista plana no se navegan. Se agrupan **por momento del día**, no por modelo
de datos: lo que se usa cada minuto arriba, lo que se mira una vez por semana abajo.

```
  Mostrador                    ← solo, sin título de grupo

  MOVIMIENTOS
    Pedidos
    Compras
    Gastos

  EXISTENCIAS
    Catálogo
    Inventario

  CARTERA
    Clientes
    Cartera

  RESULTADOS
    Utilidades
```

**Mostrador va suelto arriba**, sin grupo. Es la pantalla del día y no compite con nada.

Los títulos de grupo son estructura, no decoración: separan momentos distintos de trabajo. Que sean
discretos —no compiten con los destinos— y **en caja de oración, no en versalitas espaciadas**.

Recordatorio del Addendum 1: los atajos siguen funcionando pero **no se imprimen** al lado de cada
ítem.

---

## 2. Compras

Registrar una factura de proveedor. Es la pantalla que **alimenta el costo**, así que de su
exactitud depende todo el módulo de utilidades.

**Contenido:** proveedor, número de documento, fecha, y las líneas de la compra: producto,
cantidad, unidad de compra, costo unitario. Total.

**Lo que la hace distinta de un POS de restaurante:**

- **Unidad de compra ≠ unidad de venta.** Se compra un bulto y se venden 50 unidades. La línea de
  compra necesita mostrar la conversión de forma visible y editable, no escondida en la ficha del
  producto. El usuario tiene que ver "1 bulto = 50 UND" mientras registra.
- **Al aplicar la compra pasan dos cosas** y las dos se muestran antes de confirmar: entra al
  inventario, y **actualiza el costo del producto**. Que el usuario vea el costo anterior y el
  nuevo antes de aplicar.

**Estados propios:** `borrador` (se edita libremente) y `aplicada` (ya movió inventario y costo).
**Una compra aplicada no se edita: se anula.** Editarla en caliente reescribiría el costo histórico
de ventas que ya ocurrieron.

---

## 3. Inventario

Dos vistas de la misma cosa, y conviene que se vean como dos cosas:

- **Existencias** — el listado por producto: cantidad disponible, costo actual, valor total. Es una
  foto.
- **Movimientos** — el registro de entradas y salidas, con su origen: compra, venta, ajuste. Es la
  película.

**El ajuste manual necesita motivo obligatorio.** Una salida sin motivo es un agujero contable que
después nadie puede explicar. Motivos: avería, vencido, consumo interno, error de conteo,
faltante.

**Estado obligatorio nuevo:** `producto sin costo`. Un producto que se vendió antes de tener una
compra registrada no tiene costo. Se muestra "—", nunca un cero ni un número estimado.

---

## 4. Gastos

**Un gasto no es una compra, y la interfaz tiene que dejarlo claro**, porque el cliente los pidió
juntos y no lo son:

- Una **compra** de producto entra al inventario y se vuelve costo de lo que se venda.
- Un **gasto** —arriendo, luz, transporte, sueldos— es del período y **no toca el costo unitario de
  ningún producto**.

Si se registran igual, las utilidades salen mal. Y las utilidades son justamente el número que el
cliente quiere ver.

**Contenido:** fecha, categoría, descripción, monto, y opcionalmente a quién se le pagó.
Categorías fijas al inicio, editables después.

**Pedido explícito de diseño:** que la pantalla de Gastos y la de Compras **no se vean iguales**.
Deben distinguirse de un vistazo, porque el error de registrar una en la otra es el más probable y
el más caro.

---

## 5. Utilidades

Es la pantalla de resultado, y la más delicada del producto.

**Muestra, para un período elegible:**
```
  Ventas
− Costo de lo vendido        ← sale de las compras, vía el costo del producto
= Utilidad bruta
− Gastos del período         ← sale de Gastos, no toca el costo unitario
= Utilidad neta
```

**La regla que manda acá es la honestidad del dato.** La utilidad solo vale lo que valen los
costos. Si hubo ventas de productos sin compra registrada, el número está mal — y la pantalla
tiene que **decirlo, no disimularlo**:

> Un aviso permanente y visible del tipo *"12 productos vendidos sin costo registrado — la
> utilidad está incompleta"*, con enlace a la lista de esos productos.

Nunca un número plausible y equivocado. Ese es el modo de fallo que este proyecto paga más caro:
no revienta, se ve bien, y el cliente lo detecta antes que nosotros.

**Cada número debe ser rastreable.** Tocar "Costo de lo vendido" lleva al detalle que lo compone.
Un total que no se puede abrir no se puede defender frente al dueño.

---

## 6. Estados obligatorios — lista actualizada

A los del brief original se suman:

`producto sin costo` · `compra en borrador` · `compra anulada` · `utilidad incompleta`
(ventas sin costo) · `período sin movimientos`

---

## 7. Decisión pendiente que bloquea estas pantallas

**El método de costeo.** Cambia qué campos existen y qué se muestra:

- **Promedio ponderado móvil** — el costo del producto se recalcula en cada compra. Un solo número
  por producto, fácil de mostrar y de entender.
- **PEPS / por lotes** — cada entrada conserva su costo. Más exacto, pero obliga a rastrear lotes
  en cada venta y complica todas las pantallas.

**Recomendación: promedio ponderado móvil.** Es el estándar en Colombia para este tipo de negocio,
es lo que el dueño entiende sin explicación, y no obliga a manejar lotes en el mostrador — donde
cada segundo cuenta.

*(Si más adelante entra un cliente de droguería o alimentos que necesite vencimientos y lotes, eso
es una decisión aparte y bastante más grande. No se resuelve acá.)*
