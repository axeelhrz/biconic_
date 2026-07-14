"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildFirebirdStarStreamSql = buildFirebirdStarStreamSql;
exports.streamFirebirdStarJoin = streamFirebirdStarJoin;
const helpers_1 = require("../sql/helpers");
const fbTablePart = (table) => {
    const t = (table || "").trim();
    if (t.includes("."))
        return (t.split(".").pop() || t).trim().toUpperCase();
    return /^[A-Z0-9_]+$/i.test(t) ? t.toUpperCase() : `"${t.replace(/"/g, '""')}"`;
};
const fbColPart = (col) => {
    const c = (col || "").trim();
    return /^[A-Z0-9_]+$/i.test(c) ? c.toUpperCase() : `"${c.replace(/"/g, '""')}"`;
};
const escapeFbLiteral = (v) => {
    if (v == null || v === "")
        return "NULL";
    if (typeof v === "boolean")
        return v ? "1" : "0";
    if (typeof v === "number" && !Number.isNaN(v)) {
        return Number.isInteger(v) ? String(v) : `CAST('${String(v)}' AS DOUBLE PRECISION)`;
    }
    if (typeof v === "string" && /^-?\d+\.\d+$/.test(v.trim())) {
        return `CAST('${v.trim().replace(/'/g, "''")}' AS DOUBLE PRECISION)`;
    }
    return `'${String(v).replace(/'/g, "''")}'`;
};
const inlineFbParams = (sql, params) => {
    let out = sql;
    for (const p of params) {
        const pos = out.indexOf("?");
        if (pos === -1)
            break;
        out = out.slice(0, pos) + escapeFbLiteral(p) + out.slice(pos + 1);
    }
    return out;
};
const normalizeKey = (k) => String(k || "").replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase();
function getPairs(jn) {
    if (Array.isArray(jn.conditions) && jn.conditions.length > 0) {
        return jn.conditions
            .map((c) => ({
            leftColumn: String(c?.primaryColumn ?? "").trim(),
            rightColumn: String(c?.secondaryColumn ?? "").trim(),
        }))
            .filter((p) => p.leftColumn || p.rightColumn);
    }
    const pc = String(jn.primaryColumn ?? "").trim();
    const sc = String(jn.secondaryColumn ?? "").trim();
    if (pc || sc)
        return [{ leftColumn: pc, rightColumn: sc }];
    return [];
}
function buildFirebirdStarStreamSql(opts) {
    const { primaryTable, primaryColumns, joins, conditions, dateFilter } = opts;
    const selectParts = [];
    if (primaryColumns.length > 0) {
        primaryColumns.forEach((col) => {
            selectParts.push(`p.${fbColPart(col)} AS "primary_${normalizeKey(col)}"`);
        });
    }
    else {
        selectParts.push("p.*");
    }
    joins.forEach((jn, idx) => {
        const secCols = Array.isArray(jn.secondaryColumns) ? jn.secondaryColumns : [];
        if (secCols.length > 0) {
            secCols.forEach((col) => {
                selectParts.push(`j${idx}.${fbColPart(col)} AS "join_${idx}_${normalizeKey(col)}"`);
            });
        }
        else {
            selectParts.push(`j${idx}.*`);
        }
    });
    let fromJoin = `FROM ${fbTablePart(primaryTable)} p`;
    joins.forEach((jn, idx) => {
        const jt = (jn.joinType || "INNER").toUpperCase();
        const pairs = getPairs(jn);
        if (pairs.length === 0) {
            throw new Error(`Join ${idx}: se requiere al menos una condición de enlace.`);
        }
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
            return `${leftAlias}.${fbColPart(leftCol)} = j${idx}.${fbColPart((sc || "").trim())}`;
        });
        fromJoin += ` ${jt} JOIN ${fbTablePart(jn.secondaryTable || "")} j${idx} ON ${onClauses.join(" AND ")}`;
    });
    const { clause: condClause, params: condParams } = (0, helpers_1.buildWhereClauseFirebirdStar)(conditions, joins.length);
    const { clause: dfClause, params: dfParams } = (0, helpers_1.buildDateFilterWhereFragmentFirebirdStar)(dateFilter ?? undefined, joins.length);
    const whereParts = [];
    if (condClause)
        whereParts.push(condClause.replace(/^WHERE\s+/i, ""));
    if (dfClause)
        whereParts.push(dfClause);
    const whereClause = whereParts.length ? ` WHERE ${whereParts.join(" AND ")}` : "";
    return inlineFbParams(`SELECT ${selectParts.join(", ")} ${fromJoin}${whereClause}`, [...condParams, ...dfParams]);
}
const PROGRESS_EVERY_ROWS = 25_000;
async function* streamFirebirdStarJoin(opts) {
    const batchSize = Math.max(1, opts.batchSize ?? 20_000);
    const sql = buildFirebirdStarStreamSql(opts);
    const Firebird = require("node-firebird");
    const db = await new Promise((resolve, reject) => {
        Firebird.attach(opts.attachOptions, (err, connection) => {
            if (err)
                reject(err);
            else
                resolve(connection);
        });
    });
    const ready = [];
    let currentBatch = [];
    let finished = false;
    let streamError = null;
    let wake = null;
    let totalRows = 0;
    let lastProgress = 0;
    const notify = () => {
        if (wake) {
            const w = wake;
            wake = null;
            w();
        }
    };
    const onRow = (row) => {
        const normalized = {};
        for (const k of Object.keys(row || {}))
            normalized[normalizeKey(k)] = row[k];
        currentBatch.push(normalized);
        totalRows++;
        if (currentBatch.length >= batchSize) {
            ready.push(currentBatch);
            currentBatch = [];
            notify();
        }
        if (opts.onProgress && totalRows - lastProgress >= PROGRESS_EVERY_ROWS) {
            lastProgress = totalRows;
            try {
                opts.onProgress(totalRows);
            }
            catch {
            }
        }
    };
    const onDone = (err) => {
        if (err)
            streamError = err;
        if (currentBatch.length > 0) {
            ready.push(currentBatch);
            currentBatch = [];
        }
        finished = true;
        notify();
    };
    db.sequentially(sql, [], onRow, onDone);
    try {
        for (;;) {
            while (ready.length === 0 && !finished) {
                await new Promise((resolve) => {
                    wake = resolve;
                });
            }
            while (ready.length > 0) {
                yield ready.shift();
            }
            if (finished) {
                if (streamError)
                    throw streamError;
                if (ready.length === 0)
                    break;
            }
        }
    }
    finally {
        try {
            if (db?.detach)
                db.detach(() => { });
        }
        catch {
        }
    }
}
//# sourceMappingURL=firebird-star-stream.js.map