# G-Nexo — contexto del proyecto

> **Los tres archivos, y cuándo se lee cada uno:**
>
> | archivo | cuándo | qué tiene |
> |---|---|---|
> | **`CLAUDE.md`** (este) | **antes de trabajar, siempre** | convenciones + las **once reglas de clase** |
> | [`docs/BITACORA.md`](docs/BITACORA.md) | cuando una regla te parezca discutible, o necesites contexto | la evidencia medida de cada regla + el detalle de cada fase y sesión |
> | [`docs/DEUDAS.md`](docs/DEUDAS.md) | **al planificar** | deudas vigentes + ideas pospuestas (NO son backlog) |
>
> Estructura heredada de G-Vento, donde se separaron el 2026-08-26 porque de 36 afirmaciones
> auditadas, **las 8 falsas eran todas de ESTADO** y ninguna de regla: el registro es la parte
> que se pudre, y estaba mezclado con lo que hay que leer siempre.

> **Nombre provisional.** Pendiente: whois de `gnexo.co` / `gnexo.com` y consulta de marca en el
> SIC, clases 9 y 42 — existen al menos tres empresas de software colombianas con la raíz "Nexo".
> Reemplazos evaluados si sale apretado: `G-Nodo`, `G-Lazo`. Cambiar el nombre hoy toca este
> título y las variables de entorno. Después, no (ver R1 y el caso `restaurant_id` × 1.010).

---

## Descripción

Sistema de mostrador, catálogo, clientes y cartera para negocios que mantienen stock de muchas
referencias y venden sobre un mostrador, algunos a crédito: distribuidoras, mayoristas,
comercializadoras, ferreterías, droguerías, repuestos, aseo, alimentos, bebidas, consumo masivo.

Forkeado de G-Vento (POS de restaurantes) en agosto de 2026.

**El producto es horizontal.** Ningún módulo, tabla, permiso o texto de UI debe asumir un
vertical concreto. Si una pantalla dice "distribuidora", está mal: la misma pantalla la usa una
ferretería.

**Alcance (2026-08-31, tras la firma del primer cliente):** base técnica + catálogo + clientes +
cartera + pedidos + **compras, inventario, gastos y utilidades**. La condición que mantenía a estos
cuatro afuera era "hasta que haya cliente firmado", y se cumplió. ≈30.000 líneas.
**Se agrega respecto de G-Vento:** preventa, cupo de crédito, pedidos por WhatsApp/teléfono.
**No existe y no está planeado:** rutas propias, despacho, tracking. El cliente carga y se lleva.

🔴 **Inventario y compras NO viajan tal cual desde G-Vento.** Están en el **43,3% de zona gris**,
no en el 21,7% que se copia. Tres diferencias medidas: G-Vento descuenta stock **por receta**
(`add_order_items_with_extras`) y acá no hay recetas; la **unidad de compra difiere de la de venta**
(se compra por bulto, se vende por unidad) y eso no existe en un bar; y el **costo por producto** se
recalcula en cada compra en vez de derivarse de una receta. Tratarlos como copia es exactamente la
premisa que el diagnóstico advierte.

### 🔴 NO es un monorepo

**Una app Vite única.** No hay `apps/`, no hay `packages/shared`, no hay `pnpm-workspace.yaml`.

Se anota en negativo a propósito: el `CLAUDE.md` de G-Vento afirma ser un monorepo con
`apps/pos`, `apps/store`, `apps/mobile` y `packages/shared`, y **esa afirmación es falsa** — fue
la novena nota de estado falsa encontrada en ese repo y al 2026-08-31 sigue sin corregirse allá.
G-Cresco sí es un monorepo con pnpm workspaces; **eso no aplica acá**. Si algún día G-Nexo
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
alguna sesión lo "descubra" y proponga arreglarlo. En G-Vento pasó exactamente eso.

**No se hereda nada de esta sección de G-Vento.** Los comportamientos de G-10 y Salchimelo —las
mesas abiertas usadas como cuenta corriente interna, por ejemplo— son estado de negocio ajeno.

---

