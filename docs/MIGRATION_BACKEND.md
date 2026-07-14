# Migración Supabase → Backend propio

> **Estado:** cutover completado en código. Supabase ya no es dependencia runtime.
> Guía de producción: [`docs/CUTOVER_PRODUCTION.md`](./CUTOVER_PRODUCTION.md)

## Arranque local

```bash
# Infra (Postgres, PgBouncer, Redis, MinIO)
docker compose up -d

# Backend API
cd backend && npm install && npm run start:dev

# Frontend
npm install && npm run dev

# Admin local
DATABASE_URL=postgres://biconic:biconic_dev_password@localhost:6432/biconic npm run seed:dev-admin
```

Credenciales admin por defecto: `admin@biconic.local` / `Admin123!`

Variables requeridas: ver [`.env.example`](../.env.example).

## Scripts de migración (one-shot desde Supabase)

```bash
# Usuarios (export JSON desde Supabase auth.users + profiles)
pnpm migrate:users ./users-export.json

# Storage (excel-uploads + avatars → MinIO)
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... pnpm migrate:storage
```

## Benchmark

```bash
pnpm bench:aggregate
```

## Arquitectura

```
Browser → Next.js :3000 (/api/* proxy) → NestJS :4000/v1
Next.js → Postgres (ETL pipeline, process-excel)
NestJS → BullMQ (Redis) → workers → callback Next.js /api/etl/run
Storage → MinIO (S3-compatible)
Auth → JWT cookies (biconic_access / biconic_refresh)
```

Checklist de decommission: [`lib/decommission/supabase-bridge.ts`](../lib/decommission/supabase-bridge.ts)
