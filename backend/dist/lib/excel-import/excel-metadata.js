"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeExcelDataTableRows = normalizeExcelDataTableRows;
exports.resolveExcelPhysicalTableForConnection = resolveExcelPhysicalTableForConnection;
exports.resolveExcelQualifiedTableFromRows = resolveExcelQualifiedTableFromRows;
exports.resolveExcelPhysicalTableFromSelection = resolveExcelPhysicalTableFromSelection;
exports.resolveExcelTableName = resolveExcelTableName;
exports.parseStoredExcelColumns = parseStoredExcelColumns;
exports.loadExcelColumnsFromDb = loadExcelColumnsFromDb;
exports.buildExcelMetadataTables = buildExcelMetadataTables;
const pg_1 = require("pg");
const internal_db_url_1 = require("../db/internal-db-url");
function normalizeExcelDataTableRows(data) {
    if (Array.isArray(data))
        return data;
    if (data && typeof data === "object")
        return [data];
    return [];
}
function resolveExcelPhysicalTableForConnection(connectionId, selection, rows) {
    const withPhysical = rows
        .map((r) => r.physical_table_name?.trim())
        .filter((p) => !!p);
    if (!withPhysical.length) {
        throw new Error(`Sin tablas importadas para la conexión Excel ${connectionId}`);
    }
    const selected = (selection || "").trim();
    if (selected) {
        const physical = resolveExcelPhysicalTableFromSelection(selected, rows);
        if (physical?.trim())
            return physical.trim();
        throw new Error(`No se encontró la hoja/tabla Excel: ${selected}`);
    }
    return withPhysical[0];
}
function resolveExcelQualifiedTableFromRows(connectionId, selection, rows, schema = internal_db_url_1.EXCEL_PHYSICAL_SCHEMA) {
    const physical = resolveExcelPhysicalTableForConnection(connectionId, selection, rows);
    return `${schema}.${physical}`;
}
function resolveExcelPhysicalTableFromSelection(qualifiedTable, rows) {
    const wanted = qualifiedTable.trim().toLowerCase();
    if (!wanted)
        return null;
    const bare = wanted.includes(".")
        ? wanted.split(".").slice(1).join(".")
        : wanted;
    for (const row of rows) {
        const physical = row.physical_table_name?.trim();
        const sheet = row.table_name?.trim();
        const schema = String(row.physical_schema_name ?? internal_db_url_1.EXCEL_PHYSICAL_SCHEMA)
            .trim()
            .toLowerCase();
        if (physical) {
            const physicalLower = physical.toLowerCase();
            const qualified = `${schema}.${physicalLower}`;
            if (physicalLower === bare ||
                physicalLower === wanted ||
                qualified === wanted ||
                wanted.endsWith(`.${physicalLower}`)) {
                return physical;
            }
        }
        if (sheet && sheet.toLowerCase() === bare) {
            return physical ?? sheet;
        }
    }
    if (rows.length === 1) {
        const only = rows[0]?.physical_table_name?.trim();
        if (only && only.toLowerCase() === bare)
            return only;
    }
    return null;
}
function resolveExcelTableName(connectionId, meta) {
    return (meta?.physical_table_name?.trim() ||
        `import_${connectionId.replace(/-/g, "_")}`);
}
function parseStoredExcelColumns(columns) {
    if (!Array.isArray(columns))
        return [];
    return columns
        .map((c) => {
        const col = c;
        const dbName = (col.name || "").trim();
        const original = (col.original_name || "").trim();
        const name = dbName || original;
        if (!name || name === "_import_id")
            return null;
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
        .filter((c) => c != null);
}
async function loadExcelColumnsFromDb(tableName) {
    const client = new pg_1.Client({
        connectionString: (0, internal_db_url_1.getInternalDbUrl)(),
        ssl: false,
    });
    await client.connect();
    try {
        const res = await client.query(`SELECT column_name, data_type, is_nullable
       FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = $2
       ORDER BY ordinal_position`, [internal_db_url_1.EXCEL_PHYSICAL_SCHEMA, tableName]);
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
    }
    finally {
        await client.end();
    }
}
async function buildExcelMetadataTables(rows, options) {
    const tables = [];
    for (const meta of rows) {
        const connectionId = options?.connectionId ?? "";
        const tableName = resolveExcelTableName(connectionId, meta);
        const storedColumns = parseStoredExcelColumns(meta.columns);
        let columns = storedColumns;
        if (!columns.length) {
            try {
                columns = await loadExcelColumnsFromDb(tableName);
            }
            catch {
                columns = [];
            }
        }
        else if (columns.every((c) => c.label === c.name)) {
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
            }
            catch {
            }
        }
        const label = (meta.table_name && meta.table_name !== tableName
            ? meta.table_name
            : null) ??
            options?.fileName?.replace(/\.[^.]+$/, "") ??
            tableName;
        tables.push({
            schema: internal_db_url_1.EXCEL_PHYSICAL_SCHEMA,
            name: tableName,
            label,
            columns,
        });
    }
    return tables;
}
//# sourceMappingURL=excel-metadata.js.map