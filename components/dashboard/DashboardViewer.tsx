"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useDashboardEtlData } from "@/hooks/useDashboardEtlData";
import {
  type DashboardTheme,
  DEFAULT_DASHBOARD_THEME,
  mergeTheme,
} from "@/types/dashboard";
import { DashboardWidgetRenderer, type DashboardWidgetRendererWidget, type ChartConfig } from "./DashboardWidgetRenderer";
import type { ChartStyleConfig, ValueFormatType, ValueScaleType } from "@/lib/dashboard/chartOptions";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

// Types compatible with persisted layout and API
type AggregationFilter = {
  id: string;
  field: string;
  operator: string;
  value: unknown;
  convertToNumber?: boolean;
  inputType?: "text" | "select" | "number" | "date";
  distinctValues?: unknown[];
};

type AggregationMetric = {
  id: string;
  field: string;
  func: string;
  alias: string;
  numericCast?: "none" | "numeric" | "sanitize";
  conversionType?: "none" | "multiply" | "divide";
  conversionFactor?: number;
  precision?: number;
};

type AggregationConfig = {
  enabled: boolean;
  dimension?: string;
  dimensions?: string[];
  dimension2?: string;
  metrics: AggregationMetric[];
  filters?: AggregationFilter[];
  orderBy?: { field: string; direction: "ASC" | "DESC" };
  limit?: number;
  cumulative?: string;
  comparePeriod?: string;
  dateDimension?: string;
  chartType?: string;
  chartSeriesColors?: Record<string, string>;
  chartXAxis?: string;
  chartYAxes?: string[];
  chartSeriesField?: string;
  chartRankingEnabled?: boolean;
  chartRankingTop?: number;
  chartRankingMetric?: string;
  chartSortDirection?: string;
  chartSortBy?: string;
  chartAxisOrder?: string;
  chartNumberFormat?: string;
  chartValueType?: string;
  chartValueScale?: string;
  chartCurrencySymbol?: string;
  chartThousandSep?: boolean;
  chartDecimals?: number;
};

export type Widget = DashboardWidgetRendererWidget & {
  x: number;
  y: number;
  w: number;
  h: number;
  aggregationConfig?: AggregationConfig;
  source?: { table?: string; etlId?: string; labelField?: string; valueFields?: string[] };
  dataSourceId?: string | null;
  excludeGlobalFilters?: boolean;
  gridOrder?: number;
};

function computeGridPlacements(
  ordered: Widget[]
): { widget: Widget; row: number; col: number; span: number }[] {
  const placements: { widget: Widget; row: number; col: number; span: number }[] = [];
  let row = 0,
    col = 0;
  for (const w of ordered) {
    const span = Math.min(4, Math.max(1, (w.gridSpan ?? 2) as number)) as 1 | 2 | 4;
    placements.push({ widget: w, row, col, span });
    col += span;
    if (col >= 4) {
      col = 0;
      row += 1;
    }
  }
  return placements;
}

/** Construye chartStyle desde aggregationConfig para que el renderer aplique formato (tipo + escala + decimales). */
function buildChartStyleFromAgg(agg: AggregationConfig | undefined): ChartStyleConfig | undefined {
  if (!agg) return undefined;
  const valueType = agg.chartValueType as string | undefined;
  const valueScale = agg.chartValueScale as string | undefined;
  const legacy = agg.chartNumberFormat as string | undefined;
  const valueFormat: ValueFormatType =
    valueType === "currency" || legacy === "currency"
      ? "currency"
      : valueType === "percent" || legacy === "percent"
        ? "percent"
        : "none";
  const scale: ValueScaleType =
    valueScale === "K" || legacy === "K"
      ? "K"
      : valueScale === "M" || legacy === "M"
        ? "M"
        : valueScale === "BI" || valueScale === "Bi" || valueScale === "B" || legacy === "BI"
          ? "B"
          : "none";
  const decimals = agg.chartDecimals ?? 2;
  const useGrouping = agg.chartThousandSep !== false;
  if (valueFormat === "none" && scale === "none" && decimals === 2 && useGrouping) return undefined;
  return {
    valueFormat,
    valueScale: scale,
    currencySymbol: agg.chartCurrencySymbol ?? "$",
    decimals,
    useGrouping,
  };
}