## 🔴 REGLAS DE CLASE — leer ANTES de trabajar (esto es lo único obligatorio)

> **Copiadas literales de G-Vento el 2026-08-31.** La numeración R0–R10 se mantiene idéntica a
> propósito: las skills citan las reglas **por número**, y renumerarlas rompería las referencias
> cruzadas entre los dos productos. Lo único que cambia es el **inventario de R1**, que es estado
> y por lo tanto se reconstruye para este repo.
>
> G-Nexo nace con esto puesto. A G-Vento le costó veinte días y once errores repetidos llegar acá.

Once reglas. Son la **forma corta**: accionables solas, sin abrir la evidencia. Cada una dice su
**modo de fallo**, porque los once errores repetidos del proyecto hermano no vinieron de
desconocer la regla sino de **no reconocer la situación**. Y cada una nombra su **clase** con las
palabras que uno grepearía (`allowlist`, `fail-open`, `por-id`, `validar-vs-forzar`,
`contrato compartido`), porque el paso 2 del pre-flight es justamente grepear la clase.

> **🔴 POR QUÉ UN RECORDATORIO NO ALCANZA — y el hook sí.** Un recordatorio que se puede **leer
> sin contestar se salta en silencio**; uno que **exige respuesta deja la omisión visible**. Esa
> es la diferencia real entre este bloque y el hook `PreToolUse`, y no es de contenido: los dos
> dicen lo mismo. Es de **distancia entre la carga y la decisión**. Medido en G-Vento el
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

En G-Nexo el problema es **más grave que un fork normal**: los dos productos se parecen mucho y,
según el propio prospecto, **no se espera que diverjan** en los próximos meses. Un defecto
arreglado en un lugar **no llega solo a su hermano** — nueve repeticiones en veinte días, medido
en G-Vento.

1. **Catálogo de permisos RBAC.** **NO se comparte** el catálogo con G-Vento: G-Nexo necesita el
   suyo. Lo que se copia es el **generador**, que allá ya está hecho y aplicado (2026-08-31):
   7 lados pasaron a 2. Fuente `SYSTEM_ROLES` en `src/lib/permissions.ts`; salida, la función
   `seed_system_roles(p_org)` que los seeds llaman. **No** son bloques generados y pegados: una
   copia generada se edita a mano igual de fácil que una escrita a mano.
   Diseño a replicar sin cambios: `admin = ALL_PERMISSION_KEYS` **derivado**, nunca enumerado
   (enumerarlo dejó las 4 copias de G-Vento con 16/20/18/23); la función **no** es
   `SECURITY DEFINER` y revoca también a `authenticated`; dos guards fail-closed (`p_org` null y
   organización inexistente).
   🔴 **La verificación es un check de CI (`regenerar && git diff --exit-code`), NO un hook.** Un
   hook dispara cuando tocás un archivo, y el fallo documentado fue un seed congelado **porque
   nadie lo tocó**. Un hook no detecta omisiones; el check de árbol sí.
   ⚠️ Residuo heredado a no repetir: en G-Vento, `ventas.anular` **no estaba en
   `PERMISSION_GROUPS`**, así que se enforceaba pero no se podía conceder desde la UI de Roles.
   ⚠️ Y una clave en el catálogo **no** es evidencia de que algo esté protegido: allá 6 permisos
   no gateaban nada y fallaban **abierto**.

2. **Filtro de PII de Sentry.** Ya triplicado en G-Vento y **con drift medido**. Es el contrato
   que más justifica extraerse a paquete real. G-Nexo arranca con la versión **corregida**, no con
   la que tiene huecos.

3. **Enum `subscription_status` — ahora 6 lados, TRES REPOS.** Ya eran 4 lados y 2 repos entre
   G-Vento y G-Centro; G-Nexo agrega los suyos. **No existe ningún mecanismo que garantice el
   aviso.** El aviso a G-Centro va ANTES del deploy, no después. **Paquete real.**

4. **`payment_method` — de 4 lados a 8.** No estaba en el inventario original de G-Vento. Vigilar
   desde el primer commit.

