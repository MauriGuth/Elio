#!/usr/bin/env bash
# Restaura el dump local (nova_local.dump) en la BD de Railway.
# Uso: REMOTE_DATABASE_URL="postgresql://postgres:PASSWORD@HOST:PORT/railway" ./scripts/restore-remote-db.sh
# Cuidado: reemplaza los datos actuales en la base remota.

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DUMP_FILE="${REPO_ROOT}/nova_local.dump"

# PATH: Homebrew libpq (Apple Silicon + Intel) y ruta dinámica con brew --prefix
BREW_LIBPQ=""
if command -v brew &>/dev/null; then
  BREW_LIBPQ="$(brew --prefix libpq 2>/dev/null)"
fi
export PATH="${BREW_LIBPQ}/bin:/opt/homebrew/opt/libpq/bin:/usr/local/opt/libpq/bin:$PATH"

if [[ -z "$REMOTE_DATABASE_URL" ]]; then
  echo "Definí REMOTE_DATABASE_URL con la URL del PostgreSQL de Railway."
  echo "Ejemplo: REMOTE_DATABASE_URL=\"postgresql://postgres:xxx@shuttle.proxy.rlwy.net:34312/railway\" ./scripts/restore-remote-db.sh"
  exit 1
fi
if [[ ! -f "$DUMP_FILE" ]]; then
  echo "No existe $DUMP_FILE. Ejecutá primero: ./scripts/dump-local-db.sh"
  exit 1
fi

PG_RESTORE=""
if command -v pg_restore &>/dev/null; then
  PG_RESTORE="pg_restore"
else
  for P in "${BREW_LIBPQ}/bin/pg_restore" "/opt/homebrew/opt/libpq/bin/pg_restore" "/usr/local/opt/libpq/bin/pg_restore"; do
    [[ -z "$P" || "$P" == "/bin/pg_restore" ]] && continue
    if [[ -x "$P" ]]; then
      PG_RESTORE="$P"
      break
    fi
  done
  # Buscar en Cellar por si no está linkeado
  if [[ -z "$PG_RESTORE" ]] && command -v brew &>/dev/null; then
    FOUND="$(find "$(brew --prefix)/Cellar/libpq" -name pg_restore -type f 2>/dev/null | head -1)"
    if [[ -n "$FOUND" ]]; then
      PG_RESTORE="$FOUND"
    fi
  fi
fi
if [[ -z "$PG_RESTORE" ]]; then
  echo "No se encontró pg_restore."
  echo "Instalá las herramientas de PostgreSQL: brew install libpq"
  echo "Luego enlazá al PATH: brew link --force libpq"
  echo "O agregá a ~/.zshrc: export PATH=\"\$(brew --prefix libpq)/bin:\$PATH\""
  exit 1
fi
if [[ "$PG_RESTORE" == */* ]] && [[ ! -x "$PG_RESTORE" ]]; then
  echo "pg_restore no es ejecutable: $PG_RESTORE"
  exit 1
fi

# psql está en el mismo bin que pg_restore
PSQL="psql"
if [[ "$PG_RESTORE" == */* ]]; then
  PSQL="$(dirname "$PG_RESTORE")/psql"
  [[ ! -x "$PSQL" ]] && PSQL="psql"
fi

echo "Vacianto esquema public en la BD remota (DROP SCHEMA public CASCADE) ..."
"$PSQL" "$REMOTE_DATABASE_URL" -v ON_ERROR_STOP=1 -c "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO postgres; GRANT ALL ON SCHEMA public TO public;" || { echo "Error al vaciar el esquema."; exit 1; }

echo "Restaurando dump en la BD remota (esto puede tardar) ..."
"$PG_RESTORE" --no-owner --no-acl -d "$REMOTE_DATABASE_URL" "$DUMP_FILE" || true
echo "Hecho. Revisá si hubo errores por permisos (algunos son normales)."
