import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, appendFileSync, readFileSync, statSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

// ============================================================================
// CORRE LA SUITE Y ESCRIBE, EN UN SOLO ARCHIVO, TODO LO QUE HACE FALTA PARA
// INTERPRETARLA
//
// 🔴 POR QUÉ EXISTE, y no es comodidad: cada pieza de acá sale de una falla
//    MEDIDA de este proyecto, y todas tienen la misma forma — **un dato que se
//    lee lejos del comando que lo produjo llega mal o no llega**.
//
//    · el exit va ADENTRO del archivo, porque la notificación de tarea dijo
//      `exit code 0` sobre un `suite_exit=1` **once veces** (R9);
//    · los cinco números salen del JSON y no del texto del reporter, porque el
//      reporter `line` le pega una secuencia de escape a la primera línea del
//      resumen y un patrón anclado en `^` leyó «17 skipped» como 0;
//    · los `did not run` se nombran por la ANOTACIÓN, porque el reporter `json`
//      los mete adentro de `skipped` —dice 17 donde `line` dice 15 + 2— y el
//      conteo sigue cerrando, así que ninguna verificación aritmética lo
//      destapa;
//    · el TESTIGO DE ÁRBOL y la SONDA DE RESIDUO están acá y no en dos pasos
//      aparte, porque **lo que vive fuera de la puerta no verifica**.
//
// ⚠️ LO QUE ESTO NO ES: un guard. No impide que otra sesión escriba en el
//    worktree ni que purgue el lab — no controlamos su sesión. **Hace VISIBLE
//    la invalidez en vez de dejarla silenciosa**, que es lo único que se puede
//    hacer contra un actor que no es nuestro. Es un detector.
//
// Uso:  pnpm suite                       (la suite entera)
//       pnpm suite tests/descuento.spec.ts   (o cualquier argumento de Playwright)
// ============================================================================

const salidaDir = mkdtempSync(join(tmpdir(), 'nodo-suite-'))
const LOG = join(salidaDir, 'salida.txt')
const JSON_OUT = join(salidaDir, 'suite.json')

const sha = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).stdout.trim()
const sucio = spawnSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).stdout.trim()

// ── EL TESTIGO DE ÁRBOL ─────────────────────────────────────────────────────
// 🔴 VA CON ARCHIVO Y NO CON MARCA DE TIEMPO, y la razón está medida: en esta
//    máquina `date` imprime 19:49 y `stat` 15:24 sobre el MISMO instante —dos
//    zonas conviviendo—, así que un `-newermt '<texto>'` depende de cómo se
//    interprete la cadena y puede errar por horas. Comparar mtimes contra
//    mtimes no tiene formato que malinterpretar.
// ⚠️ Y mide algo DISTINTO de la condición 3: la 3 dice que el árbol estaba
//    limpio AL LANZAR; esto dice que nadie lo tocó MIENTRAS corría — incluido
//    quien escribió y después revirtió o commiteó, que es el caso donde la 3
//    dice «limpio» y miente.
const TESTIGO = join(salidaDir, 'testigo')
writeFileSync(TESTIGO, '')
const t0 = statSync(TESTIGO).mtimeMs

const VIGILADOS = ['src', 'tests', 'supabase']

function escritosDespuesDelTestigo() {
  const tocados = []
  const recorrer = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name)
      if (e.isDirectory()) { recorrer(p); continue }
      try { if (statSync(p).mtimeMs > t0) tocados.push(p) } catch { /* se borró en el medio */ }
    }
  }
  for (const d of VIGILADOS) { try { recorrer(d) } catch { /* no está */ } }
  return tocados
}

const log = (s) => { process.stdout.write(s + '\n'); appendFileSync(LOG, s + '\n') }

log(`sha_medido=${sha}`)
log(`arbol_al_lanzar=${sucio === '' ? 'limpio' : sucio.split('\n').length + ' cambios sin commitear'}`)
log('')

// ── LA SUITE ────────────────────────────────────────────────────────────────
// 🔴 SE INVOCA EL CLI DE PLAYWRIGHT CON `process.execPath`, NO `pnpm exec`.
//    Medido al estrenar este script: `spawnSync('pnpm.cmd', …)` devolvió
//    `status: null` —Node no ejecuta un `.cmd` sin shell— así que **la suite no
//    corrió y el archivo quedó sin un solo número**. Con el `.js` del CLI no hay
//    intérprete de shell en el medio.
const args = process.argv.slice(2)
const CLI = 'node_modules/@playwright/test/cli.js'

