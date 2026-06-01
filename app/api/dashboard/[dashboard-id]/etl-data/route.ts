// Soporta múltiples fuentes de datos (ETLs) por dashboard + Dataset del Dashboard

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import {
  loadDashboardEtlContext,
  persistDashboardDatasetIfNeeded,
} from "@/lib/dashboard/loadDashboardEtlContext";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ "dashboard-id": string }> }
): Promise<NextResponse> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });
    }

    const awaitedParams = await params;
    const dashboardId = awaitedParams["dashboard-id"];

    const { data: dashboard, error: dashboardError } = await supabase
      .from("dashboard")
      .select("*, etl:etl_id (id, title, name)")
      .eq("id", dashboardId)
      .maybeSingle();

    if (dashboardError || !dashboard) {
      return NextResponse.json({ ok: false, error: "Dashboard no encontrado" }, { status: 404 });
    }

    const ctx = await loadDashboardEtlContext(supabase, dashboard as Record<string, unknown> & { id: string });
    if ("error" in ctx) {
      return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
    }

    if (ctx.datasetNeedsPersist) {
      const adminClient = createServiceRoleClient();
      await persistDashboardDatasetIfNeeded(adminClient, dashboardId, ctx);
    }

    return NextResponse.json({
      ok: true,
      data: {
        dashboard: ctx.dashboard,
        dataSources: ctx.dataSources,
        primarySourceId: ctx.primarySourceId,
        etl: ctx.etl,
        etlData: ctx.etlData,
        fields: ctx.fields,
        dashboardDataset: ctx.dashboardDataset,
        datasetDimensions: ctx.datasetDimensions,
        datasetWarnings: ctx.datasetWarnings,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error interno del servidor";
    console.error("[etl-data] Error:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
