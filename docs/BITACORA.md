# Nodo — Bitácora

**Cuándo se lee:** cuando una regla de `CLAUDE.md` te parezca discutible, o necesites el contexto
de una decisión. **No** antes de trabajar — para eso está `CLAUDE.md`.

Acá vive la **evidencia medida** de cada regla y el detalle de cada fase y sesión. La separación
existe porque en Vento se auditaron 36 afirmaciones verificables del documento único: 28 eran
correctas y **las 8 falsas eran todas de estado**, ninguna de regla. El registro es la parte que se
pudre, y estaba mezclado con lo que hay que leer siempre.

Convención de escritura: la misma de `CLAUDE.md` → *"Cómo se escribe una nota"*. Citar el símbolo,
no el número de línea. Toda afirmación de estado va fechada. Mejor que fechar: decir el comando que
la consulta.

---

## ⛔ Hueco — evidencia de las once reglas heredadas

**Pendiente de decisión y de copia.**

Las once reglas (R0–R10) se copiaron literales de Vento el 2026-08-31, pero **su evidencia no**.
Hoy el `CLAUDE.md` de Nodo apunta a `docs/BITACORA.md` del repo de Vento (rama `develop`,
`d848852`; también existe `docs/reglas-de-clase` en origin, viva hasta que Nodo termine de
copiar).

**Eso es una referencia cruzada entre repos y se va a pudrir.** La bitácora de Vento tiene 1.560
líneas, va a seguir creciendo y sus títulos van a cambiar. Es el problema de "citá el símbolo, no
el número de línea", a escala de repositorio.

**Recomendación:** copiar acá, **congelada y atribuida**, la evidencia de las once reglas. Y **no**
copiar el registro de fases y sesiones de Vento. El corte: la evidencia que sostiene una regla
viaja con la regla; la historia de sesiones de otro producto, no.

Secciones a traer, según los punteros del `CLAUDE.md`:

| Regla | Sección en la bitácora de Vento |
|---|---|
| R1 | *"FASE 1 — estado de suscripción"* (el aviso a Centro) |
| R2 | *"Filtros de privacidad: ALLOWLIST por clave, nunca deny-list"* |
| R3 | *"Un defecto de CLASE se barre en toda la suite, no solo donde estalló"* |
| R4 · R9 | *"Trampas de TERMINAL — el síntoma no señala la causa"* |
| R6 | grepear `enforce_profile_organization` |
| R7 | *"Detalle Vale descuento / ruletazo"* (grepear `getVouchersTotal`) |
| R8 | *"ANTE UN FALLO: LEER LOS ARTEFACTOS ANTES DE RE-CORRER"* |
| R10 | *"Auditar una suite por MUTACIÓN, no leyéndola"* |
| R? | caso #13 (la garantía falsa donde se decide) |

---

## 2026-08-31 · Fork desde Vento

Primera sesión. No hay código todavía.

### Medido

**Pipe-test del hook `sql-checklist.mjs`, 10 casos.** Copiado de Vento, con el estado de ese repo
reemplazado por el de Nodo. Verificación en banco (Node v22, no la máquina de trabajo):

| Caso | Esperado | Resultado |
|---|---|---|
| Write sobre `supabase/*.sql` | dispara | 811 bytes |
| Edit sobre `supabase/*.sql` | dispara | 811 bytes |
| Bash con heredoc sobre `supabase/*.sql` | dispara | 811 bytes |
| Ruta Windows `c:\...\supabase\x.sql` | dispara | 811 bytes |
| `update roles set permissions` en un `.txt` fuera de `supabase/` | dispara | 2597 bytes |
| `SYSTEM_ROLES` en `src/lib/permissions.ts` | dispara | 2597 bytes |
| Bash sin SQL | calla | 0 bytes |
| `.claude/settings.json` | calla | 0 bytes |
| Payload vacío | calla | 0 bytes |
| Un `.tsx` cualquiera | calla | 0 bytes |

`node --check` limpio · sin bytes de control · ningún `require` fuera de comentarios ·
`settings.json` válido con el matcher `Write|Edit|Bash`.

✅ **Ya no falta: corre en la máquina real.** Ver *"El hook corre en la máquina real"* más abajo, en
los hallazgos de esta misma sesión. Se conserva esta línea porque la advertencia sigue siendo
cierta como razón: en Vento este script salió mudo la primera vez y
leyéndolo se veía perfecto. Verificación en banco no es verificación en el entorno (R4).

### Línea base del repo copiado

*Pasos 1 y 2 del runbook, ejecutados a mano el 2026-08-31. Repo en `develop`, base copiada de
Vento `d848852`. Para reconfirmar cualquier fila, los comandos del **paso 3** de
`docs/RUNBOOK-arranque.md`.*

| Qué | Medido | Diagnóstico | Δ |
|---|---|---|---|
| archivos en `src` + `supabase` + `tests` | 187 | 179 | +4,5% |
| líneas totales | 40.272 | 39.351 | +2,3% |
| ocurrencias de `restaurant_id` | 1.017 | ~1.010 | +0,7% |
| archivos con `shift` | 37 ⚠️ **conteo contaminado** | — | — |
| archivos con `kitchen` | 19 | — | — |
| ocurrencias de `add_order_items_with_extras` | 17 | — | — |

**La desviación está explicada, no es sorpresa.** `d848852` es posterior al diagnóstico e incluye
el generador de RBAC. Verificado: `supabase/seed-system-roles.sql` y `scripts/gen-rbac-sql.mjs`
existen, y `node scripts/gen-rbac-sql.mjs --check` da **exit 0**. El criterio del paso 3 —el
conteo de `restaurant_id` "cerca de 1.010"— se cumple, así que el diagnóstico sigue vigente y la
poda arranca sobre terreno conocido.

Estos números son la **referencia contra la que se mide la poda**. No se vuelven a tomar para
citarlos: se vuelven a tomar para compararlos.

### Hallazgos

**El índice de reglas del documento de traspaso estaba mal en cuatro de diez entradas.** Se detectó
al comparar contra el `CLAUDE.md` real de Vento, antes de escribir nada:

- Decía "las 10 reglas". Son **once** (R0–R10).
- *"No afirmar sin medir"* no es una regla numerada; es la convención de "Cómo se escribe una nota".
- *"Aprendizajes de proyectos hermanos"* es una sección, no una regla.
- *"Idempotencia en operaciones de dinero"* **no existe**: cero ocurrencias en el archivo. R7 es
  límites de día sobre timestamps UTC.
- Faltaban cuatro reglas reales: **R0**, **R3**, **R5** y **R7**.

Si las reglas se hubieran redactado desde ese índice, Nodo nacía con una regla inventada sobre
idempotencia y sin R3 — justo la que explica por qué un arreglo no llega solo a sus hermanas.
**Es la novena afirmación de estado falsa, y también era de estado.** La decisión de exigir copia
literal en vez de redactar desde el índice es lo que lo evitó (R4: no verificar contra un proxy).

**La nota falsa del monorepo sigue sin corregirse en Vento.** Su `CLAUDE.md` declara `apps/pos`,
`apps/store`, `apps/mobile`, `packages/shared` y `pnpm workspaces`. El diagnóstico ya determinó
que nada de eso existe. Anotado acá porque Nodo hereda de ese archivo y la afirmación pudo haber
viajado. **Acción abierta en Vento.**

**El conteo de errores repetidos no cierra entre documentos:** el traspaso dice 9, el `CLAUDE.md`
de Vento dice 11, el cierre dice 13 y numera los casos #11 a #14. Los tres son incompatibles.
Sin resolver — ver `docs/DEUDAS.md`.

**El conteo de `shift` está contaminado por `Array.prototype.shift()`.** 37 archivos es la palabra,
no el módulo. Al podar turnos hay que contar por **símbolo real** —`shift_id`, `isShiftOpen`,
`shifts`—, no por la cadena. Es R4 en su forma más barata: el proxy no es la cosa. Si la poda se
planifica sobre 37, se dimensiona mal un trabajo que además tiene la dependencia estructural de
cartera colgando (`debt_payments.cash_movement_id`).

**El hook sobrevive al checkout con `core.autocrlf=true` en Windows.** Verificado en un clon
limpio: `node --check` OK, **811 bytes** en los casos que deben disparar y **0** en los que deben
callar. Esto cierra el límite de R4 sobre artefactos generados —"el archivo que acabás de escribir
no es el que git materializa"— porque la prueba se corrió **después de un checkout**, no en la
sesión que escribió el archivo. El commit `chore: forzar LF en los hooks` es lo que lo sostiene.

**El remote quedó apuntando a Vento por error y no se subió nada.** `git remote add` **falla en
vez de sobrescribir**, así que el push nunca salió. Es fail-closed (R2) operando en un lugar donde
nadie lo estaba buscando: si el comando hubiera sido idempotente y "amable", la historia nueva de
Nodo terminaba empujada contra el repo del producto hermano. Vale anotarlo como precedente
positivo de la clase, no solo como anécdota.

**`scripts/gen-rbac-sql.mjs` arma la ruta de `tsc` a mano** (`node_modules/typescript/bin/tsc`) en
vez de resolver el binario y verificar que existe. Frágil con pnpm —que no aplana
`node_modules`— y en CI. Es **el mismo patrón que el `jq` del hook** (R4): copiar un camino que
funciona en una máquina y asumir que existe en todas. Pasa a deuda.

**El directorio temporal de ese script todavía se llama `vento-rbac-*`.** No es una instancia
suelta: es **cadena de marca heredada**, y la pregunta correcta (R3) es "¿tiene hermanas?" en todo
el repo —`vento`, `Vento`, `Vento`—, no "¿arreglo esta línea?". Pasa a deuda, y se ejecuta
junto con el rename de `restaurant_id` para no hacer dos pasadas sobre los mismos archivos.

**El hook corre en la máquina real — y la prueba fue accidental.** No hizo falta un test: durante
la sesión de documentación del 2026-08-31 el hook **disparó 3 veces**, inyectando su texto en el
contexto. Eso cierra la deuda #1 con evidencia más fuerte que el pipe-test, porque prueba la
**cadena entera** —`settings.json` leído por el harness, matcher `Write|Edit|Bash` activo, Node
encontrado, script no mudo—, y el eslabón que falló en Vento era justamente ese: en un pipe-test
el script lo invocás vos; acá lo invoca el harness. Un mecanismo se verifica en el camino por el
que va a correr, no en uno parecido (R4).

**Pero las 3 veces fueron falsos positivos, y eso es un hallazgo aparte.** Ninguna sesión escribió
SQL: alcanzó con **nombrar** `supabase/*.sql` en prosa dentro de un comando. El matcheo por
contenido está haciendo lo que se le pidió; la pregunta abierta es cuánto ruido tolera el diseño
antes de entrenar a ignorarlo, que es la única forma en que este hook puede morir. **No se corrige
todavía** — ver deuda #22: la corrección obvia es enumerar excepciones, y eso es exactamente lo que
R2 prohíbe. Primero se mide.

### Decisiones

- **Nombre:** Nodo. Provisional hasta whois + SIC (clases 9 y 42). Se descartaron G-Ship
  (promete despacho, que no existe en el producto), G-Cenit (Cenit es la filial de logística de
  hidrocarburos de Ecopetrol), G-Surti (quemado por Surtimax/Surtimayorista) y G-Abasto (se
  inclina a alimentos, deja afuera ferretería y repuestos).
- **Numeración R0–R10 idéntica a la de Vento**, a propósito: las skills citan por número y
  renumerar rompería la referencia cruzada entre los dos productos.
- **El inventario de R1 sí se reescribe**, porque la propia regla lo marca como fechado y con su
  comando de reconfirmación. Es estado, no regla. Pasó de 4 contratos a 9.
- **No se adoptan subagentes por ahora.** Un agente se invoca cuando alguien se acuerda de
  invocarlo — la misma propiedad que hizo fallar a las skills y a los recordatorios. El esfuerzo
  va a checks de árbol en CI, que sí detectan omisiones. Reevaluar cuando aparezca una tarea que
  inunde el contexto (candidato: la auditoría por mutación de R10).

---

## 2026-08-31 · Inventario del SQL heredado y plan de esquema base

Segunda sesión. Produjo `docs/plan-esquema-base.md` (48 archivos, 9.280 líneas de `supabase/`
inventariadas y clasificadas). Acá van solo las **decisiones** y lo que **cambió de opinión**; el
inventario vive en ese documento.

### Decisiones

**🔴 1 · Los turnos de caja SE QUEDAN, renombrados a jornada/caja. El documento de traspaso decía
lo contrario, y se revirtió.**

El traspaso y el orden de poda de `CLAUDE.md` los ponían en la lista de lo que se borra, con la
nota *"cuidado con la FK de `debt_payments`"*. Al mirar el SQL, esa nota se quedaba corta en tres
puntos y cada uno solo agrava:

1. `cash_movements.shift_id` es **`not null` con `on delete cascade`**. La cadena real tiene dos
   saltos: `debt_payments.cash_movement_id → cash_movements → cash_shifts`. Borrar turnos
   **cascadea a los movimientos** y deja el `cash_movement_id` de los abonos en **null**. Los
   abonos sobreviven; su rastro de caja no. **No falla, no avisa.**
2. **Tres** RPC leen el turno abierto, no una: `register_sale_void`, `register_debt_payment` y
   `register_purchase`. La premisa heredada decía que fiado era el único módulo con dependencia
   estructural; es el único con **FK**, pero los tres tienen dependencia de **comportamiento** y
   los tres sobreviven en Nodo. Compras, además, es módulo del alcance firmado.
3. `payments` sigue sin `shift_id` — eso de la premisa **sí** era cierto. La premisa no era falsa;
   era **incompleta**, que es peor de detectar.

**El concepto cambia, no solo el nombre.** Un turno de bar es un cambio de mesero. Acá es **el
cierre de caja del día**. Por eso se renombra a jornada/caja: el mecanismo sirve, la palabra no.

**Por qué se anota como reversión y no como corrección silenciosa:** es la última línea de la
convención de notas —*si no podés verificar una afirmación, no la escribas como hecho*— aplicada
al revés. El traspaso afirmó un plan de poda sin haber medido las FK. Dejar el cambio sin registro
haría que dentro de tres meses alguien "descubra" que los turnos siguen ahí y proponga podarlos
otra vez. **Tercer caso del mismo patrón en dos sesiones:** `extras`, `waiter_performance` y ahora
turnos. Suena a bar, sostiene peso. Se está volviendo la regla, no la excepción.

**🔴 2 · El costo unitario congelado entra en `order_items` desde el día uno.**

Y la razón **no** es que ahora sea barato agregar la columna. Eso era mi argumento y estaba mal
enfocado: es un argumento de costo, y un costo se paga. El real es que **no se puede pagar
después**. Si la tabla nace sin la columna, las ventas ya registradas **no se pueden rellenar**:
el costo del producto al momento de vender es irrecuperable, y cualquier backfill sería un número
**inventado**. Las utilidades de ese período quedarían mal **para siempre**, con la forma de fallo
de R7: plausibles, estables, y equivocadas.

Es la diferencia entre una decisión cara y una **irreversible**. La primera se posterga; la
segunda, no. Ver R1 punto 8 y la deuda #18.

### Hallazgos

Los nueve del inventario están en `docs/plan-esquema-base.md` §3.3. Los dos que cambian cómo se
trabaja de acá en adelante:

**Ocho funciones están definidas en dos archivos cada una**, y hoy gana la que se aplica última.
Al consolidar, ese orden desaparece. Elegir mal no da error: da un `has_permission` que no
verifica `is_active`, o un `enforce_profile_organization` sin `SECURITY DEFINER` — el fallo de R6,
ya pagado una vez en Vento. Pasa a ser un **paso propio del prompt 3, antes de escribir el
esquema**, con diff escrito para cada par.

**Verificado contra el SQL, no contra la pista** (R4) — y las dos veces la pista se quedaba corta:

- `enforce_profile_organization`: la versión de `profiles-organization-invariant.sql` **no** es
  `SECURITY DEFINER`; la de `fix-enforce-profile-organization-definer.sql` sí, **y además agrega
  los `revoke execute`**. ⚠️ Trampa real: el primer archivo **sí contiene** un `security definer`,
  pero pertenece a `handle_new_user`, otra función del mismo archivo. Grepear el modificador sin
  mirar de quién es habría dado la respuesta contraria.
- `has_permission`: la v2 agrega **dos** cosas, no una. `p.is_active`, sí — y también
  `r.permissions ? '*'`. Con la v1, un owner cuyo rol tiene el comodín `'*'` **se queda sin
  permisos**. Elegir por "la que verifica `is_active`" acierta por la razón incompleta.

### Nota de terreno — disparos del hook

Esta sesión escribió cero SQL y el hook disparó del orden de 20 veces, todas falsos positivos.
⚠️ **El conteo es aproximado a propósito de anotarlo así:** lo llevé a mano y perdí precisión a
mitad de sesión. Eso **es** el hallazgo — el instrumento de la deuda #22 no existe, y una tasa
medida a ojo no sirve para decidir sobre el hook.

✅ **Resuelto en la misma sesión: el hook ahora lleva el ledger solo** (`.claude/hook-ledger.jsonl`,
fuera de git). Dos cosas que quedaron dichas y no son obvias. **Una:** el `catch` que traga el
error del ledger **no** es el fail-open que R2 prohíbe —lo que se traga es el fallo del
instrumento, el checklist se emite igual, y el error sale por stderr en vez de callarse—; un
instrumento no puede tumbar lo que mide. **Dos:** registra **disparos, no invocaciones**, así que
da volumen y mezcla de clases pero **no una tasa**. Leer "12 disparos" como "12 de 12" sería el
mismo error de proxy que el ledger vino a evitar.

⚠️ **Y es la primera divergencia deliberada entre los hooks de los dos repos** (R1 punto 9).
Se aceptó con un criterio que conviene retener: **instrumentar puede divergir; corregir, no.**

**El denominador se agregó el mismo día**, después de que la objeción se escribiera sola: un ledger
de disparos sin invocaciones totales produce exactamente la garantía falsa que describe la regla
sin número — *"40 disparos"* leído como *"40 de 40"*, y en el lugar donde se decide. Se hizo como
**contador agregado** (`hook-ledger.stats.json`), no como una línea por invocación, para que el
archivo no crezca sin control: detalle solo donde aporta, que son los disparos. ⚠️ El contador es
read-modify-write y **no es atómico**: `invocaciones` es un **piso**. Subestimar el denominador
**infla** la tasa de ruido, así que un número alto es real y uno bajo hay que desconfiarlo — el
sesgo queda declarado en el código, no descubierto seis meses después.

### 🔴 El modo de fallo nº1 del hook, observado en vivo

**Evidencia que no se va a volver a tener a pedido, así que se anota.** Verificando el ledger
escribí un caso de prueba con la ruta Windows mal escapada: una barra invertida seguida de `x`
dentro de un JSON no es un escape válido. El hook **no** se comió el payload roto ni siguió como si
nada: escribió `no pude parsear el payload del hook` por stderr y salió con código 1.

