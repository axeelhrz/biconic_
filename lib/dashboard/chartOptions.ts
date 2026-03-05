/**
 * Utilidades para opciones de gráficos (Chart.js): formato de valores,
 * padding para evitar etiquetas cortadas, ejes, estilos y elementos.
 */

/** Tipo de valor: número, moneda o porcentaje (sin escala). */
export type ValueFormatType =
  | "none"
  | "currency"
  | "percent";

/** Escala de visualización (K, M, Bi) aplicable junto con valueFormat. */
export type ValueScaleType = "none" | "K" | "M" | "Bi";

export type ChartStyleConfig = {
  valueFormat?: ValueFormatType;
  /** Escala independiente del tipo: K, M, Bi. Se combina con valueFormat (ej. Moneda + M). */
  valueScale?: ValueScaleType;
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
  if (scale === "Bi" && Math.abs(n) >= 1e9)
    return { val: n / 1e9, suffix: "Bi" };
  if (scale === "Bi" && Math.abs(n) >= 1e6)
    return { val: n / 1e6, suffix: "M" };
  if (scale === "Bi" && Math.abs(n) >= 1000)
    return { val: n / 1000, suffix: "K" };
  return { val: n, suffix: "" };
}

/**
 * Formatea un valor combinando tipo (number/currency/percent) y escala (none/K/M/Bi).
 * Orden: primero escala (división + sufijo), luego tipo (prefijo $ o sufijo %).
 */
export function formatValue(
  value: number,
  format: ValueFormatType = "none",
  currencySymbol: string = "$",
  scale: ValueScaleType = "none"
): string {
  const n = Number(value);
  const { val, suffix } = applyScale(n, scale);
  const formatted = val.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 0 });
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
  labelMode?: "percent" | "value"
) {
  const format = (style?.valueFormat ?? "none") as ValueFormatType;
  const symbol = style?.currencySymbol ?? "$";
  const scale = (style?.valueScale ?? "none") as ValueScaleType;
  return (value: number, ctx?: { chart?: { data?: { datasets?: Array<{ data?: unknown[] }> } } }) => {
    if (labelMode === "percent" && ctx?.chart?.data?.datasets?.[0]?.data) {
      const total = (ctx.chart.data.datasets[0].data as number[]).reduce((a, b) => Number(a) + Number(b), 0);
      const pct = total ? (Number(value) / total) * 100 : 0;
      return `${pct.toFixed(1)}%`;
    }
    return formatValue(Number(value), format, symbol, scale);
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
