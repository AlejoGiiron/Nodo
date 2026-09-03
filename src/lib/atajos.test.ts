import { describe, it, expect } from 'vitest'
import { esCampoDeEscritura, ATRIBUTO_LETRAS_INERTES, ATAJOS, ATAJOS_SIN_DESTINO } from './atajos'

// ============================================================================
// DÓNDE MANDA UNA LETRA Y DÓNDE SE ESCRIBE
//
// 🔴 Los medios de pago se atajan con letras sueltas (E · T · C) y no con
//    dígitos porque el campo de dinero del cobro tiene `autoFocus`: al cobrar,
//    el foco vive POR DISEÑO dentro de un control que consume dígitos. Ese mismo
//    campo descarta las letras, así que E/T/C pueden mandar con el foco adentro.
//
//    Esa excepción es la que hay que acotar bien: si la letra mandara también en
//    un campo de TEXTO, escribir «efectivo» en el motivo de un descuento
//    cambiaría el medio de pago tres veces.
//
// ⚠️ La decisión es POR TIPO y el default PROTEGE. Se probó así —y no con una
//    lista de campos conocidos— porque una lista se congela: el próximo input
//    del mostrador nacería sin protección y nadie se enteraría hasta que alguien
//    escribiera una «e».
// ============================================================================

/** Elemento falso: acá el sujeto es la REGLA, no el DOM. */
function elemento(tag: string, opciones: {
  type?: string
  contentEditable?: boolean
  inerte?: boolean
} = {}): Element {
  const attrs = new Set<string>()
  if (opciones.inerte) attrs.add(ATRIBUTO_LETRAS_INERTES)
  return {
    tagName: tag,
    isContentEditable: opciones.contentEditable ?? false,
    type: opciones.type ?? 'text',
    hasAttribute: (n: string) => attrs.has(n),
  } as unknown as Element
}

describe('esCampoDeEscritura', () => {
  it('sin foco, no se está escribiendo', () => {
    expect(esCampoDeEscritura(null)).toBe(false)
  })

  it('un campo de TEXTO está escribiendo: ahí la letra se teclea, no manda', () => {
    expect(esCampoDeEscritura(elemento('INPUT', { type: 'text' }))).toBe(true)
    expect(esCampoDeEscritura(elemento('INPUT', { type: 'search' }))).toBe(true)
    expect(esCampoDeEscritura(elemento('INPUT', { type: 'email' }))).toBe(true)
    expect(esCampoDeEscritura(elemento('TEXTAREA'))).toBe(true)
    expect(esCampoDeEscritura(elemento('DIV', { contentEditable: true }))).toBe(true)
  })

  it('un control que NO escribe deja pasar el atajo', () => {
    expect(esCampoDeEscritura(elemento('INPUT', { type: 'checkbox' }))).toBe(false)
    expect(esCampoDeEscritura(elemento('INPUT', { type: 'radio' }))).toBe(false)
    expect(esCampoDeEscritura(elemento('INPUT', { type: 'button' }))).toBe(false)
    expect(esCampoDeEscritura(elemento('BUTTON'))).toBe(false)
    expect(esCampoDeEscritura(elemento('DIV'))).toBe(false)
  })

  it('🔴 el campo que DECLARA las letras inertes deja mandar al atajo', () => {
    // La excepción entera: es el campo de dinero, y es la razón por la que los
    // atajos de cobro son letras y no dígitos.
    const campoDeDinero = elemento('INPUT', { type: 'text', inerte: true })
    expect(esCampoDeEscritura(campoDeDinero)).toBe(false)
    // Y el control: el MISMO campo sin la declaración protege.
    expect(esCampoDeEscritura(elemento('INPUT', { type: 'text' }))).toBe(true)
  })

  it('🔴 un tipo desconocido se trata como escritura: el default PROTEGE', () => {
    // Es la mitad que hace que esto no sea una lista disfrazada. Un `<input>` de
    // un tipo que hoy no existe —o uno que alguien agregue mañana sin leer
    // esto— nace protegido, y para dejar pasar el atajo hay que DECLARARLO.
    expect(esCampoDeEscritura(elemento('INPUT', { type: 'un-tipo-que-no-existe' }))).toBe(true)
  })
})

describe('la tabla de atajos', () => {
  it('🔴 ninguna tecla tiene dos significados en el mismo ámbito', () => {
    // El defecto que la corrección de §5 vino a cerrar: «F9 Gastos / efectivo»
    // sólo funcionaba porque el cobro era un modal y el modal creaba un modo.
    const vistas = new Set<string>()
    const repetidas: string[] = []
    for (const a of ATAJOS) {
      const clave = `${a.ambito}:${a.tecla}`
      if (vistas.has(clave)) repetidas.push(clave)
      vistas.add(clave)
    }
    expect(repetidas.join(', ') || 'ninguna').toBe('ninguna')
  })

  it('🔴 una tecla no puede estar cableada Y declarada sin destino', () => {
    // Si aparece en las dos listas, una de las dos miente — y la que se lee al
    // planificar es la de sin destino.
    const cableadas = new Set(ATAJOS.map((a) => a.tecla))
    const enConflicto = ATAJOS_SIN_DESTINO.filter((a) => cableadas.has(a.tecla)).map((a) => a.tecla)
    expect(enConflicto.join(', ') || 'ninguna').toBe('ninguna')
  })

  it('los medios de pago NO usan teclas de función', () => {
    // La decisión del 2026-09-03, aseverada: las de función navegan y nada más.
    //
    // 🔴 SE FILTRA POR `medio`, NO POR ÁMBITO — corregido el 2026-09-03 cuando
    //    este caso se puso rojo con F4. **El producto no se rompió: el filtro
    //    era un PROXY.** «Ámbito cobro» y «es un medio de pago» coincidían
    //    exactamente hasta que F4 —«cambiar cliente»— se mudó adentro del modal
    //    y pasó a ser del ámbito del cobro sin ser un medio.
    //    El sujeto del caso siempre fue el MEDIO; el ámbito era la forma cómoda
    //    de nombrarlo. Es la misma clase que clasificar leyendo el nombre en vez
    //    de abrir el archivo: un buen proxy, y por eso engaña.
    const medios = ATAJOS.filter((a) => a.medio != null).map((a) => a.tecla)
    expect(medios.filter((t) => /^F\d+$/.test(t)).join(', ') || 'ninguna').toBe('ninguna')
    expect(medios.sort()).toEqual(['c', 'e', 't'])

    // Y el control de que el filtro nuevo no se aflojó: el ámbito del cobro
    // tiene los tres medios MÁS F4, que es lo que acaba de cambiar.
    const deCobro = ATAJOS.filter((a) => a.ambito === 'cobro').map((a) => a.tecla).sort()
    expect(deCobro, 'F4 vive en el ámbito del cobro y NO es un medio de pago')
      .toEqual(['F4', 'c', 'e', 't'])
  })
})