function buildChartConfigFromRows(
  dataArray: Record<string, unknown>[],
  widget: Widget,
  accentColor: string
): ChartConfig | undefined {
  if (!Array.isArray(dataArray) || dataArray.length === 0) return undefined;
  const sample = dataArray[0] || {};
  const resultKeys = Object.keys(sample);
  const agg = widget.aggregationConfig;
  const metricAliases = agg?.enabled && agg.metrics?.length
    ? agg.metrics.map((m) => m.alias || `${m.func}(${m.field})`).filter(Boolean)
    : [];
  const xKey =
    (agg as AggregationConfig & { chartXAxis?: string })?.chartXAxis && resultKeys.includes((agg as any).chartXAxis)
      ? (agg as any).chartXAxis
      : (agg?.dimension || widget.source?.labelField || resultKeys.find((k) => !metricAliases.includes(k) && typeof (sample as any)[k] === "string") || resultKeys[0]);
  let yKeys: string[] = [];
  if ((agg as any)?.chartYAxes?.length > 0) {
    yKeys = ((agg as any).chartYAxes as string[]).filter((k) => resultKeys.includes(k));
  }
  if (yKeys.length === 0 && metricAliases.length > 0) {
    yKeys = metricAliases.filter((k) => resultKeys.includes(k));
  }
  if (yKeys.length === 0) {
    const numKeys = resultKeys.filter((k) => typeof (sample as any)[k] === "number");
    yKeys = numKeys.length > 0 ? numKeys : resultKeys.filter((k) => k !== xKey).slice(0, 1);
  }
  if (!xKey || yKeys.length === 0) return undefined;

  const defaultPalette = ["#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316"];
  const basePalette = widget.color ? [widget.color, ...defaultPalette] : accentColor ? [accentColor, ...defaultPalette] : defaultPalette;
  const cfgSeriesColors = (agg as any)?.chartSeriesColors;
  const colorKeys = cfgSeriesColors ? Object.keys(cfgSeriesColors) : [];
  const aliasForYKey = (yKey: string): string => {
    const match = yKey.match(/^metric_(\d+)$/);
    if (match && agg?.metrics?.[Number(match[1])]) {
      return agg.metrics[Number(match[1])].alias || yKey;
    }
    return yKey;
  };
  const resolveColor = (key: string): string | undefined => {
    if (!cfgSeriesColors) return undefined;
    const k = key?.trim?.() ?? key;
    return cfgSeriesColors[key] ?? cfgSeriesColors[k] ?? (typeof key === "string" && key.match(/^metric_\d+$/) ? cfgSeriesColors[aliasForYKey(key)] : undefined);
  };
  const getColor = (label: string, idx: number) => {
    const c = resolveColor(label) ?? resolveColor(aliasForYKey(label)) ?? (colorKeys[idx] != null ? cfgSeriesColors?.[colorKeys[idx]] : undefined);
    return c ?? basePalette[idx % basePalette.length];
  };
  const getColorStable = (label: string) => {
    const c = resolveColor(label) ?? resolveColor(aliasForYKey(label));
    if (c) return c;
    let hash = 0;
    for (let i = 0; i < String(label).length; i++) hash = (hash << 5) - hash + String(label).charCodeAt(i);
    return basePalette[Math.abs(hash) % basePalette.length];
  };

  let rows = [...dataArray];
  const resolvedType = (agg as any)?.chartType || widget.type;
  if ((agg as any)?.chartRankingEnabled && (agg as any)?.chartRankingTop > 0) {
    const rKey = (agg as any)?.chartRankingMetric && resultKeys.includes((agg as any).chartRankingMetric)
      ? (agg as any).chartRankingMetric
      : yKeys[0] || resultKeys[0];
    if (rKey) {
      rows.sort((a: any, b: any) => Number(b?.[rKey] ?? 0) - Number(a?.[rKey] ?? 0));
      rows = rows.slice(0, (agg as any).chartRankingTop);
    }
  }

  const isPieOrDoughnut = resolvedType === "pie" || resolvedType === "doughnut";
  const seriesField = (agg as any)?.chartSeriesField;

  if (resolvedType === "kpi") {
    const valueField = yKeys[0];
    const sum = rows.reduce((acc, row) => acc + Number(row?.[valueField] ?? 0), 0);
    return { labels: ["Total"], datasets: [{ label: aliasForYKey(valueField), data: [sum] }] };
  }

  if (seriesField && resultKeys.includes(seriesField) && !isPieOrDoughnut) {
    const uniqueX = [...new Set(rows.map((r: any) => String(r[xKey] ?? "")))];
    const seriesValues = [...new Set(rows.map((r: any) => String(r[seriesField] ?? "")))];
    return {
      labels: uniqueX,
      datasets: seriesValues.map((sv, idx) => ({
        label: sv,
        data: uniqueX.map((xv) => {
          const match = rows.find((r: any) => String(r[xKey] ?? "") === xv && String(r[seriesField] ?? "") === sv);
          return match ? Number((match as any)[yKeys[0]] ?? 0) : 0;
        }),
        backgroundColor: (getColor(sv, idx) as string) + "99",
        borderColor: getColor(sv, idx) as string,
        borderWidth: 2,
      })),
    };
  }

  if (isPieOrDoughnut) {
    const labels = rows.map((r: any) => String(r[xKey] ?? ""));
    const firstYKey = yKeys[0] || resultKeys.find((k) => k !== xKey) || resultKeys[0];
    return {
      labels,
      datasets: [{
        label: aliasForYKey(firstYKey),
        data: rows.map((r: any) => Number(r[firstYKey] ?? 0)),
        backgroundColor: labels.map((l) => getColorStable(l) as string),
        borderColor: "#fff",
        borderWidth: 2,
      }],
    };
  }

  if (resolvedType === "combo" && yKeys.length >= 2) {
    const labels = rows.map((r: any) => String(r[xKey] ?? ""));
    const label0 = aliasForYKey(yKeys[0]);
    const label1 = aliasForYKey(yKeys[1]);
    return {
      labels,
      datasets: [
        {
          label: label0,
          data: rows.map((r: any) => Number(r[yKeys[0]] ?? 0)),
          backgroundColor: (getColor(label0, 0) as string) + "80",
          borderColor: getColor(label0, 0) as string,
          borderWidth: 2,
          type: "bar",
        },
        {
          label: label1,
          data: rows.map((r: any) => Number(r[yKeys[1]] ?? 0)),
          backgroundColor: (getColor(label1, 1) as string) + "20",
          borderColor: getColor(label1, 1) as string,
          borderWidth: 2,
          type: "line",
          fill: false,
        },
      ],
    };
  }

  const labels = rows.map((r: any) => String(r[xKey] ?? ""));
  const isBarOrHorizontalBar = resolvedType === "bar" || resolvedType === "horizontalBar";
  const oneMetricManyCategories = isBarOrHorizontalBar && yKeys.length === 1 && labels.length > 0;
  if (oneMetricManyCategories) {
    const yKey = yKeys[0];
    const displayLabel = aliasForYKey(yKey);
    const barColors = labels.map((l) => getColorStable(l) as string);
    return {
      labels,
      datasets: [{
        label: displayLabel,
        data: rows.map((r: any) => Number(r[yKey] ?? 0)),
        backgroundColor: barColors.map((c) => c + "99"),
        borderColor: barColors,
        borderWidth: 2,
      }],
    };
  }
  return {
    labels,
    datasets: yKeys.map((yKey, idx) => {
      const displayLabel = aliasForYKey(yKey);
      return {
        label: displayLabel,
        data: rows.map((r: any) => Number(r[yKey] ?? 0)),
        backgroundColor: (resolvedType === "area" ? (getColor(displayLabel, idx) as string) + "40" : (getColor(displayLabel, idx) as string) + "99"),
        borderColor: getColor(displayLabel, idx) as string,
        borderWidth: resolvedType === "line" || resolvedType === "area" ? 2 : 1,
        ...(resolvedType === "area" ? { fill: true } : {}),
      };
    }),
  };
}

