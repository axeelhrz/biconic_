import type { AppDbClient } from "@/lib/supabase/db-client";
import { resolveEtlToTableAndFields } from "@/lib/dashboard/resolveEtlToTable";

export type ResolvedDatasetTable = {
  datasetId: string;
  etlId: string;
  name: string | null;
  config: Record<string, unknown>;
  schema: string;
  tableName: string;
  rowCount: number;
};

export async function resolveDatasetById(
  supabase: AppDbClient,
  datasetId: string
): Promise<ResolvedDatasetTable | null> {
  const { data: row, error } = await supabase
    .from("dataset")
    .select("id, etl_id, name, config")
    .eq("id", datasetId)
    .maybeSingle();

  if (error || !row) return null;

  const etlId = String((row as { etl_id?: string }).etl_id ?? "");
  if (!etlId) return null;

  const resolved = await resolveEtlToTableAndFields(supabase, etlId);
  if (!resolved) return null;

  const config =
    (row as { config?: unknown }).config && typeof (row as { config?: unknown }).config === "object"
      ? ((row as { config: Record<string, unknown> }).config as Record<string, unknown>)
      : {};

  return {
    datasetId: String((row as { id: string }).id),
    etlId,
    name: (row as { name?: string | null }).name ?? null,
    config,
    schema: resolved.schema,
    tableName: resolved.tableName,
    rowCount: resolved.rowCount,
  };
}
