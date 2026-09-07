# Nodo — ¿Qué le falta para ser un ERP, y cómo cambiaría el cobro?

*2026-09-07. Investigación. Los datos del producto salen de lo medido en el proyecto; los de mercado, de fuentes públicas de 2026 citadas al pie.*

---

## 1. La respuesta corta

**Nodo hoy no es un ERP y no le falta poco.** Es un **sistema de gestión comercial**: mostrador, catálogo, inventario, compras, cartera, caja y gastos, multi-sede con aislamiento real. Eso es la capa operativa de un ERP — la que el negocio usa todo el día — y está bien construida. Lo que falta es la capa **contable, tributaria y de nómina**, que es la que en Colombia hace que un producto se llame ERP y que un cliente formal esté obligado a pagar.

**Y el salto de precio no está en "ser ERP": está en la facturación electrónica.** Es la única funcionalidad que un cliente constituido *no puede no tener*, y es la frontera entre el tier donde Nodo compite hoy (POS + inventario, $40.000–$85.000/mes) y el tier donde compiten Alegra y Siigo ($70.000–$280.000/mes).

---

## 2. Qué es un ERP en Colombia — la vara con la que se mide

Un ERP integra en una sola plataforma contabilidad, facturación, inventario, compras, ventas, nómina y más, de modo que los datos fluyan automáticamente entre áreas. <cite index="59-1">A diferencia de tener un software contable separado, una hoja de Excel para inventario y otro sistema para nómina, el ERP centraliza todo y hace que los datos fluyan automáticamente entre áreas.</cite>

En Colombia la definición tiene una capa legal que no es opcional. <cite index="60-1">Un ERP integra módulos especializados en nómina y gestión de talento humano</cite> y <cite index="60-1">la implementación de un ERP en Colombia no es solo una tendencia, sino una necesidad para adaptarse a regulaciones nacionales como las exigencias de la DIAN para facturación electrónica o los lineamientos del Ministerio de Trabajo relacionados con nómina electrónica</cite>.

Y el cumplimiento ya no es solo facturar: <cite index="58-1">El cumplimiento con la DIAN en 2026 ya no se limita a emitir facturas electrónicas. Los programas líderes deben manejar el ecosistema completo de documentos electrónicos. Factura electrónica de venta con validación previa y generación de CUFE. Nómina electrónica (obligatoria para todos los empleadores desde 2022).</cite> Se suman los <cite index="58-1">Documentos equivalentes electrónicos (DEE): tiquetes de máquina registradora POS</cite>, que aplican al mostrador.

**Distinción que importa para el precio:** <cite index="59-1">Un software contable se enfoca en registrar transacciones financieras y cumplir con la DIAN. Un ERP integra además inventario, compras, ventas, nómina y CRM en una sola plataforma.</cite> Nodo tiene la mitad operativa y no la contable — es el complemento exacto de un software contable.

---

## 3. Dónde está Nodo — capa por capa

Medido sobre el repo al 2026-09-07, no sobre la intención.

> 🔴 **CORREGIDO el 2026-09-07, verificando capa por capa contra el código y las deudas abiertas.**
> La versión anterior marcaba **cinco capas como «✅ Completo» teniendo deuda abierta**, y le faltaba
> una capa entera. Se escribió de memoria; esto es lo medido.

