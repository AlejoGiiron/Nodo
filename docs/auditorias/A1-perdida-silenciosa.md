# A1 · Pérdida silenciosa de datos — la clase de la 54

*2026-09-02. Auditoría de lectura: **no modifica código**. Produce esta tabla y nada más.*

**Qué busca:** cada lugar de `src/` donde *"todavía no sé"* es indistinguible de *"no hay nada"* —
un default que colapsa el estado de carga (o de error) con el estado vacío, y un consumidor que
**decide** algo con ese vacío antes de que el dato llegue.

**Clasificación por la columna (b):** 🔴 pierde o corrompe un dato **registrado** · 🟡 muestra o
avisa mal, el dato está bien · 🟢 inofensivo — el consumidor espera, el dato es síncrono, o el vacío
no alimenta ninguna decisión.

---

## 0 · Método, reproducible

```bash
# Los ocho patrones. --include para no contar tests ni tipos generados.
G() { grep -rnE "$1" src/ --include=*.ts --include=*.tsx | grep -v '\.test\.' | grep -v database.types; }
G '\?\? new Set(<[^>]*>)?\('     #  1   (ver §1: el regex ingenuo dio 0)
G '\?\? \[\]'                    # 57
G '\?\? \{\}'                    #  1
G '\?\? 0\b'                     # 65 lineas (66 ocurrencias: ReportsPage:152 tiene dos)
G "\?\? ''"                      # 30
G '\?\? null'                    # 41 lineas (43 ocurrencias: useStockMovements:26 tiene tres)
G '\.single\(\)'                 # 26
G '\.maybeSingle\(\)'            #  1
# Hooks: cuales exponen carga.
for f in src/hooks/*.ts; do printf '%-30s %s\n' "$(basename $f)" \
  "$(grep -cE 'isLoading|isFetching|isPending' "$f")"; done
```

Para cada hit se contestó, leyendo el consumidor: **¿quién lo consume? · ¿qué decisión toma con el
valor vacío? · ¿puede tomarla antes de que el dato llegue?** Si la tercera es *no* —el `??` está
después de un `await` con `if (error) throw`, o el consumidor tiene `isLoading` y lo usa, o el valor
es un campo de una fila ya cargada— es 🟢 y se dice cuál de las tres razones aplica.

---

## 1 · Predicción vs medido — y el control que cazó al método

**Predicción escrita antes de correr los greps:**

| patrón | predicho | medido | ratio |
|---|---|---|---|
| `?? new Set(` | 1 | **0 → 1** | el regex ingenuo no vio `Set<string>()` |
| `?? []` | ~25 | **57** | 2,3× |
| `?? {}` | ~3 | **1** | — |
| `?? 0` | ~30 | **65** | 2,2× |
| `?? ''` | ~20 | **30** | 1,5× |
| `?? null` | ~10 | **41** | 4,1× |
| `.single()` | ~15 | **26** | 1,7× |
| `.maybeSingle()` | ~3 | **1** | — |
| **total** | **~110** | **222** | **2,0×** |

**Subestimé el total a la mitad, y el error es sistemático**: el ratio se sostiene en todos los
patrones frecuentes. No fallé en un patrón — fallé en calibrar cuán extendido está `??` como idioma
de default en este código. Una predicción que se equivoca *pareja* informa más que una que acierta
de casualidad: dice que la próxima estimación sobre este repo hay que multiplicarla por dos.

### 🔴 El control funcionó: `?? new Set(` dio CERO

El caso de la deuda 54 es `query.data ?? new Set<string>()`. El regex `\?\? new Set\(` exige `Set(`
y el código tiene el parámetro de tipo en el medio. **Si hubiera reportado sin el control, la
auditoría habría dicho que la clase que la motivó no existe en el código.** Corregido a
`\?\? new Set(<[^>]*>)?\(` → 1 hit, el correcto. Séptima falla de instrumento del proyecto, y la
primera que un control escrito *de antemano* cazó antes de que produjera un documento falso.

Dos más durante la auditoría, menores pero de la misma clase:
- La tabla de hooks contó *"no expone carga"* para `useProducts`, `useCategories` y
  `useStockMovements`, que **devuelven el `useQuery` entero** — `isLoading` está, implícito. El grep
  buscaba la palabra; la propiedad viaja sin nombrarse. Corregido leyendo los `return`.
