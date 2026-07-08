import { Injectable } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";

import { getInternalDbUrl } from "@/lib/db/internal-db-url";
import type { GeoCacheClient } from "@/lib/geo/geo-enrichment";

@Injectable()
export class DashboardService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Cliente de caché de geocodificación (mapas). Usa `this.db.query`/`queryOne` (pg.Pool
   * directo, sin restricción de solo-SELECT) en vez de `executeSql`, porque este último
   * pasa por la función `public.execute_sql`, que por diseño solo permite SELECT/WITH y
   * bloquearía el UPSERT de coordenadas nuevas.
   */
  private buildGeoCacheClient(): GeoCacheClient {
    const db = this.db;
    return {
      from(_table: string) {
        return {
          select() {
            return {
              eq(_column: string, value: string) {
                return {
                  async maybeSingle() {
                    try {
                      const row = await db.queryOne<{ cache_key: string; lat: number; lng: number }>(
                        `SELECT cache_key, lat, lng FROM public.geo_location_cache WHERE cache_key = $1 LIMIT 1`,
                        [value]
                      );
                      return { data: row, error: null };
                    } catch (err) {
                      return {
                        data: null,
                        error: { message: err instanceof Error ? err.message : String(err) },
                      };
                    }
                  },
                };
              },
            };
          },
          async upsert(payload: { cache_key: string; lat: number; lng: number }) {
            try {
              await db.query(
                `INSERT INTO public.geo_location_cache (cache_key, lat, lng)
                 VALUES ($1, $2, $3)
                 ON CONFLICT (cache_key) DO UPDATE SET lat = EXCLUDED.lat, lng = EXCLUDED.lng`,
                [payload.cache_key, payload.lat, payload.lng]
              );
              return { error: null };
            } catch (err) {
              return { error: { message: err instanceof Error ? err.message : String(err) } };
            }
          },
        };
      },
    };
  }

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
    deps.geoCacheClient = this.buildGeoCacheClient();
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
    body: {
      tableName: string;
      field: string;
      limit?: number;
      transform?: string;
    },
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
    const transformOp = String(body.transform ?? "").trim().toUpperCase();

    const quotedField = `"${field}"`;
    /** Parse tolerante: ISO / timestamp, o texto DD/MM/YYYY común en Excel. */
    const dateExpr = `(
      CASE
        WHEN ${quotedField}::text ~ '^\\d{1,2}/\\d{1,2}/\\d{4}' THEN to_date(substring(${quotedField}::text from 1 for 10), 'DD/MM/YYYY')
        ELSE ${quotedField}::timestamp
      END
    )`;

    let selectExpression = quotedField;
    if (transformOp === "YEAR") {
      selectExpression = `EXTRACT(YEAR FROM ${dateExpr})::int::text`;
    } else if (transformOp === "MONTH") {
      selectExpression = `EXTRACT(MONTH FROM ${dateExpr})::int::text`;
    } else if (transformOp === "YEAR_MONTH") {
      selectExpression = `TO_CHAR(${dateExpr}, 'YYYY-MM')`;
    } else if (transformOp === "QUARTER") {
      selectExpression = `(EXTRACT(YEAR FROM ${dateExpr})::text || '-Q' || EXTRACT(QUARTER FROM ${dateExpr})::text)`;
    } else if (transformOp === "SEMESTER") {
      selectExpression = `(EXTRACT(YEAR FROM ${dateExpr})::text || '-S' || CASE WHEN EXTRACT(MONTH FROM ${dateExpr}) <= 6 THEN '1' ELSE '2' END)`;
    } else if (transformOp === "DAY") {
      selectExpression = `(${dateExpr})::date::text`;
    }

    const sql = `SELECT DISTINCT ${selectExpression} AS value
      FROM ${schema}."${table.replace(/"/g, "")}"
      WHERE ${quotedField} IS NOT NULL
        AND trim(${quotedField}::text) <> ''
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
