/**
 * Utilidades para opciones de gráficos (Chart.js): formato de valores,
 * padding para evitar etiquetas cortadas, ejes, estilos y elementos.
 */

export type ValueFormatType =
  | "none"
  | "currency"
  | "percent"
  | "K"
  | "M"
  | "Bi";

export type ChartStyleConfig = {
  valueFormat?: ValueFormatType;
  currencySymbol?: string;
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
};

const DEFAULT_LAYOUT_PADDING = 16;

export function formatValue(
  value: number,
  format: ValueFormatType = "none",
  currencySymbol: string = "$"
): string {
  const n = Number(value);
  if (format === "percent") return `${n.toFixed(1)}%`;
  if (format === "currency") return `${currencySymbol}${n.toLocaleString()}`;
  if (format === "K") return n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n);
  if (format === "M") return n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n);
  if (format === "Bi") return n >= 1e9 ? `${(n / 1e9).toFixed(1)}Bi` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n);
  return n.toLocaleString();
}

export function getLayoutPadding(style?: ChartStyleConfig | null): number {
  return style?.layoutPadding ?? DEFAULT_LAYOUT_PADDING;
}

export function getValueFormatter(
  style?: ChartStyleConfig | null,
  labelMode?: "percent" | "value"
) {
  const format = style?.valueFormat ?? "none";
  const symbol = style?.currencySymbol ?? "$";
  return (value: number, ctx?: { chart?: { data?: { datasets?: Array<{ data?: unknown[] }> } } }) => {
    if (labelMode === "percent" && ctx?.chart?.data?.datasets?.[0]?.data) {
      const total = (ctx.chart.data.datasets[0].data as number[]).reduce((a, b) => Number(a) + Number(b), 0);
      const pct = total ? (Number(value) / total) * 100 : 0;
      return `${pct.toFixed(1)}%`;
    }
    return formatValue(Number(value), format, symbol);
  };
}

export function buildChartOptions(
  type: "bar" | "line" | "pie" | "doughnut" | "horizontalBar",
  style?: ChartStyleConfig | null,
  labelDisplayMode?: "percent" | "value"
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
    const axisX = {
      display: style?.axisXVisible ?? true,
      reverse: style?.axisXReverse ?? false,
      grid: { display: false },
      ticks: { font: { size: style?.fontSize ?? 11 } },
    };
    const axisY = {
      display: style?.axisYVisible ?? true,
      reverse: style?.axisYReverse ?? false,
      grid: { color: "#eee" },
      ticks: { font: { size: style?.fontSize ?? 11 } },
    };
    if (type === "horizontalBar") {
      scales.x = axisX;
      scales.y = { ...axisY, grid: { display: false } };
    } else {
      scales.x = { ...axisX, grid: { display: false } };
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
    return {
      ...base,
      plugins: {
        ...base.plugins,
        datalabels: {
          ...(base.plugins as any).datalabels,
          color: "#ffffff",
        },
      },
    };
  }

  return base;
}
