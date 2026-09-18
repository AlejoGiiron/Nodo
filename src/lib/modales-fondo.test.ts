import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

// ============================================================================
// TRIPWIRE · UN MODAL DONDE SE TRABAJA NO SE CIERRA CON UN CLIC EN EL FONDO
//
// 2026-09-18: la clienta perdió una compra a medio cargar por un clic afuera
// del formulario. El barrido encontró el mismo cierre en 16 modales donde se
// escribe o se elige algo (compras, productos, clientes, caja, configuración…).
//
// La regla es una ALLOWLIST (R2): un fondo que cierra tiene que DECLARARLO con
// `data-cierra-con-fondo`, y sólo lo llevan los modales de SÓLO LECTURA. Un
// modal nuevo que copie el `onClick` del fondo sin la marca pone esto rojo.
//
// Se ejecuta con `pnpm test:unit`, que es la condición 5 del push — un tripwire
// sin puerta no avisa (CLAUDE.md, «un tripwire que nadie corre»).
// ============================================================================

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? archivos(p) : p.endsWith('.tsx') ? [p] : []
  })
}

/** Un fondo = un elemento con `inset: 0` cuya línea siguiente (o la de después
 *  de la marca) es un `onClick`. */
const FONDO_QUE_CIERRA = /inset: 0[^\n]*\n(\s*data-cierra-con-fondo\n)?\s*onClick=/g

const fondos = archivos('src').flatMap((f) => {
  const texto = readFileSync(f, 'utf8').replace(/\r\n/g, '\n')
  return [...texto.matchAll(FONDO_QUE_CIERRA)].map((m) => ({
    archivo: f.replace(/\\/g, '/'),
    declarado: m[1] !== undefined,
  }))
})

describe('modales: el clic en el fondo', () => {
  it('🔴 ningún fondo cierra sin declararlo (sólo los modales de sólo lectura)', () => {
    const sinDeclarar = fondos.filter((f) => !f.declarado).map((f) => f.archivo)
    expect(
      sinDeclarar.join(', ') || 'ninguno',
      'estos fondos cierran el modal con un clic afuera: si el modal tiene algo que ' +
      'escribir o elegir, QUITÁ el onClick del fondo; si es de sólo lectura, agregá ' +
      '`data-cierra-con-fondo` al fondo',
    ).toBe('ninguno')
  })

  it('CONTROL POSITIVO — el detector encuentra los cuatro fondos declarados', () => {
    // Sin esto, un regex que no matchee nada daría «ninguno» arriba y pasaría.
    // Estos cuatro son de sólo lectura A PROPÓSITO y no se planea cambiarlos.
    const declarados = fondos.filter((f) => f.declarado).map((f) => f.archivo).sort()
    expect(declarados).toEqual([
      'src/components/purchases/PurchaseDetailModal.tsx',
      'src/pages/POSPage.tsx',            // HeldOrdersPanel
      'src/pages/POSPage.tsx',            // ResumeConflictDialog
      'src/pages/SalesHistoryPage.tsx',   // SaleDetailModal
    ])
  })
})
