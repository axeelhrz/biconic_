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
  };
}
