"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeAggregationCompare = normalizeAggregationCompare;
exports.getComparePeriodSource = getComparePeriodSource;
exports.deriveLegacyTransformCompare = deriveLegacyTransformCompare;
function parsePeriodSource(raw) {
    if (raw === "dashboard" || raw === "widget" || raw === "fixed" || raw === "data_max")
        return raw;
    return undefined;
}
const VALID_GRAN = ["day", "week", "month", "quarter", "semester", "year"];
function asGranularity(v) {
    const g = (v || "month").toLowerCase().replace(/[^a-z]/g, "");
    return VALID_GRAN.includes(g) ? g : "month";
}
function isCompareTemporalMode(v) {
    return (v === "prev_bucket" ||
        v === "same_period_prior_year" ||
        v === "calendar_prev_day" ||
        v === "calendar_prev_week" ||
        v === "calendar_prev_month" ||
        v === "calendar_prev_year");
}
function parseCompareSpecObject(raw) {
    if (!raw || typeof raw !== "object")
        return null;
    const o = raw;
    const kind = o.kind;
    if (kind === "none")
        return { kind: "none" };
    if (kind === "fixed" && typeof o.value === "number" && Number.isFinite(o.value)) {
        return { kind: "fixed", value: o.value };
    }
    if (kind === "column" && typeof o.refColumn === "string" && o.refColumn.trim()) {
        return { kind: "column", refColumn: o.refColumn.trim() };
    }
    if (kind === "temporal") {
        const mode = typeof o.mode === "string" ? o.mode : "";
        const timeColumn = typeof o.timeColumn === "string" ? o.timeColumn.trim() : "";
        if (!isCompareTemporalMode(mode) || !timeColumn)
            return null;
        return {
            kind: "temporal",
            mode,
            timeColumn,
            granularity: asGranularity(typeof o.granularity === "string" ? o.granularity : undefined),
            ...(() => {
                const ps = parsePeriodSource(o.periodSource);
                return ps ? { periodSource: ps } : {};
            })(),
        };
    }
    if (kind === "average") {
        const scope = o.scope === "partition" ? "partition" : "global";
        const parts = Array.isArray(o.partitionDimensions)
            ? o.partitionDimensions.filter((x) => typeof x === "string" && x.trim() !== "").map((x) => x.trim())
            : [];
        return { kind: "average", scope, partitionDimensions: scope === "partition" ? parts : [] };
    }
    if (kind === "total_share") {
        const parts = Array.isArray(o.partitionDimensions)
            ? o.partitionDimensions.filter((x) => typeof x === "string" && x.trim() !== "").map((x) => x.trim())
            : [];
        return { kind: "total_share", partitionDimensions: parts };
    }
    if (kind === "cumulative") {
        const mode = o.mode;
        const timeColumn = typeof o.timeColumn === "string" ? o.timeColumn.trim() : "";
        if ((mode !== "month_vs_ytd" && mode !== "vs_prior_year_ytd" && mode !== "ytd_running") ||
            !timeColumn)
            return null;
        return {
            kind: "cumulative",
            mode,
            timeColumn,
            granularity: asGranularity(typeof o.granularity === "string" ? o.granularity : undefined),
            ...(() => {
                const ps = parsePeriodSource(o.periodSource);
                return ps ? { periodSource: ps } : {};
            })(),
        };
    }
    return null;
}
function normalizeAggregationCompare(input) {
    const parsed = parseCompareSpecObject(input.compare);
    if (parsed)
        return parsed;
    const fixedFromBody = input.compareFixedValue != null && typeof input.compareFixedValue === "number" && Number.isFinite(input.compareFixedValue)
        ? input.compareFixedValue
        : null;
    if (fixedFromBody != null)
        return { kind: "fixed", value: fixedFromBody };
    if (input.transformCompare === "fixed" && input.transformCompareFixedValue) {
        const v = Number.parseFloat(String(input.transformCompareFixedValue));
        if (Number.isFinite(v))
            return { kind: "fixed", value: v };
    }
    const timeField = (input.dateGroupBy?.field || input.dateDimension || "").trim();
    const gran = asGranularity(input.dateGroupBy?.granularity);
    const hasDateGroupBy = Boolean(input.dateGroupBy?.field?.trim());
    if (input.transformCompare === "mom" || input.comparePeriod === "previous_month") {
        if (hasDateGroupBy && timeField) {
            return { kind: "temporal", mode: "prev_bucket", timeColumn: timeField, granularity: gran };
        }
        if (timeField || input.dateDimension) {
            return {
                kind: "temporal",
                mode: "calendar_prev_month",
                timeColumn: timeField || String(input.dateDimension || "").trim(),
                granularity: gran,
            };
        }
    }
    if (input.transformCompare === "yoy" || input.comparePeriod === "previous_year") {
        if (hasDateGroupBy && timeField) {
            return { kind: "temporal", mode: "same_period_prior_year", timeColumn: timeField, granularity: gran };
        }
        if (timeField || input.dateDimension) {
            return {
                kind: "temporal",
                mode: "calendar_prev_year",
                timeColumn: timeField || String(input.dateDimension || "").trim(),
                granularity: gran,
            };
        }
    }
    return { kind: "none" };
}
function getComparePeriodSource(spec, aggComparePeriodSource) {
    if (aggComparePeriodSource === "dashboard" || aggComparePeriodSource === "widget" || aggComparePeriodSource === "fixed" || aggComparePeriodSource === "data_max") {
        return aggComparePeriodSource;
    }
    if (spec.kind === "temporal" && spec.periodSource)
        return spec.periodSource;
    if (spec.kind === "cumulative" && spec.periodSource)
        return spec.periodSource;
    return "dashboard";
}
function deriveLegacyTransformCompare(spec) {
    if (spec.kind === "fixed")
        return "fixed";
    if (spec.kind === "temporal" && spec.mode === "same_period_prior_year")
        return "yoy";
    if (spec.kind === "temporal")
        return "mom";
    return "none";
}
//# sourceMappingURL=compareSpec.js.map