Es el **modo de fallo nº1 de su propio docblock, funcionando en vivo** —*"el script revienta →
RUIDOSO ✔"*— y el complemento exacto del bug que lo originó en Vento, donde un `catch` devolvía
la cadena vacía con exit 0 y el hook quedaba mudo, exitoso e invisible. Acá el contrato roto se
anunció. **La diferencia entre los dos comportamientos son tres líneas de diseño**, y ésta es la
primera vez que se la ve actuar contra un payload realmente malformado en vez de uno fabricado para
el test.

Dos cosas más, porque la primera se lee mejor cuando las otras no se esconden:

- **El fallo era de mi caso de prueba, no del hook.** Repetido con el JSON bien formado, la ruta
  Windows da 811 bytes.
- **La misma clase de error volvió a morder minutos después**, al escribir *esta misma nota*: el
  script que la insertaba llevaba esa barra invertida dentro de un literal de JavaScript y no
  compiló. También falló ruidoso y no dejó el archivo a medias. Es el argumento de R3 en pequeño:
  no era una instancia, era una **clase** —"secuencia de escape inválida en un literal"— y aparece
  en cualquier lenguaje que se le ponga adelante. Se evita no escribiendo el texto dentro de un
  literal: se escribe a un archivo y se inserta desde ahí.

---

## 2026-08-31 · Evidencia: por qué se invirtió la carga de la prueba en la poda

El orden de poda de `CLAUDE.md` decía **qué borrar**. Ahora dice: **no se borra salvo que se
demuestre que no sostiene nada**. Esto es la evidencia que hace la regla defendible, porque una
regla sin su historial se discute como opinión.

### El historial: 4 de 4 en contra

| # | Candidato a poda | Por qué parecía podable | Qué sostenía en realidad | Cómo terminó |
|---|---|---|---|---|
| 1 | **extras** | suena a bar (aderezos, toppings) | `add_order_items_with_extras` es el **único camino de alta de ítems** del repo y donde se descuenta stock | **se renombra** — borrarlo rompía vender |
| 2 | **`waiter_performance`** | "waiter" = mozo | une por `o.created_by` contra `profiles`: mide **usuarios**, no mozos. De mesas no tiene nada | **se renombra** a `user_performance` |
| 3 | **turnos** | turno = cambio de mesero | `cash_movements.shift_id` es `not null` con `on delete cascade`; **3 RPC** leen el turno abierto; borrarlos deja los abonos de cartera **sin rastro de caja, en silencio** | **se renombran** a jornada/caja |
| 4 | **recetas** (`product_components`) | Nodo no tiene recetas | es la relación "un producto que al moverse descuenta N de otro" — o sea **bulto→unidad**, que Nodo **sí** necesita: se compra por bulto, se vende por unidad | **se renombra** |

**Cuatro de cuatro.** En los cuatro casos la evidencia a favor de podar era **el nombre**, y en los
cuatro el nombre venía del vertical de origen mientras el mecanismo venía del problema — y el
problema es el mismo en un mostrador que en un bar.

### Por qué es sesgo y no racha

Una racha se corrige sola; un sesgo no. Éste es sesgo por dos razones:

1. **El fork heredó un sistema que funciona.** En un sistema que funciona, las piezas que sobran ya
   fueron borradas por quien lo mantenía. Lo que queda, sostiene algo. Lo único que no fue filtrado
   por el uso es **cómo se llaman las cosas**, porque un nombre desactualizado no rompe nada y por
   eso nadie lo arregla.
2. **El nombre es lo primero que se ve y lo único que no se verificó.** Es un proxy, y R4 dice
   exactamente qué hacer con un proxy: no confundirlo con la cosa. La poda por nombre es R4
   aplicada al revés — decidir por el rótulo en vez de por el dato.

**El costo asimétrico cierra el argumento.** Verificar de más cuesta un `grep` que vuelve vacío.
Borrar de más cuesta un flujo roto que aparece meses después, sin error, y que nadie asocia con la
poda — el perfil de R7 y de R3 juntos. Con costos así de desparejos, la carga de la prueba va del
lado del que borra.

### Lo que la regla NO dice

No dice "no borres nada". Dice que **el que borra muestra la enumeración** —FKs, funciones,
policies, triggers, vistas, imports, seeds y tests—. Un `grep` vacío es prueba válida y barata. Lo
que dejó de valer es *"esto suena a restaurante"*, que es la única evidencia que se usó las cuatro
veces que salió mal.

⚠️ **Falsable, como toda regla que valga:** si aparece un candidato donde la enumeración vuelve
vacía y el borrado sale limpio, este historial pasa a 4 de 5 y la regla sigue en pie — lo que la
tiraría abajo es que enumerar resulte **caro**, no que alguna vez dé permiso para borrar.

---

## 2026-08-31 · Límite del método: un plan no ve sus propios huecos hasta que se escribe

El plan de consolidación de `docs/plan-esquema-base.md` se hizo sobre un inventario completo de los
48 archivos, clasificados uno por uno. Aun así, **al escribir los archivos aparecieron dos defectos
que el plan no podía haber visto**, y los dos son de la misma familia.

**1 · El hueco de extras.** El plan asignó 12 archivos y `add_order_items_with_extras` a uno de
ellos, pero **ninguno contenía las tres tablas de extras** que esa RPC necesita. Se descubrió al
intentar escribirla: no antes.

**2 · El archivo 09 bloqueado por transitividad.** Los archivos 08 y 10 estaban bloqueados por una
decisión de negocio abierta. El 09 (cartera) **no** estaba bloqueado en el plan — pero
`register_debt_payment` escribe `cash_movements`, que vive en el 10. El bloqueo se propaga por una
dependencia que el plan sí había documentado (la cadena de dos saltos) sin sacar la consecuencia.

**Por qué es un límite del método y no un descuido.** Un plan de consolidación razona sobre
**pertenencia** —a qué archivo va cada cosa— y eso se puede hacer leyendo. Los dos defectos son de
**orden de dependencias**, y el orden solo se manifiesta cuando algo tiene que compilar contra lo
anterior. Es la misma distancia que R4 marca entre el proxy y la cosa: el plan es un proxy
excelente del esquema, y sigue sin ser el esquema.

**Consecuencia práctica, que es lo que hay que retener:** un plan de consolidación no se valida
leyéndolo de nuevo. Se valida escribiendo el primer archivo que dependa de otros tres. Cuando el
plan 3 tenga un sucesor, conviene ordenar los archivos por **profundidad de dependencia** y escribir
primero el más profundo, porque es el que revela los huecos más temprano y más barato.

⚠️ **No se anota como error del plan** — se anota porque el próximo plan va a tener huecos también,
y saberlo cambia cuándo se los busca, no si existen.

### El corolario que sí es accionable: la fecha límite es el primer `db push`

Todo lo que hoy está "pendiente" en estos archivos —enumeraciones sin hacer, columnas sin decidir,
el nombre de una tabla— tiene **una sola fecha límite, y es el primer `supabase db push`**. Hasta
ahí son archivos y editarlos es gratis. Después son migraciones aplicadas y R5 manda: lo que
falte se arregla con una migración nueva, no editando.

Esto **no se agrega al texto de R5** a propósito. La numeración y la redacción de las once reglas
son idénticas a las de Vento porque las skills citan por número (ver R1); tocar el cuerpo de R5
acá crearía un contrato divergente, que es exactamente el criterio con el que se acepto la
divergencia del ledger: **instrumentar puede divergir; el texto de la regla, no.** El corolario
vive acá y en `docs/plan-esquema-base.md`.

---

## 2026-08-31 · El inventario de R1 tenía un dato falso — y eso confirma la tesis

`R1 punto 3` decía **"Enum `subscription_status`"**. Al escribir el archivo `02b` se leyó el SQL:
es `text` con `CHECK`. Nunca fue un enum.

**Por qué se anota como hallazgo y no solo como corrección.** R1 es *la regla que existe para que
los contratos compartidos no se pudran*, y su propio inventario se había podrido. Pero mirando de
cerca, **la regla no falló: falló su inventario** — y el inventario es lo que R1 misma marca como
**estado**, con su comando de reconfirmación al lado, justamente porque caduca.

Es la confirmación de la tesis que ordena estos tres archivos —*"de 36 afirmaciones auditadas, las
8 falsas eran todas de ESTADO"*— **ocurriendo dentro del mecanismo que la enuncia**. El mecanismo
se aplica a sí mismo y da el mismo resultado: lo que se pudre es el estado, no la regla.

**El error importaba, no era trivial.** La asimetría enum/CHECK es exactamente la que decide si
sumar un estado es barato o caro, y esa asimetría se aplicó **tres veces** en el esquema base
(`user_role`, `discount_kind`, `cash_movements.categoria`) razonando desde la nota equivocada. Si
alguien hubiera planificado "bajar `subscription_status` de enum a CHECK", habría planificado un
trabajo que no existe.

⚠️ **Ironía útil:** la decisión de usar `CHECK` ya estaba tomada en Vento **y por nuestro mismo
argumento**, escrito en el archivo heredado: *"es una bandera compartida entre dos repos: ampliar
un CHECK es un drop/add trivial, ampliar un enum es ALTER TYPE"*. O sea que redescubrimos un
razonamiento que ya estaba, porque la nota de estado nos decía lo contrario del código.

### Un quinto lado que no estaba contado

El inventario decía "6 lados". Enumerando los de **este repo** aparece uno que no figuraba:

**`src/types/database.types.ts` tipa `subscription_status` como `string`**, no como una unión de
los cinco valores. O sea que **`tsc` NO atrapa un valor inválido**: `subscription_status: 'activo'`
compila igual y revienta recién contra el `CHECK`, en runtime, en producción.

Es un lado **débil pero real**: participa del contrato y no lo protege. Y encaja con R1 punto 5
—`database.types.ts` escrito a mano diverge del esquema sin que `tsc` lo note—: acá no diverge,
simplemente **no dice nada**, que a los efectos del contrato es lo mismo.

---

## 2026-08-31 · El contrato de variables de entorno estaba roto ANTES de tocarlo

Al renombrar la marca heredada aparecio que **el codigo leia `VITE_VENTO_SUPABASE_URL` mientras
`CLAUDE.md` y `.env.example` declaraban `VITE_NODO_SUPABASE_URL`**. Un `.env` escrito siguiendo la
documentacion no conectaba con nada.

**No lo introdujo el renombre: ya estaba, desde que se escribio el documento.** Cinco dias con dos
archivos declarando una cosa y el codigo leyendo otra, y nadie lo noto.

### Por que es la clase peor, segun la propia convencion

*"Una nota que dirige mal cuesta mas que una ausente. Si no podes verificar una afirmacion, no la
escribas como hecho."* La seccion de variables de entorno de `CLAUDE.md` no describia el estado del
repo: describia **la intencion** de quien lo escribio. Las dos se ven identicas en el papel y solo
se distinguen ejecutando.

⚠️ **Y el agravante que hace de esto un caso y no una anecdota: NO habia una sola fuente
equivocada, habia dos de acuerdo entre si.** `CLAUDE.md` y `.env.example` decian ambos `NODO`. Dos
lados coincidiendo se lee como confirmacion — pero los dos eran documentos, y **ningun documento
ejecuta**. La coincidencia entre dos declaraciones no es evidencia: es la misma afirmacion escrita
dos veces.

### Lo que lo destapo no fue leer

Se encontro **intentando ejecutar contra el documento**, no revisandolo. El documento se leyo
muchas veces en estos dias —para escribir el esquema, para citar R1, para el runbook— y sobrevivio
intacto cada vez, porque **leer una declaracion falsa la confirma**. Lo que la rompio fue enumerar
que variables consume el codigo y compararlas con las declaradas: un `grep` de dos lados.

Es R4 con una vuelta mas: el proxy no era un test ni un tipo, era **la documentacion del propio
repo**, escrita por nosotros y por eso especialmente creible.

### Un tercer lado, que sigue roto y falla CALLADO

La misma enumeracion mostro que el desajuste no era uno sino **tres**, y el tercero no lo arregla
este renombre:

| Declara `.env.example` | Lee el codigo |
|---|---|
| `VITE_NODO_SUPABASE_URL` | ✅ ahora `VITE_NODO_SUPABASE_URL` |
| `VITE_NODO_SUPABASE_ANON_KEY` | ✅ ahora `VITE_NODO_SUPABASE_ANON_KEY` |
| `VITE_NODO_SENTRY_DSN` | 🔴 `VITE_SENTRY_DSN` — **nunca van a coincidir** |

Y el modo de fallo de ese tercero es peor que el de los otros dos: si el DSN no llega, **Sentry
simplemente no inicializa**. No hay error, no hay pantalla rota — hay ausencia de reportes, que se
descubre el dia que hace falta un error que no esta. Los otros dos fallaban ruidoso (la app no
conecta); este falla en silencio.

⛔ Sin decidir: el codigo usa `VITE_SENTRY_DSN`, `VITE_SENTRY_RELEASE` y `VITE_SENTRY_ENVIRONMENT`
—consistente entre si, sin prefijo de producto—, y `.env.example` declara **solo** el DSN y con
prefijo. Alinear el example al codigo es una linea; alinear el codigo al example son tres. Va a
deudas.

### La verificacion que se hizo, y lo que NO prueba

`tsc --noEmit` dio exit 0 antes y despues de cada pasada del renombre, leyendo el codigo **dentro**
del archivo de salida y no de una tuberia (R9).

⚠️ **Pero eso prueba consistencia interna, no correspondencia.** `database.types.ts` se renombro en
la MISMA pasada que el codigo que lo consume, asi que src y tipos concuerdan **por construccion**:
tsc no podia dar otra cosa. Que coincidan con el esquema SQL nuevo es una afirmacion distinta, que
solo se verifica regenerando los tipos contra la base despues del `db push`.

Es R4 aplicada a la propia verificacion: **un verde que no podia haber salido rojo no es
evidencia.** Se anota porque es exactamente el matiz que se pierde cuando alguien lee "tsc verde"
en un commit dentro de seis meses.

---

## 2026-08-31 · La regex que ningún reemplazo podía encontrar

**El caso más caro de los que se cazaron a tiempo.**

`tests/global-setup.ts` verifica, antes de correr la suite E2E, que la app servida en el puerto sea
la nuestra y no otra corriendo ahí. Lo hacía así:

```ts
if (!/G-?Vento/i.test(html)) { /* aborta la suite entera */ }
```

Al renombrar la marca, `index.html` pasó a decir `Nodo`. **La regex siguió buscando `G-?Vento`.**
El health check habría **abortado la suite E2E completa**, y el mensaje habría dicho *"el servidor
NO es Nodo, ¿hay otra app en el puerto?"* — señalando un problema de infraestructura que no existía.

### Por qué ningún renombre lo tocó

**La cadena literal `G-Vento` NO ESTÁ EN EL ARCHIVO.** Lo que hay es `G-?Vento`: una regex con un
cuantificador opcional en el medio. Tres pasadas de reemplazo de marca —`G-Vento`→`G-Nexo`,
después `G-Nexo`→`Nodo`, más la de variables de entorno— pasaron por encima de ese archivo y
**ninguna lo vio**, porque todas buscan cadenas y ahí no hay una cadena: hay un patrón.

Es una forma nueva del mismo defecto: **el objeto no se llama como se lee.** Ya lo habíamos visto
con `ROLE_LABELS` —donde `waiter` era una CLAVE de un `Record` tipado, no la cadena `'waiter'`— y
con `product_components`, donde lo específico de bar estaba en los comentarios y no en los nombres.

### Cómo apareció

**Enumerando, no grepeando la marca.** El grep de `[Vv]ento` sobre `src/` y `tests/` devolvió 47
líneas, casi todas ruido (`inventario`, `evento`, `InventoryPage`). Al **leer la lista** en vez de
mirar el número, esta saltó: era la única que no era ruido y no era una mención legítima.

⚠️ **Si el criterio hubiera sido el conteo, no aparece.** 47 no dice nada; leer 47 líneas sí. Es
exactamente el argumento del corolario de verificación por lista, y este caso es su evidencia.

### Qué habría costado

La suite E2E aborta **antes del primer test**, con un mensaje que culpa al servidor. Alguien habría
buscado un conflicto de puertos, revisado el `dev server`, quizá reiniciado el Ubuntu. El defecto
está a dos líneas del mensaje de error y aun así lo habría mandado a mirar al lugar equivocado —
**el mismo perfil que R6**: un guard que rechaza señalando la causa que no es.

**Quinto caso del patrón "aparece al ejecutar/enumerar, no al planificar/leer".** Los anteriores:
el hueco de extras, el 09 bloqueado por transitividad, el `protect_organization_subscription`
perdido, y el orden de migraciones que no era ejecutable.


---

## 2026-08-31 · El tripwire del catálogo: por qué un conteo no era un tripwire

**Deuda #6 pagada, pero no como estaba escrita.** La deuda pedía literalmente *"un `toBe(N)` en
`tests/roles.spec.ts` que clave el tamaño"*. Se implementó otra cosa, y la razón vale más que el
test.

### El agujero del conteo, mostrado con el mutante

Un `toBe(21)` detecta **altas y bajas**. No detecta una **sustitución**: cambiar una clave por otra
deja el conteo en 21. Y una sustitución no es un caso raro — es exactamente la forma que toma el
cambio cuando alguien "arregla" un typo en el lugar equivocado.

Mutante 1: `ventas.anular` → `ventas.anualr` en `PERMISSION_GROUPS`. El catálogo sigue teniendo 21
claves. Con la lista fijada, el rojo dice:

```
Expected: "claves que DESAPARECIERON del catálogo: ninguna"
Received: "claves que DESAPARECIERON del catálogo: ventas.anular"
Expected: "claves NUEVAS que no están fijadas acá: ninguna"
Received: "claves NUEVAS que no están fijadas acá: ventas.anualr"
```

🔴 **Y acá está el dato que decide el diseño del mensaje.** La tercera aserción del mismo test
—`expect(ALL_PERMISSION_KEYS).toEqual(CATALOGO_FIJADO)`— sí se puso roja, pero imprimió esto:

```
AssertionError: expected [ Array(21) ] to deeply equal [ Array(21) ]
```

**Un rojo que dice "esperaba 21, recibí 21" es peor que no tener el test**: manda a mirar un
número que está bien. Por eso las aserciones se hacen sobre un **string construido con los
nombres** y no sobre el array: no es cosmética, es la diferencia entre un tripwire que dirige y uno
que confunde. Es la misma familia que R6 —un guard que rechaza señalando la causa que no es— y que
la regex de `global-setup`.

### Los otros dos mutantes, y el control negativo

| Mutante | Qué murió |
|---|---|
| `ventas.anular` → `ventas.anualr` (conteo intacto) | 3 aserciones, nombrando las dos claves |
| invertir el orden de `productos.ver` / `productos.editar` | **solo** la aserción de orden — el conjunto no cambió |
| `admin: ALL_PERMISSION_KEYS` → `[...ALL_PERMISSION_KEYS]` | la aserción de que `admin` es **derivado**, no una copia |

