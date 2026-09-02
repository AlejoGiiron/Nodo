# A5 · Estado en los documentos — la auditoría fundacional, repetida

*Auditoría del plan `docs/PLAN-2026-09-02.md` §2, corrida el 2026-09-02 entre las 18:12 y las 18:30
UTC. Cada afirmación de estado se verificó **contra código, base o suite**, nunca contra otro
documento. No modifica nada: produce la lista de lo falso y su corrección, para aplicarla en un
turno propio.*

> **Veredicto en tres líneas.** De ~107 afirmaciones de estado verificadas en seis documentos,
> **17 son falsas** y dos documentos-foto tienen 14 más que ya no describen el presente. La
> proporción (16 %) está en el orden del hallazgo fundacional (8 de 36, 22 %). **Las tres peores
> están en `CLAUDE.md`, el archivo que se lee siempre, y las tres son contradicciones internas:**
> el documento afirma una cosa y la contraria a pocas líneas, porque se editó por *append* y la fila
> vieja quedó. Y una es sobre mí: el contrato del punto 6 de R1 se violó esta semana, con la 43.

---

## 0 · La predicción, escrita antes de verificar

*`scratchpad/a5/prediccion.md`, 18:12:36Z.*

> Predicho: 60–80 afirmaciones verificables; entre 10 y 15 falsas. Diez sospechas concretas. Control:
> la 43 tiene que aparecer cerrada en todos los documentos que la nombran. Si el total de falsas da
> cero, el método está mal.

| | predicho | medido |
|---|---|---|
| afirmaciones verificadas | 60–80 | **~107** (la enumeración fue más ancha: se agregó `ESTADO-2026-09-01.md`, que el plan no listaba y es el documento más denso en estado) |
| falsas | 10–15 | **17** discretas + 2 documentos-foto con 14 afirmaciones vencidas |
| sospechas (1)–(8) | | **8 de 8 confirmadas** |
| sospecha (9) inventario "cero hexes" | | no aplicaba: ese doc es anterior al re-skin; lo que envejeció es todo el doc (§5) |
| sospecha (10) balance | | **no**: el balance está actualizado; su tabla omite la 43 porque ya estaba cerrada |
| control: la 43 cerrada en todo documento que la nombra | | ✅ DEUDAS, reskin-esquema, CLAUDE (criterio del disparador) |

Predije bien la clase y subestimé la cantidad, como en A1. Lo que no predije fue **la forma** de las
peores: no son afirmaciones que envejecieron solas, son **pares contradictorios en el mismo archivo**.

---

## 1 · Método

Enumerar antes de contar. Fuentes y qué se extrajo de cada una:

| documento | qué se enumeró | n |
|---|---|---|
| `CLAUDE.md` | tabla *Estado* (16 filas), inventario de R1 (9 puntos, ~14 afirmaciones), *Los dos hooks · Estado* (6), herencia (3) | ~39 |
| `DEUDAS.md` | 80 filas; se leyeron las 20 cuya vigencia depende de código o base (no las decisiones) | 20 |
| skill `nodo-design-system` §8 | 16 puntos + anexo de marca | 17 |
| `docs/reskin-inventario.md` | tablas 1, 2, 3 (53 testids) y 4 | 12 + 53 |
| `docs/balance-esquema-alta.md` | la tabla (10 filas) y la sección actualizada | 12 |
| `docs/ESTADO-2026-09-01.md` | la tabla "dónde estamos" y las tres listas | 12 |

Verificaciones ejecutadas (todas reproducibles): `grep -rn restaurant_id src/ tests/
supabase/functions/`; `ls .claude/skills`; `pnpm gen:rbac:check`; la lista de claves de
`permissions.ts` y **sus consumidores** (grep por clave en `src/` fuera del catálogo + `has_permission`
en migraciones); conteo de entradas y columnas de `COLUMNAS_DEL_ESQUEMA` en `sentry.test.ts`;
`pnpm lint`; `pnpm test:unit`; `information_schema.columns` de cinco tablas; `pg_policies` (de A2);
`git ls-remote --heads origin`; `supabase --version` global y pinneado; censo de hexes, `var(--`,
`monospace`, testids; existencia de archivos.

---

## 2 · `CLAUDE.md` — 10 falsas, y tres son contradicciones internas

