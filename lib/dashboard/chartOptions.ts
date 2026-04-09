/**
 * Utilidades para opciones de gráficos (Chart.js): formato de valores,
 * padding para evitar etiquetas cortadas, ejes, estilos y elementos.
 */

import type { Chart } from "chart.js";

/** Tipo de valor: número, moneda o porcentaje (sin escala). */
export type ValueFormatType =
  | "none"
  | "currency"
  | "percent";

/** Escala de visualización (K, M, B) aplicable junto con valueFormat. */
export type ValueScaleType = "none" | "K" | "M" | "Bi" | "B";

export type ChartStyleConfig = {
  valueFormat?: ValueFormatType;
  /** Escala independiente del tipo: K, M, Bi. Se combina con valueFormat (ej. Moneda + M). */
  valueScale?: ValueScaleType;
  currencySymbol?: string;
  /** Cantidad de decimales (ej. 0, 2). Por defecto 2. */
  decimals?: number;
  /** Separador de miles (useGrouping en toLocaleString). Por defecto true. */
  useGrouping?: boolean;
  /** Padding interno del gráfico (px) para que no se corten etiquetas */
  layoutPadding?: number;
  /** Tamaño de fuente para etiquetas de datos */
  dataLabelFontSize?: number;
  dataLabelColor?: string;
  /** Eje X visible */
  axisXVisible?: boolean;
  /** Eje Y visible */
  axisYVisible?: boolean;
  /** Invertir eje X */
  axisXReverse?: boolean;
  /** Invertir eje Y */
  axisYReverse?: boolean;
  /** Grosor de barras (barThickness o maxBarThickness) */
  barThickness?: number;
  /** Bordes redondeados en barras (0-20) */
  barBorderRadius?: number;
  /** Grosor de línea (px) */
  lineBorderWidth?: number;
  /** Radio de puntos en líneas (px) */
  pointRadius?: number;
  /** Fondo del área del gráfico */
  backgroundColor?: string;
  /** Color del borde del área */
  borderColor?: string;
  /** Ancho del borde (px) */
  borderWidth?: number;
  /** Tamaño de fuente general (leyenda, ejes) */
  fontSize?: number;
  /** Mostrar líneas de cuadrícula en eje X. Por defecto true. */
  gridXDisplay?: boolean;
  /** Mostrar líneas de cuadrícula en eje Y. Por defecto true. */
  gridYDisplay?: boolean;
  /** Color de las líneas de cuadrícula (ej. #e2e8f0). */
  gridColor?: string;
  /** Grosor (px) de las líneas de cuadrícula del área del gráfico. */
  gridLineWidth?: number;
  /** Color de etiquetas de ejes (ticks). Si no se define, usa el tema claro/oscuro del visor. */
  axisTickColor?: string;
  /** Rotación máxima (grados) de etiquetas del eje categoría. */
  categoryTickMaxRotation?: number;
  /** Rotación mínima (grados) del eje categoría. */
  categoryTickMinRotation?: number;
  /** Límite de ticks en el eje categoría (Chart.js maxTicksLimit). */
  categoryMaxTicks?: number;
  /** Familia tipográfica CSS para ejes, leyenda y etiquetas de datos (opcional). */
  chartFontFamily?: string;
};

const DEFAULT_LAYOUT_PADDING = 16;

/**
 * Aplica escala (K/M/Bi) al valor: divide y añade sufijo.
 * Devuelve { val, suffix } para combinar después con tipo (moneda/percent).
 */
function applyScale(
  n: number,
  scale: ValueScaleType
): { val: number; suffix: string } {
  if (scale === "K" && Math.abs(n) >= 1000)
    return { val: n / 1000, suffix: "K" };
  if (scale === "M" && Math.abs(n) >= 1e6)
    return { val: n / 1e6, suffix: "M" };
  if (scale === "M" && Math.abs(n) >= 1000)
    return { val: n / 1000, suffix: "K" };
  if ((scale === "Bi" || scale === "B") && Math.abs(n) >= 1e9)
    return { val: n / 1e9, suffix: "B" };
  if ((scale === "Bi" || scale === "B") && Math.abs(n) >= 1e6)
    return { val: n / 1e6, suffix: "M" };
  if ((scale === "Bi" || scale === "B") && Math.abs(n) >= 1000)
    return { val: n / 1000, suffix: "K" };
  return { val: n, suffix: "" };
}

