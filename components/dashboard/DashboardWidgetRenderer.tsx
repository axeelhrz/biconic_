"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, TrendingDown, TrendingUp, Minus } from "lucide-react";
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
import {
  buildChartOptions,
  buildPieDoughnutLegendShared,
  createDataLabelDisplay,
  formatChartPointDisplay,
  formatValue,
  getLayoutPadding,
  getPieDoughnutLayoutPadding,
  getValueFormatter,
  normalizeChartPercentBasis,
  normalizeLabelVisibilityMode,
  type ChartLabelDisplayMode,
  type ChartLabelVisibilityMode,
  type ChartPercentBasis,
  type ChartStyleConfig,
  type FormatChartPointContext,
} from "@/lib/dashboard/chartOptions";
import {
  formatAnalysisDateForChart,
  formatDateByGranularity,
  parseDateLike,
  type AnalysisDateDisplayFormat,
  type DateGranularity,
  type ParseDateLikeOptions,
} from "@/lib/dashboard/dateFormatting";
import type { DimensionDefaultFilterEdit } from "@/lib/dashboard/dimensionDefaultFilters";
import { resolveWidgetAxisKeys, resolveChartYAxisEntryToResultKey, type BuildChartConfigWidget } from "@/lib/dashboard/buildChartConfig";
import {
  placementEnabled,
  getCompareColumnKeys,
  legacyCompareInputFromWidgetAgg,
  resolveDashboardKpiMainValue,
  pickDashboardKpiCompareRow,
  readComparePresentation,
  formatDashboardCompareText,
  buildCompareTooltipLineFromAgg,
  compareTrendTone,
  kpiCompareRowsFingerprint,
} from "@/lib/dashboard/compareDisplayKeys";
import {
  getEffectiveDashboardCompareUi,
  effectivePlacementEnabled,
} from "@/lib/dashboard/ensureDashboardCompareUi";
import { normalizeAggregationCompare } from "@/lib/dashboard/compareSpec";
import { createChartPercentDenominatorResolver } from "@/lib/dashboard/chartPercentEngine";
import type { ChartPercentWidgetLike } from "@/lib/dashboard/chartPercentEngine";
import { buildChartTooltipDetailParts, isChartDetailCardActive } from "@/lib/dashboard/chartDetailCard";
import { effectiveWidgetChartType } from "@/lib/dashboard/effectiveWidgetChartType";
import {
  resolveDashboardKpiMainValueForScope,
  type KpiUserTimeScopeOptions,
} from "@/lib/dashboard/kpiFilterScope";
import { DashboardPresetHeaderIcon } from "@/lib/dashboard/headerPresetIcons";
import { mergeChartVisualStyle, type AggregationLike } from "@/lib/dashboard/widgetRenderParity";
import { useDevicePixelRatio } from "@/hooks/useDevicePixelRatio";
import { DashboardTextWidget } from "./DashboardTextWidget";
import {
  contentIconSizeClass,
  resolveImageContainerAlignment,
  resolveImageElementStyle,
} from "@/lib/dashboard/imageLayout";
import type { MapAggregationConfig } from "./DashboardMapWidget";

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
  Filler
);

export type WidgetChartType =
  | "bar"
  | "horizontalBar"
  | "line"
  | "area"
  | "pie"
  | "doughnut"
  | "combo"
  | "stackedColumn"
  | "table"
  | "kpi"
  | "filter"
  | "image"
  | "text"
  | "scatter"
  | "map";

export type ChartConfig = {
  labels: string[];
  xRawCategoryKeys?: string[];
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
  inputType: "text" | "select" | "date" | "number" | "multi";
  /** Si hay IDs, el filtro del lienzo solo aplica a widgets vinculados a esas métricas guardadas. */
  scopeMetricIds?: string[];
};

/** Posición del icono / mini imagen sobre el área de visualización (no en la cabecera de la tarjeta). */
export type ContentIconPosition = "topLeft" | "topRight" | "bottomLeft" | "bottomRight" | "center";

export const CONTENT_ICON_POSITION_OPTIONS: { value: ContentIconPosition; label: string }[] = [
  { value: "topLeft", label: "Arriba izquierda" },
  { value: "topRight", label: "Arriba derecha" },
  { value: "bottomLeft", label: "Abajo izquierda" },
  { value: "bottomRight", label: "Abajo derecha" },
  { value: "center", label: "Centro" },
];

export interface DashboardWidgetRendererWidget {
  id: string;
  type: WidgetChartType;
  title: string;
  config?: ChartConfig;
  rows?: Record<string, unknown>[];
  content?: string;
  filterConfig?: FilterWidgetConfig;
  facetValues?: Record<string, unknown[]>;
  labelDisplayMode?: ChartLabelDisplayMode;
  /** Base del % (total general, por categoría o por serie). */
  chartPercentBasis?: ChartPercentBasis;
  chartPercentGroupField?: string;
  chartPercentDenominatorMetric?: string;
  chartPercentDenominatorScope?: "analysis" | "visible";
  chartPercentDenominatorGrandTotal?: boolean;
  chartStyle?: ChartStyleConfig;
  /** Un estilo por dataset cuando el gráfico tiene varias métricas (formato por métrica). */
  chartMetricStyles?: (ChartStyleConfig | undefined)[];
  gridSpan?: number;
  minHeight?: number;
  kpiSecondaryLabel?: string;
  kpiSecondaryValue?: string;
  /** Texto bajo el valor del KPI (si no hay línea secundaria manual). */
  kpiCaption?: string;
  imageConfig?: import("@/lib/dashboard/imageLayout").DashboardImageConfig;
  contentIconSize?: import("@/lib/dashboard/imageLayout").ContentIconSize;
  imageUrl?: string;
  /** Mini imagen decorativa en el área del gráfico (ver `contentIconPosition`). */
  headerIconUrl?: string;
  /** Icono Lucide predefinido (ver `HEADER_PRESET_ICONS`); tiene prioridad sobre `headerIconUrl`. */
  headerIconKey?: string;
  /** Dónde dibujar el icono / mini imagen sobre el área del gráfico, KPI, tabla, etc. */
  contentIconPosition?: ContentIconPosition;
  /** Oculta el encabezado con título (útil en widgets solo visuales) */
  hideWidgetHeader?: boolean;
  aggregationConfig?: { chartType?: string; [key: string]: unknown };
  diagnosticPreview?: {
    endpoint: string;
    payload: Record<string, unknown>;
    source: "aggregate" | "raw";
    capturedAt?: string;
  };
  /** Alcance temporal del usuario para el total del KPI (pre-expansión de comparación). */
  kpiUserTimeScope?: KpiUserTimeScopeOptions | null;
  [key: string]: unknown;
}

function contentIconPositionClass(pos: ContentIconPosition | undefined): string {
  switch (pos ?? "topLeft") {
    case "topRight":
      return "right-3 top-3";
    case "bottomLeft":
      return "left-3 bottom-3";
    case "bottomRight":
      return "right-3 bottom-3";
    case "center":
      return "left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2";
    default:
      return "left-3 top-3";
  }
}

function ContentAreaIconOverlay({ widget }: { widget: DashboardWidgetRendererWidget }) {
  const preset = widget.headerIconKey;
  const url = widget.headerIconUrl?.trim();
  if (!preset && !url) return null;
  const pos = (widget.contentIconPosition as ContentIconPosition | undefined) ?? "topLeft";
  const sizeClass = contentIconSizeClass(widget.contentIconSize);
  return (
    <div
      className={`pointer-events-none absolute z-[4] ${contentIconPositionClass(pos)}`}
      aria-hidden
    >
      <div
        className="rounded-lg border p-1 shadow-sm"
        style={{
          borderColor: "var(--platform-border, #e2e8f0)",
          background: "var(--platform-surface, #fff)",
        }}
      >
        {preset ? (
          <DashboardPresetHeaderIcon
            iconKey={preset}
            className={`${sizeClass} text-[var(--platform-accent,#0ea5e9)]`}
          />
        ) : (
          <img src={url!} alt="" className={`${sizeClass} rounded object-contain`} />
        )}
      </div>
    </div>
  );
}

const AXIS_COLOR = "var(--platform-fg-muted, #64748b)";
const GRID_COLOR = "var(--platform-border, #e2e8f0)";
const AXIS_COLOR_DARK = "rgba(255, 255, 255, 0.85)";
const GRID_COLOR_DARK = "rgba(255, 255, 255, 0.12)";
const DATALABEL_COLOR_DARK = "rgba(255, 255, 255, 0.95)";

function getChartOptionsBase(darkTheme: boolean, devicePixelRatio: number) {
  const axisColor = darkTheme ? AXIS_COLOR_DARK : AXIS_COLOR;
  const gridColor = darkTheme ? GRID_COLOR_DARK : GRID_COLOR;
  const baseTickFont = { size: 11 };
  return {
    responsive: true,
    maintainAspectRatio: false,
    devicePixelRatio,
    layout: { padding: getLayoutPadding(undefined) },
    plugins: {
      legend: {
        display: true,
        position: "top" as const,
        fullSize: false,
        align: "start" as const,
        labels: { color: axisColor, font: { size: 12 }, padding: 16 },
      },
      tooltip: { enabled: true },
    },
    scales: {
      x: {
        display: true,
        grid: { color: gridColor },
        ticks: { color: axisColor, maxTicksLimit: 8, font: baseTickFont, clip: false },
      },
      y: {
        display: true,
        grid: { color: gridColor },
        ticks: { color: axisColor, font: baseTickFont, maxTicksLimit: 8, clip: false },
      },
    },
  };
}

const HORIZONTAL_BAR_ROW_PX = 28;
const HORIZONTAL_BAR_LAYOUT_PADDING = 72;
const HORIZONTAL_BAR_MIN_CHART_HEIGHT = 220;
const HORIZONTAL_BAR_MAX_CHART_HEIGHT = 900;

