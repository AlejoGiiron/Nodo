import net from 'node:net'
import { execSync } from 'node:child_process'

// ============================================================================
// ¿ESTÁ LIBRE EL PUERTO DEL webServer?
//
// 🔴 POR QUÉ EXISTE, con la causa MEDIDA (deuda 70, 2026-09-24): al cortar una
//    corrida muere el shell y **NO su `pnpm dev` hijo**. El hijo sobrevive al
//    padre y sigue escuchando, así que la corrida siguiente aborta al instante
//    con `http://localhost:5180 is already used`.
//
// ⚠️ Y EL SÍNTOMA NO SE PARECE A LA CAUSA: esa corrida escribe **tres líneas**,
//    sin resumen, con los cinco números vacíos — o sea **indistinguible de una
//    corrida perfecta leída por el resumen**. Costó un turno entero de
//    diagnóstico por algo que este chequeo dice en un segundo.
//
// 🔴 Y NO SÓLO FALLA: DICE EL PID Y CÓMO MATARLO. Un chequeo que sólo dice «el
//    puerto está tomado» deja al que lo lee en el mismo lugar que el error de
//    Playwright.
// ============================================================================

const PUERTO = Number(process.env.E2E_PORT ?? 5180)

function pidsDelPuerto() {
  try {
    const salida = execSync(`netstat -ano | findstr :${PUERTO}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    const pids = new Set()
    for (const l of salida.split(/\r?\n/)) {
      const m = l.match(/LISTENING\s+(\d+)/)
      if (m) pids.add(m[1])
    }
    return [...pids]
  } catch {
    return []   // netstat no está, o no hay coincidencias: no se sabe.
  }
}

// 🔴 `netstat` ES LA AUTORIDAD, Y LA PRUEBA DE ENLACE ES EL RESPALDO — al
//    revés de como nació este archivo, y lo corrigió su CONTROL POSITIVO:
//    corrido con la suite andando dijo «libre».
//    La causa: el `webServer` escucha en **[::1]** (IPv6) y la prueba enlazaba
//    **127.0.0.1** (IPv4). Son direcciones distintas, así que no chocaban.
//    Era un verificador que no podía dar rojo justo en el caso que existe para
//    cazar — el corolario de R4 en el instrumento nuevo.
// ⚠️ Por eso la prueba de enlace va sin host: la dirección no especificada
//    choca con cualquier familia. Y aun así manda `netstat`, que es el que vio
//    la verdad la primera vez.
const pidsAntes = pidsDelPuerto()

const libre = pidsAntes.length > 0
  ? false
  : await new Promise((resolve) => {
      const s = net.createServer()
      s.once('error', (e) => resolve(e.code !== 'EADDRINUSE'))
      s.once('listening', () => s.close(() => resolve(true)))
      s.listen(PUERTO)   // sin host: cualquier interfaz, IPv4 o IPv6
    })

if (libre) {
  console.log(`puerto ${PUERTO}: libre`)
  process.exit(0)
}

const pids = pidsAntes.length > 0 ? pidsAntes : pidsDelPuerto()
console.error(`\n🔴 EL PUERTO ${PUERTO} ESTÁ TOMADO — la suite abortaría escribiendo tres líneas,`)
console.error('   sin resumen, que se leen igual que una corrida perfecta.\n')
if (pids.length > 0) {
  console.error(`   Lo tiene el PID ${pids.join(', ')}. Para liberarlo:`)
  for (const p of pids) console.error(`     taskkill //PID ${p} //F`)
} else {
  console.error('   No se pudo identificar el PID (¿sin netstat?). Buscalo con:')
  console.error(`     netstat -ano | findstr :${PUERTO}`)
}
console.error('\n   Causa conocida (deuda 70): al cortar una corrida muere el shell y no su')
console.error('   `pnpm dev` hijo. El arreglo de fondo es que el teardown mate el ÁRBOL de')
console.error('   procesos, no el shell.\n')
process.exit(1)
