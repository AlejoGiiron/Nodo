# Prompt 1 para Claude Code — Verificar entorno, copiar base y contar

> **⚠️ Antes de pegar esto: la carpeta `.claude/` tiene que existir en el directorio de trabajo
> ANTES de abrir la sesión de Claude Code.** Es el modo de fallo 4 documentado en el propio hook:
> si el watcher no ve `.claude/` al arrancar, el hook está bien escrito pero **no carga**, y trabajás
> sin red creyendo que la tenés. Si ya tenías la sesión abierta, cerrala y volvé a abrirla.

---

## El prompt

```
Contexto: estoy arrancando G-Nexo, un fork de G-Vento para distribuidoras y
mayoristas. Leé CLAUDE.md antes de hacer nada; las reglas R0–R10 aplican a todo
este trabajo y las voy a citar por número.

Este prompt cubre tres pasos del RUNBOOK (docs/RUNBOOK-arranque.md): verificar el
entorno, copiar la base de G-Vento y dejar el conteo previo. NO se poda nada acá.
No hay funcionalidad nueva, así que no corresponde spec de Playwright en este
prompt.


PASO 1 — Verificar el entorno. Si algo de esto falla, PARÁ y reportá; no sigas al
paso 2. Aplica R4: verificar contra la cosa real, no contra un proxy.

1.1 Confirmá que node existe y su versión: `command -v node && node --version`.

1.2 Verificá el hook:
    - `node --check .claude/hooks/sql-checklist.mjs`
    - grep de bytes de control: `grep -nP '[\x00-\x08\x0B\x0C\x0E-\x1F]' .claude/hooks/sql-checklist.mjs`
      (debe salir vacío)
    - confirmá que no hay `require(` fuera de comentarios

1.3 Probá que el hook DISPARA, con los cuatro casos por tubería. Esperado: los
    tres primeros devuelven más de 0 bytes, el cuarto exactamente 0.
    - Write sobre supabase/*.sql
    - Edit sobre supabase/*.sql
    - Bash con heredoc sobre supabase/*.sql
    - Bash sin SQL (debe callar)
    Este chequeo no es opcional: en G-Vento el mismo script salió MUDO la primera
    vez y leyéndolo se veía perfecto.

1.4 Validá .claude/settings.json: JSON parseable y con un matcher "Write|Edit|Bash"
    en hooks.PreToolUse.

1.5 Verificá que el CLI de Supabase NO dé 403 de management contra el proyecto de
    G-Nexo: `supabase gen types typescript --project-id <ID>` a un archivo
    temporal. Criterio: archivo no vacío y sin 403. Si da 403, PARÁ y reportá — es
    la deuda que en G-Vento dejó database.types.ts escrito a mano divergiendo del
    esquema sin que tsc lo notara.


PASO 2 — Copiar la base de G-Vento.

2.1 Clonar G-Vento rama develop, commit d848852, con --single-branch. NO hacer
    fork en GitHub: ataría los dos repos y cruzaría los PR.

2.2 Borrar .git del clon. Historia nueva, no la de G-Vento: el blame del código
    heredado apuntaría a decisiones sobre mesas y cocina que acá no aplican, y la
    historia contiene nombres y datos de clientes de G-Vento.

2.3 REEMPLAZAR (no fusionar) la documentación con la de G-Nexo que ya está en este
    directorio: CLAUDE.md, docs/BITACORA.md, docs/DEUDAS.md, docs/RUNBOOK-arranque.md,
    docs/brief-*.md, .claude/, .env.example.
    Los equivalentes de G-Vento se BORRAN. Su CLAUDE.md, su bitácora y sus deudas
    son estado ajeno y no viajan. Su docs/BITACORA.md tiene 1560 líneas: no lo
    mezcles con el nuestro.

2.4 Limpiar .env.local, node_modules y dist si vinieron.

2.5 Antes de commitear, `git status` y mostrame qué se va a incluir. No uses
    `git add -A` a ciegas. Esperá mi confirmación antes del primer commit y antes
    del push.


PASO 3 — Contar antes de tocar. R0 lo exige y es lo que permite verificar la poda
después.

Medí y reportá en una tabla:
  - archivos totales y líneas totales en src/, supabase/, tests/
  - archivos que mencionan shift / turno
  - archivos que mencionan kitchen / cocina
  - archivos que mencionan table / mesa
  - ocurrencias TOTALES de `restaurant_id` (no archivos: ocurrencias)
  - ocurrencias de `add_order_items_with_extras`

Criterio de sanidad: `restaurant_id` debería dar cerca de 1.010 ocurrencias en
unos 77 archivos, y el total del repo cerca de 39.351 líneas en 179 archivos. Si
alguno se aleja mucho, PARÁ: significa que el diagnóstico está desactualizado y
hay que entender por qué antes de seguir.

Escribí la tabla resultante en docs/BITACORA.md como entrada fechada, bajo la
sesión del fork. Es la línea base contra la que se verifica todo lo que sigue.


REGLAS DE SALIDA
- Cuando leas un resultado de comando, no lo leas desde una tubería ni desde una
  notificación de tarea en segundo plano (R9): escribí el exit code dentro del
  archivo de salida y grepealo.
- No afirmes que algo funciona si no lo mediste. Si no pudiste verificar algo,
  decilo como pendiente, no como hecho.
- Un commit por paso, en Conventional Commits.
```

---

## Cómo saber que salió bien

| Señal | Qué significa |
|---|---|
| Los 4 casos del hook dan >0, >0, >0, 0 | El hook no está mudo |
| `supabase gen types` produce archivo sin 403 | La deuda #2 se cierra |
| `restaurant_id` ≈ 1.010 ocurrencias | El diagnóstico sigue vigente |
| `docs/` tiene solo los archivos de G-Nexo | No se coló estado ajeno |
| La tabla quedó escrita en `BITACORA.md` | Hay línea base para verificar la poda |

Si `restaurant_id` da muy distinto de 1.010, **no sigas**. El diagnóstico se midió sobre 39.351
líneas en 179 archivos; si el repo cambió, la poda planeada puede estar apuntando a otro lado.

---

## Lo que NO va en este prompt

Podar. Renombrar. Tocar `extras`. Cada uno va en su propio prompt, después de que la línea base
esté escrita y confirmada.
