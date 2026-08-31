# G-Nexo — Runbook de arranque

*2026-08-31. Orden de ejecución. Cada paso dice cómo saber que salió bien.*

> **Cambio de estrategia respecto del documento de traspaso.** El plan original era copiar el 21,7%
> (base técnica) y construir el resto. Eso tenía sentido con 14.000 líneas. Con el cliente firmado
> te llevás también la zona gris —productos, inventario, clientes, fiado, compras, reportes—, que
> es casi todo. Reconstruir el 43,3% a mano es más trabajo y más riesgo que copiar el repo entero
> y podar lo de bar. **El orden se invierte: copiar completo → podar → renombrar → adaptar.**

---

## Paso 0 · Dos decisiones que bloquean todo — ✅ RESUELTAS el 2026-08-31

**0.1 · Método de costeo → promedio ponderado móvil.** El cliente describe un solo costo por
producto ("a esto me sale, a esto lo vendo"), lo que descarta PEPS y lotes. Frente a *último
costo*, el promedio evita que una compra cara desplome la utilidad en el papel y sobrevalúe el
inventario. El cliente nunca ve el término.

🔴 **Y la consecuencia que importa más que el método:** el costo unitario **se graba en la línea de
venta al momento de vender**, no se recalcula después leyendo el costo actual del producto. Si se
recalculara, cada compra nueva cambiaría las utilidades de meses pasados y el reporte daría
distinto cada vez que se abre — perfil exacto del fallo silencioso de R7. Ver R1 punto 8.

**0.2 · Nombre de la entidad sede → `sede_id`.** El repo heredado ya usa la palabra: el permiso
`sedes.gestionar` existe en el catálogo y R6 dice *"la organización de una sede es la misma la mire
quien la mire"*. Renombrar no inventa vocabulario, alinea la columna con lo que el proyecto ya
dice. En G-Vento "restaurant" es cierto; acá sería falso, y un nombre falso dirige mal.

⚠️ Con la estrategia de copiar el repo completo el rename **no es gratis**: son 1.010 ocurrencias
en 77 archivos. Se ejecuta en el **paso 5.1**, después de podar, en un commit solo. Criterio de
éxito: el conteo del término viejo llega a **cero**.

---

## Paso 1 · Verificar el entorno, antes de copiar nada

Esto va primero a propósito: si algo falla acá, querés saberlo con cero migraciones encima, no con
veinte.

**1.1 · Node y el hook.**
```bash
command -v node && node --version
node --check .claude/hooks/sql-checklist.mjs
grep -nP '[\x00-\x08\x0B\x0C\x0E-\x1F]' .claude/hooks/sql-checklist.mjs   # debe salir vacío
```

**1.2 · El hook dispara de verdad.** Los cuatro casos, en la máquina real:
```bash
printf '%s' '{"tool_input":{"file_path":"supabase/x.sql","content":"select 1;"}}' | node .claude/hooks/sql-checklist.mjs | wc -c
printf '%s' '{"tool_input":{"file_path":"supabase/x.sql","new_string":"delete from x;"}}' | node .claude/hooks/sql-checklist.mjs | wc -c
printf '%s' '{"tool_input":{"command":"cat > supabase/s.sql <<EOF\nselect 1;\nEOF"}}'      | node .claude/hooks/sql-checklist.mjs | wc -c
printf '%s' '{"tool_input":{"command":"pnpm test:e2e"}}'                                    | node .claude/hooks/sql-checklist.mjs | wc -c
```
**Criterio:** los tres primeros > 0 bytes, el cuarto = 0. En G-Vento el script salió mudo la
primera vez y leyéndolo se veía perfecto.

**1.3 · Settings válido.**
```bash
node -e 'const s=JSON.parse(require("fs").readFileSync(".claude/settings.json","utf8"));
if(!s?.hooks?.PreToolUse?.some(x=>x.matcher==="Write|Edit|Bash")){console.error("FALLO");process.exit(4)}
console.log("OK")'
```

**1.4 · El CLI de Supabase no da 403.**
```bash
supabase gen types typescript --project-id <id-de-gnexo> > /tmp/types-prueba.ts
```
**Criterio:** archivo no vacío y sin 403. Si da 403, resolvelo **ahora**. En G-Vento ese 403 es lo
que dejó `database.types.ts` escrito a mano y divergiendo del esquema sin que `tsc` lo notara.

---

## Paso 2 · Copiar el repo

**No hagas fork en GitHub.** Un fork ata los dos repos y hace que los PR se crucen. Historia
nueva:

```bash
git clone --branch develop --single-branch <url-gvento> gnexo
cd gnexo
rm -rf .git
```

Ahora **reemplazá** —no fusiones— con la carpeta que ya tenés armada:
`CLAUDE.md`, `docs/BITACORA.md`, `docs/DEUDAS.md`, `docs/brief-*.md`, `.claude/`, `.env.example`.
Borrá los de G-Vento. Su `CLAUDE.md`, su bitácora y sus deudas **no viajan**: son estado ajeno.

