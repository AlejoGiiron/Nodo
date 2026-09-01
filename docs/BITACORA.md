# G-Nexo — Bitácora

**Cuándo se lee:** cuando una regla de `CLAUDE.md` te parezca discutible, o necesites el contexto
de una decisión. **No** antes de trabajar — para eso está `CLAUDE.md`.

Acá vive la **evidencia medida** de cada regla y el detalle de cada fase y sesión. La separación
existe porque en G-Vento se auditaron 36 afirmaciones verificables del documento único: 28 eran
correctas y **las 8 falsas eran todas de estado**, ninguna de regla. El registro es la parte que se
pudre, y estaba mezclado con lo que hay que leer siempre.

Convención de escritura: la misma de `CLAUDE.md` → *"Cómo se escribe una nota"*. Citar el símbolo,
no el número de línea. Toda afirmación de estado va fechada. Mejor que fechar: decir el comando que
la consulta.

---

## ⛔ Hueco — evidencia de las once reglas heredadas

**Pendiente de decisión y de copia.**

Las once reglas (R0–R10) se copiaron literales de G-Vento el 2026-08-31, pero **su evidencia no**.
Hoy el `CLAUDE.md` de G-Nexo apunta a `docs/BITACORA.md` del repo de G-Vento (rama `develop`,
`d848852`; también existe `docs/reglas-de-clase` en origin, viva hasta que G-Nexo termine de
copiar).

**Eso es una referencia cruzada entre repos y se va a pudrir.** La bitácora de G-Vento tiene 1.560
líneas, va a seguir creciendo y sus títulos van a cambiar. Es el problema de "citá el símbolo, no
el número de línea", a escala de repositorio.

**Recomendación:** copiar acá, **congelada y atribuida**, la evidencia de las once reglas. Y **no**
copiar el registro de fases y sesiones de G-Vento. El corte: la evidencia que sostiene una regla
viaja con la regla; la historia de sesiones de otro producto, no.

Secciones a traer, según los punteros del `CLAUDE.md`:

| Regla | Sección en la bitácora de G-Vento |
|---|---|
| R1 | *"FASE 1 — estado de suscripción"* (el aviso a G-Centro) |
| R2 | *"Filtros de privacidad: ALLOWLIST por clave, nunca deny-list"* |
| R3 | *"Un defecto de CLASE se barre en toda la suite, no solo donde estalló"* |
| R4 · R9 | *"Trampas de TERMINAL — el síntoma no señala la causa"* |
| R6 | grepear `enforce_profile_organization` |
| R7 | *"Detalle Vale descuento / ruletazo"* (grepear `getVouchersTotal`) |
| R8 | *"ANTE UN FALLO: LEER LOS ARTEFACTOS ANTES DE RE-CORRER"* |
| R10 | *"Auditar una suite por MUTACIÓN, no leyéndola"* |
| R? | caso #13 (la garantía falsa donde se decide) |

---

## 2026-08-31 · Fork desde G-Vento

Primera sesión. No hay código todavía.

### Medido

**Pipe-test del hook `sql-checklist.mjs`, 10 casos.** Copiado de G-Vento, con el estado de ese repo
reemplazado por el de G-Nexo. Verificación en banco (Node v22, no la máquina de trabajo):

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
cierta como razón: en G-Vento este script salió mudo la primera vez y
leyéndolo se veía perfecto. Verificación en banco no es verificación en el entorno (R4).

### Línea base del repo copiado

*Pasos 1 y 2 del runbook, ejecutados a mano el 2026-08-31. Repo en `develop`, base copiada de
G-Vento `d848852`. Para reconfirmar cualquier fila, los comandos del **paso 3** de
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
al comparar contra el `CLAUDE.md` real de G-Vento, antes de escribir nada:

- Decía "las 10 reglas". Son **once** (R0–R10).
- *"No afirmar sin medir"* no es una regla numerada; es la convención de "Cómo se escribe una nota".
- *"Aprendizajes de proyectos hermanos"* es una sección, no una regla.
- *"Idempotencia en operaciones de dinero"* **no existe**: cero ocurrencias en el archivo. R7 es
  límites de día sobre timestamps UTC.
- Faltaban cuatro reglas reales: **R0**, **R3**, **R5** y **R7**.

Si las reglas se hubieran redactado desde ese índice, G-Nexo nacía con una regla inventada sobre
idempotencia y sin R3 — justo la que explica por qué un arreglo no llega solo a sus hermanas.
**Es la novena afirmación de estado falsa, y también era de estado.** La decisión de exigir copia
literal en vez de redactar desde el índice es lo que lo evitó (R4: no verificar contra un proxy).

**La nota falsa del monorepo sigue sin corregirse en G-Vento.** Su `CLAUDE.md` declara `apps/pos`,
`apps/store`, `apps/mobile`, `packages/shared` y `pnpm workspaces`. El diagnóstico ya determinó
que nada de eso existe. Anotado acá porque G-Nexo hereda de ese archivo y la afirmación pudo haber
viajado. **Acción abierta en G-Vento.**

**El conteo de errores repetidos no cierra entre documentos:** el traspaso dice 9, el `CLAUDE.md`
de G-Vento dice 11, el cierre dice 13 y numera los casos #11 a #14. Los tres son incompatibles.
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

