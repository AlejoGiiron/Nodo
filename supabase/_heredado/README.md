# `supabase/_heredado/` — SQL de Vento, **NO aplicable a Nodo**

⛔ **Nada de esta carpeta se ejecuta. No es el esquema de Nodo.**

Son los 45 `.sql` heredados de Vento `d848852` que la consolidación **reemplazó**. El esquema
vigente son los archivos numerados de `supabase/` (`01-…` a `12-…`), más `seed-system-roles.sql`,
que es **generado** desde `src/lib/permissions.ts` y sí está vigente.

## Por qué están acá y no borrados

El plan (`docs/plan-esquema-base.md` §4.2) decidió no conservarlos, con un argumento correcto:
dos descripciones del mismo esquema sin nada que las sincronice es **R1 en su forma más pura**, y
la copia vieja **está desactualizada por diseño**.

Se decidió el 2026-08-31 conservarlos **aislados y rotulados** en vez de borrarlos, por una razón
medida: durante la consolidación, **cuatro veces** algo clasificado resultó ser otra cosa al abrir
el archivo (`_t_priv` no era una tabla, `product_components` no había que renombrarlo, `extras` no
tenía columnas de bar, `subscription_status` no era un enum). Tener el original a mano acortó cada
uno de esos hallazgos.

⚠️ **La carpeta no resuelve el problema que §4.2 señala, solo lo hace visible.** Siguen siendo dos
descripciones; lo único que cambia es que ésta dice en la puerta que no es la buena. Si en algún
momento consultarla deja de aportar, borrarla es un `git rm` y la historia queda igual.

## Cómo se usa

- **Para consultar** por qué algo del esquema base es como es: buscá acá el archivo de origen. Cada
  archivo del esquema base nombra sus fuentes en la cabecera.
- **Para copiar y pegar: no.** Todo lo que debía viajar ya viajó, adaptado. Lo que falta, falta por
  decisión escrita.

## Lo que NO está acá porque sigue vigente

| Qué | Dónde | Por qué |
|---|---|---|
| Esquema base | `supabase/01-…` a `12-…` | Es el esquema de Nodo. |
| `seed-system-roles.sql` | `supabase/` | **Generado** desde `src/lib/permissions.ts` con `pnpm gen:rbac`. No se edita a mano. |
| Edge functions | `supabase/functions/` | `create-user` y `aplicar-estado` viajaron sin cambios (clase A). |

## Advertencia sobre los conteos

Estos archivos contienen **727 ocurrencias de `restaurant_id`** (medido el 2026-08-31). El criterio
de éxito del renombre (deudas #3 y #21) es que el conteo llegue a **cero en `src/` y `tests/`** —
**esta carpeta se excluye**, porque es registro histórico y renombrarla sería reescribir la
referencia que vinimos a conservar.

```bash
# El conteo que importa, con la carpeta excluida:
grep -roh restaurant_id src tests | wc -l
```
