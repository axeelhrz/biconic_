import {
  buildWhereClauseFirebirdStar,
  buildDateFilterWhereFragmentFirebirdStar,
  type DateFilterSpec,
} from "@/lib/sql/helpers";

type FilterCondition = {
  column: string;
  operator: string;
  value?: string;
};

type StarJoinSpec = {
  secondaryTable?: string;
  secondaryColumns?: string[];
  joinType?: string;
  conditions?: Array<{ primaryColumn?: string; secondaryColumn?: string }>;
  primaryColumn?: string;
  secondaryColumn?: string;
};

export type FirebirdStarStreamOptions = {
  attachOptions: Record<string, unknown>;
  primaryTable: string;
  primaryColumns: string[];
  joins: StarJoinSpec[];
  conditions: FilterCondition[];
  dateFilter?: DateFilterSpec | null;
  /** Filas por lote entregado al consumidor. */
  batchSize?: number;
  /** Aviso periódico de progreso (filas leídas hasta el momento). */
  onProgress?: (rowsSoFar: number) => void;
};

const fbTablePart = (table: string) => {
  const t = (table || "").trim();
  if (t.includes(".")) return (t.split(".").pop() || t).trim().toUpperCase();
  return /^[A-Z0-9_]+$/i.test(t) ? t.toUpperCase() : `"${t.replace(/"/g, '""')}"`;
};

const fbColPart = (col: string) => {
  const c = (col || "").trim();
  return /^[A-Z0-9_]+$/i.test(c) ? c.toUpperCase() : `"${c.replace(/"/g, '""')}"`;
};

const escapeFbLiteral = (v: unknown): string => {
  if (v == null || v === "") return "NULL";
  if (typeof v === "boolean") return v ? "1" : "0";
  if (typeof v === "number" && !Number.isNaN(v)) {
    return Number.isInteger(v) ? String(v) : `CAST('${String(v)}' AS DOUBLE PRECISION)`;
  }
  if (typeof v === "string" && /^-?\d+\.\d+$/.test(v.trim())) {
    return `CAST('${v.trim().replace(/'/g, "''")}' AS DOUBLE PRECISION)`;
  }
  return `'${String(v).replace(/'/g, "''")}'`;
};

const inlineFbParams = (sql: string, params: unknown[]) => {
  let out = sql;
  for (const p of params) {
    const pos = out.indexOf("?");
    if (pos === -1) break;
    out = out.slice(0, pos) + escapeFbLiteral(p) + out.slice(pos + 1);
  }
  return out;
};

const normalizeKey = (k: string) =>
  String(k || "").replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase();

function getPairs(jn: StarJoinSpec): Array<{ leftColumn: string; rightColumn: string }> {
  if (Array.isArray(jn.conditions) && jn.conditions.length > 0) {
    return jn.conditions
      .map((c) => ({
        leftColumn: String(c?.primaryColumn ?? "").trim(),
        rightColumn: String(c?.secondaryColumn ?? "").trim(),
      }))
      .filter((p) => p.leftColumn || p.rightColumn);
  }
  const pc = String(jn.primaryColumn ?? "").trim();
  const sc = String(jn.secondaryColumn ?? "").trim();
  if (pc || sc) return [{ leftColumn: pc, rightColumn: sc }];
  return [];
}

