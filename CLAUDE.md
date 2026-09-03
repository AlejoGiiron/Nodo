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
   declarado y jamás enviado (bug real, corregido), `register_sale_void` declaraba `was_fiado` y no lo
   mandaba (corregido el 2026-09-01, migración `void_expone_was_fiado`), y `register_purchase` mandaba
   `cash_movement_id` sin declararlo (declarado el 2026-09-01). **Los tres están cerrados; el método
   queda.** *(A5 encontró los dos últimos escritos en presente.)*

5. **`src/types/database.types.ts` GENERADO vs COMMITEADO.** En Vento el archivo se escribió a mano
   porque el CLI daba 403, y los tipos divergían del esquema **sin que `tsc` lo note** — el proxy
   exacto que R4 prohíbe confundir con la cosa real. En Nodo el CLI funciona y el archivo **se
   genera** (`pnpm db:types` → `supabase gen types typescript --linked`). El contrato que queda es
   otro: **el archivo commiteado tiene que ser igual al regenerado**, y eso es un check de árbol
   (deuda 5), no una lectura. *(Corregido en A5: la versión anterior describía el problema de Vento
   como si fuera el de Nodo.)*

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

**🔴 LA VUELTA QUE FALTABA: CUANDO HAY UN BUILD DE POR MEDIO, EL FUENTE TAMBIÉN ES UN PROXY.**
*Medido el 2026-09-02, y es la sexta falla de instrumento del proyecto.*

Leer el código fuente se siente como leer "la cosa real" — es lo que escribimos, está ahí. **Pero
entre el fuente y lo que corre hay un compilador que agrega, quita y transforma.** Con Tailwind,
PostCSS o cualquier generador, la pregunta *"¿esto existe?"* **no se contesta en el fuente**.

**El caso.** El skeleton de Configuración usaba `animation: 'pulse 1.5s infinite'`. Escribí que ese
keyframe "no está definido en esta app, así que la barra está quieta" — grepeando `index.css`,
`tailwind.config.js` y `ui.css`, donde efectivamente no aparece. **Era falso.** Compilar y grepear
`dist/assets/index-*.css` mostró `@keyframes pulse` presente: **Tailwind lo emite y la config no lo
dice.** El skeleton anduvo siempre.

⚠️ **Y el matiz que lo hace peor que las otras cinco: la afirmación falsa estaba A MI FAVOR.**
Decía que algo no andaba —o sea, que mi cambio arreglaba algo— y por eso **nadie tenía motivo para
dudarla**. Una afirmación que te da la razón no la revisa nadie, empezando por vos. Las falsas que
se atrapan son las que molestan.

**Lo accionable, y es corto:** para preguntas sobre CSS, animaciones, variables, polyfills o
cualquier cosa que un build pueda inyectar o podar, **la fuente de verdad es el artefacto
compilado**, no el archivo. `pnpm build` y grepear `dist/` cuesta veinte segundos.

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
| `stock_movements.type = 'return'` | el **reverso de una VENTA** (entra stock, lo escribe `register_sale_void`) **+** la **devolución a un PROVEEDOR** (sale stock) | Se agregó `purchase_return`; el filtro de Inventario pasó de un rótulo a dos |

🔴 **El cuarto caso es el primero que se ataja ANTES de escribir el valor, y por eso vale aparte.**
Los tres primeros se repararon: la columna ya existía mezclada y hubo que separarla. El cuarto se
cazó **enumerando** para la deuda 49, al ver que `type='return'` ya tenía dueño. Reusarlo era lo
cómodo —el valor existía, el CHECK lo aceptaba, y en castellano las dos cosas se llaman
"devolución"— y habría dejado el mismo valor describiendo **dos direcciones opuestas**,
distinguibles solo por el signo. **Lo que lo cazó fue el idioma**, y por eso la pregunta quedó
abajo, en lo accionable: no hizo falta razonar sobre el modelo, bastó notar que se estaba por reusar
un valor porque *"al final las dos cosas son una devolución"*.

**LO ACCIONABLE — son DOS preguntas, y la segunda es la que caza los casos que la primera no ve:**

1. **¿Cuántas preguntas contesta este valor?** Si son dos, son dos columnas — aunque hoy parezca que
   una alcanza, y **sobre todo** si el valor nuevo se lee natural al lado de los otros. `preventa` se
   leía perfecto al lado de `whatsapp`; eso es justamente lo que hace peligrosa a la mezcla.

2. 🔴 **¿El valor que voy a reusar se llama igual en castellano que el hecho que quiero guardar, pero
   va en la dirección contraria?** Entonces **no comparten valor.**

   > **Cuando dos hechos comparten nombre en castellano y van en direcciones contrarias, no
   > comparten valor.**

   **El idioma es la señal, y es gratis.** No hace falta razonar sobre el modelo: basta notar que
   estás por reusar un valor porque *"al final las dos cosas son una devolución"*. Esa frase —"al
   final las dos son X"— es el aviso. `return` era el reverso de una VENTA (entra stock) y se iba a
   reusar para una devolución al PROVEEDOR (sale stock); en castellano las dos son *devolución*, y en
   el negocio son opuestas. **La comodidad de reusar viene disfrazada de sinonimia.**

   ⚠️ Ojo con la variante que engaña más: cuando el signo alcanza para distinguirlas
   (`qty` positivo vs negativo), reusar el valor **parece** correcto y hasta elegante. No lo es: todo
   consumidor —un filtro, un reporte, una pantalla— tiene que acordarse del signo, y el primero que
   no se acuerde mezcla los dos hechos sin error visible.

⚠️ Es primo del corolario de R4 —**la coincidencia entre dos declaraciones no es evidencia**— por el
otro lado: allá dos fuentes distintas dicen lo mismo y parece confirmación; acá una sola fuente dice
dos cosas y parece economía.

---

### 🔴 SU LADO OPERATIVO · UN DESEMPATADOR ES LA SEÑAL, NO LA SOLUCIÓN

*Sale del cableado de los atajos, 2026-09-03. El criterio de arriba dice cómo **reconocer** un valor
con dos significados; éste dice **qué hacer** cuando ya lo tenés escrito y andando.*

> **Un desempatador es la señal de que dos cosas comparten un valor que no deberían compartir. El
> arreglo correcto no es un desempatador más astuto: es que no haya empate.**

**El caso, completo — y lo que lo hace útil es que el desempatador FUNCIONABA.** §5 le daba doble
significado a tres teclas —«F9 Gastos / efectivo», «F10 Inventario / transferencia»—. Para
resolverlo escribí `hayCobroAbierto()`: un marcador en el DOM (`data-ambito-cobro`) que declaraba
«hay un cobro abierto», y ahí mandaba el cobro. Andaba, tenía su spec en verde, y hasta tenía un
buen argumento sobre por qué el DOM y no un orden de listeners.

**Nada de eso era el problema.** Al darle a cada tecla **un solo significado** —navegar se queda con
F9/F10/F11, los medios de pago pasan a E/T/C— la ambigüedad desapareció y **el mecanismo se quedó
sin trabajo**: se borró entero, junto con su atributo, su consulta al documento y su justificación.
Ninguna de las tres hacía falta.

⚠️ **Por qué un desempatador es peor que el empate que resuelve.** El empate es un defecto visible:
alguien se confunde. El desempatador lo **tapa** y agrega tres cosas nuevas — un mecanismo que
mantener, un caso más en cada spec, y una condición que el próximo va a copiar sin entender. Y sobre
todo: **convierte un problema de modelo en un problema de implementación**, que es el peor cambio de
categoría posible, porque a partir de ahí se discute cómo desempatar mejor y ya nadie pregunta por
qué hay empate.

🔴 **Y el desempatador tiene fecha de vencimiento que nadie ve.** El de acá se apoyaba en que el
cobro era un **modal**: un modal crea un MODO —está o no está— y el modo desambigua. La decisión de
poner el cobro **en línea** eliminaba el modo, y con él la condición entera — **sin producir un solo
rojo**: F9 simplemente habría dejado de navegar para siempre, en silencio. El desempatador no falla
cuando cambia el mundo: **deja de aplicarse**, que es peor.

**LA SEÑAL DE DETECCIÓN, y es lo accionable:**

> **Si estás escribiendo código para decidir CUÁL de dos significados aplica, mirá primero si podés
> quitarle uno.**

Cuenta cualquier forma: un `if` de modo, un flag, un marcador en el DOM, un orden de suscripción,
una prioridad, un "en esta pantalla gana X". Todos son la misma cosa. La pregunta previa —y es de
diseño, no de código— es **cuál de los dos significados es el LOCAL**: ése cede. Acá navegar es
global y §5 promete que los atajos funcionan siempre; elegir medio de pago es de una sola pantalla.

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

### ⚠️ CRITERIO SIN NÚMERO · "USAR LOS TOKENS" NO ES "USAR LA PRIMITIVA"

*Medido el 2026-09-02, llevando la cuenta de los badges del re-skin.*

Un barrido de colores y una migración a componentes **se ven iguales en una captura** y no lo son.
Es la diferencia entre **tokenizar** y **re-skinear**, y conviene tenerla escrita porque el primero
se siente terminado:

| | barrido de tokens | migración a la primitiva |
|---|---|---|
| Qué cambia | los VALORES de color | la FORMA del markup |
| Qué queda | 30 líneas de `style={{...}}` inline con `var(--…)` | un `<Badge tone="…">` |
| Verificable | sí, con un grep de hexes | sí, con un grep del componente |
| **Qué NO arregla** | **nada de lo estructural** | — |

🔴 **Lo que el barrido deja intacto, y es lo que importa:**

1. **El próximo nace distinto.** Un `style` inline no le enseña nada a quien escriba el siguiente:
   va a copiar el de al lado, o a inventar el suyo. La primitiva es el único mecanismo que hace que
   la forma se propague sola.
2. **El markup sigue contradiciendo la skill.** Un badge con los colores correctos pero padding,
   radio y peso propios **no es el componente del §4**: se le parece.
3. **Un cambio de diseño futuro no llega.** Cambiar el radio de las píldoras es una línea en la
   primitiva y N ediciones en el markup inline — que es exactamente el modo de fallo de R1.

**Caso medido:** los dos badges de Turnos (`overdraft-badge` en `CloseShiftModal`,
`overdraft-warning` en `MovementsModal`) **tienen los colores migrados y siguen siendo markup
inline**. Pasaron el censo de hexes en cero y no pasaron nada más. Si el conteo de "badges
migrados" los hubiera contado, habría dicho 6 de 6 con 2 sin migrar.

**Lo accionable:** al cerrar una pantalla, contar **las dos cosas por separado** — hexes fuera, y
componentes adentro. Un cero de hexes no implica lo segundo, y el registro tiene que decir cuál de
las dos se hizo.

⚠️ Corolario que ya se aplicó: **no forzar la primitiva donde no encaja.** En `SalesHistoryPage`,
`MoneyCell` se descartó a propósito — sus siete cifras son spans inline de un modal con tamaños de
12 a 22px, y el 13px/500 fijo del componente pelearía con cada uno. Ya aplican `tabular-nums` y el
formateador único, que es lo que la primitiva garantiza. **Usar el componente donde estorba es peor
que no usarlo**; lo que no vale es no usarlo *y no decir por qué*.

---

### 🔴 CRITERIO SIN NÚMERO · TODO LO QUE SALE DEL PRODUCTO EN PAPEL O EN ARCHIVO TIENE QUE SER ASEVERABLE SIN UN HUMANO MIRANDO

*Medido el 2026-09-02 quitando el IVA falso del ticket (deuda 62a).*

> **Si para verificar lo que imprimís hay que imprimirlo y mirarlo, nadie lo verifica.**

El ticket afirmaba *"IVA 19% incl."* sobre un dato que no existe en ninguna tabla. Sobrevivió porque
su HTML se construía **dentro** de la función que llama a `window.print()`: no había forma de
aseverar su contenido sin abrir el diálogo del navegador. **El lugar donde no se puede mirar es el
lugar donde las afirmaciones falsas sobreviven** — y es justo el que llega al cliente.

**Lo accionable, y cuesta un `export`:** la construcción del artefacto se separa de su entrega.
`buildSaleTicketHtml(datos) → string` es testeable; `printSaleTicket(datos)` solo lo entrega. Igual
para un workbook: `buildWorkbook(datos) → wb` aparte de la descarga.

**Dónde aplica hoy** — todo lo que cruza la frontera del producto:

| artefacto | estado |
|---|---|
| ticket de venta (POS) y su reimpresión | ✅ `buildSaleTicketHtml`, con test unitario (2026-09-02) |
| arqueo impreso | ✅ `buildCashReportHtml` ya estaba separado; ⛔ sin test |
| Excel financiero y Excel de stock | va con la deuda 53 |

⚠️ Y el corolario que lo hace regla y no anécdota: **un artefacto que sale del producto y no tiene
test es una afirmación sin verificar, aunque el código que lo genera se vea bien.** El compilador ve
un string.

---

### 🔴 CRITERIO SIN NÚMERO · UN ARTEFACTO QUE SE ARCHIVA TIENE QUE TRAER SU CONTEXTO ADENTRO

*Complemento del criterio de arriba. Aquél dice que lo que sale del producto tiene que ser
**aseverable**; éste, que tiene que ser **autoexplicativo**.*

> **El contexto no viaja con el archivo.** La pantalla se corrige mañana y el usuario vuelve a
> mirarla; un archivo guardado en diciembre se abre en marzo tal como salió, sin la app al lado, sin
> la conversación que lo explicaba, y sin nadie que recuerde de dónde vino el número.

**Dos casos medidos el 2026-09-02:**

| artefacto | qué le faltaba | qué trae ahora |
|---|---|---|
| **Excel financiero y de stock** (deuda 53) | dos libros del mismo período con totales distintos —vendido, cobrado y venta bruta— y **ninguna hoja decía por qué** | una hoja `Definiciones` en cada libro, con qué mide cada columna y por qué la venta bruta **no** coincide con el vendido |
| **Ticket de venta** (deuda 62a) | no decía **qué era**: ni "Factura" ni nada. Se entrega y quien lo recibe supone que es soporte tributario | dice `COMPROBANTE DE VENTA` |

**Lo accionable, en una pregunta:** de lo que este archivo o papel afirma, ¿cuánto se entiende **sin
la app abierta y sin nadie que lo explique**? Lo que no se entienda, va adentro del artefacto — no en
la pantalla que lo generó, ni en un instructivo, ni en la cabeza de quien lo exportó.

⚠️ Y el corolario que lo hace barato: **el lugar donde ponerlo es el mismo donde se construye**. Una
hoja de definiciones son diez líneas al lado del código que arma las columnas; explicarlo después,
cuando alguien pregunta por qué dos archivos no cierran, cuesta el diagnóstico entero.

🔴 **UNA MIGRACIÓN APLICADA ES UN ARTEFACTO QUE SE ARCHIVA, Y POR ESO UN NÚMERO INVENTADO EN SU
CABECERA TIENE LA MISMA FORMA QUE UN EXCEL SIN DEFINICIONES.** *Error propio, 2026-09-02, deuda 46.*

Escribí en la cabecera de la migración *"Filas contadas ANTES de tocar: customers 5, orders 173"*
**sin haberlas contado**. Los números reales eran **74 y 1.320**.

Lo que lo hace de esta familia y no un descuido cualquiera: **por R5 una migración aplicada no se
edita nunca**. Es registro histórico por definición, se lee meses después, fuera de contexto y con la
autoridad de estar en `supabase/migrations/`. Nadie que la lea va a poder distinguir un conteo medido
de uno verosímil — exactamente como nadie podía distinguir por qué dos Excel del mismo período daban
totales distintos.

✅ **Lo cazó el hook**, que ante un `.sql` pide las cuatro preguntas de R0 e incluye *"contar las filas
ANTES de tocarlas"*. Leerla me mandó a medir, y ahí no coincidió. **Se corrigió antes del `db push`,
que es el momento exacto en que dejaba de ser reversible.**

**La regla, que ya existía y acá cobra su forma más cara:** *un número sin comando es una opinión con
dígitos*. En una nota se corrige; **en una migración aplicada, no.**

---

### 🔴 CRITERIO SIN NÚMERO · EN EL RESUMEN DE UNA SUITE, LOS CEROS SON **AUSENCIA DE LÍNEA**

*Medido el 2026-09-02, al cerrar el Bloque 3. Es "indistinguible de" aplicada al resumen de la suite.*

> **Un `grep failed` que vuelve vacío es indistinguible de un `grep` mal escrito.**

Playwright imprime `failed`, `flaky` y `did not run` **sólo cuando son distintos de cero**. Así que
el resumen de una corrida perfecta dice exactamente dos líneas:

```
  17 skipped
  202 passed (15.2m)
```

