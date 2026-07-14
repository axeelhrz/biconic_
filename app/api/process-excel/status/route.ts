import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { shouldUseOwnBackend } from "@/lib/api/backend-config";
import { resolveServerAuth } from "@/lib/auth/resolve-server-auth";
import { createImportAdminClient } from "@/lib/excel-import/import-admin-client";

export const dynamic = "force-dynamic";

type ImportStatusRow = {
  import_status: string;
  total_rows: number | null;
  error_message: string | null;
  physical_table_name: string | null;
  updated_at?: string | null;
  table_name?: string | null;
};

function aggregateImportStatuses(rows: ImportStatusRow[]) {
  if (rows.length === 0) {
    return null;
  }

  const totalRows = rows.reduce((sum, row) => sum + Number(row.total_rows ?? 0), 0);
  const statuses = rows.map((row) => row.import_status);
  const sheetLabels = rows
    .map((row) => row.table_name || row.physical_table_name)
    .filter(Boolean);

  let import_status = "processing";
  if (statuses.every((s) => s === "completed")) {
    import_status = "completed";
  } else if (statuses.some((s) => s === "failed")) {
    import_status = statuses.some((s) => s === "completed") ? "failed" : "failed";
  } else if (statuses.every((s) => s === "pending")) {
    import_status = "pending";
  }

  const warnings = rows
    .map((row) => row.error_message?.trim())
    .filter((msg): msg is string => Boolean(msg));

  const error_message =
    rows.length > 1
      ? warnings.length > 0
        ? `Importación multi-hoja (${rows.filter((r) => r.import_status === "completed").length}/${rows.length}):\n${warnings.join("\n")}`
        : import_status === "completed"
          ? `Importadas ${rows.length} hojas: ${sheetLabels.join(", ")}`
          : null
      : warnings[0] ?? null;

  return {
    import_status,
    total_rows: totalRows,
    error_message,
    physical_table_name:
      rows.length === 1 ? rows[0].physical_table_name : `${rows.length} tablas`,
    updated_at: rows[0].updated_at ?? null,
    sheet_count: rows.length,
  };
}

export async function GET(req: NextRequest) {
  if (!shouldUseOwnBackend()) {
    return NextResponse.json({ error: "No disponible" }, { status: 404 });
  }

  const { user, setCookieHeaders } = await resolveServerAuth(req);
  if (!user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const dataTableId = req.nextUrl.searchParams.get("dataTableId")?.trim();
  const connectionId = req.nextUrl.searchParams.get("connectionId")?.trim();

  if (!dataTableId && !connectionId) {
    return NextResponse.json(
      { error: "dataTableId o connectionId requerido" },
      { status: 400 }
    );
  }

  const admin = createImportAdminClient();

  if (connectionId) {
    const { data, error } = await admin
      .from("data_tables")
      .select(
        "import_status, total_rows, error_message, physical_table_name, updated_at, table_name"
      )
      .eq("connection_id", connectionId);

    if (error || !data || (Array.isArray(data) && data.length === 0)) {
      return NextResponse.json({ error: "Registro no encontrado" }, { status: 404 });
    }

    const rows = (Array.isArray(data) ? data : [data]) as ImportStatusRow[];
    const aggregated = aggregateImportStatuses(rows);
    if (!aggregated) {
      return NextResponse.json({ error: "Registro no encontrado" }, { status: 404 });
    }

    const response = NextResponse.json(aggregated);
    for (const cookie of setCookieHeaders) {
      response.headers.append("set-cookie", cookie);
    }
    return response;
  }

  const { data, error } = await admin
    .from("data_tables")
    .select("import_status, total_rows, error_message, physical_table_name, updated_at")
    .eq("id", dataTableId!)
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
