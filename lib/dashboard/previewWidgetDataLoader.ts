import { safeJsonResponse } from "@/lib/safe-json-response";
import { buildChartConfig, getProcessedRowsForChart, type BuildChartConfigWidget, type ChartConfig } from "@/lib/dashboard/buildChartConfig";

type AggregationMetric = {
  id?: string;
  field?: string;
  func?: string;
  alias?: string;
  expression?: string;
  condition?: unknown;
  formula?: string;
};

type AggregationConfigLike = {
  enabled?: boolean;
  dimension?: string;
  dimensions?: string[];
  dimension2?: string;
  metrics?: AggregationMetric[];
  filters?: Array<{ field?: string; operator?: string; value?: unknown }>;
  orderBy?: { field: string; direction: "ASC" | "DESC" };
  limit?: number;
  cumulative?: "none" | "running_sum" | "ytd";
  comparePeriod?: "previous_year" | "previous_month";
  dateDimension?: string;
  dateGroupByGranularity?: "day" | "week" | "month" | "quarter" | "semester" | "year";
  dateRangeFilter?: { field: string; last?: number; unit?: "days" | "months"; from?: string; to?: string };
  chartRankingEnabled?: boolean;
  chartRankingTop?: number;
  chartRankingMetric?: string;
  chartType?: string;
  chartXAxis?: string;
  analysisDateDisplayFormat?: string;
  mapDefaultCountry?: string;
  geoHints?: {
    countryField?: string;
    provinceField?: string;
    cityField?: string;
    addressField?: string;
    latField?: string;
    lonField?: string;
  };
};

type WidgetLike = BuildChartConfigWidget & {
  aggregationConfig?: AggregationConfigLike;
  dataSourceId?: string | null;
};

type SavedMetricLike = {
  name?: string;
  metric?: { field?: string; func?: string; alias?: string; expression?: string };
  aggregationConfig?: { metrics?: Array<{ field?: string; func?: string; alias?: string; expression?: string }> };
};

const PREVIEW_FETCH_TIMEOUT_MS = 25000;

export type LoadPreviewWidgetDataParams = {
  widget: WidgetLike;
  tableName: string;
  etlId?: string | null;
  sourceId?: string | null;
  datasetDimensions?: Record<string, Record<string, string>>;
  savedMetrics?: SavedMetricLike[];
  globalFilters?: Array<{ field?: string; operator?: string; value?: unknown }>;
  aggregateEndpoint?: string;
  rawEndpoint?: string;
  rawLimit?: number;
  accentColor?: string;
  aggregateExtraPayload?: Record<string, unknown>;
  rawExtraPayload?: Record<string, unknown>;
};

export type LoadedPreviewWidgetData = {
  rows: Record<string, unknown>[];
  chartConfig?: ChartConfig;
  processedRows: Record<string, unknown>[];
  hasData: boolean;
};

function extractRowsFromApiResult(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) return result as Record<string, unknown>[];
  if (result && typeof result === "object") {
    const maybeRows = (result as { rows?: unknown }).rows;
    if (Array.isArray(maybeRows)) return maybeRows as Record<string, unknown>[];
  }
  return [];
}