- El volcado por patrón a archivos usó `tr -cd 'a-zA-Z0-9'` para nombrar cada archivo: tres patrones
  sin letras (`?? []`, `?? {}`, `?? ''`) colapsaron en un mismo `.txt` y se sobreescribieron. Lo
  delató el `ls`: los tamaños no cerraban con los conteos. Se descartó el volcado.

### Y la 54 no aparece sola: hay CUATRO rojos

La sospecha estaba justificada. El §3 los detalla.

---

## 2 · Tabla por patrón

Los hits con la misma forma de consumidor van agrupados **con su conteo**, para que la suma cierre
contra el total de cada patrón. Todo lo que exigió juicio va en su propia fila.

### 2.1 · `?? new Set(` — 1

| ubicación | consumidor | decisión con el vacío | ¿antes del dato? | (b) |
|---|---|---|---|---|
| `hooks/useProductsWithExtras.ts:25` | `POSPage.handleAddProduct` | `has(id)` falso ⇒ `add(product)` directo, **sin abrir el modal de extras** | **sí** — la compuerta de POSPage es `catsLoading \|\| prodsLoading`; este hook no está en ella y **no expone `isLoading`** | 🔴 **deuda 54** |

### 2.2 · `?? []` — 57

| grupo | n | razón | (b) |
|---|---|---|---|
| Dentro de un `queryFn` o mutación, **después de `await` con `if (error) throw`** | 36 | el dato llegó o se lanzó: `data ?? []` solo normaliza el `null` de PostgREST. Síncrono respecto al dato. | 🟢 |
| Default del `return` de un hook, **consumido por una pantalla que usa `isLoading`/`isFetching`** (`useDebts`×2, `useExpensesHistory`, `useExtras`, `usePurchases`, `useReports`×4, `useSalesHistory`×2, `useShiftHistory`, `useSuppliers`) | 13 | el consumidor espera | 🟢 |
| Campo de una fila ya cargada o estado local (`useDebts:27` relación anidada, `MovementsModal:70` sugerencias, `printer:130` extras del carrito, `InventoryPage:218` con `isLoading`) | 4 | no hay carga pendiente en ese punto | 🟢 ⚠️ |
| `hooks/useCustomers.ts:34` → **`CustomerPicker`** | 1 | el picker **no lee `isLoading`**: mientras carga muestra *"Aún no hay clientes. Crea el primero."* en el paso de fiado del cobro | 🟡 — puede inducir a **crear un cliente duplicado**; no pierde datos |
| `hooks/useProductExtras.ts:52` (`assignedIds`) y `useProductComponents.ts:81` (`initialRows`) → **`ProductModal`** | 2 | ver §3.2 | 🔴 |
| `hooks/useProductExtras.ts:57` (`productExtras`) → **`ItemConfigModal`** | 1 | ver §3.3 | 🔴 |

⚠️ `useDebts:27` (`row.debt_payments ?? []`) es 🟢 para **esta** pregunta —la fila está cargada—
pero pertenece a **otra clase** que conviene nombrar: si el `select` dejara de incluir la relación,
`abonado` daría 0 y cada deuda se mostraría **sin abonos**, sin error. No es tiempo: es forma del
select. Va a A3, no acá.

### 2.3 · `?? {}` — 1

| ubicación | consumidor | decisión con el vacío | ¿antes del dato? | (b) |
|---|---|---|---|---|
| `hooks/useSedeConfig.ts:32` `config = sede?.config ?? {}` | `ConfigPage.SectionCaja` (§3.4) · `MovementsModal:70` (sugerencias) | **tres estados colapsados**: cargando, **falló**, y config vacía | **sí**, y el de error es permanente | 🔴 (SectionCaja) · 🟡 (MovementsModal) |

### 2.4 · `?? 0` — 65 líneas / 66 ocurrencias

