import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";

/**
 * POST /api/admin/etl/[etl-id]/rerun
 * Re-ejecuta un ETL cargando su guided_config. Solo APP_ADMIN.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ "etl-id": string }> }
) {
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

    const { "etl-id": etlId } = await params;
    if (!etlId?.trim()) {
      return NextResponse.json({ ok: false, error: "etl-id requerido" }, { status: 400 });
    }

    const adminClient = createServiceRoleClient();
    const { data: etlRow, error: etlError } = await adminClient
      .from("etl")
      .select("id, layout")
      .eq("id", etlId.trim())
      .single();

    if (etlError || !etlRow) {
      return NextResponse.json(
        { ok: false, error: etlError?.message ?? "ETL no encontrado" },
        { status: 404 }
      );
    }

    const layout = (etlRow as { layout?: { guided_config?: Record<string, unknown> } }).layout;
    const guidedConfig = layout?.guided_config && typeof layout.guided_config === "object"
      ? layout.guided_config
      : null;

    if (!guidedConfig) {
      return NextResponse.json(
        { ok: false, error: "El ETL no tiene configuración de ejecución guardada (guided_config). Edítalo y ejecútalo al menos una vez." },
        { status: 400 }
      );
    }
    const join = guidedConfig.join as { primaryConnectionId?: string } | undefined;
    const union = guidedConfig.union as { left?: { connectionId?: string } } | undefined;
    if (!guidedConfig.connectionId && !join?.primaryConnectionId && !union?.left?.connectionId) {
      return NextResponse.json(
        { ok: false, error: "El ETL no tiene configuración de ejecución guardada (guided_config). Edítalo y ejecútalo al menos una vez." },
        { status: 400 }
      );
    }

    const body = {
      etlId: (etlRow as { id: string }).id,
      connectionId: guidedConfig.connectionId ?? union?.left?.connectionId ?? join?.primaryConnectionId,
      filter: guidedConfig.filter,
      union: guidedConfig.union,
      join: guidedConfig.join,
      clean: guidedConfig.clean,
      end: guidedConfig.end,
      waitForCompletion: false,
    };

    const origin = req.nextUrl?.origin ?? (typeof req.url === "string" ? new URL(req.url).origin : "");
    const runUrl = `${origin}/api/etl/run`;
    const cookieHeader = req.headers.get("cookie");

    const runRes = await fetch(runUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      },
      body: JSON.stringify(body),
    });

    const runData = await runRes.json().catch(() => ({}));
    if (!runRes.ok) {
      return NextResponse.json(
        { ok: false, error: (runData?.error as string) || runRes.statusText || "Error al iniciar la ejecución" },
        { status: runRes.status >= 400 ? runRes.status : 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      runId: runData.runId,
      message: runData.message ?? "Ejecución iniciada.",
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error al re-ejecutar";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
