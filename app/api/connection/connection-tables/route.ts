import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { shouldUseOwnBackend } from "@/lib/api/backend-config";
import { readConnectionTablesFromRow } from "@/lib/connection/connection-persistence";

/** GET ?connectionId= — tablas habilitadas para ETL (connection_tables persistidas). */
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const connectionId = (req.nextUrl.searchParams.get("connectionId") || "").trim();
    if (!connectionId) {
      return NextResponse.json({ ok: false, error: "connectionId requerido" }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });
    }

    const dbClient = shouldUseOwnBackend() ? createServiceRoleClient() : supabase;
    const selectCols = shouldUseOwnBackend() ? "id, connection_tables, config" : "connection_tables, config";

    const { data: conn, error } = await dbClient
      .from("connections")
      .select(selectCols)
      .eq("id", connectionId)
      .maybeSingle();

    if (error || !conn) {
      return NextResponse.json(
        { ok: false, error: error?.message || "Conexión no encontrada" },
        { status: 404 }
      );
    }

    const tables = readConnectionTablesFromRow(conn as Record<string, unknown>) ?? [];

    return NextResponse.json({ ok: true, connection_tables: tables });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Error al leer tablas de la conexión";
    console.error("[connection-tables]", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
