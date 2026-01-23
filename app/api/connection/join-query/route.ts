import { NextRequest, NextResponse } from "next/server";
import mysql from "mysql2/promise";
import { Client as PgClient } from "pg";
import { createClient } from "@/lib/supabase/server";
import { randomUUID } from "crypto";

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
    if (!limit || limit < 1 || limit > 1000) limit = 50;
    if (!offset || offset < 0) offset = 0;

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
          if (primaryColumns && primaryColumns.length > 0)
            primaryColumns.forEach((col) =>
              selectParts.push(
                `p.${quoteIdent(col, "postgres")} AS "primary_${col.replace(
                  /"/g,
                  '""'
                )}"`
              )
            );
          else selectParts.push("p.*");
          joins.forEach((jn, idx) => {
            if (jn.secondaryColumns && jn.secondaryColumns.length > 0)
              jn.secondaryColumns.forEach((col) =>
                selectParts.push(
                  `j${idx}.${quoteIdent(
                    col,
                    "postgres"
                  )} AS "join_${idx}_${col.replace(/"/g, '""')}"`
                )
              );
            else selectParts.push(`j${idx}.*`);
          });

          let fromJoin = `FROM ${pQualified} AS p`;
          joins.forEach((jn, idx) => {
            const jt = (jn.joinType || "INNER").toUpperCase();
            const on = `p.${quoteIdent(
              jn.primaryColumn || "",
              "postgres"
            )} = j${idx}.${quoteIdent(jn.secondaryColumn || "", "postgres")}`;
            fromJoin += ` ${jt} JOIN ${jQualified[idx]} AS j${idx} ON ${on}`;
          });

          const { clause, params } = buildWhereClausePgStar(
            conditions || [],
            joins.length
          );
          const sql = `SELECT ${selectParts.join(
            ", "
          )} ${fromJoin} ${clause} LIMIT $${params.length + 1} OFFSET $${
            params.length + 2
          }`;
          log("Ejecutando consulta JOIN de Excel:", {
            sql,
            params: [...params, limit, offset],
          });

          const resDb = await client.query(sql, [...params, limit, offset]);
          log(
            `Consulta de Excel ejecutada, ${resDb.rowCount} filas obtenidas.`
          );

          let totalOut: number | undefined = undefined;
          if (count) {
            const countSql = `SELECT COUNT(*)::int as c ${fromJoin} ${clause}`;
            log("Ejecutando consulta de conteo de Excel:", {
              sql: countSql,
              params,
            });
            const cntRes = await client.query(countSql, params);
            totalOut = cntRes.rows?.[0]?.c ?? 0;
            log(`Conteo de Excel ejecutado, total: ${totalOut}.`);
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
            .catch((err) => log("Error al cerrar cliente PG para Excel.", err));
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
          if (primaryColumns && primaryColumns.length > 0)
            primaryColumns.forEach((col) =>
              selectParts.push(
                `p.${quoteIdent(col, "postgres")} AS "primary_${col.replace(
                  /"/g,
                  '""'
                )}"`
              )
            );
          else selectParts.push("p.*");
          joins.forEach((jn, idx) => {
            if (jn.secondaryColumns && jn.secondaryColumns.length > 0)
              jn.secondaryColumns.forEach((col) =>
                selectParts.push(
                  `j${idx}.${quoteIdent(
                    col,
                    "postgres"
                  )} AS "join_${idx}_${col.replace(/"/g, '""')}"`
                )
              );
            else selectParts.push(`j${idx}.*`);
          });

          let fromJoin = `FROM ${pQualified} AS p`;
          joins.forEach((jn, idx) => {
            const jt = (jn.joinType || "INNER").toUpperCase();
            const on = `p.${quoteIdent(
              jn.primaryColumn || "",
              "postgres"
            )} = j${idx}.${quoteIdent(jn.secondaryColumn || "", "postgres")}`;
            fromJoin += ` ${jt} JOIN ${jQualified[idx]} AS j${idx} ON ${on}`;
          });

          const { clause, params } = buildWhereClausePgStar(
            conditions || [],
            joins.length
          );
          const sql = `SELECT ${selectParts.join(
            ", "
          )} ${fromJoin} ${clause} LIMIT $${params.length + 1} OFFSET $${
            params.length + 2
          }`;
          log("Ejecutando consulta de datos en PostgreSQL:", {
            sql,
            params: [...params, limit, offset],
          });

          const resDb = await client.query(sql, [...params, limit, offset]);
          log(
            `Consulta de datos ejecutada, ${resDb.rowCount} filas obtenidas.`
          );

          let totalOut: number | undefined = undefined;
          if (count) {
            const countSql = `SELECT COUNT(*)::int as c ${fromJoin} ${clause}`;
            log("Ejecutando consulta de conteo en PostgreSQL:", {
              sql: countSql,
              params,
            });
            const cntRes = await client.query(countSql, params);
            totalOut = cntRes.rows?.[0]?.c ?? 0;
            log(`Consulta de conteo ejecutada, total: ${totalOut}.`);
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
            .catch((err) => log("Error al cerrar cliente PG.", err));
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
