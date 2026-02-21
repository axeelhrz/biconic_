import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";

/**
 * POST /api/etl/save-config
 * Guarda la configuración del flujo guiado en el ETL (layout.guided_config)
 * para que al editar se carguen todos los datos.
 * Usa service role para el update y así evitar fallos por RLS.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { etlId, guidedConfig } = body ?? {};
    if (!etlId || typeof guidedConfig !== "object") {
      return NextResponse.json(
        { ok: false, error: "etlId y guidedConfig requeridos" },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });
    }

    const adminClient = createServiceRoleClient();
    const { data: etlRow, error: fetchError } = await adminClient
      .from("etl")
      .select("layout")
      .eq("id", etlId)
      .single();

    if (fetchError || !etlRow) {
      return NextResponse.json(
        { ok: false, error: "ETL no encontrado" },
        { status: 404 }
      );
    }

    const currentLayout = (etlRow as { layout?: Record<string, unknown> })?.layout ?? {};
    const updatedLayout = { ...currentLayout, guided_config: guidedConfig };

    const { error: updateError } = await adminClient
      .from("etl")
      .update({ layout: updatedLayout })
      .eq("id", etlId);

    if (updateError) {
      return NextResponse.json(
        { ok: false, error: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error al guardar configuración";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