/**
 * Formatea un valor combinando tipo (number/currency/percent) y escala (none/K/M/Bi).
 * Orden: primero escala (división + sufijo), luego tipo (prefijo $ o sufijo %).
 * decimals y useGrouping aplican al número antes del sufijo (K/M/Bi).
 */
/** Locale para números: punto como separador de miles, coma para decimales (ej. 1.234.567,89). */
const NUMBER_LOCALE = "es-ES";

export function formatValue(
  value: number,
  format: ValueFormatType = "none",
  currencySymbol: string = "$",
  scale: ValueScaleType = "none",
  decimals: number = 2,
  useGrouping: boolean = true
): string {
  const n = Number(value);
  const { val, suffix } = applyScale(n, scale);
  const formatted = val.toLocaleString(NUMBER_LOCALE, {
    maximumFractionDigits: decimals,
    minimumFractionDigits: 0,
    useGrouping,
  });
  const withSuffix = `${formatted}${suffix}`;
  if (format === "percent") return `${withSuffix}%`;
  if (format === "currency") return `${currencySymbol}${withSuffix}`;
  return withSuffix;
}

export function getLayoutPadding(style?: ChartStyleConfig | null): number {
  return style?.layoutPadding ?? DEFAULT_LAYOUT_PADDING;
}

/** Base para calcular %: total del gráfico, por categoría (eje X) o por serie (dataset). */
export type ChartPercentBasis = "grand_total" | "per_category" | "per_series";

export type ChartLabelDisplayMode = "percent" | "value" | "both";

export function normalizeChartPercentBasis(b?: unknown): ChartPercentBasis {
  if (b === "per_category" || b === "per_series" || b === "grand_total") return b;
  return "grand_total";
}

export function sumFiniteNumbers(values: unknown[]): number {
  let sum = 0;
  for (const v of values) {
    const n = Number(v);
    if (Number.isFinite(n)) sum += n;
  }
  return sum;
}

/**
 * Denominador para el % según la base. En pie/dona con un solo dataset,
 * `per_category` usa el total del anillo (suma de la serie), no el valor de una sola porción.
 */
export function resolvePercentDenominator(
  basis: ChartPercentBasis,
  datasets: Array<{ data?: unknown[] } | undefined> | undefined,
  dataIndex: number,
  datasetIndex: number
): number {
  if (!datasets || datasets.length === 0) return 0;
  switch (basis) {
    case "grand_total": {
      let sum = 0;
      for (const ds of datasets) {
        if (!Array.isArray(ds?.data)) continue;
        sum += sumFiniteNumbers(ds.data);
      }
      return sum;
    }
    case "per_category": {
      if (datasets.length === 1) {
        const arr = datasets[0]?.data;
        return Array.isArray(arr) ? sumFiniteNumbers(arr) : 0;
      }
      let sum = 0;
      for (const ds of datasets) {
        const arr = ds?.data;
        if (!Array.isArray(arr) || dataIndex < 0 || dataIndex >= arr.length) continue;
        const n = Number(arr[dataIndex]);
        if (Number.isFinite(n)) sum += n;
      }
      return sum;
    }
    case "per_series": {
      const ds = datasets[datasetIndex];
      if (!ds || !Array.isArray(ds.data)) return 0;
      return sumFiniteNumbers(ds.data);
    }
    default:
      return 0;
  }
}

export type FormatChartPointContext = {
  chart?: { data?: { datasets?: Array<{ data?: unknown[] }> } };
  dataIndex?: number;
  datasetIndex?: number;
};

