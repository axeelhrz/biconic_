import { shouldUseOwnBackend } from "@/lib/api/backend-config";

/** Columnas de `connections` según entorno (schema propio vs Supabase legacy). */
export function connectionsSelectColumns(): string {
  const legacy =
    "id, type, config, db_host, db_name, db_user, db_port, db_password_encrypted, db_password_secret_id";
  return shouldUseOwnBackend() ? "*" : legacy;
}

export function connectionsSelectColumnsWithUser(): string {
  const legacy =
    "id, user_id, type, config, db_host, db_name, db_user, db_port, db_password_encrypted, db_password_secret_id";
  return shouldUseOwnBackend() ? "*" : legacy;
}
