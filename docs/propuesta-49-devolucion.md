# Propuesta · deuda 49 — corregir una compra

*2026-09-02. Para validar, no aplicada. Es la única deuda que bloquea **operar** y va a pasar el
primer día: hoy un error de tecleo en una compra es permanente.*

## Lo que los `CHECK` reales dicen — y contestan las tres preguntas

Leídos de `pg_constraint`, no del archivo:

| Tabla | Constraint | Qué implica para una "compra en negativo" |
|---|---|---|
| `purchase_invoice_items` | `qty > 0` | 🔴 **la rechaza** |
| `purchase_invoice_items` | `unit_cost >= 0` · `subtotal >= 0` | 🔴 **la rechaza** |
| `purchase_invoices` | `total >= 0` | 🔴 **la rechaza** |
| `cash_movements` | `amount > 0` | ✅ **ya resuelto**: la magnitud es positiva y **el signo vive en `type`** |
| `stock_movements` | `qty <> 0` | ✅ **acepta negativos** |
| `stock_movements` | `type in ('sale','adjustment','return','purchase')` | ✅ **`return` ya existe en la allowlist** |

> 🔴 **Y eso descarta la forma que yo mismo propuse.** Una "compra en negativo" literal exige
> **relajar cuatro CHECK**, y tres de ellos protegen el camino NORMAL. Aflojar `qty > 0` para
> habilitar un caso raro deja pasar el typo obvio —`-5` en vez de `5`— en toda compra corriente.
> Es la asimetría de la dirección del fallo, al revés: **se abriría el lado que miente para
> resolver algo del lado que molesta.**

**El esquema ya tenía la respuesta escrita, dos veces.** `cash_movements` guarda `amount > 0` y pone
la dirección en `type`; `stock_movements` acepta `qty` negativo y tiene `'return'` en su allowlist
desde el día uno. **La magnitud es positiva; la dirección es un tipo.**

---

## Propuesta, en tres piezas

### 1 · `purchase_invoices.kind` — la dirección, no el signo

```sql
alter table public.purchase_invoices
  add column kind text not null default 'compra'
    check (kind in ('compra', 'devolucion'));
```

- **Ningún CHECK se relaja.** Los ítems siguen con `qty > 0` y `unit_cost >= 0`; el total sigue
  `>= 0`. Una devolución de 3 bultos a 5.000 es `kind='devolucion'`, `qty=3`, `total=15.000` — una
  **magnitud**, y su sentido lo da `kind`.
- `default 'compra'` deja las filas existentes significando lo que ya significaban. Sin backfill,
  igual que el factor de la 43.
- Allowlist positiva (R2), no un booleano `es_devolucion`: el día que aparezca una tercera clase
  —una nota de crédito parcial, por ejemplo— se agrega un valor, no se inventa un segundo flag.

### 2 · `register_purchase_return(p_invoice_id, p_items)` — el hecho nuevo

Espeja `register_purchase` con los mismos guards (sede, permiso, jornada abierta, proveedor y
producto por UUID) y **tres diferencias**:

| | compra | devolución |
|---|---|---|
| stock | `+ qty × factor` | `− qty × factor` |
| `stock_movements.type` | `'purchase'` | **`'return'`** — ya está en la allowlist |
| caja | `type='out'`, `categoria='compra'` | **`type='in'`**, `categoria=`⬇ |

⚠️ **Un valor nuevo hace falta en la allowlist de caja.** El CHECK vigente para `type='in'` es
`('abono_cliente','base','otro')`, y una devolución de proveedor no es ninguna de las tres. Se puede
usar `'otro'` —el CHECK `chk_otro_exige_detalle` obliga a poner motivo, así que no queda mudo—,
pero **eso mezcla dos cosas en un valor**, que es justo lo que este proyecto ya decidió no hacer.
**Propuesta: agregar `'devolucion_compra'`** al lado `in`. Un `alter … drop/add constraint`, que es
barato porque es un CHECK y no un enum.

