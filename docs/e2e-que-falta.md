# Qué falta para correr la suite E2E contra la base ya aplicada

*Enumerado el 2026-09-01. **Nada de esto está resuelto** — es la lista, no el trabajo.*

> **Por qué importa más que cualquier deuda abierta:** hoy hay **269 tests unitarios verdes y cero
> evidencia de que la aplicación funcione**. Los unitarios cubren `sentry`, `shiftCalc`,
> `cashRounding`, `permissions` y `useSubscriptionStatus` — ninguna pantalla, ninguna policy,
> ninguna RPC. Y el objetivo declarado es un **MVP funcional**.
>
> Además es el único verificador que puede cazar dos cosas que hoy nada mira:
> · la clase **"lo que no es una referencia de código"** (strings de `select`, regex, copy, cuerpos
>   de llamadas entre procesos) — ya nos costó 5 apariciones;
> · que las policies **NIEGUEN** lo que deben negar. El push verde no dice **nada** al respecto.

**Escala:** 30 specs. 15 dependen de una jornada de caja abierta. 8 usan la cuenta del cajero.

---

## 1 · Credenciales y entorno — 2 archivos, ninguno existe

| Qué | Estado | Quién lo consume |
|---|---|---|
| `.env` | ❌ **no existe** | `tests/global-setup.ts` y varios specs leen `VITE_NODO_SUPABASE_URL` / `..._ANON_KEY` para hablar con la base por API |
| `.env.test` | ❌ **no existe** | `playwright.config.ts` lo carga; `tests/helpers/auth.ts` **tira** si faltan `E2E_OWNER_*` / `E2E_CASHIER_*` |

Las plantillas ya están (`.env.example`, `.env.test.example`) y son correctas.

⚠️ **Esto también es lo que hoy me impide correr `verificar-rpcs.sql`**: sin `.env`, sin token del
CLI y sin `psql`, no tengo ningún camino a la base.

---

## 2 · Las cuentas del lab — y una que ya no puede existir

`.env.test.example` pide tres:

| Cuenta | Estado | Nota |
|---|---|---|
| `owner.test@gvento.com` | existen en el **backend del lab de Vento** | ⛔ **No se renombran** (corolario del renombre). Pero hay que confirmar si sirven contra el proyecto de **Nodo**, que es otro proyecto de Supabase. |
| `cajero.test@gvento.com` | ídem | la usan 8 specs |
| `mozo.test@gvento.com` | 🔴 **el rol `mozo` YA NO EXISTE** | se fue con el catálogo propio (deuda 23). `hasWaiterCreds()` hace que los tests hagan **skip** si no está definida, así que no rompe — pero `historiales.spec.ts` pierde su caso de **gating negativo**. |

🔴 **Decisión pendiente, y es de producto:** el gating negativo necesita **un rol restringido**. Con
`mozo` podado, el candidato natural es **`cajero`** (8 permisos de 21). Hay que decidir si
`historiales.spec.ts` se reescribe contra el cajero o si el caso se pierde.

---

## 3 · El seed del laboratorio — 🔴 esto es lo más caro de la lista

`supabase/lab-seed.sql` **no existe**: está en `supabase/_heredado/lab-seed.sql`, **618 líneas**, y
su README dice que nada de ahí aplica. Nombra el esquema viejo:

| Nombra | Ocurrencias |
|---|---|
| `restaurants` | 34 |
| `tables` | 10 |
| `uses_kitchen` | 7 |
| `cash_shifts` | 4 |
| `routes_to_kitchen` | 4 |
| `'mozo'` / `'waiter'` | 1 + 1 |

**No es un renombre: hay que reescribirlo**, porque la mitad de lo que siembra (mesas, cocina,
mozos) ya no existe.

Lo que el seed tiene que dejar puesto, y sale de leer los specs:

- **La organización `LAB`.** `tests/global-setup.ts` **aborta la suite entera** si la org del owner
  no se llama exactamente `LAB`. Es el guard que impide correr contra datos reales.
- **Los tres productos del lab**, que los specs nombran literalmente:
  `Lab Coctel` (compuesto → 1 `Lab Vaso`) · `Lab Vaso` (insumo con tracking) ·
  `Lab Cerveza` (simple, **sin** tracking).
- **Los roles de sistema** para esa org — o sea, una llamada a `seed_system_roles(v_org)`.
  ✅ La función ya está aplicada.
- **Perfiles + `user_stores`** para las cuentas de arriba.
- **La purga** que `create-user.spec.ts` menciona (paso 9 del seed viejo).

⚠️ **Y el seed viejo sembraba mesas y productos de bar.** Reescribirlo es la oportunidad de que los
datos del lab se parezcan a una **distribuidora**, no a un bar. Eso es decisión de producto: los
nombres `Lab Coctel` / `Lab Vaso` / `Lab Cerveza` están **hardcodeados en los specs**, así que
cambiarlos es tocar los 30 specs. **Recomiendo no cambiarlos ahora**: son etiquetas de laboratorio,
no copy de producto, y el costo de renombrarlas no compra nada del MVP.

---

## 4 · El servidor — ya está resuelto, no hace falta nada

`playwright.config.ts` levanta **su propio** dev server en el puerto **5180** con
`reuseExistingServer: false` y `strictPort`. No hay que levantar nada a mano, y por diseño no se
puede conectar por accidente a otra app.

✅ Y el health check de `global-setup.ts` ya fue corregido: buscaba `/G-?Vento/i` en el HTML y ahora
busca `Nodo`. Sin ese arreglo, la suite abortaría antes del primer test con un mensaje culpando al
servidor.

---

## 5 · Lo que la suite va a encontrar rota, y conviene esperarlo

**No es pesimismo: es que ninguno de estos caminos se ejecutó nunca contra el esquema nuevo.**

| Sospecha | Por qué |
|---|---|
| Aserciones sobre el DOM en tests migrados | el criterio nuevo: migrar entre UIs conserva el sujeto, no las aserciones. Ya hay **una** confirmada (`discount-amount`) |
| Más strings de `.from()` / `select()` | van **5 apariciones** de esa clase; el grep encontró las que sabía buscar |
| Los specs que tocaban módulos podados | `rbac.spec.ts` menciona permisos eliminados; `config.spec.ts`, el toggle de cocina |
| Las policies RLS | **nunca se ejecutaron**. `verificar-rpcs.sql` prueba resolución, no autorización |

---

## 6 · Orden propuesto

1. `.env` y `.env.test` (los tenés vos; yo no los toco).
2. Confirmar que las cuentas del lab sirven contra el proyecto de **Nodo**.
3. **Reescribir `lab-seed.sql`** contra el esquema nuevo — el trabajo grande.
4. Correr la suite y **leer los artefactos antes de re-correr** (R8).
5. Decidir el gating negativo sin `mozo`.

⚠️ **Y la advertencia de R10 puesta por adelantado:** cuando la suite pase, eso **no** prueba que
las policies nieguen. Los tests que verifican *ausencia* —`rbac-escalada.spec.ts`— son los que hay
que leer con más cuidado, porque son los que pueden pasar por la razón equivocada.
