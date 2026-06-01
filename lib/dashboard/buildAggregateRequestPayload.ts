import {
  compactGeoComponentOverridesForRequest,
  compactGeoOverridesByXLabelForRequest,
} from "@/lib/geo/geo-enrichment";
import { resolveAnalysisDimensionsFromConfig } from "@/lib/dashboard/widgetRenderParity";
import { legacyCompareInputFromWidgetAgg, compareNeedsTimeGroupedRows } from "@/lib/dashboard/compareDisplayKeys";
import { normalizeAggregationCompare, type ComparePeriodSource } from "@/lib/dashboard/compareSpec";
import {
  resolveEffectiveDateGroupByForFetch,
  type AggForCompareDateGroupBy,
} from "@/lib/dashboard/aggregateCompareRequest";
import { expandAggregationFiltersForTemporalCompare } from "@/lib/dashboard/expandAggregationFiltersForCompare";
import type { DateGranularity } from "@/lib/dashboard/dateFormatting";

export type AggregateRequestMetric = {
  id?: string;
  field?: string;
  func?: string;
  alias?: string;
  expression?: string;
  condition?: unknown;
  formula?: string;
};

export type AggregateRequestAgg = {
  dimension?: string;
  dimensions?: string[];
  dimension2?: string;
  chartXAxis?: string;
  metrics?: AggregateRequestMetric[];
  filters?: Array<{ field?: string; operator?: string; value?: unknown }>;
  orderBy?: { field: string; direction: "ASC" | "DESC" };
  limit?: number;
  cumulative?: "none" | "running_sum" | "ytd";
  comparePeriod?: "previous_year" | "previous_month";
  dateDimension?: string;
  dateGroupByGranularity?: DateGranularity;
  dateRangeFilter?: { field: string; last?: number; unit?: "days" | "months"; from?: string; to?: string };
  chartRankingEnabled?: boolean;
  chartRankingTop?: number;
  chartType?: string;
  analysisDateDisplayFormat?: string;
  dateSlashOrder?: "DMY" | "MDY";
  mapDefaultCountry?: string;
  geoHints?: Record<string, unknown>;
  geoComponentOverrides?: Parameters<typeof compactGeoComponentOverridesForRequest>[0];
  geoOverridesByXLabel?: Parameters<typeof compactGeoOverridesByXLabelForRequest>[0];
  compare?: Record<string, unknown>;
  compareFixedValue?: number;
  transformCompare?: string;
  transformCompareFixedValue?: string;
  comparePeriodSource?: ComparePeriodSource;
};

function mapField(
  field: string | undefined,
  sourceId: string | null | undefined,
  datasetDimensions?: Record<string, Record<string, string>>
): string | undefined {
  if (!field || !sourceId || !datasetDimensions) return field;
  return datasetDimensions[field]?.[sourceId] ?? field;
}

function isInvalidIdentifier(value: unknown): boolean {
  const t = String(value ?? "").trim().toLowerCase();
  return t === "" || t === "undefined" || t === "null";
}

function buildSavedMetricsPayload(
  savedMetrics: Array<{
    name?: string;
    metric?: { field?: string; func?: string; alias?: string; expression?: string };
    aggregationConfig?: { metrics?: Array<{ field?: string; func?: string; alias?: string; expression?: string }> };
  }> | undefined,
  metrics: AggregateRequestMetric[] | undefined
) {
  const metricFieldNames = new Set(
    (metrics ?? [])
      .filter((m) => (m.func ?? "").toUpperCase() !== "FORMULA" && (m.field ?? "").trim() !== "")
      .map((m) => String(m.field).trim().toLowerCase())
  );
  if (metricFieldNames.size === 0 || !Array.isArray(savedMetrics) || savedMetrics.length === 0) return [];

  return savedMetrics
    .filter((item) => (item.name ?? "").trim() !== "" && metricFieldNames.has(String(item.name).trim().toLowerCase()))
    .map((item) => {
      const name = String(item.name).trim();
      const first = item.aggregationConfig?.metrics?.[0] ?? item.metric;
      if (!first) return { name, field: name, func: "SUM", alias: name };
      return {
        name,
        field: String(first.field ?? "").trim() || name,
        func: String(first.func ?? "SUM"),
        alias: String(first.alias ?? name),
        ...(first.expression ? { expression: String(first.expression).trim() } : {}),
      };
    });
}

