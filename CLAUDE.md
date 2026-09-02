# Nodo — contexto del proyecto

> **Los tres archivos, y cuándo se lee cada uno:**
>
> | archivo | cuándo | qué tiene |
> |---|---|---|
> | **`CLAUDE.md`** (este) | **antes de trabajar, siempre** | convenciones + las **once reglas de clase** |
> | [`docs/BITACORA.md`](docs/BITACORA.md) | cuando una regla te parezca discutible, o necesites contexto | la evidencia medida de cada regla + el detalle de cada fase y sesión |
> | [`docs/DEUDAS.md`](docs/DEUDAS.md) | **al planificar** | deudas vigentes + ideas pospuestas (NO son backlog) |
>
> Estructura heredada de Vento, donde se separaron el 2026-08-26 porque de 36 afirmaciones
> auditadas, **las 8 falsas eran todas de ESTADO** y ninguna de regla: el registro es la parte
> que se pudre, y estaba mezclado con lo que hay que leer siempre.

> **Nombre FIJADO: Nodo.** Se verificó el riesgo marcario y por eso no lleva prefijo: en
> Colombia hay al menos cuatro entidades activas con raíz "Nexo" —Nexos Software S.A.S.
> (Envigado), Nexosoft (Bogotá), Nexo Logistics SAS, Nexos Group— y el cruce software +
> logística es nuestro terreno exacto. Agregar una letra no lo resolvía: **la SIC evalúa
> similitud fonética y conceptual, no la cadena literal.**
>
> ⛔ **Pendiente: el registro formal en la SIC, clases 9 y 42.** La verificación de riesgo
> no es un registro.
>
> **Convención de la familia, definitiva.** Los productos son la raíz sola, sin prefijo ni
> guion: **Vento · Mura · Cresco · Nodo**. La pertenencia a la casa la da el endoso, no una
> letra: hacia afuera se dice **"Nodo, de Giiron"**. En código, repos, paquetes, rutas y
> variables de entorno va **`nodo`** en minúscula, sin guion y sin "g". La marca madre se
> escribe siempre **Giiron**, con doble i.

---

## Descripción

Sistema de mostrador, catálogo, clientes y cartera para negocios que mantienen stock de muchas
referencias y venden sobre un mostrador, algunos a crédito: distribuidoras, mayoristas,
comercializadoras, ferreterías, droguerías, repuestos, aseo, alimentos, bebidas, consumo masivo.

Forkeado de Vento (POS de restaurantes) en agosto de 2026.

**El producto es horizontal.** Ningún módulo, tabla, permiso o texto de UI debe asumir un
vertical concreto. Si una pantalla dice "distribuidora", está mal: la misma pantalla la usa una
ferretería.

**Alcance (2026-08-31, tras la firma del primer cliente):** base técnica + catálogo + clientes +
cartera + pedidos + **compras, inventario, gastos y utilidades**. La condición que mantenía a estos
cuatro afuera era "hasta que haya cliente firmado", y se cumplió. ≈30.000 líneas.
**Se agrega respecto de Vento:** preventa, cupo de crédito, pedidos por WhatsApp/teléfono.
**No existe y no está planeado:** rutas propias, despacho, tracking. El cliente carga y se lleva.

🔴 **Inventario y compras NO viajan tal cual desde Vento.** Están en el **43,3% de zona gris**,
no en el 21,7% que se copia. Tres diferencias medidas: Vento descuenta stock **por receta**
(`add_order_items_with_extras`) y acá no hay recetas; la **unidad de compra difiere de la de venta**
(se compra por bulto, se vende por unidad) y eso no existe en un bar; y el **costo por producto** se
recalcula en cada compra en vez de derivarse de una receta. Tratarlos como copia es exactamente la
premisa que el diagnóstico advierte.

### 🔴 NO es un monorepo

**Una app Vite única.** No hay `apps/`, no hay `packages/shared`, no hay `pnpm-workspace.yaml`.

Se anota en negativo a propósito: el `CLAUDE.md` de Vento afirma ser un monorepo con
`apps/pos`, `apps/store`, `apps/mobile` y `packages/shared`, y **esa afirmación es falsa** — fue
la novena nota de estado falsa encontrada en ese repo y al 2026-08-31 sigue sin corregirse allá.
Cresco sí es un monorepo con pnpm workspaces; **eso no aplica acá**. Si algún día Nodo
necesita uno, será una decisión tomada y fechada, no una herencia asumida.

## Stack tecnológico

- Frontend: React 18, TypeScript (strict), Tailwind CSS, Vite
- Base de datos: Supabase (PostgreSQL + Auth + Realtime + Storage)
- Estado global: Zustand
- Fetching: React Query (@tanstack/react-query)
- Validación: Zod
- Íconos: lucide-react
- Fechas: date-fns

## Convenciones de código

- Componentes: PascalCase en archivos .tsx
- Hooks: camelCase con prefijo "use", en src/hooks/
- Tipos: PascalCase, sin prefijo I ni T
- Strings UI: en español (Colombia)
- Precios: siempre en COP con `Intl.NumberFormat('es-CO')`
- Fechas: siempre en zona horaria America/Bogota
- IDs: UUID v4 generados por Supabase

## Patrones establecidos

- Todos los componentes son funcionales con React hooks
- No usar `any` en TypeScript — usar `unknown` si es necesario
- Errores de Supabase siempre con react-hot-toast
- Mutaciones de BD siempre en hooks custom (`useXMutations`)
- Las queries de Supabase van en `src/hooks/`, no en componentes

## Comportamientos del negocio — NO son bugs, NO "arreglar"

*(Vacío al 2026-08-31 — no hay clientes.)*

Esta sección existe desde el día uno a propósito. Cuando un cliente haga algo que al mirar los
datos parezca una anomalía y sea en realidad una decisión suya, se anota **acá y antes** de que
alguna sesión lo "descubra" y proponga arreglarlo. En Vento pasó exactamente eso.

**No se hereda nada de esta sección de Vento.** Los comportamientos de G-10 y Salchimelo —las
mesas abiertas usadas como cuenta corriente interna, por ejemplo— son estado de negocio ajeno.

---

## 🔴 REGLAS DE CLASE — leer ANTES de trabajar (esto es lo único obligatorio)

> **Copiadas literales de Vento el 2026-08-31.** La numeración R0–R10 se mantiene idéntica a
> propósito: las skills citan las reglas **por número**, y renumerarlas rompería las referencias
> cruzadas entre los dos productos. Lo único que cambia es el **inventario de R1**, que es estado
> y por lo tanto se reconstruye para este repo.
>
> Nodo nace con esto puesto. A Vento le costó veinte días y once errores repetidos llegar acá.

Once reglas. Son la **forma corta**: accionables solas, sin abrir la evidencia. Cada una dice su
**modo de fallo**, porque los once errores repetidos del proyecto hermano no vinieron de
desconocer la regla sino de **no reconocer la situación**. Y cada una nombra su **clase** con las
palabras que uno grepearía (`allowlist`, `fail-open`, `por-id`, `validar-vs-forzar`,
`contrato compartido`), porque el paso 2 del pre-flight es justamente grepear la clase.

> **🔴 POR QUÉ UN RECORDATORIO NO ALCANZA — y el hook sí.** Un recordatorio que se puede **leer
> sin contestar se salta en silencio**; uno que **exige respuesta deja la omisión visible**. Esa
> es la diferencia real entre este bloque y el hook `PreToolUse`, y no es de contenido: los dos
> dicen lo mismo. Es de **distancia entre la carga y la decisión**. Medido en Vento el
> 2026-08-26: CLAUDE.md estaba cargado y decía "allowlist, nunca deny-list", y el guard deny-list
> igual se escribió — 200 líneas después de empezar la tarea, sin volver a mirar. Una skill habría
> tenido el mismo destino: **se carga al empezar la tarea, no cuando tomás la decisión.** Corolario
> para diseñar mecanismos: para lo que NO PUEDE FALLAR, hook (se evalúa en cada llamada a
> herramienta y pide un acto visible); para el procedimiento de una tarea infrecuente, skill; para
> la clase de decisión, estas reglas.

---

### R0 · PRE-FLIGHT — antes de escribir SQL o cualquier guard

Las mismas cuatro preguntas que inyecta el hook `PreToolUse`. Están **también acá a propósito**:
un hook no puede garantizar su propia existencia (si alguien lo borra, o se clona el repo sin él,
vuelve el silencio). Redundancia deliberada, igual que conservar la deny-list al invertir el
filtro a allowlist.

1. **CLASE** — ¿qué tipo de decisión es? (`allowlist/denylist` · `fail-open/closed` ·
   `validar/forzar` · `por-id/por-nombre` · `contrato compartido`). Nombrala en una frase.
2. **PRECEDENTE** — grep de esa clase en este documento y en `supabase/`.
3. **MODO DE FALLO** — si me equivoco, ¿qué pasa? Si es *borra datos ajenos* o *falla callado*
   ⇒ el diseño tiene que ser fail-closed.
4. **OBJETIVO** — ¿fijado por UUID, no resuelto por nombre? ¿Allowlist, no denylist?

Si hay `DELETE`/`UPDATE`/`DROP`: además `begin`/`commit`, y **contar las filas ANTES de tocarlas**.

---

### R1 · CONTRATO COMPARTIDO EN N LADOS

**Va primera porque es la única cuyo modo de fallo está ocurriendo AHORA, no en pasado.**

Cuando un valor vive en más de un archivo sin nada que los sincronice, **el mecanismo de
sincronización sos vos, y no existe**. Al tocar uno: enumerá los lados, tocalos todos en la misma
pasada, o poné una fuente única.

**Modo de fallo:** un lado se congela mientras los otros avanzan, y **nadie se entera hasta que un
flujo se cae**. No hay error, no hay test rojo: hay una pantalla vacía meses después.

**📋 INVENTARIO DE LOS CONTRATOS VIVOS HOY.** *Al 2026-08-31. Para reconfirmarlo,
`grep -rln '<un valor del contrato>' src/ supabase/ tests/`.*

En Nodo el problema es **más grave que un fork normal**: los dos productos se parecen mucho y,
según el propio prospecto, **no se espera que diverjan** en los próximos meses. Un defecto
arreglado en un lugar **no llega solo a su hermano** — nueve repeticiones en veinte días, medido
en Vento.

