# Paso 0 · Las ocho funciones duplicadas — diff, elección y razón

*2026-08-31. Primer paso del prompt 3, **antes de escribir una línea del esquema base**. Se
commitea solo, a propósito: es la decisión más cara de la consolidación y se revisa aparte.*

---

## Por qué este paso existe

Ocho funciones están definidas en **dos archivos cada una** (hallazgo H5 de
`docs/plan-esquema-base.md`). Hoy no hay conflicto porque el **orden de aplicación** decide cuál
queda: la última en correr pisa a la anterior.

**Al consolidar, ese orden desaparece.** Hay que elegir a mano, y **elegir mal no da error**: da un
`has_permission` que no verifica `is_active`, un `enforce_profile_organization` que evalúa datos
filtrados por RLS, o un alta de ítems que no descuenta stock. Los tres fallan **callados**, que es
el perfil que este proyecto ya pagó.

### El criterio, y los dos criterios prohibidos

⛔ **NO se elige por fecha.** "Es la más reciente" no es evidencia de que sea la buena: es evidencia
de que se aplicó después. En un repo donde el orden de aplicación es justo lo que se está
descartando, usarlo como criterio es circular.

⛔ **NO se elige por archivo.** "Gana la del archivo `fix-*`" es la misma falacia con otro nombre.
El nombre del archivo es una pista para mirar, no una razón para decidir.

✅ **Se elige por lo que hace el cuerpo**, comparando las dos definiciones y nombrando qué agrega o
quita cada una. Cuando la diferencia es una **regla de negocio** y no un defecto técnico, no se
elige: **se pregunta** (pasó dos veces, ver pares 7 y 8).

---

## Resumen

| # | Función | Gana | Clase de la diferencia |
|---|---|---|---|
| 1 | `enforce_profile_organization` | `fix-enforce-profile-organization-definer` | R6 · el invariante dependía de quién mira |
| 2 | `has_permission` | `profiles-is-active-enforced` | fail-open · usuario inactivo conservaba permisos |
| 3 | `get_my_role` | `profiles-is-active-enforced` | ídem |
| 4 | `get_my_restaurant_id` | `profiles-is-active-enforced` | ídem |
| 5 | `get_my_organization_id` | `profiles-is-active-enforced` | ídem |
| 6 | `handle_new_user` | `profiles-organization-invariant` | fail-closed + derivar por id, no recibir |
| 7 | `register_purchase` | `compra-no-toca-caja` | 🔴 **regla de negocio — preguntado** |
| 8 | `add_order_items_with_extras` | `order-items-stock-recipes` (adaptada) | 🔴 **modelo de datos — preguntado** |

Las ocho coinciden con la presunción "gana la v2" de H5 — **pero eso se sabe recién ahora, después
de mirarlas.** En dos de los ocho la v2 gana por razones distintas de las que la presunción
suponía, y en dos gana **con cambios**, no tal cual.

---

## 1 · `enforce_profile_organization`

| | `profiles-organization-invariant.sql` | `fix-...-definer.sql` |
|---|---|---|
| `security definer` | **no** | **sí** |
| `revoke execute from public/anon` | no | **sí** |
| cuerpo | idéntico | idéntico |

**Gana la del `fix`.** Sin `SECURITY DEFINER`, el `select` sobre `restaurants` pasa por RLS y la
función evalúa **datos filtrados por el observador** — y la organización de una sede es la misma la
mire quien la mire (**R6**). El modo de fallo es rechazar operaciones válidas con un mensaje que
apunta al lugar equivocado. Ya se pagó una vez en G-Vento; ese archivo **es** la evidencia de R6.

Y agrega los `revoke execute`, que en una función `SECURITY DEFINER` no es cosmético: Postgres
concede `EXECUTE` a `PUBLIC` por defecto en toda función nueva.

⚠️ **Trampa verificada, y por poco no la veo.** `profiles-organization-invariant.sql` **sí contiene**
un `security definer` — pero pertenece a `handle_new_user`, otra función del mismo archivo.
Grepear el modificador sin mirar **de quién es** da la respuesta contraria. Es R4 en la escala de
un `grep`: el proxy no es la cosa.

## 2 · `has_permission`

```sql
-- multi-tenant-rbac.sql                  -- profiles-is-active-enforced.sql
where p.id = auth.uid()                   where p.id = auth.uid()
  and r.permissions ? perm                  and p.is_active
                                            and (r.permissions ? perm
                                                 or r.permissions ? '*')
```

**Gana `profiles-is-active-enforced`,** y agrega **dos** cosas, no una:

1. **`p.is_active`** — sin esto, desactivar un usuario **no le quita los permisos**. Fail-open: la
   UI lo muestra inactivo y la base lo sigue autorizando.
2. **`r.permissions ? '*'`** — el comodín del owner. **Sin esto, un owner cuyo rol tiene `'*'` se
   queda sin ningún permiso.**

⚠️ Lo anoto porque el criterio corto —"la que verifica `is_active`"— **acierta por la razón
incompleta**. Si la v2 hubiera traído solo el comodín y no el `is_active`, ese criterio habría
elegido la v1 y roto a los owners. La elección correcta salió de leer el cuerpo, no la pista.

## 3–5 · `get_my_role` · `get_my_restaurant_id` · `get_my_organization_id`

Los tres son el mismo diff: la v2 agrega `and is_active` al `where`.

