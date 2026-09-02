# A4 · Mutación de la suite — R10 sobre los guards que protegen dinero

*Auditoría del plan `docs/PLAN-2026-09-02.md` §2, corrida el 2026-09-02 entre las 17:40 y las 18:00
UTC contra la base del lab (`kvyiwiilrzpcjzbqaoow`) y el árbol de trabajo. **No modifica código ni
esquema de forma persistente:** cada mutante se aplicó, se corrió su grupo, y se revirtió con
verificación byte a byte antes del siguiente. La evidencia está en §1.3.*

> **Veredicto en tres líneas.** De diez mutantes sobre guards de dinero, **cinco murieron y cinco
> sobrevivieron.** Los cinco que murieron lo hicieron con un rojo que nombra el guard. De los cinco
> que sobreviven, **uno es un hueco sobre dinero de verdad** —nadie prueba que el costo se congele en
> la línea de venta, y utilidades entera se apoya en eso—, tres son garantías que la suite no ejercita
> (motivo del ajuste, CHECK de categoría, policy de `debt_payments`) y uno es inerte por construcción.
> Y la corrida base destapó algo que no estaba en el plan: **`pos.spec` no está verde en este orden**,
> por un residuo que `anular-venta` deja activo.

---

## 0 · La predicción, escrita antes de aplicar el primer mutante

*`scratchpad/a4/prediccion.md`, 17:39:48Z. La cadena arrancó a las 17:49:56Z.*

| mutante | predicho | medido | |
|---|---|---|---|
| M1 factor = 1 | muere (compras-unidad asevera 150 / 100) | **muere**, 1 rojo | ✅ |
| M2 sin guard de motivo | sobrevive (ningún test prueba motivo vacío) | **sobrevive**, 6/6 verdes | ✅ |
| M3 sin rechazo por jornada | muere *si* el test asevera el texto | **muere**: asevera `/Abri la jornada de caja/` | ✅ |
| M4 `requiere_conciliacion` = false | muere (fiado 329 tiene el contraste) | **muere**, 1 rojo | ✅ |
| M5 sin clamp | **sobrevive** ("VENTA GRATIS es pct 100 %") | **muere**: `checkout-total` = "−7.000" | ❌ |
| M6 `has_permission` = true | muere en anular-venta; rbac.spec **no lo ve** | **muere** en anular-venta; rbac 7/7 verdes | ✅ |
| M7 sin CHECK de categoría | sobrevive (la UI siempre manda válida) | **sobrevive**, 5/5 | ✅ |
| M8 `unit_cost` no se congela | sobrevive (nadie lee `order_items.unit_cost`) | **sobrevive**, 6/6 | ✅ |
| M9 policy INSERT en `debt_payments` | sobrevive (nadie intenta el INSERT) | **sobrevive**, 12/12 | ✅ |
| M10 `canal` con default | sobrevive (nada omite `canal`) | **sobrevive**, 2/2 | ✅ |

**9 de 10.** El error fue de lectura, no de modelo: el título del test dice *"descuento del 100 %"* y
el cuerpo aplica **25.000 fijos sobre 18.000** — exactamente el caso del clamp. Leí el título y no el
cuerpo, que es la falla de clasificar por el nombre que CLAUDE.md ya tiene escrita para la poda.

Predicho también: *"al menos un rojo que no dirige"*. Medido: **cero** — los cinco rojos nombran el
guard (§3).

---

## 1 · Método

### 1.1 Un mutante por vez, con su grupo

Diez mutantes del plan, cada uno sobre el guard que protege una cifra. Ocho viven en la **base**
(cuerpos de RPC, un CHECK, una policy, un default) y dos en el **código** (el clamp, el default de
canal — que en el código ya es `'mostrador'`, así que M10 se aplicó como default de columna).

El arnés (`scratchpad/a4_mut.py`) hace por mutante: foto del estado (md5 de las cinco funciones
tocables, definición del CHECK, policies de `debt_payments`, default de `canal`, `git status`) →
aplica → corre el grupo con `--reporter=list,json` → **revierte en `finally`** → foto de nuevo →
**si las dos fotos no son idénticas, sale con código 2 y la cadena se detiene.** Nunca deja un
mutante puesto a propósito; si el proceso muriera, `a4_recover.py` restaura desde los originales.

Los mutantes de función se aplicaron con `create or replace` sobre el texto vivo de
`pg_get_functiondef` con **una sustitución de ancla única** (el arnés falla si el ancla aparece 0 o
2 veces; se validaron las cinco en seco antes de correr). ACL, `security definer` y `search_path`
viajan en el texto: el revert es el texto original.

