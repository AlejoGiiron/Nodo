import { describe, expect, it } from 'vitest'
import { ALL_PERMISSION_KEYS, PERMISSION_GROUPS, SYSTEM_ROLES } from './permissions'

// ============================================================
// TRIPWIRE DEL CATÁLOGO DE PERMISOS (deuda #6)
//
// Clava las 21 claves como LISTA ORDENADA, no como conteo. La diferencia no es
// de estilo: un `toBe(21)` detecta altas y bajas, pero NO detecta que alguien
// cambió una clave por otra —y eso es justo lo que pasa cuando alguien
// "arregla" un typo en el lugar equivocado—. Un rojo que dijera
// "esperaba 21, recibí 21" con claves distintas es peor que no tener nada.
//
// Por eso el fallo nombra QUÉ clave cambió, en las dos direcciones (baja y
// alta), antes de comparar el orden.
//
// Vive en vitest y no en `tests/roles.spec.ts` a propósito: es una aserción
// sobre un dato del repo, no sobre una pantalla. En Playwright solo se
// dispararía con servidor levantado y backend del lab disponible —un tripwire
// que necesita infraestructura para ponerse rojo no está puesto—. Lo que sí
// queda en el spec E2E es que la UI de Roles renderice TODAS las del catálogo,
// que es la otra mitad y sí necesita navegador.
//
// ⚠️ Si este test se pone rojo: NO actualices la lista para que pase. Primero
// mirá qué clave cambió y por qué; después, si el cambio es intencional,
// movés la lista Y sus consumidores en la misma pasada (R1).
// ============================================================

const CATALOGO_FIJADO = [
  // POS
  'pos.vender',
  'pos.descuento',
  'pos.anular',
  // Caja
  'caja.abrir',
  'caja.cerrar',
  'caja.movimientos',
  // Productos
  'productos.ver',
  'productos.editar',
  // Inventario
  'inventario.ver',
  'inventario.ajustar',
  // Compras
  'compras.gestionar',
  // Cartera — la ETIQUETA del módulo es Cartera; la CLAVE sigue siendo `fiado`
  // a propósito (la consumen la RPC, dos policies y tres pantallas).
  'fiado.gestionar',
  // Ventas
  'ventas.historial',
  'ventas.anular',
  // Reportes
  'reportes.financiero',
  'reportes.stock',
  'reportes.consolidado',
  // Configuración
  'config.acceder',
  'usuarios.gestionar',
  'sedes.gestionar',
  'roles.gestionar',
]

const lista = (xs: readonly string[]) => (xs.length ? xs.join(', ') : 'ninguna')

describe('catálogo de permisos — tripwire', () => {
  it('no desapareció ninguna clave fijada', () => {
    const bajas = CATALOGO_FIJADO.filter(k => !ALL_PERMISSION_KEYS.includes(k))
    // La aserción se hace sobre un STRING y no sobre el array para que el rojo
    // muestre el nombre de la clave y no un diff de 21 elementos.
    expect(`claves que DESAPARECIERON del catálogo: ${lista(bajas)}`)
      .toBe('claves que DESAPARECIERON del catálogo: ninguna')
  })

  it('no apareció ninguna clave sin fijarse', () => {
    const altas = ALL_PERMISSION_KEYS.filter(k => !CATALOGO_FIJADO.includes(k))
    expect(`claves NUEVAS que no están fijadas acá: ${lista(altas)}`)
      .toBe('claves NUEVAS que no están fijadas acá: ninguna')
  })

  it('el catálogo es exactamente la lista fijada, en el mismo orden', () => {
    // Una sustitución (una baja + un alta) ya salió roja arriba con los dos
    // nombres. Esto agrega lo único que falta: el ORDEN, que es el que ve el
    // usuario en la matriz de Roles.
    expect(ALL_PERMISSION_KEYS).toEqual(CATALOGO_FIJADO)
  })

  it('no hay claves duplicadas', () => {
    const vistas = new Set<string>()
    const dups = ALL_PERMISSION_KEYS.filter(k => (vistas.has(k) ? true : (vistas.add(k), false)))
    expect(`claves duplicadas: ${lista(dups)}`).toBe('claves duplicadas: ninguna')
  })

  it('cada clave pertenece a un solo módulo', () => {
    const porClave = new Map<string, string[]>()
    for (const g of PERMISSION_GROUPS)
      for (const p of g.perms) porClave.set(p.key, [...(porClave.get(p.key) ?? []), g.module])
    const repetidas = [...porClave.entries()]
      .filter(([, mods]) => mods.length > 1)
      .map(([k, mods]) => `${k} (${mods.join(' + ')})`)
    expect(`claves en más de un módulo: ${lista(repetidas)}`)
      .toBe('claves en más de un módulo: ninguna')
  })
})

describe('roles de sistema', () => {
  it('admin es DERIVADO del catálogo, nunca enumerado', () => {
    // No es tautología: lo que se verifica es que nadie haya reemplazado la
    // referencia derivada por una lista pegada a mano, que es exactamente el
    // defecto que dejó las 4 copias de Vento con 16/20/18/23.
    expect(SYSTEM_ROLES.admin).toBe(ALL_PERMISSION_KEYS)
  })

  it('todo permiso de un rol de sistema existe en el catálogo', () => {
    const huerfanos = Object.entries(SYSTEM_ROLES).flatMap(([rol, perms]) =>
      perms.filter(p => p !== '*' && !ALL_PERMISSION_KEYS.includes(p)).map(p => `${rol}: ${p}`),
    )
    expect(`permisos de rol que NO existen en el catálogo: ${lista(huerfanos)}`)
      .toBe('permisos de rol que NO existen en el catálogo: ninguna')
  })
})
