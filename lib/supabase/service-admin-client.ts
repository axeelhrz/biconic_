import postgres, { type ParameterOrJSON } from "postgres";
import { getInternalDbUrl } from "@/lib/db/internal-db-url";

export function getServiceDbUrl(): string {
  return getInternalDbUrl();
}

function toSqlParams(vals: unknown[]): ParameterOrJSON<never>[] {
  return vals as ParameterOrJSON<never>[];
}

export type QueryResult = {
  data: any;
  error: { message: string; code?: string } | null;
  count?: number | null;
};

type FilterOp = "eq" | "in" | "lt" | "gt" | "gte" | "ilike" | "neq" | "is";
type Filter = { col: string; val: unknown; op: FilterOp };

function parseOrFilter(filter: string): string {
  const parts = filter.split(",").map((p) => p.trim()).filter(Boolean);
  const clauses = parts.map((part) => {
    if (part.endsWith(".is.null")) {
      const col = part.replace(/\.is\.null$/, "");
      return `"${col}" IS NULL`;
    }
    const dot = part.indexOf(".");
    const col = part.slice(0, dot);
    const rest = part.slice(dot + 1);
    const opDot = rest.indexOf(".");
    const op = opDot >= 0 ? rest.slice(0, opDot) : rest;
    const rawVal = opDot >= 0 ? rest.slice(opDot + 1) : "";
    if (op === "eq") {
      if (rawVal === "true") return `"${col}" = true`;
      if (rawVal === "false") return `"${col}" = false`;
      if (rawVal === "null") return `"${col}" IS NULL`;
      return `"${col}" = '${rawVal.replace(/'/g, "''")}'`;
    }
    if (op === "ilike") {
      return `"${col}" ILIKE '${rawVal.replace(/'/g, "''")}'`;
    }
    return "TRUE";
  });
  return `(${clauses.join(" OR ")})`;
}

export class PostgresServiceQuery {
  private filters: Filter[] = [];
  private orClause: string | null = null;
  private selectCols = "*";
  private isUpdate = false;
  private isInsert = false;
  private isUpsert = false;
  private upsertConflictCol?: string;
  private isDelete = false;
  private updatePayload: Record<string, unknown> = {};
  private insertPayload: Record<string, unknown> | Record<string, unknown>[] = {};
  private insertReturning = "*";
  private wantSingle = false;
  private wantThrow = false;
  private orderCol?: string;
  private orderAsc = true;
  private nullsFirst = false;
  private limitN?: number;
  private offsetN?: number;
  private countHead = false;

  constructor(
    private readonly sql: ReturnType<typeof postgres>,
    private readonly table: string,
    private readonly schema = "public"
  ) {}

  private qualifiedTable(): string {
    return `"${this.schema}"."${this.table}"`;
  }

  select(
    cols = "*",
    opts?: { count?: "exact"; head?: boolean }
  ) {
    if (opts?.count === "exact" && opts?.head) {
      this.countHead = true;
      return this;
    }
    if (this.isInsert) {
      this.insertReturning = cols;
      return this;
    }
    this.selectCols =
      cols.includes("(") || cols.includes(":") || cols.includes("\n") ? "*" : cols;
    return this;
  }

  insert(payload: Record<string, unknown> | Record<string, unknown>[]) {
    this.isInsert = true;
    this.insertPayload = payload;
    return this;
  }

  upsert(
    payload: Record<string, unknown> | Record<string, unknown>[],
    opts?: { onConflict?: string }
  ) {
    this.isUpsert = true;
    this.insertPayload = payload;
    this.upsertConflictCol = opts?.onConflict;
    return this;
  }

  update(payload: Record<string, unknown>) {
    this.isUpdate = true;
    this.updatePayload = payload;
    return this;
  }

  eq(col: string, val: unknown) {
    this.filters.push({ col, val, op: "eq" });
    return this;
  }

