import { shouldUseOwnBackend } from "@/lib/api/backend-config";

/** Columnas de `connections` según entorno (schema propio vs Supabase legacy). */
export function connectionsSelectColumns(): string {
  return shouldUseOwnBackend()
    ? "*"
    : "id, type, db_host, db_name, db_user, db_port, db_password_encrypted, db_password_secret_id";
}

export function connectionsSelectColumnsWithUser(): string {
  return shouldUseOwnBackend()
    ? "*"
    : "id, user_id, type, db_host, db_name, db_user, db_port, db_password_encrypted, db_password_secret_id";
}
