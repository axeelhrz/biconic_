import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import postgres from "postgres";

/** Timeout mayor para lectura vía Postgres directo (etl_output) y tablas grandes. */
export const maxDuration = 30;

type FieldsInfo = {
  all: string[];
  numeric: string[];
  string: string[];
  date: string[];
};

function deriveFieldsFromSample(sampleData: any[]): FieldsInfo {
  if (sampleData.length === 0)
    return { all: [], numeric: [], string: [], date: [] };
  const sampleRow = sampleData[0] || {};
  const availableFields = Object.keys(sampleRow);
  const isNumericLike = (v: any): boolean => {
    if (typeof v === "number") return true;
    if (typeof v !== "string") return false;
    const trimmed = String(v).trim();
    if (!trimmed) return false;
    const sanitized = trimmed
      .replace(/\s+/g, "")
      .replace(/[%$€£]/g, "")
      .replace(/\./g, "")
      .replace(/,/g, ".");
    return /^-?\d+(?:\.\d+)?$/.test(sanitized);
  };
  const numericFields = availableFields.filter((field) => {
    let nonNull = 0, numericCount = 0;
    for (const row of sampleData) {
      const val = (row as any)[field];
      if (val === null || val === undefined) continue;
      nonNull++;
      if (isNumericLike(val)) numericCount++;
    }
    return nonNull > 0 && numericCount / nonNull >= 0.6;
  });
  const stringFields = availableFields.filter((field) => {
    if (numericFields.includes(field)) return false;
    const val0 = (sampleRow as any)[field];
    if (typeof val0 === "string" && !isNumericLike(val0)) return true;
    let nonNull = 0, stringCount = 0;
    for (const row of sampleData) {
      const val = (row as any)[field];
      if (val === null || val === undefined) continue;
      nonNull++;
      if (typeof val === "string" && !isNumericLike(val)) stringCount++;
    }
    return nonNull > 0 && stringCount / nonNull >= 0.6;
  });
  const isDateLike = (v: any): boolean => {
    if (v == null) return false;
    if (v instanceof Date && !isNaN(v.getTime())) return true;
    if (typeof v === "number") {
      if (v > 1e10) return true; // timestamp ms
      if (v > 0 && v < 1e7) return true; // Excel serial (días desde 1899-12-30)
    }
    if (typeof v !== "string") return false;
    const s = String(v).trim();
    if (!s) return false;
    if (!isNaN(Date.parse(s))) return true;
    const ddmmyy = /^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/;
    const m = s.match(ddmmyy);
    if (m) {
      const d = parseInt(m[1]!, 10), M = parseInt(m[2]!, 10) - 1, y = parseInt(m[3]!, 10);
      const yr = y < 100 ? 2000 + y : y;
      const dt = new Date(yr, M, d);
      if (!isNaN(dt.getTime()) && dt.getDate() === d && dt.getMonth() === M) return true;
    }
    return false;
  };
  const dateFields = availableFields.filter((field) => {
    let nonNull = 0, dateCount = 0;
    for (const row of sampleData) {
      const v = (row as any)[field];
      if (v === null || v === undefined) continue;
      nonNull++;
      if (isDateLike(v)) dateCount++;
    }
    return nonNull > 0 && dateCount / nonNull >= 0.6;
  });
  return { all: availableFields, numeric: numericFields, string: stringFields, date: dateFields };
}

const PERIODICITY_OPTIONS = ["Diaria", "Semanal", "Mensual", "Anual", "Irregular"] as const;
type PeriodicityLabel = (typeof PERIODICITY_OPTIONS)[number];

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const EXCEL_EPOCH_MS = new Date(1899, 11, 30).getTime();

function valueToTimestamp(v: unknown): number | null {
  if (v === undefined || v === null) return null;
  if (typeof v === "number") {
    if (v > 1e10) return v;
    if (v > 1e9 && v < 1e10) return v * 1000;
    if (v > 0 && v < 1e7) return EXCEL_EPOCH_MS + v * MS_PER_DAY; // Excel serial
    return null;
  }
  if (v instanceof Date) return !isNaN(v.getTime()) ? v.getTime() : null;
  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return null;
    const parsed = Date.parse(s);
    if (!isNaN(parsed)) return parsed;
    const ddmmyy = /^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/;
    const m = s.match(ddmmyy);
    if (m) {
      const d = parseInt(m[1]!, 10), M = parseInt(m[2]!, 10) - 1, y = parseInt(m[3]!, 10);
      const yr = y < 100 ? 2000 + y : y;
      const dt = new Date(yr, M, d);
      if (!isNaN(dt.getTime())) return dt.getTime();
    }
    return null;
  }
  return null;
}

