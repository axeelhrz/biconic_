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
exports.maxDuration = void 0;
exports.POST = POST;
const server_1 = require("next/server");
const internal_db_url_1 = require("../../../../lib/db/internal-db-url");
const promise_1 = __importDefault(require("mysql2/promise"));
const pg_1 = require("pg");
const server_2 = require("../../../../lib/supabase/server");
const service_1 = require("../../../../lib/supabase/service");
const crypto_1 = require("crypto");
const limits_1 = require("../../../../lib/etl/limits");
const helpers_1 = require("../../../../lib/sql/helpers");
const connection_secret_1 = require("../../../../lib/connection-secret");
const backend_config_1 = require("../../../../lib/api/backend-config");
const connections_query_1 = require("../../../../lib/db/connections-query");
const connection_persistence_1 = require("../../../../lib/connection/connection-persistence");
const excel_metadata_1 = require("../../../../lib/excel-import/excel-metadata");
function normalizeFilterColumnRef(ref) {
    const r = (ref || "").trim();
    if (!r)
        return r;
    if (/^(primary\.|join_\d+\.)/i.test(r))
        return r;
    if (/^primary_/i.test(r))
        return "primary." + r.replace(/^primary_/i, "").trim();
    const m = r.match(/^join_(\d+)_\.?(.*)$/i);
    if (m)
        return `join_${m[1]}.${(m[2] || "").trim()}`;
    return r;
}
function getJoinConditionPairs(jn) {
    if (jn.conditions && jn.conditions.length > 0) {
        return jn.conditions.map((c) => ({
            leftColumn: (c.primaryColumn || "").trim(),
            rightColumn: (c.secondaryColumn || "").trim(),
        })).filter((p) => p.leftColumn || p.rightColumn);
    }
    const pc = (jn.primaryColumn || "").trim();
    const sc = (jn.secondaryColumn || "").trim();
    if (pc || sc)
        return [{ leftColumn: pc, rightColumn: sc }];
    return [];
}
function validateStarJoinPayloadInMemory(joins, joinsCount) {
    for (let idx = 0; idx < joinsCount; idx++) {
        const jn = joins[idx];
        const pairs = getJoinConditionPairs(jn);
        if (pairs.length === 0) {
            throw new Error(`Join ${idx}: se requiere al menos una condición de enlace (columnas principal y secundaria).`);
        }
        for (const p of pairs) {
            if (!p.leftColumn || !p.rightColumn) {
                throw new Error(`Join ${idx}: cada condición debe tener columna izquierda y derecha no vacías.`);
            }
            const left = p.leftColumn;
            if (idx > 0) {
                const hasPrimary = /^primary\./i.test(left);
                const joinMatch = left.match(/^join_(\d+)\.(.+)$/i);
                if (joinMatch) {
                    const k = Number(joinMatch[1]);
                    if (Number.isNaN(k) || k < 0 || k >= idx) {
                        throw new Error(`Join ${idx}: la columna izquierda '${left}' debe referir a primary o a un join anterior (join_0 a join_${idx - 1}).`);
                    }
                }
                else if (!hasPrimary) {
                    throw new Error(`Join ${idx}: en multi-join la columna izquierda debe tener prefijo (primary.<col> o join_n.<col>). Recibido: '${left}'.`);
                }
            }
        }
    }
}
function normalizeJoinKeyValue(value) {
    if (value == null)
        return "";
    if (typeof value === "string") {
        const s = value.trim().replace(/\s+/g, " ");
        if (/^\d{4}-\d{2}-\d{2}(T|\s|$)/.test(s))
            return s.slice(0, 10);
        if (/^-?\d+\.\d+$/.test(s)) {
            const normalizedDecimal = s.replace(/(\.\d*?[1-9])0+$/, "$1").replace(/\.0+$/, "");
            return normalizedDecimal === "-0" ? "0" : normalizedDecimal;
        }
        return s;
    }
    if (typeof value === "number" && !Number.isNaN(value))
        return Number.isInteger(value) ? String(value) : String(value);
    if (value instanceof Date && !Number.isNaN(value.getTime()))
        return value.toISOString().slice(0, 10);
    return String(value).trim();
}
function quoteIdent(name, dbType) {
    if (!name)
        return '""';
    return dbType === "postgres"
        ? `"${name.replace(/"/g, '""')}"`
        : `\`${name.replace(/`/g, "``")}\``;
}
function quoteQualified(qname, dbType) {
    if (!qname)
        return '""';
    const parts = qname.split(".");
    if (parts.length === 1)
        return quoteIdent(parts[0], dbType);
    return parts.map((p) => quoteIdent(p, dbType)).join(".");
}
async function getTableColumnsPg(client, qualifiedTable, defaultSchema = "public") {
    const [schema, table] = qualifiedTable.includes(".")
        ? qualifiedTable.split(".", 2)
        : [defaultSchema, qualifiedTable];
    const res = await client.query(`SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 ORDER BY ordinal_position`, [schema, table]);
    return (res.rows || []).map((r) => String(r.column_name ?? ""));
}
function buildJoinClause(joinConditions, dbType, rightTableQualified) {
    const jt = joinConditions[0]?.joinType || "INNER";
    const onExpr = joinConditions
        .map((jc) => {
        const leftColQuoted = quoteIdent(jc.leftColumn, dbType);
        const rightColQuoted = quoteIdent(jc.rightColumn, dbType);
        return `l.${leftColQuoted} = r.${rightColQuoted}`;
    })
        .join(" AND ");
    return `${jt} JOIN ${rightTableQualified} AS r ON ${onExpr}`;
}
function buildWhereClausePg(conds) {
    const params = [];
    const parts = conds.map((c) => {
        let col;
        const lc = c.column || "";
        const mLeft = lc.match(/^(left|l)\.(.+)$/i);
        const mRight = lc.match(/^(right|r)\.(.+)$/i);
        if (mLeft)
            col = `l.${quoteIdent(mLeft[2], "postgres")}`;
        else if (mRight)
            col = `r.${quoteIdent(mRight[2], "postgres")}`;
        else
            col = `"${lc.replace(/"/g, '""')}"`;
        switch (c.operator) {
            case "is null":
                return `${col} IS NULL`;
            case "is not null":
                return `${col} IS NOT NULL`;
            case "contains":
                params.push(`%${c.value ?? ""}%`);
                return `${col} ILIKE $${params.length}`;
            case "startsWith":
                params.push(`${c.value ?? ""}%`);
                return `${col} ILIKE $${params.length}`;
            case "endsWith":
                params.push(`%${c.value ?? ""}`);
                return `${col} ILIKE $${params.length}`;
            case "in": {
                const list = (c.value ?? "").split(",").map((v) => v.trim());
                const idxs = list.map((v) => {
                    params.push(v);
                    return `$${params.length}`;
                });
                return `${col} IN (${idxs.join(", ")})`;
            }
            case "not in": {
                const list = (c.value ?? "").split(",").map((v) => v.trim());
                const idxs = list.map((v) => {
                    params.push(v);
                    return `$${params.length}`;
                });
                return `${col} NOT IN (${idxs.join(", ")})`;
            }
            default: {
                params.push(c.value ?? null);
                return `${col} ${c.operator} $${params.length}`;
            }
        }
    });
    const clause = parts.length ? `WHERE ${parts.join(" AND ")}` : "";
    return { clause, params };
}
function buildWhereClauseMy(conds) {
    const params = [];
    const parts = conds.map((c) => {
        let col;
        const lc = c.column || "";
        const mLeft = lc.match(/^(left|l)\.(.+)$/i);
        const mRight = lc.match(/^(right|r)\.(.+)$/i);
        if (mLeft)
            col = `l.${quoteIdent(mLeft[2], "mysql")}`;
        else if (mRight)
            col = `r.${quoteIdent(mRight[2], "mysql")}`;
        else
            col = `\`${lc.replace(/`/g, "``")}\``;
        switch (c.operator) {
            case "is null":
                return `${col} IS NULL`;
            case "is not null":
                return `${col} IS NOT NULL`;
            case "contains":
                params.push(`%${c.value ?? ""}%`);
                return `${col} LIKE ?`;
            case "startsWith":
                params.push(`${c.value ?? ""}%`);
                return `${col} LIKE ?`;
            case "endsWith":
                params.push(`%${c.value ?? ""}`);
                return `${col} LIKE ?`;
            case "in": {
                const list = (c.value ?? "").split(",").map((v) => v.trim());
                const qs = list.map(() => "?");
                params.push(...list);
                return `${col} IN (${qs.join(", ")})`;
            }
            case "not in": {
                const list = (c.value ?? "").split(",").map((v) => v.trim());
                const qs = list.map(() => "?");
                params.push(...list);
                return `${col} NOT IN (${qs.join(", ")})`;
            }
            default: {
                params.push(c.value ?? null);
                return `${col} ${c.operator} ?`;
            }
        }
    });
    const clause = parts.length ? `WHERE ${parts.join(" AND ")}` : "";
    return { clause, params };
}
function buildWhereClausePgStar(conds, joinsCount) {
    const params = [];
    const parts = conds.map((c) => {
        let col;
        const raw = c.column || "";
        const mPrimary = raw.match(/^primary\.(.+)$/i);
        const mJoin = raw.match(/^join_(\d+)\.(.+)$/i);
        if (mPrimary)
            col = `p.${quoteIdent(mPrimary[1], "postgres")}`;
        else if (mJoin) {
            const idx = Number(mJoin[1]);
            const name = mJoin[2];
            if (Number.isNaN(idx) || idx < 0 || idx >= joinsCount)
                col = `"${raw.replace(/"/g, '""')}"`;
            else
                col = `j${idx}.${quoteIdent(name, "postgres")}`;
        }
        else
            col = `"${raw.replace(/"/g, '""')}"`;
        switch (c.operator) {
            case "is null":
                return `${col} IS NULL`;
            case "is not null":
                return `${col} IS NOT NULL`;
            case "contains":
                params.push(`%${c.value ?? ""}%`);
                return `${col} ILIKE $${params.length}`;
            case "startsWith":
                params.push(`${c.value ?? ""}%`);
                return `${col} ILIKE $${params.length}`;
            case "endsWith":
                params.push(`%${c.value ?? ""}`);
                return `${col} ILIKE $${params.length}`;
            case "in": {
                const list = (c.value ?? "").split(",").map((v) => v.trim());
                const idxs = list.map((v) => {
                    params.push(v);
                    return `$${params.length}`;
                });
                return `${col} IN (${idxs.join(", ")})`;
            }
            case "not in": {
                const list = (c.value ?? "").split(",").map((v) => v.trim());
                const idxs = list.map((v) => {
                    params.push(v);
                    return `$${params.length}`;
                });
                return `${col} NOT IN (${idxs.join(", ")})`;
            }
            default: {
                params.push(c.value ?? null);
                return `${col} ${c.operator} $${params.length}`;
            }
        }
    });
    const clause = parts.length ? `WHERE ${parts.join(" AND ")}` : "";
    return { clause, params };
}
function normalizeStarConditions(conds, joinsCount) {
    return conds.map((c) => {
        const raw = (c.column || "").trim();
        if (/^primary\./i.test(raw))
            return c;
        const m = raw.match(/^join_(\d+)\.(.+)$/i);
        if (m) {
            const idx = Number(m[1]);
            if (!Number.isNaN(idx) && idx >= 0 && idx < joinsCount)
                return c;
        }
        throw new Error(`Filtro inválido '${raw}'. En JOIN use prefijos explícitos (primary.<col> o join_n.<col>).`);
    });
}
function buildWhereClauseMyStar(conds, joinsCount) {
    const params = [];
    const parts = conds.map((c) => {
        let col;
        const raw = c.column || "";
        const mPrimary = raw.match(/^primary\.(.+)$/i);
        const mJoin = raw.match(/^join_(\d+)\.(.+)$/i);
        if (mPrimary)
            col = `p.${quoteIdent(mPrimary[1], "mysql")}`;
        else if (mJoin) {
            const idx = Number(mJoin[1]);
            const name = mJoin[2];
            if (Number.isNaN(idx) || idx < 0 || idx >= joinsCount)
                col = `\`${raw.replace(/`/g, "``")}\``;
            else
                col = `j${idx}.${quoteIdent(name, "mysql")}`;
        }
        else
            col = `\`${raw.replace(/`/g, "``")}\``;
        switch (c.operator) {
            case "is null":
                return `${col} IS NULL`;
            case "is not null":
                return `${col} IS NOT NULL`;
            case "contains":
                params.push(`%${c.value ?? ""}%`);
                return `${col} LIKE ?`;
            case "startsWith":
                params.push(`${c.value ?? ""}%`);
                return `${col} LIKE ?`;
            case "endsWith":
                params.push(`%${c.value ?? ""}`);
                return `${col} LIKE ?`;
            case "in": {
                const list = (c.value ?? "").split(",").map((v) => v.trim());
                const qs = list.map(() => "?");
                params.push(...list);
                return `${col} IN (${qs.join(", ")})`;
            }
            case "not in": {
                const list = (c.value ?? "").split(",").map((v) => v.trim());
                const qs = list.map(() => "?");
                params.push(...list);
                return `${col} NOT IN (${qs.join(", ")})`;
            }
            default: {
                params.push(c.value ?? null);
                return `${col} ${c.operator} ?`;
            }
        }
    });
    const clause = parts.length ? `WHERE ${parts.join(" AND ")}` : "";
    return { clause, params };
}
function buildColumnSelection(leftColumns, rightColumns, dbType) {
    const leftCols = leftColumns && leftColumns.length > 0
        ? leftColumns.map((col) => {
            const colQuoted = quoteIdent(col, dbType);
            return `l.${colQuoted} AS ${dbType === "postgres"
                ? `"${"left_"}${col.replace(/"/g, '""')}"`
                : `\`${"left_"}${col.replace(/`/g, "``")}\``}`;
        })
        : ["l.*"];
    const rightCols = rightColumns && rightColumns.length > 0
        ? rightColumns.map((col) => {
            const colQuoted = quoteIdent(col, dbType);
            return `r.${colQuoted} AS ${dbType === "postgres"
                ? `"${"right_"}${col.replace(/"/g, '""')}"`
                : `\`${"right_"}${col.replace(/`/g, "``")}\``}`;
        })
        : ["r.*"];
    return [...leftCols, ...rightCols].join(", ");
}
async function getPasswordFromSecret(secretId) {
    if (!secretId)
        return null;
    console.warn(`[SECURITY] Usando contraseña placeholder para secret_id: ${secretId}. Implementar obtención segura.`);
    return process.env.DB_PASSWORD_PLACEHOLDER || "tu-contraseña-secreta";
}
exports.maxDuration = 800;
const JOIN_INTERNAL_TIMEOUT_MS = Number(process.env.ETL_JOIN_TIMEOUT_MS) || 590_000;
async function POST(req) {
    const requestId = (0, crypto_1.randomUUID)();
    const log = (message, data) => console.log(`[ReqID: ${requestId}] ${message}`, data || "");
    const timeoutRef = { current: false };
    const timeoutResponse = new Promise((resolve) => {
        setTimeout(() => {
            timeoutRef.current = true;
            resolve(server_1.NextResponse.json({
                ok: false,
                error: "Timeout: la consulta JOIN superó el tiempo permitido. Reduzca el volumen o use filtros.",
            }, { status: 504 }));
        }, JOIN_INTERNAL_TIMEOUT_MS);
    });
    const main = async () => {
        log("Petición JOIN recibida.");
        try {
            let body;
            try {
                body = (await req.json());
            }
            catch (parseErr) {
                log("Error: Cuerpo de la petición inválido o demasiado grande.", { parseErr: parseErr instanceof Error ? parseErr.message : String(parseErr) });
                return server_1.NextResponse.json({ ok: false, error: "Cuerpo de la petición inválido o demasiado grande" }, { status: 400 });
            }
            if (!body) {
                log("Error: Cuerpo de la petición vacío.");
                return server_1.NextResponse.json({ ok: false, error: "Cuerpo vacío" }, { status: 400 });
            }
            const sanitizedBody = { ...body };
            if (sanitizedBody.password)
                sanitizedBody.password = "[REDACTED]";
            if (sanitizedBody.secondaryPassword)
                sanitizedBody.secondaryPassword = "[REDACTED]";
            log("Cuerpo de la petición (sanitizado):", sanitizedBody);
            let { limit, offset, unlimited } = body;
            limit =
                unlimited === true || limit === limits_1.ETL_MAX_ROWS_CEILING
                    ? limits_1.ETL_MAX_ROWS_CEILING
                    : limit != null && limit >= 1 && limit <= limits_1.ETL_MAX_ROWS_CEILING
                        ? limit
                        : 50;
            if (!offset || offset < 0)
                offset = 0;
            if (body.dateFilter?.column) {
                body.dateFilter = { ...body.dateFilter, column: normalizeFilterColumnRef(body.dateFilter.column) };
            }
            if (Array.isArray(body.conditions)) {
                body.conditions = body.conditions.map((c) => ({ ...c, column: c.column ? normalizeFilterColumnRef(c.column) : c.column }));
            }
            const countMode = body.countMode || "fast";
            log("Autenticando usuario...");
            const internalEtl = req.headers.get("x-internal-etl");
            const expectedInternal = process.env.INTERNAL_ETL_SECRET ?? process.env.CRON_SECRET ?? "";
            const isInternalEtlRun = body.fromEtlRun === true &&
                !!internalEtl &&
                !!expectedInternal &&
                internalEtl === expectedInternal;
            const supabase = isInternalEtlRun
                ? (0, service_1.createServiceRoleClient)()
                : await (0, server_2.createClient)();
            let currentUser;
            if (isInternalEtlRun) {
                currentUser = { id: "internal-etl-worker" };
                log("Autenticación interna ETL (Railway worker).");
            }
            else {
                const { data: { user: authUser }, error: authError, } = await supabase.auth.getUser();
                if (authError || !authUser) {
                    log("Error de autenticación.", { authError });
                    return server_1.NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });
                }
                currentUser = authUser;
                log(`Usuario autenticado: ${currentUser.id}`);
            }
            const isStar = !!body.primaryTable || Array.isArray(body.joins);
            if (isStar) {
                const { primaryConnectionId, primaryTable, joins: joinsRaw, primaryColumns, conditions, count, ssl, } = body;
                const joins = Array.isArray(joinsRaw)
                    ? joinsRaw.filter((jn) => !!jn &&
                        typeof jn === "object" &&
                        jn.secondaryConnectionId != null &&
                        String(jn.secondaryConnectionId).trim() !== "")
                    : [];
                log("Iniciando flujo de JOIN 'star-schema'.", {
                    primaryConnectionId,
                    primaryTable,
                    joinsCount: Array.isArray(joins) ? joins.length : 0,
                    hasDateFilter: !!body.dateFilter,
                    dateFilter: body.dateFilter ?? null,
                    conditionsCount: Array.isArray(conditions) ? conditions.length : 0,
                });
                if (!primaryTable || joins.length === 0) {
                    log("Error de validación: Falta tabla principal o joins.");
                    return server_1.NextResponse.json({
                        ok: false,
                        error: "Se requiere tabla principal y al menos un JOIN secundario",
                    }, { status: 400 });
                }
                if (Array.isArray(joinsRaw) && joinsRaw.length !== joins.length) {
                    log("Se detectaron joins inválidos en el payload.", {
                        providedJoins: joinsRaw.length,
                        validJoins: joins.length,
                    });
                    return server_1.NextResponse.json({
                        ok: false,
                        error: "Configuración JOIN inválida: se detectaron joins vacíos o sin secondaryConnectionId.",
                    }, { status: 400 });
                }
                for (let idx = 0; idx < joins.length; idx++) {
                    const jn = joins[idx];
                    if (jn.secondaryConnectionId == null || String(jn.secondaryConnectionId).trim() === "") {
                        return server_1.NextResponse.json({ ok: false, error: `Join ${idx}: secondaryConnectionId es obligatorio.` }, { status: 400 });
                    }
                    if (!String(jn.secondaryTable ?? "").trim()) {
                        return server_1.NextResponse.json({ ok: false, error: `Join ${idx}: secondaryTable es obligatorio.` }, { status: 400 });
                    }
                    const pairs = getJoinConditionPairs(jn);
                    if (pairs.length === 0 || pairs.some((p) => !p.leftColumn || !p.rightColumn)) {
                        return server_1.NextResponse.json({ ok: false, error: `Join ${idx}: se requiere al menos una condición válida de enlace.` }, { status: 400 });
                    }
                }
                log("Cargando metadatos de conexiones en paralelo...");
                const allConnectionIds = [
                    primaryConnectionId,
                    ...joins.map((j) => j.secondaryConnectionId),
                ].filter((id) => id != null);
                const uniqueConnectionIds = [...new Set(allConnectionIds)];
                const supabaseService = (0, service_1.createServiceRoleClient)();
                const connSelect = (0, connections_query_1.connectionsSelectColumns)();
                const useServiceDirect = isInternalEtlRun || (0, backend_config_1.shouldUseOwnBackend)();
                const connectionPromises = uniqueConnectionIds.map(async (id) => {
                    const idStr = String(id);
                    if (useServiceDirect) {
                        const svcRes = await supabaseService
                            .from("connections")
                            .select(connSelect)
                            .eq("id", idStr)
                            .single();
                        return {
                            id: idStr,
                            data: svcRes.data
                                ? (0, connection_persistence_1.hydrateConnectionRow)(svcRes.data)
                                : null,
                            error: svcRes.error,
                        };
                    }
                    const ownRes = await supabase
                        .from("connections")
                        .select(connSelect)
                        .eq("id", idStr)
                        .eq("user_id", currentUser.id)
                        .single();
                    if (ownRes.data) {
                        return {
                            id: idStr,
                            data: (0, connection_persistence_1.hydrateConnectionRow)(ownRes.data),
                            error: null,
                        };
                    }
                    const svcRes = await supabaseService
                        .from("connections")
                        .select(connSelect)
                        .eq("id", idStr)
                        .single();
                    return {
                        id: idStr,
                        data: svcRes.data
                            ? (0, connection_persistence_1.hydrateConnectionRow)(svcRes.data)
                            : null,
                        error: svcRes.error ?? ownRes.error,
                    };
                });
                const connectionResults = await Promise.all(connectionPromises);
                const connectionsMap = new Map();
                for (const result of connectionResults) {
                    if (result.error || !result.data) {
                        log("Error: No se pudo cargar una de las conexiones.", {
                            connectionId: result.id,
                            error: result.error,
                        });
                        return server_1.NextResponse.json({
                            ok: false,
                            error: `Una de las conexiones requeridas no fue encontrada.`,
                        }, { status: 404 });
                    }
                    connectionsMap.set(String(result.data.id), result.data);
                }
                log(`${connectionsMap.size} conexiones cargadas desde Supabase.`);
                const primaryConn = connectionsMap.get(String(primaryConnectionId));
                if (!primaryConn) {
                    log("Error: Conexión principal no encontrada en el mapa.", {
                        primaryConnectionId,
                    });
                    return server_1.NextResponse.json({ ok: false, error: "Conexión principal no encontrada" }, { status: 404 });
                }
                const dbType = (primaryConn.type || "postgres").toLowerCase();
                log(`Tipo de base de datos determinada: ${dbType}`);
                const joinsConnections = (joins || []).map((jn) => connectionsMap.get(String(jn.secondaryConnectionId)));
                const hasFirebirdInChain = [primaryConn, ...joinsConnections].some((c) => String(c?.type || "").toLowerCase() === "firebird");
                const sameConnectionChain = (joins || []).every((jn) => String(jn.secondaryConnectionId ?? "") === String(primaryConnectionId ?? ""));
                const isPostgresLike = (t) => t === "postgres" || t === "postgresql";
                const primaryType = String(primaryConn?.type || "").toLowerCase();
                const allSameType = [primaryConn, ...joinsConnections].every((c) => String(c?.type || "").toLowerCase() === primaryType);
                const equivalentPostgresChain = isPostgresLike(primaryType) &&
                    allSameType &&
                    [primaryConn, ...joinsConnections].every((c) => String(c?.db_host || "") === String(primaryConn?.db_host || "") &&
                        String(c?.db_port || 5432) === String(primaryConn?.db_port || 5432) &&
                        String(c?.db_name || "") === String(primaryConn?.db_name || "") &&
                        String(c?.db_user || "") === String(primaryConn?.db_user || ""));
                const allExcelChain = [primaryConn, ...joinsConnections].every((c) => String(c?.type || "").toLowerCase() === "excel_file");
                const useInMemoryStarJoin = hasFirebirdInChain || (!sameConnectionChain && !equivalentPostgresChain && !allExcelChain);
                log("Decisión de estrategia de JOIN star.", {
                    dbType,
                    hasFirebirdInChain,
                    sameConnectionChain,
                    equivalentPostgresChain,
                    allExcelChain,
                    useInMemoryStarJoin,
                });
                if (useInMemoryStarJoin) {
                    const joinsCount = (joins || []).length;
                    if (hasFirebirdInChain && joinsCount >= 2) {
                        const pgUrl = (0, internal_db_url_1.getInternalDbUrl)();
                        if (pgUrl) {
                            const skipCleanup = body._skipMaterializationCleanup === true;
                            const externalPrefix = body._materializationPrefix;
                            log("Intentando flujo de materialización (Firebird → PG temporal + JOIN nativo).", { joinsCount, reusePrefix: externalPrefix || null, skipCleanup });
                            const tempTables = [];
                            let matClient = null;
                            try {
                                const { materializeFirebirdTable, materializePostgresTable, cleanupTempTables } = await Promise.resolve().then(() => __importStar(require("@/lib/etl/materialize-firebird")));
                                const reqSuffix = externalPrefix || (0, crypto_1.randomUUID)().replace(/-/g, "").slice(0, 12);
                                const fromEtlRun = body.fromEtlRun === true;
                                matClient = new pg_1.Client({ connectionString: pgUrl, connectionTimeoutMillis: 15000, statement_timeout: Math.max(120000, JOIN_INTERNAL_TIMEOUT_MS) });
                                await matClient.connect();
                                let tablesAlreadyExist = false;
                                if (externalPrefix) {
                                    try {
                                        await matClient.query(`SELECT 1 FROM etl_temp."${reqSuffix}_primary" LIMIT 1`);
                                        tablesAlreadyExist = true;
                                        log("Tablas materializadas encontradas, reutilizando.", { prefix: reqSuffix });
                                    }
                                    catch {
                                        log("Tablas no encontradas, materializando por primera vez.", { prefix: reqSuffix });
                                    }
                                }
                                if (!tablesAlreadyExist) {
                                    const dateFilterCol = (body.dateFilter?.column ?? "").trim();
                                    const isDateOnPrimary = /^primary\./i.test(dateFilterCol) || (dateFilterCol && !/^join_\d+\./i.test(dateFilterCol));
                                    const dateFilterForPrimary = body.dateFilter && dateFilterCol && isDateOnPrimary
                                        ? { column: dateFilterCol.replace(/^primary\./i, "").trim(), years: body.dateFilter.years, months: body.dateFilter.months, exactDates: body.dateFilter.exactDates }
                                        : undefined;
                                    const getDateFilterForJoinMat = (idx) => {
                                        if (!body.dateFilter?.column?.trim())
                                            return undefined;
                                        const col = body.dateFilter.column.trim();
                                        if (!new RegExp(`^join_${idx}\\.`, "i").test(col))
                                            return undefined;
                                        return { column: col.replace(new RegExp(`^join_${idx}\\.`, "i"), "").trim(), years: body.dateFilter.years, months: body.dateFilter.months, exactDates: body.dateFilter.exactDates };
                                    };
                                    await matClient.query(`CREATE SCHEMA IF NOT EXISTS etl_temp`).catch(() => { });
                                    const materializeOne = async (conn, table, cols, df, tblName) => {
                                        const connType = String(conn?.type || "").toLowerCase();
                                        if (connType === "firebird") {
                                            return materializeFirebirdTable(conn, table, cols, df, pgUrl, "etl_temp", tblName, undefined, matClient, (rowsSoFar) => {
                                                log(`Materializando ${tblName}: ${rowsSoFar.toLocaleString("es-AR")} filas copiadas…`);
                                            });
                                        }
                                        return materializePostgresTable(conn, table, cols, df, pgUrl, "etl_temp", tblName, matClient);
                                    };
                                    const matResults = [];
                                    log("Materializando tabla primary...");
                                    matResults.push(await materializeOne(primaryConn, primaryTable || "", primaryColumns, dateFilterForPrimary, `${reqSuffix}_primary`));
                                    for (let idx = 0; idx < joins.length; idx++) {
                                        const jn = joins[idx];
                                        const secConn = connectionsMap.get(String(jn.secondaryConnectionId));
                                        if (!secConn)
                                            throw new Error(`Conexión secundaria no encontrada para join_${idx}`);
                                        log(`Materializando tabla join_${idx}...`);
                                        matResults.push(await materializeOne(secConn, jn.secondaryTable || "", jn.secondaryColumns, getDateFilterForJoinMat(idx), `${reqSuffix}_join_${idx}`));
                                    }
                                    for (const mr of matResults)
                                        tempTables.push(mr.qualifiedTable);
                                    log("Materialización completada.", matResults.map((r) => ({ table: r.qualifiedTable, rows: r.rowCount })));
                                }
                                else {
                                    tempTables.push(`etl_temp."${reqSuffix}_primary"`);
                                    for (let idx = 0; idx < joins.length; idx++) {
                                        tempTables.push(`etl_temp."${reqSuffix}_join_${idx}"`);
                                    }
                                }
                                const pQualified = tempTables[0];
                                const jQualified = tempTables.slice(1);
                                const isInternalRnCol = (c) => c.toLowerCase() === "_biconic_rn";
                                const useKeysetPaging = !!externalPrefix;
                                let resolvedPrimaryCols = primaryColumns && primaryColumns.length > 0 ? primaryColumns : [];
                                if (resolvedPrimaryCols.length === 0) {
                                    try {
                                        resolvedPrimaryCols = (await getTableColumnsPg(matClient, `${reqSuffix}_primary`, "etl_temp")).filter((c) => !isInternalRnCol(c));
                                    }
                                    catch (_) { }
                                }
                                const selectParts = [];
                                const normalizeKey = (k) => String(k || "").replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase();
                                if (resolvedPrimaryCols.length > 0) {
                                    resolvedPrimaryCols.forEach((col) => {
                                        const nk = normalizeKey(col);
                                        selectParts.push(`p."${nk}" AS "primary_${nk}"`);
                                    });
                                }
                                else {
                                    selectParts.push("p.*");
                                }
                                for (let idx = 0; idx < joins.length; idx++) {
                                    const jn = joins[idx];
                                    let secCols = jn.secondaryColumns && jn.secondaryColumns.length > 0 ? jn.secondaryColumns : [];
                                    if (secCols.length === 0) {
                                        try {
                                            secCols = (await getTableColumnsPg(matClient, `${reqSuffix}_join_${idx}`, "etl_temp")).filter((c) => !isInternalRnCol(c));
                                        }
                                        catch (_) { }
                                    }
                                    if (secCols.length > 0) {
                                        secCols.forEach((col) => {
                                            const nk = normalizeKey(col);
                                            selectParts.push(`j${idx}."${nk}" AS "join_${idx}_${nk}"`);
                                        });
                                    }
                                    else {
                                        selectParts.push(`j${idx}.*`);
                                    }
                                }
                                if (useKeysetPaging) {
                                    selectParts.push(`p."_biconic_rn" AS "__biconic_cursor"`);
                                }
                                const indexCandidates = [];
                                let fromJoin = `FROM ${pQualified} AS p`;
                                joins.forEach((jn, idx) => {
                                    const jt = (jn.joinType || "INNER").toUpperCase();
                                    const pairs = getJoinConditionPairs(jn);
                                    if (pairs.length === 0)
                                        throw new Error(`Join ${idx}: se requiere al menos una condición de enlace.`);
                                    const onClauses = pairs.map(({ leftColumn: pc, rightColumn: sc }) => {
                                        let leftAlias = "p";
                                        let leftTable = pQualified;
                                        let leftCol = (pc || "").trim();
                                        if (leftCol.includes(".")) {
                                            if (/^primary\./i.test(leftCol)) {
                                                leftCol = normalizeKey(leftCol.replace(/^primary\./i, "").trim());
                                            }
                                            else {
                                                const m = leftCol.match(/^join_(\d+)\.(.+)$/i);
                                                if (m) {
                                                    const i = Number(m[1]);
                                                    if (!Number.isNaN(i) && i >= 0 && i < idx) {
                                                        leftAlias = `j${i}`;
                                                        leftTable = jQualified[i];
                                                        leftCol = normalizeKey(m[2].trim());
                                                    }
                                                }
                                            }
                                        }
                                        else {
                                            leftCol = normalizeKey(leftCol);
                                        }
                                        const rightCol = normalizeKey((sc || "").trim());
                                        indexCandidates.push({ table: leftTable, column: leftCol });
                                        indexCandidates.push({ table: jQualified[idx], column: rightCol });
                                        return `${leftAlias}."${leftCol}" = j${idx}."${rightCol}"`;
                                    });
                                    fromJoin += ` ${jt} JOIN ${jQualified[idx]} AS j${idx} ON ${onClauses.join(" AND ")}`;
                                });
                                if (!tablesAlreadyExist && indexCandidates.length > 0) {
                                    const seenIndexKeys = new Set();
                                    for (const { table, column } of indexCandidates) {
                                        const dedupeKey = `${table}:::${column}`;
                                        if (seenIndexKeys.has(dedupeKey))
                                            continue;
                                        seenIndexKeys.add(dedupeKey);
                                        const idxName = `idx_${reqSuffix}_${column}`.replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 63);
                                        try {
                                            await matClient.query(`CREATE INDEX IF NOT EXISTS "${idxName}" ON ${table} ("${column}")`);
                                        }
                                        catch (idxErr) {
                                            log("No se pudo crear índice de JOIN (se continúa sin él).", {
                                                table,
                                                column,
                                                error: idxErr instanceof Error ? idxErr.message : String(idxErr),
                                            });
                                        }
                                    }
                                }
                                const normalizeColRefForMat = (col) => {
                                    const m = col.match(/^(primary\.|join_\d+\.)?(.+)$/i);
                                    if (!m)
                                        return col.toLowerCase();
                                    return (m[1] || "") + m[2].replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase();
                                };
                                const matDateFilter = body.dateFilter
                                    ? { ...body.dateFilter, column: normalizeColRefForMat(body.dateFilter.column) }
                                    : undefined;
                                const matConditions = (conditions || []).map(c => ({
                                    ...c,
                                    column: c.column ? normalizeColRefForMat(c.column) : c.column,
                                }));
                                const normalizedConditions = normalizeStarConditions(matConditions, joins.length);
                                const { clause: condClause, params: condParams } = buildWhereClausePgStar(normalizedConditions, joins.length);
                                const { clause: dfClause, params: dfParams } = (0, helpers_1.buildDateFilterWhereFragmentPg)(matDateFilter, condParams.length + 1, "p.", joins.length);
                                const baseClause = dfClause ? (condClause ? `${condClause} AND ${dfClause}` : `WHERE ${dfClause}`) : condClause;
                                const baseParams = [...condParams, ...dfParams];
                                const effectiveLimit = limit ?? 50;
                                const effectiveOffset = offset ?? 0;
                                let mergedClause = baseClause;
                                let mergedParams = [...baseParams];
                                let stableOrderBy;
                                let sqlParams;
                                let sql;
                                if (useKeysetPaging) {
                                    mergedClause = mergedClause
                                        ? `${mergedClause} AND p."_biconic_rn" > $${mergedParams.length + 1}`
                                        : `WHERE p."_biconic_rn" > $${mergedParams.length + 1}`;
                                    mergedParams = [...mergedParams, effectiveOffset];
                                    stableOrderBy = `ORDER BY p."_biconic_rn"`;
                                    sql = `SELECT ${selectParts.join(", ")} ${fromJoin} ${mergedClause} ${stableOrderBy} LIMIT $${mergedParams.length + 1}`;
                                    sqlParams = [...mergedParams, effectiveLimit];
                                }
                                else {
                                    stableOrderBy = resolvedPrimaryCols.length > 0
                                        ? `ORDER BY ${resolvedPrimaryCols.map((c) => `p."${normalizeKey(c)}"`).join(", ")}`
                                        : "ORDER BY 1";
                                    sql = `SELECT ${selectParts.join(", ")} ${fromJoin} ${mergedClause} ${stableOrderBy} LIMIT $${mergedParams.length + 1} OFFSET $${mergedParams.length + 2}`;
                                    sqlParams = [...mergedParams, effectiveLimit, effectiveOffset];
                                }
                                log("Ejecutando JOIN nativo tras materialización.", { sql: sql.slice(0, 500), useKeysetPaging, paramsLen: sqlParams.length });
                                const resDb = await matClient.query(sql, sqlParams);
                                log(`JOIN nativo ejecutado: ${resDb.rowCount} filas.`);
                                let totalOut = undefined;
                                if (count) {
                                    const countSql = `SELECT COUNT(*)::int as c ${fromJoin} ${baseClause}`;
                                    const cntRes = await matClient.query(countSql, baseParams);
                                    totalOut = cntRes.rows?.[0]?.c ?? 0;
                                }
                                let rowsOut = resDb.rows || [];
                                let nextCursor = effectiveOffset;
                                if (useKeysetPaging) {
                                    rowsOut = rowsOut.map((r) => {
                                        const cursorVal = r.__biconic_cursor;
                                        if (typeof cursorVal === "number")
                                            nextCursor = cursorVal;
                                        else if (typeof cursorVal === "string" && cursorVal.trim() !== "")
                                            nextCursor = Number(cursorVal);
                                        const { __biconic_cursor, ...rest } = r;
                                        return rest;
                                    });
                                }
                                const jsonPayload = { ok: true, rows: rowsOut, total: totalOut };
                                jsonPayload.sourceExhausted = rowsOut.length < effectiveLimit;
                                jsonPayload.nextSourceOffset = useKeysetPaging
                                    ? (rowsOut.length > 0 ? nextCursor : effectiveOffset)
                                    : effectiveOffset + rowsOut.length;
                                jsonPayload.materialized = true;
                                await matClient.end().catch(() => { });
                                matClient = null;
                                if (!skipCleanup) {
                                    cleanupTempTables(pgUrl, tempTables).catch((e) => console.error("[materialize cleanup]", e));
                                }
                                return server_1.NextResponse.json(jsonPayload);
                            }
                            catch (matErr) {
                                log("Materialización falló, cayendo a in-memory.", { error: matErr?.message, stack: matErr?.stack?.slice(0, 600), code: matErr?.code, detail: matErr?.detail });
                                if (matClient)
                                    await matClient.end().catch(() => { });
                                if (tempTables.length > 0 && pgUrl) {
                                    Promise.resolve().then(() => __importStar(require("@/lib/etl/materialize-firebird"))).then(({ cleanupTempTables }) => cleanupTempTables(pgUrl, tempTables).catch(() => { })).catch(() => { });
                                }
                            }
                        }
                    }
                    log("Iniciando flujo de JOIN star en memoria (Firebird/cross-connection).");
                    try {
                        validateStarJoinPayloadInMemory(joins || [], joinsCount);
                        const envSourceLimitMax = Number(process.env.ETL_JOIN_SOURCE_LIMIT_MAX);
                        const fromEtlRun = body.fromEtlRun === true;
                        const isPreviewMode = !fromEtlRun;
                        const capByJoinsPreview = joinsCount >= 10 ? 1_800
                            : joinsCount >= 8 ? 2_500
                                : joinsCount >= 6 ? 3_500
                                    : joinsCount >= 4 ? 5_000
                                        : joinsCount >= 3 ? 7_000
                                            : joinsCount >= 2 ? 10_000
                                                : 10_000;
                        const capByJoinsRun = joinsCount >= 10 ? 8_000
                            : joinsCount >= 8 ? 12_000
                                : joinsCount >= 6 ? 18_000
                                    : joinsCount >= 4 ? 24_000
                                        : joinsCount >= 3 ? 28_000
                                            : joinsCount >= 2 ? 35_000
                                                : 35_000;
                        const capByJoins = envSourceLimitMax > 0
                            ? Math.min(limits_1.ETL_MAX_ROWS_CEILING, envSourceLimitMax)
                            : fromEtlRun ? capByJoinsRun : capByJoinsPreview;
                        const effectiveCap = fromEtlRun && (limit ?? 0) > capByJoins
                            ? Math.min(limit ?? capByJoins, limits_1.ETL_MAX_ROWS_CEILING)
                            : capByJoins;
                        const requestedRows = limit ?? 50;
                        const previewFast = body.previewFast === true;
                        let sourceLimit = isPreviewMode
                            ? Math.min(limits_1.ETL_MAX_ROWS_CEILING, previewFast
                                ? Math.min(Math.max(requestedRows * 3, 60), 200)
                                : Math.max(requestedRows * 8, 500), effectiveCap)
                            : Math.min(limits_1.ETL_MAX_ROWS_CEILING, Math.max(requestedRows * 8, 500), effectiveCap);
                        if (isPreviewMode && envSourceLimitMax <= 0) {
                            const previewRequestScanCap = previewFast
                                ? Math.min(250, Math.max(requestedRows * 4, 80))
                                : joinsCount >= 10 ? 1_800
                                    : joinsCount >= 8 ? 2_000
                                        : joinsCount >= 6 ? 2_500
                                            : joinsCount >= 4 ? 3_500
                                                : 5_000;
                            sourceLimit = Math.min(sourceLimit, previewRequestScanCap);
                        }
                        if (envSourceLimitMax > 0)
                            sourceLimit = Math.min(sourceLimit, envSourceLimitMax);
                        log("JOIN star en memoria - límites de lectura.", {
                            joinsCount,
                            fromEtlRun,
                            isPreviewMode,
                            requestedLimit: limit ?? 50,
                            requestedOffset: offset ?? 0,
                            capByJoinsPreview,
                            capByJoinsRun,
                            capByJoins,
                            effectiveCap,
                            sourceLimit,
                            envSourceLimitMax: Number.isFinite(envSourceLimitMax) ? envSourceLimitMax : null,
                        });
                        const sourceOffset = (body.offset ?? 0) || 0;
                        const normalizeKey = (k) => String(k || "").replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase();
                        const normalizeRow = (row) => {
                            const out = {};
                            for (const key of Object.keys(row || {}))
                                out[normalizeKey(key)] = row[key];
                            return out;
                        };
                        const getByColumnName = (row, col) => {
                            const n = normalizeKey(col);
                            if (row[n] !== undefined)
                                return row[n];
                            for (const k of Object.keys(row))
                                if (normalizeKey(k) === n)
                                    return row[k];
                            return undefined;
                        };
                        const getRowValueByKey = (row, key) => {
                            if (row[key] !== undefined)
                                return row[key];
                            const n = normalizeKey(key);
                            for (const k of Object.keys(row))
                                if (normalizeKey(k) === n)
                                    return row[k];
                            return undefined;
                        };
                        const firebirdSafePart = (s) => /^[A-Z0-9_]+$/i.test(String(s).trim())
                            ? String(s).trim().toUpperCase()
                            : `"${String(s).trim().replace(/"/g, '""')}"`;
                        const resolvePhysicalIfExcel = async (conn, table) => {
                            if (String(conn?.type || "").toLowerCase() !== "excel_file")
                                return table;
                            const { data: metaRows, error: mErr } = await supabase
                                .from("data_tables")
                                .select("physical_schema_name, physical_table_name, table_name")
                                .eq("connection_id", String(conn.id));
                            if (mErr) {
                                throw new Error(`Metadatos de tabla física no encontrados para conexión ${conn.id}`);
                            }
                            const rows = (0, excel_metadata_1.normalizeExcelDataTableRows)(metaRows);
                            if (!rows.length) {
                                throw new Error(`Metadatos de tabla física no encontrados para conexión ${conn.id}`);
                            }
                            return (0, excel_metadata_1.resolveExcelQualifiedTableFromRows)(String(conn.id), table, rows);
                        };
                        const IN_KEYS_BATCH = Math.min(2500, Math.max(500, Number(process.env.ETL_JOIN_KEYSET_BATCH) || 1500));
                        const fetchRowsFromConn = async (conn, table, columns, dateFilterForTable, rowOffset = 0, options) => {
                            const cType = String(conn?.type || "").toLowerCase();
                            const resolvedTable = await resolvePhysicalIfExcel(conn, table);
                            const filterByKeys = options?.filterByKeys;
                            if (cType === "firebird") {
                                const Firebird = require("node-firebird");
                                let pwd = conn.db_password_encrypted
                                    ? (0, connection_secret_1.decryptConnectionPassword)(conn.db_password_encrypted)
                                    : conn.db_password ?? "";
                                if (!pwd) {
                                    pwd = (await getPasswordFromSecret(conn.db_password_secret_id)) || "";
                                }
                                const opts = {
                                    host: conn.db_host || "localhost",
                                    port: conn.db_port ? Number(conn.db_port) : 15421,
                                    database: conn.db_name,
                                    user: conn.db_user,
                                    password: pwd || process.env.FLEXXUS_PASSWORD || process.env.DB_PASSWORD_PLACEHOLDER || "",
                                    lowercase_keys: false,
                                };
                                const tablePart = resolvedTable.includes(".")
                                    ? (resolvedTable.split(".").pop() || resolvedTable).trim().toUpperCase()
                                    : firebirdSafePart(resolvedTable);
                                const cols = columns?.length ? columns.map((c) => firebirdSafePart(c)).join(", ") : "*";
                                const { clause: dfClause, params: dfParams } = (0, helpers_1.buildDateFilterWhereFragmentFirebird)(dateFilterForTable);
                                const baseWhereFb = dfClause ? ` WHERE ${dfClause}` : "";
                                const escapeFbLiteral = (v) => {
                                    if (v == null || v === "")
                                        return "NULL";
                                    if (typeof v === "boolean")
                                        return v ? "1" : "0";
                                    if (typeof v === "number" && !Number.isNaN(v))
                                        return Number.isInteger(v) ? String(v) : `CAST('${String(v)}' AS DOUBLE PRECISION)`;
                                    if (typeof v === "string" && /^-?\d+\.\d+$/.test(v.trim())) {
                                        const n = v.trim();
                                        return `CAST('${n.replace(/'/g, "''")}' AS DOUBLE PRECISION)`;
                                    }
                                    return `'${String(v).replace(/'/g, "''")}'`;
                                };
                                if (filterByKeys?.columns?.length && filterByKeys?.valueTuples?.length) {
                                    const fbCols = filterByKeys.columns.map((c) => firebirdSafePart(c));
                                    const allRows = [];
                                    for (let b = 0; b < filterByKeys.valueTuples.length; b += IN_KEYS_BATCH) {
                                        const batch = filterByKeys.valueTuples.slice(b, b + IN_KEYS_BATCH);
                                        if (batch.length === 0)
                                            continue;
                                        const keysCondition = fbCols.length === 1
                                            ? `${fbCols[0]} IN (${batch.map((t) => escapeFbLiteral(t[0])).join(", ")})`
                                            : `(${batch.map((t) => fbCols.map((fc, i) => `${fc} = ${escapeFbLiteral(t[i])}`).join(" AND ")).join(" OR ")})`;
                                        const keysWhere = baseWhereFb ? `${baseWhereFb} AND ${keysCondition}` : ` WHERE ${keysCondition}`;
                                        let sqlFb = `SELECT ${cols} FROM ${tablePart}${keysWhere}`;
                                        if (dfParams.length > 0) {
                                            for (const p of dfParams) {
                                                const pos = sqlFb.indexOf("?");
                                                if (pos === -1)
                                                    break;
                                                sqlFb = sqlFb.slice(0, pos) + escapeFbLiteral(p) + sqlFb.slice(pos + 1);
                                            }
                                        }
                                        const batchRows = await new Promise((resolve, reject) => {
                                            Firebird.attach(opts, (err, db) => {
                                                if (err)
                                                    return reject(err);
                                                db.query(sqlFb, [], (qErr, rows) => {
                                                    if (db?.detach)
                                                        try {
                                                            db.detach(() => { });
                                                        }
                                                        catch (_) { }
                                                    if (qErr)
                                                        return reject(qErr);
                                                    resolve((rows || []).map(normalizeRow));
                                                });
                                            });
                                        });
                                        allRows.push(...batchRows);
                                    }
                                    return allRows;
                                }
                                const wherePart = baseWhereFb;
                                const skip = rowOffset > 0 ? rowOffset : 0;
                                const orderByFb = columns?.length
                                    ? columns.map((c) => firebirdSafePart(c)).join(", ")
                                    : "1";
                                let sql = skip > 0
                                    ? `SELECT FIRST ${sourceLimit} SKIP ${skip} ${cols} FROM ${tablePart}${wherePart} ORDER BY ${orderByFb}`
                                    : `SELECT FIRST ${sourceLimit} ${cols} FROM ${tablePart}${wherePart} ORDER BY ${orderByFb}`;
                                if (dfParams.length > 0) {
                                    for (const p of dfParams) {
                                        const pos = sql.indexOf("?");
                                        if (pos === -1)
                                            break;
                                        sql = sql.slice(0, pos) + escapeFbLiteral(p) + sql.slice(pos + 1);
                                    }
                                }
                                return await new Promise((resolve, reject) => {
                                    Firebird.attach(opts, (err, db) => {
                                        if (err)
                                            return reject(err);
                                        db.query(sql, [], (qErr, rows) => {
                                            if (db?.detach)
                                                try {
                                                    db.detach(() => { });
                                                }
                                                catch (_) { }
                                            if (qErr)
                                                return reject(qErr);
                                            resolve((rows || []).map(normalizeRow));
                                        });
                                    });
                                });
                            }
                            const password = body.password ||
                                (conn.db_password_encrypted
                                    ? await getPasswordFromSecret(conn.db_password_secret_id)
                                    : conn.db_password || "");
                            const connectionString = cType === "excel_file"
                                ? (0, internal_db_url_1.getInternalDbUrl)()
                                : `postgres://${conn.db_user}:${encodeURIComponent(String(password || ""))}@${conn.db_host}:${conn.db_port || 5432}/${conn.db_name}?sslmode=require`;
                            if (!connectionString)
                                throw new Error("No se pudo resolver la conexión para JOIN en memoria.");
                            const client = new pg_1.Client({
                                connectionString,
                                connectionTimeoutMillis: 12000,
                                statement_timeout: Math.max(60000, JOIN_INTERNAL_TIMEOUT_MS - 5000),
                            });
                            await client.connect();
                            try {
                                const sel = columns?.length ? columns.map((c) => quoteIdent(c, "postgres")).join(", ") : "*";
                                const { clause: dfClause, params: dfParams } = (0, helpers_1.buildDateFilterWhereFragmentPg)(dateFilterForTable, 1, "");
                                const baseWhere = dfClause ? ` WHERE ${dfClause}` : "";
                                const paramStart = (dfParams?.length || 0) + 1;
                                if (filterByKeys?.columns?.length && filterByKeys?.valueTuples?.length) {
                                    const allRows = [];
                                    const cols = filterByKeys.columns;
                                    const quotedCols = cols.map((c) => quoteIdent(c, "postgres"));
                                    const aliasNames = cols.length <= 3 ? ["x", "y", "z"].slice(0, cols.length) : cols.map((_, i) => `c${i + 1}`);
                                    for (let b = 0; b < filterByKeys.valueTuples.length; b += IN_KEYS_BATCH) {
                                        const batch = filterByKeys.valueTuples.slice(b, b + IN_KEYS_BATCH);
                                        if (batch.length === 0)
                                            continue;
                                        const keysWhere = cols.length === 1
                                            ? ` AND ${quotedCols[0]} = ANY($${paramStart}::text[])`
                                            : ` AND (${quotedCols.join(", ")}) IN (SELECT ${aliasNames.join(", ")} FROM unnest(${cols.map((_, i) => `$${paramStart + i}::text[]`).join(", ")}) AS t(${aliasNames.join(", ")}) )`;
                                        const batchParams = cols.length === 1
                                            ? [...(dfParams || []), batch.map((t) => t[0])]
                                            : [...(dfParams || []), ...cols.map((_, i) => batch.map((t) => t[i]))];
                                        const q = `SELECT ${sel} FROM ${quoteQualified(resolvedTable, "postgres")}${baseWhere}${keysWhere}`;
                                        const res = await client.query(q, batchParams);
                                        allRows.push(...(res.rows || []).map((r) => normalizeRow(r)));
                                    }
                                    return allRows;
                                }
                                const wherePart = baseWhere;
                                const off = rowOffset > 0 ? rowOffset : 0;
                                const orderByStable = columns?.length
                                    ? columns.map((c) => quoteIdent(c, "postgres")).join(", ")
                                    : "1";
                                const q = off > 0
                                    ? `SELECT ${sel} FROM ${quoteQualified(resolvedTable, "postgres")}${wherePart} ORDER BY ${orderByStable} LIMIT ${sourceLimit} OFFSET ${off}`
                                    : `SELECT ${sel} FROM ${quoteQualified(resolvedTable, "postgres")}${wherePart} ORDER BY ${orderByStable} LIMIT ${sourceLimit}`;
                                const res = await client.query(q, dfParams || []);
                                return (res.rows || []).map((r) => normalizeRow(r));
                            }
                            finally {
                                await client.end().catch(() => { });
                            }
                        };
                        const mapPrefixedValue = (row, ref) => {
                            const raw = (ref || "").trim();
                            let key;
                            if (/^primary\./i.test(raw))
                                key = `primary_${raw.replace(/^primary\./i, "").trim()}`;
                            else {
                                const jmDot = raw.match(/^join_(\d+)\.(.+)$/i);
                                if (jmDot) {
                                    const colPart = jmDot[2].trim().replace(/^\./, "");
                                    key = `join_${Number(jmDot[1])}_${colPart}`;
                                }
                                else {
                                    const jmUnderscore = raw.match(/^join_(\d+)_(.+)$/i);
                                    if (jmUnderscore)
                                        key = `join_${Number(jmUnderscore[1])}_${jmUnderscore[2].trim()}`;
                                    else
                                        key = `primary_${raw}`;
                                }
                            }
                            return getRowValueByKey(row, key);
                        };
                        const passesCondition = (row, cond) => {
                            const raw = String(cond.column || "").trim();
                            const value = /^primary\./i.test(raw) || /^join_\d+\./i.test(raw)
                                ? mapPrefixedValue(row, raw)
                                : row[raw];
                            const opVal = cond.value ?? "";
                            switch (cond.operator) {
                                case "is null":
                                    return value == null;
                                case "is not null":
                                    return value != null;
                                case "contains":
                                    return String(value ?? "").toLowerCase().includes(String(opVal).toLowerCase());
                                case "startsWith":
                                    return String(value ?? "").toLowerCase().startsWith(String(opVal).toLowerCase());
                                case "endsWith":
                                    return String(value ?? "").toLowerCase().endsWith(String(opVal).toLowerCase());
                                case "in": {
                                    const list = String(opVal).split(",").map((v) => v.trim().toLowerCase()).filter(Boolean);
                                    return list.includes(String(value ?? "").trim().toLowerCase());
                                }
                                case "not in": {
                                    const list = String(opVal).split(",").map((v) => v.trim().toLowerCase()).filter(Boolean);
                                    return !list.includes(String(value ?? "").trim().toLowerCase());
                                }
                                case "=":
                                    return String(value ?? "") === String(opVal ?? "");
                                case "!=":
                                    return String(value ?? "") !== String(opVal ?? "");
                                case ">":
                                    return Number(value) > Number(opVal);
                                case ">=":
                                    return Number(value) >= Number(opVal);
                                case "<":
                                    return Number(value) < Number(opVal);
                                case "<=":
                                    return Number(value) <= Number(opVal);
                                default:
                                    return true;
                            }
                        };
                        const parseDateFlexible = (raw) => {
                            if (raw == null)
                                return null;
                            if (raw instanceof Date && !Number.isNaN(raw.getTime()))
                                return raw;
                            const s = typeof raw === "string" ? raw.trim() : "";
                            if (s && /^\d{4}-\d{2}-\d{2}T\d/.test(s)) {
                                const d = new Date(s);
                                return !Number.isNaN(d.getTime()) ? d : null;
                            }
                            const d = new Date(raw);
                            if (!Number.isNaN(d.getTime()))
                                return d;
                            if (!s)
                                return null;
                            const iso = /^\d{4}-\d{2}-\d{2}(T|\s|$)/.exec(s);
                            if (iso) {
                                const d2 = new Date(s.slice(0, 10));
                                return !Number.isNaN(d2.getTime()) ? d2 : null;
                            }
                            const parts = s.split(/[./\-]/).map((p) => parseInt(p, 10)).filter((n) => !Number.isNaN(n));
                            if (parts.length >= 3) {
                                let year, month, day;
                                if (parts[0] >= 1000) {
                                    year = parts[0];
                                    month = parts[1];
                                    day = parts[2];
                                }
                                else if (parts[2] >= 1000) {
                                    day = parts[0];
                                    month = parts[1];
                                    year = parts[2];
                                }
                                else {
                                    day = parts[0];
                                    month = parts[1];
                                    year = parts[2] < 100 ? 2000 + parts[2] : parts[2];
                                }
                                if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
                                    const d3 = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
                                    return !Number.isNaN(d3.getTime()) ? d3 : null;
                                }
                            }
                            return null;
                        };
                        const passesDateFilter = (row, df) => {
                            if (!df?.column)
                                return true;
                            const raw = mapPrefixedValue(row, df.column);
                            if (raw == null || raw === "")
                                return false;
                            const d = parseDateFlexible(raw);
                            if (!d)
                                return false;
                            const y = d.getUTCFullYear();
                            const m = d.getUTCMonth() + 1;
                            if (Array.isArray(df.years) && df.years.length > 0 && !df.years.includes(y))
                                return false;
                            if (Array.isArray(df.months) && df.months.length > 0 && !df.months.includes(m))
                                return false;
                            if (Array.isArray(df.exactDates) && df.exactDates.length > 0) {
                                const iso = d.toISOString().slice(0, 10);
                                if (!df.exactDates.includes(iso))
                                    return false;
                            }
                            return true;
                        };
                        const dateFilterCol = (body.dateFilter?.column ?? "").trim();
                        const isDateOnPrimary = /^primary\./i.test(dateFilterCol) || (dateFilterCol && !/^join_\d+\./i.test(dateFilterCol));
                        const dateFilterForPrimary = body.dateFilter && dateFilterCol && isDateOnPrimary
                            ? {
                                column: dateFilterCol.replace(/^primary\./i, "").trim(),
                                years: body.dateFilter.years,
                                months: body.dateFilter.months,
                                exactDates: body.dateFilter.exactDates,
                            }
                            : undefined;
                        const getDateFilterForJoin = (idx) => {
                            if (!body.dateFilter?.column?.trim())
                                return undefined;
                            const col = body.dateFilter.column.trim();
                            if (!new RegExp(`^join_${idx}\\.`, "i").test(col))
                                return undefined;
                            return {
                                column: col.replace(new RegExp(`^join_${idx}\\.`, "i"), "").trim(),
                                years: body.dateFilter.years,
                                months: body.dateFilter.months,
                                exactDates: body.dateFilter.exactDates,
                            };
                        };
                        let normalizedConditions;
                        try {
                            normalizedConditions = normalizeStarConditions(conditions || [], joinsCount);
                        }
                        catch (normErr) {
                            log("Filtros inválidos en JOIN star en memoria.", { error: normErr?.message });
                            return server_1.NextResponse.json({ ok: false, error: normErr?.message ?? "Filtros inválidos. En JOIN use prefijos primary.<col> o join_n.<col>." }, { status: 400 });
                        }
                        log("JOIN star en memoria - configuración de filtros.", {
                            dateFilterRawColumn: body.dateFilter?.column ?? null,
                            dateFilterForPrimary,
                            joinsCount,
                            sourceLimit,
                        });
                        let filteredRows = [];
                        let lastSourceExhausted = false;
                        let lastNextSourceOffset = sourceOffset;
                        const primaryTableResolved = await resolvePhysicalIfExcel(primaryConn, primaryTable || "");
                        const COMPOSITE_KEY_SEP = "\u0001";
                        const buildCompositeKey = (row, pairs, useRight) => pairs.map((p) => normalizeJoinKeyValue(useRight ? getByColumnName(row, p.rightColumn) : mapPrefixedValue(row, p.leftColumn))).join(COMPOSITE_KEY_SEP);
                        let secRowsCache = null;
                        const runOneBlock = async (primaryRowsRaw, useSecCache) => {
                            const primaryCols = primaryColumns && primaryColumns.length > 0
                                ? primaryColumns
                                : primaryRowsRaw[0]
                                    ? Object.keys(primaryRowsRaw[0])
                                    : [];
                            let joinedRows = primaryRowsRaw.map((r) => {
                                const out = {};
                                for (const c of primaryCols)
                                    out[`primary_${c}`] = getByColumnName(r, c);
                                return out;
                            });
                            for (let idx = 0; idx < (joins || []).length; idx++) {
                                if (timeoutRef.current)
                                    throw new Error("TIMEOUT_JOIN");
                                const jn = joins[idx];
                                const pairs = getJoinConditionPairs(jn);
                                if (pairs.length === 0)
                                    throw new Error(`Join ${idx}: se requiere al menos una condición de enlace (columnas principal y secundaria).`);
                                const secConn = connectionsMap.get(String(jn.secondaryConnectionId));
                                if (!secConn)
                                    throw new Error(`Conexión secundaria no encontrada para join_${idx}`);
                                const secTableResolved = await resolvePhysicalIfExcel(secConn, jn.secondaryTable || "");
                                let secRowsRaw;
                                if (useSecCache) {
                                    const leftKeys = new Set(joinedRows.map((lr) => buildCompositeKey(lr, pairs, false)));
                                    const valueTuples = Array.from(leftKeys).map((k) => k.split(COMPOSITE_KEY_SEP));
                                    if (valueTuples.length === 0) {
                                        secRowsRaw = [];
                                    }
                                    else {
                                        secRowsRaw = await fetchRowsFromConn(secConn, secTableResolved, jn.secondaryColumns, getDateFilterForJoin(idx), 0, {
                                            filterByKeys: { columns: pairs.map((p) => p.rightColumn), valueTuples },
                                        });
                                    }
                                }
                                else {
                                    const cached = secRowsCache ? secRowsCache[idx] : undefined;
                                    secRowsRaw = Array.isArray(cached) ? cached : await fetchRowsFromConn(secConn, secTableResolved, jn.secondaryColumns, getDateFilterForJoin(idx));
                                    if (secRowsCache && !secRowsCache[idx])
                                        secRowsCache[idx] = secRowsRaw;
                                }
                                const secCols = jn.secondaryColumns && jn.secondaryColumns.length > 0
                                    ? jn.secondaryColumns
                                    : secRowsRaw[0]
                                        ? Object.keys(secRowsRaw[0])
                                        : [];
                                const joinType = String(jn.joinType || "INNER").toUpperCase();
                                const rightMap = new Map();
                                const rightUsed = new Set();
                                secRowsRaw.forEach((rr, rrIdx) => {
                                    const key = buildCompositeKey(rr, pairs, true);
                                    const withIdx = { ...rr, __rrIdx__: rrIdx };
                                    if (!rightMap.has(key))
                                        rightMap.set(key, []);
                                    rightMap.get(key).push(withIdx);
                                });
                                const previousKeys = joinedRows[0] ? Object.keys(joinedRows[0]) : [];
                                const nextRows = [];
                                for (const lr of joinedRows) {
                                    const lk = buildCompositeKey(lr, pairs, false);
                                    const matches = rightMap.get(lk) ?? [];
                                    if (matches.length > 0) {
                                        for (const rr of matches) {
                                            if (rr.__rrIdx__ != null)
                                                rightUsed.add(Number(rr.__rrIdx__));
                                            const prefRight = {};
                                            for (const c of secCols)
                                                prefRight[`join_${idx}_${c}`] = getByColumnName(rr, c);
                                            nextRows.push({ ...lr, ...prefRight });
                                        }
                                    }
                                    else if (joinType === "LEFT" || joinType === "FULL") {
                                        const nulls = {};
                                        for (const c of secCols)
                                            nulls[`join_${idx}_${c}`] = null;
                                        nextRows.push({ ...lr, ...nulls });
                                    }
                                }
                                if (joinType === "RIGHT" || joinType === "FULL") {
                                    for (let rrIdx = 0; rrIdx < secRowsRaw.length; rrIdx++) {
                                        if (rightUsed.has(rrIdx))
                                            continue;
                                        const rr = secRowsRaw[rrIdx];
                                        const leftNulls = {};
                                        previousKeys.forEach((k) => (leftNulls[k] = null));
                                        const prefRight = {};
                                        for (const c of secCols)
                                            prefRight[`join_${idx}_${c}`] = getByColumnName(rr, c);
                                        nextRows.push({ ...leftNulls, ...prefRight });
                                    }
                                }
                                joinedRows = nextRows;
                                if (useSecCache) {
                                    log("JOIN star fanout por etapa.", {
                                        joinIndex: idx,
                                        joinType,
                                        rowsRight: secRowsRaw.length,
                                        rowsAfterJoinStage: joinedRows.length,
                                    });
                                }
                            }
                            const rowsAfterJoin = joinedRows.length;
                            const afterConditions = joinedRows.filter((r) => normalizedConditions.every((c) => passesCondition(r, c)));
                            const rowsAfterDateFilter = afterConditions.filter((r) => passesDateFilter(r, body.dateFilter));
                            if (useSecCache) {
                                log("JOIN star iteración bloque.", {
                                    rowsAfterJoin,
                                    rowsAfterConditions: afterConditions.length,
                                    rowsAfterDateFilter: rowsAfterDateFilter.length,
                                    dateFilterColumn: body.dateFilter?.column ?? null,
                                });
                            }
                            return rowsAfterDateFilter;
                        };
                        for (let attempt = 0; attempt < 2; attempt++) {
                            if (attempt === 1) {
                                sourceLimit = Math.min(sourceLimit * 2, limits_1.ETL_MAX_ROWS_CEILING);
                                log("JOIN star en memoria - reintento con sourceLimit mayor.", { sourceLimit });
                            }
                            if (fromEtlRun) {
                                secRowsCache = {};
                                let currentSourceOffset = sourceOffset;
                                const accumulated = [];
                                const targetLimit = Math.min(limit ?? 50, limits_1.ETL_MAX_ROWS_CEILING);
                                while (accumulated.length < targetLimit) {
                                    if (timeoutRef.current)
                                        break;
                                    const primaryRowsRaw = await fetchRowsFromConn(primaryConn, primaryTableResolved, primaryColumns, dateFilterForPrimary, currentSourceOffset);
                                    lastNextSourceOffset = currentSourceOffset + primaryRowsRaw.length;
                                    lastSourceExhausted = primaryRowsRaw.length < sourceLimit;
                                    if (attempt === 0 && currentSourceOffset === sourceOffset) {
                                        log("JOIN star en memoria - filas obtenidas de tabla principal.", {
                                            primaryTable: primaryTableResolved,
                                            primaryRowsCount: primaryRowsRaw.length,
                                            sourceExhausted: lastSourceExhausted,
                                            nextSourceOffset: lastNextSourceOffset,
                                        });
                                    }
                                    if (primaryRowsRaw.length === 0)
                                        break;
                                    const blockFiltered = await runOneBlock(primaryRowsRaw, true);
                                    accumulated.push(...blockFiltered);
                                    log("JOIN star iteración fuente (fromEtlRun).", {
                                        sourceOffset: currentSourceOffset,
                                        rowsPrimary: primaryRowsRaw.length,
                                        rowsAfterJoinAndFilter: blockFiltered.length,
                                        sourceExhausted: lastSourceExhausted,
                                        nextSourceOffset: lastNextSourceOffset,
                                        dateFilterColumn: body.dateFilter?.column ?? null,
                                    });
                                    if (lastSourceExhausted)
                                        break;
                                    currentSourceOffset = lastNextSourceOffset;
                                }
                                if (timeoutRef.current) {
                                    return server_1.NextResponse.json({ ok: false, error: "Timeout: la consulta JOIN superó el tiempo permitido. Reduzca el volumen o use filtros." }, { status: 504 });
                                }
                                filteredRows = accumulated.slice(0, limit ?? 50);
                                log("JOIN star en memoria - paginación interna terminada.", {
                                    totalPrimaryRead: lastNextSourceOffset - sourceOffset,
                                    totalFiltered: accumulated.length,
                                    dateFilterColumn: body.dateFilter?.column ?? null,
                                });
                            }
                            else {
                                const primaryRowsRaw = await fetchRowsFromConn(primaryConn, primaryTableResolved, primaryColumns, dateFilterForPrimary, sourceOffset);
                                lastNextSourceOffset = sourceOffset + primaryRowsRaw.length;
                                lastSourceExhausted = primaryRowsRaw.length < sourceLimit;
                                if (attempt === 0) {
                                    log("JOIN star en memoria - filas obtenidas de tabla principal.", {
                                        primaryTable: primaryTableResolved,
                                        primaryRowsCount: primaryRowsRaw.length,
                                        sourceExhausted: lastSourceExhausted,
                                        nextSourceOffset: lastNextSourceOffset,
                                    });
                                }
                                filteredRows = await runOneBlock(primaryRowsRaw, false);
                            }
                            if ((offset ?? 0) === 0 && filteredRows.length === 0 && attempt === 0 && sourceLimit < limits_1.ETL_MAX_ROWS_CEILING && !fromEtlRun) {
                                continue;
                            }
                            break;
                        }
                        if (filteredRows.length === 0 && body.dateFilter?.column) {
                            log("Diagnóstico: 0 filas tras aplicar filtro de fecha en JOIN star en memoria.", {
                                totalAfterFilter: filteredRows.length,
                                dateFilter: body.dateFilter,
                            });
                        }
                        const totalOut = count ? filteredRows.length : undefined;
                        const rowsPage = filteredRows.slice(0, limit ?? 50);
                        log("JOIN star en memoria - página de resultados construida.", {
                            rowsPageCount: rowsPage.length,
                            offset,
                            limit,
                            totalOut,
                            sourceExhausted: lastSourceExhausted,
                            nextSourceOffset: lastNextSourceOffset,
                            dateFilterColumn: body.dateFilter?.column ?? null,
                        });
                        const jsonPayload = { ok: true, rows: rowsPage, total: totalOut };
                        jsonPayload.sourceExhausted = lastSourceExhausted;
                        jsonPayload.nextSourceOffset = lastNextSourceOffset;
                        if (isPreviewMode) {
                            jsonPayload.previewPartial =
                                lastSourceExhausted === false && rowsPage.length < (limit ?? 50);
                        }
                        return server_1.NextResponse.json(jsonPayload);
                    }
                    catch (e) {
                        if (e?.message === "TIMEOUT_JOIN") {
                            return server_1.NextResponse.json({ ok: false, error: "Timeout: la consulta JOIN superó el tiempo permitido. Reduzca el volumen o use filtros." }, { status: 504 });
                        }
                        log("Error en JOIN star en memoria.", {
                            message: e?.message,
                            stack: e?.stack,
                        });
                        return server_1.NextResponse.json({ ok: false, error: `Error en JOIN múltiple en memoria: ${e?.message || "Error inesperado"}` }, { status: 500 });
                    }
                }
                if (dbType === "excel_file") {
                    log("Detectado tipo 'excel_file'. Iniciando flujo de JOIN interno.");
                    const dbUrl = (0, internal_db_url_1.getInternalDbUrl)();
                    if (!dbUrl) {
                        log("Error crítico: DATABASE_URL no está configurada en el entorno.");
                        return server_1.NextResponse.json({
                            ok: false,
                            error: "Configuración de base de datos interna no disponible",
                        }, { status: 500 });
                    }
                    const client = new pg_1.Client({
                        connectionString: dbUrl,
                        connectionTimeoutMillis: 8000,
                        statement_timeout: Math.max(60000, JOIN_INTERNAL_TIMEOUT_MS - 5000),
                    });
                    try {
                        log("Conectando a la base de datos interna de Supabase para JOIN de Excel...");
                        await client.connect();
                        log("Conexión a BD interna establecida.");
                        const resolvePhysical = async (connId, tableSelection) => {
                            const { data: metaRows, error: mErr } = await supabase
                                .from("data_tables")
                                .select("physical_schema_name, physical_table_name, table_name")
                                .eq("connection_id", String(connId));
                            if (mErr) {
                                throw new Error(`Metadatos de tabla física no encontrados para conexión ${connId}`);
                            }
                            const rows = (0, excel_metadata_1.normalizeExcelDataTableRows)(metaRows);
                            if (!rows.length) {
                                throw new Error(`Metadatos de tabla física no encontrados para conexión ${connId}`);
                            }
                            return (0, excel_metadata_1.resolveExcelQualifiedTableFromRows)(String(connId), tableSelection, rows);
                        };
                        log("Resolviendo nombres de tablas físicas...");
                        const pPhysical = await resolvePhysical(primaryConnectionId, primaryTable);
                        const jPhysicals = await Promise.all(joins.map((jn, idx) => {
                            const secId = jn.secondaryConnectionId;
                            if (secId == null || String(secId).trim() === "") {
                                throw new Error(`Join ${idx}: secondaryConnectionId inválido al resolver tablas físicas.`);
                            }
                            return resolvePhysical(secId, jn.secondaryTable);
                        }));
                        log("Nombres de tablas físicas resueltos.", {
                            pPhysical,
                            jPhysicals,
                        });
                        const pQualified = quoteQualified(pPhysical, "postgres");
                        const jQualified = jPhysicals.map((q) => quoteQualified(q, "postgres"));
                        const isInternalImportIdCol = (c) => c.toLowerCase() === "_import_id";
                        const useKeysetPaging = !!body._materializationPrefix;
                        const selectParts = [];
                        let primaryCols = primaryColumns && primaryColumns.length > 0 ? primaryColumns : [];
                        if (primaryCols.length === 0) {
                            try {
                                primaryCols = (await getTableColumnsPg(client, pPhysical, "data_warehouse")).filter((c) => !isInternalImportIdCol(c));
                            }
                            catch (e) {
                                log("No se pudieron obtener columnas de la tabla principal, usando p.*", e instanceof Error ? { message: e.message } : { error: String(e) });
                            }
                        }
                        if (primaryCols.length > 0)
                            primaryCols.forEach((col) => selectParts.push(`p.${quoteIdent(col, "postgres")} AS "primary_${col.replace(/"/g, '""')}"`));
                        else
                            selectParts.push("p.*");
                        for (let idx = 0; idx < joins.length; idx++) {
                            const jn = joins[idx];
                            let secCols = jn.secondaryColumns && jn.secondaryColumns.length > 0 ? jn.secondaryColumns : [];
                            if (secCols.length === 0 && jPhysicals[idx]) {
                                try {
                                    secCols = (await getTableColumnsPg(client, jPhysicals[idx], "data_warehouse")).filter((c) => !isInternalImportIdCol(c));
                                }
                                catch (e) {
                                    log(`No se pudieron obtener columnas del join ${idx}, usando j${idx}.*`, e instanceof Error ? { message: e.message } : { error: String(e) });
                                }
                            }
                            if (secCols.length > 0)
                                secCols.forEach((col) => selectParts.push(`j${idx}.${quoteIdent(col, "postgres")} AS "join_${idx}_${col.replace(/"/g, '""')}"`));
                            else
                                selectParts.push(`j${idx}.*`);
                        }
                        if (useKeysetPaging) {
                            selectParts.push(`p."_import_id" AS "__biconic_cursor"`);
                        }
                        let fromJoin = `FROM ${pQualified} AS p`;
                        joins.forEach((jn, idx) => {
                            const jt = (jn.joinType || "INNER").toUpperCase();
                            const pairs = getJoinConditionPairs(jn);
                            if (pairs.length === 0)
                                throw new Error(`Join ${idx}: se requiere al menos una condición de enlace.`);
                            const onClauses = pairs.map(({ leftColumn: pc, rightColumn: sc }) => {
                                let leftAlias = "p";
                                let leftCol = (pc || "").trim();
                                if (leftCol.includes(".")) {
                                    if (/^primary\./i.test(leftCol)) {
                                        leftCol = leftCol.replace(/^primary\./i, "").trim();
                                    }
                                    else {
                                        const m = leftCol.match(/^join_(\d+)\.(.+)$/i);
                                        if (m) {
                                            const i = Number(m[1]);
                                            if (!Number.isNaN(i) && i >= 0 && i < idx) {
                                                leftAlias = `j${i}`;
                                                leftCol = m[2].trim();
                                            }
                                        }
                                    }
                                }
                                return `${leftAlias}.${quoteIdent(leftCol, "postgres")} = j${idx}.${quoteIdent((sc || "").trim(), "postgres")}`;
                            });
                            const on = onClauses.join(" AND ");
                            fromJoin += ` ${jt} JOIN ${jQualified[idx]} AS j${idx} ON ${on}`;
                        });
                        const normalizedConditions = normalizeStarConditions(conditions || [], joins.length);
                        const { clause, params } = buildWhereClausePgStar(normalizedConditions, joins.length);
                        if (body.dateFilter?.column?.trim()) {
                            const hasYears = Array.isArray(body.dateFilter.years) && body.dateFilter.years.length > 0;
                            const hasMonths = Array.isArray(body.dateFilter.months) && body.dateFilter.months.length > 0;
                            const hasExact = Array.isArray(body.dateFilter.exactDates) && body.dateFilter.exactDates.length > 0;
                            if (!hasYears && !hasMonths && !hasExact) {
                                log("Warning: Filtro por fecha sin años, meses ni fechas exactas.", { column: body.dateFilter.column });
                            }
                        }
                        const { clause: dfClause, params: dfParams } = (0, helpers_1.buildDateFilterWhereFragmentPg)(body.dateFilter, params.length + 1, "p.", joins.length);
                        const effectiveLimit = limit ?? 50;
                        const effectiveOffset = offset ?? 0;
                        let mergedClause = dfClause ? (clause ? `${clause} AND ${dfClause}` : `WHERE ${dfClause}`) : clause;
                        const mergedParams = [...params, ...dfParams];
                        let stableOrderBy;
                        let sql;
                        let sqlParams;
                        if (useKeysetPaging) {
                            mergedClause = mergedClause
                                ? `${mergedClause} AND p."_import_id" > $${mergedParams.length + 1}`
                                : `WHERE p."_import_id" > $${mergedParams.length + 1}`;
                            mergedParams.push(effectiveOffset);
                            stableOrderBy = `ORDER BY p."_import_id"`;
                            sql = `SELECT ${selectParts.join(", ")} ${fromJoin} ${mergedClause} ${stableOrderBy} LIMIT $${mergedParams.length + 1}`;
                            sqlParams = [...mergedParams, effectiveLimit];
                        }
                        else {
                            stableOrderBy = primaryCols.length > 0
                                ? `ORDER BY ${primaryCols.map((c) => `p.${quoteIdent(c, "postgres")}`).join(", ")}`
                                : "ORDER BY 1";
                            sql = `SELECT ${selectParts.join(", ")} ${fromJoin} ${mergedClause} ${stableOrderBy} LIMIT $${mergedParams.length + 1} OFFSET $${mergedParams.length + 2}`;
                            sqlParams = [...mergedParams, effectiveLimit, effectiveOffset];
                        }
                        log("Ejecutando consulta JOIN de Excel:", { sql, useKeysetPaging, params: sqlParams });
                        const resDb = await client.query(sql, sqlParams);
                        log(`Consulta de Excel ejecutada, ${resDb.rowCount} filas obtenidas.`);
                        if ((resDb.rows?.length ?? 0) === 0 && body.dateFilter?.column) {
                            log("Diagnóstico: 0 filas con filtro por fecha activo.", {
                                column: body.dateFilter.column,
                                years: body.dateFilter.years,
                            });
                        }
                        let totalOut = undefined;
                        if (count) {
                            const countClause = dfClause ? (clause ? `${clause} AND ${dfClause}` : `WHERE ${dfClause}`) : clause;
                            if (countMode === "exact") {
                                const countSql = `SELECT COUNT(*)::int as c ${fromJoin} ${countClause}`;
                                log("Ejecutando consulta de conteo de Excel:", {
                                    sql: countSql,
                                    params: [...params, ...dfParams],
                                });
                                const cntRes = await client.query(countSql, [...params, ...dfParams]);
                                totalOut = cntRes.rows?.[0]?.c ?? 0;
                                log(`Conteo de Excel ejecutado, total: ${totalOut}.`);
                            }
                            else {
                                const rowsLen = resDb.rows?.length ?? 0;
                                totalOut = rowsLen < effectiveLimit ? effectiveOffset + rowsLen : undefined;
                            }
                        }
                        let rowsOut = resDb.rows || [];
                        let nextCursor = effectiveOffset;
                        if (useKeysetPaging) {
                            rowsOut = rowsOut.map((r) => {
                                const cursorVal = r.__biconic_cursor;
                                if (typeof cursorVal === "number")
                                    nextCursor = cursorVal;
                                else if (typeof cursorVal === "string" && cursorVal.trim() !== "")
                                    nextCursor = Number(cursorVal);
                                const { __biconic_cursor, ...rest } = r;
                                return rest;
                            });
                        }
                        const jsonPayload = {
                            ok: true,
                            rows: rowsOut,
                            total: totalOut,
                        };
                        if (useKeysetPaging) {
                            jsonPayload.sourceExhausted = rowsOut.length < effectiveLimit;
                            jsonPayload.nextSourceOffset = rowsOut.length > 0 ? nextCursor : effectiveOffset;
                        }
                        else if (body.fromEtlRun === true) {
                            jsonPayload.sourceExhausted = rowsOut.length < effectiveLimit;
                            jsonPayload.nextSourceOffset = effectiveOffset + rowsOut.length;
                        }
                        return server_1.NextResponse.json(jsonPayload);
                    }
                    catch (e) {
                        log("Error durante la operación con JOIN de Excel.", {
                            message: e.message,
                            code: e.code,
                            stack: e.stack,
                        });
                        return server_1.NextResponse.json({ ok: false, error: `Error en JOIN de Excel: ${e.message}` }, { status: 500 });
                    }
                    finally {
                        log("Cerrando conexión a BD interna de Supabase.");
                        await client
                            .end()
                            .catch((err) => log("Error al cerrar cliente PG para Excel.", err instanceof Error ? { message: err.message } : { error: String(err) }));
                    }
                }
                else if (dbType === "postgres" || dbType === "postgresql") {
                    log("Detectado tipo 'postgres'. Iniciando flujo de JOIN externo.");
                    const password = body.password ||
                        (await getPasswordFromSecret(primaryConn.db_password_secret_id));
                    if (!password) {
                        log("Error: No se pudo obtener la contraseña para la conexión PostgreSQL.");
                        return server_1.NextResponse.json({ ok: false, error: "Contraseña requerida para la conexión" }, { status: 400 });
                    }
                    const pgConfig = {
                        host: primaryConn.db_host,
                        user: primaryConn.db_user,
                        database: primaryConn.db_name,
                        port: primaryConn.db_port || 5432,
                        password: password,
                        connectionTimeoutMillis: 8000,
                        statement_timeout: Math.max(60000, JOIN_INTERNAL_TIMEOUT_MS - 5000),
                        ssl: ssl ? { rejectUnauthorized: false } : undefined,
                    };
                    log("Configuración de conexión PostgreSQL:", {
                        ...pgConfig,
                        password: "[REDACTED]",
                    });
                    const client = new pg_1.Client(pgConfig);
                    try {
                        log("Intentando conectar a PostgreSQL externo...");
                        await client.connect();
                        log("Conexión a PostgreSQL externo establecida.");
                        const pQualified = quoteQualified(primaryTable, "postgres");
                        const jQualified = joins.map((jn) => quoteQualified(jn.secondaryTable || "", "postgres"));
                        const selectParts = [];
                        let primaryCols = primaryColumns && primaryColumns.length > 0 ? primaryColumns : [];
                        if (primaryCols.length === 0) {
                            try {
                                primaryCols = await getTableColumnsPg(client, primaryTable, "public");
                            }
                            catch (e) {
                                log("No se pudieron obtener columnas de la tabla principal, usando p.*", e instanceof Error ? { message: e.message } : { error: String(e) });
                            }
                        }
                        if (primaryCols.length > 0)
                            primaryCols.forEach((col) => selectParts.push(`p.${quoteIdent(col, "postgres")} AS "primary_${col.replace(/"/g, '""')}"`));
                        else
                            selectParts.push("p.*");
                        for (let idx = 0; idx < joins.length; idx++) {
                            const jn = joins[idx];
                            let secCols = jn.secondaryColumns && jn.secondaryColumns.length > 0 ? jn.secondaryColumns : [];
                            if (secCols.length === 0 && jn.secondaryTable) {
                                try {
                                    secCols = await getTableColumnsPg(client, jn.secondaryTable, "public");
                                }
                                catch (e) {
                                    log(`No se pudieron obtener columnas del join ${idx}, usando j${idx}.*`, e instanceof Error ? { message: e.message } : { error: String(e) });
                                }
                            }
                            if (secCols.length > 0)
                                secCols.forEach((col) => selectParts.push(`j${idx}.${quoteIdent(col, "postgres")} AS "join_${idx}_${col.replace(/"/g, '""')}"`));
                            else
                                selectParts.push(`j${idx}.*`);
                        }
                        let fromJoin = `FROM ${pQualified} AS p`;
                        joins.forEach((jn, idx) => {
                            const jt = (jn.joinType || "INNER").toUpperCase();
                            const pairs = getJoinConditionPairs(jn);
                            if (pairs.length === 0)
                                throw new Error(`Join ${idx}: se requiere al menos una condición de enlace.`);
                            const onClauses = pairs.map(({ leftColumn: pc, rightColumn: sc }) => {
                                let leftAlias = "p";
                                let leftCol = (pc || "").trim();
                                if (leftCol.includes(".")) {
                                    if (/^primary\./i.test(leftCol)) {
                                        leftCol = leftCol.replace(/^primary\./i, "").trim();
                                    }
                                    else {
                                        const m = leftCol.match(/^join_(\d+)\.(.+)$/i);
                                        if (m) {
                                            const i = Number(m[1]);
                                            if (!Number.isNaN(i) && i >= 0 && i < idx) {
                                                leftAlias = `j${i}`;
                                                leftCol = m[2].trim();
                                            }
                                        }
                                    }
                                }
                                return `${leftAlias}.${quoteIdent(leftCol, "postgres")} = j${idx}.${quoteIdent((sc || "").trim(), "postgres")}`;
                            });
                            const on = onClauses.join(" AND ");
                            fromJoin += ` ${jt} JOIN ${jQualified[idx]} AS j${idx} ON ${on}`;
                        });
                        const normalizedConditions = normalizeStarConditions(conditions || [], joins.length);
                        const { clause, params } = buildWhereClausePgStar(normalizedConditions, joins.length);
                        if (body.dateFilter?.column?.trim()) {
                            const hasYears = Array.isArray(body.dateFilter.years) && body.dateFilter.years.length > 0;
                            const hasMonths = Array.isArray(body.dateFilter.months) && body.dateFilter.months.length > 0;
                            const hasExact = Array.isArray(body.dateFilter.exactDates) && body.dateFilter.exactDates.length > 0;
                            if (!hasYears && !hasMonths && !hasExact) {
                                log("Warning: Filtro por fecha sin años, meses ni fechas exactas.", { column: body.dateFilter.column });
                            }
                        }
                        const { clause: dfClause, params: dfParams } = (0, helpers_1.buildDateFilterWhereFragmentPg)(body.dateFilter, params.length + 1, "p.", joins.length);
                        const mergedClause = dfClause ? (clause ? `${clause} AND ${dfClause}` : `WHERE ${dfClause}`) : clause;
                        const mergedParams = [...params, ...dfParams];
                        const stableOrderBy = primaryCols.length > 0
                            ? `ORDER BY ${primaryCols.map((c) => `p.${quoteIdent(c, "postgres")}`).join(", ")}`
                            : "ORDER BY 1";
                        const sql = `SELECT ${selectParts.join(", ")} ${fromJoin} ${mergedClause} ${stableOrderBy} LIMIT $${mergedParams.length + 1} OFFSET $${mergedParams.length + 2}`;
                        log("Ejecutando consulta de datos en PostgreSQL:", {
                            sql,
                            params: [...mergedParams, limit, offset],
                        });
                        const resDb = await client.query(sql, [...mergedParams, limit, offset]);
                        log(`Consulta de datos ejecutada, ${resDb.rowCount} filas obtenidas.`);
                        if ((resDb.rows?.length ?? 0) === 0 && body.dateFilter?.column) {
                            log("Diagnóstico: 0 filas con filtro por fecha activo.", {
                                column: body.dateFilter.column,
                                years: body.dateFilter.years,
                            });
                        }
                        let totalOut = undefined;
                        if (count) {
                            if (countMode === "exact") {
                                const countSql = `SELECT COUNT(*)::int as c ${fromJoin} ${mergedClause}`;
                                log("Ejecutando consulta de conteo en PostgreSQL:", {
                                    sql: countSql,
                                    params: mergedParams,
                                });
                                const cntRes = await client.query(countSql, mergedParams);
                                totalOut = cntRes.rows?.[0]?.c ?? 0;
                                log(`Consulta de conteo ejecutada, total: ${totalOut}.`);
                            }
                            else {
                                const rowsLen = resDb.rows?.length ?? 0;
                                totalOut = rowsLen < (limit ?? 0) ? (offset ?? 0) + rowsLen : undefined;
                            }
                        }
                        const rowsOut = resDb.rows || [];
                        const jsonPayload = {
                            ok: true,
                            rows: rowsOut,
                            total: totalOut,
                        };
                        if (body.fromEtlRun === true) {
                            jsonPayload.sourceExhausted = rowsOut.length < (limit ?? 50);
                            jsonPayload.nextSourceOffset = (offset ?? 0) + rowsOut.length;
                        }
                        return server_1.NextResponse.json(jsonPayload);
                    }
                    catch (e) {
                        log("Error durante la operación con PostgreSQL externo.", {
                            message: e.message,
                            code: e.code,
                            stack: e.stack,
                        });
                        return server_1.NextResponse.json({
                            ok: false,
                            error: `Error de base de datos externa: ${e.message}`,
                        }, { status: 500 });
                    }
                    finally {
                        log("Cerrando conexión a PostgreSQL externo.");
                        await client
                            .end()
                            .catch((err) => log("Error al cerrar cliente PG.", err instanceof Error ? { message: err.message } : { error: String(err) }));
                    }
                }
                else if (dbType === "mysql") {
                    log("Detectado tipo 'mysql'. Iniciando flujo de JOIN externo.");
                    const password = body.password ||
                        (await getPasswordFromSecret(primaryConn.db_password_secret_id));
                    if (!password) {
                        log("Error: No se pudo obtener la contraseña para la conexión MySQL.");
                        return server_1.NextResponse.json({ ok: false, error: "Contraseña requerida para la conexión" }, { status: 400 });
                    }
                    const mysqlConfig = {
                        host: primaryConn.db_host,
                        user: primaryConn.db_user,
                        database: primaryConn.db_name,
                        port: primaryConn.db_port || 3306,
                        password: password,
                        connectTimeout: 8000,
                        ssl: ssl ? { rejectUnauthorized: false } : undefined,
                    };
                    log("Configuración de conexión MySQL:", {
                        ...mysqlConfig,
                        password: "[REDACTED]",
                    });
                    let connection;
                    try {
                        log("Intentando conectar a MySQL externo...");
                        connection = await promise_1.default.createConnection(mysqlConfig);
                        log("Conexión a MySQL externo establecida.");
                        return server_1.NextResponse.json({
                            ok: false,
                            error: "La lógica para MySQL JOIN no está completamente implementada.",
                        }, { status: 501 });
                    }
                    catch (e) {
                        log("Error durante la operación con MySQL externo.", {
                            message: e.message,
                            code: e.code,
                            stack: e.stack,
                        });
                        return server_1.NextResponse.json({
                            ok: false,
                            error: `Error de base de datos externa: ${e.message}`,
                        }, { status: 500 });
                    }
                    finally {
                        log("Cerrando conexión a MySQL externo.");
                        if (connection)
                            await connection.end();
                    }
                }
                else {
                    log("Error: Tipo de base de datos no soportado en flujo star-schema.", {
                        dbType,
                    });
                    return server_1.NextResponse.json({
                        ok: false,
                        error: `Tipo de base de datos '${dbType}' no soportado`,
                    }, { status: 400 });
                }
            }
            log("Iniciando flujo de JOIN 'legacy' (binario).");
            log("Error: La petición no coincidió con ninguna ruta de ejecución (star o legacy).");
            return server_1.NextResponse.json({ ok: false, error: "Ruta de ejecución no encontrada." }, { status: 400 });
        }
        catch (err) {
            log("Error no capturado en el handler principal.", {
                message: err.message,
                stack: err.stack,
            });
            return server_1.NextResponse.json({ ok: false, error: err.message || "Error inesperado en el servidor" }, { status: 500 });
        }
    };
    return Promise.race([timeoutResponse, main()]);
}
//# sourceMappingURL=route.js.map