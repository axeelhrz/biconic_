import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ "dashboard-id": string }> }
): Promise<NextResponse> {
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

    const awaitedParams = await params;
    const dashboardId = awaitedParams["dashboard-id"];
    if (!dashboardId) {
      return NextResponse.json({ ok: false, error: "dashboard-id requerido" }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const { layout, global_filters_config, title } = body;

    const adminClient = createServiceRoleClient();
    const updatePayload: Record<string, unknown> = {};
    if (layout !== undefined) updatePayload.layout = layout;
    if (global_filters_config !== undefined) updatePayload.global_filters_config = global_filters_config;
    if (title !== undefined) updatePayload.title = title;

    if (Object.keys(updatePayload).length === 0) {
      return NextResponse.json({ ok: false, error: "No hay datos para actualizar" }, { status: 400 });
    }

    const { error } = await adminClient
      .from("dashboard")
      .update(updatePayload)
      .eq("id", dashboardId);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error al actualizar dashboard";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ "dashboard-id": string }> }
): Promise<NextResponse> {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });
    }

    const awaitedParams = await params;
    const dashboardId = awaitedParams["dashboard-id"];

    const { data, error } = await supabase
      .from("dashboard")
      .select("id, title, layout, global_filters_config, etl_id")
      .eq("id", dashboardId)
      .maybeSingle();

    if (error || !data) {
      return NextResponse.json({ ok: false, error: "Dashboard no encontrado" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error al obtener dashboard";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