| Capa | Estado | Evidencia |
|---|---|---|
| **Mostrador (POS)** | ✅ Completo | Cobro en modal, **4 medios de pago** (`cash`·`card`·`transfer`·`nequi`), pago mixto, fiado, precio negociado con guard asimétrico (+100%/−35%) medido sobre 55 ventas reales. ⚠️ *Decía «5 medios»: el quinto de la UI es **fiado**, que no es un medio de pago sino la AUSENCIA de pago — no escribe fila en `payments`* |
| **Catálogo** | ✅ Completo | 42 productos con código y unidad, búsqueda por código, índice único por sede |
| **Inventario** | 🟡 Motor sí, tablero no | Existencias, movimientos, ajuste con motivo, promedio ponderado móvil, costo congelado por línea. **Pero `cost_price` se puede cambiar por la tabla sin motivo y sin rastro** — `adjust_cost` no cierra ese camino (deuda **78**) |
| **Compras** | 🟡 Motor sí, tablero no | Facturas por proveedor, fecha de documento, unidad de compra con factor, `adjust_cost`. 🔴 **La DEVOLUCIÓN existe en la base y NO tiene botón** (deuda **77**): `register_purchase_return` está aplicada y probada, y desde la UI no se puede hacer |
| **Cartera (CxC)** | 🟡 Motor sí, tablero no | Deudas, abonos, plazo congelado en la venta, antigüedad. La marca `requiere_conciliacion` se pone y se ve en el modal de abonos, pero **no hay pantalla de conciliación** que liste los marcados (deuda **37**) |
| **Caja** | 🟡 Motor sí, tablero no | Jornadas, arqueo, movimientos con categoría estructurada. **La fecha de cierre de una jornada ya cerrada se puede reescribir sin que nada avise** (deuda **97**): el trigger sólo sella la primera vez |
| **Gastos** | ✅ Completo | Subcategorías por sede, activo fijo como subcategoría |
| **Multi-sede / multi-tenant** | ✅ Completo | RLS medida en 828 celdas, alta entre sedes, aislamiento verificado |
| **Reportes** | 🟡 Parcial | Vendido, cobrado, órdenes, ticket, con definiciones. **No hay Utilidades como pantalla** (deuda 86) |
| **Pedidos (dos fases)** | ⛔ No existe | Deuda 85, está en el alcance firmado |
| **Cupo de crédito** | ⛔ No existe | Deuda 40, `CupoMeter` en `sin dato` |
| **Facturación electrónica** | ⛔ No existe | Fase "clientes formales" |
| **Contabilidad** | ⛔ No existe | Sin plan de cuentas, sin causación, sin libros |
| **Impuestos** | ⛔ No existe | Sin IVA por producto (62b), sin retenciones, sin exógena |
| **Nómina** | ⛔ No existe | — |
| **Tesorería / bancos** | ⛔ No existe | El "Resumen General" del cliente pedía esto; se anotó como módulo aparte |
| **Cuentas por pagar (CxP)** | ⛔ No existe | Compras son de contado; la compra a crédito a proveedor es idea pospuesta |
| **Activos fijos** | 🟡 Parcial | Como subcategoría de gasto, sin depreciación |
| **Suscripción / corte de acceso** | ✅ Construido | 🔴 **Faltaba en esta tabla.** `subscription_status` (5 estados, `text` con `CHECK`), `SubscriptionBanner` y la Edge Function `aplicar-estado`. O sea **el mecanismo para cortar el acceso por estado de pago ya existe** — sin que haya un precio |

### 🔴 Las cuatro 🟡 comparten una forma, y no es «casi completo»

**El motor está y el tablero no.** En las cuatro, el mecanismo vive en la base —probado, con su
migración y su RPC— y **lo que falta es el camino en la interfaz**:

| capa | el motor | lo que falta en la UI |
|---|---|---|
| Compras | `register_purchase_return`, aplicada y probada | el botón de devolver |
| Cartera | `requiere_conciliacion`, se escribe y se muestra en el modal | la pantalla que liste los marcados |
| Inventario | `adjust_cost`, con motivo y rastro | **cerrar el camino directo** que lo saltea |
| Caja | el trigger que sella `closed_at` | que siga sellando después de la primera vez |

⚠️ **Por qué vale nombrarlo y no llamarlo «parcial»:** son incompletos de **coste bajo y riesgo
distinto**. Los dos primeros son trabajo de pantalla sobre algo que ya funciona. Los dos últimos
**no son de pantalla: son guards que faltan**, y por eso no se cierran dibujando.

🔴 **Y para una conversación de venta la distinción es la que importa:** «el motor está» significa
que el dato se está guardando bien hoy, así que la espera **no pierde información**. Un hueco de
esquema, en cambio, pierde datos todos los días.

---

**Lo que Nodo tiene y no es común en su tier:** el costo congelado por línea de venta, el promedio ponderado con sus caídas explícitas, el plazo de crédito congelado en la venta, y el aislamiento por sede verificado celda por celda. Son decisiones de modelo que los POS baratos no toman y que un ERP da por hechas.

---

## 4. Lo que falta, agrupado por lo que cuesta

### Bloque A — Facturación electrónica (el salto de precio)

Es un módulo, no un campo. Ya está enumerado en la Fase de clientes formales:

- Integración con un **Proveedor Tecnológico autorizado por la DIAN**. <cite index="59-1">Para emitir facturas electrónicas en Colombia, el software debe ser Proveedor Tecnológico (PT) habilitado por la DIAN o integrarse directamente con uno.</cite> Ser PT es una certificación; integrarse con uno es lo que hacen los productos del tamaño de Nodo.
- Resolución de numeración con rango vigente. Hoy `next_order_number` es un correlativo interno.
- IVA por producto (deuda 62b) — precondición.
- Datos tributarios del emisor: la organización no tiene régimen ni responsabilidades.
- Documento equivalente electrónico POS para el mostrador.

**Tamaño:** semanas, no meses, si se integra con un PT en vez de serlo. Es el trabajo más rentable de la lista porque es el que un cliente formal está obligado a pagar.

