#!/usr/bin/env node
/**
 * ALTA DE UNA ORGANIZACIÓN NUEVA — deuda 36.
 *
 * Uso:
 *   export SUPABASE_URL=https://<ref>.supabase.co
 *   export SUPABASE_SERVICE_ROLE_KEY=<la key>        # ⚠️ nunca en un archivo
 *   node scripts/onboard-organizacion.mjs \
 *     --org "Muscle Pro" \
 *     --sede "<la sede>" \
 *     --email Yuli_28gz@hotmail.com \
 *     --nombre "<nombre del admin>" \
 *     --password "<la contraseña>"
 *
 * 🔴 NADA DE ESTO ESTÁ HARDCODEADO, y es a propósito: esta herramienta se corre
 *    una vez por cliente. Un dato de Muscle Pro escrito adentro sería el
 *    vocabulario de un tenant metido en el producto — el mismo error que la
 *    deuda 45 documentó con las subcategorías de la maqueta.
 *
 * ── QUÉ IMPRIME, Y POR QUÉ IMPORTA ─────────────────────────────────────────
 *    Toda respuesta trae `paso`, incluidas las de error, porque la acción de
 *    recuperación es DISTINTA según dónde murió:
 *
 *      autorizacion  → no se creó nada. Arreglar y volver a correr.
 *      organizacion  → no se creó nada. Ídem.
 *      usuario       → 🔴 LA ORGANIZACIÓN QUEDÓ CREADA Y SIN USUARIOS.
 *                       Volver a correr con LOS MISMOS NOMBRES la completa.
 *      completo      → listo.
 *
 * ⚠️ «Error» a secas no alcanzaría: sin saber si la organización existe, el
 *    operador no sabe si volver a correr es seguro o si va a duplicarla.
 */

const args = new Map()
for (let i = 2; i < process.argv.length; i += 2) {
  const k = process.argv[i]
  if (!k?.startsWith('--')) continue
  args.set(k.slice(2), process.argv[i + 1])
}

const URL_BASE = process.env.SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const faltan = []
if (!URL_BASE) faltan.push('SUPABASE_URL (variable de entorno)')
if (!KEY) faltan.push('SUPABASE_SERVICE_ROLE_KEY (variable de entorno)')
for (const k of ['org', 'sede', 'email', 'nombre', 'password']) {
  if (!args.get(k)) faltan.push(`--${k}`)
}
if (faltan.length) {
  console.error('Faltan datos:\n  ' + faltan.join('\n  '))
  console.error('\nVer el encabezado de este archivo para el uso completo.')
  process.exit(2)
}

const cuerpo = {
  org_name: args.get('org'),
  sede_name: args.get('sede'),
  admin_email: args.get('email'),
  admin_password: args.get('password'),
  admin_full_name: args.get('nombre'),
}

console.log('Dando de alta:')
console.log(`  organizacion : ${cuerpo.org_name}`)
console.log(`  sede         : ${cuerpo.sede_name}`)
console.log(`  primer admin : ${cuerpo.admin_email}`)
console.log('')

const res = await fetch(`${URL_BASE}/functions/v1/onboard-organization`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(cuerpo),
})

const out = await res.json().catch(() => ({ paso: 'organizacion', error: 'respuesta no-JSON' }))

console.log(`PASO: ${out.paso ?? '(desconocido)'}`)

if (out.paso === 'completo') {
  if (out.ya_estaba) {
    console.log('⚠️  La organizacion YA TENIA usuarios: no se creo ninguno nuevo.')
    console.log(`    ${out.detalle}`)
  } else {
    console.log('✅ Alta completa.')
    console.log(`    organization_id : ${out.organization_id}`)
    console.log(`    sede_id         : ${out.sede_id}`)
    console.log(`    user_id         : ${out.user_id}`)
  }
  process.exit(0)
}

console.error(`\n❌ ${out.error ?? 'error sin mensaje'}`)
if (out.organization_id) console.error(`   organization_id: ${out.organization_id}`)
if (out.sede_id) console.error(`   sede_id        : ${out.sede_id}`)
if (out.recuperacion) console.error(`\n   QUE HACER: ${out.recuperacion}`)
process.exit(1)
