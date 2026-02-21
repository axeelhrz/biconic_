"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, Plus, LayoutDashboard, Pencil, Trash2, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import AdminFieldSelector from "@/components/admin/dashboard/AdminFieldSelector";
import type { ETLDataResponse } from "@/hooks/admin/useAdminDashboardEtlData";
import type { SavedMetricForm, AggregationMetricEdit } from "@/components/admin/dashboard/AddMetricConfigForm";

const AGG_FUNCS = [
  { value: "SUM", label: "Suma" },
  { value: "AVG", label: "Promedio" },
  { value: "COUNT", label: "Conteo" },
  { value: "MIN", label: "Mínimo" },
  { value: "MAX", label: "Máximo" },
  { value: "COUNT(DISTINCT", label: "Conteo único" },
  { value: "FORMULA", label: "Fórmula / ratio" },
];

type MetricsDataResponse = {
  ok: boolean;
  data?: {
    etl: { id: string; title?: string; name?: string };
    hasData: boolean;
    runInProgress?: boolean;
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
  const [formMetric, setFormMetric] = useState<AggregationMetricEdit>({
    id: `m-${Date.now()}`,
    field: "",
    func: "SUM",
    alias: "",
  });

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
  const runInProgress = data?.runInProgress ?? false;
  const fields = data?.fields?.all ?? [];

  // Auto-refrescar mientras la ejecución está en curso (sin mostrar loading)
  useEffect(() => {
    if (!runInProgress) return;
    const interval = setInterval(() => fetchData({ silent: true }), 5000);
    return () => clearInterval(interval);
  }, [runInProgress, fetchData]);

  const openNew = () => {
    setEditingId(null);
    setFormName("");
    setFormMetric({
      id: `m-${Date.now()}`,
      field: fields[0] ?? "",
      func: "SUM",
      alias: fields[0] ?? "valor",
    });
    setShowForm(true);
  };

  const openEdit = (saved: SavedMetricForm) => {
    setEditingId(saved.id);
    setFormName(saved.name);
    setFormMetric({ ...saved.metric, id: saved.metric.id || `m-${Date.now()}` });
    setShowForm(true);
  };

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
    setSaving(true);
    try {
      let next: SavedMetricForm[];
      if (editingId) {
        next = savedMetrics.map((s) =>
          s.id === editingId
            ? { ...s, name, metric: { ...formMetric, id: s.metric.id } }
            : s
        );
      } else {
        next = [...savedMetrics, { id: `sm-${Date.now()}`, name, metric: { ...formMetric, id: formMetric.id || `m-${Date.now()}` } }];
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
          {runInProgress ? (
            <>
              <p className="text-sm mb-3">
                La ejecución del ETL está en curso. Los datos estarán disponibles en unos segundos.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-lg"
                  onClick={() => fetchData()}
                  disabled={loading}
                  style={{ borderColor: "var(--platform-accent)", color: "var(--platform-accent)" }}
                >
                  {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                  Recargar
                </Button>
                <span className="text-xs" style={{ color: "var(--platform-fg-muted)" }}>
                  (se actualiza automáticamente cada 5 s)
                </span>
              </div>
            </>
          ) : (
            <>
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
                  style={{ color: "var(--platform-fg-muted)" }}
                >
                  <RefreshCw className="h-4 w-4 mr-1" />
                  Recargar
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {showForm && hasData && (
        <section
          className="rounded-xl border p-6 space-y-4"
          style={{ borderColor: "var(--platform-border)", background: "var(--platform-surface)" }}
        >
          <h2 className="text-base font-semibold" style={{ color: "var(--platform-fg)" }}>
            {editingId ? "Editar métrica" : "Nueva métrica"}
          </h2>
          <div>
            <Label className="text-sm" style={{ color: "var(--platform-fg-muted)" }}>
              Nombre (para reutilizar en dashboards)
            </Label>
            <Input
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="Ej. Ventas totales"
              className="mt-1 max-w-sm"
              style={{ borderColor: "var(--platform-border)", color: "var(--platform-fg)" }}
            />
          </div>
          <div>
            <Label className="text-sm" style={{ color: "var(--platform-fg-muted)" }}>
              Función
            </Label>
            <select
              value={formMetric.func}
              onChange={(e) => setFormMetric((m) => ({ ...m, func: e.target.value }))}
              className="mt-1 h-9 rounded-md border px-3 w-full max-w-xs text-sm"
              style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)", color: "var(--platform-fg)" }}
            >
              {AGG_FUNCS.map((f) => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
          </div>
          {formMetric.func !== "FORMULA" && (
            <div>
              <AdminFieldSelector
                label="Campo"
                value={formMetric.field}
                onChange={(v) => setFormMetric((m) => ({ ...m, field: v }))}
                etlData={etlData}
                fieldType={formMetric.func === "COUNT" || formMetric.func === "COUNT(DISTINCT" ? "all" : "numeric"}
                placeholder="Campo..."
              />
            </div>
          )}
          {formMetric.func === "FORMULA" && (
            <div>
              <Label className="text-sm" style={{ color: "var(--platform-fg-muted)" }}>
                Fórmula (metric_0, metric_1…)
              </Label>
              <Input
                value={formMetric.formula ?? ""}
                onChange={(e) => setFormMetric((m) => ({ ...m, formula: e.target.value }))}
                placeholder="Ej. metric_0 / NULLIF(metric_1, 0)"
                className="mt-1 font-mono text-sm"
                style={{ borderColor: "var(--platform-border)", color: "var(--platform-fg)" }}
              />
            </div>
          )}
          <div>
            <Label className="text-sm" style={{ color: "var(--platform-fg-muted)" }}>
              Alias
            </Label>
            <Input
              value={formMetric.alias}
              onChange={(e) => setFormMetric((m) => ({ ...m, alias: e.target.value }))}
              placeholder="Ej. total_ventas"
              className="mt-1 max-w-xs"
              style={{ borderColor: "var(--platform-border)", color: "var(--platform-fg)" }}
            />
          </div>
          <div className="flex gap-2 pt-2">
            <Button
              type="button"
              disabled={saving}
              className="rounded-lg"
              style={{ background: "var(--platform-accent)", color: "var(--platform-bg)" }}
              onClick={saveMetric}
            >
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingId ? "Guardar cambios" : "Crear métrica"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="rounded-lg"
              style={{ borderColor: "var(--platform-border)" }}
              onClick={closeForm}
            >
              Cancelar
            </Button>
          </div>
        </section>
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
