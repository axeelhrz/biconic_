import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/admin/metrics
 * Lista métricas reutilizables y análisis guardados por ETL (layout.saved_metrics, layout.saved_analyses).
 * Requiere APP_ADMIN.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("app_role")
      .eq("id", user.id)
      .single();
    if ((profile as { app_role?: string })?.app_role !== "APP_ADMIN") {
      return NextResponse.json({ ok: false, error: "Requiere rol de administrador" }, { status: 403 });
    }

    const { data: etls, error: fetchError } = await supabase
      .from("etl")
      .select("id, title, name, layout, client_id")
      .order("title", { ascending: true });

    if (fetchError) {
      return NextResponse.json({ ok: false, error: fetchError.message }, { status: 500 });
    }

    const clientIds = Array.from(
      new Set(
        (etls ?? [])
          .map((e: { client_id?: string | null }) => e.client_id)
          .filter((id): id is string => typeof id === "string" && id.trim() !== "")
      )
    );

    const clientNameById = new Map<string, string>();
    if (clientIds.length > 0) {
      const { data: clients } = await supabase
        .from("clients")
        .select("id, company_name, individual_full_name, type")
        .in("id", clientIds);
      for (const c of clients ?? []) {
        const row = c as {
          id: string;
          company_name?: string | null;
          individual_full_name?: string | null;
          type?: string | null;
        };
        const label =
          row.type === "empresa" && row.company_name?.trim()
            ? row.company_name.trim()
            : row.individual_full_name?.trim() || row.company_name?.trim() || "Cliente";
        clientNameById.set(row.id, label);
      }
    }

    const etlsWithMetrics = (etls ?? []).map((etl: any) => {
      const layout = (etl as { layout?: { saved_metrics?: unknown[]; saved_analyses?: unknown[] } }).layout;
      const savedMetrics = Array.isArray(layout?.saved_metrics) ? layout.saved_metrics : [];
      const savedAnalyses = Array.isArray(layout?.saved_analyses) ? layout.saved_analyses : [];
      const clientId = (etl as { client_id?: string | null }).client_id ?? null;
      return {
        id: (etl as { id: string }).id,
        title: (etl as { title?: string }).title ?? (etl as { name?: string }).name ?? "",
        name: (etl as { name?: string }).name ?? (etl as { title?: string }).title ?? "",
        clientId,
        clientLabel: clientId ? clientNameById.get(clientId) ?? null : null,
        savedMetrics,
        savedAnalyses,
      };
    });

    return NextResponse.json({
      ok: true,
      data: { etls: etlsWithMetrics },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error al listar métricas";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
