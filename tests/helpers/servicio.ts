import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * LA PUERTA DE SERVICE ROLE DEL ARNÉS — y por qué es una puerta con lista.
 *
 * 🔴 EL ARNÉS OPERA CON ANON KEY Y SESIÓN DE USUARIO, A PROPÓSITO. Eso es lo
 *    que hace que la suite **ejercite las policies de verdad**: cada escritura
 *    pasa por RLS, igual que la del cliente. Es lo mismo que decidió que el
 *    script de carga del catálogo iniciara sesión en vez de usar service_role —
 *    con service_role la policy `sede_id = get_my_sede_id() and
 *    has_permission(...)` **ni se evalúa**.
 *
 * ⚠️ POR ESO `E2E_SERVICE_ROLE_KEY` NO PUEDE QUEDAR DISPONIBLE PARA TODOS. No
 *    falla ruidosamente: el próximo caso que necesite un atajo la usa, el caso
 *    pasa, y **dejamos de medir RLS sin que nada avise**. Es la misma forma que
 *    el fixture que insertaba un perfil suelto y se auto-salteaba: el atajo se
 *    ve como una comodidad y es una pérdida de cobertura.
 *
 * ✅ LA REGLA, y es R2: **lo permitido se declara positivamente.** Un motivo
 *    nuevo se agrega acá, con su razón escrita, y el tripwire de
 *    `servicio-acotado.spec.ts` se pone rojo si algún spec toma la key por su
 *    cuenta.
 *
 * 🔴 EL CRITERIO PARA ADMITIR UN MOTIVO, en una pregunta: **¿service_role es el
 *    SUJETO del caso, o es un atajo para armar el escenario?** Si es el sujeto
 *    —la función sólo se puede invocar así, o el caso prueba que la base aguanta
 *    a quien saltea todo lo demás— entra. Si es un atajo, no: el escenario se
 *    arma por el camino real, que además ejercita más.
 *
 * 🔴 Y HAY UNA TERCERA CATEGORÍA QUE ESA PREGUNTA NO CUBRÍA — se nombra el
 *    2026-09-17, al pasar cinco specs por esta puerta. **La LIMPIEZA no es el
 *    sujeto ni es un atajo para armar el escenario: es el arnés deshaciendo lo
 *    que el caso creó.** Y `CLAUDE.md` ya tiene la regla escrita:
 *
 *      «la limpieza no comparte camino con el sujeto. Que el sujeto necesite un
 *       camino angosto no obliga al arnés a usar el mismo.»
 *
 *    El caso que lo fuerza: desde la deuda 103, `sedes` **no tiene policy de
 *    DELETE**. Así que una limpieza por el camino del producto no borra y **no
 *    falla** —RLS devuelve `count 0` con `error: null`—, y la suite queda verde
 *    dejando residuo. Ahí service_role no es una comodidad: es que el camino
 *    real se cerró **a propósito**.
 *
 * ⚠️ EL LÍMITE DE ESA TERCERA CATEGORÍA, para que no se estire: vale cuando el
 *    camino real **no existe**, no cuando es incómodo. Si el producto permite
 *    deshacerlo, la limpieza va por ahí — y de paso ejercita la policy.
 */
export const MOTIVOS = {
  /** `onboard_organization` está revocada a `authenticated`: service_role es la
   *  ÚNICA forma de invocarla, y que sólo se pueda así es parte de lo probado. */
  'crear-organizacion': 'onboard_organization sólo se puede invocar con service_role',
  /** El caso prueba que el `CHECK` de la base rechaza un estado inválido incluso
   *  para quien saltea trigger y privilegios. Sin service_role no hay escenario. */
  'escribir-salteando-guards': 'probar que un CHECK aguanta a quien saltea todo lo demás',
  /** 🔴 SUJETO. El caso mide una **FK**, y RLS niega ANTES de que la FK hable:
   *  con el cliente del owner, el `delete` sobre `sedes` devuelve `count 0` y
   *  `error: null` —no hay fila que matchear— así que el caso estaría midiendo
   *  RLS y reportándolo como si midiera la FK. Son dos rechazos distintos y se
   *  distinguen por la respuesta: RLS da `count 0` sin error, la FK da `23503`.
   *  Saltear RLS es lo único que deja llegar la pregunta hasta la FK. */
  'medir-fk': 'el sujeto es la FK, y RLS la tapa: sin saltearla el caso mide el guard equivocado',
  /** 🔴 LIMPIEZA, no sujeto — la tercera categoría de arriba. Desde la deuda 103
   *  `sedes` no tiene policy de DELETE, así que lo que el caso creó no se puede
   *  deshacer por el camino del producto: no borra y **no falla**. Sin esto, cada
   *  corrida deja una sede huérfana y la suite lo reporta en verde. */
  'limpiar-sin-policy-de-delete':
    'el camino real se cerró a propósito (deuda 103): borrar sin la key no borra y no falla',
} as const

export type MotivoDeServicio = keyof typeof MOTIVOS

/**
 * Devuelve el cliente de servicio, o `null` si la key no está en el entorno.
 *
 * ⚠️ El `null` se maneja con `test.skip` **declarando que falta una variable de
 *    entorno** — que es el único skip legítimo (la condición es externa y no se
 *    arregla escribiendo mejor el caso). Un skip por un atajo roto es un verde
 *    por omisión y no va acá.
 *
 * 🔴 Y LA ADVERTENCIA QUE HAY QUE LEER ANTES DE PONER LA KEY: la base es UNA
 *    sola. El service role de este proyecto es también el de **Muscle Pro**, un
 *    cliente real con datos reales. No es el de un entorno de juguete.
 */
export function clienteDeServicio(motivo: MotivoDeServicio): SupabaseClient | null {
  const key = process.env.E2E_SERVICE_ROLE_KEY
  if (!key) return null
  void MOTIVOS[motivo]   // el motivo se declara en la llamada; acá se valida que exista
  return createClient(process.env.VITE_NODO_SUPABASE_URL!, key, {
    auth: { persistSession: false },
  })
}
