"use client";

import { useState, useMemo, useEffect } from "react";
import type { DashboardTheme } from "@/types/dashboard";
import { mergeCardTheme, mergeTheme } from "@/types/dashboard";
import { X, Trash2, Play, BookmarkPlus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AdminFieldSelector from "./AdminFieldSelector";
import type { ETLDataResponse } from "@/hooks/admin/useAdminDashboardEtlData";
import { DashboardThemeFormSections, mergeCardThemePatch } from "./DashboardThemeFormSections";

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
  /** Solo sumar/contar cuando se cumpla esta condición (ej. estado = "Aprobado"). */
  condition?: MetricConditionEdit;
  /** Si func === "FORMULA", expresión que referencia metric_0, metric_1... (ej. "(metric_0 - metric_1) / NULLIF(metric_0, 0)"). */
  formula?: string;
};

export type AggregationFilterEdit = {
  id: string;
  field: string;
  operator: string;
  value: unknown;
  inputType?: string;
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
  chartSeriesColors?: Record<string, string>;
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
  chartRankingDirection?: "asc" | "desc";
  chartColorScheme?: string;
  showDataLabels?: boolean;
  labelVisibilityMode?: "all" | "auto" | "min_max";
  /** Mapeo valor en datos → texto a mostrar en etiquetas del gráfico (eje X, porciones pie/dona, series por dimensión). */
  chartLabelOverrides?: Record<string, string>;
  chartDatasetLabelOverrides?: Record<string, string>;
  /** Formato por métrica (clave = chartYAxes key). */
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
  /** Barras/líneas/combo: mostrar leyenda (por defecto true). */
  chartLegendVisible?: boolean;
  /** Torta/dona: mostrar leyenda (si false, solo etiquetas en porciones). Por defecto true. */
  pieLegendVisible?: boolean;
  /** Torta/dona: bajo ~480px de ancho forzar leyenda abajo. */
  pieLegendResponsive?: boolean;
  /** Para barras/combo: una barra por X dividida por la segunda dimensión. */
  chartStackBySeries?: boolean;
  /** Si la dimensión es una columna fecha, agrupar por este nivel. */
  dateGroupByGranularity?: "day" | "week" | "month" | "quarter" | "semester" | "year";
  geoHints?: {
    countryField?: string;
    provinceField?: string;
    cityField?: string;
    addressField?: string;
    latField?: string;
    lonField?: string;
  };
  /** Tabla: clave de columna → texto del encabezado. */
  tableColumnLabelOverrides?: Record<string, string>;
};

export type MetricConfigWidget = {
  id: string;
  type: string;
  title: string;
  gridSpan?: number;
  minHeight?: number;
  aggregationConfig?: AggregationConfigEdit;
  labelDisplayMode?: "percent" | "value" | "both";
  color?: string;
  kpiSecondaryLabel?: string;
  kpiSecondaryValue?: string;
  /** Texto bajo el valor del KPI (sin línea secundaria). */
  kpiCaption?: string;
  excludeGlobalFilters?: boolean;
  /** ID de la fuente de datos cuando el dashboard tiene múltiples ETLs */
  dataSourceId?: string | null;
  /** Tema visual solo para esta tarjeta (opcional). */
  cardTheme?: Partial<DashboardTheme>;
};

export type SavedMetricPanel = { id: string; name: string; metric: AggregationMetricEdit };

