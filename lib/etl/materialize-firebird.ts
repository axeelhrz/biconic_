import { Client as PgClient } from "pg";
import { buildDateFilterWhereFragmentFirebird, type DateFilterSpec } from "@/lib/sql/helpers";
import { decryptConnectionPassword } from "@/lib/connection-secret";

const FB_BATCH_SIZE = 8_000;
const PG_INSERT_BATCH = 2_000;

type FirebirdConn = {
  id?: string | number;
  type?: string;
  db_host?: string | null;
  db_port?: number | null;
  db_name?: string | null;
  db_user?: string | null;
  db_password?: string | null;
  db_password_encrypted?: string | null;
  db_password_secret_id?: string | null;
};

export type MaterializeResult = {
  qualifiedTable: string;
  rowCount: number;
};

const firebirdSafePart = (s: string) =>
  /^[A-Z0-9_]+$/i.test(String(s).trim())
    ? String(s).trim().toUpperCase()
    : `"${String(s).trim().replace(/"/g, '""')}"`;

const normalizeKey = (k: string) =>
  String(k || "").replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase();

const sanitizeForPostgres = (val: unknown): unknown => {
  if (val === undefined || val === null) return null;
  if (typeof val === "string") {
    const s = val.indexOf("\u0000") >= 0 ? val.replace(/\u0000/g, "") : val;
    return s;
  }
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val.toISOString();
  if (Buffer.isBuffer(val)) return val.toString("utf8").replace(/\u0000/g, "");
  return val;
};

function inferPgType(value: unknown): string {
  if (typeof value === "number") return Number.isInteger(value) ? "BIGINT" : "NUMERIC";
  if (typeof value === "boolean") return "BOOLEAN";
  if (value instanceof Date) return "TIMESTAMPTZ";
  if (typeof value === "string") {
    if (/^\d{4}-\d{2}-\d{2}(T|\s)\d{2}:\d{2}/.test(value)) return "TIMESTAMPTZ";
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return "DATE";
  }
  return "TEXT";
}

function resolveFirebirdPassword(conn: FirebirdConn): string {
  let pwd = conn.db_password_encrypted
    ? decryptConnectionPassword(conn.db_password_encrypted)
    : conn.db_password ?? "";
  if (!pwd) pwd = process.env.FLEXXUS_PASSWORD || process.env.DB_PASSWORD_PLACEHOLDER || "";
  return pwd;
}

function fbOpts(conn: FirebirdConn) {
  return {
    host: conn.db_host || "localhost",
    port: conn.db_port ? Number(conn.db_port) : 15421,
    database: conn.db_name,
    user: conn.db_user,
    password: resolveFirebirdPassword(conn),
    lowercase_keys: false,
  };
}

async function queryFirebird(
  opts: ReturnType<typeof fbOpts>,
  sql: string
): Promise<Record<string, any>[]> {
  const Firebird = require("node-firebird");
  return new Promise<Record<string, any>[]>((resolve, reject) => {
    Firebird.attach(opts, (err: Error | null, db: any) => {
      if (err) return reject(err);
      db.query(sql, [], (qErr: Error | null, rows: any[]) => {
        if (db?.detach) try { db.detach(() => {}); } catch (_) {}
        if (qErr) return reject(qErr);
        const normalized = (rows || []).map((row: Record<string, any>) => {
          const out: Record<string, any> = {};
          for (const k of Object.keys(row)) out[normalizeKey(k)] = row[k];
          return out;
        });
        resolve(normalized);
      });
    });
  });
}

/**
 * Lee una tabla Firebird en lotes y la vuelca a una tabla PostgreSQL temporal.
 * Devuelve el nombre cualificado de la tabla creada y cantidad de filas.
 */
