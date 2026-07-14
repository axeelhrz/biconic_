"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.shiftCalendarYearMonth = shiftCalendarYearMonth;
exports.expandAggregationFiltersForTemporalCompare = expandAggregationFiltersForTemporalCompare;
const compareSpec_1 = require("./compareSpec");
const dateFormatting_1 = require("./dateFormatting");
function normFieldKey(field) {
    return String(field ?? "").trim().toLowerCase().replace(/\s+/g, "");
}
function fieldsMatch(a, b) {
    return normFieldKey(a) === normFieldKey(b);
}
function filterFieldMatchesCompareAxis(filterField, compareField, relatedFields) {
    if (fieldsMatch(filterField, compareField))
        return true;
    return (relatedFields ?? []).some((r) => fieldsMatch(filterField, r));
}
function shiftCalendarYearMonth(year, month1, deltaMonths) {
    const idx = year * 12 + (month1 - 1) + deltaMonths;
    return { year: Math.floor(idx / 12), month1: (idx % 12) + 1 };
}
function ymKey(y, m) {
    return `${y}-${String(m).padStart(2, "0")}`;
}
function collectYearMonthsFromUnknown(value) {
    if (value === "" || value == null)
        return [];
    const parts = Array.isArray(value) ? value : [value];
    const out = [];
    for (const p of parts) {
        const iso = (0, dateFormatting_1.parseIsoYearMonthForLabel)(p);
        if (iso) {
            out.push({ year: iso.year, month1: iso.month });
            continue;
        }
        const s = String(p ?? "").trim();
        const mIso = /^(\d{4})-(\d{1,2})(?:-\d{1,2})?(?:[Tt ].*)?$/.exec(s);
        if (mIso) {
            const y = Number(mIso[1]);
            const mo = Number(mIso[2]);
            if (y >= 1900 && y <= 2100 && mo >= 1 && mo <= 12)
                out.push({ year: y, month1: mo });
        }
    }
    return out;
}
function modeNeedsPriorCalendarBucket(mode) {
    return (mode === "prev_bucket" ||
        mode === "calendar_prev_month" ||
        mode === "calendar_prev_week" ||
        mode === "calendar_prev_day");
}
function modeNeedsPriorYearSameBucket(mode) {
    return mode === "same_period_prior_year" || mode === "calendar_prev_year";
}
function expandAggregationFiltersForTemporalCompare(filters, options) {
    const { compareField, compareSpec } = options;
    const related = options.relatedDateFields ?? [];
    const periodSource = options.periodSource ?? (0, compareSpec_1.getComparePeriodSource)(compareSpec, options.aggComparePeriodSource);
    if (periodSource === "fixed" || periodSource === "data_max") {
        return filters.map((f) => ({ ...f }));
    }
    if (compareSpec.kind !== "temporal") {
        return filters.map((f) => ({ ...f }));
    }
    const mode = compareSpec.mode;
    const gran = compareSpec.granularity;
    const wantPrev = modeNeedsPriorCalendarBucket(mode);
    const wantYoy = modeNeedsPriorYearSameBucket(mode);
    if (!wantPrev && !wantYoy) {
        return filters.map((f) => ({ ...f }));
    }
    if (gran !== "month") {
        return filters.map((f) => ({ ...f }));
    }
    return filters.map((f) => {
        const field = String(f.field ?? "").trim();
        if (!field || !filterFieldMatchesCompareAxis(field, compareField, related))
            return { ...f };
        const op = String(f.operator ?? "").toUpperCase().trim();
        if (op === "MONTH" || op === "YEAR_MONTH") {
            const yms = collectYearMonthsFromUnknown(f.value);
            if (yms.length === 0)
                return { ...f };
            const keys = new Set();
            for (const { year, month1 } of yms) {
                keys.add(ymKey(year, month1));
                if (wantPrev) {
                    const p = shiftCalendarYearMonth(year, month1, -1);
                    keys.add(ymKey(p.year, p.month1));
                }
                if (wantYoy) {
                    keys.add(ymKey(year - 1, month1));
                }
            }
            const merged = [...keys].sort();
            return { ...f, value: merged.length === 1 ? merged[0] : merged };
        }
        if (op === "YEAR" && wantYoy) {
            const raw = f.value;
            const nums = [];
            const parts = Array.isArray(raw) ? raw : [raw];
            for (const p of parts) {
                const n = Number(p);
                if (Number.isFinite(n) && n >= 1900 && n <= 2100)
                    nums.push(Math.round(n));
            }
            if (nums.length === 0)
                return { ...f };
            const set = new Set(nums);
            for (const y of nums)
                set.add(y - 1);
            const merged = [...set].sort((a, b) => a - b);
            return { ...f, value: merged.length === 1 ? merged[0] : merged };
        }
        if (op === "BETWEEN" && wantPrev) {
            let from;
            let to;
            const v = f.value;
            if (Array.isArray(v) && v.length >= 2) {
                [from, to] = v;
            }
            else if (v && typeof v === "object") {
                from = v.from;
                to = v.to;
            }
            else {
                return { ...f };
            }
            const fs = String(from ?? "").trim();
            const ts = String(to ?? "").trim();
            if (!/^\d{4}-\d{2}-\d{2}$/.test(fs) || !/^\d{4}-\d{2}-\d{2}$/.test(ts))
                return { ...f };
            const d0 = new Date(`${fs}T00:00:00Z`);
            d0.setUTCMonth(d0.getUTCMonth() - 1);
            const pad = (n) => String(n).padStart(2, "0");
            const newFrom = `${d0.getUTCFullYear()}-${pad(d0.getUTCMonth() + 1)}-${pad(d0.getUTCDate())}`;
            if (newFrom === fs)
                return { ...f };
            return { ...f, value: Array.isArray(v) ? [newFrom, ts] : { ...v, from: newFrom, to: ts } };
        }
        return { ...f };
    });
}
//# sourceMappingURL=expandAggregationFiltersForCompare.js.map