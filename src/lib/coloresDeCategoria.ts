/**
 * La paleta que el selector de categorías OFRECE, y el default que la BASE
 * escribe. Deuda 91.
 *
 * 🔴 POR QUÉ VIVE ACÁ Y NO EN `CategoryModal.tsx`: son **tres lados sin nada que
 *    los sincronice** —el `default` de `categories.color`, esta lista, y §1.2 del
 *    design system—, y el primero vive en la base. No se pueden unificar los
 *    tres; lo que sí se puede es que los dos de TypeScript sean **uno**, y que
 *    haya un tripwire que grite cuando se separan del tercero.
 *
 * ⚠️ El color de una categoría NO es un estado (§1.2): no afirma «salió bien» ni
 *    «decidí vos». Es una etiqueta que elige el cliente.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * 🔴 POR QUÉ ESTOS OCHO SE VEN APAGADOS, Y POR QUÉ VARIOS COMPARTEN TONO CON UNA
 *    FAMILIA DE ESTADO — SI NO LEÉS ESTO, PARECEN MAL ELEGIDOS.
 *    *Reemplazan a la paleta heredada de Vento el 2026-09-04.*
 *
 * **El eje NO puede ser el tono, y es geometría, no gusto.** Medido sobre
 * `src/tokens.css`: §1.2 ocupa cinco familias —action 200°, success 160°,
 * warning 38°, danger 0°, debt 345°— y a 25° de cada una queda libre el **47%
 * del círculo, en DOS tramos**:
 *
 *     63° – 135°   (73°)   ← verde. Aunque esté lejos de --success, SE LEE como
 *                            confirmación: el tramo es libre en el papel y no
 *                            en el ojo.
 *     225° – 320°  (96°)   ← el único realmente utilizable.
 *
 * **En 96° no entran ocho tonos distinguibles** (serían 13° de separación).
 * Así que elegir «mejores tonos» no es una opción disponible: no existe la
 * paleta de ocho que evite las cinco familias.
 *
 * ✅ **LA SATURACIÓN ES EL ÚNICO EJE QUE QUEDA, y alcanza.** Los tokens plenos
 *    de §1.2 van de **71% a 95%**. Estos ocho están al **44%**. Un `jade` al 44%
 *    al lado de un `--success-700` al 84% no se confunde con él.
 *
 * 📋 **Y el precedente está adentro del propio sistema:** `--action-soft`
 *    (#e0f2fe) y `--action` (#0284c7) comparten tono y nadie los lee como lo
 *    mismo. §1.2 dice que una categoría no se pinta con **la paleta** de los
 *    estados — y «la paleta» son los TOKENS, no el tono.
 *
 * ⚠️ **Se evaluó bajar a seis** —sacando `jade` (159°) y `petróleo` (202°), los
 *    dos que caen sobre el tono de una familia—. Se descartó: costaba dos
 *    categorías distinguibles y **Muscle Pro tiene ocho**.
 *
 * 📐 **Lo que los ocho cumplen, y es verificable:** cero idénticos a un token ·
 *    contraste ≥ 4,5:1 sobre blanco (`CategoryTabs` los usa como TEXTO) ·
 *    36° mínimo entre sí.
 * ════════════════════════════════════════════════════════════════════════════
 */

/** Las ocho que el selector ofrece. El orden importa: la primera es la que
 *  toma toda categoría NUEVA creada desde la pantalla. */
export const CATEGORY_COLORS: readonly string[] = [
  '#7e3c9a', // violeta   282°  ← el más lejano de toda familia (62°): por eso va primero
  '#453c9a', // índigo    246°
  '#3c789a', // petróleo  202°  ⚠️ tono de --action, separado por saturación
  '#338467', // jade      159°  ⚠️ tono de --success, separado por saturación
  '#4c8132', // oliva     100°
  '#79772f', // ocre       58°
  '#9a523c', // ladrillo   14°
  '#9a3c75', // ciruela   324°
] as const

/**
 * El `default` de `categories.color` en la base — el valor que toma una
 * categoría insertada SIN color (hoy, las fixtures de los E2E).
 *
 * 🔴 ESTE VALOR ESTÁ DUPLICADO EN UNA MIGRACIÓN Y NO HAY FORMA DE DERIVARLO:
 *    Postgres no puede leer TypeScript. Lo que sí hay es el tripwire de
 *    `coloresDeCategoria.test.ts`, que falla si deja de pertenecer a la paleta —
 *    que es exactamente el defecto que la deuda 91 midió: **164 categorías del
 *    lab con un color que su propio selector no ofrece.**
 *
 * 📋 El otro lado: `supabase/migrations/20260904160000_default_color_categoria.sql`.
 *    Si cambia acá, cambia allá — con una migración nueva (R5) **si esa ya se
 *    aplicó**.
 */
export const COLOR_POR_DEFECTO_EN_LA_BASE = '#7e3c9a'