/** Infiere la periodicidad natural de una columna de fecha a partir de los intervalos entre valores únicos ordenados. */
function inferNaturalPeriodicity(
  rawRows: Record<string, unknown>[],
  dateColumn: string
): PeriodicityLabel {
  const getVal = (row: Record<string, unknown>): unknown => {
    const v = row[dateColumn];
    if (v !== undefined && v !== null) return v;
    const key = Object.keys(row).find((k) => k.toLowerCase() === dateColumn.toLowerCase());
    return key !== undefined ? row[key] : undefined;
  };
  const timestamps: number[] = [];
  for (const row of rawRows) {
    const v = getVal(row);
    const ms = valueToTimestamp(v);
    if (ms != null && Number.isFinite(ms)) timestamps.push(ms);
  }
  if (timestamps.length < 2) return "Irregular";
  const uniq = [...new Set(timestamps)].sort((a, b) => a - b);
  const diffsDays: number[] = [];
  for (let i = 1; i < uniq.length; i++) {
    diffsDays.push((uniq[i] - uniq[i - 1]) / MS_PER_DAY);
  }
  if (diffsDays.length === 0) return "Irregular";
  const median = (arr: number[]) => {
    const s = [...arr].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
  };
  const med = median(diffsDays);
  if (med >= 250 && med <= 400) return "Anual";
  if (med >= 20 && med <= 45) return "Mensual";
  if (med >= 3 && med <= 14) return "Semanal";
  if (med >= 0.25 && med <= 2.5) return "Diaria";
  return "Irregular";
}

/** Calcula periodicidad inferida para cada columna de tipo fecha. */
function computeDateColumnPeriodicity(
  rawRows: Record<string, unknown>[],
  dateColumns: string[]
): Record<string, PeriodicityLabel> {
  const out: Record<string, PeriodicityLabel> = {};
  for (const col of dateColumns) {
    out[col] = inferNaturalPeriodicity(rawRows, col);
  }
  return out;
}

/** Tipos de PostgreSQL que se consideran fecha, número o texto para clasificación. */
const PG_DATE_TYPES = new Set([
  "date", "timestamp", "timestamp with time zone", "timestamp without time zone",
  "timestamptz", "timetz", "time", "time with time zone", "time without time zone",
]);
const PG_NUMERIC_TYPES = new Set([
  "smallint", "integer", "bigint", "numeric", "decimal", "real", "double precision",
  "float4", "float8", "serial", "bigserial",
]);

/** Obtiene tipos de columnas desde information_schema (Postgres). Si falla, devuelve null. */
async function fetchColumnTypesFromSchema(
  schemaName: string,
  tableName: string
): Promise<FieldsInfo | null> {
  const dbUrl = process.env.SUPABASE_DB_URL;
  if (!dbUrl) return null;
  const safeSchema = schemaName === "etl_output" ? "etl_output" : "public";
  const safeTable = tableName.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase() || "table";
  const sql = postgres(dbUrl);
  try {
    const rows = await sql.unsafe(
      `SELECT column_name, data_type, udt_name
       FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = $2
       ORDER BY ordinal_position`,
      [safeSchema, safeTable]
    );
    await sql.end();
    if (!Array.isArray(rows) || rows.length === 0) return null;
    const all = rows.map((r: any) => String(r.column_name ?? ""));
    const dataTypeMap = new Map<string, string>();
    rows.forEach((r: any) => {
      const col = String(r.column_name ?? "");
      const dt = String((r.data_type ?? r.udt_name ?? "")).toLowerCase();
      dataTypeMap.set(col, dt);
    });
    const date: string[] = [];
    const numeric: string[] = [];
    const string: string[] = [];
    for (const col of all) {
      const dt = dataTypeMap.get(col) ?? "";
      if (PG_DATE_TYPES.has(dt)) date.push(col);
      else if (PG_NUMERIC_TYPES.has(dt)) numeric.push(col);
      else string.push(col);
    }
    return { all, numeric, string, date };
  } catch {
    try { await sql.end(); } catch { /* ignore */ }
    return null;
  }
}