### 1.2 La corrida BASE, sin mutante — y lo que destapó

Un mutante solo prueba algo contra una suite que antes pasaba. Los diez specs afectados corrieron
primero sin tocar nada: **71 tests, 66 verdes, 5 rojos, todos en `pos.spec`.**

| test rojo de `pos.spec` | qué dice el artefacto |
|---|---|
| agregar un producto al carrito calcula el total | `expect(total).toBeGreaterThan(0)` → **Received 0** |
| aplicar descuento porcentual cambia el total | `getByText('Descuento (10%)')` no aparece — sobre un total 0 no hay descuento |
| checkout: 4 métodos de pago y cálculo de vuelto | timeout en `checkout-received` |
| chip "Exacto" → vuelto 0 · chip round-up → vuelto correcto | timeout en `quick-amount-exact` / el chip |

**Causa, medida en la base:** `pos.spec` hace `getByTestId('product-card').first()` y el POS ordena
por nombre. El primer producto activo de la sede A es **`AV Insumo 831932`, precio 0**, creado por
`anular-venta.spec` (`mk('AV Insumo …', 0, true, 60)`), cuya "limpieza" borra el residuo de fiado y
cierra el turno **pero no desactiva sus productos**. Como `AV…` ordena antes que `Lab…`, cualquier
corrida en la que `anular-venta` haya corrido antes que `pos` deja el POS con un primer producto
gratis, y los cuatro tests siguientes cuelgan del primero.

