/**
 * Cuando un filtro global usa un campo semántico sin mapeo para el origen del widget,
 * el visor omitía el filtro por completo. Para gráficos con dateGroupBy, el eje temporal
 * sí se resuelve a columna física: reutilizamos esa dimensión (dateDimension / chartXAxis / primaria).
 * Paridad de operadores con `aggregate-data` (expresión safeDateCast).
 */
import {
  pickDateGroupBySourceField,
  primaryDimensionForDateGroupBy,
  type AggLikeForDateGroupByField,
} from "@/lib/dashboard/dateGroupBySourceField";

export const DATE_PART_OPERATORS_FOR_SEMANTIC_AXIS_FALLBACK = new Set([
  "MONTH",
  "DAY",
  "YEAR",
  "QUARTER",
  "SEMESTER",
  "YEAR_MONTH",
]);

export type AggForDateAxisFallback = AggLikeForDateGroupByField;

export { primaryDimensionForDateGroupBy };

/**
 * Campo físico para el body de aggregate-data, o null si el filtro no debe enviarse.
 */
export function resolveAggregationFilterPhysicalField(options: {
  filterSemanticOrPhysicalField: string;
  operatorUpper: string;
  datasetDimensions: Record<string, Record<string, string>> | undefined;
  sourceId: string | null | undefined;
  agg: AggForDateAxisFallback | null | undefined;
  mapDatasetField: (raw: unknown) => string;
}): string | null {
  const { filterSemanticOrPhysicalField, operatorUpper, datasetDimensions, sourceId, agg, mapDatasetField } = options;
  const field = String(filterSemanticOrPhysicalField ?? "").trim();
  if (!field) return null;

  const isSemantic = !!(datasetDimensions && field in datasetDimensions);
  const hasMapping = !!(sourceId && datasetDimensions?.[field]?.[sourceId]);

  if (!isSemantic || !sourceId || hasMapping) {
    const mapped = mapDatasetField(field);
    return mapped.trim() ? mapped : null;
  }

  const gran = String(agg?.dateGroupByGranularity ?? "").trim();
  if (!gran || !DATE_PART_OPERATORS_FOR_SEMANTIC_AXIS_FALLBACK.has(operatorUpper)) {
    return null;
  }

  const dateAxisSource = pickDateGroupBySourceField(agg) ?? primaryDimensionForDateGroupBy(agg);
  if (!dateAxisSource) return null;
  const physical = mapDatasetField(dateAxisSource);
  return physical.trim() ? physical : null;
}
