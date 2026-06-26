#!/bin/sh
set -e
case "${BICONIC_START:-api}" in
  etl-worker)
    exec node dist/backend/src/workers/etl.worker.js
    ;;
  excel-worker)
    exec node dist/backend/src/workers/excel.worker.js
    ;;
  *)
    exec node dist/backend/src/main.js
    ;;
esac
