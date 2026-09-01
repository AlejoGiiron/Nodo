# Prompt 2 para Claude Code — Inventario y clasificación del SQL heredado

> **Este prompt no escribe SQL.** Produce el inventario y el plan. La consolidación va en el
> prompt 3, después de que revises la clasificación. Motivo: el diagnóstico de Vento midió que el
> peligro no está en el 24,6% que se borra sino en el **43,3% de zona gris** que parece viajar y
> necesita cambios. Consolidar sin clasificar primero es entrar ciego justo ahí.
>
> El hook va a disparar en este prompt si algún comando menciona `supabase/*.sql`. Es esperado.

---

## El prompt

```
Leé CLAUDE.md antes de empezar. Este trabajo NO escribe ni modifica ningún .sql:
produce un documento de inventario y plan. No corresponde spec de Playwright.

DECISIÓN TOMADA QUE ENMARCA TODO ESTO (registrala en el documento que produzcas):

Se eligió consolidar los .sql heredados en un esquema base limpio ANTES de
aplicar nada, en vez de aplicar el esquema de Vento y después borrar mesas,
cocina y turnos con migraciones.

Esto NO viola R5. R5 dice que una migración APLICADA es inmutable. Los .sql
heredados no están aplicados en Nodo: la base del proyecto de Supabase está
VACÍA (verificado el 2026-08-31: cero tablas en la salida de gen types). Son
archivos, no migraciones ejecutadas. Dejá esta justificación escrita, porque sin
ella, en seis meses alguien va a ver SQL heredado editado y va a concluir que se
rompió la regla.

Motivo de la elección: con la otra opción, la historia de Nodo quedaría con
"creo mesas / borro mesas" para siempre, en un producto que nunca tuvo mesas. Y
el catálogo de permisos de Nodo es distinto del de Vento, así que aplicar
primero obligaría a una reconciliación por unión que con esta opción no existe.


TAREA — Producir docs/plan-esquema-base.md con cuatro secciones.


SECCIÓN 1 — Inventario de supabase/

Listá TODOS los archivos de supabase/ (incluidas subcarpetas y functions/) con:
  - ruta
  - líneas
  - qué crea o modifica: tablas, funciones, políticas RLS, triggers, tipos/enums
  - si es un seed

No resumas ni agrupes: uno por uno. Este inventario es la línea base contra la
que se verifica la consolidación después.


SECCIÓN 2 — Clasificación

Clasificá cada archivo de la sección 1 en una de estas cuatro, con una frase de
justificación. Si un archivo cae en más de una, decilo explícitamente y desglosá
qué parte va a cuál: eso es zona gris y es lo más importante del documento.

  A. BASE TÉCNICA — viaja tal cual. Multi-tenant, RLS, RBAC, auth, patrones de
     RPC. (En el diagnóstico de Vento: 21,7%)
  B. DOMINIO DE BAR — se borra. Mesas, cocina, turnos. (24,6%)
  C. ZONA GRIS — sirve pero necesita cambios: productos, inventario, clientes,
     fiado, compras, reportes. (43,3%)
  D. SEED — se reescribe. (9,5%)

Al final de la sección, la distribución real en líneas y en porcentaje, comparada
con esos cuatro porcentajes del diagnóstico. Si tu medición se aleja mucho de
alguno, decilo: significa que el fork trae algo que el diagnóstico no vio.


SECCIÓN 3 — Grafo de dependencias de lo que se borra

Para cada cosa clasificada como B, qué la referencia: claves foráneas, funciones
que la consultan, políticas RLS que la nombran, triggers, vistas.

Prestá atención especial a estos tres, que el diagnóstico ya midió:

  - payments NO tiene shift_id. La pertenencia al turno es temporal, y el
    acoplamiento son dos `if (!isShiftOpen)` de UI.
  - PERO debt_payments.cash_movement_id ES una FK real a cash_movements, y
    register_debt_payment busca el turno abierto. Fiado es el único módulo con
    dependencia ESTRUCTURAL al turno, y es justo el que sobrevive como cartera.
    Necesita que el abono pueda escribir su cash_movement sin turno.
  - add_order_items_with_extras es el ÚNICO camino de alta de ítems del repo, y
    donde se descuenta stock por receta. NO se borra: se renombra. Confirmá que
    sigue siendo el único camino, no lo des por cierto porque lo diga el
    diagnóstico (R4).

Verificá cada dependencia contra el SQL real, no contra lo que dice esta lista.
Si encontrás una que no está acá, es un hallazgo y va marcado como tal.


SECCIÓN 4 — Plan de consolidación

El orden propuesto de archivos del esquema base, qué entra en cada uno y qué se
descarta. Sin escribir el SQL todavía.

Dos cosas que el plan tiene que resolver explícitamente:

  1. Qué pasa con los archivos que en Vento son registro histórico de
     migraciones ya aplicadas (por ejemplo multi-tenant-rbac.sql, cuyo
     comentario-catálogo está desactualizado a propósito). En Nodo no son
     historia de nada: decidí si su contenido entra al esquema base o se
     descarta, y justificalo.
  2. El catálogo de permisos NO se escribe a mano en ningún .sql. Es generado:
     fuente SYSTEM_ROLES en src/lib/permissions.ts, salida
     supabase/seed-system-roles.sql vía `pnpm gen:rbac`, verificado por
     `pnpm gen:rbac:check` (exit 0 confirmado el 2026-08-31). El plan tiene que
     decir qué permisos de bar salen (mesas.*, cocina.*) y cuáles entran
     (compras.*, inventario.*, gastos.*, utilidades.*) — pero editando
     permissions.ts y regenerando, nunca el .sql.


REGLAS DE SALIDA
- Contá y medí; no estimes. Si algo no lo pudiste verificar, va como pendiente,
  no como hecho (R4 y la convención de notas de CLAUDE.md).
- Citá el símbolo, no el número de línea, salvo en archivos que sean registro
  histórico.
- No modifiques ningún .sql en este prompt. Solo se crea
  docs/plan-esquema-base.md.
- Un commit, Conventional Commits.
```

---

## Qué revisar cuando devuelva

| Señal | Qué significa |
|---|---|
| La distribución se parece a 21,7 / 24,6 / 43,3 / 9,5 | El diagnóstico sigue describiendo el repo |
| La zona gris tiene desglose por partes, no archivos enteros | Se clasificó de verdad, no por nombre de archivo |
| La sección 3 confirma o refuta lo de `debt_payments` | Es la única dependencia estructural conocida |
| Aparece alguna dependencia **no** listada en el prompt | Hallazgo real, y el más valioso del ejercicio |

Si la sección 3 no encuentra nada más allá de lo que ya le dijimos, sospechá: puede que haya
verificado contra la lista en vez de contra el SQL. Es R4 aplicada al propio informe.