```bash
rm -rf .env.local node_modules dist
git init && git add -A
git commit -m "chore: base copiada de G-Vento develop d848852"
git remote add origin <url-gnexo> && git push -u origin develop
```

**Por qué historia nueva y no la de G-Vento:** el `git blame` del código heredado apuntaría a
decisiones sobre mesas y cocina que acá no aplican, y los mensajes de commit hablan de un negocio
que no es este. Además la historia contiene nombres y datos de clientes de G-Vento.

---

## Paso 3 · Contar antes de tocar

R0 lo exige y acá es lo que te permite verificar la poda después. Guardá la salida en
`docs/BITACORA.md`:

```bash
find src supabase tests -type f | wc -l
find src supabase tests -type f -exec cat {} + | wc -l
grep -ril 'shift'      src supabase | wc -l
grep -ril 'kitchen'    src supabase | wc -l
grep -ril 'table\|mesa' src | wc -l
grep -rc 'restaurant_id' -r src supabase tests | awk -F: '{s+=$2} END {print s}'
```

**Criterio:** el conteo de `restaurant_id` debería dar cerca de 1.010. Si da muy distinto, el
diagnóstico está desactualizado y hay que mirar por qué **antes** de seguir.

---

## Paso 4 · Podar, en orden, un commit por módulo

**4.1 · Cocina.** Ya tiene interruptor (`uses_kitchen`, `routes_to_kitchen`). Es la más limpia.

**4.2 · Mesas.** El POS ya está desacoplado (`DEFAULT_ORDER_TYPE='takeaway'`).

**4.3 · Turnos.** 🔴 **Acá está el peligro.** Sacar turnos **no toca el cobro** —`payments` no
tiene `shift_id`— pero **sí toca la cartera**: `debt_payments.cash_movement_id` es FK real a
`cash_movements`, y `register_debt_payment` busca el turno abierto.

No es un borrado: es una **migración**. El abono a cartera tiene que poder escribir su
`cash_movement` sin turno. Hacelo en migración nueva (R5, nunca editar una aplicada), con
`begin`/`commit` y contando filas antes.

**Verificación de cada poda:** la suite E2E en verde, y leída bien — **no desde una tubería**
(R9). Escribí el exit code dentro del archivo de salida y grepealo.

---

## Paso 5 · Renombrar, en dos pasadas separadas

Después de podar, porque hay menos ocurrencias que tocar.

**5.1 · `restaurant_id` → `sede_id`.** Una pasada mecánica, un commit solo. Contá antes y después:
el número final tiene que ser cero para el término viejo. Incluye SQL, tipos, tests y strings.

**5.2 · `extras`.** 🔴 `add_order_items_with_extras` es el **único camino de alta de ítems del
repo**. Borrarlo rompe vender. **Se renombra, no se borra** — a algo neutro como
`add_order_items`. Va al final y solo.

---

## Paso 6 · Adaptar la zona gris

Acá termina lo mecánico. Estos cambios necesitan diseño, no find/replace:

1. **Descuento de stock: de receta a directo.** G-Vento descuenta ingredientes por receta. Una
   distribuidora vende la misma unidad que compró.
2. **Conversión unidad de compra → unidad de venta.** Se compra un bulto, se venden 50 unidades. No
   existe en un POS de bar.
3. **Costo por producto**, recalculado en cada compra según el método del paso 0.1.

Un prompt por punto, cada uno con su spec E2E antes de darse por completo.

---

## Paso 7 · Los módulos nuevos

En este orden, porque cada uno depende del anterior: **Compras → Inventario → Gastos →
Utilidades**. Utilidades va última porque no tiene de dónde sacar el dato hasta que existan
compras.

---

## Cómo escribir cada prompt para Claude Code

Tu modelo de trabajo es hilo → prompt → Claude Code. Que cada prompt tenga:

- **El paso y solo ese paso.** Un módulo por prompt, un commit por prompt.
- **La regla que aplica, por número.** "Esto toca dinero, aplicá R7 de idempotencia" — no repitas
  la regla, citala. Repetirla viola R1.
- **El conteo previo,** cuando el paso borra o renombra. "Hay N ocurrencias, al terminar deben ser
  cero."
- **El cierre obligatorio:** *"crea/actualiza el spec de Playwright que cubra esta
  funcionalidad"*. Es política de testing, no una sugerencia.
- **Cómo verificar,** explícito. Nunca "verificá que funcione": decí qué comando y qué número
  esperás.

---

## En paralelo, sin bloquear

- Confirmar el costeo a Claude Design y cerrar la Entrega 1.
- Las tres correcciones pendientes del diseño: cupo proyectado con la venta en curso, si quedó
  monoespaciada, y que el mostrador no tenga scroll horizontal.
- Capturar la Entrega 1 como skill `g-nexo-design-system`.
- Los cuatro checks de árbol en CI (deuda 5). El de `database.types.ts` es el más urgente.
