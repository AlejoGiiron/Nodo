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
 */

/** Las ocho que el selector ofrece. El orden importa: la primera es la que
 *  toma toda categoría NUEVA creada desde la pantalla. */
export const CATEGORY_COLORS: readonly string[] = [
  '#10b981',
  '#059669',
  '#2563eb',
  '#7c3aed',
  '#db2777',
  '#d97706',
  '#0891b2',
  '#64748b',
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
 *    Si cambia acá, cambia allá — con una migración nueva (R5).
 */
export const COLOR_POR_DEFECTO_EN_LA_BASE = '#7c3aed'