/** Lee count y filas de etl_output vía Postgres directo (el esquema suele no estar expuesto en la API Supabase). */
async function fetchFromEtlOutputViaPostgres(
  tableName: string,
  limit: number
): Promise<{ rowCount: number; rows: any[] }> {
  const dbUrl = process.env.SUPABASE_DB_URL;
  if (!dbUrl) return { rowCount: 0, rows: [] };
  const safeTable = tableName.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase() || "table";
  const sql = postgres(dbUrl);
  try {
    const countRes = await sql.unsafe(
      `SELECT count(*)::int AS c FROM etl_output."${safeTable}"`
    );
    const rowCount = Array.isArray(countRes) && countRes[0]?.c != null ? Number(countRes[0].c) : 0;
    if (rowCount === 0) return { rowCount: 0, rows: [] };
    const rowsRes = await sql.unsafe(
      `SELECT * FROM etl_output."${safeTable}" LIMIT ${Math.min(200, Math.max(1, limit))}`
    );
    const rows = Array.isArray(rowsRes) ? rowsRes : [];
    return { rowCount, rows };
  } catch {
    return { rowCount: 0, rows: [] };
  } finally {
    await sql.end();
  }
}

async function resolveEtlToTableAndFields(
  supabase: Awaited<ReturnType<typeof createClient>>,
  etlId: string,
  tableReader: Awaited<ReturnType<typeof createClient>> | Awaited<ReturnType<typeof createServiceRoleClient>> | null
): Promise<{
  schema: string;
  tableName: string;
  created_at: string | null;
  sampleData: any[];
  rowCount: number;
} | null> {
  const { data: latestRun } = await supabase
    .from("etl_runs_log")
    .select("destination_schema,destination_table_name,completed_at")
    .eq("etl_id", etlId)
    .eq("status", "completed")
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!latestRun?.destination_table_name) {
    const { data: legacy } = await supabase
      .from("etl_data_warehouse")
      .select("*")
      .eq("etl_id", etlId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!legacy) return null;
    const legacyData = Array.isArray((legacy as any).data) ? (legacy as any).data : [];
    if (legacyData.length === 0) return null;
    return {
      schema: "public",
      tableName: "etl_data_warehouse",
      created_at: legacy.created_at ?? null,
      sampleData: legacyData.slice(0, 1),
      rowCount: legacyData.length,
    };
  }

  const schema = latestRun.destination_schema || "etl_output";
  const tableName = latestRun.destination_table_name;
  const client = (schema === "etl_output" && tableReader) ? tableReader : supabase;
  const schemaClient = client.schema(schema as "public" | "etl_output") as any;
  const { count, error: countError } = await schemaClient
    .from(tableName)
    .select("*", { count: "exact", head: true });
  // Si el esquema es etl_output, la API de Supabase suele no exponerlo: no devolver null;
  // el GET usará fetchFromEtlOutputViaPostgres para leer los datos.
  if (countError && schema !== "etl_output") return null;
  const rowCount = count ?? 0;
  let sampleData: any[] = [];
  if (rowCount > 0) {
    const { data } = await schemaClient.from(tableName).select("*").limit(500);
    sampleData = data || [];
  }
  return {
    schema,
    tableName,
    created_at: latestRun.completed_at ?? null,
    sampleData,
    rowCount,
  };
}

/** Usa la tabla configurada en layout.guided_config.end.target.table */
async function resolveFromGuidedConfig(
  supabase: Awaited<ReturnType<typeof createClient>>,
  layout: Record<string, unknown> | null,
  tableReader: Awaited<ReturnType<typeof createClient>> | Awaited<ReturnType<typeof createServiceRoleClient>> | null
): Promise<{
  schema: string;
  tableName: string;
  created_at: string | null;
  sampleData: any[];
  rowCount: number;
  columnsFromConfig?: string[];
} | null> {
  const guided = layout?.guided_config && typeof layout.guided_config === "object" ? layout.guided_config as Record<string, unknown> : undefined;
  const end = guided?.end && typeof guided.end === "object" ? guided.end as Record<string, unknown> : undefined;
  const target = end?.target && typeof end.target === "object" ? end.target as Record<string, unknown> : undefined;
  const rawTable = target?.table;
  if (typeof rawTable !== "string" || !rawTable.trim()) return null;
  const tableName = rawTable.trim().replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase();
  if (!tableName) return null;

  const filter = guided?.filter && typeof guided.filter === "object" ? guided.filter as Record<string, unknown> : undefined;
  const columnsFromConfig = Array.isArray(filter?.columns) ? (filter.columns as string[]) : undefined;

  for (const schemaName of ["etl_output", "public"]) {
    try {
      const client = (schemaName === "etl_output" && tableReader) ? tableReader : supabase;
      const schemaClient = client.schema(schemaName as "public" | "etl_output") as any;
      const { count, error: countErr } = await schemaClient
        .from(tableName)
        .select("*", { count: "exact", head: true });
      if (countErr) continue;
      const rowCount = count ?? 0;
      let sampleData: any[] = [];
      if (rowCount > 0) {
        const { data } = await schemaClient.from(tableName).select("*").limit(500);
        sampleData = data || [];
      }
      return {
        schema: schemaName,
        tableName,
        created_at: null,
        sampleData,
        rowCount,
        columnsFromConfig: columnsFromConfig && columnsFromConfig.length > 0 ? columnsFromConfig : undefined,
      };
    } catch {
      continue;
    }
  }
  return null;
}

