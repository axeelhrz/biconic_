import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import postgres from "postgres";

async function resolveEtlTable(
  supabase: Awaited<ReturnType<typeof createClient>>,
  etlId: string
): Promise<{ schema: string; tableName: string } | null> {
  const { data: latestRun } = await supabase
    .from("etl_runs_log")
    .select("destination_schema,destination_table_name")
    .eq("etl_id", etlId)
    .eq("status", "completed")
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestRun?.destination_table_name) {
    return {
      schema: latestRun.destination_schema || "etl_output",
      tableName: latestRun.destination_table_name,
    };
  }

  const { data: etlRow } = await supabase
    .from("etl")
    .select("layout, output_table")
    .eq("id", etlId)
    .maybeSingle();

  if (!etlRow) return null;

  const outputTable = (etlRow as { output_table?: string | null }).output_table;
  if (typeof outputTable === "string" && outputTable.trim()) {
    const tableName = outputTable.trim().replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase();
    for (const schemaName of ["etl_output", "public"]) {
      const schemaClient = supabase.schema(schemaName as "public" | "etl_output") as any;
      const { error } = await schemaClient.from(tableName).select("*").limit(1);
      if (!error) return { schema: schemaName, tableName };
    }
  }

  const layout = (etlRow as { layout?: Record<string, unknown> }).layout;
  // guided_config (flujo guiado)
  const guided = layout?.guided_config && typeof layout.guided_config === "object" ? layout.guided_config as Record<string, unknown> : undefined;
  const end = guided?.end && typeof guided.end === "object" ? guided.end as Record<string, unknown> : undefined;
  const target = end?.target && typeof end.target === "object" ? end.target as Record<string, unknown> : undefined;
  let rawTable = target?.table;
  if (typeof rawTable === "string" && rawTable.trim()) {
    const tableName = rawTable.trim().replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase();
    for (const schemaName of ["etl_output", "public"]) {
      const schemaClient = supabase.schema(schemaName as "public" | "etl_output") as any;
      const { error } = await schemaClient.from(tableName).select("*").limit(1);
      if (!error) return { schema: schemaName, tableName };
    }
  }
  // layout.widgets (editor por nodos, incl. ETLs con JOIN)
  const widgets = layout?.widgets;
  if (Array.isArray(widgets)) {
    const endWidget = widgets.find((w: { type?: string }) => w?.type === "end");
    if (endWidget && typeof endWidget === "object") {
      const endObj = (endWidget as { end?: { target?: { table?: string } } }).end;
      rawTable = endObj?.target?.table;
      if (typeof rawTable === "string" && rawTable.trim()) {
        const tableName = rawTable.trim().replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase();
        for (const schemaName of ["etl_output", "public"]) {
          const schemaClient = supabase.schema(schemaName as "public" | "etl_output") as any;
          const { error } = await schemaClient.from(tableName).select("*").limit(1);
          if (!error) return { schema: schemaName, tableName };
        }
      }
    }
  }
  return null;
}

const MAX_ROWS = 5000;

type DateLevel = "day" | "month" | "quarter" | "semester" | "year";

/** Expresión SQL para valores distintos por nivel de fecha (columna ya sanitizada, schema.table calificado). */
function dateLevelSelectExpression(
  qualifiedColumn: string,
  dateLevel: DateLevel
): string {
  const col = qualifiedColumn;
  switch (dateLevel) {
    case "year":
      return `EXTRACT(YEAR FROM ${col}::timestamp)::text`;
    case "month":
      return `TO_CHAR(${col}::timestamp, 'YYYY-MM')`;
    case "quarter":
      return `(EXTRACT(YEAR FROM ${col}::timestamp)::text || '-Q' || EXTRACT(QUARTER FROM ${col}::timestamp)::text)`;
    case "semester":
      return `(EXTRACT(YEAR FROM ${col}::timestamp)::text || '-S' || CASE WHEN EXTRACT(MONTH FROM ${col}::timestamp) <= 6 THEN '1' ELSE '2' END)`;
    case "day":
    default:
      return `(${col}::timestamp)::date::text`;
  }
}

/**
 * Lee valores distintos de una columna en etl_output vía Postgres directo.
 * Si dateLevel está presente, agrega por ese nivel (day|month|quarter|semester|year).
 */
