import { useState } from 'react'
import { supabase, crearClienteEfimero } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { validarPasswordNueva, MENSAJE_DE_ERROR, PASSWORD_REGLA } from '@/lib/password'

/**
 * Cambiar la PROPIA contraseña, estando adentro. Deuda 95, primera mitad.
 *
 * ⛔ La segunda mitad —RECUPERAR una olvidada— NO está acá y no es un pendiente
 *    de este hook: necesita `resetPasswordForEmail` más correo saliente
 *    configurado (remitente, dominio, plantilla), que hoy no existe. Es un
 *    trabajo distinto y queda en la deuda 95.
 *
 * ── POR QUÉ PIDE LA CONTRASEÑA ACTUAL, SI `auth.updateUser` NO LA EXIGE ─────
 *    Porque sin eso la operación **no es del dueño de la sesión: es de quien
 *    esté sentado**. Un equipo sin bloquear en el mostrador alcanza para que
 *    cualquiera le cambie la clave al dueño y lo deje afuera de su propio
 *    sistema. Es el mismo criterio que el resto de los guards del proyecto: la
 *    autorización se comprueba, no se asume por estar la puerta abierta.
 *
 * ── CÓMO SE COMPRUEBA SIN ROMPER LA SESIÓN ─────────────────────────────────
 *    Con un cliente EFÍMERO (`crearClienteEfimero`). Usar el cliente principal
 *    reemplazaría la sesión activa, así que **equivocarse al teclear la actual
 *    desloguearía a la persona** — un castigo absurdo para un typo.
 *
 * ── LO QUE PASA CON LA SESIÓN, MEDIDO ──────────────────────────────────────
 *    Medido el 2026-09-07 contra el proyecto real: después de
 *    `auth.updateUser({ password })` **la sesión SIGUE VIVA** —el access token
 *    ni siquiera cambia— y las consultas autenticadas siguen funcionando. Por
 *    eso el mensaje de éxito dice que no hay que volver a entrar: un «guardado»
 *    a secas dejaría a la persona sin saber si sigue adentro.
 */
export type EstadoCambio = 'idle' | 'guardando' | 'listo'

export function useCambiarPassword() {
  const { user } = useAuth()
  const [estado, setEstado] = useState<EstadoCambio>('idle')
  const [error, setError] = useState<string | null>(null)

  const cambiar = async (actual: string, nueva: string, repetida: string): Promise<boolean> => {
    setError(null)

    if (!user?.email) {
      setError('No se pudo leer tu cuenta. Vuelve a entrar e inténtalo otra vez.')
      return false
    }
    if (!actual) {
      setError('Escribe tu contraseña actual.')
      return false
    }
    const motivo = validarPasswordNueva(nueva, repetida, actual)
    if (motivo) {
      setError(MENSAJE_DE_ERROR[motivo])
      return false
    }

    setEstado('guardando')

    // 1 · La ACTUAL, contra un cliente aparte. Si falla, la sesión no se tocó.
    const verificador = crearClienteEfimero()
    const { error: eActual } = await verificador.auth.signInWithPassword({
      email: user.email,
      password: actual,
    })
    if (eActual) {
      await verificador.auth.signOut({ scope: 'local' })
      setEstado('idle')
      // El mensaje NO dice "credenciales inválidas": la única credencial que
      // la persona escribió acá es la actual, y nombrarla evita que crea que
      // el problema está en la nueva.
      setError('La contraseña actual no es correcta.')
      return false
    }
    // 🔴 `scope: 'local'`, Y NO ES UN DETALLE: `signOut()` por defecto es
    //    GLOBAL y **revoca todas las sesiones del usuario en el servidor** —
    //    incluida la que está usando la persona en este momento. Con el default,
    //    verificar la contraseña actual DESLOGUEABA a quien la estaba
    //    verificando, y el `updateUser` de abajo fallaba por sesión muerta.
    //    Lo encontró el spec: el formulario no mostraba ni error ni éxito.
    await verificador.auth.signOut({ scope: 'local' })

    // 2 · El cambio, sobre la sesión viva.
    const { error: eUpd } = await supabase.auth.updateUser({ password: nueva })
    if (eUpd) {
      setEstado('idle')
      // 🔴 La plataforma contesta en inglés y con SU mínimo (6), no el nuestro
      //    (8). Mostrar su texto sería mostrarle a la persona una regla que no
      //    es la que el producto aplica. Se traduce a la regla nuestra.
      setError(
        eUpd.code === 'weak_password'
          ? `La contraseña no cumple la regla. ${PASSWORD_REGLA}`
          : `No se pudo cambiar la contraseña: ${eUpd.message}`,
      )
      return false
    }

    setEstado('listo')
    return true
  }

  const reiniciar = () => { setEstado('idle'); setError(null) }

  return { cambiar, estado, error, reiniciar }
}
