# G-Nexo — Deudas e ideas pospuestas

**Cuándo se lee:** al planificar.

Esto **no es un backlog**. Son dos cosas distintas y conviene no mezclarlas:

- **Deudas vigentes** — algo que ya está a medias, o una decisión que se tomó sabiendo que dejaba
  un hueco. Tienen dueño y consecuencia.
- **Ideas pospuestas** — cosas que se decidió **no** hacer todavía, con la razón escrita. Existen
  para que nadie las "descubra" de nuevo dentro de tres meses y las proponga como hallazgo.

Toda afirmación de estado va fechada. *Última revisión: 2026-08-31.*

---

## Deudas vigentes

### Bloqueantes del arranque

| # | Deuda | Consecuencia si no se paga |
|---|---|---|
| 1 | ~~Correr el hook en la máquina real~~ **RESUELTO 2026-08-31: corre y dispara.** | La evidencia **no** es el pipe-test ni el clon limpio: es que el hook **disparó 3 veces dentro de una sesión real de Claude Code**, inyectando su texto en el contexto. Eso prueba la cadena entera —`settings.json` leído, matcher `Write\|Edit\|Bash` activo, Node encontrado, script no mudo—, que es más de lo que un pipe-test puede probar: allá vos invocás el script; acá lo invoca el harness. En G-Vento el fallo fue exactamente ese eslabón, no el script. ⚠️ Que dispare no dice que dispare **bien**: las 3 veces fueron falsos positivos → deuda #22. |
| 2 | ~~Verificar que el CLI de Supabase no dé 403~~ **RESUELTO 2026-08-31: responde, sin 403.** `supabase` v2.90.0 contra el proyecto de G-Nexo, base vacía. | Queda el hábito, no la deuda: regenerar `database.types.ts` después de **cada** migración. En G-Vento ese 403 es lo que dejó los tipos escritos a mano, divergiendo del esquema sin que `tsc` lo notara (R1 punto 5). |
| 3 | ~~Decidir el nombre de la entidad sede~~ **RESUELTO 2026-08-31: `sede_id`.** Queda la ejecución: renombrar `restaurant_id`, **después de podar**, en un commit solo. | El repo ya usa "sede" en el permiso `sedes.gestionar` y en R6. Criterio de éxito: el conteo del término viejo llega a cero. Reversible con `git revert`. |
| 4 | **Confirmar el nombre del producto**: whois de `gnexo.co` / `.com` y marca en el SIC, clases 9 y 42. | Hay al menos tres empresas de software colombianas con la raíz "Nexo". Cambiarlo después toca todo. |
| 21 | **Renombrar la marca heredada** — `gvento`, `GVento`, `G-Vento` — en todo el repo. **99 ocurrencias** en `src`, `supabase`, `scripts`, `tests` y `package.json` (medido 2026-08-31). Se detectó por el `mkdtemp` `gvento-rbac-*` de `scripts/gen-rbac-sql.mjs`, pero es **defecto de clase, no instancia** (R3). | Criterio de éxito: **llega a cero**. Va en el **mismo paso 5** que el rename de `restaurant_id` (deuda 3), en la misma pasada, para no tocar dos veces los mismos archivos. ⚠️ El alcance medido excluye `docs/`: las menciones a G-Vento ahí son historia y atribución y **no se renombran** — por eso el cero es sobre esos cinco lugares, no sobre el repo entero. |

### Contratos y verificación

