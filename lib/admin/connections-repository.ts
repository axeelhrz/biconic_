import fs from "fs";
import postgres from "postgres";
import { getInternalDbUrl } from "@/lib/db/internal-db-url";
import { getServerAuthUser } from "@/lib/supabase/server-backend";
import type { Connection } from "@/components/connections/ConnectionsCard";
import {
  getLocalExcelAbsolutePath,
  hasLocalExcelFile,
} from "@/lib/storage/excel-upload-storage";
import { readCredentialsFromConnectionRow, readConnectionTablesFromRow } from "@/lib/connection/connection-persistence";

function getSql() {
  return postgres(getInternalDbUrl(), { max: 5 });
}

function mapType(t: string): string {
  switch (t) {
    case "mysql":
      return "MySQL";
    case "postgres":
    case "postgresql":
      return "PostgreSQL";
    case "firebird":
      return "Firebird";
    case "excel_file":
    case "excel":
      return "Excel";
    default:
      return t || "Desconocido";
  }
}

function mapStatus(importStatus?: string | null): Connection["status"] {
  switch (importStatus) {
    case "failed":
    case "error":
      return "Error";
    case "pending":
    case "processing":
    case "downloading_file":
    case "creating_table":
    case "inserting_rows":
      return "Procesando";
    default:
      return "Conectado";
  }
}

async function getClientNameColumn(sql: ReturnType<typeof postgres>): Promise<"company_name" | "name"> {
  const cols = await sql<{ column_name: string }[]>`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'clients'
      AND column_name IN ('company_name', 'name')
  `;
  const names = new Set(cols.map((c) => c.column_name));
  return names.has("company_name") ? "company_name" : "name";
}

export type ListConnectionsOptions = {
  /** Si se indica, solo conexiones de ese cliente (flujo ETL admin). */
  clientId?: string | null;
};