export function formatChartPointDisplay(
  rawValue: number,
  style: ChartStyleConfig | null | undefined,
  labelMode: ChartLabelDisplayMode | undefined,
  percentBasis: ChartPercentBasis,
  ctx?: FormatChartPointContext
): string {
  const mode: ChartLabelDisplayMode = labelMode ?? "value";
  const format = (style?.valueFormat ?? "none") as ValueFormatType;
  const symbol = style?.currencySymbol ?? "$";
  const scale = (style?.valueScale ?? "none") as ValueScaleType;
  const decimals = style?.decimals ?? 2;
  const useGrouping = style?.useGrouping !== false;
  const formatMetricValue = (v: number) =>
    formatValue(Number(v), format, symbol, scale, decimals, useGrouping);
  const formatPercentPart = (value: number, total: number) => {
    const pct = total ? (Number(value) / total) * 100 : 0;
    return `${pct.toFixed(Math.min(1, decimals))}%`;
  };

  if (mode === "value") {
    return formatMetricValue(rawValue);
  }

  const datasets = ctx?.chart?.data?.datasets;
  if (!Array.isArray(datasets) || datasets.length === 0) {
    return formatMetricValue(rawValue);
  }

  const di = typeof ctx?.dataIndex === "number" ? ctx.dataIndex : -1;
  const dsi =
    typeof ctx?.datasetIndex === "number" && ctx.datasetIndex >= 0 ? ctx.datasetIndex : 0;

  let total: number;
  if (di < 0) {
    const first = datasets[0]?.data;
    total = Array.isArray(first) ? sumFiniteNumbers(first) : 0;
  } else {
    total = resolvePercentDenominator(percentBasis, datasets, di, dsi);
  }

  if (mode === "percent") {
    return formatPercentPart(rawValue, total);
  }
  if (mode === "both") {
    const valueText = formatMetricValue(rawValue);
    const percentText = formatPercentPart(rawValue, total);
    return `${valueText}\n${percentText}`;
  }
  return formatMetricValue(rawValue);
}

export function getValueFormatter(
  style?: ChartStyleConfig | null,
  labelMode?: ChartLabelDisplayMode,
  percentBasis: ChartPercentBasis = "grand_total"
) {
  return (value: number, ctx?: FormatChartPointContext) =>
    formatChartPointDisplay(Number(value), style, labelMode ?? "value", percentBasis, ctx);
}

export type ChartLabelVisibilityMode = "all" | "auto" | "min_max";

const DEFAULT_AUTO_LABEL_LIMIT = 8;

function toFiniteNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function resolveAutoLimit(limit?: number): number {
  const n = Number(limit);
  if (!Number.isFinite(n) || n < 2) return DEFAULT_AUTO_LABEL_LIMIT;
  return Math.floor(n);
}

export function normalizeLabelVisibilityMode(mode?: unknown): ChartLabelVisibilityMode {
  if (mode === "all" || mode === "auto" || mode === "min_max") return mode;
  return "auto";
}

export function getSampledIndices(total: number, maxVisible?: number): Set<number> {
  const out = new Set<number>();
  if (total <= 0) return out;
  const limit = resolveAutoLimit(maxVisible);
  if (total <= limit) {
    for (let i = 0; i < total; i += 1) out.add(i);
    return out;
  }
  const step = (total - 1) / (limit - 1);
  for (let slot = 0; slot < limit; slot += 1) {
    out.add(Math.round(slot * step));
  }
  out.add(0);
  out.add(total - 1);
  return out;
}

export function getMinMaxValueIndices(values: unknown[]): Set<number> {
  const out = new Set<number>();
  if (!Array.isArray(values) || values.length === 0) return out;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  const numericAt: Array<{ index: number; value: number }> = [];
  values.forEach((value, index) => {
    const n = toFiniteNumber(value);
    if (n == null) return;
    numericAt.push({ index, value: n });
    if (n < min) min = n;
    if (n > max) max = n;
  });
  if (numericAt.length === 0) return out;
  numericAt.forEach(({ index, value }) => {
    if (value === min || value === max) out.add(index);
  });
  return out;
}

export function getVisibleIndices(params: {
  total: number;
  mode?: ChartLabelVisibilityMode;
  values?: unknown[];
  maxVisible?: number;
}): Set<number> {
  const { total, values, maxVisible } = params;
  const mode = normalizeLabelVisibilityMode(params.mode);
  if (total <= 0) return new Set<number>();
  if (mode === "all") {
    const all = new Set<number>();
    for (let i = 0; i < total; i += 1) all.add(i);
    return all;
  }
  if (mode === "min_max") {
    const minMax = getMinMaxValueIndices(values ?? []);
    if (minMax.size > 0) return minMax;
    return new Set<number>([0, total - 1]);
  }
  return getSampledIndices(total, maxVisible);
}

