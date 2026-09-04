-- ============================================================================
-- Nodo — EL DEFAULT DE `categories.color` ENTRA A SU PROPIA PALETA (deuda 91)
--
-- `categories.color` tenia `default '#6366f1'`, y ese valor **no esta entre los
-- ocho que ofrece el selector** (`src/lib/coloresDeCategoria.ts`). O sea que
-- toda categoria insertada sin color nacia con un color que su propio
-- formulario no puede producir.
--
-- 📋 MEDIDO EL 2026-09-04, paginando y cruzando contra el `count` exacto:
--      LAB Principal · 684 categorias · 170 fuera de la paleta
--      de esas 170, **164 son exactamente `#6366f1`** — el default de acá.
--      Muscle Pro    ·   8 categorias ·   0 fuera de la paleta
--    O sea que la mayoria del problema no la eligio nadie: la escribio esta
--    linea.
--
-- ── POR QUE VIOLETA, Y NO EL PRIMERO DE LA LISTA ───────────────────────────
--    `#7c3aed` es el unico de los ocho que no cae cerca de ninguna familia de
--    §1.2: accion es azul, deuda y error son rojos, advertencia es ambar,
--    confirmacion es verde, y los neutros son slate. Un color de categoria NO
--    es un estado, asi que el default correcto es el que menos puede leerse
--    como uno.
--    ⚠️ `#10b981` —el primero de la lista, y el que toma toda categoria nueva
--    creada desde la pantalla— NO se usa acá a proposito: es el acento de otro
--    producto (deuda 88) y ademas es verde, que §1.2 reserva a confirmacion.
--    Cambiar ESE es una decision de producto y no entra en esta migracion.
--
-- ── FILAS TOCADAS: CERO, Y ES DELIBERADO (R0) ──────────────────────────────
--    `alter column ... set default` NO reescribe ninguna fila existente. Las
--    164 categorias con `#6366f1` **se quedan como estan**.
--    🔴 Y no es una limitacion: es el criterio del proyecto. Un backfill
--    reescribiria una eleccion —aunque nadie la haya hecho— y borraria la
--    evidencia de cuantas nacieron asi. Lo que se hizo en su lugar es que la
--    pantalla las pueda REPRESENTAR: `CategoryModal` muestra el color guardado
--    como una muestra mas cuando no esta en la paleta, asi que ahora son
--    editables y reversibles. El pasado se explica, no se ajusta.
--
-- ⚠️ EL LADO DE TYPESCRIPT: `COLOR_POR_DEFECTO_EN_LA_BASE` en
--    `src/lib/coloresDeCategoria.ts` repite este literal, porque Postgres no
--    puede leer TypeScript. Lo que si hay es un tripwire —
--    `src/lib/coloresDeCategoria.test.ts` — que falla si ese valor deja de
--    pertenecer a la paleta. No sincroniza los dos lados; grita cuando el lado
--    de TS se rompe, que es el defecto que esta migracion viene a cerrar.
-- ============================================================================

begin;

alter table public.categories
  alter column color set default '#7c3aed';

comment on column public.categories.color is
  'Color de la etiqueta de la categoria, ELEGIDO POR EL CLIENTE. No es un '
  'estado (§1.2 del design system): no afirma nada sobre el dato. El default '
  'tiene que pertenecer a la paleta que ofrece el selector '
  '(src/lib/coloresDeCategoria.ts) — antes era #6366f1, que no estaba en ella, '
  'y dejo 164 categorias con un color que su propio formulario no podia '
  'producir (deuda 91).';

commit;