### Bloque B — Contabilidad (lo que convierte el producto en "contable")

- Plan de cuentas (PUC colombiano) y causación automática de cada operación: cada venta, compra, gasto y abono genera asientos.
- Libros, balance, estado de resultados.
- Conciliación bancaria — que hoy es donde los líderes compiten con IA.
- Retenciones (retefuente, reteICA) e información exógena.

**Tamaño:** meses, y necesita criterio contable, no solo técnico. Es el bloque que requiere a alguien que sepa NIIF además de código. Las plataformas líderes lo tienen como núcleo: <cite index="51-1">los reportes financieros avanzados de Siigo Nube (estado de resultado por función del gasto, asistente de conciliación fiscal, manejo de diferidos NIIF, diferencia en cambio contable)</cite> son años de trabajo.

### Bloque C — Nómina electrónica

Obligatoria para todo empleador desde 2022. Liquidación, seguridad social, prestaciones, y transmisión a la DIAN. **Tamaño:** meses. Muscle Pro hoy no tiene empleados; el primer cliente con nómina la va a pedir.

### Bloque D — Tesorería y CxP

Bancos con saldo, aporte de capital, cuentas por pagar a proveedores con vencimiento. Es lo que el "Resumen General" del cliente intentaba hacer en Excel y no le calculaba.

### Lo que ya está en el alcance firmado y no es ERP

Pedidos en dos fases (85), cupo de crédito (40), Utilidades como pantalla (86). Son deudas del producto actual, no del salto a ERP.

---

## 5. El mercado colombiano — qué cobran y por qué

Los precios se agrupan en tres tiers, y la frontera entre ellos es exactamente lo que falta en Nodo.

### Tier 1 — Gestión comercial (donde Nodo compite hoy)

POS + inventario + cartera, **sin contabilidad**. Muchos ya incluyen facturación electrónica porque la DIAN la exige al 80% de las empresas: <cite index="67-1">según la Resolución 000165 de 2023, la DIAN exige que el 80% de las empresas en Colombia usen un sistema POS electrónico</cite>.

| Producto | Precio mensual | Qué incluye |
|---|---|---|
| Loggro POS | <cite index="64-1">Desde COP $40.833/mes</cite> | Ventas, inventarios, reportes, facturación electrónica |
| Vendty POS | <cite index="64-1">Desde COP $85,000/mes</cite> | POS, inventario, facturación electrónica, tienda virtual |
| Aliaddo | <cite index="64-1">Desde $39.900/mes</cite> | Con contabilidad integrada |
| Siigo POS | <cite index="64-1">Desde COP $25,900/mes</cite> | Módulo POS del ecosistema Siigo |

### Tier 2 — Contable con POS incluido

<cite index="48-1">Los precios de un software contable en Colombia están entre $37.000 y $279.900 por mes según el plan y los módulos incluidos. Los planes de entrada de Alegra arrancan en $69.900 /mes. Siigo inicia en $145.993/mes en plan anual. World Office desde $38.000/mes.</cite>

Y un dato que importa para posicionar: <cite index="48-1">Lo que diferencia a Alegra en el mercado colombiano de 2026 no es solo el precio: es que el POS está incluido en todos los planes sin costo adicional</cite>. O sea que el POS —lo que Nodo es hoy— **se regala** como parte de un plan contable.

### Tier 3 — ERP completo

<cite index="56-1">Los planes inician en $696.000 COP al año (aprox. $58.000 al mes) e incluyen facturación, contabilidad, nómina e inventario. Hay planes de $994.000 y $1.874.000 para empresas con más operación.</cite> Y World Office, que es el ERP de retail con POS profundo: <cite index="50-1">Los planes Pyme tienen precios referenciados en el mercado desde $108.990/mes (plan Básico) hasta $279.990/mes</cite>, con la salvedad de que <cite index="50-1">POS y nómina electrónica son planes adicionales — para una pyme con punto de venta y 5 empleados, el costo total anual puede superar los $4.000.000 COP</cite>.

### Lo que el mercado enseña sobre el cobro

1. **El precio lo fija la obligación legal, no la funcionalidad.** Alegra cobra desde $17.900 por facturación sola y desde $69.900 por contabilidad — la facturación es la puerta, la contabilidad es el plan.
2. **El POS solo se está volviendo commodity.** Está incluido gratis en los planes contables, y hay opciones desde $25.900. Un producto que solo hace POS compite hacia abajo.
3. **Los módulos se cobran aparte y suman.** <cite index="48-1">El costo real de una implementación completa — con nómina, POS e inventario — puede ser entre 30% y 80% mayor al precio del plan base si los módulos se cobran por separado.</cite> Eso es una oportunidad de modelo: Nodo puede cobrar por capa.