// 🔴 STREAMING Y NO `spawnSync`, y la razón es de USO y no de estilo: con
//    `spawnSync` la salida se retiene hasta que el proceso termina, así que
//    durante los ~26 minutos de una suite entera **el archivo tiene sólo la
//    cabecera y la terminal no dice nada**. Medido al estrenar este script.
// ⚠️ Y eso es PEOR que lo que había antes: si este comando es la puerta, tiene
//    que dejar ver que algo pasa. Veintiséis minutos sin señal son
//    indistinguibles de un proceso colgado — que es exactamente la confusión que
//    este proyecto ya tiene medida con «la corrida no existió».
const r = await new Promise((resolve) => {
  const p = spawn(process.execPath, [CLI, 'test', ...args, '--reporter=line,json'], {
    env: { ...process.env, PLAYWRIGHT_JSON_OUTPUT_NAME: JSON_OUT },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  // tee: a la terminal EN VIVO y al archivo, que es el que se lee después.
  const tee = (flujo, salida) => flujo.on('data', (b) => { salida.write(b); appendFileSync(LOG, b) })
  tee(p.stdout, process.stdout)
  tee(p.stderr, process.stderr)
  p.on('error', (error) => resolve({ status: null, error }))
  p.on('close', (status) => resolve({ status, error: null }))
})

// 🔴 R9: el exit se escribe ADENTRO del archivo. No se lee de una tubería ni de
//    la notificación de tarea — once veces dijo 0 sobre una suite roja.
log('')
log(`suite_exit=${r.status}`)

// 🔴 Y EL CASO QUE ESTE PROYECTO YA TIENE MEDIDO: «LA CORRIDA NO EXISTIÓ».
//    Un `status` nulo no es un fallo de la suite — es que el proceso ni arrancó,
//    y eso produce un archivo con los cinco números VACÍOS, que es
//    indistinguible de una corrida perfecta leída por el resumen.
if (r.status === null) {
  log('🔴 LA CORRIDA NO EXISTIÓ: el proceso no arrancó (status nulo).')
  log(`   ${r.error ? r.error.message : 'sin error reportado'}`)
  log('   ⚠️ NO se lea nada de abajo como resultado de una suite: no hay suite.')
}

// ── LOS CINCO NÚMEROS, DEL JSON ─────────────────────────────────────────────
let numeros = null
try {
  const j = JSON.parse(readFileSync(JSON_OUT, 'utf8'))
  const cubos = { passed: [], failed: [], flaky: [], skipDeclarado: [], noCorrio: [] }
  const walk = (s) => {
    for (const sp of s.suites ?? []) walk(sp)
    for (const t of s.specs ?? []) for (const test of t.tests) {
      const nombre = `${t.file}:${t.line} › ${t.title}`
      const motivo = (test.annotations ?? []).map((a) => a.description).filter(Boolean).join(' | ')
      if (test.status === 'unexpected') cubos.failed.push(nombre)
      else if (test.status === 'expected') cubos.passed.push(nombre)
      else if (test.status === 'flaky') cubos.flaky.push(nombre)
      // 🔴 EL DISCRIMINADOR: el `json` mete los `did not run` adentro de
      //    `skipped`. Un skip DECLARADO trae su motivo; un caso que no corrió
      //    no tiene, porque nadie lo decidió.
      else if (test.status === 'skipped') (motivo ? cubos.skipDeclarado : cubos.noCorrio).push(motivo ? `${nombre}  [${motivo}]` : nombre)
    }
  }
  for (const s of j.suites ?? []) walk(s)
  numeros = cubos
} catch (e) {
  log(`numeros=NO SE PUDO LEER EL JSON (${e.message})`)
}

if (numeros) {
  const n = numeros
  log('')
  log('── LOS CINCO NÚMEROS, uno por uno (del JSON, no del texto del reporter) ──')
  log(`passed=${n.passed.length}`)
  log(`failed=${n.failed.length}`)
  log(`flaky=${n.flaky.length}`)
  log(`skipped_declarados=${n.skipDeclarado.length}   (con motivo impreso)`)
  log(`did_not_run=${n.noCorrio.length}              🔴 SIN MEDIR, no son verdes`)
  const total = n.passed.length + n.failed.length + n.flaky.length + n.skipDeclarado.length + n.noCorrio.length
  log(`CRUCE: ${n.passed.length}+${n.failed.length}+${n.flaky.length}+${n.skipDeclarado.length}+${n.noCorrio.length} = ${total} casos emitidos`)
  for (const [k, titulo] of [['failed', 'FALLARON'], ['flaky', 'FLAKY'], ['noCorrio', 'NO CORRIERON — sin medir']]) {
    if (n[k].length > 0) { log(`\n${titulo}:`); for (const x of n[k]) log('  ' + x) }
  }
}

// ── EL TESTIGO, AL CERRAR ───────────────────────────────────────────────────
const tocados = escritosDespuesDelTestigo()
log('')
if (tocados.length === 0) {
  log('testigo_arbol=nadie escribió mientras corría')
} else {
  log(`testigo_arbol=🔴 ${tocados.length} ARCHIVO(S) ESCRITOS MIENTRAS LA SUITE CORRÍA`)
  for (const p of tocados) log('  ' + p)
  log('  ⚠️ EL RESULTADO DE ARRIBA NO DESCRIBE NINGÚN ÁRBOL: los casos que')
  log('     corrieron antes midieron un código y los de después otro, y el')
  log('     resumen los suma como si fueran la misma corrida. Se descarta.')
  log('  ⚠️ Y esto NO lo ve `git status`: una escritura revertida o commiteada')
  log('     por otra sesión deja el árbol limpio y el testigo la nombra igual.')
}

// ── LA SONDA DEL LAB, EN LA MISMA INVOCACIÓN ────────────────────────────────
// 🔴 ACÁ Y NO EN UN PASO APARTE, con su caso medido: la otra sesión corrió sus
//    grupos DESPUÉS de mi suite y ANTES de mi sonda, y su `global-setup` purgó
//    la fixture — así que medí un mundo que ya no era el que la pregunta
//    suponía. Un hueco entre la suite y su medición es una ventana por donde
//    entra otro escritor; la única forma de cerrarla es que no haya hueco.
log('')
log('── SONDA DE RESIDUO DEL LAB (misma invocación: sin hueco) ──')
const s = spawnSync(process.execPath, ['scripts/residuo.mjs'], { encoding: 'utf8' })
const salidaSonda = (s.stdout ?? '') + (s.stderr ?? '')
appendFileSync(LOG, salidaSonda)
process.stdout.write(salidaSonda)
log(`residuo_exit=${s.status}`)

log('')
log(`archivo completo: ${LOG}`)
log(`json:             ${JSON_OUT}`)

// El exit del proceso refleja la SUITE. El testigo y la sonda se leen del
// archivo: no son condiciones de la suite, son condiciones de que su resultado
// signifique algo.
process.exit(r.status ?? 1)
