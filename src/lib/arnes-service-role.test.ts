import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * TRIPWIRE DE ÁRBOL · quién puede tomar `E2E_SERVICE_ROLE_KEY`.
 *
 * 🔴 POR QUÉ EXISTE. El arnés opera con anon key y sesión de usuario **a
 *    propósito**: así cada escritura pasa por RLS y la suite ejercita las
 *    policies de verdad. Con service_role la policy ni se evalúa. El día que
 *    esa key esté en `.env.test`, queda disponible para cualquier spec — y el
 *    próximo caso que necesite un atajo la va a usar, va a pasar en verde, y
 *    **dejaremos de medir RLS sin que nada avise**.
 *
 * 🔴 POR QUÉ ES UN CHECK DE ÁRBOL Y NO UN HOOK NI UN TIPO. Un hook dispara
 *    cuando alguien toca un archivo; el fallo que hay que atrapar es un archivo
 *    NUEVO que nadie va a revisar. Y un tipo no ve `process.env`. Es la misma
 *    razón por la que el catálogo de permisos se verifica con un check de árbol.
 *
 * ⚠️ CÓMO SE AGREGA UNO: si service_role es el SUJETO del caso —la función sólo
 *    se puede invocar así, o el caso prueba que la base aguanta a quien saltea
 *    todo lo demás— se usa `clienteDeServicio()` de `tests/helpers/servicio.ts`
 *    con su motivo. Si es un ATAJO para armar el escenario, no: el escenario se
 *    arma por el camino real, que además ejercita más.
 */

/** La puerta, y los tres que la usaban antes de que la puerta existiera. */
const PERMITIDOS: Record<string, string> = {
  'helpers/servicio.ts':
    'LA PUERTA. Es el único que lee la variable; el resto pide el cliente acá.',
  'onboarding-organizacion.spec.ts':
    'SUJETO: onboard_organization está revocada a authenticated, sólo se invoca con service_role.',
  'suscripcion-estado.spec.ts':
    'SUJETO: prueba que el CHECK rechaza un estado inválido incluso salteando trigger y privilegios.',
  'create-user.spec.ts':
    '⚠️ ATAJO DE LIMPIEZA, no sujeto: borra el usuario de prueba de auth.users. Es el único de ' +
    'los cuatro que NO prueba nada con la key. Migrar su limpieza (o dejar que la haga lab-seed) ' +
    'es trabajo pendiente; queda en la lista para no bloquear, marcado como lo que es.',
}

/**
 * 🔴 SE BUSCA LA LECTURA, NO LA MENCIÓN — y el propio tripwire lo enseñó: su
 *    primera versión buscaba el nombre de la variable y acusó al spec de la
 *    deuda 92, que ya usaba la puerta y sólo la NOMBRA en su mensaje de skip.
 *    Es la misma clase que el `grep -c` sobre `LoginPage`: el conteo decía
 *    «presente» y la cosa decía «documentado». El sujeto es quién la LEE.
 */
const LECTURA = 'process.env.E2E_SERVICE_ROLE_KEY'

function archivosDe(dir: string, base = ''): string[] {
  const salida: string[] = []
  for (const entrada of readdirSync(dir)) {
    const completo = join(dir, entrada)
    const rel = base ? `${base}/${entrada}` : entrada
    if (statSync(completo).isDirectory()) salida.push(...archivosDe(completo, rel))
    else if (/\.(ts|tsx|mjs)$/.test(entrada)) salida.push(rel)
  }
  return salida
}

describe('la key de service role del arnés está acotada', () => {
  it('🔴 sólo la usan los declarados, y cada uno dice por qué', () => {
    const usan = archivosDe('tests')
      .filter((f) => readFileSync(join('tests', f), 'utf8').includes(LECTURA))
      .map((f) => f.replace(/\\/g, '/'))
      .sort()

    const declarados = Object.keys(PERMITIDOS).sort()
    const nuevos = usan.filter((f) => !declarados.includes(f))
    const salieron = declarados.filter((f) => !usan.includes(f))

    expect(
      `nuevos: ${nuevos.join(', ') || 'ninguno'} · ya no la usan: ${salieron.join(', ') || 'ninguno'}`,
      'UN SPEC TOMÓ LA KEY DE SERVICE ROLE POR SU CUENTA. Con service_role las policies NO se ' +
      'evalúan, así que ese caso dejó de medir RLS — y pasa en verde igual. Preguntá si service_role ' +
      'es el SUJETO del caso o un ATAJO para armar el escenario: si es lo segundo, el escenario se ' +
      'arma por el camino real. Si de verdad es el sujeto, usá clienteDeServicio() de ' +
      'tests/helpers/servicio.ts y agregalo acá con su motivo.',
    ).toBe('nuevos: ninguno · ya no la usan: ninguno')
  })

  // Control negativo del propio tripwire: si el barrido no encontrara nada, el
  // caso de arriba pasaría siempre y sería decorativo.
  it('y el barrido encuentra de verdad: la puerta está entre los hallados', () => {
    const usan = archivosDe('tests')
      .filter((f) => readFileSync(join('tests', f), 'utf8').includes(LECTURA))
    expect(usan.length, 'el barrido no encontró NINGÚN archivo: mide el patrón, no el árbol').toBeGreaterThan(0)
    // Y que discrimine mención de lectura: el spec de la deuda 92 NOMBRA la
    // variable en su mensaje de skip y NO debe aparecer — si aparece, el
    // patrón volvió a medir texto.
    expect(usan.map((f) => f.split('\\').join('/')), 'el patrón volvió a contar MENCIONES')
      .not.toContain('alta-usuario-entre-sedes.spec.ts')
    expect(usan.map((f) => f.replace(/\\/g, '/'))).toContain('helpers/servicio.ts')
  })
})
