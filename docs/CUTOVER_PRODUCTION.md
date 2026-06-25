# Cutover a producción (sin Supabase)

Guía operativa para el despliegue en Coolify y la ventana de cutover.

## 1. Infraestructura en Coolify

Servicios requeridos (ver [`docker-compose.yml`](../docker-compose.yml) y [`docker-compose.coolify.yml`](../docker-compose.coolify.yml)):

| Servicio | Puerto | Variables |
|----------|--------|-----------|
| Postgres 16 | 5432 | `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` |
| PgBouncer | 6432 | `DATABASE_URL=postgres://user:pass@pgbouncer:5432/db` |
| Redis 7 | 6379 | `REDIS_URL=redis://redis:6379` |
| MinIO | 9000/9001 | `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` |
| Backend Nest | 4000 | Ver abajo |
| Frontend Next | 3000 | Ver abajo |
| etl-worker | — | `NEXT_INTERNAL_URL=http://frontend:3000` |
| excel-worker | — | Idem |

### Backend Nest (`:4000/v1`)

```
DATABASE_URL=postgres://...@pgbouncer:5432/biconic
JWT_SECRET=<32+ chars>
JWT_REFRESH_SECRET=<32+ chars>
REDIS_URL=redis://redis:6379
S3_ENDPOINT=http://minio:9000
S3_ACCESS_KEY=...
S3_SECRET_KEY=...
S3_BUCKET=excel-uploads
S3_FORCE_PATH_STYLE=true
CORS_ORIGIN=https://app.tudominio.com
CRON_SECRET=<secreto>
ENCRYPTION_KEY=<32+ chars>
```

### Frontend Next

```
USE_OWN_BACKEND=true
NEXT_PUBLIC_USE_OWN_BACKEND=true
NEXT_PUBLIC_API_URL=https://api.tudominio.com/v1
DATABASE_URL=postgres://...@pgbouncer:5432/biconic
JWT_SECRET=<mismo que backend>
ENCRYPTION_KEY=<mismo que backend>
NEXT_PUBLIC_SITE_URL=https://app.tudominio.com
```

Aplicar migraciones SQL de [`migrations/`](../migrations/) en el primer arranque de Postgres.

## 2. Migración de datos

### Base de datos

```bash
pg_dump "$SUPABASE_DB_URL" \
  --schema=public --schema=etl_output --schema=data_warehouse \
  --no-owner --no-acl > supabase-dump.sql

psql "$DATABASE_URL" < supabase-dump.sql
```

### Usuarios

```bash
pnpm migrate:users ./users-export.json
```

Los hashes de Supabase Auth **no son portables**. Comunicar reset de contraseña a todos los usuarios.

### Storage

```bash
SUPABASE_URL=https://xxx.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=eyJ... \
S3_ENDPOINT=https://minio.tudominio.com \
pnpm migrate:storage
```

## 3. Validación pre-cutover

```bash
# Health
curl https://api.tudominio.com/v1/health

# Admin local (staging)
pnpm seed:dev-admin

# Benchmark agregaciones
pnpm bench:aggregate
```

Checklist funcional (ver [`MVP_FALTANTES.md`](../MVP_FALTANTES.md)):

1. Login admin → `/admin`
2. Crear conexión → test OK
3. ETL → completed en `etl_runs_log`
4. Dashboard con widgets → agregaciones correctas
5. Vista pública por token
6. Import Excel async (worker)
7. Cron ETL → `POST /v1/etl/run-scheduled`

## 4. Ventana de cutover

1. Deploy stack propio en staging con datos migrados (1 semana de validación)
2. Cambiar DNS del frontend al nuevo stack
3. Comunicar reset de contraseñas
4. Apuntar crons a:
   - `POST https://api.tudominio.com/v1/etl/run-scheduled`
   - `POST https://api.tudominio.com/v1/etl/mark-stale-runs-failed`
5. Tras 1-2 semanas estables: cancelar proyecto Supabase

## 5. Workers

```bash
cd backend
pnpm worker:etl    # requiere Next accesible en NEXT_INTERNAL_URL
pnpm worker:excel
```

O levantar `etl-worker` y `excel-worker` en Docker Compose.