export function createCategoryTickCallback(params: {
  labels?: unknown[];
  mode?: ChartLabelVisibilityMode;
  maxVisible?: number;
  formatter?: (raw: unknown, index: number) => string;
}): (value: unknown, index: number) => string {
  const labels = Array.isArray(params.labels) ? params.labels : [];
  const visible = getVisibleIndices({
    total: labels.length,
    mode: params.mode,
    values: labels,
    maxVisible: params.maxVisible,
  });
  // Chart.js eje categoría: el 1er argumento es el índice en data.labels; el 2º es la posición en el array de ticks (p. ej. tras autoSkip).
  // https://www.chartjs.org/docs/latest/axes/labelling.html#creating-custom-tick-formats
  return (value: unknown, _tickIndex: number) => {
    const dataIndex = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(dataIndex)) {
      return params.formatter ? params.formatter(value, -1) : String(value ?? "");
    }
    const safeIndex = Math.trunc(dataIndex);
    if (labels.length > 0 && !visible.has(safeIndex)) return "";
    const raw = labels[safeIndex] ?? value;
    const text = params.formatter ? params.formatter(raw, safeIndex) : String(raw ?? "");
    return text;
  };
}

/** Para gráficos con eje de categorías compartido y varias series: magnitud por índice para alinear min/max entre métricas. */
function combinedCategoryMagnitudes(datasets: Array<{ data?: unknown[] }>, categoryCount: number): unknown[] {
  const out: unknown[] = [];
  for (let i = 0; i < categoryCount; i += 1) {
    let maxAbs = 0;
    let any = false;
    for (const ds of datasets) {
      const arr = Array.isArray(ds.data) ? ds.data : [];
      const n = toFiniteNumber(arr[i]);
      if (n != null) {
        any = true;
        maxAbs = Math.max(maxAbs, Math.abs(n));
      }
    }
    out.push(any ? maxAbs : null);
  }
  return out;
}

export function createDataLabelDisplay(params: {
  mode?: ChartLabelVisibilityMode;
  /** Etiquetas del eje de categorías (misma longitud que cada `dataset.data` en gráficos típicos). */
  labels?: unknown[];
  datasets?: Array<{ data?: unknown[] }>;
  maxVisible?: number;
}): boolean | ((ctx: { datasetIndex?: number; dataIndex?: number }) => boolean) {
  const mode = normalizeLabelVisibilityMode(params.mode);
  if (mode === "all") return true;
  const datasets = Array.isArray(params.datasets) ? params.datasets : [];
  const labelLen = Array.isArray(params.labels) ? params.labels.length : 0;
  const maxDataLen = datasets.reduce(
    (m, ds) => Math.max(m, Array.isArray(ds.data) ? ds.data.length : 0),
    0
  );
  const categoryCount = Math.max(labelLen, maxDataLen);
  const multiSeries = datasets.length > 1 && categoryCount > 0;

  let sharedByCategory: Set<number> | null = null;
  if (multiSeries && (mode === "auto" || mode === "min_max")) {
    if (mode === "auto") {
      sharedByCategory = getSampledIndices(categoryCount, params.maxVisible);
    } else {
      const combined = combinedCategoryMagnitudes(datasets, categoryCount);
      sharedByCategory = getMinMaxValueIndices(combined);
      if (sharedByCategory.size === 0 && categoryCount > 0) {
        sharedByCategory = new Set<number>([0, categoryCount - 1]);
      }
    }
  }

  const perDataset = datasets.map((dataset) =>
    getVisibleIndices({
      total: Array.isArray(dataset.data) ? dataset.data.length : 0,
      mode,
      values: Array.isArray(dataset.data) ? dataset.data : [],
      maxVisible: params.maxVisible,
    })
  );
  return (ctx: { datasetIndex?: number; dataIndex?: number }) => {
    const datasetIndex = ctx?.datasetIndex ?? 0;
    const dataIndex = ctx?.dataIndex ?? -1;
    if (dataIndex < 0) return false;
    if (sharedByCategory) {
      return sharedByCategory.has(dataIndex);
    }
    const visible = perDataset[datasetIndex];
    if (!visible) return false;
    return visible.has(dataIndex);
  };
}

