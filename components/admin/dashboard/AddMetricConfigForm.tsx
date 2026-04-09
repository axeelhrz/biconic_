"use client";

import { useState, useMemo } from "react";
import { ChevronLeft, Trash2, BookmarkPlus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import AdminFieldSelector from "./AdminFieldSelector";
import type { ETLDataResponse } from "@/hooks/admin/useAdminDashboardEtlData";
import type { GeoComponentOverrides } from "@/lib/geo/geo-enrichment";

export type MetricConditionEdit = {
  field: string;
  operator: string;
  value: unknown;
};

export type AggregationMetricEdit = {
  id: string;
  field: string;
  func: string;
  alias: string;
  condition?: MetricConditionEdit;
  formula?: string;
  /** Expresión sobre columnas (ej. CANTIDAD * PRECIO_UNITARIO). Se agrega con func (SUM, AVG…). */
  expression?: string;
};

export type AggregationFilterEdit = {
  id: string;
  field: string;
  operator: string;
  value: unknown;
};

export type AggregationConfigEdit = {
  enabled: boolean;
  dimension?: string;
  dimension2?: string;
  dimensions?: string[];
  metrics: AggregationMetricEdit[];
  filters?: AggregationFilterEdit[];
  orderBy?: { field: string; direction: "ASC" | "DESC" };
  limit?: number;
  cumulative?: "none" | "running_sum" | "ytd";
  comparePeriod?: "previous_year" | "previous_month";
  dateDimension?: string;
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
  chartAxisOrder?: string;
  chartScaleMode?: string;
  chartScaleMin?: string | number;
  chartScaleMax?: string | number;
  chartAxisStep?: string | number;
  chartRankingEnabled?: boolean;
  chartRankingTop?: number;
  chartRankingMetric?: string;
  chartRankingDirection?: "asc" | "desc";
  chartPinnedDimensions?: string[];
  chartColorScheme?: string;
  chartSeriesColors?: Record<string, string>;
  showDataLabels?: boolean;
  labelVisibilityMode?: "all" | "auto" | "min_max";
  /** Mapeo valor en datos → texto a mostrar en etiquetas del gráfico (eje X, porciones pie/dona, series por dimensión). */
  chartLabelOverrides?: Record<string, string>;
  /** Texto en leyenda por clave de métrica (chartYAxes). */
  chartDatasetLabelOverrides?: Record<string, string>;
  /** Formato por métrica (clave = chartYAxes key). Si existe, se usa en lugar del formato global para esa serie. */
  chartMetricFormats?: Record<string, { valueType?: string; valueScale?: string; currencySymbol?: string; decimals?: number; thousandSep?: boolean }>;
  /** Combo: alinear eje derecho con el izquierdo (normalizar 0-1) para comparación visual. */
  chartComboSyncAxes?: boolean;
  chartGridXDisplay?: boolean;
  chartGridYDisplay?: boolean;
  chartGridColor?: string;
  chartAxisXVisible?: boolean;
  chartAxisYVisible?: boolean;
  chartDataLabelFontSize?: number;
  chartDataLabelColor?: string;
  chartAxisFontSize?: number;
  chartLayoutPadding?: number;
  chartAxisTickColor?: string;
  chartCategoryTickMaxRotation?: number;
  chartCategoryTickMinRotation?: number;
  chartCategoryMaxTicks?: number;
  chartFontFamily?: string;
  labelVisibilityMaxCount?: number;
  chartLegendPosition?: "top" | "bottom" | "left" | "right" | "chartArea";
  chartLegendVisible?: boolean;
  pieLegendVisible?: boolean;
  pieLegendResponsive?: boolean;
  /** Para barras/combo: una barra por X dividida por la segunda dimensión. */
  chartStackBySeries?: boolean;
  /** Si la dimensión es una columna fecha, agrupar por este nivel. */
  dateGroupByGranularity?: "day" | "week" | "month" | "quarter" | "semester" | "year";
  analysisDateDisplayFormat?: "short" | "monthYear" | "year" | "datetime";
  mapDefaultCountry?: string;
  geoHints?: {
    countryField?: string;
    provinceField?: string;
    cityField?: string;
    addressField?: string;
    latField?: string;
    lonField?: string;
  };
  geoComponentOverrides?: GeoComponentOverrides;
  geoOverridesByXLabel?: Record<string, GeoComponentOverrides>;
  tableColumnLabelOverrides?: Record<string, string>;
};

export type AddMetricFormConfig = {
  title: string;
  type: string;
  gridSpan?: number;
  color?: string;
  labelDisplayMode?: "percent" | "value" | "both";
  kpiSecondaryLabel?: string;
  kpiSecondaryValue?: string;
  kpiCaption?: string;
  aggregationConfig: AggregationConfigEdit;
  excludeGlobalFilters?: boolean;
  /** ID de la fuente de datos cuando el dashboard tiene múltiples ETLs */
  dataSourceId?: string | null;
};

/** Configuración de agregación guardada en una métrica reutilizable */
export type SavedMetricAggregationConfig = {
  dimension?: string;
  dimension2?: string;
  /** Múltiples dimensiones (GROUP BY); si está presente tiene prioridad sobre dimension/dimension2 */
  dimensions?: string[];
  metrics: AggregationMetricEdit[];
  filters?: AggregationFilterEdit[];
  orderBy?: { field: string; direction: "ASC" | "DESC" };
  limit?: number;
  cumulative?: "none" | "running_sum" | "ytd";
  comparePeriod?: "previous_year" | "previous_month";
  dateDimension?: string;
  compareFixedValue?: number;
  transformCompare?: "none" | "mom" | "yoy" | "fixed";
  transformCompareFixedValue?: string;
  transformShowDelta?: boolean;
  transformShowDeltaPct?: boolean;
  transformShowAccum?: boolean;
  // Opciones de gráfico (persistidas al guardar métrica)
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
  chartAxisOrder?: string;
  chartScaleMode?: string;
  chartScaleMin?: string | number;
  chartScaleMax?: string | number;
  chartAxisStep?: string | number;
  chartRankingEnabled?: boolean;
  chartRankingTop?: number;
  chartRankingMetric?: string;
  chartRankingDirection?: "asc" | "desc";
  chartPinnedDimensions?: string[];
  chartColorScheme?: string;
  chartSeriesColors?: Record<string, string>;
  showDataLabels?: boolean;
  labelVisibilityMode?: "all" | "auto" | "min_max";
  chartLabelOverrides?: Record<string, string>;
  chartDatasetLabelOverrides?: Record<string, string>;
  chartMetricFormats?: Record<string, { valueType?: string; valueScale?: string; currencySymbol?: string; decimals?: number; thousandSep?: boolean }>;
  chartComboSyncAxes?: boolean;
  chartGridXDisplay?: boolean;
  chartGridYDisplay?: boolean;
  chartGridColor?: string;
  chartAxisXVisible?: boolean;
  chartAxisYVisible?: boolean;
  chartStackBySeries?: boolean;
  chartScalePerMetric?: Record<string, { min?: number; max?: number; step?: number }>;
  dateGroupByGranularity?: "day" | "week" | "month" | "quarter" | "semester" | "year";
  analysisDateDisplayFormat?: "short" | "monthYear" | "year" | "datetime";
  mapDefaultCountry?: string;
  geoHints?: {
    countryField?: string;
    provinceField?: string;
    cityField?: string;
    addressField?: string;
    latField?: string;
    lonField?: string;
  };
  geoComponentOverrides?: GeoComponentOverrides;
  geoOverridesByXLabel?: Record<string, GeoComponentOverrides>;
  dateRangeFilter?: { field: string; last?: number; unit?: string; from?: string; to?: string };
  interCrossFilter?: boolean;
  interCrossFilterFields?: string[];
  interDrilldown?: boolean;
  interDrilldownHierarchy?: string[];
  interDrillThrough?: boolean;
  interDrillThroughTarget?: string;
  interTooltipFields?: string[];
  interHighlight?: boolean;
};

/** Métrica guardada para reutilizar (mismo formato que en AdminDashboardStudio) */
export type SavedMetricForm = {
  id: string;
  name: string;
  metric: AggregationMetricEdit;
  /** Tipo de gráfico recomendado */
  chartType?: string;
  /** Configuración completa de agregación (persistida al guardar) */
  aggregationConfig?: SavedMetricAggregationConfig;
};

const CHART_TYPES: { value: string; label: string }[] = [
  { value: "bar", label: "Barras verticales" },
  { value: "horizontalBar", label: "Barras horizontales" },
  { value: "line", label: "Líneas" },
  { value: "area", label: "Área" },
  { value: "pie", label: "Circular (pie)" },
  { value: "doughnut", label: "Dona" },
  { value: "kpi", label: "KPI (número)" },
  { value: "table", label: "Tabla" },
  { value: "combo", label: "Combo (barras + línea)" },
  { value: "scatter", label: "Dispersión" },
];

const AGG_FUNCS = [
  { value: "SUM", label: "Suma" },
  { value: "AVG", label: "Promedio" },
  { value: "COUNT", label: "Conteo" },
  { value: "MIN", label: "Mínimo" },
  { value: "MAX", label: "Máximo" },
  { value: "COUNT(DISTINCT", label: "Conteo único" },
  { value: "FORMULA", label: "Fórmula / ratio" },
];

const OPERATORS = ["=", "!=", ">", ">=", "<", "<=", "LIKE", "ILIKE", "IN", "BETWEEN", "MONTH", "YEAR", "DAY", "QUARTER", "SEMESTER", "IS", "IS NOT"];
const LABEL_VISIBILITY_OPTIONS: Array<{ value: "all" | "auto" | "min_max"; label: string }> = [
  { value: "all", label: "Todas" },
  { value: "auto", label: "Algunas (automático)" },
  { value: "min_max", label: "Máximos y mínimos" },
];

type AddMetricConfigFormProps = {
  initialValues: AddMetricFormConfig;
  etlData: ETLDataResponse | null;
  onSave: (config: AddMetricFormConfig) => void;
  onBack: () => void;
  /** Métricas guardadas para reutilizar en este dashboard */
  savedMetrics?: SavedMetricForm[];
  /** Guardar la definición de una métrica para reutilizarla después */
  onSaveMetricAsTemplate?: (name: string, metric: AggregationMetricEdit) => void;
};

export function AddMetricConfigForm({
  initialValues,
  etlData,
  onSave,
  onBack,
  savedMetrics = [],
  onSaveMetricAsTemplate,
}: AddMetricConfigFormProps) {
  const [form, setForm] = useState<AddMetricFormConfig>(initialValues);
  const [saveTemplateName, setSaveTemplateName] = useState<{ index: number; name: string } | null>(null);
  const agg = form.aggregationConfig;
  const metrics = agg.metrics || [];
  const filters = agg.filters || [];
  const sources = etlData?.dataSources;
  const selectedSource = sources?.find((s) => s.id === (form.dataSourceId ?? etlData?.primarySourceId ?? sources[0]?.id));
  const fields = selectedSource?.fields?.all ?? etlData?.fields?.all ?? [];

  const updateForm = (patch: Partial<AddMetricFormConfig>) => {
    setForm((prev) => ({ ...prev, ...patch }));
  };

  const updateAgg = (patch: Partial<AggregationConfigEdit>) => {
    setForm((prev) => ({
      ...prev,
      aggregationConfig: { ...prev.aggregationConfig, ...patch },
    }));
  };

  const updateMetric = (index: number, patch: Partial<AggregationMetricEdit>) => {
    const next = [...metrics];
    if (!next[index]) return;
    next[index] = { ...next[index], ...patch };
    updateAgg({ metrics: next });
  };

  const addMetric = () => {
    const field = fields[0] || "";
    updateAgg({
      metrics: [...metrics, { id: `m-${Date.now()}`, func: "SUM", field, alias: field || "valor" }],
    });
  };

  const addSavedMetric = (saved: SavedMetricForm) => {
    if (saved.aggregationConfig) {
      const cfg = saved.aggregationConfig;
      const newMetrics = (cfg.metrics ?? [saved.metric]).map((m, i) => ({ ...m, id: `m-${Date.now()}-${i}` }));
      const newFilters = (cfg.filters ?? []).map((f, i) => ({ ...f, id: f.id || `f-${Date.now()}-${i}` }));
      if (cfg.chartType) {
        updateForm({ type: cfg.chartType });
      }
      updateAgg({
        dimension: cfg.dimension ?? agg.dimension,
        dimension2: cfg.dimension2 ?? agg.dimension2,
        dimensions: cfg.dimensions ?? undefined,
        metrics: newMetrics,
        filters: newFilters.length ? newFilters : agg.filters,
        orderBy: cfg.orderBy ?? agg.orderBy,
        limit: cfg.limit ?? agg.limit,
        cumulative: cfg.cumulative,
        comparePeriod: cfg.comparePeriod,
        dateDimension: cfg.dateDimension,
        chartType: cfg.chartType,
        chartXAxis: cfg.chartXAxis,
        chartYAxes: cfg.chartYAxes,
        chartSeriesField: cfg.chartSeriesField,
        chartNumberFormat: cfg.chartNumberFormat,
        chartValueType: cfg.chartValueType,
        chartValueScale: cfg.chartValueScale,
        chartCurrencySymbol: cfg.chartCurrencySymbol,
        chartThousandSep: cfg.chartThousandSep,
        chartDecimals: cfg.chartDecimals,
        chartSortDirection: cfg.chartSortDirection,
        chartSortBy: cfg.chartSortBy,
        chartSortByMetric: cfg.chartSortByMetric,
        chartAxisOrder: cfg.chartAxisOrder,
        chartScaleMode: cfg.chartScaleMode,
        chartScaleMin: cfg.chartScaleMin,
        chartScaleMax: cfg.chartScaleMax,
        chartAxisStep: cfg.chartAxisStep,
        chartRankingEnabled: cfg.chartRankingEnabled,
        chartRankingTop: cfg.chartRankingTop,
        chartRankingMetric: cfg.chartRankingMetric,
        chartRankingDirection: cfg.chartRankingDirection,
        chartPinnedDimensions: cfg.chartPinnedDimensions,
        chartColorScheme: cfg.chartColorScheme,
        chartSeriesColors: cfg.chartSeriesColors,
        showDataLabels: cfg.showDataLabels,
        labelVisibilityMode: cfg.labelVisibilityMode,
        chartLabelOverrides: cfg.chartLabelOverrides,
        chartDatasetLabelOverrides: (cfg as { chartDatasetLabelOverrides?: Record<string, string> }).chartDatasetLabelOverrides,
        chartMetricFormats: cfg.chartMetricFormats,
        chartComboSyncAxes: (cfg as { chartComboSyncAxes?: boolean }).chartComboSyncAxes,
        chartStackBySeries: (cfg as { chartStackBySeries?: boolean }).chartStackBySeries,
        chartAxisXVisible: (cfg as { chartAxisXVisible?: boolean }).chartAxisXVisible,
        chartAxisYVisible: (cfg as { chartAxisYVisible?: boolean }).chartAxisYVisible,
        dateGroupByGranularity: (cfg as { dateGroupByGranularity?: "day" | "week" | "month" | "quarter" | "semester" | "year" }).dateGroupByGranularity,
      });
    } else {
      updateAgg({
        metrics: [...metrics, { ...saved.metric, id: `m-${Date.now()}` }],
      });
    }
  };

  const openSaveTemplate = (index: number) => {
    const m = metrics[index];
    if (m) setSaveTemplateName({ index, name: m.alias || m.field || "Métrica" });
  };

  const confirmSaveTemplate = () => {
    if (saveTemplateName == null || !onSaveMetricAsTemplate) return;
    const m = metrics[saveTemplateName.index];
    if (m && saveTemplateName.name.trim()) {
      onSaveMetricAsTemplate(saveTemplateName.name.trim(), m);
      setSaveTemplateName(null);
    }
  };

  const removeMetric = (index: number) => {
    updateAgg({ metrics: metrics.filter((_, i) => i !== index) });
  };

  const updateFilter = (index: number, patch: Partial<AggregationFilterEdit>) => {
    const next = [...filters];
    if (!next[index]) return;
    next[index] = { ...next[index], ...patch };
    updateAgg({ filters: next });
  };

  const addFilter = () => {
    updateAgg({
      filters: [...filters, { id: `f-${Date.now()}`, field: fields[0] || "", operator: "=", value: "" }],
    });
  };

  const removeFilter = (index: number) => {
    updateAgg({ filters: filters.filter((_, i) => i !== index) });
  };

  const CHART_TYPES_FOR_LABELS = ["bar", "horizontalBar", "line", "area", "pie", "doughnut", "combo", "scatter"];
  const showLabelOverrides = CHART_TYPES_FOR_LABELS.includes(form.type);
  const labelOverridesEntries = useMemo(() => Object.entries(agg.chartLabelOverrides ?? {}), [agg.chartLabelOverrides]);
  const [labelOverrideRawDrafts, setLabelOverrideRawDrafts] = useState<Record<string, string>>({});
  const setLabelOverride = (oldRaw: string, newRaw: string, display: string) => {
    const next = { ...(agg.chartLabelOverrides ?? {}) };
    if (Object.prototype.hasOwnProperty.call(next, oldRaw)) delete next[oldRaw];
    const normalizedNewRaw = String(newRaw ?? "").trim();
    if (normalizedNewRaw !== "") next[normalizedNewRaw] = display;
    for (const key of Object.keys(next)) {
      if (String(key).trim() === "") delete next[key];
    }
    updateAgg({ chartLabelOverrides: Object.keys(next).length ? next : undefined });
  };
  const commitLabelOverrideRawDraft = (raw: string, display: string) => {
    const draftValue = labelOverrideRawDrafts[raw];
    if (typeof draftValue !== "string") return;
    const normalizedDraft = draftValue.trim();
    setLabelOverrideRawDrafts((prev) => {
      const next = { ...prev };
      delete next[raw];
      return next;
    });
    if (normalizedDraft === "" || normalizedDraft === raw) return;
    setLabelOverride(raw, normalizedDraft, display);
  };
  const removeLabelOverride = (raw: string) => {
    const next = { ...(agg.chartLabelOverrides ?? {}) };
    delete next[raw];
    setLabelOverrideRawDrafts((prev) => {
      if (!Object.prototype.hasOwnProperty.call(prev, raw)) return prev;
      const nextDrafts = { ...prev };
      delete nextDrafts[raw];
      return nextDrafts;
    });
    updateAgg({ chartLabelOverrides: Object.keys(next).length ? next : undefined });
  };
  const addLabelOverride = () => {
    if (Object.prototype.hasOwnProperty.call(agg.chartLabelOverrides ?? {}, "")) return;
    updateAgg({ chartLabelOverrides: { ...(agg.chartLabelOverrides ?? {}), "": "" } });
  };

  const orderFields = agg.enabled
    ? [agg.dimension, agg.dimension2, agg.dateDimension, ...metrics.map((m) => m.alias || m.field)].filter(Boolean) as string[]
    : fields;

  const handleCreate = () => {
    onSave(form);
  };

  return (
    <div className="add-metric-config-form flex flex-col h-full max-h-[70vh]">
      <div className="flex-shrink-0 flex items-center justify-between gap-3 pb-4 border-b border-[var(--studio-border)]">
        <Button type="button" variant="ghost" size="sm" className="text-[var(--studio-fg-muted)] hover:text-[var(--studio-fg)]" onClick={onBack}>
          <ChevronLeft className="h-4 w-4 mr-1" />
          Volver
        </Button>
        <span className="text-sm font-medium text-[var(--studio-fg)]">Configurar métrica</span>
      </div>
      <div className="flex-1 overflow-y-auto py-4 space-y-4 pr-1">
        <div>
          <Label className="add-metric-label">Título</Label>
          <Input
            value={form.title}
            onChange={(e) => updateForm({ title: e.target.value })}
            className="add-metric-input mt-1"
            placeholder="Nombre de la métrica"
          />
        </div>
        <div>
          <Label className="add-metric-label">Tipo de gráfico</Label>
          <select
            value={form.type}
            onChange={(e) => updateForm({ type: e.target.value })}
            className="add-metric-select mt-1"
          >
            {CHART_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>
        {sources && sources.length > 1 && (
          <div>
            <Label className="add-metric-label">Fuente de datos</Label>
            <select
              value={form.dataSourceId ?? etlData?.primarySourceId ?? sources[0]?.id ?? ""}
              onChange={(e) => updateForm({ dataSourceId: e.target.value || null })}
              className="add-metric-select mt-1"
            >
              {sources.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.alias} ({s.etlName})
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <Label className="add-metric-label">Columnas en grid</Label>
          <select
            value={Math.min(6, Math.max(1, form.gridSpan ?? 2))}
            onChange={(e) => updateForm({ gridSpan: parseInt(e.target.value, 10) })}
            className="add-metric-select mt-1"
          >
            <option value={1}>1</option>
            <option value={2}>2</option>
            <option value={3}>3</option>
            <option value={4}>4</option>
            <option value={5}>5</option>
            <option value={6}>6 (ancho completo)</option>
          </select>
        </div>
        {(form.type === "pie" || form.type === "doughnut") && (
          <div>
            <Label className="add-metric-label">Etiquetas</Label>
            <select
              value={form.labelDisplayMode || "percent"}
              onChange={(e) => updateForm({ labelDisplayMode: e.target.value as "percent" | "value" | "both" })}
              className="add-metric-select mt-1"
            >
              <option value="percent">Porcentaje</option>
              <option value="value">Valor</option>
              <option value="both">Valor + porcentaje</option>
            </select>
          </div>
        )}
        {CHART_TYPES_FOR_LABELS.includes(form.type) && (
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={agg.showDataLabels !== false}
              onChange={(e) => updateAgg({ showDataLabels: e.target.checked })}
              className="rounded"
            />
            <span className="text-xs text-[var(--studio-fg-muted)]">Mostrar etiquetas sobre el gráfico</span>
          </label>
        )}
        {CHART_TYPES_FOR_LABELS.includes(form.type) && (
          <div>
            <Label className="add-metric-label">Visibilidad de etiquetas</Label>
            <select
              value={agg.labelVisibilityMode ?? "auto"}
              onChange={(e) => updateAgg({ labelVisibilityMode: e.target.value as "all" | "auto" | "min_max" })}
              className="add-metric-select mt-1"
            >
              {LABEL_VISIBILITY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        )}
        {CHART_TYPES_FOR_LABELS.includes(form.type) && (
          <div>
            <Label className="add-metric-label">Máx. puntos con etiqueta (automático)</Label>
            <Input
              type="number"
              min={2}
              max={50}
              placeholder="Predeterminado (8)"
              value={agg.labelVisibilityMaxCount ?? ""}
              onChange={(e) =>
                updateAgg({
                  labelVisibilityMaxCount: e.target.value ? parseInt(e.target.value, 10) : undefined,
                })
              }
              className="add-metric-input mt-1 h-8 text-xs"
            />
          </div>
        )}
        {["bar", "horizontalBar", "line", "area", "pie", "doughnut", "combo", "scatter"].includes(form.type) && (
          <div>
            <Label className="add-metric-label">Posición de la leyenda</Label>
            <select
              value={agg.chartLegendPosition ?? ""}
              onChange={(e) =>
                updateAgg({
                  chartLegendPosition: (e.target.value || undefined) as AggregationConfigEdit["chartLegendPosition"],
                })
              }
              className="add-metric-select mt-1 h-8 text-xs"
            >
              <option value="">Predeterminada</option>
              <option value="top">Arriba</option>
              <option value="bottom">Abajo</option>
              <option value="left">Izquierda</option>
              <option value="right">Derecha</option>
              <option value="chartArea">Sobre el gráfico</option>
            </select>
          </div>
        )}
        {["bar", "horizontalBar", "line", "pie", "doughnut", "combo", "scatter"].includes(form.type) && (
          <details className="rounded-lg border border-[var(--studio-border)] p-2">
            <summary className="cursor-pointer text-xs font-medium text-[var(--studio-fg)]">
              Tipografía, colores internos y eje de categorías
            </summary>
            <div className="mt-3 space-y-2">
              <div>
                <Label className="text-[11px] text-[var(--studio-fg-muted)]">Fuente (CSS, opcional)</Label>
                <Input
                  value={agg.chartFontFamily ?? ""}
                  onChange={(e) => updateAgg({ chartFontFamily: e.target.value || undefined })}
                  className="add-metric-input mt-0.5 h-8 font-mono text-[11px]"
                  placeholder="Vacío = tema del dashboard"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-[11px] text-[var(--studio-fg-muted)]">Tamaño etiquetas de dato</Label>
                  <Input
                    type="number"
                    min={6}
                    max={28}
                    value={agg.chartDataLabelFontSize ?? ""}
                    onChange={(e) =>
                      updateAgg({
                        chartDataLabelFontSize: e.target.value ? parseInt(e.target.value, 10) : undefined,
                      })
                    }
                    className="add-metric-input mt-0.5 h-8 text-xs"
                  />
                </div>
                <div>
                  <Label className="text-[11px] text-[var(--studio-fg-muted)]">Tamaño ejes</Label>
                  <Input
                    type="number"
                    min={6}
                    max={22}
                    value={agg.chartAxisFontSize ?? ""}
                    onChange={(e) =>
                      updateAgg({
                        chartAxisFontSize: e.target.value ? parseInt(e.target.value, 10) : undefined,
                      })
                    }
                    className="add-metric-input mt-0.5 h-8 text-xs"
                  />
                </div>
              </div>
              <div>
                <Label className="text-[11px] text-[var(--studio-fg-muted)]">Padding gráfico (px)</Label>
                <Input
                  type="number"
                  min={0}
                  max={64}
                  value={agg.chartLayoutPadding ?? ""}
                  onChange={(e) =>
                    updateAgg({
                      chartLayoutPadding: e.target.value ? parseInt(e.target.value, 10) : undefined,
                    })
                  }
                  className="add-metric-input mt-0.5 h-8 text-xs"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Label className="text-[11px] text-[var(--studio-fg-muted)]">Color etiquetas de dato</Label>
                <input
                  type="color"
                  value={agg.chartDataLabelColor || "#374151"}
                  onChange={(e) => updateAgg({ chartDataLabelColor: e.target.value })}
                  className="h-8 w-10 rounded border border-[var(--studio-border)]"
                />
                <Input
                  value={agg.chartDataLabelColor ?? ""}
                  onChange={(e) => updateAgg({ chartDataLabelColor: e.target.value || undefined })}
                  className="add-metric-input h-8 min-w-0 flex-1 font-mono text-[11px]"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Label className="text-[11px] text-[var(--studio-fg-muted)]">Color ticks ejes</Label>
                <input
                  type="color"
                  value={agg.chartAxisTickColor || "#64748b"}
                  onChange={(e) => updateAgg({ chartAxisTickColor: e.target.value })}
                  className="h-8 w-10 rounded border border-[var(--studio-border)]"
                />
                <Input
                  value={agg.chartAxisTickColor ?? ""}
                  onChange={(e) => updateAgg({ chartAxisTickColor: e.target.value || undefined })}
                  className="add-metric-input h-8 min-w-0 flex-1 font-mono text-[11px]"
                />
              </div>
              {["bar", "horizontalBar", "line", "area", "combo", "scatter"].includes(form.type) && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-[11px] text-[var(--studio-fg-muted)]">Rotación máx. categorías (°)</Label>
                    <Input
                      type="number"
                      min={0}
                      max={90}
                      value={agg.chartCategoryTickMaxRotation ?? ""}
                      onChange={(e) =>
                        updateAgg({
                          chartCategoryTickMaxRotation: e.target.value ? parseInt(e.target.value, 10) : undefined,
                        })
                      }
                      className="add-metric-input mt-0.5 h-8 text-xs"
                    />
                  </div>
                  <div>
                    <Label className="text-[11px] text-[var(--studio-fg-muted)]">Máx. ticks categorías</Label>
                    <Input
                      type="number"
                      min={2}
                      max={100}
                      value={agg.chartCategoryMaxTicks ?? ""}
                      onChange={(e) =>
                        updateAgg({
                          chartCategoryMaxTicks: e.target.value ? parseInt(e.target.value, 10) : undefined,
                        })
                      }
                      className="add-metric-input mt-0.5 h-8 text-xs"
                    />
                  </div>
                </div>
              )}
            </div>
          </details>
        )}
        {["bar", "horizontalBar", "line", "pie", "doughnut", "combo"].includes(form.type) && (
          <div>
            <Label className="add-metric-label">Color</Label>
            <div className="flex gap-2 mt-1">
              <input
                type="color"
                value={form.color || "#22d3ee"}
                onChange={(e) => updateForm({ color: e.target.value })}
                className="h-9 w-11 rounded-lg border border-[var(--studio-border)] cursor-pointer bg-transparent"
              />
              <Input
                value={form.color || ""}
                onChange={(e) => updateForm({ color: e.target.value || undefined })}
                className="flex-1 h-9 text-xs font-mono"
                placeholder="#22d3ee"
              />
            </div>
          </div>
        )}
        {form.type === "combo" && (agg.chartYAxes?.length ?? 0) >= 2 && (
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={!!agg.chartComboSyncAxes}
              onChange={(e) => updateAgg({ chartComboSyncAxes: e.target.checked })}
              className="rounded"
            />
            <span className="text-xs text-[var(--studio-fg-muted)]">Sincronizar ejes</span>
            <span className="text-[10px] text-[var(--studio-fg-muted)]">Alinear el eje derecho con el izquierdo para comparar dos métricas con escalas distintas.</span>
          </label>
        )}
        {["bar", "horizontalBar", "line", "area", "combo", "scatter"].includes(form.type) && (
          <div className="space-y-2 rounded-lg border border-[var(--studio-border)] p-3">
            <Label className="add-metric-label">Visibilidad de ejes</Label>
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={agg.chartAxisXVisible !== false}
                  onChange={(e) => updateAgg({ chartAxisXVisible: e.target.checked })}
                  className="rounded"
                />
                <span className="text-xs text-[var(--studio-fg-muted)]">Mostrar eje X</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={agg.chartAxisYVisible !== false}
                  onChange={(e) => updateAgg({ chartAxisYVisible: e.target.checked })}
                  className="rounded"
                />
                <span className="text-xs text-[var(--studio-fg-muted)]">Mostrar eje Y</span>
              </label>
            </div>
          </div>
        )}
        {["bar", "horizontalBar", "line", "area", "combo", "scatter"].includes(form.type) && (
          <div className="space-y-2 rounded-lg border border-[var(--studio-border)] p-3">
            <Label className="add-metric-label">Líneas de cuadrícula</Label>
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={agg.chartGridXDisplay !== false}
                  onChange={(e) => updateAgg({ chartGridXDisplay: e.target.checked })}
                  className="rounded"
                />
                <span className="text-xs text-[var(--studio-fg-muted)]">Mostrar líneas en eje X</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={agg.chartGridYDisplay !== false}
                  onChange={(e) => updateAgg({ chartGridYDisplay: e.target.checked })}
                  className="rounded"
                />
                <span className="text-xs text-[var(--studio-fg-muted)]">Mostrar líneas en eje Y</span>
              </label>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--studio-fg-muted)]">Color</span>
              <input
                type="color"
                value={agg.chartGridColor || "#e2e8f0"}
                onChange={(e) => updateAgg({ chartGridColor: e.target.value })}
                className="h-8 w-10 rounded border border-[var(--studio-border)]"
              />
            </div>
          </div>
        )}
        {showLabelOverrides && (
          <div>
            <Label className="add-metric-label">Nombres de etiquetas en el gráfico</Label>
            <p className="text-[11px] text-[var(--studio-fg-muted)] mt-0.5 mb-2">Reemplazar el valor de los datos por el texto a mostrar (eje X, porciones, leyenda).</p>
            <div className="space-y-2">
              {labelOverridesEntries.map(([raw, display], idx) => (
                <div key={`override-${idx}-${raw}`} className="flex gap-2 items-center">
                  <Input
                    value={labelOverrideRawDrafts[raw] ?? raw}
                    onChange={(e) => setLabelOverrideRawDrafts((prev) => ({ ...prev, [raw]: e.target.value }))}
                    onBlur={() => commitLabelOverrideRawDraft(raw, display)}
                    placeholder="Valor original (ej. Q1)"
                    className="h-8 text-xs flex-1"
                  />
                  <span className="text-[var(--studio-fg-muted)] text-xs">→</span>
                  <Input
                    value={display}
                    onChange={(e) => setLabelOverride(raw, raw, e.target.value)}
                    placeholder="Nombre a mostrar"
                    className="h-8 text-xs flex-1"
                  />
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-red-500" onClick={() => removeLabelOverride(raw)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
            <Button type="button" variant="outline" size="sm" className="mt-2 h-8 text-xs" onClick={addLabelOverride}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Añadir etiqueta
            </Button>
          </div>
        )}
        {form.type === "kpi" && (
          <div className="space-y-2">
            <Label className="add-metric-label">KPI secundario (etiqueta)</Label>
            <Input value={form.kpiSecondaryLabel ?? ""} onChange={(e) => updateForm({ kpiSecondaryLabel: e.target.value || undefined })} className="add-metric-input" placeholder="Ej. Ticket promedio" />
            <Label className="add-metric-label">KPI secundario (valor)</Label>
            <Input value={form.kpiSecondaryValue ?? ""} onChange={(e) => updateForm({ kpiSecondaryValue: e.target.value || undefined })} className="add-metric-input" placeholder="Ej. $ 3.202" />
          </div>
        )}

        {!["filter", "image", "text"].includes(form.type) && (
          <>
            {!etlData && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
                Asociá un ETL al dashboard (en el encabezado) para cargar campos y usar dimensiones, fórmulas y filtros.
              </div>
            )}
            <div className="flex items-center justify-between pt-2">
              <Label className="add-metric-label">Agregación de datos</Label>
              <Checkbox checked={!!agg.enabled} onCheckedChange={(c) => updateAgg({ enabled: !!c })} />
            </div>
            {agg.enabled && (
              <div className="space-y-4 pl-0">
                <AdminFieldSelector
                  label="Agrupar por (dimensión)"
                  value={agg.dimension || ""}
                  onChange={(v) => updateAgg({ dimension: v })}
                  etlData={etlData}
                  dataSourceId={form.dataSourceId}
                  fieldType="all"
                  placeholder="Campo..."
                />
                {(agg.dimension && (selectedSource?.fields?.date ?? etlData?.fields?.date ?? []).some((d: string) => (d || "").toLowerCase() === (agg.dimension || "").toLowerCase())) && (
                  <div>
                    <Label className="add-metric-label text-[11px]">Nivel de fecha (agrupar por)</Label>
                    <select value={agg.dateGroupByGranularity ?? "month"} onChange={(e) => updateAgg({ dateGroupByGranularity: e.target.value as "day" | "month" | "quarter" | "semester" | "year" })} className="add-metric-select mt-0.5 h-8 text-xs w-full">
                      <option value="day">Día</option>
                      <option value="week">Semana</option>
                      <option value="month">Mes</option>
                      <option value="quarter">Trimestre</option>
                      <option value="semester">Semestre</option>
                      <option value="year">Año</option>
                    </select>
                  </div>
                )}
                <AdminFieldSelector
                  label="Segunda dimensión (opcional)"
                  value={agg.dimension2 || ""}
                  onChange={(v) =>
                    updateAgg({
                      dimension2: v || undefined,
                      chartSeriesField: v || undefined,
                    })
                  }
                  etlData={etlData}
                  dataSourceId={form.dataSourceId}
                  fieldType="all"
                  placeholder="Ninguna..."
                />
                {["bar", "horizontalBar", "combo"].includes(form.type) && (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={agg.chartStackBySeries !== false}
                      onChange={(e) => updateAgg({ chartStackBySeries: e.target.checked })}
                      className="rounded"
                    />
                    <span className="text-xs text-[var(--studio-fg-muted)]">
                      Columna única por X segmentada por segunda dimensión
                    </span>
                  </label>
                )}
                <div>
                  <Label className="add-metric-label text-[11px]">Acumulado</Label>
                  <select value={agg.cumulative ?? "none"} onChange={(e) => updateAgg({ cumulative: e.target.value as "none" | "running_sum" | "ytd" })} className="add-metric-select mt-0.5 h-8 text-xs w-full">
                    <option value="none">Ninguno</option>
                    <option value="running_sum">Total acumulado</option>
                    <option value="ytd">YTD (año hasta la fecha)</option>
                  </select>
                </div>
                <div>
                  <Label className="add-metric-label text-[11px]">Comparar con período anterior</Label>
                  <select value={agg.comparePeriod ?? ""} onChange={(e) => updateAgg({ comparePeriod: (e.target.value || undefined) as "previous_year" | "previous_month" | undefined })} className="add-metric-select mt-0.5 h-8 text-xs w-full">
                    <option value="">Ninguno</option>
                    <option value="previous_month">Mes anterior</option>
                    <option value="previous_year">Año anterior</option>
                  </select>
                </div>
                {(agg.cumulative === "ytd" || agg.comparePeriod) && (
                  <AdminFieldSelector label="Columna de fecha (YTD / comparación)" value={agg.dateDimension || ""} onChange={(v) => updateAgg({ dateDimension: v || undefined })} etlData={etlData} dataSourceId={form.dataSourceId} fieldType="all" placeholder="Campo fecha..." />
                )}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label className="add-metric-label">Métricas</Label>
                    <div className="flex items-center gap-1">
                      {savedMetrics.length > 0 && (
                        <select
                          value=""
                          onChange={(e) => {
                            const id = e.target.value;
                            if (!id) return;
                            const saved = savedMetrics.find((s) => s.id === id);
                            if (saved) addSavedMetric(saved);
                            e.target.value = "";
                          }}
                          className="h-7 text-xs rounded border border-[var(--studio-border)] bg-[var(--studio-surface)] px-2 text-[var(--studio-fg)]"
                        >
                          <option value="">Usar guardada…</option>
                          {savedMetrics.map((s) => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                      )}
                      <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={addMetric}>+ Crear nueva</Button>
                    </div>
                  </div>
                  {saveTemplateName != null && onSaveMetricAsTemplate && (
                    <div className="flex items-center gap-2 mb-2 p-2 rounded-lg border border-[var(--studio-border)] bg-[var(--studio-bg-elevated)]">
                      <Input
                        value={saveTemplateName.name}
                        onChange={(e) => setSaveTemplateName((p) => p ? { ...p, name: e.target.value } : null)}
                        placeholder="Nombre para reutilizar"
                        className="h-8 text-xs flex-1"
                        autoFocus
                      />
                      <Button type="button" size="sm" className="h-8 text-xs" onClick={confirmSaveTemplate}>Guardar</Button>
                      <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setSaveTemplateName(null)}>Cancelar</Button>
                    </div>
                  )}
                  <div className="space-y-2">
                    {metrics.map((m, i) => (
                      <div key={m.id} className="rounded-lg border border-[var(--studio-border)] p-2 space-y-2 bg-[var(--studio-bg-elevated)]">
                        <div className="flex gap-2 items-center">
                          <select value={m.func} onChange={(e) => updateMetric(i, { func: e.target.value })} className="flex-1 h-8 rounded border border-[var(--studio-border)] bg-[var(--studio-surface)] px-2 text-xs text-[var(--studio-fg)]">
                            {AGG_FUNCS.map((f) => (
                              <option key={f.value} value={f.value}>{f.label}</option>
                            ))}
                          </select>
                          {onSaveMetricAsTemplate && (
                            <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-[var(--studio-fg-muted)] hover:text-[var(--studio-accent)]" onClick={() => openSaveTemplate(i)} title="Guardar para reutilizar">
                              <BookmarkPlus className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-red-500" onClick={() => removeMetric(i)}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                        {m.func !== "FORMULA" ? (
                          <>
                            <AdminFieldSelector label="" value={m.field} onChange={(v) => updateMetric(i, { field: v })} etlData={etlData} dataSourceId={form.dataSourceId} fieldType={m.func === "COUNT" || m.func === "COUNT(DISTINCT" ? "all" : "numeric"} placeholder="Campo..." className="mb-0" />
                            <div className="space-y-1 text-[11px]">
                              <span className="text-[var(--studio-fg-muted)]">Solo cuando:</span>
                              <div className="grid grid-cols-3 gap-1">
                                <select value={m.condition?.field ?? ""} onChange={(e) => updateMetric(i, { condition: e.target.value ? { field: e.target.value, operator: m.condition?.operator ?? "=", value: m.condition?.value } : undefined })} className="h-7 rounded border border-[var(--studio-border)] bg-[var(--studio-surface)] px-1 text-[var(--studio-fg)]">
                                  <option value="">—</option>
                                  {fields.map((name) => (<option key={name} value={name}>{name}</option>))}
                                </select>
                                {m.condition?.field && (
                                  <>
                                    <select value={m.condition?.operator ?? "="} onChange={(e) => updateMetric(i, { condition: { ...m.condition!, operator: e.target.value } })} className="h-7 rounded border border-[var(--studio-border)] bg-[var(--studio-surface)] px-1">
                                      {["=", "!=", ">", ">=", "<", "<=", "LIKE", "ILIKE"].map((op) => (<option key={op} value={op}>{op}</option>))}
                                    </select>
                                    <Input value={m.condition?.value != null ? String(m.condition.value) : ""} onChange={(e) => updateMetric(i, { condition: { ...m.condition!, value: e.target.value || null } })} placeholder="Valor" className="h-7 text-[11px]" />
                                  </>
                                )}
                              </div>
                            </div>
                          </>
                        ) : (
                          <div className="space-y-1.5">
                            {(() => {
                              const baseRefs = metrics
                                .map((mm, idx) => (mm.func !== "FORMULA" ? { ref: `metric_${idx}`, label: mm.alias || mm.field || `Métrica ${idx + 1}` } : null))
                                .filter((x): x is { ref: string; label: string } => x != null);
                              return (
                                <>
                                  <Label className="add-metric-label text-[11px]">Operaciones: metric_0, metric_1… (+ - * /). En este widget: {baseRefs.length ? baseRefs.map((r) => `${r.ref}=«${r.label}»`).join(", ") : "añadí al menos una métrica base antes de la fórmula."}</Label>
                                  {baseRefs.length > 0 && (
                                    <select
                                      value=""
                                      onChange={(e) => {
                                        const ref = e.target.value;
                                        if (!ref) return;
                                        const cur = m.formula ?? "";
                                        updateMetric(i, { formula: cur + (cur && !cur.endsWith(" ") ? " " : "") + ref, field: "" });
                                        e.target.value = "";
                                      }}
                                      className="h-7 text-[11px] rounded border border-[var(--studio-border)] bg-[var(--studio-surface)] px-2 text-[var(--studio-fg)]"
                                    >
                                      <option value="">Insertar métrica en fórmula…</option>
                                      {baseRefs.map((r) => (
                                        <option key={r.ref} value={r.ref}>{r.ref} ({r.label})</option>
                                      ))}
                                    </select>
                                  )}
                                </>
                              );
                            })()}
                            <div className="flex flex-wrap gap-1">
                              {[
                                { label: "A ÷ B", expr: "metric_0 / NULLIF(metric_1, 0)" },
                                { label: "% A/B", expr: "100.0 * metric_0 / NULLIF(metric_1, 0)" },
                                { label: "Margen", expr: "(metric_0 - metric_1) / NULLIF(metric_0, 0)" },
                                { label: "A - B", expr: "metric_0 - metric_1" },
                                { label: "A + B", expr: "metric_0 + metric_1" },
                                { label: "A × B", expr: "metric_0 * metric_1" },
                              ].map(({ label, expr }) => (
                                <button
                                  key={label}
                                  type="button"
                                  onClick={() => updateMetric(i, { formula: expr, field: "" })}
                                  className="px-2 py-1 rounded text-[11px] border border-[var(--studio-border)] bg-[var(--studio-surface)] text-[var(--studio-fg)] hover:bg-[var(--studio-surface-hover)]"
                                >
                                  {label}
                                </button>
                              ))}
                            </div>
                            <Input value={m.formula ?? ""} onChange={(e) => updateMetric(i, { formula: e.target.value, field: "" })} placeholder="O escribí: (metric_0 - metric_1) / NULLIF(metric_0, 0)" className="h-8 text-xs font-mono" />
                          </div>
                        )}
                        <Input value={m.alias} onChange={(e) => updateMetric(i, { alias: e.target.value })} placeholder="Alias" className="h-8 text-xs" />
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label className="add-metric-label">Filtros</Label>
                    <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={addFilter}>+ Añadir</Button>
                  </div>
                  <div className="space-y-2">
                    {filters.map((f, i) => (
                      <div key={f.id || i} className="grid grid-cols-12 gap-1 items-center rounded border border-[var(--studio-border)] p-2 bg-[var(--studio-bg-elevated)]">
                        <div className="col-span-5">
                          <select value={f.field} onChange={(e) => updateFilter(i, { field: e.target.value })} className="w-full h-7 rounded border border-[var(--studio-border)] bg-[var(--studio-surface)] px-1 text-[11px] text-[var(--studio-fg)]">
                            {fields.map((name) => (
                              <option key={name} value={name}>{name}</option>
                            ))}
                          </select>
                        </div>
                        <div className="col-span-4">
                          <select value={f.operator} onChange={(e) => updateFilter(i, { operator: e.target.value })} className="w-full h-7 rounded border border-[var(--studio-border)] bg-[var(--studio-surface)] px-1 text-[11px] text-[var(--studio-fg)]">
                            {OPERATORS.map((op) => (
                              <option key={op} value={op}>{op}</option>
                            ))}
                          </select>
                        </div>
                        <div className="col-span-2">
                          <Input value={f.value != null ? String(f.value) : ""} onChange={(e) => updateFilter(i, { value: e.target.value || null })} placeholder="Valor" className="h-7 text-[11px]" />
                        </div>
                        <Button type="button" variant="ghost" size="icon" className="col-span-1 h-7 w-7 text-red-500" onClick={() => removeFilter(i)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="add-metric-label text-[11px]">Ordenar por</Label>
                    <select value={agg.orderBy?.field || ""} onChange={(e) => updateAgg({ orderBy: { field: e.target.value, direction: agg.orderBy?.direction || "DESC" } })} className="add-metric-select mt-0.5 h-8 text-xs">
                      <option value="">—</option>
                      {orderFields.map((name) => (
                        <option key={name} value={name}>{name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label className="add-metric-label text-[11px]">Sentido</Label>
                    <select value={agg.orderBy?.direction || "DESC"} onChange={(e) => updateAgg({ orderBy: { field: agg.orderBy?.field || orderFields[0] || "", direction: e.target.value as "ASC" | "DESC" } })} className="add-metric-select mt-0.5 h-8 text-xs">
                      <option value="DESC">Desc</option>
                      <option value="ASC">Asc</option>
                    </select>
                  </div>
                </div>
                <div>
                  <Label className="add-metric-label text-[11px]">Límite (filas)</Label>
                  <Input type="number" min={1} max={1000} value={agg.limit ?? ""} onChange={(e) => updateAgg({ limit: e.target.value ? parseInt(e.target.value, 10) : undefined })} className="add-metric-input mt-0.5 h-8 text-xs" placeholder="10" />
                </div>
              </div>
            )}
            <div className="flex items-center gap-2 pt-2">
              <Checkbox id="exclude-global-modal" checked={!!form.excludeGlobalFilters} onCheckedChange={(c) => updateForm({ excludeGlobalFilters: !!c })} />
              <Label htmlFor="exclude-global-modal" className="text-xs text-[var(--studio-fg-muted)] cursor-pointer">Excluir filtros globales</Label>
            </div>
          </>
        )}
      </div>
      <div className="flex-shrink-0 pt-4 border-t border-[var(--studio-border)]">
        <Button type="button" className="studio-form-submit w-full h-11 font-semibold rounded-[var(--studio-radius-sm)] bg-[var(--studio-accent)] text-[var(--studio-bg)] hover:opacity-90" onClick={handleCreate}>
          Crear métrica
        </Button>
      </div>
    </div>
  );
}