Los otros tres números **no están**. Y "no está la línea" es el mismo resultado que produce un patrón
equivocado, un archivo truncado, una corrida que murió antes de escribir el resumen, o un `grep`
sobre el archivo que no era. **Cuatro causas distintas, una sola observación.**

⚠️ Es el modo de fallo que más tranquiliza: el que busca `failed` y no lo encuentra concluye que no
hubo fallos, y **la ausencia es justamente lo que un instrumento roto produce por defecto**.

**LO ACCIONABLE:** los cinco números se verifican **uno por uno**, no se leen del resumen. Y el que
falta se reporta como *"ninguna línea, o sea 0"*, no como *"0"* a secas — la diferencia es qué se
midió.

🔴 **SEGUNDO CASO, 2026-09-03, y trae una causa que la primera versión no contemplaba.** Acá no fue
que Playwright omitiera los ceros: **fue que no llegó a imprimir nada.** La corrida abortó al
arrancar —el puerto seguía tomado por un proceso huérfano (deuda 70)— y el archivo tenía tres
líneas. `grep passed` vacío, `grep failed` vacío: **idéntico a una corrida perfecta vista por el
resumen.** Lo resolvió abrir el archivo, que decía la razón en una línea.

⚠️ Lo que agrega: la lista de causas de "no está la línea" tenía cuatro y ahora tiene cinco, y la
nueva **no es un error del instrumento sino del entorno**. Corolario práctico: cuando los cinco
números vengan todos vacíos, la hipótesis correcta **no es "no hubo fallos"** — es *"la corrida no
existió"*, y se confirma mirando el largo del archivo antes que su contenido.

🔴 **TERCER CASO, 2026-09-03 — Y EL INSTRUMENTO QUE FALLÓ FUE EL COMANDO DE ESTE MISMO BLOQUE.**

El reporter `line` **reescribe la línea de progreso** con `\x1b[1A\x1b[2K` antes de imprimir el
resumen, así que **la PRIMERA línea del resumen queda pegada a esa secuencia de control** y ya no
empieza con espacios:

```
^[[1A^[[2K  17 skipped        ← el ^ del patrón no matchea: la línea arranca con el escape
  255 passed (17.2m)          ← ésta sí, porque es la segunda
```

El comando de acá abajo, anclado en `^`, leyó **`skipped -> (ninguna línea: 0)`** sobre 17 skipped.

⚠️ **Y la versión grave es la que no tocó esta vez: cuál línea se come el prefijo depende de cuál
se imprime PRIMERO.** Acá fue `skipped` y el daño fue cosmético. Si en una corrida con fallos la
primera es `failed`, **este comando reporta 0 fallos sobre una suite roja** — que es exactamente el
modo de fallo que R9 existe para evitar, reintroducido por la herramienta que la aplica.

✅ **Lo cazó el cruce, no el patrón** —255 no cerraba con los 272 tests emitidos—, que es la tercera
técnica: *un número que no cierra con otro que ya conocías es la señal más barata que tenemos.*

**LA VERSIÓN CORREGIDA: se limpian los escapes ANTES de contar.**

```bash
sed 's/\x1b\[[0-9;]*[A-Za-z]//g' salida.txt > salida-limpia.txt
for k in passed failed flaky skipped "did not run"; do
  echo "$k -> $(grep -E "^ *[0-9]+ $k" salida-limpia.txt || echo '(ninguna línea: 0)')"
done
grep -n "suite_exit=" salida-limpia.txt   # R9: el exit va escrito ADENTRO del archivo
# y el CRUCE, que es lo que caza al patrón que discrimina mal:
#   passed + skipped  ==  el último [N/N] emitido
grep -oE "\[[0-9]+/[0-9]+\]" salida-limpia.txt | tail -1
```

⚠️ Y el complemento, que es lo que convierte el conteo en evidencia: **cruzarlo con un número que ya
conocías**. `202 passed + 17 skipped = 219`, que tiene que ser **el último número de test emitido**.
Si no cierra, una de las dos cuentas está mal — y averiguar cuál es el trabajo.

---

### 🔴 CRITERIO SIN NÚMERO · INFERIR LA CAUSA ANTES DE MIRARLA — TRES VECES EN UN DÍA

*2026-09-03. Tres veces en una sesión — y el patrón tiene DOS puntas, no una.*

| # | lo que inferí | lo que era |
|---|---|---|
| 1 | *«el guard de mixto/fiado sólo vive en una condición de render»* | estaba en la RPC, con su `raise` y su comentario |
| 2 | *«el marcador dice que la tanda 4 llegó»* | el marcador no fechaba: el commit lo conservó |
| 3 | *«el deploy debe apuntar a otra rama»* | faltaba un `git push` — 18 commits locales |
| 4 | *«el picker está vacío por los 151 clientes inactivos»* | había **cero activos**; los 168 inactivos son invisibles en la UI y no tenían nada que ver |

🔴 **Y LA ATRIBUCIÓN COMPLETA, porque la mitad se pierde si sólo se anota la primera:** en los tres
casos la hipótesis se **inventó** de un lado y se **aceptó** del otro **sin pedir el comando**. El
más caro es el primero: la deuda del guard no sólo se escribió sobre una descripción — se
**aprobó**, con alcance y clase asignados (*«es la misma forma que la deuda 24 antes de las
policies»*), sin exigir la definición de la RPC. Iba a entrar al registro con la autoridad de una
clase conocida.

⚠️ **Que encaje con un caso real del repo es lo que la hace pasar, no lo que la hace cierta.** Una
hipótesis que confirma lo que el otro ya esperaba **se revisa menos** — es el corolario de R4 leído
sobre la jerarquía, y por eso el criterio tiene que nombrar las dos puntas y no sólo a quien
escribe.

⚠️ **La cuarta agrega algo:** no fue una causa inventada sino **un síntoma atribuido al objeto más
visible que estaba cerca**. Había 168 clientes inactivos y un picker vacío, y la vecindad se leyó
como causalidad. Medir tardó un `select`: **activos = 0**. Y el plan que salía de la hipótesis —
*«limpiar los inactivos»*— habría sido un `delete` sobre **162 filas referenciadas por ventas
reales**, o sea destructivo **y** inútil.

**Las cuatro tienen la misma forma:** una hipótesis **plausible y estructurada** —tiene clase, tiene
precedente en el proyecto, se explica bien— construida **antes** de correr el comando que la
contesta. Y el comando siempre existía y costaba segundos: `awk` sobre la función, `git log -S`,
`git rev-list origin/develop..develop`.

⚠️ **Lo que las hace peligrosas no es equivocarse: es que la hipótesis buena SUENA A DIAGNÓSTICO.**
*"Es un invariante sin guard"*, *"el deploy apunta a main"* — las dos encajan con casos reales del
repo, así que se transmiten con la autoridad de algo verificado y **el que las recibe no tiene señal
de que no lo estén**.

**Lo accionable, y es de las dos puntas:** quien infiere **dice que está infiriendo** —«sospecho»,
no «es»— y corre el comando antes de escribirlo en un registro. Quien recibe una causa **pide la
salida del comando, no el razonamiento** — y sobre un invariante, el `raise` textual antes de
asignarle clase a una deuda.

⚠️ Es el corolario de R4 aplicado al diagnóstico en vez de a la verificación: **una explicación que
encaja no es evidencia de que sea la explicación.**

---

### 🔴 CRITERIO SIN NÚMERO · UNA CORRIDA EN SEGUNDO PLANO Y UNA EDICIÓN SON EXCLUYENTES

*2026-09-03, corte 4. Defecto propio, y con el agravante de que la advertencia estaba escrita por mí
unas horas antes, en esta misma sesión.*

> **Una corrida en segundo plano congela el árbol para EL QUE LA LEE, no para el que edita.**

El `webServer` de Playwright es `pnpm dev`, con HMR. Editar `src/` con una suite corriendo **cambia
la aplicación debajo de los tests que ya empezaron**: los que corrieron antes midieron un código y
los de después miden otro, y **el resumen los suma como si fueran la misma corrida**. El resultado no
es un falso rojo ni un falso verde: es un número **que no corresponde a ningún estado del árbol**.

**El caso.** Lancé los diez specs re-derivados en background y seguí retirando el modal. La corrida
devolvió 8 rojos que no eran evidencia de nada — ni de que el cambio estuviera mal, ni de que
estuviera bien. Se descartó entera y hubo que repetirla.

⚠️ **Y el motivo por el que la advertencia no alcanzó es el de siempre:** *"mientras tanto"* se
siente libre. Una corrida en background da exactamente la sensación de que el tiempo está
disponible, que es cuando la regla haría falta y es cuando no se convoca.

**LO ACCIONABLE, y NO es acordarse:** **la corrida en background y la edición de `src/` son
excluyentes por regla**, igual que el mutante se aplica y se revierte sobre árbol limpio. Mientras
una suite corre: se leen artefactos, se escriben documentos, se enumera con `grep` — **no se toca el
código que la suite está midiendo**. Si hace falta editar, se mata la corrida y se relanza después;
descartar quince minutos de suite cuesta menos que interpretar un resultado que no existe.

⚠️ Corolario para el que lee un resultado: si entre el lanzamiento y el cierre hubo ediciones en
`src/`, **el resultado se descarta sin mirarlo**. No se salva ningún caso: no hay forma de saber
cuáles corrieron contra qué.

---

### 🔴 CRITERIO SIN NÚMERO · CÓMO SE APLICA Y SE REVIERTE UN MUTANTE (arnés, no test)

*Tres fallas encadenadas el 2026-09-02, todas mías, en una sola verificación de cuatro minutos.*

1. 🔴 **El mutante se aplica y se revierte sobre un árbol LIMPIO, verificado con `git status` ANTES.**
   Revertí un mutante con `git checkout -- archivo` y **se llevó puesto el arreglo**, que estaba en el
   mismo archivo y sin commitear. Resultado: una corrida "con mutante" que en realidad tenía el
   arreglo, y otra "revertida" que no tenía ninguno de los dos. Si hay trabajo sin commitear, el
   revert es la **sustitución inversa exacta**, o se commitea el arreglo primero y el mutante va
   después.
2. 🔴 **Un conteo que baja no dice QUÉ desapareció.** Corrí `grep -c IVA` para confirmar el revert,
   dio **2**, y lo leí como *"el mutante ya no está"*. Significaba lo contrario: eran las dos líneas
   originales, y **el arreglo tampoco estaba**. Tercera vez que cobra el mismo criterio —*enumerar,
   no contar*—: un conteo esconde qué contó, y el número que uno espera se lee en el que salga.
3. 🔴 **Un test que puede pasar con entrada vacía no prueba nada.** El caso leía el ticket con
   `innerText ?? textContent`; `innerText` devuelve `''` para un nodo oculto, y con `''` todas las
   aserciones de *"no dice X"* pasan **sin mirar nada**. Lo que lo convierte en test es la aserción
   de que **el contenido no vino vacío** — el control negativo de la propia lectura.

✅ Lo que salvó la verificación fue el mutante mismo: existía para no confiar en el verde, y el que
**no murió** destapó las tres. **Un test que no se puede poner rojo a voluntad no está verificado.**

---

### 🔴 CRITERIO SIN NÚMERO · UN TEST DE NEGACIÓN TIENE QUE EXIGIR QUE NIEGUE **POR LA RAZÓN CORRECTA**

*Medido el 2026-09-02 escribiendo el spec de la deuda 60. Es R10 aplicada a los tests de seguridad:
el mutante muere, pero por la razón equivocada.*

> **"Esperaba que negara" está VERDE con el defecto puesto**, si algo más niega primero.

**El caso.** `adjust_stock` tenía el guard de sede roto (comparaba contra un posible NULL), pero
**negaba igual**: el `has_permission('inventario.ajustar')` que venía DESPUÉS rechazaba al usuario
desactivado con *"No autorizado para ajustar inventario"*. Un test que solo pidiera `expect(error).not
.toBeNull()` habría pasado — y el guard de sede habría seguido sin evaluar, listo para abrirse el día
que un rol tenga ese permiso.

**Lo accionable:** un test de negación asevera **el mensaje del guard que debe contestar**, no que
haya error. Y cuando dos guards pueden negar el mismo caso, el test dice **cuál de los dos** —
si contesta el otro, el que se está probando no está funcionando.

⚠️ Corolario, que es el mismo de R10 leído al revés: **un verde sospechoso no es el que pasa siempre,
es el que pasaría también sin el sujeto.** Antes de dar por bueno un test de seguridad, preguntá qué
otra cosa podría producir ese mismo rojo.

---

### 🔴 CRITERIO SIN NÚMERO · UN GUARD QUE COMPARA CONTRA UN POSIBLE NULL NO FALLA CERRADO NI ABIERTO: NO EVALÚA — Y UN GUARD QUE NO EVALÚA DEJA PASAR

*Medido en la auditoría A2 (2026-09-02). Es la clase más peligrosa del repo porque no se parece a un
error: se parece a un guard.*

> **En SQL, `x <> NULL` no es verdadero ni falso: es NULL.** Un `if` sobre NULL **no dispara**. El
> guard no rechazó y no aceptó — **no preguntó**, y lo que sigue se ejecuta como si hubiera aceptado.

**El caso.** Tres RPC tenían `if v_sede_id <> get_my_sede_id() then raise 'no pertenece a tu sede'`.
Con un usuario **desactivado**, `get_my_sede_id()` devuelve NULL (los helpers filtran `is_active`, a
propósito y bien). La comparación da NULL, el `if` calla, y la función —`SECURITY DEFINER`, sin RLS—
**escribió ítems y descontó stock en una orden de OTRA organización.** Medido, no inferido: líneas
1 → 2, stock 10 → 7, con el token de un usuario dado de baja.

⚠️ **Por qué no lo vio nadie:** la misma NULL, en una **policy**, falla **cerrada** —RLS trata NULL
como falso y las 276 celdas del desactivado dieron cero—. La intuición "NULL = falso = niega" es
correcta en RLS y **falsa en plpgsql**, y las dos conviven en el mismo repo. Y hay una tercera
trampa: en `adjust_stock` la misma línea existe y **parece cerrada** porque el `has_permission` que le
sigue la tapa. Un guard tapado no es un guard arreglado: el día que el permiso se conceda, se abre.

**La regla, en una línea:**

> **Todo guard que compare contra una función que puede devolver NULL verifica el NULL PRIMERO,
> como primer guard, antes de cualquier comparación.**

```sql
-- ⛔ no evalúa con un inactivo
if v_sede_id <> get_my_sede_id() then raise exception '...'; end if;

-- ✅ la forma que las otras cuatro RPC ya usaban
v_sede_id := get_my_sede_id();
if v_sede_id is null then raise exception 'No tienes una sede activa'; end if;
if v_sede_id <> v_orden_sede then raise exception 'La orden no pertenece a tu sede'; end if;
```

⛔ **Lo que NO es el arreglo: agregar un `has_permission` después.** Tapa el síntoma en un sitio y deja
la comparación NULL viva para el siguiente que copie la línea. Se arregla la comparación, en **todos**
los sitios de la clase, en el mismo commit (R3). Cómo enumerarlos:
`grep -rnE "(<>|!=|=)\s*(public\.)?[a-z_]+\(\)" supabase/migrations/` y preguntarle a cada función
si puede devolver NULL. Las que filtran `is_active` o `auth.uid()` pueden **siempre**.

**Por qué es una clase y no un bug:** cualquier función que resuelva "quién soy" —sede, organización,
rol— tiene un caso en que la respuesta es *nadie*: usuario sin perfil, desactivado, token sin `sub`.
Ese caso es exactamente el que un guard existe para frenar, y es exactamente el que la comparación
directa no ve.

---

### 🔴 CRITERIO SIN NÚMERO · UNA ESCRITURA QUE PERSISTE UN CÁLCULO NO EXISTE HASTA QUE TODOS SUS INSUMOS HAYAN CARGADO

*Sale de la auditoría A1 (2026-09-02): cuatro rojos con la misma forma, el peor en el cierre de caja.*

> **"Todavía no sé" y "no hay nada" no pueden compartir valor** cuando ese valor alimenta una
> ESCRITURA. Y el arreglo no es un spinner: **es que el botón no exista hasta entonces.**

**La forma, medida cuatro veces:** un hook devuelve un default vacío —`?? new Set()`, `?? []`,
`?? 0`, `?? {}`— mientras carga; un consumidor calcula algo con ese vacío y lo **persiste**. El
resultado es plausible (un cero, una lista vacía) y por eso nadie lo mira.

| dónde | qué se persiste con el vacío | consecuencia |
|---|---|---|
| cierre de caja | `expected_amount`, `difference`, snapshot | un arqueo falso **que se reimprime sin recomputar** |
| guardar producto | `reconcile({ extraIds: [] })` | **borra** las asignaciones; un compuesto deja de descontar stock |
| confirmar extras | `onConfirm([])` | la línea entra al carrito sin extras: **cobra de menos** |
| config de caja | `{ ...{}, ...patch }` | **borra** `slug` y `nequi_qr_url` |

