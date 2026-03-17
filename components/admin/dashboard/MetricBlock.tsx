"use client";

import { useMemo } from "react";
import { Loader2, Play, Trash2, MoreHorizontal } from "lucide-react";
import { Bar, Line, Pie, Doughnut, Scatter } from "react-chartjs-2";
import { DashboardWidgetRenderer, type DashboardWidgetRendererWidget } from "@/components/dashboard/DashboardWidgetRenderer";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Tooltip,
  Legend,
  Filler
);

export type MetricBlockState = "estable" | "alerta" | "cambio";

export type ChartConfig = {
  labels: string[];
  datasets: Array<{
    label: string;
    data: number[];
    backgroundColor?: string | string[];
    hoverBackgroundColor?: string | string[];
    borderColor?: string | string[];
    borderWidth?: number;
    fill?: boolean;
    type?: "bar" | "line";
    /** Eje Y a usar en gráficos combo (ej. "y", "y1"). */
    yAxisID?: string;
  }>;
};

const HEIGHT_OPTIONS = [
  { value: 200, label: "Pequeña (200px)" },
  { value: 280, label: "Mediana (280px)" },
  { value: 360, label: "Grande (360px)" },
  { value: 440, label: "Extra (440px)" },
] as const;

const SPAN_OPTIONS = [
  { value: 1, label: "1 columna" },
  { value: 2, label: "2 columnas" },
  { value: 4, label: "Ancho completo" },
] as const;

type MetricBlockProps = {
  id: string;
  title: string;
  purpose?: string;
  state?: MetricBlockState;
  insight?: string;
  chartConfig?: ChartConfig | null;
  chartType?: "bar" | "horizontalBar" | "line" | "area" | "pie" | "doughnut" | "kpi" | "table" | "combo" | "scatter";
  isLoading?: boolean;
  isSelected?: boolean;
  onSelect?: () => void;
  onRun?: () => void;
  onDelete?: () => void;
  kpiValue?: string | number;
  tableRows?: Record<string, unknown>[];
  gridSpan?: number;
  minHeight?: number;
  onSizeChange?: (patch: { gridSpan?: number; minHeight?: number }) => void;
  /** Opciones de líneas de cuadrícula desde aggregationConfig */
  chartGridXDisplay?: boolean;
  chartGridYDisplay?: boolean;
  chartGridColor?: string;
  /** Widget completo para renderizar con el mismo componente que la vista final (editor = vista fiel) */
  widgetForRenderer?: DashboardWidgetRendererWidget;
};

const STATE_LABELS: Record<MetricBlockState, string> = {
  estable: "Estable",
  alerta: "Alerta",
  cambio: "Cambio",
};

const PREVIEW_AXIS_COLOR = "#64748b";
const PREVIEW_GRID_COLOR = "#e2e8f0";

function getChartOptions(gridOpts?: { chartGridXDisplay?: boolean; chartGridYDisplay?: boolean; chartGridColor?: string }) {
  const gridColor = gridOpts?.chartGridColor?.trim() || PREVIEW_GRID_COLOR;
  const gridX = { display: gridOpts?.chartGridXDisplay !== false, color: gridColor };
  const gridY = { display: gridOpts?.chartGridYDisplay !== false, color: gridColor };
  return {
    responsive: true,
    maintainAspectRatio: false,
    layout: { padding: 8 },
    plugins: {
      legend: {
        display: true,
        position: "top" as const,
        align: "center" as const,
        labels: { color: PREVIEW_AXIS_COLOR, font: { size: 12 }, padding: 16, usePointStyle: true, pointStyle: "circle" },
      },
      tooltip: { enabled: true },
    },
    scales: {
      x: {
        display: true,
        grid: gridX,
        ticks: { color: PREVIEW_AXIS_COLOR, maxTicksLimit: 8, font: { size: 11 } },
        title: { display: false },
      },
      y: {
        display: true,
        grid: gridY,
        ticks: { color: PREVIEW_AXIS_COLOR, font: { size: 11 }, maxTicksLimit: 8 },
        title: { display: false },
      },
    },
  };
}

const CHART_OPTIONS = getChartOptions();

const legendTextColor = "#334155";
function buildPieDoughnutLegend(chartConfig: ChartConfig | null | undefined): Record<string, unknown> {
  const ds0 = chartConfig?.datasets?.[0];
  if (!ds0 || !Array.isArray(ds0.backgroundColor) || !chartConfig?.labels?.length) {
    return { display: true, position: "right" as const, labels: { color: legendTextColor, font: { size: 12, color: legendTextColor } } };
  }
  return {
    display: true,
    position: "right" as const,
    labels: {
      color: legendTextColor,
      font: { size: 12, color: legendTextColor },
      padding: 12,
      usePointStyle: false,
      generateLabels: () =>
        chartConfig.labels.map((label, i) => {
          const bg = (ds0.backgroundColor as string[])[i] ?? (typeof ds0.backgroundColor === "string" ? ds0.backgroundColor : "#0ea5e9");
          return {
            text: String(label || ""),
            fillStyle: typeof bg === "string" ? bg : "#0ea5e9",
            strokeStyle: "#fff",
            lineWidth: 1,
            hidden: false,
            index: i,
            datasetIndex: 0,
            fontColor: legendTextColor,
          };
        }),
    },
  };
}

