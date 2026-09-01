#!/usr/bin/env bash
# ============================================================
# G-Nexo — STAGING · ¿el override matchea el compose real?
#
# 🔴 ESTE ES EL UNICO CHEQUEO QUE SEPARA "levantar staging" DE "tirar
#    produccion". Se ejecuta una vez, de noche, por alguien apurado.
#
# POR QUE ES UN SCRIPT Y NO UN PASO DEL README: un chequeo que se puede leer
# sin contestar se salta en silencio. Este devuelve un exit code binario y no
# se puede pasar por alto leyendo rapido. Misma logica que el hook de SQL.
#
# QUE VERIFICA: que CADA clave de `services:` del override exista como servicio
# real en el compose de Supabase que corre en el host.
#
# POR QUE IMPORTA: Docker Compose NO falla por una clave que no matchea ningun
# servicio — la ignora. Si upstream renombro `kong` a `gateway`, el override
# queda inerte y ese servicio arranca CON LOS PUERTOS DE PRODUCCION. No hay
# error, no hay aviso: hay un reverse proxy resolviendo a staging.
#
# USO:
#   ./verificar-servicios.sh /ruta/al/supabase/docker/docker-compose.yml
#
# EXIT CODES:
#   0  todas las claves del override matchean       → se puede seguir
#   1  uso incorrecto / archivo inexistente
#   2  no se pudo determinar la lista real          → FAIL-CLOSED, no asumir
#   3  al menos una clave del override NO matchea   → NO LEVANTAR
# ============================================================

set -u

AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OVERRIDE="$AQUI/docker-compose.staging.yml"
REAL="${1:-}"

rojo()  { printf '\033[31m%s\033[0m\n' "$*"; }
verde() { printf '\033[32m%s\033[0m\n' "$*"; }

if [ -z "$REAL" ]; then
  rojo "USO: $0 /ruta/al/supabase/docker/docker-compose.yml"
  echo "     (el compose REAL que corre en el host, no el override)"
  exit 1
fi

if [ ! -f "$REAL" ]; then
  rojo "No existe el compose real: $REAL"
  exit 1
fi

if [ ! -f "$OVERRIDE" ]; then
  rojo "No existe el override: $OVERRIDE"
  exit 1
fi

# ── Servicios REALES ────────────────────────────────────────────────────────
# Se piden a docker, no se parsea el YAML: `config --services` resuelve
# extends, anchors y perfiles, que un parseo a mano se pierde.
#
# 🔴 Si docker no esta o el compose no resuelve, se SALE CON ERROR. No se cae a
#    un parseo "aproximado": un chequeo que se degrada solo es peor que ninguno,
#    porque igual imprime algo tranquilizador.
if ! command -v docker >/dev/null 2>&1; then
  rojo "docker no esta disponible: no se puede determinar la lista real de servicios."
  echo "     FAIL-CLOSED a proposito. Corre esto en el host donde vive el stack."
  exit 2
fi

REALES="$(docker compose -f "$REAL" config --services 2>/dev/null | tr -d '\r' | sed '/^$/d')"
if [ -z "$REALES" ]; then
  rojo "docker compose config --services no devolvio nada para: $REAL"
  echo "     Puede ser un compose invalido o variables de entorno faltantes."
  echo "     FAIL-CLOSED: sin lista real no hay con que comparar."
  exit 2
fi

# ── Servicios del OVERRIDE ──────────────────────────────────────────────────
# Claves con exactamente 2 espacios de indentacion dentro del bloque `services:`.
# Se corta en `volumes:` (u otra clave de nivel 0) para no tomar nada de ahi.
OVERRIDES="$(awk '
  /^services:[[:space:]]*$/ { dentro=1; next }
  /^[a-zA-Z_]/              { dentro=0 }
  dentro && /^  [a-zA-Z0-9_.-]+:[[:space:]]*$/ {
    linea=$0; sub(/^  /,"",linea); sub(/:.*$/,"",linea); print linea
  }
' "$OVERRIDE" | sed '/^$/d')"

if [ -z "$OVERRIDES" ]; then
  rojo "No se leyo ninguna clave de services: en el override."
  echo "     O el archivo cambio de forma, o este parser quedo viejo."
  echo "     FAIL-CLOSED: si no se que estoy comparando, no digo que esta bien."
  exit 2
fi

# ── Comparacion ─────────────────────────────────────────────────────────────
echo "Compose real   : $REAL"
echo "Override       : $OVERRIDE"
echo
echo "Servicios reales ($(echo "$REALES" | wc -l | tr -d ' ')):"
echo "$REALES" | sed 's/^/  · /'
echo
echo "Claves del override ($(echo "$OVERRIDES" | wc -l | tr -d ' ')):"

FALTAN=0
while IFS= read -r svc; do
  [ -z "$svc" ] && continue
  if echo "$REALES" | grep -qx -- "$svc"; then
    printf '  \033[32m✓\033[0m %s\n' "$svc"
  else
    printf '  \033[31m✗ %s  — NO EXISTE en el compose real\033[0m\n' "$svc"
    FALTAN=$((FALTAN + 1))
  fi
done <<EOF
$OVERRIDES
EOF

echo
if [ "$FALTAN" -gt 0 ]; then
  rojo "⛔ NO LEVANTAR: $FALTAN clave(s) del override no matchean ningun servicio real."
  echo
  echo "   Docker Compose las IGNORA en silencio, asi que esos servicios"
  echo "   arrancarian con los puertos de PRODUCCION."
  echo
  echo "   Corregir docs/staging/docker-compose.staging.yml con los nombres"
  echo "   reales y volver a correr esto."
  exit 3
fi

verde "✅ Las $(echo "$OVERRIDES" | wc -l | tr -d ' ') claves del override matchean servicios reales."
echo
echo "   Esto NO dice que los puertos esten libres ni que el .env este completo."
echo "   Siguiente: ss -ltnp | grep -E ':(8100|8543|5533|3100|4100)\\b'  (debe volver vacio)"
exit 0
