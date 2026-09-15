/**
 * ─────────────────────────────────────────────────────────────────────────────
 * LOS LÍMITES DE UNA IMAGEN QUE SE SUBE — un solo lugar para los VALORES.
 *
 * 🔴 POR QUÉ EXISTE (2026-09-15). `ImageUpload` validaba 2 MB y tres tipos antes
 *    de subir; el camino del LOGO de la sede —que es otro, escrito aparte en
 *    `ConfigPage`— **no validaba nada**. Así que un archivo de 5 MB llegaba al
 *    servidor y la clienta leía el error crudo de Storage, que no le dice qué
 *    hacer.
 *
 * ⚠️ Y HAY UN TERCER LADO, EL QUE NO SE PUEDE SALTEAR: el bucket. La migración
 *    `20260915180000` declara `file_size_limit` y `allowed_mime_types` con
 *    EXACTAMENTE estos valores. Los dos existen por razones distintas y ninguno
 *    reemplaza al otro:
 *
 *      · el del BUCKET   → es el límite de verdad; no se puede evitar
 *      · el del CLIENTE  → es el que da un mensaje que dice QUÉ HACER
 *
 *    Es R1 con un lado en SQL: al cambiar uno hay que mover el otro, y nada los
 *    sincroniza. Está anotado en la cabecera de esa migración también.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** 2 MB. Mismo valor que `file_size_limit` de los dos buckets. */
export const MAX_BYTES = 2 * 1024 * 1024

/** Mismos tres que `allowed_mime_types` de los dos buckets. */
export const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp']

const MB = (bytes: number) => (bytes / 1024 / 1024).toFixed(1).replace('.', ',')

/**
 * ¿Se puede subir este archivo? Devuelve **el mensaje del problema**, o `null`
 * si está bien.
 *
 * 🔴 DEVUELVE EL MENSAJE Y NO UN BOOLEANO, y ésa es la razón de que exista: un
 *    `false` obliga a que cada llamador invente el texto, y ahí es donde nacen
 *    los «Error al subir el logo» que no dicen nada. El mensaje nombra **el
 *    límite concreto y el valor del archivo**, para que se entienda sin abrir la
 *    documentación.
 *
 * ⚠️ NO usa estado de React a propósito: es una función pura, así que la puede
 *    llamar un handler, un hook o un test sin montar nada.
 */
export function validarImagen(file: File): string | null {
  if (!ACCEPTED.includes(file.type)) {
    return `El archivo tiene que ser JPG, PNG o WebP (éste es ${file.type || 'de tipo desconocido'})`
  }
  if (file.size > MAX_BYTES) {
    return `La imagen pesa ${MB(file.size)} MB y el máximo es ${MB(MAX_BYTES)} MB`
  }
  return null
}

/**
 * La URL de una imagen **con su versión**, para que el navegador y el CDN no
 * sigan sirviendo la anterior.
 *
 * 🔴 POR QUÉ HACE FALTA (deuda 111, medido el 2026-09-15): las tres rutas de
 *    Storage son FIJAS —`${sedeId}/logo.png`, `${sedeId}/nequi-qr.png`,
 *    `${sedeId}/${productId}.png`— y se suben con `upsert: true`. O sea que al
 *    reemplazar una imagen **la URL no cambia**, y medido contra la base:
 *
 *      cache-control: public, max-age=3600   ·   cf-cache-status: MISS → HIT
 *      tras borrar el archivo, la URL pública seguía devolviendo 200
 *      la misma URL con `?v=…` devolvía 400  → el origen ya no lo tenía: era CACHÉ
 *
 *    Síntoma que evita: «subí el logo nuevo y sigue el de antes».
 *
 * 🔴 LA VERSIÓN SE DERIVA, NO SE GUARDA — y es la decisión fina. Guardar un
 *    `?v=` dentro de `logo_url` haría que esa columna dejara de ser la URL
 *    canónica y pasara a ser «la URL de esta versión»: un valor con dos
 *    significados. Y peor: sería un SEGUNDO LADO que alguien tendría que
 *    acordarse de actualizar, así que **cualquier camino futuro que escriba la
 *    imagen sin tocar la cadena dejaría la URL vieja** — el mismo defecto que
 *    esto arregla, reintroducido por el arreglo.
 *
 *    `updated_at` **se mueve solo**: lo escribe `handle_updated_at()` en un
 *    trigger `before update`. No hay nada que recordar.
 *
 * ⚠️ Y EL DATO QUE HACE QUE ESTO FUNCIONE CON UNA RUTA FIJA, que hubo que
 *    medir: **Postgres dispara el trigger aunque el valor escrito sea
 *    IDÉNTICO**. Como la ruta no cambia, `updateSede({ logo_url })` guarda la
 *    misma cadena — y `updated_at` se mueve igual. Sin eso el `?v=` habría sido
 *    constante y **habría parecido resuelto sin estarlo**, que es peor que no
 *    hacerlo.
 *
 * 🔴 SE DERIVA EN UN SOLO LUGAR, ACÁ. Son SEIS sitios de render —el logo en el
 *    sidebar y en Configuración, el QR, y la foto en `ProductCard`,
 *    `ProductRow`— y calcular lo mismo en cada uno es R1 esperando: el día que
 *    alguien cambie el formato del parámetro, los que no toque quedan viejos.
 */
export function urlConVersion(
  url: string | null | undefined,
  version: string | null | undefined,
): string | null {
  if (!url) return null
  if (!version) return url
  const t = new Date(version).getTime()
  // Una fecha inválida devolvería `NaN`, y `?v=NaN` es una versión que nunca
  // cambia: sin dato de versión, mejor la URL cruda que una falsa.
  if (Number.isNaN(t)) return url
  return `${url}${url.includes('?') ? '&' : '?'}v=${t}`
}
