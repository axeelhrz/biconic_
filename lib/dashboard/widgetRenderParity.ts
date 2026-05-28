import type { DashboardTheme } from "@/types/dashboard";
import type { ChartLabelDisplayMode, ChartStyleConfig, ValueFormatType, ValueScaleType } from "@/lib/dashboard/chartOptions";
import { expandSavedMetricsWithGlobalRefs } from "@/lib/metrics/expandSavedMetricsForAnalysis";
import { ensureDashboardCompareUi } from "@/lib/dashboard/ensureDashboardCompareUi";

type MetricFormatEntry = {
  valueType?: string;
  valueScale?: string;
  currencySymbol?: string;
  decimals?: number;
  thousandSep?: boolean;
};

export type AggregationLike = {
  chartValueType?: string;
  chartValueScale?: string;
  chartNumberFormat?: string;
  chartCurrencySymbol?: string;
  chartDecimals?: number;
  chartThousandSep?: boolean;
  chartYAxes?: string[];
  chartMetricFormats?: Record<string, MetricFormatEntry>;
  chartDataLabelFontSize?: number;
  chartDataLabelColor?: string;
  chartAxisFontSize?: number;
  chartLayoutPadding?: number;
  /** Ancho máximo de barra (px); se aplica como maxBarThickness en datasets. */
  chartBarThickness?: number;
  /** Grosor del trazo en series línea/área y combo (px). */
  chartLineBorderWidth?: number;
  /** Grosor de la cuadrícula del área de trazado (px). */
  chartGridLineWidth?: number;
  chartAxisTickColor?: string;
  chartCategoryTickMaxRotation?: number;
  chartCategoryTickMinRotation?: number;
  chartCategoryMaxTicks?: number;
  chartFontFamily?: string;
  labelVisibilityMaxCount?: number;
};

const DARK_LUMA_THRESHOLD = 0.55;

function normalizeScale(raw: string | undefined, legacy: string | undefined): ValueScaleType {
  if (raw === "K" || legacy === "K") return "K";
  if (raw === "M" || legacy === "M") return "M";
  if (raw === "BI" || raw === "Bi" || raw === "B" || legacy === "BI") return "B";
  return "none";
}

function normalizeFormat(raw: string | undefined, legacy: string | undefined): ValueFormatType {
  if (raw === "currency" || legacy === "currency") return "currency";
  if (raw === "percent" || legacy === "percent") return "percent";
  return "none";
}

function chartStyleFromParts(
  valueType: string | undefined,
  valueScale: string | undefined,
  legacy: string | undefined,
  currencySymbol: string | undefined,
  decimals: number | undefined,
  thousandSep: boolean | undefined,
  isMetricOverride: boolean
): ChartStyleConfig | undefined {
  const valueFormat = normalizeFormat(valueType, legacy);
  const scale = normalizeScale(valueScale, legacy);
  const resolvedDecimals = decimals ?? 2;
  const useGrouping = thousandSep !== false;
  if (valueFormat === "none" && scale === "none" && resolvedDecimals === 2 && useGrouping && !isMetricOverride) {
    return undefined;
  }
  return {
    valueFormat,
    valueScale: scale,
    currencySymbol: currencySymbol ?? "$",
    decimals: resolvedDecimals,
    useGrouping,
  };
}

export function buildChartStyleFromAgg(agg: AggregationLike | undefined): ChartStyleConfig | undefined {
  if (!agg) return undefined;
  return chartStyleFromParts(
    agg.chartValueType,
    agg.chartValueScale,
    agg.chartNumberFormat,
    agg.chartCurrencySymbol,
    agg.chartDecimals,
    agg.chartThousandSep,
    false
  );
}

export function buildChartMetricStyles(agg: AggregationLike | undefined): (ChartStyleConfig | undefined)[] {
  if (!agg) return [];
  const yKeys = Array.isArray(agg.chartYAxes) ? agg.chartYAxes : [];
  if (yKeys.length === 0) return [];
  return yKeys.map((key) => {
    const perMetric = agg.chartMetricFormats?.[key];
    return chartStyleFromParts(
      perMetric?.valueType ?? agg.chartValueType,
      perMetric?.valueScale ?? agg.chartValueScale,
      agg.chartNumberFormat,
      perMetric?.currencySymbol ?? agg.chartCurrencySymbol,
      perMetric?.decimals ?? agg.chartDecimals,
      perMetric?.thousandSep ?? agg.chartThousandSep,
      perMetric != null
    );
  });
}

