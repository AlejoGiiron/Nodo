# Staging de G-Nexo — stack separado, todavía SIN levantar

*2026-08-31. **Nada de esto se ejecutó.** Los archivos están para leerse antes de que corran.*

El primer `db push` de G-Nexo va acá, **no** al proyecto de Supabase en la nube. Hasta hoy todo
eran archivos y todo era reversible; el push es el primer acto irreversible, con 15 migraciones que
nunca corrieron juntas.

⛔ **El Ubuntu sirve a G-Vento en PRODUCCIÓN. No se toca sin que lo mires.**

---

## 1 · El riesgo no es la base: son los puertos y el proxy

La intuición dice "el peligro es que staging escriba en la base de producción". **Es el riesgo
menor**: bases distintas, volúmenes distintos, credenciales distintas.

El riesgo real es más tonto y más grave: **un compose copiado levanta Kong en el puerto 8000**, que
es donde ya escucha G-Vento. A partir de ahí el reverse proxy del host resuelve a staging, y la API
de producción responde con datos de prueba **sin que nada falle**. No hay error, no hay caída: hay
un cliente real mirando un catálogo que no es el suyo.

Por eso el override redefine puertos **antes que ninguna otra cosa**, y por eso el `-p
gnexo-staging` no es opcional.

| Servicio | G-Vento (prod) | G-Nexo (staging) |
|---|---|---|
| Kong HTTP | 8000 | **8100** |
| Kong HTTPS | 8443 | **8543** |
| Postgres | 5432 | **5533** |
| Studio | 3000 | **3100** |
| Analytics | 4000 | **4100** |

🔴 **El modo de fallo que da miedo, dicho explícito:** si upstream renombró un servicio, el override
lo ignora **en silencio** —Compose no falla por una clave que no matchea ningún servicio— y ese
servicio arranca con los puertos de producción. Por eso el primer paso es diffear nombres, no
`up -d`.

---

## 2 · Orden de ejecución, cuando se decida correrlo

```bash
# 0. QUÉ SERVICIOS EXISTEN REALMENTE en el compose que corre hoy.
#    Si algún nombre del override no aparece acá, el override no aplica y hay
#    que corregirlo ANTES de seguir.
docker compose -f /ruta/al/supabase/docker/docker-compose.yml config --services

# 1. Qué puertos están ocupados HOY en el host. Ninguno de los de staging
#    debe aparecer.
ss -ltnp | grep -E ':(8100|8543|5533|3100|4100)\b'   # debe volver vacío

# 2. Ver la configuración FINAL resuelta, sin levantar nada.
docker compose -p gnexo-staging \
  -f /ruta/al/supabase/docker/docker-compose.yml \
  -f docs/staging/docker-compose.staging.yml \
  --env-file docs/staging/.env.staging \
  config | grep -A3 'ports:'

# 3. Recién ahí, levantar.
docker compose -p gnexo-staging ... up -d
```

⚠️ El paso 2 es el que convierte esto en revisable: `config` **imprime lo que se va a ejecutar**
sin ejecutarlo. Es la diferencia entre leer el override y leer el resultado.

---

## 3 · Cómo se revierte

Staging es **desechable por diseño** — se recrea desde las migraciones. Eso es lo que hace barata
la reversión.

```bash
# Parar y borrar SOLO staging. El -p acota todo a este proyecto.
docker compose -p gnexo-staging down

# Borrar también sus datos (recrear desde cero):
docker compose -p gnexo-staging down -v
docker volume rm gnexo_staging_db     # por si quedó huérfano
```

🔴 **Nunca correr `docker compose down` sin `-p gnexo-staging`.** Sin el project name, Compose usa
el default del directorio y puede parar los contenedores de G-Vento. Ese es el comando que hay que
mirar dos veces.

**Verificación después de revertir** — producción sigue en pie:

