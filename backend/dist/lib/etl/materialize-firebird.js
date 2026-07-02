"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.materializeFirebirdTable = materializeFirebirdTable;
exports.materializePostgresTable = materializePostgresTable;
exports.cleanupTempTables = cleanupTempTables;
const pg_1 = require("pg");
const helpers_1 = require("../sql/helpers");
const connection_secret_1 = require("../connection-secret");
const resolve_firebird_connection_1 = require("../connection/resolve-firebird-connection");
const FB_BATCH_SIZE = 8_000;
const PG_INSERT_BATCH = 2_000;
const firebirdSafePart = (s) => /^[A-Z0-9_]+$/i.test(String(s).trim())
    ? String(s).trim().toUpperCase()
    : `"${String(s).trim().replace(/"/g, '""')}"`;
const normalizeKey = (k) => String(k || "").replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase();
const sanitizeForPostgres = (val) => {
    if (val === undefined || val === null)
        return null;
    if (typeof val === "string") {
        const s = val.indexOf("\u0000") >= 0 ? val.replace(/\u0000/g, "") : val;
        return s;
    }
    if (val instanceof Date)
        return isNaN(val.getTime()) ? null : val.toISOString();
    if (Buffer.isBuffer(val))
        return val.toString("utf8").replace(/\u0000/g, "");
    return val;
};
function inferPgType(value) {
    if (typeof value === "number")
        return Number.isInteger(value) ? "BIGINT" : "NUMERIC";
    if (typeof value === "boolean")
        return "BOOLEAN";
    if (value instanceof Date)
        return "TIMESTAMPTZ";
    if (typeof value === "string") {
        if (/^\d{4}-\d{2}-\d{2}(T|\s)\d{2}:\d{2}/.test(value))
            return "TIMESTAMPTZ";
        if (/^\d{4}-\d{2}-\d{2}$/.test(value))
            return "DATE";
    }
    return "TEXT";
}
function fbOpts(conn) {
    return (0, resolve_firebird_connection_1.resolveFirebirdAttachOptions)(conn);
}
async function materializeFirebirdTable(conn, table, columns, dateFilter, pgUrl, targetSchema, targetTable, signal, sharedPgClient, onProgress, maxRows) {
    const qualifiedTable = `${targetSchema}."${targetTable}"`;
    const opts = fbOpts(conn);
    const tablePart = table.includes(".")
        ? (table.split(".").pop() || table).trim().toUpperCase()
        : firebirdSafePart(table);
    const cols = columns?.length ? columns.map((c) => firebirdSafePart(c)).join(", ") : "*";
    const { clause: dfClause, params: dfParams } = (0, helpers_1.buildDateFilterWhereFragmentFirebird)(dateFilter);
    let wherePart = dfClause ? ` WHERE ${dfClause}` : "";
    if (dfParams.length > 0) {
        for (const p of dfParams) {
            const pos = wherePart.indexOf("?");
            if (pos === -1)
                break;
            const escaped = typeof p === "number" ? String(p) : `'${String(p).replace(/'/g, "''")}'`;
            wherePart = wherePart.slice(0, pos) + escaped + wherePart.slice(pos + 1);
        }
    }
    const ownsClient = !sharedPgClient;
    const pgClient = sharedPgClient ?? new pg_1.Client({ connectionString: pgUrl, connectionTimeoutMillis: 15000 });
    if (ownsClient) {
        await pgClient.connect();
        await pgClient.query(`CREATE SCHEMA IF NOT EXISTS ${targetSchema}`).catch(() => { });
    }
    const firstClause = maxRows != null && maxRows > 0 ? `FIRST ${Math.floor(maxRows)} ` : "";
    const sql = `SELECT ${firstClause}${cols} FROM ${tablePart}${wherePart}`;
    try {
        const result = await new Promise((resolve, reject) => {
            const Firebird = require("node-firebird");
            Firebird.attach(opts, (attachErr, db) => {
                if (attachErr)
                    return reject(attachErr);
                let tableCreated = false;
                let pgInsertBatch = PG_INSERT_BATCH;
                let buffer = [];
                let totalRows = 0;
                let failed = false;
                let insertChain = Promise.resolve();
                let lastProgressReport = 0;
                const detachSafely = () => {
                    try {
                        if (db?.detach)
                            db.detach(() => { });
                    }
                    catch {
                    }
                };
                const scheduleInsert = (rows) => {
                    insertChain = insertChain.then(async () => {
                        if (failed || rows.length === 0)
                            return;
                        const keys = Object.keys(rows[0]);
                        const colList = keys.map((k) => `"${k}"`).join(", ");
                        const values = [];
                        const placeholders = rows.map((row, ri) => {
                            const ph = keys.map((k, ki) => {
                                values.push(sanitizeForPostgres(row[k]));
                                return `$${ri * keys.length + ki + 1}`;
                            });
                            return `(${ph.join(", ")})`;
                        });
                        await pgClient.query(`INSERT INTO ${qualifiedTable} (${colList}) VALUES ${placeholders.join(", ")}`, values);
                    }).catch((e) => {
                        failed = true;
                        throw e;
                    });
                };
                const onRow = (row) => {
                    if (failed)
                        return;
                    if (signal?.aborted) {
                        failed = true;
                        return;
                    }
                    const normalized = {};
                    for (const k of Object.keys(row))
                        normalized[normalizeKey(k)] = row[k];
                    totalRows++;
                    if (!tableCreated) {
                        tableCreated = true;
                        const numCols = Object.keys(normalized).length;
                        pgInsertBatch = Math.min(PG_INSERT_BATCH, Math.max(1, Math.floor(65000 / numCols)));
                        const colDefs = Object.keys(normalized)
                            .map((k) => `"${k}" ${inferPgType(normalized[k])}`)
                            .join(", ");
                        insertChain = insertChain
                            .then(async () => {
                            await pgClient.query(`DROP TABLE IF EXISTS ${qualifiedTable}`);
                            await pgClient.query(`CREATE TABLE ${qualifiedTable} (_biconic_rn BIGSERIAL PRIMARY KEY, ${colDefs})`);
                        })
                            .catch((e) => {
                            failed = true;
                            throw e;
                        });
                    }
                    buffer.push(normalized);
                    if (buffer.length >= pgInsertBatch) {
                        const toFlush = buffer;
                        buffer = [];
                        scheduleInsert(toFlush);
                        if (onProgress && totalRows - lastProgressReport >= 25_000) {
                            lastProgressReport = totalRows;
                            onProgress(totalRows);
                        }
                    }
                };
                const onDone = (streamErr) => {
                    detachSafely();
                    if (buffer.length > 0) {
                        const toFlush = buffer;
                        buffer = [];
                        scheduleInsert(toFlush);
                    }
                    insertChain
                        .then(() => {
                        if (streamErr)
                            return reject(streamErr);
                        if (failed)
                            return;
                        resolve({ rowCount: totalRows });
                    })
                        .catch((e) => reject(e));
                };
                db.sequentially(sql, [], onRow, onDone);
            });
        });
        if (result.rowCount > 0) {
            console.log(`[materialize] ${qualifiedTable}: ${result.rowCount} filas volcadas.`);
        }
        else {
            await pgClient.query(`CREATE TABLE IF NOT EXISTS ${qualifiedTable} (_biconic_rn BIGSERIAL PRIMARY KEY, __empty text)`);
        }
        return { qualifiedTable, rowCount: result.rowCount };
    }
    catch (e) {
        await pgClient.query(`DROP TABLE IF EXISTS ${qualifiedTable}`).catch(() => { });
        throw e;
    }
    finally {
        if (ownsClient)
            await pgClient.end().catch(() => { });
    }
}
async function materializePostgresTable(conn, table, columns, dateFilter, pgUrl, targetSchema, targetTable, sharedPgClient, maxRows) {
    const qualifiedTable = `${targetSchema}."${targetTable}"`;
    const { buildDateFilterWhereFragmentPg } = await Promise.resolve().then(() => __importStar(require("@/lib/sql/helpers")));
    let srcPassword = conn.db_password_encrypted
        ? (0, connection_secret_1.decryptConnectionPassword)(conn.db_password_encrypted)
        : conn.db_password ?? "";
    if (!srcPassword)
        srcPassword = process.env.DB_PASSWORD_PLACEHOLDER || "";
    const isExcel = String(conn.type || "").toLowerCase() === "excel_file";
    const srcConnStr = isExcel
        ? pgUrl
        : `postgres://${conn.db_user}:${encodeURIComponent(String(srcPassword))}@${conn.db_host}:${conn.db_port || 5432}/${conn.db_name}?sslmode=require`;
    const srcClient = new pg_1.Client({ connectionString: srcConnStr, connectionTimeoutMillis: 15000 });
    const ownsDestClient = !sharedPgClient;
    const destClient = sharedPgClient ?? new pg_1.Client({ connectionString: pgUrl, connectionTimeoutMillis: 15000 });
    await srcClient.connect();
    if (ownsDestClient) {
        await destClient.connect();
        await destClient.query(`CREATE SCHEMA IF NOT EXISTS ${targetSchema}`).catch(() => { });
    }
    try {
        const cols = columns?.length ? columns.map((c) => `"${c}"`).join(", ") : "*";
        const { clause: dfClause, params: dfParams } = buildDateFilterWhereFragmentPg(dateFilter, 1, "");
        const where = dfClause ? ` WHERE ${dfClause}` : "";
        const limitClause = maxRows != null && maxRows > 0 ? ` LIMIT ${Math.floor(maxRows)}` : "";
        const srcSql = `SELECT ${cols} FROM ${table.includes(".") ? table.split(".").map(p => `"${p}"`).join(".") : `"${table}"`}${where}${limitClause}`;
        const srcRes = await srcClient.query(srcSql, dfParams);
        const rows = srcRes.rows || [];
        if (rows.length === 0) {
            await destClient.query(`CREATE TABLE IF NOT EXISTS ${qualifiedTable} (_biconic_rn BIGSERIAL PRIMARY KEY, __empty text)`);
            return { qualifiedTable, rowCount: 0 };
        }
        const keys = Object.keys(rows[0]).map(normalizeKey);
        const sampleRow = rows[0];
        const origKeys = Object.keys(sampleRow);
        const numCols = origKeys.length;
        const pgBatch = Math.min(PG_INSERT_BATCH, Math.max(1, Math.floor(65000 / numCols)));
        const colDefs = origKeys.map((k, i) => `"${keys[i]}" ${inferPgType(sampleRow[k])}`).join(", ");
        await destClient.query(`DROP TABLE IF EXISTS ${qualifiedTable}`);
        await destClient.query(`CREATE TABLE ${qualifiedTable} (_biconic_rn BIGSERIAL PRIMARY KEY, ${colDefs})`);
        for (let i = 0; i < rows.length; i += pgBatch) {
            const chunk = rows.slice(i, i + pgBatch);
            const colList = keys.map((k) => `"${k}"`).join(", ");
            const values = [];
            const placeholders = chunk.map((row, ri) => {
                const ph = origKeys.map((k, ki) => {
                    values.push(sanitizeForPostgres(row[k]));
                    return `$${ri * origKeys.length + ki + 1}`;
                });
                return `(${ph.join(", ")})`;
            });
            await destClient.query(`INSERT INTO ${qualifiedTable} (${colList}) VALUES ${placeholders.join(", ")}`, values);
        }
        console.log(`[materialize-pg] ${qualifiedTable}: ${rows.length} filas.`);
        return { qualifiedTable, rowCount: rows.length };
    }
    catch (e) {
        await destClient.query(`DROP TABLE IF EXISTS ${qualifiedTable}`).catch(() => { });
        throw e;
    }
    finally {
        await srcClient.end().catch(() => { });
        if (ownsDestClient)
            await destClient.end().catch(() => { });
    }
}
async function cleanupTempTables(pgUrl, tables) {
    if (tables.length === 0)
        return;
    const pgClient = new pg_1.Client({ connectionString: pgUrl, connectionTimeoutMillis: 10000 });
    await pgClient.connect();
    try {
        for (const t of tables) {
            await pgClient.query(`DROP TABLE IF EXISTS ${t} CASCADE`).catch(() => { });
        }
    }
    finally {
        await pgClient.end().catch(() => { });
    }
}
//# sourceMappingURL=materialize-firebird.js.map