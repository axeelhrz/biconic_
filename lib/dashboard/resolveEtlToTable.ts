import type { SupabaseClient } from "@supabase/supabase-js";

export type ResolvedEtlTable = {
  schema: string;
  tableName: string;
  created_at: string | null;
  sampleData: Record<string, unknown>[];
  rowCount: number;
};

export async function resolveEtlToTableAndFields(
  supabase: SupabaseClient,
  etlId: string
): Promise<ResolvedEtlTable | null> {
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
    const legacyData = Array.isArray((legacy as { data?: unknown[] }).data)
      ? (legacy as { data: unknown[] }).data
      : [];
    if (legacyData.length === 0) return null;
    return {
      schema: "public",
      tableName: "etl_data_warehouse",
      created_at: (legacy as { created_at?: string }).created_at ?? null,
      sampleData: (legacyData.slice(0, 1) as Record<string, unknown>[]) ?? [],
      rowCount: legacyData.length,
    };
  }

  const schema = latestRun.destination_schema || "etl_output";
  const tableName = latestRun.destination_table_name;
  const schemaClient = supabase.schema(schema as "public" | "etl_output") as ReturnType<
    SupabaseClient["schema"]
  >;
  const { count } = await schemaClient
    .from(tableName)
    .select("*", { count: "exact", head: true });
  const rowCount = count ?? 0;
  let sampleData: Record<string, unknown>[] = [];
  if (rowCount > 0) {
    const { data } = await schemaClient.from(tableName).select("*").limit(1);
    sampleData = (data as Record<string, unknown>[]) || [];
  }
  return {
    schema,
    tableName,
    created_at: latestRun.completed_at ?? null,
    sampleData,
    rowCount,
  };
}

export function extractColumnDisplayFromEtlLayout(
  layout: unknown
): Record<string, { type?: string; label?: string }> | undefined {
  if (!layout || typeof layout !== "object") return undefined;
  const guided = (layout as { guided_config?: unknown }).guided_config;
  if (!guided || typeof guided !== "object") return undefined;
  const filter = (guided as { filter?: unknown }).filter;
  if (!filter || typeof filter !== "object") return undefined;
  const columnDisplay = (filter as { columnDisplay?: unknown }).columnDisplay;
  if (!columnDisplay || typeof columnDisplay !== "object") return undefined;
  return columnDisplay as Record<string, { type?: string; label?: string }>;
}