export type BuildAggregateRequestPayloadParams = {
  tableName: string;
  etlId?: string | null;
  chartType: string;
  agg: AggregateRequestAgg;
  sourceId?: string | null;
  datasetDimensions?: Record<string, Record<string, string>>;
  globalFilters?: Array<{ field?: string; operator?: string; value?: unknown }>;
  savedMetrics?: Array<{
    name?: string;
    metric?: { field?: string; func?: string; alias?: string; expression?: string };
    aggregationConfig?: { metrics?: Array<{ field?: string; func?: string; alias?: string; expression?: string }> };
  }>;
  metricsOverride?: AggregateRequestMetric[];
  derivedColumns?: Array<{ name: string; expression: string; defaultAggregation?: string }>;
  /** Paridad ETL fetchPreview: siempre true en vista previa de análisis. */
  forceUnlimited?: boolean;
  /** Filtros ya fusionados (evita re-merge global+widget). */
  filtersOverride?: Array<{ field?: string; operator?: string; value?: unknown }>;
  /** Dual query dashboard: no expandir filtros para traer buckets de referencia. */
  skipTemporalFilterExpand?: boolean;
};

/**
 * Cuerpo POST para `/api/dashboard/aggregate-data` alineado con EtlMetricsClient.fetchPreview.
 */
