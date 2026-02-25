"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";

/** Eliminar una o más entradas de etl_runs_log (solo APP_ADMIN). */
export async function deleteMonitorRunsAdmin(ids: string[]): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "No autorizado" };

  const { data: prof } = await supabase
    .from("profiles")
    .select("app_role")
    .eq("id", user.id)
    .single();
  if ((prof as { app_role?: string })?.app_role !== "APP_ADMIN")
    return { ok: false, error: "Solo administradores" };

  if (!ids.length) return { ok: true };

  const adminClient = createServiceRoleClient();
  const { error } = await adminClient
    .from("etl_runs_log")
    .delete()
    .in("id", ids);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
