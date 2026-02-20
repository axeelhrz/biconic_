import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { decryptConnectionPassword } from "@/lib/connection-secret";
import { Client as PgClient } from "pg";
import { quoteIdent, quoteQualified } from "@/lib/sql/helpers";

const MAX_VALUES = 500;

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

    return NextResponse.json(
      { ok: false, error: "Tipo de conexión no soportado para valores distintos" },
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