**El remote quedó apuntando a G-Vento por error y no se subió nada.** `git remote add` **falla en
vez de sobrescribir**, así que el push nunca salió. Es fail-closed (R2) operando en un lugar donde
nadie lo estaba buscando: si el comando hubiera sido idempotente y "amable", la historia nueva de
G-Nexo terminaba empujada contra el repo del producto hermano. Vale anotarlo como precedente
positivo de la clase, no solo como anécdota.

**`scripts/gen-rbac-sql.mjs` arma la ruta de `tsc` a mano** (`node_modules/typescript/bin/tsc`) en
vez de resolver el binario y verificar que existe. Frágil con pnpm —que no aplana
`node_modules`— y en CI. Es **el mismo patrón que el `jq` del hook** (R4): copiar un camino que
funciona en una máquina y asumir que existe en todas. Pasa a deuda.

**El directorio temporal de ese script todavía se llama `gvento-rbac-*`.** No es una instancia
suelta: es **cadena de marca heredada**, y la pregunta correcta (R3) es "¿tiene hermanas?" en todo
el repo —`gvento`, `GVento`, `G-Vento`—, no "¿arreglo esta línea?". Pasa a deuda, y se ejecuta
junto con el rename de `restaurant_id` para no hacer dos pasadas sobre los mismos archivos.

**El hook corre en la máquina real — y la prueba fue accidental.** No hizo falta un test: durante
la sesión de documentación del 2026-08-31 el hook **disparó 3 veces**, inyectando su texto en el
contexto. Eso cierra la deuda #1 con evidencia más fuerte que el pipe-test, porque prueba la
**cadena entera** —`settings.json` leído por el harness, matcher `Write|Edit|Bash` activo, Node
encontrado, script no mudo—, y el eslabón que falló en G-Vento era justamente ese: en un pipe-test
el script lo invocás vos; acá lo invoca el harness. Un mecanismo se verifica en el camino por el
que va a correr, no en uno parecido (R4).

**Pero las 3 veces fueron falsos positivos, y eso es un hallazgo aparte.** Ninguna sesión escribió
SQL: alcanzó con **nombrar** `supabase/*.sql` en prosa dentro de un comando. El matcheo por
contenido está haciendo lo que se le pidió; la pregunta abierta es cuánto ruido tolera el diseño
antes de entrenar a ignorarlo, que es la única forma en que este hook puede morir. **No se corrige
todavía** — ver deuda #22: la corrección obvia es enumerar excepciones, y eso es exactamente lo que
R2 prohíbe. Primero se mide.

### Decisiones

- **Nombre:** G-Nexo. Provisional hasta whois + SIC (clases 9 y 42). Se descartaron G-Ship
  (promete despacho, que no existe en el producto), G-Cenit (Cenit es la filial de logística de
  hidrocarburos de Ecopetrol), G-Surti (quemado por Surtimax/Surtimayorista) y G-Abasto (se
  inclina a alimentos, deja afuera ferretería y repuestos).
- **Numeración R0–R10 idéntica a la de G-Vento**, a propósito: las skills citan por número y
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
   los tres sobreviven en G-Nexo. Compras, además, es módulo del alcance firmado.
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
ya pagado una vez en G-Vento. Pasa a ser un **paso propio del prompt 3, antes de escribir el
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
RUIDOSO ✔"*— y el complemento exacto del bug que lo originó en G-Vento, donde un `catch` devolvía
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
| 4 | **recetas** (`product_components`) | G-Nexo no tiene recetas | es la relación "un producto que al moverse descuenta N de otro" — o sea **bulto→unidad**, que G-Nexo **sí** necesita: se compra por bulto, se vende por unidad | **se renombra** |

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
son idénticas a las de G-Vento porque las skills citan por número (ver R1); tocar el cuerpo de R5
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

⚠️ **Ironía útil:** la decisión de usar `CHECK` ya estaba tomada en G-Vento **y por nuestro mismo
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

Al renombrar la marca heredada aparecio que **el codigo leia `VITE_GVENTO_SUPABASE_URL` mientras
`CLAUDE.md` y `.env.example` declaraban `VITE_GNEXO_SUPABASE_URL`**. Un `.env` escrito siguiendo la
documentacion no conectaba con nada.

**No lo introdujo el renombre: ya estaba, desde que se escribio el documento.** Cinco dias con dos
archivos declarando una cosa y el codigo leyendo otra, y nadie lo noto.

### Por que es la clase peor, segun la propia convencion

*"Una nota que dirige mal cuesta mas que una ausente. Si no podes verificar una afirmacion, no la
escribas como hecho."* La seccion de variables de entorno de `CLAUDE.md` no describia el estado del
repo: describia **la intencion** de quien lo escribio. Las dos se ven identicas en el papel y solo
se distinguen ejecutando.

⚠️ **Y el agravante que hace de esto un caso y no una anecdota: NO habia una sola fuente
equivocada, habia dos de acuerdo entre si.** `CLAUDE.md` y `.env.example` decian ambos `GNEXO`. Dos
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
| `VITE_GNEXO_SUPABASE_URL` | ✅ ahora `VITE_GNEXO_SUPABASE_URL` |
| `VITE_GNEXO_SUPABASE_ANON_KEY` | ✅ ahora `VITE_GNEXO_SUPABASE_ANON_KEY` |
| `VITE_GNEXO_SENTRY_DSN` | 🔴 `VITE_SENTRY_DSN` — **nunca van a coincidir** |

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