---

## 6. Cómo cambiaría el cobro de Nodo

Esto es referencia de mercado para que decidas, no una recomendación de precio.

### Hoy — Tier 1, gestión comercial sin facturación electrónica

Nodo compite con Loggro POS y Vendty, pero **sin** facturación electrónica, que los dos tienen. Eso lo deja por debajo del tier: un cliente constituido no puede usarlo como sistema principal. El rango de referencia es $40.000–$85.000/mes, y Nodo sin FE se ubica en la parte baja o como complemento.

**Lo que sí justifica precio hoy:** el modelo de datos. Costo congelado, promedio ponderado, plazo por venta, multi-sede aislada. Son cosas que un POS de $25.900 no hace bien y que un cliente con cartera y varias sedes nota. Muscle Pro es el caso: no constituido, no factura, y el valor que recibe es cartera, inventario y márgenes reales.

### Con Bloque A — Tier 1 completo, y la puerta al Tier 2

Con facturación electrónica, Nodo entra al rango de Vendty y Loggro POS ($40.000–$85.000) con paridad de funciones, y con mejor modelo de datos. Y se vuelve **vendible a clientes constituidos**, que son la mayoría de los verticales objetivo (distribuidoras, ferreterías, droguerías).

**Es el único bloque con retorno claro:** semanas de trabajo, y abre el mercado que hoy está cerrado.

### Con Bloques A + B — Tier 2, contable

Compite con Alegra y Siigo en el rango $70.000–$180.000/mes. Pero compite contra productos con años de contabilidad, IA en conciliación y base instalada de contadores. **La contabilidad no es donde Nodo puede ganar** — es donde puede empatar después de meses, contra rivales que ya están.

### Con A + B + C + D — Tier 3, ERP

El rango sube a $100.000–$280.000/mes, y la referencia de esfuerzo es la de World Office: implementación de 4 a 6 semanas por cliente, módulos que se cobran aparte, y soporte de horario de oficina. Para un desarrollador solo, es un producto de otra escala.

---

## 7. Lo que esta investigación sugiere

**No apuntar a ERP.** El camino contable-nómina-tesorería es largo, necesita conocimiento que hoy no está en el equipo, y lleva a competir de frente con Alegra y Siigo en su terreno.

**Sí apuntar a Tier 1 completo, con facturación electrónica.** Es el bloque más chico, el que un cliente formal no puede no pagar, y el que convierte a Nodo de "complemento" en "sistema principal" para sus verticales.

**Y cobrar por capa, no por producto.** El mercado ya lo hace y los clientes lo entienden:

| Capa | Qué incluye | Referencia de mercado |
|---|---|---|
| Nodo Comercial | Lo que hay hoy: mostrador, catálogo, inventario, compras, cartera, caja, gastos | $40.000–$60.000 |
| + Facturación electrónica | Bloque A | +$20.000–$40.000 |
| + Multi-sede | Ya construido, hoy incluido | Cobrable por sede adicional |

**La ventaja que Nodo puede sostener no es el tier: es el vertical.** Los productos del mercado son horizontales — sirven a restaurantes, consultorios y ferreterías con el mismo modelo. Nodo nació para distribución y ya tiene decisiones que un horizontal no toma: unidad de compra con factor, precio negociado por venta con guard, plazo de crédito congelado, costo que no se reescribe. Cobrar por eso es cobrar por lo que ya existe, y no depende de construir una contabilidad.

---

## 8. Lo que este documento no sabe

- **Los precios de Alegra, Siigo y Loggro cambian con promociones y planes anuales.** Los de arriba son referencias de abril–junio de 2026 y hay que verificarlos antes de fijar un precio.
- **Qué cobrás hoy por Nodo.** Verificado con `grep`: **no hay ningún precio en el repo** — ni monto, ni plan, ni tarifa. La comparación de arriba es contra el mercado, no contra tu precio actual.
  ✅ **Pero sí está la MAQUINARIA de cobro**, y eso el documento no lo decía: `subscription_status`, `SubscriptionBanner` y la Edge Function `aplicar-estado` son el mecanismo para **cortar el acceso por estado de pago**. Falta el precio, no el enforcement — y para decidir cuánto cobrar, eso vale más que su ausencia.
- **Cuánto pagaría un cliente formal por Nodo sin FE.** La hipótesis es que poco o nada, porque necesita facturar. Es una hipótesis, no una medición — se mide con el primer prospecto constituido.
- **Si Muscle Pro, cuando se constituya, va a querer que Nodo facture o va a usar otro sistema para eso.** Esa conversación decide si el Bloque A es urgente o es para el segundo cliente.
