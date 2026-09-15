-- ════════════════════════════════════════════════════════════════════════════
-- LOS DOS BUCKETS DE STORAGE, CON AISLAMIENTO POR SEDE
--
-- ⛔ NO APLICADA TODAVÍA. Se escribe para revisar las decisiones ANTES del push.
--
-- 🔴 POR QUÉ EXISTE ESTE ARCHIVO, y el hallazgo es más grande que el bug: la
--    clienta reportó «error al subir el logo», y al enumerar apareció que
--    **ninguno de los dos buckets existe** — confirmado en la consola. No es una
--    regresión: es funcionalidad publicada sin su infraestructura, y **el error
--    descartado la escondió** (`if (error || !data) return null` tiraba el
--    StorageError antes de que nadie lo leyera).
--
--    Los dos buckets se crean ACÁ y no en la consola, porque crearlos a mano
--    sería repetir el defecto que los dejó sin existir: esquema que el repo no
--    describe.
--
-- ── R0 · LAS CUATRO PREGUNTAS ──────────────────────────────────────────────
--
-- 1 · CLASE — **allowlist + aislamiento multi-tenant**, en una capa donde este
--     proyecto nunca lo midió: Storage. Cada policy declara POSITIVAMENTE qué se
--     permite (este bucket, esta carpeta, este permiso) y no enumera lo prohibido.
--
-- 2 · PRECEDENTE — hay uno y **es el defecto, no el modelo**:
--     `supabase/_heredado/storage-product-images.sql` (no se aplica; es registro
--     de procedencia) dice `WITH CHECK (bucket_id = 'product-images')` **sin
--     acotar por carpeta** — o sea que cualquier usuario con sesión escribe en la
--     carpeta de otro tenant. Viene de Vento, que es mono-tenant, y su primera
--     línea dice «Ejecutar en Supabase Dashboard». Copiarlo habría traído el
--     agujero entero.
--     El precedente que SÍ se sigue es la auditoría A2: aislamiento por
--     organización/sede, medido, que nunca llegó a Storage.
--
-- 3 · MODO DE FALLO — si la policy queda ancha, **un tenant escribe y pisa los
--     archivos de otro** (`upsert: true`, así que sobrescribe sin avisar). Eso es
--     *borra datos ajenos* ⇒ **fail-closed**: sin sede resuelta, sin permiso, o
--     con la carpeta equivocada, se rechaza.
--
-- 4 · OBJETIVO — la carpeta se compara contra `get_my_sede_id()`, o sea **el UUID
--     de la sede del que sube**, nunca un nombre. Y el `null` se verifica PRIMERO:
--     `get_my_sede_id()` devuelve NULL para un usuario desactivado, y `x = NULL`
--     en una policy da NULL. En RLS eso falla CERRADO —que es lo correcto acá—
--     pero se escribe explícito igual, porque la intuición «NULL niega» es
--     verdadera en RLS y FALSA en plpgsql, y las dos conviven en este repo.
--
-- ⚠️ NO HAY `DELETE`/`UPDATE`/`DROP` sobre datos: este archivo sólo CREA. Las
--    filas existentes se midieron igual, y ver el bloque de abajo.
--
-- ── FILAS QUE APUNTEN A UN BUCKET INEXISTENTE: CERO (medido) ───────────────
--    En la organización LAB, sobre 1.407 productos y 2 sedes:
--      productos con `image_url` no nula …… 0
--      sedes con `logo_url` no nula ……………… 0
--      config con `nequi_qr_url` …………………… ninguna
--    Es consistente con el mecanismo: el ÚNICO escritor de esas columnas es la
--    UI, que siempre falló. Los dos cargadores escriben `image_url: null`
--    explícitamente.
--    ⚠️ LÍMITE DE ESTA MEDICIÓN: el login usado sólo ve su propia organización
--       (RLS). **El tenant de la clienta no se midió** — su credencial está
--       rotada. El razonamiento aplica igual, pero eso es razonamiento y esto es
--       una medición de LAB.
--
-- ── DECISIÓN 1 · PÚBLICOS DE LECTURA ───────────────────────────────────────
--    El código usa `getPublicUrl`, así que hoy ya asume público. Se confirma, y
--    **lo que se acepta se dice con todas las letras**:
--
--      · cualquiera con la URL ve el archivo, SIN sesión;
--      · la ruta es predecible (`/<bucket>/<sedeId>/logo.png`), así que conocer
--        el UUID de una sede alcanza para ver su logo;
--      · NO hay enumeración: sin el UUID no se puede listar nada.
--
--    Se acepta porque son **el logo de un negocio y fotos de su catálogo** — lo
--    que ese negocio le muestra a sus clientes—, y porque un bucket privado
--    obligaría a URLs firmadas con vencimiento en el sidebar, en Configuración y
--    en el ticket el día que lleve el logo. Un `<img>` que caduca es peor.
--
-- 🔴 EL DISPARADOR, escrito porque el lado permisivo obliga a escribirlo: **el
--    día que alguien suba a estos buckets algo que no sea material de vitrina**
--    —la foto de un documento, una lista de precios, un comprobante— público deja
--    de ser aceptable y hay que pasar a privado + URL firmada. La decisión de hoy
--    vale sobre *logo y foto de producto*, no sobre *«imágenes»*.
--
-- ── DECISIÓN 2 · ESCRITURA ACOTADA POR CARPETA **Y** POR PERMISO ───────────
--    Dos condiciones, y ninguna alcanza sola:
--      · la carpeta = la sede del que sube (aislamiento entre tenants);
--      · el permiso que gatea la pantalla desde donde se sube.
--
--    ⚠️ Los permisos NO SE INVENTARON. Se midió cuál gatea cada pantalla:
--        /configuracion → `config.acceder`     (logo de sede y QR de Nequi)
--        /productos     → `productos.editar`   (fotos de producto)
--       Son dos claves DISTINTAS y las dos YA EXISTEN en el catálogo de 21. Subir
--       el logo de la sede no es lo mismo que subir la foto de un producto, y el
--       modelo ya lo distinguía.
--
-- ── DECISIÓN 3 · LOS LÍMITES VAN EN EL BUCKET, NO SÓLO EN EL CLIENTE ───────
--    2 MB y `jpeg/png/webp`, que son **exactamente** los que `ImageUpload` ya
--    valida en el cliente (`MAX_BYTES`, `ACCEPTED`). No son números nuevos.
--    La validación del cliente existe para dar un mensaje útil ANTES de subir;
--    la del bucket es la que no se puede saltear — y hoy el camino del logo no
--    valida NADA, así que sin esta línea un archivo de 8 MB llega al servidor.
--    ⚠️ Es R1: los dos lados tienen los mismos valores y nada los sincroniza. Va
--       anotado en el `comment` de abajo para que quien cambie uno busque el otro.
-- ════════════════════════════════════════════════════════════════════════════