| # | Deuda | Nota |
|---|---|---|
| 5 | **Los cuatro checks de árbol en CI.** `gen:rbac:check` (copiar de G-Vento) · `database.types.ts` regenerado vs commiteado · columnas de `sentry.test.ts` contra `information_schema` · el enum `subscription_status` en sus seis lados. | Un hook dispara cuando tocás un archivo; el fallo real de G-Vento fue un seed congelado **porque nadie lo tocó**. Los hooks no ven omisiones; el check de árbol sí. |
| 6 | **Tripwire del catálogo de permisos** — un `toBe(N)` en `tests/roles.spec.ts` que clave el tamaño. | Sin él, un cambio silencioso del catálogo no sale rojo. |
| 7 | ~~Copiar el generador de RBAC~~ **RESUELTO 2026-08-31: ya viajó en `d848852`.** Existen `scripts/gen-rbac-sql.mjs` y `supabase/seed-system-roles.sql`, y `node scripts/gen-rbac-sql.mjs --check` da exit 0. | `admin = ALL_PERMISSION_KEYS` derivado, no enumerado. No `SECURITY DEFINER`. Revoca a `authenticated`. Dos guards fail-closed. ⚠️ Lo que **no** cierra: que el check corra en CI — eso sigue siendo la deuda #5. Y el script arrastra dos defectos propios, #20 y #21. 🔴 Lo que esta deuda **no** cubría y ahora es la #23: viajó el **mecanismo**, no el **catálogo**. |
| 8 | **Los hooks son ahora un contrato en dos repos** sin nada que los sincronice. | Si arreglás el matcheo de permisos en un repo, no llega solo al otro. Está en el inventario de R1 como punto 9. |
| 20 | **Resolver el binario de `tsc` en `scripts/gen-rbac-sql.mjs`** en vez de armar la ruta `node_modules/typescript/bin/tsc` a mano — resolverlo y **fallar ruidoso** si no está. | Frágil con pnpm, que no aplana `node_modules`, y en CI. Es el **mismo patrón que el `jq` del hook** (R4): un camino que anda en una máquina, asumido universal. Si el check de árbol del punto 5 se apoya en este script, un `tsc` no encontrado convierte el check en silencio en vez de en rojo. |
| 22 | **Tasa de ruido del hook — instrumento puesto, datos acumulándose.** El hook anota solo: detalle por disparo en `.claude/hook-ledger.jsonl` y contadores en `.claude/hook-ledger.stats.json` (ambos fuera de git, por máquina). ⛔ **No corregir el hook hasta leer esto con sesiones que escriban SQL de verdad**, que es donde puede haber verdaderos positivos. | 🔴 **CÓMO SE LEE — sin esto el instrumento existe y nadie lo mira:**<br>`cat .claude/hook-ledger.stats.json` → `invocaciones`, `disparos`, `porRegla`.<br>`node -e "const l=require('fs').readFileSync('.claude/hook-ledger.jsonl','utf8').trim().split('\n').map(JSON.parse);console.log(l.length,'disparos');"` → detalle con fecha, herramienta y regla.<br>**Tasa de disparo = `disparos / invocaciones`.** 🔴 **DOS TRAMOS MEDIDOS EL 2026-08-31, Y CAMBIAN HACIA DONDE VA ESTA DEUDA:** trabajo **documental** → **11 de 23 = 48%**, casi todos **falsos** positivos. Sesion que **escribio SQL de verdad** (9 archivos de esquema) → **37 de 56 = 66%**, y esta vez **verdaderos positivos en su mayoria**: el hook disparaba porque efectivamente se estaba escribiendo SQL y tocando el catalogo.<br>**Relectura del dato que abrio esta deuda:** el "6 de 6" NO era ruido del hook — era un **artefacto de medir durante trabajo documental**, con un denominador compuesto solo de sesiones donde un verdadero positivo era **imposible**.<br>⚠️ **Hipotesis viva: esta deuda puede cerrarse con "no se toca".** Falta al menos otro tramo con SQL para confirmarlo. Y la clase B (22.B) sigue abierta aparte, porque no depende del volumen sino del incentivo invertido.<br>⚠️ **CÓMO SE INTERPRETA, con el sesgo puesto:** el contador es read-modify-write y **no es atómico**, así que `invocaciones` es un **PISO** — se pierden incrementos, nunca se inventan. Un denominador subestimado **infla** la tasa. Por lo tanto: **una tasa alta es real; una tasa baja es aún mejor de lo que dice.** Nunca al revés.<br>⚠️ Y `disparos` **no** es lo mismo que falsos positivos: hay que mirar si la sesión escribió SQL. Una tasa del 48% en sesiones de pura documentación dice "ruidoso"; la misma tasa en sesiones que escriben esquema podría ser el hook haciendo su trabajo. **El numerador se clasifica a mano; solo el denominador es automático.** |
| 22.A | **Clase A — nombrar una ruta `.sql`.** Es la **regla 1** funcionando como fue diseñada: matchea la ruta, no distingue prosa de código. | Ruido de bajo costo conceptual: se dispara al *hablar de* un archivo. Si el arreglo alguna vez llega, acá tendría la forma de mirar el rol del token (¿destino de escritura, o texto?), no la de una lista de excepciones. |
| 22.B | **Clase B — escribir sobre el catálogo sin tocarlo.** Es la **regla 2** matcheando **prosa** — se vio en mensajes de commit y en documentos `.md`. | 🔴 **Propiedad incómoda, y es la que decide hacia dónde va el arreglo: cuanto mejor se documenta el trabajo sobre RBAC, más dispara.** Penaliza la conducta correcta — un commit que explica bien un cambio de permisos es más ruidoso que uno que no explica nada. Eso es un incentivo invertido, no solo ruido. El arreglo de B **no** es el de A: acá el problema no es el matcheo de rutas sino que la regla 2 no distingue *modificar* el catálogo de *hablar* del catálogo. |
| 23 | 🔴 **El catálogo de permisos propio de G-Nexo.** El generador viajó (deuda #7, cerrada); **el catálogo no**. Las 23 claves de `SYSTEM_ROLES` siguen siendo las de G-Vento. **Salen** `cocina.*`, `mesas.*`, `delivery.*`. **Entran** `compras.*`, `inventario.*`, `gastos.*`, `utilidades.*`. ⏳ **Va DESPUÉS del plan de esquema, no antes.** | Se hace editando `src/lib/permissions.ts` y corriendo `pnpm gen:rbac` — **nunca** editando `supabase/seed-system-roles.sql`, que es salida generada. Verifica `pnpm gen:rbac:check`. ⚠️ Dos residuos heredados a no repetir (R1 punto 1): que una clave esté en el catálogo **no** prueba que algo esté protegido —en G-Vento 6 permisos no gateaban nada y fallaban **abierto**, así que cada clave nueva necesita su `can()`—, y una clave enforzada que **no** esté en `PERMISSION_GROUPS` no se puede conceder desde la UI de Roles (allá le pasó a `ventas.anular`). La deuda #6, el tripwire `toBe(N)`, se clava **con este catálogo**, no con el heredado. |
| 23.1 | 🔴 **Cada clave del catálogo tiene que tener un consumidor verificable — o se elimina.** Al 2026-08-31, **13 claves no las usa ninguna policy, RPC ni `can()`**. Nueve son de bar y se van con la 23 (`cocina.*`, `mesas.*`, `delivery.gestionar`, `pos.anular`, `pos.descuento`); **cuatro son reales para G-Nexo y hoy no protegen nada**: `ventas.historial`, `productos.ver`, `reportes.financiero`/`stock`/`consolidado` — y `ventas.anular`, que sí tiene consumidor desde el archivo 06b. | **Criterio de éxito, y no es "revisar el catálogo":** para cada clave de `ALL_PERMISSION_KEYS`, existe al menos un consumidor localizable por grep —una policy en `11-rls.sql`, un `has_permission()` en una RPC, o un `can()` en `src/`— **o la clave se elimina**. Es verificable y automatizable; "revisar" no. <br>🔴 **LA CAUSA MECÁNICA, que vale más que las cuatro claves:** en G-Vento las policies gateaban por `get_my_role() = 'admin'`, **el enum**, y nunca llamaban a `has_permission()`. Por eso el catálogo no enforceaba: no era un olvido por clave, era que **el catálogo no estaba conectado**. El archivo `11-rls.sql` invierte eso. Sin identificar la causa, el catálogo propio de G-Nexo habría repetido el problema con claves nuevas. |
| 23.2 | ⛔ **Los permisos que gatean LECTURAS no tienen mecanismo.** `ventas.historial`, `productos.ver` y `reportes.*` describen accesos de lectura, pero las policies de `select` gatean **solo por sede**. | Decidir en la 23: o las lecturas se gatean con `has_permission` en la policy de `select` —lo que puede dejar pantallas vacías sin explicación, un fallo poco legible—, o esas claves se consumen en `src` con `can()` para ocultar la pantalla, o se eliminan. **Lo que no puede seguir es el estado actual**, donde la clave existe, se puede conceder y no cambia nada: es la definición del permiso inerte. |
| 24 | 🔴 **`addOrderItems` inserta en `order_items` sin descontar stock — fail-open (R2).** `src/lib/supabase-helpers.ts` lo exporta y hace `supabase.from('order_items').insert(items)` directo, salteando la RPC. La policy `"order_items: staff crea"` **lo permite desde el cliente**. ⛔ **Anotada, no arreglada** (2026-08-31). | Hoy **no tiene llamadores**, así que la garantía *"todo ítem descuenta stock"* se cumple — pero la sostiene una **convención, no la base**: un `import { addOrderItems }` en una pantalla nueva rompe el inventario **sin un solo error**. Es el modo de fallo de R2: lo que no está prohibido pasa en silencio. Tres arreglos posibles, todos con costo distinto: borrar el helper, cerrar la policy de insert directo, o **declarar por escrito** que es una convención y nombrar quién la sostiene. La regla sin número aplica entera: al escribir la garantía, nombrá el mecanismo y su límite. ⚠️ `updateOrderItem` está igual de suelto; `removeOrderItem` **sí** tiene llamador vivo en `TablesPage`. |
| 25 | **Medir `src/` y `tests/` con el criterio de clasificación de `docs/plan-esquema-base.md`**, para poder comparar la distribución con los cuatro porcentajes del diagnóstico (21,7 / 24,6 / 43,3 / 9,5). | Sin esto, la comparación **no se puede hacer**: los porcentajes del diagnóstico son sobre el repo entero y la medición del plan es sobre `supabase/` solo (9.280 de 40.272 líneas). Compararlas igual sería el error de proxy de R4 sobre nuestra propia medición — el plan lo dice y por eso no lo hizo. Dato ya conocido que orienta: en SQL, mesas y cocina son **columnas y policies**, no módulos (clase B = 2,2% de `supabase/`), así que **el bar caro vive en `src/`** y esta medición es la que dimensiona la poda de verdad. |
| 26 | ✅ **RESUELTA el 2026-08-31 — el cliente respondio: LA COMPRA SI SALE DE LA CAJA DEL DIA.** Y el faltante se resuelve inyectando plata (un ingreso de caja), no marcando la compra como pagada por fuera. O sea que la premisa heredada era **falsa para G-Nexo**: se hereda el mecanismo invertido. ~~Premisa heredada sin confirmar: "la compra NO toca la caja".** Viene de una regla del **cliente de G-Vento** —el efectivo que sale del cajón lo registra el cajero como egreso **manual**, que admite monto parcial—, y el paso 0 la adoptó con la v2 de `register_purchase`. ~~ Consecuencias: `register_purchase` escribe un `cash_movement` y entra al cierre; **rechaza la compra si no hay jornada abierta** (fail-closed, decidido); y `payment_method` sale de la factura → deuda #27. | Se adoptó con respaldo **técnico** independiente de la regla: el frontend heredado ya espera el shape de la v2 (`RegisterPurchaseResult` = `{invoice_id, total}`, sin flags de caja), así que la v1 lo rompía. Pero **eso justifica la elección, no la regla**: heredar en silencio una decisión de negocio ajena es la premisa exacta que el diagnóstico advierte, y acá el negocio es distinto —mostrador con jornada de caja, no bar—. Si el cliente de G-Nexo espera que la compra en efectivo descuente caja sola, cambia la RPC **y** el tipo del front. ⚠️ Defecto asociado a corregir al consolidar: el comentario de `registerPurchase` en `src/lib/supabase-helpers.ts` todavía describe la **v1** ("si es efectivo con turno abierto, genera el egreso de caja") y contradice al tipo que tiene justo encima. |
| 27 | 🔴 **Eliminar `purchase_invoices.payment_method` — EN ESTE ORDEN: primero el consumidor, después la columna.** La regla del cliente (2026-08-31) es que **la compra siempre sale de la caja del día**, así que la forma de pago de la compra deja de tener sentido. ⛔ La columna es `not null` y el frontend la envía hoy. | **Parte del grupo #29 (consumidores que rompe el esquema base), ítem 29.3.** Orden obligatorio, y no es cosmético: 1) sacar el envío desde `src` (`PurchaseInvoicePayload` y la pantalla de compras) · 2) recién ahí eliminar la columna. Al revés, el front rompe: manda una columna que ya no existe, y como es `not null` no hay default que lo salve. ⚠️ **Hallazgo que se paga de paso:** esa columna **no usa el enum `payment_method`** — es un `CHECK` con los cuatro valores **copiados a mano**. O sea que el contrato de R1 punto 4, anotado como "de 4 lados a 8", tenía en realidad un **noveno lado**, y encima duplicado con otro mecanismo. Eliminar la columna **mata ese lado**: es la única forma de sincronización que no se pudre. |
| 28 | **Idea pospuesta con fecha: la compra a CRÉDITO al proveedor.** ⛔ **Decisión, no olvido.** | **Verificado el 2026-08-31 en todo el repo:** no existe **nada**, ni a medias — sin estado, sin `due_date`, sin tabla de saldos a proveedor. El único rastro dice lo contrario: el comentario de `compras-proveedores.sql` declara *"Pago COMPLETO al registrar (sin pagos parciales ni cuentas por pagar)"*. Se asume **todo de contado**. **Por qué se pospone sabiendo que va a doler:** sería **cartera POR PAGAR**, que hoy está fuera del alcance firmado — el alcance tiene cartera **por cobrar** (clientes), que es la simétrica y no la misma. ⚠️ **Se espera que el cliente la pida:** comprar a 30 días es común en distribución. Cuando llegue, la compra necesita distinguir contado de crédito y eso toca `register_purchase`, el cierre de caja y utilidades a la vez — no es agregar una columna. Queda escrito para que nadie lo "descubra" dentro de tres meses y lo proponga como hallazgo. |

### 🔴 Consumidores que ROMPE el esquema base — ninguno es opcional

**Criterio del grupo, y por eso van juntos:** no son mejoras ni limpieza. Son lugares de `src/`
que quedan **incompatibles con el esquema consolidado**, y hasta que se toquen, el flujo
correspondiente **falla**. Que fallen es deliberado —fail-closed— pero significa que estos ítems
son **bloqueantes del arranque**, no backlog.

**Todos comparten el mismo orden obligatorio: primero el consumidor, después el esquema.** Al
revés, el front manda algo que ya no existe y no hay default que lo salve.

*Fecha límite de todo el grupo: el primer `supabase db push`. Después no es editar un archivo, es
una migración.*

| # | Consumidor | Qué lo rompe | Qué hay que hacer |
|---|---|---|---|
| 29.1 | `src/components/shift/MovementsModal.tsx` | `cash_movements.categoria` es `not null` con allowlist cruzada (archivo 10). El modal hoy manda **solo `reason`**. | Mandar `categoria` además de `reason`. Mientras no lo haga, **todo movimiento manual de caja es rechazado por la constraint**. Ruidoso a propósito. |
| 29.2 | `src/pages/ConfigPage.tsx` (sección de motivos) | La pantalla dice que edita "motivos de egreso". Tras el archivo 10 eso es **una nota que dirige mal**: `config.cash_out_reasons` pasó a ser la lista de **sugerencias de `reason`**, no la de categorías. | Cambiar el texto de la UI. La categoría es fija en el esquema y **no** editable por el cliente: si la inventa, los reportes entre sedes y entre meses dejan de ser comparables. |
| 29.3 | `src/lib/supabase-helpers.ts` → `PurchaseInvoicePayload` + pantalla de compras | `purchase_invoices.payment_method` se elimina (deuda #27): con la regla del cliente, la compra **siempre** sale de la caja del día. La columna es `not null` y el front la envía. | Sacar el envío **antes** de eliminar la columna. Mata de paso el noveno lado —duplicado como `CHECK`— del contrato `payment_method` (R1 punto 4). |
| 29.4 | `src/` en general: `restaurant_id` × 1.017 · marca heredada × 99 | El esquema base usa `sede_id` y `sedes`; `src/` sigue en `restaurant_id`. | Es la pasada única de renombre (deudas #3 y #21). Criterio de éxito: los dos conteos llegan a **cero** en `src/`. |
| 29.5 | `src/` : `'waiter'`, `'preparing'`, `'ready'`, `order_type` | El archivo 01 podó esos valores de los enums. `POSPage` escribe `DEFAULT_ORDER_TYPE='takeaway'` en **cada venta**; `useUsers`, `ConfigPage` y `supabase-helpers` nombran `'waiter'`; tres consultas filtran por `'preparing'`/`'ready'`. | Va con la poda de `src/`. Se decidió podar el enum primero porque Postgres **no** puede quitar valores después sin recrear el tipo. |
| 29.6 | `src/lib/sentry.test.ts` | La tabla de 74 columnas describe el esquema de G-Vento. Cambian `orders` (sin `type`/`table_id`/`waiter_name`, con descuento sin `discount_kind`), `order_items` (con `unit_cost`), `cash_movements` (con `categoria`), y todas las `restaurant_id`. | R1 punto 6: agregar o quitar una columna del esquema **obliga** a tocar esa tabla en la misma sesión. Hoy ya está desincronizada. |
| 29.7 | **Cartera: la vista de "abonos sin movimiento de caja"** — y el brief de diseño | `debt_payments.requiere_conciliacion` (archivo 09) marca el efectivo que entró sin jornada abierta. **Hoy nadie lo mira.** | Un filtro o vista en Cartera que liste los abonos con `requiere_conciliacion = true`, para conciliarlos a mano. ⚠️ **Este ítem es distinto del resto del grupo y conviene no diluir el criterio: NO rompe un flujo.** Sin él todo funciona — y ese es el problema: la columna queda siendo un dato que nadie consulta, o sea el trabajo hecho y el beneficio no. Va también al brief de diseño, porque es pantalla, no esquema. |

⚠️ **29.6 es el que más fácil se olvida** y el único que no rompe un flujo de usuario: falla —o
peor, deja de proteger— en el filtro de PII de Sentry, que es exactamente donde nadie mira hasta
que hay un incidente.

### Documentación

| # | Deuda | Nota |
|---|---|---|
| 9 | **Evidencia de las once reglas sin copiar.** El `CLAUDE.md` apunta al repo de G-Vento. | Ver el hueco al inicio de `docs/BITACORA.md`. Referencia cruzada entre repos: se pudre. |
| 10 | **La regla nueva no tiene número.** Sale del caso #13 de G-Vento ("una garantía falsa donde se decide le gana a tres advertencias donde se codea"). | Numerarla **en G-Vento primero**. Asignarle un R11 unilateral acá crea un contrato divergente el primer día. |
| 11 | **El conteo de errores repetidos de G-Vento no cierra:** 9 (traspaso) vs 11 (`CLAUDE.md`) vs 13 con casos #11–#14 (cierre). | Resolver contra la bitácora de G-Vento antes de citarlo en cualquier lado. Hoy el hook cita el número. |
| 12 | **Nota falsa abierta en G-Vento:** su `CLAUDE.md` sigue declarando un monorepo que no existe. | Acción en G-Vento, no acá. Anotada porque G-Nexo hereda de ese archivo. |

### Pendientes de construcción

| # | Deuda |
|---|---|
| 13 | **Design system.** Brief entregado a Claude Design el 2026-08-31 (`docs/brief-diseno.md`). Al volver la Entrega 1, capturarla como skill `g-nexo-design-system`. |
| 14 | **Las cinco skills:** `sql-riesgoso` · `defecto-de-clase` · `spec-e2e` · `rbac-permisos` · `demo-en-vivo`. En G-Vento la Fase C quedó a medias. Criterio: citan las reglas por número y **no las repiten**. |
| 15 | **Infraestructura:** Vercel y proyecto propio de Sentry (con el filtro de PII **ya corregido**, no la versión con huecos). |
| 16 | **Staging.** Recomendación: stack separado del servidor Ubuntu que hoy sirve a G-Vento con ciclo nocturno de backup. En producción son proyectos distintos; un staging que los mezcle deja de reflejar la realidad. **Sin decidir.** |
| 17 | 🔴 **Inventario y compras están en la zona gris, no en la base que viaja.** G-Vento descuenta por receta; acá no hay recetas. Unidad de compra ≠ unidad de venta. El costo se recalcula por compra, no por receta. | Tratarlos como copia es la premisa exacta que el diagnóstico advierte: el peligro no está en lo que se borra, está en el 43,3% que parece viajar. |
| 18 | ~~Método de costeo sin decidir~~ **RESUELTO 2026-08-31: promedio ponderado móvil.** El cliente describe un solo costo por producto ("a esto me sale, a esto lo vendo"), lo que descarta PEPS y lotes. Frente a último costo, el promedio evita que una compra cara desplome la utilidad en el papel y sobrevalúe el inventario. El cliente nunca ve el término. | ⚠️ Más importante que el método: **el costo se graba en la línea de venta al vender** (ver R1 punto 8), no se recalcula después. |
| 19 | **Utilidades depende de que existan los costos.** Si hay ventas de productos sin compra registrada, el número está mal. La pantalla debe declararlo, no disimularlo. | Perfil de fallo silencioso: no revienta, se ve bien, y lo detecta el cliente antes que nosotros. |

---

## Ideas pospuestas — decisiones de NO hacer

**~~Inventario y compras~~ — REACTIVADO el 2026-08-31.** Estuvo pospuesto hasta que hubiera cliente
firmado. **El cliente firmó**, así que la condición se cumplió y entra al alcance: ≈30.000 líneas
en vez de ≈14.000. Se conserva la nota para que quede el registro de por qué estuvo afuera y qué la
destrabó. ⚠️ Advertencia que pasa a deuda vigente (ver #17): **no viajan tal cual desde G-Vento**,
están en el 43,3% de zona gris.

**Subagentes en Claude Code.** Un agente se invoca cuando alguien se acuerda de invocarlo — es la
misma propiedad que hizo fallar a los recordatorios y que las skills tampoco resuelven. El único
mecanismo que funcionó en G-Vento fue el hook, porque exige respuesta en el instante de decidir.
Además, cada agente es otro lado del contrato de las reglas, × 2 repos. Reevaluar cuando aparezca
una tarea que inunde el contexto con trabajo que no se va a volver a mirar; el candidato real es
la auditoría por mutación de R10.

**Renombrar `restaurant_id` en G-Vento.** 1.010 ocurrencias en 77 archivos. El costo supera el
beneficio. En G-Nexo el problema no aplica porque se elige bien desde el primer commit (deuda 3).

**Listas de precios diferenciadas.** El prospecto opera hoy con una sola lista y vende más al detal
que al mayoreo. Las listas diferenciadas vienen "más adelante", según él mismo.

**Rutas propias y despacho.** El cliente carga y se lleva. Puede aparecer un tercero. No hay rutas
y no se espera que las haya pronto — es la razón por la que el producto no se llama G-Ship.

**Modo oscuro.** No hay decisión todavía; depende de la Entrega 1 del design system.

**G-Centro como tercer producto.** G-Centro ya nació multi-producto. Enumerar qué falta para que
G-Nexo entre — pero **en su propio hilo**, no acá.
