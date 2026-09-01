-- ============================================================
-- Nodo — Esquema base · 01 · Extensiones y tipos enumerados
--
-- ORIGEN: consolidado de Vento `d848852`, seccion "2. TIPOS ENUMERADOS" de
-- supabase/schema.sql. Ver docs/plan-esquema-base.md.
--
-- POR QUE ESTO NO VIOLA R5: R5 protege las migraciones APLICADAS. Estos
-- archivos no estan aplicados en Nodo — la base del proyecto esta vacia
-- (verificado 2026-08-31, cero tablas en gen types). Son archivos, no
-- migraciones ejecutadas. 🔴 A PARTIR DEL PRIMER `db push` ESO DEJA DE SER
-- CIERTO y R5 aplica con todo su peso: lo que siga va en archivo nuevo.
--
-- ── POR QUE LOS RECORTES SE HACEN ACA Y NO DESPUES ──────────────────────────
-- Postgres NO tiene `alter type ... drop value`. Agregar un valor es trivial;
-- QUITARLO obliga a recrear el tipo y reescribir cada columna y policy que lo
-- use. El costo es brutalmente asimetrico:
--
--   quitar de mas  → caro para siempre (recrear el tipo con datos encima)
--   dejar de mas   → un valor muerto en el enum. Ruido, y barato.
--
-- Por eso: se recorta solo lo que la poda YA decidio con evidencia, y ante la
-- duda se conserva. `payment_method` no se toca (contrato en 8 lados, R1).
--
-- ⚠️ CONSECUENCIA ACEPTADA Y CONOCIDA (decidida el 2026-08-31): src/ todavia
--    usa 'waiter', 'preparing', 'ready' y order_type — POSPage escribe
--    DEFAULT_ORDER_TYPE='takeaway' en cada venta. El arbol queda inconsistente
--    con el esquema HASTA LA PODA DE src/. No hay ruptura en runtime porque
--    nada esta aplicado. Se eligio asi porque la ventana barata para quitar
--    valores de un enum es exactamente ahora.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- Extensiones
-- ------------------------------------------------------------
create extension if not exists "uuid-ossp";


-- ------------------------------------------------------------
-- Tipos enumerados
-- ------------------------------------------------------------

-- Rol de sistema a nivel de PERFIL. Es distinto del catalogo RBAC de la tabla
-- `roles` (permisos finos, generado desde src/lib/permissions.ts): este enum es
-- el rol grueso que heredamos y que varias policies usan directamente.
--
-- SALE 'waiter': Nodo no tiene mozos. Se va AHORA porque despues no se puede
-- (no hay drop value). ⚠️ src/ todavia lo nombra —useUsers, supabase-helpers y
-- enumFromRoleName en ConfigPage, que mapea el rol 'mozo' a 'waiter'—: eso se
-- limpia en la poda de src/.
--
-- NO se agregan roles nuevos todavia: el catalogo propio de Nodo es la deuda
-- #23 y va DESPUES del esquema, porque las claves se derivan de las tablas que
-- existan. Agregar valores despues es barato; por eso se puede esperar.
create type public.user_role as enum ('admin', 'cashier');

-- Estado de la venta.
-- SALEN 'preparing' y 'ready': son estados de COCINA (comanda -> listo para
-- servir) y Nodo no tiene cocina. En un mostrador la venta se cobra y se
-- entrega en el mismo acto.
-- ⚠️ src/ los consulta hoy en supabase-helpers, useDelivery y useDeliveryCount.
-- Se limpia en la poda de src/.
create type public.order_status as enum ('pending', 'delivered', 'cancelled');

-- Metodo de pago.
-- 🔴 NO SE TOCA. Es un contrato compartido en 8 lados (R1, punto 4 del
-- inventario): RPCs de venta, cartera y compras, seeds, la tabla de columnas de
-- sentry.test.ts y los tipos de TS. Cambiar un valor aca obliga a tocarlos
-- todos en la misma pasada, y no hay nada que lo sincronice.
create type public.payment_method as enum ('cash', 'card', 'transfer', 'nequi');


-- ------------------------------------------------------------
-- Tipos que NO se crean, dichos en negativo a proposito
-- ------------------------------------------------------------
-- `table_status` ('free','occupied','reserved') — mesas. Nodo no tiene.
--    Enumerado en la clase B del plan; nada fuera de mesas lo referencia.
--
-- `order_type` ('dine_in','takeaway','delivery') — el TIPO no se crea, pero
--    OJO: el EJE SI SOBREVIVE. Lo que era de restaurante eran los VALORES
--    (comer aca / llevar / domicilio), no la pregunta: "por donde entro el
--    pedido" es igual de real en una distribuidora. Vuelve como
--    `orders.canal`, y NO como enum: `text` + CHECK.
--    Por que no enum, y esta razon ya la pagamos una vez (R1 punto 3):
--    Postgres NO tiene `ALTER TYPE ... DROP VALUE`. Ampliar un CHECK es un
--    drop/add constraint trivial; sacar un valor de un enum, no. Los canales
--    van a crecer (el alcance firmado ya nombra WhatsApp y telefono), asi que
--    la asimetria apunta directo a CHECK. La allowlist vive en la migracion
--    `ventas`, al lado de la columna, no aca.
--
-- Se anotan en NEGATIVO porque un tipo ausente no deja rastro: sin esta nota,
-- el proximo que compare este esquema con el de Vento no sabe si falta por
-- decision o por olvido.

commit;
