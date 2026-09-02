# A2 · Negación de policies — lo que RLS y las RPC deben negar

*Auditoría del plan `docs/PLAN-2026-09-02.md` §2, corrida el 2026-09-02 contra la base del lab
(`kvyiwiilrzpcjzbqaoow`). **No modifica código ni esquema.** Todo corrió en `begin … rollback`;
la evidencia de que nada persistió está en §1.4.*

> **Veredicto en tres líneas.** La RLS de las **23 tablas** niega todo lo que debe negar: 828 celdas
> medidas, 828 coinciden con la predicción escrita antes de correr, cero accesos cruzados por tabla.
> Las **4 vistas** también. Pero **tres accesos cruzados pasan por otro camino** —dos RPC y el
> traslado de sede—, y los tres estaban **predichos por escrito** antes de ejecutar la sonda:
> **un usuario desactivado escribe en órdenes de cualquier sede y de cualquier organización.**

---

## 0 · La predicción, escrita ANTES de correr

*Generada a las 17:10:22Z por `a2_gen.py`, del modelo de policies transcripto de `pg_policies`.*

| etapa | celdas | predicho permite | predicho niega |
|---|---|---|---|
| 1 · tablas × ops × roles | 828 | 111 | 717 |
| 2 · RPC + escalada | 54 | 17 | 37 |

**Y las tres celdas que predije que PASAN cuando deberían negar**, con la razón escrita antes:

1. **Desactivado + `add_order_items_with_extras`.** El guard es `if v_sede_id <> get_my_sede_id()`. Con
   un perfil inactivo `get_my_sede_id()` devuelve **NULL** (los helpers filtran `is_active`), y en SQL
   `x <> NULL` es NULL, no verdadero: **el `if` no dispara**. No hay `has_permission` después.
2. **Desactivado + `next_order_number`.** Misma forma: `p_sede_id is null or p_sede_id <> get_my_sede_id()`
   → `false or NULL` → NULL → no dispara.
3. **Cajero que se traslada solo de sede.** La policy `profiles: editar el propio` permite el `update`
   de la fila propia y el trigger `protect_profile_self_escalation` protege `role_id`, `role`,
   `is_active` y `organization_id` — **no `sede_id`**. Después del traslado, toda la RLS por sede
   lo sigue a la sede nueva.

*Predicción de conteos del apéndice: si toda la matriz da 0 filas, la sonda está mal; se esperaban
111 permisos en la etapa 1 y todos tenían que ser filas > 0.*

---

## 1 · Método

### 1.1 Impersonación

El precedente de `verificar-rpcs.sql` y de `_t_priv`: `set_config('request.jwt.claims',
'{"sub": <uuid>, "role": "authenticated"}', true)` + `set local role authenticated`. Verificado con una
prueba de humo antes de la matriz: `current_user = authenticated`, `auth.uid()` = el uuid impersonado,
y un `insert` en `organizations` devuelve `42501`.

### 1.2 Tres roles, tres objetivos

| rol | quién | cómo |
|---|---|---|
| **owner** | `owner.test@nodo.test`, rol `owner` (`["*"]`) | impersonado |
| **cajero** | `cajero.test@nodo.test`, rol `cajero` (8 permisos) | impersonado |
| **desactivado** | el mismo owner, tras `update profiles set is_active = false` | dentro de la transacción — el caso más fuerte: el usuario más privilegiado, apagado, con el token todavía vigente |

| objetivo | qué es | de dónde sale |
|---|---|---|
| **A** | mi sede real (`9f9df32e…`), org LAB | existe |
| **B** | otra sede de la **misma** organización | fabricada en la transacción |
| **X** | una sede de **otra** organización | fabricada en la transacción |

🔴 **El lab tiene UNA sede y UNA organización.** La sede cruzada no existía: se fabricó dentro del
`begin`, y con ella una fila en cada una de las 23 tablas para B y para X (más una segunda fila
"borrable" por tabla, para que el `DELETE` no choque con una FK). Dos cajeros e2e se **movieron**
temporalmente a B y a X para tener perfiles cruzados sin crear usuarios en `auth.users`.

### 1.3 Cómo se mide una celda

Cada celda es un sub-bloque plpgsql: ejecuta la sentencia, lee `row_count`, y **si es escritura la
deshace con un `raise exception 'undo'`** capturado por el propio bloque — así una celda no altera la
siguiente. Se registra `filas` y, si hubo error, `sqlstate` + mensaje.

- **SELECT**: `count(*)` de la fila de fixture del objetivo, por PK. *Permite* = 1, *niega* = 0.
- **INSERT / UPDATE / DELETE**: *permite* = `row_count` > 0; *niega* = `row_count` 0 (RLS filtra en
  silencio) o `42501` (`with check` rechaza).
