"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useDashboardEtlData } from "@/hooks/useDashboardEtlData";
import {
  type DashboardTheme,
  DEFAULT_DASHBOARD_THEME,
  mergeCardTheme,
  mergeTheme,
  themeToCssVars,
  themeToWrapperBackground,
} from "@/types/dashboard";
import { DashboardWidgetRenderer, type DashboardWidgetRendererWidget } from "./DashboardWidgetRenderer";
import { safeJsonResponse } from "@/lib/safe-json-response";
import { loadPreviewWidgetData } from "@/lib/dashboard/previewWidgetDataLoader";
import type { GeoComponentOverrides } from "@/lib/geo/geo-enrichment";
import {
  expandAnalysisMetricsForFetch,
  type SavedMetricForExpand,
} from "@/lib/metrics/expandSavedMetricsForAnalysis";
import {
  buildChartMetricStyles,
  buildResolvedChartStyle,
  resolveDarkChartTheme,
} from "@/lib/dashboard/widgetRenderParity";
import type { ChartStyleConfig } from "@/lib/dashboard/chartOptions";
import { AlertTriangle, ArrowLeft, ChevronDown, FileDown, Loader2 } from "lucide-react";
import {
  exportDashboardExcel,
  exportDashboardPdfFromElement,
  exportDashboardSummaryPpt,
} from "@/lib/dashboard/dashboardExport";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { computeDashboardGridPlacementsPacked, DASHBOARD_GRID_ROW_UNIT_PX } from "@/lib/dashboard/gridLayout";
import { useDashboardPackLayout } from "@/hooks/useDashboardPackColumnCount";

/** Meses 1–12 para filtro global MONTH (sin año en la UI). */
const GLOBAL_MONTH_FILTER_VALUES = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
] as const;
const MONTH_LABELS_ES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
] as const;

function isMonthOperator(operator: unknown): boolean {
  return String(operator ?? "").toUpperCase() === "MONTH";
}

/** Convierte valores guardados tipo "2024-07" al mes numérico 1–12 para MONTH. */
function normalizeMonthFilterStoredValue(operator: unknown, v: unknown): unknown {
  if (!isMonthOperator(operator)) return v;
  if (typeof v === "string") {
    const t = v.trim();
    const ym = /^(\d{4})-(\d{1,2})$/.exec(t);
    if (ym) return String(parseInt(ym[2]!, 10));
  }
  if (Array.isArray(v)) {
    return v.map((x) => normalizeMonthOperatorArrayItem(x));
  }
  return v;
}

function normalizeMonthOperatorArrayItem(x: unknown): unknown {
  if (typeof x === "string") {
    const t = x.trim();
    const ym = /^(\d{4})-(\d{1,2})$/.exec(t);
    if (ym) return String(parseInt(ym[2]!, 10));
  }
  return x;
}

function monthFilterSelectDisplayValue(operator: unknown, raw: unknown): string {
  if (!isMonthOperator(operator)) return String(raw ?? "");
  const n = normalizeMonthFilterStoredValue(operator, raw);
  return String(n ?? "");
}

function monthFilterOptionLabel(operator: unknown, value: unknown): string {
  if (!isMonthOperator(operator)) return String(value ?? "");
  const n = Number(value);
  if (Number.isInteger(n) && n >= 1 && n <= 12) {
    return MONTH_LABELS_ES[n - 1] ?? String(value);
  }
  return String(value ?? "");
}

function isYearOperator(operator: unknown): boolean {
  return String(operator ?? "").toUpperCase() === "YEAR";
}

function isYearMonthOperator(operator: unknown): boolean {
  return String(operator ?? "").toUpperCase() === "YEAR_MONTH";
}

/** Etiqueta legible para valores distinct tipo YYYY-MM (filtro año/mes). */
function yearMonthFilterOptionLabel(value: unknown): string {
  const t = String(value ?? "").trim();
  const m = /^(\d{4})-(\d{1,2})$/.exec(t);
  if (!m) return t;
  const year = m[1]!;
  const monthNum = parseInt(m[2]!, 10);
  if (Number.isInteger(monthNum) && monthNum >= 1 && monthNum <= 12) {
    return `${MONTH_LABELS_ES[monthNum - 1]} ${year}`;
  }
  return t;
}

/** Un año por filtro: valores heredados como multi (array) se conservan; en select único se reduce al primero. */
function normalizeYearFilterStoredValue(operator: unknown, inputType: unknown, v: unknown): unknown {
  if (!isYearOperator(operator)) return v;
  if (inputType === "multi") return v;
  if (Array.isArray(v) && v.length > 0) return String(v[0]);
  return v;
}

function yearFilterSelectDisplayValue(raw: unknown): string {
  if (Array.isArray(raw) && raw.length > 0) return String(raw[0]);
  return String(raw ?? "");
}

