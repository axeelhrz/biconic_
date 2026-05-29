/** Campos de `aggregationConfig` cuyo cambio requiere nuevo fetch a aggregate-data (columnas compare en servidor). */
export const COMPARE_AGG_REFETCH_KEYS = new Set([
  "compare",
  "comparePeriod",
  "compareFixedValue",
  "transformCompare",
  "transformCompareFixedValue",
  "dateDimension",
  "dateGroupByGranularity",
  "cumulative",
  "comparePeriodSource",
]);

export function shouldRefetchWidgetOnComparePatch(patch: Record<string, unknown>): boolean {
  const keys = Object.keys(patch);
  if (!keys.some((k) => COMPARE_AGG_REFETCH_KEYS.has(k))) return false;

  if (keys.length === 1 && keys[0] === "transformCompareFixedValue") {
    const n = Number.parseFloat(String(patch.transformCompareFixedValue ?? ""));
    return Number.isFinite(n);
  }

  return true;
}

/** Campos cuyo cambio altera el dataset agregado (filtros, dimensiones, métricas). */
export const AGG_DATA_REFETCH_KEYS = new Set([
  "filters",
  "dimensionDefaultFilters",
  "excludeGlobalFilters",
  "metrics",
  "dimension",
  "dimensions",
  "dimension2",
  "dateDimension",
  "dateGroupByGranularity",
  "mapDefaultCountry",
  "geoHints",
  "geoComponentOverrides",
  "geoOverridesByXLabel",
]);

export function shouldRefetchWidgetOnAggDataPatch(patch: Record<string, unknown>): boolean {
  return Object.keys(patch).some((k) => AGG_DATA_REFETCH_KEYS.has(k));
}

export function shouldRefetchWidgetOnAggregationPatch(patch: Record<string, unknown>): boolean {
  return shouldRefetchWidgetOnComparePatch(patch) || shouldRefetchWidgetOnAggDataPatch(patch);
}
