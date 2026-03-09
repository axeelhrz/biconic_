import { NextRequest, NextResponse } from "next/server";
import mysql from "mysql2/promise";
import { Client as PgClient } from "pg";
import { createClient } from "@/lib/supabase/server";
import { randomUUID } from "crypto";
import { ETL_MAX_ROWS_CEILING } from "@/lib/etl/limits";
import { buildDateFilterWhereFragmentPg, type DateFilterSpec } from "@/lib/sql/helpers";
import { decryptConnectionPassword } from "@/lib/connection-secret";

// --- TIPOS DE DATOS ---
type FilterCondition = {
  column: string;
  operator:
    | "="
    | "!="
    | ">"
    | ">="
    | "<"
    | "<="
    | "contains"
    | "startsWith"
    | "endsWith"
    | "in"
    | "not in"
    | "is null"
    | "is not null";
  value?: string;
};

type JoinCondition = {
  leftTable: string;
  leftColumn: string;
  rightTable: string;
  rightColumn: string;
  joinType: "INNER" | "LEFT" | "RIGHT" | "FULL";
};

type JoinQueryBody = {
  connectionId?: string | number;
  type?: "mysql" | "postgres" | "postgresql" | "excel_file";
  host?: string;
  database?: string;
  user?: string;
  password?: string;
  port?: number;
  ssl?: boolean;
  secondaryConnectionId?: string | number;
  secondaryType?: "mysql" | "postgres" | "postgresql" | "excel_file";
  secondaryHost?: string;
  secondaryDatabase?: string;
  secondaryUser?: string;
  secondaryPassword?: string;
  secondaryPort?: number;
  secondarySsl?: boolean;
  leftTable: string;
  rightTable: string;
  joinConditions: JoinCondition[];
  leftColumns?: string[];
  rightColumns?: string[];
  conditions?: FilterCondition[];
  limit?: number;
  offset?: number;
  count?: boolean;
  /** exact: total exacto (más lento), fast: evita COUNT pesado */
  countMode?: "exact" | "fast";
};

type StarJoin = {
  primaryConnectionId?: string | number;
  primaryTable?: string;
  primaryColumns?: string[];
  joins?: Array<{
    index?: number;
    id?: string;
    secondaryConnectionId?: string | number;
    secondaryTable?: string;
    joinType?: "INNER" | "LEFT" | "RIGHT" | "FULL";
    primaryColumn?: string;
    secondaryColumn?: string;
    secondaryColumns?: string[];
  }>;
  conditions?: FilterCondition[];
  dateFilter?: DateFilterSpec;
  limit?: number;
  offset?: number;
  count?: boolean;
};

// --- FUNCIONES HELPER ---

function quoteIdent(name: string, dbType: "postgres" | "mysql"): string {
  if (!name) return '""';
  return dbType === "postgres"
    ? `"${name.replace(/"/g, '""')}"`
    : `\`${name.replace(/`/g, "``")}\``;
}

function quoteQualified(qname: string, dbType: "postgres" | "mysql"): string {
  if (!qname) return '""';
  const parts = qname.split(".");
  if (parts.length === 1) return quoteIdent(parts[0], dbType);
  return parts.map((p) => quoteIdent(p, dbType)).join(".");
}

/** Obtiene nombres de columnas de una tabla en PostgreSQL (evita p.* / j*.* para alias consistentes). */
async function getTableColumnsPg(
  client: PgClient,
  qualifiedTable: string,
  defaultSchema = "public"
): Promise<string[]> {
  const [schema, table] = qualifiedTable.includes(".")
    ? qualifiedTable.split(".", 2)
    : [defaultSchema, qualifiedTable];
  const res = await client.query(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 ORDER BY ordinal_position`,
    [schema, table]
  );
  return (res.rows || []).map((r: any) => String(r.column_name ?? ""));
}

function buildJoinClause(
  joinConditions: JoinCondition[],
  dbType: "postgres" | "mysql",
  rightTableQualified: string
): string {
  const jt = joinConditions[0]?.joinType || "INNER";
  const onExpr = joinConditions
    .map((jc) => {
      const leftColQuoted = quoteIdent(jc.leftColumn, dbType);
      const rightColQuoted = quoteIdent(jc.rightColumn, dbType);
      return `l.${leftColQuoted} = r.${rightColQuoted}`;
    })
    .join(" AND ");
  return `${jt} JOIN ${rightTableQualified} AS r ON ${onExpr}`;
}

function buildWhereClausePg(conds: FilterCondition[]) {
  const params: any[] = [];
  const parts = conds.map((c) => {
    let col: string;
    const lc = c.column || "";
    const mLeft = lc.match(/^(left|l)\.(.+)$/i);
    const mRight = lc.match(/^(right|r)\.(.+)$/i);
    if (mLeft) col = `l.${quoteIdent(mLeft[2], "postgres")}`;
    else if (mRight) col = `r.${quoteIdent(mRight[2], "postgres")}`;
    else col = `"${lc.replace(/"/g, '""')}"`;
    switch (c.operator) {
      case "is null":
        return `${col} IS NULL`;
      case "is not null":
        return `${col} IS NOT NULL`;
      case "contains":
        params.push(`%${c.value ?? ""}%`);
        return `${col} ILIKE $${params.length}`;
      case "startsWith":
        params.push(`${c.value ?? ""}%`);
        return `${col} ILIKE $${params.length}`;
      case "endsWith":
        params.push(`%${c.value ?? ""}`);
        return `${col} ILIKE $${params.length}`;
      case "in": {
        const list = (c.value ?? "").split(",").map((v) => v.trim());
        const idxs = list.map((v) => {
          params.push(v);
          return `$${params.length}`;
        });
        return `${col} IN (${idxs.join(", ")})`;
      }
      case "not in": {
        const list = (c.value ?? "").split(",").map((v) => v.trim());
        const idxs = list.map((v) => {
          params.push(v);
          return `$${params.length}`;
        });
        return `${col} NOT IN (${idxs.join(", ")})`;
      }
      default: {
        params.push(c.value ?? null);
        return `${col} ${c.operator} $${params.length}`;
      }
    }
  });
  const clause = parts.length ? `WHERE ${parts.join(" AND ")}` : "";
  return { clause, params };
}