- **RPC**: *permite* = sin excepción; *niega* = excepción, y se guarda el mensaje para saber **qué
  guard** la tiró.

Operaciones: `S·A S·B S·X I·A I·B I·X U·A U·B U·X D·A D·B D·X` — 12 por tabla, 23 tablas, 3 roles.

### 1.4 El instrumento, verificado — y nada persistió

| control | resultado |
|---|---|
| **Control negativo** (el rol correcto tiene que poder): 111 permisos predichos en tablas | **111 medidos**, todos con filas > 0 |
| ídem en RPC: 17 predichos | **17 medidos** (tras corregir dos veces la fixture, ver §6) |
| ídem en vistas: 8 predichos | **8 medidos** |
| **La fixture existe**: las 46 filas de B/X contadas **como postgres** (sin RLS) | **46/46 = 1 fila**; y las 8 de las vistas, 8/8 |
| `git status` antes / después | `?? docs/PLAN-2026-09-02.md` en los dos — nada nuevo |
| conteo de las 23 tablas + `auth.users` antes / después de **cada** corrida | idénticos las 6 veces |

<details><summary>Conteos antes / después (la última corrida)</summary>

| tabla | antes | después |
|---|---|---|
| `auth_users` | 8 | 8 |
| `cash_movements` | 146 | 146 |
| `categories` | 143 | 143 |
| `customers` | 40 | 40 |
| `debt_payments` | 110 | 110 |
| `extras` | 61 | 61 |
| `jornadas` | 280 | 280 |
| `order_item_extras` | 61 | 61 |
| `order_items` | 650 | 650 |
| `orders` | 650 | 650 |
| `organizations` | 1 | 1 |
| `payments` | 354 | 354 |
| `product_components` | 21 | 21 |
| `product_extras` | 55 | 55 |
| `products` | 198 | 198 |
| `profiles` | 7 | 7 |
| `profiles_inactivos` | 0 | 0 |
| `profiles_sede_A` | 7 | 7 |
| `purchase_invoice_items` | 49 | 49 |
| `purchase_invoices` | 49 | 49 |
| `roles` | 3 | 3 |
| `sedes` | 1 | 1 |
| `stock_movements` | 891 | 891 |
| `store_sequences` | 1 | 1 |
| `suppliers` | 27 | 27 |
| `user_stores` | 2 | 2 |

</details>

⚠️ Por qué el control del instrumento va aparte de la matriz: un `0` de `authenticated` prueba RLS
**solo si la fila existe**. Sin contarla como postgres, "0 filas" y "la fixture falló" son el mismo
número.

---

## 2 · Matriz de tablas — 828 celdas, 0 🔴

**Leyenda:** ✅ permite y debía · ⛔ niega y debía · 🔴 permite y NO debía · ⚠️ niega y debía permitir.
La cifra es el `row_count` o el `sqlstate` medido. ᵒ = tabla de alcance **organización** (sedes,
roles, user_stores, profiles, organizations): ahí **B es la misma organización** y el acceso está
permitido **por diseño**; lo que tiene que dar cero es X.

Totales: owner {'✅': 74, '⛔': 202} · cajero {'✅': 37, '⛔': 239} · desactivado {'⛔': 276}.

### 2.1 owner