🔴 **Y la parte contraintuitiva: la devolución NO toca `cost_price`.**
El promedio ponderado móvil **no se revierte**, y no por una limitación: el costo posterior ya se
propagó a las ventas del medio, congelado en cada línea (R1 punto 8). Además, devolver mercadería no
cambia lo que costó **la que se quedó**. La devolución saca stock y devuelve plata; el costo del
inventario restante es un hecho anterior.

### 3 · `adjust_cost(p_product_id, p_costo, p_motivo)` — para cuando el promedio quedó sucio

**Éste es el que cierra el caso real**, y hay que decirlo con su límite:

> Devolver + volver a comprar **no deja el costo donde estaba.** Medido:
> stock 500 a costo 80; se teclea 1.200 en vez de 12 → promedio 94,12. Se devuelven los 1.200 (el
> costo no se toca) y se compra 12 → **94,25**, cuando lo correcto era **80,47**. El error queda
> horneado.

Por eso hace falta una operación que **declare** el costo, no que lo reverse. Es el simétrico exacto
de `adjust_stock`, que ya existe con esa forma: ajusta con motivo obligatorio y cuatro guards
fail-closed. `adjust_cost` sería igual — motivo obligatorio, permiso, producto por UUID de la sede
propia, y auditoría de quién y cuándo.

**No es un parche: es la misma tesis.** No se reescribe el pasado; se agrega un hecho nuevo con su
fecha. El costo del inventario a partir de hoy es el que alguien declaró, con su nombre al lado.

---

## Lo que hay que decidir antes de escribir SQL

1. **¿Devolución y corrección son la misma operación en la UI, o dos?** Son distintas: devolver
   mercadería es un hecho del negocio; corregir un tecleo es admitir un error. Mi lectura: **una
   sola operación en la base** (devolución) y **dos entradas en la UI**, con textos distintos —
   *"Devolver a proveedor"* y *"Corregir esta compra"*, la segunda pre-cargando todos los ítems.
2. **¿`adjust_cost` entra ahora o después?** Sin él, corregir un tecleo grande deja el costo
   contaminado. Con él, el alcance crece: es una RPC más, un permiso y una pantalla.
3. **¿Se puede devolver más de lo comprado?** Fail-closed diría que no: la devolución valida contra
   lo que esa factura trajo. Pero el stock ya pudo haberse vendido, así que devolver puede dejar
   existencia negativa — que **el proyecto permite a propósito** (ver la migración de catálogo).
   Es una decisión, no un detalle.

---

## Anexo · deuda 46, las dos ramas pre-diseñadas

*Para que la respuesta del cliente sea mecánica y no abra otra ronda.*

**La pregunta:** ¿el plazo se pacta **por venta** o es **del cliente**?

| Si la respuesta es… | Esquema | Irrecuperabilidad |
|---|---|---|
| **del cliente** (*"a Ferretería El Tornillo le damos 30 días"*) | una columna en `customers` (días, nullable = contado) | 🟢 **dato maestro**: se carga cuando sea y vale igual. Espera sin costo. |
| **por venta** (*"esta la pactamos a 60"*) | `due_date` o `plazo_dias` en `orders`, capturado **en el cobro a crédito** | 🔴 **irrecuperable**: lo pactado en una venta de agosto no se reconstruye en octubre. Cada venta a crédito sin él pierde el dato. |
| **las dos** (plazo del cliente, override por venta) | ambas, con precedencia venta > cliente | 🔴 por la mitad de venta |

🔴 **El cálculo de "vencido" es el mismo en las tres ramas** y por eso no bloquea: `created_at +
plazo`, con la frontera de día en `America/Bogota` (R7) — no sobre el timestamp UTC crudo, que daría
un vencimiento corrido en las ventas de la noche.

**Mientras tanto la columna VENCIDO no se pinta y la barra dice "Antigüedad"**, que ya está aplicado
y fijado en la skill.
