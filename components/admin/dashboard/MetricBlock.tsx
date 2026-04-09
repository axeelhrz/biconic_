"use client";

import { useMemo } from "react";
import { ChevronDown, ChevronUp, Loader2, Play, Trash2, MoreHorizontal } from "lucide-react";
import { DashboardWidgetRenderer, type DashboardWidgetRendererWidget } from "@/components/dashboard/DashboardWidgetRenderer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { toChartStyleConfig } from "@/lib/dashboard/chartOptions";
import { DashboardPresetHeaderIcon } from "@/lib/dashboard/headerPresetIcons";

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
  { value: 200, label: "Mínima (200px)" },
  { value: 280, label: "Compacta (280px)" },
  { value: 360, label: "Mediana (360px)" },
  { value: 440, label: "Grande (440px)" },
  { value: 520, label: "Extra grande (520px)" },
  { value: 600, label: "Muy grande (600px)" },
  { value: 720, label: "Alta (720px)" },
  { value: 900, label: "Máxima (900px)" },
] as const;

const SPAN_OPTIONS = [
  { value: 1, label: "1 columna" },
  { value: 2, label: "2 columnas" },
  { value: 3, label: "3 columnas" },
  { value: 4, label: "4 columnas" },
  { value: 5, label: "5 columnas" },
  { value: 6, label: "6 columnas (ancho completo)" },
] as const;

type MetricBlockProps = {
  id: string;
  title: string;
  purpose?: string;
  state?: MetricBlockState;
  insight?: string;
  chartConfig?: ChartConfig | null;
  chartType?: "bar" | "horizontalBar" | "stackedColumn" | "line" | "area" | "pie" | "doughnut" | "kpi" | "table" | "combo" | "scatter" | "map" | "image";
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
  /** Visibilidad de ejes desde aggregationConfig */
  chartAxisXVisible?: boolean;
  chartAxisYVisible?: boolean;
  /** Widget completo para renderizar con el mismo componente que la vista final (editor = vista fiel) */
  widgetForRenderer?: DashboardWidgetRendererWidget;
  showTechnicalPreview?: boolean;
  darkChartTheme?: boolean;
  /** Vista previa admin: sin menú, sin selección, mismo aspecto del lienzo */
  readOnly?: boolean;
  /** Cambiar orden en el lienzo (persiste gridOrder al guardar dashboard). */
  onMoveOrder?: (direction: -1 | 1) => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
};