**Ganan las tres de `profiles-is-active-enforced`.** El razonamiento no es "es más completa" sino
**hacia dónde falla**: con `is_active`, un usuario desactivado obtiene `null`, y una policy que
compara `restaurant_id = null` da falso y **niega**. Sin `is_active`, el usuario desactivado
**sigue resolviendo su sede** y las policies lo dejan operar. Es la diferencia entre fail-closed y
fail-open, en una línea.

⚠️ Van los tres juntos **a propósito**: son la misma clase (R3). Arreglar `has_permission` y
olvidar `get_my_restaurant_id` deja al usuario desactivado sin permisos nominales pero con acceso
a los datos de su sede — peor que no haberlo tocado, porque el arreglo parcial da la sensación de
estar cubierto.

## 6 · `handle_new_user`

| | `schema.sql` | `profiles-organization-invariant.sql` |
|---|---|---|
| `restaurant_id` ausente | inserta `null` | **excepción** con `hint` de cómo crear el usuario |
| sede inexistente | no se verifica | **excepción** |
| sede sin organización | no se verifica | **excepción** |
| `organization_id` | **no se escribe** | **derivado de la sede** |
| `revoke execute` | no | **sí** |

**Gana `profiles-organization-invariant`.** Tres guards **fail-closed** donde la v1 seguía adelante,
y sobre todo: `organization_id` se **deriva de la sede** en vez de recibirse del metadata del
usuario. Es el objetivo fijado **por id contra la fuente de verdad**, no aceptado de quien llama —
si se recibiera, un metadata mal armado crearía un perfil en la organización equivocada, que es
"borra/expone datos ajenos" en su versión silenciosa.

## 7 · `register_purchase` — 🔴 diferencia de NEGOCIO, preguntada

| | `compras-proveedores.sql` | `compra-no-toca-caja.sql` |
|---|---|---|
| pago en efectivo | crea `cash_movement('out')` si hay turno abierto | **no toca la caja** |
| retorno | `{invoice_id, total, cash_movement_created, shift_open}` | `{invoice_id, total}` |
| factura, ítems, stock, `cost_price` | sí | sí (igual) |

**No la decidí yo: la diferencia no es un defecto técnico, es una regla del cliente de G-Vento**
("el efectivo que sale del cajón lo registra el cajero como egreso MANUAL, que admite monto
parcial"). Heredar en silencio una decisión de negocio ajena es exactamente la premisa que el
diagnóstico advierte.

✅ **Respuesta (2026-08-31): entra la v2, y la regla queda como premisa A RECONFIRMAR con el
cliente de G-Nexo, no como hecho.**

**Evidencia técnica que respalda la elección, independiente de la regla:** el frontend heredado
**ya está alineado con la v2** — `RegisterPurchaseResult` en `src/lib/supabase-helpers.ts` es
`{invoice_id, total}`, sin flags de caja. Elegir la v1 rompería el front.

⚠️ **Defecto encontrado de paso:** el comentario de `registerPurchase`, tres líneas debajo de esa
interfaz, todavía dice *"si es efectivo con turno abierto, genera el egreso de caja"* — describe la
**v1** y contradice al tipo que tiene encima. Una nota que dirige mal. Se corrige al consolidar.

## 8 · `add_order_items_with_extras` — 🔴 diferencia de MODELO DE DATOS, preguntada

| | `order-extras-rpc.sql` | `order-items-stock-recipes.sql` |
|---|---|---|
| inserta ítems y extras | sí | sí |
| descuenta stock del producto simple | resta `stock_qty` a secas | resta **y audita** en `stock_movements` |
| producto compuesto | **no existe** | explota `product_components` y descuenta cada componente |
| auditoría | ninguna | `stock_movements('sale', -qty, reference_id)` |

**Gana `order-items-stock-recipes`** por la auditoría: sin `stock_movements` el stock cambia y
**no queda rastro de por qué**, que es el fallo silencioso de siempre. Pero no entra tal cual,
porque su rama `composite` depende de `product_components` — clasificado **B (recetas)**, y G-Nexo
no tiene recetas.

✅ **Respuesta (2026-08-31): la rama `composite` SE CONSERVA, renombrada a bulto/unidad.**

**Razón:** `CLAUDE.md` ya dice que en G-Nexo **la unidad de compra difiere de la de venta** —se
compra por bulto, se vende por unidad—, y eso es **estructuralmente el mismo mecanismo**: un
producto que al moverse descuenta N unidades de otro. La receta y el bulto son la misma relación
con distinto nombre de negocio.

🔴 **Consecuencia para el plan de esquema:** `product_components` **pasa de clase B a clase C**. Es
el **cuarto** caso del mismo patrón —`extras`, `waiter_performance`, turnos y ahora recetas—:
**suena a bar y sostiene peso.** El patrón ya no es anecdótico: **antes de podar algo por su
nombre, hay que mirar qué cuelga de él.**

---

## Consecuencias, para que no queden sueltas

1. `product_components` deja de descartarse: entra al archivo `07-inventario.sql` renombrado.
   `docs/plan-esquema-base.md` §2 y §4.1 quedan desactualizados en ese punto.
2. La regla "la compra no toca la caja" es **premisa heredada a reconfirmar**, no decisión de
   G-Nexo. Va a deudas.
3. El comentario obsoleto de `registerPurchase` se corrige al consolidar.
4. Las seis funciones que **no** se preguntaron ganan todas por el mismo eje —**hacia dónde
   fallan**—, no por ser más nuevas. Si aparece una novena duplicada, ése es el eje a aplicar.
