"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeComparePlacements = normalizeComparePlacements;
exports.placementEnabled = placementEnabled;
exports.resolveShowCardHeaderStrip = resolveShowCardHeaderStrip;
exports.compareNeedsTimeGroupedRows = compareNeedsTimeGroupedRows;
exports.getCompareColumnKeys = getCompareColumnKeys;
exports.readComparePresentation = readComparePresentation;
exports.resolveDashboardKpiMainValue = resolveDashboardKpiMainValue;
exports.pickDashboardKpiCompareRow = pickDashboardKpiCompareRow;
exports.kpiCompareRowsFingerprint = kpiCompareRowsFingerprint;
exports.compareTrendTone = compareTrendTone;
exports.formatDashboardCompareText = formatDashboardCompareText;
exports.legacyCompareInputFromWidgetAgg = legacyCompareInputFromWidgetAgg;
exports.buildCompareTooltipLineFromAgg = buildCompareTooltipLineFromAgg;
exports.compareKindBadgeLabel = compareKindBadgeLabel;
exports.resolveWidgetCompareStatus = resolveWidgetCompareStatus;
const compareSpec_1 = require("./compareSpec");
const ensureDashboardCompareUi_1 = require("./ensureDashboardCompareUi");
const compareMetricRows_1 = require("./compareMetricRows");
const chartOptions_1 = require("./chartOptions");
const dateGroupBySourceField_1 = require("./dateGroupBySourceField");
const kpiFilterScope_1 = require("./kpiFilterScope");
function toNum(v) {
    if (v == null || v === "")
        return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}
