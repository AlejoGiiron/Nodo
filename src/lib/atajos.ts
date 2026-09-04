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
  // F4 entró el 2026-09-03 con el cobro en línea, y **se quedó cuando el cobro
  // volvió al modal** — cambió a qué apunta, no si apunta. Hoy pone el foco en
  // el BUSCADOR DE CLIENTES del modal: el picker muestra la lista completa con
  // el elegido marcado, así que cambiar de cliente no necesita un botón propio.
  // Ámbito 'cobro' y no 'mostrador' porque el control vive adentro del modal.
  { tecla: 'F4',  ambito: 'cobro', que: 'Cambiar cliente' },
  // Catálogo pasó de F5 a F8 el 2026-09-03: ver `TECLAS_RESERVADAS`. F8 estaba
  // asignada por §5 a Pedidos, que NO EXISTE (deuda 85), así que una tecla
  // reservada para una pantalla inexistente cedió ante una que se usa todos los
  // días. Cuando Pedidos exista se le asigna otra, con la pantalla delante.
  { tecla: 'F8',  ambito: 'global',    que: 'Catálogo',       ruta: '/productos' },
  { tecla: 'F6',  ambito: 'global',    que: 'Clientes',       ruta: '/clientes' },
  { tecla: 'F7',  ambito: 'global',    que: 'Cartera',        ruta: '/fiado' },
  { tecla: 'F9',  ambito: 'global',    que: 'Gastos',         ruta: '/historial-gastos' },
  { tecla: 'F10', ambito: 'global',    que: 'Inventario',     ruta: '/inventario' },
  { tecla: 'F12', ambito: 'mostrador', que: 'Cobrar' },
  // 🔴 LOS MEDIOS DE PAGO NO SON TECLAS DE FUNCIÓN — corrección de §5, 2026-09-03.
  //    La entrega asignaba «F9 Gastos / efectivo», «F10 Inventario /
  //    transferencia» y «F11 Utilidades / crédito», o sea un valor con dos
  //    significados. Se separó: navegar se queda con las F, elegir medio se fue
  //    a E/T/C.
  //
  // ⚠️ UNA DE LAS DOS RAZONES SE MURIÓ AL VOLVER EL COBRO AL MODAL (2026-09-03),
  //    y se deja escrito en vez de dejar el argumento entero en pie. La razón
  //    secundaria era «con el cobro en línea no hay modo, y sin modo el doble
  //    significado no se puede desambiguar»: con el modal de vuelta, **hay modo
  //    otra vez**, así que ese argumento ya no sostiene nada.
  //    La razón PRINCIPAL —la única que se pidió poner en la skill— no depende
  //    de dónde vive el cobro y sigue entera: el campo de dinero tiene
  //    `autoFocus` y consume dígitos, así que `1/2/3` pelearían con el único
  //    control que la cajera está usando; las letras le son inertes. Ver abajo.
  { tecla: 'e', ambito: 'cobro', que: 'Efectivo',      medio: 'efectivo' },
  { tecla: 't', ambito: 'cobro', que: 'Transferencia', medio: 'transferencia' },
  { tecla: 'c', ambito: 'cobro', que: 'Crédito',       medio: 'fiado' },
]

/**
 * 🔴 POR QUÉ LETRAS Y NO DÍGITOS, que es la razón principal y no la mnemotecnia.
 *
 * El campo «Efectivo recibido» tiene `autoFocus`: al cobrar, el foco vive **por
 * diseño** dentro de un control que consume dígitos, así que `1/2/3` pelearían
 * con el único campo que la cajera está usando en ese momento. Ese mismo campo
 * **descarta las letras** —`parseInt(received.replace(/\D/g,''))`, y lo que se
 * pinta es el número formateado—, así que E/T/C pueden funcionar **con el foco
 * adentro** sin quitarle nada a nadie. Ninguna otra opción da esa propiedad.
 *
 * Lo demás estaba tomado, y se enumeró antes de elegir: las doce de función por
 * §5 (F4/F8/F11 incluidas — están ASIGNADAS aunque no cableadas); `Ctrl+1…9` y
 * `Alt+1…9` por el cambio de pestaña del navegador; `Alt` además es el
 * modificador con que §5 revela los atajos; `Ctrl+E/T/C` por omnibox, pestaña
 * nueva y copiar.
 *
 * ⚠️ `T` es ambigua entre **transferencia** y **tarjeta**, y las dos están en la
 * grilla. Se asigna a transferencia porque es la que §5 nombra. **Tarjeta y
 * Nequi quedan SIN atajo** hasta que §5 les asigne uno, que no podrá ser `T`.
 */

/**
 * Atributo con el que un campo DECLARA que las letras le son inertes, y por lo
 * tanto que un atajo de letra puede dispararse con el foco adentro.
 *
 * 🔴 Es opt-in y la ausencia PROTEGE: un input nuevo nace sin el atributo y por
 * lo tanto sin atajos encima. Se decidió así —y no con una lista de ids— porque
 * una lista se congela: el próximo campo de texto nacería desprotegido y nadie
 * se enteraría hasta que alguien escribiera una «e» y se le cambiara el medio de
 * pago. Es R2 sobre el foco: se declara positivamente qué puede pasar.
 */
export const ATRIBUTO_LETRAS_INERTES = 'data-letras-inertes'

/**
 * Tipos de `<input>` en los que **no se escribe**: ahí un atajo de letra no le
 * quita nada a nadie. Allowlist, no denylist — cualquier tipo que no esté acá
 * (incluido uno que el HTML agregue mañana) se trata como campo de escritura.
 */