5. **`src/types/database.types.ts` escrito a mano vs la BD real.** El CLI de G-Vento da 403 de
   management y varias entradas se agregaron a mano. Los tipos pueden divergir del esquema **sin
   que `tsc` lo note** — el proxy exacto que R4 prohíbe confundir con la cosa real. En G-Nexo:
   verificar que el CLI funcione **antes** de escribir la primera migración.

6. **Tabla de columnas de `src/lib/sentry.test.ts` vs el esquema real.** En G-Vento son 74
   entradas. Agregar una columna al esquema obliga a agregarla ahí, en la misma sesión.

7. **Nombre de la entidad sede — `sede_id`. DECIDIDO el 2026-08-31.** En G-Vento no se renombra:
   `restaurant_id` × 1.010 en 77 archivos, y allá "restaurant" es **cierto**. Acá sería **falso**, y
   un nombre falso dirige mal. Además el repo heredado **ya usa la palabra "sede"**: el permiso
   `sedes.gestionar` existe en el catálogo y R6 dice textualmente *"la organización de una sede es
   la misma la mire quien la mire"*. Renombrar no inventa vocabulario: alinea la columna con la
   palabra que el proyecto ya usa. Se ejecuta **después de podar** (menos ocurrencias) y en un
   commit solo. Criterio de éxito: el conteo de `restaurant_id` llega a **cero**.

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
   G-Vento porque allá era un solo lado. Si arreglás el matcheo de permisos en un repo, **no
   llega solo al otro**.

→ **Evidencia:** repo de G-Vento, `docs/BITACORA.md` → *"FASE 1 — estado de suscripción"*.

---

### R2 · ALLOWLIST vs DENY-LIST · FAIL-CLOSED

Lo permitido se declara **positivamente**; lo prohibido nunca se enumera. Un objetivo destructivo
se fija por **UUID**, no se resuelve por nombre.

**Modo de fallo:** una deny-list **deja pasar en silencio** todo lo que nadie se acordó de
escribir, y lo que no está en la lista no existe hasta que estalla. La allowlist falla cerrándose,
que se nota. Corolario: **un `catch` que convierte un error en `''` es fail-open** — el error
tiene que salir ruidoso.

→ **Evidencia:** repo de G-Vento, `docs/BITACORA.md` → *"Filtros de privacidad: ALLOWLIST por
clave, nunca deny-list"* · en código: el guard de `supabase/demo-seed-cafeteria.sql`.

---

### R3 · DEFECTO DE CLASE vs INSTANCIA

Al arreglar un bug, nombrá **la clase** (no el síntoma), grepeá esa forma en todo el repo, y
arreglá las hermanas **en el mismo commit** aunque estén en verde.

**Modo de fallo:** la instancia huérfana estalla meses después y **nadie la asocia con este
arreglo**, así que se paga el diagnóstico entero de nuevo.

⚠️ **En G-Nexo esta regla cruza el límite del repo.** Mientras los dos productos se parezcan, la
pregunta "¿tiene hermanas?" incluye a G-Vento. Ver R1.

→ **Evidencia:** repo de G-Vento, `docs/BITACORA.md` → *"Un defecto de CLASE se barre en toda la
suite, no solo donde estalló"* — locator de `anular-venta`, las 15 copias del patrón inerte, y el
caso #11 (el hook mudo).

---

### R4 · VERIFICAR CONTRA LA COSA REAL, NO CONTRA UN PROXY

Ante un número raro, mirá el dato (`select`, `information_schema`), no la intuición. **`tsc` no
prueba el SQL** — triggers, RLS y vistas solo se verifican ejecutando con datos reales. Y antes de
copiar un patrón de referencia, `command -v` sus dependencias.

**Modo de fallo:** el proxy dice OK y concluís que funciona. **"Es el patrón canónico" no es
evidencia de que funcione acá:** `jq` no estaba instalado en la máquina de G-Vento y el hook habría
nacido mudo si se copiaba el ejemplo oficial.

