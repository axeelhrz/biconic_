import { NextRequest, NextResponse } from "next/server";
import mysql from "mysql2/promise";
import { Client as PgClient } from "pg";
import { createClient } from "@/lib/supabase/server";

type ConnectionBody = {
  type?: "mysql" | "postgres" | "postgresql" | "excel";
  host?: string;
  database?: string;
  user?: string;
  password?: string;
  port?: number;
  ssl?: boolean;
  connectionId?: string | number;
};

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    console.log("[metadata] POST start");
    const body = (await req.json()) as ConnectionBody | null;
    if (!body) {
      return NextResponse.json(
        { ok: false, error: "Cuerpo de la solicitud vacío" },
        { status: 400 }
      );
    }

    let { type, host, database, user, password, port, ssl, connectionId } =
      body;
    if (connectionId != null) {
      console.log("[metadata] Using connectionId=", String(connectionId));
    }

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

    // If connectionId is provided, load credentials from Supabase to avoid exposing them client-side
    if (connectionId != null) {
      const { data: conn, error: connError } = await supabase
        .from("connections")
        .select(
          "id, user_id, type, db_host, db_name, db_user, db_port, original_file_name"
        )
        .eq("id", String(connectionId))
        .eq("id", String(connectionId))
        .maybeSingle();
      if (connError || !conn) {
        return NextResponse.json(
          { ok: false, error: connError?.message || "Conexión no encontrada" },
          { status: 404 }
        );
      }
      // Mapear nuevos campos
      host = (conn as any)?.db_host ?? host;
      database = (conn as any)?.db_name ?? database;
      user = (conn as any)?.db_user ?? user;
      port = (conn as any)?.db_port ?? port;

      // Detectar si es una conexión Excel por el campo type
      if (
        (conn as any)?.type === "excel_file" ||
        (conn as any)?.type === "excel"
      ) {
        type = "excel";
      }

      console.log("[metadata] Loaded connection from DB (no secrets logged)", {
        hasHost: !!host,
        hasDatabase: !!database,
        hasUser: !!user,
        hasPassword: !!password,
        port,
        detectedType: type,
      });
    }

    // Manejar conexiones Excel usando data_tables
    if (type === "excel") {
      console.log(
        "[metadata] Processing Excel connection for connectionId:",
        connectionId
      );

      const { data: meta, error: metaError } = await supabase
        .from("data_tables")
        .select("columns, physical_table_name, total_rows, updated_at")
        .eq("connection_id", String(connectionId))
        .single();

      if (metaError || !meta) {
        return NextResponse.json(
          { ok: false, error: "Metadatos de Excel no encontrados" },
          { status: 404 }
        );
      }

      const schemas = ["data_warehouse"];
      const tableName =
        meta.physical_table_name ||
        `import_${String(connectionId).replaceAll("-", "_")}`;
      const columns = Array.isArray((meta as any).columns)
        ? (meta as any).columns.map((c: any) => ({
            name: c.name || c.original_name || "col",
            dataType: c.type || "text",
            nullable: true,
            defaultValue: null,
            isPrimaryKey: c.name === "_import_id",
          }))
        : [];
      const tables = [
        {
          schema: "data_warehouse",
          name: tableName,
          columns,
        },
      ];

      return NextResponse.json({
        ok: true,
        metadata: {
          dbVersion: "Excel Import",
          schemas,
          tables,
          totalRows: (meta as any).total_rows ?? undefined,
          fileName: undefined,
        },
      });
    }

    if (!host || !user) {
      return NextResponse.json(
        { ok: false, error: "Parámetros incompletos" },
        { status: 400 }
      );
    }

    if (type === "mysql") {
      if (!password) {
        return NextResponse.json(
          { ok: false, error: "Se requiere contraseña para MySQL" },
          { status: 400 }
        );
      }

      const connection = await mysql.createConnection({
        host,
        user,
        port: port ? Number(port) : 3306,
        database,
        password,
        connectTimeout: 8000,
      });

      // Version
      const [[versionRow]] = await connection.query<any[]>(
        "SELECT VERSION() AS version"
      );
      const dbVersion = versionRow?.version as string | undefined;

      // Schemas (databases)
      const [schemaRows] = await connection.query<any[]>(
        "SELECT SCHEMA_NAME AS schema_name FROM information_schema.SCHEMATA WHERE SCHEMA_NAME NOT IN ('information_schema','mysql','performance_schema','sys')"
      );
      const schemas: string[] = schemaRows.map((r) => r.schema_name);

      // Tables
      const [tableRows] = await connection.query<any[]>(
        "SELECT TABLE_SCHEMA as table_schema, TABLE_NAME as table_name FROM information_schema.TABLES WHERE TABLE_TYPE='BASE TABLE' AND TABLE_SCHEMA NOT IN ('information_schema','mysql','performance_schema','sys')"
      );

      // Columns
      const [columnRows] = await connection.query<any[]>(
        "SELECT TABLE_SCHEMA as table_schema, TABLE_NAME as table_name, COLUMN_NAME as column_name, DATA_TYPE as data_type, IS_NULLABLE as is_nullable, COLUMN_DEFAULT as column_default FROM information_schema.COLUMNS WHERE TABLE_SCHEMA NOT IN ('information_schema','mysql','performance_schema','sys')"
      );

      // Primary keys
      const [pkRows] = await connection.query<any[]>(
        "SELECT kcu.TABLE_SCHEMA as table_schema, kcu.TABLE_NAME as table_name, kcu.COLUMN_NAME as column_name FROM information_schema.TABLE_CONSTRAINTS tc JOIN information_schema.KEY_COLUMN_USAGE kcu ON kcu.CONSTRAINT_NAME = tc.CONSTRAINT_NAME AND kcu.TABLE_SCHEMA = tc.TABLE_SCHEMA AND kcu.TABLE_NAME = tc.TABLE_NAME WHERE tc.CONSTRAINT_TYPE='PRIMARY KEY'"
      );

      await connection.end();

      const pkSet = new Set(
        pkRows.map((r) => `${r.table_schema}.${r.table_name}.${r.column_name}`)
      );

      const tableMap = new Map<string, any>();
      for (const t of tableRows) {
        const key = `${t.table_schema}.${t.table_name}`;
        tableMap.set(key, {
          schema: t.table_schema,
          name: t.table_name,
          columns: [] as any[],
        });
      }

      for (const c of columnRows) {
        const key = `${c.table_schema}.${c.table_name}`;
        const tbl = tableMap.get(key);
        if (!tbl) continue;
        tbl.columns.push({
          name: c.column_name,
          dataType: c.data_type,
          nullable: String(c.is_nullable).toUpperCase() === "YES",
          defaultValue: c.column_default ?? null,
          isPrimaryKey: pkSet.has(
            `${c.table_schema}.${c.table_name}.${c.column_name}`
          ),
        });
      }

      const tables = Array.from(tableMap.values());
      return NextResponse.json({
        ok: true,
        metadata: { dbVersion, schemas, tables },
      });
    }

    if (type === "postgres" || type === "postgresql") {
      if (!password) {
        return NextResponse.json(
          { ok: false, error: "Se requiere contraseña para PostgreSQL" },
          { status: 400 }
        );
      }

      console.log("[metadata] Fetching PostgreSQL metadata", {
        host,
        database,
        port: port ?? 5432,
        ssl: !!ssl,
      });
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

      // Version
      const verRes = await client.query("SHOW server_version");
      const dbVersion = verRes.rows?.[0]?.server_version as string | undefined;

      // Schemas
      const schemasRes = await client.query(
        `SELECT schema_name FROM information_schema.schemata WHERE schema_name NOT IN ('pg_catalog','information_schema') ORDER BY schema_name`
      );
      const schemas: string[] = schemasRes.rows.map((r) => r.schema_name);

      // Tables
      const tablesRes = await client.query(
        `SELECT table_schema, table_name FROM information_schema.tables WHERE table_type = 'BASE TABLE' AND table_schema NOT IN ('pg_catalog','information_schema')`
      );

      // Columns
      const colsRes = await client.query(
        `SELECT table_schema, table_name, column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema NOT IN ('pg_catalog','information_schema')`
      );

      // Primary keys
      const pkRes = await client.query(
        `SELECT kc.table_schema, kc.table_name, kc.column_name
         FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage kc
           ON kc.constraint_name = tc.constraint_name
           AND kc.table_schema = tc.table_schema
         WHERE tc.constraint_type = 'PRIMARY KEY'`
      );

      await client.end();

      const pkSet = new Set(
        pkRes.rows.map(
          (r) => `${r.table_schema}.${r.table_name}.${r.column_name}`
        )
      );

      const tableMap = new Map<string, any>();
      for (const t of tablesRes.rows) {
        const key = `${t.table_schema}.${t.table_name}`;
        tableMap.set(key, {
          schema: t.table_schema,
          name: t.table_name,
          columns: [] as any[],
        });
      }
      for (const c of colsRes.rows) {
        const key = `${c.table_schema}.${c.table_name}`;
        const tbl = tableMap.get(key);
        if (!tbl) continue;
        tbl.columns.push({
          name: c.column_name,
          dataType: c.data_type,
          nullable: String(c.is_nullable).toUpperCase() === "YES",
          defaultValue: c.column_default ?? null,
          isPrimaryKey: pkSet.has(
            `${c.table_schema}.${c.table_name}.${c.column_name}`
          ),
        });
      }

      const tables = Array.from(tableMap.values());
      return NextResponse.json({
        ok: true,
        metadata: { dbVersion, schemas, tables },
      });
    }

    // If type was not provided, try PostgreSQL first, then MySQL as a fallback
    if (!type) {
      // Heurística por puerto para reducir intentos y timeouts
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
          connectionTimeoutMillis: 6000,
          ssl: withSSL ? { rejectUnauthorized: false } : undefined,
        } as any);
        await client.connect();
        await client.end();
        return await POST(
          new NextRequest(req.url, {
            method: "POST",
            body: JSON.stringify({
              type: "postgres",
              host,
              database,
              user,
              password,
              port: p ?? 5432,
              ssl: withSSL,
            }),
            headers: req.headers,
          } as any)
        );
      };

      const tryMy = async (): Promise<NextResponse> => {
        const connection = await mysql.createConnection({
          host,
          user,
          port: p ?? 3306,
          database,
          password,
          connectTimeout: 6000,
        });
        await connection.ping();
        await connection.end();
        return await POST(
          new NextRequest(req.url, {
            method: "POST",
            body: JSON.stringify({
              type: "mysql",
              host,
              database,
              user,
              password,
              port: p ?? 3306,
            }),
            headers: req.headers,
          } as any)
        );
      };

      try {
        if (looksPg) {
          try {
            console.log("[metadata] Autodetect: PG (no SSL) by port hint");
            return await tryPg(false);
          } catch {}
          console.log("[metadata] Autodetect: PG (with SSL) by port hint");
          return await tryPg(true);
        }
        if (looksMy) {
          console.log("[metadata] Autodetect: MySQL by port hint");
          return await tryMy();
        }
      } catch (e) {
        // fall through to generic autodetect if hint failed
      }

      // Fallback a genérico (como antes) pero con timeouts menores
      let lastErr: any = null;
      try {
        console.log("[metadata] Autodetect: trying PostgreSQL (no SSL)");
        return await tryPg(false);
      } catch (eNoSSL) {
        lastErr = eNoSSL;
      }
      try {
        console.log("[metadata] Autodetect: trying PostgreSQL (with SSL)");
        return await tryPg(true);
      } catch (eSSL) {
        lastErr = eSSL;
      }
      try {
        console.log("[metadata] Autodetect: trying MySQL");
        return await tryMy();
      } catch (e2) {
        const msg =
          (e2 as any)?.message ||
          (lastErr as any)?.message ||
          "No fue posible detectar el tipo de base de datos";
        console.error("[metadata] Autodetect failed:", msg);
        return NextResponse.json({ ok: false, error: msg }, { status: 400 });
      }
    }

    return NextResponse.json(
      { ok: false, error: "Tipo de base de datos no soportado" },
      { status: 400 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "Error obteniendo metadata" },
      { status: 500 }
    );
  }
}
