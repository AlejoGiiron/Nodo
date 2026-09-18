# Nodo — Plan de trabajo

*2026-09-17. Estado después de la tanda del saldo y las correcciones de datos de Muscle Pro.*

---

## 0. En vuelo — se cierra antes de empezar nada

**La tanda del saldo acumulado.** Commiteada en `develop` (`64d03b4`), migración aplicada, tipos regenerados. La suite se canceló por los pedidos del cliente.

Falta: suite entera, las cuatro condiciones, push. Y avisarle a la clienta que ya tiene la columna para cuadrar.

---

## 1. Lo que ella está haciendo hoy y el producto no permite

Es lo que más pesa, y no por gravedad técnica: **cada una de estas se resuelve hoy con una migración nuestra.** Si no se atacan, vuelven cada semana.

| # | Qué falta | Por qué importa |
|---|---|---|
| — | **Anular una venta de una jornada cerrada** | Pidió dos esta semana. El guard la manda a una devolución que no existe |
| — | **Devolución de venta** (`register_sale_return`) | 🔴 El guard la nombra y nadie la construyó. Es el bloqueo real del punto anterior |
| — | **Asignar cliente a una venta ya hecha** | Pidió tres. No hay ningún camino en la UI |
| 116 | El saldo acumulado | En vuelo, punto 0 |

**Orden propuesto:** la devolución de venta primero, porque desbloquea la anulación. Y el control para asignar cliente después, que es corto.

---

## 2. El arqueo — la decisión grande, ahora con datos

| # | Qué |
|---|---|
| 120 | Sacar o desactivar el turno |
| 119 | El cierre no confirma un descuadre grande — **espera a la 120** |

**Lo medido esta semana, que cambia la discusión:**

- Efectivo en la operación real: **0 de 17 ventas** desde el 14/09. El 100% es transferencia.
- Las 15 ventas en efectivo del histórico son todas anteriores a Nodo.
- La caja ve salir **23.263.024** contra **8.500** que entraron: paga proveedores con plata que nunca pasó por el cajón.
- Por eso `expected_amount` es estructuralmente negativo y `isOverdraft` da `true` casi siempre.

**La pregunta que hay que contestar antes de sacar nada:** si el arqueo se va, **qué lo reemplaza**. Hoy nada verifica que las transferencias que dice haber recibido entraron de verdad.

*Acoplamiento medido: 2 columnas `jornada_id`, 8 RPC (5 exigen jornada abierta), 29 archivos, 192 casos de la suite.*

---

## 3. Lo que le miente al usuario

| # | Qué | Peso |
|---|---|---|
| 112 | Configuración promete destinos que no existen — el logo no sale en el ticket, el QR no se muestra en el cobro | 🔴 El QR es el peor: ella no puede verificarlo, así que nadie lo va a reportar |
| 108 | Dos tickets, y el que tiene test no lleva Subtotal ni Descuento — **un comprobante con descuento no reconcilia** | Es el papel que entrega |
| — | El abono no aparece en el recibo de una venta a crédito | Va con la 108, o nace divergido |
| 117 | Texto verde sobre fondo azul en 7 sitios — roles encimados | Cuarto eje que el censo de la 88 no podía ver |
| — | Descubribilidad de las subcategorías de gasto | Ella preguntó dónde se crean |
| 106 | El lápiz de editar categoría solo existe en hover | Indescubrible |

---

## 4. Guards y seguridad

| # | Qué |
|---|---|
| — | 🔴 `orders` admite `UPDATE` de cualquier columna desde el cliente. No tiene allowlist, a diferencia de `products` |
| 114 | Las 17 FK a `sedes` en cascade — **tandas C pendiente** (catálogo) |
| 103 | Segunda mitad: "retirar" como operación real |
| 115 | 🔴 **50 escrituras sin verificador en 18 archivos**, 14 de ellas `delete` |
| 105 | `products` no registra autoría mientras cinco tablas sí |

---

## 5. Infraestructura y arnés

| # | Qué |
|---|---|
| 113 | El respaldo — **hecho una vez**, falta automatizarlo y decidir el destino definitivo |
| 110 | Infraestructura que el repo no describe: buckets, Edge Functions, config de Auth |
| — | La suite son 18 minutos. Medido: 84% comparte estado, la jornada domina con 192 casos. **La palanca es una sede por worker** |
| — | El `setup` por UI es lo que hace largos los casos lentos (11–21 s). Un arnés por API los haría en segundos |
| 70 | El puerto huérfano tras un timeout |
| 22 | Falsos positivos del hook de SQL |
| 34 | Los 5 warnings permanentes de lint |

---

## 6. Alcance del producto — no son defectos

| # | Qué |
|---|---|
| 85 | **Pedidos en dos fases** — pospuesta con su disparador. Deja la 33 sin poder escribirse |
| 86 | **Utilidades** como pantalla |
| 40 | El cupo de crédito — `CupoMeter` vive en `sin dato` |
| 95 | Recuperar contraseña olvidada — necesita correo saliente |
| 98 | El IVA en compras nuevas |
| 118 | El `day` de Reportes: leído, no ejecutado |
| — | Formulario de 5 campos con "Copiar L1 a los vacíos" |
| — | Etapa 2 de la 101: retirar `products.price` |

---

## 7. La fase grande

**Clientes formales:** facturación electrónica con proveedor autorizado, tasa de IVA por producto, retenciones, numeración autorizada, datos tributarios del emisor.

Sin esto Nodo no se le puede vender a un negocio constituido — y la mayoría de los verticales objetivo lo son. La investigación de ERP lo dejó medido: **es el único bloque con retorno claro y son semanas, no meses.**

---

## Orden propuesto

**Ahora:** cerrar el saldo (punto 0).

**Después, en este orden:**

1. **La devolución de venta**, y con ella la anulación de jornada cerrada. Es lo que ella pidió y lo que hoy nos cuesta una migración por pedido.
2. **El control para asignar cliente a una venta.** Corto, y cierra el otro pedido.
3. **La 120** — decidir el arqueo. Los datos ya están; falta la conversación con ella.
4. **La 112 y la 108 juntas** — el ticket y lo que Configuración promete. Son el papel que entrega y lo único que hoy le miente.
5. **El `UPDATE` sin allowlist en `orders`** — es el guard más abierto que queda.
6. **La 115** — las 50 escrituras sin verificador.

**Y lo que no compite con nada:** la fase de clientes formales. Es una decisión comercial, no técnica.

---

## Dos cosas que no son deudas

**El acceso de Alejandro a Muscle Pro** sigue sin reponerse. Ya frenó el trabajo dos veces, y el día que haya un problema en producción va a hacer falta.

**Y las credenciales:** este hilo tuvo cinco incidentes de token pegado. El procedimiento está escrito —exportar antes de abrir Claude Code, revocar al cerrar, verificar con el viejo que falla— y se cumple a medias.