1. **Catálogo de permisos RBAC.** **NO se comparte** el catálogo con Vento: Nodo necesita el
   suyo. Lo que se copia es el **generador**, que allá ya está hecho y aplicado (2026-08-31):
   7 lados pasaron a 2. Fuente `SYSTEM_ROLES` en `src/lib/permissions.ts`; salida, la función
   `seed_system_roles(p_org)` que los seeds llaman. **No** son bloques generados y pegados: una
   copia generada se edita a mano igual de fácil que una escrita a mano.
   Diseño a replicar sin cambios: `admin = ALL_PERMISSION_KEYS` **derivado**, nunca enumerado
   (enumerarlo dejó las 4 copias de Vento con 16/20/18/23); la función **no** es
   `SECURITY DEFINER` y revoca también a `authenticated`; dos guards fail-closed (`p_org` null y
   organización inexistente).
   🔴 **La verificación es un check de CI (`regenerar && git diff --exit-code`), NO un hook.** Un
   hook dispara cuando tocás un archivo, y el fallo documentado fue un seed congelado **porque
   nadie lo tocó**. Un hook no detecta omisiones; el check de árbol sí.
   ⚠️ Residuo heredado a no repetir: en Vento, `ventas.anular` **no estaba en
   `PERMISSION_GROUPS`**, así que se enforceaba pero no se podía conceder desde la UI de Roles.
   ⚠️ Y una clave en el catálogo **no** es evidencia de que algo esté protegido: allá 6 permisos
   no gateaban nada y fallaban **abierto**.

2. **Filtro de PII de Sentry.** Ya triplicado en Vento y **con drift medido**. Es el contrato
   que más justifica extraerse a paquete real. Nodo arranca con la versión **corregida**, no con
   la que tiene huecos.

3. **`subscription_status` — 6 lados, TRES REPOS.** ⚠️ **Corregido el 2026-08-31: NO es un enum**, es `text` con `CHECK`. Se verifico leyendo el SQL; la version anterior de esta nota decia "enum" y dirigia mal justo donde importa, porque la asimetria enum/CHECK es la que decide si sumar un estado es caro. Ampliar el CHECK es un `drop`/`add constraint` trivial, y la decision ya venia tomada de Vento por esa misma razon. Ya eran 4 lados y 2 repos entre
   Vento y Centro; Nodo agrega los suyos. **No existe ningún mecanismo que garantice el
   aviso.** El aviso a Centro va ANTES del deploy, no después. **Paquete real.**
   📋 Lados **dentro de este repo**, enumerados el 2026-08-31 y **consistentes entre si**: el CHECK
   de `supabase/02b-suscripcion.sql` · `ESTADOS` en `supabase/functions/aplicar-estado/index.ts` ·
   `ESTADOS` en `tests/suscripcion-estado.spec.ts` · `resolveNotice()` en
   `src/hooks/useSubscriptionStatus.ts`, que maneja solo 2 de los 5 **a proposito y con test que lo
   asevera**. ⚠️ `src/types/database.types.ts` lo tipa como `string`: TS **no** atrapa un valor invalido.

4. **`payment_method` — de 4 lados a 8.** No estaba en el inventario original de Vento. Vigilar
   desde el primer commit.

5b. **🔴 EL RETORNO `jsonb` DE UNA RPC vs su interfaz escrita a mano.** *Lado nuevo, agregado el
   2026-09-01 tras un caso medido.* `supabase.rpc()` devuelve `Json`, así que el resultado se
   castea a una interfaz de `src/lib/supabase-helpers.ts` — y **TS valida los accesos contra esa
   interfaz, no contra la función**. Los lados son tres: el `jsonb_build_object` de la migración,
   la interfaz, y el consumidor.
   ⚠️ **Y NO es el mismo caso que el punto 5, es peor:** una **tabla** mal tipada suele reventar en
   la primera consulta —la columna no existe y PostgREST lo dice—. Un **`jsonb` mal tipado no
   revienta: devuelve `undefined`, que es falsy, así que el código ELIGE UNA RAMA.** El error no se
   manifiesta como error sino como *comportamiento distinto*.
   📋 **Cómo se audita, y es mecánico:** comparar las claves del `return jsonb_build_object` de cada
   RPC contra su interfaz. Enumerado el 2026-09-01: `register_debt_payment` tenía `shift_open`
   declarado y jamás enviado (bug real, corregido), `register_sale_void` declara `was_fiado` y no lo
   manda, y `register_purchase` manda `cash_movement_id` sin declararlo.

5. **`src/types/database.types.ts` escrito a mano vs la BD real.** El CLI de Vento da 403 de
   management y varias entradas se agregaron a mano. Los tipos pueden divergir del esquema **sin
   que `tsc` lo note** — el proxy exacto que R4 prohíbe confundir con la cosa real. En Nodo:
   verificar que el CLI funcione **antes** de escribir la primera migración.

6. **Tabla de columnas de `src/lib/sentry.test.ts` vs el esquema real.** En Vento son 74
   entradas. Agregar una columna al esquema obliga a agregarla ahí, en la misma sesión.

7. **Nombre de la entidad sede — `sede_id`. ✅ CERRADO el 2026-09-01.** En Vento no se renombra:
   allá "restaurant" es **cierto**. Acá sería **falso**, y un nombre falso dirige mal.
   📋 **Estado, y cómo reconfirmarlo:** `grep -rn restaurant_id src/ tests/ supabase/functions/` →
   **cero**. `src/` y `tests/` llegaron a cero **sin una pasada de renombre**: se fueron alineando
   al escribir el esquema base y los consumidores del grupo 29.
   🔴 **El criterio "el conteo llega a cero" era INALCANZABLE, y por la misma razón que en la
   verificación de marca.** `supabase/_heredado/` tiene **610 ocurrencias** y **no se tocan**: es
   registro de procedencia, y renombrarlo haría que un archivo archivado describiera un esquema que
   nunca tuvo. Las menciones en `docs/` y en este archivo son **históricas** —dicen qué se
   renombró— y también se quedan. **El criterio correcto es por LISTA:** cero en el código **ejecutable**
   (`src/`, `tests/`, `supabase/functions/`), y todo lo demás enumerado como mención histórica
   legítima. Las dos que quedan en `supabase/migrations/` son **comentarios** que nombran el
   nombre viejo —uno dice que src ya está en cero, el otro que `get_my_sede_id` es ex
   `get_my_restaurant_id`—: procedencia, no código.
   ⚠️ **Lo que el renombre destapó, que era lo caro:** la Edge Function `create-user` seguía
   exigiendo `restaurant_id` mientras `src` y los tests mandaban `sede_id`. **Crear un usuario
   estaba roto de punta a punta** y ningún verificador lo veía —una Edge Function corre en Deno,
   fuera de `tsc` y de ESLint—. Ver el corolario de los strings.

8. **🔴 Costo unitario grabado en la línea de venta — DECIDIDO el 2026-08-31.** El costo se
   **congela en el momento de vender**, no se calcula después leyendo el costo actual del producto.
   Si se calculara después, cada compra nueva cambiaría las utilidades de meses pasados y el
   reporte daría distinto cada vez que se abre — perfil exacto del fallo silencioso de R7.
   Grabándolo, la historia queda fija y el método de costeo se puede cambiar sin reescribir el
   pasado. Es un contrato entre la venta, el inventario y utilidades.

8. **🔴 `profiles.role` es un ENUM de Postgres, no texto.** Agregar un rol de sistema con nombre
   nuevo **no es editar una constante**: es un `ALTER TYPE` en producción, referenciado por
   policies. La constante de TS crece libre; el enum no. Es un contrato compartido **de los
   rígidos**, y el lado caro no está en el repo sino en la base.

9. **Los hooks mismos.** `.claude/settings.json` y `.claude/hooks/sql-checklist.mjs` viven ahora
   en dos repos con la misma lógica y nada que los sincronice. No estaba en el inventario de
   Vento porque allá era un solo lado. Si arreglás el matcheo de permisos en un repo, **no
   llega solo al otro**.
   🔴 **YA DIVERGEN — decisión tomada el 2026-08-31, no un descuido.** Nodo le agregó al hook un
   **ledger de disparos** (`.claude/hook-ledger.jsonl`, ignorado por git) y Vento **no lo tiene**.
   Se aceptó la divergencia porque el ledger es un **instrumento de medición** de la deuda #22, no
   una mejora del mecanismo: medir en un repo alcanza, y el volumen de disparos de Vento no es
   comparable con el de Nodo. ⚠️ **El corolario es la parte que importa:** cuando la deuda #22 se
   resuelva y el cambio sea al **matcheo**, ese sí va a los dos repos. La regla práctica que queda:
   **instrumentar puede divergir; corregir, no.**

→ **Evidencia:** repo de Vento, `docs/BITACORA.md` → *"FASE 1 — estado de suscripción"*.

---

### R2 · ALLOWLIST vs DENY-LIST · FAIL-CLOSED

Lo permitido se declara **positivamente**; lo prohibido nunca se enumera. Un objetivo destructivo
se fija por **UUID**, no se resuelve por nombre.

**Modo de fallo:** una deny-list **deja pasar en silencio** todo lo que nadie se acordó de
escribir, y lo que no está en la lista no existe hasta que estalla. La allowlist falla cerrándose,
que se nota. Corolario: **un `catch` que convierte un error en `''` es fail-open** — el error
tiene que salir ruidoso.

→ **Evidencia:** repo de Vento, `docs/BITACORA.md` → *"Filtros de privacidad: ALLOWLIST por
clave, nunca deny-list"* · en código: el guard de `supabase/demo-seed-cafeteria.sql`.

---

### R3 · DEFECTO DE CLASE vs INSTANCIA

Al arreglar un bug, nombrá **la clase** (no el síntoma), grepeá esa forma en todo el repo, y
arreglá las hermanas **en el mismo commit** aunque estén en verde.

**Modo de fallo:** la instancia huérfana estalla meses después y **nadie la asocia con este
arreglo**, así que se paga el diagnóstico entero de nuevo.

⚠️ **En Nodo esta regla cruza el límite del repo.** Mientras los dos productos se parezcan, la
pregunta "¿tiene hermanas?" incluye a Vento. Ver R1.

→ **Evidencia:** repo de Vento, `docs/BITACORA.md` → *"Un defecto de CLASE se barre en toda la
suite, no solo donde estalló"* — locator de `anular-venta`, las 15 copias del patrón inerte, y el
caso #11 (el hook mudo).

---

### R4 · VERIFICAR CONTRA LA COSA REAL, NO CONTRA UN PROXY

Ante un número raro, mirá el dato (`select`, `information_schema`), no la intuición. **`tsc` no
prueba el SQL** — triggers, RLS y vistas solo se verifican ejecutando con datos reales. Y antes de
copiar un patrón de referencia, `command -v` sus dependencias.

**Modo de fallo:** el proxy dice OK y concluís que funciona. **"Es el patrón canónico" no es
evidencia de que funcione acá:** `jq` no estaba instalado en la máquina de Vento y el hook habría
nacido mudo si se copiaba el ejemplo oficial.

**⚠️ Límite de esta regla, descubierto en Vento el 2026-08-31:** sobre **artefactos
generados**, el archivo que acabás de escribir **no es el que git materializa** — con `autocrlf`
son distintos. Un check de artefacto se valida **después de un checkout**, no en la sesión que lo
creó. El defecto del CRLF mordió al parche que lo documentaba, en el mismo turno.


**🔴 COROLARIO — POR QUÉ LEER NO ALCANZA.** R4 dice *qué* hacer. Esto dice *por qué*, que es lo
que hace que se aplique cuando nadie está mirando:

> **La coincidencia entre dos declaraciones no es evidencia: es la misma afirmación escrita dos
> veces.**

Dos fuentes que coinciden **se leen como confirmación**, y esa es la trampa. Si las dos son
declaraciones —un documento, un comentario, un `.env.example`, un tipo escrito a mano— coincidir no
prueba nada sobre el mundo: **ninguna de las dos ejecuta**. Se confirman entre sí con la misma
autoridad con que se equivocan juntas.

Y hay algo peor que la falta de evidencia: **leer una declaración falsa la confirma.** Cada lectura
la deja igual de intacta y un poco más creíble, porque ahora "ya la revisamos". Un documento no se
audita releyéndolo; se audita ejecutando contra él.

**Caso medido (2026-08-31).** `CLAUDE.md` y `.env.example` declaraban `VITE_NODO_SUPABASE_URL`
mientras el código leía `VITE_VENTO_SUPABASE_URL`. **Dos documentos de acuerdo entre sí, cinco
días**, leídos muchas veces —para escribir el esquema, para citar R1, para el runbook— y ninguna
lectura lo destapó. Lo destapó **enumerar qué consume el código y comparar**. Un `.env` escrito
siguiendo la documentación no conectaba con nada.

**El corolario del corolario, que es lo accionable:** una verificación **que no podía haber salido
mal no es una verificación**. Antes de creerle a un verde, preguntá cómo se vería el rojo. Si no
hay respuesta, lo que se midió es una tautología.

*Ejemplo de aplicarlo, del mismo día:* para confirmar que el DSN de Sentry ya llegaba, no se
grepearon los nombres —eso son otra vez dos declaraciones—: se compiló con un DSN centinela y se
buscó **el valor en el bundle**, y después se recompiló con el nombre viejo para confirmar que
**el centinela desaparecía**. Recién ahí el verde valía algo.

**🔴 EL CASO PARTICULAR QUE MÁS ENGAÑA — y ya es la TERCERA vez que un control negativo salva
una verificación en este proyecto:**

> **Una API que contesta sobre la CAPACIDAD DEL SISTEMA no verifica la PRESENCIA DE UN RECURSO.**

Las dos preguntas se escriben casi igual —*¿está X?* y *¿se puede X?*— y **la segunda tiene
fallback**, así que contesta que sí para todo. Una sonda escrita sobre la pregunta equivocada da
verde con el recurso puesto y verde sin él: es la tautología del corolario de arriba, pero
disfrazada de API oficial.

**Caso medido (2026-09-01), verificando que Inter estuviera cargada:**

```
document.fonts.check('16px Inter')               ->  true    ✅ parecía evidencia
document.fonts.check('16px NoExisteEstaFuente')  ->  true    🔴 el control negativo
```

`check()` no contesta *¿está cargada Inter?*: contesta **¿se puede pintar este texto?** — y siempre
se puede, hay fuente de respaldo. Con familia correcta o inventada, idéntico.

**El instrumento que sí discrimina no PREGUNTA: MIDE.** El ancho del mismo texto:

| familia | ancho |
|---|---|
| `Inter` | **392,89 px** |
| `system-ui` | 364,30 px |
| familia inexistente | **364,30 px** ← cae EXACTO en system-ui: la medición distingue |
| `Inter` peso 450 vs 400 | 395,39 / 392,89 ← el eje variable está vivo |

**Lo accionable, y cuesta una línea:** correr la misma sonda contra algo que **sabemos que no
existe**. Si contesta lo mismo, el instrumento no mide — sin importar cuán oficial sea la API.

→ **Evidencia:** *"Aprendizajes de proyectos hermanos"* más abajo · repo de Vento,
`docs/BITACORA.md` → *"Trampas de TERMINAL"*.

---

### R5 · MIGRACIÓN APLICADA = INMUTABLE

Todo cambio de esquema va en un archivo **nuevo**. Jamás se edita una migración ya ejecutada.

**Modo de fallo:** el archivo y la BD divergen **en silencio**; el repo describe un esquema que no
existe y el próximo que lo lea razona sobre ficción.

→ **Evidencia:** *"Aprendizajes de proyectos hermanos"* más abajo.

---

### R6 · UN INVARIANTE DE DATOS NO PUEDE DEPENDER DE QUIÉN MIRA

Una función que **valida datos** debe ser `SECURITY DEFINER`. Sin eso su `select` pasa por RLS y
evalúa **datos filtrados por el observador** — y la organización de una sede es la misma la mire
quien la mire. Corolario: un trigger de invariante **VALIDA, no fuerza**; forzar reescribe en
silencio y el resultado pasa a depender del orden de disparo.

**Modo de fallo:** rechaza operaciones válidas con un mensaje que **apunta al lugar equivocado**.
En Vento fue fail-closed por suerte, no por diseño.

→ **Evidencia:** repo de Vento, `supabase/fix-enforce-profile-organization-definer.sql` ·
`docs/BITACORA.md` → grepear `enforce_profile_organization`.

---

### R7 · LÍMITES DE DÍA SOBRE TIMESTAMPS UTC

`created_at` vuelve en **UTC**. Toda frontera de día, semana o mes se calcula en `America/Bogota`,
nunca sobre el timestamp crudo. Aplica a reportes, arqueo, cartera, cortes y seeds.

**Modo de fallo:** **no revienta.** Da un número plausible y equivocado, y el cliente lo detecta
antes que vos. Es el perfil exacto de fallo silencioso que se paga caro.

→ **Evidencia:** repo de Vento, `docs/BITACORA.md` → *"Detalle Vale descuento / ruletazo"*
(grepear `getVouchersTotal`).

---

### R8 · ARTEFACTOS ANTES DE RE-CORRER

Ante un test rojo: leer `test-results/**/error-context.md` (el **valor recibido**), después el
trace, y recién ahí re-correr.

**Modo de fallo:** Playwright **borra `test-results/` al arrancar**. Re-correr destruye la única
evidencia — y un flake, por definición, no se reproduce a pedido.

→ **Evidencia:** repo de Vento, `docs/BITACORA.md` → *"ANTE UN FALLO: LEER LOS ARTEFACTOS ANTES
DE RE-CORRER"*.

---

### R9 · EL EXIT CODE QUE TE MUESTRAN NO ES EL QUE PENSÁS

Nunca leas el resultado de una suite desde una **tubería** (`| tail` devuelve el exit de `tail`)
ni desde la **notificación de tarea en segundo plano** (reporta el exit del *shell*). Escribí el
código **dentro** del archivo de salida y grepealo.

**Modo de fallo:** verde falso anunciado como verdadero. Medido: la notificación dijo *"exit code
0"* **4 de 4 veces, con dos suites rojas**.

→ **Evidencia:** repo de Vento, `docs/BITACORA.md` → *"Trampas de TERMINAL — el síntoma no señala
la causa"*.

---

### R10 · UNA SUITE VERDE NO PRUEBA NADA — AUDITAR POR MUTACIÓN

Si una suite pasa entera a la primera, sospechá. Mutá el sujeto a identidad y corré: **los que
sobreviven no lo están probando**. Buscá aparte la clase que el mutante no ve: aserciones que
serían verdaderas para cualquier entrada. El discriminador es el **contraste** —positivo y
negativo en la misma aserción—. Los tests que verifican *ausencia de redacción de más* no pueden
fallar contra un no-op: son legítimos y van MARCADOS.

**Modo de fallo:** el test pasa **por la razón equivocada** y da confianza sin cobertura. Medido en
Vento: de 246 tests, **25 sobrevivieron al mutante y 58 más eran invisibles para él**.

**⚠️ Límite de esta regla, descubierto en Vento el 2026-08-31:** un mutante **no encuentra lo
que la fixture no reproduce**. "Los 4 mutantes murieron" prueba que los tests miran al sujeto, no
que las entradas cubran el mundo. La cobertura de entradas se audita aparte.

→ **Evidencia:** repo de Vento, `docs/BITACORA.md` → *"Auditar una suite por MUTACIÓN, no
leyéndola"*.

---

### R? · UNA GARANTÍA FALSA DONDE SE DECIDE LE GANA A TRES ADVERTENCIAS DONDE SE CODEA

⛔ **Regla nueva, sin número asignado.** Salió del caso #13 de Vento el 2026-08-31 y todavía no
tiene número allá. **No la numero acá por mi cuenta:** las skills citan por número y R1 es
exactamente sobre esto — asignarle un R11 unilateral crea un contrato divergente entre los dos
repos el primer día. Numerarla en Vento primero, después acá.

Al escribir una garantía, **nombrá el mecanismo y su límite**. "Está aislado" no es verificable;
"aislado por RLS + credenciales, y el check mira la organización, no la base" sí.

**Modo de fallo:** tres archivos del repo decían la verdad y el único que mentía era el documento
de planificación — **y ganó**. Una nota que tranquiliza mal es peor que una que dirige mal.

🔴 **LA MISMA REGLA MEDIDA DESDE EL OTRO LADO (2026-09-01):**

> **Una advertencia falsa induce el error que dice prevenir.**

En el caso #13 una **garantía falsa** tranquilizaba de más. Acá una **advertencia falsa** alarma de
más: la UI del abono decía *"el efectivo no entró a caja"* **cuando sí había entrado**, y la
reacción natural de un cajero ante ese cartel es **registrar el ingreso a mano** — o sea, duplicarlo.
El aviso no falla omitiendo: **falla causando**.

🔴 **Y HAY UNA TERCERA MITAD, medida el 2026-09-02 en el arqueo de caja:**

> **Una CONFIRMACIÓN falsa apaga la alarma que debería sonar.**

La garantía falsa tranquiliza de más; la advertencia falsa alarma de más; **la confirmación falsa
dice "todo bien" justo donde algo está mal**. Es la más silenciosa de las tres, porque no produce
ninguna acción equivocada: produce **la ausencia de una acción correcta**.

**El caso.** El cierre de caja pintaba el **sobrante en VERDE** —el color reservado a la
confirmación— y el **cuadre en GRIS**. Traducido a lo que el color afirma: *que a la caja le sobre
plata es un buen resultado*, y *que cuadre es un dato más*. Las dos afirmaciones son falsas y la
segunda invierte la primera.

**Un sobrante es un descuadre exactamente igual que un faltante:** significa que algo **no se
registró** — una venta que no se cobró en el sistema, un vuelto mal dado, una base mal contada. El
único resultado bueno del arqueo es *cuadrado*, y era el que no tenía color.

⚠️ **Por qué es peor que un faltante mal pintado:** un faltante duele y se investiga aunque el color
esté mal. Un sobrante en verde **se archiva**. La plata de más se queda en el cajón y nadie busca de
dónde salió.

**Lo accionable, y aplica a cualquier estado que se pinte:** preguntá qué AFIRMA el color, no si
combina. Verde afirma *"esto salió bien"*. Si el estado no es un resultado bueno, el verde miente —
y miente en la dirección que menos se revisa.

Las tres mitades son el mismo principio: **una afirmación falsa en el punto de decisión le gana al
código correcto.** No importa que la base esté impecable si la pantalla dice lo contrario; el que
actúa es la persona, y la persona lee la pantalla.

