/**
 * Checklist y pasos para cutover en producción (sin Supabase).
 * Ver también docs/MIGRATION_BACKEND.md
 */

export const DECOMMISSION_CHECKLIST = [
  "Stack propio desplegado: Postgres, PgBouncer, Redis, MinIO, backend Nest, workers",
  "DATABASE_URL, JWT_SECRET, ENCRYPTION_KEY, S3_* configurados en Coolify",
  "Migración DB: pg_dump desde Supabase → import en Postgres propio",
  "Migración usuarios: pnpm migrate:users + reset de contraseñas obligatorio",
  "Migración storage: pnpm migrate:storage (excel-uploads + avatars → MinIO)",
  "Benchmark sin regresiones: pnpm bench:aggregate",
  "Crons apuntando a /v1/etl/run-scheduled y /v1/etl/mark-stale-runs-failed",
  "DNS del frontend apuntando al nuevo stack",
  "Tras 1-2 semanas estables: cancelar proyecto Supabase",
] as const;

export function isSupabaseDeprecated(): boolean {
  return true;
}

/** Variables legacy eliminadas tras cutover. */
export const SUPABASE_ENV_VARS_TO_REMOVE = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_DB_URL",
] as const;