Es **acoplamiento por datos entre specs**: `pos.spec` depende de un invariante del lab ("el primer
producto tiene precio") que otro spec rompe y no repara. No es un mutante ni una regresión del
código; es la suite. Va a los hallazgos (§4) y **`pos.spec` se sacó de los grupos de M8 y M10** para
que un rojo suyo no se leyera como muerte de un mutante.

### 1.3 Nada quedó puesto — verificado dos veces

| verificación | resultado |
|---|---|
| el arnés: foto antes == foto después, por mutante | **REVERT OK × 10** |
| `a4_recover.py`, **independiente del arnés**: texto vivo de las 5 funciones contra `defs.jsonl` (capturado a las 17:03, antes de todo), CHECK contra su definición, policies, default, `git status` | **BASE IDENTICA A LOS ORIGINALES** |
| `git status` al cierre de la cadena | `?? docs/PLAN-2026-09-02.md` — nada más |

⚠️ La segunda verificación existe porque el arnés verificándose a sí mismo es *"una herramienta
propia que funcionó diez veces: sin refutar"*. Y encontró una omisión mía: `defs.jsonl` no traía
`has_permission` (se había leído en otra consulta). Se completó con el texto capturado en la sesión y
**coincidió byte a byte** con el vivo — lo que además valida la reconstrucción.

⚠️ R9 otra vez: la notificación de la corrida base dijo *"exit code 0"*; el `exit=1` real estaba
escrito dentro del archivo, que es la única razón por la que se vio.

---

## 2 · Resultado por mutante

| # | mutante | dónde | grupo | tests | murió | rojo | el rojo dice… | ¿dirige? |
|---|---|---|---|---|---|---|---|---|
| M1 | factor siempre 1 | `register_purchase`: `v_factor := 1` antes de `v_unidades := v_qty * v_factor` | compras-unidad | 6 | **sí** | *3 bultos × 50 a 5.000: stock +150…* | `3 bultos de 50 entran como 150 unidades — Expected: 150, Received: 3` | ✅ nombra la regla y las dos cifras |
| M2 | sin guard de motivo | `adjust_stock`: quitado `if p_reason is null or btrim(p_reason) = ''` | inventario | 6 | **no** | — | — | — |
| M3 | sin rechazo por jornada cerrada | `register_purchase`: quitado `if v_jornada_id is null then raise 'Abri la jornada…'` | compras | 6 | **sí** | *sin jornada abierta la compra se RECHAZA…* | `getByText(/Abri la jornada de caja/) — element(s) not found` | ✅ el locator ES el texto del guard |
| M4 | `requiere_conciliacion` = false | `register_debt_payment`: `v_conciliar := false` | fiado | 12 | **sí** | *abono sin jornada: avisa la degradación…* | `getByText(/El efectivo no entró a caja/) — not found` | ✅ ídem |
| M5 | clamp removido | `POSPage`: `Math.min(discount, subtotal)` → `discount` | descuento | 4 | **sí** | *VENTA GRATIS…* | `checkout-total — Expected: "0", Received: "-7.000"` | ✅ el número negativo es el hueco |
| M6 | `has_permission` = true | cuerpo → `select true` | anular-venta + rbac | 24 | **sí** | *rechazo: sin permiso (cajero) → RPC niega* | `Expected substring: "No autorizado", Received: ""` | ✅ |
| M7 | sin CHECK de categoría | `drop constraint chk_categoria_segun_tipo` | caja | 5 | **no** | — | — | — |
| M8 | `unit_cost` no se congela | `add_order_items_with_extras`: inserta `null` en `unit_cost` | inventario | 6 | **no** | — | — | — |
| M9 | INSERT abierto en `debt_payments` | `create policy … for insert with check (true)` | fiado | 12 | **no** | — | — | — |
| M10 | `canal` con default | `alter column canal set default 'mostrador'` | tipo-venta-reset | 2 | **no** | — | — | — |

Sobre M3 y M4: el rojo es un *locator not found*, la forma que CLAUDE.md advierte que "no nombra el
locator"… **salvo que el locator sea el mensaje del guard**, que es el caso: `/Abri la jornada de
caja/` y `/El efectivo no entró a caja/` son literalmente lo que la RPC dejó de decir. Dirigen.

Sobre M6: **`rbac.spec` quedó 7/7 verde con `has_permission` devolviendo `true` para todo.** No es un
defecto de ese spec —mide el gating de la UI, que sale de `can()` sobre el rol cargado—, pero conviene
tenerlo escrito: **la suite de RBAC no toca la base.** La única línea que probó el guard del servidor
fue `voidRpc(await dbCajero(), id)` en `anular-venta`, y lo probó para un solo permiso.

---

## 3 · Los rojos que dirigen — y por qué acá no hubo "rojo inútil"

La predicción esperaba al menos un timeout mudo. No hubo. Los cinco tests que mataron mutantes
comparten una forma: **aseveran el efecto con el valor esperado escrito, no la ausencia de error.**
`toBe(150)`, `toHaveText('0')`, `toContain('No autorizado')`, y dos `getByText` sobre el mensaje
exacto de la RPC. M1 además lleva el mensaje propio ("3 bultos de 50 entran como 150 unidades"),
que es la forma que el tripwire del catálogo instauró: el rojo nombra la regla, no solo los números.

---

## 4 · Hallazgos, en orden de gravedad — SIN ARREGLAR

### 🔴 A4-1 · Nadie prueba que el costo se congele en la línea de venta (M8 sobrevive)

**Qué se mutó:** `add_order_items_with_extras` insertó `null` en `order_items.unit_cost` en vez del
`cost_price` del producto. **Qué pasó:** inventario 6/6 verde. `grep -rn unit_cost tests/` → una sola
aparición, en `compras-unidad`, y es el costo **de compra**.
**Por qué es 🔴:** R1 punto 8 lo llama contrato entre la venta, el inventario y utilidades: *"el costo
se congela en el momento de vender; si se calculara después, cada compra cambiaría las utilidades de
meses pasados"*. Ese contrato **no tiene un solo test**. Un cambio que lo rompa —el mutante es una
línea— pasa la suite entera, y utilidades (alcance firmado) se calcula sobre nulos o sobre el costo de
hoy sin que nada lo diga.
**Alcance (b):** un test que venda un producto con `cost_price` conocido, cambie el costo después, y
asevere que `order_items.unit_cost` sigue siendo el original. Con contraste: el mismo producto, otra
venta después del cambio, congela el nuevo. Y otro para el compuesto (la receta congela el costo de
los componentes).

### 🔴 A4-2 · La suite no ejercita la separación compra/gasto en la base (M7 sobrevive)

**Qué se mutó:** `drop constraint chk_categoria_segun_tipo` (el CHECK que impide `in · compra` u
`out · abono_cliente`, y `otro` sin detalle). **Qué pasó:** caja 5/5 verde: la UI solo manda
combinaciones válidas.
**Por qué importa ahora:** es la misma columna que A3 mostró sin usar en "Historial de gastos"
(deuda 63). La garantía existe en la base y **nadie la mide**: un test que inserte directo
`('out', 'abono_cliente')` y espere el rechazo, con el contraste de `('in', 'abono_cliente')`
aceptado. Es el mismo patrón que el test de guards de `compras-unidad`, que sí mata a M1.

### 🟡 A4-3 · El motivo obligatorio del ajuste de stock no tiene test (M2 sobrevive)

`adjust_stock` sin `if p_reason is null…` → inventario 6/6 verde. Ambos ajustes del spec llevan motivo
(`'compra inicial'`, `'merma'`). El motivo es la única trazabilidad de un ajuste manual de inventario
— quién movió stock y por qué—. Falta el test negativo: ajuste sin motivo → `El ajuste de stock
requiere un motivo`, y el stock no se mueve.

### 🟡 A4-4 · La suite no prueba que la base niegue lo que A2 midió (M9 sobrevive)

Con una policy `INSERT … with check (true)` sobre `debt_payments`, fiado 12/12 verde. **A2 lo
probó** —con la sonda, no con la suite—: el owner recibió `42501` al insertar directo. La suite no
tiene ninguna aserción de negación por tabla; su único "RPC niega" es el de M6, para un permiso.
**Alcance:** es la deuda que A2 dejó implícita: el contenido de la sonda de A2 (o su forma reducida:
las 9 tablas solo-SELECT × INSERT directo × cajero → `42501`) como spec, para que un `create policy`
descuidado se ponga rojo.

### 🟢 A4-5 · M10 es un mutante inerte, y se anota como tal

Un default de columna solo se observa si algún INSERT omite la columna; ninguno lo hace (la RPC y el
POS siempre mandan `canal`). El mutante no puede matarse con la suite actual **ni con ninguna**: es
equivalente al original en todo camino ejecutable. No es un hueco de cobertura; es un mutante que
el plan listó y que la medición descarta. Si el día de mañana existe un camino que omita `canal`, lo
que hay que probar es ese camino, no el default.

### 🔴 A4-6 · `pos.spec` depende de datos que `anular-venta.spec` rompe y no repara (hallazgo de la base)

Detallado en §1.2. Cinco rojos sin mutante, por un producto de precio 0 que queda activo y ordena
primero. **Alcance:** `anular-venta` desactiva sus fixtures en la limpieza (una línea por producto, como
hace `compras`), y `pos.spec` deja de tomar `.first()` a ciegas: elige un producto del lab por nombre
(`Lab Cerveza`) o crea el suyo. Es la clase *"tests deterministas e idempotentes"* de la política de
testing, y es la primera vez que se mide en Nodo.

### Lo que sale bien, para no volver a mutarlo por costumbre

- Los cuatro guards de dinero con test —factor, jornada, conciliación, permiso de anular— **matan a su
  mutante con un rojo que dirige.** M1 es el modelo: mensaje propio + cifras.
- El clamp del descuento (M5) también, y lo mató **la aserción que el re-skin endureció**: con el
  `toContainText('0')` anterior, "−7.000" contiene un cero y **el mutante habría sobrevivido**.
  `toHaveText('0')` exige que el total SEA cero. Una aserción laxa no es una aserción: es la clase que
  R10 llama *"verdadera para cualquier entrada"*, medida acá con un mutante real.

---

## 5 · Lo que esta auditoría NO cubre

- **Diez mutantes, no la suite entera.** R10 dice *"mutá el sujeto a identidad"* para cada test; acá
  se mutaron diez guards elegidos por el plan. Los 189 tests siguen sin su propio mutante, y M6 ya
  mostró que un spec completo (`rbac`, 7 tests) puede no mirar la capa que su nombre promete.
- **Los mutantes se corrieron contra su grupo, no contra los 189.** Un mutante que sobrevive a su grupo
  podría morir en otro spec (M8 en `reportes`, por ejemplo, si algo leyera utilidades — hoy nada lo
  hace). La conclusión "sobrevive" vale para el grupo que el plan asigna.
- **Las ramas de componentes y extras** de `add_order_items_with_extras` (el `unit_cost` de la receta)
  no se mutaron: el mutante fue la línea del ítem simple.
- **Playwright no corrió con `--retries`**: los timeouts de la base son rojos de primera pasada. Un
  flake se habría visto igual; ninguno de los 5 lo era (causa medida).

---

## Apéndice · cómo reproducirlo

`scratchpad/a4_mut.py <M1..M10> <dir>` aplica, corre, revierte y verifica; `a4_recover.py` verifica
la base contra `defs.jsonl` y con `--revert` restaura. La cadena: `for M in M1..M10; do python
a4_mut.py $M a4 || break; done`. Duración total: 10 min 29 s para los diez, más 8 min de base. Los
`resultado.json` de cada mutante y de la base están en `scratchpad/a4/`. Token de proyecto en
variable de entorno, como siempre; los scripts son andamiaje y no entran al repo.