Control negativo: revertido, **7/7 verde**. Sin ese control el ejercicio no prueba nada (R4: antes
de creerle a un verde, preguntá cómo se vería el rojo).

### Dónde vive, y por qué no donde decía la deuda

En `src/lib/permissions.test.ts` (vitest), no en `tests/roles.spec.ts` (Playwright).

> **Un tripwire que necesita infraestructura para ponerse rojo no está puesto.**

El spec E2E exige servidor levantado y backend del lab disponible. El catálogo es un **dato del
repo**: comparar dos constantes no necesita navegador. En el spec quedó la mitad que sí lo
necesita —que la UI de Roles renderice una casilla por clave— y se le **quitó** el `toBe(23)`:
tener el número clavado en dos lados era exactamente R1.

---

## 2026-08-31 · Una CLASE nueva: el estado defectuoso que produce la misma señal que el sano

**Encontrado al poner el tripwire del catálogo, y es lo que le habría quitado todo el valor.**

`pnpm test:unit` salía **exit 1** y el resumen decía `Tests 256 passed (256)`. **Los dos datos eran
ciertos.** El archivo `src/hooks/useSubscriptionStatus.test.ts` **no fallaba: no se colectaba** —
`(0 test)`. Sus **24 tests no corrieron nunca en este repo**, y el resumen no los extraña porque
**no puede contar lo que no se cargó**.

| | antes | después |
|---|---|---|
| tests que el repo creía tener | **256** | **280** |
| archivos | 4 de 5 | 5 de 5 |
| exit | 1 | 0 |

**La diferencia son 24 tests que este repo creía tener.**

**La causa.** `resolveNotice` es una función pura, pero vive en un módulo que arrastra
`useAuth → AuthContext → src/lib/supabase`, y ese crea el cliente **en la carga del módulo**. Sin
`.env` presente eso tira `supabaseUrl is required` antes de que exista un solo test. No es una
particularidad de esta máquina: **en CI y en cualquier clon recién hecho no hay `.env`.**

Se mockeó el **cliente**, nunca la función bajo prueba: `vi.mock('@/lib/supabase')`.

### 🔴 La clase, que es lo que hay que retener: **INDISTINGUIBLE DE**

> **Un test que no corre es indistinguible de uno que pasa, si solo mirás el verde.**

No es un caso: es una **clase**, y ya van dos en este proyecto.

| Caso | Estado sano | Estado defectuoso | Señal de los dos |
|---|---|---|---|
| El suite unitario | el test corre y pasa | el archivo no se colecta | **no aparece en rojo** |
| `can(string)` — deuda 23.3 | la clave existe y está denegada | la clave **no existe** | **`false`** |

En los dos, lo que falla no es la falta de señal: es que **el estado malo emite exactamente la
señal del estado bueno**. Por eso no se detecta mirando más fuerte — mirar más fuerte devuelve lo
mismo—. Se detecta **cambiando qué se mira**: la línea `Test Files` en vez de la línea `Tests`; el
tipo de la clave en vez de su valor de retorno.

**Lo accionable, y es una pregunta sola:** ante un verde, preguntá **qué señal produciría el estado
defectuoso**. Si es la misma, no tenés una verificación: tenés una coincidencia. Es el corolario de
R4 —*una verificación que no podía haber salido mal no es una verificación*— aplicado al caso donde
**sí puede salir mal, pero sale igual**.

### Por qué esto era urgente y no un arreglo de paso

El tripwire del catálogo vive en ese mismo suite. **Un rojo permanente esconde a los rojos
nuevos**: si `pnpm test:unit` sale 1 siempre, el día que el catálogo cambie en silencio nadie va a
notar la diferencia.

### Relación con R9, y en qué se le escapa

Es la misma familia —**el resultado que te muestran no es el que pensás**— pero **R9 no lo cubre**.
R9 habla de tuberías (`| tail` devuelve el exit de `tail`) y de notificaciones de tarea en segundo
plano: casos donde algo **intermedia** el resultado. Acá **no hay intermediario**: el runner reporta
con total fidelidad **sobre un conjunto que no incluye lo que vos creías que incluía**. El engaño no
está en el canal, está en el **denominador**.

⚠️ Y alcanzó con leer la línea equivocada del mismo resumen: `Tests 256 passed` en vez de
`Test Files 1 failed | 4 passed`.

### Enumeración en Vento — el mismo defecto, latente

Verificado **ejecutando**, no leyendo (2026-08-31, `develop` `d848852`):

| | Vento | Nodo (antes del arreglo) |
|---|---|---|
| Cadena de imports del test | idéntica (`useAuth → AuthContext → @/lib/supabase`, cliente en carga de módulo) | idéntica |
| `vi.mock` en el test | **no tiene** | no tenía |
| `.env` en la máquina | **existe** | **no existe** |
| `pnpm test:unit` | **285 passed, 4 archivos, exit 0** | 256 passed, 4 de 5 archivos, exit 1 |

**El defecto está en los dos repos.** En Vento no se manifiesta por una razón que no es del código:
**ahí hay un `.env`**. Es la definición de latente — el repo depende de un archivo que no está en
git para que su suite se colecte entera.

🔴 **Y la pregunta que abrió esto —"¿CI los estaba contando como pasando?"— tiene una respuesta que
no esperaba: NO HAY CI. En ninguno de los dos.** Enumerado: no hay `.github/`, ni `.gitlab-ci.yml`,
ni Husky; el único `vercel.json` de cada repo tiene **solo un rewrite de SPA**, y el build de Vercel
corre `vite build`, no la suite. Así que nadie estuvo reportando verde sobre un suite incompleto:
**nadie estuvo reportando nada.**

⚠️ **Eso no achica el hallazgo, lo mueve de lugar.** Deja de ser "CI miente" y pasa a ser una
**precondición de la deuda #5**: el día que se escriban los checks de árbol, el primero habría dado
verde sobre un suite al que le faltaba un archivo entero — y ese verde habría sido la evidencia
fundacional de que "los tests pasan".


---

## 2026-09-01 · Quinto caso de la poda, y la primera VARIANTE: lo que sostenía peso estaba en `tests/`

Los cuatro anteriores —turnos, extras, recetas, `waiter_performance`— tenían la misma forma: algo
**sonaba a bar**, y al enumerar resultó que sostenía peso **en el producto**. La regla se invirtió
por eso: no se borra salvo que se demuestre que no sostiene nada.

**El quinto es distinto, y por eso vale escribirlo aparte.** `TablesPage` **sí se poda** — esa parte
de la clasificación era correcta. Lo que sostiene peso es `tests/helpers/tables.ts`, 25 líneas, y
lo que sostiene son **tres specs de módulos que sobreviven**:

| Spec | Módulo | Llama a `openTableAndAddItems` |
|---|---|---|
| `fiado.spec.ts` | **cartera** | :321 |
| `pago-mixto.spec.ts` | **pagos** | :263 |
| `vale-descuento.spec.ts` | **descuentos** | :112 |

La mesa era **el camino más corto para dejar una venta armada**, así que specs que no tienen nada
que ver con mesas la usaban de fixture.

### Qué habría pasado

No es un error de compilación: `tsc` no ve un locator. Los tres specs habrían fallado **al correr**,
buscando un botón "Abrir mesa" que ya no existe, con un mensaje hablando de un selector — y el
diagnóstico habría empezado por "se rompió cartera", que es falso.

### 🔴 Lo que agrega a la checklist de poda

La checklist ya tiene la línea `seeds y tests → ¿quién la puebla?`. **Se lee corta.** Este caso dice
que va leída ancha:

> **¿Quién la usa para LLEGAR a otra cosa?**

Una pieza puede no tener **ningún** consumidor de producto y ser, aun así, el único camino por el
que otra cosa arma su estado inicial. La dependencia no está en un `import` de `src/`: está en un
`goto('/mesas')` dentro de un helper de tests.

⚠️ Y el corolario operativo, que ya estaba decidido antes de encontrarlo: el **fixture nuevo va en
el mismo commit** que borra la pantalla. Dejarlo para después deja la suite roja en el medio, y
*un rojo permanente esconde a los rojos nuevos* — la lección del día anterior, aplicada.


---

## 2026-09-01 · Tres greps buscaron el nombre del TIPO y no el de la COLUMNA

Al enumerar `order_type` para proponer el allowlist, apareció que **la columna no se llama así**:

```sql
-- el TIPO
create type public.order_type as enum ('dine_in', 'takeaway', 'delivery');
-- la COLUMNA
orders.type
```

**Tres greps de `order_type` seguidos** —en `src/`, en `tests/`, en `supabase/`— y ninguno estaba
encontrando la columna. Encontraban las **anotaciones de tipo** (`Enums<'order_type'>`), que existen
y se leen como si fueran la cosa. El único lugar donde el valor **se escribe** es
`POSPage.tsx:900`, y ahí dice `type: orderType` — sin la cadena `order_type` por ningún lado.

### La clase, que ya tiene un hermano

> **El grep encuentra lo que nombraste, no lo que buscabas.**

Es la misma familia que la regex de `tests/global-setup.ts`: allá el archivo decía `/G-?Vento/i` y
la cadena literal `G-Vento` **no estaba**, así que tres pasadas de reemplazo pasaron por encima sin
verla. Acá la cadena `order_type` **sí está** — pero designa **otra cosa** (el tipo, no la columna),
y por eso los resultados se leían como éxito.

Las dos variantes del mismo defecto:

| Variante | Qué pasa | Caso |
|---|---|---|
| El grep no encuentra nada y **parece que no hay nada** | el objeto está escrito de otra forma | `/G-?Vento/i` |
| El grep encuentra bastante y **parece que ya está** | lo que encontró es un homónimo | `order_type` vs `orders.type` |

⚠️ **La segunda es peor**, porque el resultado no vacío **cierra la búsqueda**. Un grep vacío al
menos incomoda; uno con 46 líneas se lee como trabajo terminado.

**Lo accionable:** cuando enumeres una columna, buscá **la escritura**, no el nombre —`insert`,
`update`, el objeto que se manda— porque ahí aparece el identificador real. Fue exactamente lo que
lo destapó: buscar dónde se ESCRIBE el valor, no dónde se NOMBRA.


---

## 2026-09-01 · Predecir el número ANTES de medirlo es lo que convierte un conteo en verificación

**El caso.** Al sacar tres columnas del catálogo de `sentry.test.ts`, `pnpm test:unit` pasó de
**280 a 269**. Antes de correrlo había predicho **−9**: tres columnas × tres bloques
`it.each(PROHIBIDAS)`.

Medido: **−11**. Los dos que sobraban obligaron a buscar, y ahí apareció un **cuarto** bloque que
la primera lectura no había visto:

```ts
it.each(PROHIBIDAS.filter((c) => typeof c.ejemplo === 'number'))(...)
```

De las tres columnas quitadas, **dos tenían ejemplo numérico** —`kitchen_pin` (1234) y
`estimated_delivery_minutes` (30)— y `delivery_address` no. **9 + 2 = 11.** Cierra.

### 🔴 Lo que vale no es la aritmética: es de dónde salió la pregunta

Los dos tests faltantes **no aparecieron leyendo el archivo**. Aparecieron al **comparar un número
medido contra un número esperado**. Si no hubiera predicho nada, `269 passed` se habría leído como
verde —lo era— y nadie habría tenido motivo para buscar.

> **Un conteo que no se predijo no es una verificación: es una observación.**
> Se vuelve verificación cuando existe un número esperado con el que pueda discrepar.

Es la clase **"indistinguible de"** funcionando en la dirección correcta, y por eso vale escribirla
como criterio y no como anécdota. Esa clase dice que un estado defectuoso puede emitir la misma
señal que el sano —un test que no corre se ve igual que uno que pasa—. **La predicción es el
mecanismo que rompe el empate**: la señal deja de ser "verde/rojo" y pasa a ser "coincide / no
coincide con lo que dije antes de mirar".

### Cómo se aplica, que es barato

Antes de correr una suite después de un cambio que agrega o quita casos: **escribí el número que
esperás y de dónde sale.** Si coincide, el verde vale. Si no, tenés una pregunta concreta —"¿de
dónde salen estos dos?"— en vez de una sensación.

⚠️ Y funciona en las dos direcciones. Medir **menos** de lo predicho es cobertura que se perdió sin
querer; medir **más** es un caso que no sabías que existía. Las dos son información, y las dos se
pierden si el único criterio es que el exit code sea 0.


---

## 2026-09-01 · El renombre `restaurant_id` → `sede_id`: el conteo previo cambió la tarea

**Conteo ANTES, por zona** — tomado antes de tocar nada, que es lo que hizo aparecer el hallazgo:

| Zona | Antes | Después | Qué es |
|---|---|---|---|
| `src/` | **0** | 0 | ya estaba en cero |
| `tests/` | **0** | 0 | ya estaba en cero |
| `supabase/functions/` | **6** | **0** | 🔴 código vivo y roto |
| `supabase/migrations/` | 2 | 2 | comentarios que nombran el nombre viejo |
| `supabase/_heredado/` | 610 | **610** | registro de procedencia, NO se toca |
| `docs/` + `CLAUDE.md` | 29 | 31 | menciones históricas (subieron: ahora se documenta el cierre) |

### El hallazgo: `src/` y `tests/` ya estaban en cero, sin una pasada de renombre

R1 punto 7 describía un trabajo de **1.010 ocurrencias en 77 archivos**. No quedaba ninguna. Se
fueron alineando solas al **escribir el esquema base** y al migrar los consumidores del grupo 29 —
o sea que el renombre nunca fue una tarea, fue una **consecuencia** de haber escrito el esquema con
el nombre correcto desde el principio.

⚠️ Y por eso el conteo previo valía: **la tarea que quedaba no era la que estaba planificada.**

### Lo caro estaba en la única zona que ningún verificador mira

`supabase/functions/create-user/index.ts` seguía exigiendo `restaurant_id`:

- `src` (helper + `useUsers`) manda **`sede_id`** ✅
- `tests/create-user.spec.ts` manda **`sede_id`** ✅
- la Edge Function **exigía `restaurant_id`** y devolvía `400 Faltan campos requeridos` ❌
- el trigger `handle_new_user` lee **`sede_id`** del `user_metadata` ✅ y falla ruidoso si no está

**Crear un usuario estaba roto de punta a punta.** Y nadie lo veía: una Edge Function corre en Deno,
**fuera de `tsc` y de ESLint**, y el cuerpo de la llamada es un objeto que ningún compilador cruza
entre emisor y receptor. Es el cuarto caso del corolario de los strings, escrito esta misma sesión.

🔴 **Dos defectos más en el mismo archivo, del mismo tipo:** la allowlist de roles aceptaba
`'waiter'`, valor que el enum `user_role` ya no tiene — habría pasado la validación y reventado
después, en el trigger. Y `tests/create-user.spec.ts` resolvía el rol RBAC por
`.eq('name', 'mozo').single()`: **`.single()` sobre cero filas tira**, así que el `beforeAll`
reventaba y con él **el archivo entero**.

### El criterio "el conteo llega a cero" era inalcanzable

Igual que en la verificación de marca: `supabase/_heredado/` tiene **610 ocurrencias** y no se
tocan —renombrarlas haría que un archivo archivado describiera un esquema que nunca tuvo—, y las de
`docs/` son históricas. **Cero es imposible por construcción, así que como criterio miente
siempre.**

**El criterio quedó por LISTA:** cero en el código **ejecutable** (`src/`, `tests/`,
`supabase/functions/`) — ✅ cumplido — y todo lo demás enumerado como mención histórica legítima.
Segunda vez que un criterio de "conteo a cero" se cae por la misma razón; ya es la forma, no el caso.


---

## 2026-09-01 · R4 aplicada al verificador: dos firmas mal, cazadas antes de ejecutar

Al escribir `supabase/verificar-rpcs.sql` —el script que ejecuta cada RPC contra la base— redacté
las llamadas **de memoria** y después las contrasté una por una contra `supabase/migrations/`.
El contraste encontró **dos errores**:

| Escribí | Es |
|---|---|
| `register_purchase(v_prov, 'VERIF-001', current_date, jsonb[...])` | `register_purchase(p_invoice jsonb, p_items jsonb)` — **dos** jsonb |
| `products.stock` | `products.stock_qty` |

### Por qué vale escribirlo: el diagnóstico que evitó

Si se hubieran ido así, el script habría fallado con **`function ... does not exist`** o
**`column ... does not exist`** — que son **exactamente los dos mensajes que el script existe para
detectar**. Su propia cabecera dice que esos dos significan "la migración creó una función rota".

**El verificador habría acusado al esquema de su propio defecto.** Y el diagnóstico habría arrancado
por revisar las migraciones —el lugar equivocado—, con toda la confianza que da un mensaje de error
específico. Mismo perfil que R6 y que la regex de `global-setup`: **un guard que rechaza señalando
la causa que no es.**

🔴 **Lo accionable, y es la regla en una línea: un verificador se verifica antes de correrlo.** No
alcanza con que su lógica sea correcta: sus **llamadas** son un contrato con otra cosa, y ese
contrato se comprueba contra la definición, no contra el recuerdo. Cuesta un `grep -A6 "function
public.<nombre>"`.

⚠️ Y quedó escrito **en el script**, no solo acá, el discriminador que hace usable el fallo:
`relation/column does not exist` → esquema roto; **cualquier otro error** → el script, o un guard
haciendo su trabajo.

---

## 2026-09-01 · R5 empieza a regir de verdad, y es la primera vez en el proyecto

Hasta hoy, **todo cambio de esquema fue editar un archivo**. Las 15 migraciones se escribieron,
se reordenaron, se les cambiaron nombres de columna y se les revirtieron decisiones —`orders.canal`
volvió después de estar documentado como "no viaja"— **sin violar nada**, porque nada estaba
aplicado. R5 estaba escrita y no mordía.

**Con el primer `db push`, eso terminó.** Desde ahora todo cambio de esquema es un archivo nuevo, y
la regla dejó de ser una advertencia para ser una restricción.

Se nota inmediatamente en cómo se resuelven los desajustes: al aparecer `suppliers.contact_name` vs
`suppliers.contact`, **la pregunta ya no es "cuál nombre me gusta más"** — es "cuál lado puedo
mover". La base está aplicada, así que **el que se mueve es `src`**. La decisión la tomó la regla,
no el gusto. (Y de paso el esquema tenía razón de fondo: `nit` es el documento tributario
colombiano, más preciso que `document`.)

⚠️ **Corolario práctico que conviene tener presente:** el costo de una decisión de esquema acaba de
subir de golpe. Las que se tomaron "porque el archivo estaba abierto" ya no son gratis.

---

## 2026-09-01 · Migrar un test entre dos UIs distintas cuela aserciones falsas

**Defecto propio, encontrado al podar el vale.**

En la sesión anterior migré el test `VENTA GRATIS` de la caja de Mesas al POS, con el argumento
—correcto— de que su sujeto era el **clamp del descuento**, no el flujo de dos fases. Pero moví la
aserción tal cual:

```ts
await expect(page.getByTestId('discount-amount')).toHaveValue('18.000')
```

**Eso es falso en el POS.** El input del POS renderiza `value={discount ? String(discount) : ''}`:
sin formato de miles y **sin clamp**. El clamp existe, pero en el CÁLCULO —
`discountAmt = Math.min(discount, subtotal)`— no en el campo. Tecleando 25000 el input muestra
`25000` y el total va a 0. La aserción venía de la caja de Mesas, que sí formateaba.

### La clase

> **Migrar un test entre dos UIs distintas conserva el SUJETO pero no las ASERCIONES.**

El corolario de la propiedad me dijo bien **qué** migrar; no dice **cómo**. Al mover un test de una
pantalla a otra, cada aserción sobre el DOM hay que re-derivarla de la pantalla nueva — las que
miran la **base** (`order.total`, `discount_amount`, `paymentCount`) sí viajan, porque el sujeto es
el mismo.

⚠️ **Y no lo cazó nada**, porque los E2E no se pueden correr acá: sin `.env` ni servidor. Apareció
**leyendo el código del input** mientras se podaba el vale — es decir, por casualidad. La lección no
es "leé más": es que **una migración de test entre pantallas es código nuevo y no verificado**, y
conviene marcarla como tal hasta que la suite corra.

---

## 2026-09-01 · La poda del vale, y el test que sostenía peso (otra vez en `tests/`)

`orders.discount_kind` **no era un hueco del esquema**: la migración `ventas` documenta, con
enumeración, que la mecánica del vale (el "ruletazo") **no viaja** y que sus consumidores
—`getVouchersTotal`, el KPI "total regalado", `CloseShiftModal`— *"son TODOS features del vale, no
del descuento. Cuelgan de la mecánica, no del mecanismo."*

⚠️ **Yo lo había clasificado como hueco leyendo el error de `tsc`, sin abrir la migración.** Quinto
caso del corolario *"clasificar leyendo el nombre o el plan NO es clasificar"* — acá el "plan" fue
un mensaje del compilador, que se lee todavía más autoritativo que un documento.

### Lo que sostenía peso

`anular-venta.spec.ts` tenía un test *"exclusión: vale/venta gratis anulada sale del conteo y de
vouchers"*. **Es un test de ANULACIÓN**, módulo que se queda, y usaba el vale solo de fixture. Se
partió en dos:

| Mitad | Destino |
|---|---|
| `vouchers_total` | muere con la mecánica del vale |
| **`sales_count`** — *una venta anulada no cuenta en el cierre* | **se conserva**: es un invariante de anulación + arqueo, y los dos módulos siguen |

Y la venta gratis se consigue igual sin el vale: el camino de `POSPage` es **`total > 0`**, no
`kind === 'vale'`. Un descuento del 100% llega al mismo lugar.

**Segundo caso seguido en que lo que sostiene peso vive en `tests/` y no en el producto.** Ya es
patrón: cuando se poda una mecánica, los tests de OTROS módulos que la usaban de atajo son el lugar
donde primero se rompe algo que importa.

### Lo que se conservó por la razón inversa

El input de **motivo del descuento** estaba gateado por `isVale`. Se **desgateó** en vez de
borrarse: `discount_reason` **sí viajó** al esquema base, y una columna que ninguna pantalla puede
llenar es exactamente el residuo inerte que la deuda 23.1 prohíbe.

Y en `sentry.ts` se sacó `discount_kind` del allowlist de claves conocidas — al revés que
`waiter|mozo` en el regex de redacción. La asimetría es la que decide: **en el regex, un patrón de
más REDACTA de más y falla cerrado; en el allowlist, una clave de más DEJA PASAR de más.** Se
conserva lo que endurece y se saca lo que afloja.

### De paso: cuatro specs seguían consultando `cash_shifts`

La tabla es `jornadas` desde el esquema base. `anular-venta`, `arqueo`, `descuento` y
`helpers/shift` la nombraban en strings de `.from(...)`. **Quinta aparición** de la clase "lo que no
es una referencia de código, ningún verificador lo mira" — y esta vez fueron 9 ocurrencias que
habrían fallado todas en tiempo de ejecución.


---

## 2026-09-01 · Dos afirmaciones OPUESTAS, ninguna verificada — y el desacuerdo las hizo más creíbles

**El caso.** Sobre el alcance de un access token de Supabase:

| Quién | Afirmó | ¿Verificó? |
|---|---|---|
| El usuario | "es solo del proyecto de Nodo, no hay peligro" | **no** |
| Yo | "los `sbp_` no se emiten por proyecto, son de cuenta" | **no** |

**El dato real:** Supabase **sí** emite tokens con alcance de proyecto. La pantalla de *Generate
token* tiene *Resource access → Project*, permisos granulares por área que arrancan **todos en No
access**, y expiración de 7 días por defecto. **Mi afirmación era falsa**, y la del usuario era
cierta pero sin comprobar en el momento de decirla.

**Lo resolvió mirar la pantalla.** No un argumento, no una segunda lectura: la interfaz.

### 🔴 La variante que hace este caso distinto del corolario de R4

El corolario dice: *la coincidencia entre dos declaraciones no es evidencia — es la misma afirmación
escrita dos veces.* Este caso es su forma **con desacuerdo**, y es peor:

> **Cuando dos declaraciones se CONTRADICEN, una parece haber ganado la discusión — y "ganar" se
> siente como haber verificado.**

Coincidir al menos deja la incomodidad de que nadie salió a mirar. **Discrepar la elimina:** aparece
un ganador, el ganador queda con la sensación de haber demostrado algo, y el perdedor concede. Los
dos salen más convencidos que antes **y el mundo sigue sin haber sido consultado**. Acá el que
"ganó" la discusión fui yo —sonaba técnico y específico— y estaba equivocado.

**Lo accionable, y es una pregunta:** cuando una discusión se resuelve porque un lado convenció al
otro, preguntá **qué se miró**. Si la respuesta es "nadie miró, uno argumentó mejor", lo que hay es
una opinión con más confianza, no un dato. La verificación no es el argumento más fuerte: es abrir
la cosa.

⚠️ **Y el corolario operativo que quedó puesto:** el alcance del token ahora lo garantiza el
**mecanismo** (permisos de proyecto, todo en *No access* por defecto), no una regla escrita. La
regla se conservó igual, **marcada como redundante a propósito**, porque un token legacy de cuenta
la vuelve necesaria sin aviso. Mismo criterio con el que R0 vive en `CLAUDE.md` además del hook.


---

## 2026-09-01 · Primer diagnóstico CONTRA la base, y tres cosas que no eran como se creían

Con acceso de lectura directo (Management API, token con alcance de proyecto), el estado real:

| Pregunta | Se creía | **Es** |
|---|---|---|
| Migraciones | 15 aplicadas | ✅ **15**, `local == remote` en las 15 |
| Tablas | "las 27" | **23 tablas + 4 vistas.** El 27 salía de contar los dos juntos |
| `seed_system_roles` | "acabo de volver a pegarla" | 🔴 **NO EXISTÍA.** 19 funciones, ninguna era ésa |
| Org `LAB` | — | 🔴 **CERO organizaciones** en toda la base |
| Cuentas de Auth | — | 🔴 **CERO** |

### 🔴 El hallazgo: la clase "indistinguible de" en un reporte HUMANO

**Atribución, porque importa quién lo encontró y dónde falló:** lo levantó Alejandro. Dijo **dos
veces** que había aplicado `seed_system_roles`, y **ninguna de las dos quedó**. Leyó el banner verde
del SQL Editor como confirmación — que es exactamente lo que ese banner invita a hacer.

🔴 **Es la primera vez que esta clase aparece en un reporte HUMANO y no en una herramienta.** Las
anteriores fueron un runner (un archivo que no se colectaba), un tipo (`can(string)`) y un conteo.
Ésta es la más difícil de cazar por una razón simple:

> **Nadie audita lo que le dice su interlocutor.** Un test que no corre al menos deja una línea rara
> en el resumen; "ya lo apliqué" no deja nada — se integra al estado compartido como un hecho, y
> todo lo que se construye encima hereda el supuesto.

Y el mecanismo que lo produce es el mismo de siempre: **pegar un script y ver el banner verde no
prueba que el objeto quedó.** El script pudo correrse contra otro proyecto, la pestaña pudo tener
otra sesión, la selección pegada pudo quedar corta. El estado defectuoso emite la señal del sano.

**Lo accionable, y es una regla corta:** *un objeto que ALGUIEN DICE haber aplicado se verifica
contra el catálogo del sistema antes de construir encima.* No es desconfianza: es que el reporte y
la realidad son dos cosas distintas, y solo una de las dos ejecuta. Cuesta una consulta a `pg_proc`.

### El mecanismo, aparte de quién lo reportó

Lo más caro no es que faltara la función: es que **se creía aplicada**. Pegar un script en el SQL
Editor y ver el banner verde **no prueba que el objeto quedó** — el script puede haberse corrido
contra otro proyecto, o la pestaña puede tener otra sesión, o la selección pegada puede haber
quedado corta. **La única evidencia es preguntarle al catálogo del sistema.**

Es la clase **"indistinguible de"** por tercera vez, y ahora del lado humano: *"lo apliqué"* y *"creo
que lo apliqué"* producen exactamente la misma señal — un banner verde y una convicción.

⚠️ **Y hay un dato que lo agrava:** ésta es la **segunda** vez que esta función falta. La primera
fue el push, porque vive fuera de `migrations/`. Un objeto que se puede perder de dos maneras
distintas no necesita más cuidado: necesita un **check**. Es la deuda #5, quinto check.

### `--include-seed` — verificado ejecutando, no leyendo

`supabase db push --include-seed --dry-run` responde:

```
Would seed these files:
 • supabase/seed-system-roles.sql
{"seeds":["supabase/seed-system-roles.sql"], ...}
```

Con eso el `config.toml` deja de ser una hipótesis: **el CLI lee `[db.seed].sql_paths` en un push
remoto**, no solo en `db reset` local, que era la duda razonable que dejaba el comentario del
template. `pnpm db:push` lleva la bandera, así que el camino por defecto es el correcto.

### Lo que quedó aplicado en esta sesión

1. `supabase/seed-system-roles.sql` → verificado con `pg_proc`: la función existe.
2. `supabase/lab-seed-a.sql` → org `LAB`, sede `LAB Principal`, 3 roles.
3. Verificación del RBAC **contra la base**, no contra el archivo:
   **admin = 21 · cajero = 8 · owner = comodín** — coincide exacto con `SYSTEM_ROLES`.


---

## 2026-09-01 · Las 11 RPC EJECUTADAS contra la base — y los dos guards que aparecieron

`verificar-rpcs.sql` corrió contra la base ya migrada. **Exit 0, ninguna tiró
`relation/column does not exist`.** Es la primera evidencia de que los cuerpos plpgsql resuelven —
lo que el `db push` verde no dice, porque Postgres no valida el cuerpo al crear la función.

### Las dos corridas que fallaron primero, y por qué son BUENAS noticias

El discriminador que el propio script trae en la cabecera —*`relation/column does not exist` es un
esquema roto; cualquier otro error es el script o un guard*— se usó dos veces el mismo día:

| Error | Qué era |
|---|---|
| `El extra ... no esta asignado al producto` | **Guard correcto.** Mi fixture creó el extra sin `product_extras`. `add_order_items_with_extras` lo rechazó — y para llegar a rechazarlo, su cuerpo tuvo que resolver hasta la línea 128 |
| `La suma de pagos (11000) no cuadra con el total (0)` | **Guard correcto.** La orden nacía en 0 y `add_order_items_with_extras` NO recalcula el total (lo calcula el cliente) |

⚠️ **Un guard que se dispara es una función que resolvió.** Los dos "fallos" fueron, en realidad,
las dos primeras confirmaciones de que el esquema funciona.

🔴 **Y un detalle del segundo fixture que vale como lección de RLS:** el total no se puede corregir
con un `update` después de impersonar. Sobre `orders` **no hay policy de UPDATE para
`authenticated`** —esas escrituras las hacen las RPC—, así que el update afectaría **0 filas en
silencio**. Hay que fijarlo antes de bajar de privilegios. Es la deuda #24 cerrada por
construcción, vista desde adentro.

### El control negativo, que es lo que hace válido al verde

Un `perform public.rpc_que_no_existe(1)` devuelve:

```
ERROR: 42883: function public.rpc_que_no_existe(integer) does not exist
```

Así que **el rojo que buscábamos SÍ se ve**. Sin esa comprobación, el exit 0 habría sido un verde
que no se sabe si podía salir mal — justo lo que el corolario de R4 prohíbe dar por bueno.

Y el `rollback` no dejó nada: `select count(*) from products where name like 'VERIF%'` → **0**.


---

## 2026-09-01 · La predicción, con el scorecard CORREGIDO — y por qué el primero estaba mal

⚠️ **Esta entrada reemplaza una anterior cuya conclusión se apoyaba en una clasificación
equivocada.** Se deja el porqué al final, porque el error de método vale más que el resultado.

### El scorecard, reclasificado POR CAUSA

| # | Predicción | Confianza | Resultado real |
|---|---|---|---|
| 1 | Aserciones de DOM en tests migrados | alta | ❌ no ocurrió — el test migrado **pasa** |
| 2 | Más strings de `.from()`/`select()` viejos | alta | ⚠️ **ocurrió, tarde**: `getCancelledSales` pedía `orders.type` |
| 3 | Specs de módulos podados / cambiados | alta | ✅ **la causa DOMINANTE**: `config`, `caja`, `compras`, `historiales`, `rbac` ×3 |
| 4 | `create-user` sin re-desplegar | alta | ⏳ sin medir |
| 5 | Policies RLS | media | ✅ `rbac-escalada` (frena la RLS, no el trigger) y el fixture de `debt_payments` |
| 6 | `suscripcion-*` | media | ⚠️ **se saltaron**, no fallaron |
| 7 | Timeouts / flakes de entorno | baja | ❌ **CERO**. Lo que conté como aciertos era la #3 disfrazada |

**Y dos causas grandes que no estaban en la lista** — las dos del **estado del laboratorio**, no del
código: el **seed sin extras** (5 specs) y el **residuo acumulado** (6 fallos).

### 🔴 La conclusión, corregida

La anterior decía *"enumerar sirvió para podar sin romper y no sirvió para anticipar qué se rompe al
ejecutar"*. **Con los números bien clasificados, es falsa.** La correcta es más útil:

> **Enumerar el CÓDIGO anticipó bien los fallos del código.** La #3 —confianza alta— fue la causa
> dominante de todos los fallos genuinos.
> **Lo que no anticipó fue el ESTADO DEL ENTORNO**: el seed incompleto y la basura acumulada.
> Y es coherente: **nunca enumeramos el laboratorio.** Enumeramos `src/`, `tests/` y el esquema.

