import { createBackendShimClient } from "@/lib/api/backend-supabase-shim";

/** Cliente browser (backend propio). Tipado laxo para compatibilidad con API Supabase. */
export function createClient(): any {
  return createBackendShimClient();
}
