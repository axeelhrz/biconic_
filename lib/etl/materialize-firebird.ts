import { Client as PgClient } from "pg";
import { buildDateFilterWhereFragmentFirebird, type DateFilterSpec } from "@/lib/sql/helpers";
import { decryptConnectionPassword } from "@/lib/connection-secret";
import { resolveFirebirdAttachOptions } from "@/lib/connection/resolve-firebird-connection";

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

function fbOpts(conn: FirebirdConn) {
  return resolveFirebirdAttachOptions(conn as Record<string, unknown>);
}

/**
 * Lee una tabla Firebird en un solo pase (cursor server-side vía `db.sequentially`,
 * ver https://github.com/hgourvest/node-firebird/wiki/What-is-sequentially-selects)
 * y la vuelca a una tabla PostgreSQL temporal en lotes.
 *
 * Antes se paginaba con `FIRST n SKIP offset`, que en Firebird re-escanea la tabla
 * desde el inicio en cada lote (costo O(n²) en tablas grandes). `sequentially` abre
 * un único cursor y transmite cada fila una sola vez.
 *
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
  signal?: { aborted: boolean },
  sharedPgClient?: PgClient,
  onProgress?: (rowsSoFar: number) => void,
  maxRows?: number
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

  const ownsClient = !sharedPgClient;
  const pgClient = sharedPgClient ?? new PgClient({ connectionString: pgUrl, connectionTimeoutMillis: 15000 });
  if (ownsClient) {
    await pgClient.connect();
    await pgClient.query(`CREATE SCHEMA IF NOT EXISTS ${targetSchema}`).catch(() => {});
  }

  const firstClause =
    maxRows != null && maxRows > 0 ? `FIRST ${Math.floor(maxRows)} ` : "";
  const sql = `SELECT ${firstClause}${cols} FROM ${tablePart}${wherePart}`;

  try {
    const result = await new Promise<{ rowCount: number }>((resolve, reject) => {
      const Firebird = require("node-firebird");
      Firebird.attach(opts, (attachErr: Error | null, db: any) => {
        if (attachErr) return reject(attachErr);

        let tableCreated = false;
        let pgInsertBatch = PG_INSERT_BATCH;
        let buffer: Record<string, any>[] = [];
        let totalRows = 0;
        let failed = false;
        let insertChain: Promise<void> = Promise.resolve();
        let lastProgressReport = 0;

        const detachSafely = () => {
          try {
            if (db?.detach) db.detach(() => {});
          } catch {
            /* ignore */
          }
        };

        const scheduleInsert = (rows: Record<string, any>[]) => {
          insertChain = insertChain.then(async () => {
            if (failed || rows.length === 0) return;
            const keys = Object.keys(rows[0]);
            const colList = keys.map((k) => `"${k}"`).join(", ");
            const values: unknown[] = [];
            const placeholders = rows.map((row, ri) => {
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
          }).catch((e) => {
            failed = true;
            throw e;
          });
        };

        const onRow = (row: Record<string, any>) => {
          if (failed) return;
          if (signal?.aborted) {
            failed = true;
            return;
          }
          const normalized: Record<string, any> = {};
          for (const k of Object.keys(row)) normalized[normalizeKey(k)] = row[k];
          totalRows++;

          if (!tableCreated) {
            tableCreated = true;
            const numCols = Object.keys(normalized).length;
            pgInsertBatch = Math.min(PG_INSERT_BATCH, Math.max(1, Math.floor(65000 / numCols)));
            const colDefs = Object.keys(normalized)
              .map((k) => `"${k}" ${inferPgType(normalized[k])}`)
              .join(", ");
            insertChain = insertChain
              .then(async () => {
                await pgClient.query(`DROP TABLE IF EXISTS ${qualifiedTable}`);
                await pgClient.query(
                  `CREATE TABLE ${qualifiedTable} (_biconic_rn BIGSERIAL PRIMARY KEY, ${colDefs})`
                );
              })
              .catch((e) => {
                failed = true;
                throw e;
              });
          }

          buffer.push(normalized);
          if (buffer.length >= pgInsertBatch) {
            const toFlush = buffer;
            buffer = [];
            scheduleInsert(toFlush);
            if (onProgress && totalRows - lastProgressReport >= 25_000) {
              lastProgressReport = totalRows;
              onProgress(totalRows);
            }
          }
        };

        const onDone = (streamErr: Error | null) => {
          detachSafely();
          if (buffer.length > 0) {
            const toFlush = buffer;
            buffer = [];
            scheduleInsert(toFlush);
          }
          insertChain
            .then(() => {
              if (streamErr) return reject(streamErr);
              if (failed) return; // ya rechazado dentro del chain
              resolve({ rowCount: totalRows });
            })
            .catch((e) => reject(e));
        };

        db.sequentially(sql, [], onRow, onDone);
      });
    });

    if (result.rowCount > 0) {
      console.log(`[materialize] ${qualifiedTable}: ${result.rowCount} filas volcadas.`);
    } else {
      // Tabla vacía: crear igual para que el JOIN posterior no falle por tabla inexistente.
      await pgClient.query(`CREATE TABLE IF NOT EXISTS ${qualifiedTable} (_biconic_rn BIGSERIAL PRIMARY KEY, __empty text)`);
    }

    return { qualifiedTable, rowCount: result.rowCount };
  } catch (e) {
    await pgClient.query(`DROP TABLE IF EXISTS ${qualifiedTable}`).catch(() => {});
    throw e;
  } finally {
    if (ownsClient) await pgClient.end().catch(() => {});
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
  targetTable: string,
  sharedPgClient?: PgClient,
  maxRows?: number
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
  const ownsDestClient = !sharedPgClient;
  const destClient = sharedPgClient ?? new PgClient({ connectionString: pgUrl, connectionTimeoutMillis: 15000 });

  await srcClient.connect();
  if (ownsDestClient) {
    await destClient.connect();
    await destClient.query(`CREATE SCHEMA IF NOT EXISTS ${targetSchema}`).catch(() => {});
  }

  try {
    const cols = columns?.length ? columns.map((c) => `"${c}"`).join(", ") : "*";
    const { clause: dfClause, params: dfParams } = buildDateFilterWhereFragmentPg(dateFilter, 1, "");
    const where = dfClause ? ` WHERE ${dfClause}` : "";
    const limitClause =
      maxRows != null && maxRows > 0 ? ` LIMIT ${Math.floor(maxRows)}` : "";
    const srcSql = `SELECT ${cols} FROM ${table.includes(".") ? table.split(".").map(p => `"${p}"`).join(".") : `"${table}"`}${where}${limitClause}`;
    const srcRes = await srcClient.query(srcSql, dfParams);
    const rows = srcRes.rows || [];

    if (rows.length === 0) {
      await destClient.query(`CREATE TABLE IF NOT EXISTS ${qualifiedTable} (_biconic_rn BIGSERIAL PRIMARY KEY, __empty text)`);
      return { qualifiedTable, rowCount: 0 };
    }

    const keys = Object.keys(rows[0]).map(normalizeKey);
    const sampleRow = rows[0];
    const origKeys = Object.keys(sampleRow);
    const numCols = origKeys.length;
    const pgBatch = Math.min(PG_INSERT_BATCH, Math.max(1, Math.floor(65000 / numCols)));
    const colDefs = origKeys.map((k, i) => `"${keys[i]}" ${inferPgType(sampleRow[k])}`).join(", ");
    await destClient.query(`DROP TABLE IF EXISTS ${qualifiedTable}`);
    await destClient.query(`CREATE TABLE ${qualifiedTable} (_biconic_rn BIGSERIAL PRIMARY KEY, ${colDefs})`);

    for (let i = 0; i < rows.length; i += pgBatch) {
      const chunk = rows.slice(i, i + pgBatch);
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
    if (ownsDestClient) await destClient.end().catch(() => {});
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