const CONTROLES_QUE_NO_ESCRIBEN = new Set([
  'button', 'submit', 'reset', 'checkbox', 'radio', 'range', 'color', 'file',
])

/**
 * ¿En este elemento la persona está ESCRIBIENDO?
 *
 * Se decide **por tipo**, no por una lista de campos conocidos: una lista se
 * congela, y el próximo input nacería sin protección. Acá el default PROTEGE —
 * lo que no está declarado como control que no escribe se trata como campo de
 * escritura, incluido un tipo de HTML que no exista todavía.
 *
 * 🔴 Recibe el elemento en vez de leer `document` para poder aseverarlo sin un
 * navegador: la regla de *qué cuenta como escribir* es lo que hay que probar, y
 * el `document.activeElement` es sólo de dónde sale el elemento.
 */
export function esCampoDeEscritura(el: Element | null): boolean {
  if (!el) return false
  if ((el as HTMLElement).isContentEditable) return true
  if (el.tagName === 'TEXTAREA') return true
  if (el.tagName !== 'INPUT') return false
  const input = el as HTMLInputElement
  // El campo que declara que las letras le son inertes deja pasar el atajo.
  if (input.hasAttribute(ATRIBUTO_LETRAS_INERTES)) return false
  return !CONTROLES_QUE_NO_ESCRIBEN.has(input.type)
}

/** ¿El foco está, ahora mismo, en un lugar donde se escribe? */
export function elFocoEstaEscribiendo(): boolean {
  return esCampoDeEscritura(document.activeElement)
}

/**
 * 🔴 LAS TRES QUE §5 ASIGNA Y NO SE CABLEARON, con su razón. No se inventa un
 * destino: un atajo que lleva a una pantalla parecida es peor que uno muerto,
 * porque el que lo aprieta cree que llegó.
 */
export const ATAJOS_SIN_DESTINO: { tecla: string; que: string; porque: string }[] = [
  // ⚠️ PEDIDOS SALIÓ DE ESTA LISTA Y NO PORQUE SE HAYA CABLEADO: perdió su tecla.
  //    F8 pasó a Catálogo el 2026-09-03 al liberarse F5. Pedidos sigue en el
  //    alcance firmado y sigue sin pantalla (deuda 85); cuando exista se le
  //    asigna una tecla entonces, que es cuando se puede elegir mirando el flujo
  //    en vez de reservando a ciegas.
  //    Se anota acá porque «no está en la lista» es indistinguible de «nadie lo
  //    pensó», y lo que pasó fue una decisión.
  // ✅ F4 salió de esta lista el 2026-09-03 y NO volvió cuando el cobro volvió
  //    al modal: su control existe en las dos superficies. Un atajo que lleva a
  //    nada es lo que se acababa de arreglar con F12; devolverlo acá habría sido
  //    pagar el mismo defecto dos veces.
  {
    tecla: 'F11', que: 'Utilidades',
    porque: 'la pantalla de Utilidades NO EXISTE (A6, clase (c)). La MITAD de cobro de F11 ' +
            '—crédito— sí está cableada.',
  },
]

/*
 * 🔴 ACÁ VIVÍA `ATRIBUTO_COBRO` / `hayCobroAbierto()`, Y SE BORRÓ A PROPÓSITO.
 *
 * Era un marcador en el DOM para desambiguar F9 y F10 entre navegar y elegir
 * medio de pago. **Al darle a cada tecla un solo significado, la ambigüedad
 * desapareció y el mecanismo que la resolvía se quedó sin trabajo.** Se anota en
 * negativo porque es el resultado que buscábamos: el arreglo correcto de un
 * valor con dos significados no es un desempatador más astuto — es que no haya
 * empate. Los atajos de cobro se suscriben desde el panel de cobro, así que su
 * ámbito lo da el montaje del componente y no una consulta al documento.
 */

/**
 * 🔴 TECLAS QUE EL PRODUCTO NO TOMA, Y POR QUÉ. Decidido el 2026-09-03.
 *
 * No es lo mismo que `ATAJOS_SIN_DESTINO`: aquéllas §5 las asigna y todavía no
 * se cablearon —falta la pantalla—. **Éstas no se van a cablear nunca**, y la
 * razón no es del producto sino del entorno.
 *
 * ⚠️ Y por eso va como LISTA y no como comentario: un comentario que dice «no
 * uses F5» se puede leer sin contestar y se salta en silencio. Esta lista la
 * asevera `atajos.test.ts` —ninguna entrada de `ATAJOS` puede usar una tecla de
 * acá—, así que el día que alguien la reasigne por comodidad, el test lo frena.
 * Es la diferencia entre un guard y un recordatorio, aplicada a una tecla.
 */
export const TECLAS_RESERVADAS: { tecla: string; porque: string }[] = [
  {
    tecla: 'F5',
    porque: 'RECARGAR. Es la tecla más destructiva que hay en una venta a medio ' +
            'armar: el carrito vive en el store del navegador y una recarga accidental ' +
            'la borra. `preventDefault` la ataja mientras el manejador esté montado, pero ' +
            'basta un render sin él —un error de límite, una pantalla nueva que no lo monte— ' +
            'para que la tecla vuelva a recargar SIN aviso. No se toma.',
  },
]

/** La tecla de una acción, para IMPRIMIRLA sin poder equivocarse. */
export function teclaDe(que: string): string {
  return ATAJOS.find((a) => a.que === que)?.tecla ?? ''
}
