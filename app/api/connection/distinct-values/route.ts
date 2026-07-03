import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { shouldUseOwnBackend } from "@/lib/api/backend-config";
import { hydrateConnectionRow } from "@/lib/connection/connection-persistence";
import {
  formatFirebirdConnectError,
  resolveFirebirdAttachOptions,
} from "@/lib/connection/resolve-firebird-connection";
import { connectionsSelectColumns } from "@/lib/db/connections-query";
import { decryptConnectionPassword } from "@/lib/connection-secret";
import { EXCEL_PHYSICAL_SCHEMA, getInternalDbUrl } from "@/lib/db/internal-db-url";
import {
  normalizeExcelDataTableRows,
  resolveExcelPhysicalTableForConnection,
} from "@/lib/excel-import/excel-metadata";
import { Client as PgClient } from "pg";
import mysql from "mysql2/promise";
import { quoteIdent, quoteQualified } from "@/lib/sql/helpers";
import { getDistinctValuesCap } from "@/lib/etl/limits";

/** Tope por defecto 10.000; override con ETL_DISTINCT_VALUES_MAX en servidor. */
const DISTINCT_VALUES_CAP = getDistinctValuesCap();

function pgLimitSuffix(): string {
  return ` LIMIT ${DISTINCT_VALUES_CAP}`;
}

function fbFirstClause(): string {
  return `FIRST ${DISTINCT_VALUES_CAP} `;
}

function mysqlLimitSuffix(): string {
  return ` LIMIT ${DISTINCT_VALUES_CAP}`;
}

function firebirdTablePart(tableQualified: string): string {
  const tableNameOnly = tableQualified.trim().includes(".")
    ? tableQualified.trim().split(".").pop()!.trim()
    : tableQualified.trim();
  return /^[A-Z0-9_]+$/i.test(tableNameOnly)
    ? tableNameOnly.toUpperCase()
    : `"${tableNameOnly.replace(/"/g, '""')}"`;
}

function firebirdColumnPart(columnName: string): string {
  const bare = columnName.trim().replace(/^[^.]*\./, "");
  return /^[A-Z0-9_]+$/i.test(bare) ? bare.toUpperCase() : `"${bare.replace(/"/g, '""')}"`;
}

function sortDistinctValues(values: string[]): string[] {
  return [...values].sort((a, b) => a.localeCompare(b, "es"));
}