begin;

-- ── LOS BUCKETS ────────────────────────────────────────────────────────────
-- `on conflict do nothing`: si alguien los creó a mano mientras tanto, esta
-- migración no los pisa — pero las policies de abajo sí quedan, que es lo que
-- de verdad falta.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('sede-logos',     'sede-logos',     true, 2097152, array['image/jpeg', 'image/png', 'image/webp']),
  ('product-images', 'product-images', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- ── LECTURA: pública, y sólo lectura ───────────────────────────────────────
create policy "sede-logos: lectura publica"
on storage.objects for select
using (bucket_id = 'sede-logos');

create policy "product-images: lectura publica"
on storage.objects for select
using (bucket_id = 'product-images');

-- ── ESCRITURA: la propia sede, con el permiso de la pantalla ───────────────
--
-- 🔴 La condición del NULL va PRIMERA y explícita. `get_my_sede_id()` filtra
--    `is_active`, así que devuelve NULL para un usuario desactivado — y ése es
--    exactamente el caso que un guard existe para frenar.
create policy "sede-logos: escribe la propia sede"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'sede-logos'
  and public.get_my_sede_id() is not null
  and (storage.foldername(name))[1] = public.get_my_sede_id()::text
  and public.has_permission('config.acceder')
);

create policy "sede-logos: actualiza la propia sede"
on storage.objects for update to authenticated
using (
  bucket_id = 'sede-logos'
  and public.get_my_sede_id() is not null
  and (storage.foldername(name))[1] = public.get_my_sede_id()::text
  and public.has_permission('config.acceder')
)
with check (
  bucket_id = 'sede-logos'
  and public.get_my_sede_id() is not null
  and (storage.foldername(name))[1] = public.get_my_sede_id()::text
  and public.has_permission('config.acceder')
);

create policy "sede-logos: borra la propia sede"
on storage.objects for delete to authenticated
using (
  bucket_id = 'sede-logos'
  and public.get_my_sede_id() is not null
  and (storage.foldername(name))[1] = public.get_my_sede_id()::text
  and public.has_permission('config.acceder')
);

create policy "product-images: escribe la propia sede"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'product-images'
  and public.get_my_sede_id() is not null
  and (storage.foldername(name))[1] = public.get_my_sede_id()::text
  and public.has_permission('productos.editar')
);

create policy "product-images: actualiza la propia sede"
on storage.objects for update to authenticated
using (
  bucket_id = 'product-images'
  and public.get_my_sede_id() is not null
  and (storage.foldername(name))[1] = public.get_my_sede_id()::text
  and public.has_permission('productos.editar')
)
with check (
  bucket_id = 'product-images'
  and public.get_my_sede_id() is not null
  and (storage.foldername(name))[1] = public.get_my_sede_id()::text
  and public.has_permission('productos.editar')
);

create policy "product-images: borra la propia sede"
on storage.objects for delete to authenticated
using (
  bucket_id = 'product-images'
  and public.get_my_sede_id() is not null
  and (storage.foldername(name))[1] = public.get_my_sede_id()::text
  and public.has_permission('productos.editar')
);

-- ── ASERCIONES: si algo de esto no quedó, se revierte ──────────────────────
--
-- 🔴 EL CONTEO CORRE ADENTRO DE LA TRANSACCIÓN Y PUEDE ABORTARLA. Medirlo
--    después y citarlo en un registro se lee igual y no protege: entre la
--    medición y la escritura hay un hueco donde nadie vuelve a mirar.
do $$
declare
  v_buckets int;
  v_policies int;
begin
  select count(*) into v_buckets
    from storage.buckets where id in ('sede-logos', 'product-images');
  if v_buckets <> 2 then
    raise exception 'Esperaba los 2 buckets y hay %', v_buckets;
  end if;

  select count(*) into v_policies
    from pg_policies
   where schemaname = 'storage' and tablename = 'objects'
     and (policyname like 'sede-logos:%' or policyname like 'product-images:%');
  if v_policies < 8 then
    raise exception 'Esperaba al menos 8 policies nuestras y hay %', v_policies;
  end if;
end $$;

-- ⚠️ ACÁ IBA UN `comment on table storage.buckets`, y SE QUITÓ: esa tabla la
--    posee `supabase_storage_admin`, no nosotros, y `comment` exige ser dueño.
--    Habría abortado la migración entera por una nota. La nota de R1 —que el
--    límite de 2 MB y los tres MIME viven TAMBIÉN en `ImageUpload.tsx` y nada
--    los sincroniza— queda en la cabecera de este archivo, que es donde se lee.

commit;
