import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";

export async function GET(req: NextRequest) {
  try {
    const previewJobId = (req.nextUrl.searchParams.get("previewJobId") || "").trim();
    if (!previewJobId) {
      return NextResponse.json({ ok: false, error: "previewJobId es requerido" }, { status: 400 });
    }
    const supabase = await createClient();
    const service = createServiceRoleClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });

    const { data, error } = await (service as any)
      .from("etl_preview_jobs")
      .select("id, status, rows_processed, rows_sample, source_offset, source_exhausted, error_message, created_at, started_at, completed_at")
      .eq("id", previewJobId)
      .eq("user_id", user.id)
      .single();

    if (error || !data) {
      return NextResponse.json({ ok: false, error: "Job de preview no encontrado" }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      previewJobId: data.id,
      status: data.status,
      rowsProcessed: data.rows_processed ?? 0,
      rowsSample: Array.isArray(data.rows_sample) ? data.rows_sample : [],
      sourceOffset: data.source_offset ?? 0,
      sourceExhausted: data.source_exhausted === true,
      error: data.error_message ?? null,
      createdAt: data.created_at,
      startedAt: data.started_at,
      completedAt: data.completed_at,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Error consultando estado de preview" },
      { status: 500 }
    );
  }
}
