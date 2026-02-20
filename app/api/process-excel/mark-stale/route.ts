import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

const STALE_MINUTES = 12;

/**
 * Marca una importación Excel como fallida si lleva demasiado tiempo en estado no terminal.
 * Así la UI deja de mostrar "Procesando" / "Descargando..." para siempre.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const dataTableId = body?.dataTableId;
    if (!dataTableId || typeof dataTableId !== "string") {
      return NextResponse.json({ error: "Faltan dataTableId" }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { data: row, error: fetchErr } = await supabase
      .from("data_tables")
      .select("id, import_status, updated_at")
      .eq("id", dataTableId)
      .single();

    if (fetchErr || !row) {
      return NextResponse.json({ error: "Registro no encontrado" }, { status: 404 });
    }

    const status = (row as any).import_status;
    const terminal = status === "completed" || status === "failed";
    if (terminal) {
      return NextResponse.json({ ok: true, status, stale: false });
    }

    const updatedAt = (row as any).updated_at;
    const updatedMs = updatedAt ? new Date(updatedAt).getTime() : 0;
    const staleThreshold = Date.now() - STALE_MINUTES * 60 * 1000;
    const isStale = updatedMs < staleThreshold;

    if (!isStale) {
      return NextResponse.json({
        ok: true,
        status,
        stale: false,
        message: "Aún en tiempo de procesamiento",
      });
    }

    const { error: updateErr } = await supabase
      .from("data_tables")
      .update({
        import_status: "failed",
        error_message: "El procesamiento no completó a tiempo (timeout). Podés volver a subir el archivo.",
      })
      .eq("id", dataTableId);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      status: "failed",
      stale: true,
      message: "Importación marcada como fallida por tiempo de espera.",
    });
  } catch (e: any) {
    console.error("[mark-stale]", e);
    return NextResponse.json({ error: e?.message || "Error" }, { status: 500 });
  }
}
