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
| 1 | **Correr el hook en la máquina real.** La verificación de los 10 casos es en banco, con Node v22, no en el entorno de trabajo. | En G-Vento el script salió mudo la primera vez y leyéndolo se veía perfecto. Un hook mudo es silencio, no error. |
| 2 | ~~Verificar que el CLI de Supabase no dé 403~~ **RESUELTO 2026-08-31: responde, sin 403.** `supabase` v2.90.0 contra el proyecto de G-Nexo, base vacía. | Queda el hábito, no la deuda: regenerar `database.types.ts` después de **cada** migración. En G-Vento ese 403 es lo que dejó los tipos escritos a mano, divergiendo del esquema sin que `tsc` lo notara (R1 punto 5). |
| 3 | ~~Decidir el nombre de la entidad sede~~ **RESUELTO 2026-08-31: `sede_id`.** Queda la ejecución: renombrar `restaurant_id`, **después de podar**, en un commit solo. | El repo ya usa "sede" en el permiso `sedes.gestionar` y en R6. Criterio de éxito: el conteo del término viejo llega a cero. Reversible con `git revert`. |
| 4 | **Confirmar el nombre del producto**: whois de `gnexo.co` / `.com` y marca en el SIC, clases 9 y 42. | Hay al menos tres empresas de software colombianas con la raíz "Nexo". Cambiarlo después toca todo. |
| 21 | **Renombrar la marca heredada** — `gvento`, `GVento`, `G-Vento` — en todo el repo. Se detectó por el `mkdtemp` `gvento-rbac-*` de `scripts/gen-rbac-sql.mjs`, pero es **defecto de clase, no instancia** (R3). ⛔ **Falta el conteo.** | Va en el **mismo paso 5** que el rename de `restaurant_id` (deuda 3), para no hacer dos pasadas sobre los mismos archivos. Sin conteo previo no hay criterio de éxito; con él, el criterio es el mismo: llega a cero. ⚠️ Excepción: las menciones a G-Vento en `docs/` son historia y atribución — **no se renombran**. |

### Contratos y verificación

| # | Deuda | Nota |
|---|---|---|
| 5 | **Los cuatro checks de árbol en CI.** `gen:rbac:check` (copiar de G-Vento) · `database.types.ts` regenerado vs commiteado · columnas de `sentry.test.ts` contra `information_schema` · el enum `subscription_status` en sus seis lados. | Un hook dispara cuando tocás un archivo; el fallo real de G-Vento fue un seed congelado **porque nadie lo tocó**. Los hooks no ven omisiones; el check de árbol sí. |
| 6 | **Tripwire del catálogo de permisos** — un `toBe(N)` en `tests/roles.spec.ts` que clave el tamaño. | Sin él, un cambio silencioso del catálogo no sale rojo. |
| 7 | ~~Copiar el generador de RBAC~~ **RESUELTO 2026-08-31: ya viajó en `d848852`.** Existen `scripts/gen-rbac-sql.mjs` y `supabase/seed-system-roles.sql`, y `node scripts/gen-rbac-sql.mjs --check` da exit 0. | `admin = ALL_PERMISSION_KEYS` derivado, no enumerado. No `SECURITY DEFINER`. Revoca a `authenticated`. Dos guards fail-closed. ⚠️ Lo que **no** cierra: que el check corra en CI — eso sigue siendo la deuda #5. Y el script arrastra dos defectos propios, #20 y #21. |
| 8 | **Los hooks son ahora un contrato en dos repos** sin nada que los sincronice. | Si arreglás el matcheo de permisos en un repo, no llega solo al otro. Está en el inventario de R1 como punto 9. |
| 20 | **Resolver el binario de `tsc` en `scripts/gen-rbac-sql.mjs`** en vez de armar la ruta `node_modules/typescript/bin/tsc` a mano — resolverlo y **fallar ruidoso** si no está. | Frágil con pnpm, que no aplana `node_modules`, y en CI. Es el **mismo patrón que el `jq` del hook** (R4): un camino que anda en una máquina, asumido universal. Si el check de árbol del punto 5 se apoya en este script, un `tsc` no encontrado convierte el check en silencio en vez de en rojo. |

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