Las dos de confianza alta que no ocurrieron (#1 y #2 en su primera pasada) tampoco desmienten el
método: **no ocurrieron porque la enumeración ya las había limpiado.** Una predicción que se cumple
porque el trabajo previo la evitó se lee como fallo y es lo contrario.

⚠️ **Lo accionable, entonces, no es "enumerar sirve poco": es que la lista de qué enumerar estaba
incompleta.** Faltaba el entorno de pruebas — sus fixtures y su estado acumulado — que es tan
"código del que algo cuelga" como `src/`.

### 🔴 Y el error de método, que es lo que hay que retener

El primer scorecard clasificó los fallos **por SÍNTOMA** (*"falló por timeout"* → predicción #7,
que hablaba de timeouts) en vez de **por CAUSA** (*"falló porque el DOM cambió"* → #3). Y el síntoma
es precisamente lo que la predicción **no** decía.

> **Una predicción se evalúa contra la CAUSA. Contra el síntoma se la premia o se la castiga por
> azar.**

Es la misma familia que *"clasificar leyendo el nombre no es clasificar"*, **pero aplicada a nuestro
propio instrumento de medición** — y eso es peor: un instrumento mal calibrado no produce un dato
equivocado, produce una **conclusión equivocada sobre el método**. Estuvimos a punto de guardar
"enumerar no anticipa" como lección, que habría desalentado justo la práctica que mejor funcionó.

⚠️ La contramedida es barata y es la misma de siempre: **antes de puntuar una predicción, abrir el
artefacto y nombrar la causa.** El mensaje de error es un síntoma, y ya sabemos que el síntoma
señala mal.

## 2026-09-01 · Los 43 saltados son tests SIN INFORMACIÓN, no aprobados

De 117 tests ejecutados en la corrida parcial: **59 pasaron, 15 fallaron, 43 se saltaron**.

Los 43 **no** son `test.skip`: son los que Playwright omite cuando un test falla dentro de un
`describe.serial`. **No se sabe nada de ellos.**

> Un `describe.serial` que aborta produce exactamente la clase **"indistinguible de"**: en el
> resumen, *saltado* y *pasado* se leen igual — los dos son "no rojo".

⚠️ **Y no es un problema de lectura: tiene consecuencia material.** Los tests de **limpieza** son
casi siempre los ÚLTIMOS de su bloque, así que un fallo temprano **se lleva puesta la limpieza**.
El laboratorio acumula residuo, y el residuo rompe la corrida siguiente. Ver el caso del `.first()`.

---

## 2026-09-01 · QUINTO caso de que `extras` sostiene el flujo de venta — y el primero MEDIDO

Los cuatro anteriores salieron de **enumeración**: alguien leyó, grepeó y concluyó. Éste salió de
que **cinco specs se rompieron**.

**El mecanismo:** `useProductsWithExtras` hace que el POS abra el `ItemConfigModal` **solo si el
producto tiene al menos un extra ACTIVO asignado**. `lab-seed-b.sql` no creaba ninguno —el lab
heredado tenía `Lab Doble` y no lo porté—. Sin extra, el modal nunca aparece, y los cinco specs que
hacen click en `Lab Coctel` y lo esperan se cuelgan 10s y fallan:
`descuento` ×3, `tipo-venta-reset` ×2, `fiado`, `pago-mixto`, `arqueo`.

**Por qué se me escapó, que es la parte útil:** enumeré **qué productos nombran los specs** y
concluí que los extras se los crean ellos. Era cierto y era insuficiente. Lo que había que enumerar
era **de qué depende el FLUJO del POS**, que es otra pregunta. Es el corolario de la propiedad —
*enumerar qué depende no alcanza, hay que enumerar de qué propiedad depende*— aplicado a un seed en
vez de a una poda.

✅ **Corregido y verificado ejecutando:** con `Lab Doble` asignado a `Lab Coctel`, `descuento.spec`
(4/4) y `tipo-venta-reset.spec` (2/2) pasan.

---

## 2026-09-01 · El laboratorio acumula residuo, y el residuo rompe la corrida siguiente

`pos.spec.ts` falla con `expect(total).toBeGreaterThan(0)` → **`Received: 0`**. La causa no es el
POS: es **qué producto es el primero**.

El test hace `page.getByTestId('product-card').first().click()` — **sin nombrar el producto**.
Consultando la base:

```
AV Insumo 761791   price=0.00   is_active=true    <- residuo de anular-venta.spec
E2E Prod 270863    price=15000  is_active=true    <- residuo de productos.spec
E2E Insumo 851750  price=1000   is_active=true    <- residuo de compras.spec
```

**Son fixtures de corridas anteriores que quedaron activos porque sus tests de limpieza se
SALTARON** cuando su spec abortó. Un insumo de precio 0 como primera tarjeta da un carrito en 0.

### 🔴 El bucle, que es lo que hay que romper

> **Un fallo se lleva puesta la limpieza → el lab queda sucio → la suciedad causa fallos nuevos →
> que se llevan puesta más limpieza.**

Es realimentación positiva, y explica por qué una suite que "casi anda" se degrada corrida a
corrida en vez de estabilizarse. **La limpieza no puede depender de que los tests pasen.**

⚠️ Y hay una lección de diseño de tests aparte: **`.first()` es un locator sin sujeto.** Funciona
mientras el orden sea el esperado, y el orden depende de datos que otro spec crea. `pos.spec.ts`
debería nombrar su producto como hacen los demás.


---

## 2026-09-01 · 🔴 El primer defecto del proyecto que SE REALIMENTA A SÍ MISMO

Los defectos que veníamos midiendo eran estáticos: estaban, se encontraban, se arreglaban. **Éste
crece solo.**

```
un test falla temprano en un describe.serial
        ↓
sus tests de LIMPIEZA (que son los últimos del bloque) se SALTAN
        ↓
el laboratorio queda con fixtures activos de esa corrida
        ↓
la basura rompe tests de OTROS specs
        ↓
que también se llevan puesta su limpieza
```

**Es realimentación positiva, y explica algo que no habíamos entendido: por qué una suite que "casi
anda" se DEGRADA corrida a corrida en vez de estabilizarse.** Cada corrida deja el terreno peor que
la anterior, así que la segunda falla más que la primera **sin que nadie haya tocado el código**.

### Y la degradación se lee como bugs nuevos

Ésta es la parte cara. `pos.spec.ts` fallaba con `expect(total).toBeGreaterThan(0)` → `Received: 0`.
Eso **parece** un bug del carrito. No lo era: el primer `product-card` de la grilla era
`AV Insumo 761791`, **precio 0**, residuo de `anular-venta.spec` cuya limpieza se había saltado.

**Medido:** con la purga puesta, `pos.spec.ts` pasó de **5 fallos a 0**, y el `Target crashed` de
`productos.spec.ts` tampoco se reprodujo. **Seis de los quince fallos originales eran residuo, no
código.**

### Lo accionable

> **La limpieza de un entorno de pruebas no puede vivir en el camino feliz.**
> Va al ARRANQUE, no al final: así el estado inicial no depende de que la corrida anterior haya
> salido bien.

Implementado en `tests/global-setup.ts`, que corre **siempre**: allowlist positiva de prefijos
(`E2E %`, `AV %`) enumerados grepeando las constantes de los 30 specs, acotada por **UUID** a las
sedes de LAB, **desactivando** en vez de borrando —lo mismo que hacen los tests de limpieza, sin
pelear con las FK— y **después** del check de organización, para no tocar nada si las credenciales
no son las del laboratorio.

⚠️ **Y es RUIDOSA a propósito:** imprime cuántas filas tocó y por tabla, con un aviso extra si pasa
de 50. *Una purga silenciosa es un objetivo destructivo del que nadie sabe el alcance.* Primera
corrida real: `9 fixtures viejos desactivados — products=4 categories=2 extras=1 customers=1
suppliers=1`.

---

## 2026-09-01 · `.first()` es un locator sin sujeto

Aparte del residuo, `pos.spec.ts` tiene un defecto propio que **va a volver a morder aunque el lab
esté limpio**:

```ts
await page.getByTestId('product-card').first().click()
```

**No nombra el producto.** Funciona mientras el orden de la grilla sea el esperado — y ese orden
depende de datos que **otros specs** crean. Todos los demás specs nombran su producto
(`filter({ hasText: PRODUCT })`); éste no.

> **Un locator posicional convierte cualquier cambio de orden en un fallo que parece de otra cosa.**

Y "de otra cosa" es literal: el síntoma fue *"el carrito calcula mal el total"*. Ni el mensaje ni el
locator mencionan el orden, que era la causa. Es la misma familia que el guard de R6 y que la regex
de `global-setup`: **el error señala un lugar que no es el del defecto.**

⚠️ Queda anotado y **no corregido en esta pasada**: es del spec, no del laboratorio, y el orden
acordado era residuo primero.


---

## 2026-09-01 · 🔴 `fiado`: el test estaba bien y el sistema estaba mal — una advertencia FALSA

La pregunta con la que se entró fue la correcta y separaba dos bugs: **¿el abono no crea el
`cash_movement`, o lo crea y la UI no lo muestra?** La respuesta resultó ser **una tercera**, y peor
que las dos.

### El dato primero

```
amount=5000  payment_method=cash  creo_movimiento=TRUE
requiere_conciliacion=FALSE  categoria=abono_cliente
reason='Abono de E2E Fiado 741270 (venta #50)'
```

**La cadena abono → cash_movement → jornada funcionó perfecto.** Nada de diseño estaba roto ahí.

### El bug

```ts
// src/hooks/useDebts.ts
if (paymentMethod === 'cash' && !result.shift_open) {
  toast('Abono registrado. El efectivo no entró a caja (sin turno abierto).')
}
```

**La RPC nunca devolvió `shift_open`.** Devuelve `jornada_abierta` — el nombre cambió con el
renombre `shift`→`jornada` y este consumidor se quedó atrás.

`result.shift_open` es `undefined`; `!undefined` es `true`; así que **la rama de degradación se
tomaba SIEMPRE que el método era efectivo**, incluso con el ingreso creado.

🔴 **Y el modo de fallo es el caro: una advertencia FALSA.** No una pantalla vacía ni un error —
un cartel que le dice al cajero *"el efectivo no entró a caja"* **cuando sí entró**. La reacción
natural es ir a registrar el ingreso a mano: **la advertencia falsa induce el error que dice
prevenir.** Es peor que no avisar nada.

### Por qué `tsc` lo aprobó

`supabase.rpc()` devuelve `Json`, así que el resultado se castea a una **interfaz escrita a mano**
en `supabase-helpers.ts` — y esa interfaz **también decía `shift_open`**. El compilador validó el
acceso contra la mentira, no contra la función.

> **Es R1 punto 5 fuera de `database.types.ts`.** El anti-patrón conocido era "los tipos de las
> TABLAS escritos a mano"; éste es el mismo con el **retorno de una RPC**, que nadie había mirado.
> Y es más silencioso: una tabla mal tipada suele reventar en la primera consulta; un `jsonb` mal
> tipado devuelve `undefined`, que es **falsy**, así que **elige una rama** en vez de fallar.

### El arreglo, y por qué no fue renombrar la clave

Lo obvio era `shift_open` → `jornada_abierta`. Se hizo otra cosa: la condición pasa a
**`result.requiere_conciliacion`**.

**Razón:** la RPC **ya decidió** si ese abono quedó pendiente de conciliar, y lo devuelve. Derivarlo
en el cliente a partir de `!jornada_abierta` sería **reimplementar la regla en un segundo lugar** —
R1 otra vez, y con una regla que ya tuvo su discusión de diseño. Además `requiere_conciliacion` era
un campo **que no consumía nadie**: la bandera que aprobamos para el camino degradado estaba muerta.

✅ **Verificado ejecutando: `fiado.spec.ts` 11/11, exit 0.** `tsc` 0 · `lint` 0 · 269 unitarios.

⚠️ **Lo que esto deja como pregunta abierta:** hay más RPC con retorno `jsonb` y su interfaz a mano
(`register_sale_payment`, `register_sale_void`, `register_purchase`). Ninguna está verificada contra
su `jsonb_build_object`. Es la misma clase y no la buscamos todavía.


## 2026-09-01 · Enumeración completa de la clase: 3 desajustes, 1 peligroso

Diff mecánico de **todas** las RPC que devuelven `jsonb`: claves del `return jsonb_build_object`
contra la interfaz escrita a mano.

| Interfaz | RPC | Resultado |
|---|---|---|
| `RegisterDebtPaymentResult` | `register_debt_payment` | ✅ coinciden (corregido hoy) |
| `SaleVoidResult` | `register_sale_void` | 🔴 **declara `was_fiado` y la RPC NO lo manda** |
| `RegisterPurchaseResult` | `register_purchase` | ⚠️ la RPC manda `cash_movement_id` y TS no lo declara |
| *(sin interfaz)* | `register_sale_payment` | ✅ sin riesgo: el consumidor solo mira `error` |
| `AssignOrderNumberResult` | — | **falso positivo**: no es de una RPC, es la forma de retorno de un helper propio |

### El peligroso explica el fallo que íbamos a atacar después

`anular-venta.spec.ts:291` hace `expect(...was_fiado).toBe(true)` — y la RPC **nunca envía esa
clave**. Ese es exactamente el `Expected: true, Received: undefined` que teníamos pendiente.

⚠️ **La enumeración lo encontró antes de llegar a él.** Es la diferencia entre arreglar de a uno y
mirar la clase: el mismo diff que salió de `fiado` ya contenía el diagnóstico de `anular-venta`.

**Por qué falta `was_fiado`:** `register_sale_void` vive en la migración `ventas`, y
`orders.payment_status` / `customer_id` los agrega **`clientes_y_cartera`, que corre después**.
Cuando se escribió la función, el concepto de fiado **todavía no existía en el esquema**. No es un
descuido de tipeo: es una dependencia de orden que se llevó puesta una clave.

### El inofensivo, y por qué se anota igual

`register_purchase` manda `cash_movement_id` y la interfaz no lo declara. **Hoy no rompe nada**
—nadie lo lee— pero la asimetría importa: *TS declara y la RPC no manda* → `undefined` y una rama
equivocada; *la RPC manda y TS no declara* → el dato existe y **nadie puede usarlo sin castear**.
El primero miente, el segundo desperdicia.

### Lo que la enumeración descartó

Sospechábamos que un desajuste podía estar detrás de los timeouts de `arqueo`, `compras` e
`historiales`. **No lo está:** las tres RPC que esos specs usan están limpias o sin interfaz.
Descartar una hipótesis con un diff mecánico es barato y evita perseguirla tres veces.


## 2026-09-01 · `anular-venta`: de 8 a 15 tests, y cuatro causas distintas en un solo spec

`was_fiado` era la primera de cuatro. Vale enumerarlas porque **ninguna era un bug de la anulación**:

| # | Síntoma | Causa real |
|---|---|---|
| 1 | `Expected: true, Received: undefined` | la RPC no exponía `was_fiado` (migración v2) |
| 2 | `Expected "turno cerrado"` | **la RPC dice "jornada"** — renombre a medias (deuda #38) |
| 3 | `Expected "ya está anulada"` | el SQL del esquema base **se escribe sin tildes**; el spec venía de Vento con ellas |
| 4 | `42501 violates RLS on debt_payments` | el fixture hacía un **insert directo** de un abono |

### La 4 es la más instructiva: el fixture saltaba el único camino permitido

Sobre `debt_payments` **no hay policy de INSERT para `authenticated`** — esas filas las escribe
`register_debt_payment`, que es `SECURITY DEFINER`. El test insertaba a mano, RLS lo negaba, y el
error aparecía como si la anulación estuviera rota.

> **Un fixture que escribe por un camino que el sistema no permite no está preparando el escenario:
> está probando otra cosa.**

Es la deuda #24 —*"cerrada por construcción: sin policies de escritura, nada puede saltarse la
RPC"*— **verificada desde afuera y sin querer**. El diseño funcionó exactamente como se prometió;
lo que no se había actualizado era el test.

### Y la 3 deja una regla barata

Los mensajes de las migraciones se escriben **sin acentos** por convención del esquema base. Un
`toContain('ya está anulada')` convierte una diferencia **ortográfica** en un rojo que parece de
lógica. La aserción pasó a `toMatch(/ya est[aá] anulada/)`: **se asierta la frase, no su grafía.**
Grepeado: era la única aserción acentuada contra un mensaje de RPC en los 30 specs.

### Lo que NO se tocó

Queda 1 fallo (`UI: con filtro de método, la anulada sale de la lista`) y 1 sin correr. Y **no se
hizo el renombre turno→jornada**: son 24 archivos, es una decisión de alcance, y hacerlo dentro de
un turno dedicado a otra cosa es cómo se cuelan los renombres a medias — que es justo el defecto
que este caso destapó.


## 2026-09-01 · 🔴 Los "timeouts" no eran timeouts — y mi scorecard le dio crédito a la predicción equivocada

**La pregunta era la correcta: ¿se cuelgan en el mismo punto o en puntos distintos?** La respuesta
es *puntos distintos*, pero la conclusión que sigue **no** es "es lentitud".

| Spec | Se colgó en |
|---|---|
| `arqueo` | `movement-reason-in`.**fill()** |
| `historiales` | `movement-reason-out`.**selectOption({label:'Otro'})** |
| `compras` | `invoice-payment-method`.**selectOption()** |

Los tres esperando **un control de formulario que no existe**. Y dos de ellos en el mismo campo con
operaciones **incompatibles entre sí** —uno `fill` de input, otro `selectOption` de select—, que ya
era la pista: no pueden ser los dos correctos contra el mismo DOM.

**La causa:** `MovementsModal` se reescribió para mandar `categoria`, y los testids cambiaron —
`movement-reason-in`/`-out`/`-custom` pasaron a `movement-categoria` + `movement-detalle`. **Lo
reescribí yo y no actualicé los specs.**

### La lección, que es sobre cómo se lee un timeout

> **Un timeout no es un síntoma de lentitud: es cómo Playwright reporta "no encontré el elemento"
> cuando la acción tiene auto-waiting.**

`fill()` y `selectOption()` esperan al locator hasta agotar el timeout **del test**, no el del
locator. El mensaje —`Test timeout of 30000ms exceeded`— **no nombra el locator**: hay que abrir el
`Test source` del artefacto para ver la línea. Por eso tres fallos de "elemento inexistente" se
disfrazaron de problema de rendimiento.

### 🔴 Y esto corrige el scorecard de la predicción

En la lectura anterior conté **6 de 15 como aciertos de la predicción #7 (timeouts/flakes de
entorno, confianza BAJA)**. **Era falso.** Eran de la #3 —*specs que tocan lo que cambió*, confianza
alta— disfrazados por el mecanismo de arriba.

**El scorecard corregido es peor para mí y mejor para el método:**

- **#7 (entorno, baja)**: no acertó. Le di crédito por coincidencia de síntoma.
- **#3 (specs de lo podado/cambiado, alta)**: acertó **mucho más** de lo contado — `rbac` ×3,
  `config`, `arqueo`, `historiales`, `compras`, y las tres de `anular-venta`.

⚠️ **Lo que esto enseña sobre evaluar predicciones:** clasifiqué por **síntoma** (*"falló por
timeout"*) en vez de por **causa** (*"falló porque el DOM cambió"*), y el síntoma es justo lo que la
predicción NO decía. **Una predicción se evalúa contra la causa; evaluarla contra el síntoma la
premia o la castiga por azar.**

Es la misma familia que "clasificar leyendo el nombre no es clasificar": clasifiqué leyendo el
mensaje de error.

### Estado

`arqueo`, `historiales` y `anular-venta` pasan. **27 passed / 1 failed / 3 did not run** en los
cuatro specs juntos. Queda `caja: registrar egreso con motivo de la lista configurable`, que prueba
una **lista de motivos configurable por sede** — reemplazada a propósito por la allowlist fija de
`categoria`. Ese test verifica una función que se decidió eliminar; es decisión de producto, no un
arreglo.


## 2026-09-01 · Un test que sobraba destapó un hueco de UI antes de morir

Al borrar el test de la lista configurable, el OTRO test de `caja` —el de sobregiro— siguió
fallando: asertaba que el movimiento registrado apareciera en la lista con su categoría, y la lista
**mostraba solo `m.reason`**.

🔴 **Era un hueco real, no una aserción vieja.** Un movimiento sin detalle libre —un `gasto`, por
ejemplo— salía en la lista con **la descripción en blanco**: solo un monto y una hora. Y `categoria`
es justamente el campo que decidimos que fuera **la fuente de los reportes**; no mostrarlo dejaba la
pantalla **diciendo menos que la base**.

**Arreglado:** la lista muestra `categoría · detalle`, con el detalle solo si existe. La etiqueta se
deriva de `CATEGORIAS` con un helper —no se enumera la lista dos veces (R1)—.

⚠️ **Lo que vale del caso:** el test estaba escrito contra el modelo viejo y **aun así encontró un
defecto del nuevo**. Si lo hubiera borrado junto con el otro por "prueba el modelo anterior", el
hueco seguía. **Antes de borrar un test por obsoleto, mirar si su aserción sigue siendo verdadera
bajo el modelo nuevo** — el sujeto puede haber cambiado y la expectativa seguir valiendo.


## 2026-09-01 · Los guards hablaban y la UI los silenciaba — y mi primera verificación fue un proxy

**El síntoma:** el test del rechazo de compra no veía el toast *"Abri la jornada de caja"*. El dato
lo acotó rápido: la compra rechazada **no existía en la base** (el guard rechazó bien), así que el
problema era solo el mensaje.

### La verificación que salió mal, y vale más que el hallazgo

Hipótesis: `err instanceof Error` da falso para un `PostgrestError` y el `onError` cae al genérico.
**Primera prueba:** instancié la clase exportada del paquete real —

```
new PostgrestError({...}) instanceof Error  →  true
```

— y di la hipótesis por **descartada**. **Segunda prueba, end-to-end:** login como el owner, RPC
real sin jornada, el error tal como lo ve `onError`:

```
error instanceof Error: false
error.message: "Abri la jornada de caja antes de registrar una compra"
```

**Las dos pruebas se contradicen porque la primera era un PROXY**: probé la clase que el paquete
exporta, no el objeto que el cliente construye en el camino real. R4 con su enunciado exacto —
verificar contra la cosa real— y la trampa fue que la primera prueba *parecía* empírica: código
corriendo, no una lectura. **Un experimento sobre el objeto equivocado es una lectura con disfraz.**

### El defecto, que es de CLASE

```ts
onError: (err) => toast.error(err instanceof Error ? err.message : 'Error al registrar la compra')
```

Todo error de negocio de una RPC caía al genérico: el guard decía *qué hacer* y el usuario leía
*"Error al registrar la compra"*. Los guards de este esquema se escribieron accionables **a
propósito** — la UI los tiraba a la basura.

**11 copias del patrón. Y dos ya tenían el arreglo local** (`useSalesHistory`, `POSPage`): el
defecto ya se había pagado dos veces sin barrer la clase — la evidencia de R3 en su forma más pura,
porque las hermanas arregladas *prueban* que alguien ya lo conocía. Barrida completa a
`mensajeDeError()` en `src/lib/errores.ts`, con el porqué en el helper.

### `compras.spec`: las expectativas estaban INVERTIDAS, no viejas

El spec venía de Vento afirmando *"la compra NUNCA genera un egreso de caja automático"* y *"sin
turno se registra sin advertencia"*. La deuda 26 —decidida por el cliente— dice **lo contrario**:
la compra SALE de la caja del día y **se rechaza sin jornada**. Correr el spec de Vento tal cual
habría verificado exactamente el comportamiento que revertimos. Reescrito con las expectativas del
modelo de Nodo, incluido el test de rechazo **con su contraste** (el stock no se movió — R10).

De paso, séptima aparición de los strings muertos: la lista de compras pedía
`purchase_invoices.payment_method`, columna que la deuda 26 dejó afuera. La consulta fallaba entera
y **la lista se veía vacía**. Nadie leía esa clave: era solo el select.


## 2026-09-01 · Primera corrida COMPLETA de la suite — el estado real, con la cuenta cerrada

Cuatro grupos, cada uno con su exit code leído de adentro del archivo (R9):

| Grupo | Specs | Resultado | Exit |
|---|---|---|---|
| 1 | anular-venta … create-user (9) | 50 passed · 1 skipped | **0** |
| 2 | descuento … inventario (6) | 39 passed | **0** |
| 3 | numeracion … stock-bajo-pos (6) | 33 passed | **0** |
| 4 | rbac … ventas-historial (9) | 34 passed · 4 failed · 16 skipped · 5 did not run | **1** |

**Totales: 156 pasados · 4 fallados · 17 saltados · 5 sin correr — 182 en total.**

✅ **La aritmética cierra con predicción:** el `--list` decía 183 y se borró exactamente 1 test (la
lista configurable) → 182 esperados, **182 contabilizados**. Ningún test se perdió en el conteo.

**Los 30 specs ejecutaron.** Los 5 "sin correr" son tests dentro de `rbac-escalada` (serial abortado
tras su fallo), no archivos enteros.

### Los 4 fallos, y ninguno es nuevo

| Fallo | Qué es |
|---|---|
| `rbac.spec` ×3 | asertan `Mesas`/`Delivery` en el nav — **specs del catálogo viejo, pendientes de reescritura** (la predicción #3, conocida desde la primera corrida de los diez) |
| `rbac-escalada` ×1 | **la pregunta de diseño abierta**: la auto-reactivación la frena la RLS con 0 filas, no el trigger con mensaje. El test distingue los dos a propósito |

### Los 17 saltados, clasificados (no son un número opaco)

- **16** de `suscripcion-*`: falta el secreto HMAC y la Edge Function `aplicar-estado` en el
  proyecto de Nodo. Se saltan **con su motivo impreso** — skip declarado, no silencioso.
- **1** de `create-user`: la purga del usuario creado exige service role; la hace `lab-seed-b`.

### El cierre del tablero (mismo día, más tarde)

Los 4 fallos quedaron en **0**. `rbac.spec` se reescribió contra el nav real de Nodo (10 ítems, no
los 11 de Vento), con el contraste positivo primero. Y `rbac-escalada` destapó, al destrabarse su
serial, **la tercera manifestación de la deuda #39**: la capa de UX del corte de sesión era código
muerto — mismo mecanismo, la fila propia invisible bajo P2. Restaurada del lado del cliente: cero
filas en el primer fetch con sesión viva → corte con mensaje. La sonda SQL que separó "trigger mudo"
de "hueco de consolidación" dio el veredicto: **el trigger viajó y está igual de mudo en Vento** —
es P2 silenciándolo en los dos repos, no una pérdida del fork.

`rbac` + `rbac-escalada`: **14 passed · 1 skipped (declarado: pide 2 sedes y el lab tiene una a
propósito) · exit 0.**

### De dónde venimos

La primera corrida (parcial, hace unas horas): **59 pasados / 15 fallados / 43 saltados**, cortada
en el test 117, con el lab sucio y sin extras. Ésta: **156 / 4 / 17**, completa, con la cuenta
cerrada. La diferencia no fue arreglar 15 tests: fue el seed, la purga, dos columnas muertas, un
contrato jsonb, los testids del modal nuevo, y dos specs cuyo modelo estaba invertido.


---

## 2026-09-01 · P2: UN caso con TRES síntomas — todo lo que depende de leer la fila propia falla hacia el silencio

Tres hallazgos de la misma sesión que se registraron por separado y son **el mismo defecto**:

| Síntoma | Dónde apareció |
|---|---|
| El trigger de auto-reactivación nunca dispara (0 filas, sin excepción) | sonda SQL |
| El test que exigía el mensaje del trigger recibía silencio | `rbac-escalada.spec` |
| La pantalla "Tu usuario está desactivado" era código muerto para su propio caso | `AuthContext` |

**La raíz, en una frase:** P2 hace que un desactivado pierda `get_my_organization_id()`, y la policy
de SELECT de `profiles` usa esa función — así que el desactivado **no puede ver su propia fila**. Y
todo lo que depende de LEERLA falla hacia el silencio:

- el **guard** no puede dispararse (el UPDATE escanea 0 filas — nunca llega al trigger);
- el **mensaje** del guard no puede emitirse (es parte del guard);
- el **corte de sesión con explicación** no puede ejecutarse (para leer `is_active=false` hay que
  ver la fila; `.single()` da 0 filas y el código toma la rama de "hipo transitorio").

⚠️ **La forma general, que es lo que vale retener:** una policy de visibilidad no solo oculta datos —
**oculta la evidencia que otros mecanismos necesitan para hablar**. Guard, mensaje y UX eran tres
capas de defensa en profundidad, y una sola policy las silenció a las tres **a la vez**, porque las
tres leían la misma fila. Defensa en profundidad con un único punto de lectura no es profundidad.

Verificado también en Vento: forma idéntica de policies+funciones → **el mismo defecto está en
producción allá** — un usuario desactivado entra a una app en blanco. NO se arregla allá desde acá:
es corrección y va a los dos repos (R1 punto 9), en su turno.

En Nodo la tercera capa (UX) quedó restaurada del lado del cliente; la voz del guard en la base es
la deuda #39, post-MVP.


## 2026-09-01 · Paso 0 del re-skin — y el instrumento que no podía salir rojo

**Lo que se aplicó:** los 45 tokens del §1 de la skill en `:root` (`src/tokens.css`), los radios del
§3, e **Inter cargada por primera vez**. Cero pantallas tocadas.

### El hallazgo del inventario que este commit convirtió en arreglo

La skill declara la pila `Inter, system-ui, sans-serif` y hay **40 `fontFamily: 'Inter, …'`
inline** en `src/`. **No existía ningún `@font-face`.** Las 40 pedían una fuente que el navegador
no tenía de dónde sacar, así que **todo el mundo veía `system-ui`** — en Windows, Segoe UI. Un
documento y cuarenta declaraciones de código de acuerdo entre sí, y ninguna ejecutando: el
corolario de R4 en su forma más barata de detectar y más cara de notar.

**La decisión de implementación que sale de ahí:** el `@font-face` se declara con el nombre
`'Inter'` y no `'Inter Variable'` — que es como lo nombra `@fontsource-variable/inter` —
justamente para que **las 40 resuelvan sin editar un solo archivo**. La pila de la skill pasa de
aspiración a hecho sin un renombre masivo.

Y la variable, no la estática: la escala tipográfica pide **peso 450**, que la estática no tiene.
Pedir 450 sobre una estática **lo redondea a 400 o 500 en silencio** — el mismo perfil de fallo.

### 🔴 EL CONTROL NEGATIVO MATÓ A MI PRIMER INSTRUMENTO

Que el `@font-face` esté en el CSS emitido es una **declaración**, no evidencia. Así que se midió
en un Chromium real contra el build. Primera sonda:

```
document.fonts.check('16px Inter')  ->  true
```

Verde. Y **falso como instrumento**, porque el control negativo dio lo mismo:

```
document.fonts.check('16px NoExisteEstaFuente')  ->  true   <-- 🔴
```

`check()` no contesta *¿está cargada Inter?*: contesta **¿se puede pintar este texto?** — y siempre
se puede, hay fallback. Con familia correcta o inventada, el resultado es idéntico. Era un verde
que **no podía salir rojo**, que es la definición exacta de tautología del corolario de R4.

**El instrumento que sí discrimina fue medir, no preguntar** — el ancho del mismo texto:

| familia | ancho |
|---|---|
| `Inter` | **392,89 px** |
| `system-ui` | 364,30 px |
| familia inexistente | **364,30 px** ← cae exacto en system-ui: la medición distingue |
| `Inter` peso 450 vs 400 | 395,39 / 392,89 ← el eje variable está vivo |

**Lo accionable, que generaliza a cualquier API de "¿está disponible X?":** una API que contesta
sobre la CAPACIDAD DEL SISTEMA (¿podría?) no sirve para verificar la PRESENCIA DE UN RECURSO
(¿está?). Las dos preguntas se escriben casi igual y una tiene fallback. Se distinguen con el
control negativo, y **cuesta una línea**: correr la misma sonda contra algo que sabemos que no
existe. Si contesta lo mismo, el instrumento no mide.

### Dos huecos de esquema encontrados por leer la maqueta contra `information_schema`

Ya son **dos en el mismo día y forman clase**, no instancias sueltas: *diseño cerrado sobre datos
que no existen.*

1. **El cupo de crédito** — cero columnas, y está en el alcance firmado (deuda 40).
2. **`codigo` y `unidad`** de producto — dos de las cinco columnas de la fila del mostrador
   (deuda 41). La `unidad` ya estaba escrita en CLAUDE.md como una de las tres diferencias
   medidas contra Vento; nadie había notado que **no tenía columna**.

Las dos aparecieron **al enumerar columnas**, no al leer nombres — mismo método que los cuatro
casos del corolario de clasificación. Ninguna bloquea el re-skin: el design system ya tiene el
estado `sin dato` para el cupo, y la fila se arma con las columnas que existen.


## 2026-09-01 · La nota decía la verdad, estaba en CLAUDE.md, y no tenía columna

**El caso más caro del corolario de R4 hasta ahora — y el más incómodo, porque las dos
declaraciones eran NUESTRAS y las dos eran CORRECTAS.**

`CLAUDE.md` dice, desde el 2026-08-31 y en la sección que se lee antes de trabajar:

> *"la **unidad de compra difiere de la de venta** (se compra por bulto, se vende por unidad) y eso
> no existe en un bar"*

Es una de las **tres diferencias medidas** contra Vento, escrita para advertir que inventario y
compras **no viajan tal cual**. Se leyó muchas veces: para escribir el esquema de compras, para
citar la zona gris del 43,3%, para justificar por qué `product_components` no se poda. Y
`supabase/migrations/…_inventario.sql` la refuerza en un comentario: *"Caso típico en Nodo: un bulto
que se vende por unidad suelta."*

**Dos documentos del repo, de acuerdo entre sí, los dos diciendo la verdad. Y
`purchase_invoice_items` tiene `qty`, `unit_cost` y `subtotal`: ninguna columna para la unidad de
compra ni para su factor.**

### Lo que hace distinto a este caso

El enunciado del corolario de R4 es *"la coincidencia entre dos declaraciones no es evidencia: es
la misma afirmación escrita dos veces"*, y hasta ahora los casos eran de **contenido falso**
(`VITE_NODO_SUPABASE_URL` contra lo que el código leía). Acá **el contenido era correcto**. Lo que
falló fue lo otro que dice el corolario, y que es la parte que se subestima:

> **Ninguna de las dos ejecuta.**

Una nota correcta que nadie ejecuta contra la base **no protege de nada**. Peor: **tranquiliza**.
Cada lectura la dejaba igual de cierta y un poco más «ya considerada» — el mecanismo exacto que el
corolario describe, funcionando sobre una afirmación verdadera.

### El costo, que es en dinero

`register_purchase` hace `stock_qty += qty` y calcula el promedio ponderado móvil con ese mismo
`qty`. Comprar **12 bultos de 50** registrado como 12 unidades deja el stock en +12 (debería ser
+600) y el costo unitario en el del bulto: **50 veces el real**. Y `cost_price` alimenta
`order_items.unit_cost`, que se **congela al vender** (R1 punto 8) — así que un costo mal calculado
hoy queda **grabado para siempre** en las utilidades de todas las ventas de ese producto.

✅ **Se encuentra a tiempo por una sola razón: no hay clientes operando todavía.** El mismo defecto,
encontrado en tres meses, no se arregla con una migración — hay que decidir qué hacer con la
historia ya congelada.

### Lo accionable, que ya está escrito como corolario en CLAUDE.md

**Dibujar una pantalla audita un esquema.** Esta nota vivió nueve días en el documento que se lee
antes de trabajar; la destapó tener que dibujar la línea de una compra y preguntarse de dónde sale
`1 bulto = 50 UND`.


## 2026-09-01 · La unidad de compra, aplicada — y la sonda que no distinguía

**Deuda 43 cerrada.** `purchase_invoice_items` gana `purchase_unit` y `units_per_purchase_unit`, y
`register_purchase` v2 convierte a unidades de venta antes de tocar stock y costo.

### La aritmética, y por qué el numerador no divide

```
stock      += qty × factor
subtotal    = qty × unit_cost              ← intacto: es la plata de la factura
cost_price  = round( (stock_actual × costo_actual + subtotal)
                     / (stock_actual + qty × factor), 2 )
```

`(qty×factor) × (unit_cost/factor)` es **idénticamente** `qty × unit_cost` = el subtotal. Escribirlo
así evita dividir y volver a multiplicar, que perdería centavos en cada compra con un factor que no
divide exacto. La división solo aparece en las tres caídas del promedio, donde va redondeada a 2.

### El cuerpo se copió LITERAL, y el diff lo demuestra

El `register_purchase` de la migración aplicada se extrajo con un script y se le aplicaron
reemplazos puntuales. El diff contra el original tiene **9 líneas eliminadas, y las 9 son las que
tenían que cambiar**: el insert, el stock, el movimiento y las cuatro ramas del costo. Ningún guard
—sede, permiso, jornada, proveedor, producto, movimiento de caja— se perdió en la copia. Reescribir
una función de 120 líneas a mano es exactamente cómo se pierde un guard sin que nadie lo note.

### 🔴 LA SONDA DEL CHECK NO DISTINGUÍA — segunda vez que pasa

Afirmé en la migración que el `CHECK` protege **cualquier** camino, no solo la RPC. Para probarlo,
inserté una fila que lo viola desde el cliente:

```
CODIGO: 42501 | new row violates row-level security policy
```

**Rechazó la RLS, no el CHECK.** El test daba verde y no probaba nada de lo que yo había afirmado —
la misma forma que la sonda ambigua del rechazo mudo: *dos caminos que terminan igual*. Un `expect(error).not.toBeNull()`
es verdadero para los dos.

Se verificó donde corresponde, **contra el catálogo del sistema**:

```
conname: chk_factor_segun_unidad
CHECK (((purchase_unit IS NULL) AND (units_per_purchase_unit = 1))
    OR ((purchase_unit IS NOT NULL) AND (units_per_purchase_unit >= 1)))
```

**Lo accionable, y ya es la segunda vez:** cuando una sonda espera un rechazo, preguntar **qué
mecanismo lo produjo**, no solo si hubo error. Si dos mecanismos distintos dan la misma señal, la
sonda no mide — mide que *algo* falló.

### Tres hermanas barridas al abrir el archivo (R3)

`supabase-helpers.ts` tenía tres defectos de la clase R1 punto 5b, encontrados **al abrirlo por otra
razón**:
1. `RegisterPurchaseResult` declaraba 2 de las 3 claves del `jsonb` — faltaba `cash_movement_id`.
   Lado que **desperdicia**, por eso no era urgente.
2. `PurchaseInvoiceListRow` y `PurchaseInvoiceDetailRow` declaraban `payment_method`, columna que
   **no existe** y que el select ni pide. Lado que **miente**: en runtime era `undefined`, falsy, y
   el código habría elegido una rama. **Las dos mitades del contrato estaban en el mismo archivo,
   contradiciéndose** —el select decía *"sin payment_method: no existe"* tres líneas debajo de la
   interfaz que lo declaraba— y TS mira solo una.
3. El comentario de `RegisterPurchaseResult` afirmaba *"la compra NO toca la caja: no crea egreso
   automático"*. **Falso desde la deuda 26**, que invirtió exactamente eso.


## 2026-09-02 · Cartera — una columna que se escribía y nunca se leía

**El hallazgo, y es la mitad que faltaba de un caso ya conocido.** `debt_payments.requiere_conciliacion`
existe desde el primer día, la RPC la setea, y el §6 del design system la lista como **estado
obligatorio** de la pantalla Cartera. **Ningún select la pedía.** El dato se escribía correctamente
y no había forma de verlo.

Es el reverso exacto del bug que ya pagamos: allá el aviso del MOMENTO se derivaba de una clave que
la RPC nunca mandaba y salía siempre; acá el aviso PERSISTENTE no existía porque nadie leía la
clave que sí manda. **Las dos mitades del mismo contrato, rotas en direcciones opuestas.**

### El campo que salió del select, y por qué es la misma historia

`cash_movement_id` estaba en el select y **no lo usaba nadie**. Se sacó, y no por limpieza: dejarlo
invitaba a derivar el badge de `cash_movement_id == null`, que **no es lo mismo** — un abono con
tarjeta tampoco crea movimiento de caja y **no** está pendiente de conciliar. Confundirlos es
literalmente lo que hizo nacer la columna: es el caso 2 de *"un valor que significa dos cosas no es
un dato"*, donde `cash_movement_id` nulo cargaba *"no tocó caja"* **y** *"la jornada estaba
cerrada"*.

### El test, y el mutante que lo validó

El estado no tenía cobertura. Se agregó con **contraste**: primero un abono con jornada abierta que
**no** debe quedar marcado, después el mismo abono sin jornada que sí. El contraste no es adorno
acá: *un test que solo mirara el caso degradado habría pasado con el bug viejo puesto*, porque
entonces el aviso salía siempre.

Auditado por mutación (R10): con el badge pintándose incondicionalmente (`{true && …}`), **la mitad
del contraste se pone roja**. El mutante muere.

### Tres primitivas nacidas con su consumidor

- **`Badge`** — primer consumidor real. Y lleva escrito el inventario de los **cinco badges inline
  que todavía no pasan por ella** (`stock-badge`, `stock-status-badge`, `sale-voided-badge` ×3,
  `overdraft-badge`, `overdraft-warning`), con el comando para reproducir la lista. Se cuentan, no
  se descubren de a uno.
- **`KpiCard`** — unifica **tres** formas que vivían separadas: la función de InventoryPage, el
  bloque inline de FiadoPage (el único con testids, por eso salen de ahí) y los de ReportsPage. Y
  aprovecha para corregir un rol: *"Total por cobrar"* usaba `#dc2626` igual que los otros dos KPI;
  ahora es `--debt`, porque **que un cliente deba no es que alguien haya hecho algo mal**.
- **`AgingBar`** — rotulada **"Antigüedad"**, con la columna `VENCIDO` deliberadamente **sin
  pintar** (deuda 46). Enciende **todos** los tramos con deuda, no solo el de la más vieja: un
  cliente con una deuda de 5 días y otra de 95 tiene las dos cosas, y mostrar solo la peor esconde
  que la mayoría es reciente.


## 2026-09-02 · `requiere_conciliacion`: las DOS puntas del mismo contrato, rotas al revés, con quince días entre una y otra

Van juntas porque **por separado cada una parece un descuido y juntas son una clase**.

| | 2026-08-18 · la punta que ESCRIBE | 2026-09-02 · la punta que LEE |
|---|---|---|
| **Qué pasaba** | El cliente derivaba el aviso de `!result.shift_open`, una clave que la RPC **nunca mandó** | El select de abonos **nunca pidió** `requiere_conciliacion`, que la RPC **sí manda** |
| **Cómo fallaba** | `undefined` es falsy ⇒ el aviso salía **SIEMPRE** con método efectivo | El estado obligatorio del §6 **no se podía mostrar nunca** |
| **Dirección** | MIENTE — y peor: **inducía a duplicar el ingreso a mano** | CALLA — el dato correcto, invisible |
| **Quién lo notó** | un test que esperaba el camino feliz | dibujar la pantalla que lo tenía que mostrar |

La segunda es más difícil de encontrar que la primera. La primera **grita** (un aviso falso en
pantalla); la segunda es una ausencia, y **una ausencia no tiene síntoma**: la pantalla se ve
completa, el flujo funciona, los tests pasan. Solo aparece cuando alguien pregunta *"¿y dónde se
ve esto?"* — y esa pregunta la hizo el diseño, no el código.

### 🔴 Lo accionable, y es una regla de dos partes

> **Cuando una RPC devuelve una bandera, verificá LAS DOS PUNTAS: que la mande, y que alguien la
> lea. Ninguna sola prueba nada.**

- Que **la mande** y nadie la lea ⇒ el estado existe y es invisible. Falla **callando**.
- Que **la lean** y no la mande ⇒ `undefined` es falsy, el código elige rama. Falla **mintiendo**.

⚠️ Y las dos se ven idénticas desde `tsc`: una interfaz que declara la clave compila igual mande la
RPC o no, y un select que no la pide compila igual. **El compilador no mira ninguna de las dos
puntas.** El único chequeo posible es el mecánico que ya está escrito en R1 punto 5b: comparar las
claves del `jsonb_build_object` contra la interfaz **y contra los selects**.

*(La tercera punta, que este caso agregó: una bandera puede vivir además en una **columna**, y
entonces hay que verificar que el select la pida. `register_debt_payment` la manda en el retorno Y
la persiste; el retorno se leía, la columna no.)*


## 2026-09-02 · El arqueo — una corrección de SIGNIFICADO, no de color

> ⚠️ **ESTA ENTRADA AFIRMA UNA CORRECCIÓN QUE NO SE HIZO DONDE IMPORTA.** Lo corregido fue
> `ShiftHistoryPage` y el pie sobre tinta del modal; **el bloque "Diferencia" de `CloseShiftModal`
> —donde se decide el cierre— siguió en verde.** Lo cazó la auditoría A3 el mismo día. Ver *"La
> primera afirmación falsa de esta bitácora"* más abajo. Se conserva el texto original: el
> razonamiento es correcto; lo falso es el estado.

Va acá y no en la lista de barridos porque **no cambió cómo se ve una pantalla: cambió qué afirma**.

El cierre de caja pintaba el **sobrante en verde** y el **cuadre en gris**. El verde del design
system está reservado a la confirmación —*al día, abono aplicado, compra aplicada*—, así que el
color estaba afirmando dos cosas, las dos falsas:

- *que a la caja le sobre plata es un buen resultado*;
- *que cuadrar es un dato más*.

**Un sobrante es un descuadre exactamente igual que un faltante.** Significa que algo no se
registró: una venta cobrada por fuera del sistema, un vuelto mal dado, una base mal contada. El
único resultado bueno del arqueo es *cuadrado*, y era el que no tenía color.

### Por qué es peor que un faltante mal pintado

Un faltante duele y se investiga **aunque el color esté mal**: falta plata, alguien pregunta. Un
sobrante en verde **se archiva**. La plata de más se queda en el cajón y nadie busca de dónde salió
— que es justamente el hecho que había que investigar.

### La regla que completa

Es la familia de *"una advertencia falsa induce el error que dice prevenir"*, que ya tenía dos
mitades escritas —la garantía falsa que tranquiliza de más, la advertencia falsa que alarma de
más—. Ésta es la tercera y la más silenciosa:

> **Una confirmación falsa apaga la alarma que debería sonar.**

No produce una acción equivocada: produce **la ausencia de una acción correcta**. Por eso no deja
rastro y por eso no la encontró ningún test — los tests miran el cálculo del arqueo, que estaba
bien. Lo que estaba mal era lo que el color decía **sobre** un cálculo correcto.

**Lo accionable:** al pintar un estado, preguntá **qué AFIRMA el color**, no si combina. Verde
afirma *"esto salió bien"*. Si el estado no es un resultado bueno, el verde miente — y miente en la
dirección que menos se revisa.

⚠️ Se corrigió también en el panel **sobre tinta**, pero solo a medias y con la razón escrita: el
sobrante sí tiene token on-dark (`--on-dark-warn`), el cuadrado y el faltante no existen sobre
oscuro (§8.3). Media corrección con su límite dicho vale más que inventar dos tokens.


## 2026-09-02 · A1 — la séptima falla de instrumento se cazó ANTES, y el 2,0× parejo

### La primera vez que el control negativo funciona como prevención

Las seis fallas anteriores se descubrieron **después**: un número que no cerraba, un `tsc` rojo, una
lista que no coincidía con el conteo. Todas correcciones. Esta vez el plan de la auditoría decía, de
antemano: *"la 54 TIENE que aparecer como 🔴; si no aparece, el método está mal"*.

El primer grep, `\?\? new Set\(`, dio **cero**. El caso de la 54 es `new Set<string>()` — el
parámetro de tipo entre `Set` y `(`. Sin el control, la auditoría habría producido un documento
diciendo que la clase que la motivó no existe en el código, y ese documento se habría leído y citado.

**Lo que la distingue:** el control no corrigió un resultado — **impidió que el resultado existiera**.
Es la diferencia entre auditar un número y auditar el instrumento antes de creerle al número. Costó
una línea en el plan, escrita por quien sabía qué tenía que salir.

### El 2,0× sostenido merece su propia línea

| patrón | predicho | medido | ratio |
|---|---|---|---|
| `?? []` | ~25 | 57 | 2,3× |
| `?? 0` | ~30 | 65 | 2,2× |
| `?? null` | ~10 | 41 | 4,1× |
| `.single()` | ~15 | 26 | 1,7× |
| **total** | **~110** | **222** | **2,0×** |

Un error **concentrado** en un patrón diría *"no conocía ese patrón"*. Un error **parejo** en todos
dice otra cosa: **subestimé cuán extendido está `??` como idioma de default en este código**. No es
un hueco de conocimiento sobre un lugar; es una calibración global equivocada. Y eso es accionable de
una forma que el error concentrado no: la próxima estimación sobre este repo se multiplica por dos.

### Y el hallazgo de A1 que reordena la Fase B

**Tres de los cuatro rojos tenían `isLoading` disponible y sin usar.** Antes de la auditoría, la
hipótesis era *"hooks que no exponen carga"* — la 54 lo era. Medido: **el hook era el culpable en
uno solo**. En los otros tres el hook hizo su parte y el consumidor no la leyó. La regla nueva de
CLAUDE.md es sobre el consumidor por eso: *leer la carga donde se decide, y que el botón no exista
hasta que todos los insumos hayan cargado*.


## 2026-09-02 · A2 — 828 celdas coincidentes, 111 permisos donde se esperaban, y TRES cruces

*Documento: `docs/auditorias/A2-negacion-policies.md`. Nada se modificó; todo corrió en `begin … rollback`.*

### Los dos números que lo hacen creíble

| | predicho antes de correr | medido |
|---|---|---|
| tablas: 23 × (S/I/U/D × sede propia · otra sede · otra org) × (owner · cajero · desactivado) | 828 celdas: 111 permite / 717 niega | **828/828 coinciden** |
| el control negativo: permisos que TENÍAN que funcionar | 111 | **111, todos con filas > 0** |
| RPC + escalada | 54: 17 / 37 | **54/54**, tras dos correcciones de fixture |
| vistas | 36: 8 / 28 | **36/36**; las cuatro con `security_invoker=true` |

Si toda la matriz hubiera dado cero, la sonda habría estado rota. Dio 111 permisos exactos, y además
la fixture se contó como postgres (46/46 filas de B y X existen): **el cero de `authenticated` es RLS,
no ausencia.**

### Y los tres que pasan — predichos por escrito ANTES de ejecutar

1. **Desactivado + `add_order_items_with_extras`**: escribió en una orden de **otra organización**.
   Líneas 1 → 2, stock 10 → 7, `stock_movements` nuevo. Contado como postgres antes del rollback.
2. **Desactivado + `next_order_number`**: numeró la sede ajena.
3. **Cajero que se traslada solo de sede** con `update profiles set sede_id`, sin tenerla en
   `user_stores`, y acto seguido lee la sede nueva.

**El método no falló: encontró exactamente lo que no estaba probado.** La RLS de tablas y vistas
está bien —828 y 36 celdas lo dicen— y el hueco estaba en las dos capas que ninguna policy cubre: el
cuerpo de una RPC `SECURITY DEFINER`, y un trigger que protege cuatro columnas de cinco.

### La nota sobre el orden, que es la razón de A2

**Este hueco existe desde que se aplicó el archivo 11 (`…121300_rls.sql`) y las RPC del mismo día,
2026-08-31.** La suite corrió verde muchas veces desde entonces —**171 pasando, 18 skipped, 189 en
total** en la última corrida completa— y **no lo vio, porque ningún test impersona a un desactivado
escribiendo.** `rbac-escalada` prueba que el desactivado *no entra* (UI) y que *no se reactiva*
(trigger); nadie le preguntó a la base qué pasa si el token sigue vivo y llama a una RPC. Y el test
que cubriría el traslado de sede **existe y está `skip`** porque el lab tiene una sola sede.

Una suite verde mide lo que alguien escribió que midiera. Lo que nadie escribió no está verde ni
rojo: **está sin medir**, y se ve exactamente igual que lo verde. Por eso las auditorías van antes de
tocar una línea: **las tres que faltan pueden mover la prioridad, como acaba de pasar con ésta** —A2
puso dos deudas arriba del cierre de caja, que era el primer lugar de A1.

### Lo que la sonda enseñó del instrumento

- La Management API devuelve el **último `select` aunque después venga `rollback`**. Se verificó con
  `begin; select 1; rollback;` antes de confiar. Sin eso, la sonda no podía ser una sola transacción.
- Dos abortos por el índice parcial de jornadas, **los dos míos**: leí el primer error como "la sede A
  ya tiene una abierta" y era mi propia fixture con dos. El parche hecho sobre esa lectura movió el
  error a la sede B. El error decía la verdad; yo lo leí con una hipótesis puesta.
- Cuatro controles del owner negaron por **negocio** ("Abrí la jornada", "no es de contado"), no por
  autorización. La regla del plan los separó: un control que no pasa es sonda rota hasta demostrar
  lo contrario. Se leyó el mensaje, se corrigió la fixture, 17/17.
- El evaluador marcó ✅ las tres celdas 🔴, porque coincidían con **mi** predicción. "Coincide con lo
  predicho" y "es seguro" son columnas distintas; la segunda la decide la lectura.


## 2026-09-02 · La primera afirmación falsa de esta bitácora — y es de ESTADO, la clase fundacional

*Corrección de la entrada "El arqueo — una corrección de SIGNIFICADO, no de color" (2026-09-02).
Atribución: la escribí yo, en la sesión del re-skin de Turnos, después de corregir `ShiftHistoryPage`.*

### Qué se afirmó y qué era cierto

| la entrada decía | lo medido por A3 (§6) |
|---|---|
| *"El cierre de caja pintaba el sobrante en verde"* — en pasado | `CloseShiftModal` bloque "Diferencia", líneas 300–328: **sigue en verde**. Y la columna "Dif." por método, línea 364 |
| *"Se corrigió también en el panel sobre tinta, pero solo a medias"* | cierto: el pie del modal (línea 409) usa `--on-dark-warn` para el sobrante |
| (implícito) el arqueo quedó corregido | corregido en el **historial** (`ShiftHistoryPage` 51–53) y en el pie. **No en el bloque donde la cajera decide** |

El razonamiento de la entrada es correcto y se conserva entero: un sobrante es un descuadre, el verde
lo archiva, la confirmación falsa apaga la alarma. **Lo falso es el estado**: *dónde* quedó aplicado.

### Por qué importa más que el defecto

Este documento se separó de CLAUDE.md porque, de 36 afirmaciones auditadas en Vento, **las 8 falsas
eran todas de estado**. Ésta es la primera falsa de la bitácora de Nodo, y es exactamente de esa
clase: describe un cambio, en pasado, y el cambio se hizo en un sitio de tres.

Y se escribió **en el momento más creíble**: recién hecho el cambio, con el commit fresco, con la
convicción de haberlo hecho. No fue descuido de memoria; fue **recordar el commit en vez de enumerar
los sitios**. El commit corregía el historial y el pie. La memoria decía "el arqueo".

### Qué lo cazó

**Un control que exigía que el caso apareciera.** El plan de A3 decía: *"el sobrante en verde tiene
que aparecer"*. Mi predicción, escrita antes de leer, decía que aparecería **como corregido**. Si la
auditoría hubiera partido de la bitácora, el modal no se habría abierto: la nota lo daba por cerrado
y leerla lo confirmaba (R4). El grep de colores devolvió `CloseShiftModal:300` con `difference > 0 ?
'var(--success-soft)'`, y la lectura hizo el resto.

Es la misma mecánica que la séptima falla de instrumento en A1: **el control escrito de antemano
funciona como prevención, no como corrección.** Y es la segunda vez en el mismo día.

### El corolario, que va a CLAUDE.md

> **"Corregido" se verifica ENUMERANDO LOS SITIOS, no recordando el commit.**

Antes de escribir "se corrigió X" en cualquier nota: `grep` de la forma que se corrigió, lista de
los sitios donde aparecía, y **cada sitio con su estado**. Si la lista tiene un solo elemento, la
nota puede decir "corregido". Si tiene tres y se tocaron dos, la nota dice cuáles.

La regla de la poda ya lo pedía para borrar —*mostrar la enumeración*—. Faltaba pedirlo para afirmar.


## 2026-09-02 · A4 — cinco de diez mutantes mueren, y el que sobrevive sobre dinero es el contrato de utilidades

*Documento: `docs/auditorias/A4-mutacion-de-la-suite.md`. Diez mutantes sobre guards de dinero, uno por
vez, cada uno revertido y verificado antes del siguiente —por el arnés y por un segundo script contra
los originales capturados antes de empezar—. La base quedó byte a byte idéntica.*

| | |
|---|---|
| predicción escrita a las 17:39, cadena a las 17:49 | **9 de 10** aciertos |
| mueren | M1 factor · M3 jornada · M4 conciliación · M5 clamp · M6 `has_permission` — **los cinco con un rojo que nombra el guard** |
| sobreviven | M2 motivo · M7 CHECK de categoría · **M8 `unit_cost` congelado** · M9 policy INSERT · M10 default de canal (inerte) |
| la base, sin mutante | 66 verdes, **5 rojos en `pos.spec`** por un residuo de `anular-venta` |

### El acierto 9 de 10 y el fallo, que es de la misma clase que el scorecard por síntoma

Fallé M5 por leer el **título** del test ("descuento del 100 %") y no el **cuerpo** (25.000 fijos
sobre 18.000). El título es un nombre; la aserción es la cosa. Ya estaba escrito para la poda
—*clasificar leyendo el nombre no es clasificar*— y lo repetí sobre un test. Quinto caso del corolario.

### Lo que la mutación enseñó que la lectura no

- **El contrato de utilidades no tiene test.** Nadie lee `order_items.unit_cost`; una línea que lo anule
  pasa 189 tests. Es la deuda 65, bloqueante.
- **`rbac.spec` no toca la base.** 7/7 verde con `has_permission` en `true`. Su nombre promete una capa
  que mide la sonda de A2, no la suite (deuda 66).
- **Los rojos que dirigen existen y tienen forma:** aseveran el efecto con el valor escrito. M1 además
  trae mensaje propio. Predije al menos un timeout mudo; no hubo.
- **La aserción que el re-skin endureció mató un mutante:** con `toContainText('0')`, "−7.000" contiene
  un cero y M5 habría sobrevivido. `toHaveText('0')` lo mata por diseño. Una aserción laxa es la clase
  *"verdadera para cualquier entrada"* de R10, medida con un mutante real.

### El instrumento

- El arnés revierte en `finally` y compara fotos; y **se verificó con un segundo script independiente**,
  porque una herramienta que funcionó diez veces está sin refutar. El segundo encontró que mi fuente de
  originales no traía `has_permission`; completado con el texto capturado en sesión, coincidió byte a byte.
- **R9, tercera vez en el día:** la notificación de la base dijo "exit 0"; el `exit=1` real estaba dentro
  del archivo.
- El límite de diez minutos del comando en segundo plano casi corta la cadena a mitad de un mutante
  (duró 10 min 29 s). El `finally` no corre si matan el proceso: por eso el script de recuperación se
  escribió **antes** de que hiciera falta.


## 2026-09-02 · Cierre de la Fase A — cinco auditorías, y cuántas veces cada regla atajó algo

*`docs/auditorias/A1` a `A5`. Ninguna modificó código; cada una produjo un documento y sus deudas. Este
cierre es el argumento medido de por qué las reglas se leen antes: no son estilo, son las que
encontraron lo que 189 tests verdes no vieron.*

### Lo que encontró cada una, en una línea

| | hallazgo | lo vio la suite |
|---|---|---|
| **A1** pérdida silenciosa | 4 escrituras que persisten un cálculo hecho sobre un default vacío; la peor se reimprime sin recomputar | no |
| **A2** negación de policies | 828/828 en tablas, 36/36 en vistas — y **tres cruces por RPC y por traslado de sede**: un desactivado escribe en la organización de otro cliente | no |
| **A3** rótulos que afirman | el ticket declara un IVA que no existe en ningún dato; dos definiciones de "ventas" en la misma pantalla y en dos Excel; el sobrante sigue verde donde se decide | no |
| **A4** mutación | 5 de 10 mutantes mueren con rojos que dirigen; **el contrato de utilidades no tiene un solo test**; `pos.spec` acoplado a un residuo | no (es la suite) |
| **A5** estado en los documentos | 17 afirmaciones falsas en ~107; tres pares contradictorios en `CLAUDE.md`; el contrato R1-6 violado con la 43 | no puede |

Dos de las cinco encontraron algo que **sale del producto en papel** (A3: IVA y Excel; A2 indirectamente:
el arqueo). Eso reordenó la Fase B.

### El conteo — enumerado, no estimado

Cada fila es una vez que la regla **cambió el resultado**: sin ella, la auditoría habría concluido otra
cosa. Las citas van al documento donde está la evidencia.

| regla / técnica | veces | dónde |
|---|---|---|
| **Predicción escrita antes de medir** | 5 usos · **atajó 4** | A1 (el grep sin `<T>`: la 54 *tenía* que aparecer y dio cero) · A3 (el sobrante, predicho "corregido", apareció abierto) · A4 (M5: predije por el título y el cuerpo era otro) · A5 (subestimé 10–15 → 17; y la forma —pares contradictorios— no estaba prevista). A2 la usó como **anticipación**: los tres cruces estaban escritos antes de correr |
| **Control negativo** | **10** | A1 ×1 (la 54 debe aparecer) · A2 ×4 (111 permisos donde se esperaban; la fixture contada como postgres 46/46; las vistas 8/8; `seed_system_roles` → 42501) · A3 ×2 (la 53 y el sobrante tenían que aparecer) · A4 ×2 (la base verde antes de mutar — y no lo estaba; el revert verificado por un segundo script) · A5 ×1 (la 43 cerrada en todo documento). *El dueño contó 7; la diferencia son las tres verificaciones de fixture y vistas de A2, que cuento porque cada una podía salir mal y una de ellas destapó una omisión mía.* |
| **R9** · el exit code que te muestran no es el que pensás | 1 en las auditorías (**4 en el día**, según el registro del dueño) | A4 §1.3: la notificación de la base dijo "exit 0"; el `exit=1` estaba dentro del archivo, y cinco rojos con él |
| **R8** · artefactos antes de re-correr | 1 | A4 §1.2: los cinco rojos de `pos.spec` se diagnosticaron con `error-context.md` y una consulta a la base, no re-corriendo: `AV Insumo` precio 0 |
| **R4** · contra la cosa real, no el proxy | 4 | A2 (policies leídas de `pg_policies`, no de las migraciones) · A3 (el archivo contra la bitácora: el sobrante) · A4 (el revert contra los originales, no contra el arnés) · A5 (entera: 17 contra código, base y suite) |
| **R10** · mutación | 2 | A4 (los diez) · A3 (`toHaveText('0')`: la aserción endurecida es la que mató a M5) |
| **R3** · clase, no instancia | 3 | A1 (cuatro rojos, una forma) · A2 (tres sitios del `<>` con NULL, uno tapado) · A4 (M7 y la 63: la misma columna sin usar y sin probar) |
| **R1** · contrato compartido | 2 | A3 (la 53 vive en KPI, gráfico, tabla y Excel) · A5 (la tabla de `sentry.test.ts` sin las columnas de la 43: el punto 6 violado) |
| **Enumerar antes de contar** | 4 | A1 (222 hits listados) · A3 (186 colores con su condición; y las 4 cabeceras que el grep de `<th>` no veía) · A4 (las anclas validadas en seco) · A5 (~107 afirmaciones) |
| **Una herramienta propia que funcionó N veces está sin refutar** | 3 fallas cazadas | A2 (la fixture, dos veces: leí el error del índice con una hipótesis puesta) · A4 (el script de recuperación no traía `has_permission`) |
| **Clasificar por el nombre no es clasificar** | 1, en contra | A4 M5 |
| **Nuevas, salidas de la Fase A** | 4 | *un guard que no evalúa deja pasar* (A2) · *una escritura no existe hasta que todos sus insumos hayan cargado* (A1) · *"corregido" se verifica enumerando los sitios* (A3) · *una afirmación de estado se reemplaza, nunca se agrega* (A5) |

**Treinta y cuatro veces en cinco auditorías** una regla escrita cambió lo que se habría concluido. Y
las dos que más atajaron —la predicción escrita y el control negativo— son las dos que **cuestan una
línea antes de empezar** y no se pueden agregar después.

### Lo que la Fase A dice del método

- **Cada auditoría encontró algo que 189 tests verdes no vieron**, y en tres de las cinco lo que
  encontró estaba escrito en un documento como resuelto o como imposible. Una suite verde mide lo que
  alguien escribió que midiera; una nota en pasado mide lo que alguien recordó.
- **Las auditorías se leen unas a otras.** A4 midió con un mutante (M9) lo que A2 había medido con la
  sonda; A5 encontró la 24 vencida porque A2 había leído `pg_policies`; A3 encontró el sobrante porque
  el plan exigía que apareciera. El orden importó.
- **Dos hallazgos son sobre nosotros**, y los dos salieron de la última: el par contradictorio nace del
  append, y la columna que falta en `sentry.test.ts` nace de leer una regla y no ejecutarla en la misma
  sesión. Ninguna regla nueva los arregla; los arregla el `grep` antes de guardar.


## 2026-09-02 · Fase B, bloque 0 · Deuda 60 — el guard que no evaluaba, cerrado en los tres sitios

*Migración `20260902180000_guard_de_sede_null.sql`. Primera deuda de la Fase B, y la primera vez en el
proyecto que un spec se escribe ROJO a propósito antes del arreglo.*

### El rojo primero, y qué dijo cada uno

`tests/rls-negacion.spec.ts` corrió **contra el defecto vivo** antes de tocar la base. Tres rojos, y
cada uno nombra su sitio:

| caso | lo que dijo el rojo |
|---|---|
| desactivado + `add_order_items_with_extras` | `expect(res.error).not.toBeNull()` → **Received: null**. No negó: escribió la línea |
| desactivado + `next_order_number` | **Received: null**. Consumió el correlativo |
| desactivado + `adjust_stock` | `Expected /No tienes una sede activa/` · **Received "No autorizado para ajustar inventario"** — el guard tapado, contestando el guard equivocado |

Y **cuatro verdes en la misma corrida**, que son los que hacen creíble a los rojos: los dos controles
negativos (el owner activo SÍ agrega ítems, numera y ajusta stock), las otras cuatro RPC negando por
sede, y la matriz de INSERT directo dando `42501`. Si todo hubiera dado rojo, el problema habría sido
la sonda.

⚠️ **El tercer caso es el que más valía escribir.** `adjust_stock` ya negaba: un test que solo pidiera
*"que niegue"* habría estado **verde con el defecto puesto**, porque el `has_permission` siguiente lo
tapaba. Exigir **el mensaje del guard de sede** es lo que lo hace medir la clase y no el síntoma. Es
la lección de A4 aplicada al escribir: `toContainText('0')` habría dejado vivo a M5.

### El arreglo, y lo que NO se hizo

Los cuerpos **no se reescribieron de memoria**: la migración se generó desde `pg_get_functiondef` del
texto vivo, con anclas únicas (el generador falla si un ancla aparece 0 o 2 veces). Cambio por
función: `v_mi_sede := get_my_sede_id()` con su `is null` como **primera sentencia**, y el `<>` a
`is distinct from`. El resto del cuerpo es idéntico byte a byte al que estaba aplicado.

⛔ **No se agregó un `has_permission` de parche**, que es lo que la deuda prohibía explícitamente. Y
el `has_permission('pos.vender')` que A2-1 sugería para `add_order_items_with_extras` **tampoco**: es
alcance nuevo, cambia quién puede vender, y se anotó como deuda 69 en vez de colarse en un commit de
seguridad. *Ejecutar lo escrito incluye no ejecutar lo que no estaba escrito.*

### Verificación contra la cosa real

No alcanzaba con que el archivo dijera lo correcto (R4, y la lección del `@keyframes`): se leyó la
base después del push. Las tres funciones: **0 ocurrencias de `<> get_my_sede_id()`**, un `is null`
guard cada una, `is distinct from` puesto, `SECURITY DEFINER` y el ACL de `authenticated` intactos —
`create or replace` los conserva, pero se confirmó en vez de asumirlo.

Las tres migraciones viejas siguen teniendo el `<>` en su texto: **es registro histórico y no se
edita** (R5). La fuente de verdad de una función es la última migración que la reemplazó.

### Lo que costó de instrumento

- **R9, cuarta vez.** La notificación de la tarea en segundo plano dijo *"exit code 0"* mientras el
  archivo decía `t1a_exit=1`.
- Una corrida de suite murió al llegar al límite de diez minutos del comando, y **dejó el `vite` del
  `webServer` huérfano ocupando el 5180**, lo que hizo fallar la siguiente al instante con un mensaje
  que no habla de tests. Vale anotarlo: cuando Playwright levanta su propio servidor, matar al padre
  no mata al hijo.


## 2026-09-02 · Fase B, bloque 0 · Deuda 61 — el traslado de sede, y un dato que cambió la forma del arreglo

*Migraciones `20260902190000_sede_activa_solo_si_esta_asignada.sql` y `20260902191500_revocar_anon_…`.*

### El skip que escondía el hueco

El caso *"cambio de sede activa"* de `rbac-escalada.spec.ts` estaba `test.skip` con el motivo
*"el owner del lab necesita ≥2 sedes en user_stores"*. **Ese skip era el hueco**: con una sola sede,
`sede_id` no tiene a dónde ir, así que ni el caso positivo ni el negativo podían existir. La fixture
ahora **crea la segunda sede** y se la asigna al owner; el spec dejó de depender de la forma del lab.

Es la lección de A2 escrita al revés: *"no va a fallar por uso; va a fallar el día que abran la
segunda sede"*. Un test apagado por falta de datos es un hueco con nombre.

### El dato que cambió la forma del arreglo, y por qué se midió antes de escribir

La condición pedida era **SECURITY DEFINER**, por R6: el `select` contra `user_stores` no puede pasar
por RLS. Puesto en el trigger entero, habría sido una regresión de seguridad. Sonda, con rollback:

```
dentro de SECURITY DEFINER  ->  current_user = postgres
dentro de SECURITY INVOKER  ->  current_user = authenticated
```

`protect_profile_self_escalation` usa `current_user = 'authenticated'` como **condición de entrada a
todos sus guards**. Marcarlo DEFINER habría hecho que esa condición diera falso y habría dejado
**inertes los tres guards que hoy funcionan** — rol, `is_active`, `organization_id` — en silencio y
en el mismo commit que decía arreglar la seguridad.

La forma que cumple el requisito sin romper nada: **el SELECT en un helper DEFINER**
(`sede_asignada_al_usuario`), llamado desde el trigger que sigue siendo INVOKER. Es el patrón que el
repo ya usa con `get_my_sede_id` y `has_permission`.

⚠️ **Lo que esto dice del método:** la instrucción era correcta en su requisito —el select no debe
pasar por RLS— y su implementación literal habría sido dañina. La diferencia se vio **midiendo antes
de escribir**, no razonando. Cuesta una sonda de tres líneas.

### El defecto propio, encontrado por verificar el ACL contra la base

La migración cumplía la regla del proyecto —*SECURITY DEFINER → revoke execute from public*— y el
ACL quedó igual con `anon=X`: **Supabase deja DEFAULT PRIVILEGES en el esquema `public` que dan
EXECUTE a `anon`, y `anon` no es `public`**. Un cliente sin login podía preguntar *"¿el usuario X
tiene la sede Y?"* contra una función que lee sin RLS.

Se cerró con una migración aparte (R5) y **la regla de CLAUDE.md se corrigió**, porque estaba
incompleta: el repo lo hacía bien en `funciones_auxiliares.sql` y la regla que se lee no lo decía.
De las 15 funciones DEFINER del esquema, la única con `anon=X` era la mía.

**Otra vez R4:** el archivo decía lo correcto; la base decía otra cosa. El verde de un `db push` no
es evidencia de que los permisos quedaron como uno cree.

### Cierre del bloque 0

- **60** · tres RPC con el guard de sede evaluando antes de comparar.
- **61** · el traslado de sede validado contra `user_stores`, en la base y no en la UI.
- **66** · la sonda de A2 es un spec (`rls-negacion.spec.ts`) y `rbac.spec` dice en su nombre que
  mide la UI, no la base.
- **Vento** · misma línea, tres sitios expuestos, anotado en la 60 y **pospuesto por decisión**.


## 2026-09-02 · Tres registros del bloque 0 — dos son errores nuestros, y el tercero ya es impuesto

### 1 · Pedí SECURITY DEFINER citando R6, y habría desactivado tres guards

**Atribución: el error es mío, y la instrucción venía con la regla bien citada.** Al fijar el alcance
de la deuda 61 pedí que el trigger fuera `SECURITY DEFINER`, con el argumento correcto —*valida contra
`user_stores` y sin eso su select pasa por RLS*—, que es literalmente el enunciado de R6. Lo que no
hice fue **verificar qué hacía esa marca en ESE trigger**.

La medición, tres líneas y un rollback:

```
dentro de SECURITY DEFINER  ->  current_user = postgres
dentro de SECURITY INVOKER  ->  current_user = authenticated
```

`protect_profile_self_escalation` usa `current_user = 'authenticated'` como **condición de entrada a
todos sus guards**. Con DEFINER, esa condición da falso: los tres guards vigentes —rol, `is_active`,
`organization_id`— habrían quedado **inertes**, en el mismo commit que decía cerrar un hueco de
seguridad, y sin que ningún test lo dijera (los tres casos habrían pasado a "0 filas, sin error",
que es la forma muda que la deuda 39 ya describe).

**Es R4 aplicada a la aplicación de otra regla:** verificar contra la cosa real, no contra la regla.
Una regla citada correctamente no es evidencia de que su aplicación a este objeto haga lo que dice.

🔴 **Y la lectura fina que lo resuelve, que es lo que hay que retener:** R6 pide DEFINER para **la
función que VALIDA DATOS**. En este caso la que valida datos es **el helper que consulta
`user_stores`**, no el trigger que decide qué hacer con el resultado. La regla estaba bien; mi lectura
la aplicó al objeto equivocado. Separar las dos —helper DEFINER, trigger INVOKER— cumple R6 al pie de
la letra y no rompe nada.

### 2 · Una regla incompleta, cumplida al pie de la letra, produjo el defecto que existía para evitar

`revoke execute from public` no alcanza: Supabase deja DEFAULT PRIVILEGES en el esquema `public` que
conceden `EXECUTE` a **`anon`**, y `anon` no es `public`. El helper nuevo quedó invocable **sin login**,
leyendo `user_stores` sin RLS.

**El dato que lo hace grave:** de las quince funciones `SECURITY DEFINER` del esquema, **la única con
el hueco era la escrita siguiendo la regla**. Las otras catorce lo hacen bien porque
`funciones_auxiliares.sql` revoca a los dos — costumbre heredada, no texto.

> **Una regla incompleta que se cumple al pie de la letra deja tranquilo al que la cumplió.**

Es peor que no tenerla: sustituye el criterio por un trámite, y el trámite sale bien. Corregida en
CLAUDE.md con el comando que lo comprueba (`proacl` de las DEFINER), y anotada como deuda 71 la parte
que ningún texto arregla: **un check de árbol**, porque esto no lo caza un hook —nadie tocó un
archivo— sino una consulta que corre siempre.

### 3 · R9, quinta vez, misma forma — ya es impuesto conocido

La notificación de la tarea en segundo plano dijo *"exit code 0"*; el archivo decía `suite_exit=1`, con
cinco rojos. Quinta vez en el proyecto, siempre igual, siempre en el mismo sentido: **la notificación
optimista**. Ya no es un hallazgo, es un costo fijo del arnés, y el hábito que lo neutraliza está
escrito: el exit code se escribe DENTRO del archivo de salida y se grepea. Se anota la quinta para que
el conteo siga siendo honesto — y porque una regla que se cumple sola cinco veces es la evidencia de
que **el mecanismo, no la memoria**, es lo que la sostiene.


## 2026-09-02 · Fase B, bloque 1 · 62(a) — el IVA sale del papel, y un mutante que sobrevivió por mi culpa

### Lo que salió y lo que entró

La línea **"IVA 19% incl."** salió de los tres sitios —ticket del POS, reimpresión y panel de cobro—
junto con el cálculo (`total − total/1,19`) y la prop `iva` de los tres componentes que la recibían:
una prop sin consumidor es el residuo inerte que la deuda 23.1 prohíbe.

Y el papel **ahora dice qué es**. Antes no lo decía: nombre de sede, "Venta #N", fecha y canal. Ni
"Factura" —que habría sido una segunda afirmación falsa en el mismo papel— ni nada. Ahora dice
**COMPROBANTE DE VENTA**, para que no se entregue creyendo que sirve como soporte tributario.

⚠️ **Para poder probarlo hubo que exportar el builder.** `buildSaleTicketHtml` era anónimo dentro de
`printSaleTicket`, así que lo que sale impreso **no se podía aseverar sin abrir el diálogo del
navegador**. Ése es el terreno donde el IVA falso vivió sin que nadie lo viera. Un comprobante que
sale del producto y no se puede testear es un lugar donde las afirmaciones falsas sobreviven.

### 🔴 El mutante que sobrevivió, y por qué el error fue mío

Para probar que el caso E2E sabía ponerse rojo, volví a meter la línea de IVA en el ticket. **El test
pasó igual.** Eso es exactamente el criterio que había escrito dos turnos antes —*un verde
sospechoso es el que pasaría también sin el sujeto*—, aplicado en mi contra.

El diagnóstico, volcando el texto del ticket:

```
LAB PRINCIPAL Venta #882 … Subtotal $ 8.000  IVA 19% incl. $ 1.277  TOTAL $ 8.000
```

**Dos defectos, los dos míos:**

1. 🔴 **Reverti el mutante con `git checkout -- src/pages/POSPage.tsx`, y eso se llevó puesto el
   arreglo**, que estaba en el mismo archivo y **sin commitear**. La corrida "con mutante" tenía el
   arreglo; la de después, ninguno de los dos. Y el `grep -c IVA` que corrí para confirmar el revert
   devolvió **2** —las dos líneas originales— y lo leí como "el mutante ya no está" en vez de como lo
   que era: **el arreglo tampoco**. Un conteo que no distingue qué contó, otra vez.
2. El test tenía **dos caminos** para obtener el texto (`innerText ?? textContent`), y el primero
   devuelve `''` para un nodo oculto — y con `''` las aserciones de "no dice IVA" pasan **sin mirar
   nada**. Ahora usa `textContent` y **asevera que el ticket no vino vacío**, que es el control
   negativo de la propia lectura.

**Lo accionable, y es de arnés:** para revertir un mutante, `git checkout` solo sirve si el archivo
está limpio. Con trabajo sin commitear en el mismo archivo, el revert tiene que ser la sustitución
inversa exacta — o el arreglo se commitea primero y el mutante va después.

✅ Lo bueno: el protocolo funcionó igual. El mutante existía justamente para no confiar en el verde,
y el que no murió destapó dos defectos reales del método. Un test que no se puede poner rojo a
voluntad no es un test verificado.