/** Usa etl.output_table (tabla real creada en la última ejecución exitosa) */
async function resolveFromOutputTable(
  supabase: Awaited<ReturnType<typeof createClient>>,
  outputTable: string,
  tableReader: Awaited<ReturnType<typeof createClient>> | Awaited<ReturnType<typeof createServiceRoleClient>> | null
): Promise<{
  schema: string;
  tableName: string;
  created_at: string | null;
  sampleData: any[];
  rowCount: number;
} | null> {
  const tableName = outputTable.trim().replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase();
  if (!tableName) return null;
  for (const schemaName of ["etl_output", "public"]) {
    try {
      const client = (schemaName === "etl_output" && tableReader) ? tableReader : supabase;
      const schemaClient = client.schema(schemaName as "public" | "etl_output") as any;
      const { count, error: countErr } = await schemaClient
        .from(tableName)
        .select("*", { count: "exact", head: true });
      if (countErr) continue;
      const rowCount = count ?? 0;
      let sampleData: any[] = [];
      if (rowCount > 0) {
        const { data } = await schemaClient.from(tableName).select("*").limit(500);
        sampleData = data || [];
      }
      return {
        schema: schemaName,
        tableName,
        created_at: null,
        sampleData,
        rowCount,
      };
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * GET /api/etl/[etl-id]/metrics-data
 * Devuelve datos del ETL (tabla, columnas, fields) para la pantalla de creación de métricas.
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

    const { data: etlRow, error: etlError } = await supabase
      .from("etl")
      .select("id, title, name, layout, output_table")
      .eq("id", etlId)
      .maybeSingle();

    if (etlError || !etlRow) {
      return NextResponse.json({ ok: false, error: "ETL no encontrado" }, { status: 404 });
    }

    let serviceClient: Awaited<ReturnType<typeof createServiceRoleClient>> | null = null;
    try {
      if (process.env.SUPABASE_SERVICE_ROLE_KEY) serviceClient = createServiceRoleClient();
    } catch (_) {
      // En Vercel/edge puede fallar si la key no está disponible
    }
    const tableReader = serviceClient;

    let resolved = await resolveEtlToTableAndFields(supabase, etlId, tableReader);
    if (!resolved && (etlRow as { output_table?: string | null }).output_table) {
      resolved = await resolveFromOutputTable(
        supabase,
        (etlRow as { output_table: string }).output_table,
        tableReader
      );
    }
    if (!resolved) {
      const layout = (etlRow as { layout?: Record<string, unknown> }).layout;
      resolved = await resolveFromGuidedConfig(supabase, layout ?? null, tableReader);
    }

    const etlInfo = { id: etlRow.id, title: (etlRow as any).title, name: (etlRow as any).name };
    const layout = (etlRow as { layout?: { saved_metrics?: unknown[]; guided_config?: Record<string, unknown> } }).layout;
    const savedMetrics = Array.isArray(layout?.saved_metrics) ? layout.saved_metrics : [];
    // Columnas elegidas en el ETL (Columnas a incluir): usar siempre para que Profiling muestre lo mismo que el ETL
    const guided = layout?.guided_config && typeof layout.guided_config === "object" ? layout.guided_config : undefined;
    const filterConfig = guided?.filter && typeof guided.filter === "object" ? (guided.filter as Record<string, unknown>) : undefined;
    const columnsFromLayout = Array.isArray(filterConfig?.columns) && (filterConfig!.columns as string[]).length > 0
      ? (filterConfig!.columns as string[])
      : undefined;
    const selectedColumns = columnsFromLayout ?? (resolved as { columnsFromConfig?: string[] }).columnsFromConfig;

    if (!resolved) {
      return NextResponse.json({
        ok: true,
        data: {
          etl: etlInfo,
          hasData: false,
          schema: null,
          tableName: null,
          fields: { all: [], numeric: [], string: [], date: [] },
          rowCount: 0,
          savedMetrics,
          rawRows: [],
        },
      });
    }

    // Si aun así hay 0 filas (p. ej. service role no disponible en edge), reconsultar con service role por las dudas
    if (resolved.rowCount === 0 && serviceClient) {
      try {
        const schemaForRepair = resolved.schema as "public" | "etl_output";
        const schemaClientRepair = serviceClient.schema(schemaForRepair) as any;
        const { count, error: countErr } = await schemaClientRepair
          .from(resolved.tableName)
          .select("*", { count: "exact", head: true });
        if (!countErr && count != null && count > 0) {
          resolved.rowCount = count;
          const { data } = await schemaClientRepair.from(resolved.tableName).select("*").limit(500);
          resolved.sampleData = data ?? [];
        }
      } catch {
        // Mantener resolved como está
      }
    }

    // etl_output suele no estar expuesto en la API de Supabase: leer vía Postgres directo si seguimos con 0 filas
    if (resolved.schema === "etl_output" && (resolved.rowCount === 0 || resolved.sampleData.length === 0)) {
      const pgResult = await fetchFromEtlOutputViaPostgres(resolved.tableName, 200);
      if (pgResult.rowCount > 0 || pgResult.rows.length > 0) {
        resolved.rowCount = pgResult.rowCount;
        resolved.sampleData = pgResult.rows;
      }
    }

    const schemaTypes = await fetchColumnTypesFromSchema(resolved.schema, resolved.tableName);
    let fields: FieldsInfo =
      schemaTypes && schemaTypes.all.length > 0
        ? schemaTypes
        : deriveFieldsFromSample(resolved.sampleData);
    if (fields.all.length === 0 && (resolved as any).columnsFromConfig?.length) {
      const cols = (resolved as any).columnsFromConfig as string[];
      fields = { all: cols, numeric: cols, string: cols, date: [] };
    }

    const url = new URL(request.url);
    const sampleRows = Math.min(500, Math.max(0, parseInt(url.searchParams.get("sampleRows") ?? "0", 10) || 0));
    let rawRows: any[] = resolved.sampleData;
    let rowCount = resolved.rowCount;

    const schemaName = resolved.schema as "public" | "etl_output";
    const tableName = resolved.tableName;
    const limitRows = sampleRows > 0 ? Math.min(200, sampleRows) : 200;

    try {
      if (schemaName === "etl_output") {
        const pgResult = await fetchFromEtlOutputViaPostgres(tableName, limitRows);
        rowCount = pgResult.rowCount;
        if (pgResult.rows.length > 0) {
          rawRows = pgResult.rows;
          if (fields.all.length === 0) {
            const derived = deriveFieldsFromSample(pgResult.rows.slice(0, 1));
            if (derived.all.length > 0) fields = derived;
          }
        }
      } else {
        const clientToUse = serviceClient ?? supabase;
        const schemaClient = clientToUse.schema(schemaName) as any;
        const { count: realCount, error: countError } = await schemaClient
          .from(tableName)
          .select("*", { count: "exact", head: true });
        if (!countError && realCount != null) rowCount = realCount;

        const { data: rows } = await schemaClient
          .from(tableName)
          .select("*")
          .limit(limitRows);
        const fetchedRows = rows ?? [];
        if (fetchedRows.length > 0) {
          rawRows = fetchedRows;
          if (fields.all.length === 0) {
            const derived = deriveFieldsFromSample(fetchedRows.slice(0, 1));
            if (derived.all.length > 0) fields = derived;
          }
        }
      }
    } catch {
      if (schemaName === "etl_output") {
        const pgResult = await fetchFromEtlOutputViaPostgres(tableName, limitRows);
        if (pgResult.rows.length > 0) {
          rawRows = pgResult.rows;
          rowCount = pgResult.rowCount;
        } else {
          rawRows = resolved.sampleData;
        }
      } else if (sampleRows > 0) {
        try {
          const schemaClient = supabase.schema(schemaName) as any;
          const { data: rows } = await schemaClient.from(tableName).select("*").limit(sampleRows);
          rawRows = rows ?? [];
        } catch {
          rawRows = resolved.sampleData;
        }
      }
    }

    const normalizeKey = (s: string) => String(s).replace(/\./g, "_").replace(/\s+/g, "_").toLowerCase().trim();
    const keyVariants = (col: string) => {
      const withUnderscore = col.replace(/\./g, "_");
      return [col, withUnderscore, withUnderscore.toLowerCase(), withUnderscore.toUpperCase()];
    };
    const pickFromRow = (row: Record<string, unknown>, cols: string[]): Record<string, unknown> => {
      const out: Record<string, unknown> = {};
      const rowKeys = typeof row === "object" && row !== null ? Object.keys(row) : [];
      for (const col of cols) {
        let val: unknown = undefined;
        for (const key of keyVariants(col)) {
          if (row[key] !== undefined && row[key] !== null) { val = row[key]; break; }
        }
        if (val === undefined && rowKeys.length > 0) {
          const colNorm = normalizeKey(col);
          for (const k of rowKeys) {
            if (normalizeKey(k) === colNorm) { val = (row as any)[k]; break; }
          }
        }
        if (val === undefined) val = (row as any)[col];
        // Usar null en lugar de undefined para que la clave se envíe en JSON y la UI muestre algo
        out[col] = val !== undefined && val !== null ? val : null;
      }
      return out;
    };

    // Restringir a las columnas elegidas en el ETL (Columnas a incluir) para que Profiling muestre lo mismo que la previsualización del ETL
    const sameStr = (a: string, b: string) => a.toLowerCase().trim() === b.toLowerCase().trim();
    if (selectedColumns && selectedColumns.length > 0 && rawRows.length > 0) {
      rawRows = rawRows.map((row: Record<string, unknown>) => pickFromRow(row, selectedColumns));
      if (schemaTypes && schemaTypes.all.length > 0) {
        fields = {
          all: selectedColumns,
          date: selectedColumns.filter((c) => schemaTypes!.date.some((d) => sameStr(d, c))),
          numeric: selectedColumns.filter((c) => schemaTypes!.numeric.some((n) => sameStr(n, c))),
          string: selectedColumns.filter((c) => schemaTypes!.string.some((s) => sameStr(s, c))),
        };
      } else {
        fields = deriveFieldsFromSample(rawRows);
      }
      if (fields.all.length === 0) fields = { all: selectedColumns, numeric: selectedColumns, string: selectedColumns, date: [] };
    } else {
      const columnsFromConfig = (resolved as any).columnsFromConfig as string[] | undefined;
      if (columnsFromConfig?.length && rawRows.length > 0 && fields.all.length > 0) {
        rawRows = rawRows.map((row: Record<string, unknown>) => pickFromRow(row, fields.all));
      }
    }

    // Siempre normalizar claves de rawRows a fields.all para que la UI muestre valores (p. ej. Postgres devuelve minúsculas y fields puede ser mayúsculas)
    if (fields.all.length > 0 && rawRows.length > 0) {
      rawRows = rawRows.map((row: Record<string, unknown>) => pickFromRow(row, fields.all));
    }

    const columnDisplay =
      filterConfig && typeof (filterConfig as { columnDisplay?: unknown }).columnDisplay === "object"
        ? (filterConfig as { columnDisplay: Record<string, { label?: string; format?: string; type?: string }> }).columnDisplay
        : undefined;

    // Incluir en fields.date todas las columnas marcadas como Fecha en el ETL (columnDisplay[].type)
    if (columnDisplay && fields.all.length > 0) {
      const dateFromConfig = fields.all.filter((col) => {
        const key = Object.keys(columnDisplay).find((k) => sameStr(k, col));
        const t = key ? (columnDisplay as Record<string, { type?: string }>)[key]?.type : undefined;
        return String(t).toLowerCase() === "fecha";
      });
      const existingDateSet = new Set(fields.date.map((d) => d.toLowerCase()));
      for (const col of dateFromConfig) {
        if (!existingDateSet.has(col.toLowerCase())) {
          fields.date.push(col);
          existingDateSet.add(col.toLowerCase());
        }
      }
      // Ordenar fields.date según el orden en fields.all
      fields.date = fields.all.filter((col) => fields.date.some((d) => sameStr(d, col)));
    }

    const dateColumnPeriodicity =
      fields.date.length > 0 && rawRows.length > 0
        ? computeDateColumnPeriodicity(rawRows, fields.date)
        : undefined;

    return NextResponse.json({
      ok: true,
      data: {
        etl: etlInfo,
        hasData: true,
        schema: resolved.schema,
        tableName: resolved.tableName,
        fields,
        rowCount,
        savedMetrics,
        rawRows,
        dateColumnPeriodicity,
        columnDisplay,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error al obtener datos del ETL";
    console.error("[metrics-data]", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