| tabla | S·A | S·B | S·X | I·A | I·B | I·X | U·A | U·B | U·X | D·A | D·B | D·X |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `cash_movements` | 1 ✅ | 0 ⛔ | 0 ⛔ | 1 ✅ | 42501 ⛔ | 42501 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ |
| `categories` | 1 ✅ | 0 ⛔ | 0 ⛔ | 1 ✅ | 42501 ⛔ | 42501 ⛔ | 1 ✅ | 0 ⛔ | 0 ⛔ | 1 ✅ | 0 ⛔ | 0 ⛔ |
| `customers` | 1 ✅ | 0 ⛔ | 0 ⛔ | 1 ✅ | 42501 ⛔ | 42501 ⛔ | 1 ✅ | 0 ⛔ | 0 ⛔ | 1 ✅ | 0 ⛔ | 0 ⛔ |
| `debt_payments` | 1 ✅ | 0 ⛔ | 0 ⛔ | 42501 ⛔ | 42501 ⛔ | 42501 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ |
| `extras` | 1 ✅ | 0 ⛔ | 0 ⛔ | 1 ✅ | 42501 ⛔ | 42501 ⛔ | 1 ✅ | 0 ⛔ | 0 ⛔ | 1 ✅ | 0 ⛔ | 0 ⛔ |
| `jornadas` | 1 ✅ | 0 ⛔ | 0 ⛔ | 1 ✅ | 42501 ⛔ | 42501 ⛔ | 1 ✅ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ |
| `order_item_extras` | 1 ✅ | 0 ⛔ | 0 ⛔ | 42501 ⛔ | 42501 ⛔ | 42501 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ |
| `order_items` | 1 ✅ | 0 ⛔ | 0 ⛔ | 42501 ⛔ | 42501 ⛔ | 42501 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ |
| `orders` | 1 ✅ | 0 ⛔ | 0 ⛔ | 1 ✅ | 42501 ⛔ | 42501 ⛔ | 1 ✅ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ |
| `organizations` ᵒ | 1 ✅ | 1 ✅ | 0 ⛔ | 42501 ⛔ | 42501 ⛔ | 42501 ⛔ | 42501 ⛔ | 42501 ⛔ | 42501 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ |
| `payments` | 1 ✅ | 0 ⛔ | 0 ⛔ | 42501 ⛔ | 42501 ⛔ | 42501 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ |
| `product_components` | 1 ✅ | 0 ⛔ | 0 ⛔ | 1 ✅ | 42501 ⛔ | 42501 ⛔ | 1 ✅ | 0 ⛔ | 0 ⛔ | 1 ✅ | 0 ⛔ | 0 ⛔ |
| `product_extras` | 1 ✅ | 0 ⛔ | 0 ⛔ | 1 ✅ | 42501 ⛔ | 42501 ⛔ | 1 ✅ | 0 ⛔ | 0 ⛔ | 1 ✅ | 0 ⛔ | 0 ⛔ |
| `products` | 1 ✅ | 0 ⛔ | 0 ⛔ | 1 ✅ | 42501 ⛔ | 42501 ⛔ | 1 ✅ | 0 ⛔ | 0 ⛔ | 1 ✅ | 0 ⛔ | 0 ⛔ |
| `profiles` ᵒ | 1 ✅ | 1 ✅ | 0 ⛔ | 42501 ⛔ | 42501 ⛔ | 42501 ⛔ | 1 ✅ | 1 ✅ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ |
| `purchase_invoice_items` | 1 ✅ | 0 ⛔ | 0 ⛔ | 42501 ⛔ | 42501 ⛔ | 42501 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ |
| `purchase_invoices` | 1 ✅ | 0 ⛔ | 0 ⛔ | 42501 ⛔ | 42501 ⛔ | 42501 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ |
| `roles` ᵒ | 1 ✅ | 1 ✅ | 0 ⛔ | 1 ✅ | 1 ✅ | 42501 ⛔ | 1 ✅ | 1 ✅ | 0 ⛔ | 1 ✅ | 1 ✅ | 0 ⛔ |
| `sedes` ᵒ | 1 ✅ | 1 ✅ | 0 ⛔ | 1 ✅ | 1 ✅ | 42501 ⛔ | 1 ✅ | 1 ✅ | 0 ⛔ | 1 ✅ | 1 ✅ | 0 ⛔ |
| `stock_movements` | 1 ✅ | 0 ⛔ | 0 ⛔ | 42501 ⛔ | 42501 ⛔ | 42501 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ |
| `store_sequences` | 1 ✅ | 0 ⛔ | 0 ⛔ | 42501 ⛔ | 42501 ⛔ | 42501 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ |
| `suppliers` | 1 ✅ | 0 ⛔ | 0 ⛔ | 1 ✅ | 42501 ⛔ | 42501 ⛔ | 1 ✅ | 0 ⛔ | 0 ⛔ | 1 ✅ | 0 ⛔ | 0 ⛔ |
| `user_stores` ᵒ | 1 ✅ | 1 ✅ | 0 ⛔ | 1 ✅ | 1 ✅ | 42501 ⛔ | 1 ✅ | 1 ✅ | 0 ⛔ | 1 ✅ | 1 ✅ | 0 ⛔ |

### 2.2 cajero

