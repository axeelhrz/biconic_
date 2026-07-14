"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.filterRowsToUserTimeScope = filterRowsToUserTimeScope;
exports.resolveDashboardKpiMainValueForScope = resolveDashboardKpiMainValueForScope;
const compareMetricRows_1 = require("./compareMetricRows");
const compareDisplayKeys_1 = require("./compareDisplayKeys");
const dateFormatting_1 = require("./dateFormatting");
function collectAllowedYearsFromUserFilters(userFilters) {
    const years = new Set();
    for (const f of userFilters) {
        if (String(f.operator ?? "").toUpperCase() !== "YEAR")
            continue;
        const raw = f.value;
        if (raw == null || raw === "")
            continue;
        const parts = Array.isArray(raw) ? raw : [raw];
        for (const p of parts) {
            const n = Number(p);
            if (Number.isFinite(n) && n >= 1900 && n <= 2100)
                years.add(Math.round(n));
        }
    }
    return years.size > 0 ? years : null;
}
function collectAllowedYearMonthsFromUserFilters(userFilters) {
    const yms = new Set();
    for (const f of userFilters) {
        const op = String(f.operator ?? "").toUpperCase();
        if (op !== "MONTH" && op !== "YEAR_MONTH")
            continue;
        const raw = f.value;
        if (raw == null || raw === "")
            continue;
        const parts = Array.isArray(raw) ? raw : [raw];
        for (const p of parts) {
            const iso = (0, dateFormatting_1.parseIsoYearMonthForLabel)(p);
            if (iso) {
                yms.add(`${iso.year}-${String(iso.month).padStart(2, "0")}`);
                continue;
            }
            const s = String(p ?? "").trim();
            const m = /^(\d{4})-(\d{1,2})(?:-\d{1,2})?/.exec(s);
            if (m)
                yms.add(`${m[1]}-${String(Number(m[2])).padStart(2, "0")}`);
        }
    }
    return yms.size > 0 ? yms : null;
}
function filterRowsToUserTimeScope(rows, options) {
    if (!rows.length)
        return rows;
    const timeCol = options.timeColumn?.trim();
    if (!timeCol)
        return rows;
    const allowedYears = collectAllowedYearsFromUserFilters(options.userFilters);
    const allowedYearMonths = collectAllowedYearMonthsFromUserFilters(options.userFilters);
    if (!allowedYears && !allowedYearMonths)
        return rows;
    return rows.filter((row) => {
        const raw = (0, compareMetricRows_1.getRowValue)(row, timeCol);
        if (allowedYearMonths) {
            const iso = (0, dateFormatting_1.parseIsoYearMonthForLabel)(raw);
            const ym = iso
                ? `${iso.year}-${String(iso.month).padStart(2, "0")}`
                : (() => {
                    const s = String(raw ?? "").trim();
                    const m = /^(\d{4})-(\d{1,2})/.exec(s);
                    return m ? `${m[1]}-${String(Number(m[2])).padStart(2, "0")}` : "";
                })();
            if (ym)
                return allowedYearMonths.has(ym);
        }
        if (allowedYears) {
            const t = (0, compareMetricRows_1.compareBucketSortTime)(raw, options.granularity, options.parseOpts);
            if (!Number.isNaN(t)) {
                return allowedYears.has(new Date(t).getUTCFullYear());
            }
            const y = Number(String(raw ?? "").trim());
            if (Number.isFinite(y) && y >= 1900 && y <= 2100)
                return allowedYears.has(Math.round(y));
        }
        return true;
    });
}
function resolveDashboardKpiMainValueForScope(rows, yKey, scopeOptions) {
    const scoped = scopeOptions ? filterRowsToUserTimeScope(rows, scopeOptions) : rows;
    return (0, compareDisplayKeys_1.resolveDashboardKpiMainValue)(scoped, yKey);
}
//# sourceMappingURL=kpiFilterScope.js.map