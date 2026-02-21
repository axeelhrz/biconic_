import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";

function requireAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  return supabase.auth.getUser().then(({ data: { user }, error }) => {
    if (error || !user) return { ok: false as const, status: 401, error: "No autorizado" };
    return supabase.from("profiles").select("app_role").eq("id", user.id).single().then(({ data: profile }) => {
      if ((profile as { app_role?: string })?.app_role !== "APP_ADMIN")
        return { ok: false as const, status: 403, error: "Requiere rol de administrador" };
      return { ok: true as const };
    });
  });
}

/**
 * GET /api/etl/[etl-id]/metrics
 * Devuelve las métricas guardadas del ETL (etl.layout.saved_metrics).
 * Requiere APP_ADMIN.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ "etl-id": string }> }
): Promise<NextResponse> {
  try {
    const supabase = await createClient();
    const auth = await requireAdmin(supabase);
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const awaitedParams = await params;
    const etlId = awaitedParams["etl-id"];
    if (!etlId) {
      return NextResponse.json({ ok: false, error: "etl-id requerido" }, { status: 400 });
    }

    const { data: etlRow, error } = await supabase
      .from("etl")
      .select("layout")
      .eq("id", etlId)
      .maybeSingle();

    if (error || !etlRow) {
      return NextResponse.json({ ok: false, error: "ETL no encontrado" }, { status: 404 });
    }

    const layout = (etlRow as { layout?: { saved_metrics?: unknown[] } }).layout;
    const savedMetrics = Array.isArray(layout?.saved_metrics) ? layout.saved_metrics : [];

    return NextResponse.json({ ok: true, data: { savedMetrics } });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error al obtener métricas";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

/**
 * PUT /api/etl/[etl-id]/metrics
 * Actualiza las métricas guardadas del ETL (etl.layout.saved_metrics).
 * Body: { savedMetrics: Array<{ id: string; name: string; metric: object }> }
 * Requiere APP_ADMIN.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ "etl-id": string }> }
): Promise<NextResponse> {
  try {
    const supabase = await createClient();
    const auth = await requireAdmin(supabase);
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const awaitedParams = await params;
    const etlId = awaitedParams["etl-id"];
    if (!etlId) {
      return NextResponse.json({ ok: false, error: "etl-id requerido" }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const savedMetrics = Array.isArray(body.savedMetrics) ? body.savedMetrics : [];

    const adminClient = createServiceRoleClient();
    const { data: etlRow, error: fetchError } = await adminClient
      .from("etl")
      .select("layout")
      .eq("id", etlId)
      .single();

    if (fetchError || !etlRow) {
      return NextResponse.json({ ok: false, error: "ETL no encontrado" }, { status: 404 });
    }

    const currentLayout = (etlRow as { layout?: Record<string, unknown> })?.layout ?? {};
    const updatedLayout = { ...currentLayout, saved_metrics: JSON.parse(JSON.stringify(savedMetrics)) };

    const { error: updateError } = await adminClient
      .from("etl")
      .update({ layout: updatedLayout })
      .eq("id", etlId);

    if (updateError) {
      return NextResponse.json({ ok: false, error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error al guardar métricas";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
