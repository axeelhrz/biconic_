"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.quoteIdent = quoteIdent;
exports.quoteQualified = quoteQualified;
exports.buildJoinClauseBinary = buildJoinClauseBinary;
exports.buildWhereClausePg = buildWhereClausePg;
exports.buildDateFilterWhereFragmentPg = buildDateFilterWhereFragmentPg;
exports.buildDateFilterWhereFragmentFirebird = buildDateFilterWhereFragmentFirebird;
exports.buildWhereClauseMy = buildWhereClauseMy;
exports.buildWhereClauseFirebird = buildWhereClauseFirebird;
exports.buildWhereClausePgStar = buildWhereClausePgStar;
exports.buildWhereClauseMyStar = buildWhereClauseMyStar;
function quoteIdent(name, dbType = "postgres") {
    if (!name)
        return dbType === "postgres" ? '""' : "``";
    return dbType === "postgres"
        ? `"${name.replace(/"/g, '""')}"`
        : `\`${name.replace(/`/g, "``")}\``;
}
function quoteQualified(qname, dbType = "postgres") {
    if (!qname)
        return quoteIdent("", dbType);
    const parts = qname.split(".");
    return parts.map((p) => quoteIdent(p, dbType)).join(".");
}
function buildJoinClauseBinary(joinConditions, dbType, rightQualified) {
    const jt = joinConditions[0]?.joinType || "INNER";
    const onExpr = joinConditions
        .map((jc) => `l.${quoteIdent(jc.leftColumn, dbType)} = r.${quoteIdent(jc.rightColumn, dbType)}`)
        .join(" AND ");
    return `${jt} JOIN ${rightQualified} AS r ON ${onExpr}`;
}
function buildWhereClausePg(conds = []) {
    const params = [];
    const parts = conds.map((c) => {
        const raw = c.column || "";
        const mLeft = raw.match(/^(left|l)\.(.+)$/i);
        const mRight = raw.match(/^(right|r)\.(.+)$/i);
        const col = mLeft
            ? `l.${quoteIdent(mLeft[2], "postgres")}`
            : mRight
                ? `r.${quoteIdent(mRight[2], "postgres")}`
                : quoteIdent(raw, "postgres");
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
            default:
                params.push(c.value ?? null);
                return `${col} ${c.operator} $${params.length}`;
        }
    });
    return { clause: parts.length ? `WHERE ${parts.join(" AND ")}` : "", params };
}
function buildDateFilterWhereFragmentPg(dateFilter, paramStartIndex, tablePrefix = "", joinsCount) {
    const params = [];
    const parts = [];
    if (!dateFilter)
        return { clause: "", params };
    const rawColumn = (dateFilter.column ?? "").trim();
    if (!rawColumn)
        return { clause: "", params };
    let col;
    if (joinsCount != null && joinsCount >= 0) {
        if (/^primary\./i.test(rawColumn)) {
            const name = rawColumn.replace(/^primary\./i, "").trim();
            col = `p.${quoteIdent(name, "postgres")}`;
        }
        else {
            const m = rawColumn.match(/^join_(\d+)\.(.+)$/i);
            if (m) {
                const i = Number(m[1]);
                const name = m[2].trim();
                if (!Number.isNaN(i) && i >= 0 && i < joinsCount)
                    col = `j${i}.${quoteIdent(name, "postgres")}`;
                else
                    col = tablePrefix + quoteIdent(rawColumn, "postgres");
            }
            else {
                col = tablePrefix + quoteIdent(rawColumn, "postgres");
            }
        }
    }
    else {
        col = tablePrefix + quoteIdent(rawColumn, "postgres");
    }
    const years = Array.isArray(dateFilter.years) ? dateFilter.years.map((y) => Number(y)).filter((n) => !Number.isNaN(n)) : [];
    const months = Array.isArray(dateFilter.months) ? dateFilter.months.map((m) => Number(m)).filter((n) => !Number.isNaN(n)) : [];
    const exactDates = Array.isArray(dateFilter.exactDates) ? dateFilter.exactDates.filter((d) => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d.trim())) : [];
    const colAsDate = `(${col})::date`;
    let idx = paramStartIndex;
    if (years.length && months.length) {
        const rangeParts = [];
        for (const y of years) {
            for (const m of months) {
                const start = `${y}-${String(m).padStart(2, "0")}-01`;
                const endMonth = m === 12 ? 1 : m + 1;
                const endYear = m === 12 ? y + 1 : y;
                const end = `${endYear}-${String(endMonth).padStart(2, "0")}-01`;
                params.push(start, end);
                rangeParts.push(`(${colAsDate} >= $${idx++}::date AND ${colAsDate} < $${idx++}::date)`);
            }
        }
        parts.push(rangeParts.length === 1 ? rangeParts[0] : `(${rangeParts.join(" OR ")})`);
    }
    else if (years.length) {
        const rangeParts = [];
        for (const y of years) {
            params.push(`${y}-01-01`, `${y + 1}-01-01`);
            rangeParts.push(`(${colAsDate} >= $${idx++}::date AND ${colAsDate} < $${idx++}::date)`);
        }
        parts.push(rangeParts.length === 1 ? rangeParts[0] : `(${rangeParts.join(" OR ")})`);
    }
    else if (months.length) {
        const placeholders = months.map(() => `$${idx++}`);
        months.forEach((m) => params.push(m));
        parts.push(`EXTRACT(MONTH FROM ${colAsDate}) IN (${placeholders.join(", ")})`);
    }
    if (exactDates.length) {
        const rangeParts = [];
        for (const d of exactDates) {
            params.push(d, d);
            rangeParts.push(`(${colAsDate} >= $${idx++}::date AND ${colAsDate} < $${idx++}::date + interval '1 day')`);
        }
        parts.push(rangeParts.length === 1 ? rangeParts[0] : `(${rangeParts.join(" OR ")})`);
    }
    if (parts.length === 0)
        return { clause: "", params };
    return { clause: parts.join(" AND "), params };
}
function firebirdDateDayExpr(quotedCol) {
    return `CAST(SUBSTRING(CAST(${quotedCol} AS VARCHAR(64)) FROM 1 FOR 10) AS DATE)`;
}
function buildDateFilterWhereFragmentFirebird(dateFilter) {
    const params = [];
    const parts = [];
    if (!dateFilter)
        return { clause: "", params };
    let rawColumn = (dateFilter.column ?? "").trim().replace(/^primary\./i, "").trim();
    rawColumn = rawColumn.replace(/^join_\d+\./i, "").trim();
    if (!rawColumn)
        return { clause: "", params };
    const col = firebirdQuotedIdent(rawColumn);
    const dayExpr = firebirdDateDayExpr(col);
    const years = Array.isArray(dateFilter.years) ? dateFilter.years.map((y) => Number(y)).filter((n) => !Number.isNaN(n)) : [];
    const months = Array.isArray(dateFilter.months) ? dateFilter.months.map((m) => Number(m)).filter((n) => !Number.isNaN(n)) : [];
    const exactDates = Array.isArray(dateFilter.exactDates) ? dateFilter.exactDates.filter((d) => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d.trim())) : [];
    if (years.length) {
        parts.push(`EXTRACT(YEAR FROM ${dayExpr}) IN (${years.map(() => "?").join(", ")})`);
        years.forEach((y) => params.push(y));
    }
    if (months.length) {
        parts.push(`EXTRACT(MONTH FROM ${dayExpr}) IN (${months.map(() => "?").join(", ")})`);
        months.forEach((m) => params.push(m));
    }
    if (exactDates.length) {
        parts.push(`${dayExpr} IN (${exactDates.map(() => "?").join(", ")})`);
        exactDates.forEach((d) => params.push(d.trim()));
    }
    if (parts.length === 0)
        return { clause: "", params };
    return { clause: parts.join(" AND "), params };
}
function buildWhereClauseMy(conds = []) {
    const params = [];
    const parts = conds.map((c) => {
        const raw = c.column || "";
        const mLeft = raw.match(/^(left|l)\.(.+)$/i);
        const mRight = raw.match(/^(right|r)\.(.+)$/i);
        const col = mLeft
            ? `l.${quoteIdent(mLeft[2], "mysql")}`
            : mRight
                ? `r.${quoteIdent(mRight[2], "mysql")}`
                : quoteIdent(raw, "mysql");
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
            default:
                params.push(c.value ?? null);
                return `${col} ${c.operator} ?`;
        }
    });
    return { clause: parts.length ? `WHERE ${parts.join(" AND ")}` : "", params };
}
function firebirdUnquotedIdent(name) {
    let s = (name || "").trim();
    s = s.replace(/^primary\./i, "").replace(/^join_\d+\./i, "").trim();
    s = s.replace(/[^A-Za-z0-9_]/g, "_").toUpperCase();
    return s || "COL";
}
function firebirdQuotedIdent(name) {
    let s = (name || "").trim();
    s = s.replace(/^primary\./i, "").replace(/^join_\d+\./i, "").trim();
    if (!s)
        return '"COL"';
    return `"${s.replace(/"/g, '""')}"`;
}
function buildWhereClauseFirebird(conds = []) {
    const params = [];
    const parts = conds.map((c) => {
        const col = firebirdQuotedIdent(c.column || "");
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
            default:
                params.push(c.value ?? null);
                return `${col} ${c.operator} ?`;
        }
    });
    return { clause: parts.length ? `WHERE ${parts.join(" AND ")}` : "", params };
}
function buildWhereClausePgStar(conds = [], joinsCount, strictPrefixed = false) {
    const params = [];
    const parts = conds.map((c) => {
        const raw = c.column || "";
        const mPrimary = raw.match(/^primary\.(.+)$/i);
        const mJoin = raw.match(/^join_(\d+)\.(.+)$/i);
        let col;
        if (mPrimary)
            col = `p.${quoteIdent(mPrimary[1], "postgres")}`;
        else if (mJoin) {
            const idx = Number(mJoin[1]);
            const name = mJoin[2];
            if (!Number.isNaN(idx) && idx >= 0 && idx < joinsCount)
                col = `j${idx}.${quoteIdent(name, "postgres")}`;
            else
                col = quoteIdent(raw, "postgres");
        }
        else {
            if (strictPrefixed) {
                throw new Error(`Filtro '${raw}' sin prefijo en JOIN. Use primary.<col> o join_n.<col>.`);
            }
            col = quoteIdent(raw, "postgres");
        }
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
            default:
                params.push(c.value ?? null);
                return `${col} ${c.operator} $${params.length}`;
        }
    });
    return { clause: parts.length ? `WHERE ${parts.join(" AND ")}` : "", params };
}
function buildWhereClauseMyStar(conds = [], joinsCount, strictPrefixed = false) {
    const params = [];
    const parts = conds.map((c) => {
        const raw = c.column || "";
        const mPrimary = raw.match(/^primary\.(.+)$/i);
        const mJoin = raw.match(/^join_(\d+)\.(.+)$/i);
        let col;
        if (mPrimary)
            col = `p.${quoteIdent(mPrimary[1], "mysql")}`;
        else if (mJoin) {
            const idx = Number(mJoin[1]);
            const name = mJoin[2];
            if (!Number.isNaN(idx) && idx >= 0 && idx < joinsCount)
                col = `j${idx}.${quoteIdent(name, "mysql")}`;
            else
                col = quoteIdent(raw, "mysql");
        }
        else {
            if (strictPrefixed) {
                throw new Error(`Filtro '${raw}' sin prefijo en JOIN. Use primary.<col> o join_n.<col>.`);
            }
            col = quoteIdent(raw, "mysql");
        }
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
            default:
                params.push(c.value ?? null);
                return `${col} ${c.operator} ?`;
        }
    });
    return { clause: parts.length ? `WHERE ${parts.join(" AND ")}` : "", params };
}
//# sourceMappingURL=helpers.js.map