| tabla | S·A | S·B | S·X | I·A | I·B | I·X | U·A | U·B | U·X | D·A | D·B | D·X |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `cash_movements` | 1 ✅ | 0 ⛔ | 0 ⛔ | 1 ✅ | 42501 ⛔ | 42501 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ |
| `categories` | 1 ✅ | 0 ⛔ | 0 ⛔ | 42501 ⛔ | 42501 ⛔ | 42501 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ |
| `customers` | 1 ✅ | 0 ⛔ | 0 ⛔ | 1 ✅ | 42501 ⛔ | 42501 ⛔ | 1 ✅ | 0 ⛔ | 0 ⛔ | 1 ✅ | 0 ⛔ | 0 ⛔ |
| `debt_payments` | 1 ✅ | 0 ⛔ | 0 ⛔ | 42501 ⛔ | 42501 ⛔ | 42501 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ |
| `extras` | 1 ✅ | 0 ⛔ | 0 ⛔ | 42501 ⛔ | 42501 ⛔ | 42501 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ |
| `jornadas` | 1 ✅ | 0 ⛔ | 0 ⛔ | 1 ✅ | 42501 ⛔ | 42501 ⛔ | 1 ✅ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ |
| `order_item_extras` | 1 ✅ | 0 ⛔ | 0 ⛔ | 42501 ⛔ | 42501 ⛔ | 42501 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ |
| `order_items` | 1 ✅ | 0 ⛔ | 0 ⛔ | 42501 ⛔ | 42501 ⛔ | 42501 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ |
| `orders` | 1 ✅ | 0 ⛔ | 0 ⛔ | 1 ✅ | 42501 ⛔ | 42501 ⛔ | 1 ✅ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ |
| `organizations` ᵒ | 1 ✅ | 1 ✅ | 0 ⛔ | 42501 ⛔ | 42501 ⛔ | 42501 ⛔ | 42501 ⛔ | 42501 ⛔ | 42501 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ |
| `payments` | 1 ✅ | 0 ⛔ | 0 ⛔ | 42501 ⛔ | 42501 ⛔ | 42501 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ |
| `product_components` | 1 ✅ | 0 ⛔ | 0 ⛔ | 42501 ⛔ | 42501 ⛔ | 42501 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ |
| `product_extras` | 1 ✅ | 0 ⛔ | 0 ⛔ | 42501 ⛔ | 42501 ⛔ | 42501 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ |
| `products` | 1 ✅ | 0 ⛔ | 0 ⛔ | 42501 ⛔ | 42501 ⛔ | 42501 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ |
| `profiles` ᵒ | 1 ✅ | 1 ✅ | 0 ⛔ | 42501 ⛔ | 42501 ⛔ | 42501 ⛔ | 1 ✅ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ |
| `purchase_invoice_items` | 1 ✅ | 0 ⛔ | 0 ⛔ | 42501 ⛔ | 42501 ⛔ | 42501 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ |
| `purchase_invoices` | 1 ✅ | 0 ⛔ | 0 ⛔ | 42501 ⛔ | 42501 ⛔ | 42501 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ |
| `roles` ᵒ | 1 ✅ | 1 ✅ | 0 ⛔ | 42501 ⛔ | 42501 ⛔ | 42501 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ |
| `sedes` ᵒ | 1 ✅ | 1 ✅ | 0 ⛔ | 42501 ⛔ | 42501 ⛔ | 42501 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ |
| `stock_movements` | 1 ✅ | 0 ⛔ | 0 ⛔ | 42501 ⛔ | 42501 ⛔ | 42501 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ |
| `store_sequences` | 1 ✅ | 0 ⛔ | 0 ⛔ | 42501 ⛔ | 42501 ⛔ | 42501 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ |
| `suppliers` | 1 ✅ | 0 ⛔ | 0 ⛔ | 42501 ⛔ | 42501 ⛔ | 42501 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ |
| `user_stores` ᵒ | 1 ✅ | 1 ✅ | 0 ⛔ | 42501 ⛔ | 42501 ⛔ | 42501 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ |

### 2.3 desactivado (el owner con `is_active = false`)

| tabla | S·A | S·B | S·X | I·A | I·B | I·X | U·A | U·B | U·X | D·A | D·B | D·X |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `cash_movements` | 0 ⛔ | 0 ⛔ | 0 ⛔ | 42501 ⛔ | 42501 ⛔ | 42501 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ |
| `categories` | 0 ⛔ | 0 ⛔ | 0 ⛔ | 42501 ⛔ | 42501 ⛔ | 42501 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ |
| `customers` | 0 ⛔ | 0 ⛔ | 0 ⛔ | 42501 ⛔ | 42501 ⛔ | 42501 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ |
| `debt_payments` | 0 ⛔ | 0 ⛔ | 0 ⛔ | 42501 ⛔ | 42501 ⛔ | 42501 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ |
| `extras` | 0 ⛔ | 0 ⛔ | 0 ⛔ | 42501 ⛔ | 42501 ⛔ | 42501 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ |
| `jornadas` | 0 ⛔ | 0 ⛔ | 0 ⛔ | 42501 ⛔ | 42501 ⛔ | 42501 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ |
| `order_item_extras` | 0 ⛔ | 0 ⛔ | 0 ⛔ | 42501 ⛔ | 42501 ⛔ | 42501 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ |
| `order_items` | 0 ⛔ | 0 ⛔ | 0 ⛔ | 42501 ⛔ | 42501 ⛔ | 42501 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ |
| `orders` | 0 ⛔ | 0 ⛔ | 0 ⛔ | 42501 ⛔ | 42501 ⛔ | 42501 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ |
| `organizations` ᵒ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 42501 ⛔ | 42501 ⛔ | 42501 ⛔ | 42501 ⛔ | 42501 ⛔ | 42501 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ |
| `payments` | 0 ⛔ | 0 ⛔ | 0 ⛔ | 42501 ⛔ | 42501 ⛔ | 42501 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ |
| `product_components` | 0 ⛔ | 0 ⛔ | 0 ⛔ | 42501 ⛔ | 42501 ⛔ | 42501 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ |
| `product_extras` | 0 ⛔ | 0 ⛔ | 0 ⛔ | 42501 ⛔ | 42501 ⛔ | 42501 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ |
| `products` | 0 ⛔ | 0 ⛔ | 0 ⛔ | 42501 ⛔ | 42501 ⛔ | 42501 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ |
| `profiles` ᵒ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 42501 ⛔ | 42501 ⛔ | 42501 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ |
| `purchase_invoice_items` | 0 ⛔ | 0 ⛔ | 0 ⛔ | 42501 ⛔ | 42501 ⛔ | 42501 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ |
| `purchase_invoices` | 0 ⛔ | 0 ⛔ | 0 ⛔ | 42501 ⛔ | 42501 ⛔ | 42501 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ |
| `roles` ᵒ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 42501 ⛔ | 42501 ⛔ | 42501 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ |
| `sedes` ᵒ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 42501 ⛔ | 42501 ⛔ | 42501 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ |
| `stock_movements` | 0 ⛔ | 0 ⛔ | 0 ⛔ | 42501 ⛔ | 42501 ⛔ | 42501 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ |
| `store_sequences` | 0 ⛔ | 0 ⛔ | 0 ⛔ | 42501 ⛔ | 42501 ⛔ | 42501 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ |
| `suppliers` | 0 ⛔ | 0 ⛔ | 0 ⛔ | 42501 ⛔ | 42501 ⛔ | 42501 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ |
| `user_stores` ᵒ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 42501 ⛔ | 42501 ⛔ | 42501 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ |

**Lectura.** Las 276 celdas del desactivado dan cero o `42501`: los tres helpers (`get_my_sede_id`,
`get_my_organization_id`, `has_permission`) filtran `is_active`, así que toda policy evalúa contra
NULL y **falla cerrada**. Es el diseño correcto — y es exactamente el mismo NULL que en §3 abre dos
RPC, porque una policy trata NULL como *falso* y un `if x <> NULL` lo trata como *no preguntar*.

Del cajero: niega donde no tiene permiso (`productos.editar`, `compras.gestionar`, `roles.gestionar`,
`sedes.gestionar`, `usuarios.gestionar`) y permite donde sí (`customers`, `orders`, `jornadas`,
`cash_movements`, su propio perfil). Ninguna sorpresa contra el catálogo.

---

## 3 · RPC — 49 celdas, y los DOS agujeros

| RPC | owner·A | owner·B | owner·X | cajero·A | cajero·B | desactivado·A | desactivado·B |
|---|---|---|---|---|---|---|---|
| `add_order_items_with_extras` | ✅ pasa | ⛔ P0001 *La orden no pertenece a tu sede* | ⛔ P0001 *La orden no pertenece a tu sede* | ✅ pasa | ⛔ P0001 *La orden no pertenece a tu sede* | 🔴 **PASA** | 🔴 **PASA** |
| `adjust_stock` | ✅ pasa | ⛔ P0001 *El producto no pertenece a tu sede* | ⛔ P0001 *El producto no pertenece a tu sede* | ⛔ P0001 *No autorizado para ajustar inventario* | ⛔ P0001 *El producto no pertenece a tu sede* | ⛔ P0001 *No autorizado para ajustar inventario* | ⛔ P0001 *No autorizado para ajustar inventario* |
| `next_order_number` | ✅ pasa | ⛔ P0001 *No autorizado para numerar ventas de esta sede* | ⛔ P0001 *No autorizado para numerar ventas de esta sede* | ✅ pasa | ⛔ P0001 *No autorizado para numerar ventas de esta sede* | 🔴 **PASA** | 🔴 **PASA** |
| `register_debt_payment` | ✅ pasa | ⛔ P0001 *La venta no existe o no pertenece a tu sede* | ⛔ P0001 *La venta no existe o no pertenece a tu sede* | ✅ pasa | ⛔ P0001 *La venta no existe o no pertenece a tu sede* | ⛔ P0001 *No tienes una sede activa* | ⛔ P0001 *No tienes una sede activa* |
| `register_purchase` | ✅ pasa | ⛔ P0001 *El proveedor no existe o no pertenece a tu sede* | ⛔ P0001 *El proveedor no existe o no pertenece a tu sede* | ⛔ P0001 *No autorizado para registrar compras* | ⛔ P0001 *No autorizado para registrar compras* | ⛔ P0001 *No tienes una sede activa* | ⛔ P0001 *No tienes una sede activa* |
| `register_sale_payment` | ✅ pasa | ⛔ P0001 *La venta no existe o no pertenece a tu sede* | ⛔ P0001 *La venta no existe o no pertenece a tu sede* | ✅ pasa | ⛔ P0001 *La venta no existe o no pertenece a tu sede* | ⛔ P0001 *No tienes una sede activa* | ⛔ P0001 *No tienes una sede activa* |
| `register_sale_void` | ✅ pasa | ⛔ P0001 *La venta no existe o no pertenece a tu sede* | ⛔ P0001 *La venta no existe o no pertenece a tu sede* | ⛔ P0001 *No autorizado para anular ventas* | ⛔ P0001 *No autorizado para anular ventas* | ⛔ P0001 *No tienes una sede activa* | ⛔ P0001 *No tienes una sede activa* |