| # | afirmación | dónde | verificado contra | veredicto · corrección |
|---|---|---|---|---|
| F1 | *"⛔ falta el catálogo propio (deuda 23): las 23 claves de `SYSTEM_ROLES` siguen siendo las de Vento (`cocina.*`, `mesas.*`, `delivery.*`)"* | Estado · Generador de RBAC | `grep -oE "'[a-z_]+\.[a-z_]+'" src/lib/permissions.ts \| sort -u` → **21 claves**, todas de Nodo (`pos.*`, `caja.*`, `fiado.*`, `compras.*`…); DEUDAS #23 *"✅ RESUELTA 2026-08-31, 21 claves"* | 🔴 **FALSA — y la fila del tripwire, dos renglones abajo, dice 21.** El mismo archivo afirma 23 claves de Vento y 21 de Nodo. Corrección: la celda pasa a *"catálogo propio, 21 claves (2026-08-31); queda la 23.1/23.2"* |
| F2 | *"Design system · ⛔ Pendiente"* | Estado | `.claude/skills/nodo-design-system/SKILL.md`, `src/tokens.css`, 9 primitivas en `src/components/ui/`, 8 de 11 pantallas en cero hexes | 🔴 **FALSA.** Capturado como skill el 2026-09-01; re-skin ejecutado el 09-01/02 |
| F3 | *"`settings.json` + hooks · Copiados y verificados en banco. ⛔ Falta correrlos en la máquina real."* | Estado, **segunda fila con el mismo nombre** | la primera fila del mismo nombre: *"corriendo en la máquina real (2026-08-31): disparó 3 veces"*; el ledger tiene 41 disparos hoy | 🔴 **FALSA por duplicación:** se agregó la fila nueva y no se borró la vieja. Corrección: borrar la segunda |
| F4 | *"⛔ Falta el tripwire `tests/roles.spec.ts` que clave el tamaño del catálogo"* | Los dos hooks · Estado | tabla Estado: *"Tripwire ✅ Puesto en `src/lib/permissions.test.ts`"*; `pnpm test:unit` 269/269; `tests/roles.spec.ts` existe y son 5 tests de UI de roles | 🔴 **FALSA — contradice la tabla del mismo archivo.** Corrección: quitar la línea |
| F5 | *"`register_sale_void` declara `was_fiado` y no lo manda"* | R1 punto 5b | `supabase/migrations/20260901120000_void_expone_was_fiado.sql`; `supabase-helpers.ts` línea 585 lo documenta | 🔴 **FALSA desde el 2026-09-01.** Corrección: *"corregido el 2026-09-01"* junto al `shift_open` |
| F6 | *"`register_purchase` manda `cash_movement_id` sin declararlo"* | R1 punto 5b | `RegisterPurchaseResult.cash_movement_id` (helpers línea 961, con nota) | 🔴 **FALSA desde el 2026-09-01.** Los tres ejemplos del punto 5b están hoy corregidos; el punto queda como método, con los tres en pasado |
| F7 | *"`src/types/database.types.ts` escrito a mano vs la BD real. El CLI de Vento da 403…"* | R1 punto 5 | `package.json`: `"db:types": "supabase gen types typescript --linked > src/types/database.types.ts"`; `useReports.ts`: *"el generador nuevo NO exporta Views"* | 🟡 **DESACTUALIZADA:** describe el problema de Vento como si fuera el de Nodo. Acá el archivo **se genera**. El contrato que queda es otro: *regenerado vs commiteado* (deuda 5) |
| F8 | *"Proyecto de Supabase · Verificar que el CLI no dé 403 antes de la primera migración"* | Estado | DEUDAS #2 *"RESUELTO 2026-08-31: responde, sin 403"*; 17 migraciones aplicadas | 🟡 **VENCIDA:** la instrucción se cumplió hace dos días y sigue como pendiente |
| F9 | *"También `docs/reglas-de-clase` en origin, viva hasta terminar de copiar"* | Estado · Origen de la copia | `git ls-remote --heads origin` → solo `develop` | 🔴 **FALSA como está escrita:** en el origin de Nodo esa rama no existe. Si se refería al origin de Vento, decirlo |
| F10 | *"`removeOrderItem` sí tiene llamador vivo en `TablesPage`"* | DEUDAS #24, citada desde la herencia | `src/pages/TablesPage.tsx` no existe (podado el 2026-09-01) | 🔴 **FALSA** (ver F11) |

**Lo que las tres contradicciones tienen en común (F1, F3, F4):** el estado nuevo se **agregó** y el
viejo **no se borró**. La tabla de Estado dice *"Actualizado: 2026-08-31"* y tiene filas de ese día
que ya eran contradictorias entre sí ese mismo día. Un documento que se edita por *append* acumula
pares verdadero/falso, y el lector que llega a la fila vieja **no tiene forma de saber que hay una
nueva**. Va a la bitácora como clase (§7).