  ilike(col: string, val: unknown) {
    this.filters.push({ col, val, op: "ilike" });
    return this;
  }

  in(col: string, val: unknown[]) {
    this.filters.push({ col, val, op: "in" });
    return this;
  }

  lt(col: string, val: unknown) {
    this.filters.push({ col, val, op: "lt" });
    return this;
  }

  gt(col: string, val: unknown) {
    this.filters.push({ col, val, op: "gt" });
    return this;
  }

  gte(col: string, val: unknown) {
    this.filters.push({ col, val, op: "gte" });
    return this;
  }

  or(filter: string) {
    this.orClause = filter;
    return this;
  }

  neq(col: string, val: unknown) {
    this.filters.push({ col, val, op: "neq" });
    return this;
  }

  is(col: string, val: null) {
    this.filters.push({ col, val, op: "is" });
    return this;
  }

  order(
    col?: string,
    opts?: { ascending?: boolean; nullsFirst?: boolean }
  ) {
    if (col) {
      this.orderCol = col;
      this.orderAsc = opts?.ascending !== false;
      this.nullsFirst = opts?.nullsFirst === true;
    }
    return this;
  }

  limit(n: number) {
    this.limitN = n;
    return this;
  }

  range(from: number, to: number) {
    this.offsetN = from;
    this.limitN = to - from + 1;
    return this;
  }

  delete() {
    this.isDelete = true;
    return this;
  }

  single() {
    this.wantSingle = true;
    return this;
  }

  maybeSingle() {
    this.wantSingle = true;
    return this;
  }

