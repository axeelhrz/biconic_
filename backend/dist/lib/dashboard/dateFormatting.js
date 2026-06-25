"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dateSlashOrderFromColumnFormat = dateSlashOrderFromColumnFormat;
exports.dateSlashOrderForNamedColumn = dateSlashOrderForNamedColumn;
exports.parseDateLike = parseDateLike;
exports.formatDateByGranularity = formatDateByGranularity;
exports.parseIsoYearMonthForLabel = parseIsoYearMonthForLabel;
exports.resolveMonthYearFromAmbiguousSlash = resolveMonthYearFromAmbiguousSlash;
exports.formatAnalysisDateForChart = formatAnalysisDateForChart;
function pad2(value) {
    return String(value).padStart(2, "0");
}
function safeDateFromParts(year, month1, day) {
    if (!Number.isFinite(year) || !Number.isFinite(month1) || !Number.isFinite(day))
        return null;
    if (month1 < 1 || month1 > 12 || day < 1 || day > 31)
        return null;
    const dt = new Date(Date.UTC(year, month1 - 1, day));
    if (Number.isNaN(dt.getTime()))
        return null;
    if (dt.getUTCFullYear() !== year || dt.getUTCMonth() !== month1 - 1 || dt.getUTCDate() !== day)
        return null;
    return dt;
}
function dateSlashOrderFromColumnFormat(format) {
    return String(format ?? "").trim() === "MM/DD/YYYY" ? "MDY" : "DMY";
}
function dateSlashOrderForNamedColumn(columnDisplay, columnName) {
    if (!columnName?.trim() || !columnDisplay)
        return "DMY";
    const t = columnName.trim();
    const direct = columnDisplay[t];
    if (direct)
        return dateSlashOrderFromColumnFormat(direct.format);
    const found = Object.entries(columnDisplay).find(([k]) => k.toLowerCase() === t.toLowerCase());
    return dateSlashOrderFromColumnFormat(found?.[1]?.format);
}
function parseAmbiguousSlashDate(a, b, year, order) {
    if (a > 12) {
        return safeDateFromParts(year, b, a);
    }
    if (b > 12) {
        return safeDateFromParts(year, a, b);
    }
    if (order === "MDY") {
        return safeDateFromParts(year, a, b);
    }
    return safeDateFromParts(year, b, a);
}
function parseDateLike(value, options) {
    const slashOrder = options?.slashDateOrder === "MDY" ? "MDY" : "DMY";
    if (value instanceof Date)
        return Number.isNaN(value.getTime()) ? null : value;
    if (typeof value === "number") {
        if (!Number.isFinite(value))
            return null;
        const dt = new Date(value > 1e12 ? value : value * 1000);
        return Number.isNaN(dt.getTime()) ? null : dt;
    }
    if (typeof value !== "string")
        return null;
    const raw = value.trim();
    if (!raw)
        return null;
    const my = raw.match(/^(\d{1,2})\/(\d{4})$/);
    if (my) {
        const month = Number(my[1]);
        const year = Number(my[2]);
        return safeDateFromParts(year, month, 1);
    }
    const myHyphen = raw.match(/^(\d{1,2})-(\d{4})$/);
    if (myHyphen) {
        const month = Number(myHyphen[1]);
        const year = Number(myHyphen[2]);
        return safeDateFromParts(year, month, 1);
    }
    const ym = raw.match(/^(\d{4})-(\d{1,2})$/);
    if (ym) {
        const year = Number(ym[1]);
        const month = Number(ym[2]);
        return safeDateFromParts(year, month, 1);
    }
    const slash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (slash) {
        const a = Number(slash[1]);
        const b = Number(slash[2]);
        const year = Number(slash[3]);
        return parseAmbiguousSlashDate(a, b, year, slashOrder);
    }
    const hyphenFull = raw.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
    if (hyphenFull) {
        const a = Number(hyphenFull[1]);
        const b = Number(hyphenFull[2]);
        const year = Number(hyphenFull[3]);
        return parseAmbiguousSlashDate(a, b, year, slashOrder);
    }
    const isoLike = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T].*)?$/);
    if (isoLike) {
        const year = Number(isoLike[1]);
        const month = Number(isoLike[2]);
        const day = Number(isoLike[3]);
        return safeDateFromParts(year, month, day);
    }
    const shortYear = raw.match(/^(\d{2})-(\d{2})-(\d{2})(?:[ T].*)?$/);
    if (shortYear) {
        const yy = Number(shortYear[1]);
        const year = yy >= 70 ? 1900 + yy : 2000 + yy;
        const month = Number(shortYear[2]);
        const day = Number(shortYear[3]);
        return safeDateFromParts(year, month, day);
    }
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}
function formatDateByGranularity(value, granularity, fallback, parseOpts) {
    const dt = parseDateLike(value, parseOpts);
    if (!dt)
        return fallback ?? null;
    const year = dt.getUTCFullYear();
    const month = dt.getUTCMonth() + 1;
    const day = dt.getUTCDate();
    if (granularity === "year")
        return String(year);
    if (granularity === "month")
        return `${year}-${pad2(month)}`;
    if (granularity === "quarter")
        return `T${Math.floor((month - 1) / 3) + 1}/${year}`;
    if (granularity === "semester")
        return `S${month <= 6 ? 1 : 2}/${year}`;
    return `${pad2(day)}/${pad2(month)}/${year}`;
}
const MONTH_NAMES_SHORT = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
function parseSlashMonthYearForLabel(raw) {
    const t = raw.trim().replace(/^\uFEFF/, "");
    const my = /^(\d{1,2})\/(\d{4})$/.exec(t);
    if (my) {
        const month = Number(my[1]);
        const year = Number(my[2]);
        if (month >= 1 && month <= 12 && year >= 1000 && year <= 9999)
            return { year, month };
    }
    const myH = /^(\d{1,2})-(\d{4})$/.exec(t);
    if (myH) {
        const month = Number(myH[1]);
        const year = Number(myH[2]);
        if (month >= 1 && month <= 12 && year >= 1000 && year <= 9999)
            return { year, month };
    }
    const ym = /^(\d{4})\/(\d{1,2})$/.exec(t);
    if (ym) {
        const year = Number(ym[1]);
        const month = Number(ym[2]);
        if (month >= 1 && month <= 12 && year >= 1000 && year <= 9999)
            return { year, month };
    }
    const ymH = /^(\d{4})-(\d{1,2})$/.exec(t);
    if (ymH) {
        const year = Number(ymH[1]);
        const month = Number(ymH[2]);
        if (month >= 1 && month <= 12 && year >= 1000 && year <= 9999)
            return { year, month };
    }
    return null;
}
function parseIsoYearMonthForLabel(value) {
    if (typeof value !== "string")
        return null;
    const raw = value.trim().replace(/^\uFEFF/, "");
    if (!raw)
        return null;
    const m = /^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?(?:[Tt ].*)?$/.exec(raw);
    if (!m)
        return null;
    const year = Number(m[1]);
    const month = Number(m[2]);
    if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12)
        return null;
    if (m[3] != null) {
        const day = Number(m[3]);
        if (!Number.isFinite(day) || day < 1 || day > 31)
            return null;
    }
    return { year, month };
}
function resolveMonthYearFromAmbiguousSlash(raw, parseOpts) {
    const t = raw.trim();
    const slash = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    const hyphen = slash ? null : t.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
    const parts = slash ?? hyphen;
    if (!parts)
        return null;
    const a = Number(parts[1]);
    const b = Number(parts[2]);
    const y = Number(parts[3]);
    if (![a, b, y].every((n) => Number.isFinite(n)))
        return null;
    if (a > 12 || b > 12)
        return null;
    const dmy = parseDateLike(t, { slashDateOrder: "DMY" });
    const mdy = parseDateLike(t, { slashDateOrder: "MDY" });
    if (!dmy || !mdy)
        return null;
    const dmyFirst = dmy.getUTCDate() === 1;
    const mdyFirst = mdy.getUTCDate() === 1;
    if (dmyFirst && !mdyFirst) {
        return { year: dmy.getUTCFullYear(), month: dmy.getUTCMonth() + 1 };
    }
    if (mdyFirst && !dmyFirst) {
        return { year: mdy.getUTCFullYear(), month: mdy.getUTCMonth() + 1 };
    }
    const preferred = parseDateLike(t, parseOpts);
    if (!preferred)
        return null;
    return { year: preferred.getUTCFullYear(), month: preferred.getUTCMonth() + 1 };
}
function formatAnalysisDateForChart(value, granularity, displayFormat, fallback, parseOpts) {
    if (displayFormat == null) {
        return formatDateByGranularity(value, granularity, fallback, parseOpts);
    }
    if (displayFormat === "monthYear") {
        const ymp = parseIsoYearMonthForLabel(value);
        if (ymp)
            return `${MONTH_NAMES_SHORT[ymp.month - 1] ?? ""} ${ymp.year}`.trim();
        if (typeof value === "string") {
            const slashMy = parseSlashMonthYearForLabel(value);
            if (slashMy)
                return `${MONTH_NAMES_SHORT[slashMy.month - 1] ?? ""} ${slashMy.year}`.trim();
            const slashYmp = resolveMonthYearFromAmbiguousSlash(value, parseOpts);
            if (slashYmp)
                return `${MONTH_NAMES_SHORT[slashYmp.month - 1] ?? ""} ${slashYmp.year}`.trim();
        }
        if (typeof value === "number" && Number.isFinite(value)) {
            const ms = value > 1e12 ? value : value * 1000;
            const nd = new Date(ms);
            if (!Number.isNaN(nd.getTime())) {
                const fromIso = parseIsoYearMonthForLabel(nd.toISOString());
                if (fromIso)
                    return `${MONTH_NAMES_SHORT[fromIso.month - 1] ?? ""} ${fromIso.year}`.trim();
                return `${MONTH_NAMES_SHORT[nd.getUTCMonth()] ?? ""} ${nd.getUTCFullYear()}`.trim();
            }
        }
        if (value instanceof Date && !Number.isNaN(value.getTime())) {
            const fromIso = parseIsoYearMonthForLabel(value.toISOString());
            if (fromIso)
                return `${MONTH_NAMES_SHORT[fromIso.month - 1] ?? ""} ${fromIso.year}`.trim();
            return `${MONTH_NAMES_SHORT[value.getUTCMonth()] ?? ""} ${value.getUTCFullYear()}`.trim();
        }
    }
    const dt = parseDateLike(value, parseOpts);
    if (!dt)
        return fallback ?? null;
    const year = dt.getUTCFullYear();
    const month = dt.getUTCMonth() + 1;
    const day = dt.getUTCDate();
    if (displayFormat === "year")
        return String(year);
    if (displayFormat === "monthYear")
        return `${MONTH_NAMES_SHORT[month - 1] ?? ""} ${year}`.trim();
    if (displayFormat === "datetime") {
        return `${pad2(day)}/${pad2(month)}/${year} ${pad2(dt.getUTCHours())}:${pad2(dt.getUTCMinutes())}`;
    }
    if (displayFormat === "short") {
        return `${pad2(day)}/${pad2(month)}/${year}`;
    }
    return formatDateByGranularity(value, granularity, fallback, parseOpts);
}
//# sourceMappingURL=dateFormatting.js.map