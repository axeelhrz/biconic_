#!/usr/bin/env bash
# Aplica migraciones SQL en orden (Postgres en Railway u otro host).
# Uso: DATABASE_URL=postgres://... ./scripts/apply-migrations.sh

set -euo pipefail

URL="${DATABASE_URL:-}"
if [[ -z "$URL" ]]; then
  echo "Definí DATABASE_URL"
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
for f in "$ROOT"/migrations/*.sql; do
  [[ -f "$f" ]] || continue
  echo "==> $(basename "$f")"
  psql "$URL" -v ON_ERROR_STOP=1 -f "$f"
done

echo "Migraciones aplicadas."
