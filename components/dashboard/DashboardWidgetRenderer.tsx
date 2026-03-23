"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import { Loader2 } from "lucide-react";
import { Bar, Line, Pie, Doughnut, Scatter } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import ChartDataLabels from "chartjs-plugin-datalabels";
import { Card } from "@/components/ui/card";
import { buildChartOptions, buildPieDoughnutLegendShared, formatValue, getValueFormatter, type ChartStyleConfig } from "@/lib/dashboard/chartOptions";
import { formatDateByGranularity, type DateGranularity } from "@/lib/dashboard/dateFormatting";
import { DashboardTextWidget } from "./DashboardTextWidget";

const DashboardMapWidget = dynamic(
  () => import("./DashboardMapWidget").then((m) => m.DashboardMapWidget),
  { ssr: false }
);

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Tooltip,
  Legend,
  Filler,
  ChartDataLabels
);

export type WidgetChartType =
  | "bar"
  | "horizontalBar"
  | "line"
  | "area"
  | "pie"
  | "doughnut"
  | "combo"
  | "table"
  | "kpi"
  | "filter"
  | "image"
  | "text"
  | "scatter"
  | "map";

export type ChartConfig = {
  labels: string[];
  datasets: Array<{
    label: string;
    data: number[];
    backgroundColor?: string | string[];
    borderColor?: string | string[];
    borderWidth?: number;
    type?: "bar" | "line";
    fill?: boolean;
    yAxisID?: string;
  }>;
};

export type FilterWidgetConfig = {
  label: string;
  field: string;
  operator: string;
  inputType: "text" | "select" | "date" | "number";
};

export interface DashboardWidgetRendererWidget {
  id: string;
  type: WidgetChartType;
  title: string;
  config?: ChartConfig;
  rows?: Record<string, unknown>[];
  content?: string;
  filterConfig?: FilterWidgetConfig;
  facetValues?: Record<string, unknown[]>;
  labelDisplayMode?: "percent" | "value";
  chartStyle?: ChartStyleConfig;
  /** Un estilo por dataset cuando el gráfico tiene varias métricas (formato por métrica). */
  chartMetricStyles?: (ChartStyleConfig | undefined)[];
  gridSpan?: number;
  minHeight?: number;
  kpiSecondaryLabel?: string;
  kpiSecondaryValue?: string;
  imageConfig?: {
    width?: number;
    height?: number;
    objectFit?: "contain" | "cover" | "fill" | "none" | "scale-down";
  };
  imageUrl?: string;
  aggregationConfig?: { chartType?: string; [key: string]: unknown };
  [key: string]: unknown;
}

const AXIS_COLOR = "var(--platform-fg-muted, #64748b)";
const GRID_COLOR = "var(--platform-border, #e2e8f0)";
const AXIS_COLOR_DARK = "rgba(255, 255, 255, 0.85)";
const GRID_COLOR_DARK = "rgba(255, 255, 255, 0.12)";
const DATALABEL_COLOR_DARK = "rgba(255, 255, 255, 0.95)";

function getChartOptionsBase(darkTheme: boolean) {
  const axisColor = darkTheme ? AXIS_COLOR_DARK : AXIS_COLOR;
  const gridColor = darkTheme ? GRID_COLOR_DARK : GRID_COLOR;
  return {
    responsive: true,
    maintainAspectRatio: false,
    layout: { padding: 8 },
    plugins: {
      legend: {
        display: true,
        position: "top" as const,
        labels: { color: axisColor, font: { size: 12 }, padding: 16 },
      },
      tooltip: { enabled: true },
    },
    scales: {
      x: {
        display: true,
        grid: { color: gridColor },
        ticks: { color: axisColor, maxTicksLimit: 8, font: { size: 11 } },
      },
      y: {
        display: true,
        grid: { color: gridColor },
        ticks: { color: axisColor, font: { size: 11 }, maxTicksLimit: 8 },
      },
    },
  };
}

