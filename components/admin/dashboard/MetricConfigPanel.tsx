"use client";

import { useState } from "react";
import { X, Trash2, Play, BookmarkPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import AdminFieldSelector from "./AdminFieldSelector";
import type { ETLDataResponse } from "@/hooks/admin/useAdminDashboardEtlData";

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
  /** Segunda dimensión para análisis multidimensional (ej. mes + categoría). */
  dimension2?: string;
  metrics: AggregationMetricEdit[];
  filters?: AggregationFilterEdit[];
  orderBy?: { field: string; direction: "ASC" | "DESC" };
  limit?: number;
  /** Acumulado: running_sum = total acumulado, ytd = año hasta la fecha. */
  cumulative?: "none" | "running_sum" | "ytd";
  /** Comparación temporal: añade _prev y _var_pct vs período anterior. */
  comparePeriod?: "previous_year" | "previous_month";
  /** Columna de fecha para YTD o comparePeriod. */
  dateDimension?: string;
};

export type MetricConfigWidget = {
  id: string;
  type: string;
  title: string;
  gridSpan?: number;
  minHeight?: number;
  aggregationConfig?: AggregationConfigEdit;
  labelDisplayMode?: "percent" | "value";
  color?: string;
  kpiSecondaryLabel?: string;
  kpiSecondaryValue?: string;
  excludeGlobalFilters?: boolean;
  /** ID de la fuente de datos cuando el dashboard tiene múltiples ETLs */
  dataSourceId?: string | null;
};

export type SavedMetricPanel = { id: string; name: string; metric: AggregationMetricEdit };

const CHART_TYPES: { value: string; label: string }[] = [
  { value: "bar", label: "Barras verticales" },
  { value: "horizontalBar", label: "Barras horizontales" },
  { value: "line", label: "Líneas" },
  { value: "pie", label: "Circular (pie)" },
  { value: "doughnut", label: "Dona" },
  { value: "kpi", label: "KPI (número)" },
  { value: "table", label: "Tabla" },
  { value: "combo", label: "Combo (barras + línea)" },
];

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
  "MONTH", "YEAR", "DAY", "IS", "IS NOT",
];

type MetricConfigPanelProps = {
  widget: MetricConfigWidget;
  etlData: ETLDataResponse | null;
  etlLoading: boolean;
  onUpdate: (patch: Partial<MetricConfigWidget>) => void;
  onLoadData: () => void;
  onClose: () => void;
  /** Métricas guardadas para reutilizar */
  savedMetrics?: SavedMetricPanel[];
  onSaveMetricAsTemplate?: (name: string, metric: AggregationMetricEdit) => void;
};

