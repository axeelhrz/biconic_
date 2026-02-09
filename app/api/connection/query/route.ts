import { NextRequest, NextResponse } from "next/server";
import mysql from "mysql2/promise";
import { Client as PgClient } from "pg";
import { createClient } from "@/lib/supabase/server";
import { decryptConnectionPassword } from "@/lib/connection-secret";

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

type QueryBody = {
  connectionId?: string | number;
  type?: "mysql" | "postgres" | "postgresql" | "excel" | "firebird";
  host?: string;
  database?: string;
  user?: string;
  password?: string;
  port?: number;
  ssl?: boolean;
  table: string; // schema.table
  columns?: string[]; // selected columns; default *
  conditions?: FilterCondition[];
  limit?: number;
  offset?: number;
  count?: boolean;
};

function buildWhereClausePg(conds: FilterCondition[]) {
  const params: any[] = [];
  const parts = conds.map((c) => {
    const col = `"${c.column.replace(/"/g, '"')}"`;
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
        // binary ops
        params.push(c.value ?? null);
        return `${col} ${c.operator} $${params.length}`;
      }
    }
  });
  const clause = parts.length ? `WHERE ${parts.join(" AND ")}` : "";
  return { clause, params };
}

function buildWhereClauseFirebird(conds: FilterCondition[]) {
  const params: any[] = [];
  const parts = conds.map((c) => {
    const col = `"${(c.column || "").replace(/"/g, '""')}"`;
    switch (c.operator) {
      case "is null":
        return `${col} IS NULL`;
      case "is not null":
        return `${col} IS NOT NULL`;
      case "contains":
        params.push(`%${c.value ?? ""}%`);
        return `${col} CONTAINING ?`;
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

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = (await req.json()) as QueryBody | null;
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
      limit,
      offset,
      count,
    } = body;
    if (!table)
      return NextResponse.json(
        { ok: false, error: "Tabla requerida" },
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
        .select(
          "id, user_id, type, db_host, db_name, db_user, db_port, original_file_name, db_password_encrypted"
        )
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
      if (!password && (conn as any)?.db_password_encrypted) {
        try {
          password = decryptConnectionPassword((conn as any).db_password_encrypted);
        } catch {}
      }
      if (!password && (conn as any)?.type === "firebird") {
        password = process.env.FLEXXUS_PASSWORD ?? undefined;
      }
      // Detectar si es una conexión Excel por el campo type
      if (
        (conn as any)?.type === "excel_file" ||
        (conn as any)?.type === "excel"
      ) {
        type = "excel";
      }
      if ((conn as any)?.type === "firebird") {
        type = "firebird";
      }
    }
    // Manejar consultas Excel consultando data_warehouse.{physical_table_name}
    if (type === "excel") {
      const { data: meta, error: metaError } = await supabase
        .from("data_tables")
        .select("physical_table_name")
        .eq("connection_id", String(connectionId))
        .maybeSingle();
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
      const cols =
        columns && columns.length
          ? columns.map((c) => `"${c.replace(/"/g, '""')}"`).join(", ")
          : "*";
      const fullTable = `"data_warehouse"."${tableNamePhysical.replace(
        /"/g,
        '""'
      )}"`;
      const { clause, params } = buildWhereClausePg(conditions || []);
      const sql = `SELECT ${cols} FROM ${fullTable} ${clause} LIMIT $${
        params.length + 1
      } OFFSET $${params.length + 2}`;
      const resDb = await client.query(sql, [...params, limit, offset]);
      let total: number | undefined = undefined;
      if (count) {
        const cntRes = await client.query(
          `SELECT COUNT(*)::int as c FROM ${fullTable} ${clause}`,
          params
        );
        total = cntRes.rows?.[0]?.c ?? undefined;
      }
      await client.end();
      return NextResponse.json({ ok: true, rows: resDb.rows, total });
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
      const cols =
        columns && columns.length
          ? columns.map((c) => `"${c.replace(/"/g, '"')}"`).join(", ")
          : "*";
      const fullTable = `"${schema.replace(/"/g, '"')}"."${tableName.replace(
        /"/g,
        '"'
      )}"`;
      const { clause, params } = buildWhereClausePg(conditions || []);
      const sql = `SELECT ${cols} FROM ${fullTable} ${clause} LIMIT $${
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
      const cols =
        columns && columns.length
          ? columns.map((c) => `\`${c.replace(/`/g, "``")}\``).join(", ")
          : "*";
      const fullTable = `\`${schema.replace(
        /`/g,
        "``"
      )}\`.\`${tableName.replace(/`/g, "``")}\``;
      const { clause, params } = buildWhereClauseMy(conditions || []);
      const sql = `SELECT ${cols} FROM ${fullTable} ${clause} LIMIT ? OFFSET ?`;
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

    if (type === "firebird") {
      if (!password)
        return NextResponse.json(
          { ok: false, error: "Se requiere contraseña para Firebird. Guardala al crear la conexión." },
          { status: 400 }
        );
      const Firebird = require("node-firebird");
      const tablePart = table.includes(".")
        ? table.split(".", 2).map((s) => `"${s.replace(/"/g, '""')}"`).join(".")
        : `"${tableName.replace(/"/g, '""')}"`;
      const cols =
        columns && columns.length
          ? columns.map((c) => `"${(c || "").replace(/"/g, '""')}"`).join(", ")
          : "*";
      const { clause, params } = buildWhereClauseFirebird(conditions || []);
      const baseSql = `SELECT ${cols} FROM ${tablePart} ${clause}`;
      const sql = `${baseSql} FETCH FIRST ? ROWS ONLY OFFSET ? ROWS`;
      const allParams = [...params, limit, offset];
      return await new Promise<NextResponse>((resolve, reject) => {
        const opts = {
          host,
          port: port ? Number(port) : 15421,
          database,
          user,
          password: password || "",
          lowercase_keys: false,
        };
        Firebird.attach(opts, (errAttach: Error | null, db: any) => {
          if (errAttach) {
            resolve(NextResponse.json({ ok: false, error: errAttach.message }, { status: 400 }));
            return;
          }
          db.query(sql, allParams, (errQ: Error | null, rows: any[]) => {
            const detach = () => {
              if (db?.detach) db.detach(() => {});
            };
            if (errQ) {
              detach();
              resolve(NextResponse.json({ ok: false, error: errQ.message }, { status: 400 }));
              return;
            }
            let total: number | undefined = undefined;
            if (count) {
              const countSql = `SELECT COUNT(*) AS c FROM ${tablePart} ${clause}`;
              db.query(countSql, params, (errC: Error | null, cntRows: any[]) => {
                if (!errC && cntRows?.[0]) total = Number((cntRows[0] as any).C ?? (cntRows[0] as any).c);
                detach();
                resolve(NextResponse.json({ ok: true, rows: rows || [], total }));
              });
            } else {
              detach();
              resolve(NextResponse.json({ ok: true, rows: rows || [], total }));
            }
          });
        });
      });
    }

    // Autodetect when type not provided: use port hints to reduce timeouts
    {
      const p = port ? Number(port) : undefined;
      const looksPg = p === undefined || p === 5432 || p === 5433;
      const looksMy = p === 3306 || p === 3307;

      const tryPg = async (withSSL: boolean): Promise<NextResponse> => {
        const client = new PgClient({
          host,
          user,
          database,
          port: p ?? 5432,
          password,
          connectionTimeoutMillis: 5000,
          ssl: withSSL ? { rejectUnauthorized: false } : undefined,
        } as any);
        await client.connect();
        await client.end();
        return await POST(
          new NextRequest(req.url, {
            method: "POST",
            body: JSON.stringify({
              ...body,
              type: "postgres",
              ssl: withSSL,
              port: p ?? 5432,
            }),
            headers: req.headers,
          } as any)
        );
      };

      const tryMy = async (): Promise<NextResponse> => {
        const connection = await mysql.createConnection({
          host,
          user,
          database,
          password,
          port: p ?? 3306,
          connectTimeout: 5000,
        });
        await connection.ping();
        await connection.end();
        return await POST(
          new NextRequest(req.url, {
            method: "POST",
            body: JSON.stringify({ ...body, type: "mysql", port: p ?? 3306 }),
            headers: req.headers,
          } as any)
        );
      };

      try {
        if (looksPg) {
          try {
            return await tryPg(false);
          } catch {}
          return await tryPg(true);
        }
        if (looksMy) {
          return await tryMy();
        }
      } catch {}

      // Generic fallback
      try {
        return await tryPg(false);
      } catch {}
      try {
        return await tryPg(true);
      } catch {}
      try {
        return await tryMy();
      } catch {
        return NextResponse.json(
          { ok: false, error: "No fue posible detectar la base de datos" },
          { status: 400 }
        );
      }
    }
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "Error ejecutando consulta" },
      { status: 500 }
    );
  }
}
