-- ============================================================================
-- DEUDA 102 · EL NOMBRE DE UNA SEDE ES UNICO EN SU ORGANIZACION
--
-- 🔴 LO QUE SE CORRIGE NO ES EL INDICE AUSENTE: ES UN COMENTARIO QUE AFIRMABA
--    QUE ESTABA, Y UNA FUNCION QUE ACTUO SOBRE ESA CREENCIA.
--
--    `20260903100000_onboarding_organizacion.sql`, lineas 109-110, dice:
--
--      «La sede sí tiene unique (organization_id, name), así que acá el nombre
--       es una clave de verdad dentro de la organización.»
--
--    ES FALSO. `create table public.sedes` no lo tiene, y el unico
--    `unique (organization_id, name)` del esquema es el de `roles`. R5 congela
--    esa migracion, asi que la correccion va ACA, citando cual corrige y que
--    decia — igual que se hizo con el comentario de `products.codigo` al
--    retirar su unicidad. Sin esto, el proximo que lea la vieja vuelve a
--    creerle.
--
-- ⚠️ Y LA VUELTA QUE LA DISTINGUE DE UNA NOTA VIEJA: esta garantia falsa la
--    escribimos NOSOTROS, en este repo, y se le creyo EN LA MISMA FUNCION QUE
--    LA CONTIENE — `onboard_organization` tiene guard de homonimas para
--    ORGANIZACIONES y no lo tiene para SEDES, precisamente porque el comentario
--    decia que el indice lo hacia innecesario.
--
-- ── R0 ──────────────────────────────────────────────────────────────────────
-- 1 · CLASE · restriccion de unicidad DECLARADA POSITIVAMENTE (indice unico
--     normalizado) + un guard fail-closed en una RPC. No es una deny-list.
-- 2 · PRECEDENTE · `products_nombre_unico_por_sede` usa exactamente este
--     mecanismo normalizado; y el guard de homonimas de organizaciones ya vive
--     en esta misma funcion, con su razon escrita. Se copia esa forma.
-- 3 · MODO DE FALLO · sin el guard, `select id into v_sede ... where name = X`
--     con varias filas TOMA UNA SIN ERROR (plpgsql no se queja con multiples
--     filas) y siembra la sede del cliente en el tenant equivocado: datos
--     partidos entre dos tenants, sin error y sin forma de notarlo. Es el peor
--     perfil que este proyecto conoce, asi que va fail-closed: aborta.
-- 4 · OBJETIVO · el indice no toca ninguna fila. El guard CUENTA y aborta, no
--     elige. Nada se resuelve por nombre para decidir a quien escribir.
--
-- ⚠️ FILAS CONTADAS ANTES · el `create unique index` es fail-closed POR
--    CONSTRUCCION: si hay homonimas normalizadas, esta migracion NO aplica y lo
--    dice. Esa es la garantia que vale, y no depende de que nadie haya contado
--    bien. La medicion de la deuda —3 sedes, 0 grupos— es ANTERIOR a crear
--    «Muscle Pro (catálogo v3)» y por lo tanto esta caduca; no se cita como si
--    fuera de hoy.
--
-- 🔴 LA VENTANA, Y POR QUE ESTA MIGRACION VA ANTES DEL RENOMBRE:
--    hoy conviven `Muscle Pro` y `Muscle Pro (catálogo v3)`, que NO colisionan.
--    Si el renombre de la segunda ocurre sin este indice puesto, PRODUCE
--    exactamente la homonima que el indice existia para impedir — y despues el
--    indice ya no se puede aplicar.
--
-- ⚠️ CORRECCION A LA DEUDA, medida el 2026-09-14: la deuda dice que el renombre
--    «las vuelve homonimas POR UN INSTANTE». Eso supone que la sede vieja deja
--    de llamarse asi, y NO es lo que pasa: `sedes` no tiene columna de estado,
--    retirarla es sacarla de `user_stores`, y eso NO libera el nombre. Con el
--    indice puesto, renombrar la nueva a «Muscle Pro» es RECHAZADO mientras la
--    vieja conserve ese nombre. O sea que el nombre de la vieja tambien tiene
--    que moverse — y como no hay columna de estado, EL NOMBRE ES EL UNICO LUGAR
--    donde «retirada» se puede escribir.
-- ============================================================================

