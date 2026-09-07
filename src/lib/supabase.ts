import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'

const supabaseUrl = import.meta.env.VITE_NODO_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_NODO_SUPABASE_ANON_KEY

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey)

/**
 * Un cliente EFÍMERO, sin persistir sesión, contra el mismo proyecto.
 *
 * 🔴 Existe para VERIFICAR una credencial sin tocar la sesión viva. Hacer
 *    `supabase.auth.signInWithPassword` sobre el cliente de arriba **reemplaza
 *    la sesión del usuario**: si la contraseña que se está comprobando resulta
 *    equivocada, la persona queda deslogueada por haberse equivocado al
 *    escribir. Con un cliente aparte, comprobar no tiene efecto sobre nada.
 *
 * ⚠️ La URL y la anon key salen de las MISMAS constantes de este archivo: no es
 *    un segundo lado del contrato, es el mismo valor con otro cliente.
 */
export const crearClienteEfimero = () =>
  createClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
