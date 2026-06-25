"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dimensionsListFromAgg = dimensionsListFromAgg;
exports.primaryDimensionForDateGroupBy = primaryDimensionForDateGroupBy;
exports.pickDateGroupBySourceField = pickDateGroupBySourceField;
exports.pickSemanticDateAxisForGlobalFilters = pickSemanticDateAxisForGlobalFilters;
function dimensionsListFromAgg(agg) {
    if (!agg)
        return [];
    if (Array.isArray(agg.dimensions) && agg.dimensions.length > 0) {
        return agg.dimensions.map((d) => String(d ?? "").trim()).filter(Boolean);
    }
    return [agg.dimension, agg.dimension2].map((d) => String(d ?? "").trim()).filter(Boolean);
}
function primaryDimensionForDateGroupBy(agg) {
    const dims = agg?.dimensions?.length ? agg.dimensions : [];
    const first = dims[0] ?? agg?.dimension;
    const s = typeof first === "string" ? first.trim() : "";
    return s || undefined;
}
function pickDateGroupBySourceField(agg) {
    if (!agg)
        return undefined;
    if (!String(agg.dateGroupByGranularity ?? "").trim())
        return undefined;
    const dims = dimensionsListFromAgg(agg);
    const primary = primaryDimensionForDateGroupBy(agg);
    const dateDim = String(agg.dateDimension ?? "").trim();
    const chartX = String(agg.chartXAxis ?? "").trim();
    if (dateDim && dims.includes(dateDim))
        return dateDim;
    if (dateDim)
        return undefined;
    if (chartX && dims.includes(chartX))
        return chartX;
    return primary;
}
function pickSemanticDateAxisForGlobalFilters(agg) {
    if (!agg)
        return undefined;
    if (!String(agg.dateGroupByGranularity ?? "").trim())
        return undefined;
    const dims = dimensionsListFromAgg(agg);
    const dateDim = String(agg.dateDimension ?? "").trim();
    if (dims.length === 0 && dateDim)
        return dateDim;
    return pickDateGroupBySourceField(agg);
}
//# sourceMappingURL=dateGroupBySourceField.js.map