| grupo | n | razón | (b) |
|---|---|---|---|
| Campo numérico de una fila ya cargada (`product.stock_qty ?? 0` ×9, `category.sort_order`, `stockStatus.ts`, `POSPage:240`, `ProductModal:84`) | 13 | fila presente; `null` significa *sin tracking*, no *cargando* | 🟢 |
| Reducciones **dentro de `queryFn`** post-`await` (`useDailySummary`×6, `useExpensesHistory:53,72`, `usePurchases:32`, `useRoles:50`, `useSalesHistory:62`, `useShiftHistory:51`, `useStockMovements:34`) | 13 | síncrono respecto al dato | 🟢 |
| Defaults de `return` de hook con `isLoading` expuesto y usado (`useExpensesHistory:79,83`, `usePurchases:40`, `useSalesHistory:70`, `useShiftHistory:59`, `InventoryPage:219`) | 6 | el consumidor espera | 🟢 |
| `ReportsPage` — 17 líneas de `useMemo`/`reduce` sobre `dailySales` | 17 | `useReports` expone `isLoading`; los KPI muestran `Skeleton` mientras carga | 🟢 |
| Estado local síncrono (`ItemConfigModal` `qtys[e.id] ?? 0` ×3, `CategoryTabs:50` conteos) | 4 | no hay consulta detrás | 🟢 |
| `StockAdjustModal:40` `current = selected?.stock_qty ?? 0` | 1 | solo **muestra** `resultado = actual ± delta`; la RPC recibe el **delta** y recalcula sobre la base | 🟢 |
| `ConfigPage:1075` conteo de usuarios por rol (display) | 1 | muestra `0` mientras `roleCounts` carga | 🟡 |
| **`CloseShiftModal:43,48,58,186,199,213`** (`salesSummary?.x ?? 0`, `currentShift?.opening_amount ?? 0`) | 6 | ver §3.1 | 🔴 |
| `MovementsModal:88,89` (`opening_amount ?? 0`, `salesSummary?.cash ?? 0`) → `calcShiftBalance` → `wouldOverdraft` | 2 | con `salesSummary` nulo el efectivo disponible se **subestima** ⇒ aviso *"este egreso supera el efectivo disponible"* **falso**. De dos pasos, no bloquea: el movimiento se registra bien | 🟡 — **advertencia falsa** (la clase de R?) |
| `ShiftBanner:43` `salesSummary?.total ?? 0` | 1 | muestra `$ 0` de ventas del turno durante la carga | 🟡 |
| `ConfigPage:1056` `(roleCounts[role.id] ?? 0) > 0` — guard de **borrar rol** | 1 | ver §3.5 | 🟡 |
| `ConfigPage:1276` `(count ?? 0) > 0` — extra en uso | 1 | post-`await`, pero **el `error` no se lee**: si la consulta falla, `count=null` ⇒ el mensaje omite *"se usa en N ventas"*. La acción es la misma (desactivar), solo cambia el texto | 🟡 |

Suma: 13+13+6+17+4+1+1+6+2+1+1+1 = **66 ocurrencias en 65 líneas** ✓.

### 2.5 · `?? ''` — 30

| grupo | n | razón | (b) |
|---|---|---|---|
| Inicialización de formulario desde una fila **que el modal recibe por prop** (`CustomerFormModal`×3, `SupplierFormModal`×4, `CategoryModal`×2, `ProductModal:62,63,66`, StoreModal ×2, ExtraFormModal ×2) | 15 | la fila ya existe cuando el modal abre | 🟢 |
| Filtros de búsqueda sobre campos opcionales (`CustomerPicker:29`, `FiadoPage:99`, `POSPage:1587`, `ProductsPage:102`) | 4 | comparación, no decisión | 🟢 |
| `ConfigPage:242-245` `setName(sede.name ?? '')…` | 4 | dentro de un efecto que corre **cuando `sede` llega** | 🟢 |
| `useSubscriptionStatus:50` `(message ?? '').trim()` | 1 | normaliza texto | 🟢 |
| `StoreSelector:64` `value={profile?.sede_id ?? ''}` · `ConfigPage:613` `value={user.role_id ?? ''}` | 2 | valor de `<select>`; sin opción coincidente se ve vacío | 🟢 |
| `StockAdjustModal:28` `useState(preselectedId ?? '')` | 1 | prop síncrona | 🟢 |
| `ProductModal:65` `categoryId = product?.category_id ?? categories[0]?.id ?? ''` | 1 | producto **nuevo** con categorías aún cargando ⇒ `''` ⇒ el `<select>` queda vacío; `isValid` lo exige | 🟢 (la validación cierra) |
| `ConfigPage:1263` `sedeId = profile?.sede_id ?? ''` (alta de extra) | 1 | `''` en un `uuid not null` ⇒ **la base rechaza**, ruidoso | 🟢 |
| `ConfigPage:1141` ExtraFormModal init | 1 | fila por prop | 🟢 |

Suma: 15+4+4+1+2+1+1+1+1 = **30** ✓.

### 2.6 · `?? null` — 41 líneas / 43 ocurrencias

