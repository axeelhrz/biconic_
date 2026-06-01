import { pickDateGroupBySourceField, dimensionsListFromAgg, type AggLikeForDateGroupByField } from "@/lib/dashboard/dateGroupBySourceField";
import { compareNeedsTimeGroupedRows } from "@/lib/dashboard/compareDisplayKeys";
import type { CompareSpec } from "@/lib/dashboard/compareSpec";

export type DateGroupByGranularityName = "day" | "week" | "month" | "quarter" | "semester" | "year";

export type AggForCompareDateGroupBy = AggLikeForDateGroupByField & {
  dimension?: string;
  dimensions?: string[];
  dimension2?: string;
  orderBy?: { field: string; direction: "ASC" | "DESC" };
  dateGroupByGranularity?: string;
};

export type ResolveEffectiveDateGroupByResult = {
  primaryDimResolved: string | undefined;
  hasVisibleDateGroupBy: boolean;
  dateGroupByField: string | undefined;
  dateGroupByGranularity: DateGroupByGranularityName | undefined;
  hasDateGroupByEffective: boolean;
  defaultTemporalOrderBy: { field: string; direction: "ASC" } | undefined;
  /** Serie interna por comparación (KPI o preview sin fecha en dimensiones visibles). */
  needsInferredInternalSeries: boolean;
};

function asGranName(g: string | undefined): DateGroupByGranularityName | undefined {
  const x = String(g ?? "").trim().toLowerCase();
  if (x === "day" || x === "week" || x === "month" || x === "quarter" || x === "semester" || x === "year") {
    return x;
  }
  return undefined;
}

/**
 * Resuelve `dateGroupBy` efectivo para `/api/dashboard/aggregate-data`, incluyendo inferencia
 * cuando la comparación temporal necesita buckets pero el gráfico no muestra fecha (p. ej. KPI).
 */
export function resolveEffectiveDateGroupByForFetch(options: {
  /** Tipo visual ya resuelto (`effectiveWidgetChartType` / `formChartType`). */
  effectiveChartType: string;
  agg: AggForCompareDateGroupBy;
  compareSpec: CompareSpec;
  mapPhysicalField: (field: string | undefined) => string | undefined;
  /**
   * Si es true: cuando hay comparación temporal+cumulative que requiere filas por tiempo y no hay
   * `dateGroupBy` visible, infiere truncamiento aunque el chart no sea KPI (vista previa del análisis).
   */
  inferInternalSeriesWithoutVisibleTimeDimension?: boolean;
}): ResolveEffectiveDateGroupByResult {
  const { effectiveChartType, agg, compareSpec, mapPhysicalField } = options;
  const inferPreview = options.inferInternalSeriesWithoutVisibleTimeDimension === true;

  const dims = dimensionsListFromAgg(agg);
  const picked = pickDateGroupBySourceField(agg);
  const primaryDim =
    mapPhysicalField(picked) ??
    mapPhysicalField(dims[0]) ??
    mapPhysicalField(agg.dimension) ??
    undefined;

  const dateGroupByGranularityRaw = agg.dateGroupByGranularity;
  const hasVisibleDateGroupBy = !!(dateGroupByGranularityRaw && primaryDim);

  const type = String(effectiveChartType ?? "").trim().toLowerCase();

  let inferredDateGroupField: string | undefined;
  let inferredDateGroupGranularity: string | undefined;

  const needsInternalBase =
    compareNeedsTimeGroupedRows(compareSpec) &&
    !hasVisibleDateGroupBy &&
    (type === "kpi" || inferPreview);

  if (needsInternalBase) {
    if (compareSpec.kind === "temporal" || compareSpec.kind === "cumulative") {
      const tc = compareSpec.timeColumn?.trim();
      if (tc) {
        inferredDateGroupField = mapPhysicalField(tc) ?? tc;
        inferredDateGroupGranularity = compareSpec.granularity ?? dateGroupByGranularityRaw ?? "month";
      }
    }
    if (!inferredDateGroupField && (agg.dateDimension ?? "").trim()) {
      inferredDateGroupField = mapPhysicalField(agg.dateDimension) ?? String(agg.dateDimension).trim();
      inferredDateGroupGranularity = dateGroupByGranularityRaw ?? "month";
    }
  }

  const dateGroupByField =
    hasVisibleDateGroupBy && primaryDim ? primaryDim : inferredDateGroupField;
  const dateGroupByGranularityStr =
    hasVisibleDateGroupBy && primaryDim ? dateGroupByGranularityRaw : inferredDateGroupGranularity;
  const granName = asGranName(dateGroupByGranularityStr);
  const hasDateGroupByEffective = !!(dateGroupByField && granName);

  const defaultTemporalOrderBy =
    needsInternalBase &&
    hasDateGroupByEffective &&
    !agg?.orderBy?.field &&
    dateGroupByField
      ? { field: dateGroupByField, direction: "ASC" as const }
      : undefined;

  return {
    primaryDimResolved: primaryDim,
    hasVisibleDateGroupBy,
    dateGroupByField: hasDateGroupByEffective ? dateGroupByField : undefined,
    dateGroupByGranularity: hasDateGroupByEffective ? granName : undefined,
    hasDateGroupByEffective,
    defaultTemporalOrderBy,
    needsInferredInternalSeries: needsInternalBase && hasDateGroupByEffective,
  };
}
