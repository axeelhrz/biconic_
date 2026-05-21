import { safeJsonResponse } from "@/lib/safe-json-response";
import { buildChartConfig, getProcessedRowsForChart, type BuildChartConfigWidget, type ChartConfig } from "@/lib/dashboard/buildChartConfig";
import { effectiveWidgetChartType } from "@/lib/dashboard/effectiveWidgetChartType";
import { buildAggregateRequestPayload } from "@/lib/dashboard/buildAggregateRequestPayload";
import { resolveWidgetAggregationForDisplay } from "@/lib/dashboard/widgetRenderParity";
import { legacyCompareInputFromWidgetAgg, compareNeedsTimeGroupedRows } from "@/lib/dashboard/compareDisplayKeys";
import { normalizeAggregationCompare, type ComparePeriodSource } from "@/lib/dashboard/compareSpec";
import { resolveEffectiveDateGroupByForFetch, type AggForCompareDateGroupBy } from "@/lib/dashboard/aggregateCompareRequest";
import { expandAggregationFiltersForTemporalCompare } from "@/lib/dashboard/expandAggregationFiltersForCompare";
import type { KpiUserTimeScopeOptions } from "@/lib/dashboard/kpiFilterScope";
import type { CompareSpec } from "@/lib/dashboard/compareSpec";
import type { DateGranularity } from "@/lib/dashboard/dateFormatting";

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
  chartRankingDirection?: "asc" | "desc";
  chartRankingPinnedXValues?: string[];
  dimensionDefaultFilters?: Array<{
    id: string;
    field: string;
    operator: string;
    defaultValue: unknown;
    label?: string;
    inputType?: "select" | "multi" | "text" | "number" | "date";
  }>;
  chartType?: string;
  chartXAxis?: string;
  analysisDateDisplayFormat?: string;
  /** Coherente con parseo de fechas texto DD/MM vs MM/DD. */
  dateSlashOrder?: "DMY" | "MDY";
  mapDefaultCountry?: string;
  geoHints?: {
    countryField?: string;
    provinceField?: string;
    cityField?: string;
    addressField?: string;
    latField?: string;
    lonField?: string;
  };
  geoComponentOverrides?: { country?: string; province?: string; city?: string };
  geoOverridesByXLabel?: Record<string, { country?: string; province?: string; city?: string }>;
  compare?: Record<string, unknown>;
  compareFixedValue?: number;
  transformCompare?: string;
  transformCompareFixedValue?: string;
  /** Origen del período para comparaciones temporales (si no va dentro de `compare`). */
  comparePeriodSource?: ComparePeriodSource;
  dashboardCompareUi?: { enabled?: boolean };
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
  /** Métricas ya resueltas (p. ej. AdminDashboardStudio); si no, se usan las del widget. */
  metricsOverride?: AggregationMetric[];
  derivedColumns?: Array<{ name: string; expression: string; defaultAggregation?: string }>;
  aggregateExtraPayload?: Record<string, unknown>;
  rawExtraPayload?: Record<string, unknown>;
};

export type LoadedPreviewWidgetData = {
  rows: Record<string, unknown>[];
  chartConfig?: ChartConfig;
  processedRows: Record<string, unknown>[];
  hasData: boolean;
  /** Filtros pre-expansión para acotar el total del KPI (no la línea de comparación). */
  kpiUserTimeScope?: KpiUserTimeScopeOptions | null;
};

