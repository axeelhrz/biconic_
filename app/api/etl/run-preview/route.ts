import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { decryptConnectionPassword } from "@/lib/connection-secret";
import { Client as PgClient } from "pg";
import {
  quoteIdent,
  quoteQualified,
  buildWhereClausePg,
  buildWhereClausePgStar,
  buildJoinClauseBinary,
  buildWhereClauseFirebird,
} from "@/lib/sql/helpers";
import {
  applyCleanBatch,
  applyCastConversions,
  applyArithmeticOperations,
  applyConditionRules,
  applyCountAggregation,
  inferColumnTypes,
  CastTargetType
} from "@/lib/etl/transformations";

// Reuse types from run/route.ts (duplicated here for independence)
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

type RunBody = {
  etlId?: string;
  connectionId?: string;
  filter?: {
    table?: string;
    columns?: string[];
    conditions?: FilterCondition[];
  };
  join?: {
    connectionId: string;
    secondaryConnectionId?: string;
    leftTable: string;
    rightTable: string;
    joinConditions: JoinCondition[];
    leftColumns?: string[];
    rightColumns?: string[];
  };
  union?: {
    left: {
      connectionId: string;
      filter?: { table?: string; columns?: string[]; conditions?: FilterCondition[] };
    };
    right: {
      connectionId: string;
      filter?: { table?: string; columns?: string[]; conditions?: FilterCondition[] };
    };
    unionAll?: boolean;
  };
  clean?: {
    transforms: Array<
      | { column: string; op: "trim" | "upper" | "lower" | "cast_number" | "cast_date" }
      | { column: string; op: "replace"; find: string; replaceWith: string }
      | { column: string; op: "replace_value"; find: string; replaceWith: string }
      | { column: string; op: "normalize_nulls"; patterns: string[]; action: "null" | "replace"; replacement?: string }
      | { column: string; op: "normalize_spaces" | "strip_invisible" | "utf8_normalize" }
    >;
    dedupe?: { keyColumns: string[]; keep: "first" | "last" };
  };
  cast?: {
    conversions: Array<{
      column: string;
      targetType:
        | "number"
        | "integer"
        | "decimal"
        | "string"
        | "boolean"
        | "date"
        | "datetime";
      inputFormat?: string | null;
      outputFormat?: string | null;
    }>;
  };
  count?: {
    attribute: string;
    resultColumn?: string;
  };
  arithmetic?: {
    operations: Array<{
      id: string;
      leftOperand: { type: "column" | "constant"; value: string };
      operator: "+" | "-" | "*" | "/" | "%" | "^" | "pct_of" | "pct_off";
      rightOperand: { type: "column" | "constant"; value: string };
      resultColumn: string;
    }>;
  };
  condition?: {
    resultColumn?: string;
    defaultResultValue?: string;
    rules: Array<{
      id: string;
      column?: string;
      operator?: string;
      value?: string | number | boolean;
      outputValue?: string;
      outputColumn?: string;
      leftOperand?: { type: "column" | "constant"; value: string };
      rightOperand?: { type: "column" | "constant"; value: string };
      comparator?: string;
      resultColumn?: string;
      outputType?: "boolean" | "string" | "number";
      thenValue?: string;
      elseValue?: string;
      shouldFilter?: boolean;
    }>;
  };
  pipeline?: Array<{
    type: "clean" | "cast" | "arithmetic" | "condition";
    config: any;
  }>;
  inferTypes?: boolean;
  limit?: number;
};

















// Helpers imported from @/lib/etl/transformations

