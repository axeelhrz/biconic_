import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Crea un nuevo dashboard y devuelve su ID
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { ok: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    // Parse request body to get dashboard data
    const body = await req.json().catch(() => ({}));
    const { name, etl_id, etl_ids } = body;

    // Soporte: etl_ids (array) o etl_id (único legacy)
    const etlIdsArray: string[] = Array.isArray(etl_ids)
      ? etl_ids.filter((id: any) => id && String(id).trim())
      : etl_id
      ? [String(etl_id).trim()]
      : [];
    const firstEtlId = etlIdsArray[0] ?? null;

    // Prepare dashboard data
    const dashboardData: any = {
      user_id: user.id,
    };

    // Add optional fields if provided
    if (name) {
      dashboardData.title = name;
    }
    if (firstEtlId) {
      dashboardData.etl_id = firstEtlId;
    }

    // Insertamos los datos del dashboard
    const { data, error } = await supabase
      .from("dashboard")
      .insert(dashboardData)
      .select("id")
      .single();

    if (error || !data) {
      return NextResponse.json(
        { ok: false, error: error?.message || "No se pudo crear el dashboard" },
        { status: 400 }
      );
    }

    const dashboardId = String((data as any).id);

    // Registrar todas las fuentes de datos (ETLs) en dashboard_data_sources
    if (etlIdsArray.length > 0) {
      const { error: srcError } = await supabase.from("dashboard_data_sources").insert(
        etlIdsArray.map((etl_id, i) => ({
          dashboard_id: dashboardId,
          etl_id,
          alias: i === 0 ? "Principal" : `Fuente ${i + 1}`,
          sort_order: i,
        }))
      );
      if (srcError) {
        console.error("Error adding dashboard_data_sources:", srcError);
        // No fallar la creación; el dashboard ya existe con etl_id
      }
    }

    return NextResponse.json({ ok: true, id: dashboardId });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Error al crear el dashboard" },
      { status: 500 }
    );
  }
}