Más dos celdas aparte: `seed_system_roles(org LAB)` invocada por owner y por cajero → `42501 permission
denied for function` las dos. La revocación a `authenticated` está puesta.

### 🔴 El desactivado escribe — probado, no inferido

Se corrió una vez **sin deshacer**: el owner desactivado invocó `add_order_items_with_extras` sobre una
orden de la **organización X** (3 unidades) y `next_order_number` sobre la sede X. Después, **como
postgres y antes del rollback**, se contó el efecto:

| qué | fixture tenía | después |
|---|---|---|
| order_items de o3_X | 1 | **2** |
| products.stock_qty de prod_X | 10 | **7** |
| stock_movements de prod_X | 1 | **2** |
| store_sequences de sede X | 0 | **1** |
| orders.total de o3_X | 1000 | **1000** |

Líneas de la orden 1 → 2, stock del producto 10 → 7, un `stock_movements` nuevo, la secuencia de la sede
0 → 1. **Un usuario dado de baja, con un token todavía válido, altera órdenes e inventario de una
organización que no es la suya.** No hay celda más grave en esta auditoría.

*(Nota lateral, fuera de A2: `orders.total` no cambió con la línea nueva — la RPC no recalcula el total.
Se anota; no es negación de policies.)*

### La clase, enumerada (R3)

`grep -rnE "<>\s*(public\.)?get_my_sede_id\(\)" supabase/migrations/` → **tres sitios**:

| RPC | forma | qué la salva |
|---|---|---|
| `add_order_items_with_extras` | `if v_sede_id <> get_my_sede_id()` | **nada** — no hay `has_permission` después. 🔴 medido |
| `next_order_number` | `if p_sede_id is null or p_sede_id <> get_my_sede_id()` | **nada**. 🔴 medido |
| `adjust_stock` | `if v_sede_id <> get_my_sede_id()` | el `has_permission('inventario.ajustar')` **siguiente** — medido: niega "No autorizado", no "no pertenece". Misma clase, tapada por el segundo guard |

Las otras cuatro RPC (`register_sale_payment`, `register_sale_void`, `register_purchase`,
`register_debt_payment` — seis definiciones en las migraciones, porque dos tienen v2) usan la forma
**correcta**: `v_sede_id := get_my_sede_id(); if v_sede_id is null then raise 'No tienes una sede
activa'`. El desactivado las probó en A y en B: **8 de 8 negaron con ese mensaje.** **La diferencia entre las que cierran y las que abren es
una línea, y las dos formas conviven en el mismo repo.**

---

## 4 · Escalada — el traslado de sede

| como cajero, sobre la fila propia | resultado | qué lo decidió |
|---|---|---|
| sede_id -> B (misma org) | 🔴 **PASA** (1 fila) | nada: la policy `profiles: editar el propio` lo permite y el trigger no mira `sede_id` |
| sede_id -> B, y leer productos de B | 🔴 **PASA** (1 fila) | nada: la policy `profiles: editar el propio` lo permite y el trigger no mira `sede_id` |
| role_id -> owner | ⛔ `23514` | trigger `protect_profile_self_escalation`: *No podes cambiar tu propio rol* |
| sede_id -> X + organization_id -> X | ⛔ `23514` | trigger `protect_profile_self_escalation`: *No podes cambiar tu propia organizacion* |
| is_active -> false (propio) | ⛔ `23514` | trigger `protect_profile_self_escalation`: *No podes activar ni desactivar tu propio usuario* |

**Lo que esto significa.** El traslado de sede es una **función del producto**: `StoreSelector.tsx`
hace `update profiles set sede_id` para cambiar de sede activa entre las que el usuario tiene en
`user_stores`, y `rbac-escalada.spec.ts` tiene el caso escrito ("cambio de sede activa") — **skipped**,
porque el lab no tiene dos sedes. **La restricción "solo a una sede asignada en `user_stores`" vive
únicamente en la UI.** En la base no hay nada: ni el trigger mira `sede_id`, ni la policy exige
pertenencia. El cajero de la sonda **no** tenía la sede B en `user_stores` y pasó, y acto seguido leyó
un producto de B (la segunda fila: la RLS lo sigue).

