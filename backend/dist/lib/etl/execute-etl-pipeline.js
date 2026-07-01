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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureRunTerminalState = ensureRunTerminalState;
exports.markStaleRunsForEtl = markStaleRunsForEtl;
exports.executeEtlPipeline = executeEtlPipeline;
const service_1 = require("../supabase/service");
const connection_secret_1 = require("../connection-secret");
const pg_1 = require("pg");
const postgres_1 = __importDefault(require("postgres"));
const helpers_1 = require("../sql/helpers");
const transformations_1 = require("./transformations");
const limits_1 = require("./limits");
const schedule_1 = require("./schedule");
const internal_db_url_1 = require("../db/internal-db-url");
const excel_metadata_1 = require("../excel-import/excel-metadata");
const call_join_query_for_etl_1 = require("../connection/call-join-query-for-etl");
const run_progress_1 = require("./run-progress");
function createHttpError(message, status) {
    const err = new Error(message);
    err.status = status;
    return err;
}
function getStarJoinPairs(jn) {
    if (Array.isArray(jn.conditions) && jn.conditions.length > 0) {
        return jn.conditions
            .map((c) => ({
            primaryColumn: String(c?.primaryColumn ?? "").trim(),
            secondaryColumn: String(c?.secondaryColumn ?? "").trim(),
        }))
            .filter((p) => p.primaryColumn || p.secondaryColumn);
    }
    const primaryColumn = String(jn.primaryColumn ?? "").trim();
    const secondaryColumn = String(jn.secondaryColumn ?? "").trim();
    if (primaryColumn || secondaryColumn)
        return [{ primaryColumn, secondaryColumn }];
    return [];
}
function inferPostgresType(value) {
    if (typeof value === "number") {
        return "NUMERIC";
    }
    if (typeof value === "boolean")
        return "BOOLEAN";
    if (typeof value === "object" && value !== null) {
        if (value instanceof Date || !isNaN(new Date(value).getTime()))
            return "TIMESTAMP WITH TIME ZONE";
        return "JSONB";
    }
    return "TEXT";
}
function pgCastExpr(columnIdentifier, targetType) {
    const col = columnIdentifier;
    const sanitized = `NULLIF(
    (
      WITH raw AS (
        SELECT regexp_replace(COALESCE(${col}::text,''), '\\s+', '', 'g') AS r
      ), counts AS (
        SELECT r,
        (length(r) - length(replace(r, '.', ''))) AS dot_count,
        (length(r) - length(replace(r, ',', ''))) AS comma_count,
        position('.' in r) AS first_dot_pos,
        position(',' in r) AS first_comma_pos
        FROM raw
      )
      SELECT regexp_replace(
        CASE
          WHEN comma_count = 0 AND dot_count > 1 THEN replace(r, '.', '')
          WHEN dot_count = 0 AND comma_count > 1 THEN replace(r, ',', '')
          WHEN comma_count > 0 AND dot_count > 0 THEN (
            CASE
              WHEN first_comma_pos > first_dot_pos
                THEN replace(replace(r, '.', ''), ',', '.')
              ELSE replace(replace(r, ',', ''), '.', '.')
            END
          )
          WHEN comma_count = 1 AND dot_count = 0 THEN replace(r, ',', '.')
          WHEN dot_count = 1 AND comma_count = 0 THEN r
          ELSE r
        END,
        '[^0-9.\-]', '', 'g'
      ) FROM counts
    ),
    ''
  )`;
    switch (targetType) {
        case "number":
        case "decimal":
            return `CAST(${sanitized} AS NUMERIC)`;
        case "integer":
            return `CAST(${sanitized} AS NUMERIC)::INTEGER`;
        case "string":
            return `CAST(${col} AS TEXT)`;
        case "boolean":
            return `CASE
        WHEN trim(lower(COALESCE(${col}::text, ''))) IN ('true','t','1','yes','y','si','sí') THEN true
        WHEN trim(lower(COALESCE(${col}::text, ''))) IN ('false','f','0','no','n') THEN false
        ELSE NULL
      END`;
        case "date":
            return `CAST(${col} AS DATE)`;
        case "datetime":
            return `CAST(${col} AS TIMESTAMP)`;
        default:
            return col;
    }
}
const ETL_RETRIES = 3;
const ETL_RETRY_DELAY_MS = 2000;
const STALE_RUN_MINUTES = 20;
async function withRetry(fn, opts = {}) {
    const retries = opts.retries ?? ETL_RETRIES;
    const delayMs = opts.delayMs ?? ETL_RETRY_DELAY_MS;
    const label = opts.label ?? "operation";
    let lastErr;
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            return await fn();
        }
        catch (e) {
            lastErr = e;
            if (attempt < retries) {
                console.warn(`[ETL] ${label} intento ${attempt}/${retries} falló, reintento en ${delayMs}ms:`, e?.message);
                await new Promise((r) => setTimeout(r, delayMs));
            }
        }
    }
    throw lastErr;
}
async function ensureRunTerminalState(supabaseAdmin, runId, status, payload) {
    await withRetry(() => supabaseAdmin
        .from("etl_runs_log")
        .update({ status, ...payload })
        .eq("id", runId)
        .throwOnError(), { retries: 5, delayMs: 1000, label: "ensureRunTerminalState" });
}
async function markStaleRunsForEtl(supabaseAdmin, etlId) {
    const threshold = new Date(Date.now() - STALE_RUN_MINUTES * 60 * 1000).toISOString();
    const { data: staleRows, error } = await supabaseAdmin
        .from("etl_runs_log")
        .select("id")
        .eq("etl_id", etlId)
        .in("status", ["started", "running"])
        .lt("started_at", threshold);
    if (error || !staleRows?.length)
        return;
    const ids = staleRows.map((r) => r.id);
    await supabaseAdmin
        .from("etl_runs_log")
        .update({
        status: "failed",
        completed_at: new Date().toISOString(),
        error_message: "Ejecución anterior cerrada automáticamente por timeout/interrupción.",
    })
        .in("id", ids)
        .in("status", ["started", "running"]);
}
async function executeEtlPipeline(body, runId, supabaseAdmin, user, ctx) {
    const asPositiveInt = (raw, fallback) => {
        const parsed = Number(raw);
        return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
    };
    let newTableName = "";
    const completedAt = () => new Date().toISOString();
    let rowsProcessed = 0;
    const pipelineStartedAt = Date.now();
    const supabaseService = (0, service_1.createServiceRoleClient)();
    const buildRef = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ||
        process.env.VERCEL_URL ||
        "local";
    const formatRunError = (err) => {
        const message = String(err?.message || "Error desconocido").trim();
        const firstStackFrame = typeof err?.stack === "string"
            ? err.stack
                .split("\n")
                .map((line) => line.trim())
                .find((line) => !!line && line.startsWith("at "))
            : "";
        const merged = [
            message || "Error desconocido",
            firstStackFrame ? `frame=${firstStackFrame}` : "",
            `ref=${buildRef}`,
        ]
            .filter(Boolean)
            .join(" | ");
        return merged.slice(0, 500);
    };
    const joinObjForTimeout = body?.join;
    const joinsCountForTimeout = Array.isArray(joinObjForTimeout?.joins) ? joinObjForTimeout.joins.length : 0;
    const hasAnyJoin = !!joinObjForTimeout;
    const rawAdaptiveTimeout = joinsCountForTimeout >= 10 ? 2_400_000
        : joinsCountForTimeout >= 8 ? 1_800_000
            : joinsCountForTimeout >= 5 ? 1_200_000
                : joinsCountForTimeout >= 2 ? 900_000
                    : hasAnyJoin ? 900_000
                        : 750_000;
    const isRailwayRunner = !!process.env.RAILWAY_ENVIRONMENT ||
        !!process.env.RAILWAY_PUBLIC_DOMAIN ||
        !!process.env.PROCESS_EXCEL_RUNNER_URL?.trim();
    const maxPipelineMs = isRailwayRunner
        ? rawAdaptiveTimeout
        : 800 * 1000 - 60_000;
    const adaptiveTimeoutDefault = Math.min(rawAdaptiveTimeout, maxPipelineMs);
    const PIPELINE_TIMEOUT_MS = Math.min(asPositiveInt(process.env.ETL_PIPELINE_TIMEOUT_MS, adaptiveTimeoutDefault), maxPipelineMs);
    console.log("[ETL Run] Timeout config:", { joinsCountForTimeout, hasAnyJoin, rawAdaptiveTimeout, adaptiveTimeoutDefault, PIPELINE_TIMEOUT_MS, maxPipelineMs, isRailwayRunner });
    const PAGE_SIZE = asPositiveInt(process.env.ETL_PAGE_SIZE, 60000);
    const JOIN_KEYSET_SIZE = asPositiveInt(process.env.ETL_JOIN_KEYSET_SIZE, 3000);
    const JOIN_CHUNK_SIZE = asPositiveInt(process.env.ETL_JOIN_CHUNK_SIZE, limits_1.ETL_JOIN_CHUNK_SIZE_DEFAULT);
    const METRICS_LOG_EVERY_BATCHES = asPositiveInt(process.env.ETL_METRICS_LOG_EVERY_BATCHES, 5);
    let pipelineTimedOut = false;
    let lastStarSourceOffset = Math.max(0, Number(body?._resumeStartOffset || 0));
    let lastStarChunkSize = 0;
    let continuationQueued = false;
    const pipelineTimer = setTimeout(async () => {
        pipelineTimedOut = true;
        console.error(`[Background Run ${runId}] Timeout de seguridad alcanzado (${PIPELINE_TIMEOUT_MS / 1000}s). Marcando como fallido.`);
        try {
            const resumeAttempt = Math.max(0, Number(body?._resumeAttempt || 0));
            const canQueueContinuation = !continuationQueued && lastStarSourceOffset > 0 && resumeAttempt < 2;
            if (canQueueContinuation) {
                continuationQueued = true;
                const continuationBody = {
                    ...body,
                    waitForCompletion: false,
                    _resumeStartOffset: lastStarSourceOffset,
                    _resumeAttempt: resumeAttempt + 1,
                };
                await fetch(`${ctx.etlRunnerBase}/internal/etl/run-pipeline`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        ...(ctx.internalEtlSecret ? { "x-internal-etl": ctx.internalEtlSecret } : {}),
                    },
                    body: JSON.stringify({ ...continuationBody, runId }),
                }).catch(() => { });
            }
            await ensureRunTerminalState(supabaseAdmin, runId, "failed", {
                completed_at: new Date().toISOString(),
                error_message: canQueueContinuation
                    ? `Timeout de seguridad (${PIPELINE_TIMEOUT_MS / 1000}s). Se programó reanudación automática desde offset ${lastStarSourceOffset} (intento ${Math.max(1, Number(body?._resumeAttempt || 0) + 1)}). Filas procesadas: ${rowsProcessed}.`
                    : `Timeout de seguridad (${PIPELINE_TIMEOUT_MS / 1000}s): el ETL tardó demasiado. Filas procesadas: ${rowsProcessed}. Considere reducir el volumen de datos o agregar filtros. (ref=${buildRef})`,
                rows_processed: rowsProcessed,
            });
        }
        catch (_) { }
    }, PIPELINE_TIMEOUT_MS);
    const dbUrl = (0, internal_db_url_1.getInternalDbUrl)();
    if (!dbUrl)
        throw new Error("Variable de entorno DATABASE_URL no encontrada.");
    const sqlPersistent = (0, postgres_1.default)(dbUrl);
    try {
        const regex = new RegExp("[-:.]", "g");
        const timestamp = new Date().toISOString().replace(regex, "").slice(0, 14);
        const generatedTableName = `run_${timestamp}_${runId.substring(0, 8)}`;
        const mode = body.end?.mode || "overwrite";
        const requestedTargetRaw = body.end?.target?.table?.trim();
        if (mode === "overwrite" && requestedTargetRaw) {
            newTableName = requestedTargetRaw.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase();
        }
        else if (requestedTargetRaw) {
            newTableName = requestedTargetRaw.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase();
        }
        else {
            newTableName = generatedTableName;
        }
        await withRetry(() => supabaseAdmin
            .from("etl_runs_log")
            .update({
            destination_schema: "etl_output",
            destination_table_name: newTableName,
            status: "running",
        })
            .eq("id", runId)
            .throwOnError(), { label: "update-running" });
        const isPreview = !!body.preview;
        const previewRows = [];
        const PREVIEW_LIMIT = 5000;
        const pageSize = PAGE_SIZE;
        const INSERT_CHUNK_SIZE_DEFAULT = 15000;
        const MAX_PARAMS_PER_QUERY = 65000;
        let tableCreated = false;
        let tableColumnNames = null;
        const globalCountMap = new Map();
        const globalCountOriginalValues = new Map();
        const normalizeFilterColumnRef = (ref) => {
            const r = (ref || "").trim();
            if (!r || /^(primary\.|join_\d+\.)/i.test(r))
                return r;
            if (/^primary_/i.test(r))
                return "primary." + r.replace(/^primary_/i, "").trim();
            const m = r.match(/^join_(\d+)_\.?(.*)$/i);
            if (m)
                return `join_${m[1]}.${(m[2] || "").trim()}`;
            return r;
        };
        if (body?.filter?.dateFilter?.column) {
            body.filter.dateFilter = { ...body.filter.dateFilter, column: normalizeFilterColumnRef(body.filter.dateFilter.column) };
        }
        if (body?.filter?.conditions?.length) {
            body.filter.conditions = body.filter.conditions.map((c) => ({ ...c, column: c.column ? normalizeFilterColumnRef(c.column) : c.column }));
        }
        const allConditions = body?.filter?.conditions ?? [];
        const sqlConditions = allConditions.filter((c) => c.operator !== "not in");
        const excludeRowsRules = allConditions
            .filter((c) => c.operator === "not in")
            .map((c) => ({
            column: (c.column || "").replace(/^primary\./i, "").replace(/^join_\d+\./i, "").trim(),
            excluded: (c.value ?? "").split(",").map((v) => v.trim()).filter(Boolean),
        }));
        const dateFilter = body?.filter?.dateFilter ?? undefined;
        const _jsDateRe = /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s|GMT|UTC|Coordinated|Greenwich/;
        const sanitizeForPostgres = (val) => {
            if (val === undefined || val === null)
                return null;
            if (typeof val === "string") {
                const s = val.indexOf("\u0000") >= 0 ? val.replace(/\u0000/g, "") : val;
                if (_jsDateRe.test(s)) {
                    const d = new Date(s);
                    if (!isNaN(d.getTime()))
                        return d.toISOString();
                }
                return s;
            }
            if (val instanceof Date)
                return isNaN(val.getTime()) ? null : val.toISOString();
            if (Buffer.isBuffer(val))
                return val.toString("utf8").replace(/\u0000/g, "");
            return val;
        };
        const toSaneKey = (key) => key.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase();
        const insertBatch = async (batch) => {
            if (batch.length === 0)
                return;
            if (!tableCreated && !isPreview) {
                const firstRow = batch[0];
                const columnsDefinition = {};
                const castTypeOverrides = {};
                if (body.cast?.conversions?.length) {
                    const allKeys = batch.some((r) => r && typeof r === "object")
                        ? Array.from(new Set(batch.flatMap((r) => Object.keys(r))))
                        : firstRow ? Object.keys(firstRow) : [];
                    const resolveTargets = (simple) => {
                        const sane = toSaneKey(simple);
                        const matches = allKeys.filter((k) => toSaneKey(k) === sane || k === simple || k.endsWith(`_${simple}`));
                        return matches.length ? matches : allKeys.includes(simple) ? [simple] : [];
                    };
                    for (const cv of body.cast.conversions) {
                        let pgType = "TEXT";
                        switch (cv.targetType) {
                            case "number":
                            case "decimal":
                                pgType = "NUMERIC";
                                break;
                            case "integer":
                                pgType = "INTEGER";
                                break;
                            case "string":
                                pgType = "TEXT";
                                break;
                            case "boolean":
                                pgType = "BOOLEAN";
                                break;
                            case "date":
                                pgType = "DATE";
                                break;
                            case "datetime":
                                pgType = "TIMESTAMP";
                                break;
                            default:
                                pgType = "TEXT";
                        }
                        const targets = resolveTargets(cv.column);
                        for (const key of targets) {
                            castTypeOverrides[toSaneKey(key)] = pgType;
                        }
                    }
                }
                const filterColumns = body.filter?.columns;
                const explicitColumnNames = filterColumns && filterColumns.length > 0
                    ? filterColumns.map((c) => toSaneKey(c))
                    : firstRow
                        ? Object.keys(firstRow).map((k) => toSaneKey(k))
                        : [];
                const seen = new Set();
                for (const colName of explicitColumnNames) {
                    if (!colName || seen.has(colName))
                        continue;
                    seen.add(colName);
                    const overrideType = castTypeOverrides[colName];
                    if (overrideType) {
                        columnsDefinition[`"${colName}"`] = overrideType;
                        continue;
                    }
                    let inferred = "TEXT";
                    for (const row of batch) {
                        if (!row || typeof row !== "object")
                            continue;
                        for (const key in row) {
                            if (toSaneKey(key) === colName) {
                                inferred = inferPostgresType(row[key]);
                                break;
                            }
                        }
                        if (inferred !== "TEXT")
                            break;
                    }
                    columnsDefinition[`"${colName}"`] = inferred;
                }
                if (!filterColumns?.length && firstRow) {
                    for (const key in firstRow) {
                        const saneKey = toSaneKey(key);
                        if (seen.has(saneKey))
                            continue;
                        seen.add(saneKey);
                        const overrideType = castTypeOverrides[saneKey];
                        columnsDefinition[`"${saneKey}"`] = overrideType || inferPostgresType(firstRow[key]);
                    }
                }
                if (body.etlId) {
                    columnsDefinition['"etl_id"'] = "UUID";
                }
                const columnParts = Object.entries(columnsDefinition).map(([name, type]) => {
                    if (!name.match(/^"[a-zA-Z0-9_]+"$/) ||
                        !type.match(/^[a-zA-Z0-9_ ]+$/)) {
                        throw new Error(`Nombre de columna o tipo inválido: ${name} ${type}`);
                    }
                    return `${name} ${type}`;
                });
                console.log(`[Background] Preparando tabla destino (modo=${mode}): etl_output.${newTableName}`);
                if (mode === "overwrite" || mode === "replace") {
                    const dropQuery = `DROP TABLE IF EXISTS etl_output."${newTableName}" CASCADE;`;
                    await sqlPersistent.unsafe(dropQuery);
                }
                if (mode === "append") {
                    const existsRes = await sqlPersistent.unsafe(`SELECT to_regclass('etl_output."${newTableName}"') AS reg`);
                    const exists = Array.isArray(existsRes) && existsRes[0]?.reg;
                    if (exists) {
                        tableCreated = true;
                    }
                }
                if (!tableCreated) {
                    const createTableQuery = `CREATE TABLE etl_output."${newTableName}" (${columnParts.join(", ")});`;
                    await sqlPersistent.unsafe(createTableQuery);
                    tableCreated = true;
                    tableColumnNames = Object.keys(columnsDefinition).map((k) => k.replace(/^"|"$/g, ""));
                }
                if (mode === "append" && tableCreated && !tableColumnNames) {
                    const colsRes = await sqlPersistent.unsafe(`SELECT column_name FROM information_schema.columns WHERE table_schema = 'etl_output' AND table_name = $1 ORDER BY ordinal_position`, [newTableName]);
                    tableColumnNames = Array.isArray(colsRes) ? colsRes.map((r) => String(r.column_name)) : [];
                }
            }
            if (isPreview) {
                for (const row of batch) {
                    if (previewRows.length < PREVIEW_LIMIT) {
                        const saneRow = {};
                        for (const key in row) {
                            const saneKey = key.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase();
                            saneRow[saneKey] = sanitizeForPostgres(row[key]);
                        }
                        if (body?.etlId)
                            saneRow["etl_id"] = body.etlId;
                        previewRows.push(saneRow);
                    }
                }
                return;
            }
            const allowedKeys = tableColumnNames && tableColumnNames.length > 0
                ? new Set(tableColumnNames.map((c) => c.toLowerCase()))
                : null;
            const batchToInsert = batch.map((row) => {
                const saneRow = {};
                for (const key in row) {
                    const saneKey = key.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase();
                    if (allowedKeys === null || allowedKeys.has(saneKey)) {
                        const v = sanitizeForPostgres(row[key]);
                        saneRow[saneKey] = v === undefined ? null : v;
                    }
                }
                if (body?.etlId) {
                    saneRow["etl_id"] = body.etlId;
                }
                return saneRow;
            });
            const numColumns = batchToInsert[0] ? Object.keys(batchToInsert[0]).length : 1;
            const insertChunkSize = Math.min(INSERT_CHUNK_SIZE_DEFAULT, Math.max(1, Math.floor(MAX_PARAMS_PER_QUERY / numColumns)));
            try {
                for (let i = 0; i < batchToInsert.length; i += insertChunkSize) {
                    const chunk = batchToInsert.slice(i, i + insertChunkSize);
                    if (chunk.length > 0) {
                        await withRetry(() => sqlPersistent `INSERT INTO etl_output.${sqlPersistent(newTableName)} ${sqlPersistent(chunk)}`, { label: "insert-batch" });
                    }
                }
            }
            catch (insErr) {
                throw new Error(`Error guardando lote: ${insErr.message}`);
            }
        };
        async function* dataSourceGenerator() {
            const unionConf = body.union;
            const rightSources = unionConf?.rights ?? (unionConf?.right ? [unionConf.right] : []);
            if (unionConf?.left?.connectionId && rightSources.length > 0) {
                const left = unionConf.left;
                const pageSizeUnion = pageSize;
                const dbUrlUnion = (0, internal_db_url_1.getInternalDbUrl)();
                if (!dbUrlUnion)
                    throw new Error("DATABASE_URL no disponible para UNION.");
                const resolveTableAndConn = async (connId, filter) => {
                    const { data: c } = await supabaseService.from("connections").select("*").eq("id", connId).single();
                    if (!c)
                        throw new Error(`Conexión ${connId} no encontrada.`);
                    if (c.type === "excel_file") {
                        const { data: metaRows } = await supabaseService
                            .from("data_tables")
                            .select("physical_schema_name, physical_table_name, table_name")
                            .eq("connection_id", connId);
                        const rows = (0, excel_metadata_1.normalizeExcelDataTableRows)(metaRows);
                        const table = (0, excel_metadata_1.resolveExcelQualifiedTableFromRows)(String(connId), (filter?.table || "").trim() || undefined, rows, internal_db_url_1.EXCEL_PHYSICAL_SCHEMA);
                        return { table, conn: c, type: "excel" };
                    }
                    const t = (filter?.table || "").trim();
                    if (!t)
                        throw new Error(`UNION: la fuente debe tener tabla (filter.table) para conexión ${connId}.`);
                    return { table: t, conn: c, type: c.type };
                };
                const leftInfo = await resolveTableAndConn(left.connectionId, left.filter);
                const rightInfos = await Promise.all(rightSources.map((r) => resolveTableAndConn(r.connectionId, r.filter)));
                if (leftInfo.type !== "excel" || rightInfos.some((r) => r.type !== "excel")) {
                    const allSameConn = rightInfos.every((r) => r.conn && left.connectionId === r.conn.id);
                    if (!allSameConn)
                        throw new Error("UNION con varias conexiones solo soportado cuando todas son Excel. Usá la misma conexión para Postgres.");
                }
                const clientUnion = new pg_1.Client({ connectionString: dbUrlUnion, connectionTimeoutMillis: 15000, statement_timeout: 600000 });
                await withRetry(() => clientUnion.connect(), { label: "union-connect" });
                try {
                    await clientUnion.query("BEGIN");
                    let cursorIdx = 0;
                    const normalizeRow = (r) => {
                        const out = {};
                        for (const k in r)
                            out[k.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase()] = r[k];
                        return out;
                    };
                    async function* runSourceCursor(source, tableQualified, options) {
                        const filter = source.filter || {};
                        const tableQ = (0, helpers_1.quoteQualified)(tableQualified);
                        const selectList = filter.columns?.length ? filter.columns.map((c) => (0, helpers_1.quoteIdent)(c, "postgres")).join(", ") : "*";
                        const conds = options?.conditionsOverride ?? filter.conditions ?? [];
                        const { clause: condClause, params: condParams } = (0, helpers_1.buildWhereClausePg)(conds);
                        const { clause: dfClause, params: dfParams } = (0, helpers_1.buildDateFilterWhereFragmentPg)(options?.dateFilter, condParams.length + 1);
                        const clause = dfClause ? (condClause ? `${condClause} AND ${dfClause}` : `WHERE ${dfClause}`) : condClause;
                        const params = [...condParams, ...dfParams];
                        const base = `SELECT ${selectList} FROM ${tableQ} ${clause}`;
                        const cursorName = `union_cursor_${cursorIdx++}`;
                        await clientUnion.query(`DECLARE ${cursorName} NO SCROLL CURSOR FOR ${base}`, params);
                        try {
                            for (;;) {
                                const res = await clientUnion.query(`FETCH ${pageSizeUnion} FROM ${cursorName}`);
                                const rows = (res.rows || []).map(normalizeRow);
                                if (rows.length === 0)
                                    break;
                                yield rows;
                                if (rows.length < pageSizeUnion)
                                    break;
                            }
                        }
                        finally {
                            await clientUnion.query(`CLOSE ${cursorName}`).catch(() => { });
                        }
                    }
                    const leftTable = leftInfo.table;
                    let leftCols = null;
                    for await (const batch of runSourceCursor(left, leftTable, { conditionsOverride: sqlConditions, dateFilter })) {
                        if (batch.length && leftCols === null)
                            leftCols = Object.keys(batch[0]).sort();
                        yield batch;
                    }
                    for (let r = 0; r < rightSources.length; r++) {
                        const right = rightSources[r];
                        const rightInfo = rightInfos[r];
                        for await (const batch of runSourceCursor(right, rightInfo.table, { dateFilter })) {
                            if (batch.length) {
                                const rightCols = Object.keys(batch[0]).sort();
                                if (leftCols && rightCols.join(",") !== leftCols.join(","))
                                    throw new Error("UNION: todos los datasets deben tener las mismas columnas (nombre y orden).");
                            }
                            yield batch;
                        }
                    }
                    await clientUnion.query("COMMIT").catch(() => { });
                }
                finally {
                    await clientUnion.end();
                }
                return;
            }
            const joinObj = body.join;
            const isJoin = !!joinObj && typeof joinObj === "object";
            if (isJoin && Array.isArray(joinObj.joins)) {
                const providedJoinsCount = joinObj.joins.length;
                joinObj.joins = joinObj.joins.filter((jn) => !!jn && typeof jn === "object");
                if (joinObj.joins.length !== providedJoinsCount) {
                    throw createHttpError("JOIN estrella inválido: se detectaron joins vacíos o corruptos. Edita el ETL y vuelve a guardarlo.", 400);
                }
                for (let idx = 0; idx < joinObj.joins.length; idx++) {
                    const jn = joinObj.joins[idx];
                    if (!jn || typeof jn !== "object") {
                        throw createHttpError(`Join ${idx}: configuración inválida (elemento no es un objeto).`, 400);
                    }
                    if (!Object.prototype.hasOwnProperty.call(jn, "secondaryConnectionId") || jn.secondaryConnectionId == null || String(jn.secondaryConnectionId).trim() === "") {
                        throw createHttpError(`Join ${idx}: secondaryConnectionId es obligatorio (valor actual: ${JSON.stringify(jn.secondaryConnectionId)}).`, 400);
                    }
                }
            }
            const isStarJoin = isJoin && !!joinObj.primaryConnectionId && Array.isArray(joinObj.joins);
            if (isStarJoin && joinObj.joins.length === 0) {
                throw createHttpError("JOIN estrella inválido: faltan conexiones secundarias configuradas.", 400);
            }
            if (isStarJoin) {
                for (let idx = 0; idx < joinObj.joins.length; idx++) {
                    const jn = joinObj.joins[idx];
                    if (jn.secondaryConnectionId == null || String(jn.secondaryConnectionId).trim() === "") {
                        throw createHttpError(`Join ${idx}: secondaryConnectionId es obligatorio.`, 400);
                    }
                    if (!String(jn.secondaryTable ?? "").trim()) {
                        throw createHttpError(`Join ${idx}: secondaryTable es obligatorio.`, 400);
                    }
                    const pairs = getStarJoinPairs(jn);
                    if (pairs.length === 0 || pairs.some((p) => !p.primaryColumn || !p.secondaryColumn)) {
                        throw createHttpError(`Join ${idx}: se requiere al menos una condición válida de enlace.`, 400);
                    }
                }
            }
            else if (isJoin) {
                if (!joinObj.secondaryConnectionId) {
                    throw createHttpError("JOIN inválido: secondaryConnectionId es obligatorio para join simple.", 400);
                }
                if (!String(joinObj.leftTable ?? "").trim() || !String(joinObj.rightTable ?? "").trim()) {
                    throw createHttpError("JOIN inválido: leftTable y rightTable son obligatorias.", 400);
                }
            }
            const primaryConnId = isStarJoin ? joinObj.primaryConnectionId : isJoin ? joinObj.connectionId : body.connectionId;
            if (!primaryConnId)
                throw createHttpError("ID de conexión primario no encontrado.", 400);
            const { data: conn } = await supabaseService
                .from("connections")
                .select("*")
                .eq("id", String(primaryConnId))
                .single();
            if (!conn)
                throw new Error(`Conexión ${primaryConnId} no encontrada.`);
            if (conn.type === "firebird") {
                const password = conn.db_password_encrypted
                    ? (0, connection_secret_1.decryptConnectionPassword)(conn.db_password_encrypted)
                    : conn.db_password ?? "";
                const safePart = (s) => /^[A-Z0-9_]+$/i.test(s) ? s.toUpperCase() : `"${s.replace(/"/g, '""')}"`;
                const normalizeRow = (row) => {
                    const out = {};
                    for (const k in row) {
                        out[k.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase()] = row[k];
                    }
                    return out;
                };
                if (isJoin) {
                    const isStar = isStarJoin && Array.isArray(joinObj.joins) && joinObj.joins.length > 0;
                    if (isStar && Array.isArray(joinObj.joins) && joinObj.joins.length > 1) {
                        const selectedCols = (body.filter?.columns || []);
                        const primaryColumns = selectedCols
                            .filter((c) => /^primary\./i.test(c))
                            .map((c) => c.replace(/^primary\./i, "").trim());
                        const joinsWithCols = (joinObj.joins || []).map((jn, idx) => ({
                            ...jn,
                            secondaryColumns: selectedCols
                                .filter((c) => new RegExp(`^join_${idx}\\.`, "i").test(c))
                                .map((c) => c.replace(new RegExp(`^join_${idx}\\.`, "i"), "").trim()),
                        }));
                        const joinsCount = (joinObj.joins || []).length;
                        const starChunkCap = joinsCount >= 10 ? 15_000
                            : joinsCount >= 8 ? 20_000
                                : joinsCount >= 6 ? 30_000
                                    : joinsCount >= 4 ? 40_000
                                        : joinsCount >= 3 ? 50_000
                                            : 250_000;
                        const minStarChunkSize = joinsCount >= 10 ? 2_000
                            : joinsCount >= 8 ? 3_000
                                : joinsCount >= 6 ? 4_000
                                    : joinsCount >= 4 ? 5_000
                                        : 5_000;
                        let starChunkSize = Math.max(minStarChunkSize, Math.min(JOIN_CHUNK_SIZE, starChunkCap));
                        let usingMaterialization = false;
                        let starOffset = Math.max(0, Number(body?._resumeStartOffset || 0));
                        const materializationPrefix = (Math.random().toString(36).slice(2, 8) + Date.now().toString(36)).slice(0, 12);
                        const matTempTables = [`etl_temp."${materializationPrefix}_primary"`];
                        for (let mi = 0; mi < joinsCount; mi++)
                            matTempTables.push(`etl_temp."${materializationPrefix}_join_${mi}"`);
                        try {
                            await (0, run_progress_1.reportEtlRunProgress)(supabaseAdmin, runId, {
                                message: `JOIN múltiple (${joinsCount} tablas): preparando datos. La primera etapa puede tardar varios minutos…`,
                                rowsProcessed: 0,
                            });
                            while (true) {
                                let starData = {};
                                let currentChunkSize = starChunkSize;
                                while (true) {
                                    const joinQueryBody = {
                                        primaryConnectionId: joinObj.primaryConnectionId,
                                        primaryTable: joinObj.primaryTable || (body.filter?.table || "").trim(),
                                        joins: joinsWithCols,
                                        primaryColumns: primaryColumns.length > 0 ? primaryColumns : undefined,
                                        conditions: body.filter?.conditions || [],
                                        dateFilter: body.filter?.dateFilter ?? undefined,
                                        limit: currentChunkSize,
                                        offset: starOffset,
                                        count: false,
                                        fromEtlRun: true,
                                        _materializationPrefix: materializationPrefix,
                                        _skipMaterializationCleanup: true,
                                    };
                                    await (0, run_progress_1.reportEtlRunProgress)(supabaseAdmin, runId, {
                                        message: starOffset === 0
                                            ? `JOIN: materializando y leyendo primer lote (${joinsCount} tablas)…`
                                            : `JOIN: leyendo lote desde fila ${starOffset.toLocaleString("es-AR")}…`,
                                        rowsProcessed,
                                    });
                                    try {
                                        starData = await (0, call_join_query_for_etl_1.callJoinQueryForEtl)(joinQueryBody, ctx);
                                    }
                                    catch (joinErr) {
                                        const responseError = joinErr instanceof Error ? joinErr.message : String(joinErr);
                                        const isTimeoutResponse = /timeout|FUNCTION_INVOCATION_TIMEOUT|504/i.test(responseError);
                                        if (isTimeoutResponse && currentChunkSize > minStarChunkSize) {
                                            const reducedChunk = Math.max(minStarChunkSize, Math.floor(currentChunkSize / 2));
                                            if (reducedChunk < currentChunkSize) {
                                                console.log("[ETL Run join-query iteración] Timeout detectado, reintentando con chunk menor.", {
                                                    runId,
                                                    sourceOffset: starOffset,
                                                    previousChunk: currentChunkSize,
                                                    nextChunk: reducedChunk,
                                                    joinsCount,
                                                });
                                                currentChunkSize = reducedChunk;
                                                starChunkSize = Math.min(starChunkSize, reducedChunk);
                                                continue;
                                            }
                                        }
                                        throw new Error(isTimeoutResponse
                                            ? "La consulta JOIN superó el tiempo permitido. Reduzca el volumen o use filtros; el ETL obtiene datos por lotes. En servidor propio puede aumentar ETL_JOIN_TIMEOUT_MS."
                                            : responseError.startsWith("Error ejecutando JOIN múltiple:")
                                                ? responseError
                                                : `Error ejecutando JOIN múltiple: ${responseError}`);
                                    }
                                    starChunkSize = Math.min(starChunkSize, currentChunkSize);
                                    lastStarChunkSize = starChunkSize;
                                    if (starData?.materialized === true && !usingMaterialization) {
                                        usingMaterialization = true;
                                        starChunkSize = Math.max(starChunkSize, Math.min(JOIN_CHUNK_SIZE, 150_000));
                                        console.log("[ETL Run] Materialización detectada, subiendo chunk.", { runId, starChunkSize });
                                    }
                                    break;
                                }
                                if (!Array.isArray(starData.rows)) {
                                    throw new Error("JOIN múltiple devolvió una respuesta inválida.");
                                }
                                const sourceExhausted = starData.sourceExhausted === true;
                                const nextSourceOffset = typeof starData.nextSourceOffset === "number"
                                    ? starData.nextSourceOffset
                                    : starOffset + starData.rows.length;
                                lastStarSourceOffset = nextSourceOffset;
                                console.log("[ETL Run join-query iteración]", {
                                    runId,
                                    sourceOffset: starOffset,
                                    rows: starData.rows.length,
                                    sourceExhausted,
                                    nextSourceOffset,
                                    chunkSize: lastStarChunkSize || starChunkSize,
                                    dateFilterColumn: body.filter?.dateFilter?.column ?? null,
                                });
                                if (starData.rows.length > 0)
                                    yield starData.rows;
                                if (starData.rows.length === 0 && sourceExhausted)
                                    break;
                                if (nextSourceOffset <= starOffset) {
                                    console.log("[ETL Run join-query iteración] Corte defensivo por nextSourceOffset no creciente.", {
                                        runId,
                                        sourceOffset: starOffset,
                                        nextSourceOffset,
                                        sourceExhausted,
                                    });
                                    break;
                                }
                                starOffset = nextSourceOffset;
                                if (sourceExhausted)
                                    break;
                            }
                        }
                        finally {
                            const pgUrl = (0, internal_db_url_1.getInternalDbUrl)();
                            if (pgUrl) {
                                Promise.resolve().then(() => __importStar(require("@/lib/etl/materialize-firebird"))).then(({ cleanupTempTables }) => cleanupTempTables(pgUrl, matTempTables).catch((e) => console.error("[ETL Run materialize cleanup]", e))).catch(() => { });
                            }
                        }
                        return;
                    }
                    const leftTable = isStar ? (joinObj.primaryTable || (body.filter?.table || "").trim()) : (joinObj.leftTable || "").trim();
                    const rightTable = isStar ? joinObj.joins?.[0]?.secondaryTable ?? "" : (joinObj.rightTable || "").trim();
                    const jc = isStar ? joinObj.joins?.[0] ?? {} : (joinObj.joinConditions?.[0] || {});
                    const joinConditionPairsFb = isStar
                        ? ((jc.conditions && jc.conditions.length > 0)
                            ? jc.conditions
                            : (jc.primaryColumn && jc.secondaryColumn)
                                ? [{ primaryColumn: jc.primaryColumn, secondaryColumn: jc.secondaryColumn }]
                                : (jc.leftColumn && jc.rightColumn)
                                    ? [{ primaryColumn: jc.leftColumn, secondaryColumn: jc.rightColumn }]
                                    : [])
                        : (joinObj.joinConditions?.length > 0
                            ? joinObj.joinConditions.map((c) => ({ primaryColumn: (c.leftColumn ?? "").trim(), secondaryColumn: (c.rightColumn ?? "").trim() })).filter((p) => p.primaryColumn || p.secondaryColumn)
                            : (jc.leftColumn && jc.rightColumn)
                                ? [{ primaryColumn: (jc.leftColumn || "").trim(), secondaryColumn: (jc.rightColumn || "").trim() }]
                                : []);
                    const stripTablePrefix = (col) => (col || "").trim().replace(/^primary\./i, "").replace(/^join_\d+\./i, "").trim();
                    const leftColsFb = joinConditionPairsFb.map((p) => stripTablePrefix(p.primaryColumn || "")).filter(Boolean);
                    const rightColsFb = joinConditionPairsFb.map((p) => stripTablePrefix(p.secondaryColumn || "")).filter(Boolean);
                    const leftCol = leftColsFb[0] ?? "";
                    const rightCol = rightColsFb[0] ?? "";
                    const joinType = (jc.joinType || "INNER").toString().toUpperCase();
                    const secondaryConnId = isStar ? joinObj.joins?.[0]?.secondaryConnectionId : joinObj.secondaryConnectionId;
                    if (!leftTable || !rightTable || leftColsFb.length === 0 || rightColsFb.length !== leftColsFb.length || !secondaryConnId)
                        throw new Error("JOIN con Firebird requiere tabla izquierda, tabla derecha, al menos un par de columnas de enlace y conexión secundaria.");
                    const { data: conn2 } = await supabaseService.from("connections").select("*").eq("id", secondaryConnId).single();
                    if (!conn2)
                        throw new Error(`Conexión secundaria ${secondaryConnId} no encontrada.`);
                    const selectedCols = (body.filter?.columns || []);
                    const leftColumns = selectedCols.filter((c) => /^primary\./i.test(c)).map((c) => c.replace(/^primary\./i, "").trim());
                    const rightColumns = selectedCols.filter((c) => /^join_\d+\./i.test(c)).map((c) => c.replace(/^join_\d+\./i, "").trim());
                    const leftConditions = sqlConditions
                        .filter((c) => /^primary\./i.test(c.column || ""))
                        .map((c) => ({ ...c, column: (c.column || "").replace(/^primary\./i, "").trim() }));
                    const rightConditions = sqlConditions
                        .filter((c) => /^join_\d+\./i.test(c.column || ""))
                        .map((c) => ({ ...c, column: (c.column || "").replace(/^join_\d+\./i, "").trim() }));
                    const rawDateCol = (dateFilter?.column ?? "").trim();
                    const isDateFilterOnRight = /^join_\d+\.\s*/i.test(rawDateCol);
                    const leftDateFilter = !isDateFilterOnRight && rawDateCol ? { ...dateFilter, column: rawDateCol.replace(/^primary\./i, "").trim() } : undefined;
                    const rightDateFilter = isDateFilterOnRight && rawDateCol ? { ...dateFilter, column: rawDateCol.replace(/^join_\d+\.\s*/i, "").trim() } : undefined;
                    const Firebird = require("node-firebird");
                    const fbOpts = {
                        host: conn.db_host || "localhost",
                        port: conn.db_port ? Number(conn.db_port) : 15421,
                        database: conn.db_name,
                        user: conn.db_user,
                        password: password || "",
                        lowercase_keys: false,
                    };
                    const escapeFb = (v) => {
                        if (v == null)
                            return "NULL";
                        if (typeof v === "boolean")
                            return v ? "1" : "0";
                        if (typeof v === "number" && !Number.isNaN(v))
                            return Number.isInteger(v) ? String(v) : `CAST('${v}' AS DOUBLE PRECISION)`;
                        return `'${String(v).replace(/'/g, "''")}'`;
                    };
                    const inlineClauseParams = (clause, params) => {
                        let text = clause;
                        for (const p of params) {
                            const pos = text.indexOf("?");
                            if (pos === -1)
                                break;
                            text = text.slice(0, pos) + escapeFb(p) + text.slice(pos + 1);
                        }
                        return text;
                    };
                    const aliasWhereFirebird = (conds, alias) => {
                        const params = [];
                        const parts = conds
                            .map((c) => ({ ...c, column: (c.column || "").trim() }))
                            .filter((c) => (c.column ?? "").length > 0)
                            .map((c) => {
                            const col = `${alias}.${safePart(c.column || "")}`;
                            switch (c.operator) {
                                case "is null":
                                    return `${col} IS NULL`;
                                case "is not null":
                                    return `${col} IS NOT NULL`;
                                case "contains":
                                    params.push(`%${c.value ?? ""}%`);
                                    return `${col} CONTAINING ?`;
                                case "startsWith":
                                    params.push(`${c.value ?? ""}%`);
                                    return `${col} LIKE ?`;
                                case "endsWith":
                                    params.push(`%${c.value ?? ""}`);
                                    return `${col} LIKE ?`;
                                case "in": {
                                    const list = (c.value ?? "").split(",").map((v) => v.trim()).filter(Boolean);
                                    const qs = list.map(() => "?");
                                    params.push(...list);
                                    return list.length ? `${col} IN (${qs.join(", ")})` : "1=1";
                                }
                                default:
                                    params.push(c.value ?? null);
                                    return `${col} ${c.operator} ?`;
                            }
                        });
                        return { clause: parts.length ? `WHERE ${parts.join(" AND ")}` : "", params };
                    };
                    const isSameFirebirdConnection = String(primaryConnId) === String(secondaryConnId) &&
                        String(conn2.type || "").toLowerCase() === "firebird";
                    const canUseNativeJoin = isSameFirebirdConnection && leftColumns.length > 0 && rightColumns.length > 0;
                    if (canUseNativeJoin) {
                        let db = null;
                        try {
                            db = await withRetry(() => new Promise((resolve, reject) => {
                                Firebird.attach(fbOpts, (err, connection) => {
                                    if (err)
                                        reject(err);
                                    else
                                        resolve(connection);
                                });
                            }), { label: "firebird-attach-native-join" });
                            let offset = 0;
                            for (;;) {
                                const lTable = leftTable.includes(".") ? safePart((leftTable.split(".").pop() || leftTable).trim()) : safePart(leftTable);
                                const rTable = rightTable.includes(".") ? safePart((rightTable.split(".").pop() || rightTable).trim()) : safePart(rightTable);
                                const selectParts = [
                                    ...leftColumns.map((c) => `l.${safePart(c)} AS "primary_${c.replace(/"/g, '""')}"`),
                                    ...rightColumns.map((c) => `r.${safePart(c)} AS "join_0_${c.replace(/"/g, '""')}"`),
                                ];
                                const onClause = leftColsFb.map((_, i) => `l.${safePart(leftColsFb[i])} = r.${safePart(rightColsFb[i])}`).join(" AND ");
                                const { clause: lClause, params: lParams } = aliasWhereFirebird(leftConditions, "l");
                                const { clause: rClause, params: rParams } = aliasWhereFirebird(rightConditions, "r");
                                const { clause: leftDf, params: leftDfParams } = (0, helpers_1.buildDateFilterWhereFragmentFirebird)(leftDateFilter);
                                const { clause: rightDf, params: rightDfParams } = (0, helpers_1.buildDateFilterWhereFragmentFirebird)(rightDateFilter);
                                const whereParts = [];
                                if (lClause)
                                    whereParts.push(lClause.replace(/^WHERE\s+/i, ""));
                                if (rClause)
                                    whereParts.push(rClause.replace(/^WHERE\s+/i, ""));
                                if (leftDf && leftDateFilter?.column) {
                                    const leftDfCol = stripTablePrefix(leftDateFilter.column);
                                    whereParts.push(leftDf.replace(new RegExp(`"${leftDateFilter.column.replace(/"/g, '""')}"`, "g"), `l.${safePart(leftDfCol)}`));
                                }
                                if (rightDf && rightDateFilter?.column) {
                                    const rightDfCol = stripTablePrefix(rightDateFilter.column);
                                    whereParts.push(rightDf.replace(new RegExp(`"${rightDateFilter.column.replace(/"/g, '""')}"`, "g"), `r.${safePart(rightDfCol)}`));
                                }
                                const whereClause = whereParts.length ? ` WHERE ${whereParts.join(" AND ")}` : "";
                                const sql = `SELECT FIRST ${pageSize} SKIP ${offset} ${selectParts.join(", ")} FROM ${lTable} l ${joinType} JOIN ${rTable} r ON ${onClause}${whereClause}`;
                                const sqlInlined = inlineClauseParams(sql, [...lParams, ...rParams, ...leftDfParams, ...rightDfParams]);
                                const rows = await withRetry(() => new Promise((resolve, reject) => {
                                    db.query(sqlInlined, [], (err, r) => {
                                        if (err)
                                            reject(err);
                                        else
                                            resolve(r || []);
                                    });
                                }), { label: "firebird-native-join-query" });
                                const normalized = rows.map(normalizeRow);
                                if (normalized.length === 0)
                                    break;
                                yield normalized;
                                offset += pageSize;
                            }
                        }
                        finally {
                            if (db?.detach)
                                db.detach(() => { });
                        }
                        return;
                    }
                    const leftTablePart = leftTable.includes(".") ? (leftTable.split(".").pop() || leftTable).trim().toUpperCase() : safePart(leftTable);
                    const rightTablePart = rightTable.includes(".") ? (rightTable.split(".").pop() || rightTable).trim().toUpperCase() : safePart(rightTable);
                    const leftColNorm = leftCol.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase();
                    const rightColNorm = rightCol.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase();
                    const { clause: leftClause, params: leftParams } = (0, helpers_1.buildWhereClauseFirebird)(leftConditions);
                    const { clause: leftDfClause, params: leftDfParams } = (0, helpers_1.buildDateFilterWhereFragmentFirebird)(leftDateFilter);
                    const mergedLeftClause = leftDfClause ? (leftClause ? `${leftClause} AND ${leftDfClause}` : `WHERE ${leftDfClause}`) : leftClause;
                    const mergedLeftParams = [...leftParams, ...leftDfParams];
                    const normColFb = (c) => (c || "").replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase();
                    const getRowValFb = (row, col) => row[normColFb(col)] ?? row[col];
                    const compositeKeySep = "\u0001";
                    const compositeKeyFb = (row, cols) => cols.map((c) => String(getRowValFb(row, c) ?? "")).join(compositeKeySep);
                    const COMPOSITE_KEYSET_BATCH = 100;
                    const rightKeyQuery = async (compositeKeys) => {
                        if (compositeKeys.length === 0)
                            return [];
                        const isSingleCol = rightColsFb.length <= 1;
                        if (isSingleCol) {
                            const keys = compositeKeys;
                            const escapedList = keys.map((k) => escapeFb(k)).join(", ");
                            const rightKeyCond = { column: rightCol, operator: "in", value: keys.join(",") };
                            const allRightConditions = [...rightConditions, rightKeyCond];
                            const { clause: rClause, params: rParams } = (0, helpers_1.buildWhereClauseFirebird)(allRightConditions);
                            const { clause: rDfClause, params: rDfParams } = (0, helpers_1.buildDateFilterWhereFragmentFirebird)(rightDateFilter);
                            const mergedRightClause = rDfClause ? (rClause ? `${rClause} AND ${rDfClause}` : `WHERE ${rDfClause}`) : rClause;
                            const mergedRightParams = [...rParams, ...rDfParams];
                            if (String(conn2.type || "").toLowerCase() === "firebird") {
                                const pwd2 = conn2.db_password_encrypted ? (0, connection_secret_1.decryptConnectionPassword)(conn2.db_password_encrypted) : conn2.db_password ?? "";
                                const opts2 = { host: conn2.db_host || "localhost", port: conn2.db_port ? Number(conn2.db_port) : 15421, database: conn2.db_name, user: conn2.db_user, password: pwd2 || "", lowercase_keys: false };
                                return new Promise((resolve, reject) => {
                                    Firebird.attach(opts2, (err, db2) => {
                                        if (err)
                                            return reject(err);
                                        const cols = rightColumns.length ? rightColumns.map((c) => safePart(c)).join(", ") : "*";
                                        let sql = `SELECT FIRST ${limits_1.ETL_MAX_ROWS_CEILING} ${cols} FROM ${rightTablePart} ${mergedRightClause}`.trim();
                                        sql = inlineClauseParams(sql, mergedRightParams);
                                        if (!/IN\s*\(/i.test(sql)) {
                                            sql = `${sql}${mergedRightClause ? " AND" : " WHERE"} ${safePart(rightCol)} IN (${escapedList})`;
                                        }
                                        db2.query(sql, [], (qerr, rows) => {
                                            if (db2?.detach)
                                                try {
                                                    db2.detach(() => { });
                                                }
                                                catch (_) { }
                                            if (qerr)
                                                return reject(qerr);
                                            resolve((rows || []).map(normalizeRow));
                                        });
                                    });
                                });
                            }
                            const pwdPg = conn2.db_password_encrypted ? (0, connection_secret_1.decryptConnectionPassword)(conn2.db_password_encrypted) : conn2.db_password ?? "";
                            const pgClient = new pg_1.Client({
                                host: conn2.db_host ?? undefined,
                                user: conn2.db_user ?? undefined,
                                database: conn2.db_name ?? undefined,
                                port: conn2.db_port ?? 5432,
                                password: pwdPg || undefined,
                                connectionTimeoutMillis: 15000,
                                statement_timeout: 600000,
                            });
                            await pgClient.connect();
                            try {
                                const sel = rightColumns.length ? rightColumns.map((c) => (0, helpers_1.quoteIdent)(c)).join(", ") : "*";
                                const q = `SELECT ${sel} FROM ${(0, helpers_1.quoteQualified)(rightTable)} WHERE ${(0, helpers_1.quoteIdent)(rightCol)} = ANY($1::text[])`;
                                const res = await pgClient.query(q, [compositeKeys]);
                                return (res.rows || []).map(normalizeRow);
                            }
                            finally {
                                await pgClient.end();
                            }
                        }
                        const tuples = compositeKeys.map((k) => k.split(compositeKeySep));
                        const { clause: rClause0, params: rParams0 } = (0, helpers_1.buildWhereClauseFirebird)(rightConditions);
                        const { clause: rDfClause0, params: rDfParams0 } = (0, helpers_1.buildDateFilterWhereFragmentFirebird)(rightDateFilter);
                        const mergedRightClause0 = rDfClause0 ? (rClause0 ? `${rClause0} AND ${rDfClause0}` : `WHERE ${rDfClause0}`) : rClause0;
                        const mergedRightParams0 = [...rParams0, ...rDfParams0];
                        const allRows = [];
                        for (let t = 0; t < tuples.length; t += COMPOSITE_KEYSET_BATCH) {
                            const batch = tuples.slice(t, t + COMPOSITE_KEYSET_BATCH);
                            const orParts = batch.map((vals) => rightColsFb.map((col, i) => `${safePart(col)} = ${escapeFb(vals[i] ?? "")}`).join(" AND ")).join(" OR ");
                            const extraWhere = orParts ? (mergedRightClause0 ? ` AND (${orParts})` : ` WHERE (${orParts})`) : "";
                            let sql = `SELECT FIRST ${limits_1.ETL_MAX_ROWS_CEILING} ${rightColumns.length ? rightColumns.map((c) => safePart(c)).join(", ") : "*"} FROM ${rightTablePart} ${mergedRightClause0}`.trim();
                            sql = inlineClauseParams(sql, mergedRightParams0);
                            sql = sql + extraWhere;
                            if (String(conn2.type || "").toLowerCase() === "firebird") {
                                const pwd2 = conn2.db_password_encrypted ? (0, connection_secret_1.decryptConnectionPassword)(conn2.db_password_encrypted) : conn2.db_password ?? "";
                                const opts2 = { host: conn2.db_host || "localhost", port: conn2.db_port ? Number(conn2.db_port) : 15421, database: conn2.db_name, user: conn2.db_user, password: pwd2 || "", lowercase_keys: false };
                                const rows = await new Promise((resolve, reject) => {
                                    Firebird.attach(opts2, (err, db2) => {
                                        if (err)
                                            return reject(err);
                                        db2.query(sql, [], (qerr, r) => {
                                            if (db2?.detach)
                                                try {
                                                    db2.detach(() => { });
                                                }
                                                catch (_) { }
                                            if (qerr)
                                                return reject(qerr);
                                            resolve((r || []).map(normalizeRow));
                                        });
                                    });
                                });
                                allRows.push(...rows);
                            }
                            else {
                                const pwdPg = conn2.db_password_encrypted ? (0, connection_secret_1.decryptConnectionPassword)(conn2.db_password_encrypted) : conn2.db_password ?? "";
                                const pgClient = new pg_1.Client({
                                    host: conn2.db_host ?? undefined,
                                    user: conn2.db_user ?? undefined,
                                    database: conn2.db_name ?? undefined,
                                    port: conn2.db_port ?? 5432,
                                    password: pwdPg || undefined,
                                    connectionTimeoutMillis: 15000,
                                    statement_timeout: 600000,
                                });
                                await pgClient.connect();
                                try {
                                    const flatParams = batch.flatMap((vals) => vals);
                                    const placeholders = batch.map((_, bi) => rightColsFb.map((_, i) => `$${bi * rightColsFb.length + i + 1}`).join(", ")).map((p) => `(${p})`).join(", ");
                                    const sel = rightColumns.length ? rightColumns.map((c) => (0, helpers_1.quoteIdent)(c)).join(", ") : "*";
                                    const q = `SELECT ${sel} FROM ${(0, helpers_1.quoteQualified)(rightTable)} WHERE (${rightColsFb.map((c, i) => (0, helpers_1.quoteIdent)(c)).join(", ")}) IN (${placeholders})`;
                                    const res = await pgClient.query(q, flatParams);
                                    allRows.push(...(res.rows || []).map(normalizeRow));
                                }
                                finally {
                                    await pgClient.end();
                                }
                            }
                        }
                        return allRows;
                    };
                    let db = null;
                    try {
                        db = await withRetry(() => new Promise((resolve, reject) => {
                            Firebird.attach(fbOpts, (err, connection) => {
                                if (err)
                                    reject(err);
                                else
                                    resolve(connection);
                            });
                        }), { label: "firebird-attach-join-keyset" });
                        let offset = 0;
                        for (;;) {
                            const leftSql = inlineClauseParams(`SELECT FIRST ${pageSize} SKIP ${offset} * FROM ${leftTablePart} ${mergedLeftClause}`, mergedLeftParams);
                            const leftRows = await withRetry(() => new Promise((resolve, reject) => {
                                db.query(leftSql, [], (err, r) => {
                                    if (err)
                                        reject(err);
                                    else
                                        resolve(r || []);
                                });
                            }), { label: "firebird-left-batch-keyset" });
                            const leftNorm = leftRows.map(normalizeRow);
                            if (leftNorm.length === 0)
                                break;
                            const uniqueKeys = Array.from(new Set(leftNorm.map((lr) => compositeKeyFb(lr, leftColsFb)).filter(Boolean)));
                            const rightMap = new Map();
                            for (let i = 0; i < uniqueKeys.length; i += JOIN_KEYSET_SIZE) {
                                const chunkKeys = uniqueKeys.slice(i, i + JOIN_KEYSET_SIZE);
                                const rightRowsChunk = await rightKeyQuery(chunkKeys);
                                for (const rr of rightRowsChunk) {
                                    const key = compositeKeyFb(rr, rightColsFb);
                                    if (!rightMap.has(key))
                                        rightMap.set(key, []);
                                    rightMap.get(key).push(rr);
                                }
                            }
                            const leftKeys = leftColumns.length ? leftColumns.map((c) => normColFb(c)) : (leftNorm[0] ? Object.keys(leftNorm[0]) : []);
                            const rightKeys = rightColumns.length ? rightColumns.map((c) => normColFb(c)) : [];
                            const batch = [];
                            for (const lr of leftNorm) {
                                const key = compositeKeyFb(lr, leftColsFb);
                                const matches = rightMap.get(key) ?? [];
                                if (matches.length > 0) {
                                    for (const rr of matches) {
                                        const out = {};
                                        for (const lk of leftKeys)
                                            out["primary_" + lk] = lr[lk];
                                        if (rightKeys.length)
                                            for (const rk of rightKeys)
                                                out["join_0_" + rk] = rr[rk];
                                        else
                                            for (const rk in rr)
                                                out["join_0_" + rk] = rr[rk];
                                        batch.push(out);
                                    }
                                }
                                else if (joinType === "LEFT" || joinType === "FULL") {
                                    const out = {};
                                    for (const lk of leftKeys)
                                        out["primary_" + lk] = lr[lk];
                                    for (const rk of rightKeys)
                                        out["join_0_" + rk] = null;
                                    batch.push(out);
                                }
                            }
                            if (batch.length > 0)
                                yield batch;
                            if (leftNorm.length < pageSize)
                                break;
                            offset += pageSize;
                        }
                    }
                    finally {
                        if (db?.detach)
                            db.detach(() => { });
                    }
                    return;
                }
                const tableToQuery = (body.filter?.table || "").trim();
                if (!tableToQuery)
                    throw new Error("Tabla de origen requerida.");
                const tablePart = tableToQuery.includes(".")
                    ? (tableToQuery.split(".").pop() || tableToQuery).trim().toUpperCase()
                    : safePart(tableToQuery);
                const cols = "*";
                const firebirdConditions = sqlConditions
                    .map((c) => ({
                    ...c,
                    column: (c.column || "").replace(/^primary\./i, "").replace(/^join_\d+\./i, "").trim(),
                }))
                    .filter((c) => (c.column ?? "").length > 0);
                const { clause, params } = (0, helpers_1.buildWhereClauseFirebird)(firebirdConditions);
                const dateFilterFb = dateFilter?.column
                    ? { ...dateFilter, column: (dateFilter.column || "").replace(/^primary\./i, "").trim() }
                    : dateFilter;
                const { clause: dfClause, params: dfParams } = (0, helpers_1.buildDateFilterWhereFragmentFirebird)(dateFilterFb);
                const mergedClause = dfClause ? (clause ? `${clause} AND ${dfClause}` : `WHERE ${dfClause}`) : clause;
                const mergedParams = [...params, ...dfParams];
                const Firebird = require("node-firebird");
                const opts = {
                    host: conn.db_host || "localhost",
                    port: conn.db_port ? Number(conn.db_port) : 15421,
                    database: conn.db_name,
                    user: conn.db_user,
                    password: password || "",
                    lowercase_keys: false,
                };
                let offset = 0;
                let db = null;
                try {
                    db = await withRetry(() => new Promise((resolve, reject) => {
                        Firebird.attach(opts, (err, connection) => {
                            if (err)
                                reject(err);
                            else
                                resolve(connection);
                        });
                    }), { label: "firebird-attach" });
                    for (;;) {
                        const sql = offset === 0
                            ? `SELECT FIRST ${pageSize} ${cols} FROM ${tablePart} ${mergedClause}`
                            : `SELECT FIRST ${pageSize} SKIP ${offset} ${cols} FROM ${tablePart} ${mergedClause}`;
                        const rows = await withRetry(() => new Promise((resolve, reject) => {
                            db.query(sql, mergedParams, (err, r) => {
                                if (err)
                                    reject(err);
                                else
                                    resolve(r || []);
                            });
                        }), { label: "firebird-query" });
                        const normalized = rows.map(normalizeRow);
                        if (normalized.length === 0)
                            break;
                        yield normalized;
                        if (normalized.length < pageSize)
                            break;
                        offset += pageSize;
                    }
                }
                finally {
                    if (db?.detach)
                        db.detach(() => { });
                }
                return;
            }
            const secondaryConnIdForCrossDb = isJoin
                ? (isStarJoin
                    ? joinObj.joins?.[0]?.secondaryConnectionId
                    : joinObj.secondaryConnectionId)
                : undefined;
            if (isJoin && secondaryConnIdForCrossDb && String(primaryConnId) !== String(secondaryConnIdForCrossDb)) {
                const { data: conn2 } = await supabaseService.from("connections").select("*").eq("id", secondaryConnIdForCrossDb).single();
                if (!conn2)
                    throw new Error(`Conexión secundaria ${secondaryConnIdForCrossDb} no encontrada.`);
                const isStar = isStarJoin && Array.isArray(joinObj.joins) && joinObj.joins.length > 0;
                const leftTable = isStar ? (joinObj.primaryTable || (body.filter?.table || "").trim()) : (joinObj.leftTable || "").trim();
                const rightTable = isStar ? joinObj.joins?.[0]?.secondaryTable ?? "" : (joinObj.rightTable || "").trim();
                const jc = isStar ? joinObj.joins?.[0] ?? {} : (joinObj.joinConditions?.[0] || {});
                const joinConditionPairs = isStar
                    ? ((jc.conditions && jc.conditions.length > 0)
                        ? jc.conditions
                        : (jc.primaryColumn && jc.secondaryColumn)
                            ? [{ primaryColumn: jc.primaryColumn, secondaryColumn: jc.secondaryColumn }]
                            : (jc.leftColumn && jc.rightColumn)
                                ? [{ primaryColumn: jc.leftColumn, secondaryColumn: jc.rightColumn }]
                                : [])
                    : (joinObj.joinConditions?.length > 0
                        ? joinObj.joinConditions.map((c) => ({ primaryColumn: (c.leftColumn ?? "").trim(), secondaryColumn: (c.rightColumn ?? "").trim() })).filter((p) => p.primaryColumn || p.secondaryColumn)
                        : (jc.leftColumn && jc.rightColumn)
                            ? [{ primaryColumn: (jc.leftColumn || "").trim(), secondaryColumn: (jc.rightColumn || "").trim() }]
                            : []);
                const leftCols = joinConditionPairs.map((p) => (p.primaryColumn || "").trim()).filter(Boolean);
                const rightCols = joinConditionPairs.map((p) => (p.secondaryColumn || "").trim()).filter(Boolean);
                const joinType = (jc.joinType || "INNER").toString().toUpperCase();
                const selectedCols = (body.filter?.columns || []);
                const leftColumns = selectedCols.filter((c) => /^primary\./i.test(c)).map((c) => c.replace(/^primary\./i, "").trim());
                const rightColumns = selectedCols.filter((c) => /^join_\d+\./i.test(c)).map((c) => c.replace(/^join_\d+\./i, "").trim());
                const leftConditions = sqlConditions
                    .filter((c) => /^primary\./i.test(c.column || ""))
                    .map((c) => ({ ...c, column: (c.column || "").replace(/^primary\./i, "").trim() }));
                const rightConditions = sqlConditions
                    .filter((c) => /^join_\d+\./i.test(c.column || ""))
                    .map((c) => ({ ...c, column: (c.column || "").replace(/^join_\d+\./i, "").trim() }));
                if (!leftTable || !rightTable || leftCols.length === 0 || rightCols.length !== leftCols.length)
                    throw new Error("JOIN entre conexiones distintas requiere tabla izquierda, derecha y al menos un par de columnas de enlace.");
                const normalizeRowCrossDb = (row) => {
                    const out = {};
                    for (const k in row)
                        out[k.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase()] = row[k];
                    return out;
                };
                const normCol = (c) => (c || "").replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase();
                const getRowVal = (row, col) => row[normCol(col)] ?? row[col];
                const COMPOSITE_KEY_SEP = "\u0001";
                const compositeKey = (row, cols) => cols.map((c) => String(getRowVal(row, c) ?? "")).join(COMPOSITE_KEY_SEP);
                const createCrossDbClient = async (connection) => {
                    const connType = (connection.type || "").toLowerCase();
                    const pwd = connection.db_password_encrypted
                        ? (0, connection_secret_1.decryptConnectionPassword)(connection.db_password_encrypted)
                        : (connection.db_password ?? "");
                    if (connType === "postgres" || connType === "postgresql") {
                        const c = new pg_1.Client({
                            host: connection.db_host, user: connection.db_user,
                            database: connection.db_name, port: connection.db_port ?? 5432,
                            password: pwd || undefined,
                            connectionTimeoutMillis: 15000, statement_timeout: 600000,
                        });
                        await c.connect();
                        return { client: c, resolvedTable: "" };
                    }
                    if (connType === "excel_file") {
                        const dbUrl = (0, internal_db_url_1.getInternalDbUrl)();
                        if (!dbUrl)
                            throw new Error("DATABASE_URL no disponible para JOIN con Excel.");
                        const { data: meta } = await supabaseService
                            .from("data_tables")
                            .select("physical_schema_name, physical_table_name")
                            .eq("connection_id", String(connection.id))
                            .single();
                        if (!meta?.physical_table_name)
                            throw new Error("Metadatos Excel no encontrados para la conexión secundaria.");
                        const physicalTable = `${meta.physical_schema_name || "data_warehouse"}.${meta.physical_table_name}`;
                        const c = new pg_1.Client({ connectionString: dbUrl, connectionTimeoutMillis: 15000, statement_timeout: 600000 });
                        await c.connect();
                        return { client: c, resolvedTable: physicalTable };
                    }
                    throw new Error(`JOIN entre conexiones: tipo "${connection.type}" no soportado.`);
                };
                const queryCrossDb = async (pgClient, tableName, columns, conditions, limit, offset, dateFilter) => {
                    const { clause: condClause, params: condParams } = (0, helpers_1.buildWhereClausePg)(conditions);
                    const { clause: dfClause, params: dfParams } = (0, helpers_1.buildDateFilterWhereFragmentPg)(dateFilter, condParams.length + 1);
                    const clause = dfClause ? (condClause ? `${condClause} AND ${dfClause}` : `WHERE ${dfClause}`) : condClause;
                    const params = [...condParams, ...dfParams];
                    const sel = columns?.length ? columns.map((c) => (0, helpers_1.quoteIdent)(c)).join(", ") : "*";
                    const limitVal = limit ?? limits_1.ETL_MAX_ROWS_CEILING;
                    const offsetVal = offset ?? 0;
                    const q = `SELECT ${sel} FROM ${(0, helpers_1.quoteQualified)(tableName)} ${clause}  LIMIT ${limitVal} OFFSET ${offsetVal}`;
                    const res = await pgClient.query(q, params);
                    return (res.rows || []).map(normalizeRowCrossDb);
                };
                const resolveRightColCase = (col) => rightColumns.find((rc) => rc.toUpperCase() === (col || "").trim().toUpperCase()) ?? (col || "").trim();
                const dateFilterCol = (dateFilter?.column ?? "").trim();
                const isDateFilterOnRight = /^join_\d+\.\s*/i.test(dateFilterCol);
                const dateFilterForRight = dateFilter?.column && isDateFilterOnRight
                    ? { ...dateFilter, column: resolveRightColCase(dateFilterCol.replace(/^join_\d+\.\s*/i, "").trim()) }
                    : undefined;
                const leftDateFilter = dateFilter && !isDateFilterOnRight && dateFilterCol
                    ? { ...dateFilter, column: dateFilterCol.replace(/^primary\./i, "").trim() }
                    : undefined;
                const { client: rightClient, resolvedTable: rightResolvedTable } = await createCrossDbClient(conn2);
                const rightTableQ = rightResolvedTable || rightTable;
                const { client: leftClient, resolvedTable: leftResolvedTable } = await createCrossDbClient(conn);
                const leftTableQ = leftResolvedTable || leftTable;
                try {
                    const rightMap = new Map();
                    let rightSampleRow;
                    let rightOffset = 0;
                    for (;;) {
                        const rightBatch = await queryCrossDb(rightClient, rightTableQ, rightColumns.length ? rightColumns : undefined, rightConditions, pageSize, rightOffset, dateFilterForRight);
                        for (const r of rightBatch) {
                            if (!rightSampleRow)
                                rightSampleRow = r;
                            const key = compositeKey(r, rightCols);
                            if (!rightMap.has(key))
                                rightMap.set(key, []);
                            rightMap.get(key).push(r);
                        }
                        if (rightBatch.length < pageSize)
                            break;
                        rightOffset += pageSize;
                    }
                    const rightKeys = rightColumns.length ? rightColumns.map((c) => normCol(c)) : (rightSampleRow ? Object.keys(rightSampleRow) : []);
                    const prefixLeft = (row) => {
                        const out = {};
                        const leftKeys = leftColumns.length ? leftColumns.map((c) => normCol(c)) : Object.keys(row);
                        if (leftKeys.length)
                            for (const k of leftKeys)
                                out["primary_" + k] = row[k];
                        else
                            for (const key in row)
                                out["primary_" + key] = row[key];
                        return out;
                    };
                    const prefixRight = (row) => {
                        const out = {};
                        if (rightKeys.length)
                            for (const k of rightKeys)
                                out["join_0_" + k] = row[k];
                        else
                            for (const key in row)
                                out["join_0_" + key] = row[key];
                        return out;
                    };
                    let leftOffset = 0;
                    for (;;) {
                        const leftNorm = await queryCrossDb(leftClient, leftTableQ, leftColumns.length ? leftColumns : undefined, leftConditions, pageSize, leftOffset, leftDateFilter);
                        if (leftNorm.length === 0)
                            break;
                        const batch = [];
                        for (const lr of leftNorm) {
                            const key = compositeKey(lr, leftCols);
                            const matches = rightMap.get(key) ?? [];
                            if (matches.length > 0) {
                                for (const rr of matches)
                                    batch.push({ ...prefixLeft(lr), ...prefixRight(rr) });
                            }
                            else if ((joinType === "LEFT" || joinType === "FULL") && !isDateFilterOnRight) {
                                const rightNulls = {};
                                for (const k of rightKeys)
                                    rightNulls["join_0_" + k] = null;
                                if (!rightKeys.length && rightSampleRow)
                                    for (const key in rightSampleRow)
                                        rightNulls["join_0_" + key] = null;
                                batch.push({ ...prefixLeft(lr), ...rightNulls });
                            }
                        }
                        if (batch.length > 0)
                            yield batch;
                        if (leftNorm.length < pageSize)
                            break;
                        leftOffset += pageSize;
                    }
                }
                finally {
                    await rightClient.end().catch(() => { });
                    await leftClient.end().catch(() => { });
                }
                return;
            }
            let client;
            if (conn.type === "excel_file") {
                const dbUrl = (0, internal_db_url_1.getInternalDbUrl)();
                if (!dbUrl)
                    throw new Error("DATABASE_URL no disponible.");
                client = new pg_1.Client({ connectionString: dbUrl, connectionTimeoutMillis: 15000, statement_timeout: 600000 });
            }
            else if (conn.type === "postgres" || conn.type === "postgresql") {
                const password = conn.db_password_encrypted
                    ? (0, connection_secret_1.decryptConnectionPassword)(conn.db_password_encrypted)
                    : undefined;
                client = new pg_1.Client({
                    host: conn.db_host || undefined,
                    user: conn.db_user || undefined,
                    database: conn.db_name || undefined,
                    port: conn.db_port ?? 5432,
                    password: password || undefined,
                    connectionTimeoutMillis: 15000,
                    statement_timeout: 600000,
                });
            }
            else {
                throw new Error(`Tipo de conexión no soportado: ${conn.type}.`);
            }
            await withRetry(() => client.connect(), { label: "db-connect" });
            try {
                let baseQuery;
                let queryParams = [];
                const castMap = new Map();
                if (body.cast?.conversions) {
                    for (const cv of body.cast.conversions) {
                        castMap.set(cv.column, cv);
                    }
                }
                if (isJoin) {
                    const star = joinObj;
                    if (!isStarJoin) {
                        const { leftTable, rightTable, joinConditions, leftColumns, rightColumns } = joinObj;
                        const mappedConds = sqlConditions.map((c) => {
                            const col = c.column || "";
                            let mapped = col.replace(/^primary\./i, "left.");
                            mapped = mapped.replace(/^join_\d+\./i, "right.");
                            return { ...c, column: mapped };
                        });
                        if (conn.type === "excel_file") {
                            const resolvePhysical = async (connId) => {
                                const { data: meta } = await supabaseService
                                    .from("data_tables")
                                    .select("physical_schema_name, physical_table_name")
                                    .eq("connection_id", String(connId))
                                    .single();
                                if (!meta)
                                    throw new Error("Metadatos no encontrados");
                                return `${meta.physical_schema_name || "data_warehouse"}.${meta.physical_table_name}`;
                            };
                            const lPhys = await resolvePhysical(joinObj.connectionId);
                            const rPhys = await resolvePhysical(joinObj.secondaryConnectionId);
                            const lQ = (0, helpers_1.quoteQualified)(lPhys);
                            const rQ = (0, helpers_1.quoteQualified)(rPhys);
                            const selectParts = [];
                            if (leftColumns?.length)
                                leftColumns.forEach((c) => selectParts.push(`l.${(0, helpers_1.quoteIdent)(c)} AS "primary_${c.replace(/"/g, '""')}"`));
                            else
                                selectParts.push("l.*");
                            if (rightColumns?.length)
                                rightColumns.forEach((c) => selectParts.push(`r.${(0, helpers_1.quoteIdent)(c)} AS "join_0_${c.replace(/"/g, '""')}"`));
                            else
                                selectParts.push("r.*");
                            const joinClause = (0, helpers_1.buildJoinClauseBinary)(joinConditions, "postgres", rQ);
                            const { clause: mcClause, params: mcParams } = (0, helpers_1.buildWhereClausePg)(mappedConds);
                            const rawDateColBin = (dateFilter?.column ?? "").trim();
                            const isDateOnRightBin = /^join_\d+\.\s*/i.test(rawDateColBin);
                            const binaryDateFilter = !dateFilter ? undefined : rawDateColBin
                                ? { ...dateFilter, column: isDateOnRightBin ? rawDateColBin.replace(/^join_\d+\.\s*/i, "").trim() : rawDateColBin.replace(/^primary\./i, "").trim() }
                                : dateFilter;
                            const binaryDatePrefix = isDateOnRightBin ? "r." : "l.";
                            const { clause: dfClause, params: dfParams } = (0, helpers_1.buildDateFilterWhereFragmentPg)(binaryDateFilter, mcParams.length + 1, binaryDatePrefix);
                            const clause = dfClause ? (mcClause ? `${mcClause} AND ${dfClause}` : `WHERE ${dfClause}`) : mcClause;
                            const params = [...mcParams, ...dfParams];
                            baseQuery = `SELECT ${selectParts.join(", ")} FROM ${lQ} AS l ${joinClause} ${clause}`;
                            queryParams = params;
                        }
                        else {
                            const lQ = (0, helpers_1.quoteQualified)(leftTable);
                            const rQ = (0, helpers_1.quoteQualified)(rightTable);
                            const selectParts = [];
                            if (leftColumns?.length)
                                leftColumns.forEach((c) => selectParts.push(`l.${(0, helpers_1.quoteIdent)(c)} AS "primary_${c.replace(/"/g, '""')}"`));
                            else
                                selectParts.push("l.*");
                            if (rightColumns?.length)
                                rightColumns.forEach((c) => selectParts.push(`r.${(0, helpers_1.quoteIdent)(c)} AS "join_0_${c.replace(/"/g, '""')}"`));
                            else
                                selectParts.push("r.*");
                            const joinClause = (0, helpers_1.buildJoinClauseBinary)(joinConditions, "postgres", rQ);
                            const { clause: mcClause2, params: mcParams2 } = (0, helpers_1.buildWhereClausePg)(mappedConds);
                            const rawDateColBin2 = (dateFilter?.column ?? "").trim();
                            const isDateOnRightBin2 = /^join_\d+\.\s*/i.test(rawDateColBin2);
                            const binaryDateFilter2 = !dateFilter ? undefined : rawDateColBin2
                                ? { ...dateFilter, column: isDateOnRightBin2 ? rawDateColBin2.replace(/^join_\d+\.\s*/i, "").trim() : rawDateColBin2.replace(/^primary\./i, "").trim() }
                                : dateFilter;
                            const binaryDatePrefix2 = isDateOnRightBin2 ? "r." : "l.";
                            const { clause: dfClause2, params: dfParams2 } = (0, helpers_1.buildDateFilterWhereFragmentPg)(binaryDateFilter2, mcParams2.length + 1, binaryDatePrefix2);
                            const clause2 = dfClause2 ? (mcClause2 ? `${mcClause2} AND ${dfClause2}` : `WHERE ${dfClause2}`) : mcClause2;
                            const params2 = [...mcParams2, ...dfParams2];
                            baseQuery = `SELECT ${selectParts.join(", ")} FROM ${lQ} AS l ${joinClause} ${clause2}`;
                            queryParams = params2;
                        }
                    }
                    else {
                        const { data: pConn } = await supabaseService.from("connections").select("*").eq("id", String(star.primaryConnectionId)).single();
                        const dbType = (pConn?.type || "postgres").toLowerCase();
                        const selectedCols = body.filter?.columns || [];
                        const primarySelected = selectedCols.filter(c => c.startsWith("primary.")).map(c => c.slice("primary.".length));
                        const joinsSelected = {};
                        (star.joins || []).forEach((jn, idx) => {
                            const prefix = `join_${idx}.`;
                            const arr = selectedCols.filter(c => c.startsWith(prefix)).map(c => c.slice(prefix.length));
                            if (arr.length) {
                                joinsSelected[jn.id] = arr;
                                joinsSelected[`join_${idx}`] = arr;
                            }
                        });
                        if (dbType === "excel_file") {
                            const internalClient = new pg_1.Client({ connectionString: (0, internal_db_url_1.getInternalDbUrl)(), connectionTimeoutMillis: 15000, statement_timeout: 600000 });
                            await internalClient.connect();
                            try {
                                const resolvePhysical = async (connId, tableSelection) => {
                                    const { data: metaRows } = await supabaseService
                                        .from("data_tables")
                                        .select("physical_schema_name, physical_table_name, table_name")
                                        .eq("connection_id", String(connId));
                                    const rows = (0, excel_metadata_1.normalizeExcelDataTableRows)(metaRows);
                                    return (0, excel_metadata_1.resolveExcelQualifiedTableFromRows)(String(connId), tableSelection, rows, internal_db_url_1.EXCEL_PHYSICAL_SCHEMA);
                                };
                                const pPhys = await resolvePhysical(star.primaryConnectionId, star.primaryTable);
                                const jPhyss = await Promise.all((star.joins || []).map((jn) => resolvePhysical(jn.secondaryConnectionId, jn.secondaryTable)));
                                const pQ = (0, helpers_1.quoteQualified)(pPhys);
                                const jQs = jPhyss.map(q => (0, helpers_1.quoteQualified)(q));
                                const selectParts = [];
                                if (primarySelected.length)
                                    primarySelected.forEach(col => selectParts.push(`p.${(0, helpers_1.quoteIdent)(col)} AS "primary_${col.replace(/"/g, '""')}"`));
                                else
                                    selectParts.push("p.*");
                                for (let idx = 0; idx < (star.joins || []).length; idx++) {
                                    const jn = star.joins[idx];
                                    let secCols = joinsSelected[jn.id] || joinsSelected[`join_${idx}`] || jn.secondaryColumns || [];
                                    if (secCols.length === 0 && jPhyss[idx]) {
                                        try {
                                            const qual = jPhyss[idx];
                                            const [schema, table] = qual.includes(".") ? qual.split(".", 2) : ["data_warehouse", qual];
                                            const colsRes = await internalClient.query("SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 ORDER BY ordinal_position", [schema, table]);
                                            secCols = (colsRes.rows || []).map((r) => String(r.column_name ?? ""));
                                        }
                                        catch {
                                        }
                                    }
                                    if (secCols.length)
                                        secCols.forEach((col) => selectParts.push(`j${idx}.${(0, helpers_1.quoteIdent)(col)} AS "join_${idx}_${col.replace(/"/g, '""')}"`));
                                    else
                                        selectParts.push(`j${idx}.*`);
                                }
                                let fromJoin = `FROM ${pQ} AS p`;
                                (star.joins || []).forEach((jn, idx) => {
                                    const jt = (jn.joinType || "INNER").toUpperCase();
                                    const pairs = (jn.conditions?.length > 0)
                                        ? jn.conditions
                                        : ((jn.primaryColumn ?? "").trim() || (jn.secondaryColumn ?? "").trim())
                                            ? [{ primaryColumn: (jn.primaryColumn || "").trim(), secondaryColumn: (jn.secondaryColumn || "").trim() }]
                                            : [];
                                    const onClauses = pairs.map(({ primaryColumn: pc, secondaryColumn: sc }) => {
                                        let leftAlias = "p", leftCol = (pc || "").trim();
                                        if (leftCol.includes(".")) {
                                            if (/^primary\./i.test(leftCol)) {
                                                leftCol = leftCol.replace(/^primary\./i, "").trim();
                                            }
                                            else {
                                                const m = leftCol.match(/^join_(\d+)\.(.+)$/i);
                                                if (m) {
                                                    const i = parseInt(m[1], 10);
                                                    if (!Number.isNaN(i) && i >= 0 && i < idx) {
                                                        leftAlias = `j${i}`;
                                                        leftCol = m[2].trim();
                                                    }
                                                }
                                            }
                                        }
                                        return `${leftAlias}.${(0, helpers_1.quoteIdent)(leftCol)} = j${idx}.${(0, helpers_1.quoteIdent)((sc || "").trim())}`;
                                    });
                                    const on = onClauses.length ? onClauses.join(" AND ") : `1=0`;
                                    fromJoin += ` ${jt} JOIN ${jQs[idx]} AS j${idx} ON ${on}`;
                                });
                                const { clause: starClause, params: starParams } = (0, helpers_1.buildWhereClausePgStar)(sqlConditions, (star.joins || []).length, true);
                                const { clause: dfClause, params: dfParams } = (0, helpers_1.buildDateFilterWhereFragmentPg)(dateFilter, starParams.length + 1, "p.", (star.joins || []).length);
                                const mergedClause = dfClause ? (starClause ? `${starClause} AND ${dfClause}` : `WHERE ${dfClause}`) : starClause;
                                const mergedParams = [...starParams, ...dfParams];
                                baseQuery = `SELECT ${selectParts.join(", ")} ${fromJoin} ${mergedClause} `;
                                queryParams = mergedParams;
                            }
                            finally {
                                await internalClient.end();
                            }
                        }
                        else {
                            const pQ = (0, helpers_1.quoteQualified)(star.primaryTable || "");
                            const jQs = (star.joins || []).map((jn) => (0, helpers_1.quoteQualified)(jn.secondaryTable || ""));
                            const selectParts = [];
                            if (primarySelected.length)
                                primarySelected.forEach(col => selectParts.push(`p.${(0, helpers_1.quoteIdent)(col)} AS "primary_${col.replace(/"/g, '""')}"`));
                            else
                                selectParts.push("p.*");
                            for (let idx = 0; idx < (star.joins || []).length; idx++) {
                                const jn = star.joins[idx];
                                let secCols = joinsSelected[jn.id] || joinsSelected[`join_${idx}`] || jn.secondaryColumns || [];
                                if (secCols.length === 0 && jn.secondaryTable) {
                                    try {
                                        const [schema, table] = jn.secondaryTable.includes(".")
                                            ? jn.secondaryTable.split(".", 2)
                                            : ["public", jn.secondaryTable];
                                        const colsRes = await client.query("SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 ORDER BY ordinal_position", [schema, table]);
                                        secCols = (colsRes.rows || []).map((r) => String(r.column_name ?? ""));
                                    }
                                    catch {
                                    }
                                }
                                if (secCols.length)
                                    secCols.forEach((col) => selectParts.push(`j${idx}.${(0, helpers_1.quoteIdent)(col)} AS "join_${idx}_${col.replace(/"/g, '""')}"`));
                                else
                                    selectParts.push(`j${idx}.*`);
                            }
                            let fromJoin = `FROM ${pQ} AS p`;
                            (star.joins || []).forEach((jn, idx) => {
                                const jt = (jn.joinType || "INNER").toUpperCase();
                                const pairs = (jn.conditions?.length > 0)
                                    ? jn.conditions
                                    : ((jn.primaryColumn ?? "").trim() || (jn.secondaryColumn ?? "").trim())
                                        ? [{ primaryColumn: (jn.primaryColumn || "").trim(), secondaryColumn: (jn.secondaryColumn || "").trim() }]
                                        : [];
                                const onClauses = pairs.map(({ primaryColumn: pc, secondaryColumn: sc }) => {
                                    let leftAlias = "p", leftCol = (pc || "").trim();
                                    if (leftCol.includes(".")) {
                                        if (/^primary\./i.test(leftCol)) {
                                            leftCol = leftCol.replace(/^primary\./i, "").trim();
                                        }
                                        else {
                                            const m = leftCol.match(/^join_(\d+)\.(.+)$/i);
                                            if (m) {
                                                const i = parseInt(m[1], 10);
                                                if (!Number.isNaN(i) && i >= 0 && i < idx) {
                                                    leftAlias = `j${i}`;
                                                    leftCol = m[2].trim();
                                                }
                                            }
                                        }
                                    }
                                    return `${leftAlias}.${(0, helpers_1.quoteIdent)(leftCol)} = j${idx}.${(0, helpers_1.quoteIdent)((sc || "").trim())}`;
                                });
                                const on = onClauses.length ? onClauses.join(" AND ") : `1=0`;
                                fromJoin += ` ${jt} JOIN ${jQs[idx]} AS j${idx} ON ${on}`;
                            });
                            const { clause: starClause, params: starParams } = (0, helpers_1.buildWhereClausePgStar)(sqlConditions, (star.joins || []).length, true);
                            const { clause: dfClause, params: dfParams } = (0, helpers_1.buildDateFilterWhereFragmentPg)(dateFilter, starParams.length + 1, "p.", (star.joins || []).length);
                            const mergedClause = dfClause ? (starClause ? `${starClause} AND ${dfClause}` : `WHERE ${dfClause}`) : starClause;
                            const mergedParams = [...starParams, ...dfParams];
                            baseQuery = `SELECT ${selectParts.join(", ")} ${fromJoin} ${mergedClause}`;
                            queryParams = mergedParams;
                        }
                    }
                }
                else {
                    let tableToQuery = body.filter?.table;
                    if (conn.type === "excel_file") {
                        const { data: metaRows } = await supabaseService
                            .from("data_tables")
                            .select("physical_schema_name, physical_table_name, table_name")
                            .eq("connection_id", conn.id);
                        const rows = (0, excel_metadata_1.normalizeExcelDataTableRows)(metaRows);
                        tableToQuery = (0, excel_metadata_1.resolveExcelQualifiedTableFromRows)(String(conn.id), (tableToQuery || "").trim() || undefined, rows, internal_db_url_1.EXCEL_PHYSICAL_SCHEMA);
                    }
                    if (!tableToQuery)
                        throw new Error("Tabla de origen requerida.");
                    const { columns } = body.filter;
                    const tableQ = (0, helpers_1.quoteQualified)(tableToQuery);
                    const selectList = columns && columns.length ? columns.map(c => {
                        const cv = castMap.get(c);
                        const ident = (0, helpers_1.quoteIdent)(c);
                        if (cv) {
                            if ((cv.targetType === "date" || cv.targetType === "datetime") && cv.inputFormat)
                                return `${ident} AS ${ident}`;
                            return `${pgCastExpr(ident, cv.targetType)} AS ${ident}`;
                        }
                        return ident;
                    }).join(", ") : "*";
                    const { clause: condClause, params: condParams } = (0, helpers_1.buildWhereClausePg)(sqlConditions);
                    const { clause: dfClause, params: dfParams } = (0, helpers_1.buildDateFilterWhereFragmentPg)(dateFilter, condParams.length + 1);
                    const clause = dfClause ? (condClause ? `${condClause} AND ${dfClause}` : `WHERE ${dfClause}`) : condClause;
                    const params = [...condParams, ...dfParams];
                    baseQuery = `SELECT ${selectList} FROM ${tableQ} ${clause} `;
                    queryParams = params;
                }
                await client.query("BEGIN");
                await client.query(`DECLARE etl_cursor NO SCROLL CURSOR FOR ${baseQuery}`, queryParams);
                try {
                    for (;;) {
                        const res = await client.query(`FETCH ${pageSize} FROM etl_cursor`);
                        const rows = res.rows || [];
                        if (rows.length === 0)
                            break;
                        yield rows;
                        if (rows.length < pageSize)
                            break;
                    }
                }
                finally {
                    await client.query("CLOSE etl_cursor").catch(() => { });
                    await client.query("COMMIT").catch(() => { });
                }
            }
            finally {
                await client.end();
            }
        }
        const LOG_UPDATE_EARLY_EVERY = 2000;
        const LOG_UPDATE_EVERY_ROWS = 5000;
        const LOG_UPDATE_EARLY_UNTIL = 20000;
        let lastLoggedRows = 0;
        let batchCounter = 0;
        let totalTransformMs = 0;
        let totalInsertMs = 0;
        let totalFetchWaitMs = 0;
        const gen = dataSourceGenerator();
        let iterResult = await gen.next();
        let rawBatch = iterResult.value;
        while (!iterResult.done && rawBatch != null && !pipelineTimedOut) {
            const batchStartedAt = Date.now();
            if (rawBatch.length === 0) {
                const fetchAt = Date.now();
                iterResult = await gen.next();
                totalFetchWaitMs += Date.now() - fetchAt;
                rawBatch = iterResult.value;
                continue;
            }
            rowsProcessed += rawBatch.length;
            batchCounter += 1;
            const transformStartedAt = Date.now();
            let transformedBatch = rawBatch;
            if (excludeRowsRules.length > 0) {
                transformedBatch = rawBatch.filter((row) => !excludeRowsRules.some(({ column, excluded }) => excluded.includes(String((0, transformations_1.getValue)(row, column) ?? ""))));
            }
            if (body.pipeline?.length) {
                for (const step of body.pipeline) {
                    try {
                        switch (step.type) {
                            case "clean":
                                transformedBatch = (0, transformations_1.applyCleanBatch)(transformedBatch, step.config);
                                break;
                            case "cast":
                                transformedBatch = (0, transformations_1.applyCastConversions)(transformedBatch, step.config);
                                break;
                            case "arithmetic":
                                transformedBatch = (0, transformations_1.applyArithmeticOperations)(transformedBatch, step.config);
                                break;
                            case "condition":
                                transformedBatch = (0, transformations_1.applyConditionRules)(transformedBatch, step.config);
                                break;
                        }
                    }
                    catch (err) {
                        console.error("Pipeline Step Error", err);
                        throw new Error(`Error en paso ${step.type}: ${err.message}`);
                    }
                }
            }
            else {
                transformedBatch = (0, transformations_1.applyCleanBatch)(rawBatch, body?.clean);
                if (body.cast?.conversions?.length)
                    transformedBatch = (0, transformations_1.applyCastConversions)(transformedBatch, body.cast);
                if (body.arithmetic?.operations?.length)
                    transformedBatch = (0, transformations_1.applyArithmeticOperations)(transformedBatch, body.arithmetic);
                if (body.condition?.rules?.length)
                    transformedBatch = (0, transformations_1.applyConditionRules)(transformedBatch, body.condition);
            }
            totalTransformMs += Date.now() - transformStartedAt;
            if (body.count?.attribute) {
                const attr = body.count.attribute;
                for (const row of transformedBatch) {
                    const val = (0, transformations_1.getValue)(row, attr);
                    const key = val == null ? "__NULL__" : String(val);
                    globalCountMap.set(key, (globalCountMap.get(key) || 0) + 1);
                    if (!globalCountOriginalValues.has(key))
                        globalCountOriginalValues.set(key, val);
                }
                iterResult = await gen.next();
                rawBatch = iterResult.value;
                continue;
            }
            if (transformedBatch.length === 0) {
                iterResult = await gen.next();
                rawBatch = iterResult.value;
                continue;
            }
            const insertStartedAt = Date.now();
            const insertPromise = insertBatch(transformedBatch);
            const nextPromise = gen.next();
            await insertPromise;
            totalInsertMs += Date.now() - insertStartedAt;
            const interval = rowsProcessed <= LOG_UPDATE_EARLY_UNTIL ? LOG_UPDATE_EARLY_EVERY : LOG_UPDATE_EVERY_ROWS;
            const shouldUpdate = lastLoggedRows === 0
                ? rowsProcessed > 0
                : rowsProcessed - lastLoggedRows >= interval;
            if (shouldUpdate) {
                try {
                    if (lastLoggedRows === 0) {
                        await (0, run_progress_1.clearEtlRunProgressMessage)(supabaseAdmin, runId);
                    }
                    await supabaseAdmin
                        .from("etl_runs_log")
                        .update({ rows_processed: rowsProcessed })
                        .eq("id", runId);
                    lastLoggedRows = rowsProcessed;
                }
                catch (logErr) {
                    console.warn("[Background] Log update failed (non-fatal):", logErr);
                }
            }
            const waitNextAt = Date.now();
            iterResult = await nextPromise;
            totalFetchWaitMs += Date.now() - waitNextAt;
            rawBatch = iterResult.value;
            if (batchCounter % METRICS_LOG_EVERY_BATCHES === 0) {
                console.log(`[Background Run ${runId}] Perf batches=${batchCounter} rows=${rowsProcessed} ` +
                    `transformMs=${totalTransformMs} insertMs=${totalInsertMs} waitFetchMs=${totalFetchWaitMs} ` +
                    `lastBatchMs=${Date.now() - batchStartedAt}`);
            }
        }
        if (body.count?.attribute) {
            const attr = body.count.attribute;
            const resultColumn = body.count.resultColumn?.trim() || "conteo";
            const finalRows = [];
            for (const [key, cnt] of globalCountMap.entries()) {
                finalRows.push({
                    [attr]: globalCountOriginalValues.get(key),
                    [resultColumn]: cnt
                });
            }
            finalRows.sort((a, b) => (b[resultColumn] || 0) - (a[resultColumn] || 0));
            await insertBatch(finalRows);
        }
        if (rowsProcessed > 0 && rowsProcessed !== lastLoggedRows) {
            try {
                await supabaseAdmin
                    .from("etl_runs_log")
                    .update({ rows_processed: rowsProcessed })
                    .eq("id", runId);
            }
            catch (logErr) {
                console.warn("[Background] Final progress log update failed (non-fatal):", logErr);
            }
        }
        await withRetry(() => supabaseAdmin
            .from("etl_runs_log")
            .update({
            status: "completed",
            completed_at: completedAt(),
            rows_processed: rowsProcessed,
            error_message: null,
        })
            .eq("id", runId)
            .throwOnError(), { label: "update-completed" });
        if (body.etlId && !isPreview) {
            try {
                await supabaseAdmin.from("etl").update({ output_table: newTableName }).eq("id", body.etlId);
            }
            catch (_) { }
            if (body.schedule?.frequency?.trim()) {
                try {
                    await (0, schedule_1.updateEtlScheduleLastRunAt)(supabaseAdmin, body.etlId);
                }
                catch (schedErr) {
                    console.warn(`[Background Run ${runId}] No se pudo actualizar lastRunAt:`, schedErr);
                }
            }
        }
        console.log(`[Background Run ${runId}] Completed successfully. Rows: ${rowsProcessed}`);
        return rowsProcessed;
    }
    catch (err) {
        console.error(`[Background Run ${runId}] Fatal Error:`, err);
        try {
            await ensureRunTerminalState(supabaseAdmin, runId, "failed", {
                completed_at: completedAt(),
                error_message: formatRunError(err),
                rows_processed: rowsProcessed,
            });
        }
        catch (logErr) {
            console.error("Failed to log fatal error to DB:", logErr);
        }
    }
    finally {
        clearTimeout(pipelineTimer);
        if (!pipelineTimedOut) {
            try {
                const { data: row } = await supabaseAdmin
                    .from("etl_runs_log")
                    .select("status")
                    .eq("id", runId)
                    .maybeSingle();
                const status = row?.status;
                if (status === "started" || status === "running") {
                    await ensureRunTerminalState(supabaseAdmin, runId, "failed", {
                        completed_at: completedAt(),
                        error_message: `Ejecución interrumpida o error no registrado (ref=${buildRef})`,
                        rows_processed: rowsProcessed,
                    });
                }
            }
            catch (_) { }
        }
        try {
            await sqlPersistent.end();
        }
        catch (_) { }
        const elapsedMs = Date.now() - pipelineStartedAt;
        console.log(`[Background Run ${runId}] Finished in ${elapsedMs}ms.`);
    }
    return rowsProcessed;
}
//# sourceMappingURL=execute-etl-pipeline.js.map