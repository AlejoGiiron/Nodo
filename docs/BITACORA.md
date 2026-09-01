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

### 🔴 El hallazgo: un `create or replace` que se cree aplicado y no lo está

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
