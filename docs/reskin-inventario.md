# Re-skin · Inventario de superficie

*2026-09-01. Medido, no estimado — el script vive en el scratchpad de la sesión; los comandos para
reproducir cada número están al pie. **Ninguna línea visual escrita todavía.***

Fuente de verdad: la skill `nodo-design-system`. Regla nº 1 del re-skin: **los `data-testid` no
cambian** — la suite en 164/0 es la red.

---

## 1 · De qué está hecha la superficie HOY

| Medida | Valor |
|---|---|
| Archivos con estilo | 36 de 78 |
| `style={{…}}` inline | **1.362** |
| `className=` (Tailwind) | 60 — y 30 están en `AppLayout`. Tailwind es marginal |
| Hexes sueltos | **1.763 ocurrencias, 54 distintos** |
| `var(--…)` | **0** — no existe una sola variable CSS en `src/` |
| `monospace` | **24 archivos** (POSPage ×25, CloseShiftModal ×15) — la skill la **prohíbe** |
| Inter | `fontFamily: 'Inter, system-ui'` en inline… **y la fuente no está cargada**: sin `@font-face`, sin link. Hoy todo el mundo ve `system-ui` |

**Lectura:** el estilo vive inline y por hex literal. No hay capa de tokens que "migrar": hay que
**crearla** (skill §1 en `:root`) y drenar los 1.763 hexes hacia ella.

### El censo de hexes contra los tokens de la skill

**Coinciden ya (se tokenizan sin cambio visual):** los neutros son slate y son los mismos valores —
`#0F172A`→`--ink` (×187) · `#334155`→`--ink-2` (×87) · `#64748B`→`--ink-3` (×150) ·
`#94A3B8`→`--ink-4` (×153) · `#E2E8F0`→`--border` (×96) · `#F1F5F9`→`--border-2` (×115) ·
`#F8FAFC`→`--surface-2` (×69) · `#DC2626`→`--danger` (×59).

**🔴 El intruso:** `#10B981` ×155 — **el emerald de acento de VENTO**, tercer hex más usado. Es la
identidad del otro producto en botones, focos, toggles y positivos. La familia `--action` de Nodo
(sky `#0284C7`…) **no aparece ni una vez**.

**Conflictos a resolver al drenar:**
- `#E5E7EB` ×107 es **gray-200 de Tailwind**, no `--border` (`#E2E8F0`, slate-200). Dos grises casi
  idénticos conviven; los dos van a `--border`.
- Los verdes actuales (`#059669` ×19, `#065F46` ×28, `#ECFDF5` ×36) **no** son la familia
  `--success` de la skill (`#047857`/`#D1FAE5`/`#065F46`). Cerca, no iguales.
- `#B91C1C` ×22 — es *justo* el `--brand-accent` de Muscle Pro, que la skill **prohíbe en la
  aplicación**. Hoy se usa como rojo genérico; va a `--danger`/`--debt` según el caso.
- Ámbar (`#854D0E`, `#FDE68A`, `#FFFBEB`) suelto → familia `--warning`.

---

## 2 · Componentes de la skill (§4) contra lo que existe

| Skill | Hoy | Veredicto |
|---|---|---|
| **Button** | no existe: botones inline en todas partes | **crear** |
| **Badge** | inline: `stock-status-badge`, `sale-voided-badge`, `overdraft-badge`, "Anulada"/"Cortesía" | **crear** y absorber |
| **DataRow** | filas inline por página | **crear** |
| **MoneyCell** | cifras con `monospace` inline | **crear** — es la que mata la monoespaciada (`tabular-nums`) |
| **Input / SearchField** | inline | **crear** |
| **CupoMeter** | no existe — **y `cupo` no existe en el ESQUEMA: cero columnas** | **crear en estado `sin dato`** (la skill lo contempla: `—` + invitación). ⚠️ El dato es deuda aparte |
| **AgingBar** | no existe; Cartera no calcula antigüedad | **crear**; el cálculo es `created_at` de órdenes pending — el dato SÍ está |
| **TenderSelector** | existe con otra forma: `pay-method-${id}` en POSPage | **rehacer conservando testids** |
| **Alert** | parcial: `ShiftBanner`, `SubscriptionBanner`, `overdraft-warning` | **unificar** |
| **EmptyState** | "Sin resultados" ad-hoc, sin botón | **crear** — la skill exige botón siempre |
| **Dialog** | **12+ modales inline**, cada uno con su velo y su sombra | **crear** y migrar de a uno |
| **Tabs / Chips** | `CategoryTabs`, `report-tab-*`, chips de filtro ad-hoc | **unificar** |
| **NavItem** | AppLayout con Tailwind (el único) | **rehacer** (214px, grupos de la skill) |
| **KpiCard** | dos versiones: `kpi-*` en FiadoPage y `KPICard` local en ReportsPage | **unificar** |

