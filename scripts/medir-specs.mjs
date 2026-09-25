import { spawnSync } from 'node:child_process'
import { readFileSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

// Mide N corridas de unos specs y saca su duracion por ARCHIVO.
// 🔴 LA VERSION ANTERIOR IMPRIMIO UNA TABLA PROLIJA SOBRE UNA CORRIDA ROJA:
//    `fail` en blanco y exit 0, con `corrida 3/3 exit=1` tres lineas arriba.
//    El agregado ESCONDIA lo que el detalle decia. Ahora el exit de cada corrida
//    entra al informe, se nombran los casos que fallaron, y el script propaga.
const ARCHIVOS = process.argv.slice(3)
const N = Number(process.argv[2])
const acum = {}
const exits = []
const rojos = []

for (let i = 0; i < N; i++) {
  const out = join(mkdtempSync(join(tmpdir(), 'med-')), 'r.json')
  const r = spawnSync(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', ...ARCHIVOS, '--reporter=json'],
    { env: { ...process.env, PLAYWRIGHT_JSON_OUTPUT_NAME: out }, encoding: 'utf8' })
  exits.push(r.status)
  if (r.status === null) { console.log('🔴 no arrancó:', r.error?.message); process.exit(2) }
  let j
  try { j = JSON.parse(readFileSync(out, 'utf8')) } catch (e) { console.log('🔴 sin json:', e.message); process.exit(2) }
  const walk = (s) => {
    for (const sp of s.suites ?? []) walk(sp)
    for (const t of s.specs ?? []) for (const test of t.tests) for (const res of test.results) {
      const k = t.file
      ;(acum[k] ??= { ms: [], casos: 0, fail: 0 })
      acum[k].ms[i] = (acum[k].ms[i] ?? 0) + res.duration
      if (i === 0) acum[k].casos++
      if (res.status !== 'passed' && res.status !== 'skipped') {
        acum[k].fail++
        rojos.push(`corrida ${i + 1} · ${t.file}:${t.line} › ${t.title} [${res.status}]`)
      }
    }
  }
  for (const s of j.suites ?? []) walk(s)
  // 🔴 Los errores de nivel de ARCHIVO (un `afterAll` que revienta, un worker que
  //    muere) NO cuelgan de ningun spec: viven en `j.errors`. Sin esto, un exit 1
  //    sin casos rojos queda sin explicacion.
  for (const e of j.errors ?? []) rojos.push(`corrida ${i + 1} · ERROR DE ARCHIVO: ${(e.message ?? '').split('\n')[0]}`)
  process.stdout.write(`  corrida ${i + 1}/${N} exit=${r.status}\n`)
}

console.log('')
console.log('archivo'.padEnd(34), 'casos', ' corridas (s)'.padEnd(26), 'media', ' rango', ' disp.rel')
for (const [f, v] of Object.entries(acum)) {
  const s = v.ms.map((m) => m / 1000)
  const media = s.reduce((a, b) => a + b, 0) / s.length
  const rango = Math.max(...s) - Math.min(...s)
  console.log(f.padEnd(34), String(v.casos).padStart(5),
    (' ' + s.map((x) => x.toFixed(1)).join(' · ')).padEnd(26),
    media.toFixed(1).padStart(6), rango.toFixed(1).padStart(6),
    ((rango / media) * 100).toFixed(0).padStart(6) + '%', v.fail ? `🔴 ${v.fail} NO VERDE` : '')
}

// 🔴 EL EXIT DE CADA CORRIDA, EN EL INFORME — no sólo en la linea de progreso.
console.log('')
console.log(`exits_por_corrida=${exits.join(' · ')}`)
const sucias = exits.filter((e) => e !== 0).length
if (sucias > 0) {
  console.log(`🔴 ${sucias} de ${N} CORRIDAS NO SALIERON EN CERO — la media de arriba NO describe un verde.`)
  for (const r of rojos) console.log('   ' + r)
  if (rojos.length === 0) console.log('   ⚠️ y NINGUN caso figura rojo en el JSON: el fallo es de otro nivel (mirar test-results/).')
}
console.log(`medir_exit=${sucias > 0 ? 1 : 0}`)
process.exit(sucias > 0 ? 1 : 0)
