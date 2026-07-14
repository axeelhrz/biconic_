import type { AppDbClient } from "@/lib/supabase/db-client";
import { shouldUseOwnBackend } from "@/lib/api/backend-config";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { expandColumnDisplayMap, type ColumnDisplayEntry } from "@/lib/etl/column-display-keys";

export type ResolvedEtlTable = {
  schema: string;
  tableName: string;
  created_at: string | null;
  sampleData: Record<string, unknown>[];
  rowCount: number;
};

export async function resolveEtlToTableAndFields(
  supabase: AppDbClient,
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
  const schemaClient = supabase.schema(schema as "public" | "etl_output");
  const countRes = await schemaClient
    .from(tableName)
    .select("*", { count: "exact", head: true });
  let rowCount = countRes.count ?? 0;
  let sampleData: Record<string, unknown>[] = [];
  if (rowCount > 0) {
    const { data } = await schemaClient.from(tableName).select("*").limit(1);
    sampleData = (data as Record<string, unknown>[]) || [];
  }

  if (rowCount === 0 && shouldUseOwnBackend()) {
    const { data: etlRow } = await supabase
      .from("etl")
      .select("output_table")
      .eq("id", etlId)
      .maybeSingle();
    const outputTable = (etlRow as { output_table?: string | null } | null)?.output_table?.trim();
    if (outputTable) {
      const admin = createServiceRoleClient();
      if (admin._sql) {
        const safeTable = outputTable.replace(/"/g, '""');
        const countRows = await admin._sql.unsafe<{ c: number }[]>(
          `SELECT COUNT(*)::int AS c FROM etl_output."${safeTable}"`
        );
        rowCount = Number(countRows[0]?.c ?? 0);
        if (rowCount > 0) {
          const sampleRows = await admin._sql.unsafe<Record<string, unknown>[]>(
            `SELECT * FROM etl_output."${safeTable}" LIMIT 1`
          );
          sampleData = sampleRows ?? [];
        }
        if (rowCount > 0) {
          return {
            schema: "etl_output",
            tableName: outputTable,
            created_at: latestRun.completed_at ?? null,
            sampleData,
            rowCount,
          };
        }
      }
    }
  }

  if (rowCount > 0 && sampleData.length === 0 && shouldUseOwnBackend()) {
    const admin = createServiceRoleClient();
    if (admin._sql) {
      const safeSchema = schema.replace(/"/g, '""');
      const safeTable = String(tableName).replace(/"/g, '""');
      const sampleRows = await admin._sql.unsafe<Record<string, unknown>[]>(
        `SELECT * FROM "${safeSchema}"."${safeTable}" LIMIT 1`
      );
      sampleData = sampleRows ?? [];
    }
  }

  if (rowCount === 0) return null;
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
): Record<string, ColumnDisplayEntry> | undefined {
  if (!layout || typeof layout !== "object") return undefined;
  const guided = (layout as { guided_config?: unknown }).guided_config;
  if (!guided || typeof guided !== "object") return undefined;
  const filter = (guided as { filter?: unknown }).filter;
  if (!filter || typeof filter !== "object") return undefined;
  const columnDisplay = (filter as { columnDisplay?: unknown }).columnDisplay;
  if (!columnDisplay || typeof columnDisplay !== "object") return undefined;
  return expandColumnDisplayMap(columnDisplay as Record<string, ColumnDisplayEntry>);
}
