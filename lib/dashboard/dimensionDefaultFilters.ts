/**
 * Filtros por dimensión con valor por defecto en la vista del dashboard (editables por el usuario).
 * Se persisten en aggregationConfig y se fusionan en la petición de agregación.
 */
import { DATE_OPERATORS_WITH_MULTI_VALUE_SQL } from "@/lib/dashboard/expandMonthFilterWithYear";
import {
  resolveAggregationFilterPhysicalField,
  type AggForDateAxisFallback,
} from "@/lib/dashboard/resolveSemanticDateFilterField";

export type DimensionDefaultFilterEdit = {
  id: string;
  field: string;
  operator: string;
  /** Valor inicial al cargar la vista; el usuario puede cambiarlo. */
  defaultValue: unknown;
  /** Etiqueta del control en la tarjeta (opcional). */
  label?: string;
  /** Tipo de entrada en vista: select carga valores distintos vía API. */
  inputType?: "select" | "multi" | "text" | "number" | "date";
};

type MapDimensionDefaultsCtx = {
  datasetDimensions?: Record<string, Record<string, string>>;
  sourceId: string | null | undefined;
  agg: AggForDateAxisFallback | null | undefined;
  mapDatasetField: (rawField: unknown) => string;
};

/** Convierte defaults de dimensión + valores actuales (por id de fila) en filtros para la API de agregación. */
export function mapDimensionDefaultFiltersToAggregationFilters(
  dimensionDefaults: DimensionDefaultFilterEdit[] | undefined,
  valuesByDdfId: Record<string, unknown>,
  ctx: MapDimensionDefaultsCtx
): Array<{ field: string; operator: string; value: unknown }> {
  if (!Array.isArray(dimensionDefaults) || dimensionDefaults.length === 0) return [];
  const out: Array<{ field: string; operator: string; value: unknown }> = [];
  for (const ddf of dimensionDefaults) {
    let v: unknown =
      valuesByDdfId[ddf.id] !== undefined ? valuesByDdfId[ddf.id] : ddf.defaultValue;
    if (v === "" || v == null) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    const rawOp = ddf.operator || "=";
    const rawOpUpper = String(rawOp).toUpperCase();
    const inputT = ddf.inputType;
    const physicalField = resolveAggregationFilterPhysicalField({
      filterSemanticOrPhysicalField: ddf.field,
      operatorUpper: rawOpUpper,
      datasetDimensions: ctx.datasetDimensions,
      sourceId: ctx.sourceId ?? undefined,
      agg: ctx.agg,
      mapDatasetField: ctx.mapDatasetField,
    });
    if (physicalField == null) continue;
    const useIn =
      rawOp === "IN" ||
      (!DATE_OPERATORS_WITH_MULTI_VALUE_SQL.has(rawOpUpper) &&
        inputT === "multi" &&
        Array.isArray(v) &&
        v.length > 0);
    const op = useIn ? "IN" : rawOp;
    const value: unknown = op === "IN" ? (Array.isArray(v) ? v : [v]) : v;
    out.push({ field: physicalField, operator: op, value });
  }
  return out;
}

export function dimensionDefaultDistinctCacheKey(widgetId: string, ddfId: string): string {
  return `${widgetId}\x1e${ddfId}`;
}
