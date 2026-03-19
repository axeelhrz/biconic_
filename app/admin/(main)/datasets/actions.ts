"use server";

import { createClient } from "@/lib/supabase/server";
import { getConnections } from "@/lib/actions/connections";
import type { Connection } from "@/components/connections/ConnectionsCard";

/**
 * Datos necesarios para abrir el wizard de dataset en modal (etlTitle + connections).
 * Usado en /admin/datasets para mostrar el wizard al 100% sin navegar.
 */
export async function getDatasetWizardData(etlId: string): Promise<{
  ok: boolean;
  etlTitle?: string;
  connections?: Connection[];
  error?: string;
}> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "No autorizado" };

    const { data: etl, error: etlError } = await supabase
      .from("etl")
      .select("id, title, name, client_id")
      .eq("id", etlId)
      .maybeSingle();

    if (etlError || !etl) {
      return { ok: false, error: "ETL no encontrado" };
    }

    const etlTitle =
      (etl as { title?: string; name?: string })?.title ||
      (etl as { title?: string; name?: string })?.name ||
      etlId;
    const clientId = (etl as { client_id?: string | null })?.client_id ?? null;

    let connections: Connection[] = [];
    try {
      connections = await getConnections(clientId ? { clientId } : undefined);
    } catch (e) {
      console.error("Error loading connections for dataset wizard:", e);
    }

    return { ok: true, etlTitle, connections };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al cargar datos del wizard";
    return { ok: false, error: message };
  }
}