| grupo | n | razón | (b) |
|---|---|---|---|
| `profile?.sede_id ?? null` etc. como **`queryKey`/`enabled`** (`useCustomers`×2, `useDebts`, `useExpensesHistory`×2, `usePermissions:18`, `usePurchases`×2, `useReports`, `useSalesHistory`×2, `useShiftHistory`×2, `useSuppliers`, `useStockMovements:26`×3) | 17 | vienen del contexto de auth, que **sí** tiene `isLoading`; con `null` la consulta queda `enabled:false` — no decide, espera | 🟢 |
| `AuthContext` (`session?.user ?? null` ×2, `organizacion/sede/rol` ×3, `roleId/organizationId` ×2) | 7 | el contexto expone `isLoading` y `ProtectedRoute` lo espera | 🟢 |
| `find(...) ?? null` sobre una lista **ya cargada** (`StockAdjustModal:39`, `PaymentSplitEditor:80`, `FiadoPage:61,74,105`, `POSPage:1581`) | 6 | la lista es la que carga; el `find` es síncrono | 🟢 |
| Props/valores síncronos (`App.tsx:133`, `AppLayout:98` logo, `ProductModal:34,35,66,474`, `printer:289,290`) | 8 | | 🟢 |
| `usePermissions:55` `roleName ?? null` · `useSubscriptionStatus:119` `actualizadoEn` | 2 | solo display / diagnóstico | 🟢 |
| `usePurchases:63` `invoice ?? null` — con `isLoading` | 1 | el consumidor espera | 🟢 |
| **`useCashShift:41`** `return data ?? null` → `isOpen: !!currentShift` → **`POSPage.handleCheckout`** | 1 | ver §3.6 | 🟡 |
| `useSalesHistory:131` `sale ?? null` → `SaleDetailModal` | 1 | *cargando* y *no encontrada* se ven iguales; solo lectura | 🟡 |

Suma: 17+7+6+8+2+1+1+1 = **43 ocurrencias en 41 líneas** ✓.

### 2.7 · `.single()` — 26

`.single()` sobre cero filas **devuelve error `PGRST116`**, no `null`: es **ruidoso** en la capa de
consulta. La pregunta es qué hace la capa de arriba con ese error.

| grupo | n | razón | (b) |
|---|---|---|---|
| Después de `insert`/`upsert`/`update` (una fila por construcción) | 18 | no hay cero filas posibles salvo error de escritura, que se lanza | 🟢 |
| `getProfile` (`:8`) y `AuthContext:54,72` | 3 | `PGRST116` **manejado**: cierra sesión con toast *"Tu usuario está desactivado"* | 🟢 |
| `getOrganizationSubscription` (`:36`) | 1 | error ⇒ `notice=null` ⇒ **fail-open documentado** en el hook | 🟢 (decisión escrita) |
| `getPurchaseInvoiceDetail` (`:1053`) | 1 | `?? null` con `isLoading` | 🟢 |
| `getSaleDetail` (`:554`) | 1 | `?? null` ⇒ *cargando* = *no existe* en el modal | 🟡 |
| `usePermissions:27` (rol por id) | 1 | error ⇒ `permissions=[]` ⇒ `can()` **siempre falso**, sin aviso. Fail-closed (bien), pero **mudo**: un rol borrado deja al usuario sin ninguna pantalla y sin saber por qué | 🟡 |
| `getSede` (`:16`) | 1 | error ⇒ `sede` undefined ⇒ **`config ?? {}`** ⇒ alimenta el 🔴 de §3.4 | 🔴 (por su consumidor) |

Suma: 18+3+1+1+1+1+1 = **26** ✓.

### 2.8 · `.maybeSingle()` — 1

| ubicación | consumidor | (b) |
|---|---|---|
| `getOpenShift` (`:699`) — `null` **legítimo** = no hay jornada | `useCashShift` → `isOpen` → `POSPage` (§3.6) | 🟡 |

### 2.9 · Hooks de `src/hooks/` — 29 archivos

**Exponen carga (o devuelven el `useQuery` entero):** `useAuth`, `useCashShift` (*parcial*),
`useCategories`, `useCustomers`, `useDailySummary`, `useDebts`, `useExpensesHistory`, `useExtras`,
`usePermissions`, `useProductComponents`, `useProductExtras`, `useProducts`, `usePurchases`,
`useReports`, `useRoles` (*parcial*), `useSalesHistory`, `useSedeConfig`, `useShiftHistory`,
`useStockMovements`, `useStores`, `useSuppliers`, `useUsers` — 22.

**No aplica** (mutaciones o estado de UI, sin consulta que esperar): `useInventory`,
`useProductMutations`, `useCollapsedGroups`, `useScrollOverflow` — 4.

**No exponen carga, y son los que importan:**

