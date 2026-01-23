import { NextRequest, NextResponse } from "next/server";
import mysql from "mysql2/promise";
import { Client as PgClient } from "pg";
import { createClient } from "@/lib/supabase/server";

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

type CastConversion = {
  column: string;
  targetType:
    | "number"
    | "integer"
    | "decimal"
    | "string"
    | "boolean"
    | "date"
    | "datetime";
  // Opcional, no se usa: se reemplaza la columna original
  resultColumn?: string;
};

type CastQueryBody = {
  connectionId?: string | number;
  type?: "mysql" | "postgres" | "postgresql";
  host?: string;
  database?: string;
  user?: string;
  password?: string;
  port?: number;
  ssl?: boolean;
  table: string; // schema.table
  columns?: string[]; // selected columns; default *
  conditions?: FilterCondition[];
  conversions: CastConversion[]; // conversions to perform
  limit?: number;
  offset?: number;
  count?: boolean;
};

function buildWhereClausePg(conds: FilterCondition[]) {
  const params: any[] = [];
  const parts = conds.map((c) => {
    const col = `"${c.column.replace(/"/g, '""')}"`;
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
    const col = `\`${c.column.replace(/`/g, "``")}\``;
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

function pgCastExpr(column: string, targetType: CastConversion["targetType"]) {
  const col = `"${column.replace(/"/g, '""')}"`;
  // Robust sanitizer for numeric-like strings supporting patterns:
  //  - "27.201.643" (dots as thousand) -> 27201643
  //  - "1.234.567,89" (European) -> 1234567.89
  //  - "1,234,567.89" (US) -> 1234567.89
  //  - "1,234,567" / "1.234.567" -> 1234567
  //  - Single "," or "." acts as decimal if only one occurrence.
  // We count occurrences of separators and decide transformation.
  const sanitized = `NULLIF(
    (
      WITH raw AS (
        SELECT regexp_replace(COALESCE(${col}::text,''), '\\s+', '', 'g') AS r
      ), counts AS (
        SELECT r,
               (length(r) - length(replace(r, '.', ''))) AS dot_count,
               (length(r) - length(replace(r, ',', ''))) AS comma_count,
               position('.' in r) AS first_dot_pos,
               position(',' in r) AS first_comma_pos
        FROM raw
      )
      SELECT regexp_replace(
        CASE
          -- Multiple dots, no commas: treat all dots as thousand separators
          WHEN comma_count = 0 AND dot_count > 1 THEN replace(r, '.', '')
          -- Multiple commas, no dots: treat commas as thousand separators
          WHEN dot_count = 0 AND comma_count > 1 THEN replace(r, ',', '')
          -- Both present: last occurring separator is decimal, other thousand
          WHEN comma_count > 0 AND dot_count > 0 THEN (
            CASE
              WHEN first_comma_pos > first_dot_pos
                THEN replace(replace(r, '.', ''), ',', '.') -- comma decimal
              ELSE replace(replace(r, ',', ''), '.', '.')   -- dot decimal
            END
          )
          -- Single comma only: decimal comma
          WHEN comma_count = 1 AND dot_count = 0 THEN replace(r, ',', '.')
          -- Single dot only: already decimal
          WHEN dot_count = 1 AND comma_count = 0 THEN r
          ELSE r
        END,
        '[^0-9.\-]', '', 'g'
      ) FROM counts
    ),
    ''
  )`;
  switch (targetType) {
    case "number":
    case "decimal":
      return `CAST(${sanitized} AS NUMERIC)`;
    case "integer":
      return `CAST(${sanitized} AS NUMERIC)::INTEGER`;
    case "string":
      return `CAST(${col} AS TEXT)`;
    case "boolean":
      // Normalize various truthy/falsey string values
      return `CASE
        WHEN trim(lower(COALESCE(${col}::text, ''))) IN ('true','t','1','yes','y','si','sí') THEN true
        WHEN trim(lower(COALESCE(${col}::text, ''))) IN ('false','f','0','no','n') THEN false
        ELSE NULL
      END`;
    case "date":
      return `CAST(${col} AS DATE)`;
    case "datetime":
      return `CAST(${col} AS TIMESTAMP)`;
    default:
      return col;
  }
}

function myCastExpr(column: string, targetType: CastConversion["targetType"]) {
  const col = `\`${column.replace(/`/g, "``")}\``;
  // Improved sanitizer for MySQL mirroring Postgres logic using length diff for counts
  const raw = `REPLACE(COALESCE(${col}, ''), ' ', '')`;
  const dotCount = `(LENGTH(${raw}) - LENGTH(REPLACE(${raw}, '.', '')))`;
  const commaCount = `(LENGTH(${raw}) - LENGTH(REPLACE(${raw}, ',', '')))`;
  const cleaned = `CASE
    WHEN ${commaCount} = 0 AND ${dotCount} > 1 THEN REPLACE(${raw}, '.', '')
    WHEN ${dotCount} = 0 AND ${commaCount} > 1 THEN REPLACE(${raw}, ',', '')
    WHEN ${commaCount} > 0 AND ${dotCount} > 0 THEN CASE
        WHEN LOCATE(',', ${raw}) > LOCATE('.', ${raw}) THEN REPLACE(REPLACE(${raw}, '.', ''), ',', '.')
        ELSE REPLACE(REPLACE(${raw}, ',', ''), '.', '.')
      END
    WHEN ${commaCount} = 1 AND ${dotCount} = 0 THEN REPLACE(${raw}, ',', '.')
    ELSE ${raw}
  END`;
  const cleanedSymbols = `REPLACE(REPLACE(${cleaned}, '$', ''), '%', '')`;
  switch (targetType) {
    case "number":
    case "decimal":
      return `CAST(NULLIF(${cleanedSymbols}, '') AS DECIMAL(38,10))`;
    case "integer":
      return `CAST(NULLIF(${cleanedSymbols}, '') AS SIGNED)`;
    case "string":
      return `CAST(${col} AS CHAR)`;
    case "boolean":
      // MySQL no tiene boolean real, usamos TINYINT(1)
      return `CASE
        WHEN LOWER(TRIM(COALESCE(${col}, ''))) IN ('true','t','1','yes','y','si','sí') THEN 1
        WHEN LOWER(TRIM(COALESCE(${col}, ''))) IN ('false','f','0','no','n') THEN 0
        ELSE NULL
      END`;
    case "date":
      return `CAST(${col} AS DATE)`;
    case "datetime":
      return `CAST(${col} AS DATETIME)`;
    default:
      return col;
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = (await req.json()) as CastQueryBody | null;
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
      columns,
      conditions,
      conversions,
      limit,
      offset,
      count,
    } = body;

    if (!table)
      return NextResponse.json(
        { ok: false, error: "Tabla requerida" },
        { status: 400 }
      );

    if (!conversions || conversions.length === 0)
      return NextResponse.json(
        { ok: false, error: "Se requiere al menos una conversión" },
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

    // Load connection creds by ID, if provided
    if (connectionId != null) {
      const { data: conn, error: connError } = await supabase
        .from("connections")
        .select("id, user_id, type, db_host, db_name, db_user, db_port")
        .eq("id", String(connectionId))
        .maybeSingle(); 
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

    // Excel branch using internal Postgres DW
    if (type === ("excel" as any)) {
      const { data: meta, error: metaError } = await supabase
        .from("data_tables")
        .select("physical_table_name")
        .eq("connection_id", String(connectionId))
        .single();
      if (metaError || !meta) {
        return NextResponse.json(
          { ok: false, error: "Metadatos de Excel no encontrados" },
          { status: 404 }
        );
      }
      const tableNamePhysical =
        (meta as any).physical_table_name ||
        `import_${String(connectionId).replaceAll("-", "_")}`;
      const dbUrl = process.env.SUPABASE_DB_URL;
      if (!dbUrl) {
        return NextResponse.json(
          {
            ok: false,
            error: "Configuración de base de datos interna no disponible",
          },
          { status: 500 }
        );
      }
      const client = new PgClient({ connectionString: dbUrl } as any);
      await client.connect();

      // Resolver columnas si no vienen especificadas
      let cols = columns && columns.length ? [...columns] : [];
      // Corregir comillas: faltaba la comilla de cierre del identificador de tabla
      const fullTable = `"data_warehouse"."${tableNamePhysical.replace(
        /"/g,
        '""'
      )}"`;
      if (cols.length === 0) {
        const [sch, tbl] = fullTable.replace(/"/g, "").split(".");
        const metaCols = await client.query(
          `SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 ORDER BY ordinal_position`,
          [sch, tbl]
        );
        cols = metaCols.rows.map((r: any) => r.column_name);
      }
      const castMap = new Map<string, CastConversion>();
      for (const cv of conversions) castMap.set(cv.column, cv);
      const allCols = cols
        .map((c) => {
          const cv = castMap.get(c);
          if (cv) {
            const expr = pgCastExpr(c, cv.targetType);
            return `${expr} AS "${c.replace(/"/g, '""')}"`;
          }
          return `"${c.replace(/"/g, '""')}"`;
        })
        .join(", ");
      const { clause, params } = buildWhereClausePg(conditions || []);
      const sql = `SELECT ${allCols} FROM ${fullTable} ${clause} LIMIT $${
        params.length + 1
      } OFFSET $${params.length + 2}`;
      const resDb = await client.query(sql, [...params, limit, offset]);
      let totalOut: number | undefined = undefined;
      if (count) {
        const cntRes = await client.query(
          `SELECT COUNT(*)::int as c FROM ${fullTable} ${clause}`,
          params
        );
        totalOut = cntRes.rows?.[0]?.c ?? undefined;
      }
      await client.end();
      return NextResponse.json({ ok: true, rows: resDb.rows, total: totalOut });
    }

    if (!host || !user)
      return NextResponse.json(
        { ok: false, error: "Parámetros incompletos" },
        { status: 400 }
      );

    // Parse schema.table
    const [schema, tableName] = table.includes(".")
      ? table.split(".", 2)
      : ["public", table];

    // Determine database type if not provided
    if (!type) {
      const p = port ? Number(port) : undefined;
      if (p === 5432 || p === 5433) {
        type = "postgres";
      } else if (p === 3306 || p === 3307) {
        type = "mysql";
      } else {
        type = "postgres"; // default
      }
    }

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

      // Resolver columnas si no vienen especificadas
      let cols = columns && columns.length ? [...columns] : [];
      if (cols.length === 0) {
        const metaCols = await client.query(
          `SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 ORDER BY ordinal_position`,
          [schema, tableName]
        );
        cols = metaCols.rows.map((r: any) => r.column_name);
      }
      const castMap = new Map<string, CastConversion>();
      for (const cv of conversions) castMap.set(cv.column, cv);
      const allCols = cols
        .map((c) => {
          const cv = castMap.get(c);
          if (cv) {
            const expr = pgCastExpr(c, cv.targetType);
            return `${expr} AS "${c.replace(/"/g, '""')}"`;
          }
          return `"${c.replace(/"/g, '""')}"`;
        })
        .join(", ");
      const fullTable = `"${schema.replace(/"/g, '""')}"."${tableName.replace(
        /"/g,
        '""'
      )}"`;

      const { clause, params } = buildWhereClausePg(conditions || []);
      const sql = `SELECT ${allCols} FROM ${fullTable} ${clause} LIMIT $${
        params.length + 1
      } OFFSET $${params.length + 2}`;

      const res = await client.query(sql, [...params, limit, offset]);

      let total: number | undefined = undefined;
      if (count) {
        const cntRes = await client.query(
          `SELECT COUNT(*)::int as c FROM ${fullTable} ${clause}`,
          params
        );
        total = cntRes.rows?.[0]?.c ?? undefined;
      }

      await client.end();
      return NextResponse.json({ ok: true, rows: res.rows, total });
    }

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

      // Resolver columnas si no vienen especificadas
      let cols = columns && columns.length ? [...columns] : [];
      if (cols.length === 0) {
        const [sch, tbl] = [schema, tableName];
        const [metaCols] = await connection.execute(
          `SELECT COLUMN_NAME as column_name FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION`,
          [sch, tbl]
        );
        cols = Array.isArray(metaCols)
          ? (metaCols as any[]).map((r) => r.column_name)
          : [];
      }
      const castMap = new Map<string, CastConversion>();
      for (const cv of conversions) castMap.set(cv.column, cv);
      const allCols = cols
        .map((c) => {
          const cv = castMap.get(c);
          if (cv) {
            const expr = myCastExpr(c, cv.targetType);
            return `${expr} AS \`${c.replace(/`/g, "``")}\``;
          }
          return `\`${c.replace(/`/g, "``")}\``;
        })
        .join(", ");
      const fullTable = `\`${schema.replace(
        /`/g,
        "``"
      )}\`.\`${tableName.replace(/`/g, "``")}\``;

      const { clause, params } = buildWhereClauseMy(conditions || []);
      const sql = `SELECT ${allCols} FROM ${fullTable} ${clause} LIMIT ? OFFSET ?`;

      const [rows] = await connection.execute(sql, [...params, limit, offset]);

      let total: number | undefined = undefined;
      if (count) {
        const [cnt] = await connection.execute(
          `SELECT COUNT(*) as c FROM ${fullTable} ${clause}`,
          params
        );
        total = Array.isArray(cnt) ? (cnt as any)[0]?.c : undefined;
      }

      await connection.end();
      return NextResponse.json({ ok: true, rows, total });
    }

    return NextResponse.json(
      { ok: false, error: "Tipo de base de datos no soportado" },
      { status: 400 }
    );
  } catch (err: any) {
    return NextResponse.json(
      {
        ok: false,
        error: err?.message || "Error ejecutando conversión de tipos",
      },
      { status: 500 }
    );
  }
}