function buildWhereClauseMy(conds: FilterCondition[]) {
  const params: any[] = [];
  const parts = conds.map((c) => {
    let col: string;
    const lc = c.column || "";
    const mLeft = lc.match(/^(left|l)\.(.+)$/i);
    const mRight = lc.match(/^(right|r)\.(.+)$/i);
    if (mLeft) col = `l.${quoteIdent(mLeft[2], "mysql")}`;
    else if (mRight) col = `r.${quoteIdent(mRight[2], "mysql")}`;
    else col = `\`${lc.replace(/`/g, "``")}\``;
    switch (c.operator) {
      case "is null":
        return `${col} IS NULL`;
      case "is not null":
        return `${col} IS NOT NULL`;
      case "contains":
        params.push(`%${c.value ?? ""}%`);
        return `${col} LIKE ?`;
      case "startsWith":
        params.push(`${c.value ?? ""}%`);
        return `${col} LIKE ?`;
      case "endsWith":
        params.push(`%${c.value ?? ""}`);
        return `${col} LIKE ?`;
      case "in": {
        const list = (c.value ?? "").split(",").map((v) => v.trim());
        const qs = list.map(() => "?");
        params.push(...list);
        return `${col} IN (${qs.join(", ")})`;
      }
      case "not in": {
        const list = (c.value ?? "").split(",").map((v) => v.trim());
        const qs = list.map(() => "?");
        params.push(...list);
        return `${col} NOT IN (${qs.join(", ")})`;
      }
      default: {
        params.push(c.value ?? null);
        return `${col} ${c.operator} ?`;
      }
    }
  });
  const clause = parts.length ? `WHERE ${parts.join(" AND ")}` : "";
  return { clause, params };
}

function buildWhereClausePgStar(conds: FilterCondition[], joinsCount: number) {
  const params: any[] = [];
  const parts = conds.map((c) => {
    let col: string;
    const raw = c.column || "";
    const mPrimary = raw.match(/^primary\.(.+)$/i);
    const mJoin = raw.match(/^join_(\d+)\.(.+)$/i);
    if (mPrimary) col = `p.${quoteIdent(mPrimary[1], "postgres")}`;
    else if (mJoin) {
      const idx = Number(mJoin[1]);
      const name = mJoin[2];
      if (Number.isNaN(idx) || idx < 0 || idx >= joinsCount)
        col = `"${raw.replace(/"/g, '""')}"`;
      else col = `j${idx}.${quoteIdent(name, "postgres")}`;
    } else col = `"${raw.replace(/"/g, '""')}"`;
    switch (c.operator) {
      case "is null":
        return `${col} IS NULL`;
      case "is not null":
        return `${col} IS NOT NULL`;
      case "contains":
        params.push(`%${c.value ?? ""}%`);
        return `${col} ILIKE $${params.length}`;
      case "startsWith":
        params.push(`${c.value ?? ""}%`);
        return `${col} ILIKE $${params.length}`;
      case "endsWith":
        params.push(`%${c.value ?? ""}`);
        return `${col} ILIKE $${params.length}`;
      case "in": {
        const list = (c.value ?? "").split(",").map((v) => v.trim());
        const idxs = list.map((v) => {
          params.push(v);
          return `$${params.length}`;
        });
        return `${col} IN (${idxs.join(", ")})`;
      }
      case "not in": {
        const list = (c.value ?? "").split(",").map((v) => v.trim());
        const idxs = list.map((v) => {
          params.push(v);
          return `$${params.length}`;
        });
        return `${col} NOT IN (${idxs.join(", ")})`;
      }
      default: {
        params.push(c.value ?? null);
        return `${col} ${c.operator} $${params.length}`;
      }
    }
  });
  const clause = parts.length ? `WHERE ${parts.join(" AND ")}` : "";
  return { clause, params };
}

function normalizeStarConditions(
  conds: FilterCondition[],
  joinsCount: number
): FilterCondition[] {
  return conds.map((c) => {
    const raw = (c.column || "").trim();
    if (/^primary\./i.test(raw)) return c;
    const m = raw.match(/^join_(\d+)\.(.+)$/i);
    if (m) {
      const idx = Number(m[1]);
      if (!Number.isNaN(idx) && idx >= 0 && idx < joinsCount) return c;
    }
    throw new Error(
      `Filtro inválido '${raw}'. En JOIN use prefijos explícitos (primary.<col> o join_n.<col>).`
    );
  });
}

