/**
 * Formato de moneda del producto — §2 del design system.
 *
 * COP SIN DECIMALES, separador de miles con punto, y **sin símbolo de peso**:
 * en una columna de tabla el encabezado ya dice qué es, y el `$` repetido mil
 * veces solo roba ancho a la cifra.
 *
 * ⚠️ Hay **20 copias** de un `formatCOP` local repartidas por `src/`
 * (`grep -rl "const formatCOP" src/`), y **19 de las 20 imprimen el símbolo de
 * moneda** (`style: 'currency'`) que la skill no quiere en columnas de tabla.
 * Es la misma clase que las 11 copias de `err instanceof Error`: un contrato de
 * formato sin nada que lo sincronice (R1).
 *
 * No se barren de un saque a propósito: cada copia muere cuando SU pantalla
 * migra a `MoneyCell`, que es donde se puede mirar que la cifra sigue
 * leyéndose igual. Barrer las 20 ahora seria cambiar veinte pantallas sin
 * abrir ninguna — el corolario de clasificación en su version cara.
 */
const FORMATO = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 })

export const formatoCOP = (n: number) => FORMATO.format(n)
