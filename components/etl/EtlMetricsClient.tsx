"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, Plus, LayoutDashboard, Pencil, Trash2, Loader2, RefreshCw, BarChart2, LineChart, PieChart, Donut, Hash, Table2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import AdminFieldSelector from "@/components/admin/dashboard/AdminFieldSelector";
import type { ETLDataResponse } from "@/hooks/admin/useAdminDashboardEtlData";
import type { SavedMetricForm, AggregationMetricEdit, AggregationFilterEdit } from "@/components/admin/dashboard/AddMetricConfigForm";

const AGG_FUNCS = [
  { value: "SUM", label: "Suma" },
  { value: "AVG", label: "Promedio" },
  { value: "COUNT", label: "Conteo" },
  { value: "MIN", label: "Mínimo" },
  { value: "MAX", label: "Máximo" },
  { value: "COUNT(DISTINCT", label: "Conteo único" },
  { value: "FORMULA", label: "Fórmula / ratio" },
];

const CHART_TYPES: { value: string; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: "bar", label: "Barras", icon: BarChart2 },
  { value: "horizontalBar", label: "Barras horizontales", icon: BarChart2 },
  { value: "line", label: "Líneas", icon: LineChart },
  { value: "pie", label: "Circular", icon: PieChart },
  { value: "doughnut", label: "Dona", icon: Donut },
  { value: "kpi", label: "KPI", icon: Hash },
  { value: "table", label: "Tabla", icon: Table2 },
  { value: "combo", label: "Combo", icon: BarChart2 },
];

const FORMULA_QUICKS = [
  { label: "A ÷ B", expr: "metric_0 / NULLIF(metric_1, 0)" },
  { label: "% A/B", expr: "100.0 * metric_0 / NULLIF(metric_1, 0)" },
  { label: "Margen", expr: "(metric_0 - metric_1) / NULLIF(metric_0, 0)" },
  { label: "A - B", expr: "metric_0 - metric_1" },
  { label: "A + B", expr: "metric_0 + metric_1" },
  { label: "A × B", expr: "metric_0 * metric_1" },
];

type MetricsDataResponse = {
  ok: boolean;
  data?: {
    etl: { id: string; title?: string; name?: string };
    hasData: boolean;
    schema: string | null;
    tableName: string | null;
    fields: { all: string[]; numeric: string[]; string: string[]; date: string[] };
    rowCount: number;
    savedMetrics: SavedMetricForm[];
  };
};

function buildEtlDataFromMetricsResponse(res: MetricsDataResponse["data"]): ETLDataResponse | null {
  if (!res || !res.etl) return null;
  const { etl, hasData, schema, tableName, fields, rowCount } = res;
  const fs = fields ?? { all: [], numeric: [], string: [], date: [] };
  const etlInfo = { id: etl.id, title: etl.title ?? etl.name ?? "", name: etl.name ?? etl.title ?? "" };
  const dataSources = hasData && schema && tableName
    ? [{
        id: "primary",
        etlId: etl.id,
        alias: "Principal",
        etlName: etlInfo.title,
        schema,
        tableName,
        rowCount: rowCount ?? 0,
        fields: fs,
      }]
    : [];
  return {
    dashboard: { id: "", etl_id: etl.id, etl: etlInfo },
    dataSources,
    primarySourceId: dataSources[0]?.id ?? null,
    etl: etlInfo,
    etlData: hasData && schema && tableName
      ? { id: 0, name: `${schema}.${tableName}`, created_at: "", dataArray: [], rowCount: rowCount ?? 0 }
      : null,
    fields: fs,
  };
}

type EtlMetricsClientProps = {
  etlId: string;
  etlTitle: string;
};