Es la misma clase que la deuda 42: **la UI ocupando el lugar de la autorización.** Y es el caso que el
plan anticipó: *"no va a fallar por uso; va a fallar el día que abran la segunda sede"*. Con una
sede, `sede_id` no tiene a dónde ir. Con dos, cualquier cajero elige.

Lo cruzado a **otra organización** sí está cerrado: `organization_id` lo protege el trigger, y `sede_id`
apuntando a una sede de otra org lo rechaza `enforce_profile_organization` (la pareja sede/org tiene
que coincidir).

---

## 5 · Vistas — 36 celdas, 0 🔴

Las cuatro vistas de reportes están expuestas a `authenticated` por PostgREST. Una vista sin
`security_invoker` corre con los privilegios de su dueño (`postgres`) y **salta la RLS** de las tablas
de abajo. Medido: las cuatro tienen `security_invoker=true` en `reloptions`, y la sonda lo confirma.

| vista | owne·A | owne·B | owne·X | caje·A | caje·B | caje·X | desa·A | desa·B | desa·X |
|---|---|---|---|---|---|---|---|---|---|
| `daily_sales_summary` | 4 ✅ | 0 ⛔ | 0 ⛔ | 4 ✅ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ |
| `hourly_sales` | 14 ✅ | 0 ⛔ | 0 ⛔ | 14 ✅ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ |
| `product_performance` | 77 ✅ | 0 ⛔ | 0 ⛔ | 77 ✅ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ |
| `user_performance` | 2 ✅ | 0 ⛔ | 0 ⛔ | 2 ✅ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ | 0 ⛔ |

Control: las 8 combinaciones vista × {B, X} tienen **1 fila vistas como postgres**. El cero de
`authenticated` es RLS.

---

## 6 · Registro del instrumento — lo que falló y cómo se supo

| qué | cómo se vio | qué era |
|---|---|---|
| Etapa 1 abortó: `23505 idx_jornadas_una_abierta_por_sede` sobre la sede **A** | HTTP 400 con el mensaje de Postgres | mi fixture abría dos jornadas por sede; el índice parcial permite una. Lo leí como "la sede A ya tiene una abierta" — **falso**: el choque era entre mis dos filas |
| Etapa 1 abortó otra vez, ahora sobre la sede **B** | ídem | la "corrección" cerró las de A y dejó dos abiertas en B. La lectura equivocada del primer error produjo un parche equivocado |
| Etapa 2: **4 controles del owner en su sede negaron** ("Abrí la jornada", "la venta no es de contado") | ⚠️ en el cruce contra la predicción | validación de negocio, no autorización: la sede A **no tiene jornada abierta** (medido: 0 de 280) y `o3` estaba `pending`. Fixture corregida, rerun: 17/17 |

Los tres se cazaron por la misma regla del plan: **un control que no pasa no es un hallazgo, es una
sonda rota hasta que se demuestre lo contrario.** Los 4 ⚠️ tenían mensaje, y el mensaje decía
"jornada" y "contado", no "sede" ni "autorizado". Antes de tocar nada, se leyó el mensaje.

⚠️ Y una advertencia sobre el propio evaluador: las tres celdas 🔴 aparecen como ✅ en el cruce
mecánico, porque **coinciden con MI predicción** — predije que pasan. "Coincide con lo predicho" y
"es seguro" no son la misma columna, y la segunda la decide la lectura, no el script.

Conteos honestos de la sesión: 6 corridas contra la base (humo, etapa 1 ×3, etapa 2 ×2, vistas,
extra), conteos idénticos en todas, `git status` limpio en todas. El hook `PreToolUse` disparó
**6 veces** en esta auditoría, las 6 sobre lecturas (consultas a `pg_policies`/`roles` y un script del
scratchpad) — van a la deuda 22.

---

## 7 · Hallazgos, en orden de gravedad — SIN ARREGLAR

> Esta auditoría no modifica código. La forma del arreglo se escribe para que la Fase B la tome.

### 🔴 A2-1 · Un usuario desactivado escribe en órdenes e inventario de cualquier sede y organización

**Dónde:** `add_order_items_with_extras` — `if v_sede_id <> get_my_sede_id()`.
**Medido:** con `is_active = false`, agregó 3 unidades a una orden de la organización X, descontó
stock y dejó `stock_movements`. Y en la sede B de su propia organización, igual.
**Por qué pasa:** `get_my_sede_id()` es NULL para un inactivo; `<>` contra NULL no es verdadero; el
`if` no dispara; no hay `has_permission` después; la función es `SECURITY DEFINER` y escribe sin RLS.
**Ventana:** mientras el JWT y el refresh token del usuario sigan vivos. La app corta la sesión del
desactivado en el cliente (`rbac-escalada`: "el desactivado NO entra") — eso es UI; el token no se
revoca. **La base es el único guard, y está abierto.**
**Forma del arreglo:** la de las otras cinco RPC — `v_sede_id := get_my_sede_id(); if v_sede_id is null
then raise 'No tienes una sede activa'` al principio, y el `<>` pasa a `is distinct from`. Y un
`has_permission('pos.vender')`, que hoy no existe en esta RPC: vender por la vía de los ítems no pide
permiso alguno.