Lo que **está bien** en `CLAUDE.md` y se verificó: `restaurant_id` → 0 en ejecutable; `gen:rbac:check`
exit 0; tripwire 269/269; ledger activo con `stats.json`; `subscription_status` CHECK; las tres
afirmaciones del punto 8 (enum `user_role` = `admin,cashier`, sí es enum); "no es monorepo";
`src/design-system.md` existe y sigue siendo el de Vento (la nota lo dice así).

---

## 3 · `DEUDAS.md` — 7 falsas entre las 20 verificables

| # | deuda | afirma | verificado contra | veredicto · corrección |
|---|---|---|---|---|
| F11 | **24** | *"`addOrderItems` inserta directo… La policy `order_items: staff crea` lo permite desde el cliente"* · *"`removeOrderItem` sí tiene llamador vivo en `TablesPage`"* | `pg_policies` (A2): `order_items` tiene **solo** la policy de SELECT; el INSERT directo devolvió `42501` en las 3 identidades. `TablesPage` no existe | 🔴 **FALSA en su núcleo:** el fail-open que describe **lo cerró el archivo 11**. Lo que queda es un helper exportado sin llamadores (`grep -rn "addOrderItems(" src/` → 0): **poda**, no seguridad. Re-alcance |
| F12 | **27** | *"Eliminar `purchase_invoices.payment_method`… ⛔ La columna es `not null` y el frontend la envía hoy"* | `information_schema.columns`: **no existe**; `20260831121100_compras.sql` línea 52: *"⚠️ SIN `payment_method`"*; `PurchaseInvoicePayload` no la lleva | 🔴 **FALSA — la columna nunca existió en el esquema de Nodo.** Se escribió contra el esquema heredado. **Resuelta por construcción**; marcar y conservar el hallazgo del noveno lado |
| F13 | **29.4** | *"`src/` en general: `restaurant_id` × 1.017 · marca heredada × 99… Criterio: los dos conteos llegan a cero"* | `grep -rn restaurant_id src/ tests/ supabase/functions/` → **0**; R1 punto 7 la da **CERRADA** (2026-09-01) | 🔴 **FALSA — sin marca de resuelta.** Y el criterio "a cero" es el que R1-7 corrigió a "por lista" |
| F14 | **29.6** | *"La tabla de 74 columnas describe el esquema de Vento. Cambian `orders` (sin `type`/`table_id`/`waiter_name`…)"* | `COLUMNAS_DEL_ESQUEMA`: **64 entradas**; `restaurant_id`/`waiter_name`/`table_id` → 0; `categoria`, `unit_cost`, `requiere_conciliacion`, `kind`, `cancel_reason` → presentes | 🔴 **FALSA: la tabla ya describe Nodo.** ⚠️ **Y le faltan `purchase_unit` y `units_per_purchase_unit`** (migración `unidad_de_compra`, 2026-09-01, aplicada por mí): **el contrato del punto 6 de R1 —"agregar una columna obliga a agregarla ahí en la misma sesión"— se violó esta semana.** Esta es la afirmación sobre nosotros. Corrección: las dos filas a la tabla; y la deuda pasa a *"mecanismo que lo detecte"* (deuda 5) |
| F15 | **34** | *"`pnpm lint` ya sale rojo por 5 errores preexistentes"* | `pnpm lint` → **0 errores, 5 warnings, exit 0**; ESTADO-01 ya decía *"lint 0"* | 🔴 **FALSA:** no sale rojo. Sale amarillo con exit 0, que es otro problema (un warning permanente también esconde) — pero no el que la deuda describe |
| F16 | **13** | *"Design system. Brief entregado… Al volver la Entrega 1, capturarla como skill `g-nexo-design-system`"* | la skill existe: `nodo-design-system` (el nombre `g-nexo` murió el 2026-08-31) | 🟡 **VENCIDA:** hecha el 2026-09-01 con otro nombre; queda abierta como si no |
| F17 | **23.1** | *"cuatro son reales para Nodo y hoy no protegen nada: `ventas.historial`, `productos.ver`, `reportes.financiero`/`stock`/`consolidado`"* | consumidores por clave: `ventas.historial` **2** en `src`, `reportes.financiero` **4**; `productos.ver`, `reportes.stock`, `reportes.consolidado` → **0 y 0** | 🟡 **PARCIALMENTE FALSA:** dos de las cinco ya gatean (UI). Siguen inertes **tres**: `productos.ver`, `reportes.stock`, `reportes.consolidado`. Además sin consumidor en `src` pero con `has_permission` en SQL: `caja.abrir`, `inventario.ajustar`, `pos.vender`, `usuarios.gestionar` (bien) |