export default function EtlMetricsClient({ etlId, etlTitle }: EtlMetricsClientProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<MetricsDataResponse["data"] | null>(null);
  const [etlData, setEtlData] = useState<ETLDataResponse | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formChartType, setFormChartType] = useState("bar");
  const [formDimension, setFormDimension] = useState("");
  const [formDimension2, setFormDimension2] = useState("");
  const [formMetrics, setFormMetrics] = useState<AggregationMetricEdit[]>([
    { id: `m-${Date.now()}`, field: "", func: "SUM", alias: "" },
  ]);
  const [formFilters, setFormFilters] = useState<AggregationFilterEdit[]>([]);
  const [formOrderBy, setFormOrderBy] = useState<{ field: string; direction: "ASC" | "DESC" } | null>(null);
  const [formLimit, setFormLimit] = useState<number | undefined>(100);
  const [formMetric, setFormMetric] = useState<AggregationMetricEdit>({
    id: `m-${Date.now()}`,
    field: "",
    func: "SUM",
    alias: "",
  });
  const [previewData, setPreviewData] = useState<Record<string, unknown>[] | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const fetchData = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    try {
      const res = await fetch(`/api/etl/${etlId}/metrics-data`);
      const json: MetricsDataResponse = await res.json();
      if (!res.ok || !json.ok || !json.data) {
        toast.error(json.data ? "Error al cargar datos" : (json as { error?: string }).error ?? "Error");
        return;
      }
      setData(json.data);
      setEtlData(buildEtlDataFromMetricsResponse(json.data));
    } catch (e) {
      toast.error("Error al cargar métricas");
    } finally {
      setLoading(false);
    }
  }, [etlId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const savedMetrics = (data?.savedMetrics ?? []) as SavedMetricForm[];
  const hasData = data?.hasData ?? false;
  const fields = data?.fields?.all ?? [];

  const openNew = () => {
    setEditingId(null);
    setFormName("");
    setFormChartType("bar");
    setFormDimension("");
    setFormDimension2("");
    setFormMetrics([{ id: `m-${Date.now()}`, field: fields[0] ?? "", func: "SUM", alias: fields[0] ?? "valor" }]);
    setFormFilters([]);
    setFormOrderBy(null);
    setFormLimit(100);
    setFormMetric({ id: `m-${Date.now()}`, field: fields[0] ?? "", func: "SUM", alias: fields[0] ?? "valor" });
    setPreviewData(null);
    setShowForm(true);
  };

  const openEdit = (saved: SavedMetricForm) => {
    setEditingId(saved.id);
    setFormName(saved.name);
    setFormChartType(saved.chartType ?? "bar");
    const cfg = saved.aggregationConfig;
    if (cfg) {
      setFormDimension(cfg.dimension ?? "");
      setFormDimension2(cfg.dimension2 ?? "");
      setFormMetrics((cfg.metrics ?? [saved.metric]).map((m) => ({ ...m, id: m.id || `m-${Date.now()}-${Math.random().toString(36).slice(2)}` })));
      setFormFilters((cfg.filters ?? []).map((f) => ({ ...f, id: f.id || `f-${Date.now()}-${Math.random().toString(36).slice(2)}` })));
      setFormOrderBy(cfg.orderBy ?? null);
      setFormLimit(cfg.limit ?? 100);
      const first = (cfg.metrics ?? [saved.metric])[0];
      setFormMetric(first ? { ...first, id: first.id || `m-${Date.now()}` } : { id: `m-${Date.now()}`, field: "", func: "SUM", alias: "" });
    } else {
      setFormDimension("");
      setFormDimension2("");
      setFormMetrics([{ ...saved.metric, id: saved.metric.id || `m-${Date.now()}` }]);
      setFormFilters([]);
      setFormOrderBy(null);
      setFormLimit(100);
      setFormMetric({ ...saved.metric, id: saved.metric.id || `m-${Date.now()}` });
    }
    setPreviewData(null);
    setShowForm(true);
  };

  const tableNameForPreview = data?.schema && data?.tableName ? `${data.schema}.${data.tableName}` : null;

  const fetchPreview = useCallback(async () => {
    if (formMetrics.length === 0) return;
    setPreviewLoading(true);
    setPreviewData(null);
    try {
      const metricsRes = await fetch(`/api/etl/${etlId}/metrics-data`);
      const metricsJson = await metricsRes.json();
      const freshSchema = metricsJson?.data?.schema;
      const freshTableName = metricsJson?.data?.tableName;
      const tableName = freshSchema && freshTableName ? `${freshSchema}.${freshTableName}` : tableNameForPreview;
      if (!tableName) {
        toast.error("No hay tabla de datos. Ejecutá el ETL y recargá la página.");
        return;
      }
      const metricsPayload = formMetrics.map((m) => ({
        field: m.field || "",
        func: m.func,
        alias: m.alias || m.field || "valor",
        ...(m.condition ? { condition: m.condition } : {}),
        ...(m.formula ? { formula: m.formula } : {}),
      }));
      const res = await fetch("/api/dashboard/aggregate-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tableName,
          dimension: formDimension || undefined,
          dimensions: [formDimension, formDimension2].filter(Boolean).length ? [formDimension, formDimension2].filter(Boolean) : undefined,
          metrics: metricsPayload,
          filters: formFilters.length ? formFilters.map((f) => ({ field: f.field, operator: f.operator, value: f.value })) : undefined,
          orderBy: formOrderBy?.field ? formOrderBy : undefined,
          limit: formLimit ?? 100,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        const msg = (json?.error ?? "Error") as string;
        if (/does not exist|no existe/i.test(msg)) {
          toast.error("La tabla del ETL no existe o cambió. Ejecutá el ETL de nuevo y hacé clic en «Recargar» aquí.", { duration: 6000 });
          fetchData({ silent: true });
        } else {
          toast.error(msg);
        }
        return;
      }
      setPreviewData(Array.isArray(json) ? json : []);
    } catch (e) {
      toast.error("Error al cargar vista previa");
    } finally {
      setPreviewLoading(false);
    }
  }, [etlId, tableNameForPreview, formDimension, formDimension2, formMetrics, formFilters, formOrderBy, formLimit, fetchData]);

  const recommendationText = (() => {
    const hasDim = !!formDimension;
    const metricCount = formMetrics.length;
    if (!hasDim && metricCount >= 1) return "Un solo valor numérico: recomendamos **KPI** para destacar el número.";
    if (hasDim && metricCount === 1) return "Una dimensión y un valor: recomendamos **Barras** o **Líneas**.";
    if (hasDim && metricCount > 1) return "Varias métricas: **Combo** (barras + línea) o **Tabla** para comparar.";
    if (hasDim) return "Muchas categorías: **Barras horizontales** para leer mejor.";
    return "Elegí dimensión y al menos una métrica para ver recomendaciones.";
  })();

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
  };

  const saveMetric = async () => {
    const name = formName.trim();
    if (!name) {
      toast.error("Nombre requerido");
      return;
    }
    const firstMetric = formMetrics[0];
    if (!firstMetric) {
      toast.error("Agregá al menos una métrica");
      return;
    }
    const metricToSave = { ...firstMetric, id: firstMetric.id || `m-${Date.now()}` };
    const aggregationConfig = {
      dimension: formDimension || undefined,
      dimension2: formDimension2 || undefined,
      metrics: formMetrics.map((m) => ({ ...m, id: m.id || `m-${Date.now()}` })),
      filters: formFilters.length ? formFilters : undefined,
      orderBy: formOrderBy ?? undefined,
      limit: formLimit ?? 100,
    };
    setSaving(true);
    try {
      let next: SavedMetricForm[];
      const item: SavedMetricForm = {
        id: editingId ?? `sm-${Date.now()}`,
        name,
        metric: metricToSave,
        aggregationConfig,
      };
      if (editingId) {
        next = savedMetrics.map((s) => (s.id === editingId ? item : s));
      } else {
        next = [...savedMetrics, item];
      }
      const res = await fetch(`/api/etl/${etlId}/metrics`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ savedMetrics: next }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast.error(json.error ?? "Error al guardar");
        return;
      }
      toast.success(editingId ? "Métrica actualizada" : "Métrica creada");
      setData((prev) => (prev ? { ...prev, savedMetrics: next } : null));
      closeForm();
    } catch (e) {
      toast.error("Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  const deleteMetric = async (id: string) => {
    if (!confirm("¿Eliminar esta métrica?")) return;
    const next = savedMetrics.filter((s) => s.id !== id);
    setSaving(true);
    try {
      const res = await fetch(`/api/etl/${etlId}/metrics`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ savedMetrics: next }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast.error(json.error ?? "Error al eliminar");
        return;
      }
      toast.success("Métrica eliminada");
      setData((prev) => (prev ? { ...prev, savedMetrics: next } : null));
    } catch (e) {
      toast.error("Error al eliminar");
    } finally {
      setSaving(false);
    }
  };

  const goToDashboard = () => {
    router.push(`/admin/dashboard?create=1&etlId=${etlId}`);
  };

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: "var(--platform-accent)" }} />
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 max-w-4xl mx-auto w-full p-6 gap-6">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href={`/admin/etl/${etlId}`}
            className="flex items-center gap-2 text-sm font-medium rounded-lg transition-colors"
            style={{ color: "var(--platform-fg-muted)" }}
          >
            <ChevronLeft className="h-4 w-4" />
            Volver al ETL
          </Link>
          <h1 className="text-xl font-semibold" style={{ color: "var(--platform-fg)" }}>
            Métricas reutilizables – {etlTitle}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            className="rounded-xl"
            style={{ borderColor: "var(--platform-border)", color: "var(--platform-fg)" }}
            onClick={goToDashboard}
          >
            <LayoutDashboard className="h-4 w-4 mr-2" />
            Ir al Dashboard
          </Button>
          {hasData && (
            <Button
              type="button"
              className="rounded-xl"
              style={{ background: "var(--platform-accent)", color: "var(--platform-bg)" }}
              onClick={openNew}
            >
              <Plus className="h-4 w-4 mr-2" />
              Nueva métrica
            </Button>
          )}
        </div>
      </header>

      {!hasData && (
        <div
          className="rounded-xl border p-4"
          style={{
            borderColor: "var(--platform-border)",
            background: "var(--platform-surface)",
            color: "var(--platform-fg-muted)",
          }}
        >
          <p className="text-sm">
            Ejecutá el ETL primero para generar datos y poder crear métricas reutilizables.
          </p>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <Link
              href={`/admin/etl/${etlId}?run=1`}
              className="inline-flex items-center gap-2 text-sm font-medium"
              style={{ color: "var(--platform-accent)" }}
            >
              Ir a ejecutar ETL
              <ChevronLeft className="h-4 w-4 rotate-180" />
            </Link>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="rounded-lg"
              onClick={() => fetchData()}
              disabled={loading}
              style={{ color: "var(--platform-fg-muted)" }}
            >
              {loading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
              Recargar
            </Button>
          </div>
        </div>
      )}

      {showForm && hasData && (
        <div className="space-y-6">
          {/* Nombre (solo; el tipo de gráfico se elige al final) */}
          <section
            className="rounded-2xl border p-6 shadow-sm"
            style={{ borderColor: "var(--platform-border)", background: "var(--platform-surface)" }}
          >
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2" style={{ color: "var(--platform-fg)" }}>
              <BarChart2 className="h-5 w-5" style={{ color: "var(--platform-accent)" }} />
              {editingId ? "Editar métrica" : "Nueva métrica"}
            </h2>
            <div>
              <Label className="text-sm font-medium mb-2 block" style={{ color: "var(--platform-fg-muted)" }}>
                Nombre (para reutilizar en dashboards)
              </Label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Ej. Ventas totales"
                className="rounded-xl border-0 shadow-sm max-w-md"
                style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)", color: "var(--platform-fg)" }}
              />
            </div>
          </section>

          {/* Agregación: dimensiones opcionales y métricas */}
          <section
            className="rounded-2xl border p-6 shadow-sm"
            style={{ borderColor: "var(--platform-border)", background: "var(--platform-surface)" }}
          >
            <h3 className="text-base font-semibold mb-4" style={{ color: "var(--platform-fg)" }}>
              Agregación de datos
            </h3>
            <p className="text-sm mb-4" style={{ color: "var(--platform-fg-muted)" }}>
              Definí las métricas y, si querés, dimensiones para agrupar. Las dimensiones son opcionales (por ejemplo para un KPI total no hace falta).
            </p>
            <div className="space-y-4">
              <div className="rounded-xl border p-4" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg-elevated)" }}>
                <Label className="text-sm font-medium mb-2 block" style={{ color: "var(--platform-fg-muted)" }}>
                  Agrupar por (dimensión, opcional)
                </Label>
                <AdminFieldSelector
                  label=""
                  value={formDimension}
                  onChange={setFormDimension}
                  etlData={etlData}
                  fieldType="all"
                  placeholder="Campo..."
                  className="[&_button]:!rounded-lg [&_button]:!border [&_button]:!border-[var(--platform-border)] [&_button]:!bg-[var(--platform-bg)] [&_button]:!text-[var(--platform-fg)]"
                />
              </div>
              <div className="rounded-xl border p-4" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg-elevated)" }}>
                <Label className="text-sm font-medium mb-2 block" style={{ color: "var(--platform-fg-muted)" }}>
                  Segunda dimensión (opcional)
                </Label>
                <AdminFieldSelector
                  label=""
                  value={formDimension2}
                  onChange={setFormDimension2}
                  etlData={etlData}
                  fieldType="all"
                  placeholder="Ninguna..."
                  className="[&_button]:!rounded-lg [&_button]:!border [&_button]:!border-[var(--platform-border)] [&_button]:!bg-[var(--platform-bg)] [&_button]:!text-[var(--platform-fg)]"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-sm font-medium" style={{ color: "var(--platform-fg-muted)" }}>
                    Métricas
                  </Label>
                  <Button type="button" variant="outline" size="sm" className="rounded-lg h-8 text-xs" onClick={() => setFormMetrics((m) => [...m, { id: `m-${Date.now()}`, field: fields[0] ?? "", func: "SUM", alias: "valor" }])}>
                    + Añadir métrica
                  </Button>
                </div>
                <div className="space-y-3">
                  {formMetrics.map((m, i) => (
                    <div key={m.id} className="rounded-xl border p-4 space-y-3" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg-elevated)" }}>
                      <div className="flex gap-2 items-center">
                        <select
                          value={m.func}
                          onChange={(e) => setFormMetrics((prev) => prev.map((mm, ii) => ii === i ? { ...mm, func: e.target.value } : mm))}
                          className="flex-1 h-9 rounded-lg border px-3 text-sm appearance-none cursor-pointer"
                          style={{ borderColor: "var(--platform-border)", backgroundColor: "var(--platform-bg)", color: "var(--platform-fg)" }}
                        >
                          {AGG_FUNCS.map((f) => (
                            <option key={f.value} value={f.value}>{f.label}</option>
                          ))}
                        </select>
                        {formMetrics.length > 1 && (
                          <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-red-500 shrink-0" onClick={() => setFormMetrics((prev) => prev.filter((_, ii) => ii !== i))}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                      {m.func !== "FORMULA" && (
                        <AdminFieldSelector label="Campo" value={m.field} onChange={(v) => setFormMetrics((prev) => prev.map((mm, ii) => ii === i ? { ...mm, field: v } : mm))} etlData={etlData} fieldType={m.func === "COUNT" || m.func === "COUNT(DISTINCT" ? "all" : "numeric"} placeholder="Campo..." className="[&_button]:!bg-[var(--platform-bg)] [&_button]:!border-[var(--platform-border)] [&_button]:!text-[var(--platform-fg)]" />
                      )}
                      {m.func === "FORMULA" && (
                        <div className="space-y-2">
                          <Label className="text-xs" style={{ color: "var(--platform-fg-muted)" }}>Fórmula (metric_0, metric_1…)</Label>
                          <div className="flex flex-wrap gap-1 mb-2">
                            {FORMULA_QUICKS.map(({ label, expr }) => (
                              <button key={label} type="button" onClick={() => setFormMetrics((prev) => prev.map((mm, ii) => ii === i ? { ...mm, formula: expr } : mm))} className="px-2 py-1 rounded text-xs border" style={{ borderColor: "var(--platform-border)", background: "var(--platform-surface)", color: "var(--platform-fg)" }}>
                                {label}
                              </button>
                            ))}
                          </div>
                          <Input value={m.formula ?? ""} onChange={(e) => setFormMetrics((prev) => prev.map((mm, ii) => ii === i ? { ...mm, formula: e.target.value } : mm))} placeholder="Ej. metric_0 / NULLIF(metric_1, 0)" className="font-mono text-sm rounded-lg !bg-[var(--platform-bg)]" style={{ borderColor: "var(--platform-border)", color: "var(--platform-fg)" }} />
                        </div>
                      )}
                      <div>
                        <Label className="text-xs mb-1 block" style={{ color: "var(--platform-fg-muted)" }}>Alias</Label>
                        <Input value={m.alias} onChange={(e) => setFormMetrics((prev) => prev.map((mm, ii) => ii === i ? { ...mm, alias: e.target.value } : mm))} placeholder="Ej. total_ventas" className="h-8 text-sm rounded-lg !bg-[var(--platform-bg)]" style={{ borderColor: "var(--platform-border)", color: "var(--platform-fg)" }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-xl border p-4 space-y-4" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg-elevated)" }}>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-medium mb-2 block" style={{ color: "var(--platform-fg-muted)" }}>Ordenar por</Label>
                    <select
                      value={formOrderBy?.field ?? ""}
                      onChange={(e) => setFormOrderBy((prev) => ({ field: e.target.value, direction: prev?.direction ?? "DESC" }))}
                      className="w-full h-9 rounded-lg border px-3 text-sm appearance-none cursor-pointer"
                      style={{ borderColor: "var(--platform-border)", backgroundColor: "var(--platform-bg)", color: "var(--platform-fg)" }}
                    >
                      <option value="">—</option>
                      {[...(formDimension ? [formDimension] : []), ...(formDimension2 ? [formDimension2] : []), ...fields].filter(Boolean).map((f) => (
                        <option key={f} value={f}>{f}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label className="text-sm font-medium mb-2 block" style={{ color: "var(--platform-fg-muted)" }}>Sentido</Label>
                    <select
                      value={formOrderBy?.direction ?? "DESC"}
                      onChange={(e) => setFormOrderBy((prev) => prev ? { ...prev, direction: e.target.value as "ASC" | "DESC" } : { field: "", direction: "DESC" })}
                      className="w-full h-9 rounded-lg border px-3 text-sm appearance-none cursor-pointer"
                      style={{ borderColor: "var(--platform-border)", backgroundColor: "var(--platform-bg)", color: "var(--platform-fg)" }}
                    >
                      <option value="DESC">Descendente</option>
                      <option value="ASC">Ascendente</option>
                    </select>
                  </div>
                </div>
                <div>
                  <Label className="text-sm font-medium mb-2 block" style={{ color: "var(--platform-fg-muted)" }}>Límite (filas)</Label>
                  <Input type="number" min={1} max={1000} value={formLimit ?? ""} onChange={(e) => setFormLimit(e.target.value ? parseInt(e.target.value, 10) : undefined)} className="max-w-[120px] h-9 rounded-lg text-sm !bg-[var(--platform-bg)]" style={{ borderColor: "var(--platform-border)", color: "var(--platform-fg)" }} placeholder="100" />
                </div>
              </div>
              <div className="rounded-xl border p-4" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg-elevated)" }}>
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-sm font-medium" style={{ color: "var(--platform-fg-muted)" }}>Filtros (opcional)</Label>
                  <Button type="button" variant="outline" size="sm" className="rounded-lg h-8 text-xs" style={{ borderColor: "var(--platform-border)", color: "var(--platform-fg)" }} onClick={() => setFormFilters((f) => [...f, { id: `f-${Date.now()}`, field: fields[0] ?? "", operator: "=", value: "" }])}>
                    + Añadir filtro
                  </Button>
                </div>
                {formFilters.length > 0 && (
                  <div className="space-y-2">
                    {formFilters.map((f, i) => (
                      <div key={f.id} className="flex flex-wrap gap-2 items-center rounded-lg border p-2" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}>
                        <select value={f.field} onChange={(e) => setFormFilters((prev) => prev.map((ff, ii) => ii === i ? { ...ff, field: e.target.value } : ff))} className="h-8 rounded-lg border px-2 text-xs min-w-[100px] appearance-none cursor-pointer" style={{ borderColor: "var(--platform-border)", backgroundColor: "var(--platform-bg)", color: "var(--platform-fg)" }}>
                          {fields.map((name) => (<option key={name} value={name}>{name}</option>))}
                        </select>
                        <select value={f.operator} onChange={(e) => setFormFilters((prev) => prev.map((ff, ii) => ii === i ? { ...ff, operator: e.target.value } : ff))} className="h-8 rounded-lg border px-2 text-xs w-20 appearance-none cursor-pointer" style={{ borderColor: "var(--platform-border)", backgroundColor: "var(--platform-bg)", color: "var(--platform-fg)" }}>
                          {["=", "!=", ">", ">=", "<", "<=", "LIKE", "ILIKE"].map((op) => (<option key={op} value={op}>{op}</option>))}
                        </select>
                        <Input value={f.value != null ? String(f.value) : ""} onChange={(e) => setFormFilters((prev) => prev.map((ff, ii) => ii === i ? { ...ff, value: e.target.value || null } : ff))} placeholder="Valor" className="h-8 text-xs rounded-lg flex-1 min-w-[80px] !bg-[var(--platform-bg)]" style={{ borderColor: "var(--platform-border)", color: "var(--platform-fg)" }} />
                        <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-red-500 shrink-0" onClick={() => setFormFilters((prev) => prev.filter((_, ii) => ii !== i))}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Vista previa: mismos datos agregados que usará el gráfico */}
          <section
            className="rounded-2xl border p-6 shadow-sm"
            style={{ borderColor: "var(--platform-border)", background: "var(--platform-surface)" }}
          >
            <h3 className="text-base font-semibold mb-2" style={{ color: "var(--platform-fg)" }}>
              Vista previa
            </h3>
            <p className="text-sm mb-4" style={{ color: "var(--platform-fg-muted)" }}>
              Datos agregados con la misma configuración que el gráfico (dimensión, métricas, filtros, orden y límite).
            </p>
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={fetchPreview} disabled={previewLoading || formMetrics.length === 0} style={{ borderColor: "var(--platform-accent)", color: "var(--platform-accent)" }}>
                {previewLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                Actualizar vista previa
              </Button>
              <Button type="button" variant="ghost" size="sm" className="rounded-xl text-xs" style={{ color: "var(--platform-fg-muted)" }} onClick={() => fetchData()} disabled={loading}>
                Recargar datos del ETL
              </Button>
            </div>
            {previewData && (
              <div className="overflow-hidden rounded-xl border shadow-sm" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg-elevated)" }}>
                <div className="overflow-auto max-h-[400px]">
                  <table className="w-full text-sm" style={{ color: "var(--platform-fg)" }}>
                    <thead className="sticky top-0 z-10" style={{ background: "var(--platform-surface)", color: "var(--platform-fg)", borderBottom: "1px solid var(--platform-border)" }}>
                      <tr>
                        {previewData.length > 0 && Object.keys(previewData[0]).map((k) => (
                          <th key={k} className="text-left px-4 py-3 font-medium whitespace-nowrap">{k}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody style={{ background: "var(--platform-bg-elevated)" }}>
                      {previewData.map((row, idx) => (
                        <tr key={idx} className="border-b border-[var(--platform-border)] last:border-b-0 hover:opacity-90" style={{ borderColor: "var(--platform-border)" }}>
                          {Object.values(row).map((v, i) => (
                            <td key={i} className="px-4 py-2.5 whitespace-nowrap" style={{ color: "var(--platform-fg)" }}>{String(v ?? "")}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs px-4 py-2.5 border-t" style={{ borderColor: "var(--platform-border)", color: "var(--platform-fg-muted)", background: "var(--platform-surface)" }}>
                  {previewData.length} {previewData.length === 1 ? "fila" : "filas"} (mismo resultado que el gráfico)
                </p>
              </div>
            )}
          </section>

          {/* Vista previa de visualización: solo para ver cómo podría verse; el tipo de gráfico se elige al usar la métrica en el dashboard */}
          <section
            className="rounded-2xl border p-6 shadow-sm"
            style={{ borderColor: "var(--platform-border)", background: "var(--platform-surface)" }}
          >
            <h3 className="text-base font-semibold mb-2 flex items-center gap-2" style={{ color: "var(--platform-fg)" }}>
              Vista previa de visualización
            </h3>
            <p className="text-sm mb-4" style={{ color: "var(--platform-fg-muted)" }}>
              Probá distintos tipos de gráfico para ver cómo se verían los datos. Esto no se guarda con la métrica: cuando uses esta métrica en un dashboard, ahí elegís el tipo de gráfico que querés.
            </p>
            <section
              className="rounded-xl border p-4 mb-4"
              style={{ borderColor: "var(--platform-accent-dim)", background: "var(--platform-accent-dim)", color: "var(--platform-fg)" }}
            >
              <div className="flex items-start gap-2">
                <Sparkles className="h-5 w-5 shrink-0 mt-0.5" style={{ color: "var(--platform-accent)" }} />
                <p className="text-sm" dangerouslySetInnerHTML={{ __html: recommendationText.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>") }} />
              </div>
            </section>
            <div className="flex flex-wrap gap-2">
              {CHART_TYPES.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFormChartType(value)}
                  className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-all"
                  style={{
                    background: formChartType === value ? "var(--platform-accent)" : "var(--platform-surface-hover)",
                    color: formChartType === value ? "var(--platform-bg)" : "var(--platform-fg-muted)",
                  }}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              ))}
            </div>
          </section>

          {/* Acciones */}
          <div className="flex flex-wrap gap-3">
            <Button type="button" disabled={saving} className="rounded-xl px-6 font-semibold" style={{ background: "var(--platform-accent)", color: "var(--platform-bg)" }} onClick={saveMetric}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingId ? "Guardar cambios" : "Crear métrica"}
            </Button>
            <Button type="button" variant="outline" className="rounded-xl" style={{ borderColor: "var(--platform-border)" }} onClick={closeForm}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {savedMetrics.length > 0 && (
        <section>
          <h2 className="text-sm font-medium mb-3" style={{ color: "var(--platform-fg-muted)" }}>
            Métricas guardadas ({savedMetrics.length})
          </h2>
          <ul className="space-y-2">
            {savedMetrics.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between gap-4 rounded-xl border p-4"
                style={{ borderColor: "var(--platform-border)", background: "var(--platform-surface)" }}
              >
                <div>
                  <span className="font-medium" style={{ color: "var(--platform-fg)" }}>{s.name}</span>
                  <span className="text-sm ml-2" style={{ color: "var(--platform-fg-muted)" }}>
                    {s.metric.func}({s.metric.field || "—"}) {s.metric.alias ? `as ${s.metric.alias}` : ""}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    style={{ color: "var(--platform-fg-muted)" }}
                    onClick={() => openEdit(s)}
                    aria-label="Editar"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-red-500"
                    onClick={() => deleteMetric(s.id)}
                    aria-label="Eliminar"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {hasData && savedMetrics.length === 0 && !showForm && (
        <p className="text-sm" style={{ color: "var(--platform-fg-muted)" }}>
          Aún no hay métricas guardadas. Creá una con "Nueva métrica" para usarla después en tus dashboards.
        </p>
      )}
    </div>
  );
}
