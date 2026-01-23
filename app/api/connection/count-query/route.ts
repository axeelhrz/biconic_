import { NextRequest, NextResponse } from "next/server";
import mysql from "mysql2/promise";
import { Client as PgClient } from "pg";
import { createClient } from "@/lib/supabase/server";

// =================================================================
// TIPOS
// =================================================================

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

type CountQueryBody = {
  connectionId?: string | number;
  type?: "mysql" | "postgres" | "postgresql";
  host?: string;
  database?: string;
  user?: string;
  password?: string;
  port?: number;
  ssl?: boolean;
  table?: string;
  columns?: string[];
  conditions?: FilterCondition[];
  attribute: string;
  resultColumn?: string;
  limit?: number;
  offset?: number;
  count?: boolean;
  join?: {
    primaryConnectionId: string | number;
    primaryTable: string;
    joins: Array<{
      secondaryConnectionId: string | number;
      secondaryTable: string;
      joinType: "INNER" | "LEFT" | "RIGHT" | "FULL";
      primaryColumn: string;
      secondaryColumn: string;
    }>;
  };
};

// =================================================================
// HELPERS DE RESOLUCIÓN DE COLUMNAS
// =================================================================

/**
 * Limpia nombres de columnas para consultas de TABLA ÚNICA.
 */
function cleanSingleTableCol(col: string): string {
  let clean = col.replace(/"/g, "");
  if (clean.startsWith("primary.")) clean = clean.substring(8);
  else if (clean.startsWith("primary_")) clean = clean.substring(8);
  else {
    const joinMatch = clean.match(/^join_\d+[._](.+)$/);
    if (joinMatch) {
      clean = joinMatch[1];
    }
  }
  return `"${clean.replace(/"/g, '""')}"`;
}

/**
 * Resuelve columnas para JOINS.
 * Si la columna no tiene prefijo, intenta encontrarla en 'knownColumns' para deducir su tabla.
 */
function resolveColumnPg(
  col: string,
  aliases: Record<string, string>,
  knownColumns: string[] = []
): string {
  let clean = col.replace(/"/g, "");

  // 1. Si ya tiene prefijo explícito, lo resolvemos directamente
  if (clean.startsWith("primary.") || clean.startsWith("primary_")) {
    const realCol = clean.replace(/^primary[._]/, "");
    return `${aliases.primary}."${realCol.replace(/"/g, '""')}"`;
  }

  const explicitJoinMatch = clean.match(/^join_(\d+)[._](.+)$/);
  if (explicitJoinMatch) {
    const idx = explicitJoinMatch[1];
    const c = explicitJoinMatch[2];
    const alias = aliases[`join_${idx}`];
    if (alias) return `${alias}."${c.replace(/"/g, '""')}"`;
  }

  // 2. Si no tiene prefijo, buscamos en la lista de columnas conocidas (body.columns)
  // Ejemplo: si busco "categoria_es" y en columns existe "join_3.categoria_es"
  if (knownColumns && knownColumns.length > 0) {
    const match = knownColumns.find(
      (k) => k.endsWith(`.${clean}`) || k.endsWith(`_${clean}`)
    );

    if (match) {
      console.log(
        `[DEBUG RESOLVE] Auto-detectando tabla para '${clean}' -> '${match}'`
      );
      // Llamada recursiva con el nombre completo encontrado
      if (match !== clean) {
        return resolveColumnPg(match, aliases, []);
      }
    }
  }

  // 3. Fallback: Asumir tabla primaria
  return `${aliases.primary}."${clean.replace(/"/g, '""')}"`;
}

function buildWhereClausePg(
  conds: FilterCondition[],
  aliases?: Record<string, string>,
  knownColumns: string[] = []
) {
  const params: any[] = [];
  const parts = conds.map((c) => {
    const col = aliases
      ? resolveColumnPg(c.column, aliases, knownColumns)
      : cleanSingleTableCol(c.column);

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
      default:
        params.push(c.value ?? null);
        return `${col} ${c.operator} $${params.length}`;
    }
  });
  const clause = parts.length ? `WHERE ${parts.join(" AND ")}` : "";
  return { clause, params };
}

function buildWhereClauseMy(conds: FilterCondition[]) {
  const params: any[] = [];
  const parts = conds.map((c) => {
    let cleanCol = c.column;
    if (cleanCol.startsWith("primary_")) cleanCol = cleanCol.substring(8);
    const m = cleanCol.match(/^join_\d+[._](.+)$/);
    if (m) cleanCol = m[1];

    const col = `\`${cleanCol.replace(/`/g, "``")}\``;

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
      default:
        params.push(c.value ?? null);
        return `${col} ${c.operator} ?`;
    }
  });
  const clause = parts.length ? `WHERE ${parts.join(" AND ")}` : "";
  return { clause, params };
}

