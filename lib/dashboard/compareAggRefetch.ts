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
