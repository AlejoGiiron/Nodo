/**
 * ATAJOS DE TECLADO — fuente única (§5).
 *
 * 🔴 POR QUÉ ES UN MÓDULO Y NO UN `if` EN CADA PANTALLA. El defecto que esto
 * cierra es exactamente R1: el botón del POS imprimía «Cobrar — F12» y **F12 no
 * estaba cableada en ninguna parte** —cero `key === 'F…'` en todo `src/`—. El
 * rótulo y la tecla eran dos lados de un contrato sin nada que los sincronizara,
 * y el lado que se congeló fue el que nadie tocó. Acá el rótulo se DERIVA de
 * esta tabla, así que no puede volver a mentir.
 *
 * ⚠️ Y por eso también viven acá las teclas que NO se cablearon: la tabla dice
 * qué hace cada una **y cuál no hace nada**, en vez de dejar el hueco mudo.
 */

export type AmbitoAtajo =
  /** Anda en toda la aplicación. */
  | 'global'
  /** Sólo con el mostrador en pantalla. */
  | 'mostrador'
  /** Sólo con el cobro abierto — y ahí MANDA sobre el global. */
  | 'cobro'

export interface Atajo {
  tecla: string
  ambito: AmbitoAtajo
  /** Qué hace, en las palabras de §5. */
  que: string
  /** Ruta destino, si el atajo navega. */
  ruta?: string
  /** Medio de pago que selecciona, si el atajo es de cobro. */
  medio?: string
}

/**
 * Las teclas de §5 que HOY hacen algo. Ver `ATAJOS_SIN_DESTINO` para las otras
 * tres — están escritas, no olvidadas.
 */
export const ATAJOS: Atajo[] = [
  { tecla: 'F1',  ambito: 'global',    que: 'Mostrador',      ruta: '/ventas' },
  { tecla: 'F2',  ambito: 'mostrador', que: 'Buscar producto' },
  { tecla: 'F3',  ambito: 'global',    que: 'Compras',        ruta: '/compras' },
  { tecla: 'F5',  ambito: 'global',    que: 'Catálogo',       ruta: '/productos' },
  { tecla: 'F6',  ambito: 'global',    que: 'Clientes',       ruta: '/clientes' },
  { tecla: 'F7',  ambito: 'global',    que: 'Cartera',        ruta: '/fiado' },
  { tecla: 'F9',  ambito: 'global',    que: 'Gastos',         ruta: '/historial-gastos' },
  { tecla: 'F9',  ambito: 'cobro',     que: 'Efectivo',       medio: 'efectivo' },
  { tecla: 'F10', ambito: 'global',    que: 'Inventario',     ruta: '/inventario' },
  { tecla: 'F10', ambito: 'cobro',     que: 'Transferencia',  medio: 'transferencia' },
  { tecla: 'F11', ambito: 'cobro',     que: 'Crédito',        medio: 'fiado' },
  { tecla: 'F12', ambito: 'mostrador', que: 'Cobrar' },
]

/**
 * 🔴 LAS TRES QUE §5 ASIGNA Y NO SE CABLEARON, con su razón. No se inventa un
 * destino: un atajo que lleva a una pantalla parecida es peor que uno muerto,
 * porque el que lo aprieta cree que llegó.
 */
export const ATAJOS_SIN_DESTINO: { tecla: string; que: string; porque: string }[] = [
  {
    tecla: 'F4', que: 'Cambiar cliente',
    porque: 'el mostrador no tiene control de cliente: se elige DENTRO del cobro y sólo para fiado. ' +
            'Ponerlo es la columna de cobro de A6 (D1–D5), no un atajo.',
  },
  {
    tecla: 'F8', que: 'Pedidos',
    porque: 'la pantalla de Pedidos NO EXISTE (A6, clase (c)). Es alcance, no re-skin.',
  },
  {
    tecla: 'F11', que: 'Utilidades',
    porque: 'la pantalla de Utilidades NO EXISTE (A6, clase (c)). La MITAD de cobro de F11 ' +
            '—crédito— sí está cableada.',
  },
]

/**
 * Marcador en el DOM que declara «el cobro está abierto».
 *
 * 🔴 Por qué un atributo del DOM y no un orden de listeners: F9 y F10 tienen dos
 * significados (§5: «Gastos / efectivo», «Inventario / transferencia») y los dos
 * manejadores escuchan en `window`. Resolverlo por orden de suscripción lo
 * ataría al orden de montaje, que cambia solo. El DOM dice qué hay en pantalla,
 * que es la pregunta real.
 */
export const ATRIBUTO_COBRO = 'data-ambito-cobro'

/** ¿Hay un cobro abierto ahora mismo? */
export function hayCobroAbierto(): boolean {
  return document.querySelector(`[${ATRIBUTO_COBRO}]`) != null
}

/** La tecla de una acción, para IMPRIMIRLA sin poder equivocarse. */
export function teclaDe(que: string): string {
  return ATAJOS.find((a) => a.que === que)?.tecla ?? ''
}