function buildWhereClauseMyStar(conds: FilterCondition[], joinsCount: number) {
  const params: any[] = [];
  const parts = conds.map((c) => {
    let col: string;
    const raw = c.column || "";
    const mPrimary = raw.match(/^primary\.(.+)$/i);
    const mJoin = raw.match(/^join_(\d+)\.(.+)$/i);
    if (mPrimary) col = `p.${quoteIdent(mPrimary[1], "mysql")}`;
    else if (mJoin) {
      const idx = Number(mJoin[1]);
      const name = mJoin[2];
      if (Number.isNaN(idx) || idx < 0 || idx >= joinsCount)
        col = `\`${raw.replace(/`/g, "``")}\``;
      else col = `j${idx}.${quoteIdent(name, "mysql")}`;
    } else col = `\`${raw.replace(/`/g, "``")}\``;
    switch (c.operator) {
      case "is null":
        return `${col} IS NULL`;
      case "is not null":
        return `${col} IS NOT NULL`;
      case "contains":
        params.push(`%${c.value ?? ""}%`);
        return `${col} LIKE ?`;
      case "startsWith":
        params.push(`${c.value ?? ""}%`);
        return `${col} LIKE ?`;
      case "endsWith":
        params.push(`%${c.value ?? ""}`);
        return `${col} LIKE ?`;
      case "in": {
        const list = (c.value ?? "").split(",").map((v) => v.trim());
        const qs = list.map(() => "?");
        params.push(...list);
        return `${col} IN (${qs.join(", ")})`;
      }
      case "not in": {
        const list = (c.value ?? "").split(",").map((v) => v.trim());
        const qs = list.map(() => "?");
        params.push(...list);
        return `${col} NOT IN (${qs.join(", ")})`;
      }
      default: {
        params.push(c.value ?? null);
        return `${col} ${c.operator} ?`;
      }
    }
  });
  const clause = parts.length ? `WHERE ${parts.join(" AND ")}` : "";
  return { clause, params };
}

