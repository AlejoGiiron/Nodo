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
-- ── 🔴 EDITADA EL 2026-09-04, DESPUES DE ESCRITA Y ANTES DE APLICARSE ──────
--    Esta migracion decia `#7c3aed`. Se cambio a `#7e3c9a` porque la PALETA
--    ENTERA se reemplazo el mismo dia (deudas 88 + 91) y `#7c3aed` ya no existe.
--    ⚠️ EDITARLA NO VIOLA R5, y se dice aca porque la fecha del nombre invita a
--    suponer lo contrario: R5 protege las migraciones APLICADAS, y esta NUNCA
--    SE EJECUTO — el token estaba rotado cuando se escribio. Si alguien ve en el
--    `git log` una migracion modificada, esta es la razon.
--
-- ── POR QUE VIOLETA, Y POR QUE ES EL PRIMERO DE LA LISTA ───────────────────
--    `#7e3c9a` (tono 282°) es el mas lejano de toda familia de §1.2 —62° de la
--    mas cercana—, asi que es a la vez el default de la base Y
--    `CATEGORY_COLORS[0]`, el color con el que nace toda categoria creada desde
--    la pantalla. Los dos caminos de alta escriben el mismo valor.
--
--    🔴 LA PALETA VIEJA ERA LA DE VENTO Y CHOCABA CON §1.2 EN 6 DE 8. Medido el
--    2026-09-04 contra `src/tokens.css`: `#64748b` era IDENTICO a `--ink-3`, y
--    cinco mas caian a 12° o menos de una familia (dos sobre success, uno sobre
--    warning, uno sobre action, uno sobre debt). Su primer elemento era
--    `#10b981` — el acento de otro producto Y verde, que §1.2 reserva a
--    confirmacion: toda categoria nueva nacia con el color equivocado en el rol
--    equivocado.
--
--    📐 Y POR QUE LOS OCHO NUEVOS ESTAN APAGADOS (44% de saturacion), que es lo
--    que hace defendible que dos compartan tono con una familia: §1.2 deja
--    libre solo el 47% del circulo de tonos, y en DOS tramos —63°-135°, que es
--    verde y se lee como confirmacion, y 225°-320°—. En 96 grados no entran
--    ocho tonos distinguibles, asi que EL TONO NO PUEDE SER EL EJE. La
--    saturacion si: los tokens plenos de §1.2 van de 71% a 95%.
--    Ver `src/lib/coloresDeCategoria.ts` para la medicion completa.
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
  alter column color set default '#7e3c9a';

comment on column public.categories.color is
  'Color de la etiqueta de la categoria, ELEGIDO POR EL CLIENTE. No es un '
  'estado (§1.2 del design system): no afirma nada sobre el dato. El default '
  'tiene que pertenecer a la paleta que ofrece el selector '
  '(src/lib/coloresDeCategoria.ts) — antes era #6366f1, que no estaba en ella, '
  'y dejo 164 categorias con un color que su propio formulario no podia '
  'producir (deuda 91).';

commit;
