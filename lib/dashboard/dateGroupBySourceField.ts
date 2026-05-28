/**
 * El campo de DATE_TRUNC no siempre es dimensions[0].
 * Con dimensiones [rubro, fecha] y eje temporal en fecha (dateDimension / chartXAxis),
 * truncar por rubro rompe filtros por mes y la serie temporal.
 */

export type AggLikeForDateGroupByField = {
  dimension?: string;
  dimensions?: string[];
  dimension2?: string;
  dateDimension?: string;
  chartXAxis?: string;
  dateGroupByGranularity?: string;
};

export function dimensionsListFromAgg(agg: AggLikeForDateGroupByField | null | undefined): string[] {
  if (!agg) return [];
  if (Array.isArray(agg.dimensions) && agg.dimensions.length > 0) {
    return agg.dimensions.map((d) => String(d ?? "").trim()).filter(Boolean);
  }
  return [agg.dimension, agg.dimension2].map((d) => String(d ?? "").trim()).filter(Boolean);
}

/** Primera dimensión configurada (sin heurística de fecha). */
export function primaryDimensionForDateGroupBy(agg: AggLikeForDateGroupByField | null | undefined): string | undefined {
  const dims = agg?.dimensions?.length ? agg.dimensions : [];
  const first = dims[0] ?? agg?.dimension;
  const s = typeof first === "string" ? first.trim() : "";
  return s || undefined;
}

/**
 * Campo fuente para dateGroupBy (mismo criterio al armar aggregate-data en cliente).
 */
export function pickDateGroupBySourceField(agg: AggLikeForDateGroupByField | null | undefined): string | undefined {
  if (!agg) return undefined;
  if (!String(agg.dateGroupByGranularity ?? "").trim()) return undefined;
  const dims = dimensionsListFromAgg(agg);
  const primary = primaryDimensionForDateGroupBy(agg);
  const dateDim = String(agg.dateDimension ?? "").trim();
  const chartX = String(agg.chartXAxis ?? "").trim();
  if (dateDim && dims.includes(dateDim)) return dateDim;
  // Sin esta validación, charts no temporales (p. ej. horizontalBar con X=producto) heredarían
  // `dateGroupByGranularity` residual y truncarían la dimensión categórica por mes, colapsando
  // todas las filas en un único bucket. Solo aceptamos chartXAxis/primary como columna de fecha
  // cuando no hay un `dateDimension` distinto definido (caso clásico de gráfico temporal sin
  // dateDimension explícito).
  if (dateDim) return undefined;
  if (chartX && dims.includes(chartX)) return chartX;
  return primary;
}

/**
 * Eje físico para mapear filtros globales de fecha (MONTH/YEAR/…) cuando no hay dimensiones visibles
 * (p. ej. KPI): `pickDateGroupBySourceField` no usa `dateDimension` si no está en `dimensions`.
 */
export function pickSemanticDateAxisForGlobalFilters(agg: AggLikeForDateGroupByField | null | undefined): string | undefined {
  if (!agg) return undefined;
  if (!String(agg.dateGroupByGranularity ?? "").trim()) return undefined;
  const dims = dimensionsListFromAgg(agg);
  const dateDim = String(agg.dateDimension ?? "").trim();
  if (dims.length === 0 && dateDim) return dateDim;
  return pickDateGroupBySourceField(agg);
}
