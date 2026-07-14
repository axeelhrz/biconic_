import type { GeoCacheClient } from "@/lib/geo/geo-enrichment";
import { createServiceRoleClient } from "@/lib/supabase/service";
import postgres, { type ParameterOrJSON } from "postgres";
import type { AggregateDataDeps } from "@/lib/dashboard/aggregateDataHandler";
import { getInternalDbUrl } from "@/lib/db/internal-db-url";

function toSqlParams(vals: unknown[]): ParameterOrJSON<never>[] {
  return vals as ParameterOrJSON<never>[];
}

export function createAggregateDataDeps(options: {
  userId?: string | null;
  requireAuth?: boolean;
  databaseUrl?: string;
  geoCacheClient?: GeoCacheClient | null;
}): AggregateDataDeps {
  const databaseUrl = options.databaseUrl ?? getInternalDbUrl();
  return createPgAggregateDataDeps({
    userId: options.userId,
    requireAuth: options.requireAuth,
    databaseUrl,
    geoCacheClient:
      options.geoCacheClient ??
      (createServiceRoleClient() as unknown as GeoCacheClient),
  });
}

export function createPgAggregateDataDeps(options: {
  userId?: string | null;
  requireAuth?: boolean;
  databaseUrl: string;
  geoCacheClient?: GeoCacheClient | null;
}): AggregateDataDeps {
  const sql = postgres(options.databaseUrl);

  async function executeSql(query: string) {
    try {
      const rows = (await sql.unsafe(query)) as unknown[];
      return { data: rows, error: null };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { data: null, error: { message } };
    }
  }

  return {
    databaseUrl: options.databaseUrl,
    userId: options.userId,
    requireAuth: options.requireAuth,
    geoCacheClient: options.geoCacheClient ?? null,
    executeSql,
    async findEtlIdByOutputTable(table: string) {
      const rows = await sql.unsafe(
        `SELECT id FROM public.etl WHERE output_table ILIKE $1 LIMIT 1`,
        toSqlParams([table])
      );
      return (rows[0] as { id?: string } | undefined)?.id ?? null;
    },
    async findEtlIdByRunDestination(table: string) {
      const rows = await sql.unsafe(
        `SELECT etl_id FROM public.etl_runs_log
         WHERE status = 'completed' AND destination_table_name ILIKE $1
         ORDER BY completed_at DESC LIMIT 1`,
        toSqlParams([table])
      );
      return (rows[0] as { etl_id?: string } | undefined)?.etl_id ?? null;
    },
    async getEtlLayout(etlId: string) {
      const rows = await sql.unsafe(
        `SELECT layout FROM public.etl WHERE id = $1 LIMIT 1`,
        toSqlParams([etlId])
      );
      return (rows[0] as { layout?: Record<string, unknown> } | undefined)?.layout ?? null;
    },
    async getDatasetById(datasetId: string) {
      const rows = await sql.unsafe(
        `SELECT id, etl_id, config FROM public.dataset WHERE id = $1 LIMIT 1`,
        toSqlParams([datasetId])
      );
      const row = rows[0] as { id?: string; etl_id?: string; config?: unknown } | undefined;
      if (!row?.id) return null;
      return {
        id: String(row.id),
        etl_id: String(row.etl_id ?? ""),
        config:
          row.config && typeof row.config === "object"
            ? (row.config as Record<string, unknown>)
            : {},
      };
    },
    async getFirstDatasetIdForEtl(etlId: string) {
      const rows = await sql.unsafe(
        `SELECT id FROM public.dataset WHERE etl_id = $1 ORDER BY updated_at DESC LIMIT 1`,
        toSqlParams([etlId])
      );
      const id = (rows[0] as { id?: string } | undefined)?.id;
      return id ? String(id) : null;
    },
    async resolveDatasetTable(etlId: string) {
      const runRows = await sql.unsafe(
        `SELECT destination_schema, destination_table_name FROM public.etl_runs_log
         WHERE etl_id = $1 AND status = 'completed'
         ORDER BY completed_at DESC LIMIT 1`,
        toSqlParams([etlId])
      );
      const run = runRows[0] as { destination_schema?: string; destination_table_name?: string } | undefined;
      if (run?.destination_table_name) {
        return {
          schema: run.destination_schema || "etl_output",
          tableName: run.destination_table_name,
        };
      }
      const etlRows = await sql.unsafe(
        `SELECT output_table FROM public.etl WHERE id = $1 LIMIT 1`,
        toSqlParams([etlId])
      );
      const outputTable = (etlRows[0] as { output_table?: string } | undefined)?.output_table?.trim();
      if (outputTable) {
        return { schema: "etl_output", tableName: outputTable };
      }
      return null;
    },
  };
}
