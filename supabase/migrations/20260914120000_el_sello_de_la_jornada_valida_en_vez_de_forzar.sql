-- ============================================================================
-- DEUDA 97 · EL SELLO DE LA JORNADA VALIDA EN VEZ DE FORZAR, Y PROTEGE TAMBIEN
--            A `opened_at`
--
-- R0 — las cuatro preguntas, contestadas antes de escribir:
--
--  1. CLASE · VALIDAR vs FORZAR. El trigger dejaba de mirar despues de la
--     primera transicion; ahora VALIDA cada update. Es el corolario de R6 al
--     pie de la letra: *un trigger de invariante VALIDA, no fuerza; forzar
--     reescribe en silencio*.
--
--  2. PRECEDENTE · el corolario de R6, y *la historia no se reescribe, se le
--     agrega* — un cierre de caja es un hecho con fecha, no un campo editable.
--
--  3. MODO DE FALLO · HOY FALLA ABIERTO. `set_jornada_closed_at` solo pisaba
--     en la transicion `null -> no null`, asi que un SEGUNDO update movia
--     `closed_at` sin resistencia (medido en LAB Pruebas: 59 dias atras). Y la
--     policy «jornadas: cerrar» es `for update` sin restriccion de columna, o
--     sea que cualquiera con `caja.cerrar` podia hacerlo. Con esto falla
--     CERRADO: la operacion se rechaza y el mensaje dice que la jornada ya
--     estaba cerrada.
--
--  4. OBJETIVO · sin DELETE, sin DROP, sin tocar una sola fila. La comparacion
--     va con `is distinct from` y NUNCA con `<>`:
--
--     ⚠️ `new.closed_at <> old.closed_at` da NULL cuando cualquiera de los dos
--        es NULL, y un `if` sobre NULL NO DISPARA — el guard no rechaza y no
--        acepta: NO PREGUNTA, y lo que sigue se ejecuta como si hubiera
--        aceptado. Es la clase que este proyecto ya midio en la auditoria A2.
--        `is distinct from` trata NULL como un valor mas y siempre contesta.
--
-- ----------------------------------------------------------------------------
-- LA DECISION QUE LA DEUDA DEJABA ABIERTA: `closed_at` ES INMUTABLE
--
-- La deuda planteaba dos salidas: inmutable, o corregible CON REGISTRO de quien
-- y cuando. Se elige INMUTABLE, por tres razones y una de ellas es una medicion:
--
--   ① El histórico de Muscle Pro YA ESTA CARGADO — verificado contra la base el
--      2026-09-14: 9 jornadas, las 9 cerradas, las 9 con `closed_at` en su
--      propio dia, cero forzadas a hoy. O sea que el unico consumidor conocido
--      del agujero ya no lo necesita. (El cruce tambien cierra: 30 ordenes y 42
--      productos, que es lo que el plan cargo.)
--   ② *La historia no se reescribe, se le agrega.* Una fecha de cierre
--      corregible es una fecha que puede dar distinto segun cuando se la mire,
--      que es el perfil de fallo silencioso de R7.
--   ③ La salida corregible necesita tabla de auditoria, motivo obligatorio y
--      pantalla — como `adjust_cost`. No hay un solo caso que lo pida hoy.
--
-- 🔴 SU DISPARADOR, escrito porque elegir el lado estricto tambien lo necesita:
--    el dia que haya que corregir un cierre REAL —un corte de luz, una jornada
--    que quedo abierta toda la noche—, el mecanismo NO es aflojar este trigger:
--    es una RPC de correccion con fecha explicita y motivo, que deje rastro.
--    Aflojar el guard para un caso de borde lo afloja para todos los dias.
--
-- ----------------------------------------------------------------------------
-- 🔴 `opened_at` ENTRA EN EL MISMO COMMIT (R3), Y NO ES UN EXTRA: CARGA PESO
--
-- No tenia sello NINGUNO —`not null default now()` y nada mas—, asi que era
-- mas facil de mover que `closed_at`. Y decide plata: `getShiftSalesCount`
-- cuenta las ventas del turno desde `opened_at`, y `SalesHistoryPage` filtra
-- por ella. Moverla CAMBIA QUE VENTAS SON DEL TURNO, sin tocar una sola venta.
--
-- ⚠️ El INSERT no se toca, a proposito y por el mismo argumento que la deuda 78:
--    abrir una jornada con fecha pasada no reescribe nada —es el unico camino de
--    una reconstruccion—; MOVERLA despues, si.
--
-- ----------------------------------------------------------------------------
-- ⛔ LO QUE ESTO ROMPE, dicho antes de que alguien lo descubra:
--    `scripts/cargar-historico.mjs` cerraba la jornada y despues CORREGIA la
--    fecha (su paso 7), que es exactamente este agujero. Ese script ya trae su
--    propio guard —aborta nombrando esta deuda— asi que no va a escribir mal en
--    silencio: se va a parar. Queda actualizado en el mismo commit.
-- ============================================================================

