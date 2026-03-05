import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Marca un run de ETL como fallido (p. ej. cuando quedó "En progreso" por timeout).
 * Solo permite si el run está en status "started" o "running" y el usuario tiene permiso sobre el ETL.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ "etl-id": string }> }
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
    const etlId = awaitedParams["etl-id"];
    if (!etlId) {
      return NextResponse.json({ ok: false, error: "etl-id requerido" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const runId = typeof body?.runId === "string" ? body.runId.trim() : "";
    if (!runId) {
      return NextResponse.json({ ok: false, error: "runId requerido en el body" }, { status: 400 });
    }

    const errorMessage =
      typeof body?.error_message === "string"
        ? body.error_message.slice(0, 500)
        : "Marcado como fallido (posible timeout o interrupción).";

    // Verificar que el run existe y pertenece a este ETL
    const { data: runRow, error: runErr } = await supabase
      .from("etl_runs_log")
      .select("id, status, etl_id")
      .eq("id", runId)
      .eq("etl_id", etlId)
      .maybeSingle();

    if (runErr || !runRow) {
      return NextResponse.json(
        { ok: false, error: "Run no encontrado o no pertenece a este ETL" },
        { status: 404 }
      );
    }

    const status = (runRow as { status?: string }).status;
    if (status !== "started" && status !== "running") {
      return NextResponse.json(
        { ok: false, error: "Solo se puede marcar como fallido un run en progreso" },
        { status: 400 }
      );
    }

    // Permiso: APP_ADMIN, owner del ETL o permiso UPDATE
    const { data: profile } = await supabase
      .from("profiles")
      .select("app_role")
      .eq("id", user.id)
      .single();
    if ((profile as { app_role?: string })?.app_role === "APP_ADMIN") {
      // OK
    } else {
      const { data: etlRow, error: etlErr } = await supabase
        .from("etl")
        .select("user_id, client_id")
        .eq("id", etlId)
        .maybeSingle();
      if (etlErr || !etlRow) {
        return NextResponse.json({ ok: false, error: "ETL no encontrado" }, { status: 404 });
      }
      const ownerId = (etlRow as { user_id?: string }).user_id;
      if (ownerId === user.id) {
        // OK owner
      } else {
        const clientId = (etlRow as { client_id?: string }).client_id;
        if (!clientId) {
          return NextResponse.json({ ok: false, error: "Sin permiso para este ETL" }, { status: 403 });
        }
        const { data: memberRow } = await supabase
          .from("client_members")
          .select("id")
          .eq("user_id", user.id)
          .eq("client_id", clientId)
          .maybeSingle();
        if (!memberRow?.id) {
          return NextResponse.json({ ok: false, error: "Sin permiso para este ETL" }, { status: 403 });
        }
        const { data: permRows } = await supabase
          .from("etl_has_permissions")
          .select("id")
          .eq("etl_id", etlId)
          .eq("client_member_id", (memberRow as { id: string }).id)
          .eq("permission_type", "UPDATE")
          .limit(1);
        if (!permRows?.length) {
          return NextResponse.json({ ok: false, error: "Sin permiso para este ETL" }, { status: 403 });
        }
      }
    }

    const completedAt = new Date().toISOString();
    const { error: updateErr } = await supabase
      .from("etl_runs_log")
      .update({
        status: "failed",
        completed_at: completedAt,
        error_message: errorMessage,
      })
      .eq("id", runId)
      .eq("etl_id", etlId)
      .in("status", ["started", "running"]);

    if (updateErr) {
      return NextResponse.json(
        { ok: false, error: updateErr.message || "Error al actualizar" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: "Run marcado como fallido.",
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error interno";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
