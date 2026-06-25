import { Injectable } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";

import { getInternalDbUrl } from "@/lib/db/internal-db-url";

@Injectable()
export class DashboardService {
  constructor(private readonly db: DatabaseService) {}

  private async loadAggregateModules() {
    // Dynamic import allows tsx runtime to resolve shared lib with @/ aliases
    const handler = await import("../../../lib/dashboard/aggregateDataHandler");
    const depsFactory = await import("../../../lib/dashboard/createAggregateDataDeps");
    return {
      runAggregateData: handler.runAggregateData,
      createPgAggregateDataDeps: depsFactory.createPgAggregateDataDeps,
    };
  }

  async aggregateData(body: Record<string, unknown>, userId?: string) {
    const { runAggregateData, createPgAggregateDataDeps } =
      await this.loadAggregateModules();

    const databaseUrl = getInternalDbUrl();

    const deps = createPgAggregateDataDeps({
      userId: userId ?? null,
      requireAuth: true,
      databaseUrl,
    });

    deps.executeSql = (query: string) => this.db.executeSql(query);
    deps.findEtlIdByOutputTable = async (table: string) => {
      const row = await this.db.queryOne<{ id: string }>(
        `SELECT id FROM public.etl WHERE output_table ILIKE $1 LIMIT 1`,
        [table]
      );
      return row?.id ?? null;
    };
    deps.findEtlIdByRunDestination = async (table: string) => {
      const row = await this.db.queryOne<{ etl_id: string }>(
        `SELECT etl_id FROM public.etl_runs_log
         WHERE status = 'completed' AND destination_table_name ILIKE $1
         ORDER BY completed_at DESC LIMIT 1`,
        [table]
      );
      return row?.etl_id ?? null;
    };
    deps.getEtlLayout = async (etlId: string) => {
      const row = await this.db.queryOne<{ layout: Record<string, unknown> }>(
        `SELECT layout FROM public.etl WHERE id = $1 LIMIT 1`,
        [etlId]
      );
      return row?.layout ?? null;
    };

    return runAggregateData(body as never, deps);
  }

  async distinctValues(
    body: { tableName: string; field: string; limit?: number },
    userId?: string
  ) {
    if (!userId) return { status: 401, data: { error: "No autenticado" } };
    const allowed = ["etl_output.", "public."];
    if (!allowed.some((p) => body.tableName?.startsWith(p))) {
      return { status: 400, data: { error: "Tabla no permitida" } };
    }
    const dot = body.tableName.indexOf(".");
    const schema = body.tableName.slice(0, dot);
    const table = body.tableName.slice(dot + 1);
    const field = body.field.replace(/[^a-zA-Z0-9_]/g, "");
    const limit = Math.min(body.limit ?? 500, 5000);
    const sql = `SELECT DISTINCT "${field}" AS value
      FROM ${schema}."${table.replace(/"/g, "")}"
      WHERE "${field}" IS NOT NULL
      ORDER BY 1 LIMIT ${limit}`;
    const { data, error } = await this.db.executeSql(sql);
    if (error) return { status: 500, data: { error: error.message } };
    return {
      status: 200,
      data: (data ?? []).map((r) => (r as { value: unknown }).value),
    };
  }

  async rawData(body: { tableName: string; limit?: number; offset?: number }) {
    const allowed = ["etl_output.", "public."];
    if (!allowed.some((p) => body.tableName?.startsWith(p))) {
      return { status: 400, data: { error: "Tabla no permitida" } };
    }
    const dot = body.tableName.indexOf(".");
    const schema = body.tableName.slice(0, dot);
    const table = body.tableName.slice(dot + 1);
    const limit = Math.min(body.limit ?? 100, 10_000);
    const offset = body.offset ?? 0;
    const sql = `SELECT * FROM ${schema}."${table.replace(/"/g, "")}"
      ORDER BY 1 LIMIT ${limit} OFFSET ${offset}`;
    const { data, error } = await this.db.executeSql(sql);
    if (error) return { status: 500, data: { error: error.message } };
    return { status: 200, data: data ?? [] };
  }
}
