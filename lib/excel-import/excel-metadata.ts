import { Client as PgClient } from "pg";
import { EXCEL_PHYSICAL_SCHEMA, getInternalDbUrl } from "@/lib/db/internal-db-url";

export type ExcelColumnMeta = {
  /** Nombre físico en Postgres (para queries). */
  name: string;
  /** Nombre legible del Excel (cabecera original). */
  label: string;
  dataType: string;
  nullable: boolean;
  defaultValue: null;
  isPrimaryKey: boolean;
};

export type ExcelDataTableMetaRow = {
  physical_table_name?: string | null;
  physical_schema_name?: string | null;
  table_name?: string | null;
};

export function normalizeExcelDataTableRows(data: unknown): ExcelDataTableMetaRow[] {
  if (Array.isArray(data)) return data as ExcelDataTableMetaRow[];
  if (data && typeof data === "object") return [data as ExcelDataTableMetaRow];
  return [];
}

export function resolveExcelPhysicalTableForConnection(
  connectionId: string,
  selection: string | null | undefined,
  rows: ExcelDataTableMetaRow[]
): string {
  const withPhysical = rows
    .map((r) => r.physical_table_name?.trim())
    .filter((p): p is string => !!p);
  if (!withPhysical.length) {
    throw new Error(`Sin tablas importadas para la conexión Excel ${connectionId}`);
  }
  const selected = (selection || "").trim();
  if (selected) {
    const physical = resolveExcelPhysicalTableFromSelection(selected, rows);
    if (physical?.trim()) return physical.trim();
    throw new Error(`No se encontró la hoja/tabla Excel: ${selected}`);
  }
  return withPhysical[0]!;
}

export function resolveExcelQualifiedTableFromRows(
  connectionId: string,
  selection: string | null | undefined,
  rows: ExcelDataTableMetaRow[],
  schema = EXCEL_PHYSICAL_SCHEMA
): string {
  const physical = resolveExcelPhysicalTableForConnection(connectionId, selection, rows);
  return `${schema}.${physical}`;
}

export function resolveExcelPhysicalTableFromSelection(
  qualifiedTable: string,
  rows: ExcelDataTableMetaRow[]
): string | null {
  const wanted = qualifiedTable.trim().toLowerCase();
  if (!wanted) return null;
  const bare = wanted.includes(".")
    ? wanted.split(".").slice(1).join(".")
    : wanted;

  for (const row of rows) {
    const physical = row.physical_table_name?.trim();
    const sheet = row.table_name?.trim();
    if (physical) {
      const physicalLower = physical.toLowerCase();
      if (
        physicalLower === bare ||
        physicalLower === wanted ||
        wanted.endsWith(`.${physicalLower}`)
      ) {
        return physical;
      }
    }
    if (sheet && sheet.toLowerCase() === bare) {
      return physical ?? sheet;
    }
  }

  return bare || null;
}

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
      const dbName = (col.name || "").trim();
      const original = (col.original_name || "").trim();
      const name = dbName || original;
      if (!name || name === "_import_id") return null;
      const label = original || dbName;
      return {
        name,
        label,
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
        label: r.column_name,
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
    const storedColumns = parseStoredExcelColumns(meta.columns);
    let columns = storedColumns;
    if (!columns.length) {
      try {
        columns = await loadExcelColumnsFromDb(tableName);
      } catch {
        columns = [];
      }
    } else if (columns.every((c) => c.label === c.name)) {
      try {
        const dbColumns = await loadExcelColumnsFromDb(tableName);
        if (dbColumns.length > 0) {
          const storedByName = new Map(storedColumns.map((c) => [c.name.toLowerCase(), c]));
          columns = dbColumns.map((dbCol) => {
            const stored = storedByName.get(dbCol.name.toLowerCase());
            return stored
              ? { ...dbCol, label: stored.label || dbCol.label }
              : dbCol;
          });
        }
      } catch {
        // Mantener columnas almacenadas si no se puede leer el esquema.
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