// =================================================================
// API HANDLER
// =================================================================

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = (await req.json()) as CountQueryBody | null;

    if (!body)
      return NextResponse.json(
        { ok: false, error: "Cuerpo vacío" },
        { status: 400 }
      );

    let {
      connectionId,
      type,
      host,
      database,
      user,
      password,
      port,
      ssl,
      table,
      conditions,
      attribute,
      resultColumn,
      limit,
      offset,
      count,
      join,
      columns, // Importante: Usamos esto para resolver ambigüedades
    } = body;

    if (!attribute)
      return NextResponse.json(
        { ok: false, error: "Se requiere la columna a contar" },
        { status: 400 }
      );
    if (!limit || limit < 1 || limit > 1000) limit = 50;
    if (!offset || offset < 0) offset = 0;

    // Auth
    const supabase = await createClient();
    const {
      data: { user: currentUser },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !currentUser)
      return NextResponse.json(
        { ok: false, error: "No autorizado" },
        { status: 401 }
      );

    // =================================================================
    // MODO JOIN (Star Schema)
    // =================================================================
    if (join) {
      console.log("[COUNT API] Entrando en modo JOIN");

      const { data: primConn, error: primErr } = await supabase
        .from("connections")
        .select("*")
        .eq("id", String(join.primaryConnectionId))
        .maybeSingle();

      if (primErr || !primConn)
        return NextResponse.json(
          { ok: false, error: "Conexión primaria no encontrada" },
          { status: 404 }
        );

      const isExcel =
        primConn.type === "excel_file" || primConn.type === "excel";

      if (
        !isExcel &&
        primConn.type !== "postgres" &&
        primConn.type !== "postgresql"
      ) {
        return NextResponse.json(
          {
            ok: false,
            error: "Preview de JOIN solo soportado para Excel y Postgres",
          },
          { status: 400 }
        );
      }

      let client: PgClient;
      const aliases: Record<string, string> = { primary: "t1" };

      if (isExcel) {
        const dbUrl = process.env.SUPABASE_DB_URL;
        if (!dbUrl) throw new Error("DB interna no configurada");
        client = new PgClient({ connectionString: dbUrl });
      } else {
        client = new PgClient({
          host: primConn.db_host || undefined,
          user: primConn.db_user || undefined,
          database: primConn.db_name || undefined,
          port: primConn.db_port || 5432,
          password: password || undefined,
        });
        if (password) (client as any).password = password;
      }

      await client.connect();

      try {
        // Resolver tabla primaria
        let primaryTableSQL = "";
        if (isExcel) {
          const { data: meta } = await supabase
            .from("data_tables")
            .select("physical_table_name")
            .eq("connection_id", String(join.primaryConnectionId))
            .single();
          if (!meta)
            throw new Error("Metadatos de tabla primaria no encontrados");
          primaryTableSQL = `"data_warehouse"."${meta.physical_table_name}"`;
        } else {
          const [s, t] = join.primaryTable.split(".", 2);
          primaryTableSQL = s && t ? `"${s}"."${t}"` : `"${join.primaryTable}"`;
        }

        let sqlFrom = `${primaryTableSQL} AS t1`;

        // Resolver Joins
        for (let i = 0; i < (join.joins || []).length; i++) {
          const j = join.joins[i];
          const alias = `j${i}`;
          aliases[`join_${i}`] = alias;

          let secTableSQL = "";
          if (isExcel) {
            const { data: meta } = await supabase
              .from("data_tables")
              .select("physical_table_name")
              .eq("connection_id", String(j.secondaryConnectionId))
              .single();
            if (!meta)
              throw new Error(
                `Metadatos de tabla secundaria (join ${i}) no encontrados`
              );
            secTableSQL = `"data_warehouse"."${meta.physical_table_name}"`;
          } else {
            const [s, t] = j.secondaryTable.split(".", 2);
            secTableSQL = s && t ? `"${s}"."${t}"` : `"${j.secondaryTable}"`;
          }

          const type = j.joinType || "INNER";
          sqlFrom += ` ${type} JOIN ${secTableSQL} AS ${alias} ON t1."${j.primaryColumn}" = ${alias}."${j.secondaryColumn}"`;
        }

        const { clause, params } = buildWhereClausePg(
          conditions || [],
          aliases,
          columns
        );

        // CORRECCIÓN: Pasamos 'columns' para que intente resolver el prefijo automáticamente
        const attrCol = resolveColumnPg(attribute, aliases, columns);

        const attrAlias = `"${attribute.replace(/"/g, '""')}"`;
        const countAlias = `"${(resultColumn || "conteo").replace(
          /"/g,
          '""'
        )}"`;

        const sql = `SELECT ${attrCol} AS ${attrAlias}, COUNT(*)::int AS ${countAlias}
          FROM ${sqlFrom}
          ${clause}
          GROUP BY ${attrCol}
          ORDER BY ${countAlias} DESC, ${attrCol} ASC
          LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;

        console.log("[COUNT API - JOIN] SQL generado:", sql);

        const res = await client.query(sql, [...params, limit, offset]);

        let total: number | undefined = undefined;
        if (count) {
          const cntRes = await client.query(
            `SELECT COUNT(*)::int as c FROM (
                SELECT 1 FROM ${sqlFrom} ${clause} GROUP BY ${attrCol}
            ) sub`,
            params
          );
          total = cntRes.rows?.[0]?.c ?? undefined;
        }

        return NextResponse.json({ ok: true, rows: res.rows, total });
      } catch (e: any) {
        console.error("[COUNT API - JOIN ERROR]", e);
        throw e;
      } finally {
        await client.end();
      }
    }

    // =================================================================
    // MODO TABLA ÚNICA
    // =================================================================
    console.log("[COUNT API] Entrando en modo TABLA ÚNICA");

    if (!table)
      return NextResponse.json(
        { ok: false, error: "Tabla requerida" },
        { status: 400 }
      );

    // Cargar credenciales
    if (connectionId != null) {
      const { data: conn, error: connError } = await supabase
        .from("connections")
        .select("id, user_id, type, db_host, db_name, db_user, db_port")
        .eq("id", String(connectionId))
        .single();
      if (connError || !conn)
        return NextResponse.json(
          { ok: false, error: connError?.message || "Conexión no encontrada" },
          { status: 404 }
        );
      host = (conn as any)?.db_host ?? host;
      database = (conn as any)?.db_name ?? database;
      user = (conn as any)?.db_user ?? user;
      port = (conn as any)?.db_port ?? port;

      if (
        (conn as any)?.type === "excel_file" ||
        (conn as any)?.type === "excel"
      ) {
        type = "excel" as any;
      }
    }

    // --- Rama EXCEL ---
    if (type === ("excel" as any)) {
      const { data: meta, error: metaError } = await supabase
        .from("data_tables")
        .select("physical_table_name")
        .eq("connection_id", String(connectionId))
        .single();
      if (metaError || !meta)
        return NextResponse.json(
          { ok: false, error: "Metadatos de Excel no encontrados" },
          { status: 404 }
        );

      const tableNamePhysical =
        (meta as any).physical_table_name ||
        `import_${String(connectionId).replaceAll("-", "_")}`;
      const dbUrl = process.env.SUPABASE_DB_URL;
      if (!dbUrl)
        return NextResponse.json(
          {
            ok: false,
            error: "Configuración de base de datos interna no disponible",
          },
          { status: 500 }
        );

      const client = new PgClient({ connectionString: dbUrl } as any);
      await client.connect();

      try {
        const fullTable = `"data_warehouse"."${tableNamePhysical.replace(
          /"/g,
          '""'
        )}"`;

        const attr = cleanSingleTableCol(attribute);
        const alias = `"${(resultColumn && resultColumn.trim()
          ? resultColumn
          : "conteo"
        ).replace(/"/g, '""')}"`;

        const { clause, params } = buildWhereClausePg(conditions || []);

        const attrAlias = `"${attribute.replace(/"/g, '""')}"`;

        const sql = `SELECT ${attr} AS ${attrAlias}, COUNT(*)::int AS ${alias}
          FROM ${fullTable}
          ${clause}
          GROUP BY ${attr}
          ORDER BY ${alias} DESC, ${attr} ASC
          LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;

        console.log("[COUNT API - EXCEL] SQL:", sql);

        const resDb = await client.query(sql, [...params, limit, offset]);

        let totalOut: number | undefined = undefined;
        if (count) {
          const cntRes = await client.query(
            `SELECT COUNT(*)::int as c FROM (
              SELECT 1 FROM ${fullTable} ${clause} GROUP BY ${attr}
            ) sub`,
            params
          );
          totalOut = cntRes.rows?.[0]?.c ?? undefined;
        }
        return NextResponse.json({
          ok: true,
          rows: resDb.rows,
          total: totalOut,
        });
      } catch (e) {
        console.error("[COUNT API - EXCEL ERROR]", e);
        throw e;
      } finally {
        await client.end();
      }
    }

    if (!host || !user)
      return NextResponse.json(
        { ok: false, error: "Parámetros incompletos" },
        { status: 400 }
      );

    const [schema, tableName] = table.includes(".")
      ? table.split(".", 2)
      : ["public", table];
    const freqCol =
      resultColumn && resultColumn.trim() ? resultColumn : "conteo";

    // Determinar tipo DB
    if (!type) {
      const p = port ? Number(port) : undefined;
      if (p === 5432 || p === 5433) type = "postgres";
      else if (p === 3306 || p === 3307) type = "mysql";
      else type = "postgres";
    }

    // --- Rama POSTGRES ---
    if (type === "postgres" || type === "postgresql") {
      if (!password)
        return NextResponse.json(
          { ok: false, error: "Se requiere contraseña para PostgreSQL" },
          { status: 400 }
        );

      const client = new PgClient({
        host,
        user,
        database,
        port: port ? Number(port) : 5432,
        password,
        connectionTimeoutMillis: 8000,
        ssl: ssl ? { rejectUnauthorized: false } : undefined,
      } as any);

      await client.connect();

      try {
        const fullTable = `"${schema.replace(/"/g, '""')}"."${tableName.replace(
          /"/g,
          '""'
        )}"`;

        const attr = cleanSingleTableCol(attribute);
        const alias = `"${freqCol.replace(/"/g, '""')}"`;

        const { clause, params } = buildWhereClausePg(conditions || []);

        const attrAlias = `"${attribute.replace(/"/g, '""')}"`;

        const sql = `SELECT ${attr} AS ${attrAlias}, COUNT(*)::int AS ${alias}
          FROM ${fullTable}
          ${clause}
          GROUP BY ${attr}
          ORDER BY ${alias} DESC, ${attr} ASC
          LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;

        console.log("[COUNT API - PG] SQL:", sql);

        const res = await client.query(sql, [...params, limit, offset]);

        let total: number | undefined = undefined;
        if (count) {
          const cntRes = await client.query(
            `SELECT COUNT(*)::int as c FROM (
              SELECT 1 FROM ${fullTable} ${clause} GROUP BY ${attr}
            ) sub`,
            params
          );
          total = cntRes.rows?.[0]?.c ?? undefined;
        }
        return NextResponse.json({ ok: true, rows: res.rows, total });
      } catch (e) {
        console.error("[COUNT API - PG ERROR]", e);
        throw e;
      } finally {
        await client.end();
      }
    }

    // --- Rama MYSQL ---
    if (type === "mysql") {
      if (!password)
        return NextResponse.json(
          { ok: false, error: "Se requiere contraseña para MySQL" },
          { status: 400 }
        );
      const connection = await mysql.createConnection({
        host,
        user,
        database,
        password,
        port: port ? Number(port) : 3306,
        connectTimeout: 8000,
      });

      try {
        const fullTable = `\`${schema.replace(
          /`/g,
          "``"
        )}\`.\`${tableName.replace(/`/g, "``")}\``;

        let cleanAttr = attribute;
        // Limpieza manual para MySQL
        if (cleanAttr.startsWith("primary_"))
          cleanAttr = cleanAttr.substring(8);
        const m = cleanAttr.match(/^join_\d+[._](.+)$/);
        if (m) cleanAttr = m[1];

        const attr = `\`${cleanAttr.replace(/`/g, "``")}\``;
        const alias = `\`${freqCol.replace(/`/g, "``")}\``;

        const { clause, params } = buildWhereClauseMy(conditions || []);
        const attrAlias = `\`${attribute.replace(/`/g, "``")}\``;

        const sql = `SELECT ${attr} AS ${attrAlias}, COUNT(*) AS ${alias}
          FROM ${fullTable}
          ${clause}
          GROUP BY ${attr}
          ORDER BY ${alias} DESC, ${attr} ASC
          LIMIT ? OFFSET ?`;

        console.log("[COUNT API - MYSQL] SQL:", sql);

        const [rows] = await connection.execute(sql, [
          ...params,
          limit,
          offset,
        ]);

        let total: number | undefined = undefined;
        if (count) {
          const [cnt] = await connection.execute(
            `SELECT COUNT(*) as c FROM (
              SELECT 1 FROM ${fullTable} ${clause} GROUP BY ${attr}
            ) sub`,
            params
          );
          total = Array.isArray(cnt) ? (cnt as any)[0]?.c : undefined;
        }
        return NextResponse.json({ ok: true, rows, total });
      } finally {
        await connection.end();
      }
    }

    return NextResponse.json(
      { ok: false, error: "Tipo de base de datos no soportado" },
      { status: 400 }
    );
  } catch (err: any) {
    console.error("[COUNT API FATAL ERROR]", err);
    return NextResponse.json(
      {
        ok: false,
        error: err?.message || "Error ejecutando consulta de conteo",
      },
      { status: 500 }
    );
  }
}