async function fetchDistinctFromEtlOutputViaPostgres(
  tableName: string,
  column: string,
  dateLevel?: DateLevel
): Promise<{ values: string[]; error?: string }> {
  const dbUrl = process.env.SUPABASE_DB_URL;
  if (!dbUrl) return { values: [], error: "SUPABASE_DB_URL no configurado" };
  const safeTable = tableName.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase() || "table";
  const safeColumn = column.replace(/[^a-zA-Z0-9_]/g, "").toLowerCase() || "id";
  const colRef = `"${safeColumn}"`;
  const selectExpr = dateLevel
    ? dateLevelSelectExpression(colRef, dateLevel)
    : colRef;
  const sql = postgres(dbUrl);
  try {
    const rows = await sql.unsafe(
      `SELECT DISTINCT ${selectExpr} AS val FROM etl_output."${safeTable}" WHERE "${safeColumn}" IS NOT NULL AND trim("${safeColumn}"::text) != '' LIMIT ${MAX_ROWS}`
    );
    await sql.end();
    const raw = Array.isArray(rows) ? rows : [];
    const values = [...new Set(raw.map((r: any) => String(r?.val ?? "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    return { values };
  } catch (err: unknown) {
    try { await sql.end(); } catch { /* ignore */ }
    const msg = err instanceof Error ? err.message : String(err);
    return { values: [], error: msg };
  }
}

/** Valores distintos por nivel de fecha en cualquier schema.table vía Postgres. */
async function fetchDistinctViaPostgres(
  schema: string,
  tableName: string,
  column: string,
  dateLevel: DateLevel
): Promise<{ values: string[]; error?: string }> {
  const dbUrl = process.env.SUPABASE_DB_URL;
  if (!dbUrl) return { values: [], error: "SUPABASE_DB_URL no configurado" };
  const safeSchema = schema.replace(/[^a-zA-Z0-9_]/g, "").toLowerCase() || "public";
  const safeTable = tableName.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase() || "table";
  const safeColumn = column.replace(/[^a-zA-Z0-9_]/g, "").toLowerCase() || "id";
  const colRef = `"${safeColumn}"`;
  const selectExpr = dateLevelSelectExpression(colRef, dateLevel);
  const sql = postgres(dbUrl);
  try {
    const rows = await sql.unsafe(
      `SELECT DISTINCT ${selectExpr} AS val FROM "${safeSchema}"."${safeTable}" WHERE "${safeColumn}" IS NOT NULL AND trim("${safeColumn}"::text) != '' LIMIT ${MAX_ROWS}`
    );
    await sql.end();
    const raw = Array.isArray(rows) ? rows : [];
    const values = [...new Set(raw.map((r: any) => String(r?.val ?? "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    return { values };
  } catch (err: unknown) {
    try { await sql.end(); } catch { /* ignore */ }
    const msg = err instanceof Error ? err.message : String(err);
    return { values: [], error: msg };
  }
}

/**
 * GET /api/etl/[etl-id]/distinct-values?column=COLUMN_NAME
 * Devuelve valores distintos de una columna de la tabla de destino del ETL (para métricas / filtros).
 * Requiere APP_ADMIN.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ "etl-id": string }> }
): Promise<NextResponse> {
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

    const awaitedParams = await params;
    const etlId = awaitedParams["etl-id"];
    if (!etlId) {
      return NextResponse.json({ ok: false, error: "etl-id requerido" }, { status: 400 });
    }

    const url = new URL(request.url);
    const columnParam = (url.searchParams.get("column") ?? "").trim();
    const dateLevelParam = (url.searchParams.get("dateLevel") ?? "").toLowerCase().trim();
    const dateLevel: DateLevel | undefined = ["day", "month", "quarter", "semester", "year"].includes(dateLevelParam)
      ? (dateLevelParam as DateLevel)
      : undefined;
    // Quitar prefijo tipo "schema." o "tablename." si vino calificado
    const columnRaw = columnParam.replace(/^[a-zA-Z0-9_]+\./, "").replace(/[^a-zA-Z0-9_]/g, "");
    if (!columnRaw) {
      return NextResponse.json({ ok: false, error: "Parámetro column requerido" }, { status: 400 });
    }
    // En PostgreSQL los identificadores sin comillas son en minúsculas; PostgREST usa el nombre tal cual
    const column = columnRaw.toLowerCase();

    const resolved = await resolveEtlTable(supabase, etlId);
    if (!resolved) {
      return NextResponse.json({ ok: false, error: "No se encontró tabla de destino para este ETL" }, { status: 404 });
    }

    let values: string[];

    // El esquema etl_output suele no tener permisos vía API Supabase (permission denied).
    // Usamos la misma vía que la previsualización del dataset: Postgres directo con SUPABASE_DB_URL.
    if (resolved.schema === "etl_output" && process.env.SUPABASE_DB_URL) {
      const result = await fetchDistinctFromEtlOutputViaPostgres(resolved.tableName, column, dateLevel);
      if (result.error) {
        return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
      }
      values = result.values;
    } else if (dateLevel && process.env.SUPABASE_DB_URL) {
      // Con dateLevel usamos Postgres para poder aplicar la expresión de agregación
      const result = await fetchDistinctViaPostgres(resolved.schema, resolved.tableName, column, dateLevel);
      if (result.error) {
        return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
      }
      values = result.values;
    } else {
      if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
        return NextResponse.json(
          { ok: false, error: "Servidor sin SUPABASE_SERVICE_ROLE_KEY. Configurá la variable para leer tablas del ETL." },
          { status: 503 }
        );
      }
      const schemaClient = createServiceRoleClient().schema(resolved.schema as "public" | "etl_output") as any;
      const { data: rows, error } = await schemaClient
        .from(resolved.tableName)
        .select(column)
        .limit(MAX_ROWS);

      if (error) {
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      }

      const raw = (rows ?? []) as Record<string, unknown>[];
      values = [...new Set(raw.map((r) => r[column]).filter((v) => v != null && v !== "").map((v) => String(v)))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    }

    return NextResponse.json({
      ok: true,
      values,
      count: values.length,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error al obtener valores";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
