import type { Tables } from '@/types/database.types'
import { NIVEL_PRECIO_DEFAULT, type SedeConfig } from './sedeConfig'

/**
 * LISTAS DE PRECIOS — la resolución del nivel y su precio (deuda 101).
 *
 * 🔴 EL NIVEL ES DE LA LÍNEA DE VENTA, NO DEL CLIENTE. En palabras de la
 *    clienta: *«a Alejandro la Joenvina se la vendo a lista 3, pero la Vibro a
 *    lista 1 — en algún producto lo puedo meter caro porque otros proveedores no
 *    lo tienen, pero otro más barato porque estoy compitiendo»*. Un mismo cliente
 *    lleva productos a niveles distintos **en la misma venta**, así que el nivel
 *    del cliente es sólo **dónde arranca** cada línea.
 */

/** Los cinco niveles, en orden. L0 existe y hoy está vacía en todos. */
export const NIVELES = [0, 1, 2, 3, 4] as const
export type Nivel = (typeof NIVELES)[number]

export const esNivel = (n: unknown): n is Nivel =>
  typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 4

/** Etiqueta de pantalla. La clienta dice «lista 3»; el dato es el número. */
export const etiquetaDeNivel = (n: Nivel | number): string => `L${n}`

/** Las filas de `product_prices` que viajan con cada producto. */
export type PrecioDeNivel = Pick<Tables<'product_prices'>, 'nivel' | 'precio'>

/**
 * El precio de un producto en un nivel.
 *
 * 🔴 `null` NO es un error: es **«este nivel no está configurado»**, y es un
 *    estado válido del modelo — por eso las listas son una TABLA y no cinco
 *    columnas. Con columnas nullable, `null` se confundiría con «vale cero», y
 *    `precio >= 0` acepta el cero: *un valor que significa dos cosas no es un
 *    dato*.
 *
 * 🔴 NO HAY FALLBACK A NINGUN OTRO NIVEL — y la primera version de este archivo
 *    SI caia a L1. **Lo corrige el diseño (§7.22):** *«Un nivel puede no tener
 *    precio. Se muestra `—`, no cero. En el carrito la línea no suma hasta que
 *    se elija otro nivel o se escriba el precio a mano.»*
 *
 *    Caer a L1 se sentia prudente y era lo contrario: cotiza la linea a un nivel
 *    QUE NO ES EL PEDIDO y no lo dice. Es la familia de *«un numero plausible es
 *    peor que un hueco visible»* — el mismo argumento con el que este proyecto
 *    dejo `unit_cost` en nulo en vez de inventar un costo.
 */
export function precioDeNivel(
  precios: PrecioDeNivel[] | null | undefined,
  nivel: number,
): number | null {
  if (!precios?.length) return null
  const exacto = precios.find((p) => p.nivel === nivel)
  return exacto ? Number(exacto.precio) : null
}

/** ¿Este producto tiene puesto ESTE nivel, o lo que se muestra es el de L1? */
export const nivelEstaPuesto = (precios: PrecioDeNivel[] | null | undefined, nivel: number) =>
  !!precios?.some((p) => p.nivel === nivel)

/**
 * Dónde ARRANCA la línea: **cliente → sede → L1**.
 *
 * ⚠️ No es fail-closed a propósito. `orders.customer_id` es nullable y la mayoría
 *    de las ventas de mostrador no tienen cliente: exigir una lista para poder
 *    vender rompería el mostrador entero por un caso de borde.
 */
export function nivelInicial(
  cliente: { nivel_default?: number | null } | null | undefined,
  config: SedeConfig | null | undefined,
): Nivel {
  const delCliente = cliente?.nivel_default
  if (esNivel(delCliente)) return delCliente
  const deLaSede = config?.nivel_precio_default
  if (esNivel(deLaSede)) return deLaSede
  return NIVEL_PRECIO_DEFAULT as Nivel
}

/**
 * El MARGEN que resulta de un precio contra el costo, como fracción.
 *
 * 🔴 DERIVADO Y NO PERSISTIDO, y esa es la decisión (2026-09-14): **el precio es
 *    el dato y el porcentaje es la consecuencia.** Se invirtió una propuesta
 *    anterior que derivaba los cinco precios de cinco porcentajes, porque así lo
 *    tiene ella hoy y no se le impone una fórmula que quizá no respete.
 *
 * ⚠️ Persistirlo sería un tercer lado de contrato sin sincronizador: `precio` y
 *    `cost_price` ya están, y el costo se mueve solo en cada compra
 *    (`register_purchase`, promedio ponderado móvil). Un margen guardado quedaría
 *    viejo sin avisar.
 *
 * 📋 La fórmula que ella usó existe MEDIDA —L1 costo×1,15 · L2 ×1,20 · L3 ×1,30 ·
 *    L4 ×1,40, exacta en las 44 filas de su hoja— y **no se implementa**. Queda
 *    anotada en la deuda 101 por si algún día quiere que se calculen solos.
 */
export function margenDelPrecio(precio: number | null, costo: number | null): number | null {
  if (precio === null || costo === null || costo <= 0) return null
  return (precio - costo) / costo
}
