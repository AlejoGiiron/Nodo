-- ════════════════════════════════════════════════════════════════════════════
-- `sedes` DEJA DE TENER DELETE — la policy `for all` se parte en tres
--
-- ⛔ NO APLICADA TODAVÍA. Se escribe para revisarla antes del push.
--
-- 🔴 POR QUÉ, Y EL NÚMERO ES EL ARGUMENTO. `useStores` exponía
--    `supabase.from('sedes').delete()` detrás de un botón de la pantalla de
--    Configuración, y **16 tablas cuelgan de `sedes` con `on delete cascade`**.
--    Medido el 2026-09-15 contra la base, con `count` en el servidor:
--
--      Muscle Pro      →   722 filas   (127 ventas · 106 pagos · 224 movimientos
--                                        de stock · 20 jornadas · 82 productos)
--      LAB Principal   → 16.176 filas
--
--    🔴 Y `profiles` ESTÁ EN EL CASCADE: borrar la sede **borra las cuentas de
--       su gente**. En Muscle Pro son dos. No es «se pierde la historia de la
--       sede» — es que desaparecen las personas y su acceso.
--
-- ── 🔴 LA RAZÓN PRINCIPAL, Y ES MEJOR QUE LA QUE ESTA MIGRACIÓN TENÍA ─────
--
--    > **Hoy el camino está tapado por un ACCIDENTE, y esta migración lo
--    > convierte en una DECISIÓN.**
--
--    De las 18 FK que apuntan a `sedes`, **diecisiete son `on delete cascade`
--    y una no**: `cash_movements.sede_id` quedó en `NO ACTION` y por eso
--    restringe el borrado de toda sede con un movimiento de caja — hoy, las
--    cuatro que existen. O sea que lo único que frena el DELETE es una
--    asimetría de un `create table` de agosto **que nadie escribió a
--    propósito**, que ningún documento nombra, y que desaparece el día que
--    alguien la «empareje por consistencia». Es la deuda 114.
--
--    ⚠️ Y eso CORRIGE el alcance que le habíamos reportado a la 103: el
--       agujero estaba abierto sólo para una sede **sin un movimiento de
--       caja**, o sea recién creada. Menos grave de lo que dijimos, y sigue
--       siendo un agujero — pero el argumento ya no es el tamaño del daño:
--       es que **nadie eligió lo que hoy nos protege**.
--
-- ── POR QUÉ NO ALCANZA CON SACAR EL BOTÓN ─────────────────────────────────
--    El botón y la mutación se retiraron en el mismo commit. Pero la policy es
--    `for all`, o sea que **el DELETE seguiría siendo posible por la API** con
--    cualquier sesión que tenga `sedes.gestionar`.
--
--    > **Retirar el botón y dejar `for all` es la DEUDA 61 en otra capa: la UI
--    > ocupando el lugar de la autorización.** Allá era un traslado de sede que
--    > sólo impedía `StoreSelector.tsx`; acá son 722 filas y dos cuentas.
--
--    Es la misma forma y la asimetría manda: allá se colaba un cambio de sede,
--    acá se cuela una destrucción sin vuelta.
--
-- ── R0 · LAS CUATRO PREGUNTAS ──────────────────────────────────────────────
--
-- 1 · CLASE — **allowlist de operaciones**: se declara POSITIVAMENTE qué se
--     puede hacer sobre `sedes` —ver, crear, editar— y `delete` deja de estar
--     en la lista. No se enumera lo prohibido: se lo omite.
--
-- 2 · PRECEDENTE — la deuda 61 (la UI ocupando el lugar de la autorización) y
--     el allowlist de columnas de `products` (deuda 78), que es esta misma
--     decisión sobre columnas en vez de sobre verbos.
--
-- 3 · MODO DE FALLO — si al partirla alguna rama queda **más ancha** que la
--     original, el arreglo abrió algo. Es la clase del guard de sede, que
--     parecía cerrado porque otro lo tapaba. Por eso abajo va la verificación
--     de que las condiciones son **idénticas**, y el spec mide las dos
--     direcciones.
--
-- 4 · OBJETIVO — las condiciones se conservan **textuales** de la policy
--     original: `organization_id = get_my_organization_id()` y
--     `has_permission('sedes.gestionar')`. No se re-derivan.
--
-- ⚠️ **NO HAY `DELETE` DE DATOS EN ESTE ARCHIVO.** Sólo se reemplazan policies.
--    Ninguna fila se toca, y por eso esta migración **no necesita respaldo** —
--    que es justamente lo que no existe todavía (deuda 113).
--
-- ── EL SELECT NO SE AGREGA, Y ESO SE MIDIÓ ────────────────────────────────
--    `sedes` ya tiene `sedes: ver las de mi organizacion`, con la condición
--    `organization_id = get_my_organization_id()` y **sin exigir permiso** — o
--    sea MÁS ANCHA que la rama select de `for all`. Como las policies se
--    combinan con OR, el select efectivo de hoy es el de ésa.
--
--    🔴 Por eso **no se crea una policy de select**: crearla no cambiaría nada
--       y agregaría un lado más. Y al soltar `for all`, el select queda
--       **exactamente como estaba**.
--
-- ── LA CONSECUENCIA, ACEPTADA Y CON NOMBRE ────────────────────────────────
--
--    > **Borrar una sede pasa a ser IMPOSIBLE desde el producto, incluso a
--    > propósito.**
--
--    Es lo correcto hoy: en este esquema «retirar» una sede significa otra cosa
--    —renombrarla y sacarla de `user_stores`—, que es lo que se hizo a mano el
--    14/09 y funcionó. Y el día que alguien necesite borrar una de verdad,
--    **necesita una migración**: que es exactamente el trato que este proyecto
--    ya le da al DELETE de todas las demás tablas.
-- ════════════════════════════════════════════════════════════════════════════