export async function materializeFirebirdTable(
  conn: FirebirdConn,
  table: string,
  columns: string[] | undefined,
  dateFilter: DateFilterSpec | undefined,
  pgUrl: string,
  targetSchema: string,
  targetTable: string,
  signal?: { aborted: boolean }
): Promise<MaterializeResult> {
  const qualifiedTable = `${targetSchema}."${targetTable}"`;
  const opts = fbOpts(conn);

  const tablePart = table.includes(".")
    ? (table.split(".").pop() || table).trim().toUpperCase()
    : firebirdSafePart(table);
  const cols = columns?.length ? columns.map((c) => firebirdSafePart(c)).join(", ") : "*";

  const { clause: dfClause, params: dfParams } = buildDateFilterWhereFragmentFirebird(dateFilter);
  let wherePart = dfClause ? ` WHERE ${dfClause}` : "";
  if (dfParams.length > 0) {
    for (const p of dfParams) {
      const pos = wherePart.indexOf("?");
      if (pos === -1) break;
      const escaped = typeof p === "number" ? String(p) : `'${String(p).replace(/'/g, "''")}'`;
      wherePart = wherePart.slice(0, pos) + escaped + wherePart.slice(pos + 1);
    }
  }

  const pgClient = new PgClient({ connectionString: pgUrl, connectionTimeoutMillis: 15000 });
  await pgClient.connect();
  await pgClient.query(`CREATE SCHEMA IF NOT EXISTS ${targetSchema}`).catch(() => {});

  let tableCreated = false;
  let totalRows = 0;

  try {
    let offset = 0;
    while (true) {
      if (signal?.aborted) break;

      const sql = offset > 0
        ? `SELECT FIRST ${FB_BATCH_SIZE} SKIP ${offset} ${cols} FROM ${tablePart}${wherePart} ORDER BY 1`
        : `SELECT FIRST ${FB_BATCH_SIZE} ${cols} FROM ${tablePart}${wherePart} ORDER BY 1`;

      const rows = await queryFirebird(opts, sql);
      if (rows.length === 0) break;

      if (!tableCreated) {
        const sample = rows[0];
        const colDefs = Object.keys(sample)
          .map((k) => `"${k}" ${inferPgType(sample[k])}`)
          .join(", ");
        await pgClient.query(`DROP TABLE IF EXISTS ${qualifiedTable}`);
        await pgClient.query(`CREATE TABLE ${qualifiedTable} (${colDefs})`);
        tableCreated = true;
      }

      for (let i = 0; i < rows.length; i += PG_INSERT_BATCH) {
        const chunk = rows.slice(i, i + PG_INSERT_BATCH);
        if (chunk.length === 0) continue;
        const keys = Object.keys(chunk[0]);
        const colList = keys.map((k) => `"${k}"`).join(", ");
        const values: unknown[] = [];
        const placeholders = chunk.map((row, ri) => {
          const ph = keys.map((k, ki) => {
            values.push(sanitizeForPostgres(row[k]));
            return `$${ri * keys.length + ki + 1}`;
          });
          return `(${ph.join(", ")})`;
        });
        await pgClient.query(
          `INSERT INTO ${qualifiedTable} (${colList}) VALUES ${placeholders.join(", ")}`,
          values
        );
      }

      totalRows += rows.length;
      offset += rows.length;
      if (rows.length < FB_BATCH_SIZE) break;
    }

    if (tableCreated && totalRows > 0) {
      console.log(`[materialize] ${qualifiedTable}: ${totalRows} filas volcadas.`);
    }

    return { qualifiedTable, rowCount: totalRows };
  } catch (e) {
    await pgClient.query(`DROP TABLE IF EXISTS ${qualifiedTable}`).catch(() => {});
    throw e;
  } finally {
    await pgClient.end().catch(() => {});
  }
}

/**
 * Materializa una tabla Postgres en etl_temp copiándola directamente.
 * Útil para joins mixtos Firebird+Postgres.
 */