⚠️ Corolario para escribir avisos: un mensaje de degradación tiene que salir de **la misma fuente
que decidió degradar**, no de una condición re-derivada en el cliente. Acá la RPC ya devolvía
`requiere_conciliacion`; el cliente lo estaba recalculando —mal— desde otra clave.

→ **Evidencia:** repo de Vento, caso #13.

---

### ⚠️ CRITERIO SIN NÚMERO · UN VALOR QUE SIGNIFICA DOS COSAS NO ES UN DATO

⛔ **Sin número por la misma razón que la regla de arriba:** las skills citan por número y
renumerar rompe las referencias cruzadas con Vento. Es un **criterio de diseño**, y se aplica igual.

Cuando una sola columna, campo o valor carga **dos preguntas distintas**, no guarda las dos: guarda
una mezcla de la que **ninguna se puede recuperar después**. El costo no se paga al escribirlo — se
paga el día que alguien quiere cruzar los dos ejes y descubre que el dato nunca existió.

**Modo de fallo:** no hay error, no hay `null`, no hay test rojo. Hay una consulta que devuelve algo
plausible y una pregunta que **ya no tiene respuesta posible**, ni siquiera reprocesando.

**Tres casos medidos en este proyecto, en tres capas distintas:**

| Caso | Las dos cosas que significaba | Cómo se separó |
|---|---|---|
| `cash_movements.reason` | **clasificación** del movimiento **+ detalle** libre | Se agregó `categoria` con allowlist; `reason` quedó **solo** como detalle |
| `debt_payments.cash_movement_id` nulo | "el abono **no tocó caja**" **+** "la jornada estaba cerrada" | Se agregó `requiere_conciliacion`, `not null default false` |
| `orders.canal` (propuesto) | **por dónde entró** el pedido **+ quién lo originó** (`preventa`) | `preventa` queda afuera; el originador ya vive en `created_by` |

**Lo accionable, y es una pregunta sola:** antes de agregar un valor a un allowlist o una columna,
preguntá **cuántas preguntas contesta**. Si son dos, son dos columnas — aunque hoy parezca que una
alcanza, y **sobre todo** si el valor nuevo se lee natural al lado de los otros. `preventa` se leía
perfecto al lado de `whatsapp`; eso es justamente lo que hace peligrosa a la mezcla.

⚠️ Es primo del corolario de R4 —**la coincidencia entre dos declaraciones no es evidencia**— por el
otro lado: allá dos fuentes distintas dicen lo mismo y parece confirmación; acá una sola fuente dice
dos cosas y parece economía.

---

### ⚠️ CRITERIO SIN NÚMERO · LA URGENCIA DE UN DESAJUSTE LA DECIDE LA DIRECCIÓN DEL FALLO

*Dos casos medidos el 2026-09-01, en capas distintas. Se escribe una vez porque es la misma forma.*

Ante dos desajustes que **parecen simétricos** —falta algo de un lado, sobra del otro— la reacción
natural es tratarlos igual, o priorizar por tamaño. **Las dos son erróneas.**

> **Los desajustes simétricos no son simétricos: uno miente y el otro desperdicia.**
> La urgencia la decide **hacia dónde falla**, no cuánto difiere.

| Caso | Un lado | El otro |
|---|---|---|
| **Listas** (`sentry.ts`) | un patrón de más en el **regex de redacción** → **redacta de más**, falla **cerrado**: conservarlo es gratis | una clave de más en el **allowlist** → **deja pasar de más**, falla **abierto**: conservarla es una fuga |
| **Contrato RPC↔TS** | **TS declara y la RPC no manda** → `undefined`, falsy, **rama equivocada en silencio**: MIENTE | **la RPC manda y TS no declara** → el dato existe y nadie lo usa: DESPERDICIA |

En los dos, la mitad que **afloja o miente** es urgente y la que **endurece o desperdicia** puede
esperar. Medido: `shift_open` declarado-y-no-enviado provocó una advertencia falsa en producción de
la UI; `cash_movement_id` enviado-y-no-declarado no rompió nada en meses.

**Lo accionable, en una pregunta:** ante un desajuste, no preguntes *cuánto* difieren los dos lados
— preguntá **qué pasa si nadie lo arregla**. Si la respuesta es *"algo se comporta distinto sin
avisar"*, es urgente. Si es *"algo no se puede usar"*, es una anotación.

⚠️ Y el corolario que ahorra trabajo: **arreglar la mitad urgente NO obliga a arreglar la otra en la
misma pasada.** Tratarlas como un solo ítem —"hay que sincronizar los contratos"— es lo que hace
que una tarea de diez minutos parezca de un día y se posponga entera.

---

### ⚠️ CRITERIO SIN NÚMERO · AL QUITAR UN TÉRMINO, DECIDE LA DIRECCIÓN DEL FALLO — NO LA CONSISTENCIA

*Medido el 2026-09-01, podando el vale. Dos listas, el mismo término muerto, decisiones OPUESTAS y
las dos correctas. Es el caso particular del criterio de arriba, aplicado al momento de BORRAR.*

Cuando una poda deja un término huérfano en una lista, la pregunta **no** es "¿ya no existe, así que
lo saco?". Es:

> **Si me equivoco y lo dejo, ¿el error afloja o endurece?**

| Lista | Qué hace un término de más | Al podar |
|---|---|---|
| **Regex de redacción de PII** (`sentry.ts`) — `waiter\|mozo` | **REDACTA de más** → falla **CERRADO**. Sacarlo solo puede **destapar** un dato. | **SE CONSERVA** |
| **Allowlist de claves conocidas** (`sentry.ts`) — `discount_kind` | **DEJA PASAR de más** → falla **ABIERTO**. Conservarlo solo puede **filtrar**. | **SE SACA** |

Las dos entradas nombraban columnas que ya no existen. La consistencia diría "tratalas igual"; la
dirección del fallo dice lo contrario, y la dirección del fallo tiene razón. **Una lista que
PROHÍBE y una que PERMITE se podan al revés.**

⚠️ **Es R2 aplicada a la poda**, y por eso vale escribirlo: R2 dice cómo construir la lista, no qué
hacer cuando encoge. La respuesta es la misma idea —lo permitido se declara positivamente, lo
prohibido nunca se enumera— leída en el momento de borrar: **hacia el lado que prohíbe, quedarse de
más es gratis; hacia el lado que permite, es una fuga.**

---

### 🔴 CRITERIO SIN NÚMERO · EN ESTE PROYECTO LOS INSTRUMENTOS DE MEDICIÓN FALLAN MÁS QUE EL CÓDIGO MEDIDO

*Tres casos en dos días, 2026-09-01 y 02. No es mala suerte: es una propiedad del oficio que no
estábamos contando.*

> **Un número plausible no es un número verificado.**

| Instrumento | Debía medir | Qué medía de verdad | Cómo se cazó |
|---|---|---|---|
| `document.fonts.check('16px Inter')` | si Inter está cargada | **si el texto se puede pintar** — siempre sí, hay fallback | **control negativo**: dio `true` para una familia inventada |
| `grep -rl "const formatCOP" src/` | copias del formateador | también **las menciones en comentarios**, la del propio comando incluida | **enumerando**: la lista tenía 18 nombres y 16 eran definiciones |
| `grep -coE '#[0-9a-fA-F]{6}'` | hexes por archivo | **solo los de seis dígitos**: no veía `#fff` | **enumerando**: cinco pantallas "en cero" tenían 47 blancos |
| **un script propio de migración** | insertar imports al final del bloque | matcheaba `^import .*$` y **partía un import MULTILÍNEA por la mitad** | `tsc`, en el acto |

**Los tres daban un número creíble.** Ninguno daba error, ninguno se veía roto, y los tres
sostenían una afirmación que se escribió en un commit como si fuera un hecho medido.

**Por qué pasa más con los instrumentos que con el código:** el código tiene tests, tipos, RLS y
usuarios que se quejan. **Un instrumento de medición no tiene a nadie del otro lado** — su salida se
lee una vez, se cree, y se cita después como dato establecido. Un grep mal escrito es código sin
tests corriendo en producción sobre nuestras propias conclusiones.

🔴 **Y hay un agravante que este proyecto ya conoce por otro lado:** una medición falsa
**tranquiliza**. "Cero hexes" cerró cinco pantallas que no estaban cerradas. Es exactamente el
corolario de R4 — leer una declaración falsa la confirma — aplicado a un número en vez de a una
nota.

**LO ACCIONABLE, y son dos técnicas, no una:**

1. **Control negativo** — corré el instrumento contra algo que **sabés que no existe**. Si contesta
   lo mismo, no mide. Cuesta una línea.
2. **Enumerar antes de contar** — pedile la LISTA, no el número, y mirala. Un conteo esconde qué
   contó; una lista lo muestra. Los dos greps se cazaron así, y ninguno se habría cazado mirando
   el total.

🔴 **EL CUARTO ES DE OTRA ESPECIE, y por eso vale aparte: el instrumento era UN SCRIPT NUESTRO.**
Los tres primeros median mal; éste **rompía el archivo**. Y lo relevante es que **había funcionado
las cuatro veces anteriores** — en las cuatro, el último import del archivo era de una sola línea.

> **Una herramienta propia que funcionó cuatro veces no está VERIFICADA: está SIN REFUTAR.**

Es R10 aplicada a las herramientas en vez de a los tests: *si pasa siempre, sospechá de la entrada,
no del código*. Cuatro éxitos sobre entradas que casualmente compartían una forma no dicen nada
sobre la quinta. Y a diferencia de un test, **un script de migración no tiene quien lo audite**: su
única prueba es el archivo que produce.

✅ **Lo que salvó éste fue barato y ya estaba puesto:** `tsc` después de cada script, siempre, aunque
el cambio "sea solo cosmético". Cuatro pantallas de barrido de colores no necesitaban compilador —
hasta que sí.

⚠️ Corolario para escribir: cuando un commit o una nota afirme un número, **dejar escrito el
comando que lo reproduce** — y haberlo corrido con una de las dos técnicas antes de pegarlo. Un
número sin comando es una opinión con dígitos.

---

### ⚠️ CRITERIO SIN NÚMERO · LA MISMA REGLA PUEDE ELEGIR EL LADO PERMISIVO — Y ENTONCES HAY QUE ESCRIBIR EL DISPARADOR

*Tercera aplicación de la asimetría de la dirección del fallo, y la primera en que el resultado es
**abrir** en vez de cerrar. 2026-09-01, al modelar la unidad de compra.*

Las dos primeras veces, preguntar *"¿hacia dónde falla?"* dio **cerrar**: conservar el patrón de
redacción, sacar la clave del allowlist. Esta vez la misma pregunta dio lo contrario, y por eso vale
escribirlo — para que no se lea como una excepción:

> **R2 no dice "cerrá siempre": dice que lo permitido se declara positivamente y que el diseño lo
> decide el modo de fallo. Cuando lo que se cuela por el lado abierto es una ETIQUETA y no un dato
> que mienta, el lado abierto es el correcto.**

