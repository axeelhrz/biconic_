import { NextRequest, NextResponse } from "next/server";
import mysql from "mysql2/promise";
import { Client as PgClient } from "pg";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { type, host, database, user, password, port } = body || {};

    // Seguridad: requerir usuario autenticado
    const supabase = await createClient();
    const {
      data: { user: currentUser },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !currentUser) {
      return NextResponse.json(
        { ok: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    if (!type || !host || !user) {
      return NextResponse.json(
        { ok: false, error: "Parámetros incompletos" },
        { status: 400 }
      );
    }

    if (type === "mysql") {
      // Intentar conexión real a MySQL
      const connection = await mysql.createConnection({
        host,
        user,
        port: port ? Number(port) : 3306,
        database,
        password,
        // Tiempo de espera corto para evitar colgar el request
        connectTimeout: 5000,
      });

      // Ejecutar un ping simple
      await connection.ping();
      await connection.end();
      return NextResponse.json({ ok: true });
    } else if (type === "postgres" || type === "postgresql") {
      // Intentar conexión real a PostgreSQL
      const tryConnect = async (ssl?: boolean) => {
        const client = new PgClient({
          host,
          user,
          database,
          port: port ? Number(port) : 5432,
          password,
          connectionTimeoutMillis: 5000,
          ssl: ssl ? { rejectUnauthorized: false } : undefined,
        } as any);
        await client.connect();
        await client.query("SELECT 1");
        await client.end();
      };

      try {
        await tryConnect(false);
      } catch (eNoSSL) {
        // Algunos proveedores requieren SSL obligatorio
        await tryConnect(true);
      }
      return NextResponse.json({ ok: true });
    } else {
      return NextResponse.json(
        { ok: false, error: "Tipo de base de datos no soportado aún" },
        { status: 400 }
      );
    }
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "Error probando la conexión" },
      { status: 500 }
    );
  }
}
