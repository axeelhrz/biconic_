import { NextRequest, NextResponse } from "next/server";
import mysql from "mysql2/promise";
import { Client as PgClient } from "pg";
import { createClient } from "@/lib/supabase/server";
import { decryptConnectionPassword } from "@/lib/connection-secret";

type ConnectionBody = {
  type?: "mysql" | "postgres" | "postgresql" | "excel" | "firebird";
  host?: string;
  database?: string;
  user?: string;
  password?: string;
  port?: number;
  ssl?: boolean;
  connectionId?: string | number;
  /** Para Firebird: si se envía, solo se devuelven las columnas de esta tabla (ej. PUBLIC.VENTAS). */
  tableName?: string;
  /** Si true, devuelve todas las tablas de la base (sin filtrar por connection_tables). Para uso en "Descubrir tablas" desde Conexiones. */
  discoverTables?: boolean;
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

    let { type, host, database, user, password, port, ssl, connectionId, tableName: bodyTableName, discoverTables } =
      body;
    let connectionTables: string[] | null = null;
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
          "id, user_id, type, db_host, db_name, db_user, db_port, original_file_name, db_password_encrypted, connection_tables"
        )
        .eq("id", String(connectionId))
        .maybeSingle();
      if (connError || !conn) {
        return NextResponse.json(
          { ok: false, error: connError?.message || "Conexión no encontrada" },
          { status: 404 }
        );
      }
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
      if (
        (conn as any)?.type === "excel_file" ||
        (conn as any)?.type === "excel"
      ) {
        type = "excel";
      }
      if ((conn as any)?.type === "firebird") {
        type = "firebird";
      }
      const rawTables = (conn as any)?.connection_tables;
      connectionTables = discoverTables
        ? null
        : Array.isArray(rawTables)
          ? rawTables.map((t: unknown) => String(t).trim()).filter(Boolean)
          : null;

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

    const METADATA_TIMEOUT_MS = 12000; // 12s para MySQL/Postgres
    const METADATA_TIMEOUT_FIREBIRD_MS = 30000; // 30s para Firebird (conexión puede ser más lenta)

    // Firebird (Flexxus): listar tablas y columnas para el ETL
    if (type === "firebird") {
      // Si la conexión tiene tablas configuradas manualmente, devolverlas sin conectar (evita timeout con muchas tablas).
      // Si además piden columnas de una tabla (tableName), no devolver aquí; más abajo se conecta y se devuelve esa tabla con columnas.
      if (connectionTables && connectionTables.length > 0 && !(typeof bodyTableName === "string" && bodyTableName.trim())) {
        const tables = connectionTables.map((t) => {
          const s = String(t).trim();
          const parts = s.split(".");
          const schema = parts.length > 1 ? parts[0] : "PUBLIC";
          const name = parts.length > 1 ? parts.slice(1).join(".") : s;
          return { schema, name, columns: [] as { name: string; dataType: string; nullable: boolean; defaultValue: null; isPrimaryKey: boolean }[] };
        });
        return NextResponse.json({
          ok: true,
          metadata: { dbVersion: "Firebird", schemas: ["PUBLIC"], tables },
        });
      }

      if (!host || !database || !user) {
        return NextResponse.json(
          { ok: false, error: "Parámetros incompletos para Firebird" },
          { status: 400 }
        );
      }
      if (!password) {
        return NextResponse.json(
          { ok: false, error: "Se requiere contraseña para Firebird. Guardala en la conexión." },
          { status: 400 }
        );
      }

      // Si piden columnas de una tabla concreta: conectar y devolver solo esa tabla con columnas.
      const tableNameForColumns = typeof bodyTableName === "string" ? bodyTableName.trim() : "";
      if (tableNameForColumns) {
        const relationNameRaw = tableNameForColumns.includes(".")
          ? tableNameForColumns.split(".").slice(-1)[0] ?? tableNameForColumns
          : tableNameForColumns;
        const relationName = relationNameRaw.toUpperCase();
        const schemaPart = tableNameForColumns.includes(".")
          ? tableNameForColumns.split(".").slice(0, -1).join(".")
          : "PUBLIC";

        const firebirdColumnsWork = async () => {
          const Firebird = require("node-firebird");
          const opts = {
            host,
            port: port ? Number(port) : 15421,
            database,
            user,
            password: password || "",
            lowercase_keys: false,
          };
          return await new Promise<{ dbVersion: string; schemas: string[]; tables: { schema: string; name: string; columns: any[] }[] }>((resolve, reject) => {
            Firebird.attach(opts, (errAttach: Error | null, db: any) => {
              if (errAttach) {
                reject(errAttach);
                return;
              }
              const sqlCols =
                "SELECT TRIM(RDB$FIELD_NAME) AS FIELD_NAME, RDB$FIELD_POSITION AS FIELD_POSITION FROM RDB$RELATION_FIELDS WHERE TRIM(RDB$RELATION_NAME) = ? ORDER BY RDB$FIELD_POSITION";
              db.query(sqlCols, [relationName], (errC: Error | null, colRows: any[]) => {
                if (db?.detach) db.detach(() => {});
                if (errC) {
                  reject(errC);
                  return;
                }
                const columns = (colRows || []).map((r: any) => ({
                  name: (r.FIELD_NAME ?? r.field_name ?? "").trim(),
                  dataType: "varchar",
                  nullable: true,
                  defaultValue: null,
                  isPrimaryKey: false,
                }));
                resolve({
                  dbVersion: "Firebird",
                  schemas: ["PUBLIC"],
                  tables: [{ schema: schemaPart, name: relationName, columns }],
                });
              });
            });
          });
        };

        try {
          const metadata = await Promise.race([
            firebirdColumnsWork(),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error("METADATA_TIMEOUT")), METADATA_TIMEOUT_FIREBIRD_MS)
            ),
          ]);
          return NextResponse.json({ ok: true, metadata });
        } catch (e: any) {
          const msg = e?.message || "";
          if (msg === "METADATA_TIMEOUT" || msg.includes("ETIMEDOUT") || msg.includes("ECONNREFUSED"))
            return NextResponse.json(
              { ok: false, error: "No se pudieron cargar las columnas. La base no respondió a tiempo." },
              { status: 504 }
            );
          return NextResponse.json(
            { ok: false, error: e?.message || "Error obteniendo columnas de Firebird" },
            { status: 400 }
          );
        }
      }

      // Solo listar nombres de tablas (una consulta). No pedir columnas por tabla para no hacer N+1 y evitar timeout con muchas tablas.
      const firebirdWork = async () => {
        const Firebird = require("node-firebird");
        const opts = {
          host,
          port: port ? Number(port) : 15421,
          database,
          user,
          password: password || "",
          lowercase_keys: false,
        };
        return await new Promise<{ dbVersion: string; schemas: string[]; tables: { schema: string; name: string; columns: any[] }[] }>((resolve, reject) => {
          Firebird.attach(opts, (errAttach: Error | null, db: any) => {
            if (errAttach) {
              reject(errAttach);
              return;
            }
            const sqlTables =
              "SELECT TRIM(RDB$RELATION_NAME) AS TABLE_NAME FROM RDB$RELATIONS WHERE RDB$SYSTEM_FLAG = 0 AND RDB$VIEW_BLR IS NULL ORDER BY RDB$RELATION_NAME";
            db.query(sqlTables, [], (errQ: Error | null, rows: any[]) => {
              if (db?.detach) db.detach(() => {});
              if (errQ) {
                reject(errQ);
                return;
              }
              const tableNames = (rows || []).map((r: any) => (r.TABLE_NAME ?? r.table_name ?? "").trim()).filter(Boolean);
              const tables = tableNames.map((name: string) => ({
                schema: "PUBLIC",
                name,
                columns: [] as { name: string; dataType: string; nullable: boolean; defaultValue: null; isPrimaryKey: boolean }[],
              }));
              tables.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
              resolve({ dbVersion: "Firebird", schemas: ["PUBLIC"], tables });
            });
          });
        });
      };

      try {
        const metadata = await Promise.race([
          firebirdWork(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("METADATA_TIMEOUT")), METADATA_TIMEOUT_FIREBIRD_MS)
          ),
        ]);
        return NextResponse.json({ ok: true, metadata });
      } catch (e: any) {
        const msg = e?.message || "";
        if (msg === "METADATA_TIMEOUT" || msg.includes("ETIMEDOUT") || msg.includes("ECONNREFUSED"))
          return NextResponse.json(
            {
              ok: false,
              error:
                "La base Firebird no respondió a tiempo. Probá configurar las tablas manualmente: en Conexiones, icono de tabla (Tablas para ETL), agregá los nombres (ej. PUBLIC.VENTAS, una por línea) y guardá.",
            },
            { status: 504 }
          );
        return NextResponse.json(
          { ok: false, error: e?.message || "Error obteniendo metadata de Firebird" },
          { status: 400 }
        );
      }
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

      const mysqlWork = async () => {
        const connection = await mysql.createConnection({
          host,
          user,
          port: port ? Number(port) : 3306,
          database,
          password,
          connectTimeout: 10000,
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

      let tables = Array.from(tableMap.values());
      if (connectionTables && connectionTables.length > 0) {
        const allowedSet = new Set(connectionTables.map((t: string) => String(t).trim().toLowerCase()));
        tables = tables.filter((t: any) => allowedSet.has(`${t.schema}.${t.name}`.toLowerCase()));
      }
      return { dbVersion, schemas, tables };
      };

      try {
        const metadata = await Promise.race([
          mysqlWork(),
          new Promise<never>((_, reject) =>
            setTimeout(
              () => reject(new Error("METADATA_TIMEOUT")),
              METADATA_TIMEOUT_MS
            )
          ),
        ]);
        return NextResponse.json({ ok: true, metadata });
      } catch (e: any) {
        const msg = e?.message || "";
        if (msg === "METADATA_TIMEOUT" || msg.includes("ETIMEDOUT") || msg.includes("ECONNREFUSED"))
          return NextResponse.json(
            {
              ok: false,
              error:
                "La base de datos no respondió a tiempo o no es accesible desde el servidor. Si está en red local o detrás de firewall, no es accesible desde Vercel.",
            },
            { status: 504 }
          );
        throw e;
      }
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

      const pgWork = async () => {
        const client = new PgClient({
          host,
          user,
          database,
          port: port ? Number(port) : 5432,
          password,
          connectionTimeoutMillis: 10000,
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

      let tables = Array.from(tableMap.values());
      if (connectionTables && connectionTables.length > 0) {
        const allowedSet = new Set(connectionTables.map((t: string) => String(t).trim().toLowerCase()));
        tables = tables.filter((t: any) => allowedSet.has(`${t.schema}.${t.name}`.toLowerCase()));
      }
      return { dbVersion, schemas, tables };
      };

      try {
        const metadata = await Promise.race([
          pgWork(),
          new Promise<never>((_, reject) =>
            setTimeout(
              () => reject(new Error("METADATA_TIMEOUT")),
              METADATA_TIMEOUT_MS
            )
          ),
        ]);
        return NextResponse.json({ ok: true, metadata });
      } catch (e: any) {
        const msg = e?.message || "";
        if (msg === "METADATA_TIMEOUT" || msg.includes("ETIMEDOUT") || msg.includes("ECONNREFUSED"))
          return NextResponse.json(
            {
              ok: false,
              error:
                "La base de datos no respondió a tiempo o no es accesible desde el servidor. Si está en red local o detrás de firewall, no es accesible desde Vercel.",
            },
            { status: 504 }
          );
        throw e;
      }
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
