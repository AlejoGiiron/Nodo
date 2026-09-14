-- ============================================================================
-- TRANSICION DE MUSCLE PRO A LA SEDE NUEVA — una sola vez, fijada por UUID.
--
-- QUE HACE, EN ESTE ORDEN Y EN UNA SOLA TRANSACCION:
--   1 · renombra la sede VIEJA  -> «Muscle Pro (retirada 14/09)»
--   2 · CUENTA las homonimas de HOY — despues de ① y antes de ③, que es el
--       punto exacto en que el indice tiene que poder aplicar
--   3 · renombra la sede NUEVA  -> «Muscle Pro»
--   4 · saca la sede vieja de `user_stores` (deja de ser SELECCIONABLE)
--   5 · mueve `profiles.sede_id` de quien estuviera en la vieja a la nueva
--   6 · ASEVERA el resultado, y si algo no da, TODO SE DESHACE
--
-- 🔴 POR QUE UNA MIGRACION Y NO UN SCRIPT: no hay credencial de usuario viva
--    —se roto al terminar la carga, a proposito— y la alternativa era traer la
--    `service_role` key del proyecto a la sesion. Eso es una credencial con
--    poder total sobre TODO el proyecto (LAB incluido) y esta explicitamente
--    cerrada para escribir en el tenant de la clienta. Esta via no trae ninguna
--    credencial nueva, usa el `db push` ya autorizado, y queda auditable en git.
--
-- ⚠️ Y ES LA VARIANTE HONESTA DEL CONTEO: la condicion era «conta las homonimas
--    de HOY, no cites la medicion vieja». Aca el conteo NO se hace antes y se
--    cita: se hace ADENTRO, en el instante que importa, y si no da cero el
--    `raise` revierte los renombres. Un numero que decide y no que tranquiliza.
--
-- ── R0 ──────────────────────────────────────────────────────────────────────
-- 1 · CLASE · escritura de datos de UN tenant, dirigida POR UUID, envuelta en
--     aserciones fail-closed. No es un cambio de esquema.
-- 2 · PRECEDENTE · «la historia no se reescribe, se le agrega» — y aca se
--     RENOMBRA, que es reescritura. Se acepta por una razon medida: `sedes` NO
--     TIENE COLUMNA DE ESTADO (deuda 103, salida b), asi que el nombre es el
--     UNICO lugar donde «retirada» se puede escribir. Nada se borra: las 16
--     tablas que cuelgan de la sede vieja quedan intactas.
-- 3 · MODO DE FALLO · con un UUID equivocado, esto renombra la sede que no era
--     y MUEVE USUARIOS a la sede que no era. Es «toca datos ajenos» ⇒
--     fail-closed: antes de tocar nada se comprueba que cada UUID tenga HOY el
--     nombre que esperamos, y si no, aborta sin escribir.
-- 4 · OBJETIVO · por UUID. Ningun `where` resuelve por nombre para decidir a
--     quien escribir; el nombre solo se usa para VERIFICAR que el UUID es el que
--     creemos.
--
-- ⚠️ FILAS CONTADAS ANTES · se cuentan e IMPRIMEN adentro (`raise notice`),
--    porque no hay forma de leer la base desde afuera en esta sesion. Los
--    numeros quedan en la salida del `db push`.
--
-- ⚠️ SI LAS FILAS NO EXISTEN (una base local, un `db reset`) NO HACE NADA y lo
--    dice. Una migracion que asume datos de produccion romperia todo entorno
--    que no los tenga.
-- ============================================================================
do $$
declare
  c_vieja  constant uuid := '0033b6b2-10e4-4c0c-9e6a-a13de9427540';
  c_nueva  constant uuid := 'd11e803c-298d-41fe-806f-ae71e84653f8';
  c_n_old  constant text := 'Muscle Pro';
  c_n_v3   constant text := 'Muscle Pro (catálogo v3)';
  c_n_ret  constant text := 'Muscle Pro (retirada 14/09)';
  v_org        uuid;
  v_nom_vieja  text;
  v_nom_nueva  text;
  v_homonimas  int;
  v_grupos     int;
  v_tocadas    int;
  v_us         int;
  v_perfiles   int;
  v_prod       int;
  v_cartera    numeric;
  v_ordenes    int;