function formatKpiValue(value: unknown, style?: ChartStyleConfig | null): string {
  if (value == null || value === "") return "—";
  const n = Number(value);
  if (Number.isNaN(n)) return String(value);
  if (style) {
    const format = (style.valueFormat ?? "none") as "none" | "currency" | "percent";
    const scale = (style.valueScale ?? "none") as "none" | "K" | "M" | "Bi";
    const decimals = style.decimals ?? 2;
    const useGrouping = style.useGrouping !== false;
    return formatValue(n, format, style.currencySymbol ?? "$", scale, decimals, useGrouping);
  }
  if (Math.abs(n) >= 1e12) return `${(n / 1e12).toFixed(1)}T`;
  if (Math.abs(n) >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

interface DashboardWidgetRendererProps {
  widget: DashboardWidgetRendererWidget;
  isLoading?: boolean;
  /** Solo para tipo filter: valor actual del filtro */
  filterValue?: unknown;
  /** Solo para tipo filter: callback al cambiar (viewer) */
  onFilterChange?: (widgetId: string, value: unknown) => void;
  /** Altura mínima del bloque (px) */
  minHeight?: number;
  /** Clases CSS adicionales para el contenedor */
  className?: string;
  /** Tema oscuro: leyendas, ejes y etiquetas en color claro para fondo oscuro */
  darkChartTheme?: boolean;
  /** Ocultar cabecera del card (p. ej. cuando se usa dentro del editor) */
  hideHeader?: boolean;
}

export function DashboardWidgetRenderer({
  widget,
  isLoading = false,
  filterValue,
  onFilterChange,
  minHeight = 240,
  className = "",
  darkChartTheme = false,
  hideHeader = false,
}: DashboardWidgetRendererProps) {
  const effectiveMinHeight = widget.minHeight ?? minHeight;
  const chartType = useMemo(() => {
    const aggType = String((widget.aggregationConfig as { chartType?: string } | undefined)?.chartType ?? "").trim() as WidgetChartType;
    if (widget.type === "filter" || widget.type === "text" || widget.type === "image" || widget.type === "map") return widget.type;
    return (aggType || widget.type) as WidgetChartType;
  }, [widget.type, widget.aggregationConfig]);
  const chartConfig = widget.config;
  const tableRows = widget.rows;
  const hasViz = useMemo(() => {
    if (chartType === "kpi") return true;
    if (chartType === "table") return Array.isArray(tableRows) && tableRows.length > 0;
    if (chartType === "text") return true;
    if (chartType === "image") return true;
    if (chartType === "filter") return true;
    if (chartType === "map") return Array.isArray(tableRows) && tableRows.length > 0;
    return !!(chartConfig?.labels?.length && (chartConfig.datasets?.length ?? 0) > 0);
  }, [chartType, chartConfig, tableRows]);

  const kpiValue = useMemo(() => {
    if (chartType !== "kpi" || !Array.isArray(widget.rows) || widget.rows.length === 0) return null;
    const firstRow = widget.rows[0] as Record<string, unknown>;
    const keys = Object.keys(firstRow || {}).filter((k) => typeof firstRow[k] === "number" || typeof firstRow[k] === "string");
    const valKey = keys[0];
    if (!valKey) return null;
    const sum = (widget.rows as Record<string, unknown>[]).reduce((acc, row) => acc + Number(row[valKey] ?? 0), 0);
    return formatKpiValue(sum, widget.chartStyle as ChartStyleConfig | undefined);
  }, [chartType, widget.rows, widget.chartStyle]);

  const isCombo = chartType === "combo" && (chartConfig?.datasets?.length ?? 0) >= 2;
  const aggConfig = widget.aggregationConfig as {
    chartComboSyncAxes?: boolean;
    chartYAxes?: string[];
    chartScaleMode?: "auto" | "dataset" | "custom";
    chartScaleMin?: string | number;
    chartScaleMax?: string | number;
    chartAxisStep?: string | number;
    chartScalePerMetric?: Record<string, { min?: number; max?: number; step?: number }>;
    showDataLabels?: boolean;
  } | undefined;
  const comboSyncAxes = isCombo && aggConfig?.chartComboSyncAxes === true;

  const effectiveChartData = useMemo((): ChartConfig | null | undefined => {
    if (!isCombo || !chartConfig?.datasets?.[0]?.data || !chartConfig?.datasets?.[1]?.data) return chartConfig ?? null;
    if (!comboSyncAxes) return chartConfig;
    const d0 = chartConfig.datasets[0].data as number[];
    const d1 = chartConfig.datasets[1].data as number[];
    const min0 = Math.min(...d0);
    const max0 = Math.max(...d0);
    const min1 = Math.min(...d1);
    const max1 = Math.max(...d1);
    const range0 = max0 - min0 || 1;
    const range1 = max1 - min1 || 1;
    return {
      labels: chartConfig.labels,
      datasets: [
        { ...chartConfig.datasets[0], data: d0.map((v) => (v - min0) / range0) },
        { ...chartConfig.datasets[1], data: d1.map((v) => (v - min1) / range1) },
      ],
    };
  }, [isCombo, comboSyncAxes, chartConfig]);

  const chartOptions = useMemo(() => {
    const agg = widget.aggregationConfig as {
      chartGridXDisplay?: boolean;
      chartGridYDisplay?: boolean;
      chartGridColor?: string;
      chartXAxis?: string;
      chartYAxes?: string[];
      dateDimension?: string;
      dateGroupByGranularity?: DateGranularity;
      showDataLabels?: boolean;
      chartScaleMode?: "auto" | "dataset" | "custom";
      chartScaleMin?: string | number;
      chartScaleMax?: string | number;
      chartAxisStep?: string | number;
      chartScalePerMetric?: Record<string, { min?: number; max?: number; step?: number }>;
    } | undefined;
    const style: ChartStyleConfig | undefined = {
      ...(widget.chartStyle as ChartStyleConfig | undefined),
      ...(agg && {
        gridXDisplay: agg.chartGridXDisplay,
        gridYDisplay: agg.chartGridYDisplay,
        gridColor: agg.chartGridColor,
      }),
    };
    const labelMode = widget.labelDisplayMode ?? "percent";
    const type = chartType === "horizontalBar" ? "horizontalBar" : chartType === "area" ? "line" : chartType === "combo" ? "bar" : (chartType as "bar" | "line" | "pie" | "doughnut");
    const metricStyles = widget.chartMetricStyles as (ChartStyleConfig | undefined)[] | undefined;
    const usePerMetricFormat = Array.isArray(metricStyles) && metricStyles.length > 0;
    const optionsBase = getChartOptionsBase(darkChartTheme);
    const showDataLabels =
      typeof agg?.showDataLabels === "boolean"
        ? agg.showDataLabels
        : undefined;
    const allYValues = (chartConfig?.datasets ?? []).flatMap((ds) =>
      (Array.isArray(ds.data) ? ds.data : []).map((v) => Number(v)).filter((n) => Number.isFinite(n))
    );
    const datasetMin = allYValues.length > 0 ? Math.min(...allYValues) : undefined;
    const datasetMax = allYValues.length > 0 ? Math.max(...allYValues) : undefined;
    const parseNumeric = (raw: unknown): number | undefined => {
      if (raw == null || raw === "") return undefined;
      const n = Number(raw);
      return Number.isFinite(n) ? n : undefined;
    };
    const globalMin = agg?.chartScaleMode === "custom" ? parseNumeric(agg.chartScaleMin) : agg?.chartScaleMode === "dataset" ? datasetMin : undefined;
    const globalMax = agg?.chartScaleMode === "custom" ? parseNumeric(agg.chartScaleMax) : agg?.chartScaleMode === "dataset" ? datasetMax : undefined;
    const globalStep = parseNumeric(agg?.chartAxisStep);
    const yAxisKeys = Array.isArray(agg?.chartYAxes) ? agg.chartYAxes : [];
    const resolveMetricScale = (datasetIndex: number) => {
      const yKey = yAxisKeys[datasetIndex] ?? "";
      const per = yKey && agg?.chartScalePerMetric ? agg.chartScalePerMetric[yKey] : undefined;
      return {
        min: per?.min ?? globalMin,
        max: per?.max ?? globalMax,
        step: per?.step ?? globalStep,
      };
    };
    const xAxisKey = String(agg?.chartXAxis ?? "").trim().toLowerCase();
    const dateDimensionKey = String(agg?.dateDimension ?? "").trim().toLowerCase();
    const dateGranularity = agg?.dateGroupByGranularity;
    const shouldFormatDateAxis = !!dateGranularity || (xAxisKey !== "" && dateDimensionKey !== "" && xAxisKey === dateDimensionKey);
    const formatTemporalLabel = (raw: unknown): string => {
      const base = String(raw ?? "");
      if (!shouldFormatDateAxis) return base;
      const formatted = formatDateByGranularity(raw, dateGranularity ?? "day", base);
      return formatted ?? base;
    };
    if (type === "pie" || type === "doughnut") {
      const base = buildChartOptions(type, style, labelMode) as Record<string, unknown>;
      const baseDatalabels = (base.plugins as { datalabels?: Record<string, unknown> })?.datalabels ?? {};
      const legendColor = darkChartTheme ? AXIS_COLOR_DARK : AXIS_COLOR;
      const plugins = {
        ...optionsBase.plugins,
        ...(base.plugins as object),
        legend: buildPieDoughnutLegendShared(chartConfig ?? undefined, legendColor),
        datalabels: {
          ...baseDatalabels,
          ...(showDataLabels !== undefined ? { display: showDataLabels } : {}),
          ...(darkChartTheme && { color: DATALABEL_COLOR_DARK }),
        },
      };
      return {
        ...base,
        ...optionsBase,
        plugins,
      };
    }
    if (type === "bar" || type === "horizontalBar" || type === "line" || chartType === "combo") {
      const built = buildChartOptions(type, style, "value") as Record<string, unknown>;
      const builtPlugins = built.plugins as Record<string, unknown> | undefined;
      const builtDatalabels = builtPlugins?.datalabels as Record<string, unknown> | undefined ?? {};
      const datalabelFormatter =
        usePerMetricFormat
          ? (value: number, ctx?: { datasetIndex?: number }) => {
              const s = ctx?.datasetIndex != null && metricStyles[ctx.datasetIndex] != null ? metricStyles[ctx.datasetIndex]! : style;
              return getValueFormatter(s ?? undefined, "value")(value, ctx as { chart?: { data?: { datasets?: Array<{ data?: unknown[] }> } } });
            }
          : (builtDatalabels as { formatter?: (v: number, c?: unknown) => string }).formatter;

      const isComboTwo = chartType === "combo" && (chartConfig?.datasets?.length ?? 0) >= 2;
      const syncAxes = isComboTwo && (widget.aggregationConfig as { chartComboSyncAxes?: boolean } | undefined)?.chartComboSyncAxes === true;
      let comboScales: Record<string, unknown> | undefined;
      if (isComboTwo && chartConfig?.datasets?.[0]?.data && chartConfig?.datasets?.[1]?.data) {
        const d0 = chartConfig.datasets[0].data as number[];
        const d1 = chartConfig.datasets[1].data as number[];
        const min0 = Math.min(...d0);
        const max0 = Math.max(...d0);
        const min1 = Math.min(...d1);
        const max1 = Math.max(...d1);
        const range0 = max0 - min0 || 1;
        const range1 = max1 - min1 || 1;
        const style0 = (usePerMetricFormat && metricStyles[0]) ? metricStyles[0]! : style;
        const style1 = (usePerMetricFormat && metricStyles[1]) ? metricStyles[1]! : style;
        const fmt0 = getValueFormatter(style0 ?? undefined, "value");
        const fmt1 = getValueFormatter(style1 ?? undefined, "value");
        comboScales = {
          ...(built.scales as Record<string, unknown>),
          y: {
            ...(built.scales as Record<string, unknown>)?.y as object,
            ...(syncAxes && {
              min: 0,
              max: 1,
              ticks: {
                ...(((built.scales as Record<string, unknown>)?.y as Record<string, unknown> | undefined)?.ticks ?? {}),
                callback: (value: number) => fmt0(value * range0 + min0),
              },
            }),
          },
          y1: {
            position: "right" as const,
            grid: {
              drawOnChartArea: false,
              display: style?.gridYDisplay ?? true,
              color: style?.gridColor ?? (darkChartTheme ? GRID_COLOR_DARK : GRID_COLOR),
            },
            ...(syncAxes && {
              min: 0,
              max: 1,
              ticks: {
                callback: (value: number) => fmt1(value * range1 + min1),
              },
            }),
          },
        };
        if (!syncAxes) {
          const scale0 = resolveMetricScale(0);
          const scale1 = resolveMetricScale(1);
          comboScales = {
            ...comboScales,
            y: {
              ...((comboScales.y as Record<string, unknown> | undefined) ?? {}),
              ...(scale0.min != null ? { min: scale0.min } : {}),
              ...(scale0.max != null ? { max: scale0.max } : {}),
              ticks: {
                ...((((comboScales.y as Record<string, unknown> | undefined)?.ticks as Record<string, unknown>) ?? {})),
                ...(scale0.step != null ? { stepSize: scale0.step } : {}),
              },
            },
            y1: {
              ...((comboScales.y1 as Record<string, unknown> | undefined) ?? {}),
              ...(scale1.min != null ? { min: scale1.min } : {}),
              ...(scale1.max != null ? { max: scale1.max } : {}),
              ticks: {
                ...((((comboScales.y1 as Record<string, unknown> | undefined)?.ticks as Record<string, unknown>) ?? {})),
                ...(scale1.step != null ? { stepSize: scale1.step } : {}),
              },
            },
          };
        }
      }

      const tooltipCallbacks =
        usePerMetricFormat || syncAxes
          ? {
              title: (items: Array<{ label?: unknown }>) => {
                const first = items?.[0];
                return formatTemporalLabel(first?.label ?? "");
              },
              label: (context: { dataset: { label?: string }; parsed: { y?: number }; datasetIndex?: number }) => {
                let rawY = context.parsed?.y ?? 0;
                if (syncAxes && chartConfig?.datasets?.[0]?.data && chartConfig?.datasets?.[1]?.data && context.datasetIndex != null) {
                  const d0 = chartConfig.datasets[0].data as number[];
                  const d1 = chartConfig.datasets[1].data as number[];
                  const min0 = Math.min(...d0);
                  const max0 = Math.max(...d0);
                  const min1 = Math.min(...d1);
                  const max1 = Math.max(...d1);
                  const range0 = max0 - min0 || 1;
                  const range1 = max1 - min1 || 1;
                  rawY = context.datasetIndex === 0 ? rawY * range0 + min0 : rawY * range1 + min1;
                }
                const s = context?.datasetIndex != null && metricStyles?.[context.datasetIndex] != null ? metricStyles[context.datasetIndex]! : style;
                const formatted = s != null ? getValueFormatter(s, "value")(rawY, context as { chart?: { data?: { datasets?: Array<{ data?: unknown[] }> } } }) : String(rawY);
                return `${context.dataset?.label ?? ""}: ${formatted}`;
              },
            }
          : shouldFormatDateAxis
            ? {
                title: (items: Array<{ label?: unknown }>) => {
                  const first = items?.[0];
                  return formatTemporalLabel(first?.label ?? "");
                },
              }
            : undefined;
      const builtScales = (built.scales as Record<string, unknown> | undefined) ?? {};
      const primaryScaleKey = type === "horizontalBar" ? "x" : "y";
      const xScale = (builtScales.x as Record<string, unknown> | undefined) ?? {};
      const xTicks = (xScale.ticks as Record<string, unknown> | undefined) ?? {};
      const primaryScale = (builtScales[primaryScaleKey] as Record<string, unknown> | undefined) ?? {};
      const primaryTicks = (primaryScale.ticks as Record<string, unknown> | undefined) ?? {};
      const primaryMetricScale = resolveMetricScale(0);
      const patchedXScale = {
        ...xScale,
        ...(primaryScaleKey === "x" && primaryMetricScale.min != null ? { min: primaryMetricScale.min } : {}),
        ...(primaryScaleKey === "x" && primaryMetricScale.max != null ? { max: primaryMetricScale.max } : {}),
        ticks: {
          ...xTicks,
          ...(primaryScaleKey === "x" && primaryMetricScale.step != null ? { stepSize: primaryMetricScale.step } : {}),
          callback: (value: unknown, index: number) => {
            const source =
              Array.isArray(chartConfig?.labels) && chartConfig.labels[index] != null
                ? chartConfig.labels[index]
                : value;
            return formatTemporalLabel(source);
          },
        },
      };
      const patchedScales = {
        ...builtScales,
        x: patchedXScale,
        ...(primaryScaleKey === "y"
          ? {
              y: {
                ...primaryScale,
                ...(primaryMetricScale.min != null ? { min: primaryMetricScale.min } : {}),
                ...(primaryMetricScale.max != null ? { max: primaryMetricScale.max } : {}),
                ticks: {
                  ...primaryTicks,
                  ...(primaryMetricScale.step != null ? { stepSize: primaryMetricScale.step } : {}),
                },
              },
            }
          : {}),
      };
      const plugins = {
        ...optionsBase.plugins,
        ...builtPlugins,
        datalabels: {
          ...builtDatalabels,
          ...(showDataLabels !== undefined ? { display: showDataLabels } : {}),
          ...(datalabelFormatter != null && { formatter: datalabelFormatter }),
          ...(darkChartTheme && { color: DATALABEL_COLOR_DARK }),
        },
        ...(tooltipCallbacks && {
          tooltip: {
            ...(optionsBase.plugins as { tooltip?: Record<string, unknown> }).tooltip,
            callbacks: tooltipCallbacks,
          },
        }),
      };
      const baseReturn = { ...optionsBase, ...built, plugins, scales: patchedScales };
      if (comboScales) {
        return {
          ...baseReturn,
          scales: {
            ...comboScales,
            x: (patchedScales.x as Record<string, unknown> | undefined) ?? (comboScales as Record<string, unknown>).x,
          },
        };
      }
      return baseReturn;
    }
    return optionsBase;
  }, [chartType, chartConfig, widget.chartStyle, widget.chartMetricStyles, widget.labelDisplayMode, widget.aggregationConfig, darkChartTheme]);

  return (
    <Card
      className={`overflow-hidden border transition-all ${className}`}
      style={{
        minHeight: effectiveMinHeight,
        background: "var(--platform-surface, #fff)",
        borderColor: "var(--platform-border, #e2e8f0)",
        borderWidth: "var(--platform-card-border-width, 1px)",
        borderRadius: "var(--platform-card-radius, 0.75rem)",
      }}
    >
      {!hideHeader && (
        <header className="flex flex-shrink-0 items-center justify-between gap-2 border-b px-4 py-2" style={{ borderColor: "var(--platform-border, #e2e8f0)" }}>
          <h3 className="truncate text-sm font-semibold" style={{ color: "var(--platform-fg, #0f172a)" }}>
            {widget.title}
          </h3>
        </header>
      )}
      <div className="relative flex flex-1 flex-col p-3" style={{ minHeight: hideHeader ? effectiveMinHeight - 12 : effectiveMinHeight - 52 }}>
        {isLoading && (
          <div
            className="absolute inset-0 z-10 flex items-center justify-center rounded-b-xl"
            style={{ background: "var(--platform-surface, #fff)" }}
          >
            <Loader2 className="h-8 w-8 animate-spin" style={{ color: "var(--platform-accent, #0ea5e9)" }} />
          </div>
        )}
        {!hasViz && !isLoading && chartType !== "filter" && (
          <div className="flex flex-1 flex-col items-center justify-center py-8 text-center text-sm" style={{ color: "var(--platform-fg-muted, #64748b)" }}>
            Sin datos
          </div>
        )}
        {hasViz && !isLoading && (
          <>
            {chartType === "kpi" && (
              <div className="flex flex-1 flex-col items-center justify-center gap-1">
                <span className="text-3xl font-bold tabular-nums" style={{ color: "var(--platform-fg, #0f172a)" }}>
                  {kpiValue ?? "—"}
                </span>
                {(widget.kpiSecondaryLabel || widget.kpiSecondaryValue) && (
                  <span className="text-sm" style={{ color: "var(--platform-fg-muted, #64748b)" }}>
                    {widget.kpiSecondaryLabel} {widget.kpiSecondaryValue}
                  </span>
                )}
              </div>
            )}
            {chartType === "table" && Array.isArray(tableRows) && tableRows.length > 0 && (
              <div className="overflow-auto text-xs">
                <table className="w-full">
                  <thead>
                    <tr className="border-b text-left" style={{ borderColor: "var(--platform-border)" }}>
                      {Object.keys(tableRows[0] || {}).map((k) => (
                        <th key={k} className="py-1.5 pr-2 font-medium" style={{ color: "var(--platform-fg-muted)" }}>
                          {k}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tableRows.slice(0, 10).map((row, i) => (
                      <tr key={i} className="border-b" style={{ borderColor: "var(--platform-border)" }}>
                        {Object.values(row).map((v, j) => (
                          <td key={j} className="py-1.5 pr-2" style={{ color: "var(--platform-fg)" }}>
                            {String(v ?? "")}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {chartType === "text" && (
              <DashboardTextWidget content={widget.content ?? ""} isEditing={false} />
            )}
            {chartType === "image" && widget.imageUrl && (
              <div className="flex flex-1 items-center justify-center overflow-hidden">
                <img
                  src={widget.imageUrl as string}
                  alt={widget.title}
                  className="max-h-full max-w-full object-contain"
                  style={{
                    width: widget.imageConfig?.width,
                    height: widget.imageConfig?.height,
                    objectFit: widget.imageConfig?.objectFit ?? "contain",
                  }}
                />
              </div>
            )}
            {chartType === "filter" && widget.filterConfig && (
              <div className="flex flex-col gap-2">
                <label className="text-xs font-medium" style={{ color: "var(--platform-fg-muted)" }}>
                  {widget.filterConfig.label}
                </label>
                {widget.filterConfig.inputType === "select" && Array.isArray(widget.facetValues?.[widget.filterConfig.field]) ? (
                  <select
                    className="w-full rounded-lg border px-3 py-2 text-sm"
                    style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}
                    value={Array.isArray(filterValue) ? (filterValue as string[])?.[0] ?? "" : String(filterValue ?? "")}
                    onChange={(e) => onFilterChange?.(widget.id, e.target.value)}
                  >
                    <option value="">Todos</option>
                    {(widget.facetValues![widget.filterConfig!.field] as unknown[]).map((v) => (
                      <option key={String(v)} value={String(v)}>{String(v)}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type={widget.filterConfig.inputType === "number" ? "number" : widget.filterConfig.inputType === "date" ? "date" : "text"}
                    className="w-full rounded-lg border px-3 py-2 text-sm"
                    style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}
                    value={Array.isArray(filterValue) ? (filterValue as string[])?.[0] ?? "" : String(filterValue ?? "")}
                    onChange={(e) => onFilterChange?.(widget.id, widget.filterConfig?.inputType === "number" ? e.target.valueAsNumber : e.target.value)}
                  />
                )}
              </div>
            )}
            {chartType === "map" && (
              <div className="flex flex-1 flex-col min-h-0">
                {!Array.isArray(tableRows) || tableRows.length === 0 ? (
                  <div className="flex flex-1 flex-col items-center justify-center py-8 text-center text-sm" style={{ color: "var(--platform-fg-muted, #64748b)" }}>
                    No hay datos geográficos
                  </div>
                ) : (
                  <DashboardMapWidget
                    rows={tableRows as Record<string, unknown>[]}
                    aggregationConfig={widget.aggregationConfig as { chartXAxis?: string; chartYAxes?: string[]; dimension?: string; dimensions?: string[] } | undefined}
                    height={Math.max(220, (effectiveMinHeight ?? 240) - 52)}
                  />
                )}
              </div>
            )}
            {chartType !== "kpi" && chartType !== "table" && chartType !== "text" && chartType !== "image" && chartType !== "filter" && chartType !== "map" && chartConfig && (
              <div className="h-[220px] w-full">
                {(chartType === "bar" || chartType === "combo") && <Bar data={(chartType === "combo" && effectiveChartData ? effectiveChartData : chartConfig) as never} options={chartOptions as never} />}
                {chartType === "horizontalBar" && (
                  (() => {
                    const optionsRecord = chartOptions as Record<string, unknown>;
                    const scales = (optionsRecord.scales as Record<string, unknown> | undefined) ?? {};
                    const yScale = (scales.y as Record<string, unknown> | undefined) ?? {};
                    const yTicks = (yScale.ticks as Record<string, unknown> | undefined) ?? {};
                    const horizontalOptions = {
                      ...optionsRecord,
                      indexAxis: "y" as const,
                      scales: {
                        ...scales,
                        y: {
                          ...yScale,
                          ticks: { ...yTicks, maxTicksLimit: 12 },
                        },
                      },
                    };
                    return <Bar data={chartConfig as never} options={horizontalOptions as never} />;
                  })()
                )}
                {(chartType === "line" || chartType === "area") && (
                  <Line
                    data={chartType === "area" ? { ...chartConfig, datasets: chartConfig.datasets.map((ds) => ({ ...ds, fill: true })) } as never : chartConfig as never}
                    options={chartOptions as never}
                  />
                )}
                {chartType === "pie" && <Pie data={chartConfig as never} options={chartOptions as never} />}
                {chartType === "doughnut" && <Doughnut data={chartConfig as never} options={chartOptions as never} />}
                {chartType === "scatter" && <Scatter data={chartConfig as never} options={chartOptions as never} />}
              </div>
            )}
          </>
        )}
      </div>
    </Card>
  );
}
