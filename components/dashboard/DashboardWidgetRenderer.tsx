"use client";

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
import { buildChartOptions, type ChartStyleConfig } from "@/lib/dashboard/chartOptions";
import { DashboardTextWidget } from "./DashboardTextWidget";

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
  | "scatter";

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

function buildPieDoughnutLegend(
  chartConfig: ChartConfig | null | undefined,
  darkTheme: boolean
): Record<string, unknown> {
  const axisColor = darkTheme ? AXIS_COLOR_DARK : AXIS_COLOR;
  const ds0 = chartConfig?.datasets?.[0];
  if (!ds0 || !Array.isArray(ds0.backgroundColor) || !chartConfig?.labels?.length) {
    return { display: true, position: "right" as const, labels: { color: axisColor } };
  }
  return {
    display: true,
    position: "right" as const,
    labels: {
      color: axisColor,
      padding: 12,
      generateLabels: () =>
        chartConfig.labels.map((label, i) => {
          const bg = (ds0.backgroundColor as string[])[i] ?? "#0ea5e9";
          return {
            text: String(label ?? ""),
            fillStyle: typeof bg === "string" ? bg : "#0ea5e9",
            strokeStyle: "#fff",
            lineWidth: 1,
            hidden: false,
            index: i,
            datasetIndex: 0,
          };
        }),
    },
  };
}

function formatKpiValue(value: unknown): string {
  if (value == null || value === "") return "—";
  const n = Number(value);
  if (Number.isNaN(n)) return String(value);
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
}

export function DashboardWidgetRenderer({
  widget,
  isLoading = false,
  filterValue,
  onFilterChange,
  minHeight = 240,
  className = "",
  darkChartTheme = false,
}: DashboardWidgetRendererProps) {
  const effectiveMinHeight = widget.minHeight ?? minHeight;
  const chartType = (widget.type === "kpi" || widget.type === "table" ? widget.type : (widget.aggregationConfig as { chartType?: string } | undefined)?.chartType ?? widget.type) as WidgetChartType;
  const chartConfig = widget.config;
  const tableRows = widget.rows;
  const hasViz = useMemo(() => {
    if (chartType === "kpi") return true;
    if (chartType === "table") return Array.isArray(tableRows) && tableRows.length > 0;
    if (chartType === "text") return true;
    if (chartType === "image") return true;
    if (chartType === "filter") return true;
    return !!(chartConfig?.labels?.length && (chartConfig.datasets?.length ?? 0) > 0);
  }, [chartType, chartConfig, tableRows]);

  const kpiValue = useMemo(() => {
    if (chartType !== "kpi" || !Array.isArray(widget.rows) || widget.rows.length === 0) return null;
    const firstRow = widget.rows[0] as Record<string, unknown>;
    const keys = Object.keys(firstRow || {}).filter((k) => typeof firstRow[k] === "number" || typeof firstRow[k] === "string");
    const valKey = keys[0];
    if (!valKey) return null;
    const sum = (widget.rows as Record<string, unknown>[]).reduce((acc, row) => acc + Number(row[valKey] ?? 0), 0);
    return formatKpiValue(sum);
  }, [chartType, widget.rows]);

  const chartOptions = useMemo(() => {
    const style = (widget.chartStyle as ChartStyleConfig | undefined) ?? undefined;
    const labelMode = widget.labelDisplayMode ?? "percent";
    const type = chartType === "horizontalBar" ? "horizontalBar" : chartType === "area" ? "line" : (chartType as "bar" | "line" | "pie" | "doughnut");
    const optionsBase = getChartOptionsBase(darkChartTheme);
    if (type === "pie" || type === "doughnut") {
      const base = buildChartOptions(type, style, labelMode) as Record<string, unknown>;
      const baseDatalabels = (base.plugins as { datalabels?: Record<string, unknown> })?.datalabels ?? {};
      const plugins = {
        ...optionsBase.plugins,
        ...(base.plugins as object),
        legend: buildPieDoughnutLegend(chartConfig ?? undefined, darkChartTheme),
        datalabels: {
          ...baseDatalabels,
          ...(darkChartTheme && { color: DATALABEL_COLOR_DARK }),
        },
      };
      return {
        ...base,
        ...optionsBase,
        plugins,
      };
    }
    if (type === "bar" || type === "horizontalBar" || type === "line") {
      const built = buildChartOptions(type, style, "value") as Record<string, unknown>;
      const builtPlugins = built.plugins as Record<string, unknown> | undefined;
      const builtDatalabels = builtPlugins?.datalabels as Record<string, unknown> | undefined ?? {};
      const plugins = {
        ...optionsBase.plugins,
        ...builtPlugins,
        ...(darkChartTheme && {
          datalabels: { ...builtDatalabels, color: DATALABEL_COLOR_DARK },
        }),
      };
      return { ...optionsBase, ...built, plugins };
    }
    return optionsBase;
  }, [chartType, chartConfig, widget.chartStyle, widget.labelDisplayMode, darkChartTheme]);

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
      <header className="flex flex-shrink-0 items-center justify-between gap-2 border-b px-4 py-2" style={{ borderColor: "var(--platform-border, #e2e8f0)" }}>
        <h3 className="truncate text-sm font-semibold" style={{ color: "var(--platform-fg, #0f172a)" }}>
          {widget.title}
        </h3>
      </header>
      <div className="relative flex flex-1 flex-col p-3" style={{ minHeight: effectiveMinHeight - 52 }}>
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
            {chartType !== "kpi" && chartType !== "table" && chartType !== "text" && chartType !== "image" && chartType !== "filter" && chartConfig && (
              <div className="h-[220px] w-full">
                {(chartType === "bar" || chartType === "combo") && <Bar data={chartConfig as never} options={chartOptions as never} />}
                {chartType === "horizontalBar" && (
                  <Bar
                    data={chartConfig as never}
                    options={{ ...chartOptions, indexAxis: "y" as const, scales: { ...(chartOptions as any).scales, y: { ...(chartOptions as any).scales?.y, ticks: { ...(chartOptions as any).scales?.y?.ticks, maxTicksLimit: 12 } } } } as never}
                  />
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