/** Estado previo de filtro multi → lista de strings alineada con `selectedArray` en la UI (incl. normalización MONTH). */
/**
 * En aggregate-data estos operadores ya interpretan arrays (EXTRACT / buildMonthFilterSqlClause).
 * No deben sustituirse por IN genérico sobre la columna cruda.
 */
const DATE_OPERATORS_WITH_MULTI_VALUE_SQL = new Set([
  "YEAR",
  "MONTH",
  "QUARTER",
  "SEMESTER",
  "YEAR_MONTH",
]);

function globalMultiPrevToSelectedStrings(operator: unknown, raw: unknown): string[] {
  const selectedArrayRaw = Array.isArray(raw)
    ? (raw as unknown[]).map((x) => String(x))
    : raw != null && raw !== ""
      ? [String(raw)]
      : [];
  return isMonthOperator(operator)
    ? selectedArrayRaw.map((x) => String(normalizeMonthFilterStoredValue(operator, x)))
    : selectedArrayRaw;
}

function globalMultiFilterTriggerLabel(operator: unknown, selected: string[], options: unknown[]): string {
  if (selected.length === 0) return "Todos";
  if (selected.length === 1) {
    const s = selected[0]!;
    const match = options.find((o) => String(o) === s);
    const raw = match !== undefined ? match : s;
    if (isYearMonthOperator(operator)) return yearMonthFilterOptionLabel(raw);
    return monthFilterOptionLabel(operator, raw);
  }
  return `${selected.length} seleccionados`;
}

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
  formula?: string;
  expression?: string;
  condition?: { field: string; operator: string; value: unknown };
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
  /** Top N por métrica: ordenar de mayor a menor (`desc`, default) o menor a mayor (`asc`). */
  chartRankingDirection?: "asc" | "desc";
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
  chartDatasetLabelOverrides?: Record<string, string>;
  chartLegendVisible?: boolean;
  tableColumnLabelOverrides?: Record<string, string>;
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
  analysisDateDisplayFormat?: "short" | "monthYear" | "year" | "datetime";
  mapDefaultCountry?: string;
  geoComponentOverrides?: GeoComponentOverrides;
  geoOverridesByXLabel?: Record<string, GeoComponentOverrides>;
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
  metricId?: string;
  metricIds?: string[];
  analysisId?: string;
  /** Misma semántica que AdminDashboardStudio: pestaña del lienzo */
  pageId?: string;
  /** Overrides visuales respecto a `layout.theme` (solo esta tarjeta). */
  cardTheme?: Partial<DashboardTheme>;
};