```bash
docker ps --format '{{.Names}}\t{{.Ports}}' | grep -v gnexo-staging
curl -sf http://localhost:8000/ >/dev/null && echo "G-Vento OK"
```

---

## 4 · Backup — DECIDIDO: staging queda EXCLUIDO del ciclo nocturno

No es un ítem pendiente. **Se decide acá y se escribe:**

**Staging NO entra en el backup.** Se recrea desde `supabase/migrations/` más un seed, así que un
respaldo suyo no aporta nada que no esté ya en git.

**Y la razón de fondo, que es la que importa:** meter staging en el backup de producción hace que
**el backup de producción falle por una razón que no es producción**. Un volumen de staging lleno,
corrupto o simplemente grande rompe el ciclo nocturno, y el síntoma aparece como "falló el backup"
— alguien lo mira, ve que es staging, y aprende que ese error se puede ignorar. **Ese aprendizaje
es el daño real:** el día que falle de verdad, también se va a ignorar.

⚠️ **Exclusión explícita, no por omisión.** Si el script de backup toma volúmenes por patrón —algo
como `supabase_*`— el volumen se llama `gnexo_staging_db` **a propósito**: no matchea. Pero eso hay
que **verificarlo leyendo el script**, no suponerlo: un patrón `*db*` sí lo tomaría.

---

## 5 · Criterio de aceptación del primer push

🔴 **Un `db push` que termina sin error NO prueba que el esquema funcione.**

Postgres **no valida los cuerpos de las funciones plpgsql al crearlas**. Una RPC puede nombrar una
tabla, una columna o una función que no existe y **crearse igual, sin una advertencia**. El error
aparece recién al ejecutarla.

La verificación de orden que se hizo sobre las migraciones cubre FKs y triggers —cosas que Postgres
sí valida al crear— y **no cubre nada de lo que está adentro de un `$$ ... $$`**. Es exactamente el
límite que R4 marca: el push verde es un proxy del esquema funcionando, no el esquema funcionando.

**Por eso el push no se da por bueno hasta que cada RPC se EJECUTE al menos una vez**, contra la
base limpia recién migrada:

| RPC | Qué prueba ejecutarla |
|---|---|
| `next_order_number` | el consecutivo y su guard por sede |
| `add_order_items_with_extras` | alta de ítems, descuento de stock, `unit_cost` congelado |
| `register_sale_payment` | cobro y el guard de doble cobro |
| `register_sale_void` | reversión de stock espejo y el guard de doble anulación |
| `adjust_stock` | los cuatro guards |
| `register_purchase` | compra, `categoria='compra'`, promedio ponderado, rechazo sin jornada |
| `register_debt_payment` | abono, `categoria='abono_cliente'`, `requiere_conciliacion` |
| `has_permission` · `get_my_*` | que las policies de `rls` autoricen algo |
| `seed_system_roles` | que el catálogo siembre |

**Criterio de éxito:** las nueve corren sin error de "relation does not exist" ni "column does not
exist". Cualquiera de esos dos mensajes significa que la migración creó una función rota y el push
verde lo ocultó.

⚠️ **Y una segunda cosa que el push tampoco prueba:** que las policies **nieguen** lo que deben
negar. Eso son los specs E2E, no el push.

---

## 6 · Lo que falta antes de poder correr esto

- [ ] Confirmar la **ruta y versión** del `docker-compose.yml` oficial que corre hoy en el Ubuntu.
- [ ] Diffear los **nombres de servicio** contra el override (paso 0).
- [ ] Generar los secretos de `.env.staging` — **ninguno reutilizado**.
- [ ] Verificar el **script de backup** y confirmar que no toma `gnexo_staging_db`.
- [ ] Desplegar las **edge functions** (`create-user`, `aplicar-estado`) en el stack: el esquema
      **presupone** que G-Centro escribe `subscription_status` por ahí (ver `02b`/`suscripcion`).
- [ ] Decidir si staging tiene **dominio y TLS** o se accede por IP:puerto.
