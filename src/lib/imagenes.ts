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