🔴 **Y el dato que decide la forma del arreglo: en tres de los cuatro, `isLoading` ESTABA disponible
y el consumidor no lo leyó.** El hook hizo su parte. Por eso la regla es sobre el **consumidor**:

1. **Leer la carga donde se decide**, no agregarla al hook que ya la expone.
2. **Una escritura que persiste un cálculo se deshabilita hasta que TODOS sus insumos hayan
   cargado** — no el primero, todos. El cierre de caja tiene tres (`salesSummary`, `movements`,
   `currentShift`); con uno solo cargado el arqueo sigue siendo falso.
3. **No es un spinner sobre el botón: es que el botón no se renderiza.** Un botón deshabilitado con
   spinner invita a esperar y volver a intentar; un botón ausente dice que la pantalla todavía no
   sabe lo suficiente para ofrecer la acción.
4. **El error de carga es un estado del formulario, no un cero.** Si la consulta falló, el
   formulario lo dice y no ofrece guardar; el `?? 0` convierte un fallo en un número.

⚠️ Corolario para escribir hooks: un hook que devuelve un valor derivado (un `Set`, un número, un
booleano) **tiene que devolver también su carga**, porque el consumidor no tiene otra forma de
saberlo. `useProductsWithExtras` no la devolvía; ése fue el único de los cuatro donde el hook era el
culpable.

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
| una consulta SQL de diagnóstico | vendido vs cobrado por día | el `left join` a `payments` **multiplicaba `o.total`** por cada pago: una venta mixta contaba doble | **un número no cerró con otro ya conocido**: 165 órdenes donde la app decía 158 |
| grepear el FUENTE por un `@keyframes` | si la animación existía | el fuente no ve lo que **Tailwind emite en el build** | **compilando** y grepeando `dist/assets/*.css` |
| `grep '\?\? new Set\('` en A1 | los `new Set()` como default | no veía `new Set<string>()` — el parámetro de tipo | **el control escrito de antemano**: la 54 TENÍA que aparecer, y dio cero |
| el script de captura de A6 | la pantalla pedida **de la maqueta** | la que estuviera abierta: `getByText('Historial').last()` tomó un encabezado del panel de Clientes y **nunca navegó** | **mirando la captura**: era una imagen creíble de otra pantalla |
| el **mismo** script, ya "arreglado" | ídem | ídem: `Cartera` es **título de grupo Y ítem de navegación**, y el primero en orden de DOM es el grupo, que no navega | **mirando la captura**: el par de Cartera mostraba el Mostrador |
| una marca en `window` + apretar **F5**, para medir `preventDefault` | que el atajo le gana al navegador | **nada**: Chromium bajo automatización **no ejecuta la acción de navegador** de las teclas de función, así que la página no se recargaba de ninguna forma y la marca sobrevivía siempre | **el mutante**: quitado el `preventDefault`, el caso siguió VERDE |
| `grep -cE '^  ok  [0-9]+'` sobre la salida de la suite | cuántos tests pasaron | asumía **dos espacios fijos**; el reporter **alinea el número por ancho**, así que `ok 1`, `ok  99` y `ok 219` no coinciden con el patrón. Contó **89 de 202** | **cruzando**: 89 no cerraba con las 202 del resumen. Con `^  ok +[0-9]+`: 202 + 17 skipped = **219**, el último número de test emitido |

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

**LO ACCIONABLE, y son TRES técnicas:**

1. **Control negativo** — corré el instrumento contra algo que **sabés que no existe**. Si contesta
   lo mismo, no mide. Cuesta una línea.
2. **Enumerar antes de contar** — pedile la LISTA, no el número, y mirala. Un conteo esconde qué
   contó; una lista lo muestra. Los dos greps se cazaron así, y ninguno se habría cazado mirando
   el total.
3. 🔴 **Cruzar contra un número que ya conocías** — la más barata de las tres, y la que cazó la
   quinta **y la octava**. La consulta dijo **165 órdenes** donde la app venía diciendo **158**. No
   hacía falta entender el `left join`: **bastó que dos cifras del mismo hecho no cerraran.**

   ⚠️ **Las técnicas 1 y 3 no son la misma, y conviene tener las dos escritas** porque atrapan cosas
   distintas: el **control negativo** corre el instrumento contra algo que sabés que **no existe** y
   caza al que **no discrimina** (contesta lo mismo con y sin el recurso); el **control cruzado**
   cuenta **lo mismo por dos caminos** y caza al que **discrimina mal** (mide, pero mide de menos).
   Un grep con el patrón demasiado estricto pasaría el control negativo sin problema —da cero donde
   tiene que dar cero— y sólo cae cuando su total no cierra con otro que ya conocías. La octava falla
   fue exactamente ésa: contó 89 de 202 y ningún control negativo lo habría visto.

   > **Un número que no cierra con otro que ya conocías es la señal más barata que tenemos.**

   Cuesta cero y funciona sobre instrumentos que no se pueden auditar de otra forma. Corolario
   práctico: al escribir una consulta de diagnóstico, **incluí una columna que ya sepas cuánto
   debe dar** — un conteo, un total del día — aunque no la necesites para la pregunta. Es el
   control negativo de los números.

🔴 **LA UNDÉCIMA ES DE OTRO EJE: NO MIDIÓ MAL, MIDIÓ OTRA COSA — UN INSTRUMENTO DE FECHADO.**
*2026-09-03, comparando el bundle desplegado contra el local.*

Las diez anteriores median **el estado presente** y lo median mal. Ésta contesta *«¿de cuándo es
este artefacto?»* y **contesta bien una pregunta distinta de la que se le hizo**.

**El caso.** Para fechar un bundle desplegado se buscan **marcadores**: testids que un commit
concreto introdujo. Si el marcador está, el bundle es posterior a ese commit. Usé `oversold-alert`
como marcador de la tanda 4 del re-skin; apareció en el bundle viejo, y **no porque el bundle fuera
posterior**: la alerta de sobreventa **ya existía** en `ProductCard`, y la tanda 4 **la conservó** al
migrar a filas — era un (d), y los (d) no se tocan.

> **Un marcador fecha sólo si el commit lo INTRODUJO. Si lo CONSERVÓ, aparece en los dos lados y no
> discrimina.**

⚠️ **Es «clasificar por síntoma en vez de por causa» movido al eje del tiempo.** El síntoma —el
testid está presente— es idéntico en los dos casos; la causa —lo creó ese commit vs ya estaba— es
lo que decide si el marcador sirve. Y como el resto de los marcadores sí discriminaban, el falso
**se leyó como confirmación de los otros** en vez de destacarse.

**LO ACCIONABLE, y cuesta un comando por marcador:** antes de usar un testid para fechar, verificar
que ese commit lo **creó** y no lo movió:

```bash
git log --oneline -S'<el-marcador>' -- src/ | tail -1   # el commit que lo introdujo, no el que lo tocó
```

✅ Y el control barato: **usar varios marcadores y desconfiar del que no coincide con los demás.**
Acá cinco marcadores decían «anterior a la tanda 1» y uno decía «posterior a la tanda 4»; el que
disentía era el defectuoso, no los cinco.

🔴 **SEGUNDA VARIANTE, EL MISMO DÍA: UN TESTID COMPUESTO EN RUNTIME NO EXISTE COMO LITERAL EN NINGÚN
BUNDLE.** Verificando que el deploy nuevo trajera todo, `kpi-vencido` dio **cero en el viejo y cero
en el nuevo**. No era un deploy incompleto: el testid se arma con
`` data-testid={`kpi-${testid}`} `` sobre `key: 'vencido'`, así que **la cadena `kpi-vencido` no
existe en el fuente ni en el compilado** — sólo en el DOM, en tiempo de ejecución.

| variante | por qué no discrimina |
|---|---|
| el commit lo **conservó** | aparece en los dos lados |
| el testid se **compone en runtime** | no aparece en ninguno |

⚠️ **Mismo síntoma —da lo mismo en los dos bundles— y causa opuesta.** Por eso el control es el
mismo y sirve para las dos: **varios marcadores, y desconfiar del que no coincide.** Los marcadores
reales de esa tanda —`Productos con existencia`, `Nombre de la sede`— sí discriminaron.

**Lo accionable que agrega:** un marcador tiene que ser una **cadena literal del fuente**. Antes de
usarlo, `grep` en `src/`: si no aparece tal cual, no sirve para fechar un bundle.

🔴 **LA DUODÉCIMA, Y LA PEOR UBICADA DE TODAS: LA SONDA QUE VERIFICABA EL CRITERIO SOBRE ESTE MISMO
PATRÓN.** *2026-09-03, midiendo el alto mínimo del mostrador.*

Una **sonda manual** y un **caso del spec** reprodujeron el mismo escenario —tres ítems en el
carrito— y **dieron resultados opuestos**: la sonda decía que a 680px entraba todo, el caso decía
que no.

**Tenía razón el caso.** `Lab Coctel` abre el modal de configuración de extras, y **el caso lo
confirma; la sonda no lo contemplaba**. Así que la sonda se quedaba en dos filas con un modal
abierto encima y **medía un escenario que no era el que decía medir** — reportó «entra a 680» sobre
una pantalla que nunca tuvo tres filas.

⚠️ **Lo que la hace la peor ubicada de las doce:** esa sonda existía para verificar un arreglo cuyo
criterio, escrito en el mismo commit, dice *«una aserción sobre una capacidad de N no está ejercida
con N=1»*. **El instrumento que comprobaba el criterio incumplió el criterio.**

> **Una sonda manual que reproduce el escenario de un caso existente REUSA SUS HELPERS — no lo
> reescribe.**

**Por qué es una regla y no un consejo:** reescribir el escenario **duplica el contrato**. El
escenario del caso ya sabe cosas que costó descubrir —qué producto abre un modal, cuál está sin
stock, cuál hay que confirmar— y el lado duplicado **nace sin ese conocimiento**. Es R1 aplicado a
los escenarios de prueba: dos lados, nada que los sincronice, y el que se congela es el nuevo.

⚠️ Y el modo de fallo es el de siempre en esta familia: **el lado duplicado no falla — mide de
menos y reporta un verde.** Acá el verde era *«el alto mínimo de la maqueta se sostiene»*, que es
justo la conclusión cómoda.

✅ **Lo que lo destapó:** correr contra **la URL real**, donde el caso del spec y la sonda no podían
seguir dándose la razón por separado. Séptima aparición de *«dos fuentes que coinciden no son
evidencia»*, y primera en que las dos fuentes eran **instrumentos nuestros midiendo lo mismo**.

🔴 **LOS DOS ÚLTIMOS SON EL MISMO INSTRUMENTO, Y ESO ES EL HALLAZGO.** *2026-09-03, tanda 5 de A6.*

> **Un instrumento arreglado con un control que no puede fallar queda peor que antes: ahora falla
> igual, y con un verde encima.**

La primera vez, la captura de la maqueta navegaba mal y **producía una imagen creíble de otra
pantalla, sin error**. El arreglo acotó el selector al sidebar y —bien— **agregó un control**: que
el título dijera lo que se pidió. El control era esto:

```js
const h = (await page.locator('body').innerText()).slice(0, 200);
if (!h.includes(def.mock)) console.log('?? el título no confirma', def.mock);
```

**Los primeros 200 caracteres del `body` son EL SIDEBAR**, y en el sidebar el rótulo pedido está
**siempre**, se haya navegado o no. El control no podía dar rojo. Dio verde sobre la captura del
Mostrador rotulada `cartera-normal.png`, y esa captura se usó para cerrar una tanda.

⚠️ **Y la segunda causa raíz es la que casi se repite otra vez.** Al arreglar el selector probé
*«el rótulo que no empieza en el margen»* —el ítem lleva icono, el título de grupo no— y eso dejó
afuera a **Configuración**, que vive en el pie y tampoco tiene icono. Dos criterios geométricos
seguidos, los dos plausibles, los dos falsos. **La propiedad que separa un ítem de un rótulo no es
dónde está: es que NAVEGA.** La versión que quedó prueba los candidatos y se queda con el que hace
cambiar el título — **el control ELIGE en vez de confirmar**, así que no puede quedar de adorno.

**Lo accionable, y es el corolario de R4 aplicado a los controles:** después de escribir un control,
**escribí cómo se vería su rojo**. Si la respuesta es "no se me ocurre", el control es decorativo.
Y si se puede, hacé que el control **decida** en vez de confirmar: un control que elige no se puede
ignorar.

🔴 **Y LA DÉCIMA, EL MISMO DÍA Y UN TURNO DESPUÉS DE ESCRIBIR ESTO.** *2026-09-03, cableando F12.*

El spec de los atajos tenía que probar que el `preventDefault` le gana al navegador. El caso escrito
ponía una marca en `window`, apretaba **F5** y aseveraba que la marca sobrevivía —o sea, que la
página no se había recargado—. Se veía como el instrumento correcto: la recarga es observable, a
diferencia de las herramientas que abre F12.

**El mutante lo sobrevivió.** Quitado el `preventDefault`, el caso seguía verde: **Chromium bajo
automatización no ejecuta la acción de navegador de las teclas de función**, así que la página no se
recargaba de ninguna manera. El caso no medía nada — y el comentario que yo mismo había escrito en
el spec afirmaba, con todas las letras, que ésa era *"la tecla que SÍ discrimina"*.

🔴 **LO QUE LA HACE LA MÁS ALECCIONADORA DE LAS DIEZ NO ES EL INSTRUMENTO: ES QUIÉN FALLÓ.**

> **No falló por desconocer la regla. Falló en quien acababa de redactarla, un turno antes, en este
> mismo archivo.**

La regla —*«después de escribir un control, escribí cómo se vería su rojo; si la respuesta es "no se
me ocurre", el control es decorativo»*— tenía **minutos de escrita** cuando escribí un control
decorativo. Y no lo escribí distraído: escribí **al lado** el comentario que afirmaba que ese caso
*"SÍ discrimina"*, o sea que **contesté la pregunta de la regla** — con una historia plausible en vez
de con una corrida.

**Es «no fallamos en saber, fallamos en convocar» aplicado a la regla MÁS NUEVA del repo**, que es
el peor caso posible para la hipótesis cómoda de que las reglas nuevas están frescas y por eso se
aplican. Estaba fresca, estaba escrita por mí, estaba a media pantalla de distancia. **La distancia
que importa no es la temporal ni la física: es entre la carga y la decisión** —el argumento del hook
contra el recordatorio, medido otra vez y ahora contra mí mismo—. Contestar la pregunta de una regla
no es aplicarla: aplicarla es **correr algo que pueda contestarla que no**.

⚠️ Corolario incómodo y accionable: **una regla recién escrita no protege más que una vieja.** Si
algo la hace cumplirse es un mecanismo —el mutante, acá—, no la frescura. El mutante existía en el
procedimiento desde antes y **fue lo único que la atrapó**.

✅ **El instrumento que sí mide no observa la CONSECUENCIA: observa el HECHO.** No *"el navegador no
hizo lo suyo"* —invisible acá— sino *"el evento salió con su default cortado"*:

```js
window.addEventListener('keydown', (e) => { espia[e.key] = e })   // se guarda el EVENTO
// …y `defaultPrevented` se lee DESPUÉS del despacho, no adentro del listener
```

Con eso se puede aseverar incluso **F12**, cuya consecuencia no es observable de ninguna forma. Y
lleva su **control negativo**: `F4` es la tecla de §5 que a propósito no se cableó, así que tiene
que salir con el default **intacto** — sin ese caso, un espía que devolviera `true` siempre pasaría
igual.

⚠️ **Y una tercera trampa en el mismo instrumento, que costó un rojo:** leer `defaultPrevented`
**adentro** del listener lo ata al orden de suscripción, y `useAtajos` se re-suscribe al navegar —
así que el espía terminaba corriendo **antes** que la aplicación y veía `false` sobre una tecla que
sí estaba cortada. Guardar el evento y leer el valor al final saca el orden de la ecuación.

**LO ACCIONABLE, Y ES NUEVO — la regla general que sale de este caso:**

> **Cuando la CONSECUENCIA de una acción no es observable en el entorno de prueba, se asevera EL
> HECHO, no la consecuencia.**

El entorno de prueba **no es el mundo**: un navegador bajo automatización no abre herramientas, no
recarga por F5, no entra en pantalla completa, no imprime, no descarga, no pide permisos. Un test
escrito sobre *"la consecuencia no ocurrió"* en un entorno **donde esa consecuencia nunca ocurre**
está verde por construcción — y se lee exactamente igual que uno que mide.

