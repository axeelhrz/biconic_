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
    const { name, etl_id } = body;

    // Prepare dashboard data
    const dashboardData: any = {
      user_id: user.id,
    };

    // Add optional fields if provided
    if (name) {
      dashboardData.title = name;
    }
    if (etl_id) {
      dashboardData.etl_id = etl_id;
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

    return NextResponse.json({ ok: true, id: String((data as any).id) });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Error al crear el dashboard" },
      { status: 500 }
    );
  }
}