function buildColumnSelection(
  leftColumns: string[] | undefined,
  rightColumns: string[] | undefined,
  dbType: "postgres" | "mysql"
): string {
  const leftCols =
    leftColumns && leftColumns.length > 0
      ? leftColumns.map((col) => {
          const colQuoted = quoteIdent(col, dbType);
          return `l.${colQuoted} AS ${
            dbType === "postgres"
              ? `"${"left_"}${col.replace(/"/g, '""')}"`
              : `\`${"left_"}${col.replace(/`/g, "``")}\``
          }`;
        })
      : ["l.*"];
  const rightCols =
    rightColumns && rightColumns.length > 0
      ? rightColumns.map((col) => {
          const colQuoted = quoteIdent(col, dbType);
          return `r.${colQuoted} AS ${
            dbType === "postgres"
              ? `"${"right_"}${col.replace(/"/g, '""')}"`
              : `\`${"right_"}${col.replace(/`/g, "``")}\``
          }`;
        })
      : ["r.*"];
  return [...leftCols, ...rightCols].join(", ");
}

async function getPasswordFromSecret(
  secretId: string | null
): Promise<string | null> {
  if (!secretId) return null;
  console.warn(
    `[SECURITY] Usando contraseña placeholder para secret_id: ${secretId}. Implementar obtención segura.`
  );
  return process.env.DB_PASSWORD_PLACEHOLDER || "tu-contraseña-secreta";
}

// --- ROUTE HANDLER PRINCIPAL CON LOGGING ---
export async function POST(req: NextRequest): Promise<NextResponse> {
  const requestId = randomUUID();
  const log = (message: string, data?: object) =>
    console.log(`[ReqID: ${requestId}] ${message}`, data || "");

  log("Petición JOIN recibida.");
  try {
    const body = (await req.json()) as (JoinQueryBody & StarJoin) | null;
    if (!body) {
      log("Error: Cuerpo de la petición vacío.");
      return NextResponse.json(
        { ok: false, error: "Cuerpo vacío" },
        { status: 400 }
      );
    }

    const sanitizedBody = { ...body };
    if (sanitizedBody.password) sanitizedBody.password = "[REDACTED]";
    if (sanitizedBody.secondaryPassword)
      sanitizedBody.secondaryPassword = "[REDACTED]";
    log("Cuerpo de la petición (sanitizado):", sanitizedBody);

    let { limit, offset } = body;
    if (!limit || limit < 1 || limit > ETL_MAX_ROWS_CEILING) limit = 50;
    if (!offset || offset < 0) offset = 0;
    const countMode = body.countMode || "fast";

    log("Autenticando usuario...");
    const supabase = await createClient();
    const {
      data: { user: currentUser },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !currentUser) {
      log("Error de autenticación.", { authError });
      return NextResponse.json(
        { ok: false, error: "No autorizado" },
        { status: 401 }
      );
    }
    log(`Usuario autenticado: ${currentUser.id}`);

    const isStar = !!body.primaryTable || Array.isArray(body.joins);

    if (isStar) {
      log("Iniciando flujo de JOIN 'star-schema'.");
      const {
        primaryConnectionId,
        primaryTable,
        joins,
        primaryColumns,
        conditions,
        count,
        ssl,
      } = body;

      if (!primaryTable || !joins || joins.length === 0) {
        log("Error de validación: Falta tabla principal o joins.");
        return NextResponse.json(
          {
            ok: false,
            error: "Se requiere tabla principal y al menos un JOIN secundario",
          },
          { status: 400 }
        );
      }

      log("Cargando metadatos de conexiones en paralelo...");
      const allConnectionIds = [
        primaryConnectionId,
        ...joins.map((j) => j.secondaryConnectionId),
      ].filter((id): id is string | number => id != null);
      const uniqueConnectionIds = [...new Set(allConnectionIds)];

      const connectionPromises = uniqueConnectionIds.map((id) =>
        supabase
          .from("connections")
          .select("*, db_password_secret_id")
          .eq("id", String(id))
          .eq("user_id", currentUser.id)
          .single()
      );

      const connectionResults = await Promise.all(connectionPromises);
      const connectionsMap = new Map<string, any>();
      for (const result of connectionResults) {
        if (result.error || !result.data) {
          log("Error: No se pudo cargar una de las conexiones.", {
            error: result.error,
          });
          return NextResponse.json(
            {
              ok: false,
              error: `Una de las conexiones requeridas no fue encontrada.`,
            },
            { status: 404 }
          );
        }
        connectionsMap.set(String(result.data.id), result.data);
      }
      log(`${connectionsMap.size} conexiones cargadas desde Supabase.`);

      const primaryConn = connectionsMap.get(String(primaryConnectionId));
      if (!primaryConn) {
        log("Error: Conexión principal no encontrada en el mapa.", {
          primaryConnectionId,
        });
        return NextResponse.json(
          { ok: false, error: "Conexión principal no encontrada" },
          { status: 404 }
        );
      }

      const dbType = (primaryConn.type || "postgres").toLowerCase();
      log(`Tipo de base de datos determinada: ${dbType}`);

      // --- LÓGICA DE BIFURCACIÓN BASADA EN EL TIPO DE BD ---
      const joinsConnections = (joins || []).map((jn) =>
        connectionsMap.get(String(jn.secondaryConnectionId))
      );
      const hasFirebirdInChain = [primaryConn, ...joinsConnections].some(
        (c: any) => String(c?.type || "").toLowerCase() === "firebird"
      );
      const sameConnectionChain =
        (joins || []).every(
          (jn) => String(jn.secondaryConnectionId ?? "") === String(primaryConnectionId ?? "")
        );
      const useInMemoryStarJoin = hasFirebirdInChain || !sameConnectionChain;

      if (useInMemoryStarJoin) {
        log("Iniciando flujo de JOIN star en memoria (Firebird/cross-connection).");
        try {
          const sourceLimit = Math.min(
            ETL_MAX_ROWS_CEILING,
            Math.max((offset ?? 0) + (limit ?? 50) * 8, 2000)
          );
          const normalizeKey = (k: string) =>
            String(k || "").replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase();
          const normalizeRow = (row: Record<string, any>) => {
            const out: Record<string, any> = {};
            for (const key of Object.keys(row || {})) out[normalizeKey(key)] = row[key];
            return out;
          };
          const getByColumnName = (row: Record<string, any>, col: string) => {
            const n = normalizeKey(col);
            if (row[n] !== undefined) return row[n];
            for (const k of Object.keys(row)) if (normalizeKey(k) === n) return row[k];
            return undefined;
          };
          const firebirdSafePart = (s: string) =>
            /^[A-Z0-9_]+$/i.test(String(s).trim())
              ? String(s).trim().toUpperCase()
              : `"${String(s).trim().replace(/"/g, '""')}"`;
          const resolvePhysicalIfExcel = async (conn: any, table: string) => {
            if (String(conn?.type || "").toLowerCase() !== "excel_file") return table;
            const { data: meta, error: mErr } = await supabase
              .from("data_tables")
              .select("physical_schema_name, physical_table_name")
              .eq("connection_id", String(conn.id))
              .single();
            if (mErr || !meta?.physical_table_name) {
              throw new Error(`Metadatos de tabla física no encontrados para conexión ${conn.id}`);
            }
            return `${meta.physical_schema_name || "data_warehouse"}.${meta.physical_table_name}`;
          };
          const fetchRowsFromConn = async (
            conn: any,
            table: string,
            columns?: string[]
          ): Promise<Record<string, any>[]> => {
            const cType = String(conn?.type || "").toLowerCase();
            const resolvedTable = await resolvePhysicalIfExcel(conn, table);
            if (cType === "firebird") {
              const Firebird = require("node-firebird");
              let pwd =
                (conn as any).db_password_encrypted
                  ? decryptConnectionPassword((conn as any).db_password_encrypted)
                  : (conn as any).db_password ?? "";
              if (!pwd) {
                pwd = (await getPasswordFromSecret((conn as any).db_password_secret_id)) || "";
              }
              const opts = {
                host: conn.db_host || "localhost",
                port: conn.db_port ? Number(conn.db_port) : 15421,
                database: conn.db_name,
                user: conn.db_user,
                password: pwd || process.env.FLEXXUS_PASSWORD || process.env.DB_PASSWORD_PLACEHOLDER || "",
                lowercase_keys: false,
              };
              const tablePart = resolvedTable.includes(".")
                ? (resolvedTable.split(".").pop() || resolvedTable).trim().toUpperCase()
                : firebirdSafePart(resolvedTable);
              const cols = columns?.length ? columns.map((c) => firebirdSafePart(c)).join(", ") : "*";
              return await new Promise<Record<string, any>[]>((resolve, reject) => {
                Firebird.attach(opts, (err: Error | null, db: any) => {
                  if (err) return reject(err);
                  const sql = `SELECT FIRST ${sourceLimit} ${cols} FROM ${tablePart}`;
                  db.query(sql, [], (qErr: Error | null, rows: any[]) => {
                    if (db?.detach) try { db.detach(() => {}); } catch (_) {}
                    if (qErr) return reject(qErr);
                    resolve((rows || []).map(normalizeRow));
                  });
                });
              });
            }

            const password =
              body.password ||
              (conn.db_password_encrypted
                ? await getPasswordFromSecret(conn.db_password_secret_id)
                : conn.db_password || "");
            const connectionString =
              cType === "excel_file"
                ? process.env.SUPABASE_DB_URL
                : `postgres://${conn.db_user}:${encodeURIComponent(String(password || ""))}@${conn.db_host}:${conn.db_port || 5432}/${conn.db_name}?sslmode=require`;
            if (!connectionString) throw new Error("No se pudo resolver la conexión para JOIN en memoria.");
            const client = new PgClient({ connectionString, connectionTimeoutMillis: 12000, statement_timeout: 600000 });
            await client.connect();
            try {
              const sel = columns?.length ? columns.map((c) => quoteIdent(c, "postgres")).join(", ") : "*";
              const q = `SELECT ${sel} FROM ${quoteQualified(resolvedTable, "postgres")} LIMIT ${sourceLimit}`;
              const res = await client.query(q);
              return (res.rows || []).map((r: any) => normalizeRow(r));
            } finally {
              await client.end().catch(() => {});
            }
          };
          const mapPrefixedValue = (row: Record<string, any>, ref: string) => {
            const raw = (ref || "").trim();
            if (/^primary\./i.test(raw)) return row[`primary_${raw.replace(/^primary\./i, "").trim()}`];
            const jm = raw.match(/^join_(\d+)\.(.+)$/i);
            if (jm) return row[`join_${Number(jm[1])}_${jm[2].trim()}`];
            return row[`primary_${raw}`];
          };
          const passesCondition = (row: Record<string, any>, cond: FilterCondition) => {
            const raw = String(cond.column || "").trim();
            const value = /^primary\./i.test(raw) || /^join_\d+\./i.test(raw)
              ? mapPrefixedValue(row, raw)
              : row[raw];
            const opVal = cond.value ?? "";
            switch (cond.operator) {
              case "is null":
                return value == null;
              case "is not null":
                return value != null;
              case "contains":
                return String(value ?? "").toLowerCase().includes(String(opVal).toLowerCase());
              case "startsWith":
                return String(value ?? "").toLowerCase().startsWith(String(opVal).toLowerCase());
              case "endsWith":
                return String(value ?? "").toLowerCase().endsWith(String(opVal).toLowerCase());
              case "in": {
                const list = String(opVal).split(",").map((v) => v.trim().toLowerCase()).filter(Boolean);
                return list.includes(String(value ?? "").trim().toLowerCase());
              }
              case "not in": {
                const list = String(opVal).split(",").map((v) => v.trim().toLowerCase()).filter(Boolean);
                return !list.includes(String(value ?? "").trim().toLowerCase());
              }
              case "=":
                return String(value ?? "") === String(opVal ?? "");
              case "!=":
                return String(value ?? "") !== String(opVal ?? "");
              case ">":
                return Number(value) > Number(opVal);
              case ">=":
                return Number(value) >= Number(opVal);
              case "<":
                return Number(value) < Number(opVal);
              case "<=":
                return Number(value) <= Number(opVal);
              default:
                return true;
            }
          };
          const passesDateFilter = (row: Record<string, any>, df?: DateFilterSpec) => {
            if (!df?.column) return true;
            const raw = mapPrefixedValue(row, df.column);
            if (raw == null || raw === "") return false;
            const d = new Date(raw as any);
            if (Number.isNaN(d.getTime())) return false;
            const y = d.getUTCFullYear();
            const m = d.getUTCMonth() + 1;
            if (Array.isArray(df.years) && df.years.length > 0 && !df.years.includes(y)) return false;
            if (Array.isArray(df.months) && df.months.length > 0 && !df.months.includes(m)) return false;
            if (Array.isArray(df.exactDates) && df.exactDates.length > 0) {
              const iso = d.toISOString().slice(0, 10);
              if (!df.exactDates.includes(iso)) return false;
            }
            return true;
          };

          const primaryTableResolved = await resolvePhysicalIfExcel(primaryConn, primaryTable || "");
          const primaryRowsRaw = await fetchRowsFromConn(primaryConn, primaryTableResolved, primaryColumns);
          const primaryCols =
            primaryColumns && primaryColumns.length > 0
              ? primaryColumns
              : primaryRowsRaw[0]
              ? Object.keys(primaryRowsRaw[0])
              : [];
          let joinedRows: Record<string, any>[] = primaryRowsRaw.map((r) => {
            const out: Record<string, any> = {};
            for (const c of primaryCols) out[`primary_${c}`] = getByColumnName(r, c);
            return out;
          });

          for (let idx = 0; idx < (joins || []).length; idx++) {
            const jn = joins[idx];
            const secConn = connectionsMap.get(String(jn.secondaryConnectionId));
            if (!secConn) throw new Error(`Conexión secundaria no encontrada para join_${idx}`);
            const secTableResolved = await resolvePhysicalIfExcel(secConn, jn.secondaryTable || "");
            const secRowsRaw = await fetchRowsFromConn(secConn, secTableResolved, jn.secondaryColumns);
            const secCols =
              jn.secondaryColumns && jn.secondaryColumns.length > 0
                ? jn.secondaryColumns
                : secRowsRaw[0]
                ? Object.keys(secRowsRaw[0])
                : [];
            const rightCol = String(jn.secondaryColumn || "").trim();
            const leftRef = String(jn.primaryColumn || "").trim();
            const joinType = String(jn.joinType || "INNER").toUpperCase();
            const rightMap = new Map<string, Record<string, any>[]>();
            const rightUsed = new Set<number>();
            secRowsRaw.forEach((rr, rrIdx) => {
              const key = String(getByColumnName(rr, rightCol) ?? "");
              const withIdx = { ...rr, __rrIdx__: rrIdx };
              if (!rightMap.has(key)) rightMap.set(key, []);
              rightMap.get(key)!.push(withIdx);
            });

            const previousKeys = joinedRows[0] ? Object.keys(joinedRows[0]) : [];
            const nextRows: Record<string, any>[] = [];
            for (const lr of joinedRows) {
              const lk = String(mapPrefixedValue(lr, leftRef) ?? "");
              const matches = rightMap.get(lk) ?? [];
              if (matches.length > 0) {
                for (const rr of matches) {
                  if (rr.__rrIdx__ != null) rightUsed.add(Number(rr.__rrIdx__));
                  const prefRight: Record<string, any> = {};
                  for (const c of secCols) prefRight[`join_${idx}_${c}`] = getByColumnName(rr, c);
                  nextRows.push({ ...lr, ...prefRight });
                }
              } else if (joinType === "LEFT" || joinType === "FULL") {
                const nulls: Record<string, any> = {};
                for (const c of secCols) nulls[`join_${idx}_${c}`] = null;
                nextRows.push({ ...lr, ...nulls });
              }
            }

            if (joinType === "RIGHT" || joinType === "FULL") {
              for (let rrIdx = 0; rrIdx < secRowsRaw.length; rrIdx++) {
                if (rightUsed.has(rrIdx)) continue;
                const rr = secRowsRaw[rrIdx];
                const leftNulls: Record<string, any> = {};
                previousKeys.forEach((k) => (leftNulls[k] = null));
                const prefRight: Record<string, any> = {};
                for (const c of secCols) prefRight[`join_${idx}_${c}`] = getByColumnName(rr, c);
                nextRows.push({ ...leftNulls, ...prefRight });
              }
            }
            joinedRows = nextRows;
          }

          const filteredRows = joinedRows
            .filter((r) => (conditions || []).every((c) => passesCondition(r, c)))
            .filter((r) => passesDateFilter(r, body.dateFilter));
          const totalOut = count ? filteredRows.length : undefined;
          const rowsPage = filteredRows.slice(offset ?? 0, (offset ?? 0) + (limit ?? 50));
          return NextResponse.json({ ok: true, rows: rowsPage, total: totalOut });
        } catch (e: any) {
          log("Error en JOIN star en memoria.", {
            message: e?.message,
            stack: e?.stack,
          });
          return NextResponse.json(
            { ok: false, error: `Error en JOIN múltiple en memoria: ${e?.message || "Error inesperado"}` },
            { status: 500 }
          );
        }
      }

      if (dbType === "excel_file") {
        log("Detectado tipo 'excel_file'. Iniciando flujo de JOIN interno.");
        const dbUrl = process.env.SUPABASE_DB_URL;
        if (!dbUrl) {
          log(
            "Error crítico: SUPABASE_DB_URL no está configurada en el entorno."
          );
          return NextResponse.json(
            {
              ok: false,
              error: "Configuración de base de datos interna no disponible",
            },
            { status: 500 }
          );
        }

        const client = new PgClient({
          connectionString: dbUrl,
          connectionTimeoutMillis: 8000,
        });
        try {
          log(
            "Conectando a la base de datos interna de Supabase para JOIN de Excel..."
          );
          await client.connect();
          log("Conexión a BD interna establecida.");

          const resolvePhysical = async (connId: string | number) => {
            const { data: meta, error: mErr } = await supabase
              .from("data_tables")
              .select("physical_schema_name, physical_table_name")
              .eq("connection_id", String(connId))
              .single();
            if (mErr || !meta)
              throw new Error(
                `Metadatos de tabla física no encontrados para conexión ${connId}`
              );
            return `${meta.physical_schema_name || "data_warehouse"}.${
              meta.physical_table_name
            }`;
          };

          log("Resolviendo nombres de tablas físicas...");
          const pPhysical = await resolvePhysical(primaryConnectionId!);
          const jPhysicals = await Promise.all(
            joins.map((jn) => resolvePhysical(jn.secondaryConnectionId!))
          );
          log("Nombres de tablas físicas resueltos.", {
            pPhysical,
            jPhysicals,
          });

          const pQualified = quoteQualified(pPhysical, "postgres");
          const jQualified = jPhysicals.map((q) =>
            quoteQualified(q, "postgres")
          );

          const selectParts: string[] = [];
          let primaryCols = primaryColumns && primaryColumns.length > 0 ? primaryColumns : [];
          if (primaryCols.length === 0) {
            try {
              primaryCols = await getTableColumnsPg(client, pPhysical, "data_warehouse");
            } catch (e) {
              log("No se pudieron obtener columnas de la tabla principal, usando p.*", e instanceof Error ? { message: e.message } : { error: String(e) });
            }
          }
          if (primaryCols.length > 0)
            primaryCols.forEach((col) =>
              selectParts.push(
                `p.${quoteIdent(col, "postgres")} AS "primary_${col.replace(
                  /"/g,
                  '""'
                )}"`
              )
            );
          else selectParts.push("p.*");
          for (let idx = 0; idx < joins.length; idx++) {
            const jn = joins[idx];
            let secCols = jn.secondaryColumns && jn.secondaryColumns.length > 0 ? jn.secondaryColumns : [];
            if (secCols.length === 0 && jPhysicals[idx]) {
              try {
                secCols = await getTableColumnsPg(client, jPhysicals[idx] as string, "data_warehouse");
              } catch (e) {
                log(`No se pudieron obtener columnas del join ${idx}, usando j${idx}.*`, e instanceof Error ? { message: e.message } : { error: String(e) });
              }
            }
            if (secCols.length > 0)
              secCols.forEach((col) =>
                selectParts.push(
                  `j${idx}.${quoteIdent(
                    col,
                    "postgres"
                  )} AS "join_${idx}_${col.replace(/"/g, '""')}"`
                )
              );
            else selectParts.push(`j${idx}.*`);
          }

          let fromJoin = `FROM ${pQualified} AS p`;
          joins.forEach((jn, idx) => {
            const jt = (jn.joinType || "INNER").toUpperCase();
            const pc = (jn.primaryColumn || "").trim();
            let leftAlias = "p";
            let leftCol = pc;
            if (pc.includes(".")) {
              if (/^primary\./i.test(pc)) {
                leftCol = pc.replace(/^primary\./i, "").trim();
              } else {
                const m = pc.match(/^join_(\d+)\.(.+)$/i);
                if (m) {
                  const i = Number(m[1]);
                  if (!Number.isNaN(i) && i >= 0 && i < idx) {
                    leftAlias = `j${i}`;
                    leftCol = m[2].trim();
                  }
                }
              }
            }
            const on = `${leftAlias}.${quoteIdent(
              leftCol,
              "postgres"
            )} = j${idx}.${quoteIdent(jn.secondaryColumn || "", "postgres")}`;
            fromJoin += ` ${jt} JOIN ${jQualified[idx]} AS j${idx} ON ${on}`;
          });

          const normalizedConditions = normalizeStarConditions(
            conditions || [],
            joins.length
          );
          const { clause, params } = buildWhereClausePgStar(
            normalizedConditions,
            joins.length
          );
          const { clause: dfClause, params: dfParams } = buildDateFilterWhereFragmentPg(
            body.dateFilter,
            params.length + 1,
            "p.",
            joins.length
          );
          const mergedClause = dfClause ? (clause ? `${clause} AND ${dfClause}` : `WHERE ${dfClause}`) : clause;
          const mergedParams = [...params, ...dfParams];
          const sql = `SELECT ${selectParts.join(
            ", "
          )} ${fromJoin} ${mergedClause} LIMIT $${mergedParams.length + 1} OFFSET $${
            mergedParams.length + 2
          }`;
          log("Ejecutando consulta JOIN de Excel:", {
            sql,
            params: [...mergedParams, limit, offset],
          });

          const resDb = await client.query(sql, [...mergedParams, limit, offset]);
          log(
            `Consulta de Excel ejecutada, ${resDb.rowCount} filas obtenidas.`
          );

          let totalOut: number | undefined = undefined;
          if (count) {
            if (countMode === "exact") {
              const countSql = `SELECT COUNT(*)::int as c ${fromJoin} ${mergedClause}`;
              log("Ejecutando consulta de conteo de Excel:", {
                sql: countSql,
                params: mergedParams,
              });
              const cntRes = await client.query(countSql, mergedParams);
              totalOut = cntRes.rows?.[0]?.c ?? 0;
              log(`Conteo de Excel ejecutado, total: ${totalOut}.`);
            } else {
              const rowsLen = resDb.rows?.length ?? 0;
              totalOut = rowsLen < (limit ?? 0) ? (offset ?? 0) + rowsLen : undefined;
            }
          }
          return NextResponse.json({
            ok: true,
            rows: resDb.rows,
            total: totalOut,
          });
        } catch (e: any) {
          log("Error durante la operación con JOIN de Excel.", {
            message: e.message,
            code: e.code,
            stack: e.stack,
          });
          return NextResponse.json(
            { ok: false, error: `Error en JOIN de Excel: ${e.message}` },
            { status: 500 }
          );
        } finally {
          log("Cerrando conexión a BD interna de Supabase.");
          await client
            .end()
            .catch((err) => log("Error al cerrar cliente PG para Excel.", err instanceof Error ? { message: err.message } : { error: String(err) }));
        }
      } else if (dbType === "postgres" || dbType === "postgresql") {
        log("Detectado tipo 'postgres'. Iniciando flujo de JOIN externo.");
        const password =
          body.password ||
          (await getPasswordFromSecret(primaryConn.db_password_secret_id));
        if (!password) {
          log(
            "Error: No se pudo obtener la contraseña para la conexión PostgreSQL."
          );
          return NextResponse.json(
            { ok: false, error: "Contraseña requerida para la conexión" },
            { status: 400 }
          );
        }

        const pgConfig = {
          host: primaryConn.db_host,
          user: primaryConn.db_user,
          database: primaryConn.db_name,
          port: primaryConn.db_port || 5432,
          password: password,
          connectionTimeoutMillis: 8000,
          ssl: ssl ? { rejectUnauthorized: false } : undefined,
        };
        log("Configuración de conexión PostgreSQL:", {
          ...pgConfig,
          password: "[REDACTED]",
        });

        const client = new PgClient(pgConfig);
        try {
          log("Intentando conectar a PostgreSQL externo...");
          await client.connect();
          log("Conexión a PostgreSQL externo establecida.");

          const pQualified = quoteQualified(primaryTable, "postgres");
          const jQualified = joins.map((jn) =>
            quoteQualified(jn.secondaryTable || "", "postgres")
          );

          const selectParts: string[] = [];
          let primaryCols = primaryColumns && primaryColumns.length > 0 ? primaryColumns : [];
          if (primaryCols.length === 0) {
            try {
              primaryCols = await getTableColumnsPg(client, primaryTable, "public");
            } catch (e) {
              log("No se pudieron obtener columnas de la tabla principal, usando p.*", e instanceof Error ? { message: e.message } : { error: String(e) });
            }
          }
          if (primaryCols.length > 0)
            primaryCols.forEach((col) =>
              selectParts.push(
                `p.${quoteIdent(col, "postgres")} AS "primary_${col.replace(
                  /"/g,
                  '""'
                )}"`
              )
            );
          else selectParts.push("p.*");
          for (let idx = 0; idx < joins.length; idx++) {
            const jn = joins[idx];
            let secCols = jn.secondaryColumns && jn.secondaryColumns.length > 0 ? jn.secondaryColumns : [];
            if (secCols.length === 0 && jn.secondaryTable) {
              try {
                secCols = await getTableColumnsPg(client, jn.secondaryTable, "public");
              } catch (e) {
                log(`No se pudieron obtener columnas del join ${idx}, usando j${idx}.*`, e instanceof Error ? { message: e.message } : { error: String(e) });
              }
            }
            if (secCols.length > 0)
              secCols.forEach((col) =>
                selectParts.push(
                  `j${idx}.${quoteIdent(
                    col,
                    "postgres"
                  )} AS "join_${idx}_${col.replace(/"/g, '""')}"`
                )
              );
            else selectParts.push(`j${idx}.*`);
          }

          let fromJoin = `FROM ${pQualified} AS p`;
          joins.forEach((jn, idx) => {
            const jt = (jn.joinType || "INNER").toUpperCase();
            const pc = (jn.primaryColumn || "").trim();
            let leftAlias = "p";
            let leftCol = pc;
            if (pc.includes(".")) {
              if (/^primary\./i.test(pc)) {
                leftCol = pc.replace(/^primary\./i, "").trim();
              } else {
                const m = pc.match(/^join_(\d+)\.(.+)$/i);
                if (m) {
                  const i = Number(m[1]);
                  if (!Number.isNaN(i) && i >= 0 && i < idx) {
                    leftAlias = `j${i}`;
                    leftCol = m[2].trim();
                  }
                }
              }
            }
            const on = `${leftAlias}.${quoteIdent(
              leftCol,
              "postgres"
            )} = j${idx}.${quoteIdent(jn.secondaryColumn || "", "postgres")}`;
            fromJoin += ` ${jt} JOIN ${jQualified[idx]} AS j${idx} ON ${on}`;
          });

          const normalizedConditions = normalizeStarConditions(
            conditions || [],
            joins.length
          );
          const { clause, params } = buildWhereClausePgStar(
            normalizedConditions,
            joins.length
          );
          const { clause: dfClause, params: dfParams } = buildDateFilterWhereFragmentPg(
            body.dateFilter,
            params.length + 1,
            "p.",
            joins.length
          );
          const mergedClause = dfClause ? (clause ? `${clause} AND ${dfClause}` : `WHERE ${dfClause}`) : clause;
          const mergedParams = [...params, ...dfParams];
          const sql = `SELECT ${selectParts.join(
            ", "
          )} ${fromJoin} ${mergedClause} LIMIT $${mergedParams.length + 1} OFFSET $${
            mergedParams.length + 2
          }`;
          log("Ejecutando consulta de datos en PostgreSQL:", {
            sql,
            params: [...mergedParams, limit, offset],
          });

          const resDb = await client.query(sql, [...mergedParams, limit, offset]);
          log(
            `Consulta de datos ejecutada, ${resDb.rowCount} filas obtenidas.`
          );

          let totalOut: number | undefined = undefined;
          if (count) {
            if (countMode === "exact") {
              const countSql = `SELECT COUNT(*)::int as c ${fromJoin} ${mergedClause}`;
              log("Ejecutando consulta de conteo en PostgreSQL:", {
                sql: countSql,
                params: mergedParams,
              });
              const cntRes = await client.query(countSql, mergedParams);
              totalOut = cntRes.rows?.[0]?.c ?? 0;
              log(`Consulta de conteo ejecutada, total: ${totalOut}.`);
            } else {
              const rowsLen = resDb.rows?.length ?? 0;
              totalOut = rowsLen < (limit ?? 0) ? (offset ?? 0) + rowsLen : undefined;
            }
          }
          return NextResponse.json({
            ok: true,
            rows: resDb.rows,
            total: totalOut,
          });
        } catch (e: any) {
          log("Error durante la operación con PostgreSQL externo.", {
            message: e.message,
            code: e.code,
            stack: e.stack,
          });
          return NextResponse.json(
            {
              ok: false,
              error: `Error de base de datos externa: ${e.message}`,
            },
            { status: 500 }
          );
        } finally {
          log("Cerrando conexión a PostgreSQL externo.");
          await client
            .end()
            .catch((err) => log("Error al cerrar cliente PG.", err instanceof Error ? { message: err.message } : { error: String(err) }));
        }
      } else if (dbType === "mysql") {
        log("Detectado tipo 'mysql'. Iniciando flujo de JOIN externo.");
        // Similar al de Postgres, pero con el cliente de MySQL
        const password =
          body.password ||
          (await getPasswordFromSecret(primaryConn.db_password_secret_id));
        if (!password) {
          log(
            "Error: No se pudo obtener la contraseña para la conexión MySQL."
          );
          return NextResponse.json(
            { ok: false, error: "Contraseña requerida para la conexión" },
            { status: 400 }
          );
        }

        const mysqlConfig = {
          host: primaryConn.db_host,
          user: primaryConn.db_user,
          database: primaryConn.db_name,
          port: primaryConn.db_port || 3306,
          password: password,
          connectTimeout: 8000,
          ssl: ssl ? { rejectUnauthorized: false } : undefined,
        };
        log("Configuración de conexión MySQL:", {
          ...mysqlConfig,
          password: "[REDACTED]",
        });

        let connection;
        try {
          log("Intentando conectar a MySQL externo...");
          connection = await mysql.createConnection(mysqlConfig);
          log("Conexión a MySQL externo establecida.");

          // Lógica para construir y ejecutar la consulta MySQL
          // (Omitida por brevedad, pero seguiría el mismo patrón que la de PostgreSQL)

          return NextResponse.json(
            {
              ok: false,
              error:
                "La lógica para MySQL JOIN no está completamente implementada.",
            },
            { status: 501 }
          );
        } catch (e: any) {
          log("Error durante la operación con MySQL externo.", {
            message: e.message,
            code: e.code,
            stack: e.stack,
          });
          return NextResponse.json(
            {
              ok: false,
              error: `Error de base de datos externa: ${e.message}`,
            },
            { status: 500 }
          );
        } finally {
          log("Cerrando conexión a MySQL externo.");
          if (connection) await connection.end();
        }
      } else {
        log("Error: Tipo de base de datos no soportado en flujo star-schema.", {
          dbType,
        });
        return NextResponse.json(
          {
            ok: false,
            error: `Tipo de base de datos '${dbType}' no soportado`,
          },
          { status: 400 }
        );
      }
    }

    // --- RUTA LEGACY (BINARIA) ---
    log("Iniciando flujo de JOIN 'legacy' (binario).");
    // La lógica legacy original iría aquí.

    log(
      "Error: La petición no coincidió con ninguna ruta de ejecución (star o legacy)."
    );
    return NextResponse.json(
      { ok: false, error: "Ruta de ejecución no encontrada." },
      { status: 400 }
    );
  } catch (err: any) {
    log("Error no capturado en el handler principal.", {
      message: err.message,
      stack: err.stack,
    });
    return NextResponse.json(
      { ok: false, error: err.message || "Error inesperado en el servidor" },
      { status: 500 }
    );
  }
}