export async function listConnectionsFromDb(
  options?: ListConnectionsOptions
): Promise<Connection[]> {
  const user = await getServerAuthUser();
  if (!user?.id) return [];

  const clientId = options?.clientId?.trim() || null;
  const sql = getSql();
  try {
    const rows = clientId
      ? await sql<
          {
            id: string;
            name: string;
            type: string;
            client_id: string | null;
            user_id: string | null;
            config: Record<string, unknown> | null;
            storage_object_path: string | null;
            updated_at: string;
            db_host?: string | null;
            db_name?: string | null;
            original_file_name?: string | null;
          }[]
        >`
          SELECT *
          FROM public.connections
          WHERE client_id = ${clientId}::uuid
          ORDER BY updated_at DESC
        `
      : await sql<
      {
        id: string;
        name: string;
        type: string;
        client_id: string | null;
        user_id: string | null;
        config: Record<string, unknown> | null;
        storage_object_path: string | null;
        updated_at: string;
        db_host?: string | null;
        db_name?: string | null;
        original_file_name?: string | null;
      }[]
    >`
      SELECT *
      FROM public.connections
      ORDER BY updated_at DESC
    `;

    if (rows.length === 0) return [];

    const ids = rows.map((r) => r.id);
    const userIds = Array.from(new Set(rows.map((r) => r.user_id).filter(Boolean))) as string[];
    const clientIds = Array.from(new Set(rows.map((r) => r.client_id).filter(Boolean))) as string[];

    const userById = new Map<string, string | null>();
    if (userIds.length > 0) {
      const profiles = await sql<{ id: string; full_name: string | null }[]>`
        SELECT id, full_name FROM public.profiles WHERE id = ANY(${userIds})
      `;
      for (const p of profiles) userById.set(p.id, p.full_name);
    }

    const clientById = new Map<string, string>();
    if (clientIds.length > 0) {
      const nameCol = await getClientNameColumn(sql);
      const clients = await sql.unsafe<{ id: string; label: string }[]>(
        `SELECT id::text AS id, ${nameCol} AS label FROM public.clients WHERE id = ANY($1::uuid[])`,
        [clientIds]
      );
      for (const c of clients) clientById.set(c.id, c.label);
    }

    const hasImportStatus = await sql<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'data_tables'
          AND column_name = 'import_status'
      ) AS exists
    `;

    const metaByConnId = new Map<
      string,
      {
        id: string;
        import_status: string | null;
        updated_at: string;
        physical_table_name: string | null;
      }
    >();

    if (hasImportStatus[0]?.exists) {
      const metas = await sql<
        {
          id: string;
          connection_id: string;
          import_status: string | null;
          updated_at: string;
          physical_table_name: string | null;
        }[]
      >`
        SELECT id, connection_id, import_status, updated_at, physical_table_name
        FROM public.data_tables
        WHERE connection_id = ANY(${ids}::uuid[])
      `;
      for (const m of metas) {
        metaByConnId.set(m.connection_id, m);
      }
    } else {
      const metas = await sql<
        { id: string; connection_id: string | null; table_name: string; created_at: string }[]
      >`
        SELECT id, connection_id, table_name, created_at
        FROM public.data_tables
        WHERE connection_id = ANY(${ids}::uuid[])
      `;
      for (const m of metas) {
        if (!m.connection_id) continue;
        metaByConnId.set(m.connection_id, {
          id: m.id,
          import_status: null,
          updated_at: m.created_at,
          physical_table_name: m.table_name,
        });
      }
    }

    return rows.map((row) => {
      const meta = metaByConnId.get(row.id);
      const cfg = row.config ?? {};
      const isExcel = row.type === "excel_file" || row.type === "excel";
      const dbHost =
        row.db_host ??
        (typeof cfg.db_host === "string" ? cfg.db_host : null);
      const dbName =
        row.db_name ??
        (typeof cfg.db_name === "string" ? cfg.db_name : null);
      const originalFile =
        row.original_file_name ??
        (typeof cfg.original_file_name === "string" ? cfg.original_file_name : null) ??
        (row.storage_object_path ? row.storage_object_path.split("/").pop() ?? null : null);

      return {
        id: row.id,
        title: row.name ?? "Conexión Sin Título",
        type: mapType(row.type),
        status: mapStatus(meta?.import_status),
        host: isExcel ? "Archivo" : dbHost ?? "No especificado",
        databaseName: isExcel
          ? originalFile ?? "No especificado"
          : dbName ?? "No especificada",
        lastSync:
          meta?.updated_at || row.updated_at
            ? new Date(meta?.updated_at || row.updated_at).toLocaleString()
            : "Nunca",
        clientId: row.client_id ?? "",
        dataTableId: meta?.id,
        dataTableUpdatedAt: meta?.updated_at,
        importStatus: meta?.import_status ?? undefined,
        creator: row.user_id
          ? { fullName: userById.get(row.user_id) ?? null }
          : undefined,
        client: row.client_id
          ? {
              id: row.client_id,
              companyName: clientById.get(row.client_id) ?? "Cliente Desconocido",
            }
          : undefined,
      };
    });
  } finally {
    await sql.end();
  }
}

export async function listAdminConnectionsForGridFromDb(): Promise<Connection[]> {
  return listConnectionsFromDb();
}

export type ConnectionDetailRow = {
  id: string;
  name: string;
  type: string;
  client_id: string | null;
  db_host: string | null;
  db_name: string | null;
  db_user: string | null;
  db_port: number | null;
  connection_tables: string[] | null;
  updated_at: string;
  original_file_name: string | null;
  import_status?: string | null;
  total_rows?: number | null;
  physical_table_name?: string | null;
};

export async function getConnectionDetailFromDb(
  connectionId: string
): Promise<ConnectionDetailRow | null> {
  const user = await getServerAuthUser();
  if (!user?.id) return null;

  const sql = getSql();
  try {
    const [row] = await sql<Record<string, unknown>[]>`
      SELECT *
      FROM public.connections
      WHERE id = ${connectionId}
      LIMIT 1
    `;
    if (!row) return null;

    const creds = readCredentialsFromConnectionRow(row);
    const isExcel = row.type === "excel_file" || row.type === "excel";

    const metaRows = await sql<
      {
        import_status: string | null;
        total_rows: number | null;
        physical_table_name: string | null;
        physical_schema_name: string | null;
      }[]
    >`
      SELECT import_status, total_rows, physical_table_name, physical_schema_name
      FROM public.data_tables
      WHERE connection_id = ${connectionId}
      ORDER BY table_name NULLS LAST, updated_at ASC
    `;

    const meta = metaRows.length > 0 ? metaRows[metaRows.length - 1] : null;

    let connectionTables = readConnectionTablesFromRow(row);
    if (isExcel && (!connectionTables || connectionTables.length === 0)) {
      connectionTables = metaRows
        .map((m) => {
          const schema = (m.physical_schema_name || "data_warehouse").trim();
          const table = (m.physical_table_name || "").trim();
          return table ? `${schema}.${table}` : null;
        })
        .filter((t): t is string => Boolean(t));
      if (connectionTables.length === 0) connectionTables = null;
    }

    const physicalTable = meta?.physical_table_name ?? null;

    return {
      id: String(row.id),
      name: String(row.name ?? ""),
      type: String(row.type ?? ""),
      client_id: (row.client_id as string | null) ?? null,
      db_host: creds.host || null,
      db_name: creds.database || null,
      db_user: creds.user || null,
      db_port: Number.isFinite(creds.port) ? creds.port : null,
      connection_tables: connectionTables,
      updated_at: String(row.updated_at ?? ""),
      original_file_name:
        (row.original_file_name as string | null) ??
        (isExcel && row.storage_object_path
          ? String(row.storage_object_path).split("/").pop() ?? null
          : null),
      import_status: meta?.import_status ?? null,
      total_rows: meta?.total_rows ?? null,
      physical_table_name: physicalTable,
    };
  } finally {
    await sql.end();
  }
}

export async function deleteConnectionFromDb(connectionId: string): Promise<void> {
  const user = await getServerAuthUser();
  if (!user?.id) throw new Error("No autorizado");
  if (user.app_role !== "APP_ADMIN") {
    const sqlCheck = getSql();
    try {
      const [profile] = await sqlCheck<{ app_role: string }[]>`
        SELECT app_role FROM public.profiles WHERE id = ${user.id} LIMIT 1
      `;
      if (profile?.app_role !== "APP_ADMIN") throw new Error("Solo administradores");
    } finally {
      await sqlCheck.end();
    }
  }

  const sql = getSql();
  try {
    const [row] = await sql<
      {
        id: string;
        type: string;
        storage_object_path: string | null;
      }[]
    >`
      SELECT id, type, storage_object_path
      FROM public.connections
      WHERE id = ${connectionId}
      LIMIT 1
    `;
    if (!row) throw new Error("Conexión no encontrada");

    const [meta] = await sql<{ physical_table_name: string | null }[]>`
      SELECT physical_table_name
      FROM public.data_tables
      WHERE connection_id = ${connectionId}
      ORDER BY updated_at DESC NULLS LAST
      LIMIT 1
    `;

    const physicalTable = meta?.physical_table_name?.trim();
    if (physicalTable && /^[a-zA-Z0-9_]+$/.test(physicalTable)) {
      await sql.unsafe(
        `DROP TABLE IF EXISTS data_warehouse."${physicalTable}"`
      );
    }

    if (row.storage_object_path && hasLocalExcelFile(row.storage_object_path)) {
      try {
        fs.unlinkSync(getLocalExcelAbsolutePath(row.storage_object_path));
      } catch {
        /* archivo opcional */
      }
    }

    await sql`
      UPDATE public.etl SET connection_id = NULL WHERE connection_id = ${connectionId}
    `;

    const deleted = await sql<{ id: string }[]>`
      DELETE FROM public.connections WHERE id = ${connectionId} RETURNING id
    `;
    if (!deleted[0]) throw new Error("No se pudo eliminar la conexión");
  } finally {
    await sql.end();
  }
}