**El caso.** `purchase_invoice_items` gana dos columnas: `purchase_unit` (bulto, canasta, caja) y
`units_per_purchase_unit` (el factor). Las dos podrían llevar allowlist. Se decidió:

| Columna | Decisión | Qué se cuela si me equivoco |
|---|---|---|
| `purchase_unit` | **texto libre** | un typo en una etiqueta: `"Bulto"` vs `"bulto"`. Cosmético. |
| `units_per_purchase_unit` | **`CHECK` en la base + guard en la RPC** | un costo unitario multiplicado por el tamaño del empaque, **congelado para siempre** en `order_items.unit_cost`. Dinero. |

Una allowlist cerrada de presentaciones **bloquea al cliente** el día que llegue una nueva
—guacal, arroba, paca—, y eso es un costo real contra un riesgo cosmético.

🔴 **LA CONDICIÓN, que es lo que hace honesta la decisión: elegir el lado permisivo obliga a
escribir SU DISPARADOR.** No *"algún día se normaliza"* —eso no se ejecuta nunca— sino el hecho
concreto que lo vuelve insuficiente:

> **El día que haya un reporte POR PRESENTACIÓN, el texto libre deja de servir: `"bulto"` y
> `"Bulto"` son dos filas.** Ahí se normaliza.

Está escrito en el `comment on column`, que es donde lo va a leer quien escriba ese reporte.

---

### ⚠️ CRITERIO SIN NÚMERO · MIGRAR UN TEST ENTRE DOS UI CONSERVA EL SUJETO, NO LAS ASERCIONES

*Defecto propio, medido el 2026-09-01.*

El corolario de la propiedad dice **qué** test migrar. Este dice **cómo**, porque migrar bien el
sujeto no alcanza:

> Al mover un test de una pantalla a otra, **cada aserción sobre el DOM hay que re-derivarla de la
> pantalla nueva.** Las que miran la **base de datos** sí viajan: el sujeto es el mismo.

**Caso medido.** El test `VENTA GRATIS` se migró de la caja de Mesas al POS —correctamente: su
sujeto era el clamp del descuento, no el flujo de dos fases—. Pero viajó también esto:

```ts
await expect(page.getByTestId('discount-amount')).toHaveValue('18.000')
```

**Falso en el POS.** Su input renderiza `String(discount)`: sin formato de miles y **sin clamp**. El
clamp existe, pero en el CÁLCULO (`discountAmt = Math.min(discount, subtotal)`), no en el campo. La
aserción venía de la caja de Mesas, que sí formateaba. Las tres aserciones contra la BD
—`order.total`, `discount_amount`, `paymentCount`— eran correctas y siguen siéndolo.

🔴 **Lo que lo hace grave no es el error: es que no lo cazó ningún verificador.** `tsc` ve un
string; ESLint ve un string; los E2E no corren sin `.env`. Apareció **por casualidad**, leyendo el
código del input mientras se podaba otra cosa.

**Lo accionable:** un test migrado entre pantallas es **código nuevo y no verificado**. Se marca
como tal —en el propio test— hasta que la suite corra de verdad. Y es una razón concreta más para
que la suite E2E pueda correr: es el único verificador que mira esta clase.

---

## 🔴 ACCESO A INFRAESTRUCTURA — reglas no negociables

*Fijadas el 2026-09-01, al dar acceso al CLI de Supabase.*

**Una sola vía al recurso: el CLI de Supabase, ya pinneado como devDependency.**
⛔ **NO se usa el MCP de Supabase.** Dos vías al mismo recurso es **R1 aplicada a la
infraestructura**: dos caminos que hacen lo mismo, nada que los sincronice, y el día que uno cambie
de comportamiento nadie se entera hasta que algo se cae.

### Lo que se puede correr sin preguntar

`gen types` · `migration list` · `db diff` · `db dump` · y **cualquier consulta de LECTURA**.

### Lo que exige confirmación ANTES, mostrando qué se va a aplicar

`db push` · aplicar cualquier migración · **cualquier escritura sobre la base**.

### ⛔ NUNCA

**`db reset`. Borra la base entera.** Si parece que hace falta: **parar y decirlo**, no correrlo.

### 🔴 El alcance del token

**Supabase SÍ emite tokens con alcance de PROYECTO.** La pantalla de *Generate token* tiene
*Resource access → Project (recomendado)*, permisos granulares por área (Project, Database,
Application Services, Infrastructure) que arrancan **todos en No access**, y expiración de 7 días
por defecto.

✅ **El token en uso está acotado al proyecto de Nodo.** Vento queda fuera de alcance **por
construcción, no por una instrucción escrita** — que es exactamente la diferencia entre un **guard**
y un **recordatorio**, el argumento que este proyecto viene midiendo desde el primer día. Un
recordatorio que se puede leer sin contestar se salta en silencio; un alcance que no incluye el
recurso no se puede saltar.

> **⚠️ REDUNDANTE A PROPÓSITO — no borrar:** verificar el project-ref antes de cualquier comando
> que escriba. El único ref permitido es el de Nodo: `kvyiwiilrzpcjzbqaoow`.
>
> Hoy esto lo garantiza el alcance del token, así que la regla no hace falta. Se conserva porque el
> día que alguien genere un token **legacy de cuenta** —siguen existiendo— la garantía desaparece
> sin aviso y la regla vuelve a ser lo único que queda. Es la misma redundancia deliberada con la
> que R0 vive en este documento **además** del hook: un mecanismo no puede garantizar su propia
> existencia.

🔴 **Y la regla que sobrevive a los dos datos: el alcance se COMPRUEBA, no se asume.** Ver
`docs/BITACORA.md` → *"dos afirmaciones opuestas, ninguna verificada"*: acá se afirmó primero que el
token era de proyecto y después que no podía serlo, **las dos veces sin mirar**, y lo resolvió abrir
la pantalla.

### El token no vive en ningún archivo

Ni en el repo, ni en `.env`, ni en `config.toml`, ni en un script, ni en un mensaje de commit. Va
como **variable de entorno de la sesión**, exportada antes de arrancar.

🔴 **Si aparece en cualquier otro lado —un archivo, un log, un pegado en una conversación— es un
INCIDENTE:** se para, se avisa, y **se rota**. Un secreto que se pegó en texto plano está
comprometido **aunque no lo haya usado nadie**: queda en historiales y en logs, y su alcance no se
reduce por buena intención. Rotar cuesta un minuto; asumir que no pasó nada cuesta lo que valga el
proyecto más caro de la cuenta.

### R5 rige, y el token la hace más fácil de romper

Desde el primer push, **todo cambio de esquema es un archivo nuevo en `migrations/`**. Con acceso
directo es más cómodo aplicar algo a mano y saltearse el archivo — **eso deja la base y el repo
divergiendo en silencio**, que es exactamente el modo de fallo que R5 existe para evitar. La
comodidad de la herramienta no cambia la regla.

---

## Aprendizajes de proyectos hermanos (Quota, Vento)

Reglas duras traídas de los hermanos — aplican a todo el trabajo en este repo:

- **NO ASUMIR, CONFIRMAR CONTRA LA BD:** ante un número raro o un comportamiento inesperado, mirar
  el dato real (un `select` directo, `information_schema`), no teorizar. La hipótesis se valida
  contra la base, no contra la intuición.
- **TIPOS GENERADOS, NO A MANO:** regenerar `database.types.ts` con
  `supabase gen types typescript` después de cada migración. Los 129 errores de tipos de la Fase 0
  de Vento vinieron justamente de tipos escritos a mano y desincronizados con la BD (vistas sin
  `Relationships`). **Verificar que el CLI funcione antes de la primera migración** — en Vento da
  403 de management y por eso terminaron a mano.
- **MIGRACIONES NUEVAS, NUNCA EDITAR LAS APLICADAS:** todo cambio de esquema va en un archivo nuevo
  dentro de `supabase/`. Jamás modificar una migración que ya se aplicó.
- **`tsc` NO PRUEBA EL SQL:** triggers, RLS y vistas solo se verifican ejecutando con datos reales
  contra la BD. El compilador de TypeScript no sabe nada del SQL.
- **VERIFICAR CADA CASO CON DATOS LIMPIOS:** no encadenar pruebas sobre el mismo pedido/cliente;
  cada escenario se prueba desde un estado limpio para no arrastrar efectos de la prueba anterior.
- **`git status` ANTES DE COMMITEAR:** revisar siempre qué se va a incluir; evitar `git add -A` a
  ciegas.
- **SECURITY DEFINER → `revoke execute from public`:** Postgres concede `EXECUTE` a `PUBLIC` por
  defecto en toda función nueva. En funciones `SECURITY DEFINER` hay que revocar ese permiso
  explícitamente y concederlo solo a los roles que lo necesiten (`authenticated`, `service_role`).

---

## Herencia de Vento

### Lo que viaja

La base técnica medida en el diagnóstico: **21,7%** de 39.351 líneas en 179 archivos. Multi-tenant,
RLS, RBAC, auth, hooks, patrones de RPC.

### Orden de poda — 🔴 LA CARGA DE LA PRUEBA ESTÁ INVERTIDA

*Invertida el 2026-08-31 tras 4 de 4 aciertos en contra. **5 de 5 al 2026-09-01.** Evidencia en
`docs/BITACORA.md`.*

**La regla, en una línea: no se borra salvo que se demuestre que no sostiene nada.** Al revés de
como estaba, que era enumerar qué borrar y confiar en el nombre.

**Por qué.** El fork heredó **un sistema que funciona**. En un sistema que funciona, lo que sobra
suele ser **la etiqueta, no la pieza**: el nombre viene del vertical de origen, el mecanismo viene
del problema, y el problema muchas veces es el mismo. Cuatro de cuatro veces que algo sonó a bar,
sostenía peso. No es racha: es **sesgo sistemático del método**, porque el nombre es lo primero
que se ve y lo único que no se verificó.

**El procedimiento, antes de borrar cualquier cosa** — enumerar qué cuelga de ella:

```
FKs            → grep 'references public.<tabla>'
funciones      → ¿qué RPC la consulta, aunque no tenga FK?
policies RLS   → ¿alguna la nombra?
triggers       → ¿alguno la escucha?
vistas         → ¿alguna la lee?
imports        → en src/: ¿quién importa el helper, el hook, el tipo?
seeds y tests  → ¿quién la puebla?
```

Si algo aparece: **no se borra — se renombra**, y el nombre nuevo sale de lo que la pieza *hace* en
Nodo, no de lo que se llamaba en Vento.

```
cocina  → tiene interruptor (uses_kitchen / routes_to_kitchen). Verificar qué cuelga igual.
mesas   → el POS ya está desacoplado (DEFAULT_ORDER_TYPE='takeaway')
turnos  → NO se podan. Renombrados a jornada/caja.  ← sostenía peso
extras  → NO se borran. Se renombran.               ← sostenía peso
recetas → NO se borran. product_components pasa a bulto→unidad.  ← sostenía peso
```

