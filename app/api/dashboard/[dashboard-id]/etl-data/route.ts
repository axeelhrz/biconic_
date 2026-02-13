// src/app/api/dashboard/[dashboard-id]/etl-data/route.ts
// Soporta múltiples fuentes de datos (ETLs) por dashboard: ventas, clientes, productos, etc.

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
  const { count } = await supabase
    .schema(schema as "public" | "etl_output")
    .from(tableName)
    .select("*", { count: "exact", head: true });
  const rowCount = count ?? 0;
  let sampleData: any[] = [];
  if (rowCount > 0) {
    const { data } = await supabase
      .schema(schema as "public" | "etl_output")
      .from(tableName)
      .select("*")
      .limit(1);
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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ "dashboard-id": string }> }
): Promise<NextResponse> {
  const startTime = Date.now();
  let dashboardId: string | undefined;

  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });
    }

    const awaitedParams = await params;
    dashboardId = awaitedParams["dashboard-id"];

    const { data: dashboard, error: dashboardError } = await supabase
      .from("dashboard")
      .select("*, etl:etl_id (id, title, name)")
      .eq("id", dashboardId)
      .maybeSingle();

    if (dashboardError || !dashboard) {
      return NextResponse.json({ ok: false, error: "Dashboard no encontrado" }, { status: 404 });
    }

    let sourceRows: { id: string; etl_id: string; alias: string; sort_order: number }[] = [];
    const { data: sources } = await supabase
      .from("dashboard_data_sources")
      .select("id, etl_id, alias, sort_order")
      .eq("dashboard_id", dashboardId)
      .order("sort_order", { ascending: true });

    if (sources && sources.length > 0) {
      sourceRows = sources as any[];
    } else if (dashboard.etl_id) {
      sourceRows = [{ id: "primary", etl_id: dashboard.etl_id, alias: "Principal", sort_order: 0 }];
    }

    if (sourceRows.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Dashboard no tiene fuentes de datos (ETL) asociadas" },
        { status: 400 }
      );
    }

    const dataSources: {
      id: string;
      etlId: string;
      alias: string;
      etlName: string;
      schema: string;
      tableName: string;
      rowCount: number;
      fields: FieldsInfo;
    }[] = [];
    let firstEtl: { id: string; title: string; name: string } | null = null;
    let firstEtlData: { name: string; rowCount: number; created_at: string | null } | null = null;
    let firstFields: FieldsInfo | null = null;

    for (const row of sourceRows) {
      const resolved = await resolveEtlToTableAndFields(supabase, row.etl_id);
      if (!resolved || resolved.sampleData.length === 0) continue;

      const { data: etlRow } = await supabase
        .from("etl")
        .select("id, title, name")
        .eq("id", row.etl_id)
        .maybeSingle();

      const etlName = (etlRow as any)?.title || (etlRow as any)?.name || row.alias;
      const fields = deriveFieldsFromSample(resolved.sampleData);

      dataSources.push({
        id: row.id,
        etlId: row.etl_id,
        alias: row.alias,
        etlName,
        schema: resolved.schema,
        tableName: resolved.tableName,
        rowCount: resolved.rowCount,
        fields,
      });

      if (!firstEtl) {
        firstEtl = etlRow as any;
        firstEtlData = {
          name: resolved.schema && resolved.tableName ? `${resolved.schema}.${resolved.tableName}` : resolved.tableName,
          rowCount: resolved.rowCount,
          created_at: resolved.created_at,
        };
        firstFields = fields;
      }
    }

    if (dataSources.length === 0) {
      return NextResponse.json(
        { ok: false, error: "No se encontraron datos en ninguna fuente del ETL" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      data: {
        dashboard,
        dataSources,
        primarySourceId: dataSources[0]?.id ?? null,
        etl: firstEtl,
        etlData: firstEtlData ? { id: 0, name: firstEtlData.name, created_at: firstEtlData.created_at || new Date().toISOString(), dataArray: [], rowCount: firstEtlData.rowCount } : null,
        fields: firstFields ?? { all: [], numeric: [], string: [], date: [] },
      },
    });
  } catch (error: any) {
    console.error("[etl-data] Error:", error.message);
    return NextResponse.json(
      { ok: false, error: error.message || "Error interno del servidor" },
      { status: 500 }
    );
  }
}