  throwOnError() {
    this.wantThrow = true;
    return this;
  }

  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ) {
    return this.execute().then(onfulfilled, onrejected);
  }

  private buildWhere(vals: unknown[]): string {
    const clauses: string[] = [];
    if (this.orClause) {
      clauses.push(parseOrFilter(this.orClause));
    }
    for (const f of this.filters) {
      vals.push(f.val);
      const idx = vals.length;
      const col = `"${f.col}"`;
      if (f.op === "in" && Array.isArray(f.val)) {
        clauses.push(`${col} = ANY($${idx})`);
      } else if (f.op === "ilike") {
        clauses.push(`${col} ILIKE $${idx}`);
      } else if (f.op === "neq") {
        clauses.push(`${col} <> $${idx}`);
      } else if (f.op === "is" && f.val === null) {
        clauses.push(`${col} IS NULL`);
        vals.pop();
      } else if (f.op === "lt") {
        clauses.push(`${col} < $${idx}`);
      } else if (f.op === "gt") {
        clauses.push(`${col} > $${idx}`);
      } else if (f.op === "gte") {
        clauses.push(`${col} >= $${idx}`);
      } else {
        clauses.push(`${col} = $${idx}`);
      }
    }
    if (!clauses.length) return "";
    return ` WHERE ${clauses.join(" AND ")}`;
  }

  private async execute(): Promise<QueryResult> {
    try {
      if (this.isInsert || this.isUpsert) {
        const row = Array.isArray(this.insertPayload)
          ? this.insertPayload[0]
          : this.insertPayload;
        const keys = Object.keys(row ?? {});
        if (!keys.length) return { data: null, error: { message: "Insert vacío" } };
        const vals = keys.map((k) => (row as Record<string, unknown>)[k]);
        const cols = keys.map((k) => `"${k}"`).join(", ");
        const ph = keys.map((_, i) => `$${i + 1}`).join(", ");
        const returning =
          this.insertReturning === "*" ? "*" : this.insertReturning;
        let query = `INSERT INTO ${this.qualifiedTable()} (${cols}) VALUES (${ph})`;
        if (this.isUpsert && this.upsertConflictCol) {
          const conflictCol = this.upsertConflictCol;
          const updates = keys
            .filter((k) => k !== conflictCol)
            .map((k) => `"${k}" = EXCLUDED."${k}"`)
            .join(", ");
          if (updates) {
            query += ` ON CONFLICT ("${conflictCol}") DO UPDATE SET ${updates}`;
          } else {
            query += ` ON CONFLICT ("${conflictCol}") DO NOTHING`;
          }
        }
        query += ` RETURNING ${returning}`;
        const rows = await this.sql.unsafe(query, toSqlParams(vals));
        const data: any = this.wantSingle ? rows[0] ?? null : rows;
        if (this.wantThrow && !data) {
          throw new Error(`No se pudo insertar en ${this.table}`);
        }
        return { data, error: null };
      }

      if (this.isUpdate) {
        const sets = Object.keys(this.updatePayload);
        if (!sets.length) return { data: null, error: null };
        const vals: unknown[] = [...sets.map((k) => this.updatePayload[k])];
        const assignments = sets
          .map((k, i) => `"${k}" = $${i + 1}`)
          .join(", ");
        let query = `UPDATE ${this.qualifiedTable()} SET ${assignments}`;
        if (this.table === "data_tables" && !sets.includes("updated_at")) {
          query += `, updated_at = now()`;
        }
        query += this.buildWhere(vals);
        query += " RETURNING *";
        const rows = await this.sql.unsafe(query, toSqlParams(vals));
        const data: any = this.wantSingle ? rows[0] ?? null : rows;
        return { data, error: null };
      }

      if (this.isDelete) {
        const vals: unknown[] = [];
        let query = `DELETE FROM ${this.qualifiedTable()}`;
        query += this.buildWhere(vals);
        await this.sql.unsafe(query, toSqlParams(vals));
        return { data: null, error: null };
      }

      if (this.countHead) {
        const vals: unknown[] = [];
        let query = `SELECT count(*)::int AS count FROM ${this.qualifiedTable()}`;
        query += this.buildWhere(vals);
        const rows = await this.sql.unsafe(query, toSqlParams(vals));
        const count = Number((rows[0] as { count?: number })?.count ?? 0);
        return { data: null, count, error: null };
      }

      const vals: unknown[] = [];
      let query = `SELECT ${this.selectCols} FROM ${this.qualifiedTable()}`;
      query += this.buildWhere(vals);
      if (this.orderCol) {
        const nulls = this.nullsFirst ? " NULLS FIRST" : "";
        query += ` ORDER BY "${this.orderCol}" ${this.orderAsc ? "ASC" : "DESC"}${nulls}`;
      }
      if (this.limitN != null) query += ` LIMIT ${this.limitN}`;
      if (this.offsetN != null) query += ` OFFSET ${this.offsetN}`;
      const rows = await this.sql.unsafe(query, toSqlParams(vals));
      const data: any = this.wantSingle ? rows[0] ?? null : rows;
      if (this.wantThrow && !data) {
        throw new Error(`No se encontró fila en ${this.table}`);
      }
      return { data, error: null };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (this.wantThrow) {
        throw err instanceof Error ? err : new Error(message);
      }
      return { data: null, error: { message } };
    }
  }
}

export type ServiceAdminClient = {
  from: (table: string) => PostgresServiceQuery;
  schema: (schemaName: string) => { from: (table: string) => PostgresServiceQuery };
  _sql?: ReturnType<typeof postgres>;
};

let sharedSql: ReturnType<typeof postgres> | null = null;

function getSharedSql() {
  if (!sharedSql) {
    sharedSql = postgres(getServiceDbUrl(), { max: 3, idle_timeout: 30 });
  }
  return sharedSql;
}

export function createServiceAdminClient(): ServiceAdminClient {
  const sql = getSharedSql();
  return {
    from(table: string) {
      return new PostgresServiceQuery(sql, table, "public");
    },
    schema(schemaName: string) {
      return {
        from(table: string) {
          return new PostgresServiceQuery(sql, table, schemaName);
        },
      };
    },
    _sql: sql,
  };
}

export function createServiceRoleOrAdminClient() {
  return createServiceAdminClient();
}