**Sobran respecto de la skill:** nada estructural — pero `ProductCard`/`product-grid-card` es
tarjeta y la regla 3 dice **filas, no tarjetas** para el catálogo. El grid del POS es decisión
aparte (¿mostrador con grid de tarjetas o filas? la skill muestra filas — **pregunta abierta**).

---

## 3 · La red: data-testid por pantalla (completa, NO cambia)

*La suite en **164/0** prueba que cada testid que los tests usan existe en runtime — incluidos los
dinámicos (`pay-method-${id}`, `group-header-${id}`, `kpi-${key}`, `perm-${key}`…).*

| Pantalla / componente | testids |
|---|---|
| **POSPage** (20) | `canal-label` `canal-toggle` `cart-edit-extras` `cart-item-extras` `cart-total` `checkout-change` `checkout-confirm` `checkout-continue` `checkout-received` `checkout-total` `discount-amount` `discount-reason` `pay-split-toggle` `pos-category-tabs` `pos-category-tabs-fade` `pos-stock-indicator` `product-card` `retry-order-number` `success-order-number` `success-sin-numero` + `pay-method-${id}` |
| **SalesHistoryPage** (21) | `cancelled-sale-row` `cancelled-sales-section` `sale-detail-*` (5) `sale-reprint` `sale-row` `sale-row-method` `sale-void-*` (4) `sale-voided-badge` `sales-from/to/method/search/next/prev` |
| **FiadoPage** (10) | `abonar-btn` `credit-row` `credit-row-saldo` `customer-deactivate` `customer-detail` `customer-row` `customer-row-saldo` `debt-search` `detail-total` `new-customer-btn` + `kpi-${key}(-value)` + tab `fiado-tab-customers` |
| **PurchasesPage** (5) | `new-invoice-btn` `new-supplier-btn` `purchase-row` `supplier-deactivate` `supplier-row` + tab `purchases-tab-suppliers` |
| **InventoryPage** (7) | `inventory-adjust-btn` `stock-level-adjust/qty/row` `stock-movement-qty/row` `stock-status-badge` + tabs `inventory-tab-levels/movements` |
| **ExpensesHistoryPage** (9) | `expense-amount/from/to/next/prev/reason/row/scope-toggle` `expenses-total` + `expense-scope-${s}` |
| **ShiftHistoryPage** (13) | `shift-closed-by/declared/diff/expected/from/to/history-row/next/opened-by/opening/prev/reprint/scope-toggle` + `shift-scope-${s}` |
| **ReportsPage** (2) | `export-financiero` `export-stock` + `report-tab-${id}` |
| **ConfigPage** (12) | `extra-*` (6) `role-*` (5) `user-toggle-self` + `perm-${key}` |
| Modales | `item-config-*` (7) · `pay-*` split (4+3 dinámicos) · `debt-*` (7+din.) · `movement-*`/`overdraft-*` (8) · `close-shift-*`/`shift-arqueo-*`/`pay-declared/diff-${m}` (5+din.) · `open-shift-amount` · `new-invoice-*`/`invoice-*` (13) · `purchase-detail-*` (2) · `supplier-*` (7) · `customer-*` form/picker (10) · `stock-adjust`/`adjust-*` (9) · `product-*`/`recipe-*`/`category-tabs-*`/`oversold-alert` (14) |
| Layout | `sidebar-brand-logo/name` `store-selector` `subscription-banner*` (3) `group-${id}` `group-header-${id}` `error-boundary-*` (2) |

---

## 4 · Pantallas: las 9 de la skill contra las 10 del nav actual

| Skill (§5) | Hoy | Estado |
|---|---|---|
| **Mostrador** | `POSPage` (nav: "Ventas") | existe — re-skin |
| **Pedidos** | — | **NO EXISTE** (está en el alcance; sin pantalla ni esquema de flujo) |
| **Compras** | `PurchasesPage` | existe — re-skin |
| **Gastos** | `ExpensesHistoryPage` | **parcial**: es historial de egresos de caja, no el módulo de la skill |
| **Catálogo** | `ProductsPage` | existe — re-skin |
| **Inventario** | `InventoryPage` | existe — re-skin |
| **Clientes** | tab dentro de `FiadoPage` | la skill los separa — decisión al llegar |
| **Cartera** | `FiadoPage` (nav: "Fiado") | existe — re-skin (la etiqueta ya se decidió "Cartera") |
| **Utilidades** | — | **NO EXISTE** (`ReportsPage` es Financiero/Stock, otra cosa) |