export async function POST(req: NextRequest) {
  let body: RunBody | null = null;
  const PREVIEW_LIMIT = 1000;

  try {
    body = (await req.json()) as RunBody | null;
    if (!body) throw new Error("Cuerpo vacío");

    const supabaseAdmin = await createClient();
    const {
      data: { user },
    } = await supabaseAdmin.auth.getUser();
    if (!user) throw new Error("No autorizado");

    // Generator restricted to a HARD LIMIT of 1000 rows
    async function* dataSourceGenerator() {
      if (!body) return;

      const filter = body.filter;
      const joinConf = body.join;
      const unionConf = body.union;

      const getPasswordFromSecret = async (secretId: string | null) => {
        if (!secretId) return null;
        return process.env.DB_PASSWORD_PLACEHOLDER || "tu-contraseña-secreta";
      };

      if (unionConf?.left?.connectionId && unionConf?.right?.connectionId) {
        const left = unionConf.left;
        const right = unionConf.right;
        const resolveTable = async (connId: string, f?: { table?: string }) => {
          const { data: c } = await supabaseAdmin.from("connections").select("*").eq("id", connId).single();
          if (!c) throw new Error(`Conexión ${connId} no encontrada.`);
          if (c.type === "excel_file") {
            const { data: meta } = await supabaseAdmin.from("data_tables").select("physical_schema_name, physical_table_name").eq("connection_id", connId).single();
            if (!meta?.physical_table_name) throw new Error(`Sin tabla física para conexión Excel ${connId}.`);
            return `${meta.physical_schema_name || "data_warehouse"}.${meta.physical_table_name}`;
          }
          return (f?.table || "").trim() || "";
        };
        const leftTable = await resolveTable(left.connectionId, left.filter);
        const rightTable = await resolveTable(right.connectionId, right.filter);
        if (!leftTable || !rightTable) throw new Error("UNION: ambas fuentes deben tener tabla.");

        const { data: leftConn } = await supabaseAdmin.from("connections").select("*").eq("id", left.connectionId).single();
        const { data: rightConn } = await supabaseAdmin.from("connections").select("*").eq("id", right.connectionId).single();
        if (!leftConn) throw new Error(`Conexión izquierda ${left.connectionId} no encontrada.`);
        if (!rightConn) throw new Error(`Conexión derecha ${right.connectionId} no encontrada.`);

        const buildPgUrl = (conn: { db_host?: string | null; db_user?: string | null; db_port?: number | null; db_name?: string | null; db_password_encrypted?: string | null }) => {
          if (!conn.db_host || !conn.db_user || !conn.db_name) throw new Error("Conexión sin host, usuario o base de datos.");
          const password = decryptConnectionPassword(conn.db_password_encrypted);
          const port = conn.db_port ?? 5432;
          return `postgres://${conn.db_user}:${encodeURIComponent(password)}@${conn.db_host}:${port}/${conn.db_name}?sslmode=require`;
        };

        const leftType = (leftConn.type || "").toLowerCase();
        let dbUrlUnion: string | null = null;
        if (leftType === "excel_file") {
          dbUrlUnion = process.env.SUPABASE_DB_URL || null;
          if (!dbUrlUnion) throw new Error("Para vista previa UNION con archivos Excel configurá la variable de entorno SUPABASE_DB_URL.");
        } else if (leftType === "postgres" || leftType === "postgresql") {
          dbUrlUnion = buildPgUrl(leftConn);
        }
        // Si izquierda es firebird, dbUrlUnion queda null (solo se usan clientes Firebird para esa rama)

        const runOne = async (client: PgClient, src: typeof left, tableQ: string) => {
          const { clause, params } = buildWhereClausePg(src.filter?.conditions || []);
          const sel = src.filter?.columns?.length ? src.filter.columns.map((c: string) => quoteIdent(c)).join(", ") : "*";
          const q = `SELECT ${sel} FROM ${quoteQualified(tableQ)} ${clause} ORDER BY 1 ASC LIMIT ${Math.floor(PREVIEW_LIMIT / 2)}`;
          const res = await client.query(q, params);
          return (res.rows || []).map((r: Record<string, any>) => {
            const out: Record<string, any> = {};
            for (const k in r) out[k.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase()] = r[k];
            return out;
          });
        };

        const runUnionOnePg = async (client: PgClient, leftSrc: typeof left, rightSrc: typeof right, leftTableQ: string, rightTableQ: string) => {
          const { clause: leftClause, params: leftParams } = buildWhereClausePg(leftSrc.filter?.conditions || []);
          const { clause: rightClause, params: rightParams } = buildWhereClausePg(rightSrc.filter?.conditions || []);
          const rightClauseOffset = rightParams.length
            ? rightClause.replace(/\$(\d+)/g, (_: string, n: string) => `$${Number(n) + leftParams.length}`)
            : rightClause;
          const leftSel = leftSrc.filter?.columns?.length ? leftSrc.filter.columns.map((c: string) => quoteIdent(c)).join(", ") : "*";
          const rightSel = rightSrc.filter?.columns?.length ? rightSrc.filter.columns.map((c: string) => quoteIdent(c)).join(", ") : "*";
          const leftQ = `SELECT ${leftSel} FROM ${quoteQualified(leftTableQ)} ${leftClause}`;
          const rightQ = `SELECT ${rightSel} FROM ${quoteQualified(rightTableQ)} ${rightClauseOffset}`;
          const unionSql = `(${leftQ}) UNION ALL (${rightQ}) ORDER BY 1 ASC LIMIT ${PREVIEW_LIMIT}`;
          const res = await client.query(unionSql, [...leftParams, ...rightParams]);
          return (res.rows || []).map((r: Record<string, any>) => {
            const out: Record<string, any> = {};
            for (const k in r) out[k.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase()] = r[k];
            return out;
          });
        };

        const runOneFirebird = async (
          conn: { db_host?: string | null; db_port?: number | null; db_name?: string | null; db_user?: string | null; db_password_encrypted?: string | null },
          src: typeof left,
          tableQ: string
        ): Promise<Record<string, any>[]> => {
          const password = (conn as any).db_password_encrypted
            ? decryptConnectionPassword((conn as any).db_password_encrypted)
            : (conn as any).db_password ?? "";
          const safePart = (s: string) => (/^[A-Z0-9_]+$/i.test(String(s).trim()) ? String(s).trim().toUpperCase() : `"${String(s).trim().replace(/"/g, '""')}"`);
          const tablePart = tableQ.includes(".")
            ? (tableQ.split(".").pop() || tableQ.trim()).trim().toUpperCase()
            : safePart(tableQ);
          const colList = (src.filter?.columns || [])
            .map((c: string) => (c != null ? String(c).trim() : ""))
            .filter((c: string) => c !== "" && c !== "." && !/^\.+$/.test(c));
          const colListLimited = colList.length > 150 ? colList.slice(0, 150) : colList;
          const cols = colListLimited.length > 0
            ? colListLimited.map((c: string) => safePart(c)).join(", ")
            : "*";
          const rawConditions = (src.filter?.conditions || []).filter(
            (c: FilterCondition) => (c.column ?? "").trim() !== "" && (c.column ?? "").trim() !== "."
          );
          const { clause, params } = buildWhereClauseFirebird(rawConditions);
          if (!tablePart) return Promise.reject(new Error("Nombre de tabla vacío para Firebird."));
          // Interpolar parámetros; evitar punto en literales numéricos (puede causar -104 en algunos entornos Firebird)
          const escapeFbLiteral = (v: any): string => {
            if (v == null) return "NULL";
            if (typeof v === "boolean") return v ? "1" : "0";
            if (typeof v === "number" && !Number.isNaN(v)) {
              if (Number.isInteger(v)) return String(v);
              return `CAST('${String(v)}' AS DOUBLE PRECISION)`;
            }
            const s = String(v);
            return `'${s.replace(/'/g, "''")}'`;
          };
          let clauseInlined = clause;
          let idx = 0;
          for (const p of params) {
            const pos = clauseInlined.indexOf("?");
            if (pos === -1) break;
            clauseInlined = clauseInlined.slice(0, pos) + escapeFbLiteral(p) + clauseInlined.slice(pos + 1);
            idx++;
          }
          const limit = Math.floor(PREVIEW_LIMIT / 2);
          const Firebird = require("node-firebird");
          const opts = {
            host: conn.db_host || "localhost",
            port: conn.db_port ? Number(conn.db_port) : 15421,
            database: conn.db_name,
            user: conn.db_user,
            password: password || "",
            lowercase_keys: false,
          };
          const PREVIEW_FIREBIRD_TIMEOUT_MS = 25000;
          return new Promise<Record<string, any>[]>((resolve, reject) => {
            const timeoutId = setTimeout(() => {
              reject(new Error("Vista previa Firebird: tiempo de espera agotado (25s)."));
            }, PREVIEW_FIREBIRD_TIMEOUT_MS);
            Firebird.attach(opts, (err: Error | null, db: any) => {
              if (err) {
                clearTimeout(timeoutId);
                return reject(err);
              }
              const sql = `SELECT FIRST ${limit} ${cols} FROM ${tablePart} ${clauseInlined}`.trim();
              db.query(sql, [], (qerr: Error | null, rows: any[]) => {
                clearTimeout(timeoutId);
                if (db?.detach) try { db.detach(() => {}); } catch (_) {}
                if (qerr) return reject(qerr);
                const normalized = (rows || []).map((row: Record<string, any>) => {
                  const out: Record<string, any> = {};
                  for (const k in row) out[k.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase()] = row[k];
                  return out;
                });
                resolve(normalized);
              });
            });
          });
        };

        const sameConnection = String(left.connectionId) === String(right.connectionId);

        const collectUnionRows = (leftRows: Record<string, any>[], rightRows: Record<string, any>[]) => {
          if (leftRows.length && rightRows.length) {
            const a = Object.keys(leftRows[0]).sort().join(",");
            const b = Object.keys(rightRows[0]).sort().join(",");
            if (a !== b) throw new Error("UNION: ambos datasets deben tener las mismas columnas.");
          }
          const combined = [...leftRows, ...rightRows];
          if (combined.length) return { rows: combined, query: `UNION (${leftTable} + ${rightTable})` };
          return null;
        };

        let leftRows: Record<string, any>[];
        let rightRows: Record<string, any>[];

        if (sameConnection) {
          if (leftType === "firebird") {
            leftRows = await runOneFirebird(leftConn, left, leftTable);
            rightRows = await runOneFirebird(rightConn, right, rightTable);
            const result = collectUnionRows(leftRows, rightRows);
            if (result) yield result;
          } else if (dbUrlUnion) {
            const client = new PgClient({ connectionString: dbUrlUnion });
            await client.connect();
            try {
              const combined = await runUnionOnePg(client, left, right, leftTable, rightTable);
              if (combined.length) yield { rows: combined, query: `UNION (${leftTable} + ${rightTable})` };
            } finally {
              await client.end();
            }
          }
          return;
        }

        // Dos conexiones distintas
        const rightType = (rightConn.type || "").toLowerCase();
        if (leftType === "firebird") {
          leftRows = await runOneFirebird(leftConn, left, leftTable);
        } else if (dbUrlUnion) {
          const clientLeft = new PgClient({ connectionString: dbUrlUnion });
          await clientLeft.connect();
          try {
            leftRows = await runOne(clientLeft, left, leftTable);
          } finally {
            await clientLeft.end();
          }
        } else {
          return;
        }

        if (rightType === "firebird") {
          rightRows = await runOneFirebird(rightConn, right, rightTable);
        } else if (rightType === "excel_file") {
          const rightUrl = process.env.SUPABASE_DB_URL || "";
          if (!rightUrl) throw new Error("Para UNION con Excel en la tabla derecha configurá SUPABASE_DB_URL.");
          const clientRight = new PgClient({ connectionString: rightUrl });
          await clientRight.connect();
          try {
            rightRows = await runOne(clientRight, right, rightTable);
          } finally {
            await clientRight.end();
          }
        } else if (rightType === "postgres" || rightType === "postgresql") {
          const rightUrl = buildPgUrl(rightConn);
          const clientRight = new PgClient({ connectionString: rightUrl });
          await clientRight.connect();
          try {
            rightRows = await runOne(clientRight, right, rightTable);
          } finally {
            await clientRight.end();
          }
        } else {
          throw new Error(`Vista previa UNION con conexión derecha tipo "${rightConn.type}" no soportada.`);
        }

        const result = collectUnionRows(leftRows, rightRows);
        if (result) yield result;
        return;
      }

        if (joinConf?.connectionId) {
          const primaryConnId = joinConf.connectionId;
          const secondaryConnId = joinConf.secondaryConnectionId;

          const { data: conn1 } = await supabaseAdmin
            .from("connections")
            .select("*")
            .eq("id", primaryConnId)
            .single();

          const { data: conn2 } = await supabaseAdmin
            .from("connections")
            .select("*")
            .eq("id", secondaryConnId || "")
            .single();

          if (!conn1 || !conn2) return;

          const pwd1 = await getPasswordFromSecret(conn1.db_password_secret_id);
          const dbUrl1 = `postgres://${conn1.db_user}:${pwd1}@${conn1.db_host}:${conn1.db_port}/${conn1.db_name}?sslmode=require`;
          
          const client1 = new PgClient({ connectionString: dbUrl1 });
          await client1.connect();

          try {
            const { leftTable, rightTable } = joinConf;
            const lQ = quoteQualified(leftTable);
            const rQ = quoteQualified(rightTable);

            // Build Select
            const selectParts: string[] = [];
            if (joinConf.leftColumns?.length) {
              joinConf.leftColumns.forEach((col: string) =>
                selectParts.push(`l.${quoteIdent(col)} AS "primary_${col.replace(/"/g, '""')}"`)
              );
            } else {
              selectParts.push("l.*");
            }

            if (joinConf.rightColumns?.length) {
              joinConf.rightColumns.forEach((col: string) =>
                selectParts.push(`r.${quoteIdent(col)} AS "join_0_${col.replace(/"/g, '""')}"`)
              );
            } else {
               selectParts.push("r.*");
            }

            const joinClause = buildJoinClauseBinary(
              joinConf.joinConditions || [],
              "postgres",
              rQ
            );

            // Map filter conditions (primary. -> left., join_0. -> right.)
            const mappedConds = (body.filter?.conditions || []).map((c) => {
               const col = c.column || "";
               let mapped = col.replace(/^primary\./i, "left."); // or l.
               mapped = mapped.replace(/^join_0\./i, "right.");   // or r.
               // Helper expects l. or r. prefixes for binary logic
               return { ...c, column: mapped } as any;
            });

            const { clause: whereClause, params } = buildWhereClausePg(mappedConds);

            const baseQuery = `SELECT ${selectParts.join(", ")} FROM ${lQ} AS l ${joinClause} ${whereClause}`;

            // STRICT LIMIT for preview with deterministic ordering
            const limitQuery = `${baseQuery} ORDER BY 1 ASC LIMIT ${PREVIEW_LIMIT}`;
            
            const res = await client1.query(limitQuery, params);
            if (res.rows.length) yield { rows: res.rows, query: baseQuery };
          } finally {
            await client1.end();
          }

        } else if (body.connectionId) {
          const { data: conn, error: connError } = await supabaseAdmin
            .from("connections")
            .select("*")
            .eq("id", body.connectionId)
            .single();
          
          if (conn) {
               console.log("[Preview] Connection found:", conn.id);
          }
          
          if (connError) console.error("[Preview] Connection fetch error:", connError);
  
          if (!conn) throw new Error(`Conexión no encontrada: ${body.connectionId}`);

        let dbUrl: string;
        let tableToQuery = body.filter?.table;

        if (conn.type === "excel_file") {
            console.log("[Preview] Detected Excel connection. Fetching metadata...");
            // Lógica para Excel (similar a run/route.ts)
            const { data: meta } = await supabaseAdmin
              .from("data_tables")
              .select("physical_schema_name, physical_table_name")
              .eq("connection_id", conn.id)
              .single();
            
            console.log("[Preview] Excel metadata:", meta);

            if (!meta || !meta.physical_table_name) {
                 throw new Error(`No se encontraron metadatos de tabla física para la conexión de Excel ID ${conn.id}.`);
            }
            const schema = meta.physical_schema_name || "excel_imports";
            // Sobreescribimos la tabla a consultar con la física interna
            tableToQuery = `${schema}.${meta.physical_table_name}`;
            console.log("[Preview] Table to query:", tableToQuery);
            
            const internalDbUrl = process.env.SUPABASE_DB_URL;
            if (!internalDbUrl) throw new Error("Variable de entorno SUPABASE_DB_URL no encontrada para conexión interna.");
            dbUrl = internalDbUrl;

        } else if ((conn.type || "").toLowerCase() === "firebird") {
            // Vista previa tabla única Firebird: misma lógica segura que en UNION (solo nombre de tabla, SELECT *, WHERE inlined)
            if (!tableToQuery?.trim()) {
              console.error("[Preview] No table specified for Firebird.");
              return;
            }
            const password = (conn as any).db_password_encrypted
              ? decryptConnectionPassword((conn as any).db_password_encrypted)
              : (conn as any).db_password ?? "";
            const safePart = (s: string) => (/^[A-Z0-9_]+$/i.test(String(s).trim()) ? String(s).trim().toUpperCase() : `"${String(s).trim().replace(/"/g, '""')}"`);
            const tablePart = tableToQuery.includes(".")
              ? (tableToQuery.split(".").pop() || tableToQuery.trim()).trim().toUpperCase()
              : safePart(tableToQuery);
            const colList = (filter?.columns || [])
              .map((c: string) => (c != null ? String(c).trim() : ""))
              .filter((c: string) => c !== "" && c !== "." && !/^\.+$/.test(c));
            const colListLimited = colList.length > 150 ? colList.slice(0, 150) : colList;
            const colsFirebird = colListLimited.length > 0
              ? colListLimited.map((c: string) => safePart(c)).join(", ")
              : "*";
            const rawConditions = (filter?.conditions || []).filter(
              (c: FilterCondition) => (c.column ?? "").trim() !== "" && (c.column ?? "").trim() !== "."
            );
            const { clause, params } = buildWhereClauseFirebird(rawConditions);
            const escapeFbLiteral = (v: any): string => {
              if (v == null) return "NULL";
              if (typeof v === "boolean") return v ? "1" : "0";
              if (typeof v === "number" && !Number.isNaN(v)) {
                if (Number.isInteger(v)) return String(v);
                return `CAST('${String(v)}' AS DOUBLE PRECISION)`;
              }
              const s = String(v);
              return `'${s.replace(/'/g, "''")}'`;
            };
            let clauseInlined = clause;
            for (const p of params) {
              const pos = clauseInlined.indexOf("?");
              if (pos === -1) break;
              clauseInlined = clauseInlined.slice(0, pos) + escapeFbLiteral(p) + clauseInlined.slice(pos + 1);
            }
            const limit = Math.min(PREVIEW_LIMIT, 1000);
            const Firebird = require("node-firebird");
            const opts = {
              host: conn.db_host || "localhost",
              port: conn.db_port ? Number(conn.db_port) : 15421,
              database: conn.db_name,
              user: conn.db_user,
              password: password || "",
              lowercase_keys: false,
            };
            const baseQuery = `SELECT FIRST ${limit} ${colsFirebird} FROM ${tablePart} ${clauseInlined}`.trim();
            const rows = await new Promise<Record<string, any>[]>((resolve, reject) => {
              const t = setTimeout(() => reject(new Error("Vista previa Firebird: tiempo de espera agotado (25s).")), 25000);
              Firebird.attach(opts, (err: Error | null, db: any) => {
                if (err) { clearTimeout(t); return reject(err); }
                db.query(baseQuery, [], (qerr: Error | null, r: any[]) => {
                  clearTimeout(t);
                  if (db?.detach) try { db.detach(() => {}); } catch (_) {}
                  if (qerr) return reject(qerr);
                  const normalized = (r || []).map((row: Record<string, any>) => {
                    const out: Record<string, any> = {};
                    for (const k in row) out[k.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase()] = row[k];
                    return out;
                  });
                  resolve(normalized);
                });
              });
            });
            if (rows.length) yield { rows, query: baseQuery };
            return;
        } else {
            // Lógica para Postgres externo
            const password = await getPasswordFromSecret(conn.db_password_secret_id);
            const dbConfig = {
                host: conn.db_host,
                user: conn.db_user,
                password: password,
                port: conn.db_port,
                database: conn.db_name
            };
            if (!dbConfig.host || !dbConfig.user || !dbConfig.database) {
                 throw new Error(`Configuración de conexión incompleta para ID: ${body.connectionId}`);
            }
            dbUrl = `postgres://${dbConfig.user}:${dbConfig.password}@${dbConfig.host}:${dbConfig.port}/${dbConfig.database}?sslmode=require`;
        }

        if ((conn.type || "").toLowerCase() !== "firebird") {
        const client = new PgClient({ connectionString: dbUrl });
        await client.connect();

        try {
          let baseQuery = "";
          let queryParams: any[] = [];
          
          if (tableToQuery) {
            const tableQ = quoteQualified(tableToQuery);
            const columns = filter?.columns;
            const conditions = filter?.conditions || [];

            const selectList =
              columns && columns.length
                ? columns.map((c) => quoteIdent(c)).join(", ")
                : "*";

            const { clause: whereClause, params } = buildWhereClausePg(conditions);
            
            baseQuery = `SELECT ${selectList} FROM ${tableQ} ${whereClause} ORDER BY 1 ASC`;
            queryParams = params;
          } else {
             console.error("[Preview] No table specified for query.");
             return; 
          }

          const BATCH_SIZE = 5000;
          const MAX_SCAN_LIMIT = 100000;
          let offset = 0;
          let totalFixedScanned = 0;

          while (totalFixedScanned < MAX_SCAN_LIMIT) {
              const pagedQuery = `${baseQuery} LIMIT ${BATCH_SIZE} OFFSET ${offset}`;
              const res = await client.query(pagedQuery, queryParams);
              const batchSize = res.rows.length;
              
              if (batchSize === 0) break;

              yield { rows: res.rows, query: baseQuery };
              
              offset += batchSize;
              totalFixedScanned += batchSize;
              
              if (batchSize < BATCH_SIZE) break;
          }

        } finally {
          await client.end();
        }
        }
      }
    }

    const allPreviewRows: Record<string, any>[] = [];

    let finalExtractionQuery = "";
    const transformationSteps: string[] = [];

    let isFirstBatch = true;

    // Collect Data
    for await (const { rows: rawBatch, query } of dataSourceGenerator()) {
      if (!finalExtractionQuery) finalExtractionQuery = query;
      
      if (rawBatch.length === 0) continue;

      try {
        let transformedBatch = rawBatch;

        if (body.inferTypes) {
          allPreviewRows.push(...rawBatch);
          isFirstBatch = false;
          continue;
        }

        if (isFirstBatch) {
             const tableName = body.union
               ? "UNION (Dataset A + Dataset B)"
               : body.join
                 ? "Multi-Table Join"
                 : (body.filter?.table || "Source Table");
             transformationSteps.push(`Source (SQL): Extracted data from ${tableName}`);
             
             if (body.filter?.conditions?.length) {
                 body.filter.conditions.forEach((cond: any) => {
                     transformationSteps.push(`SQL Filter: ${cond.column} ${cond.operator} ${cond.value || ''}`);
                 });
             }
        }

        if (body.pipeline?.length) {
          // --- SEQUENTIAL PIPELINE EXECUTION ---
          for (const step of body.pipeline) {
             try {
               switch (step.type) {
                 case "clean":
                   transformedBatch = applyCleanBatch(transformedBatch, step.config);
                   if (isFirstBatch && !transformationSteps.includes("Clean (Trim/Format)")) transformationSteps.push("Clean (Trim/Format)");
                   break;

                 case "cast":
                   transformedBatch = applyCastConversions(transformedBatch, step.config);
                   // Log
                   if (isFirstBatch) {
                      const prefixCast = "Cast:";
                      const conversions = step.config?.conversions || [];
                      conversions.forEach((c: any) => {
                          transformationSteps.push(`${prefixCast} ${c.column} -> ${c.toType}`);
                      });
                   }
                   break;

                 case "arithmetic":
                   transformedBatch = applyArithmeticOperations(transformedBatch, step.config);
                   // Log
                   if (isFirstBatch) {
                      const prefixArith = "Arithmetic:";
                      const ops = step.config?.operations || [];
                      ops.forEach((op: any) => {
                          const left = typeof op.leftOperand === 'object' ? op.leftOperand.value : (op.leftOperand || op.leftColumn);
                          const right = typeof op.rightOperand === 'object' ? op.rightOperand.value : (op.rightOperand || op.rightColumn);
                          const desc = `${prefixArith} ${op.resultColumn} = ${left} ${op.operator} ${right}`;
                          transformationSteps.push(desc);
                      });
                   }
                   break;

                 case "condition":
                   transformedBatch = applyConditionRules(transformedBatch, step.config);
                   // Log
                   const prefixCond = "Condition #";
                   // Since we might have multiple condition nodes, we can't just check prefix match globally or we miss subsequent nodes.
                   // We should log if *this specific step* hasn't been logged. 
                   // But preview runs in chunks. simpler is to store logged step IDs? 
                   // Or just check if transformationSteps already contains logs for *this* step?
                   // For now, I'll allow duplicates in the list if the user has multiple condition nodes, 
                   // BUT avoid duplicates PER BATCH.
                   // Checking `transformationSteps` length logic is tricky if we stream.
                   // Actually `transformationSteps` is accumulated for the whole request reference (const outside generator).
                   // So if we have Condition Node A and Condition Node B, we want logs for A and B.
                   // But processing Batch 1 -> Logs A, B. Batch 2 -> Should NOT log A, B again.
                   // The simple `filter` check prevents repeating "Condition #1" if it's already there.
                   // To differentiate Node A vs Node B, we need unique IDs in logs or just append?
                   // Given the user wants to see "Condition #1, #2, #3", maybe just APPENDING is better, 
                   // but guard against Batch 2 appending again.
                   // Solution: Only log transformations for the FIRST batch.
                   // `allPreviewRows.length === 0` (before push) check? 
                   // `transformationSteps` is empty initially.
                   // The check `filter(...).length === 0` prevents duplicates.
                   // But if I have 2 condition nodes in pipeline, both will try "Condition #1" if I reset index?
                   // I should use the step index in pipeline or generate a unique label?
                   // "Step N (Condition): ..."
                   
                   // Let's stick to the prefix check but make it specific to the batch?
                   // No, use a global "loggedSteps" set? 
                   // Refactor: Just wrap logging in `if (allPreviewRows.length === 0)` 
                   // (Validation: `allPreviewRows` is populated at the END of the batch processing. So for the first batch, it is empty.)
                   
                   if (isFirstBatch) {
                      const rules = step.config?.rules || [];
                      rules.forEach((rule: any, idx: number) => {
                          const action = rule.shouldFilter ? "FILTER REMOVE" : (rule.outputType ? `SET ${rule.resultColumn}` : "CHECK");
                          const left = rule.leftOperand?.value || rule.leftOperand;
                          const right = rule.rightOperand?.value || rule.rightOperand;
                          const op = rule.comparator || rule.operator || "=";
                          
                          const desc = `Condition (Step): IF ${left} ${op} ${right} THEN ${action}`;
                          transformationSteps.push(desc);
                      });
                   }
                   break;
               }
             } catch(e: any) {
                console.error(`[Preview Pipeline Error] Step ${step.type} failed:`, e);
                throw new Error(`Error en paso ${step.type}: ${e.message}`);
             }
          }

        } else {
            // --- LEGACY FIXED ORDER EXECUTION ---
            
            // 1. Clean
            transformedBatch = applyCleanBatch(rawBatch, body?.clean);
            if (!transformationSteps.includes("Clean (Trim/Format)")) transformationSteps.push("Clean (Trim/Format)");

            // 2. Cast
            if (body.cast?.conversions?.length) {
              try {
                  transformedBatch = applyCastConversions(transformedBatch, body.cast);
                  // Granular logging for Cast
                  const prefix = "Cast:";
                  if (transformationSteps.filter(s => s.startsWith(prefix)).length === 0) {
                     body.cast.conversions.forEach((c: any) => {
                         transformationSteps.push(`${prefix} ${c.column} -> ${c.toType}`);
                     });
                  }
              } catch (e: any) {
                  console.error("[Preview Error] Cast failed:", e);
                  throw new Error(`Error en conversión de tipos: ${e.message}`);
              }
            }

            // 3. Arithmetic
            if (body.arithmetic?.operations?.length) {
              try {
                 transformedBatch = applyArithmeticOperations(
                    transformedBatch,
                    body.arithmetic
                 );
                 // Granular logging for Arithmetic
                 const prefix = "Arithmetic:";
                 if (transformationSteps.filter(s => s.startsWith(prefix)).length === 0) {
                    body.arithmetic.operations.forEach((op: any) => {
                        const left = typeof op.leftOperand === 'object' ? op.leftOperand.value : (op.leftOperand || op.leftColumn);
                        const right = typeof op.rightOperand === 'object' ? op.rightOperand.value : (op.rightOperand || op.rightColumn);
                        const desc = `${prefix} ${op.resultColumn} = ${left} ${op.operator} ${right}`;
                        transformationSteps.push(desc);
                    });
                 }
              } catch (e: any) {
                 console.error("[Preview Error] Arithmetic failed:", e);
                 throw new Error(`Error en operaciones aritméticas: ${e.message}`);
              }
            }
            
            // 4. Condition
            if (body.condition?.rules?.length) {
              try {
                  transformedBatch = applyConditionRules(
                    transformedBatch,
                    body.condition
                  );
                  // Granular logging for Condition
                  const prefix = "Condition #";
                  if (transformationSteps.filter(s => s.startsWith(prefix)).length === 0) {
                     body.condition.rules.forEach((rule: any, idx: number) => {
                         const action = rule.shouldFilter ? "FILTER REMOVE" : (rule.outputType ? `SET ${rule.resultColumn}` : "CHECK");
                         const left = rule.leftOperand?.value || rule.leftOperand;
                         const right = rule.rightOperand?.value || rule.rightOperand;
                         const op = rule.comparator || rule.operator || "=";
                         
                         const desc = `${prefix}${idx+1}: IF ${left} ${op} ${right} THEN ${action}`;
                         transformationSteps.push(desc);
                     });
                  }
              } catch (e: any) {
                  console.error("[Preview Error] Condition failed:", e);
                  throw new Error(`Error en condiciones: ${e.message}`);
              }
            }
        } // End Legacy Else

        // Count (Always last? Or should it be in pipeline?)
        // For now keep it outside as implicit final step, but usually Aggregation is a separate node type.
        // Editors might treat Count as a property of End node or a separate Widget.
        // Existing code checks body.count.
        
        if (body.count?.attribute) {
           try {
               transformedBatch = applyCountAggregation(transformedBatch, body.count);
               if (!transformationSteps.includes("Count Aggregation")) transformationSteps.push("Count Aggregation");
           } catch (e: any) {
               console.error("[Preview Error] Count failed:", e);
               throw new Error(`Error en agregación (Count): ${e.message}`);
           }
        }
        
        if (transformedBatch.length) {
            allPreviewRows.push(...transformedBatch);
        }
      } catch (err: any) {
         console.error("[Preview Error] Batch processing failed:", err);
         throw err; 
      } finally {
        isFirstBatch = false;
      }
      
      // Stop if we hit the limit (already limited by SQL but good safety)
      const maxRows = body.inferTypes
        ? Math.min(body.limit || 200, 500)
        : PREVIEW_LIMIT;
      if (allPreviewRows.length >= maxRows) break;
    }

    if (body.inferTypes) {
      const inferredTypes = inferColumnTypes(allPreviewRows);
      return NextResponse.json({
        ok: true,
        inferredTypes,
        rowsSampled: allPreviewRows.length,
      });
    }

    return NextResponse.json({
      ok: true,
      rowsProcessed: allPreviewRows.length,
      previewRows: allPreviewRows,
      destinationTable: "(Vista Previa)",
      extractionQuery: finalExtractionQuery,
      transformationSteps
    });

  } catch (err: any) {
    console.error("Error en Preview:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Error generando vista previa" },
      { status: 500 }
    );
  }
}
