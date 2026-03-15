#!/usr/bin/env bash
# Exporta la BD local a un archivo .dump para luego restaurar en Railway.
# Uso: ./scripts/dump-local-db.sh
# Opcional: LOCAL_DATABASE_URL="postgresql://..." ./scripts/dump-local-db.sh

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
OUTPUT_FILE="${REPO_ROOT}/elio_local.dump"

# En macOS, libpq de Homebrew suele no estar en PATH
BREW_LIBPQ=""
if command -v brew &>/dev/null; then
  BREW_LIBPQ="$(brew --prefix libpq 2>/dev/null)"
fi
export PATH="${BREW_LIBPQ}/bin:/opt/homebrew/opt/libpq/bin:/usr/local/opt/libpq/bin:$PATH"

if command -v pg_dump &>/dev/null; then
  PG_DUMP="pg_dump"
else
  for P in "${BREW_LIBPQ}/bin/pg_dump" "/opt/homebrew/opt/libpq/bin/pg_dump" "/usr/local/opt/libpq/bin/pg_dump"; do
    [[ -z "$P" || "$P" == "/bin/pg_dump" ]] && continue
    [[ -x "$P" ]] && PG_DUMP="$P" && break
  done
  if [[ -z "$PG_DUMP" ]] && command -v brew &>/dev/null; then
    FOUND="$(find "$(brew --prefix)/Cellar/libpq" -name pg_dump -type f 2>/dev/null | head -1)"
    [[ -n "$FOUND" ]] && PG_DUMP="$FOUND"
  fi
fi
if [[ -z "$PG_DUMP" ]]; then
  echo "No se encontró pg_dump. Instalá con: brew install libpq"
  echo "Luego: brew link --force libpq  o  export PATH=\"\$(brew --prefix libpq)/bin:\$PATH\""
  exit 1
fi

LOCAL_URL="${LOCAL_DATABASE_URL:-postgresql://mauriciohuentelaf@localhost:5432/elio}"
echo "Exportando BD local a $OUTPUT_FILE ..."
"$PG_DUMP" "$LOCAL_URL" --no-owner --no-acl -F c -f "$OUTPUT_FILE"
echo "Listo. Para restaurar en Railway:"
echo "  REMOTE_DATABASE_URL=\"<copiá la URL del PostgreSQL en Railway>\" ./scripts/restore-remote-db.sh"
echo "  o: /opt/homebrew/opt/libpq/bin/pg_restore --no-owner --no-acl -d \"REMOTE_URL\" -c $OUTPUT_FILE"
