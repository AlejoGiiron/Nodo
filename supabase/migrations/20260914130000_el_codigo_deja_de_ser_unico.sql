-- ============================================================================
-- DEUDA 41 · SE REVISA LA DECISION A: EL CODIGO DEJA DE SER UNICO POR SEDE
--
-- 🔴 ESTO REVIERTE UNA DECISION APROBADA, Y NO PORQUE NOS HAYAMOS EQUIVOCADO AL
--    DECIDIRLA: LA PREMISA ERA FALSA Y LOS DATOS NUEVOS DEL CLIENTE LA MIDIERON.
--
-- R0 — las cuatro preguntas:
--
--  1. CLASE · se RETIRA una restriccion. El `codigo` pasa de ser una CLAVE a ser
--     un ATRIBUTO DE AGRUPACION. Es el movimiento opuesto al de un allowlist, y
--     por eso lo que hay que decir es QUE SE CUELA.
--
--  2. PRECEDENTE · «no se quita un guard del camino normal para habilitar un
--     caso de borde» — y aca la medicion dice que es **al reves**: lo que el
--     guard estorbaba NO es un caso de borde, es la forma en que el cliente
--     numera su catalogo. Y «la deuda es una hipotesis fechada»: el alcance de
--     la decision A se escribio mirando 25 productos.
--
--  3. MODO DE FALLO · lo que se cuela es **dos productos activos con el mismo
--     codigo**, que es exactamente lo que el cliente quiere. Lo que se pierde es
--     «teclear un codigo devuelve uno solo», y eso ya no es cierto para el: sus
--     004-6 son cuatro galletas a proposito.
--
--  4. OBJETIVO · `drop index` por NOMBRE EXACTO. **No toca una sola fila** — un
--     indice no tiene filas propias. Los productos que pasan a poder compartir
--     codigo son los 8 que en su archivo comparten 3 codigos.
--
-- ----------------------------------------------------------------------------
-- LA MEDICION QUE LA REVIERTE (Control_Mp_3.xlsx, 2026-09-14)
--
--   004-6  x4   las cuatro galletas Mr Cream
--   006-5  x2   las dos cremas Mr Cream
--   001-7  x2   HALOTESTIN y TRENBONOM A
--
-- **3 codigos compartidos por 8 productos**, y no son errores de tipeo: son
-- lineas de producto. El cliente usa el codigo como **codigo de LINEA o de
-- PROVEEDOR**, no como identificador de producto.
--
-- 🔴 EL PROPOSITO ERA OTRO DEL QUE SUPUSIMOS, Y AHI ESTA LA PREMISA FALSA.
-- La decision A se justifico asi: *«si no es unico, teclear el codigo devuelve
-- dos y el cajero tiene que desambiguar»* — dicho como un costo. **La medicion
-- dice que desambiguar ES LO QUE EL QUIERE**: teclear `004-6` y ver las cuatro
-- galletas es la funcion, no el defecto.
--
-- ⚠️ Y el precedente que lo confirma, medido: la unica vez que inventamos un
-- codigo para satisfacer este indice —`001-10` en HALOTESTIN, porque su `001-7`
-- estaba duplicado— **el archivo siguiente del cliente le dio ese 001-10 a otro
-- producto** (SUSTANON FRASCO). Inventamos un dato para que su negocio cupiera
-- en nuestra restriccion, y su realidad lo contradijo en ocho dias.
--
-- ----------------------------------------------------------------------------
-- ⛔ POR QUE NO SE REPONE UN INDICE NO UNICO EN SU LUGAR
--
-- Seria lo prolijo si alguien buscara por codigo CONTRA LA BASE. No es el caso:
-- `POSPage.tsx:1870` y `ProductsPage.tsx:95` filtran **en memoria** sobre el
-- catalogo ya traido (`(p.codigo ?? '').toLowerCase().includes(q)`). Un indice
-- nuevo no tendria un solo lector — seria inventar una pieza para que la
-- migracion se vea completa.
--
-- 📋 DISPARADOR para reponerlo: el dia que la busqueda de catalogo se mueva al
-- servidor (`ilike` / `textSearch`), este indice hace falta **no unico**.
-- ============================================================================

drop index if exists public.products_codigo_unico_por_sede;

-- El comentario de la columna afirmaba la unicidad y ahora seria FALSO. Se
-- reemplaza: la migracion que lo escribio esta aplicada y no se edita (R5), asi
-- que el comentario vigente se vuelve a emitir aca.
comment on column public.products.codigo is
  'Codigo del producto, tal como lo numera el negocio. ATRIBUTO DE AGRUPACION, '
  'NO clave: desde el 2026-09-14 (revision de la deuda 41) NO es unico. El '
  'cliente lo usa como codigo de LINEA o de PROVEEDOR — sus cuatro galletas '
  'Mr Cream comparten 004-6 a proposito— asi que buscar un codigo puede '
  'devolver varios productos, y eso es la funcion. Texto libre: no se valida '
  'su forma. Se permite NULL (sin codigo es un estado valido).';
