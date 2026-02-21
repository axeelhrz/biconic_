import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/admin/metrics
 * Lista todas las métricas reutilizables agrupadas por ETL (layout.saved_metrics de cada ETL).
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
      .select("id, title, name, layout")
      .order("title", { ascending: true });

    if (fetchError) {
      return NextResponse.json({ ok: false, error: fetchError.message }, { status: 500 });
    }

    const etlsWithMetrics = (etls ?? []).map((etl) => {
      const layout = (etl as { layout?: { saved_metrics?: unknown[] } }).layout;
      const savedMetrics = Array.isArray(layout?.saved_metrics) ? layout.saved_metrics : [];
      return {
        id: (etl as { id: string }).id,
        title: (etl as { title?: string }).title ?? (etl as { name?: string }).name ?? "",
        name: (etl as { name?: string }).name ?? (etl as { title?: string }).title ?? "",
        savedMetrics,
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
