"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, Plus, LayoutDashboard, Pencil, Trash2, Loader2, RefreshCw, BarChart2, LineChart, PieChart, Donut, Hash, Table2, Sparkles } from "lucide-react";
import { Bar, Line, Pie, Doughnut } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import AdminFieldSelector from "@/components/admin/dashboard/AdminFieldSelector";
import type { ETLDataResponse } from "@/hooks/admin/useAdminDashboardEtlData";
import type { SavedMetricForm, AggregationMetricEdit, AggregationFilterEdit } from "@/components/admin/dashboard/AddMetricConfigForm";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Tooltip,
  Legend,
  Filler
);

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

type ColumnRole = "key" | "time" | "dimension" | "measure";

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
    rawRows?: Record<string, unknown>[];
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
  const [wizard, setWizard] = useState<"A" | "B" | "C" | "D">("A");
  const [wizardStep, setWizardStep] = useState(0);
  const [rawTableData, setRawTableData] = useState<Record<string, unknown>[]>([]);
  const [datasetHasTime, setDatasetHasTime] = useState(true);
  const [timeColumn, setTimeColumn] = useState("");
  const [periodicity, setPeriodicity] = useState("Diaria");
  const [grainOption, setGrainOption] = useState<string>("");
  const [columnRoles, setColumnRoles] = useState<Record<string, { role: ColumnRole; aggregation: string; label: string; visible: boolean }>>({});
  const [calcType, setCalcType] = useState<"simple" | "count" | "ratio" | "formula">("simple");
  const [metricAdditivity, setMetricAdditivity] = useState<"additive" | "semi" | "non">("additive");
  const [analysisTimeRange, setAnalysisTimeRange] = useState("12");
  const [analysisGranularity, setAnalysisGranularity] = useState("month");
  const [transformCompare, setTransformCompare] = useState<"none" | "mom" | "yoy">("none");
  const [showDataLabels, setShowDataLabels] = useState(false);
  const [chartColorScheme, setChartColorScheme] = useState("auto");

  const WIZARD_STEPS: Record<"A" | "B" | "C" | "D", string[]> = {
    A: ["Profiling", "Grain", "Tiempo", "Roles BI", "Relaciones", "Avanzado", "Publicar"],
    B: ["Identidad", "Tipo cálculo", "Cálculo simple", "Avanzado", "Propiedades", "Filtros base", "Preview"],
    C: ["Métricas", "Tiempo", "Dimensiones", "Filtros", "Transformaciones", "Preview"],
    D: ["Tipo visual", "Mapeo", "Formato", "Colores", "Interacciones", "Guardar"],
  };

  const currentStepLabel = WIZARD_STEPS[wizard][wizardStep];
  const totalStepsInWizard = WIZARD_STEPS[wizard].length;
  const canPrev = wizard !== "A" || wizardStep > 0;
  const isLastStep = wizard === "D" && wizardStep === totalStepsInWizard - 1;
  const canNext = wizardStep < totalStepsInWizard - 1 || (wizard !== "D" || !isLastStep);
  const goNext = () => {
    if (wizardStep < totalStepsInWizard - 1) setWizardStep((s) => s + 1);
    else if (wizard === "A") { setWizard("B"); setWizardStep(0); }
    else if (wizard === "B") { setWizard("C"); setWizardStep(0); }
    else if (wizard === "C") { setWizard("D"); setWizardStep(0); }
  };
  const goPrev = () => {
    if (wizardStep > 0) setWizardStep((s) => s - 1);
    else if (wizard === "B") { setWizard("A"); setWizardStep(WIZARD_STEPS.A.length - 1); }
    else if (wizard === "C") { setWizard("B"); setWizardStep(WIZARD_STEPS.B.length - 1); }
    else if (wizard === "D") { setWizard("C"); setWizardStep(WIZARD_STEPS.C.length - 1); }
  };

  const fetchData = useCallback(async (opts?: { silent?: boolean; sampleRows?: number }) => {
    if (!opts?.silent) setLoading(true);
    try {
      const sampleRows = opts?.sampleRows ?? 0;
      const url = sampleRows > 0 ? `/api/etl/${etlId}/metrics-data?sampleRows=${Math.min(500, sampleRows)}` : `/api/etl/${etlId}/metrics-data`;
      const res = await fetch(url);
      const json: MetricsDataResponse = await res.json();
      if (!res.ok || !json.ok || !json.data) {
        toast.error(json.data ? "Error al cargar datos" : (json as { error?: string }).error ?? "Error");
        return;
      }
      setData(json.data);
      setEtlData(buildEtlDataFromMetricsResponse(json.data));
      if (Array.isArray(json.data?.rawRows)) setRawTableData(json.data.rawRows);
      else if (sampleRows === 0) setRawTableData([]);
    } catch (e) {
      toast.error("Error al cargar métricas");
    } finally {
      setLoading(false);
    }
  }, [etlId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (showForm && (data?.hasData ?? false) && data?.rowCount && data.rowCount > 0 && rawTableData.length <= 1) {
      fetchData({ silent: true, sampleRows: 200 });
    }
  }, [showForm, data?.hasData, data?.rowCount, fetchData]);

  useEffect(() => {
    const allFields = data?.fields?.all ?? [];
    if (allFields.length > 0 && Object.keys(columnRoles).length === 0) {
      const numeric = new Set(data?.fields?.numeric ?? []);
      const date = new Set(data?.fields?.date ?? []);
      const initial: Record<string, { role: ColumnRole; aggregation: string; label: string; visible: boolean }> = {};
      allFields.forEach((f) => {
        let role: ColumnRole = "dimension";
        let aggregation = "—";
        if (date.has(f)) role = "time";
        else if (numeric.has(f)) { role = "measure"; aggregation = "sum"; }
        initial[f] = { role, aggregation, label: f, visible: true };
      });
      setColumnRoles(initial);
    }
  }, [data?.fields?.all, data?.fields?.numeric, data?.fields?.date]);

  useEffect(() => {
    const allFields = data?.fields?.all ?? [];
    if (allFields.length > 0 && !timeColumn) setTimeColumn(allFields[0]);
  }, [data?.fields?.all, timeColumn]);

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
    setWizard("A");
    setWizardStep(0);
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

  const previewChartConfig = useMemo(() => {
    if (!previewData || previewData.length === 0) return null;
    const first = previewData[0] as Record<string, unknown>;
    const keys = Object.keys(first);
    const dimKey = formDimension && keys.includes(formDimension) ? formDimension : keys[0];
    let valueKeys = formMetrics
      .map((m) => m.alias || m.field || "")
      .filter(Boolean)
      .filter((k) => keys.includes(k));
    if (valueKeys.length === 0) valueKeys = keys.filter((k) => k !== dimKey);
    if (valueKeys.length === 0) return null;
    const labels = previewData.map((r) => String((r as Record<string, unknown>)[dimKey] ?? ""));
    const palette = ["#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];
    const datasets = valueKeys.map((alias, idx) => ({
      label: alias,
      data: previewData.map((r) => Number((r as Record<string, unknown>)[alias] ?? 0)),
      backgroundColor: palette[idx % palette.length] + "99",
      borderColor: palette[idx % palette.length],
      borderWidth: 1,
    }));
    return { labels, datasets };
  }, [previewData, formDimension, formMetrics]);

  const previewKpiValue = useMemo(() => {
    if (!previewData || previewData.length === 0 || !previewChartConfig) return undefined;
    const firstNum = previewChartConfig.datasets[0]?.data?.[0];
    return firstNum != null ? firstNum : undefined;
  }, [previewData, previewChartConfig]);

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setWizard("A");
    setWizardStep(0);
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
        <div className="flex flex-col rounded-2xl border overflow-hidden" style={{ borderColor: "var(--platform-border)", background: "var(--platform-surface)", minHeight: "480px" }}>
          {/* Tabs: Dataset, Métrica, Análisis, Gráfico */}
          <div className="flex border-b flex-shrink-0" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg-elevated)" }}>
            {(["A", "B", "C", "D"] as const).map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => { setWizard(w); setWizardStep(0); }}
                className="flex-1 min-w-0 py-3 px-4 text-sm font-medium transition-colors relative"
                style={{
                  color: wizard === w ? "var(--platform-accent)" : "var(--platform-fg-muted)",
                  background: wizard === w ? "var(--platform-surface)" : "transparent",
                }}
              >
                {w === "A" ? "Dataset" : w === "B" ? "Métrica" : w === "C" ? "Análisis" : "Gráfico"}
                <span className="ml-1.5 text-xs font-normal opacity-80" style={{ color: "inherit" }}>({WIZARD_STEPS[w].length})</span>
                {wizard === w && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full" style={{ background: "var(--platform-accent)" }} />
                )}
              </button>
            ))}
          </div>

          <div className="flex flex-col min-w-0 flex-1">
            {/* Top bar: step title + actions */}
            <div className="flex items-center justify-between gap-4 px-4 py-3 border-b flex-shrink-0" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg-elevated)" }}>
              <div>
                <p className="text-xs" style={{ color: "var(--platform-fg-muted)" }}>{wizard === "A" ? "Dataset" : wizard === "B" ? "Métrica" : wizard === "C" ? "Análisis" : "Gráfico"} — {WIZARD_STEPS[wizard][wizardStep]}</p>
                <h2 className="text-base font-semibold" style={{ color: "var(--platform-fg)" }}>{WIZARD_STEPS[wizard][wizardStep]}</h2>
              </div>
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="sm" className="rounded-lg" style={{ borderColor: "var(--platform-border)" }} onClick={closeForm}>Cancelar</Button>
                {canPrev && <Button type="button" variant="outline" size="sm" className="rounded-lg" style={{ borderColor: "var(--platform-border)" }} onClick={goPrev}>← Anterior</Button>}
                {(wizard === "D" && wizardStep === WIZARD_STEPS.D.length - 1) ? (
                  <Button type="button" size="sm" className="rounded-lg" style={{ background: "var(--platform-accent)", color: "var(--platform-bg)" }} onClick={saveMetric} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} {editingId ? "Guardar cambios" : "Crear métrica"}</Button>
                ) : (
                  canNext && <Button type="button" size="sm" className="rounded-lg" style={{ background: "var(--platform-accent)", color: "var(--platform-bg)" }} onClick={goNext}>Siguiente</Button>
                )}
              </div>
            </div>

            {/* Stepper (steps within current wizard) */}
            <div className="flex gap-1 px-4 py-2 border-b flex-shrink-0" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg-elevated)" }}>
              {WIZARD_STEPS[wizard].map((label, i) => (
                <button key={i} type="button" onClick={() => setWizardStep(i)} className="flex-1 min-w-0 py-2 px-2 rounded-lg text-center text-xs font-medium transition-colors" style={{ color: wizardStep === i ? "var(--platform-accent)" : "var(--platform-fg-muted)", background: wizardStep === i ? "var(--platform-accent-dim)" : "transparent" }}>
                  <span className="w-6 h-6 rounded-full mx-auto mb-1 flex items-center justify-center text-xs" style={{ background: wizardStep === i ? "var(--platform-accent)" : "var(--platform-surface)", color: wizardStep === i ? "var(--platform-bg)" : "var(--platform-fg-muted)" }}>{i + 1}</span>
                  <span className="truncate block">{label}</span>
                </button>
              ))}
            </div>

            {/* Panel content */}
            <div className="flex-1 overflow-y-auto p-6">
              {/* Wizard A0: Profiling — datos ETL tipo Excel */}
              {wizard === "A" && wizardStep === 0 && (
                <section className="rounded-xl border p-6" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg-elevated)" }}>
                  <h3 className="text-base font-semibold mb-2" style={{ color: "var(--platform-fg)" }}>Profiling — Datos del ETL</h3>
                  <p className="text-sm mb-4" style={{ color: "var(--platform-fg-muted)" }}>Revisá la tabla y columnas que usará la métrica. Podés analizar los datos como en una hoja.</p>
                  <div className="grid gap-4 sm:grid-cols-2 mb-4">
                    <div><p className="text-xs font-medium uppercase" style={{ color: "var(--platform-fg-muted)" }}>ETL</p><p className="font-medium" style={{ color: "var(--platform-fg)" }}>{etlTitle}</p></div>
                    <div><p className="text-xs font-medium uppercase" style={{ color: "var(--platform-fg-muted)" }}>Tabla</p><p className="font-mono text-sm" style={{ color: "var(--platform-fg)" }}>{data?.schema}.{data?.tableName}</p></div>
                    <div><p className="text-xs font-medium uppercase" style={{ color: "var(--platform-fg-muted)" }}>Filas</p><p className="font-medium" style={{ color: "var(--platform-fg)" }}>{data?.rowCount ?? 0}</p></div>
                    <div><p className="text-xs font-medium uppercase" style={{ color: "var(--platform-fg-muted)" }}>Columnas</p><p className="font-medium" style={{ color: "var(--platform-fg)" }}>{fields.length}</p></div>
                  </div>
                  <div className="mb-4">
                    <p className="text-xs font-medium uppercase mb-2" style={{ color: "var(--platform-fg-muted)" }}>Vista de datos (muestra)</p>
                    <div className="overflow-hidden rounded-xl border" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}>
                      <div className="overflow-auto max-h-[320px]">
                        <table className="w-full text-sm border-collapse" style={{ color: "var(--platform-fg)" }}>
                          <thead className="sticky top-0 z-10" style={{ background: "var(--platform-surface)", borderBottom: "1px solid var(--platform-border)" }}>
                            <tr>
                              {fields.map((k) => (
                                <th key={k} className="text-left px-3 py-2 font-medium whitespace-nowrap border-r last:border-r-0" style={{ borderColor: "var(--platform-border)", fontSize: "11px", textTransform: "uppercase" }}>{k}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody style={{ background: "var(--platform-bg)" }}>
                            {(rawTableData.length > 0 ? rawTableData : []).map((row, idx) => (
                              <tr key={idx} className="border-b last:border-b-0 hover:opacity-90" style={{ borderColor: "var(--platform-border)" }}>
                                {fields.map((col) => (
                                  <td key={col} className="px-3 py-1.5 whitespace-nowrap border-r last:border-r-0 text-xs" style={{ borderColor: "var(--platform-border)", color: "var(--platform-fg-muted)" }}>{String((row as Record<string, unknown>)[col] ?? "")}</td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <p className="text-xs px-3 py-2 border-t" style={{ borderColor: "var(--platform-border)", color: "var(--platform-fg-muted)", background: "var(--platform-surface)" }}>
                        {rawTableData.length} filas mostradas {data?.rowCount && data.rowCount > rawTableData.length ? `(de ${data.rowCount} total)` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 mb-4">
                    <Button type="button" variant="outline" size="sm" className="rounded-lg" style={{ borderColor: "var(--platform-border)" }} onClick={() => fetchData({ silent: true, sampleRows: 200 })} disabled={loading}>
                      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Recargar muestra
                    </Button>
                  </div>
                  <div className="flex justify-between">
                    <div />
                    <Button type="button" className="rounded-xl" style={{ background: "var(--platform-accent)", color: "var(--platform-bg)" }} onClick={goNext}>Siguiente: Grain</Button>
                  </div>
                </section>
              )}

              {/* Wizard A1: Grain */}
              {wizard === "A" && wizardStep === 1 && (
                <section className="rounded-xl border p-6" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg-elevated)" }}>
                  <h3 className="text-base font-semibold mb-2" style={{ color: "var(--platform-fg)" }}>Grain técnico (clave única)</h3>
                  <p className="text-sm mb-4" style={{ color: "var(--platform-fg-muted)" }}>El grain es el set mínimo de columnas que identifica una fila. Opcional para esta métrica.</p>
                  <div className="space-y-2 mb-4">
                    {fields.slice(0, 3).map((f) => (
                      <label key={f} className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors" style={{ borderColor: grainOption === f ? "var(--platform-accent)" : "var(--platform-border)", background: grainOption === f ? "var(--platform-accent-dim)" : "var(--platform-bg)" }}>
                        <input type="radio" name="grain" checked={grainOption === f} onChange={() => setGrainOption(f)} className="rounded-full" />
                        <span className="font-medium" style={{ color: "var(--platform-fg)" }}>{f}</span>
                        <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "var(--platform-surface)", color: "var(--platform-fg-muted)" }}>1 columna</span>
                      </label>
                    ))}
                    <label className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors" style={{ borderColor: grainOption === "_custom" ? "var(--platform-accent)" : "var(--platform-border)", background: grainOption === "_custom" ? "var(--platform-accent-dim)" : "var(--platform-bg)" }}>
                      <input type="radio" name="grain" checked={grainOption === "_custom"} onChange={() => setGrainOption("_custom")} className="rounded-full" />
                      <span style={{ color: "var(--platform-fg-muted)" }}>Personalizado — definir columnas manualmente</span>
                    </label>
                  </div>
                  <div className="flex justify-between">
                    <Button type="button" variant="outline" className="rounded-xl" style={{ borderColor: "var(--platform-border)" }} onClick={goPrev}>Anterior</Button>
                    <Button type="button" className="rounded-xl" style={{ background: "var(--platform-accent)", color: "var(--platform-bg)" }} onClick={goNext}>Siguiente: Tiempo</Button>
                  </div>
                </section>
              )}

              {/* Wizard A2: Tiempo */}
              {wizard === "A" && wizardStep === 2 && (
                <section className="rounded-xl border p-6" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg-elevated)" }}>
                  <h3 className="text-base font-semibold mb-2" style={{ color: "var(--platform-fg)" }}>Dimensión temporal</h3>
                  <p className="text-sm mb-4" style={{ color: "var(--platform-fg-muted)" }}>Resolución temporal para análisis. Periodicidad natural = detalle mínimo disponible.</p>
                  <div className="flex items-center gap-3 mb-4">
                    <input type="checkbox" id="hasTime" checked={datasetHasTime} onChange={(e) => setDatasetHasTime(e.target.checked)} className="rounded" />
                    <label htmlFor="hasTime" className="text-sm" style={{ color: "var(--platform-fg)" }}>Este dataset tiene dimensión temporal</label>
                  </div>
                  {datasetHasTime && (
                    <div className="grid gap-4 sm:grid-cols-2 mb-4">
                      <div>
                        <Label className="text-sm font-medium mb-2 block" style={{ color: "var(--platform-fg-muted)" }}>Columna temporal</Label>
                        <select value={timeColumn || fields[0]} onChange={(e) => setTimeColumn(e.target.value)} className="w-full h-9 rounded-lg border px-3 text-sm" style={{ borderColor: "var(--platform-border)", backgroundColor: "var(--platform-bg)", color: "var(--platform-fg)" }}>
                          {fields.map((f) => (<option key={f} value={f}>{f}</option>))}
                        </select>
                      </div>
                      <div>
                        <Label className="text-sm font-medium mb-2 block" style={{ color: "var(--platform-fg-muted)" }}>Periodicidad natural</Label>
                        <select value={periodicity} onChange={(e) => setPeriodicity(e.target.value)} className="w-full h-9 rounded-lg border px-3 text-sm" style={{ borderColor: "var(--platform-border)", backgroundColor: "var(--platform-bg)", color: "var(--platform-fg)" }}>
                          {["Diaria", "Semanal", "Mensual", "Anual", "Irregular"].map((p) => (<option key={p} value={p}>{p}</option>))}
                        </select>
                      </div>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <Button type="button" variant="outline" className="rounded-xl" style={{ borderColor: "var(--platform-border)" }} onClick={goPrev}>Anterior</Button>
                    <Button type="button" className="rounded-xl" style={{ background: "var(--platform-accent)", color: "var(--platform-bg)" }} onClick={goNext}>Siguiente: Roles BI</Button>
                  </div>
                </section>
              )}

              {/* Wizard A3: Roles BI */}
              {wizard === "A" && wizardStep === 3 && (
                <section className="rounded-xl border p-6" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg-elevated)" }}>
                  <h3 className="text-base font-semibold mb-2" style={{ color: "var(--platform-fg)" }}>Clasificación BI de columnas (roles)</h3>
                  <p className="text-sm mb-4" style={{ color: "var(--platform-fg-muted)" }}>Definí qué columnas son dimensión, medida o clave. Controla lo que aparece en métricas.</p>
                  <div className="overflow-x-auto rounded-xl border mb-4" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}>
                    <table className="w-full text-sm">
                      <thead style={{ background: "var(--platform-surface)", borderBottom: "1px solid var(--platform-border)" }}>
                        <tr>
                          <th className="text-left px-3 py-2 font-medium" style={{ color: "var(--platform-fg-muted)", fontSize: "11px" }}>Columna</th>
                          <th className="text-left px-3 py-2 font-medium" style={{ color: "var(--platform-fg-muted)", fontSize: "11px" }}>Rol BI</th>
                          <th className="text-left px-3 py-2 font-medium" style={{ color: "var(--platform-fg-muted)", fontSize: "11px" }}>Agregación</th>
                          <th className="text-left px-3 py-2 font-medium" style={{ color: "var(--platform-fg-muted)", fontSize: "11px" }}>Etiqueta</th>
                          <th className="text-left px-3 py-2 font-medium" style={{ color: "var(--platform-fg-muted)", fontSize: "11px" }}>Visible</th>
                        </tr>
                      </thead>
                      <tbody style={{ color: "var(--platform-fg)" }}>
                        {fields.map((col) => {
                          const r = columnRoles[col] ?? { role: "dimension" as ColumnRole, aggregation: "—", label: col, visible: true };
                          return (
                            <tr key={col} className="border-b last:border-b-0" style={{ borderColor: "var(--platform-border)" }}>
                              <td className="px-3 py-2 font-medium">{col}</td>
                              <td className="px-3 py-2">
                                <select value={r.role} onChange={(e) => setColumnRoles((prev) => ({ ...prev, [col]: { ...prev[col], role: e.target.value as ColumnRole } }))} className="h-8 rounded border px-2 text-xs w-full max-w-[120px]" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)", color: "var(--platform-fg)" }}>
                                  <option value="key">key</option>
                                  <option value="time">time</option>
                                  <option value="dimension">dimension</option>
                                  <option value="measure">measure</option>
                                </select>
                              </td>
                              <td className="px-3 py-2">
                                {r.role === "measure" ? (
                                  <select value={r.aggregation} onChange={(e) => setColumnRoles((prev) => ({ ...prev, [col]: { ...prev[col], aggregation: e.target.value } }))} className="h-8 rounded border px-2 text-xs w-20" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)", color: "var(--platform-fg)" }}>
                                    <option value="sum">sum</option>
                                    <option value="avg">avg</option>
                                    <option value="min">min</option>
                                    <option value="max">max</option>
                                    <option value="none">none</option>
                                  </select>
                                ) : <span className="text-xs" style={{ color: "var(--platform-fg-muted)" }}>—</span>}
                              </td>
                              <td className="px-3 py-2">
                                <Input value={r.label} onChange={(e) => setColumnRoles((prev) => ({ ...prev, [col]: { ...prev[col], label: e.target.value } }))} className="h-8 text-xs max-w-[120px] rounded" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)", color: "var(--platform-fg)" }} />
                              </td>
                              <td className="px-3 py-2">
                                <input type="checkbox" checked={r.visible} onChange={(e) => setColumnRoles((prev) => ({ ...prev, [col]: { ...prev[col], visible: e.target.checked } }))} className="rounded" />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex justify-between">
                    <Button type="button" variant="outline" className="rounded-xl" style={{ borderColor: "var(--platform-border)" }} onClick={goPrev}>Anterior</Button>
                    <Button type="button" className="rounded-xl" style={{ background: "var(--platform-accent)", color: "var(--platform-bg)" }} onClick={goNext}>Siguiente: Relaciones</Button>
                  </div>
                </section>
              )}

              {/* Wizard A4: Relaciones (simplificado) */}
              {wizard === "A" && wizardStep === 4 && (
                <section className="rounded-xl border p-6" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg-elevated)" }}>
                  <h3 className="text-base font-semibold mb-2" style={{ color: "var(--platform-fg)" }}>Relaciones entre datasets (joins)</h3>
                  <p className="text-sm mb-4" style={{ color: "var(--platform-fg-muted)" }}>Opcional: definí cómo se combina este dataset con otros para análisis multi-dataset.</p>
                  <div className="rounded-lg border p-4 mb-4" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}>
                    <p className="text-xs font-medium mb-2" style={{ color: "var(--platform-fg-muted)" }}>Por ahora se usa solo este dataset. Podés agregar relaciones en una versión futura.</p>
                  </div>
                  <div className="flex justify-between">
                    <Button type="button" variant="outline" className="rounded-xl" style={{ borderColor: "var(--platform-border)" }} onClick={goPrev}>Anterior</Button>
                    <Button type="button" className="rounded-xl" style={{ background: "var(--platform-accent)", color: "var(--platform-bg)" }} onClick={goNext}>Siguiente: Avanzado</Button>
                  </div>
                </section>
              )}

              {/* Wizard A5: Avanzado */}
              {wizard === "A" && wizardStep === 5 && (
                <section className="rounded-xl border p-6" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg-elevated)" }}>
                  <h3 className="text-base font-semibold mb-2" style={{ color: "var(--platform-fg)" }}>Avanzado (opcional)</h3>
                  <p className="text-sm mb-4" style={{ color: "var(--platform-fg-muted)" }}>Estrategia de distribución para granularidad más fina. Requiere aprobación explícita.</p>
                  <div className="rounded-lg border p-4 mb-4" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}>
                    <p className="text-xs" style={{ color: "var(--platform-fg-muted)" }}>Allocation strategy: permitir distribución de valores de periodicidad gruesa a más fina (ej. mensual a diario). Por defecto desactivado.</p>
                  </div>
                  <div className="flex justify-between">
                    <Button type="button" variant="outline" className="rounded-xl" style={{ borderColor: "var(--platform-border)" }} onClick={goPrev}>Anterior</Button>
                    <Button type="button" className="rounded-xl" style={{ background: "var(--platform-accent)", color: "var(--platform-bg)" }} onClick={goNext}>Siguiente: Publicar</Button>
                  </div>
                </section>
              )}

              {/* Wizard A6: Publicar */}
              {wizard === "A" && wizardStep === 6 && (
                <section className="rounded-xl border p-6" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg-elevated)" }}>
                  <h3 className="text-base font-semibold mb-2" style={{ color: "var(--platform-fg)" }}>Validación final</h3>
                  <p className="text-sm mb-4" style={{ color: "var(--platform-fg-muted)" }}>Confirmá que la metadata del dataset está lista para usar en métricas.</p>
                  <ul className="space-y-2 mb-4">
                    <li className="flex items-center gap-2 text-sm" style={{ color: "var(--platform-fg)" }}><span style={{ color: "var(--platform-accent)" }}>OK</span> Tabla: {data?.schema}.{data?.tableName}</li>
                    <li className="flex items-center gap-2 text-sm" style={{ color: "var(--platform-fg)" }}><span style={{ color: "var(--platform-accent)" }}>OK</span> Columnas: {fields.length}</li>
                    {grainOption && <li className="flex items-center gap-2 text-sm" style={{ color: "var(--platform-fg)" }}><span style={{ color: "var(--platform-accent)" }}>OK</span> Grain: {grainOption === "_custom" ? "Personalizado" : grainOption}</li>}
                    {datasetHasTime && <li className="flex items-center gap-2 text-sm" style={{ color: "var(--platform-fg)" }}><span style={{ color: "var(--platform-accent)" }}>OK</span> Tiempo: {timeColumn || fields[0]} · {periodicity}</li>}
                  </ul>
                  <div className="flex justify-between">
                    <Button type="button" variant="outline" className="rounded-xl" style={{ borderColor: "var(--platform-border)" }} onClick={goPrev}>Anterior</Button>
                    <Button type="button" className="rounded-xl" style={{ background: "var(--platform-accent)", color: "var(--platform-bg)" }} onClick={goNext}>Siguiente: Métrica</Button>
                  </div>
                </section>
              )}

              {/* Wizard B0: Identidad */}
              {wizard === "B" && wizardStep === 0 && (
                <section className="rounded-xl border p-6" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg-elevated)" }}>
                  <h3 className="text-base font-semibold mb-2" style={{ color: "var(--platform-fg)" }}>Identidad — Nombre de la métrica</h3>
                  <p className="text-sm mb-4" style={{ color: "var(--platform-fg-muted)" }}>Nombre único para reutilizar en dashboards. El cálculo se define en pasos siguientes.</p>
                  <div className="space-y-4 mb-4">
                    <div>
                      <Label className="text-sm font-medium mb-2 block" style={{ color: "var(--platform-fg-muted)" }}>Nombre *</Label>
                      <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="Ej. Ventas totales" className="rounded-xl max-w-md" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)", color: "var(--platform-fg)" }} />
                    </div>
                    <div className="rounded-lg border p-3" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}>
                      <p className="text-xs font-medium uppercase mb-1" style={{ color: "var(--platform-fg-muted)" }}>Dataset base</p>
                      <p className="font-medium text-sm" style={{ color: "var(--platform-fg)" }}>{etlTitle}</p>
                      <p className="text-xs mt-1" style={{ color: "var(--platform-fg-muted)" }}>{data?.schema}.{data?.tableName} · {data?.rowCount ?? 0} filas</p>
                    </div>
                  </div>
                  <div className="flex justify-between">
                    <Button type="button" variant="outline" className="rounded-xl" style={{ borderColor: "var(--platform-border)" }} onClick={goPrev}>Anterior</Button>
                    <Button type="button" className="rounded-xl" style={{ background: "var(--platform-accent)", color: "var(--platform-bg)" }} onClick={goNext}>Siguiente: Tipo cálculo</Button>
                  </div>
                </section>
              )}

              {/* Wizard B1: Tipo cálculo */}
              {wizard === "B" && wizardStep === 1 && (
                <section className="rounded-xl border p-6" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg-elevated)" }}>
                  <h3 className="text-base font-semibold mb-2" style={{ color: "var(--platform-fg)" }}>Tipo de cálculo</h3>
                  <p className="text-sm mb-4" style={{ color: "var(--platform-fg-muted)" }}>Modo Simple cubre la mayoría de casos. Fórmula personalizada habilita expresiones avanzadas.</p>
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    {(["simple", "count", "ratio", "formula"] as const).map((t) => (
                      <button key={t} type="button" onClick={() => setCalcType(t)} className="p-4 rounded-xl border text-left transition-colors" style={{ borderColor: calcType === t ? "var(--platform-accent)" : "var(--platform-border)", background: calcType === t ? "var(--platform-accent-dim)" : "var(--platform-bg)" }}>
                        <span className="font-medium block" style={{ color: "var(--platform-fg)" }}>{t === "simple" ? "Agregación simple" : t === "count" ? "Conteo" : t === "ratio" ? "Ratio" : "Fórmula personalizada"}</span>
                        <span className="text-xs" style={{ color: "var(--platform-fg-muted)" }}>{t === "simple" ? "sum(total), avg(precio)" : t === "count" ? "count(*), count_distinct(id)" : t === "ratio" ? "numerador / denominador" : "Expresión con campos y funciones"}</span>
                      </button>
                    ))}
                  </div>
                  <div className="flex justify-between">
                    <Button type="button" variant="outline" className="rounded-xl" style={{ borderColor: "var(--platform-border)" }} onClick={goPrev}>Anterior</Button>
                    <Button type="button" className="rounded-xl" style={{ background: "var(--platform-accent)", color: "var(--platform-bg)" }} onClick={goNext}>Siguiente</Button>
                  </div>
                </section>
              )}

              {/* Wizard B2: Cálculo simple (métricas) */}
              {wizard === "B" && wizardStep === 2 && (
                <section className="rounded-xl border p-6 space-y-4" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg-elevated)" }}>
                  <h3 className="text-base font-semibold mb-2" style={{ color: "var(--platform-fg)" }}>Cálculo — Métricas y agregaciones</h3>
                  <p className="text-sm mb-4" style={{ color: "var(--platform-fg-muted)" }}>Definí las métricas (campo, función, alias) o fórmulas.</p>
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-sm font-medium" style={{ color: "var(--platform-fg-muted)" }}>Métricas</Label>
                    <Button type="button" variant="outline" size="sm" className="rounded-lg h-8 text-xs" onClick={() => setFormMetrics((m) => [...m, { id: `m-${Date.now()}`, field: fields[0] ?? "", func: "SUM", alias: "valor" }])}>+ Añadir métrica</Button>
                  </div>
                  <div className="space-y-3">
                    {formMetrics.map((m, i) => (
                      <div key={m.id} className="rounded-xl border p-4 space-y-3" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}>
                        <div className="flex gap-2 items-center">
                          <select value={m.func} onChange={(e) => setFormMetrics((prev) => prev.map((mm, ii) => ii === i ? { ...mm, func: e.target.value } : mm))} className="flex-1 h-9 rounded-lg border px-3 text-sm appearance-none cursor-pointer" style={{ borderColor: "var(--platform-border)", backgroundColor: "var(--platform-bg)", color: "var(--platform-fg)" }}>
                            {AGG_FUNCS.map((f) => (<option key={f.value} value={f.value}>{f.label}</option>))}
                          </select>
                          {formMetrics.length > 1 && (
                            <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-red-500 shrink-0" onClick={() => setFormMetrics((prev) => prev.filter((_, ii) => ii !== i))}><Trash2 className="h-4 w-4" /></Button>
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
                                <button key={label} type="button" onClick={() => setFormMetrics((prev) => prev.map((mm, ii) => ii === i ? { ...mm, formula: expr } : mm))} className="px-2 py-1 rounded text-xs border" style={{ borderColor: "var(--platform-border)", background: "var(--platform-surface)", color: "var(--platform-fg)" }}>{label}</button>
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
                  <div className="mt-6 flex justify-between">
                    <Button type="button" variant="outline" className="rounded-xl" style={{ borderColor: "var(--platform-border)" }} onClick={goPrev}>Anterior</Button>
                    <Button type="button" className="rounded-xl" style={{ background: "var(--platform-accent)", color: "var(--platform-bg)" }} onClick={goNext}>Siguiente: Avanzado</Button>
                  </div>
                </section>
              )}

              {/* Wizard B3: Avanzado (formula editor) */}
              {wizard === "B" && wizardStep === 3 && (
                <section className="rounded-xl border p-6" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg-elevated)" }}>
                  <h3 className="text-base font-semibold mb-2" style={{ color: "var(--platform-fg)" }}>Editor de fórmula avanzada</h3>
                  <p className="text-sm mb-4" style={{ color: "var(--platform-fg-muted)" }}>Fórmulas complejas con validación. Usá metric_0, metric_1… para referenciar las métricas definidas.</p>
                  <div className="rounded-lg border p-3 mb-4" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}>
                    <div className="flex flex-wrap gap-2 mb-2">
                      {FORMULA_QUICKS.map(({ label, expr }) => (
                        <button key={label} type="button" onClick={() => formMetrics[0] && setFormMetrics((prev) => prev.map((m, i) => i === 0 ? { ...m, formula: expr } : m))} className="px-2 py-1 rounded text-xs border" style={{ borderColor: "var(--platform-border)", background: "var(--platform-surface)", color: "var(--platform-fg)" }}>{label}</button>
                      ))}
                    </div>
                    <Input value={formMetrics[0]?.formula ?? ""} onChange={(e) => setFormMetrics((prev) => prev.map((m, i) => i === 0 ? { ...m, formula: e.target.value } : m))} placeholder="Ej. metric_0 / NULLIF(metric_1, 0)" className="font-mono text-sm rounded-lg w-full" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)", color: "var(--platform-fg)" }} />
                  </div>
                  <div className="flex justify-between">
                    <Button type="button" variant="outline" className="rounded-xl" style={{ borderColor: "var(--platform-border)" }} onClick={goPrev}>Anterior</Button>
                    <Button type="button" className="rounded-xl" style={{ background: "var(--platform-accent)", color: "var(--platform-bg)" }} onClick={goNext}>Siguiente: Propiedades</Button>
                  </div>
                </section>
              )}

              {/* Wizard B4: Propiedades matemáticas */}
              {wizard === "B" && wizardStep === 4 && (
                <section className="rounded-xl border p-6" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg-elevated)" }}>
                  <h3 className="text-base font-semibold mb-2" style={{ color: "var(--platform-fg)" }}>Propiedades matemáticas</h3>
                  <p className="text-sm mb-4" style={{ color: "var(--platform-fg-muted)" }}>Declara el comportamiento de la métrica. Previene agregaciones incorrectas en tablas y totales.</p>
                  <div className="grid grid-cols-3 gap-3 mb-4">
                    {(["additive", "semi", "non"] as const).map((t) => (
                      <button key={t} type="button" onClick={() => setMetricAdditivity(t)} className="p-4 rounded-xl border text-left transition-colors" style={{ borderColor: metricAdditivity === t ? "var(--platform-accent)" : "var(--platform-border)", background: metricAdditivity === t ? "var(--platform-accent-dim)" : "var(--platform-bg)" }}>
                        <span className="font-medium block" style={{ color: "var(--platform-fg)" }}>{t === "additive" ? "Aditiva" : t === "semi" ? "Semi-aditiva" : "No aditiva (ratio)"}</span>
                        <span className="text-xs" style={{ color: "var(--platform-fg-muted)" }}>{t === "additive" ? "Se suma en todos los ejes" : t === "semi" ? "Ej: stock (no suma en tiempo)" : "Ej: margen%, conversión"}</span>
                      </button>
                    ))}
                  </div>
                  <div className="flex justify-between">
                    <Button type="button" variant="outline" className="rounded-xl" style={{ borderColor: "var(--platform-border)" }} onClick={goPrev}>Anterior</Button>
                    <Button type="button" className="rounded-xl" style={{ background: "var(--platform-accent)", color: "var(--platform-bg)" }} onClick={goNext}>Siguiente: Filtros base</Button>
                  </div>
                </section>
              )}

              {/* Wizard B5: Filtros base */}
              {wizard === "B" && wizardStep === 5 && (
                <section className="rounded-xl border p-6" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg-elevated)" }}>
                  <h3 className="text-base font-semibold mb-2" style={{ color: "var(--platform-fg)" }}>Filtros base (opcional)</h3>
                  <p className="text-sm mb-4" style={{ color: "var(--platform-fg-muted)" }}>Filtros que se aplican siempre a esta métrica.</p>
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-sm font-medium" style={{ color: "var(--platform-fg-muted)" }}>Filtros</Label>
                    <Button type="button" variant="outline" size="sm" className="rounded-lg h-8 text-xs" style={{ borderColor: "var(--platform-border)", color: "var(--platform-fg)" }} onClick={() => setFormFilters((f) => [...f, { id: `f-${Date.now()}`, field: fields[0] ?? "", operator: "=", value: "" }])}>+ Añadir filtro</Button>
                  </div>
                  {formFilters.length > 0 && (
                    <div className="space-y-2">
                      {formFilters.map((f, i) => (
                        <div key={f.id} className="flex flex-wrap gap-2 items-center rounded-lg border p-2" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}>
                          <select value={f.field} onChange={(e) => setFormFilters((prev) => prev.map((ff, ii) => ii === i ? { ...ff, field: e.target.value } : ff))} className="h-8 rounded-lg border px-2 text-xs min-w-[100px] appearance-none cursor-pointer" style={{ borderColor: "var(--platform-border)", backgroundColor: "var(--platform-bg)", color: "var(--platform-fg)" }}>{fields.map((name) => (<option key={name} value={name}>{name}</option>))}</select>
                          <select value={f.operator} onChange={(e) => setFormFilters((prev) => prev.map((ff, ii) => ii === i ? { ...ff, operator: e.target.value } : ff))} className="h-8 rounded-lg border px-2 text-xs w-20 appearance-none cursor-pointer" style={{ borderColor: "var(--platform-border)", backgroundColor: "var(--platform-bg)", color: "var(--platform-fg)" }}>{["=", "!=", ">", ">=", "<", "<=", "LIKE", "ILIKE"].map((op) => (<option key={op} value={op}>{op}</option>))}</select>
                          <Input value={f.value != null ? String(f.value) : ""} onChange={(e) => setFormFilters((prev) => prev.map((ff, ii) => ii === i ? { ...ff, value: e.target.value || null } : ff))} placeholder="Valor" className="h-8 text-xs rounded-lg flex-1 min-w-[80px] !bg-[var(--platform-bg)]" style={{ borderColor: "var(--platform-border)", color: "var(--platform-fg)" }} />
                          <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-red-500 shrink-0" onClick={() => setFormFilters((prev) => prev.filter((_, ii) => ii !== i))}><Trash2 className="h-4 w-4" /></Button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="mt-6 flex justify-between">
                    <Button type="button" variant="outline" className="rounded-xl" style={{ borderColor: "var(--platform-border)" }} onClick={goPrev}>Anterior</Button>
                    <Button type="button" className="rounded-xl" style={{ background: "var(--platform-accent)", color: "var(--platform-bg)" }} onClick={goNext}>Siguiente: Preview</Button>
                  </div>
                </section>
              )}

              {/* Wizard B6: Preview métrica */}
              {wizard === "B" && wizardStep === 6 && (
                <section className="rounded-xl border p-6" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg-elevated)" }}>
                  <h3 className="text-base font-semibold mb-2" style={{ color: "var(--platform-fg)" }}>Preview de la métrica</h3>
                  <p className="text-sm mb-4" style={{ color: "var(--platform-fg-muted)" }}>Validá que el KPI se comporta como esperás antes de continuar al análisis.</p>
                  <div className="flex flex-wrap gap-2 mb-4">
                    <Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={fetchPreview} disabled={previewLoading || formMetrics.length === 0} style={{ borderColor: "var(--platform-accent)", color: "var(--platform-accent)" }}>
                      {previewLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                      Actualizar preview
                    </Button>
                  </div>
                  {previewData && previewData.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                      <div className="rounded-xl border p-4 text-center" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}>
                        <p className="text-2xl font-bold tabular-nums" style={{ color: "var(--platform-accent)" }}>{previewKpiValue ?? "—"}</p>
                        <p className="text-xs mt-1" style={{ color: "var(--platform-fg-muted)" }}>Total {formName || "métrica"}</p>
                      </div>
                      <div className="rounded-xl border p-4 col-span-2 overflow-auto max-h-[180px]" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}>
                        <table className="w-full text-xs" style={{ color: "var(--platform-fg)" }}>
                          <thead><tr style={{ borderBottom: "1px solid var(--platform-border)", color: "var(--platform-fg-muted)" }}>{previewData[0] && Object.keys(previewData[0]).map((k) => (<th key={k} className="text-left py-1 px-2">{k}</th>))}</tr></thead>
                          <tbody>{previewData.slice(0, 5).map((row, idx) => (<tr key={idx} style={{ borderBottom: "1px solid var(--platform-border)" }}>{Object.values(row).map((v, i) => (<td key={i} className="py-1 px-2">{String(v ?? "")}</td>))}</tr>))}</tbody>
                        </table>
                      </div>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <Button type="button" variant="outline" className="rounded-xl" style={{ borderColor: "var(--platform-border)" }} onClick={goPrev}>Anterior</Button>
                    <Button type="button" className="rounded-xl" style={{ background: "var(--platform-accent)", color: "var(--platform-bg)" }} onClick={goNext}>Siguiente: Análisis</Button>
                  </div>
                </section>
              )}

              {/* Wizard C0: Métricas (resumen) */}
              {wizard === "C" && wizardStep === 0 && (
                <section className="rounded-xl border p-6" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg-elevated)" }}>
                  <h3 className="text-base font-semibold mb-2" style={{ color: "var(--platform-fg)" }}>Métricas del análisis</h3>
                  <p className="text-sm mb-4" style={{ color: "var(--platform-fg-muted)" }}>Métricas que se usarán en este análisis. Definidas en el paso Métrica.</p>
                  <div className="flex flex-wrap gap-2 mb-4">
                    {formMetrics.map((m) => (
                      <span key={m.id} className="px-3 py-1.5 rounded-full text-sm" style={{ background: "var(--platform-accent-dim)", color: "var(--platform-accent)", border: "1px solid var(--platform-accent)" }}>{m.alias || m.field || "—"} ({m.func})</span>
                    ))}
                  </div>
                  <p className="text-xs mb-4" style={{ color: "var(--platform-fg-muted)" }}>Nombre del análisis: {formName || "—"}</p>
                  <div className="flex justify-between">
                    <Button type="button" variant="outline" className="rounded-xl" style={{ borderColor: "var(--platform-border)" }} onClick={goPrev}>Anterior</Button>
                    <Button type="button" className="rounded-xl" style={{ background: "var(--platform-accent)", color: "var(--platform-bg)" }} onClick={goNext}>Siguiente: Tiempo</Button>
                  </div>
                </section>
              )}

              {/* Wizard C1: Tiempo */}
              {wizard === "C" && wizardStep === 1 && (
                <section className="rounded-xl border p-6" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg-elevated)" }}>
                  <h3 className="text-base font-semibold mb-2" style={{ color: "var(--platform-fg)" }}>Tiempo: rango y granularidad</h3>
                  <p className="text-sm mb-4" style={{ color: "var(--platform-fg-muted)" }}>La granularidad está limitada por el dataset. Sin allocation strategy no se permite granularidad más fina.</p>
                  <div className="grid gap-4 sm:grid-cols-2 mb-4">
                    <div>
                      <Label className="text-sm font-medium mb-2 block" style={{ color: "var(--platform-fg-muted)" }}>Rango</Label>
                      <select value={analysisTimeRange} onChange={(e) => setAnalysisTimeRange(e.target.value)} className="w-full h-9 rounded-lg border px-3 text-sm" style={{ borderColor: "var(--platform-border)", backgroundColor: "var(--platform-bg)", color: "var(--platform-fg)" }}>
                        <option value="7">Últimos 7 días</option>
                        <option value="30">Últimos 30 días</option>
                        <option value="12">Últimos 12 meses</option>
                        <option value="24">Últimos 24 meses</option>
                      </select>
                    </div>
                    <div>
                      <Label className="text-sm font-medium mb-2 block" style={{ color: "var(--platform-fg-muted)" }}>Granularidad</Label>
                      <select value={analysisGranularity} onChange={(e) => setAnalysisGranularity(e.target.value)} className="w-full h-9 rounded-lg border px-3 text-sm" style={{ borderColor: "var(--platform-border)", backgroundColor: "var(--platform-bg)", color: "var(--platform-fg)" }}>
                        <option value="day">Día</option>
                        <option value="week">Semana</option>
                        <option value="month">Mes</option>
                        <option value="year">Año</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex justify-between">
                    <Button type="button" variant="outline" className="rounded-xl" style={{ borderColor: "var(--platform-border)" }} onClick={goPrev}>Anterior</Button>
                    <Button type="button" className="rounded-xl" style={{ background: "var(--platform-accent)", color: "var(--platform-bg)" }} onClick={goNext}>Siguiente: Dimensiones</Button>
                  </div>
                </section>
              )}

              {/* Wizard C2: Dimensiones */}
              {wizard === "C" && wizardStep === 2 && (
                <section className="rounded-xl border p-6" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg-elevated)" }}>
                  <h3 className="text-base font-semibold mb-2" style={{ color: "var(--platform-fg)" }}>Dimensiones y series</h3>
                  <p className="text-sm mb-4" style={{ color: "var(--platform-fg-muted)" }}>Las dimensiones definen el GROUP BY del resultado. Opcional para KPI total.</p>
                  <div className="space-y-4">
                    <div>
                      <Label className="text-sm font-medium mb-2 block" style={{ color: "var(--platform-fg-muted)" }}>Agrupar por (dimensión)</Label>
                      <AdminFieldSelector label="" value={formDimension} onChange={setFormDimension} etlData={etlData} fieldType="all" placeholder="Ninguna..." className="[&_button]:!rounded-lg [&_button]:!border [&_button]:!border-[var(--platform-border)] [&_button]:!bg-[var(--platform-bg)] [&_button]:!text-[var(--platform-fg)]" />
                    </div>
                    <div>
                      <Label className="text-sm font-medium mb-2 block" style={{ color: "var(--platform-fg-muted)" }}>Segunda dimensión (opcional)</Label>
                      <AdminFieldSelector label="" value={formDimension2} onChange={setFormDimension2} etlData={etlData} fieldType="all" placeholder="Ninguna..." className="[&_button]:!rounded-lg [&_button]:!border [&_button]:!border-[var(--platform-border)] [&_button]:!bg-[var(--platform-bg)] [&_button]:!text-[var(--platform-fg)]" />
                    </div>
                  </div>
                  <div className="mt-6 flex justify-between">
                    <Button type="button" variant="outline" className="rounded-xl" style={{ borderColor: "var(--platform-border)" }} onClick={goPrev}>Anterior</Button>
                    <Button type="button" className="rounded-xl" style={{ background: "var(--platform-accent)", color: "var(--platform-bg)" }} onClick={goNext}>Siguiente: Filtros</Button>
                  </div>
                </section>
              )}

              {/* Wizard C3: Filtros y orden */}
              {wizard === "C" && wizardStep === 3 && (
                <section className="rounded-xl border p-6" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg-elevated)" }}>
                  <h3 className="text-base font-semibold mb-2" style={{ color: "var(--platform-fg)" }}>Filtros del análisis y orden</h3>
                  <p className="text-sm mb-4" style={{ color: "var(--platform-fg-muted)" }}>Restringen el universo y orden del resultado. Se aplican antes de la agregación.</p>
                  <div className="rounded-xl border p-4 space-y-4 mb-4" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-sm font-medium mb-2 block" style={{ color: "var(--platform-fg-muted)" }}>Ordenar por</Label>
                        <select value={formOrderBy?.field ?? ""} onChange={(e) => setFormOrderBy((prev) => ({ field: e.target.value, direction: prev?.direction ?? "DESC" }))} className="w-full h-9 rounded-lg border px-3 text-sm" style={{ borderColor: "var(--platform-border)", backgroundColor: "var(--platform-bg)", color: "var(--platform-fg)" }}>
                          <option value="">—</option>
                          {[...(formDimension ? [formDimension] : []), ...(formDimension2 ? [formDimension2] : []), ...fields].filter(Boolean).map((f) => (<option key={f} value={f}>{f}</option>))}
                        </select>
                      </div>
                      <div>
                        <Label className="text-sm font-medium mb-2 block" style={{ color: "var(--platform-fg-muted)" }}>Sentido</Label>
                        <select value={formOrderBy?.direction ?? "DESC"} onChange={(e) => setFormOrderBy((prev) => prev ? { ...prev, direction: e.target.value as "ASC" | "DESC" } : { field: "", direction: "DESC" })} className="w-full h-9 rounded-lg border px-3 text-sm" style={{ borderColor: "var(--platform-border)", backgroundColor: "var(--platform-bg)", color: "var(--platform-fg)" }}>
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
                  <div className="flex justify-between">
                    <Button type="button" variant="outline" className="rounded-xl" style={{ borderColor: "var(--platform-border)" }} onClick={goPrev}>Anterior</Button>
                    <Button type="button" className="rounded-xl" style={{ background: "var(--platform-accent)", color: "var(--platform-bg)" }} onClick={goNext}>Siguiente: Transformaciones</Button>
                  </div>
                </section>
              )}

              {/* Wizard C4: Transformaciones */}
              {wizard === "C" && wizardStep === 4 && (
                <section className="rounded-xl border p-6" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg-elevated)" }}>
                  <h3 className="text-base font-semibold mb-2" style={{ color: "var(--platform-fg)" }}>Transformaciones BI (post-agregado)</h3>
                  <p className="text-sm mb-4" style={{ color: "var(--platform-fg-muted)" }}>Columnas derivadas sobre el resultado ya agregado. No afectan la definición del KPI.</p>
                  <div className="grid gap-4 sm:grid-cols-2 mb-4">
                    <div>
                      <Label className="text-sm font-medium mb-2 block" style={{ color: "var(--platform-fg-muted)" }}>Comparar con</Label>
                      <select value={transformCompare} onChange={(e) => setTransformCompare(e.target.value as "none" | "mom" | "yoy")} className="w-full h-9 rounded-lg border px-3 text-sm" style={{ borderColor: "var(--platform-border)", backgroundColor: "var(--platform-bg)", color: "var(--platform-fg)" }}>
                        <option value="none">Ninguno</option>
                        <option value="mom">Período anterior (MoM)</option>
                        <option value="yoy">Año anterior (YoY)</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex justify-between">
                    <Button type="button" variant="outline" className="rounded-xl" style={{ borderColor: "var(--platform-border)" }} onClick={goPrev}>Anterior</Button>
                    <Button type="button" className="rounded-xl" style={{ background: "var(--platform-accent)", color: "var(--platform-bg)" }} onClick={goNext}>Siguiente: Preview</Button>
                  </div>
                </section>
              )}

              {/* Wizard C5: Vista previa (tabla) */}
              {wizard === "C" && wizardStep === 5 && (
                <section className="rounded-xl border p-6" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg-elevated)" }}>
                  <h3 className="text-base font-semibold mb-2" style={{ color: "var(--platform-fg)" }}>Vista previa de datos</h3>
                  <p className="text-sm mb-4" style={{ color: "var(--platform-fg-muted)" }}>Datos agregados con la configuración actual (dimensión, métricas, filtros, orden y límite).</p>
                  <div className="flex flex-wrap items-center gap-2 mb-4">
                    <Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={fetchPreview} disabled={previewLoading || formMetrics.length === 0} style={{ borderColor: "var(--platform-accent)", color: "var(--platform-accent)" }}>
                      {previewLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                      Actualizar vista previa
                    </Button>
                    <Button type="button" variant="ghost" size="sm" className="rounded-xl text-xs" style={{ color: "var(--platform-fg-muted)" }} onClick={() => fetchData()} disabled={loading}>Recargar datos del ETL</Button>
                  </div>
                  {previewData && previewData.length > 0 && (
                    <div className="overflow-hidden rounded-xl border shadow-sm mb-4" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg-elevated)" }}>
                      <div className="overflow-auto max-h-[300px]">
                        <table className="w-full text-sm" style={{ color: "var(--platform-fg)" }}>
                          <thead className="sticky top-0 z-10" style={{ background: "var(--platform-surface)", borderBottom: "1px solid var(--platform-border)" }}>
                            <tr>{previewData[0] && Object.keys(previewData[0]).map((k) => (<th key={k} className="text-left px-4 py-2 font-medium whitespace-nowrap">{k}</th>))}</tr>
                          </thead>
                          <tbody style={{ background: "var(--platform-bg-elevated)" }}>
                            {previewData.map((row, idx) => (
                              <tr key={idx} className="border-b" style={{ borderColor: "var(--platform-border)" }}>
                                {Object.values(row).map((v, i) => (<td key={i} className="px-4 py-2 whitespace-nowrap">{String(v ?? "")}</td>))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <p className="text-xs px-4 py-2 border-t" style={{ borderColor: "var(--platform-border)", color: "var(--platform-fg-muted)", background: "var(--platform-surface)" }}>{previewData.length} filas</p>
                    </div>
                  )}
                  <div className="mt-6 flex justify-between">
                    <Button type="button" variant="outline" className="rounded-xl" style={{ borderColor: "var(--platform-border)" }} onClick={goPrev}>Anterior</Button>
                    <Button type="button" className="rounded-xl" style={{ background: "var(--platform-accent)", color: "var(--platform-bg)" }} onClick={goNext}>Siguiente: Gráfico</Button>
                  </div>
                </section>
              )}

              {/* Wizard D0: Tipo visual */}
              {wizard === "D" && wizardStep === 0 && (
                <section className="rounded-xl border p-6" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg-elevated)" }}>
                  <h3 className="text-base font-semibold mb-2" style={{ color: "var(--platform-fg)" }}>Tipo de visual</h3>
                  <p className="text-sm mb-4" style={{ color: "var(--platform-fg-muted)" }}>Elegí cómo ver la métrica. Se elige al usarla en el dashboard; esto es solo vista previa.</p>
                  <section className="rounded-xl border p-4 mb-4" style={{ borderColor: "var(--platform-accent-dim)", background: "var(--platform-accent-dim)" }}>
                    <div className="flex items-start gap-2">
                      <Sparkles className="h-5 w-5 shrink-0 mt-0.5" style={{ color: "var(--platform-accent)" }} />
                      <p className="text-sm" dangerouslySetInnerHTML={{ __html: recommendationText.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>") }} />
                    </div>
                  </section>
                  <div className="flex flex-wrap gap-2">
                    {CHART_TYPES.map(({ value, label, icon: Icon }) => (
                      <button key={value} type="button" onClick={() => setFormChartType(value)} className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-all" style={{ background: formChartType === value ? "var(--platform-accent)" : "var(--platform-surface-hover)", color: formChartType === value ? "var(--platform-bg)" : "var(--platform-fg-muted)" }}>
                        <Icon className="h-4 w-4" /> {label}
                      </button>
                    ))}
                  </div>
                  <div className="mt-6 flex justify-between">
                    <Button type="button" variant="outline" className="rounded-xl" style={{ borderColor: "var(--platform-border)" }} onClick={goPrev}>Anterior</Button>
                    <Button type="button" className="rounded-xl" style={{ background: "var(--platform-accent)", color: "var(--platform-bg)" }} onClick={goNext}>Siguiente: Mapeo</Button>
                  </div>
                </section>
              )}

              {/* Wizard D1: Mapeo (resumen) */}
              {wizard === "D" && wizardStep === 1 && (
                <section className="rounded-xl border p-6" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg-elevated)" }}>
                  <h3 className="text-base font-semibold mb-2" style={{ color: "var(--platform-fg)" }}>Mapeo de campos</h3>
                  <p className="text-sm mb-4" style={{ color: "var(--platform-fg-muted)" }}>Resumen: qué columnas se usan como dimensión y métricas.</p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="rounded-lg border p-3" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}>
                      <p className="text-xs font-medium uppercase mb-1" style={{ color: "var(--platform-fg-muted)" }}>Dimensión / Eje X</p>
                      <p className="font-medium" style={{ color: "var(--platform-fg)" }}>{formDimension || "— (KPI)"}</p>
                      {formDimension2 && <p className="text-sm mt-1" style={{ color: "var(--platform-fg-muted)" }}>2ª: {formDimension2}</p>}
                    </div>
                    <div className="rounded-lg border p-3" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}>
                      <p className="text-xs font-medium uppercase mb-1" style={{ color: "var(--platform-fg-muted)" }}>Métricas / Eje Y</p>
                      <p className="font-medium" style={{ color: "var(--platform-fg)" }}>{formMetrics.map((m) => m.alias || m.field || "—").join(", ") || "—"}</p>
                    </div>
                  </div>
                  <div className="mt-6 flex justify-between">
                    <Button type="button" variant="outline" className="rounded-xl" style={{ borderColor: "var(--platform-border)" }} onClick={goPrev}>Anterior</Button>
                    <Button type="button" className="rounded-xl" style={{ background: "var(--platform-accent)", color: "var(--platform-bg)" }} onClick={goNext}>Siguiente: Formato</Button>
                  </div>
                </section>
              )}

              {/* Wizard D2: Formato */}
              {wizard === "D" && wizardStep === 2 && (
                <section className="rounded-xl border p-6" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg-elevated)" }}>
                  <h3 className="text-base font-semibold mb-2" style={{ color: "var(--platform-fg)" }}>Orden, formato y etiquetas</h3>
                  <p className="text-sm mb-4" style={{ color: "var(--platform-fg-muted)" }}>Solo afecta la presentación visual. No cambia filas ni valores del análisis.</p>
                  <div className="flex items-center gap-3 mb-4">
                    <input type="checkbox" id="showDataLabels" checked={showDataLabels} onChange={(e) => setShowDataLabels(e.target.checked)} className="rounded" />
                    <label htmlFor="showDataLabels" className="text-sm" style={{ color: "var(--platform-fg)" }}>Mostrar etiquetas de datos en el gráfico</label>
                  </div>
                  <div className="flex justify-between">
                    <Button type="button" variant="outline" className="rounded-xl" style={{ borderColor: "var(--platform-border)" }} onClick={goPrev}>Anterior</Button>
                    <Button type="button" className="rounded-xl" style={{ background: "var(--platform-accent)", color: "var(--platform-bg)" }} onClick={goNext}>Siguiente: Colores</Button>
                  </div>
                </section>
              )}

              {/* Wizard D3: Colores */}
              {wizard === "D" && wizardStep === 3 && (
                <section className="rounded-xl border p-6" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg-elevated)" }}>
                  <h3 className="text-base font-semibold mb-2" style={{ color: "var(--platform-fg)" }}>Colores y reglas condicionales</h3>
                  <p className="text-sm mb-4" style={{ color: "var(--platform-fg-muted)" }}>Reglas de semáforo aplicadas en frontend. No afectan datos del análisis.</p>
                  <div className="mb-4">
                    <Label className="text-sm font-medium mb-2 block" style={{ color: "var(--platform-fg-muted)" }}>Esquema de color</Label>
                    <select value={chartColorScheme} onChange={(e) => setChartColorScheme(e.target.value)} className="w-full max-w-[200px] h-9 rounded-lg border px-3 text-sm" style={{ borderColor: "var(--platform-border)", backgroundColor: "var(--platform-bg)", color: "var(--platform-fg)" }}>
                      <option value="auto">Automático</option>
                      <option value="fixed">Fijo</option>
                      <option value="category">Por categoría</option>
                    </select>
                  </div>
                  <div className="flex justify-between">
                    <Button type="button" variant="outline" className="rounded-xl" style={{ borderColor: "var(--platform-border)" }} onClick={goPrev}>Anterior</Button>
                    <Button type="button" className="rounded-xl" style={{ background: "var(--platform-accent)", color: "var(--platform-bg)" }} onClick={goNext}>Siguiente: Interacciones</Button>
                  </div>
                </section>
              )}

              {/* Wizard D4: Interacciones */}
              {wizard === "D" && wizardStep === 4 && (
                <section className="rounded-xl border p-6" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg-elevated)" }}>
                  <h3 className="text-base font-semibold mb-2" style={{ color: "var(--platform-fg)" }}>Interacciones</h3>
                  <p className="text-sm mb-4" style={{ color: "var(--platform-fg-muted)" }}>Define el comportamiento interactivo del gráfico dentro del dashboard.</p>
                  <div className="rounded-lg border p-4 mb-4" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}>
                    <p className="text-xs" style={{ color: "var(--platform-fg-muted)" }}>Drilldown por jerarquía, tooltips y filtros cruzados se configuran al usar la métrica en el dashboard.</p>
                  </div>
                  <div className="flex justify-between">
                    <Button type="button" variant="outline" className="rounded-xl" style={{ borderColor: "var(--platform-border)" }} onClick={goPrev}>Anterior</Button>
                    <Button type="button" className="rounded-xl" style={{ background: "var(--platform-accent)", color: "var(--platform-bg)" }} onClick={goNext}>Siguiente: Guardar</Button>
                  </div>
                </section>
              )}

              {/* Wizard D5: Vista previa gráfico + Guardar */}
              {wizard === "D" && wizardStep === 5 && (
                <section className="rounded-xl border p-6 space-y-6" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg-elevated)" }}>
                  <h3 className="text-base font-semibold mb-2" style={{ color: "var(--platform-fg)" }}>Vista previa y guardar</h3>
                  <p className="text-sm mb-4" style={{ color: "var(--platform-fg-muted)" }}>Vista previa del gráfico con los datos actuales. Guardá la métrica para usarla en dashboards.</p>
                  {previewData && previewData.length > 0 && (
                    <>
                      <div className="rounded-xl border p-4 shadow-sm" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}>
                        <p className="text-sm font-medium mb-3" style={{ color: "var(--platform-fg-muted)" }}>Gráfico (vista previa)</p>
                        {formChartType === "kpi" && previewKpiValue != null && (
                          <div className="flex items-center justify-center min-h-[100px]">
                            <span className="text-3xl font-bold tabular-nums" style={{ color: "var(--platform-fg)" }}>{previewKpiValue}</span>
                          </div>
                        )}
                        {formChartType === "table" && (
                          <div className="overflow-auto max-h-[200px] text-sm">
                            <table className="w-full">
                              <thead><tr style={{ borderBottom: "1px solid var(--platform-border)", color: "var(--platform-fg-muted)" }}>{previewData[0] && Object.keys(previewData[0]).map((k) => (<th key={k} className="text-left py-2 px-3 font-medium">{k}</th>))}</tr></thead>
                              <tbody style={{ color: "var(--platform-fg)" }}>{previewData.slice(0, 5).map((row, idx) => (
                                <tr key={idx} style={{ borderBottom: "1px solid var(--platform-border)" }}>{Object.values(row).map((v, i) => (<td key={i} className="py-2 px-3">{String(v ?? "")}</td>))}</tr>
                              ))}</tbody>
                            </table>
                          </div>
                        )}
                        {previewChartConfig && formChartType !== "kpi" && formChartType !== "table" && (
                          <div className="h-[240px] w-full" style={{ color: "var(--platform-fg)" }}>
                            {formChartType === "bar" && <Bar data={previewChartConfig} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: true } }, scales: { x: { grid: { color: "var(--platform-border)" }, ticks: { color: "var(--platform-fg-muted)", maxTicksLimit: 8 } }, y: { grid: { color: "var(--platform-border)" }, ticks: { color: "var(--platform-fg-muted)" } } } }} />}
                            {formChartType === "horizontalBar" && <Bar data={previewChartConfig} options={{ indexAxis: "y" as const, responsive: true, maintainAspectRatio: false, plugins: { legend: { display: true } }, scales: { x: { grid: { color: "var(--platform-border)" }, ticks: { color: "var(--platform-fg-muted)" } }, y: { grid: { color: "var(--platform-border)" }, ticks: { color: "var(--platform-fg-muted)", maxTicksLimit: 12 } } } }} />}
                            {formChartType === "line" && <Line data={previewChartConfig} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: true } }, scales: { x: { grid: { color: "var(--platform-border)" }, ticks: { color: "var(--platform-fg-muted)", maxTicksLimit: 8 } }, y: { grid: { color: "var(--platform-border)" }, ticks: { color: "var(--platform-fg-muted)" } } } }} />}
                            {formChartType === "pie" && <Pie data={previewChartConfig} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: true, position: "right" } } }} />}
                            {formChartType === "doughnut" && <Doughnut data={previewChartConfig} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: true, position: "right" } } }} />}
                            {(formChartType === "combo" || !["bar", "horizontalBar", "line", "pie", "doughnut", "kpi", "table"].includes(formChartType)) && <Bar data={previewChartConfig} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: true } }, scales: { x: { grid: { color: "var(--platform-border)" }, ticks: { color: "var(--platform-fg-muted)", maxTicksLimit: 8 } }, y: { grid: { color: "var(--platform-border)" }, ticks: { color: "var(--platform-fg-muted)" } } } }} />}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                  <div className="flex justify-between items-center">
                    <Button type="button" variant="outline" className="rounded-xl" style={{ borderColor: "var(--platform-border)" }} onClick={goPrev}>← Anterior</Button>
                    <Button type="button" className="rounded-xl px-6 font-semibold" style={{ background: "var(--platform-accent)", color: "var(--platform-bg)" }} onClick={saveMetric} disabled={saving}>
                      {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      {editingId ? "Guardar cambios" : "Crear métrica"}
                    </Button>
                  </div>
                </section>
              )}
            </div>
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
