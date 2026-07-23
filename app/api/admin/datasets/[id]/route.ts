import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";

/**
 * DELETE /api/admin/datasets/[id]
 * Elimina un dataset por id. Requiere APP_ADMIN.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: rawId } = await params;
    const id = String(rawId ?? "").trim();
    if (!id) {
      return NextResponse.json({ ok: false, error: "Id de dataset requerido" }, { status: 400 });
    }

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
    if ((profile as { app_role?: string } | null)?.app_role !== "APP_ADMIN") {
      return NextResponse.json({ ok: false, error: "Requiere rol de administrador" }, { status: 403 });
    }

    const adminClient = createServiceRoleClient();
    const { data: existing, error: lookupError } = await adminClient
      .from("dataset")
      .select("id")
      .eq("id", id)
      .maybeSingle();

    if (lookupError) {
      const msg = lookupError.message ?? "";
      const tableMissing =
        msg.includes("does not exist") || /relation\s+["']?(public\.)?dataset["']?/i.test(msg);
      if (tableMissing) {
        return NextResponse.json(
          { ok: false, error: "La tabla dataset no está disponible en la base de datos." },
          { status: 500 }
        );
      }
      return NextResponse.json({ ok: false, error: lookupError.message }, { status: 500 });
    }

    if (!existing) {
      return NextResponse.json({ ok: false, error: "Dataset no encontrado" }, { status: 404 });
    }

    const { error: deleteError } = await adminClient.from("dataset").delete().eq("id", id);
    if (deleteError) {
      return NextResponse.json({ ok: false, error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, data: { id } });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error al eliminar dataset";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