export function createLegendLabelFilter(params: {
  mode?: ChartLabelVisibilityMode;
  labels?: unknown[];
  datasets?: Array<{ data?: unknown[] }>;
  maxVisible?: number;
}): ((item: { index?: number; datasetIndex?: number }) => boolean) | undefined {
  const mode = normalizeLabelVisibilityMode(params.mode);
  if (mode === "all") return undefined;
  const labels = Array.isArray(params.labels) ? params.labels : [];
  const datasets = Array.isArray(params.datasets) ? params.datasets : [];
  const firstDatasetValues = Array.isArray(datasets[0]?.data) ? datasets[0]!.data : [];
  const isCategoryLegend = labels.length > 0 && datasets.length <= 1 && firstDatasetValues.length === labels.length;
  const total = isCategoryLegend ? labels.length : datasets.length;
  const visible = getVisibleIndices({
    total,
    mode,
    values: isCategoryLegend ? firstDatasetValues : undefined,
    maxVisible: params.maxVisible,
  });
  return (item: { index?: number; datasetIndex?: number }) => {
    const idx = typeof item.index === "number" ? item.index : typeof item.datasetIndex === "number" ? item.datasetIndex : -1;
    return idx >= 0 && visible.has(idx);
  };
}

export function buildChartOptions(
  type: "bar" | "line" | "pie" | "doughnut" | "horizontalBar",
  style?: ChartStyleConfig | null,
  labelDisplayMode?: ChartLabelDisplayMode,
  chartPercentBasis: ChartPercentBasis = "grand_total"
): Record<string, unknown> {
  const padding = getLayoutPadding(style);
  const basis = normalizeChartPercentBasis(chartPercentBasis);
  const effectiveLabelMode: ChartLabelDisplayMode =
    type === "pie" || type === "doughnut"
      ? labelDisplayMode || "percent"
      : labelDisplayMode ?? "value";
  const formatter = getValueFormatter(style, effectiveLabelMode, basis);
  const fontSize = style?.dataLabelFontSize ?? 12;
  const color = style?.dataLabelColor ?? "#374151";
  const tickFontSize = style?.fontSize ?? 11;
  const tickFamily = style?.chartFontFamily;
  const tickColor = style?.axisTickColor;
  const categoryTickOpts: Record<string, unknown> = {
    font: { size: tickFontSize, ...(tickFamily ? { family: tickFamily } : {}) },
    ...(tickColor != null && tickColor !== "" ? { color: tickColor } : {}),
    ...(style?.categoryTickMaxRotation != null
      ? { maxRotation: style.categoryTickMaxRotation, minRotation: style.categoryTickMinRotation ?? 0 }
      : {}),
    ...(style?.categoryMaxTicks != null && Number.isFinite(style.categoryMaxTicks)
      ? { maxTicksLimit: Math.max(2, Math.floor(style.categoryMaxTicks)), autoSkip: true }
      : {}),
  };
  const valueTickOpts: Record<string, unknown> = {
    font: { size: tickFontSize, ...(tickFamily ? { family: tickFamily } : {}) },
    ...(tickColor != null && tickColor !== "" ? { color: tickColor } : {}),
  };

  const base = {
    responsive: true,
    maintainAspectRatio: false,
    layout: { padding },
    plugins: {
      legend: {
        display: true,
        labels: {
          font: { size: tickFontSize, ...(tickFamily ? { family: tickFamily } : {}) },
          ...(tickColor != null && tickColor !== "" ? { color: tickColor } : {}),
        },
      },
      datalabels: {
        display: true,
        color,
        font: {
          size: fontSize,
          weight: "bold" as const,
          ...(tickFamily ? { family: tickFamily } : {}),
        },
        formatter,
      },
    },
  };

  if (type === "bar" || type === "horizontalBar" || type === "line") {
    const scales: Record<string, unknown> = {};
    const gridColor = style?.gridColor ?? "#eee";
    const gridLineW =
      style?.gridLineWidth != null && Number.isFinite(style.gridLineWidth)
        ? Math.max(0, Math.min(6, style.gridLineWidth))
        : undefined;
    const gridLineOpts = gridLineW != null ? { lineWidth: gridLineW } : {};
    const gridX = { display: style?.gridXDisplay ?? false, color: gridColor, ...gridLineOpts };
    const gridY = { display: style?.gridYDisplay ?? true, color: gridColor, ...gridLineOpts };
    const axisXCategory = {
      display: style?.axisXVisible ?? true,
      reverse: style?.axisXReverse ?? false,
      grid: gridX,
      ticks: { ...categoryTickOpts },
    };
    const axisYCategory = {
      display: style?.axisYVisible ?? true,
      reverse: style?.axisYReverse ?? false,
      grid: gridY,
      ticks: { ...categoryTickOpts },
    };
    const axisXValue = {
      display: style?.axisXVisible ?? true,
      reverse: style?.axisXReverse ?? false,
      grid: gridX,
      ticks: { ...valueTickOpts },
    };
    const axisYValue = {
      display: style?.axisYVisible ?? true,
      reverse: style?.axisYReverse ?? false,
      grid: gridY,
      ticks: { ...valueTickOpts },
    };
    if (type === "horizontalBar") {
      scales.x = axisXValue;
      scales.y = { ...axisYCategory, grid: gridY };
    } else {
      scales.x = axisXCategory;
      scales.y = axisYValue;
    }
    return {
      ...base,
      scales,
      ...(type === "bar" || type === "horizontalBar"
        ? {
            borderRadius: style?.barBorderRadius ?? 4,
          }
        : {}),
      ...(type === "line"
        ? {
            elements: {
              line: { borderWidth: style?.lineBorderWidth ?? 2 },
              point: { radius: style?.pointRadius ?? 3 },
            },
          }
        : {}),
    };
  }

  if (type === "pie" || type === "doughnut") {
    const plugins = base.plugins as { datalabels?: Record<string, unknown> };
    const dl = plugins.datalabels ?? {};
    return {
      ...base,
      plugins: {
        ...base.plugins,
        datalabels: {
          ...dl,
          color: style?.dataLabelColor ?? "#ffffff",
        },
      },
    };
  }

  return base;
}

