"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useDashboardEtlData } from "@/hooks/useDashboardEtlData";
import {
  type DashboardTheme,
  DEFAULT_DASHBOARD_THEME,
  mergeTheme,
} from "@/types/dashboard";
import { DashboardWidgetRenderer, type DashboardWidgetRendererWidget } from "./DashboardWidgetRenderer";
import { buildChartConfig, getProcessedRowsForChart } from "@/lib/dashboard/buildChartConfig";
import { safeJsonResponse } from "@/lib/safe-json-response";
import { buildChartMetricStyles, buildChartStyleFromAgg, resolveDarkChartTheme } from "@/lib/dashboard/widgetRenderParity";
import { AlertTriangle, ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

// Types compatible with persisted layout and API
type AggregationFilter = {
  id: string;
  field: string;
  operator: string;
  value: unknown;
  convertToNumber?: boolean;
  inputType?: "text" | "select" | "multi" | "search" | "number" | "date";
  distinctValues?: unknown[];
  applyTo?: "all" | "selected";
  applyToWidgetIds?: string[];
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
  chartSortByMetric?: string;
  chartAxisOrder?: string;
  chartNumberFormat?: string;
  chartValueType?: string;
  chartValueScale?: string;
  chartCurrencySymbol?: string;
  chartThousandSep?: boolean;
  chartDecimals?: number;
  /** Mapeo valor en datos → texto a mostrar en etiquetas del gráfico (eje X, porciones pie/dona, series por dimensión). */
  chartLabelOverrides?: Record<string, string>;
  /** Formato por métrica (clave = chartYAxes key). */
  chartMetricFormats?: Record<string, { valueType?: string; valueScale?: string; currencySymbol?: string; decimals?: number; thousandSep?: boolean }>;
  /** Combo: alinear eje derecho con el izquierdo (normalizar 0-1) para comparación visual. */
  chartComboSyncAxes?: boolean;
  showDataLabels?: boolean;
  chartScaleMode?: "auto" | "dataset" | "custom";
  chartScaleMin?: string | number;
  chartScaleMax?: string | number;
  chartAxisStep?: string | number;
  chartScalePerMetric?: Record<string, { min?: number; max?: number; step?: number }>;
  chartAxisXVisible?: boolean;
  chartAxisYVisible?: boolean;
  chartStackBySeries?: boolean;
  dateGroupByGranularity?: "day" | "week" | "month" | "quarter" | "semester" | "year";
  geoHints?: {
    countryField?: string;
    provinceField?: string;
    cityField?: string;
    addressField?: string;
    latField?: string;
    lonField?: string;
  };
};

function isInvalidIdentifierValue(value: unknown): boolean {
  if (value == null) return true;
  const normalized = String(value).trim().toLowerCase();
  return normalized === "" || normalized === "undefined" || normalized === "null";
}

function sanitizeDimensionList(values: unknown[]): string[] {
  return values
    .map((value) => String(value ?? "").trim())
    .filter((value) => !isInvalidIdentifierValue(value));
}

const WIDGET_FETCH_TIMEOUT_MS = 25000;

async function fetchWithTimeout(input: string, init: RequestInit, timeoutMs = WIDGET_FETCH_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

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
  /** Misma semántica que AdminDashboardStudio: pestaña del lienzo */
  pageId?: string;
};

function sameWidgetPage(
  a: Widget,
  b: Widget,
  pageLayout: { firstPageId: string; activePageId: string; pagesMeta?: { id: string; name: string }[] } | null
): boolean {
  if (!pageLayout) return true;
  const pa = a.pageId ?? pageLayout.firstPageId;
  const pb = b.pageId ?? pageLayout.firstPageId;
  return pa === pb;
}

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
  const [globalFilterDistinctValues, setGlobalFilterDistinctValues] = useState<Record<string, unknown[]>>({});
  /** Si viene del layout guardado: misma página activa que AdminDashboardStudio (vista previa = lienzo). */
  const [pageLayout, setPageLayout] = useState<{
    firstPageId: string;
    activePageId: string;
    pagesMeta?: { id: string; name: string }[];
  } | null>(null);
  const stateRef = useRef({ widgets, setWidgets });

  const { data: etlData, error: etlDataError } = useDashboardEtlData(dashboardId, apiEndpoints?.etlData);

  const themeMerged = useMemo(() => mergeTheme(dashboardTheme), [dashboardTheme]);
  const accentColor = themeMerged.accentColor ?? DEFAULT_DASHBOARD_THEME.accentColor ?? "#0ea5e9";

  useEffect(() => {
    stateRef.current.widgets = widgets;
  }, [widgets]);

  useEffect(() => {
    if (initialWidgets?.length) {
      setPageLayout(null);
      setWidgets(initialWidgets);
      if (initialTitle) setTitle(initialTitle);
      if (initialGlobalFilters) {
        setGlobalFilters(initialGlobalFilters);
        const initialFv: Record<string, unknown> = {};
        for (const gf of initialGlobalFilters) {
          const v = (gf as AggregationFilter & { value?: unknown }).value;
          if (v === "" || v === null || v === undefined) continue;
          if (Array.isArray(v) && v.length === 0) continue;
          initialFv[gf.id] = v;
        }
        setFilterValues(initialFv);
      }
      return;
    }
    const dashboard = (etlData as any)?.dashboard;
    if (!dashboard) return;
    const layout = dashboard.layout as {
      widgets?: Widget[];
      theme?: Partial<DashboardTheme>;
      pages?: { id: string; name?: string }[];
      activePageId?: string;
    } | undefined;
    const pages =
      Array.isArray(layout?.pages) && layout!.pages!.length > 0
        ? layout!.pages!
        : [{ id: "page-1" }];
    const firstPageId = String(pages[0]?.id ?? "page-1");
    const activePageId = String(layout?.activePageId ?? firstPageId);
    const pagesMeta = pages.map((p, i) => ({
      id: String((p as { id?: string }).id ?? `page-${i}`),
      name: String((p as { name?: string }).name ?? "").trim() || `Página ${i + 1}`,
    }));
    setPageLayout({ firstPageId, activePageId, pagesMeta });
    const rawWidgets = Array.isArray(layout?.widgets) ? layout.widgets : [];
    const loadedWidgets = rawWidgets.map((w, i) => {
      const base = w as Widget;
      return {
        ...base,
        gridOrder: base.gridOrder ?? i,
        pageId: base.pageId ?? firstPageId,
      };
    });
    const loadedTheme = layout?.theme && typeof layout.theme === "object" ? layout.theme : {};
    setWidgets(loadedWidgets);
    setTitle((dashboard.title as string) || "Dashboard");
    setDashboardTheme((prev) => ({ ...DEFAULT_DASHBOARD_THEME, ...prev, ...loadedTheme }));
    const gfs = Array.isArray(dashboard.global_filters_config)
      ? (dashboard.global_filters_config as AggregationFilter[])
      : [];
    setGlobalFilters(gfs);
    const initialFv: Record<string, unknown> = {};
    for (const gf of gfs) {
      const v = (gf as AggregationFilter & { value?: unknown }).value;
      if (v === "" || v === null || v === undefined) continue;
      if (Array.isArray(v) && v.length === 0) continue;
      initialFv[gf.id] = v;
    }
    setFilterValues(initialFv);
  }, [etlData, initialWidgets, initialTitle, initialGlobalFilters]);

  // Cargar distinct values para cada filtro global; si el campo es dimensión semántica, usar tabla y columna física de la fuente primaria
  useEffect(() => {
    const dataSources = (etlData as any)?.dataSources as { id: string; schema?: string; tableName?: string; fields?: { date?: string[] } }[] | undefined;
    const datasetDimensions = (etlData as { datasetDimensions?: Record<string, Record<string, string>>; primarySourceId?: string })?.datasetDimensions;
    const primarySourceId = (etlData as { primarySourceId?: string })?.primarySourceId ?? dataSources?.[0]?.id;
    let primaryTableName: string | undefined;
    if (dataSources?.[0]?.tableName) {
      primaryTableName = `${dataSources[0].schema ?? "etl_output"}.${dataSources[0].tableName}`;
    } else {
      const name = (etlData as any)?.etlData?.name;
      primaryTableName = name && String(name).includes(".") ? name : name ? `etl_output.${name}` : undefined;
    }
    if (!primaryTableName || !globalFilters.length) return;
    const distinctUrl = apiEndpoints?.distinctValues ?? "/api/dashboard/distinct-values";
    const selectFilters = globalFilters.filter(
      (gf) =>
        gf.field &&
        ((gf as any).inputType === "select" ||
          (gf as any).inputType === "multi" ||
          (gf as any).filterType === "single" ||
          (gf as any).filterType === "multi")
    );
    let cancelled = false;
    const primaryDateFields = dataSources?.[0]?.fields?.date ?? (etlData as { fields?: { date?: string[] } })?.fields?.date ?? [];
    (async () => {
      for (const gf of selectFilters) {
        if (cancelled) break;
        try {
          const physicalField =
            datasetDimensions?.[gf.field!]?.[primarySourceId!] ?? gf.field!;
          const isDateField =
            physicalField &&
            primaryDateFields.some((d: string) => (d || "").toLowerCase() === (physicalField || "").toLowerCase());
          const body: { tableName: string; field: string; limit: number; transform?: string } = {
            tableName: primaryTableName,
            field: physicalField,
            limit: 200,
          };
          if (isDateField) body.transform = "YEAR";
          const res = await fetch(distinctUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          if (!res.ok) continue;
          const data = await safeJsonResponse(res);
          if (cancelled) break;
          const values = Array.isArray(data) ? data : (data as { values?: unknown[] })?.values;
          if (Array.isArray(values)) {
            setGlobalFilterDistinctValues((prev) => ({ ...prev, [gf.id]: values }));
          }
        } catch {
          // ignore per-field errors
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [etlData, globalFilters, apiEndpoints?.distinctValues]);

  const getTableNameForWidget = useCallback(
    (widget: Widget): string | null => {
      const dataSources = (etlData as { dataSources?: { id: string; schema?: string; tableName: string }[] })?.dataSources;
      if (dataSources?.length) {
        const primarySourceId = (etlData as { primarySourceId?: string })?.primarySourceId;
        const sourceId = widget.dataSourceId ?? primarySourceId ?? dataSources[0]?.id;
        const src = dataSources.find((s) => s.id === sourceId) ?? dataSources[0];
        if (src) return `${src.schema ?? "etl_output"}.${src.tableName}`;
      }
      if (widget.source?.table) return widget.source.table;
      if ((etlData as any)?.etlData?.name) return (etlData as any).etlData.name;
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

      setWidgets((prev) => prev.map((w) => (w.id === widgetId ? { ...w, isLoading: true } : w)));
      const safetyTimeout = setTimeout(() => {
        setWidgets((prev) => prev.map((w) =>
          w.id === widgetId && w.isLoading ? { ...w, isLoading: false } : w
        ));
      }, 30000);

      try {
      const aggConfig = widget.aggregationConfig;
      const fieldsWithWidgets = new Set(
        widgets
          .filter(
            (w) =>
              w.type === "filter" &&
              (w as any).filterConfig?.field &&
              sameWidgetPage(w, widget, pageLayout)
          )
          .map((w) => (w as any).filterConfig!.field)
      );
      const widgetFilters: AggregationFilter[] = widgets
        .filter(
          (w) =>
            w.type === "filter" &&
            (w as any).filterConfig &&
            sameWidgetPage(w, widget, pageLayout) &&
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
      // Dataset del Dashboard: traducir dimensión semántica a columna física por fuente del widget; si no hay mapeo para esta fuente, no aplicar el filtro
      const datasetDimensions = (etlData as { datasetDimensions?: Record<string, Record<string, string>> })?.datasetDimensions;
      const dataSourcesList = (etlData as { dataSources?: { id: string }[]; primarySourceId?: string })?.dataSources;
      const widgetSourceId = widget.dataSourceId ?? (etlData as { primarySourceId?: string })?.primarySourceId ?? dataSourcesList?.[0]?.id;
      const resolvePhysicalField = (semanticOrPhysicalField: string): string | null => {
        if (!semanticOrPhysicalField) return null;
        const bySource = datasetDimensions?.[semanticOrPhysicalField];
        if (bySource && widgetSourceId && bySource[widgetSourceId]) return bySource[widgetSourceId];
        return semanticOrPhysicalField;
      };
      // Filtros globales efectivos: usar filterValues[gf.id]; respetar applyTo/applyToWidgetIds; si el campo es semántico y esta fuente no tiene mapeo, omitir el filtro
      const effectiveGlobalFilters: AggregationFilter[] = (widget as any).excludeGlobalFilters
        ? []
        : (globalFilters
            .filter((f) => {
              if ((f as AggregationFilter).applyTo === "selected" && Array.isArray((f as AggregationFilter).applyToWidgetIds) && (f as AggregationFilter).applyToWidgetIds!.length > 0)
                return (f as AggregationFilter).applyToWidgetIds!.includes(widgetId);
              return true;
            })
            .filter((f) => !fieldsWithWidgets.has(f.field))
            .map((f): AggregationFilter | null => {
              const userValue = filterValues[f.id];
              const isEmpty =
                userValue === "" ||
                userValue === null ||
                userValue === undefined ||
                (Array.isArray(userValue) && userValue.length === 0);
              if (isEmpty) return null;
              const isSemantic = datasetDimensions && f.field in datasetDimensions;
              if (isSemantic && !datasetDimensions[f.field]?.[widgetSourceId!]) return null;
              const physicalField = resolvePhysicalField(f.field);
              const rawOp = f.operator || "=";
              const inputT = (f as AggregationFilter & { inputType?: string }).inputType;
              const useIn =
                rawOp === "IN" ||
                (inputT === "multi" && Array.isArray(userValue) && userValue.length > 0);
              const op = useIn ? "IN" : rawOp;
              const value: unknown =
                op === "IN"
                  ? Array.isArray(userValue)
                    ? userValue
                    : [userValue]
                  : userValue;
              return {
                id: f.id,
                field: physicalField ?? f.field,
                operator: op,
                value,
                convertToNumber: f.convertToNumber,
              };
            })
            .filter((f): f is AggregationFilter => f != null));
      const mappedAggFilters: AggregationFilter[] = (aggConfig?.filters ?? []).map((f) => ({
        ...f,
        field: (resolvePhysicalField(f.field) ?? f.field) as string,
      }));
      const rawFilters = [...effectiveGlobalFilters, ...widgetFilters, ...mappedAggFilters];
      const preparedFilters = rawFilters.map((f) => ({
        field: f.field,
        operator: f.operator || "=",
        value: f.value,
        cast: f.convertToNumber ? "numeric" : undefined,
        ...(f.id != null && { id: f.id }),
      }));

        let dataArray: Record<string, unknown>[] = [];
        let resolvedChartType: string = widget.type;
        if (aggConfig?.enabled && aggConfig.metrics?.length > 0) {
          const dataSources = (etlData as any)?.dataSources as { id: string; etlId: string; savedMetrics?: unknown[] }[] | undefined;
          const widgetSource = widget.dataSourceId && dataSources?.length
            ? dataSources.find((s) => s.id === widget.dataSourceId)
            : dataSources?.[0];
          const widgetEtlId = widgetSource?.etlId ?? (etlData as any)?.etl?.id ?? etlId;
          const savedMetricsList = widgetSource?.savedMetrics ?? (etlData as any)?.savedMetrics ?? [];
          const dimensionsArrayRaw = (aggConfig as any).dimensions?.length
            ? (aggConfig as any).dimensions
            : [aggConfig.dimension, (aggConfig as any).dimension2].filter(Boolean);
          const dimensionsArray = sanitizeDimensionList(
            dimensionsArrayRaw.map((d: unknown) => {
              const s = String(d ?? "").trim();
              if (!s) return "";
              return resolvePhysicalField(s) ?? s;
            })
          );
          const safeMetrics = aggConfig.metrics
            .map(({ id, ...rest }) => {
              const isFormula = String(rest.func ?? "").toUpperCase() === "FORMULA";
              let fieldOut: string | undefined;
              if (isFormula) {
                fieldOut = isInvalidIdentifierValue(rest.field) ? undefined : String(rest.field).trim();
              } else {
                const raw = isInvalidIdentifierValue(rest.field) ? undefined : String(rest.field).trim();
                fieldOut = raw ? (resolvePhysicalField(raw) ?? raw) : undefined;
              }
              return {
                ...rest,
                field: fieldOut,
                alias: String(rest.alias ?? "").trim() || undefined,
                cast: rest.numericCast && rest.numericCast !== "none" ? rest.numericCast : undefined,
              };
            })
            .filter((metric) => String(metric.func ?? "").toUpperCase() === "FORMULA" || !isInvalidIdentifierValue(metric.field));
          if (safeMetrics.length === 0) {
            setWidgets((prev) =>
              prev.map((w) =>
                w.id === widgetId ? { ...w, rows: [], config: { labels: [], datasets: [] }, isLoading: false } : w
              )
            );
            return;
          }
          const metricFieldNames = new Set(
            safeMetrics
              .filter((m) => (m as any).func !== "FORMULA" && m.field != null && String(m.field).trim() !== "")
              .map((m) => String(m.field).trim().toLowerCase())
          );
          const widgetMetricId = String((widget as { metricId?: unknown }).metricId ?? "").trim();
          const widgetMetricIds = Array.isArray((widget as { metricIds?: unknown }).metricIds)
            ? ((widget as { metricIds?: unknown[] }).metricIds ?? []).map((mid) => String(mid ?? "").trim()).filter(Boolean)
            : [];
          const idSet = new Set([widgetMetricId, ...widgetMetricIds].filter(Boolean));
          const savedByLinkedIds = Array.isArray(savedMetricsList)
            ? savedMetricsList.filter((s: any) => idSet.has(String(s.id ?? "").trim()))
            : [];
          const savedMetricsForBody = (savedByLinkedIds.length > 0
            ? savedByLinkedIds
            : Array.isArray(savedMetricsList)
              ? savedMetricsList.filter(
                  (s: any) => (s?.name ?? "").trim() && metricFieldNames.has(String(s.name).trim().toLowerCase())
                )
              : []
          ).map((s: any) => {
            const first = s?.aggregationConfig?.metrics?.[0] ?? s?.metric;
            const name = String(s?.name ?? "").trim();
            if (!first) return { name, field: name, func: "SUM", alias: name };
            const field = String(first?.field ?? "").trim() || name;
            const func = String(first?.func ?? "SUM");
            const alias = String(first?.alias ?? name);
            const expression = first?.expression;
            return {
              name,
              field,
              func,
              alias,
              ...(expression && String(expression).trim() ? { expression: String(expression).trim() } : {}),
            };
          });
          resolvedChartType = String((aggConfig?.chartType as string | undefined) ?? "").trim() || widget.type;
          const dimForBody = isInvalidIdentifierValue(aggConfig.dimension)
            ? undefined
            : (resolvePhysicalField(aggConfig.dimension!) ?? aggConfig.dimension);
          const chartXForBody = isInvalidIdentifierValue(aggConfig.chartXAxis)
            ? undefined
            : (resolvePhysicalField(aggConfig.chartXAxis!) ?? aggConfig.chartXAxis);
          const dateDimForBody = (aggConfig as { dateDimension?: string }).dateDimension
            ? (resolvePhysicalField((aggConfig as { dateDimension?: string }).dateDimension!) ??
              (aggConfig as { dateDimension?: string }).dateDimension)
            : undefined;
          const dashLayout = (etlData as any)?.dashboard?.layout as
            | { datasetConfig?: { derivedColumns?: unknown[] } }
            | undefined;
          const derivedFromDash = Array.isArray(dashLayout?.datasetConfig?.derivedColumns)
            ? dashLayout!.datasetConfig!.derivedColumns!
            : [];

          const bodyPayload: Record<string, unknown> = {
            tableName: fullTableName,
            dimension: dimForBody,
            chartType: resolvedChartType,
            chartXAxis: chartXForBody,
            metrics: safeMetrics,
            filters: preparedFilters,
            orderBy: aggConfig.orderBy,
            limit: aggConfig.limit ?? 1000,
            etlId: widgetEtlId,
            cumulative: (aggConfig as { cumulative?: string }).cumulative ?? "none",
          };
          if (aggConfig.geoHints) bodyPayload.geoHints = aggConfig.geoHints;
          if (dimensionsArray.length > 0) bodyPayload.dimensions = dimensionsArray;
          if ((aggConfig as any).comparePeriod) bodyPayload.comparePeriod = (aggConfig as any).comparePeriod;
          if (dateDimForBody) bodyPayload.dateDimension = dateDimForBody;
          if (savedMetricsForBody.length > 0) bodyPayload.savedMetrics = savedMetricsForBody;
          if (derivedFromDash.length > 0) bodyPayload.derivedColumns = derivedFromDash;
          const primaryDim =
            dimensionsArray[0] ??
            (isInvalidIdentifierValue(aggConfig.dimension) ? undefined : dimForBody);
          const dateFields = (widgetSource as { fields?: { date?: string[] } })?.fields?.date ?? (etlData as { fields?: { date?: string[] } })?.fields?.date ?? [];
          const isDateDim = primaryDim && dateFields.some((d: string) => (d || "").toLowerCase() === (primaryDim || "").toLowerCase());
          const dateGroupByGranularity = (aggConfig as { dateGroupByGranularity?: string }).dateGroupByGranularity;
          const isTemporalAxis =
            !!dateGroupByGranularity ||
            !!(primaryDim && (aggConfig as { dateDimension?: string }).dateDimension && String(primaryDim).trim().toLowerCase() === String((aggConfig as { dateDimension?: string }).dateDimension ?? "").trim().toLowerCase()) ||
            !!isDateDim;
          const shouldApplyRanking =
            !!(aggConfig as { chartRankingEnabled?: boolean }).chartRankingEnabled &&
            Number((aggConfig as { chartRankingTop?: number }).chartRankingTop ?? 0) > 0 &&
            !isTemporalAxis;
          if (shouldApplyRanking) {
            bodyPayload.orderBy = {
              field: (aggConfig as { chartRankingMetric?: string }).chartRankingMetric || (safeMetrics[0] as { alias?: string } | undefined)?.alias,
              direction: "DESC",
            };
            bodyPayload.limit = (aggConfig as { chartRankingTop?: number }).chartRankingTop;
          }
          if (dateGroupByGranularity && primaryDim) bodyPayload.dateGroupBy = { field: primaryDim, granularity: dateGroupByGranularity };
          const dateRangeFilter = (aggConfig as { dateRangeFilter?: { field: string; last?: number; unit?: "days" | "months"; from?: string; to?: string } }).dateRangeFilter;
          if (dateRangeFilter?.field) {
            bodyPayload.dateRangeFilter = {
              ...dateRangeFilter,
              field: resolvePhysicalField(dateRangeFilter.field) ?? dateRangeFilter.field,
            };
          }

          const url = apiEndpoints?.aggregateData ?? "/api/dashboard/aggregate-data";
          const res = await fetchWithTimeout(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(bodyPayload),
          });
          const aggData = await safeJsonResponse(res);
          if (!res.ok) throw new Error(aggData.error || "Error aggregate");
          dataArray = (Array.isArray(aggData) ? aggData : (aggData as { rows?: Record<string, unknown>[] })?.rows ?? []) as Record<string, unknown>[];
        } else {
          const url = apiEndpoints?.rawData ?? "/api/dashboard/raw-data";
          const res = await fetchWithTimeout(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              tableName: fullTableName,
              filters: preparedFilters,
              limit: aggConfig?.limit ?? 5000,
            }),
          });
          const rawData = await safeJsonResponse(res);
          if (!res.ok) throw new Error(rawData.error || "Error raw");
          dataArray = (Array.isArray(rawData) ? rawData : (rawData as { rows?: Record<string, unknown>[] })?.rows ?? []) as Record<string, unknown>[];
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
        const config = buildChartConfig(dataArray, widget, accentColor);
        const rowsForWidget = resolvedChartType === "table" ? getProcessedRowsForChart(dataArray, widget) : dataArray;

        setWidgets((prev) =>
          prev.map((w) =>
            w.id === widgetId
              ? {
                  ...w,
                  config: config ?? { labels: [], datasets: [] },
                  rows: rowsForWidget,
                  columns: columnsDetected,
                  isLoading: false,
                }
              : w
          )
        );
      } catch {
        setWidgets((prev) => prev.map((w) => (w.id === widgetId ? { ...w, isLoading: false } : w)));
      } finally {
        clearTimeout(safetyTimeout);
      }
    },
    [widgets, etlData, globalFilters, filterValues, apiEndpoints, getTableNameForWidget, isPublic, accentColor, pageLayout]
  );

  const reloadAll = useCallback(() => {
    widgets.forEach((w) => {
      if (w.type === "filter") return;
      if (pageLayout) {
        const pid = w.pageId ?? pageLayout.firstPageId;
        if (pid !== pageLayout.activePageId) return;
      }
      loadDataForWidget(w.id);
    });
  }, [widgets, loadDataForWidget, pageLayout]);

  useEffect(() => {
    if (!etlData || widgets.length === 0) return;
    const timer = setTimeout(() => {
      stateRef.current.widgets.forEach((w) => {
        if (w.type === "filter") return;
        if (pageLayout) {
          const pid = w.pageId ?? pageLayout.firstPageId;
          if (pid !== pageLayout.activePageId) return;
        }
        loadDataForWidget(w.id);
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [filterValues, loadDataForWidget, etlData, pageLayout]);

  const initialLoadedRef = useRef(false);
  useEffect(() => {
    if (!initialLoadedRef.current && widgets.length > 0 && etlData) {
      initialLoadedRef.current = true;
      reloadAll();
    }
  }, [widgets, etlData, reloadAll]);

  useEffect(() => {
    initialLoadedRef.current = false;
    setPageLayout(null);
  }, [dashboardId]);

  const handleFilterChange = useCallback((widgetId: string, value: unknown) => {
    setFilterValues((prev) => ({ ...prev, [widgetId]: value }));
  }, []);

  const orderedWidgets = useMemo(() => {
    let list = widgets;
    if (pageLayout) {
      list = widgets.filter((w) => (w.pageId ?? pageLayout.firstPageId) === pageLayout.activePageId);
    }
    const hasOrder = list.some((w) => typeof w.gridOrder === "number");
    if (hasOrder) return [...list].sort((a, b) => (a.gridOrder ?? 0) - (b.gridOrder ?? 0));
    return list;
  }, [widgets, pageLayout]);
  const placements = useMemo(() => computeGridPlacements(orderedWidgets), [orderedWidgets]);

  // Filtros dinámicos: por cada widget, etiquetas de filtros globales que tienen valor pero no aplican a este gráfico (no contiene esa columna)
  const nonApplicableFilterLabelsByWidget = useMemo(() => {
    const dataSources = (etlData as any)?.dataSources as { id: string; fields?: { all?: string[] } }[] | undefined;
    const datasetDimensions = (etlData as { datasetDimensions?: Record<string, Record<string, string>>; primarySourceId?: string })?.datasetDimensions;
    const primarySourceId = (etlData as { primarySourceId?: string })?.primarySourceId ?? dataSources?.[0]?.id;
    const out: Record<string, string[]> = {};
    if (!dataSources?.length || !globalFilters.length) return out;
    for (const widget of orderedWidgets) {
      if (widget.type === "filter" || (widget as Widget).excludeGlobalFilters) continue;
      const widgetSourceId = widget.dataSourceId ?? primarySourceId ?? dataSources[0]?.id;
      const source = dataSources.find((s) => s.id === widgetSourceId) ?? dataSources[0];
      const sourceFieldsAll = (source?.fields?.all ?? []).map((c: string) => (c || "").toLowerCase());
      const resolvePhysicalField = (semanticOrPhysical: string) => {
        if (!semanticOrPhysical) return "";
        const bySource = datasetDimensions?.[semanticOrPhysical];
        if (bySource && widgetSourceId && bySource[widgetSourceId]) return bySource[widgetSourceId];
        return semanticOrPhysical;
      };
      const labels: string[] = [];
      for (const gf of globalFilters) {
        const userValue = filterValues[gf.id];
        const isEmpty =
          userValue === "" ||
          userValue === null ||
          userValue === undefined ||
          (Array.isArray(userValue) && userValue.length === 0);
        if (isEmpty) continue;
        const scopeApplies =
          (gf as AggregationFilter).applyTo !== "selected" ||
          !Array.isArray((gf as AggregationFilter).applyToWidgetIds) ||
          (gf as AggregationFilter).applyToWidgetIds!.length === 0 ||
          (gf as AggregationFilter).applyToWidgetIds!.includes(widget.id);
        if (!scopeApplies) continue;
        const physicalField = resolvePhysicalField(gf.field);
        const applies =
          physicalField &&
          sourceFieldsAll.some((c: string) => c === (physicalField || "").toLowerCase());
        if (!applies) labels.push((gf as any).label || gf.field);
      }
      if (labels.length > 0) out[widget.id] = labels;
    }
    return out;
  }, [etlData, orderedWidgets, globalFilters, filterValues]);

  const rootClassName = variant === "admin" ? "admin-dashboard-view gap-5" : "gap-0";
  /** Tema cliente: no depende de hideHeader (vista previa admin oculta el h1 pero mantiene branding). */
  const useClientTheme = variant === "default" && !backHref;
  // Mismo criterio que AdminDashboardStudio (MetricBlock): fallback true para paridad del lienzo.
  const darkChartTheme = useMemo(() => resolveDarkChartTheme(themeMerged, true), [themeMerged]);
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
      {pageLayout?.pagesMeta && pageLayout.pagesMeta.length > 1 && (
        <div
          role="tablist"
          aria-label="Páginas del dashboard"
          className={`flex flex-shrink-0 flex-wrap gap-1 border-b px-4 py-2${useClientTheme ? " client-view-page-tabs" : ""}`}
          style={{
            borderColor: "var(--platform-border, var(--client-border, #e2e8f0))",
            background: "var(--platform-bg-elevated, rgba(255,255,255,0.03))",
          }}
        >
          {pageLayout.pagesMeta.map((p) => {
            const active = pageLayout.activePageId === p.id;
            return (
              <button
                key={p.id}
                type="button"
                role="tab"
                aria-selected={active}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  active
                    ? "bg-[var(--client-accent-soft,rgba(45,212,191,0.12))] text-[var(--client-accent,#2dd4bf)]"
                    : "text-[var(--platform-fg-muted,var(--client-text-muted))] hover:bg-white/5 hover:text-[var(--platform-fg,var(--client-text))]"
                }`}
                onClick={() =>
                  setPageLayout((prev) => (prev ? { ...prev, activePageId: p.id } : null))
                }
              >
                {p.name}
              </button>
            );
          })}
        </div>
      )}
      {globalFilters.length > 0 && (
        <div
          className="flex flex-shrink-0 flex-wrap items-center gap-4 px-4 py-2"
          style={{ background: "var(--platform-bg, var(--client-bg, #f8fafc))", borderBottom: "1px solid var(--platform-border)" }}
        >
          {globalFilters.map((gf) => {
            const label = (gf as any).label || gf.field;
            const options = (globalFilterDistinctValues[gf.id] ?? (gf as any).distinctValues) as unknown[] | undefined;
            const inputType = (gf as AggregationFilter & { inputType?: string }).inputType;
            const isMulti = (gf.operator || "=") === "IN" || inputType === "multi";
            const selectedArray = isMulti
              ? (Array.isArray(filterValues[gf.id]) ? filterValues[gf.id] : filterValues[gf.id] != null && filterValues[gf.id] !== "" ? [filterValues[gf.id]] : []) as string[]
              : [];
            const hasOptions = Array.isArray(options) && options.length > 0;

            return (
              <div key={gf.id} className="flex flex-col gap-1.5 text-sm">
                <span style={{ color: "var(--platform-fg-muted)" }}>{label}</span>
                {isMulti && hasOptions ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs rounded-md"
                      style={{ borderColor: "var(--platform-border)" }}
                      onClick={() => setFilterValues((prev) => ({ ...prev, [gf.id]: [...options].map(String) }))}
                    >
                      Seleccionar todo
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs rounded-md"
                      style={{ borderColor: "var(--platform-border)" }}
                      onClick={() => setFilterValues((prev) => ({ ...prev, [gf.id]: [] }))}
                    >
                      Deseleccionar todo
                    </Button>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 max-h-24 overflow-y-auto">
                      {options.map((v) => {
                        const s = String(v);
                        const checked = selectedArray.includes(s);
                        return (
                          <label key={s} className="flex items-center gap-1.5 cursor-pointer whitespace-nowrap" style={{ color: "var(--platform-fg)" }}>
                            <input
                              type="checkbox"
                              className="rounded border"
                              style={{ borderColor: "var(--platform-border)" }}
                              checked={checked}
                              onChange={(e) => {
                                const next = e.target.checked
                                  ? [...selectedArray, s]
                                  : selectedArray.filter((x) => x !== s);
                                setFilterValues((prev) => ({ ...prev, [gf.id]: next }));
                              }}
                            />
                            <span className="text-xs">{s}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ) : (gf as any).operator === "YEAR_MONTH" ? (
                  <input
                    type="month"
                    className="rounded-md border px-2 py-1 text-sm w-36"
                    style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}
                    value={String(filterValues[gf.id] ?? "").slice(0, 7)}
                    onChange={(e) =>
                      setFilterValues((prev) => ({ ...prev, [gf.id]: e.target.value || undefined }))
                    }
                  />
                ) : (gf as any).inputType === "select" && hasOptions ? (
                  <select
                    className="rounded-md border px-2 py-1 text-sm min-w-[8rem]"
                    style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}
                    value={String(filterValues[gf.id] ?? "")}
                    onChange={(e) => setFilterValues((prev) => ({ ...prev, [gf.id]: e.target.value }))}
                  >
                    <option value="">Todos</option>
                    {(options as unknown[]).map((v) => (
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
            );
          })}
        </div>
      )}

      <div className={`flex-1 overflow-auto p-4 min-h-0${useClientTheme ? " client-view-canvas" : ""}`}>
        {!etlData && !initialWidgets?.length ? (
          etlDataError ? (
            <div className="flex h-48 items-center justify-center text-sm" style={{ color: "var(--platform-fg-muted)" }}>
              {etlDataError}
            </div>
          ) : (
          <div className="flex h-48 items-center justify-center" style={{ color: "var(--platform-fg-muted)" }}>
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
          )
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
            {placements.map(({ widget, row, col, span }) => {
              const nonApplicableLabels = nonApplicableFilterLabelsByWidget[widget.id] ?? [];
              const filterWarningTooltip =
                nonApplicableLabels.length > 0
                  ? `El filtro${nonApplicableLabels.length === 1 ? "" : "s"} "${nonApplicableLabels.join('", "')}" no afecta a este gráfico porque no utiliza ese campo.`
                  : undefined;
              return (
                <div
                  key={widget.id}
                  className={useClientTheme ? "client-view-widget" : undefined}
                  style={{
                    gridColumn: `span ${span}`,
                    gridRow: row + 1,
                    display: "flex",
                    flexDirection: "column",
                    minHeight: 0,
                    position: "relative",
                  }}
                >
                  {filterWarningTooltip && (
                    <div
                      className="absolute right-2 top-2 z-10 flex shrink-0"
                      title={filterWarningTooltip}
                      style={{ color: "var(--platform-fg-muted)" }}
                    >
                      <AlertTriangle className="h-4 w-4" aria-hidden />
                    </div>
                  )}
                  <DashboardWidgetRenderer
                    widget={{
                      ...widget,
                      chartStyle: widget.chartStyle ?? buildChartStyleFromAgg(widget.aggregationConfig),
                      chartMetricStyles: buildChartMetricStyles(widget.aggregationConfig),
                    } as DashboardWidgetRendererWidget}
                    isLoading={widget.isLoading === true}
                    filterValue={filterValues[widget.id]}
                    onFilterChange={handleFilterChange}
                    minHeight={widget.minHeight ?? 280}
                    darkChartTheme={darkChartTheme}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
      </div>
    </div>
  );
}

export default DashboardViewer;
