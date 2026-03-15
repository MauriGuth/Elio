#!/usr/bin/env bash
# Trae la BD remota (Railway) al entorno local.
# Uso: REMOTE_DATABASE_URL="postgresql://postgres:PASSWORD@HOST:PORT/railway" ./scripts/pull-remote-db.sh
# Opcional: LOCAL_DATABASE_URL="postgresql://usuario@localhost:5432/nova" (por defecto: postgresql://mauriciohuentelaf@localhost:5432/nova)

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DUMP_FILE="${REPO_ROOT}/nova_remote.dump"

# PATH: Homebrew libpq (macOS)
BREW_LIBPQ=""
if command -v brew &>/dev/null; then
  BREW_LIBPQ="$(brew --prefix libpq 2>/dev/null)"
fi
export PATH="${BREW_LIBPQ}/bin:/opt/homebrew/opt/libpq/bin:/usr/local/opt/libpq/bin:$PATH"

if [[ -z "$REMOTE_DATABASE_URL" ]]; then
  echo "Definí REMOTE_DATABASE_URL con la URL del PostgreSQL de Railway."
  echo "Ejemplo:"
  echo '  REMOTE_DATABASE_URL="postgresql://postgres:xxx@shuttle.proxy.rlwy.net:34312/railway" ./scripts/pull-remote-db.sh'
  echo "La URL la encontrás en Railway → servicio PostgreSQL → Variables / Connect."
  exit 1
fi

LOCAL_URL="${LOCAL_DATABASE_URL:-postgresql://mauriciohuentelaf@localhost:5432/nova}"

PG_DUMP=""
PG_RESTORE=""
PSQL=""
for cmd in pg_dump pg_restore psql; do
  if command -v "$cmd" &>/dev/null; then
    [[ "$cmd" == "pg_dump" ]] && PG_DUMP="pg_dump"
    [[ "$cmd" == "pg_restore" ]] && PG_RESTORE="pg_restore"
    [[ "$cmd" == "psql" ]] && PSQL="psql"
  fi
done
if [[ -z "$PG_DUMP" ]] && [[ -d "${BREW_LIBPQ}/bin" ]]; then
  [[ -x "${BREW_LIBPQ}/bin/pg_dump" ]] && PG_DUMP="${BREW_LIBPQ}/bin/pg_dump"
  [[ -x "${BREW_LIBPQ}/bin/pg_restore" ]] && PG_RESTORE="${BREW_LIBPQ}/bin/pg_restore"
  [[ -x "${BREW_LIBPQ}/bin/psql" ]] && PSQL="${BREW_LIBPQ}/bin/psql"
fi
for P in "/opt/homebrew/opt/libpq/bin" "/usr/local/opt/libpq/bin"; do
  [[ -z "$PG_DUMP" && -x "$P/pg_dump" ]] && PG_DUMP="$P/pg_dump" && PG_RESTORE="$P/pg_restore" && PSQL="$P/psql" && break
done
if [[ -z "$PG_DUMP" ]] && command -v brew &>/dev/null; then
  FOUND="$(find "$(brew --prefix)/Cellar/libpq" -name pg_dump -type f 2>/dev/null | head -1)"
  if [[ -n "$FOUND" ]]; then
    PG_DUMP="$FOUND"
    PG_RESTORE="$(dirname "$FOUND")/pg_restore"
    PSQL="$(dirname "$FOUND")/psql"
  fi
fi
if [[ -z "$PG_DUMP" ]] || [[ -z "$PG_RESTORE" ]] || [[ -z "$PSQL" ]]; then
  echo "No se encontraron pg_dump/pg_restore/psql. Instalá: brew install libpq"
  exit 1
fi

echo "1/3 Exportando BD remota (Railway) a $DUMP_FILE ..."
"$PG_DUMP" "$REMOTE_DATABASE_URL" --no-owner --no-acl -F c -f "$DUMP_FILE"
echo "2/3 Vacianto esquema public en la BD local ..."
"$PSQL" "$LOCAL_URL" -v ON_ERROR_STOP=1 -c "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO postgres; GRANT ALL ON SCHEMA public TO public;" || { echo "Error al vaciar el esquema local. ¿La base existe? (createdb nova)"; exit 1; }
echo "3/3 Restaurando dump en la BD local ..."
"$PG_RESTORE" --no-owner --no-acl -d "$LOCAL_URL" "$DUMP_FILE" || true
echo "Listo. BD remota copiada a local ($LOCAL_URL)."
echo "Revisá apps/api/.env que DATABASE_URL apunte a esa misma URL local."