export function buildAggregateRequestPayload(params: BuildAggregateRequestPayloadParams): Record<string, unknown> {
  const {
    tableName,
    etlId,
    chartType,
    agg,
    sourceId,
    datasetDimensions,
    globalFilters = [],
    savedMetrics,
    metricsOverride,
    derivedColumns,
    forceUnlimited = true,
    filtersOverride,
    skipTemporalFilterExpand = false,
  } = params;

  const effectiveDims = resolveAnalysisDimensionsFromConfig(agg as Record<string, unknown>);
  const mapDim = (d: string | undefined): string | undefined => {
    if (!d || isInvalidIdentifier(d)) return undefined;
    const mapped = mapField(d, sourceId, datasetDimensions) ?? d;
    const t = String(mapped ?? "").trim();
    return t && !isInvalidIdentifier(t) ? t : undefined;
  };

  const dimensionsMapped = effectiveDims.dimensions.map((d) => mapDim(d)).filter((d): d is string => !!d);
  const dimension = mapDim(effectiveDims.dimension);
  const dimension2 = mapDim(effectiveDims.dimension2);
  const mappedChartX = agg.chartXAxis ? mapDim(agg.chartXAxis) : undefined;

  const metricsSource = metricsOverride ?? agg.metrics ?? [];
  const metricsPayload = metricsSource.map((m) => {
    if (m.formula) {
      return { formula: m.formula || "", alias: m.alias || "formula", field: "" };
    }
    const field = mapField(m.field, sourceId, datasetDimensions) ?? m.field ?? "";
    return {
      ...m,
      field: String(field).trim(),
      func: m.func,
      alias: m.alias,
      ...(m.expression ? { expression: m.expression } : {}),
      ...(m.condition ? { condition: m.condition } : {}),
    };
  });

  const compareSpec = normalizeAggregationCompare(legacyCompareInputFromWidgetAgg(agg));
  const mapPhysical = (field: string | undefined) => mapField(field, sourceId, datasetDimensions);

  const dg = resolveEffectiveDateGroupByForFetch({
    effectiveChartType: chartType,
    agg: agg as AggForCompareDateGroupBy,
    compareSpec,
    mapPhysicalField: mapPhysical,
  });

  const mapFilterField = <T extends { field?: string }>(f: T): T => {
    const fld = f.field;
    if (fld == null || fld === "") return f;
    const physical = mapField(fld, sourceId, datasetDimensions) ?? fld;
    return { ...f, field: physical };
  };

  const aggFiltersMapped = (agg.filters ?? []).map((f) => mapFilterField(f));
  const globalFiltersMapped = (globalFilters ?? []).map((f) => mapFilterField(f));

  const compareFieldForExpand =
    dg.dateGroupByField ??
    (compareSpec.kind === "temporal" ? mapPhysical(compareSpec.timeColumn) : undefined) ??
    (compareSpec.kind === "cumulative" ? mapPhysical(compareSpec.timeColumn) : undefined);

  // Dedup: en algunos call sites (AdminDashboardStudio) los filtros del widget se concatenan tanto en
  // `globalFilters` como dentro de `agg.filters`. Sin dedup terminan duplicados en el payload.
  const filterKey = (f: { id?: unknown; field?: unknown; operator?: unknown; value?: unknown }) =>
    JSON.stringify({
      id: f.id ?? null,
      field: String(f.field ?? ""),
      operator: String(f.operator ?? ""),
      value: f.value ?? null,
    });
  const seenFilterKeys = new Set<string>();
  const mergedFiltersRaw =
    filtersOverride != null ? [...filtersOverride] : [...globalFiltersMapped, ...aggFiltersMapped];
  let mergedFilters = mergedFiltersRaw.filter((f) => {
    const k = filterKey(f as Parameters<typeof filterKey>[0]);
    if (seenFilterKeys.has(k)) return false;
    seenFilterKeys.add(k);
    return true;
  });
  if (!skipTemporalFilterExpand && compareNeedsTimeGroupedRows(compareSpec) && compareFieldForExpand) {
    mergedFilters = expandAggregationFiltersForTemporalCompare(mergedFilters, {
      compareField: compareFieldForExpand,
      compareSpec,
      aggComparePeriodSource: agg.comparePeriodSource,
      relatedDateFields: [
        agg.dateDimension,
        compareSpec.kind === "temporal" || compareSpec.kind === "cumulative" ? compareSpec.timeColumn : undefined,
      ].filter((x): x is string => !!String(x ?? "").trim()),
    });
  }

  const dateRangeRaw = agg.dateRangeFilter;
  const dateRangeMapped =
    dateRangeRaw && typeof dateRangeRaw.field === "string"
      ? {
          ...dateRangeRaw,
          field: mapField(dateRangeRaw.field, sourceId, datasetDimensions) ?? dateRangeRaw.field,
        }
      : dateRangeRaw;

  const rankingActive = !!agg.chartRankingEnabled && (agg.chartRankingTop ?? 0) > 0;
  const hasGrouping = dimensionsMapped.length > 0 || !!dimension;
  const useUnlimited = forceUnlimited || rankingActive || dg.hasDateGroupByEffective || hasGrouping;

  const savedMetricsBody = buildSavedMetricsPayload(savedMetrics, metricsPayload);

  return {
    tableName,
    etlId: etlId ?? undefined,
    chartType,
    ...(mappedChartX ? { chartXAxis: mappedChartX } : {}),
    dimension,
    dimensions: dimensionsMapped.length > 0 ? dimensionsMapped : undefined,
    dimension2,
    metrics: metricsPayload,
    filters: mergedFilters.length > 0 ? mergedFilters : undefined,
    ...(useUnlimited
      ? {
          unlimited: true as const,
          ...(agg.orderBy?.field
            ? { orderBy: agg.orderBy }
            : dg.defaultTemporalOrderBy
              ? { orderBy: dg.defaultTemporalOrderBy }
              : {}),
        }
      : {
          orderBy: agg.orderBy,
          limit: agg.limit ?? 100,
        }),
    cumulative: agg.cumulative ?? "none",
    comparePeriod: agg.comparePeriod,
    ...(agg.compare && typeof agg.compare === "object" ? { compare: agg.compare } : {}),
    compareFixedValue: typeof agg.compareFixedValue === "number" ? agg.compareFixedValue : undefined,
    transformCompare: agg.transformCompare,
    transformCompareFixedValue: agg.transformCompareFixedValue,
    ...(agg.comparePeriodSource ? { comparePeriodSource: agg.comparePeriodSource } : {}),
    dateDimension: mapField(agg.dateDimension, sourceId, datasetDimensions),
    ...(dg.hasDateGroupByEffective && dg.dateGroupByField && dg.dateGroupByGranularity
      ? {
          dateGroupBy: {
            field: dg.dateGroupByField,
            granularity: dg.dateGroupByGranularity,
          },
        }
      : {}),
    ...(dateRangeMapped ? { dateRangeFilter: dateRangeMapped } : {}),
    ...(savedMetricsBody.length > 0 ? { savedMetrics: savedMetricsBody } : {}),
    ...(derivedColumns && derivedColumns.length > 0 ? { derivedColumns } : {}),
    ...(agg.geoHints ? { geoHints: agg.geoHints } : {}),
    ...(typeof agg.mapDefaultCountry === "string" && agg.mapDefaultCountry.trim()
      ? { mapDefaultCountry: agg.mapDefaultCountry.trim() }
      : {}),
    ...(compactGeoComponentOverridesForRequest(agg.geoComponentOverrides)
      ? { geoComponentOverrides: compactGeoComponentOverridesForRequest(agg.geoComponentOverrides) }
      : {}),
    ...(compactGeoOverridesByXLabelForRequest(agg.geoOverridesByXLabel)
      ? { geoOverridesByXLabel: compactGeoOverridesByXLabelForRequest(agg.geoOverridesByXLabel) }
      : {}),
    dateSlashOrder: agg.dateSlashOrder === "MDY" ? "MDY" : "DMY",
  };
}
