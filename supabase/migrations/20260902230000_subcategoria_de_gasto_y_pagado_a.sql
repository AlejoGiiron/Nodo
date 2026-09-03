-- ============================================================================
-- Subcategoria de gasto y "pagado a" — deuda 45
--
-- 🔴 TRES PREGUNTAS DISTINTAS SOBRE LA MISMA FILA, Y POR ESO TRES COLUMNAS:
--      categoria    -> que clase de MOVIMIENTO es  (compra · gasto · retiro · otro)
--      subcategoria -> que clase de GASTO es       (lista POR SEDE)
--      pagado_a     -> a QUIEN se le pago
--    Meter la subcategoria en `reason` seria deshacer una separacion que ya se
--    hizo una vez: `reason` cargaba clasificacion + detalle y se le agrego
--    `categoria` para partirlo (caso 1 de "un valor que significa dos cosas no
--    es un dato"). Volver a mezclarlas dejaria el reporte por tipo de gasto
--    imposible **ni reprocesando**.
--
-- ── POR QUE LA LISTA NO ESTA EN ESTE ARCHIVO ──────────────────────────────
-- 🔴 `categoria` SI es allowlist fija en el esquema, y la diferencia no es de
--    gusto: es **quien lee el reporte**. `categoria` es estructural y CRUZA
--    SEDES —si el cliente la inventara, los reportes entre sedes y entre meses
--    dejarian de ser comparables—. Una subcategoria de gasto **vive adentro de
--    una sede** y es del negocio: las de una ferreteria no son las de una
--    distribuidora. Clavar el vocabulario de un cliente en un CHECK choca de
--    frente con que el producto es horizontal.
--    Por eso la lista vive en `sedes.config.expense_subcategories`, con el mismo
--    mecanismo que `cash_out_reasons`, y el esquema **no la enumera**.
--
-- ⚠️ PERO SE ELIGE DE UN DESPLEGABLE, NUNCA SE TECLEA. "publicidad" y
--    "Publicidad" son dos filas en el reporte; el desplegable lo evita sin
--    tener que normalizar despues. Ver la nota del disparador mas abajo.
--
-- ── LAS CUATRO PREGUNTAS DE R0 ────────────────────────────────────────────
-- 1 · CLASE. Dos CHECK condicionados: se declara POSITIVAMENTE en que caso cada
--     columna puede tener valor.
-- 2 · PRECEDENTE. `chk_categoria_segun_tipo` y `chk_otro_exige_detalle` de la
--     migracion `caja` son el molde; `cash_out_reasons` es el de la lista por sede.
-- 3 · MODO DE FALLO. Si la subcategoria entrara en un `retiro` o una `compra`,
--     el reporte por subcategoria sumaria cosas que NO son gastos — el mismo
--     error que la deuda 63 arreglo un nivel mas arriba, y en silencio.
--     Fail-closed.
-- 4 · OBJETIVO. Positivo por columna; nada se enumera en negativo.
--
-- Filas contadas ANTES de tocar (2026-09-02): cash_movements 345. Las dos
-- columnas nacen NULL para todas, asi que ninguna puede violar los CHECK.
--
-- R5: archivo nuevo.
-- ============================================================================

begin;

alter table public.cash_movements
  add column subcategoria text,
  add column pagado_a     text;

-- ── 1 · LA SUBCATEGORIA SOLO EXISTE PARA UN GASTO ──────────────────────────
-- Un retiro del dueno y una compra a proveedor no tienen "clase de gasto".
-- Permitirla dejaria filas donde el eje del negocio no significa nada, y despues
-- no hay forma de saber si esa subcategoria era un dato o un descuido.
-- El `btrim <> ''` es la misma mitad que `chk_otro_exige_detalle`: una cadena
-- vacia es un valor que no dice nada y se cuela por debajo de un `is not null`.
alter table public.cash_movements
  add constraint chk_subcategoria_solo_en_gasto check (
    subcategoria is null
    or (categoria = 'gasto' and btrim(subcategoria) <> '')
  );

-- ── 2 · "PAGADO A" SOLO EN UN EGRESO ───────────────────────────────────────
-- En un ingreso la plata viene DE alguien, no va A alguien: un `pagado_a` ahi
-- diria lo contrario de lo que paso. Es una etiqueta que MIENTE, no una que
-- sobra, y por eso se cierra.
alter table public.cash_movements
  add constraint chk_pagado_a_solo_en_egreso check (
    pagado_a is null
    or (type = 'out'::movement_type and btrim(pagado_a) <> '')
  );

comment on column public.cash_movements.subcategoria is
  'Que clase de GASTO es. Eje del NEGOCIO, distinto del eje estructural que '
  'contesta `categoria`. La lista vive en sedes.config.expense_subcategories '
  '(por sede) y NO se enumera aca a proposito: categoria cruza sedes y tiene '
  'que ser comparable; una subcategoria vive dentro de una sede y es del '
  'negocio. Se elige de un desplegable y NUNCA se teclea: "publicidad" y '
  '"Publicidad" serian dos filas del reporte. '
  'NULLABLE a proposito: exigirla habria roto todo movimiento ya existente y '
  'todo alta que no la mande. DISPARADOR para volverla obligatoria, concreto: '
  'el dia que el reporte por subcategoria se use para decidir, un bucket "sin '
  'clasificar" grande lo vuelve inutil — ahi se exige, con la lista ya poblada.';

comment on column public.cash_movements.pagado_a is
  'A quien se le pago. TEXTO LIBRE porque es un nombre de persona o de negocio '
  'y no hay lista posible. ⚠️ Por eso mismo entra al censo de columnas de '
  'src/lib/sentry.test.ts como PROHIBIDA: es PII. Para una COMPRA el dato '
  'autoritativo es el proveedor de la factura, no esta columna.';

create index idx_cash_movements_subcategoria
  on public.cash_movements (sede_id, subcategoria)
  where subcategoria is not null;

-- ── 3 · LO QUE ESTE ARCHIVO NO HACE, DICHO ────────────────────────────────
-- · NO enumera las subcategorias. Ver arriba: es una decision, no un olvido.
-- · NO borra ni reescribe filas cuando una subcategoria se saca de la lista de
--   la sede. **Borrar de la lista es dejar de OFRECERLA, no reescribir el
--   pasado**: la fila vieja conserva su valor y la pantalla la muestra marcada
--   como retirada. Mismo principio que congela el costo al vender, que separa
--   la fecha del documento de la de registro, y que hace de una devolucion un
--   hecho nuevo en vez de la negacion de uno viejo.
-- · NO exige la subcategoria. Ver el disparador en el comment de la columna.

commit;