**🔴 Y cuatro pantallas existen que la skill NO nombra:** `Historial` (ventas), `Turnos`,
`Configuración`, `Login`. La regla de la skill es explícita — *si no está acá, no está decidido y
se pregunta*. **Pregunta abierta nº 1 del re-skin: ¿dónde viven Historial, Turnos y Configuración
en la navegación de la skill?** (Login además necesita la capa de marca §1.1.)

---

## 5 · Orden propuesto contra Mostrador → Compras → Cartera

**Paso 0 — los cimientos, sin tocar ninguna pantalla** *(propuesto como primer commit visual)*:
1. Tokens de la skill §1 en `:root` (`src/index.css`), incluida la capa de marca con los valores
   de Muscle Pro **solo** donde la skill lo permite.
2. Cargar **Inter** de verdad (400–700) — hoy no está.
3. Primitivas: `Button`, `Badge`, `MoneyCell`, `DataRow`, `Input`, `Dialog` en
   `src/components/ui/`, con los estados de §4.
4. `tabular-nums` global para cifras vía `MoneyCell` — y la monoespaciada muere al migrar cada
   pantalla, no en un sed.
   *Verificación del paso 0: `tsc` + suite completa verde — cero cambio de comportamiento.*

**1 · Mostrador** (`POSPage`, 200 inline / 33 hexes distintos — la más grande):
panel de cobro sobre `--ink` con tokens `--on-dark-*` · `TenderSelector` 52px ·
botón Cobrar 52px con "Cobrar — F12" (la única tecla impresa) · `--fs-total` 44px ·
`CupoMeter` en estado `sin dato` · estados obligatorios de §6.
⚠️ Decisiones que necesita: grid de tarjetas vs filas (regla 3); dónde queda el selector de canal.

**2 · Compras** (`PurchasesPage` + `NewInvoiceModal`):
encabezado de documento · `Badge` borrador/aplicada/anulada — ⚠️ **el esquema no tiene `borrador`**:
hoy la compra se aplica al registrar (RPC atómica). El estado visual existe en la skill; el flujo
en dos tiempos (regla 10: "el efecto se muestra antes de aplicarla") **requiere decisión de
producto**, no solo CSS. Para el re-skin puro: aplicada/anulada con lo que hay.

**3 · Cartera** (`FiadoPage`):
`KpiCard` (los `kpi-*` ya existen) · `DataRow` en mora con `--d1` + franja `--debt` ·
`AgingBar` — el dato se deriva de `created_at` de las órdenes pending (existe) ·
badge `requiere_conciliacion` (columna y flujo ya vivos) · estado `registrar abono`.

**Cierre por pantalla: su spec E2E verde ANTES de pasar a la siguiente** — Mostrador cierra con
`pos` + `descuento` + `pago-mixto` + `tipo-venta-reset` + `extras-pos` + `stock-bajo-pos` verdes;
Compras con `compras`; Cartera con `fiado`.

---

## 6 · Preguntas abiertas antes del primer commit visual

1. **Historial / Turnos / Configuración**: no están en la navegación de la skill. ¿Grupo propio,
   o esperan su rediseño? (El re-skin de tokens los alcanza igual; la duda es el NAV.)
2. **Catálogo del POS: ¿grid de tarjetas o filas?** La regla 3 dice filas para catálogos; el
   mostrador de la maqueta — confirmar contra `Nodo.dc.html`.
3. **Toasts** (§8.8): sin diseñar. Se re-skinean con tokens mínimos ¿o quedan como están hasta
   la decisión?
4. **Paso 0 como commit único** (tokens + primitivas sin consumidores visibles): ¿ok, o preferís
   tokens + Mostrador en el mismo commit para que nada quede "creado sin consumidor" (deuda 37)?

---

*Reproducir los números:*
`grep -c 'style={{' src/**/*.tsx` · `grep -ohE '#[0-9a-fA-F]{6}' src -r | sort | uniq -c` ·
`grep -rln monospace src` · `grep -rho 'data-testid="[^"]*"' src -r | sort -u`