const CHART_TYPES: { value: string; label: string }[] = [
  { value: "bar", label: "Barras verticales" },
  { value: "stackedColumn", label: "Columnas apiladas" },
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

/** Incluye apiladas: mismas opciones de apariencia que barras/líneas. */
const CHART_APPEARANCE_CARTESIAN =
  "bar,horizontalBar,stackedColumn,line,area,combo,scatter";
const CHART_APPEARANCE_WITH_LEGEND = `${CHART_APPEARANCE_CARTESIAN},pie,doughnut`;

function isChartTypeIn(csv: string, ct: string): boolean {
  return csv.split(",").includes(ct);
}

const AGG_FUNCS: { value: string; label: string }[] = [
  { value: "SUM", label: "Suma" },
  { value: "AVG", label: "Promedio" },
  { value: "COUNT", label: "Conteo" },
  { value: "MIN", label: "Mínimo" },
  { value: "MAX", label: "Máximo" },
  { value: "COUNT(DISTINCT", label: "Conteo único" },
  { value: "FORMULA", label: "Fórmula / ratio" },
];

const OPERATORS = [
  "=", "!=", ">", ">=", "<", "<=",
  "LIKE", "ILIKE", "IN", "BETWEEN",
  "MONTH", "YEAR", "DAY", "QUARTER", "SEMESTER", "IS", "IS NOT",
];

type MetricConfigPanelProps = {
  widget: MetricConfigWidget;
  /** Tema global del dashboard (barra de apariencia); base para fusionar con `cardTheme`. */
  dashboardTheme?: DashboardTheme;
  /** Etiquetas de datasets del preview (colores por serie además de chartYAxes). */
  previewChartDatasetLabels?: string[];
  etlData: ETLDataResponse | null;
  etlLoading: boolean;
  onUpdate: (patch: Partial<MetricConfigWidget>) => void;
  onLoadData: () => void;
  onClose: () => void;
  /** Métricas guardadas para reutilizar */
  savedMetrics?: SavedMetricPanel[];
  onSaveMetricAsTemplate?: (name: string, metric: AggregationMetricEdit) => void;
};

const CHART_TYPES_FOR_LABELS = ["bar", "horizontalBar", "stackedColumn", "line", "area", "pie", "doughnut", "combo", "scatter"];
const LABEL_VISIBILITY_OPTIONS: Array<{ value: "all" | "auto" | "min_max"; label: string }> = [
  { value: "all", label: "Todas" },
  { value: "auto", label: "Algunas (automático)" },
  { value: "min_max", label: "Máximos y mínimos" },
];

const CHART_FONT_FAMILY_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Heredar del dashboard" },
  { value: "'DM Sans', system-ui, -apple-system, sans-serif", label: "DM Sans" },
  { value: "Inter, system-ui, -apple-system, sans-serif", label: "Inter" },
  { value: "'Roboto', system-ui, sans-serif", label: "Roboto" },
  { value: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", label: "Sistema" },
];

const LEGEND_POSITION_OPTIONS: Array<{ value: "top" | "bottom" | "left" | "right" | "chartArea"; label: string }> = [
  { value: "top", label: "Arriba" },
  { value: "bottom", label: "Abajo" },
  { value: "left", label: "Izquierda" },
  { value: "right", label: "Derecha" },
  { value: "chartArea", label: "Sobre el gráfico" },
];

export function MetricConfigPanel({
  widget,
  dashboardTheme,
  previewChartDatasetLabels = [],
  etlData,
  etlLoading,
  onUpdate,
  onLoadData,
  onClose,
  savedMetrics = [],
  onSaveMetricAsTemplate,
}: MetricConfigPanelProps) {
  const [saveTemplateForIndex, setSaveTemplateForIndex] = useState<number | null>(null);
  const [saveTemplateName, setSaveTemplateName] = useState("");
  const [panelTab, setPanelTab] = useState("general");
  useEffect(() => {
    setPanelTab("general");
  }, [widget.id]);
  const agg = widget.aggregationConfig || { enabled: false, metrics: [] };
  const chartType = (agg.chartType as string) || widget.type;
  const showLabelOverrides = CHART_TYPES_FOR_LABELS.includes(chartType);
  const labelOverridesEntries = useMemo(
    () => Object.entries(agg.chartLabelOverrides ?? {}),
    [agg.chartLabelOverrides]
  );
  const [labelOverrideRawDrafts, setLabelOverrideRawDrafts] = useState<Record<string, string>>({});
  const [tableColKeyDrafts, setTableColKeyDrafts] = useState<Record<string, string>>({});
  const filters = agg.filters || [];
  const metrics = agg.metrics || [];
  const yAxisKeysForUi = useMemo(() => {
    const raw = (agg.chartYAxes ?? []).map((k) => String(k ?? "").trim()).filter(Boolean);
    if (raw.length > 0) return raw;
    return metrics.map((_, i) => `metric_${i}`);
  }, [agg.chartYAxes, metrics]);
  const seriesColorKeys = useMemo(() => {
    const fromPreview = previewChartDatasetLabels.map((s) => String(s ?? "").trim()).filter(Boolean);
    return Array.from(new Set([...yAxisKeysForUi, ...fromPreview]));
  }, [yAxisKeysForUi, previewChartDatasetLabels]);
  const sources = etlData?.dataSources;
  const selectedSource = sources?.find(
    (s) => s.id === (widget.dataSourceId ?? etlData?.primarySourceId ?? sources[0]?.id)
  );
  const fields = selectedSource?.fields?.all ?? etlData?.fields?.all ?? [];

  const updateAgg = (patch: Partial<AggregationConfigEdit>) => {
    onUpdate({
      aggregationConfig: { ...agg, ...patch },
    });
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
      metrics: [
        ...metrics,
        { id: `m-${Date.now()}`, func: "SUM", field, alias: field || "valor" },
      ],
    });
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
      filters: [
        ...filters,
        { id: `f-${Date.now()}`, field: fields[0] || "", operator: "=", value: "" },
      ],
    });
  };

  const removeFilter = (index: number) => {
    updateAgg({ filters: filters.filter((_, i) => i !== index) });
  };

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

  const tableColEntries = useMemo(
    () => Object.entries(agg.tableColumnLabelOverrides ?? {}),
    [agg.tableColumnLabelOverrides]
  );
  const setTableColHeader = (dataKey: string, header: string) => {
    const next = { ...(agg.tableColumnLabelOverrides ?? {}) };
    if (!Object.prototype.hasOwnProperty.call(next, dataKey)) return;
    next[dataKey] = header;
    updateAgg({ tableColumnLabelOverrides: Object.keys(next).length ? next : undefined });
  };
  const commitTableColKeyDraft = (oldKey: string, header: string) => {
    const draft = tableColKeyDrafts[oldKey];
    if (typeof draft !== "string") return;
    const normalized = draft.trim();
    setTableColKeyDrafts((prev) => {
      const n = { ...prev };
      delete n[oldKey];
      return n;
    });
    if (normalized === "" || normalized === oldKey) return;
    const next = { ...(agg.tableColumnLabelOverrides ?? {}) };
    const prevHeader = next[oldKey] ?? header;
    delete next[oldKey];
    next[normalized] = prevHeader;
    updateAgg({ tableColumnLabelOverrides: Object.keys(next).length ? next : undefined });
  };
  const removeTableColOverride = (key: string) => {
    const next = { ...(agg.tableColumnLabelOverrides ?? {}) };
    delete next[key];
    setTableColKeyDrafts((prev) => {
      if (!Object.prototype.hasOwnProperty.call(prev, key)) return prev;
      const n = { ...prev };
      delete n[key];
      return n;
    });
    updateAgg({ tableColumnLabelOverrides: Object.keys(next).length ? next : undefined });
  };
  const addTableColOverride = () => {
    if (Object.prototype.hasOwnProperty.call(agg.tableColumnLabelOverrides ?? {}, "")) return;
    updateAgg({ tableColumnLabelOverrides: { ...(agg.tableColumnLabelOverrides ?? {}), "": "" } });
  };

  const addSavedMetric = (saved: SavedMetricPanel) => {
    const savedWithConfig = saved as SavedMetricPanel & { aggregationConfig?: { metrics?: AggregationMetricEdit[] } };
    const firstMetric = savedWithConfig.aggregationConfig?.metrics?.[0];
    const metricToAdd = (firstMetric ?? saved.metric) as AggregationMetricEdit;
    updateAgg({ metrics: [...metrics, { ...metricToAdd, id: `m-${Date.now()}` }] });
  };

  const orderFields = agg.enabled
    ? [agg.dimension, agg.dimension2, agg.dateDimension, ...metrics.map((m) => m.alias || m.field)].filter(Boolean) as string[]
    : fields;

  const showDataTabs = !["filter", "image", "text"].includes(widget.type);

  const themeGlobalResolved = useMemo(() => mergeTheme(dashboardTheme ?? undefined), [dashboardTheme]);
  const cardAppearancePreview = useMemo(
    () => mergeCardTheme(themeGlobalResolved, widget.cardTheme),
    [themeGlobalResolved, widget.cardTheme]
  );

  return (
    <aside className="metric-config-panel flex h-full w-full max-w-[380px] flex-col border-l border-[var(--studio-border)] bg-[var(--studio-bg-elevated)] shadow-xl">
      <header className="flex flex-shrink-0 items-center justify-between border-b border-[var(--studio-border)] bg-[var(--studio-surface)] px-4 py-3">
        <h3 className="text-sm font-semibold tracking-tight text-[var(--studio-fg)]">Configurar métrica</h3>
        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-[var(--studio-fg-muted)] hover:bg-[var(--studio-surface-hover)] hover:text-[var(--studio-fg)]" onClick={onClose} aria-label="Cerrar">
          <X className="h-4 w-4" />
        </Button>
      </header>
      <Tabs value={panelTab} onValueChange={setPanelTab} className="flex min-h-0 min-w-0 flex-1 flex-col px-3 pt-3">
        <TabsList className="mb-2 h-auto w-full flex-shrink-0 flex-wrap justify-start gap-1 rounded-lg border border-[var(--studio-border)] bg-[var(--studio-surface)] p-1">
          <TabsTrigger
            value="general"
            className="px-2 py-1.5 text-xs data-[state=active]:bg-[var(--studio-accent-dim)] data-[state=active]:text-[var(--studio-accent)]"
          >
            General
          </TabsTrigger>
          {showDataTabs ? (
            <>
              <TabsTrigger
                value="appearance"
                title="Leyenda, etiquetas de datos, colores, ejes y tipografía del gráfico"
                className="px-2 py-1.5 text-xs data-[state=active]:bg-[var(--studio-accent-dim)] data-[state=active]:text-[var(--studio-accent)]"
              >
                Gráfico
              </TabsTrigger>
              <TabsTrigger
                value="data"
                className="px-2 py-1.5 text-xs data-[state=active]:bg-[var(--studio-accent-dim)] data-[state=active]:text-[var(--studio-accent)]"
              >
                Datos
              </TabsTrigger>
              <TabsTrigger
                value="order"
                className="px-2 py-1.5 text-xs data-[state=active]:bg-[var(--studio-accent-dim)] data-[state=active]:text-[var(--studio-accent)]"
              >
                Orden
              </TabsTrigger>
            </>
          ) : null}
        </TabsList>
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto pb-4">
          <TabsContent value="general" className="mt-0 space-y-5 focus-visible:outline-none">
            {showDataTabs ? (
              <div className="space-y-2 rounded-lg border border-[var(--studio-border)] bg-[var(--studio-surface)]/80 p-3">
                <p className="text-xs leading-relaxed text-[var(--studio-fg)]">
                  Para la <strong className="text-[var(--studio-accent)]">ubicación de la leyenda</strong>,{" "}
                  <strong className="text-[var(--studio-accent)]">etiquetas sobre barras/líneas</strong>,{" "}
                  <strong className="text-[var(--studio-accent)]">colores</strong> (serie, cuadrícula, ejes) y{" "}
                  <strong className="text-[var(--studio-accent)]">tipografía del gráfico</strong>, usá la pestaña{" "}
                  <strong>Gráfico</strong>.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 w-full border-[var(--studio-border)] text-xs"
                  onClick={() => setPanelTab("appearance")}
                >
                  Abrir opciones del gráfico
                </Button>
              </div>
            ) : null}
            <div>
              <Label className="text-xs font-medium text-[var(--studio-fg-muted)]">Título</Label>
              <Input
                value={widget.title}
                onChange={(e) => onUpdate({ title: e.target.value })}
                className="mt-1.5 h-9 rounded-lg border-[var(--studio-border)]"
                placeholder="Nombre de la métrica"
              />
            </div>

            <div>
              <Label className="text-xs font-medium text-[var(--studio-fg-muted)]">Tipo de gráfico</Label>
              <select
                value={(widget.aggregationConfig as any)?.chartType || widget.type}
                onChange={(e) => {
                  const newType = e.target.value;
                  onUpdate({
                    type: newType,
                    aggregationConfig: { ...agg, chartType: newType },
                  });
                }}
                className="mt-1.5 w-full h-9 rounded-lg border border-[var(--studio-border)] bg-[var(--studio-surface)] px-3 text-sm text-[var(--studio-fg)]"
              >
                {CHART_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Label className="text-xs font-medium text-[var(--studio-fg-muted)]">Columnas en grid</Label>
              <select
                value={Math.min(6, Math.max(1, widget.gridSpan ?? 2))}
                onChange={(e) => onUpdate({ gridSpan: parseInt(e.target.value, 10) })}
                className="mt-1.5 w-full h-9 rounded-lg border border-[var(--studio-border)] bg-[var(--studio-surface)] px-3 text-sm"
              >
                <option value={1}>1</option>
                <option value={2}>2</option>
                <option value={3}>3</option>
                <option value={4}>4</option>
                <option value={5}>5</option>
                <option value={6}>6 (ancho completo)</option>
              </select>
            </div>

            {sources && sources.length > 1 ? (
              <div>
                <Label className="text-xs font-medium text-[var(--studio-fg-muted)]">Fuente de datos</Label>
                <select
                  value={widget.dataSourceId ?? etlData?.primarySourceId ?? sources[0]?.id ?? ""}
                  onChange={(e) => onUpdate({ dataSourceId: e.target.value || null })}
                  className="mt-1.5 w-full h-9 rounded-lg border border-[var(--studio-border)] bg-[var(--studio-surface)] px-3 text-sm text-[var(--studio-fg)]"
                >
                  {sources.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.etlName || s.alias || s.id}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            <div className="space-y-3 rounded-lg border border-[var(--studio-border)] bg-[var(--studio-surface)]/40 p-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs font-semibold text-[var(--studio-fg)]">Apariencia de esta tarjeta</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 shrink-0 text-xs"
                  onClick={() => onUpdate({ cardTheme: undefined })}
                >
                  Usar solo tema del dashboard
                </Button>
              </div>
              <p className="text-[11px] leading-snug text-[var(--studio-fg-muted)]">
                Afecta solo a esta métrica en el lienzo y en la vista cliente. Campos vacíos heredan el tema global.
              </p>
              <DashboardThemeFormSections
                scope="card"
                value={cardAppearancePreview}
                onPatch={(patch) => onUpdate({ cardTheme: mergeCardThemePatch(widget.cardTheme, patch) })}
                labelClassName="text-xs font-medium text-[var(--studio-fg-muted)]"
                inputClassName="h-9 rounded-lg border border-[var(--studio-border)] bg-[var(--studio-surface)] px-3 text-sm text-[var(--studio-fg)]"
              />
            </div>

            {((widget.aggregationConfig as any)?.chartType || widget.type) === "kpi" && (
              <div className="space-y-3">
                <Label className="text-xs font-medium text-[var(--studio-fg-muted)]">KPI — texto bajo el número</Label>
                <Input
                  value={widget.kpiCaption ?? ""}
                  onChange={(e) => onUpdate({ kpiCaption: e.target.value || undefined })}
                  className="h-9 rounded-lg"
                  placeholder="Ej. Ventas del mes (si no usás línea secundaria)"
                />
                <p className="text-[11px] text-[var(--studio-fg-muted)]">
                  Se muestra debajo del valor cuando no configurás la línea secundaria manual.
                </p>
                <Label className="text-xs font-medium text-[var(--studio-fg-muted)]">KPI — línea secundaria</Label>
                <Input
                  value={widget.kpiSecondaryLabel ?? ""}
                  onChange={(e) => onUpdate({ kpiSecondaryLabel: e.target.value || undefined })}
                  className="h-9 rounded-lg"
                  placeholder="Etiqueta (ej. Ticket promedio)"
                />
                <Input
                  value={widget.kpiSecondaryValue ?? ""}
                  onChange={(e) => onUpdate({ kpiSecondaryValue: e.target.value || undefined })}
                  className="h-9 rounded-lg"
                  placeholder="Valor (ej. $ 3.202)"
                />
              </div>
            )}

            {((widget.aggregationConfig as any)?.chartType || widget.type) === "table" && (
              <div className="space-y-3 rounded-lg border border-[var(--studio-border)] bg-[var(--studio-surface)]/40 p-3">
                <Label className="text-xs font-medium text-[var(--studio-fg-muted)]">Encabezados de tabla</Label>
                <p className="text-[11px] text-[var(--studio-fg-muted)]">
                  Mapeá el nombre de columna en los datos al texto del encabezado (ej. <code className="text-[10px]">SUM(ventas)</code> → Ventas).
                </p>
                <div className="space-y-2">
                  {tableColEntries.map(([dataKey, headerText], idx) => (
                    <div key={`tcol-${idx}-${dataKey}`} className="flex items-center gap-2">
                      <Input
                        value={tableColKeyDrafts[dataKey] ?? dataKey}
                        onChange={(e) => setTableColKeyDrafts((prev) => ({ ...prev, [dataKey]: e.target.value }))}
                        onBlur={() => commitTableColKeyDraft(dataKey, headerText)}
                        placeholder="Nombre de columna en datos"
                        className="h-8 flex-1 text-xs font-mono"
                      />
                      <span className="text-xs text-[var(--studio-fg-muted)]">→</span>
                      <Input
                        value={headerText}
                        onChange={(e) => setTableColHeader(dataKey, e.target.value)}
                        placeholder="Encabezado visible"
                        className="h-8 flex-1 text-xs"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0 text-red-500"
                        onClick={() => removeTableColOverride(dataKey)}
                        aria-label="Quitar"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
                <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={addTableColOverride}>
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Añadir columna
                </Button>
              </div>
            )}

            {showDataTabs ? (
              <>
                <div className="flex items-center gap-2 pt-2">
                  <Checkbox
                    id="exclude-global"
                    checked={!!widget.excludeGlobalFilters}
                    onCheckedChange={(c) => onUpdate({ excludeGlobalFilters: !!c })}
                  />
                  <Label htmlFor="exclude-global" className="cursor-pointer text-xs text-[var(--studio-fg-muted)]">
                    Excluir filtros globales de esta métrica
                  </Label>
                </div>
                <Button
                  className="mt-2 h-10 w-full border border-[rgba(34,211,238,0.3)] bg-[var(--studio-accent-dim)] font-medium text-[var(--studio-accent)] hover:bg-[rgba(34,211,238,0.25)] hover:text-[var(--studio-accent)]"
                  onClick={onLoadData}
                  disabled={!etlData || etlLoading}
                >
                  <Play className="mr-2 h-4 w-4" />
                  Actualizar datos
                </Button>
              </>
            ) : null}
          </TabsContent>

          {showDataTabs ? (
            <>
            <TabsContent value="appearance" className="mt-0 space-y-5 focus-visible:outline-none">
            <p className="text-[11px] leading-relaxed text-[var(--studio-fg-muted)]">
              Acá definís <strong className="text-[var(--studio-fg)]">leyenda</strong>,{" "}
              <strong className="text-[var(--studio-fg)]">etiquetas sobre los datos</strong>,{" "}
              <strong className="text-[var(--studio-fg)]">colores</strong> de la serie y de ejes/cuadrícula, y{" "}
              <strong className="text-[var(--studio-fg)]">tipografía</strong> del dibujo (combo, barras, líneas, etc.). El fondo
              y borde de la <em>tarjeta</em> se configuran en <strong>General</strong> → «Apariencia de esta tarjeta».
            </p>
            <div className="space-y-4 border-b border-[var(--studio-border)] pb-4">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--studio-fg)]">Leyenda y etiquetas</h4>
        {(((widget.aggregationConfig as any)?.chartType || widget.type) === "pie" || ((widget.aggregationConfig as any)?.chartType || widget.type) === "doughnut") && (
          <div className="space-y-3 rounded-lg border border-[var(--studio-border)] bg-[var(--studio-bg-elevated)]/40 p-3">
            <p className="text-[11px] leading-relaxed text-[var(--studio-fg-muted)]">
              Con muchas categorías probá <strong className="text-[var(--studio-fg)]">leyenda abajo</strong> o{" "}
              <strong className="text-[var(--studio-fg)]">desactivá la leyenda</strong> y usá etiquetas en las porciones. El tooltip siempre muestra el nombre completo.
            </p>
            <div>
              <Label className="text-xs font-medium text-[var(--studio-fg-muted)]">Etiquetas en porciones</Label>
              <select
                value={widget.labelDisplayMode || "percent"}
                onChange={(e) => onUpdate({ labelDisplayMode: e.target.value as "percent" | "value" | "both" })}
                className="mt-1.5 w-full h-9 rounded-lg border border-[var(--studio-border)] bg-[var(--studio-surface)] px-3 text-sm"
              >
                <option value="percent">Porcentaje</option>
                <option value="value">Valor</option>
                <option value="both">Valor + porcentaje</option>
              </select>
            </div>
            <div>
              <Label className="text-xs font-medium text-[var(--studio-fg-muted)]">Posición de la leyenda</Label>
              <select
                value={agg.chartLegendPosition ?? ""}
                onChange={(e) =>
                  updateAgg({
                    chartLegendPosition: (e.target.value || undefined) as AggregationConfigEdit["chartLegendPosition"],
                  })
                }
                className="mt-1.5 w-full h-9 rounded-lg border border-[var(--studio-border)] bg-[var(--studio-surface)] px-3 text-sm"
              >
                <option value="">Predeterminada (derecha)</option>
                {LEGEND_POSITION_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="pie-legend-visible"
                checked={agg.pieLegendVisible !== false}
                onChange={(e) => updateAgg({ pieLegendVisible: e.target.checked })}
                className="rounded"
              />
              <Label htmlFor="pie-legend-visible" className="cursor-pointer text-xs text-[var(--studio-fg-muted)]">
                Mostrar leyenda
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="pie-legend-responsive"
                checked={agg.pieLegendResponsive === true}
                onChange={(e) => updateAgg({ pieLegendResponsive: e.target.checked ? true : undefined })}
                className="rounded"
              />
              <Label htmlFor="pie-legend-responsive" className="cursor-pointer text-xs text-[var(--studio-fg-muted)]">
                En pantallas estrechas, leyenda abajo (ancho &lt; 480px)
              </Label>
            </div>
          </div>
        )}
        {showLabelOverrides && (
          <div>
            <Label className="text-xs font-medium text-[var(--studio-fg-muted)]">Mostrar etiquetas de datos</Label>
            <div className="mt-1.5 flex items-center gap-2">
              <input
                type="checkbox"
                checked={agg.showDataLabels !== false}
                onChange={(e) => updateAgg({ showDataLabels: e.target.checked })}
                className="rounded"
              />
              <span className="text-xs text-[var(--studio-fg-muted)]">Mostrar texto sobre los puntos/porciones</span>
            </div>
          </div>
        )}
        {showLabelOverrides && (
          <div>
            <Label className="text-xs font-medium text-[var(--studio-fg-muted)]">Visibilidad de etiquetas</Label>
            <select
              value={agg.labelVisibilityMode ?? "auto"}
              onChange={(e) => updateAgg({ labelVisibilityMode: e.target.value as "all" | "auto" | "min_max" })}
              className="mt-1.5 w-full h-9 rounded-lg border border-[var(--studio-border)] bg-[var(--studio-surface)] px-3 text-sm"
            >
              {LABEL_VISIBILITY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        )}
        {showLabelOverrides && (
          <div>
            <Label className="text-xs font-medium text-[var(--studio-fg-muted)]">Máx. puntos con etiqueta (automático)</Label>
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
              className="mt-1.5 h-9 text-xs"
            />
            <p className="mt-0.5 text-[11px] text-[var(--studio-fg-muted)]">
              Solo con “Algunas (automático)”. Subí el número si querés más etiquetas visibles sobre barras o líneas.
            </p>
          </div>
        )}
        {isChartTypeIn(CHART_APPEARANCE_WITH_LEGEND, chartType) &&
          chartType !== "pie" &&
          chartType !== "doughnut" && (
          <div className="space-y-3">
            <div>
              <Label className="text-xs font-medium text-[var(--studio-fg-muted)]">Posición de la leyenda</Label>
              <select
                value={agg.chartLegendPosition ?? ""}
                onChange={(e) =>
                  updateAgg({
                    chartLegendPosition: (e.target.value || undefined) as AggregationConfigEdit["chartLegendPosition"],
                  })
                }
                className="mt-1.5 w-full h-9 rounded-lg border border-[var(--studio-border)] bg-[var(--studio-surface)] px-3 text-sm"
              >
                <option value="">Predeterminada (arriba)</option>
                {LEGEND_POSITION_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="cart-legend-visible"
                checked={agg.chartLegendVisible !== false}
                onChange={(e) =>
                  updateAgg({ chartLegendVisible: e.target.checked ? undefined : false })
                }
                className="rounded"
              />
              <Label htmlFor="cart-legend-visible" className="cursor-pointer text-xs text-[var(--studio-fg-muted)]">
                Mostrar leyenda
              </Label>
            </div>
          </div>
        )}
            </div>

            <div className="space-y-4 border-b border-[var(--studio-border)] pb-4">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--studio-fg)]">Colores, ejes y cuadrícula</h4>

        {isChartTypeIn(CHART_APPEARANCE_WITH_LEGEND, chartType) && (
          <div>
            <Label className="text-xs font-medium text-[var(--studio-fg-muted)]">Color principal de la serie</Label>
            <div className="mt-1.5 flex items-center gap-2">
              <input
                type="color"
                value={widget.color || "#0ea5e9"}
                onChange={(e) => onUpdate({ color: e.target.value })}
                className="h-9 w-12 rounded-lg border border-[var(--studio-border)] cursor-pointer"
              />
              <Input
                value={widget.color || ""}
                onChange={(e) => onUpdate({ color: e.target.value || undefined })}
                className="h-9 flex-1 font-mono text-xs"
                placeholder="#0ea5e9"
              />
            </div>
          </div>
        )}
        {yAxisKeysForUi.length > 0 && isChartTypeIn(CHART_APPEARANCE_WITH_LEGEND, chartType) && (
          <div className="space-y-2 rounded-lg border border-[var(--studio-border)] bg-[var(--studio-surface)]/30 p-3">
            <Label className="text-xs font-medium text-[var(--studio-fg-muted)]">Nombres en leyenda (por métrica)</Label>
            <p className="text-[11px] text-[var(--studio-fg-muted)]">
              Texto opcional en la leyenda para cada eje Y. Si lo dejás vacío se usa el alias de la métrica o el nombre de columna.
            </p>
            {yAxisKeysForUi.map((yKey) => (
              <div key={yKey}>
                <Label className="text-[11px] text-[var(--studio-fg-muted)]">{yKey}</Label>
                <Input
                  value={agg.chartDatasetLabelOverrides?.[yKey] ?? ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    const next = { ...(agg.chartDatasetLabelOverrides ?? {}) };
                    if (v.trim() === "") delete next[yKey];
                    else next[yKey] = v;
                    updateAgg({
                      chartDatasetLabelOverrides: Object.keys(next).length ? next : undefined,
                    });
                  }}
                  placeholder={`Predeterminado (${yKey})`}
                  className="mt-0.5 h-8 text-xs"
                />
              </div>
            ))}
          </div>
        )}
        {seriesColorKeys.length > 0 && isChartTypeIn(CHART_APPEARANCE_WITH_LEGEND, chartType) && (
          <div className="space-y-2 rounded-lg border border-[var(--studio-border)] bg-[var(--studio-surface)]/30 p-3">
            <Label className="text-xs font-medium text-[var(--studio-fg-muted)]">Color por serie</Label>
            <p className="text-[11px] text-[var(--studio-fg-muted)]">
              Clave de métrica o etiqueta de serie del preview. Vacío en hex quita el color personalizado para esa clave.
            </p>
            {seriesColorKeys.map((sKey) => {
              const hex = agg.chartSeriesColors?.[sKey] || widget.color || "#0ea5e9";
              return (
                <div key={sKey} className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 max-w-[140px] truncate font-mono text-[11px] text-[var(--studio-fg-muted)]" title={sKey}>
                    {sKey}
                  </span>
                  <input
                    type="color"
                    value={/^#[0-9A-Fa-f]{6}$/.test(hex) ? hex : "#0ea5e9"}
                    onChange={(e) => {
                      const next = { ...(agg.chartSeriesColors ?? {}) };
                      next[sKey] = e.target.value;
                      updateAgg({ chartSeriesColors: next });
                    }}
                    className="h-8 w-10 shrink-0 cursor-pointer rounded border border-[var(--studio-border)]"
                  />
                  <Input
                    value={agg.chartSeriesColors?.[sKey] ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      const next = { ...(agg.chartSeriesColors ?? {}) };
                      if (v.trim() === "") delete next[sKey];
                      else next[sKey] = v;
                      updateAgg({
                        chartSeriesColors: Object.keys(next).length ? next : undefined,
                      });
                    }}
                    className="h-8 min-w-[6rem] flex-1 font-mono text-[11px]"
                    placeholder="#hex"
                  />
                </div>
              );
            })}
          </div>
        )}
        {isChartTypeIn(CHART_APPEARANCE_CARTESIAN, chartType) && (
          <div>
            <Label className="text-xs font-medium text-[var(--studio-fg-muted)]">Visibilidad de ejes</Label>
            <div className="mt-1.5 flex flex-wrap items-center gap-4">
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
        {isChartTypeIn(CHART_APPEARANCE_CARTESIAN, chartType) && (
          <div>
            <Label className="text-xs font-medium text-[var(--studio-fg-muted)]">Líneas de cuadrícula</Label>
            <div className="mt-1.5 flex flex-wrap items-center gap-4">
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
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-xs text-[var(--studio-fg-muted)]">Color de la cuadrícula</span>
              <input
                type="color"
                value={agg.chartGridColor || "#e2e8f0"}
                onChange={(e) => updateAgg({ chartGridColor: e.target.value })}
                className="h-8 w-10 rounded border border-[var(--studio-border)]"
              />
            </div>
          </div>
        )}

        {isChartTypeIn(CHART_APPEARANCE_WITH_LEGEND, chartType) && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Label className="text-xs text-[var(--studio-fg-muted)]">Color de etiquetas de dato</Label>
              <input
                type="color"
                value={agg.chartDataLabelColor || "#374151"}
                onChange={(e) => updateAgg({ chartDataLabelColor: e.target.value })}
                className="h-8 w-10 rounded border border-[var(--studio-border)]"
              />
              <Input
                value={agg.chartDataLabelColor ?? ""}
                onChange={(e) => updateAgg({ chartDataLabelColor: e.target.value || undefined })}
                className="h-8 min-w-[7rem] flex-1 font-mono text-[11px]"
                placeholder="#374151 o rgba(...)"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Label className="text-xs text-[var(--studio-fg-muted)]">Color de números en ejes</Label>
              <input
                type="color"
                value={agg.chartAxisTickColor || "#64748b"}
                onChange={(e) => updateAgg({ chartAxisTickColor: e.target.value })}
                className="h-8 w-10 rounded border border-[var(--studio-border)]"
              />
              <Input
                value={agg.chartAxisTickColor ?? ""}
                onChange={(e) => updateAgg({ chartAxisTickColor: e.target.value || undefined })}
                className="h-8 min-w-[7rem] flex-1 font-mono text-[11px]"
                placeholder="#64748b"
              />
            </div>
          </>
        )}
            </div>

        {isChartTypeIn(CHART_APPEARANCE_WITH_LEGEND, chartType) && (
          <div className="space-y-3 border-b border-[var(--studio-border)] pb-4">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--studio-fg)]">Tipografía y espacio</h4>
            <p className="text-[11px] text-[var(--studio-fg-muted)]">
              Si dejás «Heredar del dashboard» en la fuente, se usa la familia del tema. Los tamaños ayudan cuando la leyenda o las etiquetas se superponen.
            </p>
            <div>
              <Label className="text-[11px] text-[var(--studio-fg-muted)]">Fuente (font-family CSS)</Label>
              <select
                className="mt-0.5 w-full h-9 rounded-lg border border-[var(--studio-border)] bg-[var(--studio-surface)] px-2 text-xs"
                value={
                  CHART_FONT_FAMILY_OPTIONS.some((o) => o.value === (agg.chartFontFamily ?? ""))
                    ? (agg.chartFontFamily ?? "")
                    : agg.chartFontFamily
                      ? "__other__"
                      : ""
                }
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "__other__") {
                    updateAgg({ chartFontFamily: agg.chartFontFamily || "'DM Sans', system-ui, sans-serif" });
                  } else {
                    updateAgg({ chartFontFamily: v || undefined });
                  }
                }}
              >
                {CHART_FONT_FAMILY_OPTIONS.map((o) => (
                  <option key={o.value || "inherit"} value={o.value}>
                    {o.label}
                  </option>
                ))}
                <option value="__other__">Personalizada…</option>
              </select>
              <Input
                value={agg.chartFontFamily ?? ""}
                onChange={(e) => updateAgg({ chartFontFamily: e.target.value || undefined })}
                className="mt-2 h-8 font-mono text-[11px]"
                placeholder="'Inter', system-ui, sans-serif"
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
                  className="mt-0.5 h-8 text-xs"
                  placeholder="12"
                />
              </div>
              <div>
                <Label className="text-[11px] text-[var(--studio-fg-muted)]">Tamaño ejes / leyenda</Label>
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
                  className="mt-0.5 h-8 text-xs"
                  placeholder="11"
                />
              </div>
            </div>
            <div>
              <Label className="text-[11px] text-[var(--studio-fg-muted)]">Padding interno del gráfico (px)</Label>
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
                className="mt-0.5 h-8 text-xs"
                placeholder="16"
              />
            </div>
            {isChartTypeIn(CHART_APPEARANCE_CARTESIAN, chartType) && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-[11px] text-[var(--studio-fg-muted)]">Rotación máx. eje categorías (°)</Label>
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
                    className="mt-0.5 h-8 text-xs"
                    placeholder="0"
                  />
                </div>
                <div>
                  <Label className="text-[11px] text-[var(--studio-fg-muted)]">Máx. ticks en categorías</Label>
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
                    className="mt-0.5 h-8 text-xs"
                    placeholder="Auto"
                  />
                </div>
                <div className="col-span-2">
                  <Label className="text-[11px] text-[var(--studio-fg-muted)]">Rotación mínima (°)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={90}
                    value={agg.chartCategoryTickMinRotation ?? ""}
                    onChange={(e) =>
                      updateAgg({
                        chartCategoryTickMinRotation: e.target.value ? parseInt(e.target.value, 10) : undefined,
                      })
                    }
                    className="mt-0.5 h-8 text-xs"
                    placeholder="0"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {!["filter", "image", "text"].includes(widget.type) && (Array.isArray(agg.chartYAxes) ? agg.chartYAxes.length : 0) <= 1 && (
          <div className="space-y-3 border-t border-[var(--studio-border)] pt-4">
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--studio-fg)]">Formato de números</h4>
              <p className="mt-0.5 text-[11px] text-[var(--studio-fg-muted)]">Moneda, porcentaje, decimales y escala (K/M) en el gráfico.</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[11px] text-[var(--studio-fg-muted)]">Tipo</Label>
                <select
                  value={(agg.chartValueType as string) || "number"}
                  onChange={(e) => updateAgg({ chartValueType: e.target.value || undefined })}
                  className="mt-0.5 w-full h-8 rounded border border-[var(--studio-border)] bg-[var(--studio-surface)] px-2 text-xs"
                >
                  <option value="number">Número</option>
                  <option value="currency">Moneda</option>
                  <option value="percent">Porcentaje</option>
                </select>
              </div>
              <div>
                <Label className="text-[11px] text-[var(--studio-fg-muted)]">Escala</Label>
                <select
                  value={(agg.chartValueScale as string) || "none"}
                  onChange={(e) => updateAgg({ chartValueScale: e.target.value || undefined })}
                  className="mt-0.5 w-full h-8 rounded border border-[var(--studio-border)] bg-[var(--studio-surface)] px-2 text-xs"
                >
                  <option value="none">Ninguna</option>
                  <option value="K">Miles (K)</option>
                  <option value="M">Millones (M)</option>
                  <option value="B">Miles de millones (B)</option>
                </select>
              </div>
            </div>
            {(agg.chartValueType as string) === "currency" && (
              <div>
                <Label className="text-[11px] text-[var(--studio-fg-muted)]">Símbolo moneda</Label>
                <Input
                  value={(agg.chartCurrencySymbol as string) ?? "$"}
                  onChange={(e) => updateAgg({ chartCurrencySymbol: e.target.value || "$" })}
                  className="mt-0.5 h-8 text-xs"
                  placeholder="$"
                />
              </div>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <Label className="text-[11px] text-[var(--studio-fg-muted)]">Decimales</Label>
                <Input
                  type="number"
                  min={0}
                  max={6}
                  value={agg.chartDecimals ?? 2}
                  onChange={(e) => updateAgg({ chartDecimals: Math.min(6, Math.max(0, parseInt(e.target.value, 10) || 0)) })}
                  className="h-8 w-14 text-xs"
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={agg.chartThousandSep !== false}
                  onChange={(e) => updateAgg({ chartThousandSep: e.target.checked })}
                  className="rounded"
                />
                <span className="text-xs text-[var(--studio-fg-muted)]">Separador de miles</span>
              </label>
            </div>
          </div>
        )}
        {!["filter", "image", "text"].includes(widget.type) && Array.isArray(agg.chartYAxes) && agg.chartYAxes.length > 1 && (
          <div className="border-t border-[var(--studio-border)] pt-4 space-y-3">
            {widget.type === "combo" && (
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!agg.chartComboSyncAxes}
                  onChange={(e) => onUpdate({ aggregationConfig: { ...agg, chartComboSyncAxes: e.target.checked } })}
                  className="rounded"
                />
                <span className="text-xs text-[var(--studio-fg-muted)]">Sincronizar ejes</span>
                <span className="text-[10px] text-[var(--studio-fg-muted)]">Alinear el eje derecho con el izquierdo para comparar dos métricas con escalas distintas.</span>
              </label>
            )}
            <Label className="text-xs font-medium text-[var(--studio-fg-muted)]">Formato por métrica</Label>
            <p className="text-[11px] text-[var(--studio-fg-muted)]">Asigná tipo y escala a cada métrica del gráfico.</p>
            <div className="space-y-3">
              {agg.chartYAxes.map((key, idx) => {
                const label = (agg.metrics?.[idx] as { alias?: string; field?: string } | undefined)?.alias ?? (agg.metrics?.[idx] as { field?: string } | undefined)?.field ?? key;
                const m = (agg.chartMetricFormats ?? {})[key] ?? {};
                const valueType = (m.valueType ?? agg.chartValueType ?? "number") as string;
                const valueScale = (m.valueScale ?? agg.chartValueScale ?? "none") as string;
                const updateM = (upd: Partial<{ valueType: string; valueScale: string; currencySymbol: string; decimals: number; thousandSep: boolean }>) =>
                  onUpdate({ aggregationConfig: { ...agg, chartMetricFormats: { ...(agg.chartMetricFormats ?? {}), [key]: { ...m, ...upd } } } });
                return (
                  <div key={key} className="rounded border p-2" style={{ borderColor: "var(--studio-border)", background: "var(--studio-surface)" }}>
                    <p className="text-[11px] font-medium mb-1.5" style={{ color: "var(--studio-fg)" }}>{label}</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-[10px] text-[var(--studio-fg-muted)]">Tipo</Label>
                        <select
                          value={valueType || "number"}
                          onChange={(e) => updateM({ valueType: e.target.value || undefined })}
                          className="mt-0.5 w-full h-7 rounded border border-[var(--studio-border)] bg-[var(--studio-bg)] px-2 text-[11px]"
                        >
                          <option value="number">Número</option>
                          <option value="currency">Moneda</option>
                          <option value="percent">Porcentaje</option>
                        </select>
                      </div>
                      <div>
                        <Label className="text-[10px] text-[var(--studio-fg-muted)]">Escala</Label>
                        <select
                          value={valueScale || "none"}
                          onChange={(e) => updateM({ valueScale: e.target.value || undefined })}
                          className="mt-0.5 w-full h-7 rounded border border-[var(--studio-border)] bg-[var(--studio-bg)] px-2 text-[11px]"
                        >
                          <option value="none">Ninguna</option>
                          <option value="K">K</option>
                          <option value="M">M</option>
                          <option value="B">B</option>
                        </select>
                      </div>
                    </div>
                    {valueType === "currency" && (
                      <div className="mt-2">
                        <Label className="text-[10px] text-[var(--studio-fg-muted)]">Símbolo</Label>
                        <Input
                          value={(m.currencySymbol as string) ?? (agg.chartCurrencySymbol as string) ?? "$"}
                          onChange={(e) => updateM({ currencySymbol: e.target.value || "$" })}
                          className="mt-0.5 h-7 w-14 text-[11px]"
                          placeholder="$"
                        />
                      </div>
                    )}
                    <div className="mt-2 flex items-center gap-2">
                      <Label className="text-[10px] text-[var(--studio-fg-muted)]">Decimales</Label>
                      <Input
                        type="number"
                        min={0}
                        max={6}
                        value={m.decimals ?? agg.chartDecimals ?? 2}
                        onChange={(e) => updateM({ decimals: Math.min(6, Math.max(0, parseInt(e.target.value, 10) || 0)) })}
                        className="h-7 w-12 text-[11px]"
                      />
                    </div>
                    <label className="mt-2 flex cursor-pointer items-center gap-2">
                      <input
                        type="checkbox"
                        checked={(m.thousandSep !== undefined ? m.thousandSep : agg.chartThousandSep) !== false}
                        onChange={(e) => updateM({ thousandSep: e.target.checked })}
                        className="rounded"
                      />
                      <span className="text-[10px] text-[var(--studio-fg-muted)]">Separador de miles</span>
                    </label>
                  </div>
                );
              })}
            </div>
          </div>
        )}

            </TabsContent>
            <TabsContent value="data" className="mt-0 space-y-5 focus-visible:outline-none">
            <div>
              <div className="flex items-center justify-between mb-3">
                <Label className="text-xs font-medium text-[var(--studio-fg-muted)]">Agregación de datos</Label>
                <Checkbox
                  checked={!!agg.enabled}
                  onCheckedChange={(c) => updateAgg({ enabled: !!c })}
                />
              </div>
              {etlData && (
                <>
                  {agg.enabled && (
                    <div className="space-y-4">
                      <AdminFieldSelector
                        label="Agrupar por (dimensión)"
                        value={agg.dimension || ""}
                        onChange={(v) => updateAgg({ dimension: v })}
                        etlData={etlData}
                        dataSourceId={widget.dataSourceId}
                        fieldType="all"
                        placeholder="Campo..."
                      />
                      {agg.dimension && (etlData?.dataSources?.find((s) => s.id === (widget.dataSourceId ?? etlData?.primarySourceId))?.fields?.date ?? etlData?.fields?.date ?? []).some((d: string) => (d || "").toLowerCase() === (agg.dimension || "").toLowerCase()) && (
                        <div>
                          <Label className="text-[11px] text-[var(--studio-fg-muted)]">Nivel de fecha (agrupar por)</Label>
                          <select
                            value={agg.dateGroupByGranularity ?? "month"}
                            onChange={(e) => updateAgg({ dateGroupByGranularity: e.target.value as "day" | "month" | "quarter" | "semester" | "year" })}
                            className="mt-0.5 w-full h-8 rounded border border-[var(--studio-border)] bg-[var(--studio-surface)] px-2 text-xs"
                          >
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
                        dataSourceId={widget.dataSourceId}
                        fieldType="all"
                        placeholder="Ninguna..."
                      />
                      {["bar", "horizontalBar", "combo", "stackedColumn"].includes((agg.chartType as string) || widget.type) && (
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
                        <Label className="text-[11px] text-[var(--studio-fg-muted)]">Acumulado</Label>
                        <select
                          value={agg.cumulative ?? "none"}
                          onChange={(e) => updateAgg({ cumulative: e.target.value as "none" | "running_sum" | "ytd" })}
                          className="mt-0.5 w-full h-8 rounded border border-[var(--studio-border)] bg-[var(--studio-surface)] px-2 text-xs"
                        >
                          <option value="none">Ninguno</option>
                          <option value="running_sum">Total acumulado</option>
                          <option value="ytd">YTD (año hasta la fecha)</option>
                        </select>
                      </div>
                      {(agg.cumulative === "ytd" || agg.comparePeriod) && (
                        <AdminFieldSelector
                          label="Columna de fecha (para YTD / comparación)"
                          value={agg.dateDimension || ""}
                          onChange={(v) => updateAgg({ dateDimension: v || undefined })}
                          etlData={etlData}
                          dataSourceId={widget.dataSourceId}
                          fieldType="all"
                          placeholder="Campo fecha..."
                        />
                      )}
                      <div>
                        <Label className="text-[11px] text-[var(--studio-fg-muted)]">Comparar con período anterior</Label>
                        <select
                          value={agg.comparePeriod ?? ""}
                          onChange={(e) => updateAgg({ comparePeriod: (e.target.value || undefined) as "previous_year" | "previous_month" | undefined })}
                          className="mt-0.5 w-full h-8 rounded border border-[var(--studio-border)] bg-[var(--studio-surface)] px-2 text-xs"
                        >
                          <option value="">Ninguno</option>
                          <option value="previous_month">Mes anterior</option>
                          <option value="previous_year">Año anterior</option>
                        </select>
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <Label className="text-xs font-medium text-[var(--studio-fg-muted)]">Métricas</Label>
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
                                className="h-7 text-xs rounded border border-[var(--studio-border)] bg-[var(--studio-surface)] px-2"
                              >
                                <option value="">Usar guardada…</option>
                                {savedMetrics.map((s) => (
                                  <option key={s.id} value={s.id}>{s.name}</option>
                                ))}
                              </select>
                            )}
                            <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={addMetric}>
                              + Crear nueva
                            </Button>
                          </div>
                        </div>
                        {saveTemplateForIndex != null && onSaveMetricAsTemplate && (
                          <div className="flex items-center gap-2 mb-2 p-2 rounded-lg border border-[var(--studio-border)] bg-[var(--studio-bg)]/50">
                            <Input value={saveTemplateName} onChange={(e) => setSaveTemplateName(e.target.value)} placeholder="Nombre para reutilizar" className="h-8 text-xs flex-1" />
                            <Button type="button" size="sm" className="h-8 text-xs" onClick={() => { const m = metrics[saveTemplateForIndex]; if (m && saveTemplateName.trim()) onSaveMetricAsTemplate(saveTemplateName.trim(), m); setSaveTemplateForIndex(null); setSaveTemplateName(""); }}>Guardar</Button>
                            <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={() => { setSaveTemplateForIndex(null); setSaveTemplateName(""); }}>Cancelar</Button>
                          </div>
                        )}
                        <div className="space-y-3">
                          {metrics.map((m, i) => (
                            <div key={m.id} className="rounded-lg border border-[var(--studio-border)] p-2 space-y-2 bg-[var(--studio-bg)]/50">
                              <div className="flex gap-2 items-center">
                                <select
                                  value={m.func}
                                  onChange={(e) => updateMetric(i, { func: e.target.value })}
                                  className="flex-1 h-8 rounded border border-[var(--studio-border)] bg-[var(--studio-surface)] px-2 text-xs"
                                >
                                  {AGG_FUNCS.map((f) => (
                                    <option key={f.value} value={f.value}>{f.label}</option>
                                  ))}
                                </select>
                                {onSaveMetricAsTemplate && (
                                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-[var(--studio-fg-muted)] hover:text-[var(--studio-accent)]" onClick={() => { setSaveTemplateForIndex(i); setSaveTemplateName(m.alias || m.field || "Métrica"); }} title="Guardar para reutilizar">
                                    <BookmarkPlus className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                                <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-red-500" onClick={() => removeMetric(i)}>
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                              {m.func !== "FORMULA" ? (
                                <>
                                  <AdminFieldSelector
                                    label=""
                                    value={m.field}
                                    onChange={(v) => updateMetric(i, { field: v })}
                                    etlData={etlData}
                                    dataSourceId={widget.dataSourceId}
                                    fieldType={m.func === "COUNT" || m.func === "COUNT(DISTINCT" ? "all" : "numeric"}
                                    placeholder="Campo..."
                                    className="mb-0"
                                  />
                                  <div className="space-y-1 text-[11px]">
                                    <span className="text-[var(--studio-fg-muted)]">Solo cuando (opcional):</span>
                                    <div className="grid grid-cols-3 gap-1 items-center">
                                      <select
                                        value={m.condition?.field ?? ""}
                                        onChange={(e) => updateMetric(i, { condition: e.target.value ? { field: e.target.value, operator: m.condition?.operator ?? "=", value: m.condition?.value } : undefined })}
                                        className="h-7 rounded border border-[var(--studio-border)] bg-[var(--studio-surface)] px-1"
                                      >
                                        <option value="">—</option>
                                        {fields.map((name) => (
                                          <option key={name} value={name}>{name}</option>
                                        ))}
                                      </select>
                                      {m.condition?.field && (
                                        <>
                                          <select
                                            value={m.condition?.operator ?? "="}
                                            onChange={(e) => updateMetric(i, { condition: { ...m.condition!, operator: e.target.value } })}
                                            className="h-7 rounded border border-[var(--studio-border)] bg-[var(--studio-surface)] px-1"
                                          >
                                            {OPERATORS.slice(0, 10).map((op) => (
                                              <option key={op} value={op}>{op}</option>
                                            ))}
                                          </select>
                                          <Input
                                            value={m.condition?.value != null ? String(m.condition.value) : ""}
                                            onChange={(e) => updateMetric(i, { condition: { ...m.condition!, value: e.target.value || null } })}
                                            placeholder="Valor"
                                            className="h-7 text-[11px]"
                                          />
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
                                        <Label className="text-[11px] text-[var(--studio-fg-muted)]">Operaciones: metric_0, metric_1… con + - * /. En este widget: {baseRefs.length ? baseRefs.map((r) => `${r.ref}=«${r.label}»`).join(", ") : "añadí al menos una métrica base antes de la fórmula."}</Label>
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
                                            className="h-7 text-[11px] rounded border border-[var(--studio-border)] bg-[var(--studio-surface)] px-2"
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
                                        className="px-2 py-1 rounded text-[11px] border border-[var(--studio-border)] bg-[var(--studio-surface)] hover:bg-[var(--studio-surface-hover)]"
                                      >
                                        {label}
                                      </button>
                                    ))}
                                  </div>
                                  <Input
                                    value={m.formula ?? ""}
                                    onChange={(e) => updateMetric(i, { formula: e.target.value, field: "" })}
                                    placeholder="O escribí: (metric_0 - metric_1) / NULLIF(metric_0, 0)"
                                    className="h-8 text-xs font-mono"
                                  />
                                </div>
                              )}
                              <Input
                                value={m.alias}
                                onChange={(e) => updateMetric(i, { alias: e.target.value })}
                                placeholder="Alias (ej. total_ventas)"
                                className="h-8 text-xs"
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <Label className="text-xs font-medium text-[var(--studio-fg-muted)]">Filtros</Label>
                          <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={addFilter}>
                            + Añadir
                          </Button>
                        </div>
                        <div className="space-y-2">
                          {filters.map((f, i) => (
                            <div key={f.id || `f-${i}`} className="grid grid-cols-12 gap-1 items-center rounded border border-[var(--studio-border)] p-2 bg-[var(--studio-bg)]/30">
                              <div className="col-span-5">
                                <select
                                  value={f.field}
                                  onChange={(e) => updateFilter(i, { field: e.target.value })}
                                  className="w-full h-7 rounded border border-[var(--studio-border)] bg-[var(--studio-surface)] px-1 text-[11px]"
                                >
                                  {fields.map((name) => (
                                    <option key={name} value={name}>{name}</option>
                                  ))}
                                </select>
                              </div>
                              <div className="col-span-4">
                                <select
                                  value={f.operator}
                                  onChange={(e) => updateFilter(i, { operator: e.target.value })}
                                  className="w-full h-7 rounded border border-[var(--studio-border)] bg-[var(--studio-surface)] px-1 text-[11px]"
                                >
                                  {OPERATORS.map((op) => (
                                    <option key={op} value={op}>{op}</option>
                                  ))}
                                </select>
                              </div>
                              <div className="col-span-2">
                                <Input
                                  value={f.value != null ? String(f.value) : ""}
                                  onChange={(e) => updateFilter(i, { value: e.target.value || null })}
                                  placeholder="Valor"
                                  className="h-7 text-[11px] px-1"
                                />
                              </div>
                              <Button type="button" variant="ghost" size="icon" className="col-span-1 h-7 w-7 text-red-500" onClick={() => removeFilter(i)}>
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
            </TabsContent>
            <TabsContent value="order" className="mt-0 space-y-5 focus-visible:outline-none">
              <p className="text-[11px] leading-relaxed text-[var(--studio-fg-muted)]">
                El <span className="font-medium text-[var(--studio-fg)]">orden de las categorías</span> en el gráfico sigue el orden de los datos devueltos por la agregación. Configurá abajo por qué campo ordenar (dimensión o métrica) y el sentido. Para textos superpuestos en el eje, en{" "}
                <span className="font-medium text-[var(--studio-fg)]">Apariencia</span> podés rotar etiquetas, limitar ticks o reducir cuántas etiquetas de datos se muestran.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-[11px] text-[var(--studio-fg-muted)]">Ordenar por</Label>
                  <select
                    value={agg.orderBy?.field || ""}
                    onChange={(e) =>
                      updateAgg({ orderBy: { field: e.target.value, direction: agg.orderBy?.direction || "DESC" } })
                    }
                    className="mt-0.5 w-full h-8 rounded border border-[var(--studio-border)] bg-[var(--studio-surface)] px-2 text-xs"
                  >
                    <option value="">—</option>
                    {orderFields.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label className="text-[11px] text-[var(--studio-fg-muted)]">Sentido</Label>
                  <select
                    value={agg.orderBy?.direction || "DESC"}
                    onChange={(e) =>
                      updateAgg({
                        orderBy: {
                          field: agg.orderBy?.field || orderFields[0] || "",
                          direction: e.target.value as "ASC" | "DESC",
                        },
                      })
                    }
                    className="mt-0.5 w-full h-8 rounded border border-[var(--studio-border)] bg-[var(--studio-surface)] px-2 text-xs"
                  >
                    <option value="DESC">Desc</option>
                    <option value="ASC">Asc</option>
                  </select>
                </div>
              </div>
              <div>
                <Label className="text-[11px] text-[var(--studio-fg-muted)]">Límite (filas)</Label>
                <Input
                  type="number"
                  min={1}
                  max={1000}
                  value={agg.limit ?? ""}
                  onChange={(e) => updateAgg({ limit: e.target.value ? parseInt(e.target.value, 10) : undefined })}
                  className="mt-0.5 h-8 text-xs"
                  placeholder="Ej. 10"
                />
              </div>
              {showLabelOverrides && (
                <div className="border-t border-[var(--studio-border)] pt-4">
                  <Label className="text-xs font-medium text-[var(--studio-fg-muted)]">Renombrar etiquetas en el gráfico</Label>
                  <p className="mb-2 mt-0.5 text-[11px] text-[var(--studio-fg-muted)]">
                    Reemplazá el valor que viene de los datos por el texto a mostrar (eje de categorías, porciones, leyenda).
                  </p>
                  <div className="space-y-2">
                    {labelOverridesEntries.map(([raw, display], idx) => (
                      <div key={`override-${idx}-${raw}`} className="flex items-center gap-2">
                        <Input
                          value={labelOverrideRawDrafts[raw] ?? raw}
                          onChange={(e) => setLabelOverrideRawDrafts((prev) => ({ ...prev, [raw]: e.target.value }))}
                          onBlur={() => commitLabelOverrideRawDraft(raw, display)}
                          placeholder="Valor original (ej. Q1)"
                          className="h-8 flex-1 text-xs"
                        />
                        <span className="text-xs text-[var(--studio-fg-muted)]">→</span>
                        <Input
                          value={display}
                          onChange={(e) => setLabelOverride(raw, raw, e.target.value)}
                          placeholder="Nombre a mostrar"
                          className="h-8 flex-1 text-xs"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0 text-red-500"
                          onClick={() => removeLabelOverride(raw)}
                        >
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
            </TabsContent>
            </>
          ) : null}
        </div>
      </Tabs>
    </aside>
  );
}
