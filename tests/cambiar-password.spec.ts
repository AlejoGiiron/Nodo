import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { ownerCreds, login } from './helpers/auth'

// ============================================================================
// Cambiar la PROPIA contraseña — deuda 95, primera mitad.
//
// ⛔ NO cubre «olvidé mi contraseña»: esa es la segunda mitad y necesita correo
//    saliente configurado. No existe, así que no hay nada que probar.
//
// 🔴 EL CASO QUE IMPORTA ES EL ÚLTIMO Y VA EN LAS DOS DIRECCIONES: después de
//    cambiarla, la contraseña VIEJA tiene que dejar de entrar. Sin esa segunda
//    mitad, «se cambió» es una afirmación: un formulario que no hace nada y uno
//    que funciona producen el mismo mensaje de éxito. Es la misma verificación
//    que se usó al rotar la contraseña real del cliente.
//
// 🔴 EL SUJETO ES UN USUARIO DESECHABLE, y no es una comodidad: cambiarle la
//    contraseña al owner o al cajero del lab rompería TODOS los demás specs, que
//    entran con esas credenciales desde `.env.test`.
//
// ⚠️ NO es `describe.serial`. Los dos casos comparten una FIXTURE —el usuario
//    creado en beforeAll— y no un resultado. Si el primero se pusiera rojo, el
//    segundo TIENE que correr igual: es el que mide el sujeto.
// ============================================================================

function loadEnv(path: string) {
  try {
    for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  } catch { /* ignore */ }
}
loadEnv('.env'); loadEnv('.env.test')

const URL_BASE = () => process.env.VITE_NODO_SUPABASE_URL!
const ANON = () => process.env.VITE_NODO_SUPABASE_ANON_KEY!
const FN = () => process.env.E2E_CREATE_USER_FN ?? 'create-user'
const anon = () => createClient(URL_BASE(), ANON(), { auth: { persistSession: false } })

const SUFIJO = Date.now().toString().slice(-6)
const EMAIL = `e2e-pass-${SUFIJO}@nodo.test`
const PASS_ORIGINAL = 'e2e-Original-1'
const PASS_NUEVA = 'e2e-Cambiada-2'