export function MetricBlock({
  id,
  title,
  purpose,
  state = "estable",
  insight,
  chartConfig,
  chartType = "bar",
  isLoading,
  isSelected,
  onSelect,
  onRun,
  onDelete,
  kpiValue,
  tableRows,
  gridSpan = 2,
  minHeight = 280,
  onSizeChange,
  chartGridXDisplay,
  chartGridYDisplay,
  chartGridColor,
  widgetForRenderer,
}: MetricBlockProps) {
  const chartOptionsWithGrid = useMemo(
    () =>
      chartGridXDisplay !== undefined || chartGridYDisplay !== undefined || (chartGridColor != null && chartGridColor !== "")
        ? getChartOptions({ chartGridXDisplay, chartGridYDisplay, chartGridColor })
        : CHART_OPTIONS,
    [chartGridXDisplay, chartGridYDisplay, chartGridColor]
  );
  const hasViz = useMemo(() => {
    if (chartType === "kpi") return kpiValue != null;
    if (chartType === "table") return Array.isArray(tableRows) && tableRows.length > 0;
    return chartConfig?.labels?.length && (chartConfig.datasets?.length ?? 0) > 0;
  }, [chartType, chartConfig, kpiValue, tableRows]);

  return (
    <article
      role="button"
      tabIndex={0}
      data-selected={isSelected ? "true" : undefined}
      className="metric-block group relative flex flex-col transition-all cursor-pointer"
      onClick={onSelect}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSelect?.()}
    >
      <header className="metric-block-header flex flex-shrink-0 items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="metric-block-title truncate">{title}</h3>
          {purpose && (
            <p className="mt-0.5 truncate text-[var(--studio-text-small)] text-[var(--studio-fg-muted)]">{purpose}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span
            className="metric-state-badge flex-shrink-0"
            data-state={state}
          >
            {STATE_LABELS[state]}
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button
                variant="ghost"
                size="icon"
                className="metric-block-menu-trigger h-9 w-9 rounded-lg text-[var(--studio-fg-muted)] hover:bg-[var(--studio-surface-hover)] hover:text-[var(--studio-fg)] focus-visible:ring-2 focus-visible:ring-[var(--studio-accent)]"
                aria-label="Opciones de gráfica"
              >
                <MoreHorizontal className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              sideOffset={6}
              className="metric-block-dropdown w-56 rounded-xl border border-[var(--studio-border)] shadow-lg py-1.5"
              style={{
                backgroundColor: "var(--studio-surface, #141419)",
                opacity: 1,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <DropdownMenuLabel className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-[var(--studio-fg-muted)]">
                Modificar gráfica
              </DropdownMenuLabel>
              <DropdownMenuItem
                className="metric-block-dropdown-item flex items-center gap-3 rounded-lg px-3 py-2.5 mx-1.5 my-0.5 text-sm text-[var(--studio-fg)] focus:bg-[var(--studio-accent-dim)] focus:text-[var(--studio-accent)]"
                onClick={(e) => { e.stopPropagation(); onRun?.(); }}
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--studio-bg-elevated)]">
                  <Play className="h-4 w-4" />
                </span>
                <span>Actualizar datos</span>
              </DropdownMenuItem>
              {onSizeChange && (
                <>
                  <DropdownMenuSeparator className="my-1.5 bg-[var(--studio-border)]" />
                  <DropdownMenuLabel className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-[var(--studio-fg-muted)]">
                    Tamaño
                  </DropdownMenuLabel>
                  <div className="px-2 py-1">
                    <p className="mb-1.5 px-1.5 text-[11px] text-[var(--studio-fg-muted)]">Ancho (columnas)</p>
                    {SPAN_OPTIONS.map((opt) => (
                      <DropdownMenuItem
                        key={opt.value}
                        className="metric-block-dropdown-item flex items-center justify-between rounded-lg px-3 py-2 mx-0.5 text-sm text-[var(--studio-fg)] focus:bg-[var(--studio-accent-dim)] focus:text-[var(--studio-accent)]"
                        onClick={(e) => { e.stopPropagation(); onSizeChange({ gridSpan: opt.value }); }}
                      >
                        {opt.label}
                        {gridSpan === opt.value && <span className="text-[var(--studio-accent)] font-medium">✓</span>}
                      </DropdownMenuItem>
                    ))}
                  </div>
                  <div className="px-2 py-1">
                    <p className="mb-1.5 px-1.5 text-[11px] text-[var(--studio-fg-muted)]">Alto (px)</p>
                    {HEIGHT_OPTIONS.map((opt) => (
                      <DropdownMenuItem
                        key={opt.value}
                        className="metric-block-dropdown-item flex items-center justify-between rounded-lg px-3 py-2 mx-0.5 text-sm text-[var(--studio-fg)] focus:bg-[var(--studio-accent-dim)] focus:text-[var(--studio-accent)]"
                        onClick={(e) => { e.stopPropagation(); onSizeChange({ minHeight: opt.value }); }}
                      >
                        {opt.label}
                        {minHeight === opt.value && <span className="text-[var(--studio-accent)] font-medium">✓</span>}
                      </DropdownMenuItem>
                    ))}
                  </div>
                </>
              )}
              {onDelete && (
                <>
                  <DropdownMenuSeparator className="my-1.5 bg-[var(--studio-border)]" />
                  <DropdownMenuItem
                    className="metric-block-dropdown-item flex items-center gap-3 rounded-lg px-3 py-2.5 mx-1.5 my-0.5 text-sm text-[var(--studio-danger)] focus:bg-red-500/10 focus:text-[var(--studio-danger)]"
                    onClick={(e) => { e.stopPropagation(); onDelete(); }}
                  >
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-500/10">
                      <Trash2 className="h-4 w-4" />
                    </span>
                    <span>Eliminar</span>
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <div className="metric-block-body relative flex flex-1 flex-col">
        {insight && (
          <p className="metric-insight mb-3 text-[var(--studio-text-small)] text-[var(--studio-muted)]">{insight}</p>
        )}
        {isLoading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-b-[var(--studio-radius)] bg-[var(--studio-surface)]/90 backdrop-blur-sm">
            <Loader2 className="h-8 w-8 animate-spin text-[var(--studio-accent)]" />
          </div>
        )}
        {!hasViz && !isLoading && (
          <div className="studio-viz-placeholder flex flex-1 flex-col items-center justify-center rounded-[var(--studio-radius-sm)] py-10 text-center">
            <p className="text-[13px]">Ejecutá para ver datos</p>
            <Button
              variant="ghost"
              size="sm"
              className="mt-3 text-[var(--studio-accent)] hover:bg-[var(--studio-accent-dim)]"
              onClick={(e) => { e.stopPropagation(); onRun?.(); }}
            >
              <Play className="mr-1.5 h-4 w-4" />
              Actualizar
            </Button>
          </div>
        )}
        {hasViz && !isLoading && (
          <>
            {widgetForRenderer ? (
              <div className="flex-1 min-h-0 w-full">
                <DashboardWidgetRenderer
                  widget={widgetForRenderer}
                  isLoading={false}
                  hideHeader
                  minHeight={220}
                  className="!border-0 !p-0 !shadow-none h-full"
                />
              </div>
            ) : (
              <>
                {chartType === "kpi" && (
                  <div className="flex flex-1 items-center justify-center">
                    <span className="text-[2.25rem] font-bold tabular-nums text-[var(--studio-fg)] tracking-tight" style={{ fontFamily: "var(--studio-font)" }}>
                      {kpiValue}
                    </span>
                  </div>
                )}
                {chartType === "table" && Array.isArray(tableRows) && tableRows.length > 0 && (
                  <div className="overflow-auto text-[12px]">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-[var(--studio-border)] text-left text-[var(--studio-muted)]">
                          {Object.keys(tableRows[0] || {}).map((k) => (
                            <th key={k} className="py-1.5 pr-2 font-medium">{k}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {tableRows.slice(0, 5).map((row, i) => (
                          <tr key={i} className="border-b border-[var(--studio-border)]/60">
                            {Object.values(row).map((v, j) => (
                              <td key={j} className="py-1.5 pr-2 text-[var(--studio-fg)]">
                                {String(v ?? "")}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {chartType !== "kpi" && chartType !== "table" && chartConfig && (
                  <div className="h-[220px] w-full">
                    {chartType === "bar" && <Bar data={chartConfig as any} options={chartOptionsWithGrid} />}
                    {chartType === "horizontalBar" && <Bar data={chartConfig as any} options={{ ...chartOptionsWithGrid, indexAxis: "y" as const, scales: { ...chartOptionsWithGrid.scales, y: { ...chartOptionsWithGrid.scales.y, ticks: { ...chartOptionsWithGrid.scales.y.ticks, maxTicksLimit: 12 } } } }} />}
                    {chartType === "line" && <Line data={chartConfig as any} options={chartOptionsWithGrid} />}
                    {chartType === "area" && <Line data={{ ...chartConfig, datasets: chartConfig.datasets.map((ds) => ({ ...ds, fill: true })) } as any} options={chartOptionsWithGrid} />}
                    {chartType === "pie" && <Pie data={chartConfig as any} options={{ ...chartOptionsWithGrid, plugins: { ...chartOptionsWithGrid.plugins, legend: buildPieDoughnutLegend(chartConfig) } } as any} />}
                    {chartType === "doughnut" && <Doughnut data={chartConfig as any} options={{ ...chartOptionsWithGrid, plugins: { ...chartOptionsWithGrid.plugins, legend: buildPieDoughnutLegend(chartConfig) } } as any} />}
                    {chartType === "combo" && <Bar data={chartConfig as any} options={chartOptionsWithGrid} />}
                    {chartType === "scatter" && <Scatter data={chartConfig as any} options={chartOptionsWithGrid} />}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </article>
  );
}
