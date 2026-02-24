import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";

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
  if (countError) return null;
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

    let fields = deriveFieldsFromSample(resolved.sampleData);
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
    const limitRows = sampleRows > 0 ? sampleRows : Math.max(1, 500);

    try {
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
    } catch {
      if (sampleRows > 0) {
        try {
          const schemaClient = supabase.schema(schemaName) as any;
          const { data: rows } = await schemaClient.from(tableName).select("*").limit(sampleRows);
          rawRows = rows ?? [];
        } catch {
          rawRows = resolved.sampleData;
        }
      }
    }

    // Normalizar claves de rawRows para que coincidan con fields.all (ej. primary_RAZONSOCIAL -> primary.RAZONSOCIAL) y la UI muestre los valores
    const columnsFromConfig = (resolved as any).columnsFromConfig as string[] | undefined;
    if (columnsFromConfig?.length && rawRows.length > 0 && fields.all.length > 0) {
      const keyVariants = (col: string) => {
        const withUnderscore = col.replace(/\./g, "_");
        return [col, withUnderscore, withUnderscore.toLowerCase(), withUnderscore.toUpperCase()];
      };
      rawRows = rawRows.map((row: Record<string, unknown>) => {
        const out: Record<string, unknown> = {};
        for (const col of fields.all) {
          let val: unknown = undefined;
          for (const key of keyVariants(col)) {
            if (row[key] !== undefined) { val = row[key]; break; }
          }
          if (val === undefined && typeof row === "object" && row !== null) {
            for (const k of Object.keys(row)) {
              if (k.replace(/\./g, "_").toLowerCase() === col.replace(/\./g, "_").toLowerCase()) { val = (row as any)[k]; break; }
            }
          }
          out[col] = val ?? (row as any)[col];
        }
        return out;
      });
    }

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
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error al obtener datos del ETL";
    console.error("[metrics-data]", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