| Se quiere probar | ⛔ La consecuencia (invisible acá) | ✅ El hecho (observable siempre) |
|---|---|---|
| que el atajo le gana al navegador | la página no se recargó | el evento salió con `defaultPrevented` |
| que no se abrió una pestaña | no hay pestaña nueva | se llamó `preventDefault` sobre el `click` |
| que se disparó una impresión | salió el papel | se llamó `window.print` |

⚠️ Y el detalle de implementación que no es opcional: **el hecho se lee DESPUÉS del despacho**, no
adentro del listener — si no, se ata al orden de suscripción y vuelve a medir otra cosa (ver la
tercera trampa, arriba).

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

### 🔴 CRITERIO SIN NÚMERO · UN COMANDO ESCRITO EN ESTE ARCHIVO ES CÓDIGO EN PRODUCCIÓN, Y NECESITA LA MISMA VERIFICACIÓN

*2026-09-03. Es el cierre de la serie de fallas de instrumento, y sale de que la última fue de otra
especie que las doce anteriores.*

> **Una sonda mala miente UNA VEZ. Un comando canónico miente SISTEMÁTICAMENTE, en toda corrida, y
> con la autoridad de estar escrito.**

Las doce primeras fueron **sondas de un turno**: un `grep` para contestar una pregunta, que se
escribió, se corrió y se descartó. La decimotercera fue el **comando de los cinco números** —el que
este archivo prescribe para leer *toda* corrida de la suite—, y leyó `17 skipped` como `0`.

⚠️ **Y el modo de fallo tiene una propiedad que las sondas no tienen: DEJÓ DE FUNCIONAR SIN QUE
NADA CAMBIARA DE NUESTRO LADO.** El comando era correcto cuando se escribió. Lo rompió que el
reporter empezara a **reescribir la línea de progreso** antes del resumen, pegándole una secuencia
de control a la primera línea. Nadie iba a notarlo, porque el comando *seguía funcionando* — seguía
imprimiendo cinco líneas y cuatro de ellas eran ciertas.

> **Un comando canónico se REVERIFICA cuando cambia lo que LEE**, no cuando se lo edita. Lo que lo
> rompe está afuera: un reporter, un formato de salida, una versión de una herramienta, un esquema.

**LO ACCIONABLE, y son las dos mitades:**

1. **Ejecutarlo contra una entrada conocida, con control negativo** — lo mismo que se le exige a
   cualquier instrumento. Un comando que nunca se corrió contra una salida real **no está
   verificado: está sin refutar**, igual que el script de migración que funcionó cuatro veces.
2. **Dejar escrito cuándo se verificó y contra qué**, porque de eso depende cuándo hay que
   repetirlo.

---

#### 📋 INVENTARIO DE LOS COMANDOS CANÓNICOS — verificados por ejecución el 2026-09-03

*Todos corridos contra entrada real ese día. La columna del control negativo es la que dice si el
comando **puede** dar vacío: sin ella, un cero no se distingue de un patrón roto.*

| Comando | Qué mide | Resultado | Control negativo |
|---|---|---|---|
| el bloque de los **cinco números** + `suite_exit` | el resultado de una suite | 255 · 0 · 0 · 17 · 0, cruce 272 ✅ | ✅ el patrón viejo, al lado, reproduciendo el defecto |
| `grep -oE "'[a-z_]+\.[a-z_]+'" src/lib/permissions.ts \| sort -u \| wc -l` | claves del catálogo RBAC | **21** | ✅ 0 sobre un archivo sin claves |
| `grep -rn restaurant_id src/ tests/ supabase/functions/` | el renombre de sede | **0** | ✅ `sede_id` da 324: el grep sí encuentra |
| `grep -rnE "(<>\|!=\|=)\s*(public\.)?[a-z_]+\(\)" supabase/migrations/` | guards que comparan contra función (A2) | **72** candidatos | — |
| `grep -nE "getByText…\|\.(first\|last)\(\)\|\.nth\("` | locators frágiles en un spec | 4 en `cobro-modal.spec` | ✅ 0 sobre un `.ts` sin locators |
| `grep -oE "<[A-Z][A-Za-z]+" <pantalla> \| sort \| uniq -c` | componentes de una pantalla | Button 8, MoneyCell 4… | — |
| `printf … \| sort \| uniq -d` | si un mapeo de locators es inyectivo | vacío | ✅ con un destino repetido, **lo imprime** |
| `git log --oneline -S'<marcador>' -- src/ \| tail -1` | qué commit INTRODUJO un marcador | nombra el commit correcto | ✅ vacío para un marcador inventado |
| `pnpm gen:rbac:check` | catálogo vs SQL generado | **exit 0** | — |
| `pnpm test:unit` | los unitarios | **349 passed** | — |
| `node --check .claude/hooks/sql-checklist.mjs` | que el hook no esté mudo | **exit 0** | — |

🔴 **LOS DOS QUE NO PASARON, y son el hallazgo de la enumeración:**

| Comando | Qué pasa al ejecutarlo |
|---|---|
| **`git rev-list --count develop..main`** | ⛔ **`fatal: ambiguous argument 'develop..main'`** — `main` **no existe** en este repo, ni local ni en `origin` (`git branch -a` → sólo `develop`) |
| `pnpm exec supabase migration list --linked` | ⛔ **401 Unauthorized** — el token se rotó tras el incidente, así que *"17 migraciones al 2026-09-02"* **hoy no se puede reconfirmar** |
| todo lo que consulta la BASE — `pnpm db:types`, `supabase gen types --linked`, `select proname, proacl from pg_proc …` | ⛔ misma causa: **sin token no se pueden correr**. No están rotos; están **fuera de alcance hasta el próximo token**, y eso es distinto de verificados |

⚠️ **El primero es el peor de todo el inventario, y por dónde está escrito: es el EJEMPLO con el que
este archivo enseña el principio *«mejor que fechar: decir cómo consultarlo»*.** La frase dice que
ese comando *"vale más que cualquier frase sobre qué rama va adelante"* — **y no corre acá**. Vino
copiado de Vento, donde `main` sí existe, junto con el resto de la convención.

Es exactamente el **corolario del renombre**: un texto que nombra algo que vive fuera de este repo y
que nadie movió en la misma pasada. La diferencia es que acá no desconecta un nombre — **desconecta
la única demostración de la regla**.

🔴 **LA CONSECUENCIA DEL SEGUNDO, Y ES MÁS GRANDE QUE EL COMANDO:**

> **Un comando canónico que no se puede correr convierte en NO VERIFICABLES todas las afirmaciones
> que lo citan — sin que ninguna de ellas cambie de texto.**

*"17 migraciones aplicadas al 2026-09-02. Reconfirmar con `pnpm exec supabase migration list
--linked`"* está escrito exactamente como la convención manda: dato fechado **más** el comando que
lo reproduce. Y hoy es **una afirmación de estado que no se puede reconfirmar**, que es justo lo que
la convención existe para impedir.

⚠️ **Lo que lo hace distinto de una nota que envejece: la nota no se movió.** Sigue diciendo lo
mismo, con su fecha y su comando, y se lee igual de sólida que el día que se escribió. Lo que
cambió está **afuera del documento** — un token que se rotó. Una nota vieja al menos tiene una fecha
vieja que invita a dudar; ésta **no tiene ningún síntoma**.

🔴 **Y sólo se ve cuando alguien INTENTA EJECUTAR el comando.** No hay lectura, por atenta que sea,
que distinga *"dato fechado con su comando"* de *"dato fechado con un comando que hoy da 401"*. Las
dos frases son idénticas.

**Lo accionable, y son dos:**

1. **La convención se cumple en dos tiempos.** Escribir el comando al lado del dato es la mitad;
   la otra es que el comando **siga corriendo**. Un dato con un comando muerto no está mejor que un
   dato solo — está **peor**, porque el comando lo hace parecer verificado.
2. 🔴 **Cuando se reponga el acceso, esos tres se corren ANTES de citar cualquier dato que
   dependa de ellos.** No es una tarea de mantenimiento: es la condición para que las afirmaciones
   que los citan vuelvan a ser afirmaciones.

🔴 **Y EL ORDEN NO ES ARBITRARIO — decidido el 2026-09-03, y la razón es la clase de lo que
sostiene cada uno, no su costo:**

| orden | comando | qué sostiene | de qué clase es |
|---|---|---|---|
| **1º** | `select proname, proacl from pg_proc … where prosecdef` | *"ninguna función `SECURITY DEFINER` deja entrar a `anon`"* | 🔴 una **GARANTÍA DE SEGURIDAD** |
| 2º | `pnpm exec supabase migration list --linked` | *"17 migraciones aplicadas"* | un número |
| 3º | `pnpm db:types` + `git diff --exit-code` | el contrato de `database.types.ts` (R1 punto 5) | un número (líneas que difieren) |

> **Un número que no se puede verificar es un dato en duda. Una GARANTÍA que no se puede verificar
> es el caso #13.**

**No sabemos que sea falsa; sabemos que nadie puede saber que sigue siendo cierta** — y ésa es
exactamente la forma que la regla describe: una garantía **donde se decide** le gana a tres
advertencias donde se codea. Alguien va a leer *"las quince están bien"*, no va a escribir el revoke,
y no habrá nada que lo contradiga.

⚠️ **Y el precedente lo hace peor, no mejor:** la única función con el hueco `anon=X` que este
proyecto encontró fue **la escrita siguiendo la regla al pie de la letra**. O sea que la clase de
defecto que este `select` vigila **ya se materializó una vez**, y se vio verificando el ACL contra la
base — el archivo se veía correcto. Es el comando que menos se puede sustituir por una lectura.

⚠️ **Y hay un peligro de LECTURA que este archivo se creó solo:** contiene **dos clases de comando
mezcladas** — los canónicos (para usar) y los de la tabla de fallas de instrumento, que están ahí
**como ejemplos de lo que NO hay que correr** (`grep -cE '^  ok  [0-9]+'`, `grep -coE '#[0-9a-fA-F]{6}'`,
`grep -rl "const formatCOP" src/`, `grep '?? new Set('`). Un lector que grepee este documento buscando
"el comando para contar hexes" **encuentra primero el roto**, porque está explicado con más detalle
que ninguno. Los de esa tabla van leídos con su párrafo, nunca copiados sueltos.

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

🔴 **Y EL CASO QUE HACE DEFENDIBLE LA REGLA: LA MISMA PREGUNTA, EL RESULTADO CONTRARIO.**
*2026-09-02, deuda 45 — la subcategoría de gasto.*

Se parece punto por punto a `purchase_unit`: una etiqueta del negocio, sin lista universal posible,
que si se cierra en un CHECK bloquea al cliente. Por analogía correspondía texto libre. **Y se
decidió lo opuesto: desplegable, nunca tecleado.**

**Lo que cambió no es la regla: es el DISPARADOR.** Allá el disparador quedaba escrito *para el
futuro* —"el día que haya un reporte por presentación"— y mientras tanto lo que se colaba era un typo
cosmético. Acá **el reporte por subcategoría es el propósito entero de la columna**: nace existiendo.
El disparador está cumplido **antes de que la columna exista**, así que el lado permisivo nunca tiene
su ventana de ser gratis.

| | `purchase_unit` | `subcategoria` |
|---|---|---|
| ¿Hay reporte por ese eje? | todavía no | **es la razón de la columna** |
| Qué se cuela por el lado abierto | un typo en una etiqueta | **el reporte partido en dos filas**: `publicidad` y `Publicidad` |
| Decisión | texto libre + disparador escrito | **desplegable**, y la lista es editable **por sede** |

⚠️ **Por qué importa que quede escrito y no sólo decidido:** dos columnas casi idénticas con
decisiones opuestas se leen como una incoherencia, y el próximo que las vea va a "corregir" una de
las dos. No es incoherencia — **es la misma pregunta contestada contra dos disparadores distintos**.
La regla práctica: al elegir el lado permisivo, escribí el disparador **y fijate si ya está
cumplido**. Si lo está, el lado permisivo nunca fue una opción.

---

### 🔴 CRITERIO SIN NÚMERO · UNA FIXTURE VACÍA NO ES EL CASO COMÚN: ES EL DEGENERADO

*Medido el 2026-09-03, al sembrar el lab con la forma real de la operación. Es el hermano de
entrada del control negativo: allá el INSTRUMENTO no discrimina, acá la ENTRADA no discrimina.*

> **Una aserción escrita contra una base vacía mide el vacío mientras afirma medir lo normal.**

**El caso.** `pos-categorias-layout` tenía un caso llamado *"con POCAS categorías el layout no
cambia"* que terminaba en `expect(pos-category-tabs-fade).toHaveCount(0)` — *no hay máscara de
"hay más"*. Pasó verde durante semanas. Se puso **rojo** el día que el lab pasó de **1 categoría a
9**, y la primera lectura fue *"el strip se rompió"*.

**No se rompió.** Su línea de base de *"pocas"* era **una sola categoría**, porque el lab estaba
vacío — y con una categoría el strip no desborda a ningún ancho. *"No hay máscara"* era cierto
**por construcción**: el verde no venía del layout, venía de la fixture.

⚠️ **Por qué es peor de detectar que un instrumento roto.** El test se ve impecable: nombre
correcto, sujeto correcto, aserción legible. Nada en el archivo dice con cuántas filas se escribió.
Y el rojo no llega cuando se introduce el defecto — llega **meses después, disfrazado de
regresión**, el día que aparecen datos de verdad. La reacción natural entonces es "arreglar" el
producto para que el test vuelva a verde, que es exactamente el movimiento equivocado.

**LO ACCIONABLE, y son dos preguntas al escribir el caso:**

1. **¿Con cuántas filas se cumple esta aserción, y con cuántas dejaría de cumplirse?** Si la
   respuesta a la segunda es *"con más datos"*, la fixture es el sujeto y no el escenario.
2. 🔴 **Preferí aseverar la RELACIÓN antes que la CONSTANTE.** *"No hay máscara"* es una constante
   y depende del catálogo. *"Hay máscara si y sólo si desborda"* es la invariante que el strip tiene
   que cumplir **con cualquier catálogo**, y tiene mutantes vivos por los dos lados: una máscara
   permanente es decoración, una ausente esconde que hay más.

⚠️ Y el corolario para el lab: **poblarlo con la forma de una operación real es un instrumento de
auditoría de la suite**, no sólo material de demo. El seed de Muscle Pro puso rojo un caso que
llevaba semanas mintiendo, y ése fue su hallazgo más caro.

---

### 🔴 CRITERIO SIN NÚMERO · UN ESTADO QUE SÓLO SE COMUNICA CON COLOR O POSICIÓN NO SE PUEDE PROBAR QUE EXISTA

*Dos casos, 2026-09-03. Es el hermano del defecto que sólo vive en lo que se ve, mirado desde el
otro lado: allá el problema es que nadie lo VE bien; acá, que nadie lo puede ASEVERAR.*

> **Si el único portador de un estado es un color, un ícono o una posición, no existe para ningún
> verificador — y el día que se rompa, la suite entera va a estar verde.**

| Caso | Dónde vivía el estado | Qué se le agregó |
|---|---|---|
| el rótulo **«Cobrar — F12»** | el texto del botón afirmaba una tecla; la tecla vivía —o no— en otro archivo | el texto se **deriva** de `atajos.ts` |
| el cliente **elegido** en `CustomerPicker` | fondo `--action-soft` + un ícono de check, y **nada más** | `aria-pressed={selected}` |

**Por qué se repite:** para el ojo el estado **está ahí**, y con toda claridad — un check azul sobre
fondo celeste no es sutil—. La forma se ve terminada, así que nadie busca un portador adicional. El
hueco sólo aparece cuando alguien intenta escribir la aserción y descubre que no hay nada que
aseverar salvo un píxel.

⚠️ **Y el modo de fallo es el peor de los tres tipos de afirmación falsa:** el estado puede
**desaparecer en un re-skin** sin que nada se ponga rojo. El botón de F12 imprimió una tecla muerta
durante todo el proyecto; el picker podía dejar de marcar al elegido y ningún caso lo habría notado.

**LO ACCIONABLE, y cuesta un atributo:** cuando un estado se comunique con color, ícono o posición,
dale además un portador **semántico** — `aria-pressed`, `aria-selected`, `aria-current`, `data-*`.
No es un testid: es el estado mismo, y por eso sirve dos veces — lo asevera la suite **y** lo
anuncia el lector de pantalla. Un `data-testid` dice *quién es este elemento*; lo que falta acá es
*en qué estado está*.

⚠️ Corolario de diseño: si al escribir el caso no encontrás qué aseverar, **el hueco no es del test
— es de la pantalla**. Agregar el atributo es arreglar el producto, no instrumentarlo.

---

### 🔴 CRITERIO SIN NÚMERO · UN FILTRO QUE SE APOYA EN UN CAMPO VECINO ES UN PROXY, Y CADUCA SIN AVISO

*Medido el 2026-09-03, moviendo F4 al modal. Es "clasificar leyendo el nombre" aplicado a una
aserción sobre una colección — y esta vez el proxy vivía DENTRO del test.*

> **Cuando dos campos coinciden hoy, el que se usa para filtrar no es el sujeto: es el que estaba
> más a mano.**

**El caso.** `atajos.test.ts` aseveraba *"los medios de pago NO usan teclas de función"* así:

```ts
const deCobro = ATAJOS.filter((a) => a.ambito === 'cobro')   // ⛔ el proxy
expect(deCobro.filter((t) => /^F\d+$/.test(t))).toBe('ninguna')
```

**El sujeto es `medio`; el filtro es `ambito`.** Coincidían **exactamente** —los únicos atajos del
ámbito del cobro eran los tres medios— hasta que F4 (*"cambiar cliente"*) se mudó adentro del modal
y pasó a ser del ámbito del cobro **sin ser un medio**. El caso se puso rojo, y el producto estaba
bien: **falló la premisa del filtro**.

✅ **Y eso es lo que un tripwire existe para hacer**, así que el rojo es el resultado bueno. Lo que
hay que no hacer es tratarlo como una regresión y "arreglar" el producto.

**LO ACCIONABLE:** al escribir un filtro dentro de una aserción, preguntá **si el campo por el que
filtrás es el sujeto o algo que hoy lo acompaña**. Si es lo segundo, filtrá por el sujeto —acá,
`a.medio != null`— y dejá el campo vecino en una aserción **aparte**, que es donde su cambio se lee
como información en vez de como falla:

```ts
expect(deCobro, 'F4 vive en el ámbito del cobro y NO es un medio de pago')
  .toEqual(['F4', 'c', 'e', 't'])
