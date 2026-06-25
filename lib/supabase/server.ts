import { createServerBackendClient } from "./server-backend";

/** Cliente server-side (Postgres + JWT). Tipado laxo para compatibilidad con API Supabase. */
export async function createClient(): Promise<any> {
  return createServerBackendClient();
}