function resolveHorizontalBarChartLayout(categoryCount: number, effectiveMinHeight: number): {
  chartHeight: number;
  containerHeight: number;
  scrollable: boolean;
} {
  const containerHeight = Math.max(
    HORIZONTAL_BAR_MIN_CHART_HEIGHT,
    effectiveMinHeight - HORIZONTAL_BAR_LAYOUT_PADDING
  );
  const idealHeight = Math.min(
    HORIZONTAL_BAR_MAX_CHART_HEIGHT,
    Math.max(HORIZONTAL_BAR_MIN_CHART_HEIGHT, categoryCount * HORIZONTAL_BAR_ROW_PX + HORIZONTAL_BAR_LAYOUT_PADDING)
  );
  const chartHeight =
    idealHeight <= containerHeight
      ? idealHeight
      : Math.min(HORIZONTAL_BAR_MAX_CHART_HEIGHT, idealHeight);
  return {
    chartHeight,
    containerHeight,
    scrollable: chartHeight > containerHeight,
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

function fallbackCompareColumnLabel(key: string): string {
  if (/_delta_pct|_var_pct_fijo|_delta_pct_col|_delta_pct_prom|delta_pct_ytd/.test(key)) return "Var. %";
  if (/_delta$|_vs_col$|_vs_prom$|_vs_fijo$|_vs_ytd_ly$/.test(key)) return "Δ";
  if (/_prev$/.test(key)) return "Referencia";
  if (/_pct_mes_en_ytd$/.test(key)) return "% mes / YTD";
  if (/_pct_total$/.test(key)) return "% del total";
  if (/_total_ref$/.test(key)) return "Total ref.";
  if (/_ytd_run$|_ytd$/.test(key)) return "YTD";
  return key;
}

interface DashboardWidgetRendererProps {
  widget: DashboardWidgetRendererWidget;
  isLoading?: boolean;
  /** Solo para tipo filter: valor actual del filtro */
  filterValue?: unknown;
  /** Solo para tipo filter: callback al cambiar (viewer) */
  onFilterChange?: (widgetId: string, value: unknown) => void;
  /** Valores actuales de `dimensionDefaultFilters` (clave = id de la fila). */
  dimensionDefaultValuesByDdfId?: Record<string, unknown>;
  /** Opciones distinct por id de fila (solo select/multi). */
  dimensionDefaultDistinctByDdfId?: Record<string, unknown[]>;
  onDimensionDefaultFilterChange?: (ddfId: string, value: unknown) => void;
  /** Altura mínima del bloque (px) */
  minHeight?: number;
  /** Clases CSS adicionales para el contenedor */
  className?: string;
  /** Tema oscuro: leyendas, ejes y etiquetas en color claro para fondo oscuro */
  darkChartTheme?: boolean;
  /** Ocultar cabecera del card (p. ej. cuando se usa dentro del editor) */
  hideHeader?: boolean;
  /** Muestra vista técnica del payload efectivo (editor/admin). */
  showTechnicalPreview?: boolean;
}

export function DashboardWidgetRenderer({
  widget,
  isLoading = false,
  filterValue,
  onFilterChange,
  dimensionDefaultValuesByDdfId,
  dimensionDefaultDistinctByDdfId,
  onDimensionDefaultFilterChange,
  minHeight = 240,
  className = "",
  darkChartTheme = false,
  hideHeader = false,
  showTechnicalPreview = false,
}: DashboardWidgetRendererProps) {
  const chartDevicePixelRatio = useDevicePixelRatio();
  const chartPlugins = useMemo(() => [ChartDataLabels], []);
  const effectiveMinHeight = widget.minHeight ?? minHeight;
  const chartType = useMemo(
    () => effectiveWidgetChartType(widget) as WidgetChartType,
    [widget.type, widget.aggregationConfig]
  );
  const isTableWidget = chartType === "table";
  const chartConfig = widget.config;
  const tableRows = widget.rows;
  const horizontalBarLayout = useMemo(() => {
    if (chartType !== "horizontalBar") return null;
    const categoryCount = chartConfig?.labels?.length ?? 0;
    if (categoryCount === 0) return null;
    return resolveHorizontalBarChartLayout(categoryCount, effectiveMinHeight);
  }, [chartType, chartConfig?.labels?.length, effectiveMinHeight]);
  const defaultCartesianChartHeight = Math.max(220, effectiveMinHeight - 72);
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
    const style = widget.chartStyle as ChartStyleConfig | undefined;
    const rows = widget.rows as Record<string, unknown>[];
    const aggCfg = widget.aggregationConfig as BuildChartConfigWidget["aggregationConfig"];

    const fromConfig = chartConfig?.datasets?.[0]?.data?.[0];
    if (fromConfig != null && Number.isFinite(Number(fromConfig))) {
      return formatKpiValue(Number(fromConfig), style);
    }

    const firstRow = rows[0] ?? {};
    const resultKeys = Object.keys(firstRow);
    const metricAliases =
      aggCfg?.enabled && aggCfg.metrics?.length
        ? aggCfg.metrics.map((m) => m.alias || `${m.func}(${m.field})`).filter(Boolean)
        : [];
    const metricsKpi = (aggCfg?.metrics ?? []) as { alias?: string; func?: string; field?: string }[];
    const rawKpiY =
      Array.isArray(aggCfg?.chartYAxes) && aggCfg.chartYAxes[0] != null ? String(aggCfg.chartYAxes[0]).trim() : "";
    const resolvedKpiY = rawKpiY ? resolveChartYAxisEntryToResultKey(rawKpiY, metricsKpi, resultKeys) : null;
    const yKey =
      resolvedKpiY ??
      metricAliases.find((k) => resultKeys.includes(k)) ??
      resultKeys.find((k) => typeof firstRow[k] === "number") ??
      resultKeys[0];

    if (yKey) {
      const scope = (widget as DashboardWidgetRendererWidget).kpiUserTimeScope ?? null;
      const total = resolveDashboardKpiMainValueForScope(rows, yKey, scope);
      if (Number.isFinite(total)) {
        return formatKpiValue(total, style);
      }
    }

    const explicitY = (widget.aggregationConfig as { chartYAxes?: string[] } | undefined)?.chartYAxes?.[0];
    if (explicitY) {
      const total = resolveDashboardKpiMainValue(rows, String(explicitY));
      if (Number.isFinite(total)) {
        return formatKpiValue(total, style);
      }
    }

    const metrics = (widget.aggregationConfig as { metrics?: { alias?: string; field?: string }[] } | undefined)?.metrics;
    const metricAlias = metrics?.[metrics.length - 1]?.alias;
    if (metricAlias) {
      const total = resolveDashboardKpiMainValue(rows, String(metricAlias));
      if (Number.isFinite(total)) {
        return formatKpiValue(total, style);
      }
    }

    for (const key of ["value", "metric_0"]) {
      const scope = (widget as DashboardWidgetRendererWidget).kpiUserTimeScope ?? null;
      const total = resolveDashboardKpiMainValueForScope(rows, key, scope);
      if (Number.isFinite(total) && total !== 0) {
        return formatKpiValue(total, style);
      }
    }
    return null;
  }, [chartType, chartConfig, widget.rows, widget.chartStyle, widget.aggregationConfig, widget.kpiUserTimeScope]);

  const kpiCompareFingerprint = useMemo(
    () => kpiCompareRowsFingerprint(widget.rows, widget.aggregationConfig as never),
    [widget.rows, widget.aggregationConfig]
  );

  const kpiCompareDisplay = useMemo(() => {
    if (chartType !== "kpi" || !Array.isArray(widget.rows) || widget.rows.length === 0) return null;
    const agg = widget.aggregationConfig as Record<string, unknown> | undefined;
    const compareUiOpts = { widgetType: widget.type, chartType: effectiveWidgetChartType(widget) };
    const ui = getEffectiveDashboardCompareUi(agg ?? {}, compareUiOpts);
    if (!ui?.enabled || !placementEnabled(ui, "kpi_below")) return null;
    const spec = normalizeAggregationCompare(legacyCompareInputFromWidgetAgg(agg as never));
    if (spec.kind === "none") return null;
    const rows = widget.rows as Record<string, unknown>[];
    const parseOpts =
      (agg as { dateSlashOrder?: string } | undefined)?.dateSlashOrder === "MDY"
        ? ({ slashDateOrder: "MDY" } as const)
        : ({ slashDateOrder: "DMY" } as const);
    const dataRow = pickDashboardKpiCompareRow(rows, spec, parseOpts) ?? rows[0]!;
    const resultKeys = Object.keys(dataRow);
    const metricsKpi =
      (widget.aggregationConfig as { metrics?: { alias?: string; func?: string; field?: string }[] } | undefined)
        ?.metrics ?? [];
    const rawKpiY =
      Array.isArray((widget.aggregationConfig as { chartYAxes?: string[] } | undefined)?.chartYAxes) &&
      (widget.aggregationConfig as { chartYAxes?: string[] }).chartYAxes![0] != null
        ? String((widget.aggregationConfig as { chartYAxes: string[] }).chartYAxes[0]).trim()
        : "";
    const resolvedY = rawKpiY ? resolveChartYAxisEntryToResultKey(rawKpiY, metricsKpi, resultKeys) : null;
    let metricKey: string | null = resolvedY;
    if (!metricKey) {
      const metricAliases =
        (widget.aggregationConfig as { enabled?: boolean; metrics?: { alias?: string; func?: string; field?: string }[] } | undefined)?.enabled &&
        metricsKpi.length
          ? metricsKpi.map((m) => m.alias || `${m.func}(${m.field})`).filter(Boolean)
          : [];
      metricKey = metricAliases.find((k) => resultKeys.includes(k) && dataRow[k] != null) ?? null;
    }
    if (!metricKey) {
      const metricAlias = metricsKpi[Math.max(0, metricsKpi.length - 1)]?.alias;
      if (metricAlias && dataRow[metricAlias] != null) metricKey = String(metricAlias);
    }
    if (!metricKey) {
      for (const key of ["value", "metric_0"]) {
        if (dataRow[key] != null) {
          metricKey = key;
          break;
        }
      }
    }
    if (!metricKey) return null;
    const vals = readComparePresentation(spec, metricKey, dataRow);
    const text = formatDashboardCompareText(ui, vals, widget.chartStyle as ChartStyleConfig | undefined);
    if (!text.trim()) return null;
    const tone = compareTrendTone(vals);
    const ind = ui.indicator ?? "both";
    return {
      text,
      tone,
      showIcon: ind === "icon" || ind === "both",
      showColor: ind === "color" || ind === "both",
    };
  }, [
    chartType,
    widget.rows,
    widget.aggregationConfig,
    widget.chartStyle,
    widget.kpiUserTimeScope,
    kpiCompareFingerprint,
  ]);

  const aggConfig = widget.aggregationConfig as {
    chartComboSyncAxes?: boolean;
    chartYAxes?: string[];
    chartSeriesField?: string;
    dimension2?: string;
    chartStackBySeries?: boolean;
    chartScaleMode?: "auto" | "dataset" | "custom";
    chartScaleMin?: string | number;
    chartScaleMax?: string | number;
    chartAxisStep?: string | number;
    chartScalePerMetric?: Record<string, { min?: number; max?: number; step?: number }>;
    showDataLabels?: boolean;
    labelVisibilityMode?: ChartLabelVisibilityMode;
  } | undefined;
  const tableColumnOrder = useMemo(() => {
    if (!Array.isArray(tableRows) || tableRows.length === 0) return [];
    const firstRowKeys = Object.keys(tableRows[0] ?? {});
    if (chartType !== "table") return firstRowKeys;
    const axis = resolveWidgetAxisKeys(tableRows as Record<string, unknown>[], {
      type: widget.type,
      aggregationConfig: widget.aggregationConfig as BuildChartConfigWidget["aggregationConfig"],
      source: widget.source as BuildChartConfigWidget["source"],
    });
    if (!axis) return firstRowKeys;
    const aggRaw = (widget.aggregationConfig ?? {}) as {
      dimension?: string;
      dimensions?: string[];
      dimension2?: string;
    };
    const dimensionCandidates = [
      axis.xKey,
      aggRaw.dimension,
      ...(Array.isArray(aggRaw.dimensions) ? aggRaw.dimensions : []),
      aggRaw.dimension2,
      (widget.source as { labelField?: string } | undefined)?.labelField,
    ]
      .map((k) => String(k ?? "").trim())
      .filter(Boolean);
    const dimensionsOrdered = Array.from(new Set(dimensionCandidates))
      .filter((k) => !axis.yKeys.includes(k) && firstRowKeys.includes(k));
    const metricsOrdered = axis.yKeys.filter((k) => firstRowKeys.includes(k));
    const selected = [...dimensionsOrdered, ...metricsOrdered];
    return selected.length > 0 ? selected : firstRowKeys;
  }, [tableRows, chartType, widget.type, widget.aggregationConfig, widget.source]);
  const compareTableExtraKeys = useMemo(() => {
    if (chartType !== "table" || !Array.isArray(tableRows) || tableRows.length === 0) return [] as string[];
    const agg = widget.aggregationConfig as Record<string, unknown> | undefined;
    const compareUiOpts = { widgetType: widget.type, chartType: effectiveWidgetChartType(widget) };
    if (!effectivePlacementEnabled(agg ?? {}, "table_extra_columns", compareUiOpts)) return [];
    const spec = normalizeAggregationCompare(legacyCompareInputFromWidgetAgg(agg as never));
    if (spec.kind === "none") return [];
    const axis = resolveWidgetAxisKeys(tableRows as Record<string, unknown>[], {
      type: widget.type,
      aggregationConfig: widget.aggregationConfig as BuildChartConfigWidget["aggregationConfig"],
      source: widget.source as BuildChartConfigWidget["source"],
    });
    const y0 = axis?.yKeys[0];
    if (!y0) return [];
    const keys = getCompareColumnKeys(spec, y0, tableRows[0] as Record<string, unknown>);
    return keys.tableExtraKeys;
  }, [chartType, tableRows, widget.type, widget.aggregationConfig, widget.source]);
  const effectiveTableColumnOrder = useMemo(() => {
    const extra = compareTableExtraKeys.filter((k) => !tableColumnOrder.includes(k));
    return [...tableColumnOrder, ...extra];
  }, [tableColumnOrder, compareTableExtraKeys]);
  const tableHeaderLabels = (widget.aggregationConfig as { tableColumnLabelOverrides?: Record<string, string> } | undefined)
    ?.tableColumnLabelOverrides;
  const effectiveTableHeaderLabels = useMemo(() => {
    const base = tableHeaderLabels ?? {};
    const ui = getEffectiveDashboardCompareUi(
      (widget.aggregationConfig ?? {}) as Record<string, unknown>,
      { widgetType: widget.type, chartType: effectiveWidgetChartType(widget) }
    );
    const suffix = ui?.label?.trim() ? ` (${ui.label.trim()})` : "";
    const next: Record<string, string> = { ...base };
    for (const k of compareTableExtraKeys) {
      if (next[k]) continue;
      next[k] = `${fallbackCompareColumnLabel(k)}${suffix}`;
    }
    return next;
  }, [tableHeaderLabels, compareTableExtraKeys, widget.aggregationConfig]);
  const tableMetricFormatters = useMemo(() => {
    const map = new Map<string, (value: number) => string>();
    const yKeys = Array.isArray(aggConfig?.chartYAxes) ? aggConfig.chartYAxes : [];
    const metricStyles = Array.isArray(widget.chartMetricStyles) ? widget.chartMetricStyles : [];
    const fallbackStyle = widget.chartStyle as ChartStyleConfig | undefined;
    const aggMetrics = (widget.aggregationConfig as { metrics?: { alias?: string }[] } | undefined)?.metrics;
    yKeys.forEach((rawKey, index) => {
      const key = String(rawKey ?? "").trim();
      if (!key) return;
      const style = metricStyles[index] ?? fallbackStyle;
      const formatter = getValueFormatter(style, "value");
      const fn = (value: number) => formatter(value);
      map.set(key, fn);
      const m = key.match(/^metric_(\d+)$/);
      if (m && aggMetrics?.[Number(m[1])]?.alias) {
        const al = String(aggMetrics[Number(m[1])]!.alias).trim();
        if (al) map.set(al, fn);
      }
    });
    return map;
  }, [aggConfig?.chartYAxes, widget.chartMetricStyles, widget.chartStyle, widget.aggregationConfig]);
  const formatTableCellValue = (columnKey: string, rawValue: unknown): string => {
    if (rawValue == null || rawValue === "") return "";
    const formatter = tableMetricFormatters.get(columnKey);
    if (!formatter) return String(rawValue);
    const numericValue =
      typeof rawValue === "number"
        ? rawValue
        : typeof rawValue === "string"
          ? Number(rawValue.replace(/\s+/g, ""))
          : Number(rawValue);
    if (!Number.isFinite(numericValue)) return String(rawValue);
    return formatter(numericValue);
  };
  const hasSeriesDimension =
    String(aggConfig?.chartSeriesField ?? "").trim() !== "" ||
    String(aggConfig?.dimension2 ?? "").trim() !== "";
  const stackBySeriesEnabled =
    chartType === "stackedColumn"
      ? (typeof aggConfig?.chartStackBySeries === "boolean" ? aggConfig.chartStackBySeries : true)
      : hasSeriesDimension &&
        (chartType === "bar" || chartType === "horizontalBar" || chartType === "combo") &&
        (typeof aggConfig?.chartStackBySeries === "boolean" ? aggConfig.chartStackBySeries : true);
  const isCombo = chartType === "combo" && (chartConfig?.datasets?.length ?? 0) >= 2 && !stackBySeriesEnabled;
  const comboSyncAxes = isCombo && aggConfig?.chartComboSyncAxes === true;

  const pieChartWrapRef = useRef<HTMLDivElement>(null);
  const [pieContainerWidth, setPieContainerWidth] = useState(0);
  useEffect(() => {
    if (chartType !== "pie" && chartType !== "doughnut") {
      setPieContainerWidth(0);
      return;
    }
    const el = pieChartWrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      setPieContainerWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [chartType]);

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

  const chartAccentForPercent = useMemo(
    () =>
      String(
        (widget as { color?: string }).color ??
          (widget.aggregationConfig as { chartPrimaryColor?: string } | undefined)?.chartPrimaryColor ??
          ""
      ).trim(),
    [widget.color, (widget.aggregationConfig as { chartPrimaryColor?: string } | undefined)?.chartPrimaryColor]
  );

  const percentDenomResolver = useMemo(
    () =>
      createChartPercentDenominatorResolver({
        basisRaw: widget.chartPercentBasis,
        fullRows: widget.rows as Record<string, unknown>[] | undefined,
        widget: widget as unknown as ChartPercentWidgetLike,
        chartConfig: chartConfig ?? null,
        accentColor: chartAccentForPercent,
      }),
    [
      widget.chartPercentBasis,
      widget.rows,
      widget.chartPercentGroupField,
      widget.chartPercentDenominatorMetric,
      widget.chartPercentDenominatorScope,
      widget.chartPercentDenominatorGrandTotal,
      widget.aggregationConfig,
      widget.type,
      widget.source,
      chartConfig,
      chartAccentForPercent,
    ]
  );

  const chartOptions = useMemo(() => {
    const agg = widget.aggregationConfig as {
      chartGridXDisplay?: boolean;
      chartGridYDisplay?: boolean;
      chartGridColor?: string;
      chartAxisXVisible?: boolean;
      chartAxisYVisible?: boolean;
      chartXAxis?: string;
      chartYAxes?: string[];
      chartSeriesField?: string;
      dimension2?: string;
      chartStackBySeries?: boolean;
      dateDimension?: string;
      dateGroupByGranularity?: DateGranularity;
      showDataLabels?: boolean;
      chartScaleMode?: "auto" | "dataset" | "custom";
      chartScaleMin?: string | number;
      chartScaleMax?: string | number;
      chartAxisStep?: string | number;
      chartScalePerMetric?: Record<string, { min?: number; max?: number; step?: number }>;
      labelVisibilityMode?: ChartLabelVisibilityMode;
      analysisDateDisplayFormat?: AnalysisDateDisplayFormat;
      chartDoughnutCutout?: string | number;
      chartLegendPosition?: "top" | "bottom" | "left" | "right" | "chartArea";
      /** Barras/líneas/combo: ocultar leyenda si false. */
      chartLegendVisible?: boolean;
      labelVisibilityMaxCount?: number;
      pieLegendVisible?: boolean;
      pieLegendResponsive?: boolean;
      pieLegendMode?: "side" | "integrated";
      pieIntegratedNameOrder?: "above" | "below";
    } | undefined;
    const style: ChartStyleConfig | undefined = {
      ...mergeChartVisualStyle(widget.aggregationConfig as AggregationLike),
      ...(widget.chartStyle as ChartStyleConfig | undefined),
      ...(agg && {
        gridXDisplay: agg.chartGridXDisplay,
        gridYDisplay: agg.chartGridYDisplay,
        gridColor: agg.chartGridColor,
        axisXVisible: agg.chartAxisXVisible,
        axisYVisible: agg.chartAxisYVisible,
      }),
    };
    const labelMaxVisible =
      typeof agg?.labelVisibilityMaxCount === "number" && Number.isFinite(agg.labelVisibilityMaxCount) && agg.labelVisibilityMaxCount >= 2
        ? Math.floor(agg.labelVisibilityMaxCount)
        : undefined;
    const type = chartType === "horizontalBar"
      ? "horizontalBar"
      : chartType === "area"
        ? "line"
        : chartType === "combo" || chartType === "stackedColumn"
          ? "bar"
          : chartType === "scatter"
            ? "line"
            : (chartType as "bar" | "line" | "pie" | "doughnut");
    const percentBasis = normalizeChartPercentBasis(widget.chartPercentBasis);
    const pieLabelMode: ChartLabelDisplayMode = widget.labelDisplayMode ?? "percent";
    const cartesianLabelMode: ChartLabelDisplayMode = widget.labelDisplayMode ?? "value";
    const metricStyles = widget.chartMetricStyles as (ChartStyleConfig | undefined)[] | undefined;
    const usePerMetricFormat = Array.isArray(metricStyles) && metricStyles.length > 0;
    const optionsBase = getChartOptionsBase(darkChartTheme, chartDevicePixelRatio);
    const labelVisibilityMode = normalizeLabelVisibilityMode(agg?.labelVisibilityMode);
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
    const tooltipCompareAxis =
      Array.isArray(widget.rows) && widget.rows.length > 0
        ? resolveWidgetAxisKeys(widget.rows as Record<string, unknown>[], {
            type: widget.type,
            aggregationConfig: widget.aggregationConfig as BuildChartConfigWidget["aggregationConfig"],
            source: widget.source as BuildChartConfigWidget["source"],
          })
        : null;
    const compareTooltipExtraActive =
      Array.isArray(widget.rows) &&
      widget.rows.length > 0 &&
      (() => {
        const a = widget.aggregationConfig as Record<string, unknown> | undefined;
        const compareUiOpts = { widgetType: widget.type, chartType: effectiveWidgetChartType(widget) };
        return (
          effectivePlacementEnabled(a ?? {}, "tooltip", compareUiOpts) ||
          effectivePlacementEnabled(a ?? {}, "detail_card", compareUiOpts)
        );
      })();
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
    const dateParseOpts: ParseDateLikeOptions = {
      slashDateOrder: (agg as { dateSlashOrder?: string }).dateSlashOrder === "MDY" ? "MDY" : "DMY",
    };
    const hasTemporalLabels = (chartConfig?.labels ?? []).some((label) => parseDateLike(label, dateParseOpts) != null);
    const shouldFormatDateAxis =
      !!dateGranularity ||
      (xAxisKey !== "" && dateDimensionKey !== "" && xAxisKey === dateDimensionKey) ||
      hasTemporalLabels;
    const dateDisplayFmt = agg?.analysisDateDisplayFormat as AnalysisDateDisplayFormat | undefined;
    const formatTemporalLabel = (raw: unknown): string => {
      const base = String(raw ?? "");
      if (!shouldFormatDateAxis) return base;
      const formatted = formatAnalysisDateForChart(raw, dateGranularity ?? "day", dateDisplayFmt, base, dateParseOpts);
      return formatted ?? base;
    };
    if (type === "pie" || type === "doughnut") {
      const base = buildChartOptions(type, style, pieLabelMode, percentBasis) as Record<string, unknown>;
      const baseDatalabels = (base.plugins as { datalabels?: Record<string, unknown> })?.datalabels ?? {};
      const legendColor = darkChartTheme ? AXIS_COLOR_DARK : AXIS_COLOR;
      const optionsBaseNoScales = { ...optionsBase } as Record<string, unknown>;
      delete optionsBaseNoScales.scales;
      const optionsBasePlugins = (optionsBaseNoScales.plugins as Record<string, unknown> | undefined) ?? {};
      const legPos = agg?.chartLegendPosition;
      const savedLegendPosition =
        legPos === "top" || legPos === "bottom" || legPos === "left" || legPos === "right" || legPos === "chartArea"
          ? legPos
          : undefined;
      const baseLegendPosition = savedLegendPosition ?? "right";
      const pieLegendResponsive = agg?.pieLegendResponsive === true;
      const effectiveLegendPosition =
        pieLegendResponsive && pieContainerWidth > 0 && pieContainerWidth < 480 ? "bottom" : baseLegendPosition;
      const pieIntegrated = agg?.pieLegendMode === "integrated";
      const pieLegendVisible = agg?.pieLegendVisible !== false;
      const useChartLegend = !pieIntegrated && pieLegendVisible;
      const labelCount = chartConfig?.labels?.length ?? 0;
      const pieLegend = useChartLegend
        ? (buildPieDoughnutLegendShared(chartConfig ?? undefined, legendColor, {
            legendPosition: effectiveLegendPosition,
            labelCount,
          }) as Record<string, unknown>)
        : { display: false };
      const basePadding = getLayoutPadding(style);
      const layoutLegendPosition = useChartLegend ? effectiveLegendPosition : "chartArea";
      const pieLayoutPadding = getPieDoughnutLayoutPadding(layoutLegendPosition, basePadding);
      const cutout =
        type === "doughnut"
          ? agg?.chartDoughnutCutout != null && agg.chartDoughnutCutout !== ""
            ? agg.chartDoughnutCutout
            : "58%"
          : undefined;
      const forceExteriorLabels = !pieIntegrated && !pieLegendVisible;
      const pieBaseFormatter = getValueFormatter(style, pieLabelMode, percentBasis);
      const pieTooltipFormatter = (parsed: number, ctx: FormatChartPointContext) => {
        const di = typeof ctx.dataIndex === "number" ? ctx.dataIndex : -1;
        const dsi = typeof ctx.datasetIndex === "number" && ctx.datasetIndex >= 0 ? ctx.datasetIndex : 0;
        const denom = percentDenomResolver(di, dsi);
        return pieBaseFormatter(parsed, {
          ...ctx,
          ...(typeof denom === "number" && Number.isFinite(denom) ? { percentDenominator: denom } : {}),
        });
      };
      const pieDetailRaw = (agg as { chartDetailCard?: unknown } | undefined)?.chartDetailCard;
      const pieDetailActive =
        isChartDetailCardActive(pieDetailRaw) &&
        chartConfig &&
        Array.isArray(widget.rows) &&
        widget.rows.length > 0;
      const pieBaseTooltipCb =
        ((optionsBasePlugins.tooltip as { callbacks?: Record<string, unknown> } | undefined)?.callbacks ??
          {}) as Record<string, unknown>;
      const pieCallbacks: Record<string, unknown> = {
        ...pieBaseTooltipCb,
        label: (ctx: {
          label?: string;
          parsed: number;
          chart?: unknown;
          dataIndex?: number;
          datasetIndex?: number;
        }) => {
          const fullLabel = String(ctx.label ?? "");
          const valueStr = pieTooltipFormatter(ctx.parsed, {
            chart: ctx.chart as { data?: { datasets?: Array<{ data?: unknown[] }> } },
            dataIndex: ctx.dataIndex,
            datasetIndex: ctx.datasetIndex,
          });
          return fullLabel ? `${fullLabel}: ${valueStr}` : valueStr;
        },
      };
      if (pieDetailActive) {
        const prevPieAfterBody = pieCallbacks.afterBody as ((items: unknown[]) => string | string[] | void) | undefined;
        const prevPieTitle = pieCallbacks.title as ((items: unknown[]) => string | void) | undefined;
        pieCallbacks.afterBody = (items: unknown[]) => {
          const arr = Array.isArray(items) ? items : [];
          const first = arr[0] as { dataIndex?: number; datasetIndex?: number; label?: unknown } | undefined;
          const di = typeof first?.dataIndex === "number" ? first.dataIndex : 0;
          const dsi = typeof first?.datasetIndex === "number" ? first.datasetIndex : 0;
          const categoryLabel = formatTemporalLabel(first?.label ?? chartConfig?.labels?.[di] ?? "");
          const seriesLabel = String(chartConfig?.datasets?.[dsi]?.label ?? "");
          const parts = buildChartTooltipDetailParts({
            detailRaw: pieDetailRaw,
            rows: widget.rows as Record<string, unknown>[],
            widget: widget as unknown as BuildChartConfigWidget,
            chartConfig,
            dataIndex: di,
            datasetIndex: dsi,
            chartType,
            categoryLabel,
            seriesLabel,
          });
          const extra = parts?.afterBody?.length ? parts.afterBody : [];
          const prev = prevPieAfterBody ? prevPieAfterBody(items) : undefined;
          const prevArr = Array.isArray(prev) ? prev : prev != null && prev !== "" ? [String(prev)] : [];
          return [...prevArr, ...extra];
        };
        pieCallbacks.title = (items: unknown[]) => {
          const arr = Array.isArray(items) ? items : [];
          const first = arr[0] as { dataIndex?: number; datasetIndex?: number; label?: unknown } | undefined;
          const di = typeof first?.dataIndex === "number" ? first.dataIndex : 0;
          const dsi = typeof first?.datasetIndex === "number" ? first.datasetIndex : 0;
          const categoryLabel = formatTemporalLabel(first?.label ?? chartConfig?.labels?.[di] ?? "");
          const seriesLabel = String(chartConfig?.datasets?.[dsi]?.label ?? "");
          const parts = buildChartTooltipDetailParts({
            detailRaw: pieDetailRaw,
            rows: widget.rows as Record<string, unknown>[],
            widget: widget as unknown as BuildChartConfigWidget,
            chartConfig,
            dataIndex: di,
            datasetIndex: dsi,
            chartType,
            categoryLabel,
            seriesLabel,
          });
          if (parts?.title) return parts.title;
          if (prevPieTitle) return String(prevPieTitle(items) ?? "");
          return categoryLabel;
        };
      }
      const tooltipPlugin = {
        ...(optionsBasePlugins.tooltip as Record<string, unknown> | undefined),
        callbacks: pieCallbacks,
      };
      const nameOrder = agg?.pieIntegratedNameOrder === "below" ? "below" : "above";
      const pieIntegratedFormatter =
        pieIntegrated
          ? (value: unknown, ctx: { chart?: { data?: { labels?: unknown[]; datasets?: Array<{ data?: unknown[] }> } }; dataIndex?: number }) => {
              const chart = ctx.chart;
              const idx = typeof ctx.dataIndex === "number" ? ctx.dataIndex : -1;
              const labelsArr = chart?.data?.labels ?? [];
              const name = idx >= 0 && idx < labelsArr.length ? String(labelsArr[idx] ?? "") : "";
              const num = Number(value);
              const valueStr = pieTooltipFormatter(num, {
                chart: ctx.chart as never,
                dataIndex: idx >= 0 ? idx : undefined,
                datasetIndex: 0,
              });
              if (!name) return valueStr;
              return nameOrder === "above" ? `${name}\n${valueStr}` : `${valueStr}\n${name}`;
            }
          : undefined;
      const datalabelDisplayResolved = pieIntegrated
        ? true
        : forceExteriorLabels
          ? true
          : showDataLabels === false
            ? false
            : createDataLabelDisplay({
                mode: labelVisibilityMode,
                labels: chartConfig?.labels,
                datasets: chartConfig?.datasets,
                maxVisible: labelMaxVisible,
              });
      const interiorLabelColor =
        style?.dataLabelColor != null && String(style.dataLabelColor).trim() !== ""
          ? style.dataLabelColor
          : darkChartTheme
            ? DATALABEL_COLOR_DARK
            : undefined;
      const plugins = {
        ...optionsBasePlugins,
        ...(base.plugins as object),
        legend: pieLegend,
        tooltip: tooltipPlugin,
        datalabels: {
          ...baseDatalabels,
          display: datalabelDisplayResolved,
          ...(pieIntegrated
            ? {
                anchor: "center",
                align: "center",
                offset: 0,
                clamp: true,
                ...(pieIntegratedFormatter != null ? { formatter: pieIntegratedFormatter } : {}),
                ...(interiorLabelColor != null ? { color: interiorLabelColor } : { color: darkChartTheme ? DATALABEL_COLOR_DARK : "#ffffff" }),
              }
            : forceExteriorLabels
              ? {
                  anchor: "end",
                  align: "end",
                  offset: 10,
                  clamp: true,
                  ...(style?.dataLabelColor != null && String(style.dataLabelColor).trim() !== ""
                    ? { color: style.dataLabelColor }
                    : darkChartTheme
                      ? { color: DATALABEL_COLOR_DARK }
                      : { color: AXIS_COLOR }),
                }
              : {
                  ...(style?.dataLabelColor
                    ? { color: style.dataLabelColor }
                    : darkChartTheme
                      ? { color: DATALABEL_COLOR_DARK }
                      : {}),
                }),
        },
      };
      return {
        ...base,
        ...optionsBaseNoScales,
        layout: { padding: pieLayoutPadding },
        ...(cutout != null ? { cutout } : {}),
        plugins,
      };
    }
    if (
      type === "bar" ||
      type === "horizontalBar" ||
      type === "line" ||
      chartType === "combo" ||
      chartType === "stackedColumn" ||
      chartType === "scatter"
    ) {
      const built = buildChartOptions(type, style, cartesianLabelMode, percentBasis) as Record<string, unknown>;
      const rawDatasetsForPercent = chartConfig?.datasets ?? [];
      const makePercentCtx = (dataIndex: number, datasetIndex: number): FormatChartPointContext => ({
        chart: { data: { datasets: rawDatasetsForPercent } },
        dataIndex,
        datasetIndex,
      });
      const builtPlugins = built.plugins as Record<string, unknown> | undefined;
      const builtDatalabels = builtPlugins?.datalabels as Record<string, unknown> | undefined ?? {};
      const hasSeriesDimension =
        String(agg?.chartSeriesField ?? "").trim() !== "" ||
        String(agg?.dimension2 ?? "").trim() !== "";
      const stackBySeriesEnabled =
        chartType === "stackedColumn"
          ? (typeof agg?.chartStackBySeries === "boolean" ? agg.chartStackBySeries : true)
          : hasSeriesDimension &&
            (chartType === "bar" || chartType === "horizontalBar" || chartType === "combo") &&
            (typeof agg?.chartStackBySeries === "boolean" ? agg.chartStackBySeries : true);
      const isComboTwo = chartType === "combo" && (chartConfig?.datasets?.length ?? 0) >= 2 && !stackBySeriesEnabled;
      const syncAxes = isComboTwo && (widget.aggregationConfig as { chartComboSyncAxes?: boolean } | undefined)?.chartComboSyncAxes === true;
      const axisTickColorResolved =
        style?.axisTickColor != null && String(style.axisTickColor).trim() !== ""
          ? String(style.axisTickColor).trim()
          : darkChartTheme
            ? AXIS_COLOR_DARK
            : AXIS_COLOR;
      const axisTickFont = {
        size: style?.fontSize ?? 11,
        ...(style?.chartFontFamily ? { family: style.chartFontFamily } : {}),
      };
      const axisTitle0 = String(chartConfig?.datasets?.[0]?.label ?? yAxisKeys[0] ?? "").trim();
      const axisTitle1 = String(chartConfig?.datasets?.[1]?.label ?? yAxisKeys[1] ?? "").trim();
      let comboScales: Record<string, unknown> | undefined;
      let comboRanges:
        | {
            min0: number;
            range0: number;
            min1: number;
            range1: number;
          }
        | undefined;
      if (isComboTwo && chartConfig?.datasets?.[0]?.data && chartConfig?.datasets?.[1]?.data) {
        const d0 = chartConfig.datasets[0].data as number[];
        const d1 = chartConfig.datasets[1].data as number[];
        const min0 = Math.min(...d0);
        const max0 = Math.max(...d0);
        const min1 = Math.min(...d1);
        const max1 = Math.max(...d1);
        const range0 = max0 - min0 || 1;
        const range1 = max1 - min1 || 1;
        comboRanges = { min0, range0, min1, range1 };
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
                clip: false,
                color: axisTickColorResolved,
                font: axisTickFont,
                callback: (value: number) => fmt0(value * range0 + min0),
              },
            }),
            ...(!syncAxes && {
              ticks: {
                ...(((built.scales as Record<string, unknown>)?.y as Record<string, unknown> | undefined)?.ticks ?? {}),
                clip: false,
                color: axisTickColorResolved,
                font: axisTickFont,
                callback: (value: number | string) => fmt0(Number(value)),
              },
            }),
            ...(axisTitle0 && {
              title: {
                display: true,
                text: axisTitle0,
                color: axisTickColorResolved,
                font: {
                  size: 11,
                  weight: "600" as const,
                  ...(style?.chartFontFamily ? { family: style.chartFontFamily } : {}),
                },
              },
            }),
          },
          y1: {
            display: style?.axisYVisible ?? true,
            position: "right" as const,
            grid: {
              drawOnChartArea: false,
              display: style?.gridYDisplay ?? true,
              color: style?.gridColor ?? (darkChartTheme ? GRID_COLOR_DARK : GRID_COLOR),
              ...(style?.gridLineWidth != null && Number.isFinite(style.gridLineWidth)
                ? { lineWidth: Math.max(0, Math.min(6, style.gridLineWidth)) }
                : {}),
            },
            ...(syncAxes && {
              min: 0,
              max: 1,
              ticks: {
                clip: false,
                color: axisTickColorResolved,
                font: axisTickFont,
                callback: (value: number) => fmt1(value * range1 + min1),
              },
            }),
            ...(!syncAxes && {
              ticks: {
                clip: false,
                color: axisTickColorResolved,
                font: axisTickFont,
                callback: (value: number | string) => fmt1(Number(value)),
              },
            }),
            ...(axisTitle1 && {
              title: {
                display: true,
                text: axisTitle1,
                color: axisTickColorResolved,
                font: {
                  size: 11,
                  weight: "600" as const,
                  ...(style?.chartFontFamily ? { family: style.chartFontFamily } : {}),
                },
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
                clip: false,
                ...(scale0.step != null ? { stepSize: scale0.step } : {}),
              },
            },
            y1: {
              ...((comboScales.y1 as Record<string, unknown> | undefined) ?? {}),
              ...(scale1.min != null ? { min: scale1.min } : {}),
              ...(scale1.max != null ? { max: scale1.max } : {}),
              ticks: {
                ...((((comboScales.y1 as Record<string, unknown> | undefined)?.ticks as Record<string, unknown>) ?? {})),
                clip: false,
                ...(scale1.step != null ? { stepSize: scale1.step } : {}),
              },
            },
          };
        }
      }

      const toRawComboValue = (value: number, datasetIndex?: number): number => {
        if (!syncAxes || !comboRanges || datasetIndex == null) return value;
        if (datasetIndex === 0) return value * comboRanges.range0 + comboRanges.min0;
        return value * comboRanges.range1 + comboRanges.min1;
      };
      const formatCartesianPoint = (
        value: number,
        datasetIndex?: number,
        ctx?: FormatChartPointContext
      ): string => {
        const rawValue = toRawComboValue(value, datasetIndex);
        const dsi =
          typeof ctx?.datasetIndex === "number"
            ? ctx.datasetIndex
            : typeof datasetIndex === "number"
              ? datasetIndex
              : 0;
        const di = ctx?.dataIndex;
        const dsIdxForStyle = typeof datasetIndex === "number" ? datasetIndex : dsi;
        const datasetStyle =
          metricStyles?.[dsIdxForStyle] != null ? metricStyles[dsIdxForStyle]! : style;
        const styleForFormat = datasetStyle ?? style;
        const denom =
          typeof di === "number"
            ? percentDenomResolver(di, typeof dsi === "number" ? dsi : 0)
            : undefined;
        const pointCtx: FormatChartPointContext | undefined =
          cartesianLabelMode === "percent" || cartesianLabelMode === "both"
            ? typeof di === "number"
              ? {
                  ...makePercentCtx(di, dsi),
                  ...(typeof denom === "number" && Number.isFinite(denom) ? { percentDenominator: denom } : {}),
                }
              : undefined
            : ctx;
        return formatChartPointDisplay(
          rawValue,
          styleForFormat,
          cartesianLabelMode,
          percentBasis,
          pointCtx
        );
      };
      const datalabelFormatter = (value: number, ctx?: FormatChartPointContext) =>
        formatCartesianPoint(value, ctx?.datasetIndex, {
          chart: ctx?.chart,
          dataIndex: ctx?.dataIndex,
          datasetIndex: ctx?.datasetIndex,
        });

      const baseOptionsTooltipCallbacks = (
        (optionsBase.plugins as { tooltip?: { callbacks?: Record<string, unknown> } } | undefined)?.tooltip
          ?.callbacks ?? {}
      ) as Record<string, unknown>;

      const tooltipTitleCallback =
        shouldFormatDateAxis || isComboTwo || usePerMetricFormat || syncAxes
          ? (items: Array<{ label?: unknown }>) => {
              const first = items?.[0];
              return formatTemporalLabel(first?.label ?? "");
            }
          : undefined;

      const tooltipLabelCallback =
        cartesianLabelMode !== "value" || isComboTwo || usePerMetricFormat || syncAxes
          ? (context: {
              dataset: { label?: string };
              parsed: { x?: number; y?: number };
              datasetIndex?: number;
              dataIndex?: number;
              chart?: unknown;
            }) => {
              const parsedValue =
                type === "horizontalBar" ? (context.parsed?.x ?? 0) : (context.parsed?.y ?? 0);
              const formatted = formatCartesianPoint(parsedValue, context.datasetIndex, {
                chart: context.chart as FormatChartPointContext["chart"],
                dataIndex: context.dataIndex,
                datasetIndex: context.datasetIndex,
              });
              return `${context.dataset?.label ?? ""}: ${formatted}`;
            }
          : undefined;

      const tooltipCallbacksBase =
        tooltipTitleCallback || tooltipLabelCallback
          ? {
              ...baseOptionsTooltipCallbacks,
              ...(tooltipTitleCallback ? { title: tooltipTitleCallback } : {}),
              ...(tooltipLabelCallback ? { label: tooltipLabelCallback } : {}),
            }
          : undefined;
      const detailCardRaw = (agg as { chartDetailCard?: unknown } | undefined)?.chartDetailCard;
      const detailCardTooltipActive =
        isChartDetailCardActive(detailCardRaw) &&
        chartConfig &&
        Array.isArray(widget.rows) &&
        widget.rows.length > 0;
      const tooltipCallbacks = (() => {
        if (!detailCardTooltipActive && !compareTooltipExtraActive) return tooltipCallbacksBase;
        const baseCb: Record<string, unknown> = {
          ...baseOptionsTooltipCallbacks,
          ...(tooltipCallbacksBase ?? {}),
        };
        const prevAfterBody = baseCb.afterBody as ((items: unknown[]) => string | string[] | void) | undefined;
        const prevTitle = baseCb.title as ((items: unknown[]) => string | void) | undefined;
        baseCb.afterBody = (items: unknown[]) => {
          const arr = Array.isArray(items) ? items : [];
          const first = arr[0] as { dataIndex?: number; datasetIndex?: number; label?: unknown } | undefined;
          const di = typeof first?.dataIndex === "number" ? first.dataIndex : 0;
          const dsi = typeof first?.datasetIndex === "number" ? first.datasetIndex : 0;
          const categoryLabel = formatTemporalLabel(first?.label ?? "");
          const seriesLabel = String(chartConfig?.datasets?.[dsi]?.label ?? "");
          const parts =
            detailCardTooltipActive
              ? buildChartTooltipDetailParts({
                  detailRaw: detailCardRaw,
                  rows: widget.rows as Record<string, unknown>[],
                  widget: widget as unknown as BuildChartConfigWidget,
                  chartConfig,
                  dataIndex: di,
                  datasetIndex: dsi,
                  chartType,
                  categoryLabel,
                  seriesLabel,
                })
              : null;
          const extra = parts?.afterBody?.length ? parts.afterBody : [];
          const prev = prevAfterBody ? prevAfterBody(items) : undefined;
          const prevArr = Array.isArray(prev) ? prev : prev != null && prev !== "" ? [String(prev)] : [];
          let compareLines: string[] = [];
          if (compareTooltipExtraActive && tooltipCompareAxis?.yKeys?.length) {
            const rowsArr = widget.rows as Record<string, unknown>[];
            const row = rowsArr[di];
            const metricsForY = (widget.aggregationConfig as { metrics?: { alias?: string; func?: string; field?: string }[] })
              ?.metrics;
            const resultKeys = rowsArr[0] ? Object.keys(rowsArr[0]) : [];
            const rawY =
              isComboTwo && chartType === "combo"
                ? yAxisKeys[dsi] ?? tooltipCompareAxis.yKeys[dsi]
                : yAxisKeys[0] ?? tooltipCompareAxis.yKeys[0];
            const resolvedY =
              rawY && metricsForY
                ? resolveChartYAxisEntryToResultKey(String(rawY), metricsForY, resultKeys) ?? String(rawY)
                : rawY != null
                  ? String(rawY)
                  : "";
            const styleForRow = (usePerMetricFormat && metricStyles?.[dsi] ? metricStyles[dsi] : style) as
              | ChartStyleConfig
              | undefined;
            if (resolvedY && row) {
              const line = buildCompareTooltipLineFromAgg(
                widget.aggregationConfig as never,
                row,
                resolvedY,
                styleForRow
              );
              if (line) compareLines = [line];
            }
          }
          return [...prevArr, ...extra, ...compareLines];
        };
        baseCb.title = (items: unknown[]) => {
          const arr = Array.isArray(items) ? items : [];
          const first = arr[0] as { dataIndex?: number; datasetIndex?: number; label?: unknown } | undefined;
          const di = typeof first?.dataIndex === "number" ? first.dataIndex : 0;
          const dsi = typeof first?.datasetIndex === "number" ? first.datasetIndex : 0;
          const categoryLabel = formatTemporalLabel(first?.label ?? "");
          const seriesLabel = String(chartConfig?.datasets?.[dsi]?.label ?? "");
          if (detailCardTooltipActive) {
            const titleParts = buildChartTooltipDetailParts({
              detailRaw: detailCardRaw,
              rows: widget.rows as Record<string, unknown>[],
              widget: widget as unknown as BuildChartConfigWidget,
              chartConfig,
              dataIndex: di,
              datasetIndex: dsi,
              chartType,
              categoryLabel,
              seriesLabel,
            });
            if (titleParts?.title) return titleParts.title;
          }
          if (prevTitle) return String(prevTitle(items) ?? "");
          return categoryLabel;
        };
        return baseCb;
      })();
      const builtScales = (built.scales as Record<string, unknown> | undefined) ?? {};
      const categoryScaleKey = type === "horizontalBar" ? "y" : "x";
      const valueScaleKey = type === "horizontalBar" ? "x" : "y";
      const categoryScale = (builtScales[categoryScaleKey] as Record<string, unknown> | undefined) ?? {};
      const categoryTicks = (categoryScale.ticks as Record<string, unknown> | undefined) ?? {};
      const valueScale = (builtScales[valueScaleKey] as Record<string, unknown> | undefined) ?? {};
      const valueTicks = (valueScale.ticks as Record<string, unknown> | undefined) ?? {};
      const primaryMetricScale = resolveMetricScale(0);
      const axisValueFormatStyle =
        (metricStyles?.[0] as ChartStyleConfig | undefined) ??
        (widget.chartStyle as ChartStyleConfig | undefined) ??
        style;
      const formatValueAxisTickFn = !isComboTwo ? getValueFormatter(axisValueFormatStyle, "value") : null;
      const categoryLabels = chartConfig?.labels ?? [];
      const formatCategoryAxisTick = (value: unknown, tickIndex: number): string => {
        if (categoryLabels.length === 0) return formatTemporalLabel(value);
        const s = String(value ?? "").trim();
        const looksLikeDateToken =
          /^\d{4}-\d{1,2}/.test(s) ||
          /^\d{4}-\d{1,2}-\d{1,2}/.test(s) ||
          /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s) ||
          /^\d{1,2}\/\d{4}$/.test(s);
        if (looksLikeDateToken) {
          const found = categoryLabels.findIndex((lab) => String(lab).trim() === s);
          if (found >= 0) return formatTemporalLabel(categoryLabels[found]);
          if (Number.isFinite(tickIndex) && tickIndex >= 0 && tickIndex < categoryLabels.length) {
            return formatTemporalLabel(categoryLabels[tickIndex]);
          }
          return formatTemporalLabel(s || value);
        }
        let idx = -1;
        if (typeof value === "number" && Number.isFinite(value)) idx = Math.trunc(value);
        else {
          const n = Number(value);
          if (Number.isFinite(n)) idx = Math.trunc(n);
        }
        if (idx >= 0 && idx < categoryLabels.length) return formatTemporalLabel(categoryLabels[idx]);
        const found = categoryLabels.indexOf(s);
        if (found >= 0) return formatTemporalLabel(categoryLabels[found]);
        if (Number.isFinite(tickIndex) && tickIndex >= 0 && tickIndex < categoryLabels.length) {
          return formatTemporalLabel(categoryLabels[tickIndex]);
        }
        return formatTemporalLabel(s || value);
      };
      const patchedCategoryScale = {
        ...categoryScale,
        ...(stackBySeriesEnabled ? { stacked: true } : {}),
        ticks: {
          ...categoryTicks,
          clip: false,
          callback: formatCategoryAxisTick,
        },
      };
      const patchedScales = {
        ...builtScales,
        [categoryScaleKey]: patchedCategoryScale,
        ...(valueScaleKey === "x"
          ? {
              x: {
                ...valueScale,
                ...(stackBySeriesEnabled ? { stacked: true } : {}),
                ...(primaryMetricScale.min != null ? { min: primaryMetricScale.min } : {}),
                ...(primaryMetricScale.max != null ? { max: primaryMetricScale.max } : {}),
                ticks: {
                  ...valueTicks,
                  clip: false,
                  ...(primaryMetricScale.step != null ? { stepSize: primaryMetricScale.step } : {}),
                  ...(formatValueAxisTickFn != null
                    ? {
                        callback: (v: number | string) => formatValueAxisTickFn(Number(v)),
                      }
                    : {}),
                },
              },
            }
          : {}),
        ...(valueScaleKey === "y"
          ? {
              y: {
                ...valueScale,
                ...(stackBySeriesEnabled ? { stacked: true } : {}),
                ...(primaryMetricScale.min != null ? { min: primaryMetricScale.min } : {}),
                ...(primaryMetricScale.max != null ? { max: primaryMetricScale.max } : {}),
                ticks: {
                  ...valueTicks,
                  clip: false,
                  ...(primaryMetricScale.step != null ? { stepSize: primaryMetricScale.step } : {}),
                  ...(formatValueAxisTickFn != null
                    ? {
                        callback: (v: number | string) => formatValueAxisTickFn(Number(v)),
                      }
                    : {}),
                },
              },
            }
          : {}),
      };
      const builtLegend = (builtPlugins?.legend as Record<string, unknown> | undefined) ?? {};
      const builtLegendLabels = (builtLegend.labels as Record<string, unknown> | undefined) ?? {};
      const cartLegPosRaw = agg?.chartLegendPosition;
      const cartLegendPosition =
        cartLegPosRaw === "top" ||
        cartLegPosRaw === "bottom" ||
        cartLegPosRaw === "left" ||
        cartLegPosRaw === "right" ||
        cartLegPosRaw === "chartArea"
          ? cartLegPosRaw
          : "top";
      const cartLegendVisible = agg?.chartLegendVisible !== false;
      const plugins = {
        ...optionsBase.plugins,
        ...builtPlugins,
        legend: cartLegendVisible
          ? {
              ...builtLegend,
              display: true,
              fullSize: false,
              align: "start",
              position: cartLegendPosition,
              labels: {
                ...builtLegendLabels,
              },
            }
          : {
              ...builtLegend,
              display: false,
              labels: {
                ...builtLegendLabels,
              },
            },
        datalabels: {
          ...builtDatalabels,
          display:
            showDataLabels === false
              ? false
              : createDataLabelDisplay({
                  mode: labelVisibilityMode,
                  labels: chartConfig?.labels,
                  datasets: chartConfig?.datasets,
                  maxVisible: labelMaxVisible,
                }),
          formatter: datalabelFormatter,
          ...(style?.dataLabelColor
            ? { color: style.dataLabelColor }
            : darkChartTheme
              ? { color: DATALABEL_COLOR_DARK }
              : {}),
        },
        ...((tooltipCallbacks ?? tooltipCallbacksBase) && {
          tooltip: {
            ...(optionsBase.plugins as { tooltip?: Record<string, unknown> }).tooltip,
            callbacks: (tooltipCallbacks ?? tooltipCallbacksBase) as Record<string, unknown>,
          },
        }),
      };
      const builtForChart =
        chartType === "combo"
          ? {
              ...built,
              elements: {
                line: { borderWidth: style?.lineBorderWidth ?? 2 },
                point: { radius: style?.pointRadius ?? 3 },
              },
            }
          : built;
      const baseReturn = { ...optionsBase, ...builtForChart, plugins, scales: patchedScales };
      if (comboScales) {
        return {
          ...baseReturn,
          scales: {
            ...comboScales,
            x: (patchedScales.x as Record<string, unknown> | undefined) ?? (comboScales as Record<string, unknown>).x,
            ...(categoryScaleKey === "y" && {
              y: (patchedScales.y as Record<string, unknown> | undefined) ?? (comboScales as Record<string, unknown>).y,
            }),
          },
        };
      }
      return baseReturn;
    }
    return optionsBase;
  }, [
    chartType,
    chartConfig,
    widget.chartStyle,
    widget.chartMetricStyles,
    widget.labelDisplayMode,
    widget.chartPercentBasis,
    percentDenomResolver,
    widget.aggregationConfig,
    darkChartTheme,
    pieContainerWidth,
    chartDevicePixelRatio,
  ]);

  const showCardHeader = !hideHeader && !widget.hideWidgetHeader;

  return (
    <Card
      className={`overflow-visible border transition-all ${className}`}
      style={{
        minHeight: effectiveMinHeight,
        ...(isTableWidget
          ? {
              height: effectiveMinHeight,
              minHeight: effectiveMinHeight,
              display: "flex",
              flexDirection: "column",
            }
          : {}),
        background: "var(--platform-surface, #fff)",
        borderColor: "var(--platform-border, #e2e8f0)",
        borderWidth: "var(--platform-card-border-width, 1px)",
        borderRadius: "var(--platform-card-radius, 0.75rem)",
      }}
    >
      {showCardHeader && (
        <header className="flex min-h-0 flex-shrink-0 items-center justify-between gap-2 overflow-hidden border-b px-4 py-2" style={{ borderColor: "var(--platform-border, #e2e8f0)" }}>
          <h3 className="min-w-0 truncate text-sm font-semibold" style={{ color: "var(--platform-fg, #0f172a)" }}>
            {widget.title}
          </h3>
        </header>
      )}
      <div
        className={`relative flex flex-1 flex-col p-3${isTableWidget ? " min-h-0 overflow-hidden" : ""}`}
        style={
          isTableWidget
            ? { flex: 1, minHeight: 0, overflow: "hidden" }
            : { minHeight: showCardHeader ? effectiveMinHeight - 52 : effectiveMinHeight - 12 }
        }
      >
        {isLoading && (
          <div
            className="absolute inset-0 z-10 flex items-center justify-center rounded-b-xl"
            style={{ background: "var(--platform-surface, #fff)" }}
          >
            <Loader2 className="h-8 w-8 animate-spin" style={{ color: "var(--platform-accent, #0ea5e9)" }} />
          </div>
        )}
        {!isLoading && <ContentAreaIconOverlay widget={widget} />}
        {(() => {
          const ddfs = (
            widget.aggregationConfig as { dimensionDefaultFilters?: DimensionDefaultFilterEdit[] } | undefined
          )?.dimensionDefaultFilters;
          if (!Array.isArray(ddfs) || ddfs.length === 0 || !onDimensionDefaultFilterChange) return null;
          if (chartType === "filter" || chartType === "text" || chartType === "image") return null;
          const vals = dimensionDefaultValuesByDdfId ?? {};
          const distinctMap = dimensionDefaultDistinctByDdfId ?? {};
          return (
            <div className="mb-2 flex flex-wrap items-end gap-2">
              {ddfs.map((ddf) => {
                const id = String(ddf.id ?? "").trim();
                if (!id) return null;
                const labelText = (ddf.label && String(ddf.label).trim()) || ddf.field;
                const cur = vals[id] !== undefined ? vals[id] : ddf.defaultValue;
                const it = ddf.inputType ?? "select";
                const opts = (distinctMap[id] as unknown[] | undefined)?.map(String) ?? [];
                const curStr = Array.isArray(cur) ? "" : String(cur ?? "");
                const selectOpts =
                  curStr && !opts.includes(curStr) ? [...opts, curStr] : opts;

                if (it === "multi") {
                  const selected = (Array.isArray(cur) ? cur : cur != null && cur !== "" ? [cur] : []) as unknown[];
                  const selectedNorm = selected.map(String);
                  const toggle = (s: string, checked: boolean) => {
                    const next = checked ? [...selectedNorm, s] : selectedNorm.filter((x) => x !== s);
                    onDimensionDefaultFilterChange(id, next);
                  };
                  const multiOpts = opts.length > 0 ? opts : selectedNorm;
                  return (
                    <div key={id} className="flex min-w-[8rem] flex-col gap-0.5">
                      <span className="text-[10px] font-medium" style={{ color: "var(--platform-fg-muted)" }}>
                        {labelText}
                      </span>
                      <div
                        className="max-h-28 overflow-y-auto rounded border px-2 py-1 text-xs"
                        style={{ borderColor: "var(--platform-border)" }}
                      >
                        {multiOpts.length === 0 ? (
                          <span style={{ color: "var(--platform-fg-muted)" }}>Sin opciones</span>
                        ) : (
                          multiOpts.map((s) => (
                            <label key={s} className="flex cursor-pointer items-center gap-1 py-0.5">
                              <input
                                type="checkbox"
                                className="rounded border"
                                style={{ borderColor: "var(--platform-border)" }}
                                checked={selectedNorm.includes(s)}
                                onChange={(e) => toggle(s, e.target.checked)}
                              />
                              <span style={{ color: "var(--platform-fg)" }}>{s}</span>
                            </label>
                          ))
                        )}
                      </div>
                    </div>
                  );
                }

                if (it === "select") {
                  return (
                    <div key={id} className="flex min-w-[7rem] flex-col gap-0.5">
                      <label className="text-[10px] font-medium" style={{ color: "var(--platform-fg-muted)" }}>
                        {labelText}
                      </label>
                      <select
                        className="rounded border px-2 py-1 text-xs"
                        style={{
                          borderColor: "var(--platform-border)",
                          background: "var(--platform-bg)",
                          color: "var(--platform-fg)",
                        }}
                        value={curStr}
                        onChange={(e) => onDimensionDefaultFilterChange(id, e.target.value)}
                      >
                        <option value="">Todos</option>
                        {selectOpts.map((v) => (
                          <option key={v} value={v}>
                            {v}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                }

                if (it === "number") {
                  return (
                    <div key={id} className="flex min-w-[6rem] flex-col gap-0.5">
                      <label className="text-[10px] font-medium" style={{ color: "var(--platform-fg-muted)" }}>
                        {labelText}
                      </label>
                      <input
                        type="number"
                        className="rounded border px-2 py-1 text-xs"
                        style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)", color: "var(--platform-fg)" }}
                        value={cur != null && cur !== "" ? Number(cur) : ""}
                        onChange={(e) =>
                          onDimensionDefaultFilterChange(
                            id,
                            e.target.value === "" ? "" : e.target.valueAsNumber
                          )
                        }
                      />
                    </div>
                  );
                }

                if (it === "date") {
                  return (
                    <div key={id} className="flex min-w-[7rem] flex-col gap-0.5">
                      <label className="text-[10px] font-medium" style={{ color: "var(--platform-fg-muted)" }}>
                        {labelText}
                      </label>
                      <input
                        type="date"
                        className="rounded border px-2 py-1 text-xs"
                        style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)", color: "var(--platform-fg)" }}
                        value={curStr}
                        onChange={(e) => onDimensionDefaultFilterChange(id, e.target.value)}
                      />
                    </div>
                  );
                }

                return (
                  <div key={id} className="flex min-w-[7rem] flex-1 flex-col gap-0.5">
                    <label className="text-[10px] font-medium" style={{ color: "var(--platform-fg-muted)" }}>
                      {labelText}
                    </label>
                    <input
                      type="text"
                      className="rounded border px-2 py-1 text-xs"
                      style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)", color: "var(--platform-fg)" }}
                      value={curStr}
                      onChange={(e) => onDimensionDefaultFilterChange(id, e.target.value)}
                    />
                  </div>
                );
              })}
            </div>
          );
        })()}
        {!hasViz && !isLoading && chartType !== "filter" && (
          <div className="flex flex-1 flex-col items-center justify-center py-8 text-center text-sm" style={{ color: "var(--platform-fg-muted, #64748b)" }}>
            Sin datos
          </div>
        )}
        {hasViz && !isLoading && (
          <>
            {chartType === "kpi" && (
              <div className="flex flex-1 flex-col items-center justify-center gap-1">
                {kpiValue ? (
                  <span className="text-4xl font-bold tabular-nums" style={{ color: "var(--platform-fg, #0f172a)" }}>
                    {kpiValue}
                  </span>
                ) : (
                  <div className="max-w-sm rounded-lg border px-4 py-3 text-center text-sm" style={{ borderColor: "var(--platform-border, #e2e8f0)", color: "var(--platform-fg-muted, #64748b)", background: "var(--platform-surface, #fff)" }}>
                    No hay dato unico para KPI. Revisa metrica/ejes o usa Tabla.
                  </div>
                )}
                {(() => {
                  if (widget.kpiSecondaryLabel || widget.kpiSecondaryValue) {
                    return (
                      <span className="text-sm" style={{ color: "var(--platform-fg-muted, #64748b)" }}>
                        {widget.kpiSecondaryLabel} {widget.kpiSecondaryValue}
                      </span>
                    );
                  }
                  const cap = String(widget.kpiCaption ?? "").trim();
                  if (cap) {
                    return (
                      <span className="text-sm" style={{ color: "var(--platform-fg-muted, #64748b)" }}>
                        {cap}
                      </span>
                    );
                  }
                  const agg = widget.aggregationConfig as { chartYAxes?: string[]; metrics?: { alias?: string; field?: string }[] } | undefined;
                  const yKey = agg?.chartYAxes?.[0];
                  const metricLabel = yKey || agg?.metrics?.[0]?.alias || agg?.metrics?.[0]?.field;
                  if (metricLabel) {
                    return (
                      <span className="text-sm" style={{ color: "var(--platform-fg-muted, #64748b)" }}>
                        {metricLabel}
                      </span>
                    );
                  }
                  return null;
                })()}
                {kpiCompareDisplay && (
                  <div
                    className="mt-0.5 flex items-center justify-center gap-1 text-center text-sm"
                    style={{
                      color:
                        kpiCompareDisplay.showColor && kpiCompareDisplay.tone === "up"
                          ? "rgb(22 163 74)"
                          : kpiCompareDisplay.showColor && kpiCompareDisplay.tone === "down"
                            ? "rgb(220 38 38)"
                            : "var(--platform-fg-muted, #64748b)",
                    }}
                  >
                    {kpiCompareDisplay.showIcon &&
                      (kpiCompareDisplay.tone === "up" ? (
                        <TrendingUp className="h-4 w-4 shrink-0" aria-hidden />
                      ) : kpiCompareDisplay.tone === "down" ? (
                        <TrendingDown className="h-4 w-4 shrink-0" aria-hidden />
                      ) : (
                        <Minus className="h-4 w-4 shrink-0 opacity-60" aria-hidden />
                      ))}
                    <span className="tabular-nums">{kpiCompareDisplay.text}</span>
                  </div>
                )}
              </div>
            )}
            {chartType === "table" && Array.isArray(tableRows) && tableRows.length > 0 && (
              <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                <div
                  className="dashboard-widget-table-scroll min-h-0 min-w-0 flex-1 overflow-auto rounded-md border text-xs"
                  style={{ borderColor: "var(--platform-border)" }}
                >
                  <table className="w-full min-w-max">
                    <thead>
                      <tr className="border-b text-left" style={{ borderColor: "var(--platform-border)" }}>
                        {effectiveTableColumnOrder.map((k) => (
                          <th
                            key={k}
                            className="sticky top-0 z-[1] py-1.5 pr-2 font-medium"
                            style={{
                              color: "var(--platform-fg-muted)",
                              background: "var(--platform-surface, #fff)",
                              boxShadow: "inset 0 -1px 0 var(--platform-border, #e2e8f0)",
                            }}
                          >
                            {String(effectiveTableHeaderLabels?.[k] ?? "").trim() || k}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {tableRows.map((row, i) => (
                        <tr key={i} className="border-b" style={{ borderColor: "var(--platform-border)" }}>
                          {effectiveTableColumnOrder.map((columnKey) => (
                            <td key={columnKey} className="py-1.5 pr-2" style={{ color: "var(--platform-fg)" }}>
                              {formatTableCellValue(columnKey, row[columnKey])}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {chartType === "text" && (
              <DashboardTextWidget content={widget.content ?? ""} isEditing={false} />
            )}
            {chartType === "image" && widget.imageUrl && (
              <div className={resolveImageContainerAlignment(widget.imageConfig)}>
                {/* eslint-disable-next-line @next/next/no-img-element -- URLs arbitrarias del layout */}
                <img
                  src={widget.imageUrl as string}
                  alt={widget.title}
                  className="block"
                  style={resolveImageElementStyle(widget.imageConfig)}
                />
              </div>
            )}
            {chartType === "image" && !widget.imageUrl && (
              <div className="flex flex-1 flex-col items-center justify-center py-6 text-center text-sm" style={{ color: "var(--platform-fg-muted, #64748b)" }}>
                Sin URL de imagen
              </div>
            )}
            {chartType === "filter" && widget.filterConfig && (
              <div className="flex flex-col gap-2">
                <label className="text-xs font-medium" style={{ color: "var(--platform-fg-muted)" }}>
                  {widget.filterConfig.label}
                </label>
                {widget.filterConfig.inputType === "multi" &&
                String(widget.filterConfig.operator ?? "").toUpperCase() !== "YEAR" &&
                Array.isArray(widget.facetValues?.[widget.filterConfig.field]) ? (
                  (() => {
                    const opts = (widget.facetValues![widget.filterConfig!.field] as unknown[]).map(String);
                    const selected = (Array.isArray(filterValue) ? filterValue : filterValue != null && filterValue !== "" ? [filterValue] : []) as string[];
                    const selectedNorm = selected.map(String);
                    const toggle = (s: string, checked: boolean) => {
                      const next = checked ? [...selectedNorm, s] : selectedNorm.filter((x) => x !== s);
                      onFilterChange?.(widget.id, next);
                    };
                    return (
                      <div className="flex flex-col gap-2 max-h-40 overflow-y-auto rounded-lg border p-2" style={{ borderColor: "var(--platform-border)" }}>
                        {opts.map((s) => (
                          <label key={s} className="flex items-center gap-2 cursor-pointer text-sm" style={{ color: "var(--platform-fg)" }}>
                            <input
                              type="checkbox"
                              className="rounded border"
                              style={{ borderColor: "var(--platform-border)" }}
                              checked={selectedNorm.includes(s)}
                              onChange={(e) => toggle(s, e.target.checked)}
                            />
                            <span>{s}</span>
                          </label>
                        ))}
                      </div>
                    );
                  })()
                ) : ((widget.filterConfig.inputType === "select" ||
                    String(widget.filterConfig.operator ?? "").toUpperCase() === "YEAR") &&
                  Array.isArray(widget.facetValues?.[widget.filterConfig.field])) ? (
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
                    aggregationConfig={widget.aggregationConfig as MapAggregationConfig | undefined}
                    mapDefaultCountry={
                      (widget.aggregationConfig as MapAggregationConfig | undefined)?.mapDefaultCountry
                    }
                    chartStyle={
                      (widget.chartMetricStyles?.[0] ?? widget.chartStyle) as ChartStyleConfig | undefined
                    }
                    darkChartTheme={darkChartTheme}
                    height={Math.max(220, (effectiveMinHeight ?? 240) - 52)}
                  />
                )}
              </div>
            )}
            {chartType !== "kpi" && chartType !== "table" && chartType !== "text" && chartType !== "image" && chartType !== "filter" && chartType !== "map" && chartConfig && (
              <div
                ref={chartType === "pie" || chartType === "doughnut" ? pieChartWrapRef : undefined}
                className={
                  chartType === "horizontalBar" && horizontalBarLayout?.scrollable
                    ? "dashboard-chart-horizontal-scroll w-full min-h-0"
                    : "w-full"
                }
                style={{
                  height:
                    chartType === "horizontalBar" && horizontalBarLayout
                      ? horizontalBarLayout.scrollable
                        ? horizontalBarLayout.containerHeight
                        : horizontalBarLayout.chartHeight
                      : defaultCartesianChartHeight,
                  ...(chartType === "horizontalBar" && horizontalBarLayout?.scrollable
                    ? { maxHeight: horizontalBarLayout.containerHeight, overflowY: "auto", overflowX: "visible" }
                    : {}),
                }}
              >
                {(chartType === "bar" || chartType === "stackedColumn" || chartType === "combo") && (
                  <Bar
                    data={(chartType === "combo" && effectiveChartData ? effectiveChartData : chartConfig) as never}
                    options={chartOptions as never}
                    plugins={chartPlugins}
                  />
                )}
                {chartType === "horizontalBar" && (
                  <div
                    className="w-full"
                    style={{
                      height: horizontalBarLayout?.chartHeight ?? defaultCartesianChartHeight,
                      minHeight: horizontalBarLayout?.chartHeight ?? defaultCartesianChartHeight,
                    }}
                  >
                    <Bar data={chartConfig as never} options={chartOptions as never} plugins={chartPlugins} />
                  </div>
                )}
                {(chartType === "line" || chartType === "area") && (
                  <Line
                    data={chartType === "area" ? { ...chartConfig, datasets: chartConfig.datasets.map((ds) => ({ ...ds, fill: true })) } as never : chartConfig as never}
                    options={chartOptions as never}
                    plugins={chartPlugins}
                  />
                )}
                {chartType === "pie" && <Pie data={chartConfig as never} options={chartOptions as never} plugins={chartPlugins} />}
                {chartType === "doughnut" && <Doughnut data={chartConfig as never} options={chartOptions as never} plugins={chartPlugins} />}
                {chartType === "scatter" && <Scatter data={chartConfig as never} options={chartOptions as never} plugins={chartPlugins} />}
              </div>
            )}
            {showTechnicalPreview && widget.diagnosticPreview && (
              <details className="mt-3 shrink-0 rounded-md border border-[var(--platform-border)] bg-[var(--platform-bg-elevated,transparent)]">
                <summary className="cursor-pointer px-3 py-2 text-xs font-medium" style={{ color: "var(--platform-fg-muted)" }}>
                  Vista previa técnica
                </summary>
                <div className="space-y-2 border-t border-[var(--platform-border)] px-3 py-2">
                  <div className="text-[11px] leading-5" style={{ color: "var(--platform-fg-muted)" }}>
                    <span className="font-semibold">endpoint:</span> {widget.diagnosticPreview.endpoint}
                    {" · "}
                    <span className="font-semibold">tipo:</span> {widget.diagnosticPreview.source}
                    {widget.diagnosticPreview.capturedAt ? (
                      <>
                        {" · "}
                        <span className="font-semibold">capturado:</span> {widget.diagnosticPreview.capturedAt}
                      </>
                    ) : null}
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      className="rounded border border-[var(--platform-border)] px-2 py-1 text-[11px]"
                      style={{ color: "var(--platform-fg-muted)" }}
                      onClick={() => {
                        if (typeof navigator === "undefined" || !navigator.clipboard) return;
                        void navigator.clipboard.writeText(JSON.stringify(widget.diagnosticPreview, null, 2));
                      }}
                    >
                      Copiar JSON
                    </button>
                  </div>
                  <pre
                    className="max-h-52 overflow-auto rounded bg-black/10 p-2 text-[11px] leading-4"
                    style={{ color: "var(--platform-fg)" }}
                  >
                    {JSON.stringify(widget.diagnosticPreview.payload, null, 2)}
                  </pre>
                </div>
              </details>
            )}
          </>
        )}
      </div>
    </Card>
  );
}
