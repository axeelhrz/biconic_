"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Trash2,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  PanelLeftOpen,
  PanelLeftClose,
  PanelRightOpen,
  PanelRightClose,
  Loader2,
  MoreVertical,
  GripVertical,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  Title,
  ChartData,
} from "chart.js";
// 1. Importar el plugin de datalabels
import ChartDataLabels from "chartjs-plugin-datalabels";
import { Bar, Line, Pie, Doughnut } from "react-chartjs-2";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import AdminShareDashboardModal from "./AdminShareDashboardModal";
import { useAdminDashboardEtlData } from "@/hooks/admin/useAdminDashboardEtlData";
import AdminFieldSelector from "./AdminFieldSelector";
import AdminClientSelectionModal from "./AdminClientSelectionModal";
import { ChangeDashboardEtlDialog } from "@/components/admin/dashboard/ChangeDashboardEtlDialog";
import { DashboardTextWidget } from "@/components/dashboard/DashboardTextWidget";
import {
  SaveVersionButton,
  HistoryDialog,
} from "@/components/dashboard/DashboardVersioning";
import {
  type DashboardTheme,
  DEFAULT_DASHBOARD_THEME,
  mergeTheme,
} from "@/types/dashboard";

/** Paletas de color para el dashboard: acento, gráficos, bordes */
const PALETTE_PRESETS = [
  { id: "teal", name: "Teal", accentColor: "#2dd4bf" },
  { id: "blue", name: "Azul", accentColor: "#3b82f6" },
  { id: "violet", name: "Violeta", accentColor: "#8b5cf6" },
  { id: "emerald", name: "Esmeralda", accentColor: "#10b981" },
  { id: "amber", name: "Ámbar", accentColor: "#f59e0b" },
  { id: "rose", name: "Rosa", accentColor: "#f43f5e" },
  { id: "cyan", name: "Cian", accentColor: "#06b6d4" },
  { id: "indigo", name: "Índigo", accentColor: "#6366f1" },
] as const;

// 2. Registrar el plugin globalmente para Chart.js
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Tooltip,
  Legend,
  Title,
  ChartDataLabels // Añadir el plugin a la lista de registro
);

export type WidgetType =
  | "bar"
  | "horizontalBar"
  | "line"
  | "pie"
  | "doughnut"
  | "combo"
  | "table"
  | "kpi"
  | "filter"
  | "image"
  | "text";

type ChartJSDatasetType = "bar" | "line" | "pie" | "doughnut";

type AggregationMetricFunc =
  | "SUM"
  | "AVG"
  | "COUNT"
  | "MIN"
  | "MAX"
  | "COUNT(DISTINCT";

type AggregationMetric = {
  id: string;
  field: string;
  func: AggregationMetricFunc;
  alias: string;
  conversionType?: "none" | "multiply" | "divide";
  conversionFactor?: number;
  precision?: number;
  allowStringAsNumeric?: boolean;
  numericCast?: "none" | "numeric" | "sanitize";
};

type AggregationFilter = {
  id: string;
  field: string;
  operator: string;
  value: any;
  convertToNumber?: boolean;
  inputType?: "text" | "select" | "number" | "date";
  distinctValues?: any[];
};

type AggregationConfig = {
  enabled: boolean;
  dimension?: string;
  metrics: AggregationMetric[];
  filters?: AggregationFilter[];
  orderBy?: { field: string; direction: "ASC" | "DESC" };
  limit?: number;
};

type ChartConfig = {
  labels: string[];
  datasets: Array<{
    label: string;
    data: number[];
    backgroundColor?: string | string[];
    borderColor?: string | string[];
    borderWidth?: number;
    type?: ChartJSDatasetType;
    fill?: boolean;
  }>;
  options?: any;
};

type FilterWidgetConfig = {
  label: string;
  field: string;
  operator: string;
  inputType: "text" | "select" | "date" | "number";
};

type Widget = {
  id: string;
  type: WidgetType;
  title: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Orden en el grid (estilo Power BI). Si no existe, se usa el índice del array. */
  gridOrder?: number;
  /** Columnas que ocupa en el grid (1, 2 o 4). Vista cliente: 4 columnas; KPI=1, resto 2 o 4. */
  gridSpan?: 1 | 2 | 4;
  /** Altura mínima de la tarjeta en px (moldeable en vista cliente). */
  minHeight?: number;
  /** KPI: etiqueta secundaria (ej. "Ticket promedio"). */
  kpiSecondaryLabel?: string;
  /** KPI: valor secundario (ej. "$ 3.202"). */
  kpiSecondaryValue?: string;
  config?: ChartConfig;
  content?: string;
  filterConfig?: FilterWidgetConfig;
  autoLoad?: boolean;
  // Controla cómo se muestran las etiquetas en gráficos circulares
  labelDisplayMode?: "percent" | "value";
  source?: {
    table?: string;
    etlId?: string;
    mode?: "latest" | "byEtlId";
    labelField?: string;
    valueFields?: string[];
  };
  aggregationConfig?: AggregationConfig;
  rows?: any[];
  tableView?: {
    page: number;
    pageSize: number;
    filter: string;
  };
  // Campos disponibles en el dataset actual del widget para filtros dinámicos
  columns?: Array<{
    name: string;
    type: "string" | "number" | "boolean" | "date" | "unknown";
  }>;
  // Cache de opciones distintas por campo para selects de filtro
  facetValues?: Record<string, any[]>;
  // Si es true, este widget NO recibirá filtros globales
  excludeGlobalFilters?: boolean;
  // Color personalizado para el widget
  color?: string;
  // Configuración específica para imágenes
  imageConfig?: {
    width?: number;
    height?: number;
    objectFit?: "contain" | "cover" | "fill" | "none" | "scale-down";
  };
  isLoading?: boolean;
};

const PALETTE: { label: string; type: WidgetType }[] = [
  { label: "Gráfico de barras", type: "bar" },
  { label: "Barras horizontales", type: "horizontalBar" },
  { label: "Gráfico de líneas", type: "line" },
  { label: "Gráfico circular", type: "pie" },
  { label: "Gráfico de dona", type: "doughnut" },
  { label: "Combo (Barras + Línea)", type: "combo" },
  { label: "Tabla", type: "table" },
  { label: "KPI Card", type: "kpi" },
  { label: "Filtro / Control", type: "filter" },
  { label: "Imagen", type: "image" },
  { label: "Bloque de Texto", type: "text" },
];

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

const GRID = 16;
const snap = (v: number, grid = GRID) => Math.round(v / grid) * grid;
const DND_MIME = "application/x-biconic-widget";

interface DashboardEditorProps {
  dashboardId: string;
}