begin;

-- La original cubría select/insert/update/delete con la misma condición.
drop policy if exists "sedes: gestionar" on public.sedes;

-- INSERT · sólo `with check`: no hay fila previa que evaluar.
create policy "sedes: crear"
  on public.sedes for insert to authenticated
  with check (organization_id = get_my_organization_id() and has_permission('sedes.gestionar'));

-- UPDATE · las DOS mitades. Sin `with check`, alguien podría editar una fila
-- propia y MOVERLA a otra organización — más ancho que la original.
create policy "sedes: editar"
  on public.sedes for update to authenticated
  using      (organization_id = get_my_organization_id() and has_permission('sedes.gestionar'))
  with check (organization_id = get_my_organization_id() and has_permission('sedes.gestionar'));

-- DELETE · NO SE CREA. La ausencia ES la decisión: sin policy, RLS niega.

-- ── VERIFICACIÓN, ADENTRO DE LA TRANSACCIÓN ────────────────────────────────
--
-- 🔴 Corre acá y puede abortar. Medir después y citarlo en un registro se lee
--    igual y no protege: entre la medición y la escritura hay un hueco.
do $$
declare
  v_delete int;
  v_ins    int;
  v_upd    int;
  v_sel    int;
begin
  select count(*) into v_delete from pg_policies
   where schemaname = 'public' and tablename = 'sedes' and cmd = 'DELETE';
  if v_delete <> 0 then
    raise exception 'Quedaron % policies de DELETE sobre sedes. TODO SE DESHACE.', v_delete;
  end if;

  select count(*) into v_ins from pg_policies
   where schemaname = 'public' and tablename = 'sedes' and cmd = 'INSERT';
  select count(*) into v_upd from pg_policies
   where schemaname = 'public' and tablename = 'sedes' and cmd = 'UPDATE';
  select count(*) into v_sel from pg_policies
   where schemaname = 'public' and tablename = 'sedes' and cmd = 'SELECT';

  -- ⚠️ El select tiene que SEGUIR EXISTIENDO. Si al soltar `for all` quedara en
  --    cero, nadie vería sus sedes y la app se caería entera — un arreglo de
  --    seguridad que rompe el producto es un arreglo fallido.
  if v_ins = 0 or v_upd = 0 or v_sel = 0 then
    raise exception 'Falta alguna: insert=% update=% select=%. TODO SE DESHACE.', v_ins, v_upd, v_sel;
  end if;

  raise notice 'sedes: select=% insert=% update=% delete=0', v_sel, v_ins, v_upd;
end $$;

commit;
