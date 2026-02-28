"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { Plus, Check } from "lucide-react";
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
import { searchEtls, addDashboardDataSource, removeDashboardDataSource } from "@/app/admin/(main)/dashboard/actions";
import {
  type DashboardTheme,
  DEFAULT_DASHBOARD_THEME,
  mergeTheme,
} from "@/types/dashboard";
import { StudioHeader, type DashboardStatus, type StudioMode } from "./StudioHeader";
import { StudioAppearanceBar } from "./StudioAppearanceBar";
import { StudioPageTabs } from "./StudioPageTabs";
import { StudioEmptyState, STUDIO_INTENTS, type StudioIntent } from "./StudioEmptyState";
import { MetricBlock, type MetricBlockState } from "./MetricBlock";
import type { ChartConfig } from "./MetricBlock";
import { AddMetricConfigForm, type AddMetricFormConfig, type SavedMetricForm } from "./AddMetricConfigForm";

type SavedMetric = SavedMetricForm;

// Tipos compatibles con el layout guardado en DB (mismo formato que AdminDashboardEditor)
type AggregationMetric = {
  id: string;
  field: string;
  func: string;
  alias: string;
  condition?: { field: string; operator: string; value: unknown };
  formula?: string;
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
  metrics: AggregationMetric[];
  filters?: AggregationFilter[];
  orderBy?: { field: string; direction: "ASC" | "DESC" };
  limit?: number;
  cumulative?: "none" | "running_sum" | "ytd";
  comparePeriod?: "previous_year" | "previous_month";
  dateDimension?: string;
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
  labelDisplayMode?: "percent" | "value";
  color?: string;
  kpiSecondaryLabel?: string;
  kpiSecondaryValue?: string;
  /** ID de la fuente de datos (dashboard_data_sources) cuando el dashboard tiene múltiples ETLs */
  dataSourceId?: string | null;
  [key: string]: unknown;
};

type StudioPage = { id: string; name: string };
type GlobalFilter = { id: string; field: string; operator: string; value: unknown };

const INTENT_TO_TYPE_AND_TITLE: Record<
  StudioIntent,
  { type: string; title: string; purpose: string }
> = {
  detectar_cambios: { type: "line", title: "Cambios relevantes", purpose: "Ver qué está cambiando" },
  comparar_periodos: { type: "bar", title: "Comparación de períodos", purpose: "Antes vs ahora" },
  señales_negativas: { type: "bar", title: "Señales negativas", purpose: "Alertas y valores que bajan" },
  medir_impacto: { type: "kpi", title: "Impacto", purpose: "Efecto de una acción o campaña" },
  explorar_distribucion: { type: "doughnut", title: "Distribución", purpose: "Cómo se reparten los valores" },
};

interface AdminDashboardStudioProps {
  dashboardId: string;
  title: string;
  etlName?: string | null;
  createdAt?: string | null;
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
  const [addMetricStep, setAddMetricStep] = useState<"list" | "intent" | "config">("list");
  const [addSourceOpen, setAddSourceOpen] = useState(false);
  const [addSourceQuery, setAddSourceQuery] = useState("");
  const [addSourceEtls, setAddSourceEtls] = useState<{ id: string; title: string }[]>([]);
  const [addSourceLoading, setAddSourceLoading] = useState(false);
  const [addSourceSaving, setAddSourceSaving] = useState(false);
  const [addSourceSelected, setAddSourceSelected] = useState<string | null>(null);
  const [addMetricInitialIntent, setAddMetricInitialIntent] = useState<StudioIntent | "blank" | null>(null);
  const [pages, setPages] = useState<StudioPage[]>([{ id: "page-1", name: "Página 1" }]);
  const [activePageId, setActivePageId] = useState<string | null>("page-1");
  const [savedMetrics, setSavedMetrics] = useState<SavedMetric[]>([]);
  const [derivedColumnsFromLayout, setDerivedColumnsFromLayout] = useState<{ name: string; expression: string; defaultAggregation: string }[]>([]);
  const [layoutLoaded, setLayoutLoaded] = useState(false);
  const loadedOnce = useRef(false);
  const etlMetricsMergedRef = useRef(false);
  const autoLoadWidgetsDoneRef = useRef(false);