| hook | qué devuelve mientras carga | (b) |
|---|---|---|
| `useProductsWithExtras` | `new Set()` — **indistinguible** de "ninguno tiene extras" | 🔴 **54** |
| `useSubscriptionStatus` | `notice=null` — fail-open **deliberado y escrito** en el hook | 🟢 |
| `useCashShift` — **parcial**: expone `isLoadingShift` pero **no** la carga de `salesSummary` ni `movements` | `salesSummary=null`, `movements=[]` | 🔴 vía `CloseShiftModal` (§3.1) |
| `useRoles` — **parcial**: `isLoading` cubre `roles`, **no** `roleCounts` | `roleCounts={}` | 🟡 vía borrar rol (§3.5) |

Y un hallazgo lateral: **`useDailySummary` no tiene ningún consumidor** (`grep -rn "useDailySummary("
src/` → vacío). Es código muerto que además duplica la agregación de `useReports`. No es de esta
auditoría, se anota.

---

## 3 · Los hallazgos que exigieron juicio

### 3.1 · 🔴 El cierre de caja persiste un arqueo calculado sobre `?? 0`

`CloseShiftModal` calcula `expectedCash` con `salesSummary?.cash ?? 0`, `movementsIn/Out` sobre
`movements` (default `[]`) y `currentShift?.opening_amount ?? 0`. **El botón de cerrar solo exige
`rawAmount.length > 0`** — no mira si `salesSummary` llegó. Y lo que se escribe es permanente:

```ts
await closeShift({ expectedAmount: expectedCash, difference, reconciliation: {...} })
```

`expected_amount`, `difference` y el snapshot `close_reconciliation` van a `jornadas`, y el
comentario del propio hook dice que la reimpresión **no recomputa** — lee el snapshot. Un cierre con
`salesSummary=null` graba **cero ventas** como esperado y un "sobrante" enorme como diferencia, para
siempre.

**¿Puede pasar antes del dato?** `salesSummary` se carga con el layout y refresca cada 5 s, así que
la ventana de *tiempo* es la primera vuelta tras montar. Pero `null` también es lo que queda **si la
consulta falla** — y ese estado no se distingue del anterior ni del "no hubo ventas". Tres estados,
un `null`.

### 3.2 · 🔴 Guardar un producto antes de que carguen sus extras/receta los BORRA todos

`ProductModal`:

```ts
const [selectedExtras, setSelectedExtras] = useState<Set<string>>(new Set())
useEffect(() => { if (!extrasInit && product && assignedIds.size > 0) setSelectedExtras(new Set(assignedIds)) … })
const [recipeRows, setRecipeRows] = useState<RecipeRow[]>([])
useEffect(() => { if (!recipeInit && product && initialRows.length > 0) setRecipeRows(initialRows) … })
…
disabled={!isValid || saving}          // el guardar NO mira isLoading de ninguno de los dos hooks
…
await reconcileRecipe.mutateAsync({ rows: isComposite ? recipeRows : [] })
await reconcile.mutateAsync({ productId, extraIds: [...selectedExtras] })
```

Los dos hooks **sí exponen `isLoading`** — el modal **no lo destructura**. Al abrir un producto
existente, `useProductExtras(product.id)` y `useProductComponents(product.id)` disparan consultas
nuevas (clave por id): hay una vuelta real de red con el modal abierto y el botón activo. Si se
guarda en esa ventana, `selectedExtras` y `recipeRows` están vacíos, y `reconcile` —que re-lee la
base correctamente— calcula `toRemove = todo lo actual` y **borra las asignaciones**. En un
compuesto, borrar la receta significa que **vender ese producto deja de descontar stock**.

Es la misma forma que la 54 —un Set que arranca vacío alimentando una escritura— pero la escritura
es un **delete**.

### 3.3 · 🔴 El modal de extras deja confirmar mientras dice "Cargando extras…"

`ItemConfigModal` usa `isLoading` para pintar el texto *"Cargando extras…"* — y **no para
deshabilitar el botón** `item-config-confirm`. Con `available=[]` durante la carga, `handleConfirm`
entrega `extras=[]` y el producto entra al carrito **sin extras**: la línea vale menos, la orden se
cobra así. Es la 54 **un paso más adelante**: aunque se arregle la compuerta del POS, este modal
tiene su propia ventana, por producto, en la primera apertura.

### 3.4 · 🔴 Configuración de caja: `{}` muestra los defaults como si fueran lo guardado, y guardar borra el resto

`SectionCaja`:

```ts
const reasons = config.cash_out_reasons ?? DEFAULT_CASH_OUT_REASONS
const methods = config.payment_methods ?? ['cash','card','transfer','nequi']
const [localReasons] = useState(reasons)     // ← se inicializa UNA vez
…
if (isLoading) return <Skeleton />            // ← DESPUÉS de los useState
```

Y en `useSedeConfig`: `updateConfig = patch => update({ config: { ...config, ...patch } })`, con
`config = sede?.config ?? {}`.

Dos mecanismos sobre el mismo `{}`:
1. Si la sección monta antes de que `sede` esté en caché, `localReasons` queda con los **defaults**
   y no se resincroniza. La pantalla afirma que esa es la configuración. Guardar la sobrescribe.
2. Si la consulta de `sede` **falló**, `config={}` de forma permanente (`isLoading` ya es falso):
   el spread `{...{}, ...patch}` escribe **solo** las dos claves del patch y **borra `slug` y
   `nequi_qr_url`**.

La ventana de tiempo es chica (AppLayout ya cachea `sede`); **el camino de error está abierto**.

### 3.5 · 🟡 Borrar un rol: el guard de la UI es mudo mientras carga, la base sostiene

`if ((roleCounts[role.id] ?? 0) > 0) return` — `roleCounts` carga aparte y `useRoles.isLoading`
**no la incluye**. En la ventana, la UI deja pasar el borrado de un rol con usuarios. La base **no**:
`profiles.role_id references public.roles` sin `on delete` ⇒ `NO ACTION` ⇒ rechaza. El usuario ve
un error genérico en vez del mensaje accionable. 🟡 porque la base es fail-closed; anotado porque
el guard existe precisamente para dar el mensaje, y en la ventana no lo da.

### 3.6 · 🟡 "Cobrar" en el primer segundo abre "Abrir turno" aunque el turno exista

`POSPage`: `const { isOpen: isShiftOpen } = useCashShift()` — **no destructura `isLoadingShift`**,
que el hook sí expone y que **`AppLayout` sí usa** para su banner. `isOpen = !!currentShift` es falso
mientras carga ⇒ `handleCheckout` abre `OpenShiftModal`. Si el cajero confirma, `insert` en
`jornadas` ⇒ `idx_jornadas_una_abierta_por_sede` lo rechaza ⇒ *"Error al abrir el turno"*. Sin datos
escritos; confusión y un toast que no explica. La misma capa (layout) ya conocía la respuesta.

---

## 4 · Resumen

| (b) | n | dónde |
|---|---|---|
| 🔴 | **4** | cierre de caja (§3.1) · guardar producto (§3.2) · confirmar extras (§3.3) · config de caja (§3.4) — más la **54**, que es la raíz de §3.3 |
| 🟡 | **10** | picker de clientes · overdraft falso · banner `$ 0` · conteo de rol · borrar rol · mensaje de extra · `SaleDetail` · permisos mudos · `isShiftOpen` en POS · `useSedeConfig` en MovementsModal |
| 🟢 | **~208** | post-`await` con throw · consumidor con `isLoading` · fila ya cargada · estado local · claves/`enabled` desde auth |

**Los cuatro rojos comparten una forma exacta**, que es la clase: *un default vacío que un hook
devuelve sin `isLoading` —o con un `isLoading` que el consumidor no lee— alimentando una
ESCRITURA*. Los 🟡 son la misma forma alimentando una **pantalla o un aviso**. Los 🟢 son `??` que
llegan después del dato.

⚠️ **Tres de los cuatro rojos tienen `isLoading` disponible y sin usar** (§3.1 parcial, §3.2, §3.3).
El hook hizo su parte; el consumidor no lo leyó. Solo la 54 y `roleCounts` son hooks que de verdad
no exponen la carga. Eso cambia el arreglo: no es "agregar `isLoading` a los hooks", es **"leerlo
donde se decide"** — y para el cierre de caja y el modal de producto, **deshabilitar la escritura
hasta que llegue**.

**Control final:** la deuda 54 aparece como 🔴 (§2.1) y **no aparece sola** — hay tres más, dos de
ellas en escrituras que **destruyen** filas (§3.2) o **persisten un arqueo falso** (§3.1). La
sospecha de que la clase tenía más de un caso era correcta, y el caso más grave no era la 54.

*Nada de lo anterior se arregló. Los seis disparos del hook de SQL durante esta auditoría fueron
sobre `grep`s de lectura en `supabase/` — falsos positivos, al ledger de la deuda 22.*
