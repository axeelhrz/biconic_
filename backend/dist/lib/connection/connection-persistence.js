"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getConnectionsTableColumns = getConnectionsTableColumns;
exports.clearConnectionsSchemaCache = clearConnectionsSchemaCache;
exports.hydrateConnectionRow = hydrateConnectionRow;
exports.readCredentialsFromConnectionRow = readCredentialsFromConnectionRow;
exports.readConnectionTablesFromRow = readConnectionTablesFromRow;
exports.buildConnectionInsertRow = buildConnectionInsertRow;
exports.buildConnectionUpdateRow = buildConnectionUpdateRow;
let cachedColumns = null;
async function getConnectionsTableColumns(sql) {
    if (cachedColumns)
        return cachedColumns;
    const cols = await sql `
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'connections'
  `;
    cachedColumns = new Set(cols.map((c) => c.column_name));
    return cachedColumns;
}
function clearConnectionsSchemaCache() {
    cachedColumns = null;
}
function hydrateConnectionRow(row) {
    const creds = readCredentialsFromConnectionRow(row);
    return {
        ...row,
        id: row.id != null ? String(row.id) : undefined,
        type: row.type != null ? String(row.type) : undefined,
        db_host: creds.host || null,
        db_name: creds.database || null,
        db_user: creds.user || null,
        db_port: Number.isFinite(creds.port) ? creds.port : null,
        db_password_encrypted: creds.passwordEncrypted,
        db_password_secret_id: row.db_password_secret_id != null
            ? String(row.db_password_secret_id)
            : null,
    };
}
function readCredentialsFromConnectionRow(row) {
    const cfg = row.config && typeof row.config === "object" && !Array.isArray(row.config)
        ? row.config
        : {};
    const portRaw = row.db_port ?? cfg.db_port;
    const port = typeof portRaw === "number"
        ? portRaw
        : portRaw != null && String(portRaw).trim() !== ""
            ? Number(portRaw)
            : NaN;
    return {
        host: String(row.db_host ?? cfg.db_host ?? "").trim(),
        database: String(row.db_name ?? cfg.db_name ?? "").trim(),
        user: String(row.db_user ?? cfg.db_user ?? "").trim(),
        port: Number.isFinite(port) ? port : 5432,
        passwordEncrypted: row.db_password_encrypted ??
            cfg.db_password_encrypted ??
            null,
    };
}
function readConnectionTablesFromRow(row) {
    const direct = row.connection_tables;
    if (Array.isArray(direct)) {
        return direct.map((t) => String(t).trim()).filter(Boolean);
    }
    const cfg = row.config && typeof row.config === "object" && !Array.isArray(row.config)
        ? row.config
        : {};
    const fromCfg = cfg.connection_tables;
    if (Array.isArray(fromCfg)) {
        return fromCfg.map((t) => String(t).trim()).filter(Boolean);
    }
    return null;
}
function buildConnectionInsertRow(columns, base, creds) {
    const row = { ...base };
    const configPatch = {};
    if (creds) {
        const credFields = {
            db_host: creds.host,
            db_name: creds.database,
            db_user: creds.user,
            db_port: creds.port,
            db_password_encrypted: creds.passwordEncrypted ?? null,
        };
        for (const [key, value] of Object.entries(credFields)) {
            if (columns.has(key)) {
                row[key] = value;
            }
            else {
                configPatch[key] = value;
            }
        }
        if (columns.has("db_password_secret_id")) {
            row.db_password_secret_id = null;
        }
    }
    if (Object.keys(configPatch).length > 0 && columns.has("config")) {
        row.config = configPatch;
    }
    return row;
}
function buildConnectionUpdateRow(columns, patch, existingConfig) {
    const row = {};
    const configPatch = { ...(existingConfig ?? {}) };
    let configChanged = false;
    if (patch.name !== undefined)
        row.name = patch.name;
    const credMap = {};
    if (patch.host !== undefined)
        credMap.db_host = patch.host;
    if (patch.database !== undefined)
        credMap.db_name = patch.database;
    if (patch.user !== undefined)
        credMap.db_user = patch.user;
    if (patch.port !== undefined)
        credMap.db_port = patch.port;
    for (const [key, value] of Object.entries(credMap)) {
        if (columns.has(key))
            row[key] = value;
        else {
            configPatch[key] = value;
            configChanged = true;
        }
    }
    if (patch.connection_tables !== undefined) {
        if (columns.has("connection_tables")) {
            row.connection_tables = patch.connection_tables;
        }
        else {
            configPatch.connection_tables = patch.connection_tables;
            configChanged = true;
        }
    }
    if (configChanged && columns.has("config")) {
        row.config = configPatch;
    }
    if (columns.has("updated_at")) {
        row.updated_at = new Date().toISOString();
    }
    return row;
}
//# sourceMappingURL=connection-persistence.js.map