export function MetricConfigPanel({
  widget,
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
  const agg = widget.aggregationConfig || { enabled: false, metrics: [] };
  const filters = agg.filters || [];
  const metrics = agg.metrics || [];
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

  const addSavedMetric = (saved: SavedMetricPanel) => {
    updateAgg({ metrics: [...metrics, { ...saved.metric, id: `m-${Date.now()}` }] });
  };

  const orderFields = agg.enabled
    ? [agg.dimension, agg.dimension2, agg.dateDimension, ...metrics.map((m) => m.alias || m.field)].filter(Boolean) as string[]
    : fields;

  return (
    <aside className="metric-config-panel flex h-full w-full max-w-[380px] flex-col border-l border-[var(--studio-border)] bg-[var(--studio-bg-elevated)] shadow-xl">
      <header className="flex flex-shrink-0 items-center justify-between border-b border-[var(--studio-border)] bg-[var(--studio-surface)] px-4 py-3">
        <h3 className="text-sm font-semibold tracking-tight text-[var(--studio-fg)]">Configurar métrica</h3>
        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-[var(--studio-fg-muted)] hover:bg-[var(--studio-surface-hover)] hover:text-[var(--studio-fg)]" onClick={onClose} aria-label="Cerrar">
          <X className="h-4 w-4" />
        </Button>
      </header>
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
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
            value={widget.type}
            onChange={(e) => onUpdate({ type: e.target.value })}
            className="mt-1.5 w-full h-9 rounded-lg border border-[var(--studio-border)] bg-[var(--studio-surface)] px-3 text-sm text-[var(--studio-fg)]"
          >
            {CHART_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>

        <div>
          <Label className="text-xs font-medium text-[var(--studio-fg-muted)]">Columnas en grid</Label>
          <select
            value={Math.min(4, Math.max(1, widget.gridSpan ?? 2))}
            onChange={(e) => onUpdate({ gridSpan: parseInt(e.target.value, 10) as 1 | 2 | 4 })}
            className="mt-1.5 w-full h-9 rounded-lg border border-[var(--studio-border)] bg-[var(--studio-surface)] px-3 text-sm"
          >
            <option value={1}>1</option>
            <option value={2}>2</option>
            <option value={4}>4 (ancho completo)</option>
          </select>
        </div>

        {(widget.type === "pie" || widget.type === "doughnut") && (
          <div>
            <Label className="text-xs font-medium text-[var(--studio-fg-muted)]">Etiquetas en gráfico</Label>
            <select
              value={widget.labelDisplayMode || "percent"}
              onChange={(e) => onUpdate({ labelDisplayMode: e.target.value as "percent" | "value" })}
              className="mt-1.5 w-full h-9 rounded-lg border border-[var(--studio-border)] bg-[var(--studio-surface)] px-3 text-sm"
            >
              <option value="percent">Porcentaje</option>
              <option value="value">Valor</option>
            </select>
          </div>
        )}

        {["bar", "horizontalBar", "line", "pie", "doughnut", "combo"].includes(widget.type) && (
          <div>
            <Label className="text-xs font-medium text-[var(--studio-fg-muted)]">Color del gráfico</Label>
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

        {widget.type === "kpi" && (
          <div className="space-y-3">
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

        {!["filter", "image", "text"].includes(widget.type) && (
          <>
            <div className="border-t border-[var(--studio-border)] pt-4">
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
                      <AdminFieldSelector
                        label="Segunda dimensión (opcional)"
                        value={agg.dimension2 || ""}
                        onChange={(v) => updateAgg({ dimension2: v || undefined })}
                        etlData={etlData}
                        dataSourceId={widget.dataSourceId}
                        fieldType="all"
                        placeholder="Ninguna..."
                      />
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
                                  <Label className="text-[11px] text-[var(--studio-fg-muted)]">Operaciones: metric_0, metric_1… con + - * /</Label>
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
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-[11px] text-[var(--studio-fg-muted)]">Ordenar por</Label>
                          <select
                            value={agg.orderBy?.field || ""}
                            onChange={(e) => updateAgg({ orderBy: { field: e.target.value, direction: agg.orderBy?.direction || "DESC" } })}
                            className="mt-0.5 w-full h-8 rounded border border-[var(--studio-border)] bg-[var(--studio-surface)] px-2 text-xs"
                          >
                            <option value="">—</option>
                            {orderFields.map((name) => (
                              <option key={name} value={name}>{name}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <Label className="text-[11px] text-[var(--studio-fg-muted)]">Sentido</Label>
                          <select
                            value={agg.orderBy?.direction || "DESC"}
                            onChange={(e) => updateAgg({ orderBy: { field: agg.orderBy?.field || orderFields[0] || "", direction: e.target.value as "ASC" | "DESC" } })}
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
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="flex items-center gap-2 pt-2">
              <Checkbox
                id="exclude-global"
                checked={!!widget.excludeGlobalFilters}
                onCheckedChange={(c) => onUpdate({ excludeGlobalFilters: !!c })}
              />
              <Label htmlFor="exclude-global" className="text-xs text-[var(--studio-fg-muted)] cursor-pointer">
                Excluir filtros globales de esta métrica
              </Label>
            </div>
            <Button
              className="w-full mt-2 h-10 font-medium bg-[var(--studio-accent-dim)] text-[var(--studio-accent)] hover:bg-[rgba(34,211,238,0.25)] hover:text-[var(--studio-accent)] border border-[rgba(34,211,238,0.3)]"
              onClick={onLoadData}
              disabled={!etlData || etlLoading}
            >
              <Play className="mr-2 h-4 w-4" />
              Actualizar datos
            </Button>
          </>
        )}
      </div>
    </aside>
  );
}