Verificadas y **ciertas** (se listan para que nadie las re-audite por costumbre): **5** (no hay CI:
`.github/` no existe) · **22** (ledger + stats existen; 41 disparos hoy) · **30** (global 2.90.0,
pinneado 2.116.0 — coherente con lo que dice) · **33** (no hay flujo de dos fases) · **37** (badge y
toast consumen `requiere_conciliacion`; falta la vista) · **38** (la UI dice "turno") · **39** (P2
oculta la fila: A2 lo volvió a medir) · **40/41/46/47/48** (las columnas no existen: `customers` sin
`address`, `products` sin código/unidad, `orders` sin despacho, sin cupo, sin plazo) · **45**
(`cash_movements` sin subcategoría ni `pagado_a`) · **52** · **59** · **23.2**.

---

## 4 · Skill `nodo-design-system` §8 — 0 falsas, 1 discrepancia declarada

Los 16 puntos se verificaron. §8.2 (`--fs-*` no existen: `tokens.css` solo los nombra en un
comentario ✓) · §8.3 (los dos hexes on-dark `#34d399`/`#f87171` siguen en `CloseShiftModal` 409 ✓) ·
§8.7 (21 claves, admin 21, cajero 8 ✓) · §8.8 (toasts con tokens en `App.tsx`, patrón sin diseñar ✓)
· §8.14 abierta ✓ · §8.15 cerrada, modal ✓ · §8.16 cinco medios ✓ · 3-bis (los dos hexes de series
en `ReportsPage` ✓).

🟢 **Una discrepancia, y está declarada donde corresponde:** el anexo de marca dice `--brand: #111114`
(Muscle Pro) y `tokens.css` tiene `--brand: #0f172a` con el comentario *"= `--ink` mientras el tenant
no la inyecte"*. Dos documentos, dos valores, **y el código dice por qué**. No es falsa; es una
decisión escrita en el lugar correcto. Se anota para que el día de la capa por tenant nadie la
descubra como bug.

---

## 5 · Los documentos-foto: `reskin-inventario.md` y `ESTADO-2026-09-01.md`

Los dos están **fechados** (2026-09-01) y dicen que caducan. Según la convención de este repo, una
afirmación de estado fechada es historia honesta. **El problema no es que envejecieron: es que
ninguno dice que fue superado, y los dos están en `docs/` al lado de los vigentes.** El plan de A5
mismo cita `reskin-inventario.md` como fuente a verificar, como si describiera el presente.

| documento | afirmaciones que hoy son falsas leídas en presente | medido |
|---|---|---|
| `reskin-inventario.md` | `var(--…)` = **0** · Inter **no cargada** · Button/Badge/MoneyCell/Input/… **no existen** · KpiCard **dos versiones** · `monospace` **24 archivos** · hexes **1.763** · suite **164/0** · Historial/Turnos/Config **no están en la skill** | `var(--` **1.665** · Inter self-hosted · 9 primitivas · KpiCard unificada · `monospace` **7** · hexes **274** · **189** tests · skill §5 los ubica |
| ídem, tabla 3 (la red de testids) | *"completa, NO cambia"* — 53 testids estáticos | **52 de 53 existen**; `stock-adjust` es hoy `stock-adjust-modal` (el doc lo listaba como prefijo `stock-adjust`/`adjust-*`: ambiguo, no falso) |
| `ESTADO-2026-09-01.md` | *"15 migraciones aplicadas"* · *"164 pasan · 0 fallan"* · *"Inventario como pantalla: verificar"* · *"pendiente capturar como skill `nodo-design-system`"* · *"Cupo: verificar si existe"* · *"el frontend que corre hoy es el de Vento"* | **17** migraciones · última corrida completa 171/0/18, y hoy la base de A4 dio 5 rojos por acoplamiento · la pantalla existe · la skill existe · el cupo no existe (deuda 40) · el frontend es el de Nodo (re-skin) |

**Corrección propuesta, y es una línea por archivo:** un encabezado *"⚠️ FOTO del 2026-09-01. Superado
por: skill §5, `docs/auditorias/A*`, `DEUDAS.md`. No describe el presente."* La alternativa —moverlos a
`docs/historico/`— también sirve; lo que no sirve es que un `grep` en `docs/` los devuelva como iguales.

---

## 6 · `balance-esquema-alta.md` — consistente

La tabla (40–51 sin 43) coincide con `DEUDAS.md` fila por fila; la sección *"Lo que la tabla sugiere"*
se actualizó el 2026-09-02 con 53 y 54. La única afirmación que envejeció es de matiz: la 49 figura
como *"Decisión de producto + RPC"* y la decisión ya se tomó (`propuesta-49-devolucion.md`, aprobada);
queda la RPC. 🟢

