"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DATE_OPERATORS_WITH_MULTI_VALUE_SQL = void 0;
exports.expandMonthFilterValueWithYear = expandMonthFilterValueWithYear;
exports.expandMonthValueWithYearFromFilters = expandMonthValueWithYearFromFilters;
exports.DATE_OPERATORS_WITH_MULTI_VALUE_SQL = new Set([
    "YEAR",
    "MONTH",
    "QUARTER",
    "SEMESTER",
    "YEAR_MONTH",
]);
const YM_RE = /^(\d{4})-(\d{1,2})$/;
function normFieldKey(field) {
    return String(field ?? "").trim().toLowerCase();
}
function pad2(n) {
    return String(n).padStart(2, "0");
}
function resolveFilterValue(gf, filterValues) {
    return filterValues[gf.id] !== undefined ? filterValues[gf.id] : gf.value;
}
function collectYearsFromValue(raw, inputType) {
    if (raw === "" || raw == null)
        return [];
    const list = Array.isArray(raw) ? raw : inputType === "multi" ? [raw] : [raw];
    const years = [];
    for (const x of list) {
        const n = Number(x);
        if (Number.isFinite(n) && n >= 1900 && n <= 2100)
            years.push(Math.round(n));
    }
    return [...new Set(years)];
}
function expandMonthFilterValueWithYear(globalFilters, filterValues, ctx) {
    if (String(ctx.operator ?? "").toUpperCase() !== "MONTH")
        return ctx.value;
    const rawVal = ctx.value;
    if (rawVal === "" || rawVal == null)
        return rawVal;
    const parts = Array.isArray(rawVal) ? rawVal : [rawVal];
    if (parts.length === 0)
        return rawVal;
    const monthNums = [];
    const ctxField = normFieldKey(ctx.field);
    for (const p of parts) {
        const s = String(p ?? "").trim();
        if (YM_RE.test(s) || /^\d{4}-\d{1,2}(?:-\d{1,2})?(?:[Tt ].*)?$/.test(s)) {
            return rawVal;
        }
        const n = Number(p);
        if (Number.isFinite(n) && n >= 1 && n <= 12)
            monthNums.push(Math.round(n));
        else {
            return rawVal;
        }
    }
    if (monthNums.length === 0)
        return rawVal;
    const uniqueMonths = [...new Set(monthNums)];
    const yearFilter = globalFilters.find((g) => normFieldKey(g.field) === ctxField && String(g.operator ?? "").toUpperCase() === "YEAR");
    if (!yearFilter)
        return rawVal;
    const yRaw = resolveFilterValue(yearFilter, filterValues);
    const years = collectYearsFromValue(yRaw, yearFilter.inputType);
    if (years.length === 0)
        return rawVal;
    const out = [];
    for (const y of years) {
        for (const m of uniqueMonths) {
            out.push(`${y}-${pad2(m)}`);
        }
    }
    return out;
}
function expandMonthValueWithYearFromFilters(field, monthValue, allFilters) {
    if (String(monthValue ?? "") === "")
        return monthValue;
    const parts = Array.isArray(monthValue) ? monthValue : [monthValue];
    if (parts.length === 0)
        return monthValue;
    const fk = normFieldKey(field);
    const monthNums = [];
    for (const p of parts) {
        const s = String(p ?? "").trim();
        if (YM_RE.test(s) || /^\d{4}-\d{1,2}(?:-\d{1,2})?(?:[Tt ].*)?$/.test(s))
            return monthValue;
        const n = Number(p);
        if (Number.isFinite(n) && n >= 1 && n <= 12)
            monthNums.push(Math.round(n));
        else
            return monthValue;
    }
    if (monthNums.length === 0)
        return monthValue;
    const uniqueMonths = [...new Set(monthNums)];
    const yearFilter = allFilters.find((g) => normFieldKey(g.field) === fk && String(g.operator ?? "").toUpperCase() === "YEAR");
    if (!yearFilter || yearFilter.value === "" || yearFilter.value == null)
        return monthValue;
    const years = collectYearsFromValue(yearFilter.value, undefined);
    if (years.length === 0)
        return monthValue;
    const out = [];
    for (const y of years) {
        for (const m of uniqueMonths) {
            out.push(`${y}-${pad2(m)}`);
        }
    }
    return out;
}
//# sourceMappingURL=expandMonthFilterWithYear.js.map