### 🔴 A2-2 · Un usuario desactivado numera ventas de cualquier sede

**Dónde:** `next_order_number` — `if p_sede_id is null or p_sede_id <> get_my_sede_id()`.
**Medido:** secuencia de la sede X, 0 → 1, invocada por el owner desactivado.
**Gravedad:** menor que A2-1 (no toca dinero ni stock), pero es **la misma línea** y se arregla en el
mismo commit (R3). Corromper la numeración de otra sede tiene consecuencias en facturación.

### 🔴 A2-3 · Un cajero se traslada solo a cualquier sede de su organización

**Dónde:** policy `profiles: editar el propio` + trigger `protect_profile_self_escalation` sin `sede_id`.
**Medido:** el cajero puso `sede_id = B` sin tener B en `user_stores`, y leyó un producto de B.
**Por qué importa ahora y no después:** con una sede no se nota. Es el hallazgo que el plan escribió
como "va a fallar el día que abran la segunda", y la única sede del cliente firmado no lo va a mostrar.
**Forma del arreglo — dos opciones, decidir una:** (a) el trigger agrega: si `new.id = auth.uid()` y
`sede_id` cambia, exigir `exists (select 1 from user_stores where user_id = new.id and sede_id =
new.sede_id)`; (b) el cambio de sede activa deja de ser un `update` directo y pasa a una RPC
`cambiar_sede_activa(p_sede)` que valida la pertenencia. (a) es una línea y cierra el hueco donde está;
(b) además saca del cliente la decisión. Cualquiera de las dos vuelve **ejecutable** el test skipped.

### ⚠️ A2-4 · `adjust_stock` tiene la misma forma que A2-1, tapada por el segundo guard

No es un hueco hoy: el `has_permission('inventario.ajustar')` que sigue lo niega. Pero es la misma
línea, y el día que alguien le dé `inventario.ajustar` a un rol y la sede deje de importar, se abre.
Va en el mismo commit que A2-1 y A2-2.

### Lo que está BIEN, dicho para que no se vuelva a auditar por costumbre

- Las 23 tablas: 828/828. RLS por sede y por organización cierra en las tres direcciones (otra sede,
  otra org, desactivado), en las cuatro operaciones.
- Las 4 vistas: `security_invoker=true`, 36/36.
- Las 5 RPC con el guard `is null` al principio niegan al desactivado con el mensaje correcto.
- `seed_system_roles` revocada a `authenticated`.
- El trigger de auto-escalada cierra rol, rol de sistema, activación y organización.
- Cruce a **otra organización**: cero pasos, en tablas, vistas, RPC y escalada.

---

## 8 · Lo que esta matriz NO cubre

- **`anon`** (sin login) y **`service_role`**: no se impersonaron. `anon` no debería tener policies que lo
  nombren — se verificó que todas dicen `{authenticated}` — pero no se probó ejecutando.
- **Storage** (buckets de imágenes) y **Edge Functions** (`create-user`, `aplicar-estado`): fuera de la
  base.
- **Que un JWT vencido o revocado siga entrando**: la sonda impersona; no habla con GoTrue.
- **Recetas (`product_components`) y extras dentro de la RPC abierta**: A2-1 se probó con un ítem
  simple. Las ramas de componentes y extras escriben con la misma ausencia de guard; no hace falta
  medirlas para arreglarlas, pero no se midieron.
- El **desactivado en tablas contra X** sí se midió (276 celdas incluyen X); en RPC se midió A, B y,
  para las dos abiertas, X.

---

## Apéndice · cómo reproducirlo

Los scripts viven en el scratchpad de la sesión, no en el repo (son andamiaje, como `_t_priv`):
`a2_gen.py` genera `a2_etapa1.sql` / `a2_etapa2.sql`; `a2_analiza.py` cruza contra la predicción;
`a2_doc.py` renderiza este documento. Todo corrió por la Management API (`database/query`) con el token
de proyecto en variable de entorno, que devuelve el último `select` aunque después venga `rollback` —
verificado con `begin; select 1; rollback;` antes de confiar en ello.

Las identidades: owner `9822127a…`, cajero `6b528fd0…`, los dos cajeros e2e movidos `54b19593…` (→ B)
y `12a6cb51…` (→ X). Los UUID de la fixture son `uuid5` deterministas sobre un namespace fijo.