begin
  -- ── § 0 · ¿ESTAMOS EN LA BASE QUE CREEMOS? ────────────────────────────────
  select name, organization_id into v_nom_vieja, v_org from public.sedes where id = c_vieja;
  select name into v_nom_nueva from public.sedes where id = c_nueva;

  if v_nom_vieja is null or v_nom_nueva is null then
    raise notice 'TRANSICION OMITIDA: las sedes de Muscle Pro no existen en esta base. '
                 'Es lo esperado en un entorno local o despues de un reset.';
    return;
  end if;

  -- 🔴 Fail-closed: el UUID tiene que tener HOY el nombre que esperamos. Si no,
  --    o ya se corrio, o estoy apuntando a otra sede. En los dos casos: parar.
  if v_nom_vieja <> c_n_old then
    raise exception 'La sede % se llama "%" y esperaba "%". O la transicion ya corrio, '
                    'o el UUID no es el que creo. NO se toca nada.',
                    c_vieja, v_nom_vieja, c_n_old;
  end if;
  if v_nom_nueva <> c_n_v3 then
    raise exception 'La sede % se llama "%" y esperaba "%". NO se toca nada.',
                    c_nueva, v_nom_nueva, c_n_v3;
  end if;
  raise notice '§0 · las dos sedes son las esperadas. organizacion %', v_org;

  -- ── § 1 · RENOMBRAR LA VIEJA ──────────────────────────────────────────────
  -- Sin columna de estado, el nombre es el unico lugar donde «retirada» cabe.
  -- Y hace las dos cosas a la vez: la marca Y libera «Muscle Pro».
  update public.sedes set name = c_n_ret where id = c_vieja;
  get diagnostics v_tocadas = row_count;
  if v_tocadas <> 1 then
    raise exception '§1 toco % filas, esperaba 1', v_tocadas;
  end if;
  raise notice '§1 · sede vieja renombrada a "%" (1 fila)', c_n_ret;

  -- ── § 2 · EL CONTEO, EN EL PUNTO EXACTO ───────────────────────────────────
  -- 🔴 DESPUES de renombrar la vieja y ANTES de renombrar la nueva. Normalizado
  --    IGUAL que el indice: minusculas, espacios colapsados, extremos cortados.
  select count(*) into v_homonimas from public.sedes where organization_id = v_org;
  select count(*) into v_grupos from (
    select 1 from public.sedes
     where organization_id = v_org
     group by lower(btrim(regexp_replace(name, '\s+', ' ', 'g')))
    having count(*) > 1
  ) t;
  raise notice '§2 · CONTEO DE HOY: % sedes en la organizacion · % grupos homonimos', v_homonimas, v_grupos;
  if v_grupos <> 0 then
    raise exception '§2 · hay % grupo(s) de sedes homonimas. El indice unico NO podria aplicar, '
                    'y renombrar la nueva produciria justo la homonima que el indice impide. '
                    'TODO SE DESHACE.', v_grupos;
  end if;

  -- ── § 3 · RENOMBRAR LA NUEVA ──────────────────────────────────────────────
  update public.sedes set name = c_n_old where id = c_nueva;
  get diagnostics v_tocadas = row_count;
  if v_tocadas <> 1 then
    raise exception '§3 toco % filas, esperaba 1', v_tocadas;
  end if;
  raise notice '§3 · sede nueva renombrada a "%" (1 fila)', c_n_old;

  -- ── § 4 · SACARLA DE user_stores ──────────────────────────────────────────
  -- Es lo que la vuelve NO SELECCIONABLE. La fila de `sedes` y todo lo que
  -- cuelga de ella queda intacto: esto no borra historia, borra una asignacion.
  select count(*) into v_us from public.user_stores where sede_id = c_vieja;

  -- 🔴 PRIMERO SE MIGRA LA ASIGNACION, DESPUES SE BORRA — y sobre EXACTAMENTE
  --    los mismos usuarios, no sobre «todos los de la organizacion».
  --    Asignar de mas es cambiar AUTORIZACIONES que nadie pidio: le daria la
  --    sede a perfiles que no la tenian. Esto MUEVE una asignacion, no la
  --    reparte.
  insert into public.user_stores (user_id, sede_id)
  select u.user_id, c_nueva
    from public.user_stores u
   where u.sede_id = c_vieja
     and not exists (select 1 from public.user_stores x
                      where x.user_id = u.user_id and x.sede_id = c_nueva)
  on conflict do nothing;
  get diagnostics v_tocadas = row_count;
  raise notice '§4 · user_stores migradas a la sede nueva: % (de % que tenia la vieja)', v_tocadas, v_us;

  delete from public.user_stores where sede_id = c_vieja;
  get diagnostics v_tocadas = row_count;
  raise notice '§4 · user_stores de la sede vieja borradas: % de %', v_tocadas, v_us;

  -- ── § 5 · LA SEDE ACTIVA ──────────────────────────────────────────────────
  -- 🔴 `profiles.sede_id` es lo que devuelve `get_my_sede_id()`: de ahi cuelgan
  --    TODAS las RLS y TODAS las RPC. Sin esto, quien estuviera en la vieja
  --    seguiria operando en la vieja aunque no pueda seleccionarla.
  select count(*) into v_perfiles from public.profiles where sede_id = c_vieja;
  update public.profiles set sede_id = c_nueva where sede_id = c_vieja;
  get diagnostics v_tocadas = row_count;
  raise notice '§5 · perfiles movidos de la vieja a la nueva: % de %', v_tocadas, v_perfiles;

  -- ── § 6 · ASEVERAR EL RESULTADO — si algo no da, TODO se deshace ──────────
  select count(*) into v_prod from public.products where sede_id = c_nueva;
  if v_prod <> 62 then
    raise exception '§6 · la sede nueva tiene % productos, esperaba 62. TODO SE DESHACE.', v_prod;
  end if;

  -- Cartera con la MISMA condicion que `getDebts`, sin filtros propios.
  select count(*), coalesce(sum(o.total - coalesce(d.abonado, 0)), 0)
    into v_ordenes, v_cartera
    from public.orders o
    left join (select order_id, sum(amount) abonado from public.debt_payments group by order_id) d
      on d.order_id = o.id
   where o.sede_id = c_nueva
     and o.payment_status in ('pending', 'partial')
     and o.cancelled_at is null;
  if v_ordenes <> 9 or v_cartera <> 725000 then
    raise exception '§6 · cartera: % ordenes y saldo %, esperaba 9 y 725000. TODO SE DESHACE.',
                    v_ordenes, v_cartera;
  end if;

  -- Y que la vieja conserve lo suyo: no se borro nada.
  select count(*) into v_prod from public.products where sede_id = c_vieja;
  select count(*) into v_ordenes from public.orders where sede_id = c_vieja;
  raise notice '§6 · la sede VIEJA conserva % productos y % ordenes (nada se borro)', v_prod, v_ordenes;

  select count(*) into v_us from public.user_stores where sede_id = c_vieja;
  if v_us <> 0 then
    raise exception '§6 · la sede vieja sigue asignada a % usuario(s). TODO SE DESHACE.', v_us;
  end if;

  raise notice '✅ TRANSICION COMPLETA: la nueva se llama "%" con 62 productos y 725000 de cartera; '
               'la vieja quedo como "%", intacta y no seleccionable.', c_n_old, c_n_ret;
end $$;
