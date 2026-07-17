import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getServerAuthUser } from "@/lib/supabase/server-backend";
import { loadDashboardEtlContext } from "@/lib/dashboard/loadDashboardEtlContext";
import { resolveViewerDashboardAccess } from "@/lib/viewer/resolveViewerDashboardAccess";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ "dashboard-id": string }> }
): Promise<NextResponse> {
  try {
    const authUser = await getServerAuthUser();
    if (!authUser?.id) {
      return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });
    }

    const awaitedParams = await params;
    const dashboardId = awaitedParams["dashboard-id"];
    if (!dashboardId) {
      return NextResponse.json({ ok: false, error: "dashboard-id requerido" }, { status: 400 });
    }

    const access = await resolveViewerDashboardAccess(authUser.id, dashboardId);
    if (!access.ok) {
      return NextResponse.json(
        { ok: false, error: access.error },
        { status: access.status }
      );
    }

    const supabase = await createClient();
    const dashboard = {
      ...access.dashboard,
      id: String(access.dashboard.id),
    } as Record<string, unknown> & { id: string; etl_id?: string | null };

    if (dashboard.etl_id) {
      const { data: etlRow } = await supabase
        .from("etl")
        .select("id, title, name")
        .eq("id", String(dashboard.etl_id))
        .maybeSingle();
      if (etlRow) dashboard.etl = etlRow;
    }

    const ctx = await loadDashboardEtlContext(supabase, dashboard);
    if ("error" in ctx) {
      return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
    }

    const savedMetrics = ctx.dataSources.flatMap((ds) => ds.savedMetrics ?? []);

    return NextResponse.json({
      ok: true,
      data: {
        dashboard: ctx.dashboard,
        dataSources: ctx.dataSources,
        primarySourceId: ctx.primarySourceId,
        etl: ctx.etl,
        etlData: ctx.etlData,
        fields: ctx.fields,
        savedMetrics,
        dashboardDataset: ctx.dashboardDataset,
        datasetDimensions: ctx.datasetDimensions,
        datasetWarnings: ctx.datasetWarnings,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error interno del servidor";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
