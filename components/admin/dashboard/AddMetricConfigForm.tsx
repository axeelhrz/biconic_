"use client";

import { useState } from "react";
import { ChevronLeft, Trash2 } from "lucide-react";
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
  condition?: MetricConditionEdit;
  formula?: string;
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
  metrics: AggregationMetricEdit[];
  filters?: AggregationFilterEdit[];
  orderBy?: { field: string; direction: "ASC" | "DESC" };
  limit?: number;
  cumulative?: "none" | "running_sum" | "ytd";
  comparePeriod?: "previous_year" | "previous_month";
  dateDimension?: string;
};

export type AddMetricFormConfig = {
  title: string;
  type: string;
  gridSpan?: number;
  color?: string;
  labelDisplayMode?: "percent" | "value";
  kpiSecondaryLabel?: string;
  kpiSecondaryValue?: string;
  aggregationConfig: AggregationConfigEdit;
  excludeGlobalFilters?: boolean;
  /** ID de la fuente de datos cuando el dashboard tiene múltiples ETLs */
  dataSourceId?: string | null;
};

/** Métrica guardada para reutilizar (mismo formato que en AdminDashboardStudio) */
export type SavedMetricForm = {
  id: string;
  name: string;
  metric: AggregationMetricEdit;
};

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

const AGG_FUNCS = [
  { value: "SUM", label: "Suma" },
  { value: "AVG", label: "Promedio" },
  { value: "COUNT", label: "Conteo" },
  { value: "MIN", label: "Mínimo" },
  { value: "MAX", label: "Máximo" },
  { value: "COUNT(DISTINCT", label: "Conteo único" },
  { value: "FORMULA", label: "Fórmula / ratio" },
];

const OPERATORS = ["=", "!=", ">", ">=", "<", "<=", "LIKE", "ILIKE", "IN", "BETWEEN", "MONTH", "YEAR", "DAY", "IS", "IS NOT"];

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
    updateAgg({
      metrics: [...metrics, { ...saved.metric, id: `m-${Date.now()}` }],
    });
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
            value={Math.min(4, Math.max(1, form.gridSpan ?? 2))}
            onChange={(e) => updateForm({ gridSpan: parseInt(e.target.value, 10) as 1 | 2 | 4 })}
            className="add-metric-select mt-1"
          >
            <option value={1}>1</option>
            <option value={2}>2</option>
            <option value={4}>4 (ancho completo)</option>
          </select>
        </div>
        {(form.type === "pie" || form.type === "doughnut") && (
          <div>
            <Label className="add-metric-label">Etiquetas</Label>
            <select
              value={form.labelDisplayMode || "percent"}
              onChange={(e) => updateForm({ labelDisplayMode: e.target.value as "percent" | "value" })}
              className="add-metric-select mt-1"
            >
              <option value="percent">Porcentaje</option>
              <option value="value">Valor</option>
            </select>
          </div>
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
                <AdminFieldSelector
                  label="Segunda dimensión (opcional)"
                  value={agg.dimension2 || ""}
                  onChange={(v) => updateAgg({ dimension2: v || undefined })}
                  etlData={etlData}
                  dataSourceId={form.dataSourceId}
                  fieldType="all"
                  placeholder="Ninguna..."
                />
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
                            <Label className="add-metric-label text-[11px]">Operaciones: metric_0, metric_1… (+ - * /)</Label>
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
