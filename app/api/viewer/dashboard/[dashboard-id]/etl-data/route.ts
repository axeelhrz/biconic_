import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { dashboardPublishedStatusFromRow } from "@/lib/dashboard/dashboardPublishedFromRow";
import { CLIENT_MEMBER_ACTIVE_OR_FILTER } from "@/lib/client-members/clientMembershipActive";
import { loadDashboardEtlContext } from "@/lib/dashboard/loadDashboardEtlContext";

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

    let hasAccess = false;
    if (dashboard.user_id === user.id) {
      hasAccess = true;
    } else {
      const { data: members, error: membersErr } = await supabase
        .from("client_members")
        .select("id, client_id")
        .eq("user_id", user.id)
        .or(CLIENT_MEMBER_ACTIVE_OR_FILTER);
      if (membersErr) {
        return NextResponse.json(
          { ok: false, error: "Error verificando permisos" },
          { status: 500 }
        );
      }
      const memberIds = (members ?? []).map((m: { id: string }) => m.id);
      if (memberIds.length > 0) {
        const { data: perms, error: permsErr } = await supabase
          .from("dashboard_has_client_permissions")
          .select("id")
          .in("client_member_id", memberIds)
          .eq("dashboard_id", dashboard.id)
          .eq("is_active", true);
        if (permsErr) {
          return NextResponse.json(
            { ok: false, error: "Error verificando permisos" },
            { status: 500 }
          );
        }
        if (perms && perms.length > 0) hasAccess = true;
      }
      if (!hasAccess) {
        const dash = dashboard as {
          client_id?: string | null;
          status?: string | null;
          published?: boolean | null;
          visibility?: string | null;
        };
        const cid =
          dash.client_id != null && String(dash.client_id).trim() !== ""
            ? String(dash.client_id)
            : null;
        const memberClientIds = new Set(
          (members ?? []).map((m: { client_id: string }) => String(m.client_id))
        );
        if (
          cid &&
          memberClientIds.has(cid) &&
          dashboardPublishedStatusFromRow(dash) === "Publicado"
        ) {
          hasAccess = true;
        }
      }
    }

    if (!hasAccess) {
      return NextResponse.json(
        { ok: false, error: "Sin permisos para ver este dashboard" },
        { status: 403 }
      );
    }

    const ctx = await loadDashboardEtlContext(supabase, dashboard as Record<string, unknown> & { id: string });
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
