/**
 * La regla de contraseña del producto, en UN solo lugar del frontend.
 *
 * 🔴 CONTRATO COMPARTIDO (R1) — HAY OTRO LADO Y NO SE PUEDE IMPORTAR.
 *    `supabase/functions/create-user/index.ts` corre en **Deno**, fuera de este
 *    bundle, y tiene su propia comprobación: `if (password.length < 8)`. No hay
 *    forma de que importe esta constante, así que **son dos lados y se declara**
 *    en vez de fingir que es uno. Al cambiar el mínimo, se tocan los dos en la
 *    misma pasada — y `password.test.ts` clava el valor para que el cambio no
 *    pase inadvertido.
 *
 * 🔴 Y POR QUÉ 8 Y NO 6, que es lo que exige la plataforma:
 *    Medido el 2026-09-07 contra el proyecto real — `auth.updateUser` con 5
 *    caracteres devuelve `weak_password` / *"Password should be at least 6
 *    characters."*, y con 6 la acepta. **Supabase no exige NINGUNA complejidad**:
 *    `1234567890` y `aaaaaaaaaa` pasan.
 *    Si el formulario dejara pasar 6, un usuario podría ponerse una clave que
 *    `create-user` no habría aceptado al darlo de alta: **la misma cuenta con
 *    dos reglas distintas según por dónde entró**. Se toma la más estricta de
 *    las dos, que además es la nuestra.
 */

/** Mínimo del producto. El de la plataforma es 6; éste es más estricto a propósito. */
export const PASSWORD_MIN = 8

/**
 * La regla, dicha como se le muestra a la persona.
 * ⚠️ El mensaje NOMBRA LA REGLA. Un «error al guardar» obliga a adivinar, y la
 * respuesta de la plataforma viene en inglés y con otro número (6), así que
 * mostrarla tal cual sería mostrar una regla que no es la nuestra.
 */
export const PASSWORD_REGLA = `Mínimo ${PASSWORD_MIN} caracteres.`

export type ErrorDePassword =
  | 'vacia'
  | 'corta'
  | 'igual-a-la-actual'
  | 'no-coincide'

/**
 * Valida la contraseña NUEVA contra la actual y su repetición.
 * Devuelve `null` si está bien, o el motivo. El texto de cada motivo lo pone
 * quien lo muestra: acá vive la REGLA, no la redacción de la pantalla.
 */
export function validarPasswordNueva(
  nueva: string,
  repetida: string,
  actual: string,
): ErrorDePassword | null {
  if (!nueva) return 'vacia'
  if (nueva.length < PASSWORD_MIN) return 'corta'
  // Cambiar la contraseña por la misma no es un cambio: la plataforma lo acepta
  // en silencio y la persona se queda creyendo que rotó algo. Es el caso que
  // más se parece a un éxito sin serlo.
  if (actual && nueva === actual) return 'igual-a-la-actual'
  if (nueva !== repetida) return 'no-coincide'
  return null
}

/** El texto que ve la persona para cada motivo. */
export const MENSAJE_DE_ERROR: Record<ErrorDePassword, string> = {
  'vacia': 'Escribe la contraseña nueva.',
  'corta': `La contraseña es muy corta. ${PASSWORD_REGLA}`,
  'igual-a-la-actual': 'La contraseña nueva es igual a la actual.',
  'no-coincide': 'Las dos contraseñas no coinciden.',
}