export async function materializePostgresTable(
  conn: { db_host?: string | null; db_port?: number | null; db_name?: string | null; db_user?: string | null; db_password?: string | null; db_password_encrypted?: string | null; db_password_secret_id?: string | null; type?: string },
  table: string,
  columns: string[] | undefined,
  dateFilter: DateFilterSpec | undefined,
  pgUrl: string,
  targetSchema: string,
  targetTable: string
): Promise<MaterializeResult> {
  const qualifiedTable = `${targetSchema}."${targetTable}"`;
  const { buildDateFilterWhereFragmentPg } = await import("@/lib/sql/helpers");

  let srcPassword = conn.db_password_encrypted
    ? decryptConnectionPassword(conn.db_password_encrypted)
    : conn.db_password ?? "";
  if (!srcPassword) srcPassword = process.env.DB_PASSWORD_PLACEHOLDER || "";

  const isExcel = String(conn.type || "").toLowerCase() === "excel_file";
  const srcConnStr = isExcel
    ? pgUrl
    : `postgres://${conn.db_user}:${encodeURIComponent(String(srcPassword))}@${conn.db_host}:${conn.db_port || 5432}/${conn.db_name}?sslmode=require`;

  const srcClient = new PgClient({ connectionString: srcConnStr, connectionTimeoutMillis: 15000 });
  const destClient = new PgClient({ connectionString: pgUrl, connectionTimeoutMillis: 15000 });

  await Promise.all([srcClient.connect(), destClient.connect()]);
  await destClient.query(`CREATE SCHEMA IF NOT EXISTS ${targetSchema}`).catch(() => {});

  try {
    const cols = columns?.length ? columns.map((c) => `"${c}"`).join(", ") : "*";
    const { clause: dfClause, params: dfParams } = buildDateFilterWhereFragmentPg(dateFilter, 1, "");
    const where = dfClause ? ` WHERE ${dfClause}` : "";
    const srcSql = `SELECT ${cols} FROM ${table.includes(".") ? table.split(".").map(p => `"${p}"`).join(".") : `"${table}"`}${where}`;
    const srcRes = await srcClient.query(srcSql, dfParams);
    const rows = srcRes.rows || [];

    if (rows.length === 0) {
      await destClient.query(`CREATE TABLE IF NOT EXISTS ${qualifiedTable} (__empty text)`);
      return { qualifiedTable, rowCount: 0 };
    }

    const keys = Object.keys(rows[0]).map(normalizeKey);
    const sampleRow = rows[0];
    const origKeys = Object.keys(sampleRow);
    const colDefs = origKeys.map((k, i) => `"${keys[i]}" ${inferPgType(sampleRow[k])}`).join(", ");
    await destClient.query(`DROP TABLE IF EXISTS ${qualifiedTable}`);
    await destClient.query(`CREATE TABLE ${qualifiedTable} (${colDefs})`);

    for (let i = 0; i < rows.length; i += PG_INSERT_BATCH) {
      const chunk = rows.slice(i, i + PG_INSERT_BATCH);
      const colList = keys.map((k) => `"${k}"`).join(", ");
      const values: unknown[] = [];
      const placeholders = chunk.map((row, ri) => {
        const ph = origKeys.map((k, ki) => {
          values.push(sanitizeForPostgres(row[k]));
          return `$${ri * origKeys.length + ki + 1}`;
        });
        return `(${ph.join(", ")})`;
      });
      await destClient.query(`INSERT INTO ${qualifiedTable} (${colList}) VALUES ${placeholders.join(", ")}`, values);
    }

    console.log(`[materialize-pg] ${qualifiedTable}: ${rows.length} filas.`);
    return { qualifiedTable, rowCount: rows.length };
  } catch (e) {
    await destClient.query(`DROP TABLE IF EXISTS ${qualifiedTable}`).catch(() => {});
    throw e;
  } finally {
    await srcClient.end().catch(() => {});
    await destClient.end().catch(() => {});
  }
}

/**
 * Elimina tablas temporales de un request.
 */
export async function cleanupTempTables(
  pgUrl: string,
  tables: string[]
): Promise<void> {
  if (tables.length === 0) return;
  const pgClient = new PgClient({ connectionString: pgUrl, connectionTimeoutMillis: 10000 });
  await pgClient.connect();
  try {
    for (const t of tables) {
      await pgClient.query(`DROP TABLE IF EXISTS ${t} CASCADE`).catch(() => {});
    }
  } finally {
    await pgClient.end().catch(() => {});
  }
}
