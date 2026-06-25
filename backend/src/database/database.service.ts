import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { Pool, type QueryResultRow } from "pg";

import { getInternalDbUrl } from "@/lib/db/internal-db-url";

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly pool: Pool;

  constructor() {
    const connectionString = getInternalDbUrl();
    this.pool = new Pool({
      connectionString,
      max: Number(process.env.DB_POOL_SIZE ?? 25),
      idleTimeoutMillis: 30_000,
    });
  }

  async query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[]
  ): Promise<T[]> {
    const result = await this.pool.query<T>(text, params);
    return result.rows;
  }

  async queryOne<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[]
  ): Promise<T | null> {
    const rows = await this.query<T>(text, params);
    return rows[0] ?? null;
  }

  async executeSql(sqlQuery: string): Promise<{
    data: unknown[] | null;
    error: { message: string } | null;
  }> {
    try {
      const rows = await this.query<{ execute_sql: unknown }>(
        `SELECT public.execute_sql($1) AS execute_sql`,
        [sqlQuery]
      );
      const payload = rows[0]?.execute_sql;
      if (Array.isArray(payload)) {
        return { data: payload, error: null };
      }
      return { data: (payload as unknown[]) ?? [], error: null };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { data: null, error: { message } };
    }
  }

  async onModuleDestroy() {
    await this.pool.end();
  }
}