function normalizeComparePlacements(raw) {
    if (raw == null)
        return ["kpi_below"];
    return Array.isArray(raw) ? raw : [raw];
}
function placementEnabled(ui, p) {
    if (!ui?.enabled)
        return false;
    return normalizeComparePlacements(ui.placement).includes(p);
}
function resolveShowCardHeaderStrip(params) {
    const { compareUi, dashboardDefaults, compareInheritDashboard } = params;
    if (compareUi?.showCardHeaderStrip === false)
        return false;
    if (compareUi?.showCardHeaderStrip === true)
        return true;
    const inherit = compareInheritDashboard !== false;
    if (inherit && dashboardDefaults?.showCardHeaderStrip === false)
        return false;
    return true;
}
function compareNeedsTimeGroupedRows(spec) {
    switch (spec.kind) {
        case "none":
            return false;
        case "fixed":
        case "column":
            return false;
        case "temporal":
        case "cumulative":
            return true;
        case "average":
            return spec.scope === "partition";
        case "total_share":
            return false;
        default:
            return false;
    }
}
function getCompareColumnKeys(spec, metricAlias, row) {
    const k = (0, compareMetricRows_1.resolveRowColumnKey)(row, metricAlias);
    if (!k || spec.kind === "none") {
        return {
            resolvedMetricKey: k,
            referenceKey: null,
            deltaKey: null,
            deltaPctKey: null,
            referenceSeriesKey: null,
            tableExtraKeys: [],
        };
    }
    if (spec.kind === "temporal") {
        const ref = `${k}_prev`;
        const delta = `${k}_delta`;
        const dp = `${k}_delta_pct`;
        return {
            resolvedMetricKey: k,
            referenceKey: ref,
            deltaKey: delta,
            deltaPctKey: dp,
            referenceSeriesKey: ref,
            tableExtraKeys: [ref, delta, dp].filter((col) => Object.prototype.hasOwnProperty.call(row, col)),
        };
    }
    if (spec.kind === "fixed") {
        const delta = `${k}_vs_fijo`;
        const dp = `${k}_var_pct_fijo`;
        return {
            resolvedMetricKey: k,
            referenceKey: null,
            deltaKey: delta,
            deltaPctKey: dp,
            referenceSeriesKey: null,
            tableExtraKeys: [delta, dp].filter((col) => Object.prototype.hasOwnProperty.call(row, col)),
        };
    }
    if (spec.kind === "column") {
        const delta = `${k}_vs_col`;
        const dp = `${k}_delta_pct_col`;
        return {
            resolvedMetricKey: k,
            referenceKey: null,
            deltaKey: delta,
            deltaPctKey: dp,
            referenceSeriesKey: null,
            tableExtraKeys: [delta, dp].filter((col) => Object.prototype.hasOwnProperty.call(row, col)),
        };
    }
    if (spec.kind === "average") {
        const delta = `${k}_vs_prom`;
        const dp = `${k}_delta_pct_prom`;
        return {
            resolvedMetricKey: k,
            referenceKey: null,
            deltaKey: delta,
            deltaPctKey: dp,
            referenceSeriesKey: null,
            tableExtraKeys: [delta, dp].filter((col) => Object.prototype.hasOwnProperty.call(row, col)),
        };
    }
    if (spec.kind === "total_share") {
        const dp = `${k}_pct_total`;
        const ref = `${k}_total_ref`;
        return {
            resolvedMetricKey: k,
            referenceKey: ref,
            deltaKey: null,
            deltaPctKey: dp,
            referenceSeriesKey: ref,
            tableExtraKeys: [dp, ref].filter((col) => Object.prototype.hasOwnProperty.call(row, col)),
        };
    }
    if (spec.kind === "cumulative") {
        if (spec.mode === "month_vs_ytd") {
            const ytd = `${k}_ytd`;
            const pct = `${k}_pct_mes_en_ytd`;
            return {
                resolvedMetricKey: k,
                referenceKey: ytd,
                deltaKey: null,
                deltaPctKey: pct,
                referenceSeriesKey: ytd,
                tableExtraKeys: [ytd, pct].filter((col) => Object.prototype.hasOwnProperty.call(row, col)),
            };
        }
        if (spec.mode === "vs_prior_year_ytd") {
            const d = `${k}_vs_ytd_ly`;
            const dp = `${k}_delta_pct_ytd_yoy`;
            const ytd = `${k}_ytd`;
            return {
                resolvedMetricKey: k,
                referenceKey: ytd,
                deltaKey: d,
                deltaPctKey: dp,
                referenceSeriesKey: ytd,
                tableExtraKeys: [ytd, d, dp].filter((col) => Object.prototype.hasOwnProperty.call(row, col)),
            };
        }
        const run = `${k}_ytd_run`;
        const ytd = `${k}_ytd`;
        const hasRun = Object.prototype.hasOwnProperty.call(row, run);
        const hasYtd = Object.prototype.hasOwnProperty.call(row, ytd);
        const refSeries = hasRun ? run : hasYtd ? ytd : null;
        return {
            resolvedMetricKey: k,
            referenceKey: hasYtd ? ytd : null,
            deltaKey: null,
            deltaPctKey: null,
            referenceSeriesKey: refSeries,
            tableExtraKeys: [run, ytd].filter((col) => Object.prototype.hasOwnProperty.call(row, col)),
        };
    }
    return {
        resolvedMetricKey: k,
        referenceKey: null,
        deltaKey: null,
        deltaPctKey: null,
        referenceSeriesKey: null,
        tableExtraKeys: [],
    };
}
function readComparePresentation(spec, metricAlias, row) {
    const keys = getCompareColumnKeys(spec, metricAlias, row);
    const k = keys.resolvedMetricKey;
    const current = k ? toNum((0, compareMetricRows_1.getRowValue)(row, k)) : null;
    const reference = keys.referenceKey ? toNum((0, compareMetricRows_1.getRowValue)(row, keys.referenceKey)) : null;
    let delta = keys.deltaKey ? toNum((0, compareMetricRows_1.getRowValue)(row, keys.deltaKey)) : null;
    let deltaPct = keys.deltaPctKey ? toNum((0, compareMetricRows_1.getRowValue)(row, keys.deltaPctKey)) : null;
    return { current, reference, delta, deltaPct };
}
function resolveDashboardKpiMainValue(rows, yKey) {
    if (!rows.length || !yKey)
        return 0;
    return rows.reduce((acc, row) => {
        const n = Number(row[yKey] ?? 0);
        return acc + (Number.isFinite(n) ? n : 0);
    }, 0);
}
function pickDashboardKpiCompareRow(rows, spec, parseOpts) {
    if (!rows.length)
        return null;
    if (spec.kind === "temporal" || spec.kind === "cumulative") {
        const col = spec.timeColumn?.trim();
        if (!col)
            return rows[rows.length - 1] ?? null;
        let bestIdx = 0;
        let bestT = (0, compareMetricRows_1.compareBucketSortTime)((0, compareMetricRows_1.getRowValue)(rows[0], col), spec.granularity, parseOpts);
        for (let i = 1; i < rows.length; i++) {
            const t = (0, compareMetricRows_1.compareBucketSortTime)((0, compareMetricRows_1.getRowValue)(rows[i], col), spec.granularity, parseOpts);
            if (!Number.isNaN(t) && (Number.isNaN(bestT) || t > bestT)) {
                bestT = t;
                bestIdx = i;
            }
        }
        return rows[bestIdx] ?? null;
    }
    return rows[0];
}
function kpiCompareRowsFingerprint(rows, agg) {
    if (!rows?.length)
        return "len:0";
    const spec = (0, compareSpec_1.normalizeAggregationCompare)(legacyCompareInputFromWidgetAgg(agg ?? undefined));
    if (spec.kind === "none")
        return `len:${rows.length}|none`;
    const metrics = agg?.metrics ?? [];
    const alias = metrics.map((m) => String(m.alias ?? "").trim()).filter(Boolean)[0] ?? "metric_0";
    const row = pickDashboardKpiCompareRow(rows, spec) ?? rows[rows.length - 1];
    const vals = readComparePresentation(spec, alias, row);
    return `len:${rows.length}|${vals.delta ?? ""}|${vals.deltaPct ?? ""}|${vals.reference ?? ""}`;
}
function compareTrendTone(values) {
    const primary = values.delta != null
        ? values.delta
        : values.deltaPct != null
            ? values.deltaPct
            : 0;
    if (primary > 0)
        return "up";
    if (primary < 0)
        return "down";
    return "flat";
}
function formatDashboardCompareText(ui, values, valueStyle) {
    const vf = valueStyle?.valueFormat ?? "none";
    const sc = valueStyle?.valueScale ?? "none";
    const cur = valueStyle?.currencySymbol ?? "$";
    const dec = valueStyle?.decimals ?? 2;
    const grp = valueStyle?.useGrouping !== false;
    const bits = [];
    const prefix = (ui.label?.trim() || "").trim();
    if (values.deltaPct != null && ui.showDeltaPct !== false) {
        const sign = values.deltaPct > 0 ? "+" : "";
        bits.push(`${sign}${Number(values.deltaPct).toLocaleString("es-ES", {
            maximumFractionDigits: 1,
            minimumFractionDigits: 0,
        })}%`);
    }
    if (values.delta != null && ui.showDelta !== false) {
        bits.push((0, chartOptions_1.formatValue)(Number(values.delta), vf, cur, sc, dec, grp));
    }
    if (bits.length === 0)
        return "";
    return prefix ? `${prefix}: ${bits.join(" · ")}` : bits.join(" · ");
}
function legacyCompareInputFromWidgetAgg(agg) {
    if (!agg)
        return {};
    const dgField = (0, dateGroupBySourceField_1.pickDateGroupBySourceField)(agg);
    const gran = agg.dateGroupByGranularity;
    return {
        compare: agg.compare,
        comparePeriod: agg.comparePeriod,
        compareFixedValue: agg.compareFixedValue,
        transformCompare: agg.transformCompare,
        transformCompareFixedValue: agg.transformCompareFixedValue,
        dateDimension: agg.dateDimension,
        dateGroupBy: dgField && gran ? { field: dgField, granularity: String(gran) } : undefined,
    };
}
function buildCompareTooltipLineFromAgg(agg, row, primaryMetricAlias, valueStyle) {
    if (!agg)
        return null;
    const spec = (0, compareSpec_1.normalizeAggregationCompare)(legacyCompareInputFromWidgetAgg(agg));
    if (spec.kind === "none")
        return null;
    const ui = (0, ensureDashboardCompareUi_1.getEffectiveDashboardCompareUi)(agg);
    if (!ui?.enabled || !placementEnabled(ui, "tooltip"))
        return null;
    const vals = readComparePresentation(spec, primaryMetricAlias, row);
    const text = formatDashboardCompareText(ui, vals, valueStyle);
    return text.trim() !== "" ? text : null;
}
const COMPARE_KIND_LABELS = {
    temporal: "Temporal",
    column: "Vs columna",
    fixed: "Vs valor fijo",
    average: "Vs promedio",
    total_share: "% del total",
    cumulative: "Acumulado / YTD",
};
function compareKindBadgeLabel(compare) {
    if (compare.kind === "none")
        return null;
    const base = COMPARE_KIND_LABELS[compare.kind];
    if (compare.kind === "temporal" && compare.mode) {
        const modeLabels = {
            prev_bucket: "período anterior",
            same_period_prior_year: "mismo período año anterior",
            calendar_prev_day: "día anterior",
            calendar_prev_week: "semana anterior",
            calendar_prev_month: "mes anterior",
            calendar_prev_year: "año anterior",
        };
        return `${base} · ${modeLabels[compare.mode] ?? compare.mode}`;
    }
    if (compare.kind === "cumulative" && compare.mode) {
        return `${base} · ${compare.mode}`;
    }
    return base;
}
function aggregateCompareLineFromRows(rows, compare, metricAlias, ui, chartStyle, kpiUserTimeScope) {
    if (!rows.length || compare.kind === "none" || !metricAlias)
        return null;
    const pickRow = pickDashboardKpiCompareRow(rows, compare) ??
        rows[rows.length - 1];
    const fromRow = readComparePresentation(compare, metricAlias, pickRow);
    if (fromRow.delta != null || fromRow.deltaPct != null) {
        const text = formatDashboardCompareText(ui, fromRow, chartStyle);
        if (text.trim())
            return text;
    }
    const k = (0, compareMetricRows_1.resolveRowColumnKey)(rows[0], metricAlias) ?? metricAlias;
    const prevKey = `${k}_prev`;
    let hasPrevCol = false;
    let current = 0;
    let reference = 0;
    for (const row of rows) {
        const n = Number(row[k]);
        if (Number.isFinite(n))
            current += n;
        if (Object.prototype.hasOwnProperty.call(row, prevKey)) {
            hasPrevCol = true;
            const p = Number(row[prevKey]);
            if (Number.isFinite(p))
                reference += p;
        }
    }
    if (!hasPrevCol) {
        const total = (0, kpiFilterScope_1.resolveDashboardKpiMainValueForScope)(rows, metricAlias, kpiUserTimeScope ?? null);
        if (Number.isFinite(total))
            current = total;
    }
    if (current === 0 && reference === 0)
        return null;
    const delta = current - reference;
    const deltaPct = reference !== 0 ? ((current - reference) / reference) * 100 : null;
    const text = formatDashboardCompareText(ui, { current, reference, delta, deltaPct }, chartStyle);
    return text.trim() ? text : null;
}
function resolveWidgetCompareStatus(params) {
    const { compareSpec, compareUi, compareUnavailable, rows, metricAlias, kpiUserTimeScope, chartStyle, showCardHeaderStrip = true, } = params;
    if (compareSpec.kind === "none" || compareUi?.enabled === false || !showCardHeaderStrip) {
        return { active: false, badge: null, line: null, unavailable: false };
    }
    const badge = compareKindBadgeLabel(compareSpec);
    const ui = compareUi ?? {
        enabled: true,
        showDelta: true,
        showDeltaPct: true,
        label: params.compareLabel ?? undefined,
    };
    if (compareUnavailable) {
        return { active: false, badge: null, line: null, unavailable: false };
    }
    const line = aggregateCompareLineFromRows(rows ?? [], compareSpec, metricAlias ?? "", ui, chartStyle, kpiUserTimeScope);
    if (!line) {
        return { active: false, badge: null, line: null, unavailable: false };
    }
    return {
        active: true,
        badge,
        line,
        unavailable: false,
    };
}
//# sourceMappingURL=compareDisplayKeys.js.map