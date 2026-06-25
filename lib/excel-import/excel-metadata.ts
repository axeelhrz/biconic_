import { Client as PgClient } from "pg";
import { EXCEL_PHYSICAL_SCHEMA, getInternalDbUrl } from "@/lib/db/internal-db-url";

export type ExcelColumnMeta = {
  name: string;
  dataType: string;
  nullable: boolean;
  defaultValue: null;
  isPrimaryKey: boolean;
};

export type ExcelDataTableRow = {
  physical_table_name: string | null;
  physical_schema_name?: string | null;
  columns?: unknown;
  table_name?: string | null;
  import_status?: string | null;
  total_rows?: number | null;
};

export function resolveExcelTableName(
  connectionId: string,
  meta?: { physical_table_name?: string | null } | null
): string {
  return (
    meta?.physical_table_name?.trim() ||
    `import_${connectionId.replace(/-/g, "_")}`
  );
}

export function parseStoredExcelColumns(columns: unknown): ExcelColumnMeta[] {
  if (!Array.isArray(columns)) return [];
  return columns
    .map((c) => {
      const col = c as { name?: string; original_name?: string; type?: string };
      const name = (col.name || col.original_name || "").trim();
      if (!name || name === "_import_id") return null;
      return {
        name,
        dataType: col.type || "text",
        nullable: true,
        defaultValue: null,
        isPrimaryKey: false,
      };
    })
    .filter((c): c is ExcelColumnMeta => c != null);
}

export async function loadExcelColumnsFromDb(
  tableName: string
): Promise<ExcelColumnMeta[]> {
  const client = new PgClient({
    connectionString: getInternalDbUrl(),
    ssl: false,
  } as { connectionString: string; ssl: boolean });
  await client.connect();
  try {
    const res = await client.query<{
      column_name: string;
      data_type: string;
      is_nullable: string;
    }>(
      `SELECT column_name, data_type, is_nullable
       FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = $2
       ORDER BY ordinal_position`,
      [EXCEL_PHYSICAL_SCHEMA, tableName]
    );
    return res.rows
      .filter((r) => r.column_name !== "_import_id")
      .map((r) => ({
        name: r.column_name,
        dataType: r.data_type,
        nullable: String(r.is_nullable).toUpperCase() === "YES",
        defaultValue: null,
        isPrimaryKey: false,
      }));
  } finally {
    await client.end();
  }
}

export async function buildExcelMetadataTables(
  rows: ExcelDataTableRow[],
  options?: { fileName?: string | null; connectionId?: string }
) {
  const tables: {
    schema: string;
    name: string;
    label: string;
    columns: ExcelColumnMeta[];
  }[] = [];

  for (const meta of rows) {
    const connectionId = options?.connectionId ?? "";
    const tableName = resolveExcelTableName(connectionId, meta);
    let columns = parseStoredExcelColumns(meta.columns);
    if (!columns.length) {
      try {
        columns = await loadExcelColumnsFromDb(tableName);
      } catch {
        columns = [];
      }
    }
    const label =
      (meta.table_name && meta.table_name !== tableName
        ? meta.table_name
        : null) ??
      options?.fileName?.replace(/\.[^.]+$/, "") ??
      tableName;

    tables.push({
      schema: EXCEL_PHYSICAL_SCHEMA,
      name: tableName,
      label,
      columns,
    });
  }

  return tables;
}
