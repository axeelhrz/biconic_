"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { Plus, Check, BarChart2, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useAdminDashboardEtlData } from "@/hooks/admin/useAdminDashboardEtlData";
import { safeJsonResponse } from "@/lib/safe-json-response";
import { searchEtls, addDashboardDataSource, removeDashboardDataSource } from "@/app/admin/(main)/dashboard/actions";
import {
  type DashboardTheme,
  DEFAULT_DASHBOARD_THEME,
  mergeTheme,
} from "@/types/dashboard";
import { StudioHeader, type DashboardStatus, type StudioMode } from "./StudioHeader";
import { StudioAppearanceBar } from "./StudioAppearanceBar";
import { StudioPageTabs } from "./StudioPageTabs";
import { StudioEmptyState } from "./StudioEmptyState";
import { MetricBlock, type MetricBlockState } from "./MetricBlock";
import type { ChartConfig } from "./MetricBlock";
import type { SavedMetricForm } from "./AddMetricConfigForm";
import { buildChartConfig, getProcessedRowsForChart } from "@/lib/dashboard/buildChartConfig";
import type { ChartStyleConfig } from "@/lib/dashboard/chartOptions";
import { loadPreviewWidgetData } from "@/lib/dashboard/previewWidgetDataLoader";
import { buildChartMetricStyles, buildChartStyleFromAgg, resolveDarkChartTheme } from "@/lib/dashboard/widgetRenderParity";

type SavedMetric = SavedMetricForm;

/** Análisis guardado: configuración de un gráfico (métricas + dimensiones + tipo + etiquetas) para añadir al dashboard. */
export type SavedAnalysis = {
  id: string;
  name: string;
  metricIds: string[];
  dimension?: string;
  dimensions?: string[];
  chartType?: string;
  chartXAxis?: string;
  chartYAxes?: string[];
  chartSeriesField?: string;
  chartLabelOverrides?: Record<string, string>;
  chartValueType?: string;
  chartValueScale?: string;
  chartCurrencySymbol?: string;
  chartThousandSep?: boolean;
  chartDecimals?: number;
  chartSeriesColors?: Record<string, string>;
  chartSortDirection?: string;
  chartSortBy?: string;
  chartSortByMetric?: string;
  chartRankingEnabled?: boolean;
  chartRankingTop?: number;
  chartRankingMetric?: string;
  filters?: AggregationFilter[];
  orderBy?: { field: string; direction: "ASC" | "DESC" };
  limit?: number;
  dateDimension?: string;
  dateGroupByGranularity?: "day" | "week" | "month" | "quarter" | "semester" | "year";
  dateRangeFilter?: { field: string; last?: number; unit?: "days" | "months"; from?: string; to?: string };
  [key: string]: unknown;
};

// Tipos compatibles con el layout guardado en DB (mismo formato que DashboardViewer/DashboardEditor)
type AggregationMetric = {
  id: string;
  field: string;
  func: string;
  alias: string;
  condition?: { field: string; operator: string; value: unknown };
  formula?: string;
  expression?: string;
};
type AggregationFilter = {
  id: string;
  field: string;
  operator: string;
  value: unknown;
  inputType?: string;
};
type AggregationConfig = {
  enabled: boolean;
  dimension?: string;
  dimension2?: string;
  dimensions?: string[];
  metrics: AggregationMetric[];
  filters?: AggregationFilter[];
  orderBy?: { field: string; direction: "ASC" | "DESC" };
  limit?: number;
  cumulative?: "none" | "running_sum" | "ytd";
  comparePeriod?: "previous_year" | "previous_month";
  dateDimension?: string;
  chartSeriesColors?: Record<string, string>;
  chartType?: string;
  chartXAxis?: string;
  chartYAxes?: string[];
  chartSeriesField?: string;
  chartNumberFormat?: string;
  chartValueType?: string;
  chartValueScale?: string;
  chartCurrencySymbol?: string;
  chartThousandSep?: boolean;
  chartDecimals?: number;
  chartSortDirection?: string;
  chartSortBy?: string;
  chartSortByMetric?: string;
  chartRankingEnabled?: boolean;
  chartRankingTop?: number;
  chartRankingMetric?: string;
  chartColorScheme?: string;
  showDataLabels?: boolean;
  labelVisibilityMode?: "all" | "auto" | "min_max";
  chartAxisOrder?: string;
  chartScaleMode?: string;
  chartScaleMin?: string | number;
  chartScaleMax?: string | number;
  /** Mapeo valor en datos → texto a mostrar en etiquetas del gráfico. */
  chartLabelOverrides?: Record<string, string>;
  /** Formato por métrica (clave = chartYAxes key). */
  chartMetricFormats?: Record<string, { valueType?: string; valueScale?: string; currencySymbol?: string; decimals?: number; thousandSep?: boolean }>;
  /** Combo: alinear eje derecho con el izquierdo (normalizar 0-1) para comparación visual. */
  chartComboSyncAxes?: boolean;
  chartGridXDisplay?: boolean;
  chartGridYDisplay?: boolean;
  chartGridColor?: string;
  chartAxisXVisible?: boolean;
  chartAxisYVisible?: boolean;
  chartStackBySeries?: boolean;
  /** Si la dimensión es fecha, agrupar por este nivel. */
  dateGroupByGranularity?: "day" | "week" | "month" | "quarter" | "semester" | "year";
  /** Filtro de rango de fechas (últimos N días/meses o rango custom) para alinear con la vista previa del ETL. */
  dateRangeFilter?: { field: string; last?: number; unit?: "days" | "months"; from?: string; to?: string };
  geoHints?: {
    countryField?: string;
    provinceField?: string;
    cityField?: string;
    addressField?: string;
    latField?: string;
    lonField?: string;
  };
};
type StudioWidget = {
  id: string;
  type: string;
  title: string;
  x: number;
  y: number;
  w: number;
  h: number;
  gridOrder?: number;
  gridSpan?: number;
  minHeight?: number;
  pageId?: string;
  config?: ChartConfig;
  rows?: Record<string, unknown>[];
  aggregationConfig?: AggregationConfig;
  source?: { labelField?: string; valueFields?: string[] };
  isLoading?: boolean;
  excludeGlobalFilters?: boolean;
  labelDisplayMode?: "percent" | "value" | "both";
  color?: string;
  kpiSecondaryLabel?: string;
  kpiSecondaryValue?: string;
  diagnosticPreview?: {
    endpoint: string;
    payload: Record<string, unknown>;
    source: "aggregate" | "raw";
    capturedAt?: string;
  };
  /** ID de la fuente de datos (dashboard_data_sources) cuando el dashboard tiene múltiples ETLs */
  dataSourceId?: string | null;
  [key: string]: unknown;
};

type StudioPage = { id: string; name: string };
type GlobalFilter = {
  id: string;
  field: string;
  operator: string;
  value: unknown;
  label?: string;
  inputType?: "select" | "multi" | "search" | "number" | "date";
  applyTo?: "all" | "selected";
  applyToWidgetIds?: string[];
};

interface AdminDashboardStudioProps {
  dashboardId: string;
  title: string;
  etlName?: string | null;
  createdAt?: string | null;
}

const SUPPORTED_CHART_TYPES = ["bar", "horizontalBar", "line", "area", "pie", "doughnut", "kpi", "table", "combo", "scatter"] as const;
type SupportedChartType = typeof SUPPORTED_CHART_TYPES[number];

function normalizeChartType(raw: unknown, fallback: SupportedChartType = "bar"): SupportedChartType {
  const value = String(raw ?? "").trim();
  return (SUPPORTED_CHART_TYPES as readonly string[]).includes(value) ? (value as SupportedChartType) : fallback;
}

function isInvalidIdentifierValue(value: unknown): boolean {
  if (value == null) return true;
  const normalized = String(value).trim().toLowerCase();
  return normalized === "" || normalized === "undefined" || normalized === "null";
}

function toAggregationMetricList(input: unknown, fallbackMetric?: SavedMetricForm["metric"]): AggregationMetric[] {
  const list = Array.isArray(input) ? input : fallbackMetric ? [fallbackMetric] : [];
  const out = list.map((m) => {
    const met = (m ?? {}) as Record<string, unknown>;
    return {
      id: String(met.id ?? `m-${Date.now()}`),
      field: String(met.field ?? ""),
      func: String(met.func ?? "SUM"),
      alias: String(met.alias ?? ""),
      condition: met.condition as AggregationMetric["condition"],
      formula: typeof met.formula === "string" ? met.formula : undefined,
      expression: typeof met.expression === "string" ? met.expression : undefined,
    } satisfies AggregationMetric;
  });
  if (out.length > 0) return out;
  return [{ id: `m-${Date.now()}`, field: "", func: "SUM", alias: "" }];
}