export type ChartFormatConfigInput = {
  valueType?: string;
  valueScale?: string;
  currencySymbol?: string;
  decimals?: number;
  thousandSep?: boolean;
};

/**
 * Convierte configuración libre (DB/UI) al tipo ChartStyleConfig común.
 */
export function toChartStyleConfig(input?: ChartFormatConfigInput | null): ChartStyleConfig {
  const valueType = (input?.valueType ?? "none").toLowerCase();
  const rawScale = (input?.valueScale ?? "none").toUpperCase();
  const scale: ValueScaleType =
    rawScale === "K" ? "K" : rawScale === "M" ? "M" : rawScale === "BI" || rawScale === "B" ? "B" : "none";
  return {
    valueFormat: valueType === "currency" ? "currency" : valueType === "percent" ? "percent" : "none",
    valueScale: scale,
    currencySymbol: input?.currencySymbol ?? "$",
    decimals: input?.decimals ?? 2,
    useGrouping: input?.thousandSep !== false,
  };
}

/** Posición efectiva de la leyenda en torta/dona (tras preferencias y responsive). */
export type PieDoughnutLegendPosition = "top" | "bottom" | "left" | "right" | "chartArea";

const PIE_LEGEND_LABEL_MAX_CHARS = 120;

function truncatePieLegendText(text: string): string {
  if (text.length <= PIE_LEGEND_LABEL_MAX_CHARS) return text;
  return `${text.slice(0, PIE_LEGEND_LABEL_MAX_CHARS - 3)}...`;
}

/**
 * Ancho máximo de leyenda según tamaño del canvas y posición (Chart.js scriptable).
 */