-- ── 1 · EL INDICE ───────────────────────────────────────────────────────────
-- 🔴 NORMALIZADO, no `unique (organization_id, name)` crudo: «Muscle Pro» y
--    «muscle  pro» tienen que colisionar. Mismo mecanismo, literal, que
--    `products_nombre_unico_por_sede`.
create unique index if not exists sedes_nombre_unico_por_organizacion
  on public.sedes (
    organization_id,
    lower(btrim(regexp_replace(name, '\s+', ' ', 'g')))
  );

comment on index public.sedes_nombre_unico_por_organizacion is
  'Deuda 102. El nombre de una sede es una clave dentro de su organizacion. '
  'Normalizado (minusculas, espacios colapsados, extremos recortados) porque '
  '"Muscle Pro" y "muscle  pro" son la misma sede para una persona. '
  'ANTES DE ESTE INDICE el unique NO existia, aunque '
  '20260903100000_onboarding_organizacion.sql afirmara que si.';

-- ── 2 · EL COMENTARIO FALSO, corregido donde R5 permite ─────────────────────
-- R5 no deja editar la migracion aplicada, asi que la correccion vive en la
-- tabla: es el lugar que SI lee quien va a escribir el proximo `select ... where
-- name = ...`.
comment on column public.sedes.name is
  'Nombre de la sede. UNICO dentro de la organizacion, normalizado, desde el '
  '2026-09-14 (indice sedes_nombre_unico_por_organizacion, deuda 102). '
  '🔴 CORRIGE UNA AFIRMACION FALSA: 20260903100000_onboarding_organizacion.sql '
  'decia "La sede si tiene unique (organization_id, name), asi que aca el '
  'nombre es una clave de verdad dentro de la organizacion" — y el indice NO '
  'existia. La funcion actuo sobre esa creencia: tenia guard de homonimas para '
  'organizaciones y no para sedes. R5 congela aquella migracion; esta nota es '
  'la correccion. '
  '⚠️ Y COMO `sedes` NO TIENE COLUMNA DE ESTADO, este nombre es tambien el '
  'unico lugar donde se puede escribir que una sede fue RETIRADA.';

-- ── 3 · EL GUARD DE HOMÓNIMAS EN onboard_organization ──────────────────────
-- El índice hace la homónima imposible HACIA ADELANTE. El guard la hace
-- LEGIBLE si la función corre sobre datos viejos que ya la tengan — y es el
-- mismo par que ya existe para organizaciones, treinta renglones más arriba.
--
-- 🔴 EL CUERPO SE COPIÓ DEL ARCHIVO, NO SE RE-DERIVÓ — y esto no es una
--    declaración de intención: la primera versión de esta migración SÍ lo
--    re-derivó, y el diff contra el original mostró que había perdido
--    ① el guard fail-closed del rol `owner`, ② el significado de `v_owner`
--    (pasó de leer `roles` a leer `profiles`) y ③ LAS CUATRO CLAVES DEL
--    `jsonb` de retorno, que es R1 punto 5b literal: el consumidor lee
--    `undefined`, que es falsy, y ELIGE UNA RAMA sin error.
--    El texto de abajo sale de un `sed` sobre 20260903100000, con exactamente
--    dos ediciones —el guard nuevo y la normalización del `select`— y una
--    lista de imprescindibles verificada por ejecución.

