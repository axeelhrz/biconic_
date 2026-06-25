"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultComparePlacementsForWidgetType = defaultComparePlacementsForWidgetType;
exports.ensureDashboardCompareUi = ensureDashboardCompareUi;
exports.getEffectiveDashboardCompareUi = getEffectiveDashboardCompareUi;
exports.effectivePlacementEnabled = effectivePlacementEnabled;
const compareDisplayKeys_1 = require("./compareDisplayKeys");
const compareSpec_1 = require("./compareSpec");
function effectiveChartType(widgetType, chartType) {
    const t = (chartType || widgetType || "").trim().toLowerCase();
    return t || "bar";
}
function defaultComparePlacementsForWidgetType(widgetType, chartType) {
    const t = effectiveChartType(widgetType, chartType);
    if (t === "kpi")
        return ["kpi_below"];
    if (t === "table")
        return ["table_extra_columns"];
    if (t === "line" || t === "area")
        return ["line_reference_series", "tooltip"];
    return ["tooltip", "detail_card"];
}
function hasActiveCompare(agg) {
    if (!agg)
        return false;
    const spec = (0, compareSpec_1.normalizeAggregationCompare)((0, compareDisplayKeys_1.legacyCompareInputFromWidgetAgg)(agg));
    return spec.kind !== "none";
}
function ensureDashboardCompareUi(agg, options = {}) {
    if (!hasActiveCompare(agg)) {
        const explicit = agg.dashboardCompareUi;
        if (explicit && explicit.enabled === false)
            return explicit;
        return undefined;
    }
    const prev = agg.dashboardCompareUi;
    const showDelta = agg.transformShowDelta !== false;
    const showDeltaPct = agg.transformShowDeltaPct !== false;
    const placement = prev?.placement ?? defaultComparePlacementsForWidgetType(options.widgetType, options.chartType);
    return {
        enabled: prev?.enabled !== false,
        label: prev?.label ?? "",
        showDelta: prev?.showDelta !== undefined ? prev.showDelta : showDelta,
        showDeltaPct: prev?.showDeltaPct !== undefined ? prev.showDeltaPct : showDeltaPct,
        placement,
        indicator: prev?.indicator ?? "both",
        showCardHeaderStrip: prev?.showCardHeaderStrip,
    };
}
function getEffectiveDashboardCompareUi(agg, options = {}) {
    if (!agg)
        return undefined;
    const explicit = agg.dashboardCompareUi;
    if (!hasActiveCompare(agg)) {
        return explicit?.enabled === false ? explicit : undefined;
    }
    if (explicit && explicit.enabled === false)
        return explicit;
    if (explicit?.enabled === true)
        return explicit;
    if (explicit && explicit.enabled === undefined) {
        return ensureDashboardCompareUi(agg, options);
    }
    if (!explicit) {
        return ensureDashboardCompareUi(agg, options);
    }
    return ensureDashboardCompareUi(agg, options);
}
function effectivePlacementEnabled(agg, placement, options = {}) {
    const ui = getEffectiveDashboardCompareUi(agg, options);
    if (!ui?.enabled)
        return false;
    const raw = ui.placement;
    const list = raw == null ? ["kpi_below"] : Array.isArray(raw) ? raw : [raw];
    return list.includes(placement);
}
//# sourceMappingURL=ensureDashboardCompareUi.js.map