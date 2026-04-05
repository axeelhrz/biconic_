import type { DashboardTheme } from "@/types/dashboard";
import type { ChartStyleConfig, ValueFormatType, ValueScaleType } from "@/lib/dashboard/chartOptions";

type MetricFormatEntry = {
  valueType?: string;
  valueScale?: string;
  currencySymbol?: string;
  decimals?: number;
  thousandSep?: boolean;
};

type AggregationLike = {
  chartValueType?: string;
  chartValueScale?: string;
  chartNumberFormat?: string;
  chartCurrencySymbol?: string;
  chartDecimals?: number;
  chartThousandSep?: boolean;
  chartYAxes?: string[];
  chartMetricFormats?: Record<string, MetricFormatEntry>;
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
  return { ...widget, aggregationConfig: next as W["aggregationConfig"] };
}
