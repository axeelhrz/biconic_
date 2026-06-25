#!/usr/bin/env bash
# Exporta esquema desde Supabase o Postgres local para versionar migraciones.
# Uso:
#   SUPABASE_DB_URL=postgres://... ./scripts/export-schema.sh
#   DATABASE_URL=postgres://... ./scripts/export-schema.sh

set -euo pipefail
URL="${DATABASE_URL:-${SUPABASE_DB_URL:-}}"
OUT="${1:-migrations/002_exported_schema.sql}"

if [[ -z "$URL" ]]; then
  echo "Define DATABASE_URL o SUPABASE_DB_URL"
  exit 1
fi

pg_dump "$URL" --schema-only --no-owner --no-privileges > "$OUT"
echo "Esquema exportado a $OUT"