🔴 **El quinto caso es una VARIANTE, y cambia cómo se lee la enumeración.** `TablesPage` sí se
poda —la clasificación era correcta— pero `tests/helpers/tables.ts` es el **camino de fixture** de
tres specs de módulos que **sobreviven** (cartera, pagos, descuentos): la mesa era la forma más
corta de dejar una venta armada. La línea `seeds y tests → ¿quién la puebla?` de la checklist se
lee corta. **Va leída ancha: ¿quién la usa para LLEGAR a otra cosa?** Una pieza sin consumidor de
producto puede seguir siendo el único camino por el que otra cosa arma su estado inicial.

#### 🔴 Corolario — enumerar QUÉ depende no alcanza: enumerá DE QUÉ PROPIEDAD depende

*Agregado el 2026-09-01, después de que una enumeración correcta produjera un plan imposible.*

La regla de arriba pide enumerar **qué cuelga** de la pieza. Este corolario agrega la segunda mitad:

> **¿Por qué esa pieza no se puede reemplazar por otra?**

Sin esa pregunta, la enumeración identifica bien la **dependencia** y describe mal su **naturaleza**
— y sobre esa descripción se toman decisiones que no se pueden ejecutar.

**Caso medido.** Al enumerar la poda de mesas se encontró que `tests/helpers/tables.ts` era fixture
de tres specs de módulos que **sobreviven**. La dependencia estaba **bien identificada**. Lo que se
escribió sobre ella fue *"la mesa era el camino más corto para dejar una venta armada"* — o sea
**comodidad**. Sobre esa lectura se aprobó reemplazarla por un helper sobre el POS.

**Era falso, y de la peor manera: la mesa era el ÚNICO FLUJO DE DOS FASES.** Los tres tests miden
que el stock se descuenta en el alta y el cobro no lo vuelve a tocar; en el POS alta y cobro son un
paso atómico, así que el helper habría producido **tres tests verdes por construcción**. Una
comodidad se reemplaza; una **propiedad estructural**, no.

**Lo accionable, en dos preguntas y en este orden:**

1. ¿Qué depende de esto? → la enumeración de siempre.
2. **¿Qué propiedad de esto usa cada dependiente, y existe en otro lado?** → si la respuesta es
   "es más corto", es comodidad: reemplazable. Si es "es el único que hace X", es estructura: al
   borrarla, **lo que depende de X no se migra, se pierde** — y eso se decide, no se descubre.

✅ **El corolario ya se usó en su primer día:** de los cuatro tests que usaban la mesa, tres se
borraron (dependían de las dos fases) y **uno se migró al POS** — el clamp del vale al 100%, que
usaba la mesa solo de andamio. La misma enumeración, hecha con la segunda pregunta, separó lo que
la primera juntaba.

#### 🔴 Corolario — después de borrar, grepeá la palabra del módulo y LEÉ el residuo

*Agregado el 2026-09-01. Primer caso en que falló la ENUMERACIÓN, no la clasificación.*

> **Un módulo satélite no se llama como el módulo del que cuelga.**

Al podar Delivery, la enumeración previa decía "tres archivos y dos ediciones mecánicas". Faltaba
**el módulo de repartidores entero** (~205 líneas en `ConfigPage`), 7 helpers, dos campos de
configuración de sede y un aviso sonoro. La tabla `couriers` **ni siquiera existe en el esquema
base**.

**Por qué se escapó:** la enumeración grepeó los nombres de las **páginas**
(`KitchenPage|DeliveryPage|TablesPage`) y los conceptos del **esquema** (`order_type`, `table_id`,
`preparing`). **`courier` no estaba en ninguna de las dos listas** — y no podía estar, porque nadie
sabía que existía.

**Lo accionable, y cuesta un comando:** después de borrar, correr
`grep -rn "<palabra del módulo>" src/` y **leer la salida**. ⚠️ **No para que dé cero** —nunca da
cero, y esperar cero es el error que ya documentamos en la verificación de marca—: para **descubrir
los satélites**. Los cinco ítems que faltaban salieron de un solo grep corrido **después** del
borrado, no antes.

#### 🔴 Corolario — lo que NO es una referencia de código, NINGÚN verificador lo mira

*Agregado el 2026-09-01. Cuatro formas encontradas en una sola poda, todas invisibles para `tsc`,
para ESLint y para un grep de símbolos.*

`tsc` sigue referencias: un import, un tipo, una llamada. **Lo que vive dentro de un string, de un
patrón o de un texto no es una referencia** — es carga útil, y nadie la resuelve hasta que se
ejecuta. Al podar, esos lugares quedan apuntando a cosas que ya no existen y **el repo entero se ve
verde**.

**DÓNDE VIVE EL RIESGO — la lista, para revisarla a mano después de podar:**

| Lugar | Por qué es invisible | Caso medido |
|---|---|---|
| **Strings de consulta** (`select` de PostgREST, SQL por texto) | son texto hasta que PostgREST los resuelve | `getSalesHistory`/`getSaleDetail` pedían `type` y `waiter_name`, columnas muertas |
| **Regex** | un cuantificador hace que la cadena literal **no exista** | `/G-?Vento/i` en `global-setup`: ningún reemplazo de marca la vio |
| **Copy de UI** | afirma cosas del producto, y el compilador solo ve un string | ⬇️ ver abajo |
| **Cuerpos de llamadas entre procesos** (Edge Functions, webhooks) | el emisor y el receptor no comparten compilador | `create-user` exigía `restaurant_id` mientras `src` y los tests mandaban `sede_id` |
| **Mensajes de error** | describen un mundo que cambió | el guard que culpa al servidor por un renombre |
| **Seeds y fixtures** | insertan valores literales | `status: 'preparing'`, valor que el enum ya no tiene |

🔴 **El de UI merece mención propia, porque es el único que ve un cliente.** `LoginPage` prometía
**"Gestión de mesas y comandas en tiempo real"** — la primera pantalla del producto, afirmando dos
módulos que acababan de dejar de existir. No hay test que falle por eso: la aplicación funciona
perfecto **mintiendo**.

**LO ACCIONABLE, y es trabajo manual porque no hay alternativa:** después de podar, abrir y leer
esos seis lugares. No hay verificador que los cubra, así que el paso no se puede delegar a un exit
code. Un `grep` de la palabra del módulo ayuda a encontrarlos —ver el corolario de arriba— pero
**leerlos es el trabajo**.

⚠️ Y el corolario del corolario: **un verde después de una poda mide menos de lo que parece.**
Mide que las referencias resuelven. No mide que los strings digan la verdad.

⚠️ **Lo que esta regla NO dice.** No dice "no borres nada": dice que **el que borra tiene que
mostrar la enumeración**. Un `grep` que vuelve vacío es una demostración válida y barata. Lo que
deja de valer es *"esto suena a restaurante"*, que es la única evidencia que se usó las cuatro
veces que salió mal.

#### 🔴 Corolario — DIBUJAR UNA PANTALLA AUDITA UN ESQUEMA

*Medido el 2026-09-01, enumerando los campos de las nueve pantallas del design system contra las
columnas reales.*

> **Antes de dar un esquema por completo, dibujá la pantalla que lo consume.**

**Nueve huecos en seis pantallas. Seis eran nuevos, y ninguno lo había encontrado una sesión de
backend** — ni escribiendo el esquema, ni escribiendo las RPC, ni corriendo la suite. Los encontró
tener que **dibujar**, porque un dibujo obliga a nombrar **cada dato que hace falta para que la
pantalla signifique algo**, y un `select *` no hace esa pregunta: devuelve lo que hay, y lo que hay
siempre se ve completo.

Los seis no eran adornos: unidad de compra y su factor de equivalencia, plazo de crédito,
subcategoría de gasto, beneficiario del gasto, fecha del documento, dirección del cliente. **Todos
del alcance firmado.**

**Por qué el esquema no los delata solo.** Un esquema es consistente consigo mismo por
construcción: las FKs cierran, los CHECK pasan, las RPC compilan. Nada dentro de él pregunta *"¿con
esto se puede contestar lo que el usuario va a mirar?"*. Esa pregunta vive **afuera**, y la
pantalla es el instrumento más barato para hacerla.

⚠️ **Y el caso extremo, que está en `docs/BITACORA.md`:** la diferencia bulto→unidad estaba
**escrita en este mismo archivo** desde el 2026-08-31, como una de las tres diferencias medidas
contra Vento. Se leyó y se citó muchas veces. **No tenía columna.** Ninguna lectura lo destapó;
lo destapó dibujar la pantalla de Compras.

🔴 **Y VA EN LAS DOS DIRECCIONES.** *Segundo caso, 2026-09-02.* No solo el diseño destapa
**campos que faltan**: también destapa **operaciones que nadie modeló**. El §4 del design system
reserva el relleno sólido `--danger` —su color más fuerte, y el único lugar donde lo permite— a
*"Anular compra"*. Esa acción **no existe en ninguna capa**: ni columna, ni RPC, ni UI. El diseño
previó una operación que el backend no tiene, y lo dijo con el color que se reserva para lo más
grave.

🔴 **Y HAY DOS CLASES DE HUECO, que se ven iguales y las resuelve gente distinta.**
*Tercer refinamiento, 2026-09-02, re-skineando Inventario.*

| | **hueco de ESQUEMA** | **hueco de PANTALLA** |
|---|---|---|
| Qué falta | el dato no existe en ninguna tabla | el dato existe y **nadie lo muestra** |
| Quién lo resuelve | migración + RPC + tipos | una decisión de producto |
| Cuánto SQL | una migración nueva (R5) | **cero** |
| Urgencia | manda la columna (b): si se opera sin él, **se pierde** | ninguna — el dato se está guardando igual |

**Los diez primeros huecos eran de esquema. El primero de pantalla apareció construyendo
Inventario:** la maqueta muestra tres KPI de dinero —valor del inventario, referencias con
existencia, productos sin costo— y la pantalla real muestra cuatro conteos; la tabla no tiene
`COSTO` ni `VALOR`. **Los cinco se derivan de `stock_qty` y `cost_price`, que ya existen.**

⚠️ **Por qué importa distinguirlos, y no es taxonomía:** meterlos en la misma lista los hace
competir por la misma urgencia, y **no la tienen**. Un hueco de esquema que espera **pierde datos
todos los días**; uno de pantalla espera gratis, porque el dato se sigue guardando. Confundirlos
empuja a migrar cosas que no hacía falta migrar, y —peor— a postergar una migración detrás de una
decisión de diseño.

**Corolario para el re-skin:** un re-skin es **la misma información con el design system nuevo**.
Agregar información es producto, y se anota como hueco de pantalla en vez de resolverse de paso.

**Lo accionable:** al cerrar un módulo de esquema, listar los campos de la pantalla que lo va a
consumir —aunque la pantalla no exista todavía— y cruzarlos contra las columnas. **Y listar también
sus ACCIONES**, que es la mitad que casi se nos pasa: un botón dibujado es un verbo que alguien
espera poder ejecutar. Cuesta una lista. **Y al anotar cada hueco, decir de cuál de las dos clases
es**, porque de eso depende quién lo resuelve.

