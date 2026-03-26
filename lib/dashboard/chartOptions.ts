/**
 * Utilidades para opciones de gráficos (Chart.js): formato de valores,
 * padding para evitar etiquetas cortadas, ejes, estilos y elementos.
 */

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

export function getValueFormatter(
  style?: ChartStyleConfig | null,
  labelMode?: "percent" | "value" | "both"
) {
  const format = (style?.valueFormat ?? "none") as ValueFormatType;
  const symbol = style?.currencySymbol ?? "$";
  const scale = (style?.valueScale ?? "none") as ValueScaleType;
  const decimals = style?.decimals ?? 2;
  const useGrouping = style?.useGrouping !== false;
  const formatMetricValue = (rawValue: number) =>
    formatValue(Number(rawValue), format, symbol, scale, decimals, useGrouping);
  const formatPercent = (rawValue: number, total: number) => {
    const pct = total ? (Number(rawValue) / total) * 100 : 0;
    return `${pct.toFixed(Math.min(1, decimals))}%`;
  };
  return (value: number, ctx?: { chart?: { data?: { datasets?: Array<{ data?: unknown[] }> } } }) => {
    const firstDataset = ctx?.chart?.data?.datasets?.[0]?.data;
    if ((labelMode === "percent" || labelMode === "both") && Array.isArray(firstDataset)) {
      const total = firstDataset.reduce<number>((acc, current) => acc + Number(current), 0);
      if (labelMode === "percent") return formatPercent(Number(value), total);
      const valueText = formatMetricValue(Number(value));
      const percentText = formatPercent(Number(value), total);
      return `${valueText}\n${percentText}`;
    }
    return formatMetricValue(Number(value));
  };
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
  return (value: unknown, index: number) => {
    if (labels.length > 0 && !visible.has(index)) return "";
    const raw = labels[index] ?? value;
    const text = params.formatter ? params.formatter(raw, index) : String(raw ?? "");
    return text;
  };
}

export function createDataLabelDisplay(params: {
  mode?: ChartLabelVisibilityMode;
  datasets?: Array<{ data?: unknown[] }>;
  maxVisible?: number;
}): boolean | ((ctx: { datasetIndex?: number; dataIndex?: number }) => boolean) {
  const mode = normalizeLabelVisibilityMode(params.mode);
  if (mode === "all") return true;
  const datasets = Array.isArray(params.datasets) ? params.datasets : [];
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
    const visible = perDataset[datasetIndex];
    if (!visible || dataIndex < 0) return false;
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
  labelDisplayMode?: "percent" | "value" | "both"
): Record<string, unknown> {
  const padding = getLayoutPadding(style);
  const formatter = getValueFormatter(style, type === "pie" || type === "doughnut" ? (labelDisplayMode || "percent") : "value");
  const fontSize = style?.dataLabelFontSize ?? 12;
  const color = style?.dataLabelColor ?? "#374151";

  const base = {
    responsive: true,
    maintainAspectRatio: false,
    layout: { padding },
    plugins: {
      legend: { display: true },
      datalabels: {
        display: true,
        color,
        font: { size: fontSize, weight: "bold" as const },
        formatter,
      },
    },
  };

  if (type === "bar" || type === "horizontalBar" || type === "line") {
    const scales: Record<string, unknown> = {};
    const gridColor = style?.gridColor ?? "#eee";
    const gridX = { display: style?.gridXDisplay ?? false, color: gridColor };
    const gridY = { display: style?.gridYDisplay ?? true, color: gridColor };
    const axisX = {
      display: style?.axisXVisible ?? true,
      reverse: style?.axisXReverse ?? false,
      grid: gridX,
      ticks: { font: { size: style?.fontSize ?? 11 } },
    };
    const axisY = {
      display: style?.axisYVisible ?? true,
      reverse: style?.axisYReverse ?? false,
      grid: gridY,
      ticks: { font: { size: style?.fontSize ?? 11 } },
    };
    if (type === "horizontalBar") {
      scales.x = axisX;
      scales.y = { ...axisY, grid: gridY };
    } else {
      scales.x = axisX;
      scales.y = axisY;
    }
    return {
      ...base,
      scales,
      ...(type === "bar" || type === "horizontalBar"
        ? {
            barThickness: style?.barThickness,
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
    return {
      ...base,
      plugins: {
        ...base.plugins,
        datalabels: {
          ...(plugins.datalabels ?? {}),
          color: "#ffffff",
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

export function buildPieDoughnutLegendShared(
  chartConfig: { labels?: string[]; datasets?: Array<{ backgroundColor?: string | string[] }> } | null | undefined,
  textColor: string = "#334155"
): Record<string, unknown> {
  const ds0 = chartConfig?.datasets?.[0];
  if (!ds0 || !Array.isArray(ds0.backgroundColor) || !chartConfig?.labels?.length) {
    return { display: true, position: "right" as const, labels: { color: textColor, font: { size: 12, color: textColor } } };
  }
  return {
    display: true,
    position: "right" as const,
    align: "center" as const,
    maxWidth: 220,
    labels: {
      color: textColor,
      font: { size: 12, color: textColor },
      boxWidth: 10,
      boxHeight: 10,
      padding: 10,
      usePointStyle: true,
      pointStyle: "circle",
      generateLabels: () =>
        chartConfig.labels!.map((label, i) => {
          const bg = (ds0.backgroundColor as string[])[i] ?? (typeof ds0.backgroundColor === "string" ? ds0.backgroundColor : "#0ea5e9");
          const text = String(label || "");
          const compactText = text.length > 42 ? `${text.slice(0, 39)}...` : text;
          return {
            text: compactText,
            fillStyle: typeof bg === "string" ? bg : "#0ea5e9",
            strokeStyle: "#fff",
            lineWidth: 1,
            hidden: false,
            index: i,
            datasetIndex: 0,
            fontColor: textColor,
          };
        }),
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