function safeIdentMySQL(name: string): string {
  return "`" + String(name).replace(/`/g, "``") + "`";
}

function safeIdentFirebird(name: string): string {
  return '"' + String(name).replace(/"/g, '""') + '"';
}

/** Consultas DISTINCT en tablas grandes pueden tardar; Railway/Vercel Pro permiten más tiempo. */
export const maxDuration = 120;

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

    const dbClient = shouldUseOwnBackend() ? createServiceRoleClient() : supabase;
    const { data: connRaw, error: connError } = await dbClient
      .from("connections")
      .select(connectionsSelectColumns())
      .eq("id", String(connectionId))
      .maybeSingle();
    if (connError || !connRaw) {
      return NextResponse.json(
        { ok: false, error: connError?.message || "Conexión no encontrada" },
        { status: 404 }
      );
    }

    const conn = hydrateConnectionRow(connRaw as Record<string, unknown>);
    const type = conn.type;
    if (type === "excel_file" || type === "excel") {
      const { data: metaRows } = await dbClient
        .from("data_tables")
        .select("physical_schema_name, physical_table_name, table_name")
        .eq("connection_id", String(connectionId));
      const rows = normalizeExcelDataTableRows(metaRows);
      if (!rows.length) {
        return NextResponse.json(
          { ok: false, error: "Metadatos de Excel no encontrados" },
          { status: 404 }
        );
      }
      const schema = EXCEL_PHYSICAL_SCHEMA;
      const table = resolveExcelPhysicalTableForConnection(
        String(connectionId),
        tableQualified,
        rows
      );
      const client = new PgClient({
        connectionString: getInternalDbUrl(),
        ssl: false,
      } as { connectionString: string; ssl: boolean });
      await client.connect();
      try {
        const col = quoteIdent(columnName.trim(), "postgres");
        const qual = `"${schema.replace(/"/g, '""')}"."${table.replace(/"/g, '""')}"`;
        const sql = `SELECT DISTINCT ${col} AS value FROM ${qual} WHERE ${col} IS NOT NULL ORDER BY ${col}${pgLimitSuffix()}`;
        const res = await client.query(sql);
        const values = sortDistinctValues(
          (res.rows || []).map((r: { value?: unknown }) => (r.value != null ? String(r.value) : "")).filter(Boolean)
        );
        return NextResponse.json({
          ok: true,
          values,
          total: values.length,
          capped: values.length >= DISTINCT_VALUES_CAP,
          cap: DISTINCT_VALUES_CAP,
        });
      } finally {
        await client.end();
      }
    }

    if (type === "postgres" || type === "postgresql") {
      const password = conn.db_password_encrypted
        ? decryptConnectionPassword(conn.db_password_encrypted)
        : undefined;
      const client = new PgClient({
        host: conn.db_host ?? undefined,
        user: conn.db_user ?? undefined,
        database: conn.db_name ?? undefined,
        port: conn.db_port ?? 5432,
        password,
      });
      await client.connect();
      try {
        const qual = quoteQualified(tableQualified.trim(), "postgres");
        const col = quoteIdent(columnName.trim(), "postgres");
        const sql = `SELECT DISTINCT ${col} AS value FROM ${qual} WHERE ${col} IS NOT NULL ORDER BY ${col}${pgLimitSuffix()}`;
        const res = await client.query(sql);
        const values = sortDistinctValues(
          (res.rows || []).map((r: { value?: unknown }) => (r.value != null ? String(r.value) : "")).filter(Boolean)
        );
        return NextResponse.json({
          ok: true,
          values,
          total: values.length,
          capped: values.length >= DISTINCT_VALUES_CAP,
          cap: DISTINCT_VALUES_CAP,
        });
      } finally {
        await client.end();
      }
    }

    if (type === "mysql") {
      const password = conn.db_password_encrypted
        ? decryptConnectionPassword(conn.db_password_encrypted)
        : "";
      const parts = tableQualified.trim().split(".", 2);
      const schema = parts.length > 1 ? parts[0].trim() : (conn.db_name ?? "");
      const tableName = parts.length > 1 ? parts[1].trim() : parts[0].trim();
      const fullTable = `${safeIdentMySQL(schema)}.${safeIdentMySQL(tableName)}`;
      const col = safeIdentMySQL(columnName.trim());
      const connection = await mysql.createConnection({
        host: conn.db_host ?? undefined,
        user: conn.db_user ?? undefined,
        database: conn.db_name ?? undefined,
        port: conn.db_port ?? 3306,
        password: password || "",
      });
      try {
        const [rows] = await connection.execute(
          `SELECT DISTINCT ${col} AS value FROM ${fullTable} WHERE ${col} IS NOT NULL ORDER BY ${col}${mysqlLimitSuffix()}`
        );
        const values = sortDistinctValues(
          (Array.isArray(rows) ? rows : []).map((r: { value?: unknown }) => (r?.value != null ? String(r.value) : "")).filter(Boolean)
        );
        return NextResponse.json({
          ok: true,
          values,
          total: values.length,
          capped: values.length >= DISTINCT_VALUES_CAP,
          cap: DISTINCT_VALUES_CAP,
        });
      } finally {
        await connection.end();
      }
    }

    if (type === "firebird") {
      let fbOpts: ReturnType<typeof resolveFirebirdAttachOptions>;
      try {
        fbOpts = resolveFirebirdAttachOptions(conn);
      } catch (cfgErr) {
        const msg = cfgErr instanceof Error ? cfgErr.message : String(cfgErr);
        return NextResponse.json({ ok: false, error: msg }, { status: 400 });
      }
      const Firebird = require("node-firebird");
      const relationName = firebirdTablePart(tableQualified);
      const bareCol = columnName.trim().replace(/^[^.]*\./, "");
      const colCandidates = Array.from(
        new Set([firebirdColumnPart(columnName), safeIdentFirebird(bareCol), bareCol.toUpperCase()])
      );

      const queryFb = (sql: string): Promise<Record<string, unknown>[]> =>
        new Promise((resolve, reject) => {
          Firebird.attach(fbOpts, (errAttach: Error | null, db: { query: Function; detach?: Function }) => {
            if (errAttach) return reject(errAttach);
            db.query(sql, [], (errQ: Error | null, rows: Record<string, unknown>[]) => {
              if (db?.detach) try { db.detach(() => {}); } catch (_) {}
              if (errQ) return reject(errQ);
              resolve(rows || []);
            });
          });
        });

      let distinctValues: string[] | null = null;
      for (const fbCol of colCandidates) {
        const sql = `SELECT ${fbFirstClause()}DISTINCT ${fbCol} AS value FROM ${relationName} WHERE ${fbCol} IS NOT NULL ORDER BY ${fbCol}`;
        try {
          const rows = await queryFb(sql);
          distinctValues = rows
            .map((r) => {
              const v = r.value ?? r.VALUE;
              return v != null && v !== "" ? String(v) : "";
            })
            .filter(Boolean);
          break;
        } catch {
          /* probar siguiente variante de nombre de columna */
        }
      }

      if (distinctValues == null) {
        const seen = new Set<string>();
        distinctValues = [];
        const pageSize = Math.min(5_000, DISTINCT_VALUES_CAP);
        const fbCol = colCandidates[0];
        let skip = 0;
        for (;;) {
          const sql =
            skip > 0
              ? `SELECT FIRST ${pageSize} SKIP ${skip} ${fbCol} FROM ${relationName} WHERE ${fbCol} IS NOT NULL`
              : `SELECT FIRST ${pageSize} ${fbCol} FROM ${relationName} WHERE ${fbCol} IS NOT NULL`;
          let rows: Record<string, unknown>[];
          try {
            rows = await queryFb(sql);
          } catch (scanErr) {
            const msg = scanErr instanceof Error ? scanErr.message : String(scanErr);
            return NextResponse.json(
              { ok: false, error: formatFirebirdConnectError(scanErr, fbOpts.host) || msg },
              { status: 400 }
            );
          }
          if (rows.length === 0) break;
          for (const r of rows) {
            const key = Object.keys(r).find((k) => k.toLowerCase() === bareCol.toLowerCase()) ?? Object.keys(r)[0];
            const v = key ? r[key] : null;
            if (v != null && v !== "") {
              const s = String(v);
              if (!seen.has(s)) {
                seen.add(s);
                distinctValues.push(s);
                if (distinctValues.length >= DISTINCT_VALUES_CAP) break;
              }
            }
          }
          if (distinctValues.length >= DISTINCT_VALUES_CAP) break;
          if (rows.length < pageSize) break;
          skip += pageSize;
        }
      }

      const values = sortDistinctValues(distinctValues).slice(0, DISTINCT_VALUES_CAP);
      return NextResponse.json({
        ok: true,
        values,
        total: values.length,
        capped: values.length >= DISTINCT_VALUES_CAP,
        cap: DISTINCT_VALUES_CAP,
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