**⚠️ Límite de esta regla, descubierto en G-Vento el 2026-08-31:** sobre **artefactos
generados**, el archivo que acabás de escribir **no es el que git materializa** — con `autocrlf`
son distintos. Un check de artefacto se valida **después de un checkout**, no en la sesión que lo
creó. El defecto del CRLF mordió al parche que lo documentaba, en el mismo turno.

→ **Evidencia:** *"Aprendizajes de proyectos hermanos"* más abajo · repo de G-Vento,
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
En G-Vento fue fail-closed por suerte, no por diseño.

→ **Evidencia:** repo de G-Vento, `supabase/fix-enforce-profile-organization-definer.sql` ·
`docs/BITACORA.md` → grepear `enforce_profile_organization`.

---

### R7 · LÍMITES DE DÍA SOBRE TIMESTAMPS UTC

`created_at` vuelve en **UTC**. Toda frontera de día, semana o mes se calcula en `America/Bogota`,
nunca sobre el timestamp crudo. Aplica a reportes, arqueo, cartera, cortes y seeds.

**Modo de fallo:** **no revienta.** Da un número plausible y equivocado, y el cliente lo detecta
antes que vos. Es el perfil exacto de fallo silencioso que se paga caro.

→ **Evidencia:** repo de G-Vento, `docs/BITACORA.md` → *"Detalle Vale descuento / ruletazo"*
(grepear `getVouchersTotal`).

---

### R8 · ARTEFACTOS ANTES DE RE-CORRER

Ante un test rojo: leer `test-results/**/error-context.md` (el **valor recibido**), después el
trace, y recién ahí re-correr.

**Modo de fallo:** Playwright **borra `test-results/` al arrancar**. Re-correr destruye la única
evidencia — y un flake, por definición, no se reproduce a pedido.

→ **Evidencia:** repo de G-Vento, `docs/BITACORA.md` → *"ANTE UN FALLO: LEER LOS ARTEFACTOS ANTES
DE RE-CORRER"*.

---

### R9 · EL EXIT CODE QUE TE MUESTRAN NO ES EL QUE PENSÁS

Nunca leas el resultado de una suite desde una **tubería** (`| tail` devuelve el exit de `tail`)
ni desde la **notificación de tarea en segundo plano** (reporta el exit del *shell*). Escribí el
código **dentro** del archivo de salida y grepealo.

**Modo de fallo:** verde falso anunciado como verdadero. Medido: la notificación dijo *"exit code
0"* **4 de 4 veces, con dos suites rojas**.

→ **Evidencia:** repo de G-Vento, `docs/BITACORA.md` → *"Trampas de TERMINAL — el síntoma no señala
la causa"*.

---

### R10 · UNA SUITE VERDE NO PRUEBA NADA — AUDITAR POR MUTACIÓN

Si una suite pasa entera a la primera, sospechá. Mutá el sujeto a identidad y corré: **los que
sobreviven no lo están probando**. Buscá aparte la clase que el mutante no ve: aserciones que
serían verdaderas para cualquier entrada. El discriminador es el **contraste** —positivo y
negativo en la misma aserción—. Los tests que verifican *ausencia de redacción de más* no pueden
fallar contra un no-op: son legítimos y van MARCADOS.

**Modo de fallo:** el test pasa **por la razón equivocada** y da confianza sin cobertura. Medido en
G-Vento: de 246 tests, **25 sobrevivieron al mutante y 58 más eran invisibles para él**.

**⚠️ Límite de esta regla, descubierto en G-Vento el 2026-08-31:** un mutante **no encuentra lo
que la fixture no reproduce**. "Los 4 mutantes murieron" prueba que los tests miran al sujeto, no
que las entradas cubran el mundo. La cobertura de entradas se audita aparte.

→ **Evidencia:** repo de G-Vento, `docs/BITACORA.md` → *"Auditar una suite por MUTACIÓN, no
leyéndola"*.

---

### R? · UNA GARANTÍA FALSA DONDE SE DECIDE LE GANA A TRES ADVERTENCIAS DONDE SE CODEA