test.describe('Mi cuenta · cambiar la propia contraseña', () => {
  test.beforeAll(async () => {
    // El usuario desechable se crea por el CAMINO REAL —la Edge Function con el
    // token del owner—, no con service_role: así el escenario ejercita lo mismo
    // que ejercitaría un alta de verdad.
    const owner = anon()
    const { error: eL } = await owner.auth.signInWithPassword(ownerCreds())
    if (eL) throw new Error(`no se pudo entrar como owner: ${eL.message}`)
    const { data: ses } = await owner.auth.getSession()
    // ⚠️ `.eq('id', …)` NO es decorativo: el owner VE todos los perfiles de su
    //    sede, así que un `.single()` sin filtrar matchea varias filas y
    //    devuelve null. Es el corolario ya escrito: al leer una tabla con RLS,
    //    filtrá por el sujeto aunque «ya sepas» que RLS filtra — RLS acota a la
    //    organización, no a la fila que te interesa.
    const { data: perfil, error: eP } = await owner.from('profiles')
      .select('sede_id, organization_id').eq('id', ses.session!.user.id).single()
    if (eP || !perfil) throw new Error(`no se pudo leer el perfil del owner: ${eP?.message}`)

    // 🔴 role_id NO es opcional acá, y es la deuda 99: sin él la cuenta ENTRA y
    //    no puede hacer nada — RLS rechaza todo con 0 filas y ningún error.
    const { data: rol } = await owner.from('roles')
      .select('id').eq('organization_id', perfil.organization_id).eq('name', 'admin').single()
    if (!rol) throw new Error('no existe el rol admin de la organización del lab')

    const res = await fetch(`${URL_BASE()}/functions/v1/${FN()}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: ANON(),
        Authorization: `Bearer ${ses.session!.access_token}`,
      },
      body: JSON.stringify({
        email: EMAIL, password: PASS_ORIGINAL, full_name: `E2E Password ${SUFIJO}`,
        role: 'admin', role_id: rol.id, sede_id: perfil.sede_id,
      }),
    })
    if (!res.ok) throw new Error(`create-user devolvió ${res.status}: ${await res.text()}`)
  })

  test('el formulario nombra la REGLA en cada rechazo, no «error al guardar»', async ({ page }) => {
    await login(page, { email: EMAIL, password: PASS_ORIGINAL })
    await page.goto('/configuracion')
    await page.getByText('Mi cuenta', { exact: true }).click()
    await expect(page.getByTestId('cuenta-email')).toContainText(EMAIL)

    // ① la contraseña ACTUAL equivocada → lo dice de la actual, no «credenciales»
    await page.getByTestId('pass-actual').fill('estaNoEsLaActual1')
    await page.getByTestId('pass-nueva').fill(PASS_NUEVA)
    await page.getByTestId('pass-repetida').fill(PASS_NUEVA)
    await page.getByRole('button', { name: 'Guardar' }).click()
    await expect(page.getByTestId('pass-error')).toContainText('actual no es correcta')
    // y el sujeto de fondo: equivocarse al teclear NO puede desloguear
    await expect(page.getByTestId('cuenta-email')).toContainText(EMAIL)

    // ② demasiado corta → el mensaje trae el NÚMERO de la regla
    await page.getByTestId('pass-actual').fill(PASS_ORIGINAL)
    await page.getByTestId('pass-nueva').fill('corta1')
    await page.getByTestId('pass-repetida').fill('corta1')
    await page.getByRole('button', { name: 'Guardar' }).click()
    await expect(page.getByTestId('pass-error')).toContainText('8')

    // ③ las dos nuevas no coinciden
    await page.getByTestId('pass-nueva').fill(PASS_NUEVA)
    await page.getByTestId('pass-repetida').fill(PASS_NUEVA + 'x')
    await page.getByRole('button', { name: 'Guardar' }).click()
    await expect(page.getByTestId('pass-error')).toContainText('no coinciden')

    // ④ la nueva IGUAL a la actual — el caso que más se parece a un éxito
    await page.getByTestId('pass-nueva').fill(PASS_ORIGINAL)
    await page.getByTestId('pass-repetida').fill(PASS_ORIGINAL)
    await page.getByRole('button', { name: 'Guardar' }).click()
    await expect(page.getByTestId('pass-error')).toContainText('igual a la actual')

    // Ningún rechazo pudo haber cambiado nada: la original sigue entrando.
    const c = anon()
    const { error } = await c.auth.signInWithPassword({ email: EMAIL, password: PASS_ORIGINAL })
    expect(error, 'un rechazo del formulario cambió la contraseña igual').toBeNull()
  })

  test('🔴 cambia la contraseña · la NUEVA entra y la VIEJA deja de entrar', async ({ page }) => {
    await login(page, { email: EMAIL, password: PASS_ORIGINAL })
    await page.goto('/configuracion')
    await page.getByText('Mi cuenta', { exact: true }).click()

    await page.getByTestId('pass-actual').fill(PASS_ORIGINAL)
    await page.getByTestId('pass-nueva').fill(PASS_NUEVA)
    await page.getByTestId('pass-repetida').fill(PASS_NUEVA)
    await page.getByRole('button', { name: 'Guardar' }).click()

    // El éxito dice QUÉ PASÓ, no «guardado»: medido que la sesión sobrevive.
    const exito = page.getByTestId('pass-exito')
    await expect(exito).toBeVisible()
    await expect(exito).toContainText('sesión sigue abierta')

    // Y la sesión de verdad sigue usable, no sólo lo dice el cartel.
    await page.goto('/configuracion')
    await expect(page.getByText('Mi cuenta', { exact: true })).toBeVisible()

    // ── LA VERIFICACIÓN EN LAS DOS DIRECCIONES ────────────────────────────
    // Sin la segunda mitad, un formulario que no hace nada pasa este caso.
    const conNueva = anon()
    const { error: eNueva } = await conNueva.auth.signInWithPassword({ email: EMAIL, password: PASS_NUEVA })
    expect(eNueva, 'la contraseña NUEVA no entra: el cambio no se aplicó').toBeNull()

    const conVieja = anon()
    const { error: eVieja } = await conVieja.auth.signInWithPassword({ email: EMAIL, password: PASS_ORIGINAL })
    expect(eVieja, 'la contraseña VIEJA SIGUE ENTRANDO: el cambio no surtió efecto').not.toBeNull()
  })
})