export function AdminDashboardStudio({
  dashboardId,
  title,
  etlName,
  createdAt,
}: AdminDashboardStudioProps) {
  const [widgets, setWidgets] = useState<StudioWidget[]>([]);
  const [globalFilters, setGlobalFilters] = useState<GlobalFilter[]>([]);
  const [dashboardTheme, setDashboardTheme] = useState<DashboardTheme>({ ...DEFAULT_DASHBOARD_THEME });
  const [mode, setMode] = useState<StudioMode>("disenar");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [addMetricOpen, setAddMetricOpen] = useState(false);
  const [addMetricStep, setAddMetricStep] = useState<"list">("list");
  const [addSourceOpen, setAddSourceOpen] = useState(false);
  const [addSourceQuery, setAddSourceQuery] = useState("");
  const [addSourceEtls, setAddSourceEtls] = useState<{ id: string; title: string }[]>([]);
  const [addSourceLoading, setAddSourceLoading] = useState(false);
  const [addSourceSaving, setAddSourceSaving] = useState(false);
  const [addSourceSelected, setAddSourceSelected] = useState<string | null>(null);
  const [editingFilterId, setEditingFilterId] = useState<string | null>(null);
  const [editFilterForm, setEditFilterForm] = useState<GlobalFilter | null>(null);
  const [addMetricInitialIntent, setAddMetricInitialIntent] = useState<string | null>(null);
  const [pages, setPages] = useState<StudioPage[]>([{ id: "page-1", name: "Página 1" }]);
  const [activePageId, setActivePageId] = useState<string | null>("page-1");
  const [savedMetrics, setSavedMetrics] = useState<SavedMetric[]>([]);
  const [savedAnalyses, setSavedAnalyses] = useState<SavedAnalysis[]>([]);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [derivedColumnsFromLayout, setDerivedColumnsFromLayout] = useState<{ name: string; expression: string; defaultAggregation: string }[]>([]);
  const [layoutLoaded, setLayoutLoaded] = useState(false);
  const loadedOnce = useRef(false);
  const etlMetricsMergedRef = useRef(false);
  const autoLoadWidgetsDoneRef = useRef(false);
  const resizeStateRef = useRef<{
    widgetId: string;
    edge: string;
    startSpan: number;
    startMinHeight: number;
    startX: number;
    startY: number;
  } | null>(null);

  const { data: etlData, loading: etlLoading, error: etlError, refetch: refetchEtlData } = useAdminDashboardEtlData(dashboardId);

  const editingFilter = editingFilterId ? globalFilters.find((f) => f.id === editingFilterId) : null;
  useEffect(() => {
    if (!editingFilterId) {
      setEditFilterForm(null);
      return;
    }
    const f = globalFilters.find((x) => x.id === editingFilterId);
    if (f)
      setEditFilterForm({
        ...f,
        applyToWidgetIds: f.applyToWidgetIds ? [...f.applyToWidgetIds] : [],
      });
  }, [editingFilterId]); // eslint-disable-line react-hooks/exhaustive-deps -- only sync when opening dialog; globalFilters read at open time

  // Reset merge flag and auto-load when dashboard changes
  useEffect(() => {
    etlMetricsMergedRef.current = false;
    autoLoadWidgetsDoneRef.current = false;
    setLayoutLoaded(false);
  }, [dashboardId]);

  const status: DashboardStatus = isRunning ? "en_ejecucion" : isDirty ? "borrador" : "activo";
  const lastUpdateLabel = lastSavedAt
    ? `Actualizado ${lastSavedAt.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}`
    : createdAt
      ? `Creado ${new Date(createdAt).toLocaleDateString("es-AR")}`
      : undefined;

  // Cargar layout desde DB
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from("dashboard")
          .select("layout, global_filters_config")
          .eq("id", dashboardId)
          .maybeSingle();
        if (error) throw error;
        if (!data || cancelled) return;
        const rawLayout = (data as { layout?: { widgets?: unknown[]; theme?: DashboardTheme; pages?: StudioPage[]; activePageId?: string } }).layout;
        const loadedGlobalFilters = (data as unknown as { global_filters_config?: GlobalFilter[] }).global_filters_config || [];
        let loadedWidgets: StudioWidget[] = [];
        let loadedTheme: DashboardTheme = { ...DEFAULT_DASHBOARD_THEME };
        let loadedPages: StudioPage[] = [{ id: "page-1", name: "Página 1" }];
        let loadedActivePageId: string = "page-1";
        if (rawLayout && typeof rawLayout === "object") {
          const layout = rawLayout as { widgets?: unknown[]; theme?: DashboardTheme; pages?: StudioPage[]; activePageId?: string; savedMetrics?: SavedMetric[]; datasetConfig?: { derivedColumns?: { name: string; expression: string; defaultAggregation: string }[] } };
          if (Array.isArray(layout.pages) && layout.pages.length > 0) {
            loadedPages = layout.pages;
            loadedActivePageId = layout.activePageId ?? layout.pages[0].id;
          }
          const firstPageId = loadedPages[0].id;
          if (Array.isArray(layout.widgets)) {
            loadedWidgets = layout.widgets.map((w: unknown, i: number) => ({
              ...(w as object),
              gridOrder: (w as StudioWidget).gridOrder ?? i,
              gridSpan: (w as StudioWidget).gridSpan ?? 2,
              pageId: (w as StudioWidget).pageId ?? firstPageId,
            })) as StudioWidget[];
          }
          if (layout.theme) loadedTheme = mergeTheme(layout.theme);
        }
        if (!cancelled) {
          setWidgets(loadedWidgets);
          setGlobalFilters(Array.isArray(loadedGlobalFilters) ? loadedGlobalFilters : []);
          setDashboardTheme(loadedTheme);
          setPages(loadedPages);
          setActivePageId(loadedActivePageId);
          const layout = rawLayout as { savedMetrics?: SavedMetric[]; datasetConfig?: { derivedColumns?: { name: string; expression: string; defaultAggregation: string }[] } } | undefined;
          setSavedMetrics(Array.isArray(layout?.savedMetrics) ? layout.savedMetrics : []);
          setDerivedColumnsFromLayout(Array.isArray(layout?.datasetConfig?.derivedColumns) ? layout.datasetConfig.derivedColumns : []);
          setLayoutLoaded(true);
        }
      } catch (e) {
        if (!cancelled) toast.error("No se pudo cargar el dashboard");
      }
      loadedOnce.current = true;
    };
    load();
    return () => { cancelled = true; };
  }, [dashboardId]);

  // Cargar métricas reutilizables y columnas derivadas de los ETLs del dashboard (solo tras cargar layout)
  useEffect(() => {
    if (!layoutLoaded || !etlData || etlLoading || etlMetricsMergedRef.current) return;
    const etlIds = new Set<string>();
    if (etlData.etl?.id) etlIds.add(etlData.etl.id);
    etlData.dataSources?.forEach((s) => etlIds.add(s.etlId));
    if (etlIds.size === 0) return;
    etlMetricsMergedRef.current = true;
    let cancelled = false;
    (async () => {
      const all: SavedMetric[] = [];
      const allAnalyses: SavedAnalysis[] = [];
      const allDerived: { name: string; expression: string; defaultAggregation: string }[] = [];
      for (const etlId of etlIds) {
        try {
          const res = await fetch(`/api/etl/${etlId}/metrics`);
          const json = await safeJsonResponse<{ ok?: boolean; data?: { savedMetrics?: unknown[]; savedAnalyses?: unknown[]; datasetConfig?: { derivedColumns?: { name: string; expression: string; defaultAggregation: string }[] } } }>(res);
          if (json.ok && Array.isArray(json.data?.savedMetrics)) {
            all.push(...(json.data.savedMetrics as SavedMetric[]));
          }
          if (json.ok && Array.isArray(json.data?.savedAnalyses)) {
            allAnalyses.push(...(json.data.savedAnalyses as SavedAnalysis[]));
          }
          if (json.ok && Array.isArray(json.data?.datasetConfig?.derivedColumns)) {
            allDerived.push(...(json.data.datasetConfig.derivedColumns as { name: string; expression: string; defaultAggregation: string }[]));
          }
        } catch {
          // ignore per-ETL errors
        }
      }
      if (cancelled) return;
      setSavedMetrics((prev) => {
        const byName = new Set(prev.map((s) => s.name));
        const fromEtl = all.filter((m) => !byName.has(m.name));
        return fromEtl.length > 0 ? [...prev, ...fromEtl] : prev;
      });
      if (allAnalyses.length > 0) setSavedAnalyses(allAnalyses);
      if (allDerived.length > 0) {
        setDerivedColumnsFromLayout((prev) => {
          const byName = new Set(prev.map((d) => d.name.toLowerCase()));
          const newOnes = allDerived.filter((d) => !byName.has(d.name.toLowerCase()));
          return newOnes.length > 0 ? [...prev, ...newOnes] : prev;
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [layoutLoaded, etlData, etlLoading]);

  const saveDashboard = useCallback(async (overrides?: { widgets?: StudioWidget[] }) => {
    setIsSaving(true);
    try {
      const widgetsToSave = overrides?.widgets ?? widgets;
      const cleanWidgets = widgetsToSave.map(({ rows, config, columns, facetValues, diagnosticPreview, ...rest }) => rest);
      let datasetConfig: { derivedColumns: { name: string; expression: string; defaultAggregation: string }[] } | undefined;
      const etlId = etlData?.etl?.id ?? etlData?.dataSources?.[0]?.etlId;
      if (etlId) {
        try {
          const metricsRes = await fetch(`/api/etl/${etlId}/metrics`);
          const metricsJson = await safeJsonResponse<{ ok?: boolean; data?: { datasetConfig?: { derivedColumns?: { name: string; expression: string; defaultAggregation: string }[] } } }>(metricsRes);
          if (metricsJson?.ok && Array.isArray(metricsJson?.data?.datasetConfig?.derivedColumns) && metricsJson.data.datasetConfig.derivedColumns.length > 0) {
            datasetConfig = { derivedColumns: metricsJson.data.datasetConfig.derivedColumns };
          }
        } catch {
          // ignore
        }
      }
      const layoutPayload = {
        widgets: cleanWidgets,
        theme: dashboardTheme,
        pages,
        activePageId,
        savedMetrics,
        ...(datasetConfig && { datasetConfig }),
        ...((etlData as { datasetDimensions?: Record<string, Record<string, string>> })?.datasetDimensions && {
          datasetDimensions: (etlData as { datasetDimensions: Record<string, Record<string, string>> }).datasetDimensions,
        }),
      };
      const res = await fetch(`/api/dashboard/${dashboardId}/layout`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          layout: layoutPayload,
          global_filters_config: globalFilters,
        }),
      });
      const json = await safeJsonResponse(res);
      if (!res.ok || !json.ok) {
        throw new Error(json.error ?? "No se pudo guardar");
      }
      if (datasetConfig) setDerivedColumnsFromLayout(datasetConfig.derivedColumns);
      setLastSavedAt(new Date());
      setIsDirty(false);
      toast.success("Guardado");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setIsSaving(false);
    }
  }, [widgets, globalFilters, dashboardTheme, dashboardId, pages, activePageId, savedMetrics, etlData?.etl?.id, etlData?.dataSources]);

  const saveMetricAsTemplate = useCallback((name: string, metric: AggregationMetric) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const entry: SavedMetric = { id: `sm-${Date.now()}`, name: trimmed, metric: { ...metric, id: metric.id || `m-${Date.now()}` } };
    setSavedMetrics((prev) => {
      const existing = prev.find((s) => s.name === trimmed);
      if (existing) return prev.map((s) => (s.id === existing.id ? { ...s, name: trimmed, metric } : s));
      return [...prev, entry];
    });
    setIsDirty(true);
    toast.success(`Métrica "${trimmed}" guardada para reutilizar`);
  }, []);

  const getTableName = useCallback(
    async (widget?: StudioWidget | null): Promise<string | null> => {
      const sources = etlData?.dataSources;
      if (sources?.length) {
        const sourceId = widget?.dataSourceId ?? etlData?.primarySourceId ?? sources[0]?.id;
        const src = sources.find((s) => s.id === sourceId) ?? sources[0];
        if (src) return `${src.schema}.${src.tableName}`;
      }
      const etlId = etlData?.etl?.id;
      if (!etlId) return null;
      const supabase = createClient();
      const { data } = await supabase
        .from("etl_runs_log")
        .select("destination_schema, destination_table_name")
        .eq("etl_id", etlId)
        .eq("status", "completed")
        .order("completed_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!data?.destination_table_name) return null;
      const schema = (data as { destination_schema?: string }).destination_schema || "etl_output";
      return `${schema}.${(data as { destination_table_name: string }).destination_table_name}`;
    },
    [etlData?.etl?.id, etlData?.dataSources, etlData?.primarySourceId]
  );

  const loadMetricData = useCallback(
    async (widgetId: string) => {
      const widget = widgets.find((w) => w.id === widgetId);
      if (!widget || !etlData) return;
      const tableName = await getTableName(widget);
      if (!tableName) {
        setWidgets((prev) => prev.map((w) => (w.id === widgetId ? { ...w, isLoading: false } : w)));
        toast.warning("No hay ejecución completada del ETL");
        return;
      }
      setWidgets((prev) => prev.map((w) => (w.id === widgetId ? { ...w, isLoading: true } : w)));
      const filters = (widget.excludeGlobalFilters ? [] : globalFilters).filter(
        (f) => f.value !== "" && f.value != null
      );
      try {
        const agg = widget.aggregationConfig;
        const widgetForBuild = { type: widget.type, aggregationConfig: agg, source: widget.source, color: (widget as { color?: string }).color };
        if (agg?.enabled && agg.metrics.length > 0) {
          const dimensionsRaw = (agg as any).dimensions?.length > 0
            ? (agg as any).dimensions as string[]
            : [agg.dimension, agg.dimension2].filter(Boolean) as string[];
          const dimensions = dimensionsRaw
            .map((d) => String(d ?? "").trim())
            .filter((d) => !isInvalidIdentifierValue(d));
          const derivedByName = Object.fromEntries(
            derivedColumnsFromLayout.map((d) => [d.name.toLowerCase().trim(), d])
          );
          const widgetMetricId = String((widget as { metricId?: unknown }).metricId ?? "").trim();
          const widgetMetricIds = Array.isArray((widget as { metricIds?: unknown }).metricIds)
            ? ((widget as { metricIds?: unknown[] }).metricIds ?? []).map((id) => String(id ?? "").trim()).filter(Boolean)
            : [];
          const savedById = widgetMetricId
            ? savedMetrics.find((s) => String(s.id).trim() === widgetMetricId)
            : undefined;
          const metricsPayload = agg.metrics
            .map(({ id, ...m }) => {
              if (m.func === "FORMULA")
                return { formula: m.formula || "", alias: m.alias || "formula", field: "" };
              let expr = (m as { expression?: string }).expression;
              let fieldStr = m.field != null ? String(m.field).trim() : "";
              if (isInvalidIdentifierValue(fieldStr)) fieldStr = "";
              if (savedById && !expr && !fieldStr) {
                const first = (savedById as { aggregationConfig?: { metrics?: { field?: string; func?: string; alias?: string; expression?: string }[] }; metric?: { field?: string; func?: string; alias?: string; expression?: string } }).aggregationConfig?.metrics?.[0]
                  ?? (savedById as { metric?: { field?: string; func?: string; alias?: string; expression?: string } }).metric;
                if (first) {
                  const ex = (first as { expression?: string }).expression;
                  if (ex && String(ex).trim()) expr = String(ex).trim();
                  const f = String((first as { field?: string }).field ?? "").trim();
                  if (f) fieldStr = f;
                }
              }
              // Fallback legacy por nombre: solo cuando no hay vínculo por ID y falta definición explícita.
              if (!savedById && !expr && fieldStr) {
                const savedByName = savedMetrics.find((s) => (s.name || "").trim().toLowerCase() === fieldStr.toLowerCase());
                const first = (savedByName as { aggregationConfig?: { metrics?: { field?: string; func?: string; alias?: string; expression?: string }[] }; metric?: { field?: string; func?: string; alias?: string; expression?: string } } | undefined)?.aggregationConfig?.metrics?.[0]
                  ?? (savedByName as { metric?: { field?: string; func?: string; alias?: string; expression?: string } } | undefined)?.metric;
                if (first) {
                  const ex = (first as { expression?: string }).expression;
                  if (ex && String(ex).trim()) expr = String(ex).trim();
                  const f = String((first as { field?: string }).field ?? "").trim();
                  if (f && savedByName && f.toLowerCase() !== (savedByName.name || "").trim().toLowerCase()) fieldStr = f;
                }
              }
              const derived = fieldStr ? derivedByName[fieldStr.toLowerCase()] : undefined;
              const effectiveExpr = (expr && String(expr).trim()) || derived?.expression || "";
              const hasField = fieldStr !== "";
              const hasExpr = effectiveExpr !== "";
              if (!hasField && !hasExpr) return null;
              const metric: Record<string, unknown> = {
                field: fieldStr || "",
                func: m.func,
                alias: m.alias || `${m.func}_${(m.field || "valor")}`,
                ...(m.condition ? { condition: m.condition } : {}),
              };
              if (hasExpr) metric.expression = effectiveExpr;
              return metric;
            })
            .filter((item): item is NonNullable<typeof item> => item != null);
          if (metricsPayload.length === 0) {
            toast.warning("La métrica no tiene campos ni expresiones válidas. Revisá la configuración del widget.");
            setWidgets((prev) => prev.map((w) => (w.id === widgetId ? { ...w, isLoading: false } : w)));
            return;
          }
          const sourceId = widget.dataSourceId ?? etlData?.primarySourceId ?? etlData?.dataSources?.[0]?.id;
          const widgetEtlId = sourceId ? etlData?.dataSources?.find((s) => s.id === sourceId)?.etlId ?? etlData?.etl?.id : etlData?.etl?.id;
          const widgetDateFields = sourceId ? (etlData?.dataSources?.find((s) => s.id === sourceId)?.fields?.date ?? etlData?.fields?.date ?? []) : (etlData?.fields?.date ?? []);
          const primaryDimension = dimensions[0] ?? agg.dimension;
          const isDateDimension = primaryDimension && widgetDateFields.some((d: string) => (d || "").toLowerCase() === (primaryDimension || "").toLowerCase());
          const dateGroupByGranularity = (agg as { dateGroupByGranularity?: string }).dateGroupByGranularity;
          const metricAliasesForApi = metricsPayload.map((m: Record<string, unknown>) => m.alias as string).filter(Boolean);
          const isTemporalAxis =
            !!dateGroupByGranularity ||
            !!(primaryDimension && agg.dateDimension && String(primaryDimension).trim().toLowerCase() === String(agg.dateDimension ?? "").trim().toLowerCase()) ||
            !!isDateDimension;
          const rankingLimit = agg.chartRankingEnabled && agg.chartRankingTop && agg.chartRankingTop > 0 && !isTemporalAxis
            ? agg.chartRankingTop
            : undefined;
          const rankingOrderBy = rankingLimit && (agg.chartRankingMetric || metricAliasesForApi[0])
            ? { field: agg.chartRankingMetric || metricAliasesForApi[0], direction: "DESC" as const }
            : undefined;
          const toSavedMetricPayload = (s: SavedMetric) => {
            const first = (s as { aggregationConfig?: { metrics?: { field?: string; func?: string; alias?: string; expression?: string }[] }; metric?: { field?: string; func?: string; alias?: string; expression?: string } }).aggregationConfig?.metrics?.[0]
              ?? (s as { metric?: { field?: string; func?: string; alias?: string; expression?: string } }).metric;
            const name = String(s.name ?? "").trim();
            if (!first) return { name, field: name, func: "SUM", alias: name };
            const field = String((first as { field?: string }).field ?? "").trim() || name;
            const func = String((first as { func?: string }).func ?? "SUM");
            const alias = String((first as { alias?: string }).alias ?? name);
            const expression = (first as { expression?: string }).expression;
            return {
              name,
              field,
              func,
              alias,
              ...(expression && String(expression).trim() ? { expression: String(expression).trim() } : {}),
            };
          };
          // Priorizar métricas vinculadas por ID; usar nombre solo como fallback legado.
          const metricFieldNames = new Set(
            agg.metrics
              .filter((m) => m.func !== "FORMULA" && m.field != null && String(m.field).trim() !== "")
              .map((m) => String(m.field).trim().toLowerCase())
          );
          const idSet = new Set([widgetMetricId, ...widgetMetricIds].filter(Boolean));
          const savedByLinkedIds = savedMetrics.filter((s) => idSet.has(String(s.id).trim()));
          const savedMetricsForBody = (savedByLinkedIds.length > 0
            ? savedByLinkedIds
            : savedMetrics.filter((s) => (s.name || "").trim() && metricFieldNames.has((s.name || "").trim().toLowerCase()))
          ).map(toSavedMetricPayload);
          const aggregatePayload = {
            tableName,
            etlId: widgetEtlId || undefined,
            dimension: isInvalidIdentifierValue(agg.dimension) ? undefined : agg.dimension,
            dimensions: dimensions.length > 0 ? dimensions : undefined,
            chartType: agg.chartType || widget.type,
            chartXAxis: isInvalidIdentifierValue(agg.chartXAxis) ? undefined : agg.chartXAxis || undefined,
            ...(agg.geoHints ? { geoHints: agg.geoHints } : {}),
            metrics: metricsPayload,
            filters: [...(agg.filters || []), ...filters],
            orderBy: rankingOrderBy || agg.orderBy,
            limit: rankingLimit ?? agg.limit ?? 100,
            cumulative: agg.cumulative || "none",
            comparePeriod: agg.comparePeriod || undefined,
            dateDimension: agg.dateDimension || undefined,
            ...(dateGroupByGranularity && primaryDimension && { dateGroupBy: { field: primaryDimension, granularity: dateGroupByGranularity } }),
            ...((agg as { dateRangeFilter?: { field: string; last?: number; unit?: string; from?: string; to?: string } }).dateRangeFilter && {
              dateRangeFilter: (agg as { dateRangeFilter: { field: string; last?: number; unit?: "days" | "months"; from?: string; to?: string } }).dateRangeFilter,
            }),
            ...(derivedColumnsFromLayout.length > 0 && { derivedColumns: derivedColumnsFromLayout }),
            ...(savedMetricsForBody.length > 0 && { savedMetrics: savedMetricsForBody }),
          };
          setWidgets((prev) =>
            prev.map((w) =>
              w.id === widgetId
                ? {
                    ...w,
                    diagnosticPreview: {
                      endpoint: "/api/dashboard/aggregate-data",
                      payload: aggregatePayload,
                      source: "aggregate",
                      capturedAt: new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
                    },
                  }
                : w
            )
          );
          const loaded = await loadPreviewWidgetData({
            widget: widgetForBuild,
            tableName,
            etlId: widgetEtlId,
            sourceId,
            datasetDimensions: etlData.datasetDimensions,
            savedMetrics: savedMetrics as unknown as Array<{ name?: string; metric?: { field?: string; func?: string; alias?: string; expression?: string }; aggregationConfig?: { metrics?: Array<{ field?: string; func?: string; alias?: string; expression?: string }> } }>,
            globalFilters: [],
            aggregateEndpoint: "/api/dashboard/aggregate-data",
            rawEndpoint: "/api/dashboard/raw-data",
            rawLimit: 500,
            accentColor: (widget as { color?: string }).color ?? "",
            aggregateExtraPayload: aggregatePayload,
          });
          if (!loaded.hasData) {
            setWidgets((prev) =>
              prev.map((w) =>
                w.id === widgetId ? { ...w, config: { labels: [], datasets: [] }, rows: [], isLoading: false } : w
              )
            );
            return;
          }
          setWidgets((prev) =>
            prev.map((w) =>
              w.id === widgetId
                ? {
                    ...w,
                    config: loaded.chartConfig ?? { labels: [], datasets: [] },
                    rows: loaded.processedRows,
                    isLoading: false,
                  }
                : w
            )
          );
        } else {
          const rawPayload = { tableName, filters, limit: 500 };
          setWidgets((prev) =>
            prev.map((w) =>
              w.id === widgetId
                ? {
                    ...w,
                    diagnosticPreview: {
                      endpoint: "/api/dashboard/raw-data",
                      payload: rawPayload,
                      source: "raw",
                      capturedAt: new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
                    },
                  }
                : w
            )
          );
          const loaded = await loadPreviewWidgetData({
            widget: widgetForBuild,
            tableName,
            sourceId: widget.dataSourceId ?? etlData?.primarySourceId ?? etlData?.dataSources?.[0]?.id,
            datasetDimensions: etlData.datasetDimensions,
            globalFilters: filters,
            aggregateEndpoint: "/api/dashboard/aggregate-data",
            rawEndpoint: "/api/dashboard/raw-data",
            rawLimit: 500,
            accentColor: (widget as { color?: string }).color ?? "",
            rawExtraPayload: rawPayload,
          });
          if (!loaded.hasData) {
            setWidgets((prev) =>
              prev.map((w) =>
                w.id === widgetId ? { ...w, config: { labels: [], datasets: [] }, rows: [], isLoading: false } : w
              )
            );
            return;
          }
          setWidgets((prev) =>
            prev.map((w) =>
              w.id === widgetId
                ? {
                    ...w,
                    config: loaded.chartConfig ?? { labels: [], datasets: [] },
                    rows: loaded.processedRows,
                    isLoading: false,
                  }
                : w
            )
          );
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error al cargar datos");
        setWidgets((prev) => prev.map((w) => (w.id === widgetId ? { ...w, isLoading: false } : w)));
      }
    },
    [widgets, etlData, globalFilters, getTableName, derivedColumnsFromLayout, savedMetrics]
  );

  useEffect(() => {
    if (!addSourceOpen) return;
    const t = setTimeout(() => {
      setAddSourceLoading(true);
      searchEtls(addSourceQuery)
        .then(setAddSourceEtls)
        .finally(() => setAddSourceLoading(false));
    }, 300);
    return () => clearTimeout(t);
  }, [addSourceOpen, addSourceQuery]);

  const handleAddDataSource = useCallback(async () => {
    if (!addSourceSelected) return;
    setAddSourceSaving(true);
    try {
      const etl = addSourceEtls.find((e) => e.id === addSourceSelected);
      const res = await addDashboardDataSource(dashboardId, addSourceSelected, etl?.title ?? "Nueva fuente");
      if (!res.ok) {
        toast.error(res.error ?? "Error al añadir fuente");
        return;
      }
      toast.success("Fuente añadida");
      setAddSourceOpen(false);
      setAddSourceSelected(null);
      refetchEtlData();
    } finally {
      setAddSourceSaving(false);
    }
  }, [dashboardId, addSourceSelected, addSourceEtls, refetchEtlData]);

  const handleRemoveDataSource = useCallback(
    async (sourceId: string) => {
      const res = await removeDashboardDataSource(dashboardId, sourceId);
      if (!res.ok) {
        toast.error(res.error ?? "Error al quitar fuente");
        return;
      }
      toast.success("Fuente quitada");
      refetchEtlData();
    },
    [dashboardId, refetchEtlData]
  );

  const widgetsForCurrentPage = widgets.filter((w) => (w.pageId ?? "page-1") === activePageId);

  // Auto-cargar datos de todos los widgets al abrir el dashboard (solo una vez)
  useEffect(() => {
    if (!layoutLoaded || !etlData || etlLoading || widgets.length === 0 || autoLoadWidgetsDoneRef.current) return;
    autoLoadWidgetsDoneRef.current = true;
    const toLoad = widgets.filter((w) => w.aggregationConfig?.enabled);
    if (toLoad.length === 0) return;
    (async () => {
      setIsRunning(true);
      try {
        await Promise.all(toLoad.map((w) => loadMetricData(w.id)));
      } finally {
        setIsRunning(false);
      }
    })();
  }, [layoutLoaded, etlData, etlLoading, widgets, loadMetricData]);

  const runAllMetrics = useCallback(async () => {
    const toRun = activePageId ? widgets.filter((w) => (w.pageId ?? "page-1") === activePageId) : widgets;
    if (toRun.length === 0) return;
    setIsRunning(true);
    try {
      await Promise.all(toRun.map((w) => loadMetricData(w.id)));
      toast.success("Métricas actualizadas");
    } finally {
      setIsRunning(false);
    }
  }, [widgets, activePageId, loadMetricData]);

  const buildWidgetFromSavedMetric = useCallback(
    (saved: SavedMetricForm): StudioWidget => {
      const cfg = ((saved.aggregationConfig ?? {}) as Record<string, unknown>);
      const chartType = normalizeChartType((cfg.chartType as string | undefined) ?? saved.chartType ?? "bar");
      const dims = Array.isArray(cfg.dimensions) ? cfg.dimensions.map((d) => String(d)) : [cfg.dimension, cfg.dimension2].filter(Boolean).map((d) => String(d));
      const metrics = toAggregationMetricList(cfg.metrics, saved.metric);
      const currentPageWidgets = widgets.filter((w) => (w.pageId ?? "page-1") === activePageId);
      const sources = etlData?.dataSources;
      const primaryId = etlData?.primarySourceId ?? sources?.[0]?.id ?? null;
      const aggregationConfig: AggregationConfig = {
        ...(cfg as AggregationConfig),
        enabled: true,
        dimension: dims[0] || (typeof cfg.dimension === "string" ? cfg.dimension : undefined),
        dimension2: dims[1] || (typeof cfg.dimension2 === "string" ? cfg.dimension2 : undefined),
        dimensions: dims.length > 0 ? dims : undefined,
        metrics,
        chartType,
      };
      return {
        id: `w-${saved.id}-${Date.now()}`,
        type: chartType,
        title: saved.name,
        metricId: saved.id,
        x: 0,
        y: 0,
        w: 400,
        h: 280,
        gridOrder: currentPageWidgets.length,
        gridSpan: chartType === "kpi" ? 1 : 2,
        pageId: activePageId ?? "page-1",
        aggregationConfig,
        excludeGlobalFilters: false,
        dataSourceId: primaryId,
      };
    },
    [widgets, activePageId, etlData]
  );

  const buildWidgetFromSavedAnalysis = useCallback(
    (analysis: SavedAnalysis): StudioWidget => {
      const linkedSavedMetrics = (analysis.metricIds || [])
        .map((mid) => savedMetrics.find((s) => String(s.id) === String(mid)))
        .filter((s): s is SavedMetricForm => s != null);
      const firstMetricCfg = ((linkedSavedMetrics[0]?.aggregationConfig ?? {}) as Record<string, unknown>);
      const analysisCfg = (analysis as unknown as Record<string, unknown>);
      const mergedCfg = { ...firstMetricCfg, ...analysisCfg } as Record<string, unknown>;
      const firstLinked = linkedSavedMetrics[0];
      const legacyChartType =
        firstLinked && typeof (firstLinked as SavedMetricForm & { type?: unknown }).type === "string"
          ? String((firstLinked as SavedMetricForm & { type?: string }).type)
          : undefined;
      const chartType = normalizeChartType(
        mergedCfg.chartType ??
          firstMetricCfg.chartType ??
          firstLinked?.chartType ??
          legacyChartType ??
          "bar"
      );
      const dims = Array.isArray(mergedCfg.dimensions)
        ? mergedCfg.dimensions.map((d) => String(d))
        : [mergedCfg.dimension, mergedCfg.dimension2].filter(Boolean).map((d) => String(d));
      const metricsFromLinked = linkedSavedMetrics.flatMap((saved) => {
        const cfg = (saved.aggregationConfig ?? {}) as Record<string, unknown>;
        return toAggregationMetricList(cfg.metrics, saved.metric);
      });
      const metrics =
        metricsFromLinked.length > 0
          ? metricsFromLinked
          : toAggregationMetricList(mergedCfg.metrics);
      const currentPageWidgets = widgets.filter((w) => (w.pageId ?? "page-1") === activePageId);
      const sources = etlData?.dataSources;
      const primaryId = etlData?.primarySourceId ?? sources?.[0]?.id ?? null;
      const aggregationConfig: AggregationConfig = {
        ...(mergedCfg as AggregationConfig),
        enabled: true,
        dimension: dims[0] || (typeof mergedCfg.dimension === "string" ? mergedCfg.dimension : undefined),
        dimension2: dims[1] || (typeof mergedCfg.dimension2 === "string" ? mergedCfg.dimension2 : undefined),
        dimensions: dims.length > 0 ? dims : undefined,
        metrics,
        chartType,
      };
      return {
        id: `w-${analysis.id}-${Date.now()}`,
        type: chartType,
        title: analysis.name,
        analysisId: analysis.id,
        metricIds: [...(analysis.metricIds || [])],
        x: 0,
        y: 0,
        w: 400,
        h: 280,
        gridOrder: currentPageWidgets.length,
        gridSpan: chartType === "kpi" ? 1 : 2,
        pageId: activePageId ?? "page-1",
        aggregationConfig,
        excludeGlobalFilters: false,
        dataSourceId: primaryId,
      };
    },
    [widgets, activePageId, etlData, savedMetrics]
  );

  /** Añade al dashboard una métrica ya creada (del ETL). */
  const addSavedMetricToDashboard = useCallback(
    (saved: SavedMetricForm) => {
      const newWidget = buildWidgetFromSavedMetric(saved);
      const shouldLoadImmediately = Boolean(etlData);
      const existing = widgets.find((w) => String((w as { metricId?: unknown }).metricId ?? "").trim() === String(saved.id).trim());
      const targetWidgetId = existing?.id ?? newWidget.id;
      const newWidgets = existing
        ? widgets.map((w) =>
            w.id === existing.id
              ? {
                  ...w,
                  type: newWidget.type,
                  title: newWidget.title,
                  metricId: saved.id,
                  aggregationConfig: newWidget.aggregationConfig,
                  dataSourceId: newWidget.dataSourceId,
                  config: undefined,
                  rows: undefined,
                  isLoading: shouldLoadImmediately,
                }
              : w
          )
        : [...widgets, { ...newWidget, isLoading: shouldLoadImmediately }];
      setWidgets((prev) =>
        existing
          ? prev.map((w) =>
              w.id === existing.id
                ? {
                    ...w,
                    type: newWidget.type,
                    title: newWidget.title,
                    metricId: saved.id,
                    aggregationConfig: newWidget.aggregationConfig,
                    dataSourceId: newWidget.dataSourceId,
                    config: undefined,
                    rows: undefined,
                    isLoading: shouldLoadImmediately,
                  }
                : w
            )
          : [...prev, { ...newWidget, isLoading: shouldLoadImmediately }]
      );
      setSelectedId(null);
      setIsDirty(true);
      // Persistir alta/actualización para que no se pierda al refrescar.
      saveDashboard({ widgets: newWidgets });
      setAddMetricOpen(false);
      setAddMetricStep("list");
      setAddMetricInitialIntent(null);
      if (etlData) setTimeout(() => loadMetricData(targetWidgetId), 300);
    },
    [buildWidgetFromSavedMetric, etlData, loadMetricData, widgets, saveDashboard]
  );

  /** Añade al dashboard un análisis ya creado (métricas + dimensiones + tipo de gráfico). */
  const addSavedAnalysisToDashboard = useCallback(
    (analysis: SavedAnalysis) => {
      const newWidget = buildWidgetFromSavedAnalysis(analysis);
      const shouldLoadImmediately = Boolean(etlData);
      const existing = widgets.find((w) => String((w as { analysisId?: unknown }).analysisId ?? "").trim() === String(analysis.id).trim());
      const targetWidgetId = existing?.id ?? newWidget.id;
      const newWidgets = existing
        ? widgets.map((w) =>
            w.id === existing.id
              ? {
                  ...w,
                  type: newWidget.type,
                  title: newWidget.title,
                  analysisId: analysis.id,
                  metricIds: [...(analysis.metricIds || [])],
                  aggregationConfig: newWidget.aggregationConfig,
                  dataSourceId: newWidget.dataSourceId,
                  config: undefined,
                  rows: undefined,
                  isLoading: shouldLoadImmediately,
                }
              : w
          )
        : [...widgets, { ...newWidget, isLoading: shouldLoadImmediately }];
      setWidgets((prev) =>
        existing
          ? prev.map((w) =>
              w.id === existing.id
                ? {
                    ...w,
                    type: newWidget.type,
                    title: newWidget.title,
                    analysisId: analysis.id,
                    metricIds: [...(analysis.metricIds || [])],
                    aggregationConfig: newWidget.aggregationConfig,
                    dataSourceId: newWidget.dataSourceId,
                    config: undefined,
                    rows: undefined,
                    isLoading: shouldLoadImmediately,
                  }
                : w
            )
          : [...prev, { ...newWidget, isLoading: shouldLoadImmediately }]
      );
      setSelectedId(null);
      setIsDirty(true);
      // Persistir alta/actualización para que no se pierda al refrescar.
      saveDashboard({ widgets: newWidgets });
      setAddMetricOpen(false);
      setAddMetricStep("list");
      setAddMetricInitialIntent(null);
      if (etlData) setTimeout(() => loadMetricData(targetWidgetId), 300);
    },
    [buildWidgetFromSavedAnalysis, etlData, loadMetricData, widgets, saveDashboard]
  );

  const openAddMetricList = useCallback(() => {
    setAddMetricOpen(true);
    setAddMetricStep("list");
  }, []);

  const closeAddMetricModal = useCallback(() => {
    setAddMetricOpen(false);
    setAddMetricStep("list");
    setAddMetricInitialIntent(null);
  }, []);

  const deleteMetric = useCallback((widgetId: string) => {
    const newWidgets = widgets.filter((w) => w.id !== widgetId).map((w, i) => ({ ...w, gridOrder: i }));
    setWidgets(newWidgets);
    if (selectedId === widgetId) setSelectedId(null);
    setIsDirty(true);
    // Persistir en el servidor para que al refrescar la métrica siga eliminada
    saveDashboard({ widgets: newWidgets });
  }, [selectedId, widgets, saveDashboard]);

  const handleSave = useCallback(() => {
    saveDashboard();
  }, [saveDashboard]);

  const updateTheme = useCallback((patch: Partial<DashboardTheme>) => {
    setDashboardTheme((prev) => ({ ...prev, ...patch }));
    setIsDirty(true);
  }, []);

  const updateWidgetSize = useCallback((widgetId: string, patch: { gridSpan?: number; minHeight?: number }) => {
    setWidgets((prev) =>
      prev.map((w) => (w.id === widgetId ? { ...w, ...patch } : w))
    );
    setIsDirty(true);
  }, []);

  const [resizingWidgetId, setResizingWidgetId] = useState<string | null>(null);
  useEffect(() => {
    if (!resizingWidgetId || !resizeStateRef.current) return;
    const state = resizeStateRef.current;
    const cursor = state.edge === "se" ? "nwse-resize" : state.edge === "e" ? "ew-resize" : "ns-resize";
    document.body.style.cursor = cursor;
    document.body.style.userSelect = "none";
    const onMove = (e: PointerEvent) => {
      const dx = e.clientX - state.startX;
      const dy = e.clientY - state.startY;
      let gridSpan: number | undefined;
      let minHeight: number | undefined;
      if (state.edge === "e" || state.edge === "se") {
        const spanDelta = Math.round(dx / 60);
        gridSpan = Math.min(4, Math.max(1, state.startSpan + spanDelta));
      }
      if (state.edge === "s" || state.edge === "se") {
        minHeight = Math.min(600, Math.max(200, state.startMinHeight + dy));
      }
      updateWidgetSize(state.widgetId, { ...(gridSpan != null && { gridSpan }), ...(minHeight != null && { minHeight }) });
    };
    const onUp = () => {
      resizeStateRef.current = null;
      setResizingWidgetId(null);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [resizingWidgetId, updateWidgetSize]);

  const addPage = useCallback(() => {
    const id = `page-${Date.now()}`;
    setPages((prev) => [...prev, { id, name: "Nueva página" }]);
    setActivePageId(id);
    setIsDirty(true);
  }, []);

  const deletePage = useCallback(
    (pageId: string) => {
      if (pages.length <= 1) return;
      setWidgets((prev) => prev.filter((w) => (w.pageId ?? "page-1") !== pageId));
      setPages((prev) => prev.filter((p) => p.id !== pageId));
      if (activePageId === pageId) {
        const next = pages.find((p) => p.id !== pageId);
        setActivePageId(next?.id ?? null);
      }
      setIsDirty(true);
    },
    [pages, activePageId]
  );

  const renamePage = useCallback((pageId: string, name: string) => {
    setPages((prev) => prev.map((p) => (p.id === pageId ? { ...p, name: name.trim() || p.name } : p)));
    setIsDirty(true);
  }, []);

  const sortedWidgets = [...widgetsForCurrentPage].sort((a, b) => (a.gridOrder ?? 999) - (b.gridOrder ?? 999));
  const darkChartTheme = resolveDarkChartTheme(mergeTheme(dashboardTheme), true);

  const bgStyle = {
    backgroundColor: dashboardTheme.backgroundColor ?? undefined,
    backgroundImage: dashboardTheme.backgroundImageUrl
      ? `url(${dashboardTheme.backgroundImageUrl})`
      : undefined,
    backgroundSize: "cover",
    backgroundPosition: "center",
  };

  const cardStyle = {
    "--studio-card-bg": dashboardTheme.cardBackgroundColor ?? "var(--studio-surface)",
    "--studio-card-border-color": dashboardTheme.cardBorderColor ?? "var(--studio-border)",
    "--studio-card-border-width": `${dashboardTheme.cardBorderWidth ?? 1}px`,
    "--studio-card-radius": `${dashboardTheme.cardBorderRadius ?? 20}px`,
  } as CSSProperties;

  return (
    <div className="admin-dashboard-studio flex h-full flex-col min-h-0 text-[var(--studio-fg)]" style={bgStyle}>
      <StudioAppearanceBar theme={dashboardTheme} onThemeChange={updateTheme} />
      <StudioHeader
        dashboardId={dashboardId}
        title={title}
        etlId={etlData?.etl?.id ?? null}
        etlName={etlName}
        onEtlChange={refetchEtlData}
        status={status}
        lastUpdateLabel={lastUpdateLabel}
        mode={mode}
        onModeChange={setMode}
        isDirty={isDirty}
        isSaving={isSaving}
        onSave={handleSave}
        onRun={runAllMetrics}
        hideRunButton
      />
      {etlData?.etl?.id && widgetsForCurrentPage.length > 0 && (
        <div className="flex items-center justify-between gap-4 px-4 py-2 border-b border-[var(--studio-border)] bg-[var(--studio-accent-dim)]/50">
          <span className="text-xs font-medium text-[var(--studio-fg-muted)]">
            Este dashboard se sincroniza desde las métricas del ETL. Para añadir o editar métricas, usá la página de métricas.
          </span>
          <Link
            href={`/admin/etl/${etlData.etl.id}/metrics`}
            className="shrink-0 text-xs font-semibold text-[var(--studio-accent)] hover:underline"
          >
            Ir a métricas →
          </Link>
        </div>
      )}
      {etlData?.dataSources && etlData.dataSources.length > 0 && (
        <div className="flex items-center gap-2 px-4 py-2 border-b border-[var(--studio-border)] bg-[var(--studio-bg-elevated)]">
          <span className="text-xs font-medium text-[var(--studio-fg-muted)]">Fuentes de datos:</span>
          <div className="flex flex-wrap items-center gap-2">
            {etlData.dataSources.map((s) => (
              <span
                key={s.id}
                className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium bg-[var(--studio-accent-dim)] text-[var(--studio-accent)]"
              >
                {s.alias} ({s.etlName})
                <button
                  type="button"
                  onClick={() => handleRemoveDataSource(s.id)}
                  className="ml-0.5 rounded p-0.5 hover:bg-[var(--studio-accent)]/20"
                  aria-label={`Quitar ${s.alias}`}
                >
                  ×
                </button>
              </span>
            ))}
            <button
              type="button"
              onClick={() => setAddSourceOpen(true)}
              className="text-xs font-medium text-[var(--studio-accent)] hover:underline"
            >
              + Añadir fuente
            </button>
          </div>
        </div>
      )}
      {etlData && (
        <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-[var(--studio-border)] bg-[var(--studio-bg-elevated)]/80">
          <span className="text-xs font-medium text-[var(--studio-fg-muted)]">Filtros globales:</span>
          {globalFilters.map((gf) => (
            <span
              key={gf.id}
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium bg-[var(--studio-surface)] border border-[var(--studio-border)]"
            >
              <button
                type="button"
                onClick={() => setEditingFilterId(gf.id)}
                className="flex items-center gap-1 rounded hover:bg-[var(--studio-bg-elevated)] px-0.5 -mx-0.5"
                aria-label="Configurar filtro"
              >
                <Pencil className="h-3 w-3 text-[var(--studio-fg-muted)]" />
                {(gf as GlobalFilter).label || gf.field}
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setGlobalFilters((prev) => prev.filter((f) => f.id !== gf.id));
                  setIsDirty(true);
                }}
                className="ml-0.5 rounded p-0.5 hover:bg-red-500/20 hover:text-red-600"
                aria-label="Quitar filtro"
              >
                ×
              </button>
            </span>
          ))}
          <select
            className="rounded-md border border-[var(--studio-border)] bg-[var(--studio-bg)] px-2 py-1 text-xs text-[var(--studio-fg)]"
            value=""
            onChange={(e) => {
              const value = e.target.value;
              e.target.value = "";
              if (!value) return;
              const datasetDimensions = (etlData as { datasetDimensions?: Record<string, Record<string, string>> })?.datasetDimensions;
              const hasSemantic = datasetDimensions && Object.keys(datasetDimensions).length > 0 && etlData?.dataSources && etlData.dataSources.length > 1;
              const semanticLabels: Record<string, string> = { date: "Fecha", region: "Región" };
              const label = hasSemantic && semanticLabels[value] ? semanticLabels[value] : value;
              setGlobalFilters((prev) => [
                ...prev,
                {
                  id: `gf-${Date.now()}`,
                  field: value,
                  operator: "=",
                  value: "",
                  label,
                  inputType: "select",
                  applyTo: "all",
                },
              ]);
              setIsDirty(true);
            }}
          >
            <option value="">+ Añadir filtro</option>
            {((): React.ReactNode => {
              const datasetDimensions = (etlData as { datasetDimensions?: Record<string, Record<string, string>> })?.datasetDimensions;
              const hasSemantic = datasetDimensions && Object.keys(datasetDimensions).length > 0 && etlData?.dataSources && etlData.dataSources.length > 1;
              const semanticLabels: Record<string, string> = { date: "Fecha", region: "Región" };
              if (hasSemantic && datasetDimensions) {
                return Object.keys(datasetDimensions).map((key) => (
                  <option key={key} value={key}>
                    {semanticLabels[key] || key}
                  </option>
                ));
              }
              return (etlData?.fields?.all ?? []).map((field) => (
                <option key={field} value={field}>
                  {field}
                </option>
              ));
            })()}
          </select>
          <button
            type="button"
            onClick={() => setShowDiagnostics((prev) => !prev)}
            className={cn(
              "ml-auto rounded-md border px-2 py-1 text-xs font-medium transition-colors",
              showDiagnostics
                ? "border-[var(--studio-accent)] text-[var(--studio-accent)] bg-[var(--studio-accent-dim)]"
                : "border-[var(--studio-border)] text-[var(--studio-fg-muted)] hover:text-[var(--studio-fg)]"
            )}
          >
            {showDiagnostics ? "Ocultar diagnóstico" : "Mostrar diagnóstico"}
          </button>
        </div>
      )}
      <Dialog
        open={!!editingFilterId}
        onOpenChange={(open) => {
          if (!open) setEditingFilterId(null);
        }}
      >
        <DialogContent className="sm:max-w-md border border-[var(--studio-border)]">
          <DialogHeader>
            <DialogTitle className="text-[var(--studio-fg)]">Configurar filtro</DialogTitle>
            <DialogDescription className="text-[var(--studio-fg-muted)]">
              Tipo de filtro, etiqueta y a qué gráficos se aplica.
            </DialogDescription>
          </DialogHeader>
          {editFilterForm && etlData && (
            <div className="py-4 space-y-4">
              <div>
                <label className="text-xs font-medium text-[var(--studio-fg-muted)] block mb-1">Campo</label>
                <select
                  value={editFilterForm.field}
                  onChange={(e) => {
                    const newField = e.target.value;
                    const willBeDate =
                      newField === "date" ||
                      (etlData?.fields?.date ?? []).includes(newField) ||
                      (etlData?.dataSources ?? []).some((ds) => (ds.fields?.date ?? []).includes(newField));
                    const dateOps = ["YEAR", "MONTH", "DAY", "YEAR_MONTH", "SEMESTER", "QUARTER"];
                    setEditFilterForm((prev) =>
                      prev
                        ? {
                            ...prev,
                            field: newField,
                            ...(willBeDate && prev.operator && !dateOps.includes(prev.operator)
                              ? { operator: "YEAR" as const }
                              : {}),
                          }
                        : null
                    );
                  }}
                  className="w-full rounded-md border border-[var(--studio-border)] bg-[var(--studio-bg)] px-2 py-1.5 text-sm text-[var(--studio-fg)]"
                >
                  {((): React.ReactNode => {
                    const datasetDimensions = (etlData as { datasetDimensions?: Record<string, Record<string, string>> })?.datasetDimensions;
                    const hasSemantic = datasetDimensions && Object.keys(datasetDimensions).length > 0 && etlData?.dataSources && etlData.dataSources.length > 1;
                    const semanticLabels: Record<string, string> = { date: "Fecha", region: "Región" };
                    if (hasSemantic && datasetDimensions) {
                      return Object.keys(datasetDimensions).map((key) => (
                        <option key={key} value={key}>
                          {semanticLabels[key] || key}
                        </option>
                      ));
                    }
                    return (etlData?.fields?.all ?? []).map((field) => (
                      <option key={field} value={field}>
                        {field}
                      </option>
                    ));
                  })()}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-[var(--studio-fg-muted)] block mb-1">Etiqueta (opcional)</label>
                <Input
                  value={editFilterForm.label ?? ""}
                  onChange={(e) => setEditFilterForm((prev) => (prev ? { ...prev, label: e.target.value } : null))}
                  placeholder={editFilterForm.field}
                  className="border border-[var(--studio-border)] bg-[var(--studio-bg)]"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-[var(--studio-fg-muted)] block mb-1">Tipo de filtro</label>
                <select
                  value={editFilterForm.inputType ?? "select"}
                  onChange={(e) => {
                    const v = e.target.value as GlobalFilter["inputType"];
                    const isDate =
                      editFilterForm.field === "date" ||
                      (etlData?.fields?.date ?? []).includes(editFilterForm.field) ||
                      (etlData?.dataSources ?? []).some((ds) => (ds.fields?.date ?? []).includes(editFilterForm.field));
                    setEditFilterForm((prev) =>
                      prev
                        ? {
                            ...prev,
                            inputType: v,
                            operator: v === "multi" && !isDate ? "IN" : prev.operator ?? (isDate ? "YEAR" : "="),
                          }
                        : null
                    );
                  }}
                  className="w-full rounded-md border border-[var(--studio-border)] bg-[var(--studio-bg)] px-2 py-1.5 text-sm text-[var(--studio-fg)]"
                >
                  <option value="select">Lista desplegable</option>
                  <option value="multi">Selección múltiple</option>
                  <option value="search">Campo de búsqueda (escribir valores)</option>
                  <option value="number">Número</option>
                  <option value="date">Fecha</option>
                </select>
              </div>
              {(() => {
                const isDateField =
                  editFilterForm.field === "date" ||
                  (etlData?.fields?.date ?? []).includes(editFilterForm.field) ||
                  (etlData?.dataSources ?? []).some((ds) => (ds.fields?.date ?? []).includes(editFilterForm.field));
                return (
                  <div>
                    <label className="text-xs font-medium text-[var(--studio-fg-muted)] block mb-1">
                      {isDateField ? "Nivel de filtrado (fecha)" : "Condición"}
                    </label>
                    <select
                      value={
                        isDateField
                          ? ["YEAR", "MONTH", "DAY", "YEAR_MONTH", "SEMESTER", "QUARTER"].includes(
                              editFilterForm.operator ?? ""
                            )
                            ? editFilterForm.operator
                            : "YEAR"
                          : editFilterForm.operator ?? "="
                      }
                      onChange={(e) =>
                        setEditFilterForm((prev) => (prev ? { ...prev, operator: e.target.value } : null))
                      }
                      className="w-full rounded-md border border-[var(--studio-border)] bg-[var(--studio-bg)] px-2 py-1.5 text-sm text-[var(--studio-fg)]"
                    >
                      {isDateField ? (
                        <>
                          <option value="YEAR">AÑO</option>
                          <option value="MONTH">MES</option>
                          <option value="DAY">DÍA</option>
                          <option value="YEAR_MONTH">AÑO/MES</option>
                          <option value="DAY">AÑO/MES/DÍA</option>
                          <option value="SEMESTER">SEMESTRE</option>
                          <option value="QUARTER">TRIMESTRE</option>
                        </>
                      ) : (
                        <>
                          <option value="=">Igual</option>
                          <option value="!=">Distinto</option>
                          <option value="CONTAINS">Contiene</option>
                          <option value="STARTS_WITH">Comienza por</option>
                          <option value="ENDS_WITH">Termina en</option>
                          <option value=">">Mayor que</option>
                          <option value=">=">Mayor o igual</option>
                          <option value="<">Menor que</option>
                          <option value="<=">Menor o igual</option>
                        </>
                      )}
                    </select>
                  </div>
                );
              })()}
              <div>
                <label className="text-xs font-medium text-[var(--studio-fg-muted)] block mb-1">Aplicar a</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="applyTo"
                      checked={(editFilterForm.applyTo ?? "all") === "all"}
                      onChange={() =>
                        setEditFilterForm((prev) => (prev ? { ...prev, applyTo: "all" as const, applyToWidgetIds: undefined } : null))
                      }
                    />
                    <span className="text-sm">Todos los gráficos</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="applyTo"
                      checked={(editFilterForm.applyTo ?? "all") === "selected"}
                      onChange={() =>
                        setEditFilterForm((prev) => (prev ? { ...prev, applyTo: "selected" as const, applyToWidgetIds: [] } : null))
                      }
                    />
                    <span className="text-sm">Solo gráficos seleccionados</span>
                  </label>
                </div>
                {(editFilterForm.applyTo ?? "all") === "selected" && (
                  <div className="mt-2 max-h-40 overflow-y-auto rounded border border-[var(--studio-border)] p-2 space-y-1">
                    {widgets
                      .filter((w) => w.type !== "filter")
                      .map((w) => {
                        const checked = (editFilterForm.applyToWidgetIds ?? []).includes(w.id);
                        return (
                          <label key={w.id} className="flex items-center gap-2 cursor-pointer text-sm">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => {
                                setEditFilterForm((prev) => {
                                  if (!prev) return null;
                                  const ids = prev.applyToWidgetIds ?? [];
                                  const next = checked ? ids.filter((id) => id !== w.id) : [...ids, w.id];
                                  return { ...prev, applyToWidgetIds: next };
                                });
                              }}
                            />
                            <span className="truncate">{w.title || w.id || "Sin título"}</span>
                          </label>
                        );
                      })}
                    {widgets.filter((w) => w.type !== "filter").length === 0 && (
                      <p className="text-xs text-[var(--studio-fg-muted)]">No hay gráficos en el dashboard.</p>
                    )}
                  </div>
                )}
                {(editFilterForm.applyTo ?? "all") === "selected" &&
                  (() => {
                    const dataSources = (etlData as { dataSources?: { id: string; fields?: { all?: string[] } }[] })?.dataSources;
                    const datasetDimensions = (etlData as { datasetDimensions?: Record<string, Record<string, string>>; primarySourceId?: string })?.datasetDimensions;
                    const primarySourceId = (etlData as { primarySourceId?: string })?.primarySourceId ?? dataSources?.[0]?.id;
                    const selectedIds = editFilterForm.applyToWidgetIds ?? [];
                    const incompatible: { id: string; title: string }[] = [];
                    if (dataSources?.length && selectedIds.length > 0) {
                      for (const widgetId of selectedIds) {
                        const w = widgets.find((x) => x.id === widgetId);
                        if (!w || w.type === "filter") continue;
                        const widgetSourceId = w.dataSourceId ?? primarySourceId ?? dataSources[0]?.id;
                        const source = dataSources.find((s) => s.id === widgetSourceId) ?? dataSources[0];
                        const sourceFieldsAll = (source?.fields?.all ?? []).map((c: string) => (c || "").toLowerCase());
                        const resolvePhysical = (sem: string) => {
                          const bySource = datasetDimensions?.[sem];
                          if (bySource && widgetSourceId && bySource[widgetSourceId]) return bySource[widgetSourceId];
                          return sem;
                        };
                        const physical = resolvePhysical(editFilterForm.field);
                        const hasField = physical && sourceFieldsAll.some((c: string) => c === (physical || "").toLowerCase());
                        if (!hasField) incompatible.push({ id: w.id, title: w.title || w.id || "Sin título" });
                      }
                    }
                    if (incompatible.length === 0) return null;
                    return (
                      <div className="mt-2 rounded border border-amber-500/50 bg-amber-500/10 px-2 py-1.5 text-xs text-amber-800 dark:text-amber-200">
                        Los siguientes gráficos no contienen el campo &quot;{editFilterForm.field}&quot;:{" "}
                        {incompatible.map((x) => x.title).join(", ")}. El filtro no tendrá efecto en ellos.
                      </div>
                    );
                  })()}
              </div>
            </div>
          )}
          {editFilterForm && (
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setEditingFilterId(null)}>
                Cancelar
              </Button>
              <Button
                onClick={() => {
                  if (!editFilterForm) return;
                  const isDate =
                    editFilterForm.field === "date" ||
                    (etlData?.fields?.date ?? []).includes(editFilterForm.field) ||
                    (etlData?.dataSources ?? []).some((ds) => (ds.fields?.date ?? []).includes(editFilterForm.field));
                  const dateOps = ["YEAR", "MONTH", "DAY", "YEAR_MONTH", "SEMESTER", "QUARTER"];
                  const operator =
                    isDate && editFilterForm.operator && !dateOps.includes(editFilterForm.operator)
                      ? "YEAR"
                      : (editFilterForm.operator ?? "=");
                  setGlobalFilters((prev) =>
                    prev.map((f) =>
                      f.id === editingFilterId ? { ...editFilterForm, id: f.id, operator } : f
                    )
                  );
                  setEditingFilterId(null);
                  setIsDirty(true);
                }}
              >
                Guardar
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={addSourceOpen} onOpenChange={setAddSourceOpen}>
        <DialogContent className="sm:max-w-md border border-[var(--studio-border)]">
          <DialogHeader>
            <DialogTitle className="text-[var(--studio-fg)]">Añadir fuente de datos</DialogTitle>
            <DialogDescription className="text-[var(--studio-fg-muted)]">
              Elegí un ETL para usarlo como fuente adicional en este dashboard (ej. ventas, clientes, productos).
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-2">
            <Input
              placeholder="Buscar ETL..."
              value={addSourceQuery}
              onChange={(e) => setAddSourceQuery(e.target.value)}
              className="border border-[var(--studio-border)] bg-transparent"
            />
            <div className="max-h-[200px] overflow-y-auto rounded border border-[var(--studio-border)] p-2">
              {addSourceLoading ? (
                <div className="py-4 text-center text-sm text-[var(--studio-fg-muted)]">Buscando...</div>
              ) : addSourceEtls.length === 0 ? (
                <div className="py-4 text-center text-sm text-[var(--studio-fg-muted)]">No se encontraron ETLs</div>
              ) : (
                <div className="flex flex-col gap-1">
                  {addSourceEtls
                    .filter((e) => !etlData?.dataSources?.some((s) => s.etlId === e.id))
                    .map((etl) => (
                      <button
                        key={etl.id}
                        type="button"
                        onClick={() => setAddSourceSelected(etl.id)}
                        className={cn(
                          "flex items-center justify-between rounded px-3 py-2 text-left text-sm",
                          addSourceSelected === etl.id && "bg-[var(--studio-accent-dim)] text-[var(--studio-accent)]"
                        )}
                      >
                        {etl.title}
                        {addSourceSelected === etl.id && <Check className="h-4 w-4" />}
                      </button>
                    ))}
                </div>
              )}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setAddSourceOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleAddDataSource}
              disabled={!addSourceSelected || addSourceSaving}
            >
              {addSourceSaving ? "Añadiendo..." : "Añadir"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <StudioPageTabs
        pages={pages}
        activePageId={activePageId}
        onSelectPage={setActivePageId}
        onAddPage={addPage}
        onRenamePage={renamePage}
        onDeletePage={deletePage}
      />
      <main className="studio-main flex flex-1 min-h-0 overflow-hidden">
        <div className="flex flex-1 min-h-0 overflow-auto min-w-0">
        {widgetsForCurrentPage.length === 0 && sortedWidgets.length === 0 ? (
          <StudioEmptyState
            onAddMetrics={openAddMetricList}
            etlId={etlData?.etl?.id ?? etlData?.dataSources?.[0]?.etlId ?? null}
          />
        ) : (
          <div className="studio-canvas flex flex-1 flex-col gap-6 min-w-0">
            {isRunning && (
              <div className="studio-running-banner flex items-center gap-2 px-5 py-3 text-[var(--studio-text-body)] font-semibold">
                <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-current" />
                Analizando métricas…
              </div>
            )}
            <div className="studio-blocks">
              {sortedWidgets.map((w) => {
                const blockState: MetricBlockState = "estable";
                const insight =
                  w.rows && Array.isArray(w.rows)
                    ? `${w.rows.length} puntos de datos`
                    : "Ejecutá para actualizar";
                const chartType = normalizeChartType((w.aggregationConfig as { chartType?: string })?.chartType ?? w.type ?? "bar");
                let kpiValue: string | number | undefined;
                if (chartType === "kpi") {
                  const fromConfig = w.config?.datasets?.[0]?.data?.[0];
                  if (fromConfig != null) {
                    kpiValue = fromConfig;
                  } else if (Array.isArray(w.rows) && w.rows.length > 0) {
                    const firstRow = w.rows[0] as Record<string, unknown>;
                    const numVal = Object.values(firstRow).find((v) => Number.isFinite(Number(v)));
                    if (numVal != null) kpiValue = Number(numVal);
                  }
                }
                const span = Math.min(4, Math.max(1, w.gridSpan ?? 2));
                const isSelected = selectedId === w.id;
                const minH = w.minHeight ?? 280;
                const onResizeStart = (edge: string) => (e: React.PointerEvent) => {
                  e.stopPropagation();
                  e.preventDefault();
                  resizeStateRef.current = {
                    widgetId: w.id,
                    edge,
                    startSpan: span,
                    startMinHeight: minH,
                    startX: e.clientX,
                    startY: e.clientY,
                  };
                  setResizingWidgetId(w.id);
                  (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
                };
                return (
                  <div
                    key={w.id}
                    className="studio-block-cell"
                    data-selected={isSelected ? "true" : undefined}
                    style={{
                      gridColumn: `span ${span}`,
                      minHeight: minH,
                      ...cardStyle,
                    }}
                  >
                    {isSelected && (
                      <>
                        <div
                          role="presentation"
                          className="studio-resize-handle studio-resize-handle-e"
                          onPointerDown={onResizeStart("e")}
                        />
                        <div
                          role="presentation"
                          className="studio-resize-handle studio-resize-handle-s"
                          onPointerDown={onResizeStart("s")}
                        />
                        <div
                          role="presentation"
                          className="studio-resize-handle studio-resize-handle-se"
                          onPointerDown={onResizeStart("se")}
                        />
                      </>
                    )}
                    <MetricBlock
                      id={w.id}
                      title={w.title}
                      purpose={undefined}
                      state={blockState}
                      insight={insight}
                      chartConfig={w.config ?? undefined}
                      chartType={chartType}
                      isLoading={w.isLoading}
                      isSelected={isSelected}
                      onSelect={() => setSelectedId(w.id)}
                      onRun={() => loadMetricData(w.id)}
                      onDelete={() => deleteMetric(w.id)}
                      kpiValue={kpiValue}
                      tableRows={w.rows as Record<string, unknown>[] | undefined}
                      gridSpan={span}
                      minHeight={minH}
                      onSizeChange={(patch) => updateWidgetSize(w.id, patch)}
                      chartGridXDisplay={(w.aggregationConfig as { chartGridXDisplay?: boolean })?.chartGridXDisplay}
                      chartGridYDisplay={(w.aggregationConfig as { chartGridYDisplay?: boolean })?.chartGridYDisplay}
                      chartGridColor={(w.aggregationConfig as { chartGridColor?: string })?.chartGridColor}
                      chartAxisXVisible={(w.aggregationConfig as { chartAxisXVisible?: boolean })?.chartAxisXVisible}
                      chartAxisYVisible={(w.aggregationConfig as { chartAxisYVisible?: boolean })?.chartAxisYVisible}
                      widgetForRenderer={{
                        id: w.id,
                        type: chartType,
                        title: w.title,
                        config: w.config ?? undefined,
                        rows: w.rows,
                        aggregationConfig: w.aggregationConfig,
                        chartStyle: (w.chartStyle as Record<string, unknown> | undefined) ?? buildChartStyleFromAgg(w.aggregationConfig),
                        labelDisplayMode: (w as { labelDisplayMode?: "percent" | "value" | "both" }).labelDisplayMode,
                        chartMetricStyles: (() => {
                          const current = (w as { chartMetricStyles?: (ChartStyleConfig | undefined)[] }).chartMetricStyles;
                          return Array.isArray(current) && current.length > 0 ? current : buildChartMetricStyles(w.aggregationConfig);
                        })(),
                        diagnosticPreview: w.diagnosticPreview,
                        minHeight: minH,
                      }}
                      showTechnicalPreview={showDiagnostics}
                      darkChartTheme={darkChartTheme}
                    />
                  </div>
                );
              })}
              <div className="studio-block-cell studio-add-metric-cell" style={cardStyle}>
                <button
                  type="button"
                  onClick={() => setAddMetricOpen(true)}
                  className="studio-add-metric-card group h-full w-full min-h-[200px]"
                  aria-label="Añadir métrica"
                >
                  <span className="studio-add-metric-icon">
                    <Plus className="h-8 w-8" />
                  </span>
                  <span className="studio-add-metric-text">Añadir métrica</span>
                  <span className="studio-add-metric-hint">¿Qué querés entender?</span>
                </button>
              </div>
            </div>
          </div>
        )}
        </div>
      </main>

      <Dialog
        open={addMetricOpen}
        onOpenChange={(open) => {
          setAddMetricOpen(open);
          if (open) setAddMetricStep("list");
          if (!open) setAddMetricInitialIntent(null);
        }}
      >
        <DialogContent className="studio-modal-content border-0 p-0 gap-0 overflow-hidden max-h-[90vh] flex flex-col">
          <div className="studio-modal-inner p-6 pb-4">
            <DialogHeader>
              <DialogTitle>Añadir análisis</DialogTitle>
              <DialogDescription>
                Elegí un análisis ya creado para agregar al dashboard. Los análisis son gráficos configurados (métricas + dimensiones + tipo). Para crear nuevos, andá a Métricas del ETL y guardá un análisis en el paso C o D.
              </DialogDescription>
            </DialogHeader>
            {savedAnalyses.length > 0 ? (
              <div className="mt-4 space-y-2 max-h-[280px] overflow-y-auto rounded-lg border p-2" style={{ borderColor: "var(--studio-border)" }}>
                {savedAnalyses.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => addSavedAnalysisToDashboard(a)}
                    className="w-full flex items-center justify-between gap-3 rounded-xl px-4 py-3 text-left transition-colors hover:opacity-90"
                    style={{ background: "var(--studio-surface-hover)", color: "var(--studio-fg)" }}
                  >
                    <span className="font-medium truncate">{a.name}</span>
                    <span className="text-sm shrink-0" style={{ color: "var(--studio-accent)" }}>Añadir al dashboard</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm" style={{ color: "var(--studio-fg-muted)" }}>
                No hay análisis guardados para este ETL. En la página de métricas del ETL, completá el paso C (Análisis) o D (Gráfico) y usá «Guardar como análisis» para que aparezcan aquí.
              </p>
            )}
          </div>
          <div className="studio-modal-cta p-4 pt-0 border-t" style={{ borderColor: "var(--studio-border)" }}>
            {(etlData?.etl?.id ?? etlData?.dataSources?.[0]?.etlId) ? (
              <Link
                href={`/admin/etl/${etlData?.etl?.id ?? etlData?.dataSources?.[0]?.etlId}/metrics`}
                className="inline-flex items-center justify-center gap-2 w-full rounded-lg border px-4 py-3 text-sm font-medium transition-colors hover:opacity-90"
                style={{ borderColor: "var(--studio-border)", color: "var(--studio-accent)" }}
                onClick={() => setAddMetricOpen(false)}
              >
                <BarChart2 className="h-4 w-4" />
                Ir a métricas del ETL para crear nuevas
              </Link>
            ) : (
              <p className="text-sm" style={{ color: "var(--studio-fg-muted)" }}>
                Añadí una fuente de datos al dashboard para poder crear métricas.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
