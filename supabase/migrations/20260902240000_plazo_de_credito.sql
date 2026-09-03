-- ============================================================================
-- Plazo de credito — deuda 46
--
-- 🔴 SE GUARDA EN LOS DOS LADOS, Y NO ES REDUNDANCIA.
--      customers.plazo_dias -> lo PACTADO HOY. Es lo que se precarga al vender.
--      orders.plazo_dias    -> lo que se pacto ESA VEZ. Congelado.
--
-- 🔴 LA RAZON POR LA QUE LA SEGUNDA MITAD ES INDISPENSABLE LA DA LA FORMA DE LA
--    CARTERA, y se midio enumerando: **la cartera no guarda la deuda, la DERIVA
--    de `orders`** — `getDebts` lee las ordenes con
--    `payment_status in ('pending','partial')` y calcula el saldo contra
--    `debt_payments`. No hay tabla de cuentas por cobrar.
--
--    Entonces, si el plazo viviera solo en `customers`, cambiarle el plazo a un
--    cliente en marzo no moveria el vencimiento "conceptualmente": **el mismo
--    select calcularia otro numero manana** para una venta de enero. Sin error,
--    sin aviso, y con el numero plausible — R7 exacto.
--
-- Quinto caso del mismo principio del proyecto: el costo congelado al vender
-- (R1 punto 8), la fecha del documento separada de la de registro (deuda 44),
-- la devolucion como hecho nuevo (deuda 49), la subcategoria retirada que la
-- fila conserva (deuda 45). **La historia no se reescribe, se le agrega.**
--
-- ── LO QUE ESTE ARCHIVO NO ENUMERA, Y ES DELIBERADO ───────────────────────
-- La LISTA de plazos (8/15/30) vive en `sedes.config.plazos_credito`, igual que
-- las subcategorias de gasto de la deuda 45 y por la misma razon: otro negocio
-- maneja otros plazos, y clavar los de este cliente en un CHECK chocaria con
-- que el producto es horizontal. Lo que SI se fija aca es la forma del dato:
-- **un ENTERO DE DIAS, nunca una etiqueta.** "30 dias" como texto no se puede
-- sumar a una fecha.
--
-- ⚠️ Y se elige de un DESPLEGABLE, no se teclea: con tres valores conocidos, el
--    typo de 3 por 30 no lo detecta nada y una venta a 3 dias se lee como
--    vencida a los cuatro. Mismo criterio que la 45 — el disparador del reporte
--    ya esta cumplido antes de nacer, porque el vencimiento ES el reporte.
--
-- ── LAS CUATRO PREGUNTAS DE R0 ────────────────────────────────────────────
-- 1 · CLASE. Dos columnas nullable con CHECK de no-negatividad, mas el patron
--     de congelar el hecho en la venta.
-- 2 · PRECEDENTE. R1 punto 8 y la migracion `fecha_del_documento`: el mismo
--     molde de "un dato que el pasado conserva".
-- 3 · MODO DE FALLO. El vencimiento de las ventas viejas se mueve solo. No
--     revienta: da un numero plausible, y quien lo lee LLAMA AL CLIENTE a
--     cobrarle algo que no vencio. Fail-closed via `null` (ver abajo).
-- 4 · OBJETIVO. Entero de dias, no etiqueta. La lista, por sede y fuera del
--     esquema.
--
-- Filas contadas ANTES de tocar (2026-09-02): customers 74, orders 1.320. Las dos
-- columnas nacen NULL, asi que ninguna fila puede violar los CHECK.
--
-- R5: archivo nuevo.
-- ============================================================================

begin;

-- ── 1 · EL PLAZO PACTADO CON EL CLIENTE ────────────────────────────────────
alter table public.customers
  add column plazo_dias integer;

alter table public.customers
  add constraint chk_plazo_dias_no_negativo check (
    plazo_dias is null or plazo_dias >= 0
  );

comment on column public.customers.plazo_dias is
  'Plazo de credito pactado con este cliente, en DIAS ENTEROS. Es lo que se '
  'PRECARGA al vender a credito, y ahi queda editable: el plazo se pacta por '
  'venta. '
  'NULL = no hay plazo pactado con este cliente; al vender se ofrece el default '
  'de la sede (sedes.config.plazo_credito_default). '
  '⚠️ NULL NO es 0: cero seria "vence el mismo dia", una afirmacion. Sin plazo '
  'no se puede afirmar nada, y la cartera muestra el guion del design system en '
  'vez de inventar un vencimiento.';

-- ── 2 · EL PLAZO CONGELADO EN LA VENTA ─────────────────────────────────────
alter table public.orders
  add column plazo_dias integer;

alter table public.orders
  add constraint chk_plazo_dias_no_negativo check (
    plazo_dias is null or plazo_dias >= 0
  );

comment on column public.orders.plazo_dias is
  'Plazo pactado EN ESTA VENTA, en dias enteros. Se copia del cliente al vender '
  'y despues NO SE TOCA: renegociar el plazo del cliente no puede mover el '
  'vencimiento de una venta ya hecha. '
  '🔴 Es indispensable porque la cartera DERIVA de esta tabla: con el plazo solo '
  'en `customers`, el mismo select devolveria otro vencimiento manana para una '
  'venta de enero. '
  'NULL = venta sin plazo (contado, o fiado anterior a esta migracion). El '
  'vencimiento entonces no se calcula: se muestra "—". '
  '⚠️ NO se guarda la FECHA de vencimiento sino el PLAZO: la fecha se deriva de '
  '`created_at` + este plazo, en America/Bogota (R7). Guardar la fecha seria un '
  'tercer lado del mismo dato, y el dia que se corrija la fecha de la venta '
  'quedaria apuntando al lugar equivocado.';

-- El indice es para la cartera, que filtra por sede y estado y despues ordena
-- por vencimiento; el plazo entra en ese calculo.
create index idx_orders_credito_pendiente
  on public.orders (sede_id, payment_status, created_at desc)
  where payment_status in ('pending', 'partial') and cancelled_at is null;

-- ── 3 · LO QUE ESTE ARCHIVO NO HACE, DICHO ────────────────────────────────
-- · NO enumera los plazos: la lista es por sede. Ver arriba.
-- · NO guarda una fecha de vencimiento derivada. Se calcula, y la aritmetica
--   vive en `src/lib/cartera.ts` con tests unitarios, porque es una frontera de
--   dia (R7) y una funcion pura se puede poner roja con una fecha inventada.
-- · NO pone tope al plazo. Un maximo seria arbitrario; el desplegable es el
--   guard contra el typo, que es el riesgo real.
-- · NO toca el CUPO de credito, que sigue sin existir (deuda 40). Plazo y cupo
--   son dos preguntas distintas: cuando vence, y cuanto se le puede fiar.

commit;
