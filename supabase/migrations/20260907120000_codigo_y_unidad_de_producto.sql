-- ============================================================================
-- Nodo — CÓDIGO Y UNIDAD DE VENTA DEL PRODUCTO (deuda 41)
--
-- Los dos huecos que `docs/reskin-esquema.md` enumeró el 2026-09-01 y que la
-- fila dibujada pedía sin que existiera columna. NO son adorno:
--   · `codigo` es el modo de búsqueda del mostrador — teclado primero.
--   · `unidad` es lo que el cajero necesita ver para saber qué está vendiendo.
--
-- ⚠️ ALCANCE DE ESTA MIGRACIÓN: las dos columnas y el índice. Las pantallas van
--    aparte, y esta tanda cubre **Mostrador y Catálogo** por decisión, no porque
--    la deuda fuera chica: el código se dibuja en CINCO pantallas (Mostrador,
--    Pedidos, Compras, Catálogo, Inventario) y la unidad en TRES.
--
-- ── LAS CUATRO PREGUNTAS DE R0 ──────────────────────────────────────────────
-- 1 · CLASE. Fail-closed sobre una unicidad: índice ÚNICO parcial. La base es
--     quien rechaza el duplicado, no una convención del cliente.
-- 2 · PRECEDENTE. `20260904120000_nombre_unico_por_sede.sql`, que hace
--     exactamente esto para `name`. Se copia su forma sin inventar nada:
--     normalizado, parcial, y con la misma razón para lo parcial.
-- 3 · MODO DE FALLO. Sin índice, dos productos comparten código y buscar por
--     código devuelve DOS — o sea el código deja de servir para lo único que
--     existe, y falla CALLADO: la pantalla muestra dos filas y nadie sabe
--     cuál es. Fail-closed.
-- 4 · OBJETIVO. Sólo `add column` + `create index`. NO hay DELETE, UPDATE ni
--     DROP, así que no hay filas que contar antes de tocarlas.
--
-- 🔴 Y ESTA MIGRACIÓN ES FAIL-CLOSED POR CONSTRUCCIÓN: las dos columnas nacen
--    VACÍAS, así que el índice se satisface trivialmente. El duplicado real del
--    archivo del cliente —`001-7` en HALOTESTIN y en TRENBONOM— se resuelve en
--    la CARGA (Halotestin va a `001-10`, verificado contra su maestro: la serie
--    001 llega a 9 sin huecos), y si alguien intentara reintroducirlo, es el
--    índice el que lo rechaza.
--
-- R5: archivo nuevo. Ninguna migración aplicada se edita.
-- ============================================================================
begin;

-- ── 1 · CÓDIGO ──────────────────────────────────────────────────────────────
-- NULLABLE a propósito: hay 42 productos cargados sin código y exigirlo los
-- dejaría fuera. El índice cubre sólo los no nulos, así que "sin código" sigue
-- siendo un estado válido y "con código repetido" no.
alter table public.products add column codigo text;

comment on column public.products.codigo is
  'Código con el que el negocio identifica el producto. Es el modo de busqueda '
  'del mostrador: se teclea antes que el nombre. NULLABLE: un producto sin '
  'codigo es valido; dos productos ACTIVOS de la misma sede con el mismo codigo '
  'no. La unicidad la sostiene products_codigo_unico_por_sede, no una '
  'convencion. No se valida su FORMA: el codigo lo define el negocio y el de '
  'Muscle Pro (001-1, 005-20) no tiene por que ser el de una ferreteria.';

-- 🔴 ÚNICO, NORMALIZADO Y PARCIAL — las tres decisiones son las de la deuda 90,
--    y se copian con su razón para que nadie las lea como arbitrarias:
--
--    · NORMALIZADO: `lower(btrim(...))` sobre espacios colapsados. Más red por
--      el mismo costo. El archivo del cliente ya demostró que los espacios
--      sobran o faltan al teclear.
--    · PARCIAL `where is_active`: archivar es dejar de OFRECER, no reservar el
--      código para siempre. Un índice total convertiría "archivar" en "quemar
--      el código", que es una decisión de producto que nadie tomó.
--    · PARCIAL `where codigo is not null`: sin esto, dos productos sin código
--      colisionarían entre sí — NULL no colisiona en un único de Postgres, pero
--      se declara igual porque el índice dice QUÉ garantiza y leerlo no debe
--      obligar a recordar la semántica de NULL.
create unique index products_codigo_unico_por_sede
  on public.products (sede_id, lower(btrim(regexp_replace(codigo, '\s+', ' ', 'g'))))
  where is_active and codigo is not null;

comment on index public.products_codigo_unico_por_sede is
  'Un codigo por producto ACTIVO y por sede, normalizado igual que el nombre. '
  'Parcial dos veces: archivar no reserva el codigo, y un producto sin codigo '
  'no colisiona con otro sin codigo. El archivo de Muscle Pro traia 001-7 '
  'repetido en HALOTESTIN y TRENBONOM: este indice es lo que hace imposible '
  'volver a meterlo.';

-- ── 2 · UNIDAD DE VENTA ─────────────────────────────────────────────────────
-- 🔴 TEXTO LIBRE, y la decisión sale del criterio del proyecto, no de la
--    comodidad. La pregunta que decide es si el DISPARADOR ya está cumplido:
--      · `subcategoria` fue DESPLEGABLE porque el reporte por subcategoría es
--        el propósito entero de la columna: nace existiendo.
--      · `purchase_unit` fue TEXTO LIBRE porque el reporte por presentación no
--        existía y lo que se cuela es una etiqueta.
--    `unidad` cae del lado de `purchase_unit`: **nada agrega ni agrupa por
--    ella**. Su propósito es que el cajero vea qué está vendiendo, y lo que se
--    cuela por el lado abierto es `Unidad` contra `unidad` — cosmético.
--
-- 🔴 SU DISPARADOR, y acá es más concreto que en `purchase_unit`: el día que la
--    unidad PARTICIPE DE UN CÁLCULO. Hoy Muscle Pro vende todo por unidad
--    —frascos, tarros, galletas—, pero el producto es horizontal y una
--    ferretería vende por metro y por kilo. Ahí la unidad deja de ser un rótulo
--    y pasa a ser un FACTOR, y el texto libre deja de alcanzar.
--    Ese día se normaliza; hasta ese día, cerrarla bloquea al cliente que traiga
--    una presentación que no anticipamos.
alter table public.products add column unidad text;

-- ⚠️ SIN DEFAULT, y es deliberado — mismo argumento que dejó `orders.canal` sin
--    default: un default convierte el olvido en un dato PLAUSIBLE Y FALSO.
--    `default 'unidad'` etiquetaría como "unidad" el producto de una ferretería
--    que se vende por metro, y nadie lo notaría. La confirmación la pone la
--    persona: el formulario PRESELECCIONA "unidad" y ella la ve antes de
--    guardar. Y los 42 de Muscle Pro reciben 'unidad' en la carga porque ÉL lo
--    confirmó, no porque lo supusiéramos.
comment on column public.products.unidad is
  'Unidad en la que se VENDE el producto (unidad, caja, kg, metro). Es una '
  'ETIQUETA para el mostrador, no un factor: hoy nada calcula ni agrupa con '
  'ella. Texto libre por eso mismo. SIN DEFAULT a proposito: un default '
  'etiquetaria como "unidad" lo que se vende por metro. NO confundir con '
  'purchase_invoice_items.purchase_unit, que es la unidad de COMPRA y si '
  'participa de un calculo (units_per_purchase_unit).';

commit;