⛔ **Regla nueva, sin número asignado.** Salió del caso #13 de G-Vento el 2026-08-31 y todavía no
tiene número allá. **No la numero acá por mi cuenta:** las skills citan por número y R1 es
exactamente sobre esto — asignarle un R11 unilateral crea un contrato divergente entre los dos
repos el primer día. Numerarla en G-Vento primero, después acá.

Al escribir una garantía, **nombrá el mecanismo y su límite**. "Está aislado" no es verificable;
"aislado por RLS + credenciales, y el check mira la organización, no la base" sí.

**Modo de fallo:** tres archivos del repo decían la verdad y el único que mentía era el documento
de planificación — **y ganó**. Una nota que tranquiliza mal es peor que una que dirige mal.

→ **Evidencia:** repo de G-Vento, caso #13.

---

## Aprendizajes de proyectos hermanos (G-Quota, G-Vento)

Reglas duras traídas de los hermanos — aplican a todo el trabajo en este repo:

- **NO ASUMIR, CONFIRMAR CONTRA LA BD:** ante un número raro o un comportamiento inesperado, mirar
  el dato real (un `select` directo, `information_schema`), no teorizar. La hipótesis se valida
  contra la base, no contra la intuición.
- **TIPOS GENERADOS, NO A MANO:** regenerar `database.types.ts` con
  `supabase gen types typescript` después de cada migración. Los 129 errores de tipos de la Fase 0
  de G-Vento vinieron justamente de tipos escritos a mano y desincronizados con la BD (vistas sin
  `Relationships`). **Verificar que el CLI funcione antes de la primera migración** — en G-Vento da
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

## Herencia de G-Vento

### Lo que viaja

La base técnica medida en el diagnóstico: **21,7%** de 39.351 líneas en 179 archivos. Multi-tenant,
RLS, RBAC, auth, hooks, patrones de RPC.

### Orden de poda

```
cocina  → ya tiene interruptor (uses_kitchen / routes_to_kitchen)
mesas   → el POS ya está desacoplado (DEFAULT_ORDER_TYPE='takeaway')
turnos  → cuidado con la FK de debt_payments
extras  → AL FINAL, y renombrando en vez de borrando
```

### Dónde está el peligro

No en el 24,6% que se borra. En el **43,3% de zona gris** que parece viajar tal cual y necesita
cambios: productos, inventario, clientes, fiado, compras, reportes.

### Premisas que los datos contradijeron

Se creyeron ciertas en G-Vento y no lo eran. Van acá porque son el tipo de error que se repite.

1. **"Sacar turnos toca el cobro" — NO.** `payments` no tiene `shift_id`; la pertenencia al turno
   es temporal. El acoplamiento son dos `if (!isShiftOpen)` de UI.
   **Pero sí toca la cartera:** `debt_payments.cash_movement_id` es FK real a `cash_movements`, y
   `register_debt_payment` busca el turno abierto. El único módulo con dependencia estructural al
   turno es fiado — justo el que sobrevive como cartera en G-Nexo.

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
  Pasó tres veces en G-Vento: `require` en un `.mjs`, `\b` interpretado como byte `0x08`, `\\`
  colapsado.
- **Verificación obligatoria tras generar un hook:** `node --check` + grep de bytes de control.
  Y `command -v` de cada dependencia antes de copiar un patrón de referencia (R4: `jq` no estaba).
- **Un hook no ve omisiones.** Dispara cuando tocás un archivo. Lo que queda congelado porque
  nadie lo tocó lo caza un check de árbol en CI, no un hook. Ver R1 punto 1.

### Estado

`settings.json` y `sql-checklist.mjs` copiados de G-Vento el 2026-08-31 (rama `develop`,
`d848852`). El **mecanismo** viaja literal; el **estado** de G-Vento (conteos del catálogo, los
6 permisos inertes, sus deudas) fue reemplazado por el de G-Nexo.

Verificado en banco: `node --check` limpio, sin bytes de control, ningún `require`; 10 casos de
pipe-test — Write, Edit, Bash-heredoc, ruta Windows, `update roles set permissions` en un `.txt`
fuera de `supabase/` y `SYSTEM_ROLES` en un `.ts` **disparan**; Bash sin SQL, `settings.json`,
payload vacío y un `.tsx` **callan**.