async function fetchWithTimeout(input: string, init: RequestInit, timeoutMs = PREVIEW_FETCH_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

function mapField(
  field: string | undefined,
  sourceId: string | null | undefined,
  datasetDimensions?: Record<string, Record<string, string>>
): string | undefined {
  if (!field || !sourceId || !datasetDimensions) return field;
  return datasetDimensions[field]?.[sourceId] ?? field;
}

function buildSavedMetricsPayload(savedMetrics: SavedMetricLike[] | undefined, metrics: AggregationMetric[] | undefined) {
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

export async function loadPreviewWidgetData(params: LoadPreviewWidgetDataParams): Promise<LoadedPreviewWidgetData> {
  const {
    widget,
    tableName,
    etlId,
    sourceId,
    datasetDimensions,
    savedMetrics,
    globalFilters = [],
    aggregateEndpoint = "/api/dashboard/aggregate-data",
    rawEndpoint = "/api/dashboard/raw-data",
    rawLimit = 500,
    accentColor = "#0ea5e9",
    aggregateExtraPayload,
    rawExtraPayload,
  } = params;

  const type = widget.type ?? "bar";
  const agg = widget.aggregationConfig;
  const hasAgg = !!(agg?.enabled && (agg.metrics?.length ?? 0) > 0);

  let rows: Record<string, unknown>[] = [];
  if (hasAgg) {
    const dimensions = (agg?.dimensions?.length ? agg.dimensions : [agg?.dimension, agg?.dimension2].filter(Boolean)) as string[];
    const metricsPayload = (agg?.metrics ?? []).map((m) => ({
      ...m,
      field: mapField(m.field, sourceId, datasetDimensions),
    }));
    const primaryDim = dimensions[0] ?? agg?.dimension;
    const dateGroupByGranularity = agg?.dateGroupByGranularity;
    /** Alineado con buildChartConfig: si el usuario activó Top N, la API aplica orderBy+limit también con eje temporal. */
    const shouldApplyRanking = !!agg?.chartRankingEnabled && (agg?.chartRankingTop ?? 0) > 0;
    const rankingMetric = agg?.chartRankingMetric || agg?.metrics?.[0]?.alias;
    const mappedChartX = agg?.chartXAxis ? mapField(agg.chartXAxis, sourceId, datasetDimensions) : undefined;
    const payload = {
      tableName,
      etlId: etlId ?? undefined,
      chartType: type,
      ...(mappedChartX ? { chartXAxis: mappedChartX } : {}),
      dimension: mapField(agg?.dimension, sourceId, datasetDimensions),
      dimensions: dimensions.map((d) => mapField(d, sourceId, datasetDimensions)),
      metrics: metricsPayload,
      filters: [...(globalFilters ?? []), ...(agg?.filters ?? [])],
      orderBy: shouldApplyRanking && rankingMetric
        ? { field: rankingMetric, direction: "DESC" as const }
        : agg?.orderBy,
      limit: shouldApplyRanking
        ? Math.max(1, agg?.chartRankingTop ?? 5)
        : agg?.limit ?? 1000,
      cumulative: agg?.cumulative ?? "none",
      comparePeriod: agg?.comparePeriod,
      dateDimension: mapField(agg?.dateDimension, sourceId, datasetDimensions),
      ...(dateGroupByGranularity && primaryDim
        ? {
            dateGroupBy: {
              field: mapField(primaryDim, sourceId, datasetDimensions),
              granularity: dateGroupByGranularity,
            },
          }
        : {}),
      ...(agg?.dateRangeFilter ? { dateRangeFilter: agg.dateRangeFilter } : {}),
      ...(savedMetrics?.length ? { savedMetrics: buildSavedMetricsPayload(savedMetrics, agg?.metrics) } : {}),
      ...(agg?.geoHints ? { geoHints: agg.geoHints } : {}),
      ...(typeof agg?.mapDefaultCountry === "string" && agg.mapDefaultCountry.trim()
        ? { mapDefaultCountry: agg.mapDefaultCountry.trim() }
        : {}),
      ...(aggregateExtraPayload ?? {}),
    };

    const response = await fetchWithTimeout(aggregateEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await safeJsonResponse<{ rows?: Record<string, unknown>[] }>(response);
    if (!response.ok) throw new Error(result.error ?? "Error agregando datos");
    rows = extractRowsFromApiResult(result);
  } else {
    const payload = {
      tableName,
      filters: globalFilters,
      limit: rawLimit,
      ...(rawExtraPayload ?? {}),
    };
    const response = await fetchWithTimeout(rawEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await safeJsonResponse<{ rows?: Record<string, unknown>[] }>(response);
    if (!response.ok) throw new Error(result.error ?? "Error cargando datos");
    rows = extractRowsFromApiResult(result);
  }

  if (rows.length === 0) {
    return { rows: [], processedRows: [], hasData: false };
  }

  const processedRows = type === "table" ? getProcessedRowsForChart(rows, widget) : rows;
  const chartConfig = type === "table" ? undefined : buildChartConfig(rows, widget, accentColor);
  const hasChartData = type === "kpi"
    ? processedRows.length > 0
    : type === "table"
      ? processedRows.length > 0
      : !!(chartConfig?.labels?.length && (chartConfig.datasets?.length ?? 0) > 0);

  return {
    rows,
    chartConfig,
    processedRows,
    hasData: hasChartData,
  };
}
