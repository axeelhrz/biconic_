"use client";

import { useMemo } from "react";
import { Loader2, Play, Trash2, MoreHorizontal } from "lucide-react";
import { Bar, Line, Pie, Doughnut } from "react-chartjs-2";
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
    borderColor?: string | string[];
    borderWidth?: number;
    fill?: boolean;
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
  chartType?: "bar" | "line" | "pie" | "doughnut" | "kpi" | "table";
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
};

const STATE_LABELS: Record<MetricBlockState, string> = {
  estable: "Estable",
  alerta: "Alerta",
  cambio: "Cambio",
};

const CHART_OPTIONS = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: { enabled: true },
  },
  scales: {
    x: { grid: { display: false }, ticks: { maxTicksLimit: 6, font: { size: 10 }, color: "#71717a" } },
    y: { grid: { color: "rgba(255,255,255,0.06)" }, ticks: { maxTicksLimit: 5, font: { size: 10 }, color: "#71717a" } },
  },
};

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
}: MetricBlockProps) {
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
                className="h-8 w-8 rounded-lg text-[var(--studio-muted)] opacity-0 group-hover:opacity-100 hover:bg-[var(--studio-surface-hover)] hover:text-[var(--studio-fg)]"
                aria-label="Opciones"
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="rounded-xl border-[var(--studio-border)] bg-[var(--studio-surface)] shadow-xl" onClick={(e) => e.stopPropagation()}>
              <DropdownMenuItem className="rounded-lg text-[var(--studio-fg)] focus:bg-[var(--studio-accent-dim)] focus:text-[var(--studio-accent)]" onClick={(e) => { e.stopPropagation(); onRun?.(); }}>
                <Play className="mr-2 h-4 w-4" />
                Actualizar datos
              </DropdownMenuItem>
              {onSizeChange && (
                <>
                  <DropdownMenuSeparator className="bg-[var(--studio-border)]" />
                  <DropdownMenuLabel className="text-[var(--studio-fg-muted)]">Tamaño</DropdownMenuLabel>
                  {SPAN_OPTIONS.map((opt) => (
                    <DropdownMenuItem
                      key={opt.value}
                      className="rounded-lg text-[var(--studio-fg)] focus:bg-[var(--studio-accent-dim)] focus:text-[var(--studio-accent)]"
                      onClick={(e) => { e.stopPropagation(); onSizeChange({ gridSpan: opt.value }); }}
                    >
                      {opt.label} {gridSpan === opt.value ? "✓" : ""}
                    </DropdownMenuItem>
                  ))}
                  {HEIGHT_OPTIONS.map((opt) => (
                    <DropdownMenuItem
                      key={opt.value}
                      className="rounded-lg text-[var(--studio-fg)] focus:bg-[var(--studio-accent-dim)] focus:text-[var(--studio-accent)]"
                      onClick={(e) => { e.stopPropagation(); onSizeChange({ minHeight: opt.value }); }}
                    >
                      {opt.label} {minHeight === opt.value ? "✓" : ""}
                    </DropdownMenuItem>
                  ))}
                </>
              )}
              {onDelete && (
                <>
                  <DropdownMenuSeparator className="bg-[var(--studio-border)]" />
                  <DropdownMenuItem
                    className="rounded-lg text-[var(--studio-danger)] focus:bg-red-500/10 focus:text-[var(--studio-danger)]"
                    onClick={(e) => { e.stopPropagation(); onDelete(); }}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Eliminar
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
                {chartType === "bar" && <Bar data={chartConfig} options={CHART_OPTIONS} />}
                {chartType === "line" && <Line data={chartConfig} options={CHART_OPTIONS} />}
                {chartType === "pie" && <Pie data={chartConfig} options={CHART_OPTIONS} />}
                {chartType === "doughnut" && <Doughnut data={chartConfig} options={CHART_OPTIONS} />}
              </div>
            )}
          </>
        )}
      </div>
    </article>
  );
}
