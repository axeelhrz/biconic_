"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildMonthFilterSqlClause = buildMonthFilterSqlClause;
function buildMonthFilterSqlClause(fieldExpression, value) {
    const yearMonthClause = (raw) => {
        const t = String(raw ?? "").trim();
        let match = /^(\d{4})-(\d{1,2})$/.exec(t);
        if (!match) {
            match = /^(\d{4})-(\d{1,2})(?:-\d{1,2})?(?:[Tt ].*)?$/.exec(t);
        }
        if (!match)
            return null;
        const y = parseInt(match[1], 10);
        const m = parseInt(match[2], 10);
        if (m < 1 || m > 12 || y < 1900 || y > 2100)
            return null;
        return `(EXTRACT(YEAR FROM ${fieldExpression}) = ${y} AND EXTRACT(MONTH FROM ${fieldExpression}) = ${m})`;
    };
    if (Array.isArray(value)) {
        const ymParts = [];
        const monthOnly = [];
        for (const v of value) {
            const ym = yearMonthClause(String(v ?? ""));
            if (ym) {
                ymParts.push(ym);
                continue;
            }
            const n = Number(v);
            if (!Number.isNaN(n) && n >= 1 && n <= 12)
                monthOnly.push(Math.round(n));
        }
        const uniqueMonths = [...new Set(monthOnly)];
        const parts = [...ymParts];
        if (uniqueMonths.length > 0) {
            if (uniqueMonths.length === 1) {
                parts.push(`EXTRACT(MONTH FROM ${fieldExpression}) = ${uniqueMonths[0]}`);
            }
            else {
                parts.push(`EXTRACT(MONTH FROM ${fieldExpression}) IN (${uniqueMonths.join(", ")})`);
            }
        }
        if (parts.length === 0)
            return "TRUE";
        if (parts.length === 1)
            return parts[0];
        return `(${parts.join(" OR ")})`;
    }
    const ym = yearMonthClause(String(value ?? ""));
    if (ym)
        return ym;
    const n = Number(value);
    if (!Number.isNaN(n) && n >= 1 && n <= 12) {
        return `EXTRACT(MONTH FROM ${fieldExpression}) = ${Math.round(n)}`;
    }
    return "TRUE";
}
//# sourceMappingURL=monthFilterSql.js.map