export function getPieLegendMaxWidthScriptable(
  position: PieDoughnutLegendPosition
): (ctx: { chart: { width: number } }) => number {
  return ({ chart }) => {
    const w = Math.max(chart.width, 1);
    switch (position) {
      case "top":
      case "bottom":
        return Math.max(160, Math.floor(w * 0.92));
      case "chartArea":
        return Math.max(120, Math.floor(w * 0.5));
      case "left":
      case "right":
      default:
        return Math.max(180, Math.min(440, Math.floor(w * 0.46)));
    }
  };
}

/**
 * Padding del layout para separar el arco de la leyenda según su lado.
 */
export function getPieDoughnutLayoutPadding(
  position: PieDoughnutLegendPosition,
  basePadding = DEFAULT_LAYOUT_PADDING
): { top: number; right: number; bottom: number; left: number } {
  const e = Math.max(8, basePadding);
  switch (position) {
    case "right":
      return { top: e, bottom: e, left: e, right: e + 10 };
    case "left":
      return { top: e, bottom: e, left: e + 10, right: e };
    case "bottom":
      return { top: e, bottom: e + 14, left: e, right: e };
    case "top":
      return { top: e + 14, bottom: e, left: e, right: e };
    case "chartArea":
      return { top: e + 6, bottom: e + 6, left: e + 6, right: e + 6 };
    default:
      return { top: e, bottom: e, left: e, right: e + 10 };
  }
}

export type BuildPieDoughnutLegendOptions = {
  /** Posición ya resuelta (predeterminado: derecha). */
  legendPosition?: PieDoughnutLegendPosition;
  /** Cantidad de categorías (para reducir fuente si hay muchas). */
  labelCount?: number;
};

export function buildPieDoughnutLegendShared(
  chartConfig: { labels?: string[]; datasets?: Array<{ backgroundColor?: string | string[] }> } | null | undefined,
  textColor: string = "#334155",
  options?: BuildPieDoughnutLegendOptions
): Record<string, unknown> {
  const position: PieDoughnutLegendPosition = options?.legendPosition ?? "right";
  const labelCount = options?.labelCount ?? chartConfig?.labels?.length ?? 0;
  const legendFontSize = labelCount > 12 ? 10 : labelCount > 8 ? 11 : 12;
  const maxWidthScriptable = getPieLegendMaxWidthScriptable(position);

  const ds0 = chartConfig?.datasets?.[0];
  if (!ds0 || !Array.isArray(ds0.backgroundColor) || !chartConfig?.labels?.length) {
    return {
      display: true,
      position,
      align: "center" as const,
      maxWidth: maxWidthScriptable,
      labels: { color: textColor, font: { size: legendFontSize, color: textColor } },
    };
  }

  return {
    display: true,
    position,
    align: "center" as const,
    maxWidth: maxWidthScriptable,
    labels: {
      color: textColor,
      font: { size: legendFontSize, color: textColor },
      boxWidth: 10,
      boxHeight: 10,
      padding: labelCount > 12 ? 6 : 10,
      usePointStyle: true,
      pointStyle: "circle",
      generateLabels: (chart: Chart) => {
        const labels = chart.data.labels ?? [];
        const dataset = chart.data.datasets[0];
        const bgArr = dataset?.backgroundColor;
        if (!Array.isArray(bgArr) || !labels.length) return [];
        return labels.map((label, i) => {
          const bg =
            (bgArr as string[])[i] ?? (typeof bgArr === "string" ? bgArr : "#0ea5e9");
          const text = truncatePieLegendText(String(label ?? ""));
          const fill = typeof bg === "string" ? bg : "#0ea5e9";
          return {
            text,
            fillStyle: fill,
            strokeStyle: fill,
            lineWidth: 0,
            hidden: false,
            index: i,
            datasetIndex: 0,
            fontColor: textColor,
          };
        });
      },
    },
  };
}

export function buildMiniChartOptions(horizontal: boolean = false): Record<string, unknown> {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { enabled: false },
      datalabels: { display: false },
    },
    ...(horizontal ? { indexAxis: "y" as const } : {}),
    scales: {
      x: { display: false, grid: { display: false } },
      y: { display: false, grid: { display: false } },
    },
  };
}
