import { NextRequest, NextResponse } from "next/server";
import mysql from "mysql2/promise";
import { Client as PgClient } from "pg";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { shouldUseOwnBackend } from "@/lib/api/backend-config";
import { decryptConnectionPassword } from "@/lib/connection-secret";
import { deriveColumnTypesFromSample } from "@/lib/derive-column-types";
import { getInternalDbUrl } from "@/lib/db/internal-db-url";
import { resolveExcelTableName, resolveExcelPhysicalTableFromSelection } from "@/lib/excel-import/excel-metadata";
import { connectionsSelectColumns } from "@/lib/db/connections-query";
import {
  hydrateConnectionRow,
  readCredentialsFromConnectionRow,
} from "@/lib/connection/connection-persistence";
import { formatFirebirdConnectError, resolveFirebirdAttachOptions } from "@/lib/connection/resolve-firebird-connection";

type Body = { connectionId: string | number; tableName?: string };

const SAMPLE_LIMIT = 300;

export async function POST(req: NextRequest): Promise<NextResponse> {
  let hydrated: ReturnType<typeof hydrateConnectionRow> | null = null;
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

    const dbClient = shouldUseOwnBackend() ? createServiceRoleClient() : supabase;
    const { data: conn, error: connError } = await dbClient
      .from("connections")
      .select(connectionsSelectColumns())
      .eq("id", String(body.connectionId))
      .maybeSingle();
    if (connError || !conn) {
      return NextResponse.json({ ok: false, error: "Conexión no encontrada" }, { status: 404 });
    }

    hydrated = hydrateConnectionRow(conn as Record<string, unknown>);
    const creds = readCredentialsFromConnectionRow(conn as Record<string, unknown>);
    let password: string | undefined;
    try {
      password = creds.passwordEncrypted
        ? decryptConnectionPassword(creds.passwordEncrypted)
        : undefined;
    } catch {
      // ignore
    }
    if (!password && hydrated.type === "firebird") {
      password = process.env.FLEXXUS_PASSWORD ?? undefined;
    }
    const host = creds.host || undefined;
    const database = creds.database || undefined;
    const userDb = creds.user || undefined;
    const port = Number.isFinite(creds.port) ? creds.port : undefined;
    let type =
      hydrated.type === "excel_file" || hydrated.type === "excel"
        ? "excel"
        : hydrated.type;
    if (type === "postgresql") type = "postgres";

    let rows: Record<string, unknown>[] = [];

    if (type === "excel") {
      const tableNameParam = (body.tableName ?? "").trim();
      const { data: metaRows, error: metaError } = await dbClient
        .from("data_tables")
        .select("physical_table_name, table_name")
        .eq("connection_id", String(body.connectionId));

      const metaTableRows = Array.isArray(metaRows)
        ? metaRows
        : metaRows
          ? [metaRows]
          : [];

      if (metaError || metaTableRows.length === 0) {
        return NextResponse.json(
          { ok: false, error: "Metadatos de Excel no encontrados" },
          { status: 404 }
        );
      }

      const tableName = tableNameParam
        ? resolveExcelPhysicalTableFromSelection(
            tableNameParam,
            metaTableRows as { physical_table_name?: string | null; table_name?: string | null }[]
          )
        : resolveExcelTableName(
            String(body.connectionId),
            metaTableRows[0] as { physical_table_name?: string | null }
          );

      if (!tableName) {
        return NextResponse.json(
          { ok: false, error: "No se pudo resolver la tabla de Excel" },
          { status: 400 }
        );
      }

      const client = new PgClient({ connectionString: getInternalDbUrl(), ssl: false } as { connectionString: string; ssl: boolean });
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
      const tableName = (body.tableName ?? "").trim();
      if (!tableName) {
        return NextResponse.json({ ok: false, error: "tableName requerido para Firebird" }, { status: 400 });
      }
      const tableNameOnly = tableName.includes(".") ? tableName.split(".").pop()!.trim() : tableName;
      const relationName = /^[A-Z0-9_]+$/i.test(tableNameOnly) ? tableNameOnly.toUpperCase() : `"${tableNameOnly.replace(/"/g, '""')}"`;
      const Firebird = require("node-firebird");
      let fbOpts: ReturnType<typeof resolveFirebirdAttachOptions>;
      try {
        fbOpts = resolveFirebirdAttachOptions(hydrated);
      } catch (e) {
        return NextResponse.json(
          { ok: false, error: e instanceof Error ? e.message : "Credenciales incompletas para Firebird" },
          { status: 400 }
        );
      }
      rows = await new Promise<Record<string, unknown>[]>((resolve, reject) => {
        Firebird.attach(fbOpts, (errAttach: Error | null, db: any) => {
          if (errAttach) {
            reject(errAttach);
            return;
          }
          const sql = `SELECT FIRST ${SAMPLE_LIMIT} * FROM ${relationName}`;
          db.query(sql, [], (errQ: Error | null, r: any[]) => {
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
    const message = formatFirebirdConnectError(
      e,
      hydrated
        ? (() => {
            try {
              return resolveFirebirdAttachOptions(hydrated).host;
            } catch {
              return undefined;
            }
          })()
        : undefined
    );
    console.error("[infer-column-types]", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