✅ **Corre en la máquina real (2026-08-31).** No por un test: disparó 3 veces dentro de una sesión
real, lo que prueba la cadena entera —settings leído por el harness, matcher activo, Node
encontrado, script no mudo—. En G-Vento el script salió mudo la primera vez y
leyéndolo se veía perfecto — y esa advertencia se conserva como razón, no como pendiente.
⛔ **Falta el tripwire** `tests/roles.spec.ts` que clave el tamaño del catálogo.

---

## Las cinco skills

`sql-riesgoso` · `defecto-de-clase` · `spec-e2e` · `rbac-permisos` · `demo-en-vivo`

**Criterio de división:** las reglas viven en este archivo; el **procedimiento** vive en las
skills. Cada skill **cita las reglas por número y no las repite** — repetirlas violaría R1.

Por eso la numeración R0–R10 es idéntica a la de G-Vento: una skill que dice "ver R2" tiene que
significar lo mismo en los dos repos.

---

## Variables de entorno requeridas

```
VITE_GNEXO_SUPABASE_URL=
VITE_GNEXO_SUPABASE_ANON_KEY=
```

Ver `.env.example` para la lista completa.

---

## Cómo se escribe una nota en este documento (convención)

Salió de auditar las 36 afirmaciones verificables del documento de G-Vento contra el código
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

⛔ **G-Nexo necesita el suyo.** El de G-Vento (`src/design-system.md`, acento emerald `#10b981`,
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

---

## Estado

*Actualizado: 2026-08-31.*

Todo lo de esta sección caduca. Preferí siempre el comando sobre el dato.

| Qué | Estado |
|---|---|
| Nombre | Provisional. Pendiente whois + SIC. |
| Repo | Creado (2026-08-31). |
| Proyecto de Supabase | Creado (2026-08-31). Verificar que el CLI **no** dé 403 antes de la primera migración. |
| Vercel | No existe. |
| Sentry | No existe. Proyecto propio, con el filtro de PII ya corregido. |
| Origen de la copia | G-Vento rama `develop`, `d848852`. También `docs/reglas-de-clase` en origin, viva hasta terminar de copiar. |
| Conteo de errores repetidos en G-Vento | **Discrepante:** el traspaso dice 9, su `CLAUDE.md` dice 11, el cierre dice 13 y numera los casos #11–#14. Resolver contra `docs/BITACORA.md` antes de citarlo. |
| `settings.json` + hooks | Copiados, verificados en banco y **corriendo en la máquina real** (2026-08-31): disparó 3 veces en sesión. ⛔ Las 3 fueron falsos positivos — tasa de ruido sin medir (deuda 22). |
| G-Centro | Ya nació multi-producto. Enumerar qué falta para que G-Nexo entre como tercer producto — **en su propio hilo**. |
| `settings.json` + hooks | Copiados y verificados en banco. ⛔ Falta correrlos en la máquina real. |
| Generador de RBAC | **Ya viajó** (2026-08-31). Existen `scripts/gen-rbac-sql.mjs` y `supabase/seed-system-roles.sql`; `pnpm gen:rbac:check` da **exit 0**. ⛔ Falta que ese check corra en **CI** (deuda 5) y ⛔ falta el **catálogo propio** (deuda 23): las 23 claves de `SYSTEM_ROLES` siguen siendo las de G-Vento (`cocina.*`, `mesas.*`, `delivery.*`). Viajó el mecanismo, no el contenido. Reconfirmar con `grep -oE "'[a-z_]+\.[a-z_]+'" src/lib/permissions.ts \| sort -u \| wc -l`. |
| Design system | ⛔ Pendiente. |
| Tripwire del catálogo (`tests/roles.spec.ts`) | ⛔ Pendiente. |
| Regla nueva sin número | ⛔ Numerarla en G-Vento primero. |
| Las 5 skills | ⛔ Pendientes. |
