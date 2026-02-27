"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import type { ComponentType } from "react";
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
import { Select } from "@/components/ui/Select";
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

const CHART_TYPES: { value: string; label: string; icon: ComponentType<{ className?: string }> }[] = [
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

/** Nombres de funciones tipo Excel para autocompletado y ayuda en fórmula personalizada. */
const EXCEL_FUNCTIONS = [
  "SUM", "AVERAGE", "COUNT", "COUNTA", "MIN", "MAX", "IF", "IFERROR", "NULLIF",
  "ABS", "ROUND", "ROUNDUP", "ROUNDDOWN", "TRUNC", "MOD", "POWER", "SQRT",
  "AND", "OR", "NOT", "TRUE", "FALSE",
  "VLOOKUP", "HLOOKUP", "INDEX", "MATCH", "XLOOKUP",
  "LEFT", "RIGHT", "MID", "LEN", "CONCATENATE", "TEXT", "VALUE",
  "DATE", "TODAY", "NOW", "YEAR", "MONTH", "DAY", "EOMONTH", "DATEDIF",
  "metric_0", "metric_1", "metric_2", "metric_3",
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
    /** Periodicidad natural inferida por columna de fecha (Diaria, Semanal, Mensual, Anual, Irregular). El admin puede editarla en la UI. */
    dateColumnPeriodicity?: Record<string, string>;
    /** Sobrescrituras de periodicidad guardadas en layout (columna → Diaria|Semanal|Mensual|Anual|Irregular). */
    dateColumnPeriodicityOverrides?: Record<string, string>;
    /** Nombres para mostrar y formato por columna (desde ETL guided_config.filter.columnDisplay). */
    columnDisplay?: Record<string, { label?: string; format?: string }>;
    /** Configuración del dataset guardada en Publicar (grain, tiempo, roles, relaciones). */
    datasetConfig?: Record<string, unknown>;
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

/** Columna calculada guardada en el dataset; aparece como medida reutilizable (ej. factura = CANTIDAD * PRECIO_UNITARIO). */
export type DerivedColumn = { name: string; expression: string; defaultAggregation: string };

type ConnectionOption = { id: string; title: string; type: string };
type DatasetRelation = {
  id: string;
  connectionId: string;
  connectionTitle: string;
  tableKey: string;
  tableLabel: string;
  thisColumn: string;
  otherColumn: string;
  joinType: "INNER" | "LEFT";
};

type EtlMetricsClientProps = {
  etlId: string;
  etlTitle: string;
  connections?: ConnectionOption[];
};

export default function EtlMetricsClient({ etlId, etlTitle, connections: connectionsProp = [] }: EtlMetricsClientProps) {
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
  /** Sobrescrituras de periodicidad por columna (editable en paso Tiempo); se persisten en layout. */
  const [periodicityOverrides, setPeriodicityOverrides] = useState<Record<string, string>>({});
  const [grainOption, setGrainOption] = useState<string>("");
  /** Columnas elegidas cuando el grain es "Personalizado" (clave única = concatenación de estas columnas). */
  const [grainCustomColumns, setGrainCustomColumns] = useState<string[]>([]);
  const [columnRoles, setColumnRoles] = useState<Record<string, { role: ColumnRole; aggregation: string; label: string; visible: boolean }>>({});
  const [calcType, setCalcType] = useState<"simple" | "count" | "ratio" | "formula">("simple");
  const [metricAdditivity, setMetricAdditivity] = useState<"additive" | "semi" | "non">("additive");
  const [analysisTimeRange, setAnalysisTimeRange] = useState("12");
  const [analysisGranularity, setAnalysisGranularity] = useState("month");
  const [transformCompare, setTransformCompare] = useState<"none" | "mom" | "yoy">("none");
  const [showDataLabels, setShowDataLabels] = useState(false);
  const [chartColorScheme, setChartColorScheme] = useState("auto");
  const [metricsDistinctColumn, setMetricsDistinctColumn] = useState<string | null>(null);
  const [metricsDistinctValues, setMetricsDistinctValues] = useState<string[]>([]);
  const [metricsDistinctLoading, setMetricsDistinctLoading] = useState(false);
  const [metricsDistinctSearch, setMetricsDistinctSearch] = useState("");
  const [datasetRelations, setDatasetRelations] = useState<DatasetRelation[]>([]);
  const [relationFormConnectionId, setRelationFormConnectionId] = useState("");
  const [relationFormTableKey, setRelationFormTableKey] = useState("");
  const [relationFormThisColumn, setRelationFormThisColumn] = useState("");
  const [relationFormOtherColumn, setRelationFormOtherColumn] = useState("");
  const [relationFormJoinType, setRelationFormJoinType] = useState<"INNER" | "LEFT">("LEFT");
  const [connectionTables, setConnectionTables] = useState<{ schema: string; name: string; columns: { name: string }[] }[]>([]);
  const [connectionTablesLoading, setConnectionTablesLoading] = useState(false);
  const [otherTableColumnsLoaded, setOtherTableColumnsLoaded] = useState<string[]>([]);
  const [otherTableColumnsLoading, setOtherTableColumnsLoading] = useState(false);
  const formulaInputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const [formulaSuggestions, setFormulaSuggestions] = useState<string[]>([]);
  const [formulaSuggestionIndex, setFormulaSuggestionIndex] = useState(0);
  const [creatingColumn, setCreatingColumn] = useState(false);
  /** Columnas calculadas (ej. factura = CANTIDAD * PRECIO_UNITARIO); se guardan en dataset y aparecen como medidas. */
  const [derivedColumns, setDerivedColumns] = useState<DerivedColumn[]>([]);

  const WIZARD_STEPS: Record<"A" | "B" | "C" | "D", string[]> = {
    A: ["Profiling", "Grain", "Tiempo", "Roles BI", "Relaciones", "Publicar"],
    B: ["Identidad", "Cálculo", "Propiedades", "Filtros base", "Preview"],
    C: ["Métricas", "Tiempo", "Dimensiones", "Filtros", "Transformaciones", "Preview"],
    D: ["Tipo visual", "Mapeo", "Formato", "Colores", "Interacciones", "Guardar"],
  };

  const currentStepLabel = WIZARD_STEPS[wizard][wizardStep];
  const totalStepsInWizard = WIZARD_STEPS[wizard].length;
  const canPrev = wizard !== "A" || wizardStep > 0;
  const isLastStep = wizard === "D" && wizardStep === totalStepsInWizard - 1;
  const canNext = wizardStep < totalStepsInWizard - 1 || (wizard !== "D" || !isLastStep);
  const isGrainStep = wizard === "A" && wizardStep === 1;
  const hasValidGrain = (grainOption !== "" && grainOption !== "_custom") || (grainOption === "_custom" && grainCustomColumns.length > 0);
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
      // Pedir muestra siempre para que Profiling tenga filas/columnas (tablas en etl_output se leen con sampleRows)
      const sampleRows = opts?.sampleRows ?? 500;
      const url = `/api/etl/${etlId}/metrics-data?sampleRows=${Math.min(500, Math.max(0, sampleRows))}`;
      const res = await fetch(url);
      const json: MetricsDataResponse = await res.json();
      if (!res.ok || !json.ok || !json.data) {
        toast.error(json.data ? "Error al cargar datos" : (json as { error?: string }).error ?? "Error");
        return;
      }
      setData(json.data);
      setEtlData(buildEtlDataFromMetricsResponse(json.data));
      if (Array.isArray(json.data?.rawRows)) setRawTableData(json.data.rawRows);
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
    if (!showForm || !(data?.hasData ?? false) || rawTableData.length > 1) return;
    fetchData({ silent: true, sampleRows: 500 });
  }, [showForm, data?.hasData, rawTableData.length, fetchData]);

  useEffect(() => {
    const overrides = data?.dateColumnPeriodicityOverrides;
    if (overrides && typeof overrides === "object" && Object.keys(overrides).length >= 0)
      setPeriodicityOverrides({ ...overrides });
  }, [data?.dateColumnPeriodicityOverrides]);

  const datasetConfigHydratedRef = useRef(false);
  useEffect(() => {
    const cfg = data?.datasetConfig;
    if (!cfg || typeof cfg !== "object") return;
    if (!datasetConfigHydratedRef.current) {
      datasetConfigHydratedRef.current = true;
      if (typeof cfg.grainOption === "string" && cfg.grainOption) setGrainOption(cfg.grainOption as string);
      if (Array.isArray(cfg.grainCustomColumns)) setGrainCustomColumns(cfg.grainCustomColumns as string[]);
      if (typeof cfg.datasetHasTime === "boolean") setDatasetHasTime(cfg.datasetHasTime);
      if (typeof cfg.timeColumn === "string" && cfg.timeColumn) setTimeColumn(cfg.timeColumn);
      if (typeof cfg.periodicity === "string" && cfg.periodicity) setPeriodicity(cfg.periodicity);
      if (cfg.columnRoles && typeof cfg.columnRoles === "object") setColumnRoles(cfg.columnRoles as Record<string, { role: ColumnRole; aggregation: string; label: string; visible: boolean }>);
      if (Array.isArray(cfg.datasetRelations)) setDatasetRelations(cfg.datasetRelations as DatasetRelation[]);
    }
    if (Array.isArray((cfg as { derivedColumns?: DerivedColumn[] }).derivedColumns)) setDerivedColumns((cfg as { derivedColumns: DerivedColumn[] }).derivedColumns);
  }, [data?.datasetConfig]);

  const connectionOptions = connectionsProp.map((c) => ({ value: String(c.id), label: `${c.title || c.id} (${c.type || ""})` }));

  useEffect(() => {
    if (!relationFormConnectionId) {
      setConnectionTables([]);
      setRelationFormTableKey("");
      return;
    }
    setConnectionTablesLoading(true);
    setRelationFormTableKey("");
    fetch("/api/connection/metadata", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connectionId: relationFormConnectionId, discoverTables: true }),
    })
      .then((r) => r.json())
      .then((json) => {
        if (json?.metadata?.tables && Array.isArray(json.metadata.tables)) {
          setConnectionTables(json.metadata.tables);
        } else {
          setConnectionTables([]);
        }
      })
      .catch(() => setConnectionTables([]))
      .finally(() => setConnectionTablesLoading(false));
  }, [relationFormConnectionId]);

  const loadTableColumns = useCallback((connId: string, tableKey: string): Promise<string[]> => {
    if (!tableKey) return Promise.resolve([]);
    return fetch("/api/connection/metadata", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connectionId: connId, tableName: tableKey }),
    })
      .then((r) => r.json())
      .then((json) => {
        if (json?.metadata?.tables?.[0]?.columns) {
          return json.metadata.tables[0].columns.map((c: { name: string }) => c.name);
        }
        return [] as string[];
      })
      .catch(() => [] as string[]);
  }, []);

  useEffect(() => {
    if (!relationFormConnectionId || !relationFormTableKey) {
      setOtherTableColumnsLoaded([]);
      return;
    }
    setOtherTableColumnsLoading(true);
    loadTableColumns(relationFormConnectionId, relationFormTableKey)
      .then((cols) => setOtherTableColumnsLoaded(cols || []))
      .catch(() => setOtherTableColumnsLoaded([]))
      .finally(() => setOtherTableColumnsLoading(false));
  }, [relationFormConnectionId, relationFormTableKey, loadTableColumns]);

  const addRelation = () => {
    if (!relationFormConnectionId || !relationFormTableKey || !relationFormThisColumn || !relationFormOtherColumn) {
      toast.error("Completá conexión, tabla y ambas columnas.");
      return;
    }
    const conn = connectionsProp.find((c) => String(c.id) === relationFormConnectionId);
    const tableLabel = connectionTables.find(
      (t) => `${t.schema}.${t.name}` === relationFormTableKey || t.name === relationFormTableKey
    )
      ? `${relationFormTableKey}`
      : relationFormTableKey;
    setDatasetRelations((prev) => [
      ...prev,
      {
        id: `rel-${Date.now()}`,
        connectionId: relationFormConnectionId,
        connectionTitle: conn?.title || relationFormConnectionId,
        tableKey: relationFormTableKey,
        tableLabel,
        thisColumn: relationFormThisColumn,
        otherColumn: relationFormOtherColumn,
        joinType: relationFormJoinType,
      },
    ]);
    setRelationFormConnectionId("");
    setRelationFormTableKey("");
    setRelationFormThisColumn("");
    setRelationFormOtherColumn("");
    setRelationFormJoinType("LEFT");
    setConnectionTables([]);
    toast.success("Relación agregada");
  };

  const removeRelation = (id: string) => {
    setDatasetRelations((prev) => prev.filter((r) => r.id !== id));
  };

  // Refrescar datos del ETL al entrar al paso Profiling (Dataset) para mostrar filas/columnas actualizadas
  useEffect(() => {
    if (wizard === "A" && wizardStep === 0 && showForm) {
      fetchData({ silent: true, sampleRows: 500 });
    }
  }, [wizard, wizardStep, showForm, fetchData]);

  // Refrescar al volver a la pestaña (p. ej. después de ejecutar el ETL en otra pestaña)
  useEffect(() => {
    const onVisibility = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        fetchData({ silent: true, sampleRows: 500 });
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [fetchData]);

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

  const dateFields = data?.fields?.date ?? [];
  const getEffectivePeriodicity = (col: string) =>
    periodicityOverrides[col] ?? data?.dateColumnPeriodicity?.[col] ?? "Irregular";

  useEffect(() => {
    if (dateFields.length === 0) {
      setDatasetHasTime(false);
    } else {
      if (!timeColumn) {
        const first = dateFields[0];
        setTimeColumn(first);
        setPeriodicity(getEffectivePeriodicity(first));
      }
    }
  }, [dateFields.length, timeColumn, data?.dateColumnPeriodicity, periodicityOverrides]);

  useEffect(() => {
    if (timeColumn && dateFields.includes(timeColumn)) setPeriodicity(getEffectivePeriodicity(timeColumn));
  }, [timeColumn, periodicityOverrides, data?.dateColumnPeriodicity]);

  const savedMetrics = (data?.savedMetrics ?? []) as SavedMetricForm[];
  const hasData = data?.hasData ?? false;
  const fields = data?.fields?.all ?? [];
  /** Columnas marcadas como measure en Rol BI; usadas para fórmulas y cálculos. */
  const baseMeasureColumns = fields.filter((c) => (columnRoles[c]?.role ?? "dimension") === "measure");
  /** Medidas = columnas Rol BI measure + columnas calculadas (derivadas) para usar en fórmulas y métricas. */
  const measureColumns = useMemo(() => [...baseMeasureColumns, ...derivedColumns.map((d) => d.name)], [baseMeasureColumns, derivedColumns]);
  /** Mapa nombre → expresión para resolver una columna derivada al armar el payload. */
  const derivedColumnsByName = useMemo(() => Object.fromEntries(derivedColumns.map((d) => [d.name, d])), [derivedColumns]);
  /** Columnas del dataset para Rol BI: físicas + calculadas (las calculadas aparecen como measure por defecto). */
  const allColumnsForRoles = useMemo(() => [...fields, ...derivedColumns.map((d) => d.name)], [fields, derivedColumns]);
  /** Columnas para Profiling: físicas + calculadas (en calculadas la celda muestra "—" porque no están en rawTableData). */
  const displayColumnsForProfiling = useMemo(() => [...fields, ...derivedColumns.map((d) => d.name)], [fields, derivedColumns]);

  const dateFieldSet = new Set(data?.fields?.date ?? []);
  const numericFieldSet = new Set(data?.fields?.numeric ?? []);

  const getColumnDisplayKey = (col: string): string => {
    const cd = data?.columnDisplay;
    if (!cd) return col;
    if (cd[col] !== undefined) return col;
    const found = Object.keys(cd).find((k) => k.toLowerCase() === col.toLowerCase());
    return found ?? col;
  };

  const getSampleDisplayLabel = (col: string): string => {
    const key = getColumnDisplayKey(col);
    const label = data?.columnDisplay?.[key]?.label?.trim();
    return label || col;
  };

  /** Etiqueta para mostrar en listas de medidas: columnas base o "nombre (calculada)" si es derivada. */
  const getMeasureColumnLabel = (col: string): string =>
    derivedColumnsByName[col] ? `${col} (calculada)` : getSampleDisplayLabel(col);

  /** Para fechas ISO en UTC (ej. 2025-10-01T00:00:00.000Z) usa componentes UTC para mostrar la fecha de calendario correcta (1/10, no 30/09 en UTC-3). */
  const dateComponents = (date: Date, value: unknown): { d: number; m: number; y: number; monthIndex: number } => {
    const isIsoDateOnly =
      typeof value === "string" &&
      /^\d{4}-\d{2}-\d{2}/.test(value.trim()) &&
      (value.length === 10 || /T00:00:00(\.0*)?Z?$/i.test(value.trim()));
    if (isIsoDateOnly) {
      return { d: date.getUTCDate(), m: date.getUTCMonth() + 1, y: date.getUTCFullYear(), monthIndex: date.getUTCMonth() };
    }
    return { d: date.getDate(), m: date.getMonth() + 1, y: date.getFullYear(), monthIndex: date.getMonth() };
  };

  const formatSampleCell = (col: string, value: unknown): string => {
    if (value === null || value === undefined) return "";
    const key = getColumnDisplayKey(col);
    const format = data?.columnDisplay?.[key]?.format?.trim();
    const isDate = dateFieldSet.has(col) || [...dateFieldSet].some((f) => f.toLowerCase() === col.toLowerCase());
    const isNumber = numericFieldSet.has(col) || [...numericFieldSet].some((f) => f.toLowerCase() === col.toLowerCase());
    if (isDate && format) {
      let date: Date | null = null;
      if (value instanceof Date) date = value;
      else if (typeof value === "string") date = new Date(value);
      else if (typeof value === "number") date = value > 1e10 ? new Date(value) : new Date(1899, 11, 30 + (value | 0));
      if (date && !isNaN(date.getTime())) {
        const { d, m, y, monthIndex } = dateComponents(date, value);
        const pad = (n: number) => String(n).padStart(2, "0");
        const months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
        if (format === "DD/MM/YYYY") return `${pad(d)}/${pad(m)}/${y}`;
        if (format === "MM/DD/YYYY") return `${pad(m)}/${pad(d)}/${y}`;
        if (format === "YYYY-MM-DD") return `${y}-${pad(m)}-${pad(d)}`;
        if (format === "DD-MM-YYYY") return `${pad(d)}-${pad(m)}-${y}`;
        if (format === "DD MMM YYYY") return `${pad(d)} ${months[monthIndex]} ${y}`;
      }
    }
    if (isNumber && (typeof value === "number" || (typeof value === "string" && /^-?\d+([.,]\d+)?$/.test(String(value).trim())))) {
      const num = typeof value === "number" ? value : parseFloat(String(value).replace(",", "."));
      if (!Number.isNaN(num)) {
        if (format === "currency") return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(num);
        if (format === "percent") return new Intl.NumberFormat("es-AR", { style: "percent", minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(num / 100);
        if (format === "number") return new Intl.NumberFormat("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(num);
      }
    }
    return String(value);
  };

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
    setGrainOption("");
    setGrainCustomColumns([]);
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
      let freshDerived: { name: string; expression: string; defaultAggregation?: string }[] | null = null;
      const cfg = metricsJson?.data?.datasetConfig;
      if (Array.isArray(cfg?.derivedColumns)) freshDerived = cfg.derivedColumns as { name: string; expression: string; defaultAggregation?: string }[];
      else if (Array.isArray((cfg as { derived_columns?: { name: string; expression: string; default_aggregation?: string }[] })?.derived_columns))
        freshDerived = ((cfg as { derived_columns: { name: string; expression: string; default_aggregation?: string }[] }).derived_columns).map((d) => ({ name: d.name, expression: d.expression, defaultAggregation: d.default_aggregation || "SUM" }));
      if (!freshDerived?.length && (formMetrics.some((m) => m.field && !(m as { expression?: string }).expression) || derivedColumns.length > 0)) {
        try {
          const metricsApiRes = await fetch(`/api/etl/${etlId}/metrics`);
          const metricsApiJson = await metricsApiRes.json();
          const fromMetrics = metricsApiJson?.data?.datasetConfig?.derivedColumns;
          if (Array.isArray(fromMetrics) && fromMetrics.length > 0) freshDerived = fromMetrics as { name: string; expression: string; defaultAggregation?: string }[];
        } catch {
          // ignore
        }
      }
      const fromApi: DerivedColumn[] = (freshDerived ?? []).map((d) => ({ name: d.name, expression: d.expression, defaultAggregation: d.defaultAggregation ?? "SUM" }));
      if (fromApi.length > 0) setDerivedColumns(fromApi);
      const mergedByName = new Map<string, DerivedColumn>();
      for (const d of derivedColumns) mergedByName.set(d.name.toLowerCase(), { name: d.name, expression: d.expression, defaultAggregation: d.defaultAggregation || "SUM" });
      for (const d of fromApi) mergedByName.set(d.name.toLowerCase(), { name: d.name, expression: d.expression, defaultAggregation: d.defaultAggregation || "SUM" });
      const derivedToSend = Array.from(mergedByName.values());
      const derivedByNameForPayload = Object.fromEntries(derivedToSend.map((d) => [d.name.toLowerCase(), d]));
      const metricsPayload = formMetrics.map((m) => {
        const expr = (m as { expression?: string }).expression;
        const derived = m.field ? derivedByNameForPayload[String(m.field).trim().toLowerCase()] ?? derivedColumnsByName[m.field] : undefined;
        return {
          field: m.field || "",
          func: m.func,
          alias: m.alias || m.field || "valor",
          ...(m.condition ? { condition: m.condition } : {}),
          ...(m.formula ? { formula: m.formula } : {}),
          ...(expr ? { expression: expr } : derived ? { expression: derived.expression, func: m.func || derived.defaultAggregation } : {}),
        };
      });
      const body: Record<string, unknown> = {
        tableName,
        etlId,
        dimension: formDimension || undefined,
        dimensions: [formDimension, formDimension2].filter(Boolean).length ? [formDimension, formDimension2].filter(Boolean) : undefined,
        metrics: metricsPayload,
        filters: formFilters.length ? formFilters.map((f) => ({ field: f.field, operator: f.operator, value: f.value })) : undefined,
        orderBy: formOrderBy?.field ? formOrderBy : undefined,
        limit: formLimit ?? 100,
      };
      if (derivedToSend.length > 0) {
        body.derivedColumns = derivedToSend.map((d) => ({ name: d.name, expression: d.expression, defaultAggregation: d.defaultAggregation || "SUM" }));
      }
      const res = await fetch("/api/dashboard/aggregate-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        const msg = (json?.error ?? "Error al cargar previsualización") as string;
        toast.error(msg);
        return;
      }
      setPreviewData(Array.isArray(json) ? json : []);
    } catch (e) {
      toast.error("Error al cargar vista previa");
    } finally {
      setPreviewLoading(false);
    }
  }, [etlId, tableNameForPreview, formDimension, formDimension2, formMetrics, formFilters, formOrderBy, formLimit, fetchData, derivedColumnsByName, derivedColumns]);

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
    const metricKeys = keys.filter((k) => /^metric_\d+$/.test(k));
    const hasDimension = formDimension && keys.includes(formDimension);
    const dimKey = hasDimension ? formDimension : (metricKeys.length === keys.length ? undefined : keys[0]);
    let valueKeys = formMetrics
      .map((m) => m.alias || m.field || "")
      .filter(Boolean)
      .filter((k) => keys.includes(k));
    if (valueKeys.length === 0) valueKeys = dimKey != null ? keys.filter((k) => k !== dimKey) : keys.filter((k) => /^metric_\d+$/.test(k));
    if (valueKeys.length === 0) return null;
    const labels = dimKey != null ? previewData.map((r) => String((r as Record<string, unknown>)[dimKey] ?? "")) : previewData.map((_, i) => (i === 0 ? "Total" : ""));
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

  /** Resultado principal del cálculo (paso Cálculo): valor de la última métrica = fórmula o métrica principal. La API devuelve metric_0, metric_1, ... */
  const previewCalculationResult = useMemo(() => {
    if (!previewData || previewData.length === 0 || formMetrics.length === 0) return undefined;
    const row = previewData[0] as Record<string, unknown>;
    const lastKey = `metric_${formMetrics.length - 1}`;
    const val = row[lastKey];
    if (val != null && typeof val === "number" && !Number.isNaN(val)) return val;
    for (let i = formMetrics.length - 1; i >= 0; i--) {
      const v = row[`metric_${i}`];
      if (v != null && typeof v === "number" && !Number.isNaN(v)) return v;
    }
    return undefined;
  }, [previewData, formMetrics.length]);

  /** Encabezados para la tabla de previsualización: metric_0 → alias de la métrica (estilo Excel). */
  const previewDisplayHeaders = useMemo(() => {
    if (!previewData?.[0] || formMetrics.length === 0) return Object.keys(previewData?.[0] ?? {});
    const first = previewData[0] as Record<string, unknown>;
    return Object.keys(first).map((k) => {
      const match = k.match(/^metric_(\d+)$/);
      if (match) {
        const i = parseInt(match[1]!, 10);
        const m = formMetrics[i];
        return m ? (m.alias || m.field || k) : k;
      }
      return k;
    });
  }, [previewData, formMetrics]);

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
    let expr = (firstMetric as { expression?: string }).expression;
    const alias = (firstMetric.alias || "").trim();
    const createDerivedColumn = expr && alias && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(alias);
    let nextDerivedColumns = derivedColumns;
    if (createDerivedColumn && expr) {
      let derivedAgg = firstMetric.func || "SUM";
      const aggMatch = expr.match(/^\s*(SUM|AVG|COUNT|MIN|MAX)\s*\((.+)\)\s*$/i);
      if (aggMatch) { derivedAgg = aggMatch[1]!.toUpperCase(); expr = aggMatch[2]!.trim(); }
      nextDerivedColumns = [...derivedColumns.filter((d) => d.name !== alias), { name: alias, expression: expr, defaultAggregation: derivedAgg }];
    }
    const datasetConfigToSave = createDerivedColumn
      ? { ...(data?.datasetConfig && typeof data.datasetConfig === "object" ? (data.datasetConfig as Record<string, unknown>) : {}), derivedColumns: nextDerivedColumns }
      : undefined;

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
        body: JSON.stringify({
          savedMetrics: next,
          ...(datasetConfigToSave != null && { datasetConfig: datasetConfigToSave }),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast.error(json.error ?? "Error al guardar");
        return;
      }
      toast.success(editingId ? "Métrica actualizada" : "Métrica creada");
      if (createDerivedColumn) toast.success(`Se creó la columna «${alias}» en el dataset; la podés usar en «Insertar columna» en otras métricas.`, { duration: 6000 });
      setData((prev) => (prev ? { ...prev, savedMetrics: next, datasetConfig: datasetConfigToSave ?? prev.datasetConfig } : null));
      if (createDerivedColumn) setDerivedColumns(nextDerivedColumns);
      closeForm();
    } catch (e) {
      toast.error("Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  const createColumnFromFormula = async () => {
    const m = formMetrics[0];
    let expr = (m as { expression?: string })?.expression?.trim() ?? "";
    const alias = (m?.alias ?? "").trim();
    if (!expr) {
      toast.error("Escribí una expresión (ej. CANTIDAD * PRECIO_UNITARIO) para crear la columna.");
      return;
    }
    if (!alias) {
      toast.error("Indicá un nombre para la nueva columna (ej. factura, total_linea).");
      return;
    }
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(alias)) {
      toast.error("El nombre de la columna solo puede tener letras, números y _ (ej. factura).");
      return;
    }
    // Extraer expresión interna si viene con SUM(...), AVG(...), etc.
    let derivedAgg = (m?.func as string) || "SUM";
    const aggMatch = expr.match(/^\s*(SUM|AVG|COUNT|MIN|MAX)\s*\((.+)\)\s*$/i);
    if (aggMatch) {
      derivedAgg = aggMatch[1]!.toUpperCase();
      expr = aggMatch[2]!.trim();
    }
    const colName = alias;
    setCreatingColumn(true);
    try {
      const nextDerived = [...derivedColumns.filter((d) => d.name !== colName), { name: colName, expression: expr, defaultAggregation: derivedAgg }];
      const datasetConfigToSave = { ...(data?.datasetConfig && typeof data.datasetConfig === "object" ? (data.datasetConfig as Record<string, unknown>) : {}), derivedColumns: nextDerived };
      const res = await fetch(`/api/etl/${etlId}/metrics`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ savedMetrics: savedMetrics, datasetConfig: datasetConfigToSave }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast.error(json.error ?? "Error al crear la columna");
        return;
      }
      setDerivedColumns(nextDerived);
      setData((prev) => (prev ? { ...prev, datasetConfig: datasetConfigToSave } : null));
      setColumnRoles((prev) => ({ ...prev, [colName]: { role: "measure", aggregation: "sum", label: colName, visible: true } }));
      toast.success(`Columna «${colName}» creada. Aparece en Rol BI, Profiling e «Insertar columna».`);
    } catch {
      toast.error("Error al crear la columna");
    } finally {
      setCreatingColumn(false);
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

  const PERIODICITY_OPTIONS = [
    { value: "Diaria", label: "Diaria" },
    { value: "Semanal", label: "Semanal" },
    { value: "Mensual", label: "Mensual" },
    { value: "Anual", label: "Anual" },
    { value: "Irregular", label: "Irregular" },
  ];

  const savePeriodicityOverrides = useCallback(
    async (overrides: Record<string, string>) => {
      try {
        const res = await fetch(`/api/etl/${etlId}/metrics`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ savedMetrics: savedMetrics, dateColumnPeriodicityOverrides: overrides }),
        });
        const json = await res.json();
        if (!res.ok || !json.ok) toast.error(json.error ?? "Error al guardar periodicidad");
        else setData((prev) => (prev ? { ...prev, dateColumnPeriodicityOverrides: overrides } : null));
      } catch {
        toast.error("Error al guardar periodicidad");
      }
    },
    [etlId, savedMetrics]
  );

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
                  canNext && (
                    <Button
                      type="button"
                      size="sm"
                      className="rounded-lg"
                      style={{ background: "var(--platform-accent)", color: "var(--platform-bg)" }}
                      disabled={isGrainStep && !hasValidGrain}
                      onClick={() => {
                        if (isGrainStep && !hasValidGrain) toast.error("Elegí una columna o varias (Personalizado) como clave única para avanzar.");
                        else goNext();
                      }}
                    >
                      Siguiente
                    </Button>
                  )
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
                    <div><p className="text-xs font-medium uppercase" style={{ color: "var(--platform-fg-muted)" }}>Columnas</p><p className="font-medium" style={{ color: "var(--platform-fg)" }}>{displayColumnsForProfiling.length}</p></div>
                  </div>
                  <div className="mb-4">
                    <p className="text-xs font-medium uppercase mb-2" style={{ color: "var(--platform-fg-muted)" }}>Vista de datos (muestra)</p>
                    <div className="overflow-hidden rounded-xl border" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}>
                      <div className="overflow-auto max-h-[320px]">
                        <table className="w-full text-sm border-collapse" style={{ color: "var(--platform-fg)" }}>
                          <thead className="sticky top-0 z-10" style={{ background: "var(--platform-surface)", borderBottom: "1px solid var(--platform-border)" }}>
                            <tr>
                              {displayColumnsForProfiling.map((k) => {
                                const dc = derivedColumnsByName[k];
                                return (
                                  <th key={k} className="text-left px-3 py-2 font-medium whitespace-nowrap border-r last:border-r-0" style={{ borderColor: "var(--platform-border)", fontSize: "11px", textTransform: "uppercase", color: dc ? "var(--platform-accent)" : undefined }} title={dc ? `${k} = ${dc.expression} (${dc.defaultAggregation})` : undefined}>
                                    {getSampleDisplayLabel(k)}{dc ? <span className="font-normal ml-1 opacity-70" style={{ fontSize: "10px" }}>= {dc.expression}</span> : null}
                                  </th>
                                );
                              })}
                            </tr>
                          </thead>
                          <tbody style={{ background: "var(--platform-bg)" }}>
                            {(rawTableData.length > 0 ? rawTableData : []).map((row, idx) => {
                              const r = row as Record<string, unknown>;
                              const keys = Object.keys(r);
                              const getCell = (col: string, colIndex: number) => {
                                if (derivedColumnsByName[col]) return undefined;
                                if (r[col] !== undefined && r[col] !== null) return r[col];
                                const colNorm = col.replace(/\./g, "_").toLowerCase();
                                const key = keys.find((k) => k.replace(/\./g, "_").toLowerCase() === colNorm);
                                if (key !== undefined) return r[key];
                                if (keys.length === displayColumnsForProfiling.length && keys[colIndex] !== undefined) return r[keys[colIndex]];
                                return undefined;
                              };
                              return (
                                <tr key={idx} className="border-b last:border-b-0 hover:opacity-90" style={{ borderColor: "var(--platform-border)" }}>
                                  {displayColumnsForProfiling.map((col, colIndex) => {
                                    const dc = derivedColumnsByName[col];
                                    let formatted: string;
                                    if (dc) {
                                      try {
                                        const tokens = dc.expression.split(/([+\-*/])/).map((t: string) => t.trim()).filter(Boolean);
                                        let val = 0;
                                        let op = "+";
                                        let valid = true;
                                        for (const t of tokens) {
                                          if (["+", "-", "*", "/"].includes(t)) { op = t; continue; }
                                          const colVal = getCell(t, -1) ?? getCell(t.toLowerCase(), -1) ?? getCell(t.toUpperCase(), -1);
                                          const n = Number(colVal);
                                          if (colVal == null || isNaN(n)) { valid = false; break; }
                                          if (op === "+") val += n;
                                          else if (op === "-") val -= n;
                                          else if (op === "*") val *= n;
                                          else if (op === "/") val = n !== 0 ? val / n : 0;
                                        }
                                        formatted = valid ? val.toLocaleString(undefined, { maximumFractionDigits: 2 }) : `= ${dc.expression}`;
                                      } catch {
                                        formatted = `= ${dc.expression}`;
                                      }
                                    } else {
                                      const raw = getCell(col, colIndex);
                                      formatted = formatSampleCell(col, raw);
                                    }
                                    return (
                                      <td key={col} className="px-3 py-1.5 whitespace-nowrap border-r last:border-r-0 text-xs" style={{ borderColor: "var(--platform-border)", color: dc ? "var(--platform-accent)" : "var(--platform-fg-muted)" }} title={dc ? `${col} = ${dc.expression}` : formatted}>{formatted}</td>
                                    );
                                  })}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      <p className="text-xs px-3 py-2 border-t" style={{ borderColor: "var(--platform-border)", color: "var(--platform-fg-muted)", background: "var(--platform-surface)" }}>
                        {rawTableData.length} filas mostradas {data?.rowCount && data.rowCount > rawTableData.length ? `(de ${data.rowCount} total)` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 mb-4">
                    <Button type="button" variant="outline" size="sm" className="rounded-lg" style={{ borderColor: "var(--platform-border)" }} onClick={() => fetchData({ silent: true, sampleRows: 500 })} disabled={loading}>
                      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Recargar muestra
                    </Button>
                  </div>
                  <div className="flex justify-between">
                    <div />
                    <Button type="button" className="rounded-xl" style={{ background: "var(--platform-accent)", color: "var(--platform-bg)" }} onClick={goNext}>Siguiente: Grain</Button>
                  </div>
                </section>
              )}

              {/* Wizard A1: Grain — obligatorio */}
              {wizard === "A" && wizardStep === 1 && (() => {
                const hasValidGrain = (grainOption !== "" && grainOption !== "_custom") || (grainOption === "_custom" && grainCustomColumns.length > 0);
                return (
                <section className="rounded-xl border p-6" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg-elevated)" }}>
                  <h3 className="text-base font-semibold mb-2" style={{ color: "var(--platform-fg)" }}>Grain técnico (clave única)</h3>
                  <p className="text-sm mb-4" style={{ color: "var(--platform-fg-muted)" }}>Elegí una columna o varias (concatenadas) que identifiquen de forma única cada fila. Es obligatorio para avanzar.</p>
                  <div className="space-y-2 mb-4">
                    {fields.map((f) => (
                      <label key={f} className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors" style={{ borderColor: grainOption === f ? "var(--platform-accent)" : "var(--platform-border)", background: grainOption === f ? "var(--platform-accent-dim)" : "var(--platform-bg)" }}>
                        <input type="radio" name="grain" checked={grainOption === f} onChange={() => setGrainOption(f)} className="rounded-full" />
                        <span className="font-medium" style={{ color: "var(--platform-fg)" }}>{getSampleDisplayLabel(f)}</span>
                        <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "var(--platform-surface)", color: "var(--platform-fg-muted)" }}>1 columna</span>
                      </label>
                    ))}
                    <label className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors" style={{ borderColor: grainOption === "_custom" ? "var(--platform-accent)" : "var(--platform-border)", background: grainOption === "_custom" ? "var(--platform-accent-dim)" : "var(--platform-bg)" }}>
                      <input type="radio" name="grain" checked={grainOption === "_custom"} onChange={() => setGrainOption("_custom")} className="rounded-full" />
                      <span style={{ color: "var(--platform-fg)" }}>Personalizado — definir una o varias columnas (clave única = concatenación)</span>
                    </label>
                  </div>
                  {grainOption === "_custom" && (
                    <div className="rounded-xl border p-4 mb-4" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}>
                      <p className="text-xs font-medium mb-3" style={{ color: "var(--platform-fg-muted)" }}>Seleccioná una o más columnas para formar la clave única:</p>
                      <div className="flex flex-wrap gap-2">
                        {fields.map((col) => {
                          const checked = grainCustomColumns.includes(col);
                          return (
                            <label
                              key={col}
                              className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer transition-colors"
                              style={{ borderColor: checked ? "var(--platform-accent)" : "var(--platform-border)", background: checked ? "var(--platform-accent-dim)" : "var(--platform-surface)" }}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) => {
                                  if (e.target.checked) setGrainCustomColumns((prev) => [...prev, col]);
                                  else setGrainCustomColumns((prev) => prev.filter((c) => c !== col));
                                }}
                                className="rounded"
                              />
                              <span className="text-sm font-medium" style={{ color: "var(--platform-fg)" }}>{getSampleDisplayLabel(col)}</span>
                            </label>
                          );
                        })}
                      </div>
                      {grainCustomColumns.length > 0 && (
                        <p className="text-xs mt-2" style={{ color: "var(--platform-fg-muted)" }}>
                          Clave única = {grainCustomColumns.map(getSampleDisplayLabel).join(" + ")}
                        </p>
                      )}
                    </div>
                  )}
                  {!hasValidGrain && (grainOption === "_custom" && grainCustomColumns.length === 0) && (
                    <p className="text-sm mb-4" style={{ color: "var(--platform-fg-muted)" }}>Seleccioná al menos una columna en Personalizado para continuar.</p>
                  )}
                  <div className="flex justify-between">
                    <Button type="button" variant="outline" className="rounded-xl" style={{ borderColor: "var(--platform-border)" }} onClick={goPrev}>Anterior</Button>
                    <Button
                      type="button"
                      className="rounded-xl"
                      style={{ background: "var(--platform-accent)", color: "var(--platform-bg)" }}
                      onClick={() => { if (hasValidGrain) goNext(); else toast.error("Elegí una columna o varias (Personalizado) como clave única para avanzar."); }}
                      disabled={!hasValidGrain}
                    >
                      Siguiente: Tiempo
                    </Button>
                  </div>
                </section>
                );
              })()}

              {/* Wizard A2: Tiempo — opción de dimensión temporal y tabla de columnas fecha */}
              {wizard === "A" && wizardStep === 2 && (
                <section className="rounded-xl border p-6" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg-elevated)" }}>
                  <h3 className="text-base font-semibold mb-2" style={{ color: "var(--platform-fg)" }}>Dimensión temporal</h3>
                  <p className="text-sm mb-4" style={{ color: "var(--platform-fg-muted)" }}>Indicá si el dataset tiene dimensión temporal. Si la tiene, definí columnas de tipo fecha y su periodicidad natural.</p>
                  <label className="flex items-center gap-3 p-3 rounded-lg border mb-4 cursor-pointer transition-colors" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}>
                    <input
                      type="checkbox"
                      checked={datasetHasTime}
                      onChange={(e) => setDatasetHasTime(e.target.checked)}
                      className="rounded"
                    />
                    <span className="font-medium" style={{ color: "var(--platform-fg)" }}>Este dataset tiene dimensión temporal</span>
                  </label>
                  {datasetHasTime && (
                    <>
                      <p className="text-sm mb-2" style={{ color: "var(--platform-fg-muted)" }}>Columnas de tipo fecha y su periodicidad natural (inferida del dato).</p>
                      <div className="overflow-hidden rounded-xl border mb-4" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}>
                        <table className="w-full text-sm border-collapse">
                          <thead style={{ background: "var(--platform-surface)", borderBottom: "1px solid var(--platform-border)" }}>
                            <tr>
                              <th className="text-left px-3 py-2 font-medium" style={{ color: "var(--platform-fg-muted)", fontSize: "11px" }}>Columna temporal</th>
                              <th className="text-left px-3 py-2 font-medium" style={{ color: "var(--platform-fg-muted)", fontSize: "11px" }}>Periodicidad natural</th>
                            </tr>
                          </thead>
                          <tbody style={{ color: "var(--platform-fg)" }}>
                            {dateFields.length === 0 ? (
                              <tr>
                                <td colSpan={2} className="px-3 py-4 text-sm" style={{ color: "var(--platform-fg-muted)" }}>No hay columnas de tipo fecha en este dataset.</td>
                              </tr>
                            ) : (
                              dateFields.map((f) => {
                                const effectivePeriodicity = periodicityOverrides[f] ?? data?.dateColumnPeriodicity?.[f] ?? "Irregular";
                                return (
                                  <tr key={f} className="border-b last:border-b-0" style={{ borderColor: "var(--platform-border)" }}>
                                    <td className="px-3 py-2 font-medium" style={{ color: "var(--platform-fg)" }}>{getSampleDisplayLabel(f)}</td>
                                    <td className="px-3 py-2">
                                      <Select
                                        value={effectivePeriodicity}
                                        onChange={(val: string) => {
                                          const next = { ...periodicityOverrides, [f]: val };
                                          setPeriodicityOverrides(next);
                                          savePeriodicityOverrides(next);
                                        }}
                                        options={PERIODICITY_OPTIONS}
                                        placeholder="Periodicidad"
                                        className="min-w-[120px]"
                                        buttonClassName="h-8 text-sm rounded-lg border bg-[var(--platform-bg)]"
                                      />
                                    </td>
                                  </tr>
                                );
                              })
                            )}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                  {!datasetHasTime && (
                    <p className="text-sm mb-4" style={{ color: "var(--platform-fg-muted)" }}>Sin dimensión temporal. Podés continuar al siguiente paso.</p>
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
                        {allColumnsForRoles.map((col) => {
                          const isDerived = derivedColumnsByName[col];
                          const r = columnRoles[col] ?? { role: (isDerived ? "measure" : "dimension") as ColumnRole, aggregation: isDerived ? "sum" : "—", label: col, visible: true };
                          return (
                            <tr key={col} className="border-b last:border-b-0" style={{ borderColor: "var(--platform-border)" }}>
                              <td className="px-3 py-2 font-medium">{col}{isDerived ? <span className="text-xs ml-1" style={{ color: "var(--platform-fg-muted)" }}>(calculada)</span> : null}</td>
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

              {/* Wizard A4: Relaciones — conectar con tablas de otras conexiones */}
              {wizard === "A" && wizardStep === 4 && (
                <section className="rounded-xl border p-6" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg-elevated)" }}>
                  <h3 className="text-base font-semibold mb-2" style={{ color: "var(--platform-fg)" }}>Relaciones entre datasets (joins)</h3>
                  <p className="text-sm mb-4" style={{ color: "var(--platform-fg-muted)" }}>Opcional: definí cómo se combina este dataset con tablas de otras conexiones para análisis multi-dataset.</p>
                  <div className="rounded-lg border p-4 mb-4" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}>
                    <p className="text-xs font-medium mb-2" style={{ color: "var(--platform-fg-muted)" }}>Dataset actual</p>
                    <p className="font-medium text-sm" style={{ color: "var(--platform-fg)" }}>{etlTitle}</p>
                    <p className="text-xs mt-1" style={{ color: "var(--platform-fg-muted)" }}>{data?.schema}.{data?.tableName} · {data?.rowCount ?? 0} filas</p>
                  </div>
                  {datasetRelations.length > 0 && (
                    <div className="rounded-xl border mb-4 overflow-hidden" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}>
                      <table className="w-full text-sm border-collapse">
                        <thead style={{ background: "var(--platform-surface)", borderBottom: "1px solid var(--platform-border)" }}>
                          <tr>
                            <th className="text-left px-3 py-2 font-medium" style={{ color: "var(--platform-fg-muted)", fontSize: "11px" }}>Conexión / Tabla</th>
                            <th className="text-left px-3 py-2 font-medium" style={{ color: "var(--platform-fg-muted)", fontSize: "11px" }}>Columna este dataset</th>
                            <th className="text-left px-3 py-2 font-medium" style={{ color: "var(--platform-fg-muted)", fontSize: "11px" }}>Columna otra tabla</th>
                            <th className="text-left px-3 py-2 font-medium" style={{ color: "var(--platform-fg-muted)", fontSize: "11px" }}>Join</th>
                            <th className="w-10" />
                          </tr>
                        </thead>
                        <tbody style={{ color: "var(--platform-fg)" }}>
                          {datasetRelations.map((r) => (
                            <tr key={r.id} className="border-b last:border-b-0" style={{ borderColor: "var(--platform-border)" }}>
                              <td className="px-3 py-2">{r.connectionTitle} · {r.tableLabel}</td>
                              <td className="px-3 py-2">{getSampleDisplayLabel(r.thisColumn)}</td>
                              <td className="px-3 py-2">{r.otherColumn}</td>
                              <td className="px-3 py-2">{r.joinType}</td>
                              <td className="px-2 py-2">
                                <button type="button" onClick={() => removeRelation(r.id)} className="text-xs rounded px-2 py-1 hover:bg-red-500/10 text-red-600" aria-label="Quitar relación">Quitar</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <div className="rounded-xl border p-4 mb-4" style={{ borderColor: "var(--platform-border)", background: "var(--platform-surface)" }}>
                    <p className="text-xs font-medium mb-3" style={{ color: "var(--platform-fg-muted)" }}>Agregar relación</p>
                    <div className="flex flex-wrap items-end gap-3">
                      <div className="min-w-[180px]">
                        <Label className="text-xs block mb-1" style={{ color: "var(--platform-fg-muted)" }}>Conexión</Label>
                        <Select value={relationFormConnectionId} onChange={(v: string) => setRelationFormConnectionId(v)} options={[{ value: "", label: "Elegir conexión" }, ...connectionOptions]} placeholder="Conexión" className="text-sm" buttonClassName="h-9" disablePortal />
                      </div>
                      <div className="min-w-[160px]">
                        <Label className="text-xs block mb-1" style={{ color: "var(--platform-fg-muted)" }}>Tabla</Label>
                        <Select
                          value={relationFormTableKey}
                          onChange={(v: string) => setRelationFormTableKey(v)}
                          options={[{ value: "", label: connectionTablesLoading ? "Cargando…" : "Elegir tabla" }, ...connectionTables.map((t) => ({ value: `${t.schema}.${t.name}`, label: `${t.schema}.${t.name}` }))]}
                          placeholder="Tabla"
                          className="text-sm"
                          buttonClassName="h-9"
                          disablePortal
                        />
                      </div>
                      <div className="min-w-[140px]">
                        <Label className="text-xs block mb-1" style={{ color: "var(--platform-fg-muted)" }}>Columna (este dataset)</Label>
                        <Select value={relationFormThisColumn} onChange={(v: string) => setRelationFormThisColumn(v)} options={[{ value: "", label: "Columna" }, ...fields.map((c) => ({ value: c, label: getSampleDisplayLabel(c) }))]} placeholder="Columna" className="text-sm" buttonClassName="h-9" disablePortal />
                      </div>
                      <div className="min-w-[140px]">
                        <Label className="text-xs block mb-1" style={{ color: "var(--platform-fg-muted)" }}>Columna (otra tabla)</Label>
                        <Select value={relationFormOtherColumn} onChange={(v: string) => setRelationFormOtherColumn(v)} options={[{ value: "", label: otherTableColumnsLoading ? "Cargando…" : "Columna" }, ...otherTableColumnsLoaded.map((c) => ({ value: c, label: c }))]} placeholder="Columna" className="text-sm" buttonClassName="h-9" disablePortal />
                      </div>
                      <div className="min-w-[100px]">
                        <Label className="text-xs block mb-1" style={{ color: "var(--platform-fg-muted)" }}>Tipo join</Label>
                        <Select value={relationFormJoinType} onChange={(v: string) => setRelationFormJoinType(v as "INNER" | "LEFT")} options={[{ value: "LEFT", label: "LEFT" }, { value: "INNER", label: "INNER" }]} buttonClassName="h-9" disablePortal />
                      </div>
                      <Button type="button" variant="outline" size="sm" className="rounded-lg h-9" style={{ borderColor: "var(--platform-border)" }} onClick={addRelation}>Agregar</Button>
                    </div>
                  </div>
                  {connectionsProp.length === 0 && (
                    <p className="text-sm mb-4" style={{ color: "var(--platform-fg-muted)" }}>No hay otras conexiones disponibles. Creá conexiones en Admin para poder relacionar tablas.</p>
                  )}
                  <div className="flex justify-between">
                    <Button type="button" variant="outline" className="rounded-xl" style={{ borderColor: "var(--platform-border)" }} onClick={goPrev}>Anterior</Button>
                    <Button type="button" className="rounded-xl" style={{ background: "var(--platform-accent)", color: "var(--platform-bg)" }} onClick={goNext}>Siguiente: Publicar</Button>
                  </div>
                </section>
              )}

              {/* Wizard A5: Publicar (validación final) — resumen de todas las pestañas */}
              {wizard === "A" && wizardStep === 5 && (
                <section className="rounded-xl border p-6" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg-elevated)" }}>
                  <h3 className="text-base font-semibold mb-2" style={{ color: "var(--platform-fg)" }}>Validación final</h3>
                  <p className="text-sm mb-4" style={{ color: "var(--platform-fg-muted)" }}>Resumen de la configuración del dataset. Esta metadata quedará guardada para usar en métricas.</p>
                  <div className="space-y-4 mb-6">
                    <div className="rounded-xl border p-4" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}>
                      <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--platform-fg-muted)" }}>Origen (Profiling)</p>
                      <ul className="space-y-1.5 text-sm" style={{ color: "var(--platform-fg)" }}>
                        <li className="flex items-center gap-2"><span style={{ color: "var(--platform-accent)" }}>✓</span> Tabla: {data?.schema}.{data?.tableName}</li>
                        <li className="flex items-center gap-2"><span style={{ color: "var(--platform-accent)" }}>✓</span> Columnas: {fields.length}</li>
                      </ul>
                    </div>
                    <div className="rounded-xl border p-4" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}>
                      <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--platform-fg-muted)" }}>Grain (clave única)</p>
                      <p className="text-sm" style={{ color: "var(--platform-fg)" }}>{grainOption ? (grainOption === "_custom" ? (grainCustomColumns.length > 0 ? grainCustomColumns.map(getSampleDisplayLabel).join(" + ") : "Personalizado") : getSampleDisplayLabel(grainOption)) : "—"}</p>
                    </div>
                    <div className="rounded-xl border p-4" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}>
                      <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--platform-fg-muted)" }}>Dimensión temporal</p>
                      {datasetHasTime ? (
                        <ul className="space-y-1.5 text-sm" style={{ color: "var(--platform-fg)" }}>
                          <li className="flex items-center gap-2"><span style={{ color: "var(--platform-accent)" }}>✓</span> Sí · Columna de tiempo: {(() => { const col = timeColumn || dateFields[0]; return col ? (data?.columnDisplay?.[col]?.label?.trim() || col) : "—"; })()} · {periodicity}</li>
                          {dateFields.length > 0 && (
                            <li className="pl-5 text-xs mt-1" style={{ color: "var(--platform-fg-muted)" }}>
                              Columnas fecha: {dateFields.map((f) => `${getSampleDisplayLabel(f)} (${periodicityOverrides[f] ?? data?.dateColumnPeriodicity?.[f] ?? "Irregular"})`).join(", ")}
                            </li>
                          )}
                        </ul>
                      ) : (
                        <p className="text-sm" style={{ color: "var(--platform-fg)" }}>No (sin dimensión temporal)</p>
                      )}
                    </div>
                    <div className="rounded-xl border p-4" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}>
                      <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--platform-fg-muted)" }}>Roles BI</p>
                      <ul className="space-y-1.5 text-sm" style={{ color: "var(--platform-fg)" }}>
                        {(() => {
                          const allCols = [...new Set([...fields, ...derivedColumns.map((d) => d.name)])];
                          const keys = allCols.filter((c) => (columnRoles[c]?.role ?? "dimension") === "key");
                          const timeCols = allCols.filter((c) => (columnRoles[c]?.role ?? "dimension") === "time");
                          const dims = allCols.filter((c) => (columnRoles[c]?.role ?? "dimension") === "dimension");
                          const measures = allCols.filter((c) => (columnRoles[c]?.role ?? "dimension") === "measure");
                          return (
                            <>
                              {keys.length > 0 && <li className="flex items-center gap-2"><span style={{ color: "var(--platform-accent)" }}>✓</span> Key: {keys.map((c) => getSampleDisplayLabel(c)).join(", ")}</li>}
                              {timeCols.length > 0 && <li className="flex items-center gap-2"><span style={{ color: "var(--platform-accent)" }}>✓</span> Tiempo: {timeCols.map((c) => getSampleDisplayLabel(c)).join(", ")}</li>}
                              {dims.length > 0 && <li className="flex items-center gap-2"><span style={{ color: "var(--platform-accent)" }}>✓</span> Dimensiones: {dims.length} — {dims.slice(0, 5).map((c) => getSampleDisplayLabel(c)).join(", ")}{dims.length > 5 ? "…" : ""}</li>}
                              {measures.length > 0 && <li className="flex items-center gap-2"><span style={{ color: "var(--platform-accent)" }}>✓</span> Medidas: {measures.length} — {measures.slice(0, 5).map((c) => { const r = columnRoles[c]; const agg = r?.aggregation && r.aggregation !== "—" ? r.aggregation : "sum"; return `${getMeasureColumnLabel(c)} (${agg})`; }).join(", ")}{measures.length > 5 ? "…" : ""}</li>}
                            </>
                          );
                        })()}
                      </ul>
                    </div>
                    {derivedColumns.length > 0 && (
                      <div className="rounded-xl border p-4" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}>
                        <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--platform-fg-muted)" }}>Columnas calculadas</p>
                        <p className="text-sm mb-1.5" style={{ color: "var(--platform-fg)" }}>Creadas desde métricas con fórmula; disponibles en «Insertar columna».</p>
                        <ul className="space-y-1 text-sm" style={{ color: "var(--platform-fg)" }}>
                          {derivedColumns.map((d) => (
                            <li key={d.name} className="flex items-center gap-2"><span style={{ color: "var(--platform-accent)" }}>✓</span> <strong>{d.name}</strong> = {d.expression} ({d.defaultAggregation})</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <div className="rounded-xl border p-4" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}>
                      <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--platform-fg-muted)" }}>Relaciones (joins)</p>
                      {datasetRelations.length > 0 ? (
                        <ul className="space-y-1.5 text-sm" style={{ color: "var(--platform-fg)" }}>
                          {datasetRelations.map((r) => (
                            <li key={r.id} className="flex items-center gap-2"><span style={{ color: "var(--platform-accent)" }}>✓</span> {r.connectionTitle} · {r.tableLabel}: {getSampleDisplayLabel(r.thisColumn)} = {r.otherColumn} ({r.joinType})</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm" style={{ color: "var(--platform-fg-muted)" }}>Ninguna (solo este dataset)</p>
                      )}
                    </div>
                  </div>
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
                    <Button type="button" className="rounded-xl" style={{ background: "var(--platform-accent)", color: "var(--platform-bg)" }} onClick={goNext}>Siguiente: Cálculo</Button>
                  </div>
                </section>
              )}

              {/* Wizard B1: Cálculo (unificado: tipo + simple / conteo / ratio / fórmula personalizada) */}
              {wizard === "B" && wizardStep === 1 && (
                <section className="rounded-xl border p-6 space-y-4" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg-elevated)" }}>
                  <h3 className="text-base font-semibold mb-2" style={{ color: "var(--platform-fg)" }}>Cálculo de la métrica</h3>
                  <p className="text-sm mb-4" style={{ color: "var(--platform-fg-muted)" }}>Como en Excel: elegí la columna (medida) y la función (Suma, Promedio, Conteo, etc.). Si usás fórmula o ratio, el resultado es el valor calculado.</p>
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    {(["simple", "count", "ratio", "formula"] as const).map((t) => (
                      <button key={t} type="button" onClick={() => {
                        setCalcType(t);
                        const m0 = measureColumns[0] ?? fields[0] ?? "";
                        const m1 = measureColumns[1] ?? measureColumns[0] ?? fields[0] ?? "";
                        if (t === "ratio") {
                          const base = formMetrics.filter((m) => m.func !== "FORMULA");
                          const formulaRow = formMetrics.find((m) => m.func === "FORMULA");
                          const b0 = base[0]; const b1 = base[1];
                          setFormMetrics([
                            { id: b0?.id ?? `m-${Date.now()}`, field: b0?.field ?? m0, func: b0?.func ?? "SUM", alias: "metric_0" },
                            { id: b1?.id ?? `m-${Date.now() + 1}`, field: b1?.field ?? m1, func: b1?.func ?? "SUM", alias: "metric_1" },
                            { id: formulaRow?.id ?? `m-${Date.now() + 2}`, func: "FORMULA", formula: formulaRow?.formula ?? "metric_0 / NULLIF(metric_1, 0)", alias: formulaRow?.alias ?? "ratio", field: "" },
                          ]);
                        } else if (t === "formula") {
                          const withExpr = formMetrics.find((m) => (m as { expression?: string }).expression != null && (m as { expression?: string }).expression !== "");
                          if (!withExpr) setFormMetrics([{ id: `m-${Date.now()}`, field: "", func: "SUM", alias: "resultado", expression: "" }]);
                        }
                        if ((t === "simple" || t === "count") && formMetrics.every((m) => m.func === "FORMULA")) setFormMetrics([{ id: `m-${Date.now()}`, field: fields[0] ?? "", func: t === "count" ? "COUNT" : "SUM", alias: "total" }]);
                      }} className="p-4 rounded-xl border text-left transition-colors" style={{ borderColor: calcType === t ? "var(--platform-accent)" : "var(--platform-border)", background: calcType === t ? "var(--platform-accent-dim)" : "var(--platform-bg)" }}>
                        <span className="font-medium block" style={{ color: "var(--platform-fg)" }}>{t === "simple" ? "Agregación simple" : t === "count" ? "Conteo" : t === "ratio" ? "Ratio" : "Fórmula personalizada"}</span>
                        <span className="text-xs" style={{ color: "var(--platform-fg-muted)" }}>{t === "simple" ? "SUM, AVG, MIN, MAX por campo" : t === "count" ? "COUNT, COUNT DISTINCT" : t === "ratio" ? "A÷B, %, margen (predeterminadas)" : "Fórmulas Excel + columnas"}</span>
                      </button>
                    ))}
                  </div>

                  {/* Contenido según tipo */}
                  {(calcType === "simple" || calcType === "count") && (
                    <>
                      <div className="flex items-center justify-between mb-2">
                        <Label className="text-sm font-medium" style={{ color: "var(--platform-fg-muted)" }}>Métricas</Label>
                        <Button type="button" variant="outline" size="sm" className="rounded-lg h-8 text-xs" onClick={() => setFormMetrics((m) => [...m, { id: `m-${Date.now()}`, field: fields[0] ?? "", func: calcType === "count" ? "COUNT" : "SUM", alias: "valor" }])}>+ Añadir métrica</Button>
                      </div>
                      <div className="space-y-3">
                        {formMetrics.map((m, i) => {
                          if (m.func === "FORMULA") return null;
                          return (
                            <div key={m.id} className="rounded-xl border p-4 space-y-3" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}>
                              <div className="flex gap-2 items-center">
                                <Select value={m.func} onChange={(val: string) => setFormMetrics((prev) => prev.map((mm, ii) => ii === i ? { ...mm, func: val } : mm))} options={calcType === "count" ? AGG_FUNCS.filter((f) => f.value === "COUNT" || f.value === "COUNT(DISTINCT") : AGG_FUNCS.filter((f) => f.value !== "FORMULA" && f.value !== "COUNT" && f.value !== "COUNT(DISTINCT")} placeholder="Función" className="flex-1" buttonClassName="h-9" disablePortal />
                                {formMetrics.filter((x) => x.func !== "FORMULA").length > 1 && <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-red-500 shrink-0" onClick={() => setFormMetrics((prev) => prev.filter((_, ii) => ii !== i))}><Trash2 className="h-4 w-4" /></Button>}
                              </div>
                              <AdminFieldSelector label="Campo" value={m.field} onChange={(v: string) => setFormMetrics((prev) => prev.map((mm, ii) => ii === i ? { ...mm, field: v } : mm))} etlData={etlData} fieldType={m.func === "COUNT" || m.func === "COUNT(DISTINCT" ? "all" : "numeric"} placeholder="Campo..." className="[&_button]:!bg-[var(--platform-bg)] [&_button]:!border-[var(--platform-border)] [&_button]:!text-[var(--platform-fg)]" />
                              <div>
                                <Label className="text-xs mb-1 block" style={{ color: "var(--platform-fg-muted)" }}>Alias</Label>
                                <Input value={m.alias} onChange={(e) => setFormMetrics((prev) => prev.map((mm, ii) => ii === i ? { ...mm, alias: e.target.value } : mm))} placeholder="Ej. total_ventas" className="h-8 text-sm rounded-lg !bg-[var(--platform-bg)]" style={{ borderColor: "var(--platform-border)", color: "var(--platform-fg)" }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}

                  {calcType === "ratio" && (
                    <div className="space-y-4">
                      <p className="text-sm" style={{ color: "var(--platform-fg-muted)" }}>Definí las dos métricas base (numerador y denominador). La fórmula usa metric_0 y metric_1.</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="rounded-xl border p-3 space-y-2" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}>
                          <Label className="text-xs font-medium" style={{ color: "var(--platform-fg-muted)" }}>Numerador (metric_0)</Label>
                          <Select value={formMetrics[0]?.func ?? "SUM"} onChange={(v: string) => setFormMetrics((prev) => prev.map((m, i) => i === 0 ? { ...m, func: v } : m))} options={AGG_FUNCS.filter((f) => f.value !== "FORMULA" && f.value !== "COUNT" && f.value !== "COUNT(DISTINCT")} placeholder="Función" className="w-full" buttonClassName="h-9" disablePortal />
                          <AdminFieldSelector label="Campo" value={formMetrics[0]?.field ?? ""} onChange={(v: string) => setFormMetrics((prev) => prev.map((m, i) => i === 0 ? { ...m, field: v } : m))} etlData={etlData} fieldType="numeric" placeholder="Campo…" className="[&_button]:!bg-[var(--platform-bg)] [&_button]:!border-[var(--platform-border)] [&_button]:!text-[var(--platform-fg)]" />
                        </div>
                        <div className="rounded-xl border p-3 space-y-2" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}>
                          <Label className="text-xs font-medium" style={{ color: "var(--platform-fg-muted)" }}>Denominador (metric_1)</Label>
                          <Select value={formMetrics[1]?.func ?? "SUM"} onChange={(v: string) => setFormMetrics((prev) => prev.map((m, i) => i === 1 ? { ...m, func: v } : m))} options={AGG_FUNCS.filter((f) => f.value !== "FORMULA" && f.value !== "COUNT" && f.value !== "COUNT(DISTINCT")} placeholder="Función" className="w-full" buttonClassName="h-9" disablePortal />
                          <AdminFieldSelector label="Campo" value={formMetrics[1]?.field ?? ""} onChange={(v: string) => setFormMetrics((prev) => prev.map((m, i) => i === 1 ? { ...m, field: v } : m))} etlData={etlData} fieldType="numeric" placeholder="Campo…" className="[&_button]:!bg-[var(--platform-bg)] [&_button]:!border-[var(--platform-border)] [&_button]:!text-[var(--platform-fg)]" />
                        </div>
                      </div>
                      <div>
                        <Label className="text-sm font-medium mb-2 block" style={{ color: "var(--platform-fg-muted)" }}>Fórmula (metric_0 ÷ metric_1)</Label>
                        <div className="flex flex-wrap gap-2 mb-2">
                          {FORMULA_QUICKS.map(({ label, expr }) => (
                            <button key={label} type="button" onClick={() => { const idx = formMetrics.findIndex((m) => m.func === "FORMULA"); if (idx >= 0) setFormMetrics((prev) => prev.map((m, i) => i === idx ? { ...m, formula: expr } : m)); }} className="px-3 py-2 rounded-lg text-sm border" style={{ borderColor: "var(--platform-border)", background: "var(--platform-surface)", color: "var(--platform-fg)" }}>{label}</button>
                          ))}
                        </div>
                        <Input value={formMetrics.find((m) => m.func === "FORMULA")?.formula ?? ""} onChange={(e) => { const idx = formMetrics.findIndex((m) => m.func === "FORMULA"); if (idx >= 0) setFormMetrics((prev) => prev.map((m, i) => i === idx ? { ...m, formula: e.target.value } : m)); }} placeholder="Ej. metric_0 / NULLIF(metric_1, 0)" className="font-mono text-sm rounded-lg w-full !bg-[var(--platform-bg)]" style={{ borderColor: "var(--platform-border)", color: "var(--platform-fg)" }} />
                      </div>
                      <div>
                        <Label className="text-xs mb-1 block" style={{ color: "var(--platform-fg-muted)" }}>Alias del resultado</Label>
                        <Input value={formMetrics.find((m) => m.func === "FORMULA")?.alias ?? "ratio"} onChange={(e) => { const idx = formMetrics.findIndex((m) => m.func === "FORMULA"); if (idx >= 0) setFormMetrics((prev) => prev.map((m, i) => i === idx ? { ...m, alias: e.target.value } : m)); }} placeholder="Ej. ratio_ventas" className="h-8 text-sm rounded-lg !bg-[var(--platform-bg)]" style={{ borderColor: "var(--platform-border)", color: "var(--platform-fg)" }} />
                      </div>
                    </div>
                  )}

                  {calcType === "formula" && (() => {
                    const exprMetric = formMetrics[0];
                    const exprValue = (exprMetric as { expression?: string })?.expression ?? "";
                    return (
                    <div className="space-y-4">
                      <div>
                        <Label className="text-sm font-medium mb-2 block" style={{ color: "var(--platform-fg-muted)" }}>Fórmulas predeterminadas (estilo Excel)</Label>
                        <p className="text-xs mb-2" style={{ color: "var(--platform-fg-muted)" }}>Escribí la expresión con nombres de columnas (ej. CANTIDAD * PRECIO_UNITARIO). Usá «Insertar columna» para agregar medidas. Después elegí Suma, Promedio, etc.</p>
                        <div className="flex flex-wrap gap-2 mb-3">
                          {[" * ", " / ", " + ", " - ", " * 100 / "].map((op) => (
                            <button key={op} type="button" onClick={() => setFormMetrics((prev) => prev.map((m, i) => i === 0 ? { ...m, expression: ((m as { expression?: string }).expression ?? "") + op } : m))} className="px-2 py-1.5 rounded text-xs border font-mono" style={{ borderColor: "var(--platform-border)", background: "var(--platform-surface)", color: "var(--platform-fg)" }}>{op.trim()}</button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <Label className="text-sm font-medium mb-2 block" style={{ color: "var(--platform-fg-muted)" }}>Fórmula personalizada (columnas)</Label>
                        <div className="flex gap-2 flex-wrap items-end">
                          <div className="flex-1 min-w-[200px]">
                            <Input
                              ref={(el) => { formulaInputRef.current = el; }}
                              value={exprValue}
                              onChange={(e) => setFormMetrics((prev) => prev.map((m, i) => i === 0 ? { ...m, expression: e.target.value } : m))}
                              placeholder="Ej. CANTIDAD * PRECIO_UNITARIO"
                              className="font-mono text-sm rounded-lg w-full !bg-[var(--platform-bg)]"
                              style={{ borderColor: "var(--platform-border)", color: "var(--platform-fg)" }}
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            <Label className="text-xs" style={{ color: "var(--platform-fg-muted)" }}>Insertar columna (medidas)</Label>
                            <Select
                              value=""
                              onChange={(val: string) => {
                                if (!val) return;
                                const el = formulaInputRef.current;
                                if (el && "value" in el) {
                                  const input = el as HTMLInputElement;
                                  const cur = exprValue;
                                  const start = input.selectionStart ?? cur.length;
                                  const end = input.selectionEnd ?? cur.length;
                                  setFormMetrics((prev) => prev.map((m, i) => i === 0 ? { ...m, expression: cur.slice(0, start) + val + cur.slice(end) } : m));
                                  setTimeout(() => { input.focus(); input.setSelectionRange(start + val.length, start + val.length); }, 0);
                                }
                              }}
                              options={[{ value: "", label: "Columna…" }, ...measureColumns.map((c) => ({ value: c, label: getMeasureColumnLabel(c) }))]}
                              placeholder={measureColumns.length === 0 ? "Sin medidas (Rol BI)" : "Columna…"}
                              className="min-w-[160px]"
                              buttonClassName="h-9 text-sm"
                              disablePortal
                            />
                          </div>
                        </div>
                        <div className="rounded-lg border p-3 space-y-3" style={{ borderColor: "var(--platform-border)", background: "var(--platform-surface)" }}>
                          <Label className="text-sm font-medium block" style={{ color: "var(--platform-fg)" }}>Nombre de la nueva columna</Label>
                          <p className="text-xs mb-1" style={{ color: "var(--platform-fg-muted)" }}>Obligatorio. Solo letras, números y _. La columna aparecerá en Rol BI, Profiling, filtros, dimensiones e «Insertar columna».</p>
                          <div className="flex flex-wrap items-center gap-2">
                            <Input value={exprMetric?.alias ?? ""} onChange={(e) => setFormMetrics((prev) => prev.map((m, i) => i === 0 ? { ...m, alias: e.target.value } : m))} placeholder="Ej. factura, total_linea" className="h-9 text-sm rounded-lg w-full max-w-[200px] !bg-[var(--platform-bg)]" style={{ borderColor: "var(--platform-border)", color: "var(--platform-fg)" }} />
                            <Button type="button" className="rounded-xl" style={{ background: "var(--platform-accent)", color: "var(--platform-bg)" }} onClick={createColumnFromFormula} disabled={creatingColumn || !exprValue.trim()}>
                              {creatingColumn ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                              {creatingColumn ? " Creando…" : " Crear columna en el dataset"}
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                    );
                  })()}

                  {/* Previsualización del resultado en el paso Cálculo */}
                  <div className="mt-6 rounded-xl border p-4" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}>
                    <p className="text-sm font-medium mb-2" style={{ color: "var(--platform-fg)" }}>Previsualización del resultado</p>
                    <p className="text-xs mb-3" style={{ color: "var(--platform-fg-muted)" }}>Verificá que el cálculo devuelve el valor esperado antes de seguir.</p>
                    <div className="flex flex-wrap gap-2 mb-3">
                      <Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={fetchPreview} disabled={previewLoading || formMetrics.length === 0} style={{ borderColor: "var(--platform-accent)", color: "var(--platform-accent)" }}>
                        {previewLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                        Actualizar previsualización
                      </Button>
                    </div>
                    {previewData && previewData.length > 0 && (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="rounded-xl border p-4 text-center" style={{ borderColor: "var(--platform-border)", background: "var(--platform-surface)" }}>
                          <p className="text-2xl font-bold tabular-nums" style={{ color: "var(--platform-accent)" }}>{previewCalculationResult != null ? Number(previewCalculationResult) : "—"}</p>
                          <p className="text-xs mt-1" style={{ color: "var(--platform-fg-muted)" }}>{formMetrics.some((m) => m.func === "FORMULA") ? "Resultado de la fórmula" : "Resultado (ej. suma / promedio)"}</p>
                        </div>
                        <div className="rounded-xl border col-span-2 overflow-auto max-h-[180px]" style={{ borderColor: "var(--platform-border)", background: "var(--platform-surface)" }}>
                          <table className="w-full text-xs" style={{ color: "var(--platform-fg)" }}>
                            <thead><tr style={{ borderBottom: "1px solid var(--platform-border)", color: "var(--platform-fg-muted)" }}>{previewDisplayHeaders.map((label, i) => (<th key={i} className="text-left py-1 px-2">{label}</th>))}</tr></thead>
                            <tbody>{previewData.slice(0, 5).map((row, idx) => {
                              const raw = row as Record<string, unknown>;
                              const keys = Object.keys(raw);
                              return (<tr key={idx} style={{ borderBottom: "1px solid var(--platform-border)" }}>{keys.map((k, i) => {
                                const v = raw[k];
                                const num = typeof v === "number" && !Number.isNaN(v) ? v : v;
                                return (<td key={i} className="py-1 px-2">{typeof num === "number" ? (Number.isInteger(num) ? String(num) : Number(num).toLocaleString(undefined, { maximumFractionDigits: 4 })) : String(v ?? "")}</td>);
                              })}</tr>);
                            })}</tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex justify-between pt-2">
                    <Button type="button" variant="outline" className="rounded-xl" style={{ borderColor: "var(--platform-border)" }} onClick={goPrev}>Anterior</Button>
                    <Button type="button" className="rounded-xl" style={{ background: "var(--platform-accent)", color: "var(--platform-bg)" }} onClick={goNext}>Siguiente: Propiedades</Button>
                  </div>
                </section>
              )}

              {/* Wizard B4: Propiedades matemáticas */}
              {wizard === "B" && wizardStep === 2 && (
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
              {wizard === "B" && wizardStep === 3 && (
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
                          <Select value={f.field} onChange={(val: string) => setFormFilters((prev) => prev.map((ff, ii) => ii === i ? { ...ff, field: val } : ff))} options={allColumnsForRoles.map((name) => ({ value: name, label: derivedColumnsByName[name] ? `${name} (calculada)` : getSampleDisplayLabel(name) }))} placeholder="Campo" className="min-w-[120px]" buttonClassName="h-9 text-xs" disablePortal />
                          <Select value={f.operator} onChange={(val: string) => setFormFilters((prev) => prev.map((ff, ii) => ii === i ? { ...ff, operator: val } : ff))} options={["=", "!=", ">", ">=", "<", "<=", "LIKE", "ILIKE"].map((op) => ({ value: op, label: op }))} placeholder="Op" className="w-24" buttonClassName="h-9 text-xs" disablePortal />
                          <Input value={f.value != null ? String(f.value) : ""} onChange={(e) => setFormFilters((prev) => prev.map((ff, ii) => ii === i ? { ...ff, value: e.target.value || null } : ff))} placeholder="Valor" className="h-8 text-xs rounded-lg flex-1 min-w-[80px] !bg-[var(--platform-bg)]" style={{ borderColor: "var(--platform-border)", color: "var(--platform-fg)" }} />
                          <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-red-500 shrink-0" onClick={() => setFormFilters((prev) => prev.filter((_, ii) => ii !== i))}><Trash2 className="h-4 w-4" /></Button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="mt-6 rounded-xl border p-4 space-y-3" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}>
                    <Label className="text-sm font-medium" style={{ color: "var(--platform-fg)" }}>Ver valores de una columna</Label>
                    <p className="text-xs" style={{ color: "var(--platform-fg-muted)" }}>
                      Elegí una columna y cargá los valores que tiene la tabla. Sirve para revisar opciones al definir filtros (igual que en Columnas y filtros del ETL).
                    </p>
                    <div className="flex flex-wrap gap-2 items-center">
                      <span className="text-xs" style={{ color: "var(--platform-fg-muted)" }}>Columna</span>
                      <Select
                        value={metricsDistinctColumn ?? ""}
                        onChange={(val: string) => {
                          const col = val || null;
                          setMetricsDistinctColumn(col);
                          setMetricsDistinctValues([]);
                          setMetricsDistinctSearch("");
                        }}
                        options={[{ value: "", label: "Elegir columna" }, ...allColumnsForRoles.map((col) => ({ value: col, label: derivedColumnsByName[col] ? `${col} (calculada)` : getSampleDisplayLabel(col) }))]}
                        placeholder="Elegir columna"
                        className="min-w-[160px]"
                        disablePortal
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="rounded-lg"
                        style={{ borderColor: "var(--platform-border)" }}
                        disabled={!metricsDistinctColumn || metricsDistinctLoading}
                        onClick={async () => {
                          if (!metricsDistinctColumn) return;
                          setMetricsDistinctLoading(true);
                          setMetricsDistinctValues([]);
                          try {
                            const res = await fetch(`/api/etl/${etlId}/distinct-values?column=${encodeURIComponent(metricsDistinctColumn)}`);
                            const data = await res.json();
                            if (data.ok && Array.isArray(data.values)) setMetricsDistinctValues(data.values);
                            else toast.error(data?.error || "No se pudieron cargar los valores");
                          } catch (e: unknown) {
                            toast.error(e instanceof Error ? e.message : "Error al cargar");
                          } finally {
                            setMetricsDistinctLoading(false);
                          }
                        }}
                      >
                        {metricsDistinctLoading ? "Cargando…" : "Cargar valores"}
                      </Button>
                    </div>
                    {metricsDistinctValues.length > 0 && metricsDistinctColumn && (
                      <>
                        <input
                          type="text"
                          placeholder="Buscar valor…"
                          value={metricsDistinctSearch}
                          onChange={(e) => setMetricsDistinctSearch(e.target.value)}
                          className="w-full rounded-lg border px-3 py-2 text-sm"
                          style={{ borderColor: "var(--platform-border)", background: "var(--platform-surface)", color: "var(--platform-fg)" }}
                        />
                        <div className="max-h-48 overflow-y-auto rounded-lg border space-y-0.5 p-2" style={{ borderColor: "var(--platform-border)" }}>
                          {metricsDistinctValues
                            .filter((v) => !metricsDistinctSearch.trim() || String(v).toLowerCase().includes(metricsDistinctSearch.trim().toLowerCase()))
                            .map((val) => (
                              <div
                                key={String(val)}
                                className="py-1.5 px-2 rounded text-sm"
                                style={{ color: "var(--platform-fg)" }}
                              >
                                {String(val)}
                              </div>
                            ))}
                        </div>
                        <p className="text-xs" style={{ color: "var(--platform-fg-muted)" }}>
                          {metricsDistinctValues.length} valor{metricsDistinctValues.length !== 1 ? "es" : ""} en esta columna.
                        </p>
                      </>
                    )}
                  </div>

                  <div className="mt-6 flex justify-between">
                    <Button type="button" variant="outline" className="rounded-xl" style={{ borderColor: "var(--platform-border)" }} onClick={goPrev}>Anterior</Button>
                    <Button type="button" className="rounded-xl" style={{ background: "var(--platform-accent)", color: "var(--platform-bg)" }} onClick={goNext}>Siguiente: Preview</Button>
                  </div>
                </section>
              )}

              {/* Wizard B6: Preview métrica */}
              {wizard === "B" && wizardStep === 4 && (
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
                  <div className="rounded-xl border p-4 space-y-3 mb-4" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}>
                    <Label className="text-sm font-medium" style={{ color: "var(--platform-fg)" }}>Ver valores de una columna</Label>
                    <p className="text-xs" style={{ color: "var(--platform-fg-muted)" }}>Elegí una columna y cargá los valores para revisar opciones al definir filtros.</p>
                    <div className="flex flex-wrap gap-2 items-center">
                      <Select
                        value={metricsDistinctColumn ?? ""}
                        onChange={(val: string) => { const col = val || null; setMetricsDistinctColumn(col); setMetricsDistinctValues([]); setMetricsDistinctSearch(""); }}
                        options={[{ value: "", label: "Elegir columna" }, ...allColumnsForRoles.map((col) => ({ value: col, label: derivedColumnsByName[col] ? `${col} (calculada)` : getSampleDisplayLabel(col) }))]}
                        placeholder="Elegir columna"
                        className="min-w-[160px]"
                        disablePortal
                      />
                      <Button type="button" variant="outline" size="sm" className="rounded-lg" style={{ borderColor: "var(--platform-border)" }} disabled={!metricsDistinctColumn || metricsDistinctLoading} onClick={async () => { if (!metricsDistinctColumn) return; setMetricsDistinctLoading(true); setMetricsDistinctValues([]); try { const res = await fetch(`/api/etl/${etlId}/distinct-values?column=${encodeURIComponent(metricsDistinctColumn)}`); const data = await res.json(); if (data.ok && Array.isArray(data.values)) setMetricsDistinctValues(data.values); else toast.error(data?.error || "No se pudieron cargar los valores"); } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "Error al cargar"); } finally { setMetricsDistinctLoading(false); } }}>
                        {metricsDistinctLoading ? "Cargando…" : "Cargar valores"}
                      </Button>
                    </div>
                    {metricsDistinctValues.length > 0 && metricsDistinctColumn && (
                      <>
                        <input type="text" placeholder="Buscar valor…" value={metricsDistinctSearch} onChange={(e) => setMetricsDistinctSearch(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--platform-border)", background: "var(--platform-surface)", color: "var(--platform-fg)" }} />
                        <div className="max-h-48 overflow-y-auto rounded-lg border space-y-0.5 p-2" style={{ borderColor: "var(--platform-border)" }}>
                          {metricsDistinctValues.filter((v) => !metricsDistinctSearch.trim() || String(v).toLowerCase().includes(metricsDistinctSearch.trim().toLowerCase())).map((val) => (<div key={String(val)} className="py-1.5 px-2 rounded text-sm" style={{ color: "var(--platform-fg)" }}>{String(val)}</div>))}
                        </div>
                        <p className="text-xs" style={{ color: "var(--platform-fg-muted)" }}>{metricsDistinctValues.length} valor{metricsDistinctValues.length !== 1 ? "es" : ""} en esta columna.</p>
                      </>
                    )}
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
                    <Select
                      value={chartColorScheme}
                      onChange={setChartColorScheme}
                      options={[
                        { value: "auto", label: "Automático" },
                        { value: "fixed", label: "Fijo" },
                        { value: "category", label: "Por categoría" },
                      ]}
                      placeholder="Esquema"
                      className="max-w-[200px]"
                      disablePortal
                    />
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
