import { NextRequest, NextResponse } from "next/server";
import mysql from "mysql2/promise";
import { Client as PgClient } from "pg";
import { createClient } from "@/lib/supabase/server";
import { decryptConnectionPassword } from "@/lib/connection-secret";
import { deriveColumnTypesFromSample } from "@/lib/derive-column-types";

type Body = { connectionId: string | number; tableName?: string };

const SAMPLE_LIMIT = 300;

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = (await req.json()) as Body | null;
    if (!body?.connectionId) {
      return NextResponse.json({ ok: false, error: "connectionId requerido" }, { status: 400 });
    }
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });
    }

    const { data: conn, error: connError } = await supabase
      .from("connections")
      .select("id, type, db_host, db_name, db_user, db_port, db_password_encrypted")
      .eq("id", String(body.connectionId))
      .maybeSingle();
    if (connError || !conn) {
      return NextResponse.json({ ok: false, error: "Conexión no encontrada" }, { status: 404 });
    }

    let type = (conn as any).type === "excel_file" || (conn as any).type === "excel" ? "excel" : (conn as any).type;
    if (type === "postgresql") type = "postgres";
    let host = (conn as any).db_host;
    let database = (conn as any).db_name;
    let userDb = (conn as any).db_user;
    let port = (conn as any).db_port;
    let password: string | undefined;
    try {
      password = (conn as any).db_password_encrypted ? decryptConnectionPassword((conn as any).db_password_encrypted) : undefined;
    } catch {
      // ignore
    }
    if (!password && (conn as any).type === "firebird") {
      password = process.env.FLEXXUS_PASSWORD ?? undefined;
    }

    let rows: Record<string, unknown>[] = [];

    if (type === "excel") {
      const { data: meta, error: metaError } = await supabase
        .from("data_tables")
        .select("physical_table_name")
        .eq("connection_id", String(body.connectionId))
        .maybeSingle();
      if (metaError || !meta) {
        return NextResponse.json({ ok: false, error: "Metadatos de Excel no encontrados" }, { status: 404 });
      }
      const tableName = (meta as any).physical_table_name || `import_${String(body.connectionId).replaceAll("-", "_")}`;
      const dbUrl = process.env.SUPABASE_DB_URL;
      if (!dbUrl) {
        return NextResponse.json({ ok: false, error: "Configuración de base de datos no disponible" }, { status: 500 });
      }
      const client = new PgClient({ connectionString: dbUrl } as any);
      await client.connect();
      try {
        const safeTable = tableName.replace(/"/g, '""');
        const res = await client.query(`SELECT * FROM "data_warehouse"."${safeTable}" LIMIT $1`, [SAMPLE_LIMIT]);
        rows = (res.rows ?? []) as Record<string, unknown>[];
      } finally {
        await client.end();
      }
    } else if (type === "postgres" || type === "postgresql") {
      if (!password || !host || !userDb) {
        return NextResponse.json({ ok: false, error: "Credenciales incompletas para Postgres" }, { status: 400 });
      }
      const tableName = (body.tableName ?? "").trim() || "public.unknown";
      const [schema, table] = tableName.includes(".") ? tableName.split(".", 2) : ["public", tableName];
      const client = new PgClient({
        host,
        user: userDb,
        database: database ?? "postgres",
        port: port ? Number(port) : 5432,
        password,
        connectionTimeoutMillis: 10000,
        ssl: false,
      } as any);
      await client.connect();
      try {
        const qSchema = schema.replace(/"/g, '"');
        const qTable = table.replace(/"/g, '"');
        const res = await client.query(`SELECT * FROM "${qSchema}"."${qTable}" LIMIT $1`, [SAMPLE_LIMIT]);
        rows = (res.rows ?? []) as Record<string, unknown>[];
      } finally {
        await client.end();
      }
    } else if (type === "mysql") {
      if (!password || !host || !userDb) {
        return NextResponse.json({ ok: false, error: "Credenciales incompletas para MySQL" }, { status: 400 });
      }
      const tableName = (body.tableName ?? "").trim() || "unknown";
      const [schema, table] = tableName.includes(".") ? tableName.split(".", 2) : [database ?? "public", tableName];
      const connection = await mysql.createConnection({
        host,
        user: userDb,
        database: (database as string) ?? "mysql",
        port: port ? Number(port) : 3306,
        password,
        connectTimeout: 10000,
      });
      try {
        const [rowList] = await connection.query(`SELECT * FROM \`${schema}\`.\`${table}\` LIMIT ?`, [SAMPLE_LIMIT]);
        rows = Array.isArray(rowList) ? (rowList as Record<string, unknown>[]) : [];
      } finally {
        await connection.end();
      }
    } else if (type === "firebird") {
      if (!password || !host || !database || !userDb) {
        return NextResponse.json({ ok: false, error: "Credenciales incompletas para Firebird" }, { status: 400 });
      }
      const tableName = (body.tableName ?? "").trim();
      if (!tableName) {
        return NextResponse.json({ ok: false, error: "tableName requerido para Firebird" }, { status: 400 });
      }
      // Firebird: usar solo el nombre de la relación (sin esquema) para evitar -204 "Table/Procedure unknown"
      const tableNameOnly = tableName.includes(".") ? tableName.split(".").pop()!.trim() : tableName;
      const relationName = /^[A-Z0-9_]+$/i.test(tableNameOnly) ? tableNameOnly.toUpperCase() : `"${tableNameOnly.replace(/"/g, '""')}"`;
      const Firebird = require("node-firebird");
      rows = await new Promise<Record<string, unknown>[]>((resolve, reject) => {
        const opts = {
          host,
          port: port ? Number(port) : 15421,
          database,
          user: userDb,
          password: password || "",
          lowercase_keys: false,
        };
        Firebird.attach(opts, (errAttach: Error | null, db: any) => {
          if (errAttach) {
            reject(errAttach);
            return;
          }
          const sql = `SELECT * FROM ${relationName} FETCH FIRST ? ROWS ONLY`;
          db.query(sql, [SAMPLE_LIMIT], (errQ: Error | null, r: any[]) => {
            if (db?.detach) db.detach(() => {});
            if (errQ) reject(errQ);
            else resolve((r ?? []) as Record<string, unknown>[]);
          });
        });
      });
    } else {
      return NextResponse.json({ ok: false, error: "Tipo de conexión no soportado para inferir tipos" }, { status: 400 });
    }

    const columnTypes = deriveColumnTypesFromSample(rows);
    return NextResponse.json({ ok: true, columnTypes });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Error al inferir tipos";
    console.error("[infer-column-types]", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