---

#### 🔴 Corolario — clasificar leyendo el nombre o el plan NO es clasificar

*Agregado el 2026-08-31, con cuatro casos medidos.*

La regla de arriba dice que **no se borra** sin enumerar. Este corolario dice lo mismo un paso
antes: **no se CLASIFICA sin abrir el archivo.** Una clasificación hecha sobre el nombre —o sobre
un plan que a su vez se hizo leyendo nombres— no es un dato: es una hipótesis.

**Cuatro casos, y en los cuatro la clasificación previa era falsa:**

| Se creía que era | Resultó ser |
|---|---|
| `_t_priv`, una tabla del esquema | **Andamiaje**: una sonda de verificación con `set local role authenticated`. No viaja. |
| `product_components`, algo a renombrar | Ya tenía nombres neutros. Lo específico de bar estaba **en los comentarios**. |
| `extras`, con columnas de bar | **Cero** columnas de bar. Ni nota a cocina ni orden de preparación. |
| `subscription_status`, un enum | `text` con `CHECK` — y la asimetría que eso implica es la que decide el costo. |

**Es R4 aplicada al inventario propio.** R4 dice verificar contra la cosa real y no contra un
proxy; un plan de clasificación **es un proxy**, y uno bueno — por eso engaña. Los cuatro errores
no vinieron de clasificar mal: vinieron de clasificar **sin abrir el archivo**, que es rápido y da
un resultado que se ve igual de bien.

**Lo accionable, que es barato:** antes de tratar una clasificación como decisión, abrir el
archivo y confirmar **qué es la cosa** —tabla o andamiaje, enum o CHECK, nombre o comentario—.
Cuesta un `sed -n`. Los cuatro casos se detectaron así, y siempre al escribir el código que
dependía de ellos: **nunca releyendo el plan.**

#### 🔴 Corolario del RENOMBRE — no se renombra lo que nombra algo externo que no controlamos

*Agregado el 2026-08-31, durante el renombre de `restaurant_id` y de la marca heredada.*

La regla de poda dice qué no borrar. Ésta dice **qué no renombrar**, y el criterio es uno solo:

> **Si el nombre apunta a algo que vive fuera de este repo y que no cambiamos en la misma pasada,
> renombrarlo NO lo renombra: lo desconecta.**

Un renombre normal cambia las dos puntas a la vez —la definición y sus usos— y por eso es seguro.
Cuando una punta está afuera, el renombre toca **solo la de adentro**, y el resultado es un texto
que dice algo falso con toda confianza.

**Casos medidos, con lo que habría pasado:**

| Nombre | Qué nombra afuera | Si se renombraba |
|---|---|---|
| `owner.test@gvento.com` · `cajero.test@gvento.com` | Cuentas que **existen en el backend del lab** | `tests/README.md` pasaba de cierto a **falso**: instrucciones para entrar con un usuario inexistente. |
| `src/design-system.md` — *"Vento Design System"* | La identidad de **otro producto**. Nodo necesita el suyo (CLAUDE.md) | El título afirmaría que ese es el design system de Nodo. Un **pendiente honesto** se convertiría en una **nota falsa**. |
| `VITE_VENTO_SUPABASE_URL` | Una clave del `.env` de cada máquina, **fuera de git** | ✅ Sí se renombró — pero **no alcanzaba con el código**: exige que cada quien cambie su `.env`, y por eso se pidió confirmación en vez de darlo por cerrado. |

**La distinción operativa**, que es lo que hay que aplicar: preguntá **dónde vive la otra punta**.

- Adentro del repo → renombrá las dos y verificá que el conteo llegue a cero.
- Afuera y **bajo nuestro control** (un `.env`, un bucket) → renombrá, y el cambio **no está
  terminado** hasta que la otra punta se movió. Se avisa; no se da por hecho.
- Afuera y **fuera de nuestro control** (una cuenta ya creada, otro producto, un servicio de
  terceros) → **no se renombra**. Si el nombre molesta, lo que cambia es la **cosa**, no el texto.

⚠️ Corolario del corolario: un renombre a medias es **peor que no renombrar**, porque el texto
queda afirmando la conexión que acaba de romper. Es la misma familia que la nota que dirige mal.

#### 🔴 Corolario del corolario — quitar el prefijo abarató la marca y ENCARECIÓ su verificación

*Medido el 2026-08-31, al pasar de `G-Nexo` a `Nodo` y sacarle el prefijo a toda la familia.*

La convención nueva —raíz sola, sin prefijo ni guion— es mejor marca. **Y tiene un costo que no
previmos, en el lugar donde menos se mira: la verificación.**

**Un prefijo no solo distingue el producto: hace la cadena DISTINTIVA.** `gvento` y `G-Nexo` no
aparecen en ningún otro contexto, así que contarlos era fiable y "llega a cero" era un criterio
honesto. Los nombres desnudos **son palabras comunes o substrings de palabras comunes**, y eso
vale para los cuatro:

| Nombre | Aparece dentro de |
|---|---|
| `vento` | in**vento**rio · e**vento** · In**vento**ryPage |
| `nodo` | — pero `nodo` es palabra común en español y en grafos |
| `centro` | **centro** de costos · **centro** de acopio · **centr**ado |
| `mura` | **mura**lla · **mura**l |
| `cresco` | (el único razonablemente distintivo) |

**Medido:** `vento` da **47 coincidencias** en `src/` + `tests/` y casi todas son ruido; `centro`
en minúscula da 5, todas ruido. Un criterio de "el conteo llega a cero" **es inalcanzable por
construcción** y por lo tanto miente siempre.

**LA REGLA, entonces:** toda verificación futura de marca va **por LISTA ENUMERADA, nunca por
conteo**. Se escribe qué menciones legítimas quedan y por qué cada una está permitida; la
verificación consiste en confirmar que **esa lista es exhaustiva**, no en que un número dé cero.

⚠️ **Y el patrón general, que es lo que hay que retener:** una decisión buena en su propio eje
—marca más limpia— puede **degradar un mecanismo en otro eje** —verificabilidad— sin que nadie lo
note, porque los dos ejes los evalúa gente distinta en momentos distintos. Al tomar una decisión de
nomenclatura, preguntá también **cómo se va a verificar después**.

### Dónde está el peligro

No en el 24,6% que se borra. En el **43,3% de zona gris** que parece viajar tal cual y necesita
cambios: productos, inventario, clientes, fiado, compras, reportes.

### Premisas que los datos contradijeron

Se creyeron ciertas en Vento y no lo eran. Van acá porque son el tipo de error que se repite.

1. **"Sacar turnos toca el cobro" — NO.** `payments` no tiene `shift_id`; la pertenencia al turno
   es temporal. El acoplamiento son dos `if (!isShiftOpen)` de UI.
   **Pero sí toca la cartera:** `debt_payments.cash_movement_id` es FK real a `cash_movements`, y
   `register_debt_payment` busca el turno abierto. El único módulo con dependencia estructural al
   turno es fiado — justo el que sobrevive como cartera en Nodo.

2. **🔴 "Extras" NO es opcional.** `add_order_items_with_extras` es el **único camino de alta de
   ítems del repo** y donde se descuenta stock por receta. Borrarlo por sonar a bar **rompe
   vender**. Se renombra, no se borra.

3. **No existe módulo de propinas.** Cero ocurrencias fuera de una fila de seed.

4. **El monorepo no existe.** Ver la Descripción.

---

## Los dos hooks

`PreToolUse` sobre **Write / Edit / Bash**.

El `Bash` no es opcional: escribir SQL por heredoc es común, y sin él el hook no cubre el flujo
real.

- **Hook 1 — SQL riesgoso.** Inyecta las cuatro preguntas de **R0** antes de escribir cualquier
  `.sql`.
- **Hook 2 — permisos.** Matchea **por contenido** (`roles` + `permissions` juntas), **no por
  path**. Un `.sql` con nombre arbitrario fuera de `supabase/` también dispara.

### Modos de fallo a vigilar

- Un `settings.json` malformado desactiva **todas** las settings del archivo, permisos incluidos.
- Un script generado por heredoc puede quedar sintácticamente válido y **semánticamente muerto**.
  Pasó tres veces en Vento: `require` en un `.mjs`, `\b` interpretado como byte `0x08`, `\\`
  colapsado.
- **Verificación obligatoria tras generar un hook:** `node --check` + grep de bytes de control.
  Y `command -v` de cada dependencia antes de copiar un patrón de referencia (R4: `jq` no estaba).
- **Un hook no ve omisiones.** Dispara cuando tocás un archivo. Lo que queda congelado porque
  nadie lo tocó lo caza un check de árbol en CI, no un hook. Ver R1 punto 1.

### Estado

`settings.json` y `sql-checklist.mjs` copiados de Vento el 2026-08-31 (rama `develop`,
`d848852`). El **mecanismo** viaja literal; el **estado** de Vento (conteos del catálogo, los
6 permisos inertes, sus deudas) fue reemplazado por el de Nodo.

✅ **Ledger de disparos activo desde el 2026-08-31** (`.claude/hook-ledger.jsonl`, fuera de git):
cada disparo anota fecha, herramienta y qué regla matcheó. Es el instrumento de la deuda #22.
⚠️ Registra **disparos, no invocaciones**: da volumen y mezcla de clases, **no una tasa** — para eso
falta el denominador. Y **diverge de Vento a propósito** (R1 punto 9).

Verificado en banco: `node --check` limpio, sin bytes de control, ningún `require`; 10 casos de
pipe-test — Write, Edit, Bash-heredoc, ruta Windows, `update roles set permissions` en un `.txt`
fuera de `supabase/` y `SYSTEM_ROLES` en un `.ts` **disparan**; Bash sin SQL, `settings.json`,
payload vacío y un `.tsx` **callan**.

✅ **Corre en la máquina real (2026-08-31).** No por un test: disparó 3 veces dentro de una sesión
real, lo que prueba la cadena entera —settings leído por el harness, matcher activo, Node
encontrado, script no mudo—. En Vento el script salió mudo la primera vez y
leyéndolo se veía perfecto — y esa advertencia se conserva como razón, no como pendiente.
⛔ **Falta el tripwire** `tests/roles.spec.ts` que clave el tamaño del catálogo.

---

## Las cinco skills

`sql-riesgoso` · `defecto-de-clase` · `spec-e2e` · `rbac-permisos` · `demo-en-vivo`

**Criterio de división:** las reglas viven en este archivo; el **procedimiento** vive en las
skills. Cada skill **cita las reglas por número y no las repite** — repetirlas violaría R1.

Por eso la numeración R0–R10 es idéntica a la de Vento: una skill que dice "ver R2" tiene que
significar lo mismo en los dos repos.

---

## Variables de entorno requeridas

```
VITE_NODO_SUPABASE_URL=
VITE_NODO_SUPABASE_ANON_KEY=
```

