/**
 * Formato de moneda del producto — §2 del design system.
 *
 * COP SIN DECIMALES, separador de miles con punto, y **sin símbolo de peso**:
 * en una columna de tabla el encabezado ya dice qué es, y el `$` repetido mil
 * veces solo roba ancho a la cifra.
 *
 * ⚠️ Quedan **16 copias** de un `formatCOP` local repartidas por `src/`
 * — eran 19 antes de Compras — y casi todas imprimen el símbolo de moneda
 * (`style: 'currency'`) que la skill no quiere en columnas de tabla.
 *
 * Para contarlas:
 *
 *     grep -rln "const formatCOP = (" src/ --exclude=formato.ts
 *
 * ⚠️ **Las dos partes del comando importan, y las dos salieron de equivocarse.**
 * · El PARÉNTESIS: sin él el grep cuenta las MENCIONES en comentarios, no solo
 *   las definiciones — dio 18 donde había 16.
 * · El `--exclude`: **este archivo documenta el patrón, así que se cuenta a sí
 *   mismo.** Agregar el paréntesis lo arregló a medias y dio 17.
 *
 * El instrumento contaba su propia documentación, dos veces seguidas. Es la
 * clase de "lo que vive dentro de un string no es una referencia" mordiendo a
 * quien la escribió: un grep no distingue código de prosa, y un conteo que no
 * se verifica ENUMERANDO se cree igual.
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