/** Campos visuales del gráfico guardados en aggregationConfig (tipografía, colores, eje categoría). */
export function mergeChartVisualStyle(
  agg: AggregationLike | undefined,
  themeFontFamily?: string | null
): Partial<ChartStyleConfig> {
  if (!agg) return {};
  const out: Partial<ChartStyleConfig> = {};
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
  const fs = n(agg.chartDataLabelFontSize);
  if (fs != null) out.dataLabelFontSize = fs;
  if (agg.chartDataLabelColor != null && String(agg.chartDataLabelColor).trim() !== "") {
    out.dataLabelColor = String(agg.chartDataLabelColor).trim();
  }
  const axisFs = n(agg.chartAxisFontSize);
  if (axisFs != null) out.fontSize = axisFs;
  const pad = n(agg.chartLayoutPadding);
  if (pad != null) out.layoutPadding = pad;
  if (agg.chartAxisTickColor != null && String(agg.chartAxisTickColor).trim() !== "") {
    out.axisTickColor = String(agg.chartAxisTickColor).trim();
  }
  const rotMax = n(agg.chartCategoryTickMaxRotation);
  if (rotMax != null) out.categoryTickMaxRotation = rotMax;
  const rotMin = n(agg.chartCategoryTickMinRotation);
  if (rotMin != null) out.categoryTickMinRotation = rotMin;
  const maxTicks = n(agg.chartCategoryMaxTicks);
  if (maxTicks != null) out.categoryMaxTicks = maxTicks;
  const barTh = n(agg.chartBarThickness);
  if (barTh != null) out.barThickness = barTh;
  const lineBw = n(agg.chartLineBorderWidth);
  if (lineBw != null) out.lineBorderWidth = lineBw;
  const gridLw = n(agg.chartGridLineWidth);
  if (gridLw != null) out.gridLineWidth = gridLw;
  const fam = String(agg.chartFontFamily ?? "").trim();
  if (fam) out.chartFontFamily = fam;
  else if (themeFontFamily && String(themeFontFamily).trim() !== "") {
    out.chartFontFamily = String(themeFontFamily).trim();
  }
  return out;
}

/** Une formato numérico, estilos visuales de agg y chartStyle persistido en el widget. */
export function buildResolvedChartStyle(
  agg: AggregationLike | undefined,
  widgetChartStyle?: ChartStyleConfig | null,
  themeFontFamily?: string | null
): ChartStyleConfig | undefined {
  const fromFormat = buildChartStyleFromAgg(agg);
  const fromVisual = mergeChartVisualStyle(agg, themeFontFamily);
  const merged: ChartStyleConfig = {
    ...(fromFormat ?? {}),
    ...fromVisual,
    ...(widgetChartStyle ?? {}),
  };
  return Object.keys(merged).length > 0 ? merged : undefined;
}

function parseHexColor(input: string): { r: number; g: number; b: number } | null {
  const raw = input.trim().replace("#", "");
  if (!/^[0-9a-fA-F]{3,8}$/.test(raw)) return null;
  if (raw.length === 3) {
    return {
      r: parseInt(raw[0]! + raw[0]!, 16),
      g: parseInt(raw[1]! + raw[1]!, 16),
      b: parseInt(raw[2]! + raw[2]!, 16),
    };
  }
  if (raw.length >= 6) {
    return {
      r: parseInt(raw.slice(0, 2), 16),
      g: parseInt(raw.slice(2, 4), 16),
      b: parseInt(raw.slice(4, 6), 16),
    };
  }
  return null;
}

function parseRgbColor(input: string): { r: number; g: number; b: number } | null {
  const match = input.match(/rgba?\(([^)]+)\)/i);
  if (!match?.[1]) return null;
  const parts = match[1].split(",").map((v) => Number(v.trim()));
  if (parts.length < 3 || parts.slice(0, 3).some((v) => !Number.isFinite(v))) return null;
  return { r: parts[0]!, g: parts[1]!, b: parts[2]! };
}

