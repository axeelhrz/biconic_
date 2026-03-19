import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";

/**
 * GET /api/admin/datasets
 * Lista todos los datasets con el título del ETL asociado.
 * Requiere APP_ADMIN. Usa service role para leer la tabla dataset (evita RLS).
 * Si la tabla no existe, devuelve 200 con datasets vacíos y warning para no romper la página.
 */
export async function GET() {
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

    const adminClient = createServiceRoleClient();
    const { data: rows, error: fetchError } = await adminClient
      .from("dataset")
      .select("id, etl_id, name, config, created_at, updated_at, etl(title)")
      .order("updated_at", { ascending: false });

    if (fetchError) {
      const msg = fetchError.message ?? "";
      const tableMissing =
        msg.includes("does not exist") || /relation\s+["']?(public\.)?dataset["']?/i.test(msg);
      if (tableMissing) {
        return NextResponse.json({
          ok: true,
          data: { datasets: [] },
          warning: "Lista no disponible; ejecutá la migración de la tabla dataset en Supabase.",
        });
      }
      return NextResponse.json({ ok: false, error: fetchError.message }, { status: 500 });
    }

    const datasets = (rows ?? []).map((row: Record<string, unknown>) => ({
      id: row.id,
      etl_id: row.etl_id,
      name: row.name ?? null,
      config: row.config,
      created_at: row.created_at,
      updated_at: row.updated_at,
      etl_title: (row.etl as { title?: string } | null)?.title ?? null,
    }));

    return NextResponse.json({
      ok: true,
      data: { datasets },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error al listar datasets";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
