# Balance de deudas de esquema contra el alta de Muscle Pro

*2026-09-02. Para decidir qué entra antes de que el cliente cargue datos reales y qué espera.
**No resuelve ninguna**: ordena.*

## El criterio que manda, y por qué

Las tres preguntas no pesan igual. **(b) irrecuperabilidad manda sobre las otras dos**, y no es una
preferencia: es la única que tiene **fecha de vencimiento**.

> Una pantalla incompleta se completa cuando se quiera. **Un dato que no se registró no se rellena
> después.**

Ya lo pagamos dos veces —`unit_cost` congelado en la línea de venta, y el canal de la orden—, y las
dos veces la lección fue la misma: el momento de capturar un dato es cuando ocurre el hecho, y ese
momento **no vuelve**.

Por eso una deuda que solo afea una pantalla puede esperar meses, y una que pierde un dato **cuesta
más cada día que Muscle Pro opere sin ella**.

---

## La tabla

Leyenda de (b): 🔴 **irrecuperable** · 🟡 **recuperable con costo** (el dato existe afuera, pero
recapturarlo es un trabajo) · 🟢 **recuperable** (dato maestro, se carga cuando sea).

| # | Deuda | a. ¿Bloquea operar? | b. ¿Irrecuperable? | c. Tamaño |
|---|---|---|---|---|
| **50** | **No hay import masivo de catálogo** | 🔴 **SÍ, y es el bloqueo más grande** | 🟢 el catálogo existe en el archivo del cliente | Decisión + import + RPC |
| **49** | Anular / corregir una compra | 🔴 **SÍ** — un error de tecleo es permanente | 🔴 el costo mal calculado se congela en las ventas siguientes | Decisión de producto + RPC |
| **44** | Fecha del documento ≠ de registro | No | 🔴 **la fecha real no queda en ningún lado** | 2 columnas + 2 RPC |
| **45** | Subcategoría de gasto + "Pagado a" | No | 🔴 *"¿cuánto gastamos en arriendo?"* no se contesta ni reprocesando | 2 columnas + allowlist + RPC |
| **46** | Plazo de crédito | No | 🔴 **si el plazo se pacta POR VENTA** · 🟢 si es del cliente | **Decisión de producto primero** |
| **41** | Código y unidad de venta | No | 🟡 están en el archivo del cliente, pero re-capturarlos es re-hacer la carga | 2 columnas (+ el import de la 50) |
| **47** | Marca de despacho y retiro | No | 🟡 `updated_at` da una aproximación con ruido | 2 columnas + mutación |
| **40** | Cupo de crédito | No — se vende a fiado igual | 🟢 dato maestro; lo consumido se deriva | Columna + RPC + decisión |
| **48** | Dirección del cliente | No | 🟢 dato maestro | 1 columna |
| **42** | Sin clave de permiso para ver costo | No — ya decidido: no se muestra | 🟢 no hay dato: es autorización | Clave + gate + tripwire |

---

## Las dos que aparecieron haciendo este balance

### 🔴 50 · NO HAY IMPORT MASIVO DE CATÁLOGO — y es el bloqueo más grande de la lista

**Verificado:** `exceljs` está en el proyecto y **solo se usa para EXPORTAR** reportes
(`ReportsPage`, dos llamadas). En `ProductsPage` y en los modales de producto no hay una sola
mención de importar, CSV, bulk ni masivo. **El único alta de productos es el modal, de a uno.**

La maqueta del catálogo dice **4.212 productos**. A un minuto por producto —optimista, porque son
nombre, precio, costo, categoría e inventario— son **70 horas de tecleo** antes de poder vender.

⚠️ **Esto no es una deuda de esquema: es una condición de arranque**, y por eso no había aparecido
en ninguna enumeración de columnas. Enumerar columnas contesta *"¿dónde se guarda?"*; no contesta
*"¿cómo llega?"*.

**Y arrastra a la 41.** El archivo del cliente casi seguro trae código y unidad. Si el import se
construye antes que esas columnas, **se descartan al cargar** y recuperarlas es re-hacer la carga
entera. Las dos deberían moverse juntas, y ése es el único argumento fuerte para subir la 41.