export function AdminDashboardEditor({ dashboardId }: DashboardEditorProps) {
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [widgets, setWidgets] = useState<Widget[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isClientModalOpen, setIsClientModalOpen] = useState(false);
  const [clientId, setClientId] = useState<string | null>(null);

  // Paneles como drawers: cerrados por defecto para que el grid ocupe toda la pantalla
  const [isLeftPanelOpen, setIsLeftPanelOpen] = useState(false);
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(false);
  const [isChangeEtlModalOpen, setIsChangeEtlModalOpen] = useState(false);
  // Tema de la vista cliente (colores editables)
  const [dashboardTheme, setDashboardTheme] = useState<DashboardTheme>({ ...DEFAULT_DASHBOARD_THEME });

  const selected = useMemo(
    () => widgets.find((w) => w.id === selectedId) || null,
    [widgets, selectedId]
  );

  const {
    data: etlData,
    loading: etlLoading,
    error: etlError,
    refetch: refetchEtlData,
  } = useAdminDashboardEtlData(dashboardId);

  // Estado para mostrar/ocultar el panel de filtros por tarjeta
  const [filtersOpen, setFiltersOpen] = useState<Record<string, boolean>>({});

  const toggleFilters = (id: string) =>
    setFiltersOpen((prev) => ({ ...prev, [id]: !prev[id] }));

  const setWidgetById = (id: string, patch: Partial<Widget>) => {
    setWidgets((prev) =>
      prev.map((w) => (w.id === id ? { ...w, ...patch } : w))
    );
  };

  const fetchDistinctOptions = useCallback(
    async (widgetId: string, field: string) => {
      const w = widgets.find((x) => x.id === widgetId);
      if (!w || !w.source?.table || !field) return;
      try {
        const transformVal =
          (w.filterConfig?.operator || "").toUpperCase() === "YEAR"
            ? "YEAR"
            : undefined;
        console.log(
          "[AdminDashboardEditor] fetchDistinctOptions transform:",
          transformVal
        );

        const res = await fetch("/api/dashboard/distinct-values", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tableName: w.source.table,
            field,
            limit: 200,
            order: "ASC",
            transform: transformVal,
          }),
        });
        if (!res.ok) {
          const e = await res.json().catch(() => ({}));
          throw new Error(e?.error || "No se pudieron cargar opciones");
        }
        const values = await res.json();
        setWidgets((prev) =>
          prev.map((wx) => {
            if (wx.id !== widgetId) return wx;
            const fv = { ...(wx.facetValues || {}), [field]: values };
            return { ...wx, facetValues: fv };
          })
        );
      } catch (e: any) {
        console.error("[AdminDashboardEditor] Distinct options error:", e);
        toast.error(e?.message || "Error cargando opciones del filtro");
      }
    },
    [widgets]
  );

  // Cargar diseño y filtros globales guardados cuando cambia el dashboardId
  useEffect(() => {
    let cancelled = false;
    const loadPersisted = async () => {
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from("dashboard")
          .select("layout,global_filters_config,client_id")
          .eq("id", dashboardId)
          .maybeSingle();
        if (error) throw error;
        if (!data) {
          console.debug(
            "[AdminDashboardEditor] No persisted data for dashboard",
            {
              dashboardId,
            }
          );
          return; // No tratar como error si no existe, iniciar vacío
        }
        console.debug("[AdminDashboardEditor] Loaded persisted data", {
          hasLayout: !!(data as any)?.layout,
          hasGlobalFilters: !!(data as any)?.global_filters_config,
          clientId: (data as any)?.client_id ?? null,
        });
        if (!cancelled) {
          const rawLayout = (data as any)?.layout;
          const loadedGlobalFilters = (data.global_filters_config as any) || [];
          let loadedWidgets: any[] = [];
          let loadedTheme: DashboardTheme = { ...DEFAULT_DASHBOARD_THEME };
          if (Array.isArray(rawLayout)) {
            loadedWidgets = rawLayout;
          } else if (rawLayout && typeof rawLayout === "object" && Array.isArray(rawLayout.widgets)) {
            loadedWidgets = rawLayout.widgets;
            loadedTheme = mergeTheme(rawLayout.theme);
          }
          const normalized = loadedWidgets.map((w: any, i: number) => ({
            ...w,
            gridOrder: w.gridOrder ?? i,
            gridSpan: w.gridSpan ?? (w.type === "table" ? 2 : 1),
          }));
          setWidgets(normalized);
          setDashboardTheme(loadedTheme);
          setGlobalFilters(
            Array.isArray(loadedGlobalFilters) ? loadedGlobalFilters : []
          );
          setClientId((data as any)?.client_id ?? null);
        }
      } catch (e: any) {
        console.error("[AdminDashboardEditor] Carga persistida falló:", e);
        toast.error(e?.message || "No se pudo cargar el dashboard guardado");
      }
    };
    loadPersisted();
    return () => {
      cancelled = true;
    };
  }, [dashboardId]);

  // Guardar dashboard (layout + filtros globales)
  // (definido más abajo, después de declarar globalFilters)

  const loadETLDataIntoWidget = useCallback(
    async (widgetId: string) => {
      const widget = widgets.find((w) => w.id === widgetId);
      if (!widget) return;

      setWidgets((prev) =>
        prev.map((w) => (w.id === widgetId ? { ...w, isLoading: true } : w))
      );

      const supabase = createClient();
      const etlId = etlData?.etl?.id;
      if (!etlId) {
        toast.error("No hay un ETL asociado a este dashboard");
        setWidgets((prev) =>
          prev.map((w) => (w.id === widgetId ? { ...w, isLoading: false } : w))
        );
        return;
      }

      try {
        const { data: run, error: runErr } = await supabase
          .from("etl_runs_log")
          .select("destination_schema,destination_table_name")
          .eq("etl_id", etlId)
          .eq("status", "completed")
          .order("completed_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (runErr) throw runErr;
        if (!run || !run.destination_table_name) {
          toast.warning(
            "No se encontró una ejecución completada para este ETL."
          );
          setWidgets((prev) =>
            prev.map((w) =>
              w.id === widgetId ? { ...w, isLoading: false } : w
            )
          );
          return;
        }

        const schema = run.destination_schema || "etl_output";
        const table = run.destination_table_name;
        const fullTableName = `${schema}.${table}`;

        let dataArray: any[] = [];
        const aggConfig = widget.aggregationConfig;

        if (aggConfig && aggConfig.enabled && aggConfig.metrics.length > 0) {
          toast.info("Ejecutando agregación en el backend...");

          // Preparar filtros (globales + locales) con saneamiento de operadores especiales
          const rawFilters = [
            ...(!widget.excludeGlobalFilters
              ? globalFilters.filter(
                  (f) =>
                    f.value !== "" && f.value !== null && f.value !== undefined
                )
              : []),
            ...(aggConfig.filters || []),
          ];
          const preparedFilters = rawFilters
            .filter((f) => {
              const op = (f.operator || "=").toUpperCase().trim();
              if (op === "MONTH") {
                const vRaw =
                  typeof f.value === "string" ? f.value.trim() : f.value;
                // Permitir nombres de meses en español básicos
                const monthNames: Record<string, number> = {
                  ENERO: 1,
                  FEBRERO: 2,
                  MARZO: 3,
                  ABRIL: 4,
                  MAYO: 5,
                  JUNIO: 6,
                  JULIO: 7,
                  AGOSTO: 8,
                  SEPTIEMBRE: 9,
                  SETIEMBRE: 9, // variante
                  OCTUBRE: 10,
                  NOVIEMBRE: 11,
                  DICIEMBRE: 12,
                };
                let monthNum = Number(vRaw);
                if (isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
                  if (typeof vRaw === "string" && vRaw) {
                    const upper = vRaw.toUpperCase();
                    if (monthNames[upper]) monthNum = monthNames[upper];
                  }
                }
                if (
                  !Number.isInteger(monthNum) ||
                  monthNum < 1 ||
                  monthNum > 12
                ) {
                  // Ignorar filtro inválido
                  return false;
                }
                // Mutar a número limpio
                (f as any).value = monthNum;
              } else if (op === "DAY") {
                const dayStr = String(f.value || "").trim();
                if (!/^\d{4}-\d{2}-\d{2}$/.test(dayStr)) {
                  return false; // ignorar día inválido
                }
                (f as any).value = dayStr; // normalizado
              } else if (op === "YEAR") {
                const vRaw =
                  typeof f.value === "string" ? f.value.trim() : f.value;
                const yearNum = Number(vRaw);
                if (
                  isNaN(yearNum) ||
                  !Number.isInteger(yearNum) ||
                  yearNum < 1900 ||
                  yearNum > 2100
                ) {
                  return false;
                }
                (f as any).value = yearNum;
              }
              return true;
            })
            .map((f) => ({
              ...f,
              cast: f.convertToNumber ? "numeric" : undefined,
            }));

          const response = await fetch("/api/dashboard/aggregate-data", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              tableName: fullTableName,
              dimension: aggConfig.dimension,
              metrics: aggConfig.metrics.map(({ id, ...rest }) => {
                const cast =
                  rest.numericCast && rest.numericCast !== "none"
                    ? rest.numericCast === "sanitize"
                      ? "sanitize"
                      : "numeric"
                    : undefined;
                const {
                  numericCast,
                  allowStringAsNumeric,
                  conversionType,
                  conversionFactor,
                  precision,
                  ...base
                } = rest as any;
                return { ...base, cast };
              }),
              filters: preparedFilters,
              orderBy: aggConfig.orderBy,
              limit: aggConfig.limit || 1000,
            }),
          });

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(
              errorData.error || "Falló la llamada a la API de agregación"
            );
          }

          dataArray = await response.json();

          try {
            const metricConversionMap: Record<
              string,
              {
                type: "none" | "multiply" | "divide";
                factor: number;
                precision?: number;
              }
            > = {};
            for (const m of aggConfig.metrics) {
              const alias = m.alias?.trim() || `${m.func}_${m.field}`;
              metricConversionMap[alias] = {
                type: m.conversionType || "none",
                factor:
                  typeof m.conversionFactor === "number" &&
                  !isNaN(m.conversionFactor)
                    ? m.conversionFactor
                    : 1,
                precision:
                  typeof m.precision === "number" && !isNaN(m.precision)
                    ? m.precision
                    : undefined,
              };
            }

            if (Array.isArray(dataArray) && dataArray.length > 0) {
              dataArray = dataArray.map((row: Record<string, any>) => {
                const newRow = { ...row };
                for (const [alias, cfg] of Object.entries(
                  metricConversionMap
                )) {
                  if (alias in newRow) {
                    const raw = Number(newRow[alias]);
                    let val = isNaN(raw) ? 0 : raw;
                    if (cfg.type === "multiply") {
                      val = val * (cfg.factor || 1);
                    } else if (cfg.type === "divide") {
                      const divisor = cfg.factor || 1;
                      val = divisor === 0 ? val : val / divisor;
                    }
                    if (typeof cfg.precision === "number") {
                      val = Number(val.toFixed(cfg.precision));
                    }
                    newRow[alias] = val;
                  }
                }
                return newRow;
              });
            }
          } catch (convErr) {
            console.warn(
              "No se pudo aplicar la conversión de métricas:",
              convErr
            );
          }
        } else {
          toast.info("Cargando datos en crudo (sin agregación)...");

          // Aplicar filtros también en modo sin agregación (incluye globales si procede)
          const filters = [
            ...(!widget.excludeGlobalFilters
              ? globalFilters.filter(
                  (f) =>
                    f.value !== "" && f.value !== null && f.value !== undefined
                )
              : []),
            ...(aggConfig?.filters || []),
          ];

          const preparedFilters = filters.map((f) => ({
            field: f.field,
            operator: f.operator || "=",
            value: f.value,
            cast: f.convertToNumber ? "numeric" : undefined,
          }));

          const response = await fetch("/api/dashboard/raw-data", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              tableName: fullTableName,
              filters: preparedFilters,
              limit: aggConfig?.limit || 5000,
              orderBy: aggConfig?.orderBy,
            }),
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(
              errorData?.error || "Error al cargar datos sin procesar"
            );
          }

          dataArray = await response.json();

          if (dataArray.length >= (aggConfig?.limit || 5000)) {
            toast.warning(
              `Se cargaron los primeros ${aggConfig?.limit || 5000} registros.`
            );
          }
        }

        if (dataArray.length === 0) {
          toast.warning("La consulta no devolvió datos.");
          setWidgets((prev) =>
            prev.map((w) =>
              w.id === widgetId
                ? {
                    ...w,
                    rows: [],
                    config: { labels: [], datasets: [] },
                    columns: [],
                    isLoading: false,
                  }
                : w
            )
          );
          return;
        }

        const sample = dataArray[0] || {};
        const inferType = (
          val: any
        ): "string" | "number" | "boolean" | "date" | "unknown" => {
          const t = typeof val;
          if (t === "number") return "number";
          if (t === "boolean") return "boolean";
          if (t === "string") {
            // heurística básica de fecha
            if (
              /^\d{4}-\d{2}-\d{2}/.test(val) ||
              /T\d{2}:\d{2}:\d{2}/.test(val)
            )
              return "date";
            return "string";
          }
          if (val instanceof Date) return "date";
          return "unknown";
        };
        const columnsDetected = Object.keys(sample).map((k) => ({
          name: k,
          type: inferType(sample[k]),
        }));
        let effectiveLabelField: string | undefined;
        let effectiveValueFields: string[] | undefined;

        if (aggConfig && aggConfig.enabled) {
          effectiveLabelField = aggConfig.dimension;
          effectiveValueFields = aggConfig.metrics
            .map((m) => m.alias || `${m.func}(${m.field})`) // Solución del error anterior
            .filter(Boolean);
        } else {
          effectiveLabelField = widget.source?.labelField;
          effectiveValueFields = widget.source?.valueFields;
          const keys = Object.keys(sample);
          const numericKeys = keys.filter((k) => typeof sample[k] === "number");
          const stringKeys = keys.filter((k) => typeof sample[k] === "string");
          if (!effectiveLabelField)
            effectiveLabelField = stringKeys[0] || keys[0];
          if (!effectiveValueFields || effectiveValueFields.length === 0) {
            effectiveValueFields =
              numericKeys.length > 0
                ? numericKeys
                : keys.filter((k) => k !== effectiveLabelField).slice(0, 1);
          }
        }

        if (
          !effectiveLabelField &&
          widget.type !== "kpi" &&
          widget.type !== "table"
        ) {
          toast.error("No se pudo determinar el campo de etiquetas.");
          return;
        }
        if (!effectiveValueFields || effectiveValueFields.length === 0) {
          toast.error("No se pudieron determinar los campos de valores.");
          return;
        }

        const labels = effectiveLabelField
          ? dataArray.map((row: any) =>
              String(row?.[effectiveLabelField!] ?? "")
            )
          : ["Total"];
        const palette = [
          "#10b981",
          "#06b6d4",
          "#3b82f6",
          "#f59e0b",
          "#ef4444",
          "#8b5cf6",
          "#14b8a6",
          "#0ea5e9",
          "#10b981",
          "#06b6d4",
          "#3b82f6",
          "#f59e0b",
          "#ef4444",
          "#8b5cf6",
          "#14b8a6",
          "#0ea5e9",
          "#22c55e",
        ];

        // Usar color personalizado si existe, sino usar la paleta por defecto
        const effectivePalette = widget.color
          ? [widget.color, ...palette]
          : palette;

        let config: ChartConfig | undefined;

        if (
          ["bar", "horizontalBar", "line", "pie", "doughnut", "combo"].includes(
            widget.type
          )
        ) {
          let datasets: ChartConfig["datasets"];
          if (widget.type === "combo") {
            datasets = [
              {
                label: effectiveValueFields[0] || "Barras",
                data: dataArray.map((row) =>
                  Number(row?.[effectiveValueFields![0]] ?? 0)
                ),
                backgroundColor: effectivePalette[0] + "80",
                borderColor: effectivePalette[0],
                borderWidth: 2,
                type: "bar",
              },
              {
                label: effectiveValueFields[1] || "Línea",
                data: dataArray.map((row) =>
                  Number(
                    row?.[
                      effectiveValueFields![1] || effectiveValueFields![0]
                    ] ?? 0
                  )
                ),
                backgroundColor: effectivePalette[1] + "20",
                borderColor: effectivePalette[1],
                borderWidth: 2,
                type: "line",
                fill: false,
              },
            ];
          } else {
            datasets = effectiveValueFields.map((field, i) => ({
              label: field,
              data: dataArray.map((row: any) => Number(row?.[field] ?? 0)),
              backgroundColor:
                widget.type === "pie" || widget.type === "doughnut"
                  ? labels.map(
                      (_, j) => effectivePalette[j % effectivePalette.length]
                    )
                  : effectivePalette[i % effectivePalette.length] +
                    (widget.type === "line" ? "" : "80"),
              borderColor:
                widget.type === "pie" || widget.type === "doughnut"
                  ? "#fff"
                  : effectivePalette[i % effectivePalette.length],
              borderWidth: 2,
            }));
          }
          config = { labels, datasets };
        } else if (widget.type === "kpi") {
          const valueField = effectiveValueFields[0];
          const sum = dataArray.reduce(
            (acc, row) => acc + Number(row?.[valueField] ?? 0),
            0
          );
          config = {
            labels: ["Total"],
            datasets: [{ label: valueField, data: [sum] }],
          };
        }

        setWidgets((prev) =>
          prev.map((w) =>
            w.id === widgetId
              ? {
                  ...w,
                  config,
                  rows: dataArray,
                  columns: columnsDetected,
                  source: {
                    ...w.source,
                    table: fullTableName,
                    etlId,
                    labelField: effectiveLabelField,
                    valueFields: effectiveValueFields,
                  },
                  isLoading: false,
                }
              : w
          )
        );
        toast.success(`Datos cargados para '${widget.title}'`);
      } catch (e: any) {
        console.error("[AdminDashboardEditor] Error cargando datos:", e);
        toast.error(e?.message || "Error al cargar o procesar los datos.");
        setWidgets((prev) =>
          prev.map((w) => (w.id === widgetId ? { ...w, isLoading: false } : w))
        );
      }
    },
    [widgets, etlData]
  );

  // ============================= Filtros Globales =============================
  type GlobalFilter = AggregationFilter; // Reutilizamos la misma estructura
  const [globalFilters, setGlobalFilters] = useState<GlobalFilter[]>([]);
  const [globalDialogOpen, setGlobalDialogOpen] = useState(false);
  const addGlobalFilter = () => {
    const newFilter: GlobalFilter = {
      id: `gf-${Date.now()}`,
      field:
        selected?.columns?.[0]?.name ||
        selected?.aggregationConfig?.dimension ||
        "",
      operator: "=",
      value: "",
      convertToNumber: false,
      inputType: "text",
    };
    setGlobalFilters((prev) => [...prev, newFilter]);
  };
  const updateGlobalFilter = (
    filterId: string,
    patch: Partial<GlobalFilter>
  ) => {
    setGlobalFilters((prev) =>
      prev.map((f) => (f.id === filterId ? { ...f, ...patch } : f))
    );
  };
  const removeGlobalFilter = (filterId: string) => {
    setGlobalFilters((prev) => prev.filter((f) => f.id !== filterId));
  };
  const clearAllGlobalFilters = () => {
    setGlobalFilters([]);
  };
  const applyGlobalFilters = () => {
    // Recargar todos los widgets que no están excluidos
    widgets.forEach((w) => {
      loadETLDataIntoWidget(w.id);
    });
    toast.success("Filtros globales aplicados");
  };
  // Guardar dashboard (layout + filtros globales)
  const handleSaveDashboard = useCallback(
    async (overrideClientId?: string) => {
      // 1. Si no tenemos cliente asignado (ni en estado ni pasado), abrir modal
      if (!clientId && !overrideClientId) {
        setIsClientModalOpen(true);
        return;
      }

      const targetClientId = overrideClientId || clientId;

      setIsSaving(true);
      try {
        // Limpiar widgets de propiedades transitorias
        const cleanWidgets = widgets.map(
          ({ rows, config, columns, facetValues, ...rest }) => rest
        );

        const supabase = createClient();
        // Guardar tema en layout para la vista cliente (colores editables)
        const layoutToSave = {
          widgets: cleanWidgets,
          theme: dashboardTheme,
        };
        const updatePayload: any = {
          layout: layoutToSave as any,
          global_filters_config: globalFilters as any,
        };

        // Si estamos asignando cliente por primera vez (o reasignando via override)
        if (targetClientId) {
          updatePayload.client_id = targetClientId;
        }

        const { error } = await supabase
          .from("dashboard")
          .update(updatePayload)
          .eq("id", dashboardId);

        if (error) throw error;

        // Actualizar estado local si cambió
        if (targetClientId && targetClientId !== clientId) {
          setClientId(targetClientId);
        }

        toast.success("Dashboard guardado correctamente");
      } catch (e: any) {
        console.error("[AdminDashboardEditor] Guardado falló:", e);
        toast.error(e?.message || "No se pudo guardar el dashboard");
      } finally {
        setIsSaving(false);
      }
    },
    [widgets, globalFilters, dashboardId, clientId, dashboardTheme]
  );
  // Mantener referencia de widgets para usar en efectos sin depender del array
  const widgetsRef = useRef<Widget[]>([]);
  useEffect(() => {
    widgetsRef.current = widgets;
  }, [widgets]);

  // Cargar datos automáticamente la primera vez que haya widgets (p. ej., desde persistencia)
  const initialDataLoadRef = useRef(false);
  useEffect(() => {
    if (!initialDataLoadRef.current && widgets.length > 0 && etlData) {
      initialDataLoadRef.current = true;
      widgets.forEach((w) => loadETLDataIntoWidget(w.id));
    }
  }, [widgets, etlData, loadETLDataIntoWidget]);

  // Centrar el lienzo en torno a los widgets al cargar el layout por primera vez
  const centeredOnceRef = useRef(false);
  const centerCanvasToWidgets = useCallback(() => {
    if (!canvasRef.current || widgets.length === 0) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const minX = Math.min(...widgets.map((w) => w.x));
    const minY = Math.min(...widgets.map((w) => w.y));
    const maxX = Math.max(...widgets.map((w) => w.x + w.w));
    const maxY = Math.max(...widgets.map((w) => w.y + w.h));
    const bboxW = Math.max(1, maxX - minX);
    const bboxH = Math.max(1, maxY - minY);
    const targetZoom = 1; // usar zoom inicial para centrado por defecto
    const newPanX = rect.width / 2 - (minX + bboxW / 2) * targetZoom;
    const newPanY = rect.height / 2 - (minY + bboxH / 2) * targetZoom;
    setPan({ x: Math.round(newPanX), y: Math.round(newPanY) });
  }, [canvasRef, widgets]);
  useEffect(() => {
    if (!centeredOnceRef.current && widgets.length > 0) {
      centeredOnceRef.current = true;
      centerCanvasToWidgets();
    }
  }, [widgets, centerCanvasToWidgets]);

  // Recargar automáticamente los widgets cuando cambien los filtros globales desde el modal (debounced)
  useEffect(() => {
    // Solo auto-actualizar mientras el modal está abierto para evitar recargas inesperadas
    if (!globalDialogOpen) return;
    const handle = setTimeout(() => {
      const list = widgetsRef.current;
      if (!list || list.length === 0) return;
      list.forEach((w) => {
        loadETLDataIntoWidget(w.id);
      });
    }, 600);
    return () => clearTimeout(handle);
  }, [globalFilters, globalDialogOpen, loadETLDataIntoWidget]);

  // Auto-cargar valores distintos cuando inputType cambia a "select"
  useEffect(() => {
    const loadDistinctForGlobalFilters = async () => {
      if (!etlData || globalFilters.length === 0) return;

      // Obtener el nombre real de la tabla desde etl_runs_log
      const etlId = etlData?.etl?.id;
      if (!etlId) return;

      const supabase = createClient();
      const { data: run, error: runErr } = await supabase
        .from("etl_runs_log")
        .select("destination_schema,destination_table_name")
        .eq("etl_id", etlId)
        .eq("status", "completed")
        .order("completed_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (runErr || !run || !run.destination_table_name) return;

      const schema = run.destination_schema || "etl_output";
      const actualTableName = run.destination_table_name;
      const fullTableName = `${schema}.${actualTableName}`;

      for (const f of globalFilters) {
        const isYear = (f.operator || "").toUpperCase() === "YEAR";
        const hasValues =
          !!(f as any).distinctValues && (f as any).distinctValues.length > 0;
        let shouldLoad = false;

        if ((f as any).inputType === "select" && f.field) {
          if (!hasValues) {
            shouldLoad = true;
          } else if (isYear) {
            const firstVal = String((f as any).distinctValues[0]);
            if (firstVal.includes("-") || firstVal.includes("/")) {
              shouldLoad = true;
            }
          }
        }

        if (shouldLoad) {
          try {
            const transformVal =
              (f.operator || "").toUpperCase() === "YEAR" ? "YEAR" : undefined;
            console.log(
              "[AdminDashboardEditor] loadDistinctForGlobalFilters transform:",
              transformVal
            );

            const res = await fetch("/api/dashboard/distinct-values", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                tableName: fullTableName,
                field: f.field,
                limit: 200,
                order: "ASC",
                transform: transformVal,
              }),
            });
            if (res.ok) {
              const values = await res.json();
              setGlobalFilters((prev) =>
                prev.map((gf) =>
                  gf.id === f.id ? { ...gf, distinctValues: values } : gf
                )
              );
            }
          } catch (e) {
            console.error(
              "[AdminDashboardEditor] Error loading distinct values:",
              e
            );
          }
        }
      }
    };
    loadDistinctForGlobalFilters();
  }, [globalFilters, etlData]);
  // ============================================================================

  // Estado de zoom y DnD/resize del lienzo y widgets
  // ============================= Zoom & Pan =============================
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const isCtrlPressedRef = useRef(false);
  const panningStateRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    origPanX: number;
    origPanY: number;
  }>({ active: false, startX: 0, startY: 0, origPanX: 0, origPanY: 0 });

  const clampZoom = (z: number) => clamp(z, 0.3, 2);

  const setZoomAt = useCallback(
    (targetZoom: number, screenX: number, screenY: number) => {
      if (!canvasRef.current) return;
      setZoom((prev) => {
        const z0 = prev;
        const z1 = clampZoom(targetZoom);
        setPan((prevPan) => {
          const worldX = (screenX - prevPan.x) / z0;
          const worldY = (screenY - prevPan.y) / z0;
          const newPanX = screenX - worldX * z1;
          const newPanY = screenY - worldY * z1;
          return { x: newPanX, y: newPanY };
        });
        return z1;
      });
    },
    []
  );

  // Wheel zoom (Ctrl/Cmd + rueda) y desplazamiento para pan
  const onCanvasWheel = (e: React.WheelEvent) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      setZoomAt(zoom * factor, e.clientX - rect.left, e.clientY - rect.top);
    } else {
      // Scroll normal => pan del lienzo
      e.preventDefault();
      setPan((prev) => ({ x: prev.x - e.deltaX, y: prev.y - e.deltaY }));
    }
  };

  // Soporte para Ctrl + drag para pan y atajos de teclado
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Control") {
        if (!isCtrlPressedRef.current) {
          isCtrlPressedRef.current = true;
          document.body.classList.add("cursor-grab");
        }
      }
      // Atajos de zoom
      if ((e.ctrlKey || e.metaKey) && (e.key === "+" || e.key === "=")) {
        e.preventDefault();
        const rect = canvasRef.current?.getBoundingClientRect();
        if (rect) setZoomAt(zoom * 1.1, rect.width / 2, rect.height / 2);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "-") {
        e.preventDefault();
        const rect = canvasRef.current?.getBoundingClientRect();
        if (rect) setZoomAt(zoom * 0.9, rect.width / 2, rect.height / 2);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "0") {
        e.preventDefault();
        setZoom(1);
        setPan({ x: 0, y: 0 });
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Control") {
        isCtrlPressedRef.current = false;
        document.body.classList.remove("cursor-grab");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [zoom, setZoomAt]);
  // ======================================================================
  const dragState = useRef<{
    id: string | null;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  }>({ id: null, startX: 0, startY: 0, origX: 0, origY: 0 });
  const resizeState = useRef<{
    id: string | null;
    startX: number;
    startY: number;
    origW: number;
    origH: number;
    origX: number;
    origY: number;
    handle: "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw" | null;
  }>({
    id: null,
    startX: 0,
    startY: 0,
    origW: 0,
    origH: 0,
    origX: 0,
    origY: 0,
    handle: null,
  });

  const onPaletteDragStart = (e: React.DragEvent, type: WidgetType) => {
    e.dataTransfer.setData(DND_MIME, JSON.stringify({ type }));
    e.dataTransfer.effectAllowed = "copy";
  };
  const onCanvasDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes(DND_MIME)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    }
  };
  const onGridDrop = (e: React.DragEvent) => {
    const payload = e.dataTransfer.getData(DND_MIME);
    if (!payload) return;
    e.preventDefault();
    const { type } = JSON.parse(payload);
    const id = `${type}-${Date.now()}`;
    const gridSpan: 1 | 2 | 4 = type === "kpi" ? 1 : type === "table" ? 2 : 2;
    const { w, h } =
      type === "table"
        ? { w: 520, h: 260 }
        : type === "kpi"
        ? { w: 260, h: 140 }
        : type === "image"
        ? { w: 200, h: 200 }
        : type === "text"
        ? { w: 300, h: 150 }
        : { w: 520, h: 260 };
    setWidgets((prev) => {
      const order = prev.length;
      const newWidget: Widget = {
        id,
        type,
        title: type.toUpperCase(),
        x: 0,
        y: 0,
        w: snap(w),
        h: snap(h),
        gridOrder: order,
        gridSpan,
        labelDisplayMode:
          type === "pie" || type === "doughnut" ? "percent" : undefined,
        aggregationConfig: { enabled: false, metrics: [] },
      };
      return [...prev, newWidget];
    });
    setSelectedId(id);
    if (etlData) {
      setTimeout(() => loadETLDataIntoWidget(id), 100);
    }
  };

  const moveWidgetOrder = (widgetId: string, direction: "up" | "down") => {
    setWidgets((prev) => {
      const idx = prev.findIndex((w) => w.id === widgetId);
      if (idx < 0) return prev;
      if (direction === "up" && idx === 0) return prev;
      if (direction === "down" && idx === prev.length - 1) return prev;
      const next = [...prev];
      const swapIdx = direction === "up" ? idx - 1 : idx + 1;
      [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
      return next.map((w, i) => ({ ...w, gridOrder: i }));
    });
  };
  const startDragWidget = (id: string, e: React.PointerEvent) => {
    // Si Ctrl está presionado, no iniciamos drag del widget; permitimos pan del lienzo
    if (isCtrlPressedRef.current || e.ctrlKey || e.button === 1) {
      return; // Dejar que el evento burbujee hasta el lienzo
    }
    e.stopPropagation();
    const w = widgets.find((w) => w.id === id);
    if (!w || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    dragState.current = {
      id,
      startX: (e.clientX - rect.left - pan.x) / zoom,
      startY: (e.clientY - rect.top - pan.y) / zoom,
      origX: w.x,
      origY: w.y,
    };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  // Pointer down para iniciar pan si Ctrl está presionado o botón central
  const onCanvasPointerDown = (e: React.PointerEvent) => {
    if (!canvasRef.current) return;
    if (isCtrlPressedRef.current || e.ctrlKey || e.button === 1) {
      const rect = canvasRef.current.getBoundingClientRect();
      panningStateRef.current = {
        active: true,
        startX: e.clientX - rect.left,
        startY: e.clientY - rect.top,
        origPanX: pan.x,
        origPanY: pan.y,
      };
      (e.target as Element).setPointerCapture?.(e.pointerId);
      e.preventDefault();
    }
  };
  const onCanvasPointerMove = (e: React.PointerEvent) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    // Si estamos paneando el lienzo
    if (panningStateRef.current.active) {
      const currentX = e.clientX - rect.left;
      const currentY = e.clientY - rect.top;
      const dx = currentX - panningStateRef.current.startX;
      const dy = currentY - panningStateRef.current.startY;
      setPan({
        x: panningStateRef.current.origPanX + dx,
        y: panningStateRef.current.origPanY + dy,
      });
      return; // No procesar drag/resize de widgets mientras paneamos
    }
    const cx = (e.clientX - rect.left - pan.x) / zoom;
    const cy = (e.clientY - rect.top - pan.y) / zoom;
    const dx =
      cx -
      (dragState.current.id
        ? dragState.current.startX
        : resizeState.current.startX);
    const dy =
      cy -
      (dragState.current.id
        ? dragState.current.startY
        : resizeState.current.startY);
    if (dragState.current.id) {
      setWidgets((prev) =>
        prev.map((w) =>
          w.id === dragState.current!.id
            ? {
                ...w,
                x: snap(dragState.current!.origX + dx),
                y: snap(dragState.current!.origY + dy),
              }
            : w
        )
      );
    } else if (resizeState.current.id) {
      const handle = resizeState.current.handle;
      setWidgets((prev) =>
        prev.map((w) => {
          if (w.id !== resizeState.current!.id) return w;
          let { x: nx, y: ny, w: nw, h: nh } = w;
          const {
            origX: ox,
            origY: oy,
            origW: ow,
            origH: oh,
          } = resizeState.current;
          if (handle?.includes("e")) nw = ow + dx;
          if (handle?.includes("s")) nh = oh + dy;
          if (handle?.includes("w")) {
            nw = ow - dx;
            nx = ox + dx;
          }
          if (handle?.includes("n")) {
            nh = oh - dy;
            ny = oy + dy;
          }
          return {
            ...w,
            x: snap(nx),
            y: snap(ny),
            w: snap(clamp(nw, 120, 2000)),
            h: snap(clamp(nh, 80, 2000)),
          };
        })
      );
    }
  };
  const onCanvasPointerUp = () => {
    dragState.current.id = null;
    resizeState.current.id = null;
    if (panningStateRef.current.active) {
      panningStateRef.current.active = false;
    }
  };
  const updateSelected = (patch: Partial<Widget>) => {
    if (!selected) return;
    setWidgets((prev) =>
      prev.map((w) => (w.id === selected.id ? { ...w, ...patch } : w))
    );
  };

  // (Modal para filtros globales se renderiza dentro del panel izquierdo)

  const addFilter = (widgetId: string) => {
    const w = widgets.find((x) => x.id === widgetId);
    if (!w) return;
    const current = w.aggregationConfig || {
      enabled: false,
      metrics: [],
      filters: [] as AggregationFilter[],
    };
    const newFilter: AggregationFilter = {
      id: `f-${Date.now()}`,
      field: w.columns?.[0]?.name || "",
      operator: "=",
      value: "",
      convertToNumber: false,
    };
    setWidgetById(widgetId, {
      aggregationConfig: {
        ...current,
        filters: [...(current.filters || []), newFilter],
      },
    });
  };

  const updateFilter = (
    widgetId: string,
    filterId: string,
    patch: Partial<AggregationFilter>
  ) => {
    setWidgets((prev) =>
      prev.map((w) => {
        if (w.id !== widgetId) return w;
        const cfg = w.aggregationConfig || {
          enabled: false,
          metrics: [],
          filters: [] as AggregationFilter[],
        };
        const filters = (cfg.filters || []).map((f) =>
          f.id === filterId ? { ...f, ...patch } : f
        );
        return { ...w, aggregationConfig: { ...cfg, filters } };
      })
    );
  };

  const removeFilter = (widgetId: string, filterId: string) => {
    setWidgets((prev) =>
      prev.map((w) => {
        if (w.id !== widgetId) return w;
        const cfg = w.aggregationConfig || {
          enabled: false,
          metrics: [],
          filters: [] as AggregationFilter[],
        };
        const filters = (cfg.filters || []).filter((f) => f.id !== filterId);
        return { ...w, aggregationConfig: { ...cfg, filters } };
      })
    );
  };

  // Handle image upload for image widgets
  const handleImageUpload = async (widgetId: string, file: File) => {
    try {
      const supabase = createClient();

      // Generate unique file name
      const fileExt = file.name.split(".").pop();
      const fileName = `${widgetId}-${Date.now()}.${fileExt}`;
      const filePath = `${fileName}`;

      // Upload file to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from("dashboard-images")
        .upload(filePath, file, {
          cacheControl: "3600",
          upsert: true,
        });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data } = supabase.storage
        .from("dashboard-images")
        .getPublicUrl(filePath);

      const publicUrl = data.publicUrl;

      // Update widget with image URL
      setWidgetById(widgetId, { content: publicUrl });
      toast.success("Imagen subida correctamente");
    } catch (e: any) {
      console.error("[AdminDashboardEditor] Error uploading image:", e);
      toast.error(e?.message || "Error al subir la imagen");
    }
  };

  // Handle widget deletion with image cleanup
  const handleDeleteWidget = async (widgetId: string) => {
    const widget = widgets.find((w) => w.id === widgetId);
    if (!widget) return;

    // If it's an image widget with content, delete the image from storage
    if (widget.type === "image" && widget.content) {
      try {
        const supabase = createClient();

        // Extract file path from URL
        // URL format: https://[project-id].supabase.co/storage/v1/object/public/dashboard-images/[filename]
        const url = new URL(widget.content);
        const pathParts = url.pathname.split("/");
        const fileName = pathParts[pathParts.length - 1];

        if (fileName) {
          toast.loading("Eliminando imagen...", { id: "delete-image" });

          const { error } = await supabase.storage
            .from("dashboard-images")
            .remove([fileName]);

          if (error) {
            console.warn(
              "[AdminDashboardEditor] Error deleting image from storage:",
              error
            );
            // Don't throw, still delete the widget even if storage deletion fails
          } else {
            toast.success("Imagen eliminada del almacenamiento", {
              id: "delete-image",
            });
          }
        }
      } catch (e: any) {
        console.error(
          "[AdminDashboardEditor] Error processing image deletion:",
          e
        );
        // Continue with widget deletion even if image deletion fails
      }
    }

    // Remove widget from state
    setWidgets((prev) => prev.filter((w) => w.id !== widgetId));
    if (selectedId === widgetId) setSelectedId(null);
  };

  // Cargar opciones de forma automática al abrir el panel de filtros
  useEffect(() => {
    widgets.forEach((w) => {
      if (!filtersOpen[w.id]) return;
      if (!w.source?.table) return;
      const filters = w.aggregationConfig?.filters || [];
      filters.forEach((f) => {
        const has =
          w.facetValues &&
          w.facetValues[f.field] &&
          w.facetValues[f.field]!.length > 0;
        if (!has) {
          fetchDistinctOptions(w.id, f.field);
        }
      });
    });
  }, [filtersOpen, widgets, fetchDistinctOptions]);

  return (
    <div className="admin-dashboard-editor flex flex-col h-full min-h-0 relative">
      {/* Backdrop: cierra paneles al hacer clic fuera */}
      {(isLeftPanelOpen || isRightPanelOpen) && (
        <button
          type="button"
          aria-label="Cerrar paneles"
          className="absolute inset-0 bg-black/20 z-30 transition-opacity duration-300"
          onClick={() => {
            if (isLeftPanelOpen) setIsLeftPanelOpen(false);
            if (isRightPanelOpen) setIsRightPanelOpen(false);
          }}
        />
      )}
      {/* Drawer izquierdo: paleta, guardar, filtros */}
      <aside
        className={`admin-editor-drawer admin-editor-drawer-left absolute left-0 top-0 bottom-0 z-40 w-[300px] max-w-[90vw] bg-white border-r border-neutral-200/80 shadow-xl transition-transform duration-300 ease-out flex flex-col ${
          isLeftPanelOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="admin-editor-sidebar flex-1 overflow-y-auto p-5">
          <h3 className="text-neutral-800 text-lg font-semibold tracking-tight">Editor</h3>
          <p className="text-sm text-neutral-500 mt-0.5 mb-5">Arma tu dashboard con widgets</p>
          <div className="flex flex-col gap-2 mb-5">
            <Button onClick={() => handleSaveDashboard()} disabled={isSaving} className="w-full rounded-lg">
              {isSaving ? "Guardando..." : "Guardar"}
            </Button>
            <SaveVersionButton dashboardId={dashboardId} />
            <HistoryDialog dashboardId={dashboardId} onRestore={() => window.location.reload()} />
            <Button variant="outline" asChild className="w-full rounded-lg">
              <Link href={`/admin/dashboard/${dashboardId}/view`}>Vista previa</Link>
            </Button>
            <Button
              variant="outline"
              onClick={async () => {
                console.debug("[AdminDashboardEditor] Share clicked", {
                  dashboardId,
                  clientId,
                });
                if (!clientId) {
                  try {
                    const supabase = createClient();
                    const { data, error } = await supabase
                      .from("dashboard")
                      .select("client_id")
                      .eq("id", dashboardId)
                      .maybeSingle();
                    if (error) throw error;
                    const fetched = (data as any)?.client_id ?? null;
                    console.debug(
                      "[AdminDashboardEditor] Fetched client_id on demand",
                      { fetched }
                    );
                    if (!fetched) {
                      toast.error(
                        "Este dashboard no está asociado a un cliente"
                      );
                      return;
                    }
                    setClientId(fetched);
                  } catch (err: any) {
                    console.error(
                      "[AdminDashboardEditor] Error fetching client_id:",
                      err
                    );
                    toast.error(
                      err?.message || "No se pudo obtener el cliente"
                    );
                    return;
                  }
                }
                setIsShareModalOpen(true);
              }}
            >
              Compartir
            </Button>
          </div>
          <div className="space-y-6">
            <div>
              <h4 className="text-neutral-700 font-semibold text-sm mb-3">Widgets</h4>
              <div className="space-y-1.5">
                {PALETTE.map((p) => (
                  <button
                    key={p.type}
                    draggable
                    onDragStart={(e) => onPaletteDragStart(e, p.type)}
                    className="admin-editor-palette-item w-full border border-neutral-200 rounded-lg px-3 py-2.5 bg-white text-left hover:bg-neutral-50 hover:border-neutral-300 flex items-center gap-3 cursor-grab active:cursor-grabbing text-sm text-neutral-700 transition-colors"
                  >
                    <span className="h-8 w-8 rounded-lg bg-neutral-100 flex-shrink-0" />
                    <span>{p.label}</span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-neutral-700 font-semibold text-sm">Datos</h4>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-lg text-xs h-8 border-neutral-200 text-neutral-600 hover:bg-neutral-50"
                  onClick={() => setIsChangeEtlModalOpen(true)}
                >
                  Cambiar
                </Button>
              </div>

              {etlLoading && (
                <div className="text-xs text-blue-600">Cargando ETL...</div>
              )}
              {etlError && (
                <div className="text-xs text-red-600 p-2 bg-red-50 rounded border border-red-100">
                  <span className="font-semibold">Error:</span> {etlError}
                </div>
              )}
              {etlData && (
                <div className="space-y-2">
                  <div className="text-xs text-green-600">
                    ✓ ETL: {etlData.etl.title || etlData.etl.name}
                  </div>
                  <div className="text-xs text-gray-500">
                    {etlData.etlData.rowCount} filas
                  </div>
                  <div className="text-xs text-gray-500">
                    {etlData.fields.all.length} campos disponibles
                  </div>
                </div>
              )}
            </div>
            <div>
              <h4 className="text-neutral-700 font-semibold text-sm mb-2">
                Filtros globales
              </h4>
              <div className="space-y-2">
                <Dialog
                  open={globalDialogOpen}
                  onOpenChange={setGlobalDialogOpen}
                >
                  <DialogTrigger asChild>
                    <Button variant="outline" className="w-full">
                      Configurar filtros ({globalFilters.length})
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-2xl">
                    <DialogHeader>
                      <DialogTitle>Filtros globales del dashboard</DialogTitle>
                      <DialogDescription>
                        Estos filtros se aplican a todos los gráficos, excepto a
                        los que marques como “Sin Global”.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={addGlobalFilter}
                        >
                          + Añadir filtro
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={clearAllGlobalFilters}
                          disabled={globalFilters.length === 0}
                        >
                          Limpiar todos
                        </Button>
                        <Button
                          size="sm"
                          onClick={applyGlobalFilters}
                          disabled={!etlData || globalFilters.length === 0}
                        >
                          Aplicar a todos
                        </Button>
                      </div>
                      {globalFilters.length === 0 && (
                        <div className="text-sm text-gray-500">
                          Sin filtros globales.
                        </div>
                      )}
                      {globalFilters.length > 0 && (
                        <div className="space-y-2 max-h-[60vh] overflow-auto border rounded-md p-3 bg-gray-50">
                          {globalFilters.map((f) => {
                            const availableFields = (
                              etlData?.fields?.all || []
                            ).map((n: string) => ({
                              name: n,
                              type: "unknown",
                            }));
                            const isBetween =
                              f.operator.toUpperCase() === "BETWEEN";
                            const isIn = f.operator.toUpperCase() === "IN";
                            const showValue = !["IS", "IS NOT"].includes(
                              f.operator.toUpperCase()
                            );
                            return (
                              <div
                                key={f.id}
                                className="grid grid-cols-12 gap-2 items-start"
                              >
                                <div className="col-span-3">
                                  <select
                                    value={f.field}
                                    onChange={(e) =>
                                      updateGlobalFilter(f.id, {
                                        field: e.target.value,
                                        value: undefined,
                                      })
                                    }
                                    className="w-full text-xs border-gray-300 rounded-md bg-white shadow-sm h-8"
                                  >
                                    {availableFields.map((c) => (
                                      <option key={c.name} value={c.name}>
                                        {c.name}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                <div className="col-span-2">
                                  <select
                                    value={f.operator}
                                    onChange={(e) => {
                                      const op = e.target.value;
                                      const prevOp = f.operator;
                                      const patch: Partial<GlobalFilter> = {
                                        operator: op,
                                      };
                                      if (op === "IS" || op === "IS NOT") {
                                        patch.value = null;
                                      } else if (op === "BETWEEN") {
                                        patch.value = ["", ""]; // inicial
                                      } else if (op === "IN") {
                                        patch.value = [];
                                      } else if (
                                        op === "MONTH" ||
                                        op === "DAY" ||
                                        op === "YEAR"
                                      ) {
                                        patch.value = "";
                                      } else {
                                        // Operador de un solo valor
                                        if (
                                          Array.isArray(f.value) ||
                                          (prevOp === "BETWEEN" &&
                                            typeof f.value === "object")
                                        ) {
                                          patch.value = "";
                                        }
                                      }
                                      updateGlobalFilter(f.id, patch);
                                    }}
                                    className="w-full text-xs border-gray-300 rounded-md bg-white shadow-sm h-8"
                                  >
                                    <option value="=">Igual (=)</option>
                                    <option value=">">Mayor (&gt;)</option>
                                    <option value=">=">
                                      Mayor o igual (&gt;=)
                                    </option>
                                    <option value="<">Menor (&lt;)</option>
                                    <option value="<=">
                                      Menor o igual (&lt;=)
                                    </option>
                                    <option value="!=">Distinto (!=)</option>
                                    <option value="BETWEEN">
                                      Entre (BETWEEN)
                                    </option>
                                    <option value="LIKE">
                                      Contiene (LIKE)
                                    </option>
                                    <option value="ILIKE">
                                      Contiene (ILIKE)
                                    </option>
                                    <option value="IN">En lista (IN)</option>
                                    <option value="MONTH">Mes (1-12)</option>
                                    <option value="YEAR">Año</option>
                                    <option value="DAY">Día específico</option>
                                    <option value="IS">Es NULL</option>
                                    <option value="IS NOT">No es NULL</option>
                                  </select>
                                </div>
                                <div className="col-span-2">
                                  <select
                                    value={(f as any).inputType || "text"}
                                    onChange={(e) =>
                                      updateGlobalFilter(f.id, {
                                        inputType: e.target.value as any,
                                      })
                                    }
                                    className="w-full text-xs border-gray-300 rounded-md bg-white shadow-sm h-8"
                                    title="Tipo de input"
                                  >
                                    <option value="text">Texto</option>
                                    <option value="select">Select</option>
                                    <option value="number">Número</option>
                                    <option value="date">Fecha</option>
                                  </select>
                                </div>
                                <div className="col-span-4 flex items-center gap-2">
                                  {showValue && isIn ? (
                                    <Input
                                      value={
                                        Array.isArray(f.value)
                                          ? f.value.join(",")
                                          : ""
                                      }
                                      placeholder="v1,v2,v3"
                                      className="h-8 text-xs"
                                      onChange={(e) => {
                                        const raw = e.target.value;
                                        const arr = raw
                                          .split(",")
                                          .map((s) => s.trim())
                                          .filter(Boolean);
                                        updateGlobalFilter(f.id, {
                                          value: arr,
                                        });
                                      }}
                                    />
                                  ) : showValue && isBetween ? (
                                    <div className="grid grid-cols-2 gap-2 w-full">
                                      <Input
                                        value={
                                          Array.isArray(f.value)
                                            ? f.value[0] ?? ""
                                            : f.value?.from ?? ""
                                        }
                                        placeholder="Desde"
                                        className="h-8 text-xs"
                                        onChange={(e) => {
                                          const v = e.target.value;
                                          const current = Array.isArray(f.value)
                                            ? [
                                                v,
                                                Array.isArray(f.value)
                                                  ? f.value[1]
                                                  : undefined,
                                              ]
                                            : { ...(f.value || {}), from: v };
                                          updateGlobalFilter(f.id, {
                                            value: current,
                                          });
                                        }}
                                      />
                                      <Input
                                        value={
                                          Array.isArray(f.value)
                                            ? f.value[1] ?? ""
                                            : f.value?.to ?? ""
                                        }
                                        placeholder="Hasta"
                                        className="h-8 text-xs"
                                        onChange={(e) => {
                                          const v = e.target.value;
                                          const current = Array.isArray(f.value)
                                            ? [
                                                Array.isArray(f.value)
                                                  ? f.value[0]
                                                  : undefined,
                                                v,
                                              ]
                                            : { ...(f.value || {}), to: v };
                                          updateGlobalFilter(f.id, {
                                            value: current,
                                          });
                                        }}
                                      />
                                    </div>
                                  ) : showValue &&
                                    f.operator.toUpperCase() === "MONTH" ? (
                                    <select
                                      value={String(f.value ?? "")}
                                      onChange={(e) => {
                                        const v = e.target.value
                                          ? Number(e.target.value)
                                          : null;
                                        updateGlobalFilter(f.id, { value: v });
                                      }}
                                      className="w-full text-xs border-gray-300 rounded-md bg-white shadow-sm h-8"
                                    >
                                      <option value="">Selecciona mes…</option>
                                      <option value="1">Enero</option>
                                      <option value="2">Febrero</option>
                                      <option value="3">Marzo</option>
                                      <option value="4">Abril</option>
                                      <option value="5">Mayo</option>
                                      <option value="6">Junio</option>
                                      <option value="7">Julio</option>
                                      <option value="8">Agosto</option>
                                      <option value="9">Septiembre</option>
                                      <option value="10">Octubre</option>
                                      <option value="11">Noviembre</option>
                                      <option value="12">Diciembre</option>
                                    </select>
                                  ) : showValue &&
                                    f.operator.toUpperCase() === "DAY" ? (
                                    <Input
                                      type="date"
                                      value={f.value ?? ""}
                                      className="h-8 text-xs"
                                      onChange={(e) =>
                                        updateGlobalFilter(f.id, {
                                          value: e.target.value || null,
                                        })
                                      }
                                    />
                                  ) : showValue &&
                                    f.operator.toUpperCase() === "YEAR" ? (
                                    <Input
                                      type="number"
                                      value={f.value ?? ""}
                                      className="h-8 text-xs"
                                      placeholder="Ej: 2023"
                                      onChange={(e) =>
                                        updateGlobalFilter(f.id, {
                                          value: e.target.value || null,
                                        })
                                      }
                                    />
                                  ) : showValue &&
                                    (f as any).inputType === "select" ? (
                                    <select
                                      value={
                                        f.value == null ? "" : String(f.value)
                                      }
                                      className="h-8 text-xs w-full border-gray-300 rounded-md bg-white shadow-sm"
                                      onChange={(e) => {
                                        updateGlobalFilter(f.id, {
                                          value: e.target.value || null,
                                        });
                                      }}
                                    >
                                      <option value="">Todos</option>
                                      {((f as any).distinctValues || []).map(
                                        (opt: any, idx: number) => (
                                          <option key={idx} value={String(opt)}>
                                            {String(opt)}
                                          </option>
                                        )
                                      )}
                                    </select>
                                  ) : showValue &&
                                    (f as any).inputType === "date" ? (
                                    <Input
                                      type="date"
                                      value={f.value ?? ""}
                                      className="h-8 text-xs"
                                      onChange={(e) =>
                                        updateGlobalFilter(f.id, {
                                          value: e.target.value || null,
                                        })
                                      }
                                    />
                                  ) : showValue &&
                                    (f as any).inputType === "number" ? (
                                    <Input
                                      type="number"
                                      value={
                                        f.value == null ? "" : String(f.value)
                                      }
                                      className="h-8 text-xs"
                                      placeholder="Valor"
                                      onChange={(e) => {
                                        const v = e.target.value;
                                        updateGlobalFilter(f.id, {
                                          value: v || null,
                                        });
                                      }}
                                    />
                                  ) : showValue && !isIn ? (
                                    <Input
                                      value={
                                        f.value == null ? "" : String(f.value)
                                      }
                                      className="h-8 text-xs"
                                      placeholder="Valor"
                                      onChange={(e) => {
                                        let v: any = e.target.value;
                                        if (v === "") v = null;
                                        if (
                                          f.operator.toUpperCase() === "LIKE" ||
                                          f.operator.toUpperCase() === "ILIKE"
                                        ) {
                                          v = v == null ? null : `%${v}%`;
                                        }
                                        updateGlobalFilter(f.id, { value: v });
                                      }}
                                    />
                                  ) : (
                                    <div className="text-[11px] text-gray-500">
                                      Sin valor
                                    </div>
                                  )}
                                  {showValue && (
                                    <button
                                      type="button"
                                      className="h-6 px-2 rounded bg-gray-200 hover:bg-gray-300 text-[10px] text-gray-700"
                                      onClick={() =>
                                        updateGlobalFilter(f.id, {
                                          value: null,
                                        })
                                      }
                                      title="Limpiar valor"
                                    >
                                      Limpiar
                                    </button>
                                  )}
                                  {showValue && (
                                    <label className="flex items-center gap-1 text-[11px] text-gray-600">
                                      <input
                                        type="checkbox"
                                        checked={!!f.convertToNumber}
                                        onChange={(e) =>
                                          updateGlobalFilter(f.id, {
                                            convertToNumber: e.target.checked,
                                          })
                                        }
                                      />
                                      Nº
                                    </label>
                                  )}
                                </div>
                                <div className="col-span-1 flex justify-end">
                                  <button
                                    className="h-6 w-6 rounded-full bg-red-50 hover:bg-red-100 text-red-600 text-xs"
                                    onClick={() => removeGlobalFilter(f.id)}
                                  >
                                    ×
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    <DialogFooter>
                      <Button
                        variant="outline"
                        onClick={() => setGlobalDialogOpen(false)}
                      >
                        Cerrar
                      </Button>
                      <Button
                        onClick={() => {
                          applyGlobalFilters();
                          setGlobalDialogOpen(false);
                        }}
                      >
                        Aplicar y cerrar
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
                <div className="text-[11px] text-gray-500">
                  {globalFilters.length === 0
                    ? "Sin filtros activos."
                    : `${globalFilters.length} filtro(s) activo(s)`}
                </div>
              </div>
            </div>
            {/* Tema / Colores (vista cliente): editables por el cliente */}
            <div>
              <h4 className="text-neutral-700 font-semibold text-sm mb-2">
                Tema / Colores (vista cliente)
              </h4>
              <p className="text-xs text-neutral-500 mb-3">
                Colores que verá el cliente en la vista del dashboard.
              </p>
              <div className="space-y-3">
                <div>
                  <Label className="text-xs text-neutral-600 mb-2 block">Paleta de colores</Label>
                  <p className="text-xs text-neutral-500 mb-2">
                    Afecta gráficos, bordes y acentos.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {PALETTE_PRESETS.map((preset) => {
                      const current = dashboardTheme.accentColor ?? DEFAULT_DASHBOARD_THEME.accentColor;
                      const isActive = current?.toLowerCase() === preset.accentColor.toLowerCase();
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          className={`h-8 min-w-[2rem] rounded-lg border-2 transition-all ${
                            isActive
                              ? "border-neutral-800 ring-2 ring-neutral-400 ring-offset-2"
                              : "border-neutral-200 hover:border-neutral-400"
                          }`}
                          style={{ backgroundColor: preset.accentColor }}
                          onClick={() =>
                            setDashboardTheme((t) => ({ ...t, accentColor: preset.accentColor }))
                          }
                          title={preset.name}
                          aria-label={`Paleta ${preset.name}`}
                        />
                      );
                    })}
                  </div>
                  <p className="text-xs text-neutral-400 mt-1">
                    O elige un color personalizado abajo.
                  </p>
                </div>
                <div>
                  <Label className="text-xs text-neutral-600">Color de acento (gráficos, bordes)</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <input
                      type="color"
                      className="h-9 w-12 rounded border border-neutral-200 cursor-pointer"
                      value={dashboardTheme.accentColor ?? DEFAULT_DASHBOARD_THEME.accentColor}
                      onChange={(e) =>
                        setDashboardTheme((t) => ({ ...t, accentColor: e.target.value }))
                      }
                    />
                    <Input
                      className="flex-1 h-9 text-xs font-mono"
                      value={dashboardTheme.accentColor ?? DEFAULT_DASHBOARD_THEME.accentColor}
                      onChange={(e) =>
                        setDashboardTheme((t) => ({ ...t, accentColor: e.target.value }))
                      }
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-neutral-600">Fondo del dashboard</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <input
                      type="color"
                      className="h-9 w-12 rounded border border-neutral-200 cursor-pointer"
                      value={dashboardTheme.backgroundColor ?? DEFAULT_DASHBOARD_THEME.backgroundColor}
                      onChange={(e) =>
                        setDashboardTheme((t) => ({ ...t, backgroundColor: e.target.value }))
                      }
                    />
                    <Input
                      className="flex-1 h-9 text-xs font-mono"
                      value={dashboardTheme.backgroundColor ?? DEFAULT_DASHBOARD_THEME.backgroundColor}
                      onChange={(e) =>
                        setDashboardTheme((t) => ({ ...t, backgroundColor: e.target.value }))
                      }
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-neutral-600">Fondo de tarjetas</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <input
                      type="color"
                      className="h-9 w-12 rounded border border-neutral-200 cursor-pointer"
                      value={dashboardTheme.cardBackgroundColor ?? DEFAULT_DASHBOARD_THEME.cardBackgroundColor}
                      onChange={(e) =>
                        setDashboardTheme((t) => ({ ...t, cardBackgroundColor: e.target.value }))
                      }
                    />
                    <Input
                      className="flex-1 h-9 text-xs font-mono"
                      value={dashboardTheme.cardBackgroundColor ?? DEFAULT_DASHBOARD_THEME.cardBackgroundColor}
                      onChange={(e) =>
                        setDashboardTheme((t) => ({ ...t, cardBackgroundColor: e.target.value }))
                      }
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-neutral-600">Tipografía (familia)</Label>
                  <Input
                    className="mt-1 h-9 text-xs font-mono"
                    placeholder="Ej. 'DM Sans', system-ui"
                    value={dashboardTheme.fontFamily ?? DEFAULT_DASHBOARD_THEME.fontFamily ?? ""}
                    onChange={(e) =>
                      setDashboardTheme((t) => ({ ...t, fontFamily: e.target.value || undefined }))
                    }
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs text-neutral-600">Título dashboard (rem)</Label>
                    <Input
                      type="number"
                      step={0.1}
                      min={1}
                      max={2.5}
                      className="mt-1 h-9 text-xs"
                      value={dashboardTheme.headerFontSize ?? DEFAULT_DASHBOARD_THEME.headerFontSize ?? 1.5}
                      onChange={(e) =>
                        setDashboardTheme((t) => ({ ...t, headerFontSize: parseFloat(e.target.value) || undefined }))
                      }
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-neutral-600">Valor KPI (rem)</Label>
                    <Input
                      type="number"
                      step={0.1}
                      min={1}
                      max={3}
                      className="mt-1 h-9 text-xs"
                      value={dashboardTheme.kpiValueFontSize ?? DEFAULT_DASHBOARD_THEME.kpiValueFontSize ?? 1.75}
                      onChange={(e) =>
                        setDashboardTheme((t) => ({ ...t, kpiValueFontSize: parseFloat(e.target.value) || undefined }))
                      }
                    />
                  </div>
                </div>
                <div className="border-t border-neutral-200 pt-3 mt-1">
                  <h4 className="text-xs font-semibold text-neutral-600 mb-2">Logo de fondo (watermark)</h4>
                  <div className="space-y-2">
                    <div>
                      <Label className="text-xs text-neutral-600">URL del logo</Label>
                      <Input
                        className="mt-1 h-9 text-xs"
                        placeholder="https://... o /images/logo.png"
                        value={dashboardTheme.logoUrl ?? ""}
                        onChange={(e) =>
                          setDashboardTheme((t) => ({ ...t, logoUrl: e.target.value || undefined }))
                        }
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs text-neutral-600">Tamaño (%)</Label>
                        <Input
                          type="number"
                          min={5}
                          max={100}
                          className="mt-1 h-9 text-xs"
                          value={dashboardTheme.logoSize ?? DEFAULT_DASHBOARD_THEME.logoSize ?? 24}
                          onChange={(e) =>
                            setDashboardTheme((t) => ({ ...t, logoSize: parseInt(e.target.value, 10) || undefined }))
                          }
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-neutral-600">Opacidad (0-1)</Label>
                        <Input
                          type="number"
                          step={0.01}
                          min={0}
                          max={1}
                          className="mt-1 h-9 text-xs"
                          value={dashboardTheme.logoOpacity ?? DEFAULT_DASHBOARD_THEME.logoOpacity ?? 0.06}
                          onChange={(e) =>
                            setDashboardTheme((t) => ({ ...t, logoOpacity: parseFloat(e.target.value) || undefined }))
                          }
                        />
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs text-neutral-600">Posición</Label>
                      <select
                        className="mt-1 w-full h-9 rounded-md border border-neutral-200 bg-white px-3 text-xs"
                        value={dashboardTheme.logoPosition ?? DEFAULT_DASHBOARD_THEME.logoPosition ?? "center"}
                        onChange={(e) =>
                          setDashboardTheme((t) => ({ ...t, logoPosition: e.target.value as DashboardTheme["logoPosition"] }))
                        }
                      >
                        <option value="center">Centro</option>
                        <option value="top-left">Arriba izquierda</option>
                        <option value="top-right">Arriba derecha</option>
                        <option value="bottom-left">Abajo izquierda</option>
                        <option value="bottom-right">Abajo derecha</option>
                      </select>
                    </div>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-xs"
                  onClick={() => setDashboardTheme({ ...DEFAULT_DASHBOARD_THEME })}
                >
                  Restaurar tema por defecto
                </Button>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Área principal: grid de métricas a pantalla completa */}
      <section className="flex-1 w-full min-h-0 relative flex flex-col">
        {/* Toggle Buttons Floating inside the canvas section */}
        <div className="absolute top-4 left-4 z-50 flex gap-2">
          <Button
            variant="secondary"
            size="icon"
            className="h-9 w-9 rounded-lg shadow-sm bg-white hover:bg-neutral-50 border border-neutral-200 text-neutral-600 hover:text-neutral-800"
            onClick={() => setIsLeftPanelOpen(!isLeftPanelOpen)}
            title={
              isLeftPanelOpen
                ? "Ocultar panel izquierdo"
                : "Mostrar panel izquierdo"
            }
          >
            {isLeftPanelOpen ? (
              <PanelLeftClose size={16} />
            ) : (
              <PanelLeftOpen size={16} />
            )}
          </Button>
        </div>
        <div className="absolute top-4 right-4 z-50 flex gap-2">
          <Button
            variant="secondary"
            size="icon"
            className="h-9 w-9 rounded-lg shadow-sm bg-white hover:bg-neutral-50 border border-neutral-200 text-neutral-600 hover:text-neutral-800"
            onClick={() => setIsRightPanelOpen(!isRightPanelOpen)}
            title={
              isRightPanelOpen
                ? "Ocultar panel derecho"
                : "Mostrar panel derecho"
            }
          >
            {isRightPanelOpen ? (
              <PanelRightClose size={16} />
            ) : (
              <PanelRightOpen size={16} />
            )}
          </Button>
        </div>
        <div
          ref={canvasRef}
          onDragOver={onCanvasDragOver}
          onDrop={onGridDrop}
          className="admin-editor-canvas admin-editor-grid-area flex-1 min-h-0 bg-neutral-50/80 rounded-xl p-6 border border-neutral-200/80 overflow-auto"
        >
          <p className="text-sm text-neutral-500 mb-4">
            Arrastra un widget desde el panel izquierdo y suéltalo aquí. Usa Subir/Bajar para cambiar el orden.
          </p>
          <div className="grid grid-cols-2 gap-4 items-stretch">
            {([...widgets]
              .sort((a, b) => (a.gridOrder ?? 999) - (b.gridOrder ?? 999))
              .map((w) => {
              const isImage = w.type === "image";
              const isText = w.type === "text";
              // Un widget es "de datos" si NO es imagen Y NO es texto
              const isDataWidget = !isImage && !isText;

              const rawSpan = w.gridSpan ?? (w.type === "table" ? 2 : w.type === "kpi" ? 1 : 2);
              const span = Math.min(2, rawSpan);
              const orderIndex = widgets.findIndex((x) => x.id === w.id);
              return (
                <Card
                  key={w.id}
                  className={`rounded-xl overflow-hidden select-none flex flex-col min-h-[200px] ${
                    isImage
                      ? "bg-transparent shadow-none border-none"
                      : "bg-white shadow-sm border border-neutral-200"
                  } ${selectedId === w.id ? "ring-2 ring-neutral-400 ring-offset-2" : ""}`}
                  style={{ gridColumn: `span ${span}` }}
                  onPointerDown={() => setSelectedId(w.id)}
                >
                  <>
                    <div
                      className={`admin-editor-widget-header shrink-0 px-3 py-2 flex items-center justify-between gap-2 border-b border-neutral-100 ${
                        isImage
                          ? "absolute top-0 left-0 right-0 z-20 bg-black/50 text-white opacity-0 hover:opacity-100 transition-opacity"
                          : "bg-neutral-50/95"
                      }`}
                    >
                      <div className="flex items-center gap-1 min-w-0 flex-1">
                        <button
                          type="button"
                          className="p-1 rounded hover:bg-neutral-200/80 text-neutral-500 disabled:opacity-30 disabled:pointer-events-none"
                          onClick={(e) => { e.stopPropagation(); moveWidgetOrder(w.id, "up"); }}
                          title="Subir"
                          disabled={orderIndex <= 0}
                        >
                          <ChevronUp className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          className="p-1 rounded hover:bg-neutral-200/80 text-neutral-500 disabled:opacity-30 disabled:pointer-events-none"
                          onClick={(e) => { e.stopPropagation(); moveWidgetOrder(w.id, "down"); }}
                          title="Bajar"
                          disabled={orderIndex >= widgets.length - 1}
                        >
                          <ChevronDown className="h-4 w-4" />
                        </button>
                        <span className="font-medium text-neutral-800 truncate text-sm ml-1">
                          {w.title || w.type.toUpperCase()}
                        </span>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            className="p-1.5 rounded-lg hover:bg-neutral-200/80 text-neutral-500 hover:text-neutral-700 flex-shrink-0"
                            onClick={(e) => e.stopPropagation()}
                            aria-label="Opciones del widget"
                          >
                            <MoreVertical className="h-4 w-4" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48 rounded-lg" onClick={(e) => e.stopPropagation()}>
                          {isDataWidget && (
                            <>
                              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); loadETLDataIntoWidget(w.id); }}>
                                Recargar datos
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setWidgetById(w.id, { excludeGlobalFilters: !w.excludeGlobalFilters });
                                }}
                              >
                                {w.excludeGlobalFilters ? "Usar filtros globales" : "Excluir filtros globales"}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                            </>
                          )}
                          <DropdownMenuItem
                            className="text-red-600 focus:text-red-600"
                            onClick={(e) => { e.stopPropagation(); handleDeleteWidget(w.id); }}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Eliminar
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <div
                      className={`w-full flex flex-col gap-2 relative flex-1 min-h-0 overflow-hidden ${
                        isImage
                          ? "bg-transparent p-0"
                          : "bg-white p-3"
                      }`}
                    >
                      {w.isLoading && (
                        <div className="absolute inset-0 bg-white/90 z-10 flex items-center justify-center rounded-b-xl">
                          <Loader2 className="w-8 h-8 animate-spin text-neutral-600" />
                        </div>
                      )}
                      {/* Orden y límite */}
                      {isDataWidget &&
                        (() => {
                          const aggEnabled = !!w.aggregationConfig?.enabled;
                          const metricOrderOptions = (
                            w.aggregationConfig?.metrics || []
                          )
                            .map(
                              (m) =>
                                (m.alias && m.alias.trim()) ||
                                `${m.func}(${m.field})`
                            )
                            .filter(Boolean);
                          const dimensionOption = w.aggregationConfig?.dimension
                            ? [w.aggregationConfig.dimension]
                            : [];
                          const aggOrderFields = [
                            ...dimensionOption,
                            ...metricOrderOptions,
                          ];
                          const nonAggOrderFields = (w.columns || []).map(
                            (c) => c.name
                          );
                          const orderFields = aggEnabled
                            ? aggOrderFields
                            : nonAggOrderFields;
                          const currentOrderField =
                            w.aggregationConfig?.orderBy?.field || "";
                          const currentOrderDir =
                            w.aggregationConfig?.orderBy?.direction || "DESC";
                          const currentLimit = w.aggregationConfig?.limit ?? "";

                          // Helper to pick a sensible default field for quick actions
                          const pickDefaultOrderField = () => {
                            if (aggEnabled) {
                              if (metricOrderOptions.length > 0)
                                return metricOrderOptions[0];
                              if (dimensionOption.length > 0)
                                return dimensionOption[0]!;
                              return "";
                            }
                            // Prefer numeric columns for no-agg
                            const numeric = (w.columns || []).find(
                              (c) => c.type === "number"
                            );
                            if (numeric) return numeric.name;
                            return (w.columns || [])[0]?.name || "";
                          };

                          return (
                            <div className="grid grid-cols-12 gap-2 items-center">
                              <div className="col-span-6 flex items-center gap-2">
                                <span className="text-[11px] text-gray-600">
                                  Ordenar por
                                </span>
                                <select
                                  value={currentOrderField}
                                  onChange={(e) => {
                                    const field = e.target.value;
                                    setWidgets((prev) =>
                                      prev.map((x) => {
                                        if (x.id !== w.id) return x;
                                        const cfg = x.aggregationConfig || {
                                          enabled: false,
                                          metrics: [],
                                        };
                                        return {
                                          ...x,
                                          aggregationConfig: {
                                            ...cfg,
                                            orderBy: field
                                              ? {
                                                  field,
                                                  direction:
                                                    cfg.orderBy?.direction ||
                                                    "DESC",
                                                }
                                              : undefined,
                                          },
                                        } as Widget;
                                      })
                                    );
                                  }}
                                  className="text-xs border-gray-300 rounded-md bg-white shadow-sm h-7 px-2"
                                >
                                  <option value="">(Sin orden)</option>
                                  {orderFields.map((f) => (
                                    <option key={f} value={f}>
                                      {f}
                                    </option>
                                  ))}
                                </select>
                                <select
                                  value={currentOrderDir}
                                  onChange={(e) => {
                                    const dir =
                                      (e.target.value as "ASC" | "DESC") ||
                                      "DESC";
                                    setWidgets((prev) =>
                                      prev.map((x) => {
                                        if (x.id !== w.id) return x;
                                        const cfg = x.aggregationConfig || {
                                          enabled: false,
                                          metrics: [],
                                        };
                                        const field =
                                          cfg.orderBy?.field ||
                                          pickDefaultOrderField();
                                        return {
                                          ...x,
                                          aggregationConfig: {
                                            ...cfg,
                                            orderBy: field
                                              ? { field, direction: dir }
                                              : undefined,
                                          },
                                        } as Widget;
                                      })
                                    );
                                  }}
                                  className="text-xs border-gray-300 rounded-md bg-white shadow-sm h-7 px-2"
                                >
                                  <option value="DESC">Desc</option>
                                  <option value="ASC">Asc</option>
                                </select>
                              </div>
                              <div className="col-span-4 flex items-center gap-2">
                                <span className="text-[11px] text-gray-600">
                                  Límite
                                </span>
                                <Input
                                  type="number"
                                  min={1}
                                  max={1000}
                                  value={currentLimit as any}
                                  placeholder="p.ej. 5"
                                  className="h-7 text-xs"
                                  onChange={(e) => {
                                    const raw = e.target.value;
                                    const n =
                                      raw === ""
                                        ? undefined
                                        : Math.max(
                                            1,
                                            Math.min(1000, parseInt(raw))
                                          );
                                    setWidgets((prev) =>
                                      prev.map((x) => {
                                        if (x.id !== w.id) return x;
                                        const cfg = x.aggregationConfig || {
                                          enabled: false,
                                          metrics: [],
                                        };
                                        return {
                                          ...x,
                                          aggregationConfig: {
                                            ...cfg,
                                            limit: n as any,
                                          },
                                        } as Widget;
                                      })
                                    );
                                  }}
                                />
                              </div>
                              <div className="col-span-2 flex items-center gap-1 justify-end">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 px-2 text-[11px]"
                                  onClick={() => {
                                    const field = pickDefaultOrderField();
                                    setWidgets((prev) =>
                                      prev.map((x) => {
                                        if (x.id !== w.id) return x;
                                        const cfg = x.aggregationConfig || {
                                          enabled: false,
                                          metrics: [],
                                        };
                                        return {
                                          ...x,
                                          aggregationConfig: {
                                            ...cfg,
                                            orderBy: field
                                              ? { field, direction: "DESC" }
                                              : undefined,
                                            limit: 5,
                                          },
                                        } as Widget;
                                      })
                                    );
                                  }}
                                >
                                  Top 5
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 px-2 text-[11px]"
                                  onClick={() => {
                                    const field = pickDefaultOrderField();
                                    setWidgets((prev) =>
                                      prev.map((x) => {
                                        if (x.id !== w.id) return x;
                                        const cfg = x.aggregationConfig || {
                                          enabled: false,
                                          metrics: [],
                                        };
                                        return {
                                          ...x,
                                          aggregationConfig: {
                                            ...cfg,
                                            orderBy: field
                                              ? { field, direction: "ASC" }
                                              : undefined,
                                            limit: 5,
                                          },
                                        } as Widget;
                                      })
                                    );
                                  }}
                                >
                                  Bottom 5
                                </Button>
                              </div>
                            </div>
                          );
                        })()}

                      {isDataWidget && filtersOpen[w.id] && (
                        <div className="space-y-2 border rounded-md p-2 bg-gray-50 max-h-40 overflow-auto">
                          {(w.aggregationConfig?.filters || []).length ===
                            0 && (
                            <div className="text-xs text-gray-500">
                              Sin filtros. Añade uno para empezar.
                            </div>
                          )}
                          {(w.aggregationConfig?.filters || []).map((f) => {
                            const availableFields: Array<{
                              name: string;
                              type: string;
                            }> = w.aggregationConfig?.enabled
                              ? (etlData?.fields?.all || []).map(
                                  (n: string) => ({
                                    name: n,
                                    type: "unknown",
                                  })
                                )
                              : w.columns || [];
                            const fieldType =
                              (w.columns || []).find((c) => c.name === f.field)
                                ?.type || "unknown";
                            const isNumericOrDate =
                              fieldType === "number" || fieldType === "date";
                            const isString = fieldType === "string";
                            const showSecond =
                              f.operator.toUpperCase() === "BETWEEN";
                            const showValue = !["IS", "IS NOT"].includes(
                              f.operator.toUpperCase()
                            );
                            return (
                              <div
                                key={f.id}
                                className="grid grid-cols-12 gap-2 items-center"
                              >
                                <div className="col-span-4">
                                  <select
                                    value={f.field}
                                    onChange={async (e) => {
                                      const newField = e.target.value;
                                      updateFilter(w.id, f.id, {
                                        field: newField,
                                        value: undefined,
                                      });
                                      await fetchDistinctOptions(
                                        w.id,
                                        newField
                                      );
                                    }}
                                    className="w-full text-xs border-gray-300 rounded-md bg-white shadow-sm"
                                  >
                                    {availableFields.map((c) => (
                                      <option key={c.name} value={c.name}>
                                        {c.name}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                <div className="col-span-3">
                                  <select
                                    value={f.operator}
                                    onChange={(e) => {
                                      const op = e.target.value;
                                      const newPatch: Partial<AggregationFilter> =
                                        {
                                          operator: op,
                                        };
                                      if (op === "IS" || op === "IS NOT")
                                        newPatch.value = null;
                                      updateFilter(w.id, f.id, newPatch);
                                    }}
                                    className="w-full text-xs border-gray-300 rounded-md bg-white shadow-sm"
                                  >
                                    {/* Operadores dinámicos según tipo */}
                                    {isNumericOrDate && (
                                      <>
                                        <option value="=">Igual (=)</option>
                                        <option value=">">Mayor (&gt;)</option>
                                        <option value=">=">
                                          Mayor o igual (&gt;=)
                                        </option>
                                        <option value="<">Menor (&lt;)</option>
                                        <option value="<=">
                                          Menor o igual (&lt;=)
                                        </option>
                                        <option value="!=">
                                          Distinto (!=)
                                        </option>
                                        <option value="BETWEEN">
                                          Entre (BETWEEN)
                                        </option>
                                        <option value="IN">
                                          En lista (IN)
                                        </option>
                                        <option value="IS">Es NULL</option>
                                        <option value="IS NOT">
                                          No es NULL
                                        </option>
                                      </>
                                    )}
                                    {isString && (
                                      <>
                                        <option value="=">Igual (=)</option>
                                        <option value=">">Mayor (&gt;)</option>
                                        <option value=">=">
                                          Mayor o igual (&gt;=)
                                        </option>
                                        <option value="<">Menor (&lt;)</option>
                                        <option value="<=">
                                          Menor o igual (&lt;=)
                                        </option>
                                        <option value="!=">
                                          Distinto (!=)
                                        </option>
                                        <option value="BETWEEN">
                                          Entre (BETWEEN)
                                        </option>
                                        <option value="LIKE">
                                          Contiene (LIKE)
                                        </option>
                                        <option value="ILIKE">
                                          Contiene (ILIKE)
                                        </option>
                                        <option value="IN">
                                          En lista (IN)
                                        </option>
                                        <option value="IS">Es NULL</option>
                                        <option value="IS NOT">
                                          No es NULL
                                        </option>
                                      </>
                                    )}
                                    {!isNumericOrDate && !isString && (
                                      <>
                                        <option value="=">Igual (=)</option>
                                        <option value=">">Mayor (&gt;)</option>
                                        <option value=">=">
                                          Mayor o igual (&gt;=)
                                        </option>
                                        <option value="<">Menor (&lt;)</option>
                                        <option value="<=">
                                          Menor o igual (&lt;=)
                                        </option>
                                        <option value="!=">
                                          Distinto (!=)
                                        </option>
                                        <option value="BETWEEN">
                                          Entre (BETWEEN)
                                        </option>
                                        <option value="IS">Es NULL</option>
                                        <option value="IS NOT">
                                          No es NULL
                                        </option>
                                      </>
                                    )}
                                  </select>
                                </div>
                                <div className="col-span-4 flex items-center gap-2">
                                  {showValue &&
                                  f.operator.toUpperCase() === "IN" ? (
                                    <select
                                      multiple
                                      value={
                                        (Array.isArray(f.value)
                                          ? f.value
                                          : []) as any
                                      }
                                      onChange={(e) => {
                                        const selected: any[] = Array.from(
                                          e.target.selectedOptions
                                        ).map((o) => {
                                          const v = o.value;
                                          return f.convertToNumber ||
                                            fieldType === "number"
                                            ? Number(v)
                                            : v;
                                        });
                                        updateFilter(w.id, f.id, {
                                          value: selected,
                                        });
                                      }}
                                      className="w-full text-xs border-gray-300 rounded-md bg-white shadow-sm h-8"
                                      onFocus={() => {
                                        const options =
                                          w.facetValues?.[f.field] || [];
                                        if (!options || options.length === 0)
                                          fetchDistinctOptions(w.id, f.field);
                                      }}
                                    >
                                      {(w.facetValues?.[f.field] || []).map(
                                        (opt, i) => (
                                          <option
                                            key={`${String(opt)}-${i}`}
                                            value={String(opt)}
                                          >
                                            {String(opt)}
                                          </option>
                                        )
                                      )}
                                    </select>
                                  ) : showValue &&
                                    f.operator.toUpperCase() === "BETWEEN" ? (
                                    <div className="grid grid-cols-2 gap-2 w-full">
                                      <select
                                        value={
                                          Array.isArray(f.value)
                                            ? f.value[0] ?? ""
                                            : f.value?.from ?? ""
                                        }
                                        onChange={(e) => {
                                          let v: any = e.target.value;
                                          if (f.convertToNumber && v !== "")
                                            v = Number(v);
                                          const current = Array.isArray(f.value)
                                            ? [v, f.value?.[1]]
                                            : { ...(f.value || {}), from: v };
                                          updateFilter(w.id, f.id, {
                                            value: current,
                                          });
                                        }}
                                        className="w-full text-xs border-gray-300 rounded-md bg-white shadow-sm"
                                        onFocus={() => {
                                          const options =
                                            w.facetValues?.[f.field] || [];
                                          if (!options || options.length === 0)
                                            fetchDistinctOptions(w.id, f.field);
                                        }}
                                      >
                                        <option value="">Desde…</option>
                                        {(w.facetValues?.[f.field] || []).map(
                                          (opt, i) => (
                                            <option
                                              key={`${String(opt)}-${i}`}
                                              value={String(opt)}
                                            >
                                              {String(opt)}
                                            </option>
                                          )
                                        )}
                                      </select>
                                      <select
                                        value={
                                          Array.isArray(f.value)
                                            ? f.value[1] ?? ""
                                            : f.value?.to ?? ""
                                        }
                                        onChange={(e) => {
                                          let v: any = e.target.value;
                                          if (f.convertToNumber && v !== "")
                                            v = Number(v);
                                          const current = Array.isArray(f.value)
                                            ? [
                                                Array.isArray(f.value)
                                                  ? f.value?.[0]
                                                  : undefined,
                                                v,
                                              ]
                                            : { ...(f.value || {}), to: v };
                                          updateFilter(w.id, f.id, {
                                            value: current,
                                          });
                                        }}
                                        className="w-full text-xs border-gray-300 rounded-md bg-white shadow-sm"
                                        onFocus={() => {
                                          const options =
                                            w.facetValues?.[f.field] || [];
                                          if (!options || options.length === 0)
                                            fetchDistinctOptions(w.id, f.field);
                                        }}
                                      >
                                        <option value="">Hasta…</option>
                                        {(w.facetValues?.[f.field] || []).map(
                                          (opt, i) => (
                                            <option
                                              key={`${String(opt)}-${i}`}
                                              value={String(opt)}
                                            >
                                              {String(opt)}
                                            </option>
                                          )
                                        )}
                                      </select>
                                    </div>
                                  ) : showValue ? (
                                    <select
                                      value={
                                        f.value == null ? "" : String(f.value)
                                      }
                                      onChange={(e) => {
                                        let v: any = e.target.value;
                                        if (v === "") v = null;
                                        else if (
                                          f.convertToNumber ||
                                          fieldType === "number"
                                        )
                                          v = Number(v);
                                        if (
                                          f.operator.toUpperCase() === "LIKE" ||
                                          f.operator.toUpperCase() === "ILIKE"
                                        ) {
                                          v = v == null ? null : `%${v}%`;
                                        }
                                        updateFilter(w.id, f.id, { value: v });
                                      }}
                                      className="w-full text-xs border-gray-300 rounded-md bg-white shadow-sm"
                                      onFocus={() => {
                                        const options =
                                          w.facetValues?.[f.field] || [];
                                        if (!options || options.length === 0)
                                          fetchDistinctOptions(w.id, f.field);
                                      }}
                                    >
                                      <option value="">Selecciona…</option>
                                      {(w.facetValues?.[f.field] || []).map(
                                        (opt, i) => (
                                          <option
                                            key={`${String(opt)}-${i}`}
                                            value={String(opt)}
                                          >
                                            {String(opt)}
                                          </option>
                                        )
                                      )}
                                    </select>
                                  ) : (
                                    <div className="text-[11px] text-gray-500">
                                      Sin valor
                                    </div>
                                  )}
                                  {showValue && (
                                    <label className="flex items-center gap-1 text-[11px] text-gray-600">
                                      <input
                                        type="checkbox"
                                        checked={!!f.convertToNumber}
                                        onChange={(e) =>
                                          updateFilter(w.id, f.id, {
                                            convertToNumber: e.target.checked,
                                          })
                                        }
                                      />
                                      Convertir a número
                                    </label>
                                  )}
                                </div>
                                <div className="col-span-1 flex justify-end">
                                  <button
                                    className="h-6 w-6 rounded-full bg-red-50 hover:bg-red-100 text-red-600 text-xs"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      removeFilter(w.id, f.id);
                                    }}
                                  >
                                    ×
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      <div className="flex-1 min-h-0 flex items-center justify-center">
                        {w.type === "bar" && w.config ? (
                          <Bar
                            data={w.config as ChartData<"bar">}
                            options={{
                              responsive: true,
                              maintainAspectRatio: false,
                              plugins: {
                                legend: { display: true },
                                datalabels: {
                                  display: true,
                                  color: "#374151",
                                  font: { weight: "bold" },
                                  formatter: (value) => value.toLocaleString(),
                                  anchor: "end",
                                  align: "end",
                                },
                              },
                              scales: {
                                x: { grid: { display: false } },
                                y: { grid: { color: "#eee" } },
                              },
                            }}
                          />
                        ) : w.type === "horizontalBar" && w.config ? (
                          <Bar
                            data={w.config as ChartData<"bar">}
                            options={{
                              responsive: true,
                              maintainAspectRatio: false,
                              indexAxis: "y",
                              plugins: {
                                legend: { display: true },
                                datalabels: {
                                  display: true,
                                  color: "#374151",
                                  font: { weight: "bold" },
                                  formatter: (value) => value.toLocaleString(),
                                  anchor: "end",
                                  align: "end",
                                },
                              },
                              scales: {
                                x: { grid: { color: "#eee" } },
                                y: { grid: { display: false } },
                              },
                            }}
                          />
                        ) : w.type === "line" && w.config ? (
                          <Line
                            data={w.config as ChartData<"line">}
                            options={{
                              responsive: true,
                              maintainAspectRatio: false,
                              plugins: {
                                legend: { display: true },
                                datalabels: {
                                  display: true,
                                  color: "#374151",
                                  font: { weight: "bold" },
                                  formatter: (value) => value.toLocaleString(),
                                  backgroundColor: "rgba(255, 255, 255, 0.7)",
                                  borderRadius: 4,
                                  padding: 4,
                                },
                              },
                            }}
                          />
                        ) : w.type === "pie" && w.config ? (
                          <Pie
                            data={w.config as ChartData<"pie">}
                            options={{
                              responsive: true,
                              maintainAspectRatio: false,
                              plugins: {
                                legend: { display: true },
                                datalabels: {
                                  display: true,
                                  color: "#ffffff",
                                  font: { weight: "bold" },
                                  formatter: (value: unknown, context) => {
                                    const mode =
                                      w.labelDisplayMode || "percent";
                                    const current = Number((value as any) ?? 0);
                                    if (mode === "value") {
                                      return current.toLocaleString();
                                    }
                                    const dataArr = (context.chart.data
                                      .datasets?.[0]?.data || []) as any[];
                                    const total = dataArr.reduce(
                                      (sum: number, v: any) =>
                                        sum + Number(v ?? 0),
                                      0
                                    );
                                    const pct = total
                                      ? (current / total) * 100
                                      : 0;
                                    return `${pct.toFixed(1)}%`;
                                  },
                                },
                              },
                            }}
                          />
                        ) : w.type === "doughnut" && w.config ? (
                          <Doughnut
                            data={w.config as ChartData<"doughnut">}
                            options={{
                              responsive: true,
                              maintainAspectRatio: false,
                              plugins: {
                                legend: { display: true },
                                datalabels: {
                                  display: true,
                                  color: "#ffffff",
                                  font: { weight: "bold" },
                                  formatter: (value: unknown, context) => {
                                    const mode =
                                      w.labelDisplayMode || "percent";
                                    const current = Number((value as any) ?? 0);
                                    if (mode === "value") {
                                      return current.toLocaleString();
                                    }
                                    const dataArr = (context.chart.data
                                      .datasets?.[0]?.data || []) as any[];
                                    const total = dataArr.reduce(
                                      (sum: number, v: any) =>
                                        sum + Number(v ?? 0),
                                      0
                                    );
                                    const pct = total
                                      ? (current / total) * 100
                                      : 0;
                                    return `${pct.toFixed(1)}%`;
                                  },
                                },
                              },
                            }}
                          />
                        ) : w.type === "combo" && w.config ? (
                          <Bar
                            data={w.config as ChartData<"bar">}
                            options={{
                              responsive: true,
                              maintainAspectRatio: false,
                              plugins: {
                                legend: { display: true },
                                datalabels: {
                                  display: true,
                                  color: "#374151",
                                  font: { weight: "bold" },
                                  formatter: (value) => value.toLocaleString(),
                                },
                              },
                            }}
                          />
                        ) : w.type === "kpi" ? (
                          <div className="text-4xl font-bold text-gray-800">
                            {w.config?.datasets?.[0]?.data?.[0]?.toLocaleString() ??
                              0}
                          </div>
                        ) : w.type === "table" ? (
                          <div className="w-full h-full overflow-auto text-left">
                            {!w.rows || w.rows.length === 0 ? (
                              <div className="text-sm text-gray-500">
                                Sin datos.
                              </div>
                            ) : (
                              <table className="w-full text-xs">
                                <thead>
                                  <tr>
                                    {Object.keys(w.rows[0]).map((k) => (
                                      <th
                                        key={k}
                                        className="py-1 pr-2 font-medium"
                                      >
                                        {k}
                                      </th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {w.rows.slice(0, 100).map((r, i) => (
                                    <tr key={i} className="border-t">
                                      {Object.keys(r).map((k) => (
                                        <td
                                          key={k}
                                          className="py-1 pr-2 truncate max-w-[200px]"
                                        >
                                          {String(r[k])}
                                        </td>
                                      ))}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </div>
                        ) : w.type === "filter" ? (
                          <div className="w-full h-full flex flex-col gap-1 p-2 justify-center">
                            <Label className="text-xs font-medium text-gray-700">
                              {w.filterConfig?.label || "Filtro"}
                            </Label>
                            {w.filterConfig?.inputType === "select" ? (
                              <select
                                disabled
                                className="w-full text-xs border rounded h-8 bg-gray-50"
                              >
                                <option>Seleccionar...</option>
                              </select>
                            ) : w.filterConfig?.inputType === "date" ? (
                              <div className="w-full h-8 border rounded bg-gray-50 flex items-center px-2 text-gray-400 text-xs">
                                dd/mm/aaaa
                              </div>
                            ) : (
                              <Input
                                disabled
                                placeholder="Valor..."
                                className="h-8 text-xs bg-gray-50"
                              />
                            )}
                          </div>
                        ) : w.type === "image" ? (
                          <div className="w-full h-full flex items-center justify-center overflow-hidden">
                            {w.content ? (
                              <img
                                src={w.content}
                                alt={w.title || "Imagen"}
                                className="pointer-events-none"
                                style={{
                                  width: w.imageConfig?.width
                                    ? `${w.imageConfig.width}px`
                                    : "100%",
                                  height: w.imageConfig?.height
                                    ? `${w.imageConfig.height}px`
                                    : "100%",
                                  objectFit:
                                    w.imageConfig?.objectFit || "contain",
                                }}
                              />
                            ) : (
                              <div className="text-sm text-gray-400">
                                Sin imagen
                              </div>
                            )}
                          </div>
                        ) : w.type === "text" ? (
                          <div className="w-full h-full">
                            <DashboardTextWidget
                              content={w.content || ""}
                              isEditing={true}
                              onContentChange={(newContent) =>
                                setWidgetById(w.id, { content: newContent })
                              }
                            />
                          </div>
                        ) : (
                          <div className="text-sm text-gray-400">Widget</div>
                        )}
                      </div>
                    </div>
                  </>
                </Card>
              );
            }) )}
          </div>
        </div>
      </section>


      {/* Drawer derecho: propiedades del widget */}
      <aside
        className={`admin-editor-drawer admin-editor-drawer-right absolute right-0 top-0 bottom-0 z-40 w-[340px] max-w-[90vw] bg-white border-l border-neutral-200/80 shadow-xl transition-transform duration-300 ease-out flex flex-col ${
          isRightPanelOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="admin-editor-props flex-1 overflow-y-auto p-5 space-y-5">
          <h3 className="text-neutral-800 text-base font-semibold tracking-tight">
            Propiedades
          </h3>
          {selected ? (
            <div className="space-y-4">
              <div>
                <Label htmlFor="titulo">Título</Label>
                <Input
                  id="titulo"
                  value={selected.title}
                  onChange={(e) => updateSelected({ title: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="columnas">Columnas en el grid (vista cliente)</Label>
                <select
                  id="columnas"
                  className="w-full h-9 rounded-md border border-neutral-200 bg-white px-3 text-sm"
                  value={Math.min(4, Math.max(1, selected.gridSpan ?? (selected.type === "kpi" ? 1 : selected.type === "table" ? 2 : 2)))}
                  onChange={(e) =>
                    updateSelected({ gridSpan: parseInt(e.target.value, 10) as 1 | 2 | 4 })
                  }
                >
                  <option value={1}>1 columna</option>
                  <option value={2}>2 columnas</option>
                  <option value={4}>4 columnas (ancho completo)</option>
                </select>
                <p className="text-xs text-neutral-500 mt-1">Vista cliente: grid de 4 columnas; tamaños moldeables.</p>
              </div>
              <div>
                <Label htmlFor="minHeight">Altura mínima (px)</Label>
                <Input
                  id="minHeight"
                  type="number"
                  min={0}
                  placeholder="Ej. 200"
                  className="h-9"
                  value={selected.minHeight ?? ""}
                  onChange={(e) => {
                    const v = e.target.value ? parseInt(e.target.value, 10) : undefined;
                    updateSelected({ minHeight: v && v > 0 ? v : undefined });
                  }}
                />
                <p className="text-xs text-neutral-500 mt-1">Opcional. Altura mínima de la tarjeta en la vista cliente.</p>
              </div>
              {selected.type === "kpi" && (
                <div className="space-y-3 border-t pt-4">
                  <h4 className="font-medium text-sm text-gray-700">KPI — línea secundaria (vista cliente)</h4>
                  <div>
                    <Label htmlFor="kpi-secondary-label">Etiqueta secundaria</Label>
                    <Input
                      id="kpi-secondary-label"
                      placeholder="Ej. Ticket promedio"
                      value={selected.kpiSecondaryLabel ?? ""}
                      onChange={(e) => updateSelected({ kpiSecondaryLabel: e.target.value || undefined })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="kpi-secondary-value">Valor secundario</Label>
                    <Input
                      id="kpi-secondary-value"
                      placeholder="Ej. $ 3.202"
                      value={selected.kpiSecondaryValue ?? ""}
                      onChange={(e) => updateSelected({ kpiSecondaryValue: e.target.value || undefined })}
                    />
                  </div>
                </div>
              )}
              {selected.type === "filter" && (
                <div className="space-y-4 border-t pt-4">
                  <h4 className="font-medium text-sm text-gray-700">
                    Configuración del Filtro
                  </h4>

                  <div>
                    <Label htmlFor="filter-label">Etiqueta Visible</Label>
                    <Input
                      id="filter-label"
                      value={selected.filterConfig?.label || ""}
                      onChange={(e) =>
                        updateSelected({
                          filterConfig: {
                            ...(selected.filterConfig || {
                              field: "",
                              operator: "=",
                              inputType: "text",
                              label: "",
                            }),
                            label: e.target.value,
                          },
                        })
                      }
                      placeholder="Ej. Categoría"
                    />
                  </div>

                  <div>
                    <Label>Campo a Filtrar</Label>
                    <AdminFieldSelector
                      label=""
                      value={selected.filterConfig?.field || ""}
                      onChange={(value) =>
                        updateSelected({
                          filterConfig: {
                            ...(selected.filterConfig || {
                              label: "",
                              operator: "=",
                              inputType: "text",
                              field: "",
                            }),
                            field: value,
                          },
                          // Asegurar que el widget tenga la fuente de datos configurada para que fetchDistinctOptions funcione
                          source: etlData
                            ? {
                                table: etlData.etl.name,
                                etlId: etlData.etl.id,
                                mode: "latest",
                              }
                            : undefined,
                        })
                      }
                      etlData={etlData}
                      fieldType="all"
                      placeholder="Selecciona campo..."
                    />
                  </div>

                  <div>
                    <Label htmlFor="filter-operator">Operador</Label>
                    <select
                      id="filter-operator"
                      value={selected.filterConfig?.operator || "="}
                      onChange={(e) =>
                        updateSelected({
                          filterConfig: {
                            ...(selected.filterConfig || {
                              label: "",
                              field: "",
                              inputType: "text",
                              operator: "=",
                            }),
                            operator: e.target.value,
                          },
                        })
                      }
                      className="w-full text-sm border-gray-300 rounded-md bg-white shadow-sm h-9 px-2"
                    >
                      <option value="=">Igual (=)</option>
                      <option value="ILIKE">Contiene (ILIKE)</option>
                      <option value=">">Mayor (&gt;)</option>
                      <option value="<">Menor (&lt;)</option>
                      <option value=">=">Mayor o igual (&gt;=)</option>
                      <option value="<=">Menor o igual (&lt;=)</option>
                      <option value="!=">Distinto (!=)</option>
                    </select>
                  </div>

                  <div>
                    <Label htmlFor="filter-input-type">Tipo de Control</Label>
                    <select
                      id="filter-input-type"
                      value={selected.filterConfig?.inputType || "text"}
                      onChange={(e) =>
                        updateSelected({
                          filterConfig: {
                            ...(selected.filterConfig || {
                              label: "",
                              field: "",
                              operator: "=",
                              inputType: "text",
                            }),
                            inputType: e.target.value as any,
                          },
                        })
                      }
                      className="w-full text-sm border-gray-300 rounded-md bg-white shadow-sm h-9 px-2"
                    >
                      <option value="text">Texto (Input)</option>
                      <option value="number">Número (Input)</option>
                      <option value="select">Selección (Dropdown)</option>
                      <option value="date">Fecha (Datepicker)</option>
                    </select>
                  </div>
                </div>
              )}

              {selected.type === "image" && (
                <div className="space-y-4 border-t pt-4">
                  <h4 className="font-medium text-sm text-gray-700">
                    Configuración de Imagen
                  </h4>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="img-width">Ancho (px)</Label>
                      <Input
                        id="img-width"
                        type="number"
                        placeholder="Auto"
                        value={selected.imageConfig?.width || ""}
                        onChange={(e) => {
                          const val = e.target.value
                            ? parseInt(e.target.value)
                            : undefined;
                          updateSelected({
                            imageConfig: {
                              ...(selected.imageConfig || {}),
                              width: val,
                            },
                          });
                        }}
                      />
                    </div>
                    <div>
                      <Label htmlFor="img-height">Alto (px)</Label>
                      <Input
                        id="img-height"
                        type="number"
                        placeholder="Auto"
                        value={selected.imageConfig?.height || ""}
                        onChange={(e) => {
                          const val = e.target.value
                            ? parseInt(e.target.value)
                            : undefined;
                          updateSelected({
                            imageConfig: {
                              ...(selected.imageConfig || {}),
                              height: val,
                            },
                          });
                        }}
                      />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="img-fit">Ajuste (Object Fit)</Label>
                    <select
                      id="img-fit"
                      value={selected.imageConfig?.objectFit || "contain"}
                      onChange={(e) =>
                        updateSelected({
                          imageConfig: {
                            ...(selected.imageConfig || {}),
                            objectFit: e.target.value as any,
                          },
                        })
                      }
                      className="w-full text-sm border-gray-300 rounded-md bg-white shadow-sm h-9 px-2"
                    >
                      <option value="contain">Contener (Contain)</option>
                      <option value="cover">Cubrir (Cover)</option>
                      <option value="fill">Estirar (Fill)</option>
                      <option value="none">Ninguno (None)</option>
                      <option value="scale-down">Reducir (Scale Down)</option>
                    </select>
                  </div>

                  <div>
                    <Label htmlFor="image-upload">Subir Imagen</Label>
                    <Input
                      id="image-upload"
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          handleImageUpload(selected.id, file);
                        }
                      }}
                      className="cursor-pointer"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Formatos soportados: JPG, PNG, GIF, WebP
                    </p>
                  </div>

                  {selected.content && (
                    <div>
                      <Label htmlFor="image-url">URL de la Imagen</Label>
                      <Input
                        id="image-url"
                        value={selected.content}
                        readOnly
                        className="bg-gray-50 text-xs"
                      />
                    </div>
                  )}
                </div>
              )}

              {(selected.type === "pie" || selected.type === "doughnut") && (
                <div className="space-y-2">
                  <Label className="text-sm">Etiquetas del gráfico</Label>
                  <select
                    value={selected.labelDisplayMode || "percent"}
                    onChange={(e) =>
                      updateSelected({
                        labelDisplayMode: e.target.value as "percent" | "value",
                      })
                    }
                    className="w-full text-sm border-gray-300 rounded-md bg-white shadow-sm h-9 px-2"
                  >
                    <option value="percent">Porcentaje</option>
                    <option value="value">Valor</option>
                  </select>
                </div>
              )}

              {[
                "bar",
                "horizontalBar",
                "line",
                "pie",
                "doughnut",
                "combo",
              ].includes(selected.type) && (
                <div className="space-y-3 border-t pt-4">
                  <div className="font-medium text-sm text-gray-700">
                    Color del Widget
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="relative group">
                      <input
                        type="color"
                        value={selected.color || "#10b981"}
                        onChange={(e) => {
                          updateSelected({ color: e.target.value });
                        }}
                        className="w-10 h-10 p-0 border-0 rounded-md overflow-hidden cursor-pointer shadow-sm"
                      />
                    </div>
                    {selected.color && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => updateSelected({ color: undefined })}
                        className="text-xs text-red-500 hover:text-red-700 h-8"
                      >
                        Restablecer
                      </Button>
                    )}
                  </div>
                  <div className="text-[10px] text-gray-400">
                    Selecciona un color principal para el gráfico.
                  </div>
                </div>
              )}

              {selected.type !== "filter" && (
                <div className="space-y-3 border-t pt-4">
                  <div className="font-medium text-sm text-gray-700 mb-2">
                    Datos del ETL
                  </div>

                  {etlError && (
                    <div className="p-3 rounded-md border border-red-200 bg-red-50 flex flex-col gap-2">
                      <span className="text-xs text-red-700 font-medium">
                        Error de Conexión
                      </span>
                      <span className="text-xs text-red-600">{etlError}</span>
                    </div>
                  )}

                  {!etlError && etlData && (
                    <div className="p-2 rounded-lg bg-green-50 text-xs text-green-700 border border-green-100 flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-green-500" />
                      <span
                        className="truncate flex-1"
                        title={etlData.etl.name}
                      >
                        {etlData.etl.name}
                      </span>
                    </div>
                  )}

                  {!etlError && !etlData && (
                    <div className="p-2 rounded-lg bg-amber-50 text-xs text-amber-700 border border-amber-100">
                      No hay ETL conectado
                    </div>
                  )}

                  <Button
                    className="w-full mt-2"
                    onClick={() => loadETLDataIntoWidget(selected.id)}
                    disabled={!etlData || etlLoading}
                  >
                    Cargar y Procesar Datos
                  </Button>

                  {etlData && (
                    <div className="space-y-4 border-t pt-4 mt-4">
                      <div className="flex items-center justify-between">
                        <Label
                          htmlFor="agg-enabled"
                          className="font-medium text-gray-700 cursor-pointer"
                        >
                          Agregación de Datos
                        </Label>
                        <Checkbox
                          id="agg-enabled"
                          checked={!!selected.aggregationConfig?.enabled}
                          onCheckedChange={(checked) =>
                            updateSelected({
                              aggregationConfig: {
                                ...(selected.aggregationConfig || {
                                  metrics: [],
                                }),
                                enabled: !!checked,
                              },
                            })
                          }
                        />
                      </div>
                      {selected.aggregationConfig?.enabled && (
                        <div className="space-y-4 p-3 bg-gray-50 rounded-lg border">
                          <AdminFieldSelector
                            label="Agrupar por (Dimensión)"
                            value={selected.aggregationConfig.dimension || ""}
                            onChange={(value) =>
                              updateSelected({
                                aggregationConfig: {
                                  ...selected.aggregationConfig!,
                                  dimension: value,
                                },
                              })
                            }
                            etlData={etlData}
                            fieldType="all"
                            placeholder="Opcional: agrupar por..."
                          />
                          <div>
                            <Label>Métricas (Cálculos)</Label>
                            <div className="space-y-2 mt-1">
                              {selected.aggregationConfig.metrics.map(
                                (metric, index) => (
                                  <div
                                    key={metric.id}
                                    className="p-2 border rounded-md bg-white space-y-2"
                                  >
                                    {/* Reubicado: primero operación, debajo el campo para mejor visibilidad */}
                                    <div className="space-y-2">
                                      <div>
                                        <select
                                          value={metric.func}
                                          onChange={(e) => {
                                            const newMetrics = [
                                              ...selected.aggregationConfig!
                                                .metrics,
                                            ];
                                            newMetrics[index].func = e.target
                                              .value as AggregationMetricFunc;
                                            updateSelected({
                                              aggregationConfig: {
                                                ...selected.aggregationConfig!,
                                                metrics: newMetrics,
                                              },
                                            });
                                          }}
                                          className="w-full text-sm border-gray-300 rounded-md bg-white shadow-sm"
                                        >
                                          <option value="SUM">
                                            Suma (SUM)
                                          </option>
                                          <option value="AVG">
                                            Promedio (AVG)
                                          </option>
                                          <option value="COUNT">
                                            Conteo (COUNT)
                                          </option>
                                          <option value="MIN">
                                            Mínimo (MIN)
                                          </option>
                                          <option value="MAX">
                                            Máximo (MAX)
                                          </option>
                                          <option value="COUNT(DISTINCT">
                                            Conteo Único
                                          </option>
                                        </select>
                                      </div>
                                      <AdminFieldSelector
                                        label="Campo"
                                        value={metric.field}
                                        onChange={(value) => {
                                          const newMetrics = [
                                            ...selected.aggregationConfig!
                                              .metrics,
                                          ];
                                          newMetrics[index].field = value;
                                          updateSelected({
                                            aggregationConfig: {
                                              ...selected.aggregationConfig!,
                                              metrics: newMetrics,
                                            },
                                          });
                                        }}
                                        etlData={etlData}
                                        fieldType={
                                          metric.allowStringAsNumeric
                                            ? "all"
                                            : "numeric"
                                        }
                                        placeholder="Campo..."
                                      />
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <Input
                                        value={metric.alias}
                                        onChange={(e) => {
                                          const newMetrics = [
                                            ...selected.aggregationConfig!
                                              .metrics,
                                          ];
                                          newMetrics[index].alias =
                                            e.target.value;
                                          updateSelected({
                                            aggregationConfig: {
                                              ...selected.aggregationConfig!,
                                              metrics: newMetrics,
                                            },
                                          });
                                        }}
                                        placeholder="Alias (e.g., total_ventas)"
                                        className="text-sm"
                                      />
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => {
                                          const newMetrics =
                                            selected.aggregationConfig!.metrics.filter(
                                              (_, i) => i !== index
                                            );
                                          updateSelected({
                                            aggregationConfig: {
                                              ...selected.aggregationConfig!,
                                              metrics: newMetrics,
                                            },
                                          });
                                        }}
                                      >
                                        <Trash2 className="h-4 w-4 text-red-500" />
                                      </Button>
                                    </div>
                                    <div className="grid grid-cols-3 gap-2 items-end">
                                      <div className="flex items-center gap-2 col-span-3">
                                        <Checkbox
                                          id={`allow-non-numeric-${metric.id}`}
                                          checked={
                                            !!metric.allowStringAsNumeric
                                          }
                                          onCheckedChange={(checked) => {
                                            const newMetrics = [
                                              ...selected.aggregationConfig!
                                                .metrics,
                                            ];
                                            newMetrics[
                                              index
                                            ].allowStringAsNumeric = !!checked;
                                            if (
                                              checked &&
                                              !newMetrics[index].numericCast
                                            ) {
                                              newMetrics[index].numericCast =
                                                "sanitize";
                                            }
                                            updateSelected({
                                              aggregationConfig: {
                                                ...selected.aggregationConfig!,
                                                metrics: newMetrics,
                                              },
                                            });
                                          }}
                                        />
                                        <Label
                                          htmlFor={`allow-non-numeric-${metric.id}`}
                                          className="text-xs"
                                        >
                                          Permitir campos no numéricos
                                        </Label>
                                      </div>
                                      <div className="flex flex-col gap-1 col-span-3">
                                        <Label className="text-xs">
                                          Casteo numérico
                                        </Label>
                                        <select
                                          value={metric.numericCast || "none"}
                                          onChange={(e) => {
                                            const newMetrics = [
                                              ...selected.aggregationConfig!
                                                .metrics,
                                            ];
                                            newMetrics[index].numericCast = e
                                              .target.value as any;
                                            updateSelected({
                                              aggregationConfig: {
                                                ...selected.aggregationConfig!,
                                                metrics: newMetrics,
                                              },
                                            });
                                          }}
                                          className="w-full text-sm border-gray-300 rounded-md bg-white shadow-sm"
                                        >
                                          <option value="none">Ninguno</option>
                                          <option value="numeric">
                                            ::numeric (simple)
                                          </option>
                                          <option value="sanitize">
                                            Sanitizar y convertir
                                          </option>
                                        </select>
                                        <div className="text-[10px] text-gray-500">
                                          "Sanitizar" elimina símbolos y
                                          convierte.
                                        </div>
                                      </div>
                                    </div>
                                    <div className="grid grid-cols-3 gap-2 items-end">
                                      <div className="flex flex-col gap-1">
                                        <Label className="text-xs">
                                          Conversión
                                        </Label>
                                        <select
                                          value={
                                            metric.conversionType || "none"
                                          }
                                          onChange={(e) => {
                                            const newMetrics = [
                                              ...selected.aggregationConfig!
                                                .metrics,
                                            ];
                                            newMetrics[index].conversionType = e
                                              .target.value as any;
                                            updateSelected({
                                              aggregationConfig: {
                                                ...selected.aggregationConfig!,
                                                metrics: newMetrics,
                                              },
                                            });
                                          }}
                                          className="w-full text-sm border-gray-300 rounded-md bg-white shadow-sm"
                                        >
                                          <option value="none">Ninguna</option>
                                          <option value="multiply">
                                            Multiplicar
                                          </option>
                                          <option value="divide">
                                            Dividir
                                          </option>
                                        </select>
                                      </div>
                                      <div className="flex flex-col gap-1">
                                        <Label className="text-xs">
                                          Factor
                                        </Label>
                                        <Input
                                          type="number"
                                          step="any"
                                          value={
                                            metric.conversionFactor ===
                                            undefined
                                              ? 1
                                              : metric.conversionFactor
                                          }
                                          disabled={
                                            (metric.conversionType ||
                                              "none") === "none"
                                          }
                                          onChange={(e) => {
                                            const factor = Number(
                                              e.target.value
                                            );
                                            const newMetrics = [
                                              ...selected.aggregationConfig!
                                                .metrics,
                                            ];
                                            newMetrics[index].conversionFactor =
                                              isNaN(factor) ? 1 : factor;
                                            updateSelected({
                                              aggregationConfig: {
                                                ...selected.aggregationConfig!,
                                                metrics: newMetrics,
                                              },
                                            });
                                          }}
                                          className="text-sm"
                                        />
                                      </div>
                                      <div className="flex flex-col gap-1">
                                        <Label className="text-xs">
                                          Decimales
                                        </Label>
                                        <Input
                                          type="number"
                                          min={0}
                                          value={
                                            typeof metric.precision === "number"
                                              ? metric.precision
                                              : ""
                                          }
                                          placeholder="Auto"
                                          onChange={(e) => {
                                            const p = Number(e.target.value);
                                            const newMetrics = [
                                              ...selected.aggregationConfig!
                                                .metrics,
                                            ];
                                            newMetrics[index].precision = isNaN(
                                              p
                                            )
                                              ? undefined
                                              : Math.max(0, Math.floor(p));
                                            updateSelected({
                                              aggregationConfig: {
                                                ...selected.aggregationConfig!,
                                                metrics: newMetrics,
                                              },
                                            });
                                          }}
                                          className="text-sm"
                                        />
                                      </div>
                                    </div>
                                  </div>
                                )
                              )}
                              <Button
                                variant="outline"
                                className="w-full"
                                onClick={() => {
                                  const currentConfig =
                                    selected.aggregationConfig || {
                                      enabled: true,
                                      metrics: [],
                                    };
                                  const newMetric: AggregationMetric = {
                                    id: `m-${Date.now()}`,
                                    func: "SUM",
                                    field: "",
                                    alias: "",
                                    conversionType: "none",
                                    conversionFactor: 1,
                                  };
                                  updateSelected({
                                    aggregationConfig: {
                                      ...currentConfig,
                                      metrics: [
                                        ...currentConfig.metrics,
                                        newMetric,
                                      ],
                                    },
                                  });
                                }}
                              >
                                + Añadir Métrica
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-500">
              Selecciona un widget para editar sus propiedades.
            </p>
          )}
        </div>
      </aside>
      {isShareModalOpen && clientId && (
        <AdminShareDashboardModal
          dashboardId={dashboardId}
          clientId={clientId}
          open={isShareModalOpen}
          onOpenChange={(open) => {
            console.debug("[AdminDashboardEditor] Share modal open change", {
              open,
            });
            setIsShareModalOpen(open);
          }}
        />
      )}
      <AdminClientSelectionModal
        open={isClientModalOpen}
        onOpenChange={setIsClientModalOpen}
        onSelect={async (newId) => {
          await handleSaveDashboard(newId);
        }}
      />
      <ChangeDashboardEtlDialog
        open={isChangeEtlModalOpen}
        onOpenChange={setIsChangeEtlModalOpen}
        dashboardId={dashboardId}
        currentEtlId={etlData?.etl?.id}
        onSuccess={() => {
          console.log(
            "[AdminDashboardEditor] ChangeDashboardEtlDialog onSuccess triggered - Refetching data"
          );
          refetchEtlData();
        }}
      />
    </div>
  );
}

export default AdminDashboardEditor;