```

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

### 🔴 CRITERIO SIN NÚMERO · UNA DUDA TIENE UN SUJETO — SI EL SUJETO DESAPARECE, LA DUDA SE DISUELVE, Y ESO NO ES HABERLA CONTESTADO

*2026-09-03. Hermana directa del criterio de abajo: las dos son sobre **no perder el porqué cuando
cambia el qué**.*

> **Resolver una duda es elegir. Disolverla es que deje de aplicar.** Las dos la sacan de la lista
> de pendientes, y **sólo una deja una decisión atrás.**

**El caso.** *«Cambio» vs «Vuelto»* — dos palabras para lo mismo en el mismo flujo. Se anotó como
duda de vocabulario con su argumento: *vuelto* es la palabra corriente en Colombia, *cambio* es la
que eligió la maqueta, y renombrar a medias crea un tercer vocabulario (precedente: *turno* vs
*jornada*). Al día siguiente el producto decía **Vuelto** en los tres sitios y la duda había
desaparecido — **no porque alguien eligiera**, sino porque «Cambio» vivía en una sola pantalla y esa
pantalla se revirtió.

⚠️ **Por qué la distinción no es semántica.** Una duda **resuelta** deja una decisión que el próximo
hereda. Una duda **disuelta** no deja nada: si el sujeto vuelve —y vuelve, porque alguien copia el
panel, revierte una decisión o construye la pantalla que faltaba— **la duda vuelve entera**. Sin la
nota, vuelve **como hallazgo nuevo**, se debate desde cero, y se paga el diagnóstico completo otra
vez.

🔴 **LO ACCIONABLE: una duda disuelta SE ANOTA COMO DISUELTA, con su argumento intacto.** No se
borra y no se marca como resuelta.

| qué se escribe | por qué |
|---|---|
| que se disolvió, y **qué sujeto desapareció** | es lo que permite reconocer que volvió |
| el **argumento de fondo, entero** | es lo que no hay que reconstruir la próxima vez |
| que **nadie decidió** | para que no se cite como precedente de una decisión que no existió |

⚠️ **Y el corolario que la hace barata:** anotar la disolución cuesta un párrafo **en el momento en
que todavía se entiende el argumento**. Reconstruirlo meses después cuesta el diagnóstico entero —
y peor, lo reconstruye alguien que no sabe que ya se había pensado.

⚠️ Es el mismo mecanismo que el criterio de abajo, aplicado a una **pregunta** en vez de a un
**dato**: allá lo retirado se sigue mostrando para que el total cuadre con sus filas; acá lo
disuelto se sigue anotando para que la próxima aparición no se lea como la primera.

---

### 🔴 CRITERIO SIN NÚMERO · LA HISTORIA NO SE REESCRIBE, SE LE AGREGA — Y BORRAR DE UNA LISTA ES DEJAR DE OFRECERLA

*Decisiones tomadas por separado entre el 2026-08-31 y el 2026-09-02 que resultaron ser la misma.
Se escribe una vez, con los casos de la tabla, en vez de tantas decisiones que se parecen.*
*(Esta frase decía "cuatro decisiones" y la tabla tenía cinco filas. El número salió de acá a
propósito: ver el criterio del conteo en prosa, más abajo.)*

> **Un hecho ocurrido no se corrige cambiándolo: se corrige agregando otro hecho.** Y una lista de
> opciones no es la historia: **sacar un valor de la lista es dejar de OFRECERLO, nunca reescribir
> las filas que ya lo usaron.**

| Caso | Lo cómodo habría sido | Lo que se hizo |
|---|---|---|
| **Costo unitario al vender** (R1 punto 8) | calcular la utilidad leyendo el `cost_price` actual | se **congela** en `order_items.unit_cost`. Si se leyera después, cada compra nueva cambiaría las utilidades de meses pasados y el reporte daría distinto cada vez que se abre |
| **Fecha del documento** (deuda 44) | usar `created_at` para todo | dos columnas. `created_at` dice cuándo se tecleó y cuadra la caja; `document_date` dice de cuándo es el papel y ordena los reportes |
| **Devolución de compra** (deuda 49) | revertir la compra y recalcular el promedio ponderado | la devolución es un **hecho nuevo con su propia fecha**, y **no toca `cost_price`**: ese costo ya se propagó a las ventas del medio |
| **Subcategoría retirada** (deuda 45) | borrar o migrar las filas que usaban la subcategoría que el dueño sacó de su lista | la fila **conserva** su valor y la pantalla la muestra **marcada como retirada**; lo que desaparece es poder volver a elegirla |
| **plazo de crédito** (deuda 46) | guardarlo sólo en el cliente, que es donde se pacta | se guarda **también en la venta**. La cartera **deriva de `orders`**, así que con el plazo sólo en el cliente el mismo `select` **calcularía otro vencimiento mañana** para una venta de enero |

**Por qué es el mismo principio y no varios parecidos:** en todos, la alternativa cómoda hace
que **una pregunta sobre el pasado cambie de respuesta según cuándo se la haga**. Ese es el defecto,
y es el perfil de R7: no revienta, no avisa, y el número sigue siendo plausible.

⚠️ **El corolario que decide los casos nuevos, y es una pregunta sola:** ¿este cambio hace que un
reporte ya impreso deje de reproducirse? Si la respuesta es sí, **no es una corrección: es una
reescritura**, y lo que corresponde es agregar un hecho.

⚠️ Y el corolario de pantalla, que es la mitad que casi se pierde: **lo retirado se sigue
mostrando.** Si la fila vieja desapareciera de la lista, el total del período dejaría de cuadrar con
sus propias filas — y un total que no cuadra con lo que se ve es peor que un valor viejo con una
etiqueta.

⚠️ **Y EL HERMANO QUE MIRA HACIA ATRÁS: UN INVARIANTE NUEVO SE APLICA DE ACÁ EN ADELANTE. EL PASADO
SE MIDE Y SE EXPLICA — NO SE AJUSTA.** *2026-09-02, deuda 80.*

El principio de arriba dice qué hacer con **un hecho nuevo**. Éste dice qué hacer con **uno viejo
cuando cambian las reglas**, que es el momento en que aparece la tentación contraria:

> **Reescribir datos existentes para que cumplan un invariante recién inventado es la misma forma que
> editar la lista de un tripwire para que pase.** En los dos casos se cambia la evidencia para que
> coincida con la expectativa.

**Lo que corresponde es al revés: se MIDE la divergencia antes de escribir el guard, y el número
entra al registro.** Esa medición hace dos cosas que un backfill destruye: dice **si el invariante
era cierto antes** —o sea, si el problema existía— y deja el dato para el que venga.

**El caso.** Antes de derivar `orders.total` se comparó el total guardado contra la fórmula en las
**1.424 órdenes** existentes: **18 diferían**, con 416.000 de diferencia absoluta. Y al
caracterizarlas, las 18 tenían `order_number is null`:

| Grupo | Qué eran |
|---|---|
| 14 con líneas y total 0 | órdenes que los E2E insertan sin total |
| 4 sin líneas y total > 0 | fixtures de cartera y de plazo |

🔴 **Entre las órdenes NUMERADAS —las ventas reales— cero divergencias.** Ése es el dato que convierte
la decisión en medición en vez de en preferencia: la coincidencia por construcción **se sostuvo donde
importaba**, y lo que diverge es residuo de nuestros propios specs.

⚠️ Y el corolario que lo hace accionable: **si al medir aparecen divergencias en datos REALES, eso no
es motivo para backfillear — es un hallazgo**, y probablemente una deuda propia. Un invariante que el
pasado no cumple está diciendo algo sobre el pasado, y borrarlo es borrar el hallazgo.

---

### 🔴 CRITERIO SIN NÚMERO · EL ORDEN ENTRE DOS DEUDAS SE DECIDE MIDIENDO, NO OPINANDO

*2026-09-02/03, la deuda 80 antes del precio editable. Es la primera vez que el proyecto tiene un
criterio **verificable** para decidir qué va primero.*

> **Si la deuda A hace que el spec de B pueda medir algo que antes no medía, A va primero — y eso
> no es una preferencia de orden: es una propiedad comprobable del spec de B.**

**El caso.** Se decidió hacer la 80 —derivar `orders.total` en el servidor— antes del precio editable,
con este argumento: *"hoy el total y las líneas coinciden por construcción, y el precio editable
convierte esa coincidencia estructural en una convención"*. Era un argumento, no un dato.

**El spec del precio lo convirtió en medición.** Su caso principal no asevera sólo que la línea guarde
el precio pactado: asevera que **`orders.total`, derivado por el servidor, sale de ese precio**.

| | si el precio hubiera ido primero | con la 80 puesta |
|---|---|---|
| Quién calcula el total | el **mismo** cliente que manda el precio | el **servidor**, desde las líneas |
| Qué prueba la aserción | **nada**: coinciden por construcción | que **dos caminos independientes** dan el mismo número |
| Color del spec | **verde** | verde |

🔴 **Y ahí está lo que lo hace un criterio y no una anécdota: el spec habría estado VERDE en los dos
casos.** Yendo el precio primero, ese verde no habría probado nada — R10 literal, *un test que pasa
por la razón equivocada da confianza sin cobertura*. El orden equivocado no produce un rojo que
avise: produce **un verde que miente**, y encima uno que después nadie revisa porque "ya está
probado".

**LO ACCIONABLE, y es una pregunta que se contesta antes de elegir el orden:** para cada aserción del
spec de B, preguntá **qué la haría fallar**. Si la respuesta es "nada, porque los dos lados salen del
mismo cálculo", entonces B **no se puede probar todavía** y lo que falta es A.

⚠️ Es el corolario de R4 —*una verificación que no podía haber salido mal no es una verificación*—
aplicado a la **planificación** en vez de a un test suelto: el orden de las deudas también se puede
elegir de una forma que garantice tautologías.

---

### 🔴 CRITERIO SIN NÚMERO · ¿DE DÓNDE SALE ESTE DATO CUANDO ALGUIEN LO MIRA?

*El detector del principio de arriba. Va aparte y con la misma jerarquía a propósito: el principio
dice qué hacer una vez que reconociste el caso, y **esto es lo que hace que lo reconozcas antes**.
Cinco casos ya eran un principio; esto lo vuelve aplicable sin haber pagado los cinco.*

> **La pregunta útil no es "¿este dato puede cambiar?" — es "¿DE DÓNDE SALE cuando alguien lo
> mira?"**

La primera es filosófica y casi siempre se contesta que sí, así que no discrimina. La segunda es
**mecánica** y se contesta enumerando: se abre el consumidor y se mira si lee **una columna** o si
**la calcula**.

| Cómo se lee el dato | Qué pasa cuando su origen cambia |
|---|---|
| de una **columna** de la fila del hecho | nada: la fila dice lo que decía |
| de un **`select` derivado**, un join o un cálculo | **se recalcula entero cada vez**, así que el pasado cambia de respuesta sin que nadie lo toque |

**El caso que lo destapó (deuda 46).** El plazo de crédito parecía perfectamente seguro en
`customers`: ahí es donde se pacta, y es el dato más estable del cliente. **La estabilidad del origen
no era la pregunta.** Al enumerar apareció que **la cartera no guarda la deuda: la deriva de `orders`
en cada consulta** —`getDebts` lee las órdenes pendientes y calcula el saldo contra `debt_payments`,
no hay tabla de cuentas por cobrar—. Con el plazo sólo en el cliente, **el mismo `select` habría
devuelto otro vencimiento mañana** para una venta de enero.

⚠️ **Y por eso el detector es más barato que el principio:** el principio pide reconocer que estás por
reescribir la historia, que es un juicio. El detector pide **abrir el consumidor y mirar**, que no lo
es. Cuesta un `grep` del nombre de la tabla.

**Lo accionable, y es el orden que importa:** antes de decidir **dónde vive** un dato, enumerá
**quién lo va a leer** y si esa lectura es una tabla o un cálculo. La decisión de dónde guardarlo se
toma después de esa respuesta, no antes.

---

### 🔴 CRITERIO SIN NÚMERO · LA DEUDA ES UNA HIPÓTESIS FECHADA; EL CÓDIGO ES EL DATO

*Casos medidos el 2026-09-02, el mismo día. Los de arriba de la tabla comparten causa —el alcance venía de la maqueta—; el último es de otra especie y por eso está explicado aparte.*

`docs/DEUDAS.md` se lee al planificar, y por eso cada entrada trae su **alcance**. Ese alcance se
escribió en algún momento, mirando algo — y **a veces ese algo no fue el código.**

> **Una deuda dice lo que alguien creyó, el día que lo escribió. Es una hipótesis con fecha, no una
> medición.** El alcance escrito puede venir de una fuente **que nunca se ejecutó**: una maqueta, un
> diseño, una conversación.

**Los dos casos, y los dos venían de la maqueta:**

| Lo que la deuda afirmaba | Lo que el código decía | Qué costó |
|---|---|---|
| el catálogo del cliente son **~4.212 productos** (deuda 50) | el archivo real de Muscle Pro tiene **37** | el import masivo estuvo declarado *bloqueante del alta* durante días, ordenando el trabajo |
| Compras y Gastos **ya dejan elegir la fecha**, sólo falta la columna (deuda 44) | `grep 'type="date"' src/` → **diez apariciones, las diez filtros de historiales**. Ningún formulario de alta tenía campo de fecha | la deuda parecía "dos columnas" y eran dos columnas, dos guards, dos formularios y cuatro consultas |
| las subcategorías de gasto son **las seis del diseño** — Arriendo, Servicios, Transporte, Sueldos, Impuestos, Otros (deuda 45) | el archivo real del cliente usa **tres**: publicidad, adecuación, activo. La propia entrada las llamaba *"las seis del dibujo"* | se habría sembrado la lista del producto con el vocabulario de una maqueta en vez del de un negocio |
| la cartera **ordena por antigüedad** (enunciado de la deuda 46) | ordenaba por **saldo**: `arr.sort((a, b) => b.saldoTotal - a.saldoTotal)` | ninguno, y **por eso es el caso más instructivo**: ver abajo |
| *"el mostrador **no permite** editar el precio"* (deuda 75) | el precio **ya era libre**: la RPC toma `unit_price` del payload y sólo existe `check (unit_price >= 0)` | ⬇️ el único que describía mal la **dirección** |

**Por qué pasa, y por qué no se arregla escribiendo mejor.** Una maqueta y una app se describen con
las mismas palabras. Cuando una descripción de la maqueta entra a una tabla de decisiones, **pierde
su origen y gana la autoridad de la tabla**: nadie que la lea después puede distinguir *"medido en el
código"* de *"así se veía en el dibujo"*.

⚠️ Y el efecto es siempre en la misma dirección: la deuda **subestima o distorsiona el trabajo**, y
sobre ese número se decide el orden. El primer caso hizo urgente algo que no lo era; el segundo hizo
chico algo que no lo era.

**LO ACCIONABLE, y es una sola frase:**

> **La enumeración previa se hace igual, aunque la deuda ya diga el alcance.**

No es desconfianza del que escribió: es que el alcance escrito y el código son **dos fuentes
distintas**, y sólo una ejecuta. Si al enumerar coinciden, costó dos minutos. Si no coinciden
—**todas las veces hasta ahora**—, lo que se encontró es justamente lo que habría hecho fallar el
plan, o el registro de lo que se hizo.

🔴 **EL ÚLTIMO CASO ES DE OTRA ESPECIE: LOS DEMÁS DESCRIBÍAN MAL EL ALCANCE; ÉSE DESCRIBÍA MAL LA
DIRECCIÓN.**

*"El mostrador no permite editar el precio"* se lee como una **restricción que hay que soltar**. La
realidad medida es la contraria: el precio **ya era libre en la base desde el primer día** —
`add_order_items_with_extras` toma `unit_price` directo del payload y lo único que existe es
`check (unit_price >= 0)`—. El trabajo no era abrir nada: era **poner la única red que va a haber**.

⚠️ **Y por eso es el más caro de los cinco:** los otros, ejecutados según su enunciado, habrían dado
un resultado incompleto o mal dimensionado. Éste, ejecutado según su enunciado, **habría dejado el
sistema peor que antes** — se habría "habilitado" algo que ya estaba habilitado, sin la confirmación,
y con la sensación de haber cerrado la deuda.

**Lo accionable que agrega:** al leer una deuda, preguntá también **hacia dónde** dice que hay que
moverse, no sólo cuánto. Un enunciado en negativo —*"no permite"*, *"falta"*, *"no existe"*— es el
que más fácil invierte el signo del trabajo, porque describe una ausencia sin decir dónde la midió.

🔴 **EL CUARTO CASO ES EL QUE MEJOR EXPLICA POR QUÉ ESTO VALE LA PENA, justamente porque NO costó
nada.** El enunciado decía "ordena por antigüedad, cambialo a días vencidos"; el código ordenaba por
**saldo**. La decisión no cambió —días vencidos sigue siendo lo correcto— pero **el punto de partida
era otro**, y eso es lo que una enumeración compra: no evitar una decisión equivocada, sino saber
**desde dónde** se está moviendo.

Sin enumerar, el commit habría dicho "pasa de antigüedad a días vencidos", que es **falso**, y habría
quedado archivado como si fuera lo que ocurrió. Un registro falso sobre un cambio correcto sigue
siendo un registro falso — y es el que va a leer el próximo.

⚠️ **Y el tercer caso agrega una forma que los dos primeros no tenían: las DOS versiones convivían.**
La deuda 45 tenía la lista de la maqueta (2026-09-01) y la del archivo real (2026-09-02) **apiladas**,
sin que ninguna reemplazara a la otra. Ahí el problema ya no es sólo de origen sino de **edición por
append** —la causa que A5 identificó para los tres pares contradictorios de este archivo—, y se
corrige igual: **una sola afirmación vigente, y lo superado marcado como superado.**

⚠️ **Y al corregir, se REEMPLAZA la afirmación vieja**, no se agrega la nueva al lado: ver la
convención de notas al final de este archivo. Una deuda con dos alcances contradictorios es peor que
una con el alcance equivocado.

Es el mismo principio que el corolario de R4 —*la coincidencia entre dos declaraciones no es
evidencia*— y el hermano directo de *"clasificar leyendo el nombre o el plan NO es clasificar"*: allá
el proxy es un plan de clasificación, acá es una deuda. **Los dos son buenos proxies, y por eso
engañan.**

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

### 🔴 UN SOLO PROYECTO DE SUPABASE, Y LAB CONVIVE CON LOS DATOS REALES

*Decidido el 2026-09-03, al preparar el despliegue.*

El despliegue apunta **al mismo proyecto de Supabase** que va a usar el cliente. Un segundo proyecto
significaría mantener dos bases sincronizadas, duplicar el seed y volver a pagar el problema de los
artefactos generados fuera de `migrations/` — no vale la complejidad para un cliente.

**La consecuencia, aceptada:** la organización **LAB convive con los datos reales**. El aislamiento
está medido, no supuesto: la auditoría A2 (2026-09-02) probó **cero cruces entre organizaciones**
sobre la matriz completa.

🔴 **Y por eso el guard de `tests/global-setup.ts` pasa de higiene a CRÍTICO.** Aborta la suite si la
organización del owner no se llama `LAB`, consultándolo **contra la base** y no contra una variable:

```
PELIGRO: las credenciales de prueba no son del laboratorio (org actual: …).
```

Verificado el 2026-09-03: sigue enganchado en `playwright.config.ts`, no hay variable de escape
(`SKIP_*` ni equivalente), y la purga posterior fija las sedes **por UUID** de LAB, no por nombre.

⚠️ **Lo que el guard NO cubre, y hay que decirlo:** protege contra correr la suite con credenciales
**equivocadas**. No protege contra que alguien apunte a LAB con credenciales **correctas** el día que
los datos de LAB ya no sean descartables.

> **Por eso, cuando Muscle Pro entre a operar, LAB SE RETIRA — no se borra.**

Mismo criterio que el resto del proyecto: *la historia no se reescribe, se le agrega*. Retirar es
dejar de usarla y dejar de apuntarle la suite; borrarla destruiría la única referencia de qué había
cuando se tomaron las decisiones de estos meses.

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
- **SECURITY DEFINER → `revoke execute from public` **Y TAMBIÉN** `from anon`:** Postgres concede
  `EXECUTE` a `PUBLIC` por defecto en toda función nueva, y **Supabase agrega DEFAULT PRIVILEGES en el
  esquema `public` que se lo dan además a `anon`** — que NO es lo mismo que `public`, así que el
  primer revoke no lo alcanza. Hay que revocar los dos y conceder solo a quien lo necesita
  (`authenticated`, `service_role`).
  🔴 *Medido el 2026-09-02 (deuda 71): una función DEFINER nueva cumplió la versión anterior de esta
  regla al pie de la letra y quedó igual con `anon=X` — un cliente **sin login** podía invocarla, y
  leía una tabla sin RLS. Se vio verificando el ACL contra la base; el archivo se veía correcto.*
  🔴 **Y el dato que hace grave la omisión: de las quince funciones `SECURITY DEFINER` del esquema, la
  ÚNICA con el hueco era la escrita SIGUIENDO ESTA REGLA.** Las otras catorce lo hacían bien por
  costumbre heredada, no porque el texto lo pidiera. **Una regla incompleta que se cumple al pie de la
  letra produce el defecto que la regla existía para evitar — y deja tranquilo al que la cumplió.** Es
  la peor forma posible de una regla: peor que no tenerla, porque sustituye el criterio por un trámite.
  **Cómo se comprueba:** `select proname, proacl from pg_proc … where prosecdef` y mirar que ninguna
  diga `anon=X`.

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

*Agregado el 2026-08-31, con cuatro casos medidos. **Quinto caso el 2026-09-02, en A4:** predije que el
mutante del clamp sobreviviria porque el TITULO del test dice "descuento del 100 %"; el CUERPO aplica
25.000 fijos sobre 18.000 —el caso exacto del clamp— y el mutante murio. Es la misma clase que el
scorecard clasificado por sintoma: el nombre de un test es un nombre, y la aserción es la cosa. Un
test se clasifica por lo que asevera, leyendo el cuerpo.*

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
| `owner.test@nodo.test` · `cajero.test@nodo.test` | Cuentas que **existen en el backend del lab** | `tests/README.md` pasaría de cierto a **falso**: instrucciones para entrar con un usuario inexistente. |<br>*(Esta celda decía `@gvento.com` **en presente** y era falso: las cuentas de Nodo se crearon `@nodo.test` —lo dicen `tests/README.md`, `.env.test.example` y el `.env.test` real—. El caso heredado de Vento sí fue con `@gvento.com`; lo que caducó es el ejemplo, no la regla. Corregido el 2026-09-03 al leerlas para el deploy.)*
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
✅ El tripwire del catálogo está en `src/lib/permissions.test.ts` (ver la tabla de Estado); `tests/roles.spec.ts` prueba la UI de roles, no el tamaño del catálogo. *(Esta línea decía "falta el tripwire" y contradecía la tabla del mismo archivo; corregido en A5.)*

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
  no. `git rev-list --count origin/develop..develop` vale más que cualquier frase sobre si lo local
  ya está publicado — y de hecho **ése es el comando que resolvió el deploy** el 2026-09-03: no
  estaba mal configurado, faltaba un `push` de 18 commits. Cuando existan las dos, va primero el
  comando y después el dato fechado.

  🔴 **ESTE EJEMPLO ERA `git rev-list --count develop..main` Y NO CORRÍA EN ESTE REPO.** *Corregido
  el 2026-09-03 al ejecutar el inventario de comandos canónicos.* `main` **no existe** —ni local ni
  en `origin`—, así que el comando devolvía `fatal: ambiguous argument`. Vino copiado de Vento,
  donde sí existe, junto con el resto de esta convención.

  ⚠️ **Y lo que lo hacía el peor error posible es dónde estaba: era el EJEMPLO con el que esta
  regla se enseña.** Una regla cuya única demostración no se puede ejecutar **se lee y se cree
  igual** —nadie corre el ejemplo de una convención— así que sobrevivió intacta y un poco más
  creíble cada vez, que es el corolario de R4 literal. Es también el **corolario del renombre**: un
  texto que nombra algo de otro repo y que nadie movió en la misma pasada. La diferencia es que acá
  no desconectaba un nombre: desconectaba la prueba.
- **UNA AFIRMACIÓN DE ESTADO SE REEMPLAZA, NUNCA SE AGREGA AL LADO DE LA VIEJA.** *Medido en A5
  (2026-09-02): las tres peores falsas de este archivo eran PARES CONTRADICTORIOS escritos con horas
  de diferencia* —"23 claves de Vento" dos renglones arriba de "21 claves"; dos filas `settings.json +
  hooks`, una diciendo que corren y otra que falta correrlos; "falta el tripwire" en la sección de
  hooks y "✅ tripwire puesto" en la tabla—. *No envejecieron: nacieron falsas.* La causa es mecánica:
  **editar por append** — agregar la fila del estado nuevo cuesta menos que releer y borrar la vieja,
  y el lector que llega a la vieja no sabe que hay una nueva. **Antes de guardar una afirmación de
  estado: `grep` del objeto en el mismo archivo, y la anterior se reemplaza o se marca como superada.**

  🔴 **Y LA MISMA FORMA TIENE GRADOS: UN PAR CONTRADICTORIO EN LA SKILL NO CONFUNDE — SE EJECUTA.**
  *Cuarto par encontrado, 2026-09-03, y el primero fuera de este archivo.*

  El Anexo de `nodo-design-system` decía que el producto y el tenant *"conviven en el bloque de
  identidad de la barra lateral — Muscle Pro arriba, Nodo abajo"*. **§5 de la misma skill, escrita
  el mismo día, decía lo contrario:** organización arriba, sede debajo, y el producto **sale** del
  sidebar. Nació falso, igual que los tres de A5, y por la misma causa mecánica: editar por append
  en una sección sin releer la otra.

  **Lo que cambia es DÓNDE vive, y por eso vale como grado propio:**

  | dónde está el par | qué produce |
  |---|---|
  | `docs/DEUDAS.md` | **confunde a quien planifica** — se discute, y alguien pregunta |
  | `CLAUDE.md` | **dirige mal** — se aplica una regla con la mitad equivocada |
  | 🔴 **una skill** | **SE EJECUTA** — es lo que se lee *para implementar*, así que el lector elige una de las dos mitades y **escribe código sobre ella** |

  ⚠️ Una skill no se lee para deliberar: se lee para construir. Entre leer la mitad equivocada y que
  esa mitad esté en la pantalla del cliente **no hay ningún paso donde alguien pregunte**. El orden
  de revisión, entonces, no es por antigüedad ni por tamaño: **es por cuán cerca está el documento
  del código.**
- **"CORREGIDO" SE VERIFICA ENUMERANDO LOS SITIOS, NO RECORDANDO EL COMMIT.** *Primera afirmación
  falsa de la bitácora de Nodo, 2026-09-02, y era de estado:* "el cierre de caja pintaba el sobrante
  en verde" —en pasado— cuando lo corregido era el historial y el pie del modal, no el bloque donde
  se decide. Se escribió con el commit fresco y la convicción de haberlo hecho: **recordar el commit
  no es enumerar los sitios.** Antes de escribir "se corrigió X": grep de la forma, lista de sitios,
  estado de cada uno. Si se tocaron dos de tres, la nota dice cuáles. Lo cazó A3 porque el plan exigía
  que el caso **apareciera** en vez de darlo por cerrado.
- 🔴 **UN CONTEO DENTRO DE UNA FRASE ES UN LADO MÁS DEL CONTRATO CON SU TABLA — Y LA SOLUCIÓN NO ES
  ACORDARSE DE ACTUALIZARLO: ES NO ESCRIBIR EL NÚMERO.** *Dos casos propios, 2026-09-02, y los dos
  creados **el mismo día en que estaba citando la regla del append**.*

  | Frase | Tabla al lado | Estado |
  |---|---|---|
  | *"Cuatro decisiones… con los cuatro casos"* | **cinco** filas | contradictorio a las horas de escrito |
  | *"TRES casos medidos"* | **cuatro** filas | contradictorio a los minutos |

  **Es R1 en prosa, y es una aparición más del mismo patrón** — los casos de la tabla de abajo. El
  defecto es siempre el mismo: **un valor que se puede derivar, escrito a mano**, y con nada que
  sincronice los dos lados.

  | Caso | El lado escrito a mano | Cómo se cerró EN EL MECANISMO |
  |---|---|---|
  | Catálogo RBAC | `admin` con sus claves **enumeradas** — dejó las cuatro copias de Vento con 16/20/18/23 | `admin = ALL_PERMISSION_KEYS`, **derivado** |
  | `ALL_PERMISSION_KEYS` | la lista, repetida al lado de los grupos | `flatMap` sobre los grupos |
  | Un conteo en prosa | *"cuatro decisiones"* al lado de cinco filas | **no escribir el número**: "los casos de la tabla" |
  | 🔴 **El rótulo de un atajo** *(2026-09-03)* | «Cobrar — **F12**» escrito en el botón, y la tecla cableada —o no— en otro archivo | el botón **deriva** su texto de `src/lib/atajos.ts`: `Cobrar — {teclaDe('Cobrar')}` |

  🔴 **El cuarto es el más caro de los cuatro y merece su diagnóstico, porque el lado congelado no
  era una lista: era una TECLA QUE NO EXISTÍA.** El botón imprimió «Cobrar — F12» durante todo el
  proyecto y **F12 no estaba cableada en ninguna parte** —cero `key === 'F…'` en todo `src/`—: la
  cajera apretaba la tecla que el producto le ofrecía y le abría las herramientas del navegador.
  Rótulo y tecla eran dos lados de un contrato sin sincronizador, y **se congeló el que nadie
  tocaba** — nadie edita un `<Button>` que ya dice lo correcto.
  ⚠️ Y la parte que lo hace peor que un catálogo desincronizado: **el lado visible era el que
  mentía**. Un permiso que falta se nota cuando algo no funciona; un rótulo correcto sobre una tecla
  muerta **se lee como confirmación** cada vez que alguien lo mira. Es el corolario de R4 —*leer una
  declaración falsa la confirma*— pintado en la interfaz.

  ⚠️ **Lo que hace peor a la variante en prosa es que no hay verificador.** Un catálogo desincronizado
  lo caza un test o un check de árbol; una frase que dice "cuatro" al lado de cinco filas **no la caza
  nadie**, y encima *el número es lo primero que se lee y lo último que se revisa*. Yo escribí los dos
  mientras aplicaba la regla que los prohíbe: **acordarse no funciona, ni siquiera con la regla
  cargada y en uso.**

  **LO ACCIONABLE, y cuesta menos que la alternativa: no escribas el número.** *"Los casos de la
  tabla"*, *"todas las veces hasta ahora"*, *"los de arriba"*. Se lee igual, no se puede desincronizar,
  y el lector cuenta las filas si le importa el número. **Cerrar el defecto en el mecanismo, no en la
  instancia** — que es lo que ya hicimos las otras dos veces.

  ⚠️ Cuándo SÍ va el número: cuando es una **medición fechada** que no depende de nada de al lado
  —"202 passed", "37 productos (Control_Mp.xlsx)", "74 filas contadas antes de tocar"—. Ahí el número
  **es** el dato. Lo que no va es un número que **cuenta algo que está escrito al lado**.

- 🔴 **UNA RAZÓN QUE CADUCÓ SE MARCA COMO CADUCA — NO SE BORRA, Y NO SE DEJA EN PIE.** *2026-09-03,
  al revertir §8.15 por segunda vez.*

  Una decisión sostenida por dos razones puede sobrevivir a que **una de las dos muera**. Los medios
  de pago pasaron a `E/T/C` por dos argumentos: el campo de dinero consume dígitos (principal), y
  *"con el cobro en línea no hay modo, y sin modo el doble significado no se puede desambiguar"*
  (secundario). El cobro volvió al modal el mismo día: **hay modo otra vez** y el segundo argumento
  dejó de sostener nada. La decisión sigue siendo correcta por el primero.

  **Las tres salidas, y sólo una es buena:**

  | qué se hace con la razón muerta | qué produce |
  |---|---|
  | **borrarla** | la decisión queda con menos respaldo del que tuvo, y nadie sabe que se evaluó ese eje |
  | **dejarla en pie** | 🔴 es **la que alguien va a citar para revertir la decisión** — encuentra un argumento falso y concluye que la decisión también lo es |
  | **marcarla como caduca, con su fecha y qué la mató** | ✅ el lector ve que el eje se evaluó, que caducó, y **cuál de las razones sigue cargando el peso** |

  ⚠️ **La del medio es el modo de fallo real, y es el mismo de "una nota que dirige mal":** un
  argumento que ya no es cierto **no se lee como obsoleto — se lee como equivocado**, y contamina la
  decisión entera. El que llega no tiene forma de saber que era el secundario.

  **Lo accionable:** al conservar una decisión cuyo contexto cambió, la nota dice **cuál razón murió,
  qué la mató, y cuál queda**. Se aplica igual en el código —el comentario de `atajos.ts`—, en la
  skill y en este archivo: los tres lados de esa decisión llevan la marca, porque un solo lado
  marcado es otra vez un par contradictorio.

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

🔴 **SEGUNDA VEZ QUE UN TIMEOUT NO ES LENTITUD, Y ESTA VEZ EL LOCATOR SÍ EXISTÍA.**
*2026-09-03, corte 4 del cobro en línea.* La primera fueron tres specs esperando un control del modal
de movimientos que ya no estaba. Acá el control **estaba, y estaba deshabilitado** —`disabled` con el
rótulo `Cobrando…`— porque el propio test lo había apretado dos veces. El artefacto lo dice entero:

```
locator resolved to <button disabled … data-testid="cobro-confirmar">Cobrando…</button>
attempting click action — 2 × waiting for element to be visible, enabled and stable
```

⚠️ **Y por eso la lectura del artefacto tiene un paso más de lo que decía esta nota:** no alcanza con
*"¿qué locator se esperaba?"* — hay que mirar **en qué estado lo encontró**. «No lo encontré» y «lo
encontré apagado» son diagnósticos opuestos y el mensaje de arriba es el mismo.

---

### 🔴 CRITERIO SIN NÚMERO · UN MAPEO CON DOS ENTRADAS AL MISMO DESTINO COLAPSA DOS ACCIONES EN UNA

*Medido el 2026-09-03, re-derivando diez specs al retirar el modal de cobro.*

Al mover una pantalla, el trabajo se hace con una **tabla de reemplazos**: locator viejo → locator
nuevo. Es mecánico, se aplica con un script, y funciona — salvo por una propiedad que nadie mira:

> **Si dos entradas distintas apuntan al MISMO destino, el mapeo pierde información.** Dos acciones
> que el usuario hacía por separado pasan a ser la misma, y en todo sitio que usaba las dos queda
> una repetida.

**El caso.** `checkout-continue` (el paso *método → monto*) y `checkout-confirm` (cobrar) eran dos
botones distintos del modal. Los dos se mapearon a `cobro-confirmar`, porque en la columna el paso
intermedio no existe. Donde el flujo usaba ambos —efectivo: *Continuar*, teclear el monto,
*Confirmar*— quedó **un doble clic sobre el mismo botón**: el segundo pega mientras el primero está
en vuelo, el botón está deshabilitado, y el caso muere por timeout. Tres sitios, dos archivos.

🔴 **Lo que lo hace peligroso es que ningún verificador lo ve.** El locator existe, el testid es
correcto, `tsc` compila, ESLint calla. **No es un error de referencia: es una secuencia que se
ejecuta y hace de más.** Y su síntoma —un timeout— apunta al lugar equivocado.

**LO ACCIONABLE, y es un comando antes de aplicar el mapeo:**

```bash
# la columna de DESTINOS del mapa, buscando repetidos
printf '%s
' "${destinos[@]}" | sort | uniq -d
```

Si hay repetidos, el mapeo **no es una traducción: es una fusión**, y hay que decidir qué pasa en
cada sitio que usaba las dos entradas. La señal estaba en la tabla desde el principio —dos flechas
al mismo lado— y mirarla cuesta menos que los tres timeouts de 30 segundos que costó no mirarla.

⚠️ Corolario, y vale para cualquier renombre masivo: **la pregunta no es si cada reemplazo es
correcto, sino si el mapa es INYECTIVO.** Cada reemplazo puede ser correcto y el conjunto perder
información igual.

🔴 **SEGUNDO CASO, 2026-09-03 — Y EL PRIMERO CAZADO ANTES DE APLICARLO.** Al volver el cobro al
modal hubo que hacer el camino inverso: `cobro-confirmar` (uno) → **tres** botones del modal
(`checkout-continue` · `checkout-confirm-efectivo` · `checkout-confirm-mixto`), según el medio. O
sea que no había mapeo posible: había **33 decisiones, una por sitio**.

**Y uno de los 33 no era un confirmador: era la PUERTA.** El caso *«sin turno el cobro no procede»*
de `pos.spec` apretaba `cobro-confirmar` para medir que **NO** cobrara. Su destino correcto es
`cobro-abrir` — un botón que en ese escenario ni siquiera abre nada.

⚠️ **Y por eso este caso es el que muestra el costo real de no mirar.** Un renombre mecánico lo
habría mandado a un confirmador que en ese escenario no existe, y el resultado no es un rojo
honesto: es un rojo que dice *«no apareció el modal»* en vez de nombrar el turno — o, si el
escenario hubiera sido un poco distinto, **un verde**, porque *«el botón que buscaba no está»* y
*«el cobro no procedió»* se parecen demasiado.

> **En un mapeo de locators, el sitio más peligroso no es el que usa dos entradas: es el que usaba
> la entrada para medir que NO pasara nada.**

Un locator que existe para verificar una **ausencia** sobrevive a casi cualquier reemplazo
equivocado, porque su aserción ya espera que no haya nada.

✅ **Lo accionable que agrega, y es una pregunta antes del `sort | uniq -d`:** de los N sitios,
**¿cuáles aseveran que algo NO ocurre?** Ésos se leen uno por uno **aunque el mapa sea inyectivo**;
el `uniq -d` no los ve, porque su problema no es el destino repetido sino que el destino correcto es
**otra cosa entera**.

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

**🔴 EL "GRUPO AFECTADO" POR UN COMPONENTE COMPARTIDO ES CUALQUIER SPEC QUE LO MIRE — NO LOS DE LA
PANTALLA QUE SE TOCÓ.** *Medido el 2026-09-03, cerrando la tanda 1 del re-skin.*

La cadencia de trabajo es *tsc + lint + **el grupo afectado***, y correr la suite entera por cada
cambio no es viable. Entonces el recorte del grupo es una decisión que se toma en cada paso, y hay
una forma de recortarlo mal que se siente correcta:

> **Elegir el grupo por la PANTALLA que se editó, cuando lo que se editó es un componente que vive
> en todas.**

**El caso.** La tanda 1 reescribió el bloque de identidad del **sidebar** y eliminó el testid
`sidebar-brand-name`. El grupo elegido fue el de las pantallas del sidebar; `reportes.spec` no
estaba adentro, **y era el único spec del repo que aseveraba ese testid**. La tanda cerró en verde,
se commiteó, y el rojo apareció recién en la suite entera del final — atribuible a cualquiera de las
cinco tandas, que es justo lo que la cadencia existe para evitar.

**Lo accionable, y es un grep, no un juicio:** al tocar un componente compartido —layout, sidebar,
una primitiva de `src/components/ui/`— el grupo no se elige por pantalla: se **enumera por
consumidor**.

```bash
grep -rln "sidebar-brand-name\|sidebar-org-name" tests/    # por testid tocado
grep -rln "AppLayout\|<Badge\|MoneyCell" src/ tests/       # por símbolo, si el cambio es de forma
```

⚠️ Y la señal barata que lo anticipa: **si el archivo que estás editando aparece en más de una
pantalla, el grupo es la lista de consumidores, no la carpeta.** El sidebar está en las once.

**🔴 UN LOCATOR QUE NO PUEDE NOMBRAR *QUÉ* INSTANCIA QUIERE ESTÁ APOSTANDO A QUE SIEMPRE HAYA UNA.**
*Ya es clase: tres casos, en tres instrumentos distintos, todos rotos por lo mismo.*

> **La unicidad es una propiedad del PRODUCTO, no del test.** Un locator que se apoya en ella no
> declara esa dependencia en ninguna parte — así que el día que el producto gana una segunda
> instancia, el test falla por una razón que no tiene nada que ver con lo que estaba midiendo.

| locator | de qué unicidad dependía | qué la rompió |
|---|---|---|
| `getByText('Efectivo', { exact: true })` | que hubiera **una sola grilla** de medios de pago | el cobro en línea montó la columna **y** el modal a la vez → *strict mode violation*, 9 casos |
| `getByTestId('product-card').first()` en `pos.spec` | que el primer producto del POS fuera **siempre el mismo** | otro spec dejó activo un producto que ordena antes → cinco casos con total cero (deuda 67) |
| `getByText('Historial').last()` en el script de captura de A6 | que el rótulo apareciera **una sola vez** | el panel de Clientes tenía un encabezado con el mismo texto → **capturó otra pantalla, sin error** |
| `getByText('Efectivo', { exact: true })` en el bucle de los 4 métodos de `pos.spec` | ídem la primera fila | ídem — **y la nota que explicaba esta clase estaba TRES LÍNEAS ARRIBA, en el mismo test** |

⚠️ **Los tres funcionaron durante meses**, y ésa es la parte que los hace clase y no descuidos: no
se rompen al escribirlos, se rompen cuando el producto crece. Y los tres fallan **distinto** —uno
grita, uno da un número raro, uno da una imagen creíble de otra cosa—, así que no hay un síntoma
común que enseñe a buscarlos.

**LO ACCIONABLE:** un locator se acota **por contenedor o por `data-testid`**, nunca por texto
visible ni por posición (`.first()`, `.last()`, `.nth()`). Si de verdad hacen falta dos instancias
del mismo componente, el testid lleva **prefijo** — como `pay-method-*` (el modal) y `cobro-medio-*`
(la columna).

⚠️ Y el corolario para cuando aparezca la segunda instancia: **no se arregla agregando `.first()`**.
Eso conserva la apuesta y la esconde mejor.

🔴 **EL CUARTO CASO ES EL QUE MÁS ENSEÑA, PORQUE LA LECCIÓN ESTABA ESCRITA EN EL MISMO TEST.**
*2026-09-03.* `pos.spec` tenía, textual, esta nota sobre el rótulo `Total a cobrar`:

> *"desde el re-skin ese rótulo aparece DOS veces … y `getByText` en modo estricto falla con dos
> coincidencias. El testid ya existía; la aserción no se debilita, se vuelve específica."*

**Y tres líneas más abajo, en el mismo test, el bucle de los cuatro métodos seguía usando
`getByText`.** Se arregló la instancia que dolía y **no se barrió la clase** — que es R3 en
miniatura, dentro de un solo archivo, escrita por quien acababa de nombrar el problema.

⚠️ **Lo que agrega sobre las otras tres:** las tres primeras se justificaban con *"nadie sabía"*.
Ésta no: alguien lo supo, lo escribió, y arregló una línea de tres. **Entender la clase no la
barre.**

🔴 **Y LA MECÁNICA DE POR QUÉ NO SE BARRE, que es lo que vuelve el corolario obligatorio en vez de
una recomendación de atención:**

> **El rojo se pone verde ANTES de que exista el motivo para seguir buscando.**

En el momento en que el arreglo funciona, la señal que traía a alguien hasta acá **desaparece**. No
hay nada que empuje a mirar tres líneas más abajo: la tarea se siente terminada porque, por el único
criterio disponible en ese instante, lo está. Pedir *"acordate de barrer la clase"* es pedir que
alguien actúe **sin señal**, justo cuando la señal se apagó.

⚠️ **Es exactamente el argumento del hook contra el recordatorio**, medido otra vez: lo que depende
de que alguien se acuerde **en el momento correcto** falla, y falla más cuanto mejor salió el
arreglo. Por eso el corolario de abajo es un **comando**, no una actitud — se corre aunque uno esté
seguro de que no hace falta, que es cuando más hace falta.

🔴 **QUINTA APARICIÓN, Y LA QUE PONE PRECIO AL BARRIDO.** *Corte 3, 2026-09-03.* La migración del
cobro monta las dos superficies a la vez, así que **todo componente compartido necesita prefijo de
testid**. Los descubrí **de a uno por rojo**: `TenderSelector` en el corte 1, `PaymentSplitEditor`
en el 2, `CustomerPicker` en el 3 — con la clase ya escrita en este archivo desde el corte 1.

**El precio, medido:**

| | costo |
|---|---|
| **enumerar** | `grep -oE "<[A-Z][A-Za-z]+" <pantalla> \| sort \| uniq -c` — **un comando** |
| **descubrirlo por rojo** | ×3: correr el grupo (~2 min), leer el artefacto, diagnosticar, editar el componente, editar el spec, re-correr |

Y al correr por fin el comando apareció un **cuarto** —`CupoMeter`— que todavía no había mordido:
o sea que el método reactivo iba **atrasado**, no empatado.

✅ Corrido antes del corte 4 sobre **todos** los componentes de la pantalla: no hay un quinto.
`TotalRow` no tiene testids, `MoneyCell` recibe el suyo del llamador, y los dos montajes de
`ItemConfigModal` son excluyentes por estado.

**Corolario operativo:** cuando arregles un locator de esta clase, corré el grep de la forma **en el
archivo entero antes de cerrar**, no sólo en la línea del rojo:

```bash
grep -nE "getByText\([^)]*\)\.(click|fill)|\.(first|last)\(\)|\.nth\(" <archivo>
```

**🔴 MOVER UNA PANTALLA ROMPE LOS SPECS QUE LA USABAN DE CAMINO — Y ESO ES INFORMACIÓN, NO RUIDO.**
*Medido el 2026-09-03, en el corte 1 del cobro en línea: 14 rojos de un saque, en 11 archivos.*

Al mover el cobro del modal a la columna, catorce casos se pusieron rojos. **Ninguno era un defecto
del cambio**: eran specs cuyo SUJETO es otra cosa —descuento, mixto, fiado, arqueo, numeración,
extras, inventario— y que usaban el cobro sólo como **camino** para dejar una venta armada.

⚠️ **La tentación es leer eso como "el cambio rompió catorce tests" y dudar del cambio.** Es al
revés: los catorce rojos son el **inventario, gratis y exacto, de quién dependía de esa pantalla**.
Ninguna enumeración previa los habría listado tan bien — es la misma lección que la poda, donde
*"¿quién la usa para LLEGAR a otra cosa?"* fue la línea que se leía corta.

**Las dos causas, y se arreglan distinto:**

| causa | qué se hace |
|---|---|
| el spec usaba la pantalla vieja **de camino** | se re-deriva el CAMINO y las aserciones viajan intactas |
| el spec **elegía por TEXTO** (`getByText('Efectivo')`) | se pasa a `data-testid`: con dos superficies montadas el texto resuelve a dos elementos |

🔴 **Y la segunda causa vale aparte, porque sólo aparece con las dos superficies vivas.** Nueve
casos elegían el medio de pago por su texto visible. Mientras hubo una sola grilla eso funcionó
años; con la columna y el modal montados a la vez, `getByText('Efectivo', { exact: true })` resuelve
a **dos** elementos y Playwright falla por *strict mode*. **El locator no estaba mal: estaba
apoyado en que hubiera una sola instancia**, que es una propiedad del producto, no del test.

**Lo accionable, y es barato:** el camino compartido va a un **helper**, no repetido en cada spec —
acá eran 26 repeticiones del mismo clic, y el camino va a cambiar otras tres veces antes de que el
corte termine. Un camino repetido N veces es R1 dentro de la suite.

**🔴 DOS CIFRAS QUE COINCIDEN POR CONSTRUCCIÓN NO SE VERIFICAN ENTRE SÍ — CUARTA APARICIÓN, Y LA
PRIMERA ANOTADA ANTES DE QUE MUERDA.**
*2026-09-03, corte 4 del cobro en línea.*

| # | las dos cifras | cómo se descubrió |
|---|---|---|
| 1 | `orders.total` vs la suma de las líneas | **al llegar** al precio editable, que las separaba (deuda 80) |
| 2 | la lista de `payments` vs su total, con **una sola fila** | **al llegar** al pago mixto, que traía dos |
| 3 | el plazo de la orden vs el del cliente | **al llegar** al caso que cambia el del cliente |
| 4 | 🟡 `checkout-total` (el modal) vs `cart-total` (la columna) | **antes de que muerda** |

**El caso.** Al re-derivar los specs, `checkout-total` —*«el total que el cobro va a cobrar»*— se
reemplaza por `cart-total` —*«el total del carrito»*—. Hoy son **el mismo número por construcción**:
el cobro toma el total del carrito y no hay nada en el medio. El reemplazo es correcto y la aserción
sigue siendo cierta.

⚠️ **Lo que cambia es qué AFIRMA la aserción.** Antes decía *"el cobro va a cobrar esto"*; ahora
dice *"el carrito suma esto"*. Mientras las dos cifras salgan del mismo cálculo, un spec que asevera
la segunda **no está verificando la primera** — está escribiéndola dos veces.

🔴 **DISPARADOR, concreto:** el día que exista **un cargo, un redondeo o un impuesto entre el
carrito y el cobro**. Ahí las dos cifras se separan, y todo spec que asevere `cart-token` creyendo
medir el cobro pasa a medir otra cosa **sin ponerse rojo**.

✅ **Lo que agrega ser la primera anotada antes:** las tres anteriores costaron el diagnóstico
entero cada una —se descubrieron *al llegar* al caso que las separaba, y hasta entonces su verde se
leyó como cobertura—. Ésta se anotó **mirando el reemplazo**, no sufriéndolo. La pregunta que la
detectó es de una línea y sirve para cualquier renombre de locator:

> **¿Este testid nuevo afirma LO MISMO que el viejo, o afirma algo que hoy coincide con lo mismo?**

**🔴 HAY ASERCIONES QUE NO MIDEN EL CÓDIGO DE HOY: SON TRIPWIRES PARA MAÑANA. NO SON INÚTILES Y NO
SON EVIDENCIA.**
*2026-09-03, corte 3 del cobro en línea.*

Una aserción **cierta por construcción** —el esquema no permite que sea falsa— no está midiendo
nada del código actual. Está midiendo que **nadie cambie el esquema mañana**. Las dos cosas son
legítimas y **no son la misma**, y confundirlas infla lo que un verde significa.

**El caso.** *«Cambiarle el plazo al cliente NO mueve la venta ya hecha»*. Hoy `plazo_dias` es una
columna de `orders` y **nada escribe hacia atrás**: la aserción no puede ser falsa. El mutante que
mata el caso es el de la otra mitad —no guardar el plazo en la orden—, y muere ahí.

> **EL CRITERIO PARA RECONOCERLAS, y es una pregunta sola: ¿existe un mutante razonable que la mate
> SIN cambiar el esquema? Si no existe, es tripwire y no medición.**

⚠️ **Por qué importa la distinción y no es semántica:** un tripwire cuenta como cobertura en la
cabeza de quien lee la lista de casos, y no lo es. Si alguien pregunta *"¿esto está probado?"*, la
respuesta honesta es *"está protegido contra un cambio de esquema, y el comportamiento de hoy lo
prueba la otra mitad"*.

**Lo accionable:** la distinción **se escribe en el propio caso**, no en un documento aparte — es
donde la va a leer quien interprete su verde. Y el tripwire dice **contra qué cambio** protege.

**🔴 SI UN CÁLCULO TIENE RAMAS DE CAÍDA, EL ESCENARIO TIENE QUE EVITARLAS EXPLÍCITAMENTE — O EL CASO
PRUEBA LA CAÍDA Y NO EL CÁLCULO.**
*2026-09-03, escribiendo el spec del costeo promedio. Séptima vez que el escenario de un caso
resulta no medir lo que dice medir, y **la primera cazada LEYENDO LA FÓRMULA antes de escribirlo**,
no después con un mutante.*

**El caso.** `register_purchase` calcula el promedio ponderado móvil… **en una de cuatro ramas**:

```sql
cost_price = case
  when not v_tracking                   then v_unit_cost   -- caída 1
  when v_costo_actual is null           then v_unit_cost   -- caída 2
  when coalesce(v_stock_actual,0) <= 0  then v_unit_cost   -- caída 3
  else round((v_stock_actual*v_costo_actual + v_qty*v_unit_cost)/(v_stock_actual+v_qty), 2)
