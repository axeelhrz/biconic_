import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { decryptConnectionPassword } from "@/lib/connection-secret";
import { Client as PgClient } from "pg";
import mysql from "mysql2/promise";
import { quoteIdent, quoteQualified } from "@/lib/sql/helpers";

const MAX_VALUES = 500;

function safeIdentMySQL(name: string): string {
  return "`" + String(name).replace(/`/g, "``") + "`";
}

function safeIdentFirebird(name: string): string {
  return '"' + String(name).replace(/"/g, '""') + '"';
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { connectionId, table: tableQualified, column: columnName } = body as {
      connectionId: string;
      table: string;
      column: string;
    };
    if (!connectionId || !tableQualified?.trim() || !columnName?.trim()) {
      return NextResponse.json(
        { ok: false, error: "connectionId, table y column son requeridos" },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });
    }

    const { data: conn, error: connError } = await supabase
      .from("connections")
      .select("id, user_id, type, db_host, db_name, db_user, db_port, db_password_encrypted")
      .eq("id", String(connectionId))
      .maybeSingle();
    if (connError || !conn) {
      return NextResponse.json(
        { ok: false, error: connError?.message || "Conexión no encontrada" },
        { status: 404 }
      );
    }

    const type = (conn as any).type;
    if (type === "excel_file" || type === "excel") {
      const { data: meta } = await supabase
        .from("data_tables")
        .select("physical_schema_name, physical_table_name")
        .eq("connection_id", String(connectionId))
        .single();
      if (!meta?.physical_table_name) {
        return NextResponse.json(
          { ok: false, error: "Metadatos de Excel no encontrados" },
          { status: 404 }
        );
      }
      const schema = (meta as any).physical_schema_name || "data_warehouse";
      const table = (meta as any).physical_table_name;
      const dbUrl = process.env.SUPABASE_DB_URL;
      if (!dbUrl) {
        return NextResponse.json(
          { ok: false, error: "SUPABASE_DB_URL no configurado" },
          { status: 500 }
        );
      }
      const client = new PgClient({ connectionString: dbUrl });
      await client.connect();
      try {
        const col = quoteIdent(columnName.trim(), "postgres");
        const qual = `"${schema.replace(/"/g, '""')}"."${table.replace(/"/g, '""')}"`;
        const sql = `SELECT DISTINCT ${col} AS value FROM ${qual} WHERE ${col} IS NOT NULL ORDER BY ${col} LIMIT ${MAX_VALUES}`;
        const res = await client.query(sql);
        const values = (res.rows || []).map((r: any) => r.value != null ? String(r.value) : "");
        return NextResponse.json({ ok: true, values });
      } finally {
        await client.end();
      }
    }

    if (type === "postgres" || type === "postgresql") {
      const password = (conn as any).db_password_encrypted
        ? decryptConnectionPassword((conn as any).db_password_encrypted)
        : undefined;
      const client = new PgClient({
        host: (conn as any).db_host,
        user: (conn as any).db_user,
        database: (conn as any).db_name,
        port: (conn as any).db_port ?? 5432,
        password,
      });
      await client.connect();
      try {
        const qual = quoteQualified(tableQualified.trim(), "postgres");
        const col = quoteIdent(columnName.trim(), "postgres");
        const sql = `SELECT DISTINCT ${col} AS value FROM ${qual} WHERE ${col} IS NOT NULL ORDER BY ${col} LIMIT ${MAX_VALUES}`;
        const res = await client.query(sql);
        const values = (res.rows || []).map((r: any) => r.value != null ? String(r.value) : "");
        return NextResponse.json({ ok: true, values });
      } finally {
        await client.end();
      }
    }

    if (type === "mysql") {
      const password = (conn as any).db_password_encrypted
        ? decryptConnectionPassword((conn as any).db_password_encrypted)
        : (conn as any).db_password ?? "";
      const parts = tableQualified.trim().split(".", 2);
      const schema = parts.length > 1 ? parts[0].trim() : (conn as any).db_name;
      const tableName = parts.length > 1 ? parts[1].trim() : parts[0].trim();
      const fullTable = `${safeIdentMySQL(schema)}.${safeIdentMySQL(tableName)}`;
      const col = safeIdentMySQL(columnName.trim());
      const connection = await mysql.createConnection({
        host: (conn as any).db_host,
        user: (conn as any).db_user,
        database: (conn as any).db_name,
        port: (conn as any).db_port ?? 3306,
        password: password || "",
      });
      try {
        const [rows] = await connection.execute(
          `SELECT DISTINCT ${col} AS value FROM ${fullTable} WHERE ${col} IS NOT NULL ORDER BY ${col} LIMIT ${MAX_VALUES}`
        );
        const values = (Array.isArray(rows) ? rows : []).map((r: any) => r?.value != null ? String(r.value) : "");
        return NextResponse.json({ ok: true, values });
      } finally {
        await connection.end();
      }
    }

    if (type === "firebird") {
      const password = (conn as any).db_password_encrypted
        ? decryptConnectionPassword((conn as any).db_password_encrypted)
        : (conn as any).db_password ?? process.env.FLEXXUS_PASSWORD ?? "";
      const Firebird = require("node-firebird");
      const tablePart = tableQualified.trim().includes(".")
        ? tableQualified.trim().split(".", 2).map((s) => safeIdentFirebird(s.trim())).join(".")
        : safeIdentFirebird(tableQualified.trim());
      const col = safeIdentFirebird(columnName.trim());
      const sql = `SELECT DISTINCT FIRST ${MAX_VALUES} ${col} AS value FROM ${tablePart} WHERE ${col} IS NOT NULL ORDER BY ${col}`;
      return await new Promise<NextResponse>((resolve) => {
        const opts = {
          host: (conn as any).db_host || "localhost",
          port: (conn as any).db_port ? Number((conn as any).db_port) : 15421,
          database: (conn as any).db_name,
          user: (conn as any).db_user,
          password: password || "",
          lowercase_keys: false,
        };
        Firebird.attach(opts, (errAttach: Error | null, db: any) => {
          if (errAttach) {
            resolve(NextResponse.json({ ok: false, error: errAttach.message }, { status: 400 }));
            return;
          }
          db.query(sql, [], (errQ: Error | null, rows: any[]) => {
            if (db?.detach) db.detach(() => {});
            if (errQ) {
              resolve(NextResponse.json({ ok: false, error: errQ.message }, { status: 400 }));
              return;
            }
            const values = (rows || []).map((r: any) => {
              const v = r?.VALUE ?? r?.value;
              return v != null ? String(v) : "";
            });
            resolve(NextResponse.json({ ok: true, values }));
          });
        });
      });
    }

    return NextResponse.json(
      { ok: false, error: "Tipo de conexión no soportado para valores distintos. Se admite Postgres, MySQL, Firebird y Excel." },
      { status: 400 }
    );
  } catch (err: any) {
    console.error("[distinct-values]", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Error obteniendo valores" },
      { status: 500 }
    );
  }
}
