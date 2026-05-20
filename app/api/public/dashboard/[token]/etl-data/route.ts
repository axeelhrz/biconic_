import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { loadDashboardEtlContext } from "@/lib/dashboard/loadDashboardEtlContext";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
): Promise<NextResponse> {
  try {
    const awaitedParams = await params;
    const token = awaitedParams.token;

    if (!token) {
      return NextResponse.json({ ok: false, error: "Token required" }, { status: 400 });
    }

    const supabase = createServiceRoleClient();

    const { data: dashboard, error: dashboardError } = await supabase
      .from("dashboard")
      .select("*, etl:etl_id (id, title, name)")
      .eq("share_token", token)
      .maybeSingle();

    if (dashboardError || !dashboard) {
      return NextResponse.json({ ok: false, error: "Dashboard no encontrado" }, { status: 404 });
    }

    if (dashboard.visibility === "private") {
      return NextResponse.json({ ok: false, error: "Dashboard is private" }, { status: 403 });
    }

    const ctx = await loadDashboardEtlContext(supabase, dashboard as Record<string, unknown> & { id: string });

    if ("error" in ctx) {
      if (ctx.status === 400 && !dashboard.etl_id) {
        return NextResponse.json({
          ok: true,
          data: {
            dashboard,
            etl: null,
            etlData: null,
            fields: { all: [], numeric: [], string: [], date: [] },
            dataSources: [],
            dashboardDataset: { version: 1, dimensions: [], updatedAt: new Date().toISOString() },
            datasetDimensions: {},
          },
        });
      }
      if (ctx.status === 404) {
        return NextResponse.json({
          ok: true,
          data: {
            dashboard,
            etl: dashboard.etl ?? null,
            etlData: null,
            fields: { all: [], numeric: [], string: [], date: [] },
            dataSources: [],
            dashboardDataset: { version: 1, dimensions: [], updatedAt: new Date().toISOString() },
            datasetDimensions: {},
          },
        });
      }
      return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
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
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