const STATE_LABELS: Record<MetricBlockState, string> = {
  estable: "Estable",
  alerta: "Alerta",
  cambio: "Cambio",
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
  chartGridXDisplay,
  chartGridYDisplay,
  chartGridColor,
  chartAxisXVisible,
  chartAxisYVisible,
  widgetForRenderer,
  showTechnicalPreview = false,
  darkChartTheme = false,
  readOnly = false,
  onMoveOrder,
  canMoveUp = false,
  canMoveDown = false,
}: MetricBlockProps) {
  const hasViz = useMemo(() => {
    if (chartType === "image") {
      return String(widgetForRenderer?.imageUrl ?? "").trim().length > 0;
    }
    if (chartType === "kpi") {
      return kpiValue != null
        || (Array.isArray(widgetForRenderer?.rows) && widgetForRenderer.rows.length > 0);
    }
    if (chartType === "table") return Array.isArray(tableRows) && tableRows.length > 0;
    return chartConfig?.labels?.length && (chartConfig.datasets?.length ?? 0) > 0;
  }, [chartType, chartConfig, kpiValue, tableRows, widgetForRenderer?.rows, widgetForRenderer?.imageUrl]);

  const fallbackWidget = useMemo<DashboardWidgetRendererWidget>(() => {
    const kpiAsNumber = typeof kpiValue === "number" ? kpiValue : Number(kpiValue);
    const kpiRows =
      chartType === "kpi"
        ? [{ value: Number.isNaN(kpiAsNumber) ? (kpiValue ?? 0) : kpiAsNumber }]
        : undefined;
    return {
      id,
      type: chartType,
      title,
      config: chartConfig ?? undefined,
      rows: chartType === "table" ? tableRows : kpiRows,
      aggregationConfig: {
        chartType,
        chartGridXDisplay,
        chartGridYDisplay,
        chartGridColor,
        chartAxisXVisible,
        chartAxisYVisible,
      },
      chartStyle: toChartStyleConfig({
        valueType: "none",
      }),
      minHeight,
    };
  }, [id, chartType, title, chartConfig, tableRows, kpiValue, chartGridXDisplay, chartGridYDisplay, chartGridColor, chartAxisXVisible, chartAxisYVisible, minHeight]);

  return (
    <article
      role={readOnly ? undefined : "button"}
      tabIndex={readOnly ? undefined : 0}
      data-selected={isSelected ? "true" : undefined}
      className={`metric-block group relative flex flex-col transition-all ${readOnly ? "cursor-default" : "cursor-pointer"}`}
      style={{ minHeight }}
      onClick={readOnly ? undefined : onSelect}
      onKeyDown={
        readOnly
          ? undefined
          : (e) => (e.key === "Enter" || e.key === " ") && onSelect?.()
      }
    >
      <header className="metric-block-header flex flex-shrink-0 items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            {widgetForRenderer?.headerIconKey ? (
              <DashboardPresetHeaderIcon
                iconKey={widgetForRenderer.headerIconKey}
                className="h-5 w-5 shrink-0 text-[var(--studio-accent)]"
              />
            ) : widgetForRenderer?.headerIconUrl ? (
              <img
                src={widgetForRenderer.headerIconUrl}
                alt=""
                className="h-5 w-5 shrink-0 rounded object-contain"
              />
            ) : null}
            <h3 className="metric-block-title min-w-0 truncate">{title}</h3>
          </div>
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
          {!readOnly && (
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
              {onMoveOrder && (
                <>
                  <DropdownMenuItem
                    className="metric-block-dropdown-item flex items-center gap-3 rounded-lg px-3 py-2.5 mx-1.5 my-0.5 text-sm text-[var(--studio-fg)] focus:bg-[var(--studio-accent-dim)] focus:text-[var(--studio-accent)]"
                    disabled={!canMoveUp}
                    onClick={(e) => { e.stopPropagation(); if (canMoveUp) onMoveOrder(-1); }}
                  >
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--studio-bg-elevated)]">
                      <ChevronUp className="h-4 w-4" />
                    </span>
                    <span>Mover arriba</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="metric-block-dropdown-item flex items-center gap-3 rounded-lg px-3 py-2.5 mx-1.5 my-0.5 text-sm text-[var(--studio-fg)] focus:bg-[var(--studio-accent-dim)] focus:text-[var(--studio-accent)]"
                    disabled={!canMoveDown}
                    onClick={(e) => { e.stopPropagation(); if (canMoveDown) onMoveOrder(1); }}
                  >
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--studio-bg-elevated)]">
                      <ChevronDown className="h-4 w-4" />
                    </span>
                    <span>Mover abajo</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="my-1.5 bg-[var(--studio-border)]" />
                </>
              )}
              {chartType !== "image" && (
              <DropdownMenuItem
                className="metric-block-dropdown-item flex items-center gap-3 rounded-lg px-3 py-2.5 mx-1.5 my-0.5 text-sm text-[var(--studio-fg)] focus:bg-[var(--studio-accent-dim)] focus:text-[var(--studio-accent)]"
                onClick={(e) => { e.stopPropagation(); onRun?.(); }}
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--studio-bg-elevated)]">
                  <Play className="h-4 w-4" />
                </span>
                <span>Actualizar datos</span>
              </DropdownMenuItem>
              )}
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
          )}
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
            <p className="text-[13px]">
              {readOnly
                ? "Sin datos"
                : chartType === "image"
                  ? "Indicá la URL de la imagen en el panel"
                  : "Ejecutá para ver datos"}
            </p>
            {!readOnly && chartType !== "image" && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-3 text-[var(--studio-accent)] hover:bg-[var(--studio-accent-dim)]"
              onClick={(e) => { e.stopPropagation(); onRun?.(); }}
            >
              <Play className="mr-1.5 h-4 w-4" />
              Actualizar
            </Button>
            )}
          </div>
        )}
        {hasViz && !isLoading && (
          <div className="flex-1 min-h-0 w-full">
            <DashboardWidgetRenderer
              widget={widgetForRenderer ?? fallbackWidget}
              isLoading={false}
              hideHeader
              showTechnicalPreview={showTechnicalPreview}
              darkChartTheme={darkChartTheme}
              minHeight={minHeight}
              className="!border-0 !p-0 !shadow-none h-full"
            />
          </div>
        )}
      </div>
    </article>
  );
}
