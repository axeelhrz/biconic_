"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { Plus, Check, BarChart2 } from "lucide-react";
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
  chartRankingEnabled?: boolean;
  chartRankingTop?: number;
  chartRankingMetric?: string;
  filters?: AggregationFilter[];
  orderBy?: { field: string; direction: "ASC" | "DESC" };
  limit?: number;
  dateDimension?: string;
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
  chartRankingEnabled?: boolean;
  chartRankingTop?: number;
  chartRankingMetric?: string;
  chartColorScheme?: string;
  showDataLabels?: boolean;
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
  /** Si la dimensión es fecha, agrupar por este nivel. */
  dateGroupByGranularity?: "day" | "week" | "month" | "quarter" | "semester" | "year";
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
  const [addMetricStep, setAddMetricStep] = useState<"list">("list");
  const [addSourceOpen, setAddSourceOpen] = useState(false);
  const [addSourceQuery, setAddSourceQuery] = useState("");
  const [addSourceEtls, setAddSourceEtls] = useState<{ id: string; title: string }[]>([]);
  const [addSourceLoading, setAddSourceLoading] = useState(false);
  const [addSourceSaving, setAddSourceSaving] = useState(false);
  const [addSourceSelected, setAddSourceSelected] = useState<string | null>(null);
  const [addMetricInitialIntent, setAddMetricInitialIntent] = useState<string | null>(null);
  const [pages, setPages] = useState<StudioPage[]>([{ id: "page-1", name: "Página 1" }]);
  const [activePageId, setActivePageId] = useState<string | null>("page-1");
  const [savedMetrics, setSavedMetrics] = useState<SavedMetric[]>([]);
  const [savedAnalyses, setSavedAnalyses] = useState<SavedAnalysis[]>([]);
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
      const cleanWidgets = widgetsToSave.map(({ rows, config, columns, facetValues, ...rest }) => rest);
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

  const buildChartConfigFromAgg = useCallback(
    (agg: AggregationConfig, dataArray: Record<string, unknown>[], widgetType?: string): ChartConfig => {
      const defaultPalette = [
        "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899",
        "#14b8a6", "#f97316", "#06b6d4", "#3b82f6", "#22c55e", "#a855f7",
        "#eab308", "#64748b", "#db2777", "#0d9488", "#7c3aed", "#dc2626",
        "#2563eb", "#059669", "#d97706", "#4f46e5", "#e11d48", "#0891b2",
      ];
      const seriesColors = agg.chartSeriesColors;
      const colorKeys = seriesColors ? Object.keys(seriesColors) : [];
      const aliasForYKey = (yKey: string): string => {
        const match = yKey.match(/^metric_(\d+)$/);
        if (match && agg.metrics[Number(match[1])]) {
          return agg.metrics[Number(match[1])].alias || yKey;
        }
        return yKey;
      };
      const resolveColor = (key: string): string | undefined => {
        if (!seriesColors) return undefined;
        const k = (key ?? "").trim();
        return seriesColors[key] ?? seriesColors[k] ?? (key.match(/^metric_\d+$/) ? seriesColors[aliasForYKey(key)] : undefined);
      };
      const getColor = (label: string, idx: number) => {
        const c = resolveColor(label) ?? resolveColor(aliasForYKey(label)) ?? (colorKeys[idx] != null ? seriesColors?.[colorKeys[idx]!] : undefined);
        return c ?? defaultPalette[idx % defaultPalette.length]!;
      };
      const getColorByLabelStable = (label: string) => {
        const c = resolveColor(label) ?? resolveColor(aliasForYKey(label));
        if (c) return c;
        let hash = 0;
        const s = String(label ?? "");
        for (let i = 0; i < s.length; i++) hash = ((hash << 5) - hash) + s.charCodeAt(i);
        return defaultPalette[Math.abs(hash) % defaultPalette.length]!;
      };

      const overrides = agg.chartLabelOverrides;
      const labelOverride = (v: string) => {
        if (!overrides) return v;
        const s = String(v ?? "").trim();
        if (s === "") return v;
        if (s in overrides) return overrides[s]!;
        for (const [k, val] of Object.entries(overrides)) {
          if (String(k).trim() === s) return val;
        }
        return v;
      };

      const effectiveChartType = agg.chartType || widgetType || "bar";
      const isPieOrDoughnut = effectiveChartType === "pie" || effectiveChartType === "doughnut";
      const resultKeys = Object.keys(dataArray[0] || {});
      const metricAliases = agg.metrics.map((m) => m.alias || (m.func === "FORMULA" ? "formula" : `${m.func}_${m.field}`));

      const xKey = (agg.chartXAxis && resultKeys.includes(agg.chartXAxis))
        ? agg.chartXAxis
        : agg.dimension || resultKeys.find((k) => !metricAliases.includes(k)) || resultKeys[0];
      const yKeys = (agg.chartYAxes && agg.chartYAxes.length > 0)
        ? agg.chartYAxes.filter((k) => resultKeys.includes(k))
        : metricAliases.filter((k) => resultKeys.includes(k));
      if (yKeys.length === 0) {
        const fallback = resultKeys.filter((k) => k !== xKey);
        yKeys.push(...(fallback.length > 0 ? fallback : resultKeys));
      }

      let rows = [...dataArray];
      if (agg.chartRankingEnabled && agg.chartRankingTop && agg.chartRankingTop > 0) {
        const rKey = (agg.chartRankingMetric && resultKeys.includes(agg.chartRankingMetric))
          ? agg.chartRankingMetric
          : (yKeys[0] || resultKeys.find((k) => k !== xKey) || resultKeys[0]);
        if (rKey) {
          rows.sort((a, b) => Number((b as Record<string, unknown>)[rKey] ?? 0) - Number((a as Record<string, unknown>)[rKey] ?? 0));
        }
        rows = rows.slice(0, agg.chartRankingTop);
      } else if (agg.chartSortDirection && agg.chartSortDirection !== "none") {
        const sortField = agg.chartSortBy === "dimension" ? xKey : (yKeys[0] || xKey);
        const dir = agg.chartSortDirection === "asc" ? 1 : -1;
        const axisOrder = (agg as { chartAxisOrder?: string }).chartAxisOrder;
        rows.sort((a, b) => {
          if (sortField === xKey && axisOrder && ["alpha", "date_asc", "date_desc"].includes(axisOrder)) {
            const va = (a as Record<string, unknown>)[xKey!];
            const vb = (b as Record<string, unknown>)[xKey!];
            const sa = String(va ?? "");
            const sb = String(vb ?? "");
            if (axisOrder === "date_asc" || axisOrder === "date_desc") {
              const ta = typeof va === "string" || typeof va === "number" ? new Date(va as string | number).getTime() : 0;
              const tb = typeof vb === "string" || typeof vb === "number" ? new Date(vb as string | number).getTime() : 0;
              return axisOrder === "date_asc" ? ta - tb : tb - ta;
            }
            return axisOrder === "alpha" ? sa.localeCompare(sb, undefined, { numeric: true }) : sb.localeCompare(sa, undefined, { numeric: true });
          }
          const va = Number(a[sortField!] ?? 0);
          const vb = Number(b[sortField!] ?? 0);
          return isNaN(va) || isNaN(vb)
            ? String(a[sortField!] ?? "").localeCompare(String(b[sortField!] ?? "")) * dir
            : (va - vb) * dir;
        });
      }

      const seriesField = agg.chartSeriesField;
      let labels: string[];
      let datasets: ChartConfig["datasets"];

      if (seriesField && resultKeys.includes(seriesField) && !isPieOrDoughnut) {
        const uniqueX = [...new Set(rows.map((r) => String(r[xKey!] ?? "")))];
        labels = uniqueX.map(labelOverride);
        const seriesValues = [...new Set(rows.map((r) => String(r[seriesField] ?? "")))];
        datasets = seriesValues.map((sv, idx) => {
          const color = getColor(sv, idx);
          return {
            label: labelOverride(sv),
            data: uniqueX.map((xv) => {
              const match = rows.find((r) => String(r[xKey!] ?? "") === xv && String(r[seriesField] ?? "") === sv);
              return match ? Number(match[yKeys[0]!] ?? 0) : 0;
            }),
            backgroundColor: color + "99",
            borderColor: color,
            borderWidth: 1,
          };
        });
      } else if (isPieOrDoughnut) {
        labels = rows.map((r) => labelOverride(String(r[xKey!] ?? "")));
        const firstYKey = yKeys[0] || metricAliases[0] || resultKeys.find((k) => k !== xKey) || resultKeys[0];
        const displayLabel = aliasForYKey(firstYKey!);
        const sliceColors = labels.map((l) => getColorByLabelStable(l));
        const hoverColors = sliceColors.map((c) => {
          const hex = String(c).replace(/^#/, "");
          if (hex.length >= 6) {
            const r = Math.min(255, (parseInt(hex.slice(0, 2), 16) || 0) + 28);
            const g = Math.min(255, (parseInt(hex.slice(2, 4), 16) || 0) + 28);
            const b = Math.min(255, (parseInt(hex.slice(4, 6), 16) || 0) + 28);
            return `rgb(${r},${g},${b})`;
          }
          return c;
        });
        datasets = [{
          label: displayLabel,
          data: rows.map((r) => Number(r[firstYKey!] ?? 0)),
          backgroundColor: sliceColors,
          hoverBackgroundColor: hoverColors,
          borderColor: "#fff",
          borderWidth: 2,
        }];
      } else if (effectiveChartType === "combo" && yKeys.length >= 2) {
        labels = rows.map((r) => labelOverride(String(r[xKey!] ?? "")));
        const label0 = aliasForYKey(yKeys[0]!);
        const label1 = aliasForYKey(yKeys[1]!);
        datasets = [
          {
            label: label0,
            data: rows.map((r) => Number(r[yKeys[0]!] ?? 0)),
            backgroundColor: getColor(label0, 0) + "80",
            borderColor: getColor(label0, 0),
            borderWidth: 2,
            type: "bar" as const,
            yAxisID: "y",
          },
          {
            label: label1,
            data: rows.map((r) => Number(r[yKeys[1]!] ?? 0)),
            backgroundColor: getColor(label1, 1) + "20",
            borderColor: getColor(label1, 1),
            borderWidth: 2,
            type: "line" as const,
            fill: false,
            yAxisID: "y1",
          },
        ];
      } else {
        labels = rows.map((r) => labelOverride(String(r[xKey!] ?? "")));
        const isBarOrHorizontalBar = effectiveChartType === "bar" || effectiveChartType === "horizontalBar";
        const oneMetricManyCategories = isBarOrHorizontalBar && yKeys.length === 1 && labels.length > 0;
        if (oneMetricManyCategories) {
          const yKey = yKeys[0]!;
          const displayLabel = aliasForYKey(yKey);
          const barColors = labels.map((l) => getColorByLabelStable(l));
          datasets = [{
            label: displayLabel,
            data: rows.map((r) => Number(r[yKey] ?? 0)),
            backgroundColor: barColors.map((c) => c + "99"),
            borderColor: barColors,
            borderWidth: 1,
          }];
        } else {
          datasets = yKeys.map((yKey, idx) => {
            const displayLabel = aliasForYKey(yKey);
            const color = getColor(displayLabel, idx);
            return {
              label: displayLabel,
              data: rows.map((r) => Number(r[yKey] ?? 0)),
              backgroundColor: effectiveChartType === "area" ? color + "40" : color + "99",
              borderColor: color,
              borderWidth: effectiveChartType === "line" || effectiveChartType === "area" ? 2 : 1,
              ...(effectiveChartType === "area" ? { fill: true } : {}),
            };
          });
        }
      }

      return {
        labels,
        datasets: datasets.length > 0 ? datasets : [{ label: "valor", data: [], backgroundColor: defaultPalette[0], borderColor: "#fff", borderWidth: 1 }],
      };
    },
    []
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
          const dimensions = (agg as any).dimensions?.length > 0
            ? (agg as any).dimensions as string[]
            : [agg.dimension, agg.dimension2].filter(Boolean) as string[];
          const derivedByName = Object.fromEntries(
            derivedColumnsFromLayout.map((d) => [d.name.toLowerCase().trim(), d])
          );
          const metricsPayload = agg.metrics
            .map(({ id, ...m }) => {
              if (m.func === "FORMULA")
                return { formula: m.formula || "", alias: m.alias || "formula", field: "" };
              let expr = (m as { expression?: string }).expression;
              let fieldStr = m.field != null ? String(m.field).trim() : "";
              const savedByName = savedMetrics.find((s) => (s.name || "").trim().toLowerCase() === fieldStr.toLowerCase());
              if (savedByName && !expr) {
                const first = (savedByName as { aggregationConfig?: { metrics?: { field?: string; func?: string; alias?: string; expression?: string }[] }; metric?: { field?: string; func?: string; alias?: string; expression?: string } }).aggregationConfig?.metrics?.[0]
                  ?? (savedByName as { metric?: { field?: string; func?: string; alias?: string; expression?: string } }).metric;
                if (first) {
                  const ex = (first as { expression?: string }).expression;
                  if (ex && String(ex).trim()) expr = String(ex).trim();
                  const f = String((first as { field?: string }).field ?? "").trim();
                  if (f && f.toLowerCase() !== (savedByName.name || "").trim().toLowerCase()) fieldStr = f;
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
          const rankingLimit = agg.chartRankingEnabled && agg.chartRankingTop && agg.chartRankingTop > 0
            ? agg.chartRankingTop
            : undefined;
          const rankingOrderBy = rankingLimit && (agg.chartRankingMetric || metricAliasesForApi[0])
            ? { field: agg.chartRankingMetric || metricAliasesForApi[0], direction: "DESC" as const }
            : undefined;
          // Enviar definiciones de métricas guardadas referenciadas por nombre para que el backend las resuelva (multi-ETL o cuando el lookup falla)
          const metricFieldNames = new Set(
            agg.metrics
              .filter((m) => m.func !== "FORMULA" && m.field != null && String(m.field).trim() !== "")
              .map((m) => String(m.field).trim().toLowerCase())
          );
          const savedMetricsForBody = savedMetrics
            .filter((s) => (s.name || "").trim() && metricFieldNames.has((s.name || "").trim().toLowerCase()))
            .map((s) => {
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
            });
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
              orderBy: rankingOrderBy || agg.orderBy,
              limit: rankingLimit ?? agg.limit ?? 100,
              cumulative: agg.cumulative || "none",
              comparePeriod: agg.comparePeriod || undefined,
              dateDimension: agg.dateDimension || undefined,
              ...(isDateDimension && dateGroupByGranularity && primaryDimension && { dateGroupBy: { field: primaryDimension, granularity: dateGroupByGranularity } }),
              ...(derivedColumnsFromLayout.length > 0 && { derivedColumns: derivedColumnsFromLayout }),
              ...(savedMetricsForBody.length > 0 && { savedMetrics: savedMetricsForBody }),
            }),
          });
          const dataArray = await safeJsonResponse(res);
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
          const config = buildChartConfigFromAgg(agg, dataArray, widget.type);
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
          const dataArray = await safeJsonResponse(res);
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
    [widgets, etlData, globalFilters, getTableName, derivedColumnsFromLayout, savedMetrics, buildChartConfigFromAgg]
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

  /** Añade al dashboard una métrica ya creada (del ETL). */
  const addSavedMetricToDashboard = useCallback(
    (saved: SavedMetricForm) => {
      const cfg = (saved.aggregationConfig ?? {}) as Record<string, unknown>;
      const chartType = (cfg.chartType as string) || saved.chartType || "bar";
      const dims = Array.isArray(cfg.dimensions) ? cfg.dimensions : [cfg.dimension, cfg.dimension2].filter(Boolean) as string[];
      const metricsArr = Array.isArray(cfg.metrics) ? cfg.metrics : [saved.metric];
      const currentPageWidgets = widgets.filter((w) => (w.pageId ?? "page-1") === activePageId);
      const sources = etlData?.dataSources;
      const primaryId = etlData?.primarySourceId ?? sources?.[0]?.id ?? null;
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
          dimensions: dims.length > 0 ? dims : undefined,
          metrics: metricsArr.map((m: any) => ({
            id: m.id || `m-${Date.now()}`,
            field: m.field || "",
            func: m.func || "SUM",
            alias: m.alias || "",
            condition: m.condition,
            formula: m.formula,
            expression: m.expression,
          })),
          filters: Array.isArray(cfg.filters) ? (cfg.filters as AggregationFilter[]) : undefined,
          orderBy: cfg.orderBy as { field: string; direction: "ASC" | "DESC" } | undefined,
          limit: (cfg.limit as number) ?? 100,
          cumulative: (cfg.cumulative as AggregationConfig["cumulative"]) ?? undefined,
          comparePeriod: (cfg.comparePeriod as AggregationConfig["comparePeriod"]) ?? undefined,
          dateDimension: (cfg.dateDimension as string) ?? undefined,
          chartSeriesColors: cfg.chartSeriesColors && typeof cfg.chartSeriesColors === "object" ? (cfg.chartSeriesColors as Record<string, string>) : undefined,
          chartType,
          chartXAxis: (cfg.chartXAxis as string) || undefined,
          chartYAxes: Array.isArray(cfg.chartYAxes) ? (cfg.chartYAxes as string[]) : undefined,
          chartSeriesField: (cfg.chartSeriesField as string) || undefined,
          chartNumberFormat: (cfg.chartNumberFormat as string) || undefined,
          chartValueType: (cfg.chartValueType as string) || undefined,
          chartValueScale: (cfg.chartValueScale as string) || undefined,
          chartCurrencySymbol: (cfg.chartCurrencySymbol as string) || undefined,
          chartThousandSep: cfg.chartThousandSep != null ? (cfg.chartThousandSep as boolean) : undefined,
          chartDecimals: cfg.chartDecimals != null ? (cfg.chartDecimals as number) : undefined,
          chartSortDirection: (cfg.chartSortDirection as string) || undefined,
          chartSortBy: (cfg.chartSortBy as string) || undefined,
          chartRankingEnabled: (cfg.chartRankingEnabled as boolean) || undefined,
          chartRankingTop: (cfg.chartRankingTop as number) || undefined,
          chartRankingMetric: (cfg.chartRankingMetric as string) || undefined,
          chartColorScheme: (cfg.chartColorScheme as string) || undefined,
          showDataLabels: (cfg.showDataLabels as boolean) || undefined,
          chartAxisOrder: (cfg.chartAxisOrder as string) || undefined,
          chartLabelOverrides: cfg.chartLabelOverrides && typeof cfg.chartLabelOverrides === "object" ? (cfg.chartLabelOverrides as Record<string, string>) : undefined,
          chartMetricFormats: cfg.chartMetricFormats && typeof cfg.chartMetricFormats === "object" ? (cfg.chartMetricFormats as Record<string, { valueType?: string; valueScale?: string; currencySymbol?: string; decimals?: number; thousandSep?: boolean }>) : undefined,
        },
        excludeGlobalFilters: false,
        dataSourceId: primaryId,
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

  /** Añade al dashboard un análisis ya creado (métricas + dimensiones + tipo de gráfico). */
  const addSavedAnalysisToDashboard = useCallback(
    (analysis: SavedAnalysis) => {
      const metricConfigs: AggregationMetric[] = [];
      for (const mid of analysis.metricIds || []) {
        const saved = savedMetrics.find((s) => String(s.id) === String(mid));
        if (!saved) continue;
        const cfg = (saved.aggregationConfig ?? {}) as Record<string, unknown>;
        const list = Array.isArray(cfg.metrics) ? cfg.metrics : (saved.metric ? [saved.metric] : []);
        list.forEach((m: any) => metricConfigs.push({
          id: m.id || `m-${Date.now()}`,
          field: m.field || "",
          func: m.func || "SUM",
          alias: m.alias || "",
          condition: m.condition,
          formula: m.formula,
          expression: m.expression,
        }));
      }
      const chartType = (analysis.chartType as string) || "bar";
      const dims = Array.isArray(analysis.dimensions) ? analysis.dimensions : [analysis.dimension].filter(Boolean) as string[];
      const currentPageWidgets = widgets.filter((w) => (w.pageId ?? "page-1") === activePageId);
      const sources = etlData?.dataSources;
      const primaryId = etlData?.primarySourceId ?? sources?.[0]?.id ?? null;
      const newWidget: StudioWidget = {
        id: `w-${analysis.id}-${Date.now()}`,
        type: chartType,
        title: analysis.name,
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
          dimensions: dims.length > 0 ? dims : undefined,
          metrics: metricConfigs.length > 0 ? metricConfigs : [{ id: `m-${Date.now()}`, field: "", func: "SUM", alias: "" }],
          filters: analysis.filters,
          orderBy: analysis.orderBy,
          limit: analysis.limit ?? 100,
          dateDimension: analysis.dateDimension,
          chartType,
          chartXAxis: analysis.chartXAxis,
          chartYAxes: analysis.chartYAxes,
          chartSeriesField: analysis.chartSeriesField,
          chartLabelOverrides: analysis.chartLabelOverrides,
          chartValueType: analysis.chartValueType,
          chartValueScale: analysis.chartValueScale,
          chartCurrencySymbol: analysis.chartCurrencySymbol,
          chartThousandSep: analysis.chartThousandSep,
          chartDecimals: analysis.chartDecimals,
          chartSeriesColors: analysis.chartSeriesColors,
          chartSortDirection: analysis.chartSortDirection,
          chartSortBy: analysis.chartSortBy,
          chartRankingEnabled: analysis.chartRankingEnabled,
          chartRankingTop: analysis.chartRankingTop,
          chartRankingMetric: analysis.chartRankingMetric,
        },
        excludeGlobalFilters: false,
        dataSourceId: primaryId,
      };
      setWidgets((prev) => [...prev, newWidget]);
      setSelectedId(null);
      setIsDirty(true);
      setAddMetricOpen(false);
      setAddMetricStep("list");
      setAddMetricInitialIntent(null);
      if (etlData) setTimeout(() => loadMetricData(newWidget.id), 300);
    },
    [widgets, activePageId, etlData, savedMetrics, loadMetricData]
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
                const savedForTitle = savedMetrics.find((s) => (s.name || "").trim() === (w.title || "").trim());
                const chartTypeFromSaved = (savedForTitle?.aggregationConfig as { chartType?: string })?.chartType ?? (savedForTitle as { chartType?: string })?.chartType;
                const chartTypeRaw =
                  (w.aggregationConfig as { chartType?: string })?.chartType
                  || chartTypeFromSaved
                  || w.type
                  || "bar";
                type SupportedChartType = "bar" | "horizontalBar" | "line" | "area" | "pie" | "doughnut" | "kpi" | "table" | "combo" | "scatter";
                const SUPPORTED_CHART_TYPES: string[] = ["bar", "horizontalBar", "line", "area", "pie", "doughnut", "kpi", "table", "combo", "scatter"];
                const chartType: SupportedChartType = SUPPORTED_CHART_TYPES.includes(chartTypeRaw) ? chartTypeRaw as SupportedChartType : "bar";
                let kpiValue: string | number | undefined;
                if (chartType === "kpi" && w.config?.datasets?.[0]?.data?.[0] != null) {
                  kpiValue = w.config.datasets[0].data[0];
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
