import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import {
  applyManualDimensionMapping,
  buildDashboardDataset,
  parseLayoutDashboardDataset,
  toLegacyDatasetDimensions,
} from "@/lib/dashboard/dashboardDataset";
import {
  buildLayoutWithDashboardDataset,
  loadDashboardEtlContext,
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

    const { data: profile } = await supabase
      .from("profiles")
      .select("app_role")
      .eq("id", user.id)
      .single();
    if ((profile as { app_role?: string })?.app_role !== "APP_ADMIN") {
      return NextResponse.json({ ok: false, error: "Requiere rol de administrador" }, { status: 403 });
    }

    const dashboardId = (await params)["dashboard-id"];
    const { data: dashboard } = await supabase
      .from("dashboard")
      .select("id, layout, etl_id")
      .eq("id", dashboardId)
      .maybeSingle();

    if (!dashboard) {
      return NextResponse.json({ ok: false, error: "Dashboard no encontrado" }, { status: 404 });
    }

    const ctx = await loadDashboardEtlContext(supabase, dashboard as Record<string, unknown> & { id: string });
    if ("error" in ctx) {
      return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
    }

    return NextResponse.json({
      ok: true,
      dashboardDataset: ctx.dashboardDataset,
      datasetDimensions: ctx.datasetDimensions,
      datasetWarnings: ctx.datasetWarnings,
      dataSources: ctx.dataSources.map((s) => ({ id: s.id, alias: s.alias, etlName: s.etlName })),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error interno";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
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

    const { data: profile } = await supabase
      .from("profiles")
      .select("app_role")
      .eq("id", user.id)
      .single();
    if ((profile as { app_role?: string })?.app_role !== "APP_ADMIN") {
      return NextResponse.json({ ok: false, error: "Requiere rol de administrador" }, { status: 403 });
    }

    const dashboardId = (await params)["dashboard-id"];
    const body = await request.json().catch(() => ({}));
    const { dimensionId, sourceId, physicalColumn, action } = body as {
      dimensionId?: string;
      sourceId?: string;
      physicalColumn?: string;
      action?: "rebuild";
    };

    const adminClient = createServiceRoleClient();
    const { data: dashboard } = await adminClient
      .from("dashboard")
      .select("id, layout, etl_id")
      .eq("id", dashboardId)
      .maybeSingle();

    if (!dashboard) {
      return NextResponse.json({ ok: false, error: "Dashboard no encontrado" }, { status: 404 });
    }

    const ctx = await loadDashboardEtlContext(adminClient, dashboard as Record<string, unknown> & { id: string });
    if ("error" in ctx) {
      return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
    }

    let dataset = ctx.dashboardDataset;

    if (action === "rebuild") {
      const saved = parseLayoutDashboardDataset(dashboard.layout);
      const rebuilt = buildDashboardDataset(
        ctx.dataSources.map((ds) => ({
          id: ds.id,
          etlId: ds.etlId,
          alias: ds.alias,
          fields: ds.fields,
        })),
        saved,
        { forceRebuild: false }
      );
      dataset = rebuilt.dataset;
    } else if (dimensionId && sourceId && physicalColumn) {
      dataset = applyManualDimensionMapping(dataset, dimensionId, sourceId, physicalColumn);
    } else {
      return NextResponse.json(
        { ok: false, error: "dimensionId, sourceId y physicalColumn requeridos" },
        { status: 400 }
      );
    }

    const layout = buildLayoutWithDashboardDataset(
      dashboard.layout as Record<string, unknown> | undefined,
      dataset,
      ctx.dataSources
    );

    const { error } = await adminClient
      .from("dashboard")
      .update({ layout: layout as unknown as import("@/lib/supabase/database.types").Json })
      .eq("id", dashboardId);
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      dashboardDataset: dataset,
      datasetDimensions: toLegacyDatasetDimensions(dataset),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error interno";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