  const { data: etlData, loading: etlLoading, error: etlError, refetch: refetchEtlData } = useAdminDashboardEtlData(dashboardId);

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

  // Cargar métricas reutilizables de los ETLs del dashboard y fusionar con las del layout (solo tras cargar layout)
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
      for (const etlId of etlIds) {
        try {
          const res = await fetch(`/api/etl/${etlId}/metrics`);
          const json = await res.json();
          if (json.ok && Array.isArray(json.data?.savedMetrics)) {
            all.push(...(json.data.savedMetrics as SavedMetric[]));
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
    })();
    return () => {
      cancelled = true;
    };
  }, [layoutLoaded, etlData, etlLoading]);

  const saveDashboard = useCallback(async () => {
    setIsSaving(true);
    try {
      const cleanWidgets = widgets.map(({ rows, config, columns, facetValues, ...rest }) => rest);
      let datasetConfig: { derivedColumns: { name: string; expression: string; defaultAggregation: string }[] } | undefined;
      const etlId = etlData?.etl?.id ?? etlData?.dataSources?.[0]?.etlId;
      if (etlId) {
        try {
          const metricsRes = await fetch(`/api/etl/${etlId}/metrics`);
          const metricsJson = await metricsRes.json();
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
      };
      const res = await fetch(`/api/dashboard/${dashboardId}/layout`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          layout: layoutPayload,
          global_filters_config: globalFilters,
        }),
      });
      const json = await res.json();
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
        toast.warning("No hay ejecución completada del ETL");
        return;
      }
      setWidgets((prev) => prev.map((w) => (w.id === widgetId ? { ...w, isLoading: true } : w)));
      const filters = (widget.excludeGlobalFilters ? [] : globalFilters).filter(
        (f) => f.value !== "" && f.value != null
      );
      try {
        const agg = widget.aggregationConfig;
        if (agg?.enabled && agg.metrics.length > 0) {
          const dimensions = [agg.dimension, agg.dimension2].filter(Boolean) as string[];
          const derivedByName = Object.fromEntries(
            derivedColumnsFromLayout.map((d) => [d.name.toLowerCase().trim(), d])
          );
          const metricsPayload = agg.metrics
            .map(({ id, ...m }) => {
              if (m.func === "FORMULA")
                return { formula: m.formula || "", alias: m.alias || "formula", field: "" };
              const expr = (m as { expression?: string }).expression;
              const fieldStr = m.field != null ? String(m.field).trim() : "";
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
          const res = await fetch("/api/dashboard/aggregate-data", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              tableName,
              etlId: widgetEtlId || undefined,
              dimension: agg.dimension,
              dimensions: dimensions.length > 0 ? dimensions : undefined,
              metrics: metricsPayload,
              filters: [...(agg.filters || []), ...filters],
              orderBy: agg.orderBy,
              limit: agg.limit || 100,
              cumulative: agg.cumulative || "none",
              comparePeriod: agg.comparePeriod || undefined,
              dateDimension: agg.dateDimension || undefined,
              ...(derivedColumnsFromLayout.length > 0 && { derivedColumns: derivedColumnsFromLayout }),
            }),
          });
          const dataArray = await res.json();
          if (!res.ok) {
            const errMsg = (dataArray && typeof dataArray === "object" && dataArray.error) ? dataArray.error : "Error en agregación";
            throw new Error(typeof errMsg === "string" ? errMsg : "Error en agregación");
          }
          if (!Array.isArray(dataArray) || dataArray.length === 0) {
            setWidgets((prev) =>
              prev.map((w) =>
                w.id === widgetId ? { ...w, config: { labels: [], datasets: [] }, rows: [], isLoading: false } : w
              )
            );
            return;
          }
          const dim = agg.dimension || Object.keys(dataArray[0] || {})[0];
          const labels = dataArray.map((r: Record<string, unknown>) => String(r[dim] ?? ""));
          const palette = ["#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];
          const datasets = agg.metrics.map((metric, idx) => {
            const alias = metric.alias || (metric.func === "FORMULA" ? "formula" : `${metric.func}_${metric.field}`);
            const data = dataArray.map((r: Record<string, unknown>) => Number(r[alias] ?? 0));
            return {
              label: alias,
              data,
              backgroundColor: palette[idx % palette.length] + "99",
              borderColor: palette[idx % palette.length],
              borderWidth: 1,
            };
          });
          const config: ChartConfig = {
            labels,
            datasets: datasets.length > 0 ? datasets : [{ label: "valor", data: [], backgroundColor: palette[0], borderColor: "#fff", borderWidth: 1 }],
          };
          setWidgets((prev) =>
            prev.map((w) => (w.id === widgetId ? { ...w, config, rows: dataArray, isLoading: false } : w))
          );
        } else {
          const res = await fetch("/api/dashboard/raw-data", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tableName, filters, limit: 500 }),
          });
          if (!res.ok) throw new Error("Error al cargar datos");
          const dataArray = await res.json();
          if (!Array.isArray(dataArray) || dataArray.length === 0) {
            setWidgets((prev) =>
              prev.map((w) =>
                w.id === widgetId ? { ...w, config: { labels: [], datasets: [] }, rows: [], isLoading: false } : w
              )
            );
            return;
          }
          const sample = dataArray[0] as Record<string, unknown>;
          const keys = Object.keys(sample);
          const labelKey = keys.find((k) => typeof sample[k] === "string") || keys[0];
          const valueKey = keys.find((k) => typeof sample[k] === "number") || keys[1] || keys[0];
          const labels = dataArray.map((r: Record<string, unknown>) => String(r[labelKey] ?? ""));
          const data = dataArray.map((r: Record<string, unknown>) => Number(r[valueKey] ?? 0));
          const config: ChartConfig = {
            labels,
            datasets: [
              {
                label: String(valueKey),
                data,
                backgroundColor: "#0ea5e980",
                borderColor: "#0ea5e9",
                borderWidth: 1,
              },
            ],
          };
          setWidgets((prev) =>
            prev.map((w) => (w.id === widgetId ? { ...w, config, rows: dataArray, isLoading: false } : w))
          );
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error al cargar datos");
        setWidgets((prev) => prev.map((w) => (w.id === widgetId ? { ...w, isLoading: false } : w)));
      }
    },
    [widgets, etlData, globalFilters, getTableName, derivedColumnsFromLayout]
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

  const getInitialFormConfig = useCallback(
    (intentOrBlank: StudioIntent | "blank"): AddMetricFormConfig => {
      const sources = etlData?.dataSources;
      const primaryId = etlData?.primarySourceId ?? sources?.[0]?.id ?? null;
      const fields = sources?.length
        ? (sources.find((s) => s.id === primaryId) ?? sources[0])?.fields?.all ?? etlData?.fields?.all ?? []
        : etlData?.fields?.all ?? [];
      const dimension = fields[0] || "id";
      const metricField = fields.find((_, i) => i > 0) || dimension;
      const baseAgg: AggregationConfig = {
        enabled: true,
        dimension,
        metrics: [{ id: `m-${Date.now()}`, field: metricField, func: "COUNT", alias: "total" }],
        orderBy: { field: dimension, direction: "DESC" },
        limit: 10,
      };
      if (intentOrBlank === "blank") {
        return {
          title: "Nueva métrica",
          type: "bar",
          gridSpan: 2,
          color: "#22d3ee",
          aggregationConfig: baseAgg,
          dataSourceId: primaryId,
        };
      }
      const { type: chartType, title: semanticTitle } = INTENT_TO_TYPE_AND_TITLE[intentOrBlank];
      return {
        title: semanticTitle,
        type: chartType,
        gridSpan: chartType === "kpi" ? 1 : 2,
        color: "#22d3ee",
        aggregationConfig: baseAgg,
        dataSourceId: primaryId,
      };
    },
    [etlData]
  );

  const createMetricFromFormConfig = useCallback(
    (config: AddMetricFormConfig) => {
      const id = `metric-${Date.now()}`;
      const currentPageWidgets = widgets.filter((w) => (w.pageId ?? "page-1") === activePageId);
      const newWidget: StudioWidget = {
        id,
        type: config.type,
        title: config.title,
        x: 0,
        y: 0,
        w: 400,
        h: 280,
        gridOrder: currentPageWidgets.length,
        gridSpan: config.gridSpan ?? 2,
        minHeight: undefined,
        pageId: activePageId ?? "page-1",
        aggregationConfig: config.aggregationConfig,
        excludeGlobalFilters: config.excludeGlobalFilters,
        color: config.color,
        labelDisplayMode: config.labelDisplayMode,
        kpiSecondaryLabel: config.kpiSecondaryLabel,
        kpiSecondaryValue: config.kpiSecondaryValue,
        dataSourceId: config.dataSourceId ?? null,
      };
      setWidgets((prev) => [...prev, newWidget]);
      setSelectedId(null);
      setIsDirty(true);
      setAddMetricOpen(false);
      setAddMetricStep("list");
      setAddMetricInitialIntent(null);
      if (etlData) setTimeout(() => loadMetricData(id), 300);
    },
    [etlData, widgets, activePageId, loadMetricData]
  );

  /** Añade al dashboard una métrica ya creada (del ETL). */
  const addSavedMetricToDashboard = useCallback(
    (saved: SavedMetricForm) => {
      const cfg = (saved.aggregationConfig ?? {}) as Record<string, unknown>;
      const chartType = (cfg.chartType as string) || saved.chartType || "bar";
      const dims = Array.isArray(cfg.dimensions) ? cfg.dimensions : [cfg.dimension, cfg.dimension2].filter(Boolean) as string[];
      const metricsArr = Array.isArray(cfg.metrics) ? cfg.metrics : [saved.metric];
      const currentPageWidgets = widgets.filter((w) => (w.pageId ?? "page-1") === activePageId);
      const newWidget: StudioWidget = {
        id: `w-${saved.id}-${Date.now()}`,
        type: chartType,
        title: saved.name,
        x: 0,
        y: 0,
        w: 400,
        h: 280,
        gridOrder: currentPageWidgets.length,
        gridSpan: chartType === "kpi" ? 1 : 2,
        pageId: activePageId ?? "page-1",
        aggregationConfig: {
          enabled: true,
          dimension: dims[0] || undefined,
          dimension2: dims[1] || undefined,
          metrics: metricsArr.map((m: any) => ({
            id: m.id || `m-${Date.now()}`,
            field: m.field || "",
            func: m.func || "SUM",
            alias: m.alias || "",
            condition: m.condition,
            formula: m.formula,
            expression: m.expression,
          })),
          filters: Array.isArray(cfg.filters) ? cfg.filters : undefined,
          orderBy: cfg.orderBy as { field: string; direction: "ASC" | "DESC" } | undefined,
          limit: (cfg.limit as number) ?? 100,
        },
        excludeGlobalFilters: false,
        dataSourceId: null,
      };
      setWidgets((prev) => [...prev, newWidget]);
      setSelectedId(null);
      setIsDirty(true);
      setAddMetricOpen(false);
      setAddMetricStep("list");
      setAddMetricInitialIntent(null);
      if (etlData) setTimeout(() => loadMetricData(newWidget.id), 300);
    },
    [widgets, activePageId, etlData, loadMetricData]
  );

  const openAddMetricConfig = useCallback((intentOrBlank: StudioIntent | "blank") => {
    setAddMetricOpen(true);
    setAddMetricInitialIntent(intentOrBlank);
    setAddMetricStep("config");
  }, []);

  const closeAddMetricModal = useCallback(() => {
    setAddMetricOpen(false);
    setAddMetricStep("list");
    setAddMetricInitialIntent(null);
  }, []);

  const deleteMetric = useCallback((widgetId: string) => {
    setWidgets((prev) => prev.filter((w) => w.id !== widgetId).map((w, i) => ({ ...w, gridOrder: i })));
    if (selectedId === widgetId) setSelectedId(null);
    setIsDirty(true);
  }, [selectedId]);

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
            onSelectIntent={openAddMetricConfig}
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
                const chartType =
                  w.type === "horizontalBar" ? "bar" : (w.type as "bar" | "line" | "pie" | "doughnut" | "kpi" | "table");
                let kpiValue: string | number | undefined;
                if (w.type === "kpi" && w.config?.datasets?.[0]?.data?.[0] != null) {
                  kpiValue = w.config.datasets[0].data[0];
                }
                const span = Math.min(4, Math.max(1, w.gridSpan ?? 2));
                return (
                  <div
                    key={w.id}
                    className="studio-block-cell"
                    style={{
                      gridColumn: `span ${span}`,
                      minHeight: w.minHeight ?? 280,
                      ...cardStyle,
                    }}
                  >
                    <MetricBlock
                      id={w.id}
                      title={w.title}
                      purpose={undefined}
                      state={blockState}
                      insight={insight}
                      chartConfig={w.config ?? undefined}
                      chartType={chartType}
                      isLoading={w.isLoading}
                      isSelected={selectedId === w.id}
                      onSelect={() => setSelectedId(w.id)}
                      onRun={() => loadMetricData(w.id)}
                      onDelete={() => deleteMetric(w.id)}
                      kpiValue={kpiValue}
                      tableRows={w.rows as Record<string, unknown>[] | undefined}
                      gridSpan={span}
                      minHeight={w.minHeight ?? 280}
                      onSizeChange={(patch) => updateWidgetSize(w.id, patch)}
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
          if (!open) {
            setAddMetricStep("list");
            setAddMetricInitialIntent(null);
          }
        }}
      >
        <DialogContent className="studio-modal-content border-0 p-0 gap-0 overflow-hidden max-h-[90vh] flex flex-col">
          {addMetricStep === "config" && addMetricInitialIntent != null ? (
            <div className="studio-modal-inner p-6 overflow-auto">
              <AddMetricConfigForm
                initialValues={getInitialFormConfig(addMetricInitialIntent)}
                etlData={etlData ?? null}
                onSave={createMetricFromFormConfig}
                onBack={() => {
                  setAddMetricStep("intent");
                  setAddMetricInitialIntent(null);
                }}
                savedMetrics={savedMetrics}
                onSaveMetricAsTemplate={saveMetricAsTemplate}
              />
            </div>
          ) : addMetricStep === "list" ? (
            <>
              <div className="studio-modal-inner p-6 pb-4">
                <DialogHeader>
                  <DialogTitle>Añadir métrica</DialogTitle>
                  <DialogDescription>
                    Elegí una métrica ya creada para este ETL o creá una nueva.
                  </DialogDescription>
                </DialogHeader>
                {savedMetrics.length > 0 ? (
                  <div className="mt-4 space-y-2 max-h-[280px] overflow-y-auto rounded-lg border p-2" style={{ borderColor: "var(--studio-border)" }}>
                    {savedMetrics.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => addSavedMetricToDashboard(m)}
                        className="w-full flex items-center justify-between gap-3 rounded-xl px-4 py-3 text-left transition-colors hover:opacity-90"
                        style={{ background: "var(--studio-surface-hover)", color: "var(--studio-fg)" }}
                      >
                        <span className="font-medium truncate">{m.name}</span>
                        <span className="text-sm shrink-0" style={{ color: "var(--studio-accent)" }}>Añadir al dashboard</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-sm" style={{ color: "var(--studio-fg-muted)" }}>
                    No hay métricas creadas para este ETL. Creá una desde la página de métricas o desde cero aquí.
                  </p>
                )}
              </div>
              <div className="studio-modal-cta p-4 pt-0 border-t" style={{ borderColor: "var(--studio-border)" }}>
                <Button type="button" variant="outline" className="w-full" onClick={() => setAddMetricStep("intent")}>
                  <Plus className="mr-2 h-4 w-4" />
                  Crear nueva métrica
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="studio-modal-inner p-6">
                <DialogHeader>
                  <DialogTitle>Crear nueva métrica</DialogTitle>
                  <DialogDescription>
                    ¿Qué querés entender? Elegí una intención o creá una métrica desde cero.
                  </DialogDescription>
                </DialogHeader>
                <div className="studio-modal-intents">
                  {STUDIO_INTENTS.map((item) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        className="studio-modal-intent-card group"
                        onClick={() => openAddMetricConfig(item.id)}
                      >
                        <span className="studio-intent-icon">
                          <Icon className="h-5 w-5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <span className="studio-intent-label block">{item.label}</span>
                          <span className="studio-intent-desc block">{item.description}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="studio-modal-cta p-4 border-t" style={{ borderColor: "var(--studio-border)" }}>
                <Button type="button" variant="outline" className="w-full" onClick={() => openAddMetricConfig("blank")}>
                  <Plus className="mr-2 h-4 w-4" />
                  Crear métrica vacía
                </Button>
                <button type="button" className="w-full mt-2 text-sm underline" style={{ color: "var(--studio-fg-muted)" }} onClick={() => setAddMetricStep("list")}>
                  ← Volver a métricas del ETL
                </button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