### 🟡 51 · Corregir un gasto tampoco se puede — pero acá la ausencia es DELIBERADA

`cash_movements` **no tiene policy de UPDATE ni de DELETE**, y la migración dice por qué, textual:

> `-- SIN update ni delete: un movimiento de caja es un hecho, no un estado.`

Es la misma tesis que la propuesta de la 49 (corregir por contrapartida, no por edición), escrita
antes y aplicada a la caja. **Confirma la forma de la solución de la 49** en vez de contradecirla.

✅ Y a diferencia de la compra, **la contrapartida ya existe**: se puede registrar un movimiento
`in` con categoría `otro` y el detalle. Es incómodo —hay que saber que ése es el mecanismo— pero es
posible. Por eso queda 🟡 y no 🔴: el hueco es de **UI y de nombre**, no de capacidad.

---

## Lo que la tabla sugiere, para que lo decidas

> 🔴 **ACTUALIZADO el 2026-09-02: dos deudas NUEVAS suben al bloque de arriba, y las dos
> aparecieron después de escribir esta tabla — re-skineando Reportes.**
>
> | # | Por qué sube |
> |---|---|
> | **53** · "Ventas totales" muestra lo cobrado | **la única cuyo daño VIAJA FUERA DE LA APP**: el Excel se archiva con el 58% faltante y sin contexto. Y el ticket promedio es un cociente entre poblaciones: no significa nada. |
> | **54** · carrera de extras en el mostrador | columna (b) pura: **pierde plata del cliente EN LA VENTA**. La orden se registra con un total menor al real. |
>
> Confirma lo que la tabla original ya sugería: **el re-skin sigue encontrando más rápido de lo que
> cerramos**, y las dos que encontró esta vez son de las que pierden datos.

**Antes del alta, por (b):**

1. **50 · import** — sin esto no hay alta. Y su forma decide si la 41 entra con ella.
2. **49 · corregir una compra** — porque **va a pasar el primer día**. Es la única de la lista que
   bloquea *operar*, no *ver*.
3. **44 · fecha del documento** — dos columnas, casi sin decisión, y cada día sin ella mete facturas
   en el mes equivocado **para siempre**.
4. **45 · subcategoría + pagado a** — dos columnas y una allowlist. La alternativa es descubrir en
   diciembre que no se puede contestar en qué se gastó.
5. **46 · plazo de crédito — DECIDIR, no necesariamente implementar.** Si resulta ser *por venta*,
   pasa a 🔴 y cada venta a crédito sin él pierde el dato. Si es *del cliente*, baja a 🟢 y espera.
   **La decisión es barata; equivocarse de lado, no.**

**Pueden esperar, y no cuesta nada:** 40 (cupo), 42 (permiso de costo), 47 (retiro), 48 (dirección).
Las cuatro son datos maestros o autorizaciones: se cargan cuando existan y valen igual.

**El caso raro es la 41.** Por sí sola es 🟡 y esperaría. Enganchada al import de la 50 se vuelve
🔴 en la práctica, porque el momento de capturar código y unidad **es la carga inicial**, y esa
tampoco vuelve.

---

## Y la advertencia que motivó el balance

> *"El diseño va a seguir encontrando más rápido de lo que las cerramos."*

Es cierto y hay un número: **de las once deudas de esta tabla, ocho salieron del diseño en cuatro
días** — seis enumerando campos, una construyendo Compras (la 49), dos haciendo este balance (50 y
51). Ninguna la había encontrado una sesión de backend.

Eso **no es un argumento para frenar el diseño**: es la evidencia de que el instrumento funciona. Lo
que sí sugiere es que **el re-skin de las cinco pantallas que faltan va a producir más**, y conviene
saberlo antes de decidir el orden — si Muscle Pro entra antes de que Inventario, Gastos y
Utilidades se dibujen, sus huecos aparecerán **con el cliente operando**, que es el peor momento
posible por exactamente la razón de la columna (b).