/** Coincide con la página activa; corrige legado "page-1" vs id real de la primera página. */
function widgetMatchesActivePage(
  w: Widget,
  pl: { firstPageId: string; activePageId: string }
): boolean {
  const pid = w.pageId ?? pl.firstPageId;
  if (pid === pl.activePageId) return true;
  if (
    pid === "page-1" &&
    pl.firstPageId !== "page-1" &&
    pl.activePageId === pl.firstPageId
  ) {
    return true;
  }
  return false;
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
  const canvasExportRef = useRef<HTMLDivElement>(null);
  const [exportBusy, setExportBusy] = useState(false);
  /** Si viene del layout guardado: misma página activa que AdminDashboardStudio (vista previa = lienzo). */
  const [pageLayout, setPageLayout] = useState<{
    firstPageId: string;
    activePageId: string;
    pagesMeta?: { id: string; name: string }[];
  } | null>(null);
  const stateRef = useRef({ widgets, setWidgets });
  /** Evita que una respuesta antigua de fetch pise datos de una petición más reciente del mismo widget. */
  const widgetLoadGenRef = useRef<Record<string, number>>({});

  const { data: etlData, error: etlDataError } = useDashboardEtlData(dashboardId, apiEndpoints?.etlData);
  const etlDataRef = useRef(etlData);
  etlDataRef.current = etlData;

  const themeMerged = useMemo(() => mergeTheme(dashboardTheme), [dashboardTheme]);
  const accentColor = themeMerged.accentColor ?? DEFAULT_DASHBOARD_THEME.accentColor ?? "#0ea5e9";

  /** Solo rehidratar layout/valores de filtro cuando cambia el layout guardado, no por nueva referencia de `etlData`. */
  const layoutFingerprint = useMemo(() => {
    if (initialWidgets?.length) return "__initial_props__";
    const dashboard = (etlData as { dashboard?: { layout?: unknown; global_filters_config?: unknown; title?: string } })?.dashboard;
    if (!dashboard) return "";
    const layout = dashboard.layout as {
      widgets?: { id?: string }[];
      pages?: unknown;
      activePageId?: string;
    } | undefined;
    const rawWidgets = Array.isArray(layout?.widgets) ? layout.widgets : [];
    const widgetSig = rawWidgets.map((w) => String(w?.id ?? "")).join(",");
    const gfsSig = JSON.stringify(dashboard.global_filters_config ?? []);
    const pagesSig = JSON.stringify(layout?.pages ?? []);
    const active = String(layout?.activePageId ?? "");
    return `${widgetSig}|${gfsSig}|${pagesSig}|${active}|${String(dashboard.title ?? "")}`;
  }, [etlData, initialWidgets]);

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
          const raw = (gf as AggregationFilter & { value?: unknown }).value;
          if (raw === "" || raw === null || raw === undefined) continue;
          if (Array.isArray(raw) && raw.length === 0) continue;
          let v = normalizeMonthFilterStoredValue((gf as AggregationFilter).operator, raw);
          v = normalizeYearFilterStoredValue(
            (gf as AggregationFilter).operator,
            (gf as AggregationFilter).inputType,
            v
          );
          initialFv[gf.id] = v;
        }
        setFilterValues(initialFv);
      }
      return;
    }
    const dashboard = (etlDataRef.current as { dashboard?: Record<string, unknown> } | null)?.dashboard as
      | {
          title?: string;
          layout?: {
            widgets?: Widget[];
            theme?: Partial<DashboardTheme>;
            pages?: { id: string; name?: string }[];
            activePageId?: string;
          };
          global_filters_config?: AggregationFilter[];
        }
      | undefined;
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
    const pagesMeta = pages.map((p, i) => ({
      id: String((p as { id?: string }).id ?? `page-${i}`),
      name: String((p as { name?: string }).name ?? "").trim() || `Página ${i + 1}`,
    }));
    const pageIds = new Set(pagesMeta.map((p) => p.id));
    let activePageId = String(layout?.activePageId ?? firstPageId);
    if (!pageIds.has(activePageId)) activePageId = firstPageId;

    const normalizeWidgetPageId = (raw: string | undefined): string => {
      const fallback = firstPageId;
      const r = raw ?? fallback;
      if (pageIds.has(r)) return r;
      if (r === "page-1" && !pageIds.has("page-1")) return firstPageId;
      return fallback;
    };

    setPageLayout({ firstPageId, activePageId, pagesMeta });
    const rawWidgets = Array.isArray(layout?.widgets) ? layout.widgets : [];
    const loadedWidgets = rawWidgets.map((w, i) => {
      const base = w as Widget;
      return {
        ...base,
        gridOrder: base.gridOrder ?? i,
        pageId: normalizeWidgetPageId(base.pageId),
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
      const raw = (gf as AggregationFilter & { value?: unknown }).value;
      if (raw === "" || raw === null || raw === undefined) continue;
      if (Array.isArray(raw) && raw.length === 0) continue;
      let v = normalizeMonthFilterStoredValue((gf as AggregationFilter).operator, raw);
      v = normalizeYearFilterStoredValue(
        (gf as AggregationFilter).operator,
        (gf as AggregationFilter).inputType,
        v
      );
      initialFv[gf.id] = v;
    }
    setFilterValues(initialFv);
  }, [layoutFingerprint, initialWidgets, initialTitle, initialGlobalFilters]);

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
    const dateDistinctTransforms = new Set(["YEAR", "MONTH", "DAY", "QUARTER", "SEMESTER"]);
    (async () => {
      for (const gf of selectFilters) {
        if (cancelled) break;
        try {
          const filterOp = String((gf as { operator?: string }).operator ?? "").toUpperCase();

          const physicalField =
            datasetDimensions?.[gf.field!]?.[primarySourceId!] ?? gf.field!;
          const isDateField =
            physicalField &&
            primaryDateFields.some((d: string) => (d || "").toLowerCase() === (physicalField || "").toLowerCase());
          /** Solo mes calendario (1–12), sin año en la UI ni distinct YYYY-MM. */
          if (filterOp === "MONTH" && isDateField) {
            if (!cancelled) {
              setGlobalFilterDistinctValues((prev) => ({
                ...prev,
                [gf.id]: [...GLOBAL_MONTH_FILTER_VALUES],
              }));
            }
            continue;
          }
          const body: { tableName: string; field: string; limit: number; transform?: string } = {
            tableName: primaryTableName,
            field: physicalField,
            limit: 200,
          };
          if (isDateField) {
            const t =
              filterOp === "YEAR_MONTH"
                ? "MONTH"
                : dateDistinctTransforms.has(filterOp)
                  ? filterOp
                  : "YEAR";
            body.transform = t;
          }
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
      // Leer widgets desde ref: si dependemos de `widgets`, cada setWidgets tras cargar datos
      // recrea el callback y el efecto [filterValues, loadDataForWidget, …] vuelve a disparar todo en bucle.
      const widget = stateRef.current.widgets.find((w) => w.id === widgetId);
      if (!widget || !etlData) return;
      const genMap = widgetLoadGenRef.current;
      genMap[widgetId] = (genMap[widgetId] ?? 0) + 1;
      const myGen = genMap[widgetId]!;
      const isStale = () => widgetLoadGenRef.current[widgetId] !== myGen;

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
      if (isStale()) return;

      if (!fullTableName) {
        if (!isStale()) {
          setWidgets((prev) => prev.map((w) => (w.id === widgetId ? { ...w, isLoading: false } : w)));
        }
        return;
      }

      if (isStale()) return;

      setWidgets((prev) => prev.map((w) => (w.id === widgetId ? { ...w, isLoading: true } : w)));
      const safetyTimeout = setTimeout(() => {
        if (widgetLoadGenRef.current[widgetId] !== myGen) return;
        setWidgets((prev) => prev.map((w) =>
          w.id === widgetId && w.isLoading ? { ...w, isLoading: false } : w
        ));
      }, 30000);

      try {
        const aggConfig = widget.aggregationConfig;
        const datasetDimensions = (etlData as { datasetDimensions?: Record<string, Record<string, string>> })?.datasetDimensions;
        const dataSourcesList = (etlData as { dataSources?: { id: string; etlId?: string }[]; primarySourceId?: string })?.dataSources;
        const widgetSourceId = widget.dataSourceId ?? (etlData as { primarySourceId?: string })?.primarySourceId ?? dataSourcesList?.[0]?.id;
        const mapDatasetField = (rawField: unknown): string => {
          const field = String(rawField ?? "").trim();
          if (!field || !widgetSourceId) return field;
          return datasetDimensions?.[field]?.[widgetSourceId] ?? field;
        };

        const pageOf = (w: Widget) =>
          w.pageId ?? pageLayout?.activePageId ?? pageLayout?.firstPageId ?? "page-1";
        const targetPage = pageOf(widget);
        const fieldsWithWidgets = new Set(
          stateRef.current.widgets
            .filter(
              (w) =>
                w.type === "filter" &&
                (w as { filterConfig?: { field?: string } }).filterConfig?.field &&
                pageOf(w) === targetPage
            )
            .map((w) => String((w as { filterConfig?: { field?: string } }).filterConfig?.field ?? ""))
        );

        const mappedGlobalFilters: AggregationFilter[] = [];
        if (!(widget as Widget & { excludeGlobalFilters?: boolean }).excludeGlobalFilters) {
          for (const f of globalFilters) {
            if (f.applyTo === "selected" && Array.isArray(f.applyToWidgetIds) && f.applyToWidgetIds.length > 0) {
              if (!f.applyToWidgetIds.includes(widgetId)) continue;
            }
            if (fieldsWithWidgets.has(f.field)) continue;
            let v =
              filterValues[f.id] !== undefined ? filterValues[f.id] : (f as AggregationFilter & { value?: unknown }).value;
            if (v === "" || v == null) continue;
            if (Array.isArray(v) && v.length === 0) continue;
            const rawOp = f.operator || "=";
            const rawOpUpper = String(rawOp).toUpperCase();
            const inputT = f.inputType;
            if (rawOpUpper === "YEAR" && Array.isArray(v) && v.length > 0 && inputT !== "multi") {
              v = v[0];
            }
            const isSemantic = datasetDimensions && f.field in datasetDimensions;
            if (isSemantic && widgetSourceId && !datasetDimensions![f.field]?.[widgetSourceId]) continue;
            const physicalField = mapDatasetField(f.field);
            const useIn =
              rawOp === "IN" ||
              (!DATE_OPERATORS_WITH_MULTI_VALUE_SQL.has(rawOpUpper) &&
                inputT === "multi" &&
                Array.isArray(v) &&
                v.length > 0);
            const op = useIn ? "IN" : rawOp;
            const value: unknown = op === "IN" ? (Array.isArray(v) ? v : [v]) : v;
            mappedGlobalFilters.push({ ...f, field: physicalField, operator: op, value });
          }
        }

        const filterWidgetsOnPage = stateRef.current.widgets.filter(
          (w) => w.type === "filter" && pageOf(w) === targetPage && (w as Widget).filterConfig?.field
        );
        for (const fw of filterWidgetsOnPage) {
          const fc = (fw as Widget).filterConfig!;
          let v = filterValues[fw.id];
          if (v === "" || v == null) continue;
          if (Array.isArray(v) && v.length === 0) continue;
          const rawOpFw = fc.operator || "=";
          const rawOpFwUpper = String(rawOpFw).toUpperCase();
          if (rawOpFwUpper === "YEAR" && Array.isArray(v) && v.length > 0 && fc.inputType !== "multi") {
            v = v[0];
          }
          const scopeIds = fc.scopeMetricIds;
          if (Array.isArray(scopeIds) && scopeIds.length > 0) {
            const allowed = new Set(scopeIds.map(String));
            const mid = String((widget as { metricId?: string }).metricId ?? "").trim();
            const midsRaw = (widget as { metricIds?: unknown }).metricIds;
            const mids = Array.isArray(midsRaw) ? midsRaw.map((x) => String(x)) : [];
            const applies =
              (mid !== "" && allowed.has(mid)) || mids.some((id) => allowed.has(String(id)));
            if (!applies) continue;
          }
          const isSemanticFw = datasetDimensions && fc.field in datasetDimensions;
          if (isSemanticFw && widgetSourceId && !datasetDimensions![fc.field]?.[widgetSourceId]) continue;
          const physicalFw = mapDatasetField(fc.field);
          const useInFw =
            rawOpFw === "IN" ||
            (!DATE_OPERATORS_WITH_MULTI_VALUE_SQL.has(rawOpFwUpper) &&
              fc.inputType === "multi" &&
              Array.isArray(v) &&
              v.length > 0);
          const opFw = useInFw ? "IN" : rawOpFw;
          const valueFw: unknown = opFw === "IN" ? (Array.isArray(v) ? v : [v]) : v;
          mappedGlobalFilters.push({
            id: fw.id,
            field: physicalFw,
            operator: opFw,
            value: valueFw,
            convertToNumber: false,
            inputType: fc.inputType,
          } as AggregationFilter);
        }

        const dashLayoutSaved = (etlData as { dashboard?: { layout?: { savedMetrics?: unknown[] } } })?.dashboard?.layout?.savedMetrics;
        const layoutSavedMetrics = (Array.isArray(dashLayoutSaved) ? dashLayoutSaved : []) as NonNullable<
          Parameters<typeof loadPreviewWidgetData>[0]["savedMetrics"]
        >;
        const dsSavedRaw = (dataSourcesList?.find((s) => s.id === widgetSourceId) as { savedMetrics?: unknown[] } | undefined)
          ?.savedMetrics;
        const dsSavedMetrics = (Array.isArray(dsSavedRaw) ? dsSavedRaw : []) as NonNullable<
          Parameters<typeof loadPreviewWidgetData>[0]["savedMetrics"]
        >;
        const savedMetricsPoolMap = new Map<string, (typeof layoutSavedMetrics)[0] & { id?: string }>();
        for (const m of [...layoutSavedMetrics, ...dsSavedMetrics]) {
          const row = m as { id?: string };
          const id = String(row?.id ?? "").trim();
          if (id) savedMetricsPoolMap.set(id, m as (typeof layoutSavedMetrics)[0] & { id?: string });
        }
        const savedMetricsPool = Array.from(savedMetricsPoolMap.values());

        const widgetEtlId = widgetSourceId
          ? dataSourcesList?.find((s) => s.id === widgetSourceId)?.etlId ?? (etlData as { etl?: { id?: string } })?.etl?.id
          : (etlData as { etl?: { id?: string } })?.etl?.id;

        const chartAccent = (widget as { color?: string }).color || accentColor;

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

        if (aggConfig?.enabled && aggConfig.metrics?.length > 0) {
          const expandedEdits = expandAnalysisMetricsForFetch(
            {
              analysisId: (widget as Widget).analysisId,
              metricIds: (widget as Widget).metricIds,
            },
            savedMetricsPool as SavedMetricForExpand[]
          );
          const metricsForLoad: AggregationMetric[] =
            expandedEdits && expandedEdits.length > 0
              ? expandedEdits.map((m, idx) => ({
                  id: String(m.id ?? `m-${idx}`),
                  field: String(m.field ?? ""),
                  func: String(m.func ?? "SUM"),
                  alias: String(m.alias ?? ""),
                  formula: typeof m.formula === "string" ? m.formula : undefined,
                  expression: typeof m.expression === "string" ? m.expression : undefined,
                  condition: m.condition as AggregationMetric["condition"],
                }))
              : aggConfig.metrics;
          const aggConfigForLoad: AggregationConfig = { ...aggConfig, metrics: metricsForLoad };
          const mappedWidgetFilters = (aggConfigForLoad.filters || []).map((f) => ({
            ...f,
            field: mapDatasetField(f.field),
            operator:
              Array.isArray(f.value) && String(f.operator ?? "").toUpperCase() !== "IN" ? "IN" : f.operator,
          }));
          const normalizedAgg = { ...aggConfigForLoad, filters: mappedWidgetFilters };
          const widgetForBuild = {
            type: widget.type,
            aggregationConfig: normalizedAgg,
            source: widget.source,
            color: (widget as { color?: string }).color,
          };

          const loaded = await loadPreviewWidgetData({
            widget: widgetForBuild as Parameters<typeof loadPreviewWidgetData>[0]["widget"],
            tableName: fullTableName,
            etlId: widgetEtlId,
            sourceId: widgetSourceId,
            datasetDimensions,
            savedMetrics: savedMetricsPool.length > 0 ? savedMetricsPool : layoutSavedMetrics,
            globalFilters: mappedGlobalFilters,
            aggregateEndpoint: apiEndpoints?.aggregateData ?? "/api/dashboard/aggregate-data",
            rawEndpoint: apiEndpoints?.rawData ?? "/api/dashboard/raw-data",
            rawLimit: 500,
            accentColor: chartAccent,
          });

          if (isStale()) return;

          if (!loaded.hasData) {
            if (!isStale()) {
              setWidgets((prev) =>
                prev.map((w) =>
                  w.id === widgetId ? { ...w, rows: [], config: { labels: [], datasets: [] }, isLoading: false } : w
                )
              );
            }
            return;
          }

          const sample = loaded.processedRows[0] || {};
          const columnsDetected = Object.keys(sample).map((k) => ({
            name: k,
            type: inferType((sample as Record<string, unknown>)[k]),
          }));

          if (!isStale()) {
            setWidgets((prev) =>
              prev.map((w) =>
                w.id === widgetId
                  ? {
                      ...w,
                      config: loaded.chartConfig ?? { labels: [], datasets: [] },
                      rows: loaded.processedRows,
                      columns: columnsDetected,
                      isLoading: false,
                    }
                  : w
              )
            );
          }
        } else {
          const widgetForBuild = {
            type: widget.type,
            aggregationConfig: aggConfig,
            source: widget.source,
            color: (widget as { color?: string }).color,
          };
          const rawPayload = { tableName: fullTableName, filters: mappedGlobalFilters, limit: 500 };
          const loaded = await loadPreviewWidgetData({
            widget: widgetForBuild as Parameters<typeof loadPreviewWidgetData>[0]["widget"],
            tableName: fullTableName,
            sourceId: widgetSourceId,
            datasetDimensions,
            globalFilters: mappedGlobalFilters,
            aggregateEndpoint: apiEndpoints?.aggregateData ?? "/api/dashboard/aggregate-data",
            rawEndpoint: apiEndpoints?.rawData ?? "/api/dashboard/raw-data",
            rawLimit: 500,
            accentColor: chartAccent,
            rawExtraPayload: rawPayload,
          });

          if (isStale()) return;

          if (!loaded.hasData) {
            if (!isStale()) {
              setWidgets((prev) =>
                prev.map((w) =>
                  w.id === widgetId ? { ...w, rows: [], config: { labels: [], datasets: [] }, isLoading: false } : w
                )
              );
            }
            return;
          }

          const sample = loaded.processedRows[0] || {};
          const columnsDetected = Object.keys(sample).map((k) => ({
            name: k,
            type: inferType((sample as Record<string, unknown>)[k]),
          }));

          if (!isStale()) {
            setWidgets((prev) =>
              prev.map((w) =>
                w.id === widgetId
                  ? {
                      ...w,
                      config: loaded.chartConfig ?? { labels: [], datasets: [] },
                      rows: loaded.processedRows,
                      columns: columnsDetected,
                      isLoading: false,
                    }
                  : w
              )
            );
          }
        }
      } catch {
        if (!isStale()) {
          setWidgets((prev) => prev.map((w) => (w.id === widgetId ? { ...w, isLoading: false } : w)));
        }
      } finally {
        clearTimeout(safetyTimeout);
      }
    },
    [etlData, globalFilters, filterValues, apiEndpoints, getTableNameForWidget, isPublic, accentColor, pageLayout]
  );

  const reloadAll = useCallback(() => {
    stateRef.current.widgets.forEach((w) => {
      if (w.type === "filter") return;
      if (pageLayout && !widgetMatchesActivePage(w, pageLayout)) return;
      loadDataForWidget(w.id);
    });
  }, [loadDataForWidget, pageLayout]);

  useEffect(() => {
    if (!etlData || widgets.length === 0) return;
    const timer = setTimeout(() => {
      stateRef.current.widgets.forEach((w) => {
        if (w.type === "filter") return;
        if (pageLayout && !widgetMatchesActivePage(w, pageLayout)) return;
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
    widgetLoadGenRef.current = {};
  }, [dashboardId]);

  const handleFilterChange = useCallback((widgetId: string, value: unknown) => {
    setFilterValues((prev) => ({ ...prev, [widgetId]: value }));
  }, []);

  const orderedWidgets = useMemo(() => {
    let list = widgets;
    if (pageLayout) {
      list = widgets.filter((w) => widgetMatchesActivePage(w, pageLayout));
      if (
        list.length === 0 &&
        widgets.some((w) => w.type !== "filter" && w.type !== "text" && w.type !== "image")
      ) {
        list = widgets;
      }
    }
    const hasOrder = list.some((w) => typeof w.gridOrder === "number");
    if (hasOrder) return [...list].sort((a, b) => (a.gridOrder ?? 0) - (b.gridOrder ?? 0));
    return list;
  }, [widgets, pageLayout]);

  const exportableWidgets = useMemo(
    () =>
      orderedWidgets.filter(
        (w) => w.type !== "filter" && w.type !== "text" && w.type !== "image"
      ),
    [orderedWidgets]
  );

  const { packCols, packRowGapPx } = useDashboardPackLayout("client");

  const placements = useMemo(
    () => computeDashboardGridPlacementsPacked(orderedWidgets, packCols, undefined, packRowGapPx),
    [orderedWidgets, packCols, packRowGapPx]
  );

  const runExportExcel = useCallback(async () => {
    setExportBusy(true);
    try {
      await exportDashboardExcel(
        `dashboard-${dashboardId}`,
        exportableWidgets.map((w) => ({ title: w.title, rows: w.rows }))
      );
    } finally {
      setExportBusy(false);
    }
  }, [dashboardId, exportableWidgets]);

  const runExportPdf = useCallback(async () => {
    const el = canvasExportRef.current;
    if (!el) return;
    setExportBusy(true);
    try {
      await exportDashboardPdfFromElement(el, `dashboard-${dashboardId}`);
    } finally {
      setExportBusy(false);
    }
  }, [dashboardId]);

  const runExportPpt = useCallback(async () => {
    setExportBusy(true);
    try {
      await exportDashboardSummaryPpt(
        `dashboard-${dashboardId}`,
        exportableWidgets.map((w) => ({ title: w.title, rows: w.rows }))
      );
    } finally {
      setExportBusy(false);
    }
  }, [dashboardId, exportableWidgets]);

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
  const themeVars = useMemo(() => {
    if (!useClientTheme) return {};
    return themeToCssVars(themeMerged) as React.CSSProperties;
  }, [useClientTheme, themeMerged]);

  const wrapperBackground = useMemo(() => {
    if (!useClientTheme) return undefined;
    return themeToWrapperBackground(themeMerged);
  }, [useClientTheme, themeMerged]);

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
            {variant === "default" && exportableWidgets.length > 0 && (
              <div className="flex flex-shrink-0 flex-wrap items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1 text-xs rounded-lg"
                  style={{ borderColor: "var(--platform-border)" }}
                  disabled={exportBusy}
                  onClick={() => void runExportExcel()}
                >
                  <FileDown className="h-3.5 w-3.5" />
                  Excel
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1 text-xs rounded-lg"
                  style={{ borderColor: "var(--platform-border)" }}
                  disabled={exportBusy}
                  onClick={() => void runExportPdf()}
                >
                  <FileDown className="h-3.5 w-3.5" />
                  PDF
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1 text-xs rounded-lg"
                  style={{ borderColor: "var(--platform-border)" }}
                  disabled={exportBusy}
                  onClick={() => void runExportPpt()}
                >
                  <FileDown className="h-3.5 w-3.5" />
                  PPT
                </Button>
              </div>
            )}
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
            const rawDistinct = (globalFilterDistinctValues[gf.id] ?? (gf as any).distinctValues) as unknown[] | undefined;
            const options = isMonthOperator((gf as AggregationFilter).operator)
              ? Array.isArray(rawDistinct) && rawDistinct.length > 0
                ? rawDistinct
                : [...GLOBAL_MONTH_FILTER_VALUES]
              : rawDistinct;
            const inputType = (gf as AggregationFilter & { inputType?: string }).inputType;
            const isYearOp = isYearOperator((gf as AggregationFilter).operator);
            const isYearMonthOp = isYearMonthOperator((gf as AggregationFilter).operator);
            const isMulti = (gf.operator || "=") === "IN" || inputType === "multi";
            const selectedArrayRaw = isMulti
              ? (Array.isArray(filterValues[gf.id]) ? filterValues[gf.id] : filterValues[gf.id] != null && filterValues[gf.id] !== "" ? [filterValues[gf.id]] : []) as string[]
              : [];
            const selectedArray = isMonthOperator((gf as AggregationFilter).operator)
              ? selectedArrayRaw.map((x) => String(normalizeMonthFilterStoredValue((gf as AggregationFilter).operator, x)))
              : selectedArrayRaw;
            const hasOptions = Array.isArray(options) && options.length > 0;

            return (
              <div key={gf.id} className="flex flex-col gap-1.5 text-sm">
                <span style={{ color: "var(--platform-fg-muted)" }}>{label}</span>
                {isMulti && hasOptions ? (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 min-w-[10rem] max-w-[14rem] justify-between gap-1 text-xs font-normal rounded-md px-2"
                        style={{
                          borderColor: "var(--platform-border)",
                          color: "var(--platform-fg)",
                          background: "var(--platform-bg)",
                        }}
                        aria-haspopup="dialog"
                        aria-label={`${label}: elegir valores`}
                      >
                        <span className="truncate text-left">
                          {globalMultiFilterTriggerLabel((gf as AggregationFilter).operator, selectedArray, options)}
                        </span>
                        <ChevronDown className="h-4 w-4 shrink-0 opacity-60" aria-hidden />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      align="start"
                      className="w-72 p-3"
                      style={{
                        background: "var(--platform-bg, var(--popover))",
                        borderColor: "var(--platform-border)",
                        color: "var(--platform-fg)",
                      }}
                    >
                      <div className="flex flex-wrap gap-2 mb-2">
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
                      </div>
                      <div className="max-h-60 overflow-y-auto flex flex-col gap-1.5 pr-1">
                        {options.map((v) => {
                          const s = String(v);
                          const checked = selectedArray.includes(s);
                          return (
                            <label
                              key={s}
                              className="flex items-center gap-2 cursor-pointer text-xs py-0.5"
                              style={{ color: "var(--platform-fg)" }}
                            >
                              <input
                                type="checkbox"
                                className="rounded border shrink-0"
                                style={{ borderColor: "var(--platform-border)" }}
                                checked={checked}
                                onChange={(e) => {
                                  setFilterValues((prev) => {
                                    const cur = globalMultiPrevToSelectedStrings(
                                      (gf as AggregationFilter).operator,
                                      prev[gf.id]
                                    );
                                    const next = e.target.checked
                                      ? cur.includes(s)
                                        ? cur
                                        : [...cur, s]
                                      : cur.filter((x) => x !== s);
                                    return { ...prev, [gf.id]: next };
                                  });
                                }}
                              />
                              <span>
                                {isYearMonthOp
                                  ? yearMonthFilterOptionLabel(v)
                                  : monthFilterOptionLabel((gf as AggregationFilter).operator, v)}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </PopoverContent>
                  </Popover>
                ) : (((gf as any).inputType === "select" || isYearOp || isYearMonthOp) && hasOptions) ? (
                  <select
                    className="rounded-md border px-2 py-1 text-sm min-w-[8rem]"
                    style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}
                    value={
                      isYearOp
                        ? yearFilterSelectDisplayValue(filterValues[gf.id])
                        : isYearMonthOp
                          ? String(filterValues[gf.id] ?? "")
                          : monthFilterSelectDisplayValue((gf as AggregationFilter).operator, filterValues[gf.id])
                    }
                    onChange={(e) => setFilterValues((prev) => ({ ...prev, [gf.id]: e.target.value }))}
                  >
                    <option value="">Todos</option>
                    {(options as unknown[]).map((v) => (
                      <option key={String(v)} value={String(v)}>
                        {isYearMonthOp
                          ? yearMonthFilterOptionLabel(v)
                          : monthFilterOptionLabel((gf as AggregationFilter).operator, v)}
                      </option>
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
            ref={canvasExportRef}
            className={`grid${useClientTheme ? " client-view-grid" : ""}`}
            style={{
              gridTemplateColumns: `repeat(${packCols}, minmax(0, 1fr))`,
              gridAutoRows: `minmax(${DASHBOARD_GRID_ROW_UNIT_PX}px, auto)`,
              rowGap: useClientTheme ? "0.5rem" : "0.75rem",
              columnGap: useClientTheme ? "0.75rem" : "1rem",
            }}
          >
            {placements.map(({ widget, gridColumn, gridRow }) => {
              const nonApplicableLabels = nonApplicableFilterLabelsByWidget[widget.id] ?? [];
              const filterWarningTooltip =
                nonApplicableLabels.length > 0
                  ? `El filtro${nonApplicableLabels.length === 1 ? "" : "s"} "${nonApplicableLabels.join('", "')}" no afecta a este gráfico porque no utiliza ese campo.`
                  : undefined;
              const effectiveTheme = mergeCardTheme(themeMerged, widget.cardTheme);
              const cellThemeVars = useClientTheme
                ? (themeToCssVars(effectiveTheme) as React.CSSProperties)
                : {};
              // Sin themeToWrapperBackground aquí: usa el color de página del dashboard y anula
              // `background: var(--client-card)` en `.client-view-widget`. El Card interno es
              // transparente en tema cliente; sin esto, al quitar el overlay de carga se veía
              // el fondo del lienzo en lugar del color de tarjeta del editor.
              return (
                <div
                  key={widget.id}
                  className={useClientTheme ? "client-view-widget" : undefined}
                  style={{
                    gridColumn,
                    gridRow,
                    display: "flex",
                    flexDirection: "column",
                    minHeight: 0,
                    position: "relative",
                    ...cellThemeVars,
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
                      chartStyle: buildResolvedChartStyle(
                        widget.aggregationConfig,
                        widget.chartStyle as ChartStyleConfig | null | undefined,
                        effectiveTheme.fontFamily
                      ),
                      chartMetricStyles: buildChartMetricStyles(widget.aggregationConfig),
                    } as DashboardWidgetRendererWidget}
                    isLoading={widget.isLoading === true}
                    filterValue={filterValues[widget.id]}
                    onFilterChange={handleFilterChange}
                    minHeight={widget.minHeight ?? 280}
                    darkChartTheme={resolveDarkChartTheme(effectiveTheme, true)}
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
