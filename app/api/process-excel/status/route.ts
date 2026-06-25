import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { shouldUseOwnBackend } from "@/lib/api/backend-config";
import { resolveServerAuth } from "@/lib/auth/resolve-server-auth";
import { createImportAdminClient } from "@/lib/excel-import/import-admin-client";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!shouldUseOwnBackend()) {
    return NextResponse.json({ error: "No disponible" }, { status: 404 });
  }

  const { user, setCookieHeaders } = await resolveServerAuth(req);
  if (!user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const dataTableId = req.nextUrl.searchParams.get("dataTableId")?.trim();
  if (!dataTableId) {
    return NextResponse.json({ error: "dataTableId requerido" }, { status: 400 });
  }

  const admin = createImportAdminClient();
  const { data, error } = await admin
    .from("data_tables")
    .select("import_status, total_rows, error_message, physical_table_name, updated_at")
    .eq("id", dataTableId)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Registro no encontrado" }, { status: 404 });
  }

  const response = NextResponse.json(data);
  for (const cookie of setCookieHeaders) {
    response.headers.append("set-cookie", cookie);
  }
  return response;
}