export interface DashboardViewerProps {
  dashboardId: string;
  apiEndpoints?: {
    etlData?: string;
    aggregateData?: string;
    rawData?: string;
    distinctValues?: string;
  };
  isPublic?: boolean;
  initialWidgets?: Widget[];
  initialTitle?: string;
  initialGlobalFilters?: AggregationFilter[];
  backHref?: string;
  backLabel?: string;
  variant?: "default" | "admin";
  hideHeader?: boolean;
}

export function DashboardViewer({
  dashboardId,
  apiEndpoints,
  isPublic = false,
  initialWidgets,
  initialTitle,
  initialGlobalFilters,
  backHref,
  backLabel = "Volver al Editor",
  variant = "default",
  hideHeader = false,
}: DashboardViewerProps) {
  const [title, setTitle] = useState("Dashboard");
  const [widgets, setWidgets] = useState<Widget[]>([]);
  const [globalFilters, setGlobalFilters] = useState<AggregationFilter[]>([]);
  const [dashboardTheme, setDashboardTheme] = useState<DashboardTheme>(() => ({ ...DEFAULT_DASHBOARD_THEME }));
  const [filterValues, setFilterValues] = useState<Record<string, unknown>>({});
  const stateRef = useRef({ widgets, setWidgets });

  const { data: etlData } = useDashboardEtlData(dashboardId, apiEndpoints?.etlData);

  const themeMerged = useMemo(() => mergeTheme(dashboardTheme), [dashboardTheme]);
  const accentColor = themeMerged.accentColor ?? DEFAULT_DASHBOARD_THEME.accentColor ?? "#0ea5e9";

  useEffect(() => {
    if (initialWidgets?.length) {
      setWidgets(initialWidgets);
      if (initialTitle) setTitle(initialTitle);
      if (initialGlobalFilters) setGlobalFilters(initialGlobalFilters);
      return;
    }
    const dashboard = (etlData as any)?.dashboard;
    if (!dashboard) return;
    const layout = dashboard.layout as { widgets?: Widget[]; theme?: Partial<DashboardTheme> } | undefined;
    const loadedWidgets = Array.isArray(layout?.widgets) ? layout.widgets : [];
    const loadedTheme = layout?.theme && typeof layout.theme === "object" ? layout.theme : {};
    setWidgets(loadedWidgets);
    setTitle((dashboard.title as string) || "Dashboard");
    setDashboardTheme((prev) => ({ ...DEFAULT_DASHBOARD_THEME, ...prev, ...loadedTheme }));
    setGlobalFilters(Array.isArray(dashboard.global_filters_config) ? (dashboard.global_filters_config as AggregationFilter[]) : []);
  }, [etlData, initialWidgets, initialTitle, initialGlobalFilters]);

  const getTableNameForWidget = useCallback(
    (widget: Widget): string | null => {
      let fullTableName = "";
      if (widget.source?.table) fullTableName = widget.source.table;
      else if ((etlData as any)?.etlData?.name) fullTableName = (etlData as any).etlData.name;
      if (fullTableName) return fullTableName;
      return null;
    },
    [etlData]
  );

  const loadDataForWidget = useCallback(
    async (widgetId: string) => {
      const widget = widgets.find((w) => w.id === widgetId);
      if (!widget || !etlData) return;
      const etlId = (etlData as any)?.etl?.id;
      let fullTableName = getTableNameForWidget(widget);
      if (!fullTableName && etlId && !isPublic) {
        try {
          const { createClient } = await import("@/lib/supabase/client");
          const supabase = createClient();
          const { data: run } = await supabase
            .from("etl_runs_log")
            .select("destination_schema,destination_table_name")
            .eq("etl_id", etlId)
            .eq("status", "completed")
            .order("completed_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (run?.destination_table_name) {
            const schema = run.destination_schema || "etl_output";
            fullTableName = `${schema}.${run.destination_table_name}`;
          }
        } catch {
          // ignore
        }
      }
      if (!fullTableName) {
        setWidgets((prev) => prev.map((w) => (w.id === widgetId ? { ...w, isLoading: false } : w)));
        return;
      }

      const aggConfig = widget.aggregationConfig;
      const fieldsWithWidgets = new Set(
        widgets.filter((w) => w.type === "filter" && (w as any).filterConfig?.field).map((w) => (w as any).filterConfig!.field)
      );
      const widgetFilters: AggregationFilter[] = widgets
        .filter(
          (w) =>
            w.type === "filter" &&
            (w as any).filterConfig &&
            filterValues[w.id] !== undefined &&
            filterValues[w.id] !== "" &&
            filterValues[w.id] !== null
        )
        .map((w) => ({
          id: `wf-${w.id}`,
          field: (w as any).filterConfig!.field,
          operator: Array.isArray(filterValues[w.id]) && !["MONTH", "YEAR", "DAY"].includes((w as any).filterConfig!.operator) ? "IN" : (w as any).filterConfig!.operator,
          value: filterValues[w.id],
          convertToNumber: (w as any).filterConfig!.inputType === "number",
        }));
      const rawFilters = [
        ...(!(widget as any).excludeGlobalFilters
          ? globalFilters.filter(
              (f) =>
                f.value !== "" && f.value !== null && f.value !== undefined &&
                !(Array.isArray(f.value) && f.value.length === 0) &&
                !fieldsWithWidgets.has(f.field)
            )
          : []),
        ...widgetFilters,
        ...(aggConfig?.filters || []),
      ];
      const preparedFilters = rawFilters.map((f) => ({
        field: f.field,
        operator: f.operator || "=",
        value: f.value,
        cast: f.convertToNumber ? "numeric" : undefined,
      }));

      setWidgets((prev) => prev.map((w) => (w.id === widgetId ? { ...w, isLoading: true } : w)));

      try {
        let dataArray: Record<string, unknown>[] = [];
        if (aggConfig?.enabled && aggConfig.metrics?.length > 0) {
          const dimensionsArray = (aggConfig as any).dimensions?.length
            ? (aggConfig as any).dimensions
            : [aggConfig.dimension, (aggConfig as any).dimension2].filter(Boolean);
          const bodyPayload: Record<string, unknown> = {
            tableName: fullTableName,
            dimension: aggConfig.dimension,
            metrics: aggConfig.metrics.map(({ id, ...rest }) => ({
              ...rest,
              cast: rest.numericCast && rest.numericCast !== "none" ? rest.numericCast : undefined,
            })),
            filters: preparedFilters,
            orderBy: (aggConfig as any).chartRankingEnabled && (aggConfig as any).chartRankingTop
              ? { field: (aggConfig as any).chartRankingMetric || aggConfig.metrics[0]?.alias, direction: "DESC" }
              : aggConfig.orderBy,
            limit: (aggConfig as any).chartRankingEnabled && (aggConfig as any).chartRankingTop
              ? (aggConfig as any).chartRankingTop
              : aggConfig.limit ?? 1000,
            etlId,
          };
          if (dimensionsArray.length > 0) bodyPayload.dimensions = dimensionsArray;
          if ((aggConfig as any).cumulative) bodyPayload.cumulative = (aggConfig as any).cumulative;
          if ((aggConfig as any).comparePeriod) bodyPayload.comparePeriod = (aggConfig as any).comparePeriod;
          if ((aggConfig as any).dateDimension) bodyPayload.dateDimension = (aggConfig as any).dateDimension;

          const url = apiEndpoints?.aggregateData ?? "/api/dashboard/aggregate-data";
          const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(bodyPayload),
          });
          if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Error aggregate");
          dataArray = await res.json();
        } else {
          const url = apiEndpoints?.rawData ?? "/api/dashboard/raw-data";
          const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              tableName: fullTableName,
              filters: preparedFilters,
              limit: aggConfig?.limit ?? 5000,
            }),
          });
          if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Error raw");
          dataArray = await res.json();
        }

        if (!Array.isArray(dataArray) || dataArray.length === 0) {
          setWidgets((prev) =>
            prev.map((w) =>
              w.id === widgetId ? { ...w, rows: [], config: { labels: [], datasets: [] }, isLoading: false } : w
            )
          );
          return;
        }

        const sample = dataArray[0] || {};
        const inferType = (val: unknown): "string" | "number" | "boolean" | "date" | "unknown" => {
          const t = typeof val;
          if (t === "number") return "number";
          if (t === "boolean") return "boolean";
          if (t === "string") {
            if (/^\d{4}-\d{2}-\d{2}/.test(val as string) || /T\d{2}:\d{2}:\d{2}/.test(val as string)) return "date";
            return "string";
          }
          if (val instanceof Date) return "date";
          return "unknown";
        };
        const columnsDetected = Object.keys(sample).map((k) => ({ name: k, type: inferType((sample as any)[k]) }));
        const config = buildChartConfigFromRows(dataArray, widget, accentColor);

        setWidgets((prev) =>
          prev.map((w) =>
            w.id === widgetId
              ? {
                  ...w,
                  config: config ?? { labels: [], datasets: [] },
                  rows: dataArray,
                  columns: columnsDetected,
                  isLoading: false,
                }
              : w
          )
        );
      } catch {
        setWidgets((prev) => prev.map((w) => (w.id === widgetId ? { ...w, isLoading: false } : w)));
      }
    },
    [widgets, etlData, globalFilters, filterValues, apiEndpoints, getTableNameForWidget, isPublic, accentColor]
  );

  const reloadAll = useCallback(() => {
    widgets.forEach((w) => { if (w.type !== "filter") loadDataForWidget(w.id); });
  }, [widgets, loadDataForWidget]);

  useEffect(() => {
    if (!etlData || widgets.length === 0) return;
    const timer = setTimeout(() => {
      stateRef.current.widgets.forEach((w) => {
        if (w.type !== "filter") loadDataForWidget(w.id);
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [filterValues]);

  const initialLoadedRef = useRef(false);
  useEffect(() => {
    if (!initialLoadedRef.current && widgets.length > 0 && etlData) {
      initialLoadedRef.current = true;
      reloadAll();
    }
  }, [widgets, etlData, reloadAll]);

  useEffect(() => {
    initialLoadedRef.current = false;
  }, [dashboardId]);

  const handleFilterChange = useCallback((widgetId: string, value: unknown) => {
    setFilterValues((prev) => ({ ...prev, [widgetId]: value }));
  }, []);

  const orderedWidgets = useMemo(() => {
    const hasOrder = widgets.some((w) => typeof w.gridOrder === "number");
    if (hasOrder) return [...widgets].sort((a, b) => (a.gridOrder ?? 0) - (b.gridOrder ?? 0));
    return widgets;
  }, [widgets]);
  const placements = useMemo(() => computeGridPlacements(orderedWidgets), [orderedWidgets]);

  const rootClassName = variant === "admin" ? "admin-dashboard-view gap-5" : "gap-0";
  const useClientTheme = !hideHeader && (variant === "default" && !backHref);
  const themeVars = useMemo(() => {
    if (!useClientTheme) return {};
    const bg = themeMerged.backgroundColor ?? DEFAULT_DASHBOARD_THEME.backgroundColor;
    const cardBg = themeMerged.cardBackgroundColor ?? DEFAULT_DASHBOARD_THEME.cardBackgroundColor;
    const borderColor = themeMerged.cardBorderColor ?? DEFAULT_DASHBOARD_THEME.cardBorderColor;
    const borderWidth = themeMerged.cardBorderWidth ?? DEFAULT_DASHBOARD_THEME.cardBorderWidth ?? 1;
    const radius = themeMerged.cardBorderRadius ?? DEFAULT_DASHBOARD_THEME.cardBorderRadius ?? 20;
    const textColor = themeMerged.textColor ?? DEFAULT_DASHBOARD_THEME.textColor;
    const textMutedColor = themeMerged.textMutedColor ?? DEFAULT_DASHBOARD_THEME.textMutedColor;
    return {
      "--client-font": themeMerged.fontFamily ?? DEFAULT_DASHBOARD_THEME.fontFamily,
      "--client-header-font-size": `${themeMerged.headerFontSize ?? DEFAULT_DASHBOARD_THEME.headerFontSize ?? 1.25}rem`,
      "--client-card-title-font-size": `${themeMerged.cardTitleFontSize ?? DEFAULT_DASHBOARD_THEME.cardTitleFontSize ?? 0.8125}rem`,
      "--client-kpi-value-font-size": `${themeMerged.kpiValueFontSize ?? DEFAULT_DASHBOARD_THEME.kpiValueFontSize ?? 1.25}rem`,
      "--client-accent": themeMerged.accentColor ?? DEFAULT_DASHBOARD_THEME.accentColor,
      "--client-bg": bg,
      "--client-card": cardBg,
      "--client-text": textColor,
      "--client-text-muted": textMutedColor,
      "--client-border": borderColor,
      "--client-border-width": `${borderWidth}px`,
      "--client-radius": `${radius}px`,
      "--platform-surface": cardBg,
      "--platform-border": borderColor,
      "--platform-card-border-width": `${borderWidth}px`,
      "--platform-card-radius": `${radius}px`,
      "--platform-fg": textColor,
      "--platform-fg-muted": textMutedColor,
    } as React.CSSProperties;
  }, [useClientTheme, themeMerged]);

  const wrapperBackground = useMemo(() => {
    if (!useClientTheme) return undefined;
    const bg = themeMerged.backgroundColor ?? DEFAULT_DASHBOARD_THEME.backgroundColor;
    const url = themeMerged.backgroundImageUrl?.trim();
    if (url) {
      const safeUrl = url.replace(/"/g, "%22");
      return {
        backgroundColor: bg,
        backgroundImage: `url("${safeUrl}")`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      };
    }
    return { backgroundColor: bg };
  }, [useClientTheme, themeMerged.backgroundColor, themeMerged.backgroundImageUrl]);

  return (
    <div
      className={`flex flex-col h-full w-full ${rootClassName}${useClientTheme ? " client-view-root" : ""}`}
      data-theme={useClientTheme ? "client" : undefined}
      style={{ ...themeVars, ...wrapperBackground }}
    >
      {!hideHeader && (
        <header
          className={`flex flex-shrink-0 items-center justify-between gap-4 border-b px-4 py-3${useClientTheme ? " client-view-header" : ""}`}
          style={{
            borderColor: "var(--platform-border, var(--client-border, #e2e8f0))",
            background: "var(--platform-bg-elevated, var(--client-header-bg, transparent))",
          }}
        >
          <div className="flex min-w-0 flex-1 items-center gap-3">
            {backHref && (
              <Link
                href={backHref}
                className="inline-flex items-center gap-1.5 text-sm font-medium"
                style={{ color: "var(--platform-fg-muted, var(--client-text-muted, #64748b))" }}
              >
                <ArrowLeft className="h-4 w-4" />
                {backLabel}
              </Link>
            )}
            <h1 className="truncate text-lg font-semibold" style={{ color: "var(--platform-fg, var(--client-text, #0f172a))" }}>
              {title}
            </h1>
          </div>
        </header>
      )}

      <div className={useClientTheme ? "client-view-body flex flex-1 flex-col min-h-0" : "flex flex-1 flex-col min-h-0"}>
      {globalFilters.length > 0 && (
        <div
          className="flex flex-shrink-0 flex-wrap items-center gap-2 px-4 py-2"
          style={{ background: "var(--platform-bg, var(--client-bg, #f8fafc))", borderBottom: "1px solid var(--platform-border)" }}
        >
          {globalFilters.map((gf) => (
            <div key={gf.id} className="flex items-center gap-1.5 text-sm">
              <span style={{ color: "var(--platform-fg-muted)" }}>{gf.field}</span>
              {(gf as any).inputType === "select" && Array.isArray((gf as any).distinctValues) ? (
                <select
                  className="rounded-md border px-2 py-1 text-sm"
                  style={{ borderColor: "var(--platform-border)" }}
                  value={String(filterValues[gf.id] ?? "")}
                  onChange={(e) => setFilterValues((prev) => ({ ...prev, [gf.id]: e.target.value }))}
                >
                  <option value="">Todos</option>
                  {((gf as any).distinctValues as unknown[]).map((v) => (
                    <option key={String(v)} value={String(v)}>{String(v)}</option>
                  ))}
                </select>
              ) : (
                <input
                  type={(gf as any).inputType === "number" ? "number" : (gf as any).inputType === "date" ? "date" : "text"}
                  className="rounded-md border px-2 py-1 text-sm w-32"
                  style={{ borderColor: "var(--platform-border)" }}
                  value={String(filterValues[gf.id] ?? "")}
                  onChange={(e) => setFilterValues((prev) => ({ ...prev, [gf.id]: (gf as any).inputType === "number" ? e.target.valueAsNumber : e.target.value }))}
                />
              )}
            </div>
          ))}
        </div>
      )}

      <div className={`flex-1 overflow-auto p-4 min-h-0${useClientTheme ? " client-view-canvas" : ""}`}>
        {!etlData && !initialWidgets?.length ? (
          <div className="flex h-48 items-center justify-center" style={{ color: "var(--platform-fg-muted)" }}>
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : placements.length === 0 ? (
          <div className="flex h-48 items-center justify-center text-sm" style={{ color: "var(--platform-fg-muted)" }}>
            No hay widgets en este dashboard
          </div>
        ) : (
          <div
            className={`grid gap-4${useClientTheme ? " client-view-grid" : ""}`}
            style={{
              gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
            }}
          >
            {placements.map(({ widget, row, col, span }) => (
              <div
                key={widget.id}
                className={useClientTheme ? "client-view-widget" : undefined}
                style={{
                  gridColumn: `span ${span}`,
                  gridRow: row + 1,
                  display: "flex",
                  flexDirection: "column",
                  minHeight: 0,
                }}
              >
                <DashboardWidgetRenderer
                  widget={{
                    ...widget,
                    chartStyle: widget.chartStyle ?? buildChartStyleFromAgg(widget.aggregationConfig),
                  } as DashboardWidgetRendererWidget}
                  isLoading={widget.isLoading === true}
                  filterValue={filterValues[widget.id]}
                  onFilterChange={handleFilterChange}
                  minHeight={widget.minHeight ?? 240}
                  darkChartTheme={useClientTheme}
                />
              </div>
            ))}
          </div>
        )}
      </div>
      </div>
    </div>
  );
}

export default DashboardViewer;