function relativeLuminance(rgb: { r: number; g: number; b: number }): number {
  const convert = (channel: number) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  const r = convert(rgb.r);
  const g = convert(rgb.g);
  const b = convert(rgb.b);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Determina si conviene renderizar opciones de gráfico en modo oscuro.
 * Si no puede inferir color útil, usa el fallback booleano.
 */
export function resolveDarkChartTheme(theme: Partial<DashboardTheme> | undefined, fallback = false): boolean {
  const candidate = String(theme?.backgroundColor ?? theme?.cardBackgroundColor ?? "").trim();
  if (!candidate) return fallback;
  const rgb = candidate.startsWith("#") ? parseHexColor(candidate) : parseRgbColor(candidate);
  if (!rgb) return fallback;
  return relativeLuminance(rgb) < DARK_LUMA_THRESHOLD;
}

type DatasetDimensionsMap = Record<string, Record<string, string>>;

/**
 * El aggregate API devuelve filas con nombres de columna físicos; el layout guardado suele tener
 * ejes/dimensiones semánticas (dataset del dashboard). Sin esto, resolveWidgetAxisKeys no alinea
 * con resultKeys y los gráficos/KPI quedan vacíos en DashboardViewer.
 */
export function resolveWidgetAggregationForDisplay<
  W extends { aggregationConfig?: Record<string, unknown> | null },
>(
  widget: W,
  datasetDimensions: DatasetDimensionsMap | undefined,
  sourceId: string | undefined,
  /** Primera fila de la API: si el mapeo semántico no coincide con columnas reales, preferir la clave que exista en la fila. */
  sampleRow?: Record<string, unknown> | null
): W {
  if (!datasetDimensions || !sourceId || !widget.aggregationConfig) return widget;
  const resultKeys =
    sampleRow && typeof sampleRow === "object" ? new Set(Object.keys(sampleRow)) : null;
  const mapKey = (k: unknown): string | undefined => {
    if (k == null || k === "") return undefined;
    const t = String(k).trim();
    if (!t) return undefined;
    const mapped = datasetDimensions[t]?.[sourceId];
    return mapped ?? t;
  };
  const pickKeyInRow = (mapped: string, original: string): string => {
    if (!resultKeys) return mapped;
    if (resultKeys.has(mapped)) return mapped;
    if (resultKeys.has(original)) return original;
    const lm = mapped.toLowerCase();
    const lo = original.toLowerCase();
    for (const k of resultKeys) {
      const kl = k.toLowerCase();
      if (kl === lm || kl === lo) return k;
    }
    return mapped;
  };
  const agg = widget.aggregationConfig;
  const next: Record<string, unknown> = { ...agg };
  if (typeof agg.chartXAxis === "string") {
    const orig = String(agg.chartXAxis).trim();
    const m = mapKey(agg.chartXAxis) ?? orig;
    if (m) next.chartXAxis = pickKeyInRow(m, orig);
  }
  if (Array.isArray(agg.chartYAxes)) {
    next.chartYAxes = agg.chartYAxes.map((y) => {
      const orig = String(y ?? "").trim();
      const m = mapKey(y) ?? orig;
      return pickKeyInRow(m, orig);
    });
  }
  const dsOverrides = agg.chartDatasetLabelOverrides as Record<string, string> | undefined;
  if (dsOverrides && typeof dsOverrides === "object" && !Array.isArray(dsOverrides)) {
    const remapped: Record<string, string> = {};
    for (const [k, v] of Object.entries(dsOverrides)) {
      if (typeof v !== "string" || v.trim() === "") continue;
      const origK = String(k).trim();
      const nk = pickKeyInRow(mapKey(k) ?? origK, origK);
      remapped[nk] = v;
    }
    if (Object.keys(remapped).length > 0) next.chartDatasetLabelOverrides = remapped;
  }
  if (typeof agg.dimension === "string") {
    const orig = String(agg.dimension).trim();
    const m = mapKey(agg.dimension) ?? orig;
    if (m) next.dimension = pickKeyInRow(m, orig);
  }
  if (Array.isArray(agg.dimensions)) {
    next.dimensions = agg.dimensions.map((d) => {
      const orig = String(d ?? "").trim();
      const m = mapKey(d) ?? orig;
      return pickKeyInRow(m, orig);
    });
  }
  if (typeof agg.dimension2 === "string") {
    const orig = String(agg.dimension2).trim();
    const m = mapKey(agg.dimension2) ?? orig;
    if (m) next.dimension2 = pickKeyInRow(m, orig);
  }
  if (typeof agg.chartSeriesField === "string") {
    const orig = String(agg.chartSeriesField).trim();
    const m = mapKey(agg.chartSeriesField) ?? orig;
    if (m) next.chartSeriesField = pickKeyInRow(m, orig);
  }
  if (typeof agg.dateDimension === "string") {
    const orig = String(agg.dateDimension).trim();
    const m = mapKey(agg.dateDimension) ?? orig;
    if (m) next.dateDimension = pickKeyInRow(m, orig);
  }
  if (typeof agg.chartRankingMetric === "string") {
    const orig = String(agg.chartRankingMetric).trim();
    if (orig) {
      const m = mapKey(agg.chartRankingMetric) ?? orig;
      next.chartRankingMetric = pickKeyInRow(m, orig);
    }
  }
  if (typeof agg.chartSortByMetric === "string") {
    const orig = String(agg.chartSortByMetric).trim();
    if (orig) {
      const m = mapKey(agg.chartSortByMetric) ?? orig;
      next.chartSortByMetric = pickKeyInRow(m, orig);
    }
  }
  return { ...widget, aggregationConfig: next as W["aggregationConfig"] };
}

export type SavedMetricForAnalysisMerge = {
  id: string;
  name?: string;
  chartType?: string;
  type?: string;
  metric?: {
    field?: string;
    func?: string;
    alias?: string;
    expression?: string;
    condition?: unknown;
    formula?: string;
  };
  aggregationConfig?: Record<string, unknown> & {
    metrics?: Array<{
      id?: string;
      field?: string;
      func?: string;
      alias?: string;
      expression?: string;
      condition?: unknown;
      formula?: string;
    }>;
  };
};

export type SavedAnalysisForMerge = Record<string, unknown> & {
  id: string;
  name: string;
  metricIds?: string[];
  chartType?: string;
};

export type WidgetAnalysisMergePatch = {
  aggregationConfig: Record<string, unknown>;
  type: string;
  analysisId: string;
  title?: string;
  metricIds?: string[];
  labelDisplayMode?: ChartLabelDisplayMode;
  minHeight?: number;
};

/** Dimensiones efectivas para GROUP BY (paridad con previewPipelineWidget del ETL). */
export function resolveAnalysisDimensionsFromConfig(cfg: Record<string, unknown>): {
  dimensions: string[];
  dimension?: string;
  dimension2?: string;
} {
  const chartXAxis = String(cfg.chartXAxis ?? "").trim();
  const fromArray = Array.isArray(cfg.dimensions)
    ? (cfg.dimensions as unknown[]).map((d) => String(d ?? "").trim()).filter(Boolean)
    : [];
  const legacy = [cfg.dimension, cfg.dimension2]
    .map((d) => String(d ?? "").trim())
    .filter(Boolean);
  const base = fromArray.length > 0 ? fromArray : legacy;
  const merged =
    chartXAxis && !base.includes(chartXAxis) ? [chartXAxis, ...base] : base.length > 0 ? base : chartXAxis ? [chartXAxis] : [];
  return {
    dimensions: merged,
    dimension: merged[0],
    dimension2: merged[1],
  };
}

function normalizeMatchKey(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/**
 * Encuentra el análisis guardado del ETL vinculado a un widget aunque falte analysisId en el layout.
 */
export function findSavedAnalysisForWidget(
  widget: Record<string, unknown>,
  savedAnalyses: SavedAnalysisForMerge[]
): SavedAnalysisForMerge | null {
  if (!Array.isArray(savedAnalyses) || savedAnalyses.length === 0) return null;

  const widgetAnalysisId = String(widget.analysisId ?? "").trim();
  if (widgetAnalysisId) {
    const byId = savedAnalyses.find((a) => String(a.id ?? "").trim() === widgetAnalysisId);
    if (byId) return byId;
  }

  const widgetMetricId = String(widget.metricId ?? "").trim();
  if (widgetMetricId) {
    const byMetric = savedAnalyses.find((a) =>
      (a.metricIds ?? []).some((mid) => String(mid).trim() === widgetMetricId)
    );
    if (byMetric) return byMetric;
  }

  const widgetMetricIds = Array.isArray(widget.metricIds)
    ? (widget.metricIds as unknown[]).map((id) => String(id ?? "").trim()).filter(Boolean)
    : [];
  if (widgetMetricIds.length > 0) {
    const widgetSet = new Set(widgetMetricIds);
    const byMetricIds = savedAnalyses.find((a) => {
      const analysisIds = (a.metricIds ?? []).map((id) => String(id).trim()).filter(Boolean);
      if (analysisIds.length === 0) return false;
      return analysisIds.every((id) => widgetSet.has(id));
    });
    if (byMetricIds) return byMetricIds;
  }

  const titleKey = normalizeMatchKey(widget.title);
  if (titleKey) {
    const byTitle = savedAnalyses.find((a) => normalizeMatchKey(a.name) === titleKey);
    if (byTitle) return byTitle;
  }

  return null;
}

/** Busca análisis y devuelve el patch de merge, o null si no hay coincidencia. */
export function resolveWidgetAnalysisMergePatch(
  widget: Record<string, unknown>,
  savedAnalyses: SavedAnalysisForMerge[],
  savedMetrics: SavedMetricForAnalysisMerge[]
): WidgetAnalysisMergePatch | null {
  const analysis = findSavedAnalysisForWidget(widget, savedAnalyses);
  if (!analysis) return null;
  return mergeSavedAnalysisIntoWidget(widget, analysis, savedMetrics);
}

type AnalysisMetricRow = {
  id: string;
  field: string;
  func: string;
  alias: string;
  condition?: unknown;
  formula?: string;
  expression?: string;
};

function toMetricListFromUnknown(
  input: unknown,
  fallbackMetric?: SavedMetricForAnalysisMerge["metric"]
): AnalysisMetricRow[] {
  const list = Array.isArray(input) ? input : fallbackMetric ? [fallbackMetric] : [];
  const out = list.map((m, idx) => {
    const met = (m ?? {}) as Record<string, unknown>;
    return {
      id: String(met.id ?? `m-${idx}`),
      field: String(met.field ?? ""),
      func: String(met.func ?? "SUM"),
      alias: String(met.alias ?? ""),
      condition: met.condition,
      formula: typeof met.formula === "string" ? met.formula : undefined,
      expression: typeof met.expression === "string" ? met.expression : undefined,
    };
  });
  if (out.length > 0) return out;
  return [{ id: `m-${Date.now()}`, field: "", func: "SUM", alias: "" }];
}

/**
 * Fusiona un análisis guardado del ETL en un widget del dashboard (misma lógica que buildWidgetFromSavedAnalysis).
 */
export function mergeSavedAnalysisIntoWidget(
  widget: Record<string, unknown>,
  analysis: SavedAnalysisForMerge,
  savedMetrics: SavedMetricForAnalysisMerge[]
): WidgetAnalysisMergePatch | null {
  const analysisId = String(analysis.id ?? "").trim();
  if (!analysisId) return null;

  const linkedSavedMetrics = (analysis.metricIds ?? [])
    .map((mid) => savedMetrics.find((s) => String(s.id) === String(mid)))
    .filter((s): s is SavedMetricForAnalysisMerge => s != null);
  const firstMetricCfgRaw = (linkedSavedMetrics[0]?.aggregationConfig ?? {}) as Record<string, unknown>;
  const analysisCfg = analysis as Record<string, unknown>;
  // El análisis es la fuente autoritativa de la configuración del chart. La aggregationConfig del savedMetric
  // puede traer residuos de cuando se creó (p. ej. `dateGroupByGranularity: "month"` aunque el análisis ya
  // no agrupe por fecha). Filtramos esas claves del firstMetricCfg para no contaminar el GROUP BY del dashboard.
  // Mantenemos del savedMetric solo lo que define a la métrica en sí (metrics, derivedColumns, etc.).
  const CHART_LEVEL_KEYS_FROM_ANALYSIS = new Set([
    "chartType",
    "chartXAxis",
    "chartYAxes",
    "chartSeriesField",
    "dimensions",
    "dimension",
    "dimension2",
    "dateDimension",
    "dateGroupByGranularity",
    "dateRangeFilter",
    "chartRankingEnabled",
    "chartRankingTop",
    "chartRankingMetric",
    "chartRankingDirection",
    "chartRankingPinnedXValues",
    "chartRankingShowRankInLabel",
    "chartSortDirection",
    "chartSortBy",
    "chartSortByMetric",
    "cumulative",
    "comparePeriod",
    "compare",
    "labelDisplayMode",
    "labelVisibilityMode",
    "filters",
    "dimensionDefaultFilters",
    "orderBy",
    "limit",
  ]);
  const firstMetricCfg: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(firstMetricCfgRaw)) {
    if (!CHART_LEVEL_KEYS_FROM_ANALYSIS.has(k)) firstMetricCfg[k] = v;
  }
  const analysisCfgDefined: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(analysisCfg)) {
    if (v !== undefined) analysisCfgDefined[k] = v;
  }
  const mergedCfg = { ...firstMetricCfg, ...analysisCfgDefined };
  const firstLinked = linkedSavedMetrics[0];
  const legacyChartType =
    firstLinked && typeof firstLinked.type === "string" ? String(firstLinked.type) : undefined;
  const chartType = String(
    mergedCfg.chartType ?? firstMetricCfg.chartType ?? firstLinked?.chartType ?? legacyChartType ?? widget.type ?? "bar"
  ).trim();
  const { dimensions: dims, dimension: primaryDim, dimension2: secondaryDim } =
    resolveAnalysisDimensionsFromConfig(mergedCfg);
  const metricIdsOrdered = (analysis.metricIds ?? []).map((id) => String(id));
  const expandedFromAnalysis =
    metricIdsOrdered.length > 0 && linkedSavedMetrics.length > 0
      ? expandSavedMetricsWithGlobalRefs(
          metricIdsOrdered,
          linkedSavedMetrics as Parameters<typeof expandSavedMetricsWithGlobalRefs>[1],
          { setDisplayAliasToSavedName: true }
        )
      : [];
  const sanitizedMetrics =
    expandedFromAnalysis.length > 0
      ? expandedFromAnalysis.map((m, idx) => ({
          id: String(m.id ?? `m-${idx}`),
          field: String(m.field ?? ""),
          func: String(m.func ?? "SUM"),
          alias: String(m.alias ?? ""),
          condition: m.condition,
          formula: typeof m.formula === "string" ? m.formula : undefined,
          expression: typeof m.expression === "string" ? m.expression : undefined,
        }))
      : toMetricListFromUnknown(mergedCfg.metrics, firstLinked?.metric);

  const compareUi = ensureDashboardCompareUi(mergedCfg as Parameters<typeof ensureDashboardCompareUi>[0], {
    widgetType: chartType,
    chartType,
  });
  const aggregationConfig: Record<string, unknown> = {
    ...mergedCfg,
    enabled: true,
    dimension: primaryDim,
    dimension2: secondaryDim,
    dimensions: dims.length > 0 ? dims : undefined,
    metrics: sanitizedMetrics,
    chartType,
    ...(compareUi ? { dashboardCompareUi: compareUi } : {}),
  };

  const analysisLabelMode = analysisCfg.labelDisplayMode;
  const labelDisplayMode: ChartLabelDisplayMode | undefined =
    chartType === "horizontalBar"
      ? analysisLabelMode === "percent" || analysisLabelMode === "value" || analysisLabelMode === "both"
        ? (analysisLabelMode as ChartLabelDisplayMode)
        : "percent"
      : typeof widget.labelDisplayMode === "string"
        ? (widget.labelDisplayMode as ChartLabelDisplayMode)
        : undefined;

  return {
    aggregationConfig,
    type: chartType,
    analysisId,
    title: String(analysis.name ?? widget.title ?? "").trim() || undefined,
    metricIds: [...(analysis.metricIds ?? [])],
    labelDisplayMode,
    minHeight: chartType === "horizontalBar" ? 360 : undefined,
  };
}

/** Paridad con preview ETL (step Guardar): barras horizontales muestran % si no hay modo guardado. */
export function resolveWidgetLabelDisplayMode(
  widget: { labelDisplayMode?: ChartLabelDisplayMode; analysisId?: unknown },
  chartType: string
): ChartLabelDisplayMode | undefined {
  if (widget.labelDisplayMode) return widget.labelDisplayMode;
  if (chartType === "horizontalBar") return "percent";
  return undefined;
}
