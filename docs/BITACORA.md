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

⛔ **Falta correrlo en la máquina real.** En G-Vento este script salió mudo la primera vez y
leyéndolo se veía perfecto. Verificación en banco no es verificación en el entorno (R4).

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