end
```

**Tres de las cuatro devuelven el último costo.** Un producto recién creado cae en la 2 y la 3 a la
vez, así que un caso que *"compra dos veces a costos distintos"* sobre un producto nuevo **nunca
ejecuta el promedio** — y da un número perfectamente plausible.

⚠️ **Y hubo una CUARTA condición que tampoco estaba en el enunciado:** `register_purchase` **exige
jornada abierta** (deuda 26), así que el spec moría en el montaje sin llegar al cálculo. Esa la
encontró el rojo; las tres caídas las encontró **leer la función**.

**LO ACCIONABLE, y es un paso antes de escribir el caso:** abrí el cálculo y **enumerá sus ramas**.
Por cada rama que devuelve algo distinto del sujeto, el escenario tiene que **evitarla
explícitamente**, y el caso tiene que **decir que la evita** — si no, el próximo que lo lea no sabe
que el montaje es parte del sujeto.

✅ En este spec eso se ve: la **primera** compra es montaje declarado —cae a último costo, y está
bien— porque es lo único que deja el producto con costo **y** con stock, que es la única forma de
llegar al `else`. Y la **venta en el medio** no es decorado: sin ella el stock sería 10 y no 9, y el
promedio daría 1.500 — un número que también se distingue de 2.000, pero que no ejercita que la
ponderación use el stock **real**.

**🔴 UNA ASERCIÓN SOBRE UNA COLECCIÓN NO ESTÁ EJERCIDA HASTA QUE EL ESCENARIO TIENE MÁS DE UN
ELEMENTO.**
*2026-09-03, corte 1 del cobro en línea. Tercera aparición de «un verde que no podía fallar», y la
primera cazada al llegar al caso que sí discrimina en vez de con un mutante.*

> **Con un solo elemento, comparar la LISTA y comparar el TOTAL son la misma aserción.** La forma se
> ve más fuerte —compara filas, orden, cada campo— y mide exactamente lo mismo que un `sum`.

**El caso.** La equivalencia entre la columna y el modal comparaba los `payments` **fila por fila**,
ordenados. Escrito así desde el principio, y correcto. Pero el escenario del corte 1 es una **venta
simple**: una sola fila de pago. Con una fila, *"las listas son iguales"* no puede distinguirse de
*"los totales son iguales"* — y la propiedad que la comparación por filas existe para atrapar
—**dos repartos distintos que suman lo mismo**— nunca se ejerció.

⚠️ **Y por eso no la habría cazado un mutante del código.** Alterar el reparto no era posible: no
había reparto. Lo que la destapó fue **llegar al escenario que sí discrimina** —el pago mixto del
corte 2—, o sea el trabajo siguiente, no una técnica de verificación.

**LO ACCIONABLE, y es una pregunta al escribir la aserción:** cuando compares una colección,
preguntá **cuántos elementos tiene el escenario**. Si tiene uno, la aserción está escrita pero no
ejercida: o se enriquece el escenario, o se anota que la forma fuerte espera su caso. Lo que no vale
es contarla como cubierta.

⚠️ Corolario para el orden del trabajo: una aserción escrita y no ejercida es **deuda de
verificación**, y se paga en el corte que trae el escenario. Se anota ahí, no se olvida — es
exactamente lo que pasó con *«E con el foco en el campo de dinero»*, que estuvo en dos mitades hasta
que la columna existió.

**🔴 SI DOS SUPERFICIES COMPARTEN UNA ESCRITURA, ESO SE MIDE — NO SE AFIRMA.**
*Condición fijada el 2026-09-03, antes de partir el cobro en línea en cortes.*

Cuando un cambio grande se parte, es normal que durante la transición **dos superficies hagan lo
mismo** —el formulario nuevo y el viejo, la columna y el modal—. La defensa contra R1 es siempre la
misma frase: *"la escritura es una sola, hay dos vistas de una implementación"*.

> **Esa frase es una afirmación de diseño, y como toda afirmación de diseño no ejecuta.** Vale hasta
> que alguien agrega un campo en una sola de las dos, o una validación, o un default.

**Lo accionable, y cuesta un caso por corte:** el spec de cada corte asevera que **las dos
superficies producen el mismo resultado** —no sólo que la nueva funciona—. Un caso por superficie
sobre el **mismo escenario**, comparando **contra la base**.

⚠️ **Y el detalle que decide si el caso mide algo:** la comparación va sobre lo que se PERSISTIÓ
—total, líneas, pagos, movimiento de caja—, porque es lo único que las dos superficies comparten de
verdad. Comparar lo que MUESTRAN es comparar dos vistas, que es justamente lo que no está en duda.

⚠️ Corolario para el que retira la superficie vieja: **el día que se borra, ese caso se borra con
ella** — su sujeto deja de existir. Lo que NO se borra son las aserciones sobre la base: se
re-alojan en el spec de la superficie que queda.

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

🔴 **TERCERA VEZ, Y AHORA CON LO ACCIONABLE QUE FALTABA: UN ELEMENTO CLIPEADO POR UN CONTENEDOR DE
ALTURA 0 ES «VISIBLE» PARA PLAYWRIGHT.**
*2026-09-03, al desplegar el cobro en línea.*

**El caso.** Con el cobro en la columna, el panel de tinta pasó a 485px fijos y **la lista del
carrito colapsó a CERO** en todo viewport de hasta ~1050px de alto. La cajera no veía qué estaba
vendiendo. La venta salía bien, la base quedaba perfecta y **la suite entera estaba verde**.

⚠️ **Y no era falta de cobertura.** El ítem sigue en el DOM y tiene bounding box: `toBeVisible()`
sólo descarta `display:none`, `visibility:hidden` y caja vacía. **Un elemento correctamente
maquetado dentro de un contenedor con `overflow:auto` y altura 0 pasa todos los chequeos de
presencia.**

> **Si lo que importa es que SE VEA, la aserción es GEOMÉTRICA, no de presencia:** que el rectángulo
> del elemento caiga **dentro** del rectángulo que lo contiene, y que lo que tiene que estar a mano
> caiga dentro del viewport.

```js
const r = item.getBoundingClientRect(), c = contenedor.getBoundingClientRect()
r.top >= c.top && r.bottom <= c.bottom          // ¿está dentro de su caja?
b.top >= 0 && b.bottom <= window.innerHeight    // ¿está sobre el pliegue?
```

🔴 **Y la aserción cubre TODAS las piezas del compromiso, no una.** El primer arreglo —scrollear el
panel entero— devolvió la lista y dejó **el botón Cobrar debajo del pliegue**: un defecto cambiado
por otro, con la suite igual de verde. El caso final asevera las tres —ítem dentro de su caja, total
en viewport, Cobrar en viewport— porque **un arreglo de alto siempre le saca espacio a algo**, y sin
las tres el próximo vuelve a hacer lo mismo sin que nada avise.

⚠️ **Y el escenario tiene que ejercer la capacidad:** con UN ítem el caso pasó incluso con el mínimo
en cero — no distingue «entran tres filas» de «entra una». Con tres, el mutante muere nombrando el
número (`alto 254px`). Es la misma forma que la comparación de `payments` con una sola fila, en otro
eje: **una aserción sobre una capacidad de N no está ejercida con N=1.**

✅ **Lo cazó el par del DESPLEGADO**, no la suite ni el par de A6 —que se capturó en la tanda 1,
antes de que el cobro bajara a la columna—. Es la tercera vez que un defecto aparece **mirando** y
no ejecutando, y la primera en que mirar *lo que ve el cliente* encuentra algo que mirar *lo que
construimos* no podía encontrar.

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
mensaje del rojo nombra qué cambió**.

🔴 **Y LA OTRA MITAD, que es la que engaña: UN ROJO QUE NO REPRODUCE EL DEFECTO ES TAN INÚTIL COMO UN
VERDE QUE NO LO MIDE.** *Medido el 2026-09-02, escribiendo el rojo de la deuda 55.*

> El mensaje tiene que ser **claro** Y **cierto**. Un rojo con un mensaje impecable sobre algo que no
> pasó dirige perfecto hacia el lugar equivocado.

**El caso.** El test debía probar que cerrar la caja antes de que cargue el resumen **persiste un
arqueo falso**. Para provocar la carrera se bloqueó la respuesta de `payments`… y con eso se colgó
también la consulta que la mutación hace al cerrar, así que **el cierre no llegó a persistir nada**.
El rojo decía, con todas las letras, *"SE PERSISTIÓ UN ARQUEO FALSO: expected_amount quedó calculado
sobre salesSummary vacío"* — y no se había persistido nada. Lo delató el valor recibido: `-1`, el
default de "no encontré la fila", en vez de un número plausible.

**Lo accionable, y es una lectura de treinta segundos:** ante un rojo, mirá **el valor recibido**, no
sólo el mensaje. Si es el default del propio test —`-1`, `null`, `0`, `undefined`, lista vacía—, lo
más probable es que el escenario no se haya montado y el defecto ni siquiera se haya ejercido. Un
rojo por la razón equivocada se arregla "arreglando" lo que no estaba roto.

⚠️ Es la misma familia que el control negativo, del otro lado: allá se comprueba que el instrumento
**puede decir que no**; acá, que el rojo **está diciendo que sí por la razón que dice**. Hay que trabajar activamente para que dirija; por defecto no
lo hace. Corolario práctico: al auditar por mutación (R10), **leé el mensaje**, no solo el
`✓`/`×` — el mutante puede morir y el rojo ser inútil igual.

---

## Estado

*Actualizado: 2026-09-02 (A5: nueve celdas corregidas; ver `docs/auditorias/A5-estado-en-los-documentos.md`).*

Todo lo de esta sección caduca. Preferí siempre el comando sobre el dato.

| Qué | Estado |
|---|---|
| Nombre | **Fijado: Nodo** (2026-08-31), tras verificar riesgo marcario. ⛔ Falta el registro en la SIC, clases 9 y 42. |
| Repo | Creado (2026-08-31). |
| Proyecto de Supabase | Creado (2026-08-31). CLI verificado sin 403 el mismo día (deuda 2); **17 migraciones aplicadas al 2026-09-02**. Reconfirmar con `pnpm exec supabase migration list --linked`. |
| Vercel | No existe. |
| Sentry | No existe. Proyecto propio, con el filtro de PII ya corregido. |
| Origen de la copia | Vento rama `develop`, `d848852`. *(Esta fila decía que `docs/reglas-de-clase` seguía viva "en origin": en el origin de Nodo no existe —`git ls-remote --heads origin` → solo `develop`—; si existe, es en el de Vento. Corregido en A5.)* |
| Conteo de errores repetidos en Vento | **Discrepante:** el traspaso dice 9, su `CLAUDE.md` dice 11, el cierre dice 13 y numera los casos #11–#14. Resolver contra `docs/BITACORA.md` antes de citarlo. |
| `settings.json` + hooks | Copiados, verificados en banco y **corriendo en la máquina real** (2026-08-31): disparó 3 veces en sesión. ⛔ Las 3 fueron falsos positivos — tasa de ruido sin medir (deuda 22). |
| Centro | Ya nació multi-producto. Enumerar qué falta para que Nodo entre como tercer producto — **en su propio hilo**. |
| Generador de RBAC | **Ya viajó** (2026-08-31). Existen `scripts/gen-rbac-sql.mjs` y `supabase/seed-system-roles.sql`; `pnpm gen:rbac:check` da **exit 0**. ⛔ Falta que ese check corra en **CI** (deuda 5). ✅ **Catálogo propio desde el 2026-08-31: 21 claves de Nodo** (deuda 23 resuelta); quedan la 23.1 —tres claves sin consumidor al 2026-09-02: `productos.ver`, `reportes.stock`, `reportes.consolidado`— y la 23.2. *(Esta celda decía "23 claves de Vento" mientras la fila del tripwire decía 21: par contradictorio, corregido en A5.)* Reconfirmar con `grep -oE "'[a-z_]+\.[a-z_]+'" src/lib/permissions.ts \| sort -u \| wc -l`. |
| Design system | ✅ **Capturado como skill `nodo-design-system` (2026-09-01)**; tokens en `src/tokens.css`, 9 primitivas en `src/components/ui/`; re-skin de las 11 pantallas hecho el 2026-09-01/02 —8 en cero hexes; POS, Reportes, Turnos y Fiado con sus hexes documentados—. *(Decía "⛔ Pendiente"; corregido en A5.)* |
| Tripwire del catálogo | ✅ **Puesto (2026-08-31)** en `src/lib/permissions.test.ts`: las 21 claves como **lista ordenada**, no un conteo — un conteo no ve una sustitución. Auditado por mutación, 3/3 mutantes muertos. Reconfirmar con `pnpm test:unit`. |
| Regla nueva sin número | ⛔ Numerarla en Vento primero. |
| Las 5 skills | ⛔ Pendientes. |