create or replace function public.onboard_organization(
  p_org_name  text,
  p_sede_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_org        uuid;
  v_sede       uuid;
  v_owner      uuid;
  v_homonimas  int;
  v_usuarios   int;
  v_org_nueva  boolean := false;
  v_sede_nueva boolean := false;
  c_org        text := btrim(coalesce(p_org_name, ''));
  c_sede       text := btrim(coalesce(p_sede_name, ''));
begin
  -- ── Guards de entrada. Fail-closed: sin nombre no se inventa uno ─────────
  if c_org = '' then
    raise exception using
      errcode = 'check_violation',
      message = 'onboard_organization: el nombre de la organizacion es obligatorio';
  end if;
  if c_sede = '' then
    raise exception using
      errcode = 'check_violation',
      message = 'onboard_organization: el nombre de la sede es obligatorio';
  end if;

  -- ── IDEMPOTENCIA, y por qué resuelve POR NOMBRE ──────────────────────────
  -- R0 pide fijar el objetivo por UUID. Acá no se puede: al RE-CORRER la
  -- herramienta, el nombre es el único dato que el operador tiene. Es el mismo
  -- patrón de `lab-seed-a.sql`, y es una BÚSQUEDA de idempotencia, no un
  -- objetivo destructivo — esta función no borra ni actualiza nada.
  --
  -- 🔴 El riesgo que eso abre —`organizations` NO tiene unique en `name`— se
  --    compensa fallando CERRADO ante la ambigüedad. Sin este guard, dos
  --    organizaciones homónimas harían que la herramienta eligiera una al azar
  --    y sembrara la sede del cliente en la organización equivocada: datos
  --    partidos entre dos tenants, sin error y sin forma de notarlo.
  select count(*) into v_homonimas from public.organizations where name = c_org;
  if v_homonimas > 1 then
    raise exception using
      errcode = 'check_violation',
      message = format(
        'Hay %s organizaciones llamadas "%s". No se puede decidir cual es, y elegir '
        'mal sembraria la sede en el tenant equivocado.', v_homonimas, c_org),
      hint = 'Resolve la duplicacion a mano y volve a correr la herramienta.';
  end if;

  select id into v_org from public.organizations where name = c_org;
  if v_org is null then
    insert into public.organizations (name) values (c_org) returning id into v_org;
    v_org_nueva := true;
  end if;

  -- ── 🔴 DEUDA 102 · HOMÓNIMAS DE SEDE — EL BLOQUE QUE FALTABA ─────────────
  --    Acá había un comentario que afirmaba que `sedes` tenía
  --    `unique (organization_id, name)` y que por eso el nombre era «una clave
  --    de verdad». Era FALSO, y por eso este guard no existía: LA CREENCIA
  --    OCUPÓ EL LUGAR DE LA VERIFICACIÓN. El índice
  --    `sedes_nombre_unico_por_organizacion` lo vuelve cierto desde hoy.
  --
  --    ⚠️ El `select ... into` de abajo, con dos filas, NO da error en plpgsql:
  --    toma una. Es el mismo modo de fallo que el de organizaciones —escribir
  --    en el lugar equivocado, callado— un nivel más adentro: el catálogo y las
  --    ventas del cliente sembrados en la sede que no era.
  --
  --    ⚠️ Se normaliza IGUAL que el índice. Comparar crudo acá y normalizado en
  --    el índice dejaría un hueco: «muscle  pro» pasaría el guard y reventaría
  --    después contra el índice, con un error que no nombra el problema.
  select count(*) into v_homonimas
    from public.sedes
   where organization_id = v_org
     and lower(btrim(regexp_replace(name, '\s+', ' ', 'g')))
       = lower(btrim(regexp_replace(c_sede, '\s+', ' ', 'g')));
  if v_homonimas > 1 then
    raise exception using
      errcode = 'check_violation',
      message = format(
        'Hay %s sedes llamadas "%s" en esta organizacion. No se puede decidir '
        'cual es, y elegir mal sembraria el catalogo y las ventas del cliente '
        'en la sede equivocada.',
        v_homonimas, c_sede),
      hint = 'Resolve la duplicacion a mano y volve a correr la herramienta.';
  end if;

  select id into v_sede
    from public.sedes
   where organization_id = v_org
     and lower(btrim(regexp_replace(name, '\s+', ' ', 'g')))
       = lower(btrim(regexp_replace(c_sede, '\s+', ' ', 'g')));
  if v_sede is null then
    insert into public.sedes (organization_id, name)
    values (v_org, c_sede)
    returning id into v_sede;
    v_sede_nueva := true;
  end if;

  -- ── Los roles de sistema ────────────────────────────────────────────────
  -- 🔴 Se llama desde ADENTRO, y no es comodidad: si el alta dejara este paso
  --    al llamador, una organización podría nacer sin RBAC y eso no se nota
  --    hasta que alguien intenta hacer algo y no puede. Ya pasó una vez.
  --    Es idempotente (`on conflict do update`), así que re-correr no rompe.
  -- ⚠️ `seed_system_roles` está revocada de public, anon Y authenticated, y NO
  --    es SECURITY DEFINER. Esta función sí lo es, así que corre como su dueño
  --    y conserva el EXECUTE. Ése es el único motivo por el que el DEFINER hace
  --    falta acá — no para saltear RLS.
  perform public.seed_system_roles(v_org);

  -- Guard fail-closed, copiado de `lab-seed-a.sql`: seguir sin roles sería
  -- entregar una organización que no puede operar, y descubrirlo recién cuando
  -- el cliente no pueda hacer nada.
  select id into v_owner
    from public.roles
   where organization_id = v_org and name = 'owner';
  if v_owner is null then
    raise exception using
      errcode = 'check_violation',
      message = format('seed_system_roles no dejo el rol owner en la org %s.', v_org),
      hint = 'Revisa que supabase/seed-system-roles.sql este aplicado en esta base.';
  end if;

  -- ── Cuántos usuarios tiene YA ───────────────────────────────────────────
  -- 🔴 Es el dato que convierte a esta función en herramienta de RECUPERACIÓN
  --    y no sólo de alta. Un fallo tardío deja la organización creada y sin
  --    usuarios; al re-correr, el llamador necesita saber si tiene que crear el
  --    primer admin o si ya está completa. Sin este número tendría que
  --    adivinarlo, y adivinar acá significa crear un segundo admin de más.
  select count(*) into v_usuarios
    from public.profiles
   where organization_id = v_org;

  return jsonb_build_object(
    'organization_id',     v_org,
    'sede_id',             v_sede,
    'owner_role_id',       v_owner,
    'usuarios_existentes', v_usuarios,
    'organizacion_creada', v_org_nueva,
    'sede_creada',         v_sede_nueva
  );
end $fn$;

comment on function public.onboard_organization(text, text) is
  'Alta de organizacion: org + sede + roles de sistema, en una transaccion. '
  'NO crea el usuario de Auth — no puede: handle_new_user exige sede_id, asi '
  'que el usuario solo puede nacer DESPUES de esta funcion. Devuelve sede_id y '
  'owner_role_id para que el llamador lo cree, y usuarios_existentes para que '
  'distinga un alta nueva de la recuperacion de una organizacion a medias. '
  'Idempotente por NOMBRE de organizacion; falla cerrado si hay homonimas. '
  'La autorizacion del llamante NO vive aca: la resuelve la Edge Function, para '
  'que el autoservicio pueda reusar esta misma funcion cambiando solo quien la '
  'invoca y que se verifica antes.';

-- ── Privilegios ────────────────────────────────────────────────────────────
-- Postgres concede EXECUTE a PUBLIC por defecto, y Supabase agrega DEFAULT
-- PRIVILEGES en el esquema `public` que se lo dan ADEMAS a `anon` — que no es
-- lo mismo que `public`, asi que el primer revoke no lo alcanza. Van los tres.
--
-- 🔴 `authenticated` tambien queda afuera, y es la decision que importa: esta
--    funcion crea TENANTS. Un usuario logueado de otra organizacion no tiene
--    ningun motivo para crear organizaciones nuevas, y el dia del autoservicio
--    tampoco lo va a tener: ahi quien invoca sigue siendo el servidor, despues
--    de verificar correo, limites y suscripcion.
revoke execute on function public.onboard_organization(text, text) from public;
revoke execute on function public.onboard_organization(text, text) from anon;
revoke execute on function public.onboard_organization(text, text) from authenticated;
grant  execute on function public.onboard_organization(text, text) to service_role;
