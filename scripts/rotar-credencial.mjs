// ============================================================================
// ROTA LA CLAVE DE UNA CUENTA. LA CUENTA NO SE BORRA.
//
// 🔴 POR QUE ROTAR Y NO BORRAR: `alejogiiron@gmail.com` es el acceso de
//    Alejandro al sistema de la clienta. Borrarla lo deja afuera de lo que
//    administra. **Lo que se descarta al terminar es la CREDENCIAL, no el
//    usuario.**
//
// 🔴 POR QUE LA CLAVE NUEVA NO SE IMPRIME, y es el punto entero del script:
//    la clave vieja hay que rotarla porque se pego en texto plano. Generar una
//    nueva y MOSTRARLA reproduce exactamente el defecto que se esta cerrando —
//    quedaria en el historial de la conversacion, que es donde estaba la vieja.
//    Asi que se rota a un valor aleatorio que NADIE conoce, no se imprime, y el
//    acceso se repone por correo: Alejandro pone la suya.
//
// 🔴 Y EL CORREO SOLO NO ALCANZA: `resetPasswordForEmail` no invalida nada — la
//    clave vieja sigue sirviendo hasta que alguien la cambie. Por eso primero se
//    rota (la vieja muere ya) y despues se manda el correo (el acceso vuelve).
//    El orden no es cosmetico: al reves deja la clave pegada viva.
//
// ✅ EL CONTROL NEGATIVO, que es lo unico que distingue «corri el comando» de
//    «funciono»: despues de rotar, se intenta entrar CON LA CLAVE VIEJA y tiene
//    que ser RECHAZADO. Sin ese intento, un exito silencioso y un no-op se leen
//    igual.
//
// USO: MPE=<correo> MPP=<clave actual> node scripts/rotar-credencial.mjs --aplicar
// ============================================================================
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'

const APLICAR = process.argv.includes('--aplicar')
const abortar = (que, queHacer) => {
  console.error('\n🔴 ABORTA: ' + que)
  if (queHacer) console.error('   ' + queHacer)
  process.exit(1)
}

const env = Object.fromEntries(
  readFileSync('.env', 'utf8').split(/\r?\n/).filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))
const URL = env.VITE_NODO_SUPABASE_URL, ANON = env.VITE_NODO_SUPABASE_ANON_KEY
const CORREO = process.env.MPE, VIEJA = process.env.MPP
if (!CORREO || !VIEJA) abortar('faltan MPE/MPP')

// Clientes efimeros: `persistSession: false` para no dejar sesion en disco, y
// uno por prueba para que un signOut no toque al otro.
const nuevoCliente = () => createClient(URL, ANON, { auth: { persistSession: false } })

console.log('══ ROTACION DE CREDENCIAL ══')
console.log('   cuenta: %s', CORREO)
console.log('   la cuenta NO se borra. Se descarta la CREDENCIAL.')

const a = nuevoCliente()
const { error: eIn } = await a.auth.signInWithPassword({ email: CORREO, password: VIEJA })
if (eIn) abortar('la clave actual no entra: ' + eIn.message,
  'si ya se roto, no hay nada que hacer.')
console.log('\n  ✅ la clave actual entra (o sea: hay algo que rotar)')

if (!APLICAR) {
  console.log('\nSOLO LECTURA. Para rotar, --aplicar. Se haria:')
  console.log('   1 · updateUser con una clave ALEATORIA que no se imprime')
  console.log('   2 · control negativo: entrar con la vieja tiene que FALLAR')
  console.log('   3 · resetPasswordForEmail para que Alejandro ponga la suya')
  process.exit(0)
}

// ── 1 · rotar a un valor que nadie conoce ──────────────────────────────────
// 32 bytes de crypto. Vive en este proceso y muere con el; no se imprime, no se
// escribe a disco y no vuelve por ningun retorno.
const efimera = randomBytes(32).toString('base64url') + 'Aa1!'
const { error: eUp } = await a.auth.updateUser({ password: efimera })
if (eUp) abortar('no se pudo rotar: ' + eUp.message)
console.log('\n  ✅ clave rotada a un valor aleatorio (NO se imprime, a proposito)')

// ── 2 · EL CONTROL NEGATIVO ────────────────────────────────────────────────
const b = nuevoCliente()
const { error: eVieja } = await b.auth.signInWithPassword({ email: CORREO, password: VIEJA })
if (!eVieja) abortar('🔴 LA CLAVE VIEJA SIGUE ENTRANDO — la rotacion NO tuvo efecto',
  'la credencial pegada en texto plano sigue viva. NO dar esto por cerrado.')
console.log('  ✅ control negativo: la clave vieja YA NO entra («%s»)', eVieja.message)

// ── 3 · reponer el acceso, sin que nadie tenga que saber la efimera ────────
const c = nuevoCliente()
const { error: eMail } = await c.auth.resetPasswordForEmail(CORREO)
if (eMail) {
  console.error('\n⚠️ la clave YA ESTA ROTADA, pero el correo de restablecimiento fallo: ' + eMail.message)
  console.error('   Pedilo desde la pantalla de login («olvidé mi contraseña»).')
  process.exit(1)
}
console.log('  ✅ correo de restablecimiento enviado a %s', CORREO)

console.log('\n══ ESTADO ══')
console.log('   la credencial vieja  : MUERTA (verificado, no supuesto)')
console.log('   la efimera           : la genero este proceso, no se imprimio y muere con el')
console.log('   el acceso            : se repone desde el correo. La cuenta sigue existiendo.')
