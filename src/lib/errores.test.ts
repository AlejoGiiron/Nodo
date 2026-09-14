import { describe, it, expect } from 'vitest'
import { mensajeDeError, campoDuplicado } from './errores'

describe('mensajeDeError', () => {
  it('saca el message de un Error', () => {
    expect(mensajeDeError(new Error('Abri la jornada'), 'genérico')).toBe('Abri la jornada')
  })

  // El caso que hizo existir la función: el error de `supabase.rpc()` en el
  // camino real NO es `instanceof Error`. Sin esto, todo guard de la base caía
  // en el genérico.
  it('saca el message de un objeto que NO es Error', () => {
    const comoPostgrest = { message: 'No autorizado para ajustar inventario', code: 'P0001' }
    expect(mensajeDeError(comoPostgrest, 'genérico')).toBe('No autorizado para ajustar inventario')
  })

  it('cae al fallback cuando no hay message utilizable', () => {
    expect(mensajeDeError({ message: '' }, 'genérico')).toBe('genérico')
    expect(mensajeDeError(null, 'genérico')).toBe('genérico')
  })
})

describe('campoDuplicado', () => {
  // 23505 = unique_violation. Postgres pone el NOMBRE DEL ÍNDICE en el mensaje,
  // y de ahí sale qué campo nombrar: con más de un índice único en juego, el
  // código de error solo no alcanza para saber qué se repitió.
  // ⏸️ El segundo índice de `products` era el del CÓDIGO y se retiró el
  //    2026-09-14 (revisión de la deuda 41). El mecanismo queda: `categories`
  //    y `products` siguen teniendo el suyo de nombre.
  const dup = (indice: string) => ({
    code: '23505',
    message: `duplicate key value violates unique constraint "${indice}"`,
  })

  it('reconoce los índices de NOMBRE, que son los que quedan', () => {
    expect(campoDuplicado(dup('products_nombre_unico_por_sede'))).toBe('nombre')
    expect(campoDuplicado(dup('categories_nombre_unico_por_sede'))).toBe('nombre')
  })

  // 🔴 EL CÓDIGO YA NO ES ÚNICO — y este caso existe para que eso sea una
  //    DECISIÓN visible y no un olvido. El 2026-09-14 se revisó la decisión A
  //    de la deuda 41 y se retiró `products_codigo_unico_por_sede`: el cliente
  //    usa el código como código de LÍNEA (sus cuatro galletas Mr Cream
  //    comparten `004-6` a propósito), así que dos productos pueden compartirlo.
  //
  // ⚠️ Si alguien repone un índice único sobre el código, este caso se pone ROJO
  //    y eso es lo correcto: obliga a decidir de nuevo en vez de heredar un
  //    mensaje. Y mientras no exista, el helper cae a `'otro'` —genérico, sin
  //    nombrar campo— en vez de mentir diciendo «nombre».
  it('🔴 el código NO tiene índice único: si esto se pone rojo, alguien lo repuso', () => {
    expect(
      campoDuplicado(dup('products_codigo_unico_por_sede')),
      'volvió a existir un índice único sobre `codigo`. Eso revierte la revisión ' +
      'de la deuda 41 (2026-09-14), donde se midió que el cliente comparte códigos ' +
      'a propósito: 3 códigos en 8 productos. Decidilo, no lo heredes.',
    ).toBe('otro')
  })

  // 🔴 TRIPWIRE DEL OTRO LADO (R1). Los nombres de los índices viven en las
  //    migraciones `20260904120000_nombre_unico_por_sede.sql` y
  //    `20260907120000_codigo_y_unidad_de_producto.sql`, y NO hay nada que los
  //    sincronice con la constante de `errores.ts`. Si alguien renombra un
  //    índice, el mensaje vuelve al genérico SIN ponerse rojo — salvo por este
  //    caso, que clava las cadenas vigentes.
  it('🔴 los nombres de índice están clavados · si esto se pone rojo, mirá la migración', () => {
    for (const indice of [
      'products_nombre_unico_por_sede',
      'categories_nombre_unico_por_sede',
    ]) {
      expect(
        campoDuplicado(dup(indice)),
        `«${indice}» dejó de reconocerse: o el índice se renombró en la migración, ` +
        'o la constante INDICES de errores.ts cambió. Son dos lados sin sincronizador.',
      ).not.toBe('otro')
    }
  })

  // 🔴 Un índice único DESCONOCIDO no puede caer a 'nombre': ése sería el mismo
  //    defecto que este helper vino a corregir, con otro disfraz. Da 'otro', y
  //    el consumidor muestra un mensaje que NO nombra ningún campo.
  it('un índice que no reconoce NO se hace pasar por nombre', () => {
    expect(campoDuplicado(dup('products_algo_que_no_existe_todavia'))).toBe('otro')
    expect(campoDuplicado({ code: '23505', message: 'duplicate key value' })).toBe('otro')
  })

  // 🔴 CONTROL NEGATIVO, y es el que hace que los casos de arriba midan algo:
  // si el helper devolviera un campo para cualquier error, el toast diría "ya
  // existe ese nombre" ante un problema de red o un guard de permisos — una
  // advertencia falsa, que induce el error que dice prevenir. Se prueba con los
  // códigos que este mismo camino puede producir de verdad.
  it.each([
    ['P0001', 'raise de un guard de plpgsql'],
    ['42501', 'RLS: insufficient_privilege'],
    ['23503', 'FK: la categoría no existe'],
    ['23514', 'CHECK: price >= 0'],
  ])('NO confunde %s (%s) con una unicidad violada', (code) => {
    expect(campoDuplicado({ code, message: 'products_codigo_unico_por_sede' })).toBeNull()
  })

  it('NO se dispara con un error sin código', () => {
    expect(campoDuplicado(new Error('boom'))).toBeNull()
    expect(campoDuplicado(null)).toBeNull()
    expect(campoDuplicado(undefined)).toBeNull()
  })

  // El código viene como STRING desde PostgREST. Si algún día llegara numérico,
  // este caso deja escrito que hoy no se contempla en vez de que pase callado.
  it('el código es una cadena, no un número', () => {
    expect(campoDuplicado({ code: 23505 })).toBeNull()
  })
})
