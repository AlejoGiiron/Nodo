-- ============================================================================
-- Nodo — UNICIDAD DEL NOMBRE DE PRODUCTO Y DE CATEGORÍA, POR SEDE (deuda 90)
--
-- `upsertProduct` se llama upsert y NO había `unique (sede_id, name)`: sin
-- índice único, un `upsert` sin `id` es un INSERT PURO. Hoy lo tapa que
-- `ProductModal` siempre mande `id` (`product?.id ?? crypto.randomUUID()`), así
-- que la pantalla no produce el caso — pero el nombre de la función promete una
-- garantía que la tabla no sostenía, y el script de carga del catálogo tuvo que
-- poner la idempotencia por su cuenta.
--
-- ── FILAS CONTADAS ANTES DE TOCAR (R0), y con la normalización puesta ───────
--    Medido el 2026-09-04, paginando y cruzando contra el `count` exacto — la
--    primera sonda devolvió "1000 filas" y 1000 es el TOPE POR DEFECTO DE
--    PostgREST, no el catálogo.
--
--      LAB Principal   categories 684 (9 activas)     · colisiones 0
--                      products  1133 (32 activos)    · colisiones 0
--      Muscle Pro      categories    8 (8 activas)    · colisiones 0
--                      products     17 (17 activos)   · colisiones 0
--
--    ⚠️ El alcance de esa medición es lo que RLS deja ver: cada cuenta ve sólo
--       su sede, y son las dos que existen. No hace falta más — `create unique
--       index` sobre datos sucios FALLA AL APLICARSE y aborta la migración, así
--       que el riesgo de esta migración es fail-closed por construcción.
--
-- ── DECISIÓN 1 · NORMALIZADO, no el nombre crudo ────────────────────────────
--    `lower(btrim(regexp_replace(name, '\s+', ' ', 'g')))` atrapa mayúsculas,
--    espacios al borde y espacios internos colapsados. Es más red por el mismo
--    costo, y el espacio interno NO es hipotético: el archivo del cliente trae
--    `MASTENOM E X  AMPOLLAS` con dos espacios y `MASTENOM E X AMPOLLAS` con
--    uno. Un índice sobre el nombre crudo los deja pasar a los dos.
--
-- ── DECISIÓN 2 · PARCIAL, `where is_active` ─────────────────────────────────
--    `archiveProduct` NO borra: desactiva. Un índice total convertiría
--    "archivar" en "quemar el nombre para siempre", y eso es una decisión de
--    producto que nadie tomó — archivar es DEJAR DE OFRECER, no reservar.
--
--    🔴 LA CONSECUENCIA, que va dicha porque el índice la habilita: pueden
--       convivir dos filas con el mismo nombre, una activa y una archivada. Por
--       eso toda lectura por nombre tiene que decidir qué hace con eso.
--       `scripts/cargar-catalogo.mjs` no lo deja ambiguo: si encuentra un
--       ARCHIVADO con ese nombre, ABORTA y lo nombra, en vez de crear el gemelo.
--
-- ⛔ LO QUE ESTE ÍNDICE **NO** CIERRA — y se dice acá para que nadie cierre la
--    pregunta 1 del cliente citándolo:
--    los ocho pares del archivo de Muscle Pro NO son duplicados exactos ni
--    normalizables — `GALLETAOREO MUTANTES` vs `GALLETA OREO MUTANTES`,
--    `CREATINA ON` vs `CREATINA OPTIMUN NUTRITIO`. Esto cierra "el mismo string
--    dos veces"; no cierra "el mismo producto escrito distinto".
--
-- ⚠️ EL MENSAJE VA EN EL MISMO COMMIT, no después. `saveProduct` hacía
--    `toast.error('Error al guardar producto')` PLANO — sin pasar por
--    `mensajeDeError`, a diferencia de `saveCategory`. Un índice cuya violación
--    produce un error genérico empeora la pantalla: antes el error era genérico
--    sobre algo que el usuario no podía arreglar; después sería genérico sobre
--    algo que SÍ podría arreglar si supiera qué. Ver `src/lib/errores.ts`
--    (`esNombreDuplicado`) y `src/hooks/useProductMutations.ts`.
--    🔴 Ese mensaje dice "ya existe un producto ACTIVO con ese nombre", y esa
--       palabra depende del `where is_active` de acá abajo. Si algún día el
--       índice se vuelve total, el mensaje miente: son dos lados (R1).
-- ============================================================================

begin;

create unique index products_nombre_unico_por_sede
  on public.products (sede_id, lower(btrim(regexp_replace(name, '\s+', ' ', 'g'))))
  where is_active;

comment on index public.products_nombre_unico_por_sede is
  'Un producto ACTIVO por nombre normalizado y por sede. Normaliza mayusculas y '
  'espacios (incluidos los internos: el archivo del cliente trae nombres con '
  'doble espacio). Parcial a proposito: archivar NO reserva el nombre. '
  'No detecta duplicados escritos distinto (GALLETAOREO vs GALLETA OREO).';

create unique index categories_nombre_unico_por_sede
  on public.categories (sede_id, lower(btrim(regexp_replace(name, '\s+', ' ', 'g'))))
  where is_active;

comment on index public.categories_nombre_unico_por_sede is
  'Una categoria ACTIVA por nombre normalizado y por sede. Mismo criterio que '
  'products_nombre_unico_por_sede.';

commit;