/** Arma el SQL del star join Firebird sin FIRST/SKIP ni ORDER BY (volcado completo en un pase). */
export function buildFirebirdStarStreamSql(opts: FirebirdStarStreamOptions): string {
  const { primaryTable, primaryColumns, joins, conditions, dateFilter } = opts;

  const selectParts: string[] = [];
  if (primaryColumns.length > 0) {
    primaryColumns.forEach((col) => {
      selectParts.push(`p.${fbColPart(col)} AS "primary_${normalizeKey(col)}"`);
    });
  } else {
    selectParts.push("p.*");
  }
  joins.forEach((jn, idx) => {
    const secCols = Array.isArray(jn.secondaryColumns) ? jn.secondaryColumns : [];
    if (secCols.length > 0) {
      secCols.forEach((col) => {
        selectParts.push(`j${idx}.${fbColPart(col)} AS "join_${idx}_${normalizeKey(col)}"`);
      });
    } else {
      selectParts.push(`j${idx}.*`);
    }
  });

  let fromJoin = `FROM ${fbTablePart(primaryTable)} p`;
  joins.forEach((jn, idx) => {
    const jt = (jn.joinType || "INNER").toUpperCase();
    const pairs = getPairs(jn);
    if (pairs.length === 0) {
      throw new Error(`Join ${idx}: se requiere al menos una condición de enlace.`);
    }
    const onClauses = pairs.map(({ leftColumn: pc, rightColumn: sc }) => {
      let leftAlias = "p";
      let leftCol = (pc || "").trim();
      if (leftCol.includes(".")) {
        if (/^primary\./i.test(leftCol)) {
          leftCol = leftCol.replace(/^primary\./i, "").trim();
        } else {
          const m = leftCol.match(/^join_(\d+)\.(.+)$/i);
          if (m) {
            const i = Number(m[1]);
            if (!Number.isNaN(i) && i >= 0 && i < idx) {
              leftAlias = `j${i}`;
              leftCol = m[2].trim();
            }
          }
        }
      }
      return `${leftAlias}.${fbColPart(leftCol)} = j${idx}.${fbColPart((sc || "").trim())}`;
    });
    fromJoin += ` ${jt} JOIN ${fbTablePart(jn.secondaryTable || "")} j${idx} ON ${onClauses.join(" AND ")}`;
  });

  const { clause: condClause, params: condParams } = buildWhereClauseFirebirdStar(
    conditions as any,
    joins.length
  );
  const { clause: dfClause, params: dfParams } = buildDateFilterWhereFragmentFirebirdStar(
    dateFilter ?? undefined,
    joins.length
  );
  const whereParts: string[] = [];
  if (condClause) whereParts.push(condClause.replace(/^WHERE\s+/i, ""));
  if (dfClause) whereParts.push(dfClause);
  const whereClause = whereParts.length ? ` WHERE ${whereParts.join(" AND ")}` : "";

  return inlineFbParams(
    `SELECT ${selectParts.join(", ")} ${fromJoin}${whereClause}`,
    [...condParams, ...dfParams]
  );
}

const PROGRESS_EVERY_ROWS = 25_000;

/**
 * Ejecuta el star join nativo en Firebird con un cursor server-side (`db.sequentially`)
 * y entrega las filas en lotes. Un solo pase: sin FIRST/SKIP (que re-escanea el JOIN
 * completo en cada página, costo O(n²)) ni ORDER BY (sort externo innecesario para
 * volcado completo).
 */
export async function* streamFirebirdStarJoin(
  opts: FirebirdStarStreamOptions
): AsyncGenerator<Record<string, unknown>[], void, void> {
  const batchSize = Math.max(1, opts.batchSize ?? 20_000);
  const sql = buildFirebirdStarStreamSql(opts);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Firebird = require("node-firebird");

  const db: any = await new Promise((resolve, reject) => {
    Firebird.attach(opts.attachOptions, (err: Error | null, connection: any) => {
      if (err) reject(err);
      else resolve(connection);
    });
  });

  // Cola productor/consumidor: sequentially no soporta backpressure, así que los
  // lotes listos se encolan y el consumidor los drena; en la práctica el insert a
  // Postgres corre a un ritmo comparable al de la lectura por red desde Firebird.
  const ready: Record<string, unknown>[][] = [];
  let currentBatch: Record<string, unknown>[] = [];
  let finished = false;
  let streamError: Error | null = null;
  let wake: (() => void) | null = null;
  let totalRows = 0;
  let lastProgress = 0;

  const notify = () => {
    if (wake) {
      const w = wake;
      wake = null;
      w();
    }
  };

  const onRow = (row: Record<string, unknown>) => {
    const normalized: Record<string, unknown> = {};
    for (const k of Object.keys(row || {})) normalized[normalizeKey(k)] = row[k];
    currentBatch.push(normalized);
    totalRows++;
    if (currentBatch.length >= batchSize) {
      ready.push(currentBatch);
      currentBatch = [];
      notify();
    }
    if (opts.onProgress && totalRows - lastProgress >= PROGRESS_EVERY_ROWS) {
      lastProgress = totalRows;
      try {
        opts.onProgress(totalRows);
      } catch {
        /* progreso no debe romper el stream */
      }
    }
  };

  const onDone = (err: Error | null) => {
    if (err) streamError = err;
    if (currentBatch.length > 0) {
      ready.push(currentBatch);
      currentBatch = [];
    }
    finished = true;
    notify();
  };

  db.sequentially(sql, [], onRow, onDone);

  try {
    for (;;) {
      while (ready.length === 0 && !finished) {
        await new Promise<void>((resolve) => {
          wake = resolve;
        });
      }
      while (ready.length > 0) {
        yield ready.shift()!;
      }
      if (finished) {
        if (streamError) throw streamError;
        if (ready.length === 0) break;
      }
    }
  } finally {
    try {
      if (db?.detach) db.detach(() => {});
    } catch {
      /* ignore */
    }
  }
}