---

## 7 · Lo que esto dice del método — y va a la bitácora

1. **Las peores falsas no envejecieron: nacieron falsas.** F1, F3 y F4 son pares contradictorios
   escritos con horas de diferencia en el mismo archivo. La causa es mecánica: **editar por append**.
   Se agrega la fila del estado nuevo y la vieja queda, porque borrar exige releer y agregar no.
   Corolario: *al escribir una afirmación de estado, buscar la anterior sobre el mismo objeto y
   borrarla o marcarla*. Un `grep` del nombre del objeto en el mismo archivo, antes de guardar.
2. **El contrato de R1 punto 6 se violó esta semana, con la 43.** La tabla de columnas de
   `sentry.test.ts` no tiene `purchase_unit` ni `units_per_purchase_unit`. La regla estaba escrita, era
   mía, y la migración la aplicó la misma sesión que la leyó. Es el argumento de la deuda 5 con un caso
   propio: **un contrato que depende de que alguien se acuerde no es un contrato** — es la misma frase
   de la deuda 65, aplicada a documentación.
3. **Siete deudas describen un mundo que ya cambió** (F11–F17), y cuatro de ellas cambiaron por
   trabajo de estas mismas sesiones (24 por el archivo 11, 27 por el esquema base, 29.4 por el
   renombre, 13 por la skill). **Cerrar una deuda no es hacer el trabajo: es volver a la fila.** La
   fila no se vuelve sola.
4. **Los documentos-foto necesitan una marca de superación**, no solo una fecha. La fecha dice cuándo
   se escribió; no dice que dejó de ser cierto.
5. El control funcionó al revés que en A3: la 43 apareció cerrada en todas partes. Un control que
   pasa también informa — dice que **las cosas que se cierran con ceremonia (migración + spec +
   BITÁCORA) sí se propagan**; las que se cierran de paso (24, 27, 29.4) no.

---

## 8 · Lo que esta auditoría NO cubre

- `BITACORA.md` entera: son ~2.100 líneas de estado por diseño, y se audita por muestreo cuando una
  regla se discute. A3 ya encontró una falsa (el sobrante) por accidente; una auditoría sistemática de
  la bitácora es otra auditoría.
- Las 60 filas de `DEUDAS.md` que son decisiones o ideas pospuestas: no son verificables contra
  código.
- Los comentarios dentro del código que afirman estado (*"esto no existe en esta app"* — el caso del
  keyframe). Es la clase de R4-build, y no se enumeró.
- `docs/RUNBOOK-arranque.md`, `docs/e2e-que-falta.md`, `docs/plan-esquema-base.md`, los briefs de
  diseño: el plan no los listó; probablemente tienen la misma proporción.

---

## Apéndice · las 17, en una lista para aplicarlas

| # | archivo | acción |
|---|---|---|
| F1 | CLAUDE Estado | celda RBAC: catálogo propio 21 claves; quedan 23.1 (tres inertes) y 23.2 |
| F2 | CLAUDE Estado | Design system: skill + tokens + re-skin, fechado |
| F3 | CLAUDE Estado | borrar la segunda fila de hooks |
| F4 | CLAUDE hooks | borrar "falta el tripwire roles.spec" |
| F5, F6 | CLAUDE R1 5b | los tres ejemplos en pasado, con fecha |
| F7 | CLAUDE R1 5 | "en Nodo se genera (`db:types`); el contrato es regenerado vs commiteado" |
| F8 | CLAUDE Estado | Supabase: CLI verificado, 17 migraciones |
| F9 | CLAUDE Estado | precisar de qué origin es `reglas-de-clase`, o quitar |
| F10, F11 | DEUDAS 24 | re-alcance: helper muerto, poda; la policy ya cierra |
| F12 | DEUDAS 27 | resuelta por construcción; conservar la nota del noveno lado |
| F13 | DEUDAS 29.4 | ✅ cerrada 2026-09-01, criterio por lista |
| F14 | DEUDAS 29.6 + `sentry.test.ts` | la tabla describe Nodo; **agregar `purchase_unit`, `units_per_purchase_unit`**; la deuda pasa a mecanismo |
| F15 | DEUDAS 34 | 0 errores, 5 warnings; si se quiere rojo, `--max-warnings 0` |
| F16 | DEUDAS 13 | ✅ capturada 2026-09-01 como `nodo-design-system` |
| F17 | DEUDAS 23.1 | la lista de inertes pasa a tres |
| — | `reskin-inventario.md`, `ESTADO-2026-09-01.md` | encabezado de superación |