create or replace function public.set_jornada_closed_at()
returns trigger
language plpgsql
as $$
begin
  -- ── 1 · EL CIERRE · la fecha la pone el SERVIDOR, no el llamante ──────────
  --    Esto ya estaba y se conserva: el cliente manda su propio `now()` y da
  --    igual — el reloj del navegador no es una fuente de verdad.
  if old.closed_at is null and new.closed_at is not null then
    new.closed_at := now();
    return new;
  end if;

  -- ── 2 · YA CERRADA · `closed_at` es inmutable ─────────────────────────────
  if old.closed_at is not null and new.closed_at is null then
    raise exception 'Una jornada cerrada no se reabre. Cerro el %, y reabrirla '
                    'moveria las ventas de dos dias al mismo turno',
                    to_char(old.closed_at at time zone 'America/Bogota', 'DD/MM/YYYY HH24:MI');
  end if;

  if old.closed_at is not null and new.closed_at is distinct from old.closed_at then
    raise exception 'La fecha de cierre de una jornada cerrada no se puede cambiar '
                    '(cerro el %). El arqueo y los reportes por periodo se apoyan en ella',
                    to_char(old.closed_at at time zone 'America/Bogota', 'DD/MM/YYYY HH24:MI');
  end if;

  -- ── 3 · `opened_at` es inmutable SIEMPRE, abierta o cerrada ───────────────
  --    Decide que ventas son del turno (`getShiftSalesCount`), asi que moverla
  --    reescribe el arqueo sin tocar ninguna venta.
  if new.opened_at is distinct from old.opened_at then
    raise exception 'La hora de apertura de una jornada no se puede cambiar '
                    '(abrio el %). De ella depende que ventas son de este turno',
                    to_char(old.opened_at at time zone 'America/Bogota', 'DD/MM/YYYY HH24:MI');
  end if;

  return new;
end;
$$;

-- El trigger `trg_jornada_closed_at` (before update on public.jornadas) ya
-- existe desde `20260831121000_caja.sql` y NO se recrea: `create or replace
-- function` alcanza, y recrearlo seria tocar algo que no cambia.

comment on function public.set_jornada_closed_at() is
  'Sella la jornada (deuda 97). VALIDA, no fuerza: `closed_at` la estampa el '
  'servidor en el cierre y despues es INMUTABLE; `opened_at` es inmutable '
  'siempre. Corregir un cierre real necesita una RPC con fecha explicita y '
  'motivo — aflojar este trigger no es el camino.';

comment on column public.jornadas.closed_at is
  'Fecha de cierre. La estampa el servidor en la transicion de cierre y no se '
  'puede mover despues (deuda 97): el arqueo, los reportes por periodo y '
  'cualquier auditoria se apoyan en ella.';

comment on column public.jornadas.opened_at is
  'Fecha de apertura. INMUTABLE una vez insertada (deuda 97): decide que ventas '
  'pertenecen al turno. Se puede INSERTAR con fecha pasada —es el camino de una '
  'reconstruccion— pero no moverse despues.';