function buildKpiUserTimeScopeOptions(
  type: string,
  agg: AggregationConfigLike | undefined,
  compareSpec: CompareSpec,
  dg: { dateGroupByField?: string; dateGroupByGranularity?: DateGranularity },
  userFiltersBeforeExpand: Array<{ field?: string; operator?: string; value?: unknown }>
): KpiUserTimeScopeOptions | null {
  if (type !== "kpi" || !compareNeedsTimeGroupedRows(compareSpec)) return null;
  const timeColumn =
    dg.dateGroupByField?.trim() ||
    (compareSpec.kind === "temporal" || compareSpec.kind === "cumulative"
      ? compareSpec.timeColumn?.trim()
      : "") ||
    String(agg?.dateDimension ?? "").trim();
  if (!timeColumn) return null;
  const granularity =
    (compareSpec.kind === "temporal" || compareSpec.kind === "cumulative"
      ? compareSpec.granularity
      : agg?.dateGroupByGranularity) ?? "month";
  return {
    timeColumn,
    granularity: granularity as DateGranularity,
    userFilters: userFiltersBeforeExpand,
    parseOpts: agg?.dateSlashOrder === "MDY" ? { slashDateOrder: "MDY" } : { slashDateOrder: "DMY" },
  };
}

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
    metricsOverride,
    derivedColumns,
    aggregateExtraPayload,
    rawExtraPayload,
  } = params;

  const agg = widget.aggregationConfig;
  /** Paridad con `DashboardWidgetRenderer`: evita `chartType: ""` → forzar "bar" y vaciar filas en vista previa. */
  const type = effectiveWidgetChartType(widget);
  const hasAgg = !!(agg?.enabled && ((metricsOverride?.length ?? 0) > 0 || (agg.metrics?.length ?? 0) > 0));

  let rows: Record<string, unknown>[] = [];
  let kpiUserTimeScope: KpiUserTimeScopeOptions | null = null;
  if (hasAgg) {
    const compareSpec = normalizeAggregationCompare(legacyCompareInputFromWidgetAgg(agg));
    const dg = resolveEffectiveDateGroupByForFetch({
      effectiveChartType: type,
      agg: agg as AggForCompareDateGroupBy,
      compareSpec,
      mapPhysicalField: (field) => mapField(field, sourceId, datasetDimensions),
    });
    const mapAggFilterField = <T extends { field?: string }>(f: T): T => {
      const fld = f.field;
      if (fld == null || fld === "") return f;
      const physical = mapField(fld, sourceId, datasetDimensions) ?? fld;
      return { ...f, field: physical };
    };
    const aggFiltersMapped = (agg?.filters ?? []).map((f) => mapAggFilterField(f));
    const globalFiltersMapped = (globalFilters ?? []).map((f) => mapAggFilterField(f));
    const userFiltersBeforeExpand = [...globalFiltersMapped, ...aggFiltersMapped];
    kpiUserTimeScope = buildKpiUserTimeScopeOptions(type, agg, compareSpec, dg, userFiltersBeforeExpand);

    const payload = {
      ...buildAggregateRequestPayload({
        tableName,
        etlId,
        chartType: type,
        agg: agg as Parameters<typeof buildAggregateRequestPayload>[0]["agg"],
        sourceId,
        datasetDimensions,
        globalFilters,
        savedMetrics,
        metricsOverride,
        derivedColumns,
        forceUnlimited: true,
      }),
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
    return { rows: [], processedRows: [], hasData: false, kpiUserTimeScope: null };
  }

  const displayWidget = resolveWidgetAggregationForDisplay(
    widget as { aggregationConfig?: Record<string, unknown> | null },
    datasetDimensions,
    sourceId ?? undefined,
    rows[0] as Record<string, unknown> | undefined
  ) as WidgetLike;
  const chartWidget = displayWidget as BuildChartConfigWidget;

  const processedRows = type === "table" ? getProcessedRowsForChart(rows, chartWidget) : rows;
  const chartConfig =
    type === "table"
      ? undefined
      : buildChartConfig(rows, chartWidget, accentColor, {
          kpiUserTimeScope: hasAgg ? kpiUserTimeScope : null,
        });
  const hasChartData =
    type === "kpi" || type === "table" || type === "map"
      ? processedRows.length > 0
      : !!(chartConfig?.labels?.length && (chartConfig.datasets?.length ?? 0) > 0);

  return {
    rows,
    chartConfig,
    processedRows,
    hasData: hasChartData,
    kpiUserTimeScope: hasAgg ? kpiUserTimeScope : null,
  };
}
