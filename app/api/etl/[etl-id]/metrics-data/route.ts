import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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
  const dateFields = availableFields.filter((field) => {
    let nonNull = 0, dateCount = 0;
    for (const row of sampleData) {
      const v = (row as any)[field];
      if (v === null || v === undefined) continue;
      nonNull++;
      if (typeof v === "string" && !isNaN(Date.parse(v))) dateCount++;
    }
    return nonNull > 0 && dateCount / nonNull >= 0.6;
  });
  return { all: availableFields, numeric: numericFields, string: stringFields, date: dateFields };
}

async function resolveEtlToTableAndFields(
  supabase: Awaited<ReturnType<typeof createClient>>,
  etlId: string
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
  const schemaClient = supabase.schema(schema as "public" | "etl_output") as any;
  const { count, error: countError } = await schemaClient
    .from(tableName)
    .select("*", { count: "exact", head: true });
  if (countError) return null;
  const rowCount = count ?? 0;
  let sampleData: any[] = [];
  if (rowCount > 0) {
    const { data } = await schemaClient.from(tableName).select("*").limit(1);
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
  layout: Record<string, unknown> | null
): Promise<{
  schema: string;
  tableName: string;
  created_at: string | null;
  sampleData: any[];
  rowCount: number;
  columnsFromConfig?: string[];
} | null> {
  const end = layout?.guided_config && typeof layout.guided_config === "object"
    ? (layout.guided_config as Record<string, unknown>).end as Record<string, unknown> | undefined
    : undefined;
  const target = end?.target && typeof end.target === "object"
    ? end.target as Record<string, unknown>
    : undefined;
  const rawTable = target?.table;
  if (typeof rawTable !== "string" || !rawTable.trim()) return null;
  const tableName = rawTable.trim().replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase();
  if (!tableName) return null;

  const filter = layout?.guided_config && typeof layout.guided_config === "object"
    ? (layout.guided_config as Record<string, unknown>).filter as Record<string, unknown> | undefined
    : undefined;
  const columnsFromConfig = Array.isArray(filter?.columns) ? (filter.columns as string[]) : undefined;

  for (const schemaName of ["etl_output", "public"]) {
    try {
      const schemaClient = supabase.schema(schemaName as "public" | "etl_output") as any;
      const { count, error: countErr } = await schemaClient
        .from(tableName)
        .select("*", { count: "exact", head: true });
      if (countErr) continue;
      const rowCount = count ?? 0;
      let sampleData: any[] = [];
      if (rowCount > 0) {
        const { data } = await schemaClient.from(tableName).select("*").limit(1);
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
  outputTable: string
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
      const schemaClient = supabase.schema(schemaName as "public" | "etl_output") as any;
      const { count, error: countErr } = await schemaClient
        .from(tableName)
        .select("*", { count: "exact", head: true });
      if (countErr) continue;
      const rowCount = count ?? 0;
      let sampleData: any[] = [];
      if (rowCount > 0) {
        const { data } = await schemaClient.from(tableName).select("*").limit(1);
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

    let resolved = await resolveEtlToTableAndFields(supabase, etlId);
    if (!resolved && (etlRow as { output_table?: string | null }).output_table) {
      resolved = await resolveFromOutputTable(
        supabase,
        (etlRow as { output_table: string }).output_table
      );
    }
    if (!resolved) {
      const layout = (etlRow as { layout?: Record<string, unknown> }).layout;
      resolved = await resolveFromGuidedConfig(supabase, layout ?? null);
    }

    const etlInfo = { id: etlRow.id, title: (etlRow as any).title, name: (etlRow as any).name };
    const layout = (etlRow as { layout?: { saved_metrics?: unknown[] } }).layout;
    const savedMetrics = Array.isArray(layout?.saved_metrics) ? layout.saved_metrics : [];

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
        },
      });
    }

    let fields = deriveFieldsFromSample(resolved.sampleData);
    if (fields.all.length === 0 && (resolved as any).columnsFromConfig?.length) {
      const cols = (resolved as any).columnsFromConfig as string[];
      fields = { all: cols, numeric: cols, string: cols, date: [] };
    }

    return NextResponse.json({
      ok: true,
      data: {
        etl: etlInfo,
        hasData: true,
        schema: resolved.schema,
        tableName: resolved.tableName,
        fields,
        rowCount: resolved.rowCount,
        savedMetrics,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error al obtener datos del ETL";
    console.error("[metrics-data]", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
