import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'

// ============================================================================
// TRIPWIRE · UNA CAJA QUE RECORTA NO PUEDE ENCOGERSE DENTRO DE UN CUERPO QUE
// SCROLLEA
//
// 2026-09-18, compra #81 (20 ítems): el detalle no dejaba llegar a los últimos.
// La tabla vivía en una caja con `overflow: hidden` que era hija DIRECTA de un
// cuerpo flex en columna con scroll. Un `overflow` distinto de `visible` baja
// el alto mínimo de un ítem flex a 0, así que la caja se ENCOGÍA —recortando
// filas— en vez de dejar scrollear al cuerpo. No hay error, no hay rojo, y en
// pantalla se ve una tabla que termina prolija.
//
// La forma, que es lo que se detecta (leyendo el JSX con el compilador, no con
// un grep: lo que importa es que sea hija DIRECTA):
//   PADRE  style con flexDirection 'column' y overflow/overflowY 'auto'|'scroll'
//   HIJO   style con overflow/overflowY 'hidden'|'auto'|'scroll'
//          y SIN `flexShrink: 0` ni `minHeight`
//
// ⚠️ LÍMITE, dicho para que el verde no se lea de más: sólo ve estilos INLINE
//    literales. Clases de Tailwind y estilos por spread no los ve (medido el
//    2026-09-18: hoy ninguno arma esta forma). Y no mide la pantalla: otras
//    causas de «no hay scroll» —un alto fijo, un modal sin maxHeight— tienen
//    otra forma y no están acá.
//
// Corre con `pnpm test:unit`, condición 5 del push.
// ============================================================================

type Estilo = Record<string, string>

function estilo(el: ts.JsxElement | ts.JsxSelfClosingElement): Estilo | null {
  const attrs = (ts.isJsxElement(el) ? el.openingElement : el).attributes.properties
  const s = attrs.find((a): a is ts.JsxAttribute => ts.isJsxAttribute(a) && a.name.getText() === 'style')
  const e = s?.initializer && ts.isJsxExpression(s.initializer) ? s.initializer.expression : undefined
  if (!e || !ts.isObjectLiteralExpression(e)) return null
  const o: Estilo = {}
  for (const p of e.properties) {
    if (ts.isPropertyAssignment(p)) o[p.name.getText()] = p.initializer.getText().replace(/['"]/g, '')
  }
  return o
}

const overflowDe = (s: Estilo) => s.overflowY ?? s.overflow ?? ''
const esCuerpoQueScrollea = (s: Estilo | null) =>
  !!s && s.flexDirection === 'column' && /^(auto|scroll)$/.test(overflowDe(s))
const seEncogeRecortando = (s: Estilo | null) =>
  !!s && /^(hidden|auto|scroll)$/.test(overflowDe(s)) && s.flexShrink !== '0' && !s.minHeight

/** Hijos que ocupan lugar en el layout del padre: atraviesa fragments, `&&`,
 *  ternarios y `.map(...)`, que no generan caja propia. */
function hijosDeLayout(padre: ts.JsxElement) {
  const out: (ts.JsxElement | ts.JsxSelfClosingElement)[] = []
  const visitar = (n: ts.Node | undefined): void => {
    if (!n) return
    if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n)) { out.push(n); return }
    if (ts.isJsxFragment(n)) { n.children.forEach(visitar); return }
    if (ts.isJsxExpression(n) || ts.isParenthesizedExpression(n)) { visitar(n.expression); return }
    if (ts.isBinaryExpression(n)) { visitar(n.right); return }
    if (ts.isConditionalExpression(n)) { visitar(n.whenTrue); visitar(n.whenFalse); return }
    if (ts.isCallExpression(n)) {
      n.arguments.forEach((a) => { if (ts.isArrowFunction(a)) visitar(a.body) })
    }
  }
  padre.children.forEach(visitar)
  return out
}

/** Devuelve `archivo:línea` de cada hijo que tiene la forma del defecto. */
function detectar(nombre: string, codigo: string): string[] {
  const sf = ts.createSourceFile(nombre, codigo, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const hallazgos: string[] = []
  const recorrer = (n: ts.Node): void => {
    if (ts.isJsxElement(n) && esCuerpoQueScrollea(estilo(n))) {
      for (const h of hijosDeLayout(n)) {
        if (seEncogeRecortando(estilo(h))) {
          hallazgos.push(`${nombre}:${sf.getLineAndCharacterOfPosition(h.getStart()).line + 1}`)
        }
      }
    }
    ts.forEachChild(n, recorrer)
  }
  recorrer(sf)
  return hallazgos
}

function tsxs(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? tsxs(p) : p.endsWith('.tsx') ? [p] : []
  })
}

// Un cuerpo con la forma exacta del detalle de compra ANTES del arreglo.
const CON_DEFECTO = `
  const M = () => (
    <div style={{ padding: 22, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {cargando ? <div>…</div> : (
        <>
          <div style={{ display: 'grid' }}>meta</div>
          <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
            <table />
          </div>
        </>
      )}
    </div>
  )`

describe('modales: una caja que recorta no se encoge dentro de un cuerpo con scroll', () => {
  it('🔴 ningún archivo de src/ tiene la forma del defecto de la compra #81', () => {
    const hallazgos = tsxs('src').flatMap((f) => detectar(f.replace(/\\/g, '/'), readFileSync(f, 'utf8')))
    expect(
      hallazgos.join(', ') || 'ninguno',
      'estas cajas con overflow son hijas directas de un cuerpo flex en columna que ' +
      'scrollea: con muchas filas se ENCOGEN y recortan en vez de dejar scrollear. ' +
      'Agregales `flexShrink: 0`',
    ).toBe('ninguno')
  })

  it('CONTROL POSITIVO — el detector encuentra la forma del defecto', () => {
    // Sin esto, un detector que no encontrara nada daría «ninguno» arriba y
    // pasaría. El sujeto vive ACÁ, no en un archivo del producto: si viviera
    // allá, arreglarlo mataría el control.
    expect(detectar('fixture.tsx', CON_DEFECTO)).toEqual(['fixture.tsx:7'])
  })

  it('CONTROL NEGATIVO — con flexShrink 0 la misma caja NO se marca', () => {
    // Sin esto, un detector que marcara TODA caja con overflow pasaría el
    // control positivo igual.
    const arreglado = CON_DEFECTO.replace("overflow: 'hidden' }}", "overflow: 'hidden', flexShrink: 0 }}")
    expect(arreglado).not.toBe(CON_DEFECTO)
    expect(detectar('fixture.tsx', arreglado)).toEqual([])
  })
})