Ver `.env.example` para la lista completa.

---

## Cómo se escribe una nota en este documento (convención)

Salió de auditar las 36 afirmaciones verificables del documento de Vento contra el código
(2026-08-26). **Las 28 correctas eran reglas y mecanismos. Las 8 falsas eran TODAS afirmaciones de
ESTADO** — qué rama tiene qué, cuántos tests hay, qué código existe hoy. Ninguna regla resultó
falsa. El estado es lo que se pudre, así que se escribe distinto.

- **CITAR EL SÍMBOLO, NO EL NÚMERO DE LÍNEA.** `handleDeleteItem` en `TablesPage.tsx` sobrevive a
  un refactor; `TablesPage.tsx:1036` no — ese TODO ya se movió a la 1383 solo. De las 8
  referencias `archivo:línea` auditadas, las 7 que acertaron son de **migraciones ya aplicadas**,
  que por regla del proyecto no se editan nunca. **Ahí sí vale el número**; en código vivo, no.
- **TODA AFIRMACIÓN DE ESTADO VA FECHADA.** "182 tests" se lee como presente y miente a las dos
  semanas. "182 tests (2026-08-12)" es una referencia histórica honesta.
- **MEJOR QUE FECHAR: DECIR CÓMO CONSULTARLO.** Un dato caduca; una instrucción para reproducirlo,
  no. `git rev-list --count develop..main` vale más que cualquier frase sobre qué rama va adelante
  — y de hecho ese bloque decía lo contrario de la realidad durante semanas. Cuando existan las
  dos, va primero el comando y después el dato fechado.
- **UNA NOTA QUE DIRIGE MAL CUESTA MÁS QUE UNA AUSENTE.** Las dos peores del documento no eran
  omisiones: describían código eliminado y una relación de ramas invertida. Si no podés verificar
  una afirmación, no la escribas como hecho.

---

## Git

- Rama activa de desarrollo: `develop`
- Nunca hacer commit directo a `main`
- Commits en formato Conventional Commits
- Un commit por funcionalidad o fix completo

---

## Design System

⛔ **Nodo necesita el suyo.** El de Vento (`src/design-system.md`, acento emerald `#10b981`,
layout POS 60/40) es la identidad de otro producto y **no se copia tal cual**.

Lo que sí viaja es el **mecanismo**: un archivo `src/design-system.md` con los valores exactos de
color, tipografía, espaciado y patrones de layout, que se lee **antes de construir cualquier
pantalla nueva**.

---

## Política de testing (obligatoria)

- Todo módulo o funcionalidad nueva **DEBE** incluir su spec E2E en `tests/` antes de considerarse
  completo.
- El prompt de cada feature nuevo termina con: "crea/actualiza el spec de Playwright que cubra esta
  funcionalidad".
- Antes de cada merge a `develop`: la suite E2E debe pasar al 100%.
- Selectores robustos con `data-testid` donde el texto sea ambiguo.
- Tests deterministas e idempotentes (aprendizaje: verificar con datos limpios).
- Los tests corren en serie (`workers: 1`) por compartir backend.
- Leer R8, R9 y R10 antes de interpretar cualquier resultado de suite.

**⚠️ EN PLAYWRIGHT, UN TIMEOUT NO ES LENTITUD.**
*Medido el 2026-09-01: tres fallos de DOM disfrazados de problema de rendimiento.*

`fill()`, `selectOption()`, `click()` y las demás acciones tienen **auto-waiting**: esperan al
locator hasta agotar el timeout **del test**. Entonces `Test timeout of 30000ms exceeded` casi
siempre significa **"no encontré el elemento"**, no "el sistema está lento".

🔴 **Y el mensaje NO nombra el locator.** Hay que abrir el `Test source` del artefacto
(`test-results/**/error-context.md`), que marca con `>` la línea exacta donde se colgó.

**Caso:** `arqueo`, `compras` e `historiales` fallaban con timeout de 30s. Los tres esperaban un
control de formulario que ya no existía. La pista estaba a la vista y casi se pasa por alto: **dos
specs operaban el MISMO campo con acciones incompatibles** —uno `fill` de input, otro
`selectOption` de select—, y eso es imposible contra un mismo DOM.

⚠️ **Consecuencia al interpretar una suite:** un timeout **no** justifica subir el timeout. Antes de
tocar `timeout`, abrir el artefacto y ver qué locator se esperaba. Subirlo convierte un fallo de 30s
en uno de 60s.

**🔴 ANTES DE BORRAR UN TEST POR OBSOLETO, VERIFICÁ SI SU ASERCIÓN SIGUE SIENDO VERDADERA BAJO EL
MODELO NUEVO.** *El sujeto puede haber cambiado y la expectativa seguir valiendo.*

*Caso completo, medido el 2026-09-01 — incluida la parte incómoda: la orden de borrar vino con un
argumento CORRECTO.* El test probaba que la categoría del movimiento saliera de la lista
configurable por sede, y esa función se eliminó a propósito al pasar a la allowlist fija: el
argumento sobre el **sujeto** era exacto. Pero al borrarlo, el test vecino siguió rojo y destapó que
**la expectativa vivía**: la pantalla mostraba solo `reason`, así que un gasto sin detalle libre
salía **en blanco** — y `categoria` es justamente la fuente de los reportes. **La UI decía menos que
la base.**

Es la misma familia que la poda invertida —*lo que suena a viejo puede sostener peso*— pero en
tests: **la cobertura obsoleta puede estar cubriendo algo que sigue vigente.** El procedimiento es
el mismo de la poda: antes de borrar, separar el test en sujeto y expectativas, y preguntarle a cada
expectativa si sobrevive al modelo nuevo. Las que sobreviven se re-alojan; lo que se borra es solo
el sujeto muerto.

**🔴 HAY UNA CLASE DE DEFECTO QUE NINGÚN TEST CAZA: EL QUE ESTÁ EN LO QUE SE VE, NO EN LO QUE PASA.**
*Primera vez en el proyecto que un defecto aparece MIRANDO y no EJECUTANDO — 2026-09-01.*

Con el carrito vacío, el botón **"Cobrar — F12" deshabilitado se veía MÁS CLARO que habilitado**: el
estado apagado del design system usa `--border-2`, que sobre superficie clara es correcto y sobre el
panel de tinta es casi blanco. El control gritaba justo cuando no había que tocarlo.

**Ningún test lo caza, y no por falta de cobertura: el botón SÍ estaba deshabilitado.** `toBeDisabled()`
pasa, el click no dispara, la RPC no se llama. El defecto está **enteramente** en lo que el ojo
recibe, y no hay aserción que lo exprese sin volverse un test de píxeles.

**La regla práctica:** al terminar una pantalla, **mirarla** — en sus estados, no solo en el feliz.
Una captura cuesta segundos y cubre una clase que la suite no cubre por construcción.

⚠️ **Y el corolario sobre el material de referencia:** las capturas de `docs/reskin-referencia/`
(1,1 MB) se justificaron acá. No sirven para verificar el código; sirven para **saber cómo debería
verse**, que es la única forma de notar que algo se ve mal.

**🔴 UN ROJO QUE NO NOMBRA QUÉ CAMBIÓ CUESTA EL DIAGNÓSTICO ENTERO DE NUEVO.**
*Medido el 2026-08-31, escribiendo el tripwire del catálogo de permisos.*

La forma **obvia** de escribir una aserción sobre una colección produce el rojo que **no dirige**.
Comparar el catálogo contra su lista fijada con `toEqual` detecta la sustitución de una clave por
otra, sí — y la reporta así:

```
AssertionError: expected [ Array(21) ] to deeply equal [ Array(21) ]
```

Los dos números están bien. El test tiene razón y aun así **manda a mirar el lugar equivocado**,
que es el mismo perfil que R6. La versión que dirige cuesta una línea más y se asierta sobre un
**string construido con los nombres**, no sobre la colección:

```
Expected: "claves que DESAPARECIERON del catálogo: ninguna"
Received: "claves que DESAPARECIERON del catálogo: ventas.anular"
```

**La regla:** un test no termina cuando se pone rojo con el defecto puesto — termina cuando **el
mensaje del rojo nombra qué cambió**. Hay que trabajar activamente para que dirija; por defecto no
lo hace. Corolario práctico: al auditar por mutación (R10), **leé el mensaje**, no solo el
`✓`/`×` — el mutante puede morir y el rojo ser inútil igual.

---

## Estado

*Actualizado: 2026-08-31.*

Todo lo de esta sección caduca. Preferí siempre el comando sobre el dato.

| Qué | Estado |
|---|---|
| Nombre | **Fijado: Nodo** (2026-08-31), tras verificar riesgo marcario. ⛔ Falta el registro en la SIC, clases 9 y 42. |
| Repo | Creado (2026-08-31). |
| Proyecto de Supabase | Creado (2026-08-31). Verificar que el CLI **no** dé 403 antes de la primera migración. |
| Vercel | No existe. |
| Sentry | No existe. Proyecto propio, con el filtro de PII ya corregido. |
| Origen de la copia | Vento rama `develop`, `d848852`. También `docs/reglas-de-clase` en origin, viva hasta terminar de copiar. |
| Conteo de errores repetidos en Vento | **Discrepante:** el traspaso dice 9, su `CLAUDE.md` dice 11, el cierre dice 13 y numera los casos #11–#14. Resolver contra `docs/BITACORA.md` antes de citarlo. |
| `settings.json` + hooks | Copiados, verificados en banco y **corriendo en la máquina real** (2026-08-31): disparó 3 veces en sesión. ⛔ Las 3 fueron falsos positivos — tasa de ruido sin medir (deuda 22). |
| Centro | Ya nació multi-producto. Enumerar qué falta para que Nodo entre como tercer producto — **en su propio hilo**. |
| `settings.json` + hooks | Copiados y verificados en banco. ⛔ Falta correrlos en la máquina real. |
| Generador de RBAC | **Ya viajó** (2026-08-31). Existen `scripts/gen-rbac-sql.mjs` y `supabase/seed-system-roles.sql`; `pnpm gen:rbac:check` da **exit 0**. ⛔ Falta que ese check corra en **CI** (deuda 5) y ⛔ falta el **catálogo propio** (deuda 23): las 23 claves de `SYSTEM_ROLES` siguen siendo las de Vento (`cocina.*`, `mesas.*`, `delivery.*`). Viajó el mecanismo, no el contenido. Reconfirmar con `grep -oE "'[a-z_]+\.[a-z_]+'" src/lib/permissions.ts \| sort -u \| wc -l`. |
| Design system | ⛔ Pendiente. |
| Tripwire del catálogo | ✅ **Puesto (2026-08-31)** en `src/lib/permissions.test.ts`: las 21 claves como **lista ordenada**, no un conteo — un conteo no ve una sustitución. Auditado por mutación, 3/3 mutantes muertos. Reconfirmar con `pnpm test:unit`. |
| Regla nueva sin número | ⛔ Numerarla en Vento primero. |
| Las 5 skills | ⛔ Pendientes. |
