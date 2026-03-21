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
      .select("id, status, rows_processed, rows_sample, preview_rows, error_message, completed_at")
      .eq("id", previewJobId)
      .eq("user_id", user.id)
      .single();

    if (error || !data) {
      return NextResponse.json({ ok: false, error: "Job de preview no encontrado" }, { status: 404 });
    }
    if (data.status === "failed") {
      return NextResponse.json({ ok: false, error: data.error_message || "El preview falló" }, { status: 500 });
    }
    if (data.status !== "completed") {
      return NextResponse.json({
        ok: true,
        previewJobId: data.id,
        status: data.status,
        rowsProcessed: data.rows_processed ?? 0,
        previewRows: Array.isArray(data.rows_sample) ? data.rows_sample : [],
        partial: true,
      });
    }

    return NextResponse.json({
      ok: true,
      previewJobId: data.id,
      status: "completed",
      rowsProcessed: data.rows_processed ?? 0,
      previewRows: Array.isArray(data.preview_rows) ? data.preview_rows : Array.isArray(data.rows_sample) ? data.rows_sample : [],
      partial: false,
      completedAt: data.completed_at,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Error obteniendo resultado de preview" },
      { status: 500 }
    );
  }
}
