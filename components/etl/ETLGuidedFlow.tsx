"use client";

import { useState, useEffect, useCallback, useImperativeHandle, forwardRef, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Database,
  Filter,
  Table,
  Play,
  CheckCircle2,
  ChevronRight,
  LayoutDashboard,
  Loader2,
  Sparkles,
  Link2,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  X,
  Plus,
  RotateCcw,
  List,
  RefreshCw,
} from "lucide-react";
import { Connection as ServerConnection } from "@/components/connections/ConnectionsCard";
import { Select } from "@/components/ui/Select";
import { toast } from "sonner";

const STEPS = [
  { id: "conexion", label: "Conexión", icon: Link2 },
  { id: "origen", label: "Origen", icon: Database },
  { id: "filtros", label: "Columnas y filtros", icon: Filter },
  { id: "columnas_tipos", label: "Columnas y tipos", icon: List },
  { id: "transformacion", label: "Transformación", icon: Sparkles },
  { id: "destino", label: "Destino", icon: Table },
  { id: "ejecutar", label: "Ejecutar", icon: Play },
] as const;

type StepId = (typeof STEPS)[number]["id"];

/** Mapea data_type de BD o tipo inferido a etiqueta legible para la UI. */
function dataTypeToLabel(dataType: string | undefined): "Fecha" | "Número" | "Texto" {
  if (!dataType) return "Texto";
  const d = String(dataType).toLowerCase();
  if (d === "fecha" || ["date", "timestamp", "timestamptz", "datetime", "time"].some((t) => d.includes(t))) return "Fecha";
  if (d === "número" || d === "numero" || ["int", "integer", "bigint", "smallint", "numeric", "decimal", "float", "double", "real"].some((t) => d.includes(t))) return "Número";
  return "Texto";
}

const DATE_FORMAT_OPTIONS = [
  { value: "", label: "(por defecto)" },
  { value: "DD/MM/YYYY", label: "DD/MM/YYYY" },
  { value: "MM/DD/YYYY", label: "MM/DD/YYYY" },
  { value: "YYYY-MM-DD", label: "YYYY-MM-DD (ISO)" },
  { value: "DD-MM-YYYY", label: "DD-MM-YYYY" },
  { value: "DD MMM YYYY", label: "DD MMM YYYY" },
];

const NUMBER_FORMAT_OPTIONS = [
  { value: "", label: "(por defecto)" },
  { value: "general", label: "General" },
  { value: "number", label: "Número" },
  { value: "currency", label: "Moneda" },
  { value: "percent", label: "Porcentaje" },
];

const TEXT_FORMAT_OPTIONS = [
  { value: "", label: "(por defecto)" },
  { value: "text", label: "Texto" },
];

const TIPO_OPTIONS: { value: "Fecha" | "Número" | "Texto"; label: string }[] = [
  { value: "Fecha", label: "Fecha" },
  { value: "Número", label: "Número" },
  { value: "Texto", label: "Texto" },
];

const NORMALIZE_OPTIONS = [
  { value: "", label: "(ninguna)" },
  { value: "trim", label: "Recortar espacios" },
  { value: "upper", label: "Mayúsculas" },
  { value: "lower", label: "Minúsculas" },
  { value: "normalize_spaces", label: "Espacios múltiples → uno" },
  { value: "strip_invisible", label: "Quitar caracteres invisibles" },
  { value: "utf8_normalize", label: "Normalizar UTF-8" },
  { value: "replace", label: "Reemplazar texto" },
];

async function fetchMetadata(connectionId: string | number, tableName?: string): Promise<Response> {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 35000);
  try {
    return await fetch("/api/connection/metadata", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(tableName ? { connectionId, tableName } : { connectionId }),
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(to);
  }
}

export type ETLGuidedFlowHandle = {
  goToEjecutar: () => void;
  /** Devuelve la configuración actual del flujo (mismo formato que se envía al ejecutar) */
  getGuidedConfig: () => Record<string, unknown> | null;
  /** Guarda la configuración actual en el ETL (layout.guided_config) */
  saveGuidedConfig: () => Promise<boolean>;
  /** Indica si se puede ejecutar el ETL (conexión, tabla, columnas, destino válido) */
  getCanRun: () => boolean;
  /** Ejecuta el ETL si la configuración es válida (mismo efecto que el botón "Ejecutar ETL") */
  run: () => void;
};

/** Configuración guardada al ejecutar (layout.guided_config) para cargar al editar */
export type GuidedConfig = {
  connectionId?: string | number | null;
  filter?: {
    table?: string;
    columns?: string[];
    conditions?: Array<{ column: string; operator: string; value?: string }>;
    /** Columna usada en "Excluir filas" para cargar valores y marcar excluidos */
    excludeRowsColumn?: string;
    /** Nombres para mostrar, formato y tipo override por columna (ej. fecha: DD/MM/YYYY; type: Fecha|Número|Texto). */
    columnDisplay?: Record<string, { label?: string; format?: string; type?: "Fecha" | "Número" | "Texto" }>;
    /** Columnas para formar la clave única (KEY) por concatenación, como el Grain del Dataset de Métricas */
    keyColumns?: string[];
  };
  union?: {
    left?: { connectionId?: string | number; filter?: { table?: string; columns?: string[]; conditions?: unknown[] } };
    rights?: Array<{ connectionId: string | number; filter?: { table?: string; columns?: string[] } }>;
    right?: { connectionId: string | number; filter?: { table?: string; columns?: string[] } };
    unionAll?: boolean;
  };
  join?: {
    primaryConnectionId?: string | number;
    primaryTable?: string;
    joins?: Array<{
      id?: string;
      secondaryConnectionId?: string | number;
      secondaryTable?: string;
      joinType?: "INNER" | "LEFT" | "RIGHT" | "FULL";
      primaryColumn?: string;
      secondaryColumn?: string;
      secondaryColumns?: string[];
    }>;
  };
  clean?: {
    transforms?: Array<{ column: string; op: string; find?: string; replaceWith?: string; patterns?: string[]; action?: string; replacement?: string }>;
    dedupe?: { keyColumns?: string[]; keep?: "first" | "last" };
  };
  end?: { target?: { table?: string }; mode?: "overwrite" | "append" };
  /** Frecuencia de actualización automática (15m, 1h, 6h, 12h, 24h, 1w, 1M). */
  schedule?: { frequency?: string; lastRunAt?: string };
};

type Props = {
  etlId: string;
  connections: ServerConnection[];
  initialStep?: StepId;
  /** Si existe, se usa para inicializar todo el estado del flujo (al editar un ETL ya configurado) */
  initialGuidedConfig?: GuidedConfig | null;
};

const ETLGuidedFlowInner = forwardRef<ETLGuidedFlowHandle, Props>(function ETLGuidedFlowInner({ etlId, connections, initialStep = "conexion", initialGuidedConfig }, ref) {
  const router = useRouter();
  const [step, setStep] = useState<StepId>(initialStep);
  const [connectionId, setConnectionId] = useState<string | number | null>(null);
  const [tables, setTables] = useState<{ schema: string; name: string; columns: { name: string }[] }[]>([]);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [columns, setColumns] = useState<string[]>([]);
  /** Por cada columna: nombre para mostrar, formato y tipo (override manual). */
  const [columnDisplay, setColumnDisplay] = useState<Record<string, { label: string; format: string; type?: "Fecha" | "Número" | "Texto" }>>({});
  const [conditions, setConditions] = useState<Array<{ column: string; operator: string; value?: string }>>([]);
  /** Excluir filas por valores: por cada columna, lista de valores a excluir (NOT IN) */
  const [excludedValues, setExcludedValues] = useState<Array<{ column: string; excluded: string[] }>>([]);
  const [distinctColumn, setDistinctColumn] = useState<string | null>(null);
  const [distinctValuesList, setDistinctValuesList] = useState<string[]>([]);
  const [loadingDistinct, setLoadingDistinct] = useState(false);
  const [distinctSearch, setDistinctSearch] = useState("");
  /** Columnas para formar la KEY (clave única) por concatenación, como el Grain en Dataset de Métricas */
  const [keyColumns, setKeyColumns] = useState<string[]>([]);
  const [outputTableName, setOutputTableName] = useState("");
  const [outputMode, setOutputMode] = useState<"overwrite" | "append">("overwrite");
  const [scheduleFrequency, setScheduleFrequency] = useState<string>("");
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [loadingColumns, setLoadingColumns] = useState<string | null>(null);
  const [inferringTypes, setInferringTypes] = useState(false);
  const [running, setRunning] = useState(false);
  const [, setRunId] = useState<string | null>(null);
  const [runSuccess, setRunSuccess] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);

  // Transformación (limpieza y calidad) — mismo modelo que el nodo Clean del editor avanzado
  const [nullCleanup, setNullCleanup] = useState<{
    patterns: string[];
    action: "null" | "replace";
    replacement?: string;
    columns: string[];
  } | null>(null);
  const defaultNullPatterns = useMemo(() => ["NA", "-", ".", ""], []);
  /** Valores predefinidos que se pueden marcar como "vacíos". El value es el texto exacto a comparar (vacío = string vacío). */
  const NULL_PRESET_OPTIONS: { value: string; label: string }[] = [
    { value: "", label: "(vacío)" },
    { value: "NA", label: "NA" },
    { value: "N/A", label: "N/A" },
    { value: "-", label: "-" },
    { value: ".", label: "." },
    { value: "n/d", label: "n/d" },
    { value: "N/D", label: "N/D" },
    { value: "null", label: "null" },
    { value: "#N/A", label: "#N/A" },
    { value: "ND", label: "ND" },
  ];
  const [customNullValue, setCustomNullValue] = useState("");
  const [cleanTransforms, setCleanTransforms] = useState<Array<{ column: string; op: string; find?: string; replaceWith?: string }>>([]);
  const [bulkNormalizeOp, setBulkNormalizeOp] = useState("");
  const [dataFixes, setDataFixes] = useState<Array<{ column: string; find: string; replaceWith: string }>>([]);
  const [dedupe, setDedupe] = useState<{ keyColumns: string[]; keep: "first" | "last" } | null>(null);

  // UNION (opcional): múltiples tablas a apilar + columnas por tabla
  const [useUnion, setUseUnion] = useState(false);
  const [unionRightConnectionId, setUnionRightConnectionId] = useState<string | number | null>(null);
  const [unionRightTable, setUnionRightTable] = useState<string | null>(null);
  const [unionAll, setUnionAll] = useState(true);
  const [unionRightTables, setUnionRightTables] = useState<{ schema: string; name: string; columns?: { name: string }[] }[]>([]);
  const [loadingUnionMeta, setLoadingUnionMeta] = useState(false);
  /** Lista de tablas añadidas para UNION: cada una con connectionId, table y columnas a traer */
  const [unionRightItems, setUnionRightItems] = useState<Array<{ connectionId: string | number; table: string; columns: string[]; availableColumns?: { name: string }[] }>>([]);

  // JOIN (opcional): múltiples tablas + columnas por tabla
  const [useJoin, setUseJoin] = useState(false);
  const [joinSecondaryConnectionId, setJoinSecondaryConnectionId] = useState<string | number | null>(null);
  const [joinSecondaryTable, setJoinSecondaryTable] = useState<string | null>(null);
  const [joinType, setJoinType] = useState<"INNER" | "LEFT" | "RIGHT" | "FULL">("INNER");
  const [joinLeftColumn, setJoinLeftColumn] = useState<string>("");
  const [joinRightColumn, setJoinRightColumn] = useState<string>("");
  const [joinRightTables, setJoinRightTables] = useState<{ schema: string; name: string; columns?: { name: string }[] }[]>([]);
  const [joinRightColumns, setJoinRightColumns] = useState<string[]>([]);
  const [loadingJoinMeta, setLoadingJoinMeta] = useState(false);
  /** Lista de tablas añadidas para JOIN: cada una con connectionId, table, joinType, leftColumn, rightColumn, rightColumns */
  const [joinItems, setJoinItems] = useState<Array<{
    id: string;
    connectionId: string | number;
    table: string;
    joinType: "INNER" | "LEFT" | "RIGHT" | "FULL";
    leftColumn: string;
    rightColumn: string;
    rightColumns: string[];
    availableColumns?: { name: string }[];
  }>>([]);

  const [previewRows, setPreviewRows] = useState<Record<string, unknown>[] | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewRowsProcessed, setPreviewRowsProcessed] = useState<number | null>(null);
  const [previewSortKey, setPreviewSortKey] = useState<string | null>(null);
  const [previewSortDir, setPreviewSortDir] = useState<"asc" | "desc">("asc");
  const previewAbortRef = useRef<AbortController | null>(null);
  const previewLoadedOnceRef = useRef<boolean>(false);

  const previewRowsFilteredByExcluded = useMemo(() => {
    if (!previewRows || previewRows.length === 0) return previewRows ?? [];
    if (excludedValues.length === 0) return previewRows;
    return previewRows.filter((row) => {
      const r = row as Record<string, unknown>;
      for (const { column, excluded } of excludedValues) {
        if (excluded.length === 0) continue;
        const key = Object.keys(r).find((k) => k.toLowerCase() === column.toLowerCase()) ?? column;
        const val = String(r[key] ?? "").trim();
        if (excluded.some((ex) => String(ex).trim() === val)) return false;
      }
      return true;
    });
  }, [previewRows, excludedValues]);

  const previewDisplayRows = useMemo(() => {
    if (!previewRowsFilteredByExcluded.length) return previewRowsFilteredByExcluded;
    if (!previewSortKey) return previewRowsFilteredByExcluded;
    const key = previewSortKey;
    const dir = previewSortDir === "asc" ? 1 : -1;
    return [...previewRowsFilteredByExcluded].sort((a, b) => {
      const va = (a as Record<string, unknown>)[key];
      const vb = (b as Record<string, unknown>)[key];
      const na = typeof va === "number" ? va : Number(va);
      const nb = typeof vb === "number" ? vb : Number(vb);
      if (!Number.isNaN(na) && !Number.isNaN(nb)) return (na - nb) * dir;
      const sa = String(va ?? "");
      const sb = String(vb ?? "");
      return sa.localeCompare(sb, undefined, { numeric: true }) * dir;
    });
  }, [previewRowsFilteredByExcluded, previewSortKey, previewSortDir]);

  const handlePreviewSort = useCallback((key: string) => {
    setPreviewSortKey((prev) => {
      if (prev === key) {
        setPreviewSortDir((d) => (d === "asc" ? "desc" : "asc"));
        return key;
      }
      setPreviewSortDir("asc");
      return key;
    });
  }, []);

  const skipClearSelectedTableRef = useRef(false);
  const restoringFromConfigRef = useRef(false);
  // Restaurar estado desde configuración guardada (al editar un ETL ya ejecutado)
  useEffect(() => {
    const cfg = initialGuidedConfig as GuidedConfig | undefined | null;
    restoringFromConfigRef.current = true;
    if (!cfg || typeof cfg !== "object") return;
    const connId = cfg.connectionId ?? (cfg.union?.left as { connectionId?: string | number })?.connectionId ?? (cfg.join as { primaryConnectionId?: string | number })?.primaryConnectionId;
    if (connId != null && typeof connId !== "object") setConnectionId(connId);
    const filter = cfg.filter;
    if (filter?.table != null && String(filter.table).trim() !== "") {
      skipClearSelectedTableRef.current = true;
      setSelectedTable(String(filter.table).trim());
    }
    const cols = filter?.columns;
    if (Array.isArray(cols) && cols.length > 0) {
      const primaryCols = cols.filter((c: string) => c.startsWith("primary.")).map((c: string) => c.replace(/^primary\./, ""));
      setColumns(primaryCols.length > 0 ? primaryCols : cols);
    }
    const conds = filter?.conditions ?? [];
    const notInConds = conds.filter((c: { operator?: string }) => c.operator === "not in");
    const restConds = conds.filter((c: { operator?: string }) => c.operator !== "not in");
    if (restConds.length > 0) setConditions(restConds);
    if (notInConds.length > 0) setExcludedValues(notInConds.map((c: { column: string; value?: string }) => ({ column: c.column, excluded: (c.value ?? "").split(",").filter(Boolean) })));
    const excludeRowsCol = (filter as { excludeRowsColumn?: string })?.excludeRowsColumn ?? notInConds[0]?.column;
    if (excludeRowsCol && typeof excludeRowsCol === "string") setDistinctColumn(excludeRowsCol.trim());
    const colDisp = (filter as { columnDisplay?: Record<string, { label?: string; format?: string; type?: string }> })?.columnDisplay;
    if (colDisp && typeof colDisp === "object") {
      const next: Record<string, { label: string; format: string; type?: "Fecha" | "Número" | "Texto" }> = {};
      const validTypes = ["Fecha", "Número", "Texto"] as const;
      for (const [k, v] of Object.entries(colDisp)) {
        if (v && (v.label !== undefined || v.format !== undefined || v.type !== undefined))
          next[k] = {
            label: v.label ?? "",
            format: v.format ?? "",
            ...(v.type && (validTypes as readonly string[]).includes(v.type) ? { type: v.type as "Fecha" | "Número" | "Texto" } : {}),
          };
      }
      setColumnDisplay(next);
    }
    if (filter && Array.isArray(filter.keyColumns)) setKeyColumns(filter.keyColumns);
    const end = cfg.end;
    if (end?.target?.table) setOutputTableName(end.target.table);
    if (end?.mode) setOutputMode(end.mode);
    const sched = cfg.schedule;
    setScheduleFrequency(sched?.frequency ? String(sched.frequency) : "");
    const union = cfg.union;
    if (union) {
      setUseUnion(true);
      setUnionAll(union.unionAll !== false);
      const rights = union.rights ?? (union.right ? [union.right] : []);
      setUnionRightItems(rights.map((r: { connectionId: string | number; filter?: { table?: string; columns?: string[] } }) => ({
        connectionId: r.connectionId,
        table: r.filter?.table ?? "",
        columns: r.filter?.columns ?? [],
      })));
    }
    const join = cfg.join;
    if (join?.joins?.length) {
      setUseJoin(true);
      type JoinItem = { id?: string; secondaryConnectionId?: string | number; secondaryTable?: string; joinType?: string; primaryColumn?: string; secondaryColumn?: string; secondaryColumns?: string[] };
      setJoinItems(join.joins.map((j: JoinItem, i: number) => ({
        id: j.id ?? `join_${i}_${Date.now()}`,
        connectionId: j.secondaryConnectionId ?? "",
        table: j.secondaryTable ?? "",
        joinType: (j.joinType ?? "INNER") as "INNER" | "LEFT" | "RIGHT" | "FULL",
        leftColumn: j.primaryColumn ?? "",
        rightColumn: j.secondaryColumn ?? "",
        rightColumns: j.secondaryColumns ?? [],
      })));
    }
    const clean = cfg.clean;
    if (clean) {
      const transforms = clean.transforms ?? [];
      const nullNorms = transforms.filter((t: { op?: string }) => t.op === "normalize_nulls");
      if (nullNorms.length > 0) {
        const first = nullNorms[0] as { patterns?: string[]; action?: string; replacement?: string; column?: string };
        setNullCleanup({
          patterns: first.patterns ?? [],
          action: (first.action === "replace" ? "replace" : "null") as "null" | "replace",
          replacement: first.replacement,
          columns: nullNorms.map((t: { column?: string }) => t.column).filter((c): c is string => Boolean(c)),
        });
      }
      type TransformItem = { column?: string; op?: string; find?: string; replaceWith?: string };
      setCleanTransforms(transforms.filter((t: { op?: string }) => t.op && !["normalize_nulls", "replace_value"].includes(t.op)).map((t: TransformItem) => ({ column: t.column ?? "", op: t.op ?? "", find: t.find, replaceWith: t.replaceWith })));
      setDataFixes(transforms.filter((t: { op?: string }) => t.op === "replace_value").map((t: TransformItem) => ({ column: t.column ?? "", find: t.find ?? "", replaceWith: t.replaceWith ?? "" })));
      if (clean.dedupe?.keyColumns?.length) setDedupe({ keyColumns: clean.dedupe.keyColumns, keep: clean.dedupe.keep ?? "first" });
    }
    queueMicrotask(() => {
      restoringFromConfigRef.current = false;
    });
  }, [initialGuidedConfig]);

  // Cargar tablas al elegir conexión
  useEffect(() => {
    if (!connectionId) {
      setTables([]);
      setSelectedTable(null);
      return;
    }
    let cancelled = false;
    setLoadingMeta(true);
    fetchMetadata(connectionId)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled || !data.ok || !data.metadata?.tables) return;
        setTables(data.metadata.tables || []);
        if (!skipClearSelectedTableRef.current) {
          setSelectedTable(null);
          setColumns([]);
        } else {
          skipClearSelectedTableRef.current = false;
        }
      })
      .catch(() => {
        if (!cancelled) toast.error("No se pudo cargar la lista de tablas");
      })
      .finally(() => {
        if (!cancelled) setLoadingMeta(false);
      });
    return () => {
      cancelled = true;
    };
  }, [connectionId]);

  // Cargar columnas al elegir tabla (si la tabla viene con columnas vacías, pedirlas)
  const selectedTableInfo = tables.find(
    (t) => `${t.schema}.${t.name}` === selectedTable
  );

  /** Clave usada en columnDisplay para esta columna (la vista previa puede tener keys en minúsculas). */
  const getColumnDisplayKey = useCallback((previewKey: string): string => {
    if (columnDisplay[previewKey] !== undefined) return previewKey;
    const found = Object.keys(columnDisplay).find((k) => k.toLowerCase() === previewKey.toLowerCase());
    return found ?? previewKey;
  }, [columnDisplay]);

  /** Tipo efectivo por columna (override manual o inferido) para formatear la vista previa. */
  const getColumnType = useCallback((key: string): "Fecha" | "Número" | "Texto" => {
    const disp = columnDisplay[key];
    if (disp?.type) return disp.type;
    const col = selectedTableInfo?.columns?.find((c: { name: string }) => c.name.toLowerCase() === key.toLowerCase());
    return dataTypeToLabel((col as { inferredType?: string; dataType?: string })?.inferredType ?? (col as { dataType?: string })?.dataType);
  }, [columnDisplay, selectedTableInfo?.columns]);

  /** Para fechas ISO en UTC (ej. 2025-10-01T00:00:00.000Z) usa componentes UTC para mostrar la fecha de calendario correcta (1/10, no 30/09 en UTC-3). */
  const dateComponentsForPreview = (date: Date, val: unknown): { d: number; m: number; y: number; monthIndex: number } => {
    const isIsoDateOnly =
      typeof val === "string" &&
      /^\d{4}-\d{2}-\d{2}/.test(val.trim()) &&
      (val.length === 10 || /T00:00:00(\.0*)?Z?$/i.test(val.trim()));
    if (isIsoDateOnly) {
      return { d: date.getUTCDate(), m: date.getUTCMonth() + 1, y: date.getUTCFullYear(), monthIndex: date.getUTCMonth() };
    }
    return { d: date.getDate(), m: date.getMonth() + 1, y: date.getFullYear(), monthIndex: date.getMonth() };
  };

  /** Formatea un valor de celda para la vista previa según tipo y formato de la columna. */
  const formatPreviewCell = useCallback((key: string, value: unknown): string => {
    const disp = columnDisplay[key];
    const format = disp?.format?.trim();
    const tipo = getColumnType(key);
    if (value === null || value === undefined) return "";
    if (tipo === "Fecha" && format) {
      let date: Date | null = null;
      if (value instanceof Date) date = value;
      else if (typeof value === "number") date = value > 1e10 ? new Date(value) : new Date(1899, 11, 30 + (value | 0));
      else if (typeof value === "string") date = new Date(value);
      if (date && !isNaN(date.getTime())) {
        const { d, m, y, monthIndex } = dateComponentsForPreview(date, value);
        const pad = (n: number) => String(n).padStart(2, "0");
        const months = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
        if (format === "DD/MM/YYYY") return `${pad(d)}/${pad(m)}/${y}`;
        if (format === "MM/DD/YYYY") return `${pad(m)}/${pad(d)}/${y}`;
        if (format === "YYYY-MM-DD") return `${y}-${pad(m)}-${pad(d)}`;
        if (format === "DD-MM-YYYY") return `${pad(d)}-${pad(m)}-${y}`;
        if (format === "DD MMM YYYY") return `${pad(d)} ${months[monthIndex]} ${y}`;
      }
    }
    if (tipo === "Número" && (typeof value === "number" || (typeof value === "string" && /^-?\d+([.,]\d+)?$/.test(String(value).trim())))) {
      const num = typeof value === "number" ? value : parseFloat(String(value).replace(",", "."));
      if (!Number.isNaN(num)) {
        if (format === "currency") return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(num);
        if (format === "percent") return new Intl.NumberFormat("es-AR", { style: "percent", minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(num / 100);
        if (format === "number") return new Intl.NumberFormat("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(num);
      }
    }
    return String(value);
  }, [columnDisplay, getColumnType]);

  // Normalizar selectedTable cuando viene de config guardada: si la lista de tablas usa otro casing (ej. public.clientes vs PUBLIC.CLIENTES), usar la clave real para que el <select> muestre la tabla y selectedTableInfo exista
  useEffect(() => {
    if (!selectedTable || tables.length === 0 || selectedTableInfo) return;
    const normalized = tables.find(
      (t) => `${t.schema}.${t.name}`.toLowerCase() === selectedTable.toLowerCase()
    );
    if (normalized) setSelectedTable(`${normalized.schema}.${normalized.name}`);
  }, [tables, selectedTable, selectedTableInfo]);

  // Cargar valores distintos automáticamente al seleccionar la columna en "Excluir filas"
  useEffect(() => {
    if (!distinctColumn || !connectionId || !selectedTable) return;
    setLoadingDistinct(true);
    setDistinctValuesList([]);
    fetch("/api/connection/distinct-values", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connectionId, table: selectedTable, column: distinctColumn }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.ok && Array.isArray(data.values)) setDistinctValuesList(data.values);
        else if (data?.error) toast.error(data.error);
      })
      .catch(() => toast.error("Error al cargar valores"))
      .finally(() => setLoadingDistinct(false));
  }, [distinctColumn, connectionId, selectedTable]);

  const hasColumns = (selectedTableInfo?.columns?.length ?? 0) > 0;

  const loadColumnsForTable = useCallback(() => {
    if (!connectionId || !selectedTable) return;
    setLoadingColumns(selectedTable);
    fetchMetadata(connectionId, selectedTable)
      .then((res) => res.json())
      .then(async (data) => {
        if (!data.ok || !data.metadata?.tables?.length) {
          setLoadingColumns(null);
          return;
        }
        const tablesList = data.metadata.tables as { schema: string; name: string; columns?: { name: string; dataType?: string }[] }[];
        const match = tablesList.find((t: { schema: string; name: string }) => `${t.schema}.${t.name}` === selectedTable)
          ?? tablesList.find((t: { schema: string; name: string }) => `${t.schema}.${t.name}`.toLowerCase() === selectedTable.toLowerCase());
        const tableColumns = match?.columns ?? data.metadata.tables[0]?.columns;
        if (!tableColumns?.length) {
          setLoadingColumns(null);
          return;
        }
        const cols = tableColumns.map((c: { name: string }) => c.name);
        let columnsWithInferred = tableColumns as { name: string; dataType?: string; inferredType?: "Fecha" | "Número" | "Texto" }[];
        try {
          const inferRes = await fetch("/api/connection/infer-column-types", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ connectionId, tableName: selectedTable }),
          });
          const inferJson = await inferRes.json();
          if (inferJson.ok && inferJson.columnTypes && typeof inferJson.columnTypes === "object") {
            const ct = inferJson.columnTypes as Record<string, "Fecha" | "Número" | "Texto">;
            const getInferred = (colName: string) =>
              ct[colName] ?? Object.entries(ct).find(([k]) => k.toLowerCase() === colName.toLowerCase())?.[1];
            columnsWithInferred = tableColumns.map((c: { name: string; dataType?: string }) => ({
              ...c,
              inferredType: (getInferred(c.name) ?? dataTypeToLabel(c.dataType)) as "Fecha" | "Número" | "Texto",
            }));
          }
        } catch (err) {
          console.warn("[ETL] Inferencia de tipos fallida:", err);
          // Si falla la inferencia, se usa solo el tipo del esquema
        }
        setTables((prev) =>
          prev.map((t) =>
            `${t.schema}.${t.name}` === selectedTable
              ? { ...t, columns: columnsWithInferred }
              : t
          )
        );
        setColumns((prev) => (prev.length ? prev : cols));
      })
      .finally(() => setLoadingColumns(null));
  }, [connectionId, selectedTable]);

  useEffect(() => {
    if (selectedTable && !hasColumns && !loadingColumns) loadColumnsForTable();
  }, [selectedTable, hasColumns, loadColumnsForTable, loadingColumns]);

  // Al entrar en "Columnas y tipos", inferir tipos desde los datos si hay columnas (por si se cargaron sin inferencia, p. ej. al editar ETL)
  const didInferOnColumnasTiposRef = useRef<{ connectionId: string | number; table: string } | null>(null);
  useEffect(() => {
    if (step !== "columnas_tipos") {
      didInferOnColumnasTiposRef.current = null;
      return;
    }
    if (!connectionId || !selectedTable || !selectedTableInfo?.columns?.length) return;
    const key = { connectionId: connectionId as string | number, table: selectedTable };
    if (didInferOnColumnasTiposRef.current?.connectionId === key.connectionId && didInferOnColumnasTiposRef.current?.table === key.table) return;
    const tableColumns = selectedTableInfo.columns as { name: string; dataType?: string; inferredType?: string }[];
    const hasInferred = tableColumns.some((c) => c.inferredType != null);
    if (hasInferred) {
      didInferOnColumnasTiposRef.current = key;
      return;
    }
    didInferOnColumnasTiposRef.current = key;
    setInferringTypes(true);
    fetch("/api/connection/infer-column-types", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connectionId, tableName: selectedTable }),
    })
      .then((res) => res.json())
      .then((inferJson) => {
        if (!inferJson.ok || !inferJson.columnTypes || typeof inferJson.columnTypes !== "object") return;
        const ct = inferJson.columnTypes as Record<string, "Fecha" | "Número" | "Texto">;
        const getInferred = (colName: string) =>
          ct[colName] ?? Object.entries(ct).find(([k]) => k.toLowerCase() === colName.toLowerCase())?.[1];
        const columnsWithInferred = tableColumns.map((c) => ({
          ...c,
          inferredType: (getInferred(c.name) ?? dataTypeToLabel(c.dataType)) as "Fecha" | "Número" | "Texto",
        }));
        setTables((prev) =>
          prev.map((t) =>
            `${t.schema}.${t.name}` === selectedTable ? { ...t, columns: columnsWithInferred } : t
          )
        );
      })
      .catch((err) => console.warn("[ETL] Inferencia de tipos al entrar al paso:", err))
      .finally(() => setInferringTypes(false));
  }, [step, connectionId, selectedTable, selectedTableInfo?.columns, selectedTableInfo?.columns?.length]);

  // Reset transformación al cambiar conexión o tabla (no cuando acabamos de restaurar desde config)
  useEffect(() => {
    if (restoringFromConfigRef.current) return;
    setNullCleanup(null);
    setCleanTransforms([]);
    setDataFixes([]);
    setDedupe(null);
  }, [connectionId, selectedTable]);

  // Reset excluir por valores al cambiar tabla (no cuando acabamos de restaurar desde config)
  useEffect(() => {
    if (restoringFromConfigRef.current) return;
    setExcludedValues([]);
    setDistinctColumn(null);
    setDistinctValuesList([]);
    setDistinctSearch("");
  }, [connectionId, selectedTable]);

  // Cargar availableColumns para ítems de UNION/JOIN restaurados (al editar)
  useEffect(() => {
    const loadUnionItemColumns = async (item: { connectionId: string | number; table: string; columns: string[]; availableColumns?: { name: string }[] }, index: number) => {
      if (item.availableColumns?.length) return;
      try {
        const res = await fetchMetadata(item.connectionId, item.table);
        const data = await res.json();
        const colNames = data?.metadata?.tables?.[0]?.columns?.map((c: { name: string }) => c.name) ?? [];
        setUnionRightItems((prev) =>
          prev.map((it, i) => (i === index ? { ...it, availableColumns: colNames.map((n: string) => ({ name: n })) } : it))
        );
      } catch {
        // ignore
      }
    };
    unionRightItems.forEach((item, i) => {
      if (item.table && (!item.availableColumns || item.availableColumns.length === 0)) loadUnionItemColumns(item, i);
    });
  }, [unionRightItems]);

  useEffect(() => {
    const loadJoinItemColumns = async (item: { id: string; connectionId: string | number; table: string; rightColumns: string[]; availableColumns?: { name: string }[] }, index: number) => {
      if (item.availableColumns?.length) return;
      try {
        const res = await fetchMetadata(item.connectionId, item.table);
        const data = await res.json();
        const colNames = data?.metadata?.tables?.[0]?.columns?.map((c: { name: string }) => c.name) ?? [];
        setJoinItems((prev) =>
          prev.map((it, i) => (i === index ? { ...it, availableColumns: colNames.map((n: string) => ({ name: n })) } : it))
        );
      } catch {
        // ignore
      }
    };
    joinItems.forEach((item, i) => {
      if (item.table && (!item.availableColumns || item.availableColumns.length === 0)) loadJoinItemColumns(item, i);
    });
  }, [joinItems]);

  // Cargar tablas para UNION derecha
  useEffect(() => {
    if (!useUnion || !unionRightConnectionId) {
      setUnionRightTables([]);
      setUnionRightTable(null);
      return;
    }
    let cancelled = false;
    setLoadingUnionMeta(true);
    fetchMetadata(unionRightConnectionId)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled || !data.ok || !data.metadata?.tables) return;
        setUnionRightTables(data.metadata.tables || []);
        setUnionRightTable(null);
      })
      .finally(() => { if (!cancelled) setLoadingUnionMeta(false); });
    return () => { cancelled = true; };
  }, [useUnion, unionRightConnectionId]);

  // Cargar tablas para JOIN secundaria
  useEffect(() => {
    if (!useJoin || !joinSecondaryConnectionId) {
      setJoinRightTables([]);
      setJoinSecondaryTable(null);
      setJoinRightColumns([]);
      return;
    }
    let cancelled = false;
    setLoadingJoinMeta(true);
    fetchMetadata(joinSecondaryConnectionId)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled || !data.ok || !data.metadata?.tables) return;
        setJoinRightTables(data.metadata.tables || []);
        setJoinSecondaryTable(null);
        setJoinRightColumns([]);
      })
      .finally(() => { if (!cancelled) setLoadingJoinMeta(false); });
    return () => { cancelled = true; };
  }, [useJoin, joinSecondaryConnectionId]);

  // Columnas de la tabla secundaria del JOIN
  const joinRightTableInfo = joinRightTables.find((t) => `${t.schema}.${t.name}` === joinSecondaryTable);

  /** Columnas finales del dataset (tras selección, UNION y JOIN). Refleja exactamente la estructura que se guardará. */
  const finalColumnsForTypes = useMemo(() => {
    const effectiveColumns = columns.length > 0 ? columns : (selectedTableInfo?.columns ?? []).map((c: { name: string }) => c.name);
    const effectiveJoinItems =
      joinItems.length > 0
        ? joinItems
        : joinSecondaryConnectionId && joinSecondaryTable && joinLeftColumn && joinRightColumn
          ? [{ id: "join_0", connectionId: joinSecondaryConnectionId, table: joinSecondaryTable, joinType, leftColumn: joinLeftColumn, rightColumn: joinRightColumn, rightColumns: joinRightColumns, availableColumns: joinRightTableInfo?.columns ?? [] }]
          : [];
    if (effectiveJoinItems.length > 0) {
      const primaryPart = effectiveColumns.map((colName: string) => {
        const meta = selectedTableInfo?.columns?.find((c: { name: string }) => c.name === colName);
        return {
          name: `primary.${colName}`,
          dataType: (meta as { dataType?: string })?.dataType,
          inferredType: (meta as { inferredType?: string })?.inferredType,
        };
      });
      const joinPart = effectiveJoinItems.flatMap(
        (j: { rightColumns?: string[]; availableColumns?: { name: string; dataType?: string; inferredType?: string }[] }, i: number) =>
          (j.rightColumns || []).map((colName: string) => {
            const meta = (j.availableColumns ?? []).find((ac: { name: string }) => ac.name === colName);
            return {
              name: `join_${i}.${colName}`,
              dataType: (meta as { dataType?: string })?.dataType,
              inferredType: (meta as { inferredType?: string })?.inferredType,
            };
          })
      );
      return [...primaryPart, ...joinPart];
    }
    return effectiveColumns.map((colName: string) => {
      const meta = selectedTableInfo?.columns?.find((c: { name: string }) => c.name === colName);
      return {
        name: colName,
        dataType: (meta as { dataType?: string })?.dataType,
        inferredType: (meta as { inferredType?: string })?.inferredType,
      };
    });
  }, [
    columns,
    selectedTableInfo?.columns,
    joinItems,
    joinSecondaryConnectionId,
    joinSecondaryTable,
    joinLeftColumn,
    joinRightColumn,
    joinRightColumns,
    joinType,
    joinRightTableInfo?.columns,
  ]);

  useEffect(() => {
    if (!joinSecondaryTable || !joinSecondaryConnectionId) {
      setJoinRightColumns([]);
      return;
    }
    if (joinRightTableInfo?.columns?.length) {
      setJoinRightColumns(joinRightTableInfo.columns.map((c) => c.name));
      return;
    }
    // Pedir columnas si la tabla no las trae
    fetchMetadata(joinSecondaryConnectionId, joinSecondaryTable)
      .then((res) => res.json())
      .then((data) => {
        if (!data.ok || !data.metadata?.tables?.[0]?.columns) return;
        const cols = data.metadata.tables[0].columns.map((c: { name: string }) => c.name);
        setJoinRightTables((prev) =>
          prev.map((t) =>
            `${t.schema}.${t.name}` === joinSecondaryTable ? { ...t, columns: data.metadata.tables[0].columns } : t
          )
        );
        setJoinRightColumns(cols);
      });
  }, [joinSecondaryTable, joinSecondaryConnectionId, joinRightTableInfo?.columns]);

  const hasColumnsToRun =
    columns.length > 0 || (selectedTableInfo?.columns?.length ?? 0) > 0;
  const canRun =
    !!connectionId &&
    !!selectedTable &&
    hasColumnsToRun &&
    outputTableName.trim().length > 0 &&
    /^[a-zA-Z0-9_]+$/.test(outputTableName.trim());

  // Construir config de limpieza para la API (mismo formato que el editor avanzado)
  const buildCleanConfig = useCallback(() => {
    const transforms: Array<{ column: string; op: string; find?: string; replaceWith?: string; patterns?: string[]; action?: "null" | "replace"; replacement?: string }> = [];
    if (nullCleanup?.columns?.length) {
      const patterns = nullCleanup.patterns && nullCleanup.patterns.length > 0 ? nullCleanup.patterns : defaultNullPatterns;
      nullCleanup.columns.forEach((col) => {
        transforms.push({ column: col, op: "normalize_nulls", patterns, action: nullCleanup.action, replacement: nullCleanup.replacement });
      });
    }
    cleanTransforms.forEach((t) => transforms.push(t));
    dataFixes.forEach((f) => transforms.push({ column: f.column, op: "replace_value", find: f.find, replaceWith: f.replaceWith }));
    if (transforms.length === 0 && !dedupe?.keyColumns?.length) return undefined;
    return { transforms, dedupe: dedupe ?? undefined };
  }, [nullCleanup, cleanTransforms, dataFixes, dedupe, defaultNullPatterns]);

  const allFilterConditions = useCallback(() => {
    const fromExcluded = excludedValues.flatMap(({ column, excluded }) =>
      excluded.length ? [{ column, operator: "not in" as const, value: excluded.join(",") }] : []
    );
    return [...conditions, ...fromExcluded];
  }, [conditions, excludedValues]);

  /** Construye el objeto guided_config (connectionId, filter, union, join, clean, end) para guardar o ejecutar. Permite parcial (solo conexión) para que al guardar quede algo persistido. */
  const buildGuidedConfigBody = useCallback((): Record<string, unknown> | null => {
    if (!connectionId) return null;
    const effectiveColumns = columns.length > 0 ? columns : (selectedTableInfo?.columns?.map((c) => c.name) ?? []);
    const filterConditions = allFilterConditions();
    const cleanConfig = buildCleanConfig();
    const tableName = selectedTable || undefined;
    const filterPayload: Record<string, unknown> = {
      table: tableName,
      columns: effectiveColumns.length > 0 ? effectiveColumns : undefined,
      conditions: filterConditions.length > 0 ? filterConditions : [],
    };
    if (distinctColumn) filterPayload.excludeRowsColumn = distinctColumn;
    const colDisplayFiltered: Record<string, { label?: string; format?: string; type?: "Fecha" | "Número" | "Texto" }> = {};
    const tableCols = selectedTableInfo?.columns as { name: string; dataType?: string; inferredType?: string }[] | undefined;
    const getInferredType = (colName: string): "Fecha" | "Número" | "Texto" | undefined => {
      const col = tableCols?.find((c) => c.name === colName || c.name.toLowerCase() === colName.toLowerCase());
      const t = col?.inferredType ?? (col?.dataType ? dataTypeToLabel(col.dataType) : undefined);
      return t === "Fecha" || t === "Número" || t === "Texto" ? (t as "Fecha" | "Número" | "Texto") : undefined;
    };
    const effectiveJoinItemsForPayload =
      joinItems.length > 0
        ? joinItems
        : joinSecondaryConnectionId && joinSecondaryTable && joinLeftColumn && joinRightColumn
          ? [{ rightColumns: joinRightColumns }]
          : [];
    const allColumnNamesForDisplay =
      effectiveJoinItemsForPayload.length > 0
        ? [
            ...effectiveColumns.map((c) => `primary.${c}`),
            ...effectiveJoinItemsForPayload.flatMap((j: { rightColumns?: string[] }, i: number) => (j.rightColumns || []).map((c) => `join_${i}.${c}`)),
          ]
        : effectiveColumns;
    for (const colName of allColumnNamesForDisplay) {
      const unprefixed = colName.startsWith("primary.") ? colName.slice("primary.".length) : colName.replace(/^join_\d+\./, "");
      const dispKey = columnDisplay[colName] !== undefined ? colName : columnDisplay[unprefixed] !== undefined ? unprefixed : Object.keys(columnDisplay).find((k) => k.toLowerCase() === (colName.includes(".") ? unprefixed : colName).toLowerCase());
      const disp = dispKey ? columnDisplay[dispKey] : (colName.includes(".") ? columnDisplay[unprefixed] : undefined);
      const label = disp?.label?.trim() || undefined;
      const format = disp?.format?.trim() || undefined;
      const type = disp?.type ?? (colName.startsWith("primary.") ? getInferredType(unprefixed) : colName.startsWith("join_") ? undefined : getInferredType(colName));
      if (label || format || type) colDisplayFiltered[colName] = { label, format, type };
    }
    for (const [k, v] of Object.entries(columnDisplay)) {
      if (v && (v.label?.trim() || v.format?.trim() || v.type) && !colDisplayFiltered[k] && !allColumnNamesForDisplay.some((c) => c === k || c.toLowerCase() === k.toLowerCase())) {
        colDisplayFiltered[k] = { label: v.label?.trim() || undefined, format: v.format?.trim() || undefined, type: v.type };
      }
    }
    if (Object.keys(colDisplayFiltered).length > 0) {
      (filterPayload as Record<string, unknown>).columnDisplay = colDisplayFiltered;
    }
    if (keyColumns.length > 0) {
      (filterPayload as Record<string, unknown>).keyColumns = keyColumns;
    }
    const body: Record<string, unknown> = {
      connectionId,
      filter: filterPayload,
      end: {
        target: { type: "supabase", table: (outputTableName || "").trim() || undefined },
        mode: outputMode,
      },
    };
    if (useUnion && unionRightItems.length > 0) {
      body.union = {
        left: { connectionId, filter: { table: selectedTable, columns: effectiveColumns.length > 0 ? effectiveColumns : undefined, conditions: filterConditions } },
        rights: unionRightItems.map((item) => ({
          connectionId: item.connectionId,
          filter: { table: item.table, columns: item.columns.length > 0 ? item.columns : undefined, conditions: [] },
        })),
        unionAll,
      };
    } else if (useJoin) {
      const effectiveJoinItems = joinItems.length > 0
        ? joinItems
        : joinSecondaryConnectionId && joinSecondaryTable && joinLeftColumn && joinRightColumn
          ? [{ id: "join_0", connectionId: joinSecondaryConnectionId, table: joinSecondaryTable, joinType, leftColumn: joinLeftColumn, rightColumn: joinRightColumn, rightColumns: joinRightColumns }]
          : [];
      if (effectiveJoinItems.length > 0) {
        body.connectionId = connectionId;
        body.filter = {
          ...filterPayload,
          table: selectedTable,
          columns: [
            ...effectiveColumns.map((c) => `primary.${c}`),
            ...effectiveJoinItems.flatMap((j: { rightColumns?: string[] }, i: number) => (j.rightColumns || []).map((c) => `join_${i}.${c}`)),
          ],
          conditions: filterConditions.length > 0 ? filterConditions : [],
        };
        body.join = {
          primaryConnectionId: connectionId,
          primaryTable: selectedTable,
          joins: effectiveJoinItems.map((j: { connectionId: string | number; table: string; joinType: string; leftColumn: string; rightColumn: string; rightColumns?: string[] }, i: number) => ({
            id: `join_${i}`,
            secondaryConnectionId: j.connectionId,
            secondaryTable: j.table,
            joinType: j.joinType,
            primaryColumn: j.leftColumn,
            secondaryColumn: j.rightColumn,
            secondaryColumns: j.rightColumns?.length ? j.rightColumns : undefined,
          })),
        };
      } else {
        body.filter = { ...filterPayload, table: selectedTable, columns: effectiveColumns.length > 0 ? effectiveColumns : undefined, conditions: filterConditions };
      }
    } else {
      body.filter = filterPayload;
    }
    if (cleanConfig) body.clean = cleanConfig;
    if (scheduleFrequency) body.schedule = { frequency: scheduleFrequency };
    return body;
  }, [
    connectionId,
    selectedTable,
    columns,
    columnDisplay,
    selectedTableInfo?.columns,
    allFilterConditions,
    outputTableName,
    outputMode,
    scheduleFrequency,
    distinctColumn,
    keyColumns,
    useUnion,
    unionRightItems,
    unionAll,
    useJoin,
    joinItems,
    joinSecondaryConnectionId,
    joinSecondaryTable,
    joinLeftColumn,
    joinRightColumn,
    joinRightColumns,
    joinType,
    buildCleanConfig,
  ]);

  const fetchPreview = useCallback(() => {
    const body = buildGuidedConfigBody();
    if (!body || !connectionId || !selectedTable) {
      setPreviewRows(null);
      setPreviewError(null);
      setPreviewRowsProcessed(null);
      return;
    }
    previewAbortRef.current?.abort();
    previewAbortRef.current = new AbortController();
    previewLoadedOnceRef.current = false;
    setPreviewLoading(true);
    setPreviewError(null);
    const previewBody = { ...body } as Record<string, unknown>;
    delete previewBody.end;
    if (previewBody.union && typeof previewBody.union === "object" && Array.isArray((previewBody.union as { rights?: unknown[] }).rights)) {
      const u = previewBody.union as { left: unknown; rights: unknown[]; unionAll?: boolean };
      if (u.rights.length > 0) (previewBody.union as Record<string, unknown>).right = u.rights[0];
    }
    fetch("/api/etl/run-preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(previewBody),
      signal: previewAbortRef.current.signal,
    })
      .then((res) => {
        if (!res.ok) {
          return res.text().then((text) => {
            let errMsg = `Error del servidor (${res.status})`;
            try {
              const j = JSON.parse(text) as { error?: string };
              if (j?.error && typeof j.error === "string") errMsg = j.error;
            } catch {
              if (text?.trim()) errMsg = text.trim().slice(0, 200);
            }
            setPreviewRows(null);
            setPreviewError(errMsg);
            throw new Error(errMsg);
          });
        }
        return res.json();
      })
      .then((data) => {
        if (data.ok && Array.isArray(data.previewRows)) {
          previewLoadedOnceRef.current = true;
          setPreviewRows(data.previewRows);
          setPreviewError(null);
          setPreviewRowsProcessed((data as { rowsProcessed?: number }).rowsProcessed ?? data.previewRows.length);
        } else if (data.ok && !Array.isArray(data.previewRows)) {
          setPreviewRows(null);
          setPreviewRowsProcessed(null);
          setPreviewError("La respuesta del servidor no incluyó datos de vista previa.");
        } else {
          setPreviewRows(null);
          setPreviewRowsProcessed(null);
          setPreviewError((data as { error?: string })?.error || "Error al cargar vista previa");
        }
      })
      .catch((e: unknown) => {
        if ((e as { name?: string }).name === "AbortError") return;
        setPreviewRows(null);
        setPreviewRowsProcessed(null);
        const msg = e instanceof Error ? e.message : "Error al cargar vista previa";
        setPreviewError(
          typeof msg === "string" && (msg.includes("fetch") || msg.includes("network") || msg.includes("Failed"))
            ? "No se pudo conectar. Revisá la red y probá de nuevo."
            : msg
        );
      })
      .finally(() => {
        setPreviewLoading(false);
      });
  }, [buildGuidedConfigBody, connectionId, selectedTable]);

  useEffect(() => {
    const t = setTimeout(() => fetchPreview(), 0);
    return () => clearTimeout(t);
  }, [
    fetchPreview,
    step,
    connectionId,
    selectedTable,
    columns,
    conditions,
    excludedValues,
    distinctColumn,
    nullCleanup,
    cleanTransforms,
    dataFixes,
    dedupe,
    useUnion,
    unionRightItems,
    useJoin,
    joinItems,
  ]);

  const saveGuidedConfigToServer = useCallback(async (options?: { silent?: boolean }): Promise<boolean> => {
    let guidedConfig = buildGuidedConfigBody();
    if (!guidedConfig) {
      if (!options?.silent) toast.error("Completá al menos la conexión para guardar.");
      return false;
    }
    // Persistir siempre la tabla seleccionada desde el estado
    const tableToSave = (selectedTable ?? "")?.trim() || undefined;
    if (tableToSave && typeof guidedConfig.filter === "object" && guidedConfig.filter !== null) {
      guidedConfig = {
        ...guidedConfig,
        filter: { ...(guidedConfig.filter as Record<string, unknown>), table: tableToSave },
      };
    }
    try {
      const res = await fetch("/api/etl/save-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ etlId, guidedConfig }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        toast.error(data?.error || "Error al guardar");
        return false;
      }
      if (!options?.silent) toast.success("Configuración guardada.");
      return true;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Error al guardar";
      toast.error(msg);
      return false;
    }
  }, [etlId, buildGuidedConfigBody, selectedTable]);

  const handleRun = useCallback(async () => {
    if (!canRun || !connectionId || !selectedTable) return;
    setRunning(true);
    const guidedBody = buildGuidedConfigBody();
    if (!guidedBody) {
      setRunning(false);
      return;
    }
    // Guardar toda la configuración antes de ejecutar para que layout tenga conexión, tabla, columnas, filtros, join/union, destino, etc.
    await saveGuidedConfigToServer({ silent: true });
    // waitForCompletion: false evita FUNCTION_INVOCATION_TIMEOUT en Vercel; el ETL corre en segundo plano
    const body = { etlId, ...guidedBody, waitForCompletion: false };
    try {
      const res = await fetch("/api/etl/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const text = await res.text();
      let data: { ok?: boolean; error?: string; runId?: string; message?: string };
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = { ok: false, error: text || `Error del servidor (${res.status})` };
      }
      if (!res.ok || !data.ok) {
        throw new Error(data?.error || "Error al ejecutar ETL");
      }
      setRunId(data.runId ?? null);
      setRunSuccess(true);
      setRunning(false);
      toast.success("ETL iniciado en segundo plano. Redirigiendo a métricas…");
      router.push(`/admin/etl/${etlId}/metrics`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error al ejecutar");
      setRunning(false);
    }
  }, [canRun, connectionId, selectedTable, buildGuidedConfigBody, saveGuidedConfigToServer, etlId, router]);

  const stepIndex = STEPS.findIndex((s) => s.id === step);
  const connectionName =
    connections.find((c) => String(c.id) === String(connectionId))?.title ?? "";

  /** Avanza al paso siguiente y guarda la configuración actual en el ETL (sin toast). Espera el guardado para que se persista el estado actual (tabla, columnas, etc.). */
  const goToStepAndSave = useCallback(
    async (nextStep: StepId) => {
      await saveGuidedConfigToServer({ silent: true });
      setStep(nextStep);
    },
    [saveGuidedConfigToServer]
  );

  useImperativeHandle(
    ref,
    () => ({
      goToEjecutar: () => setStep("ejecutar"),
      getGuidedConfig: buildGuidedConfigBody,
      saveGuidedConfig: () => saveGuidedConfigToServer(),
      getCanRun: () => canRun,
      run: () => handleRun(),
    }),
    [buildGuidedConfigBody, saveGuidedConfigToServer, canRun, handleRun]
  );

  const progressPct = ((stepIndex + 1) / STEPS.length) * 100;
  const canGoNextConexion = !!connectionId;
  const canGoNextOrigen = !!connectionId && !!selectedTable;
  const canGoNextFiltros = (selectedTableInfo?.columns?.length ?? 0) > 0 && columns.length > 0;
  const canGoNextDestino = outputTableName.trim().length > 0 && /^[a-zA-Z0-9_]+$/.test(outputTableName.trim());
  const destinoInvalid = outputTableName.trim().length > 0 && !/^[a-zA-Z0-9_]+$/.test(outputTableName.trim());

  /** Solo wizard paso a paso. La vista "Editor del ETL" (todas las secciones) fue eliminada; /admin/etl/[id]/edit redirige a /admin/etl/[id]. */
  const isEditorMode = false;

  return (
    <div className="flex flex-col h-full rounded-2xl overflow-hidden" style={{ background: "var(--platform-surface)", border: "1px solid var(--platform-border)" }}>
      {/* Header: en modo editor solo título + guardar; en wizard, stepper con progreso */}
      {isEditorMode ? (
        <div className="shrink-0 border-b px-4 py-3 flex items-center justify-between gap-3" style={{ borderColor: "var(--platform-border)" }}>
          <div>
            <h2 className="text-base font-semibold" style={{ color: "var(--platform-fg)" }}>Editor del ETL</h2>
            <p className="text-xs mt-0.5" style={{ color: "var(--platform-fg-muted)" }}>Modificá cada sección debajo y guardá los cambios.</p>
          </div>
          <Button
            type="button"
            className="rounded-xl shrink-0"
            style={{ background: "var(--platform-accent)", color: "var(--platform-bg)" }}
            disabled={savingConfig}
            onClick={async () => {
              setSavingConfig(true);
              try {
                await saveGuidedConfigToServer();
              } finally {
                setSavingConfig(false);
              }
            }}
          >
            {savingConfig ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Guardando…
              </>
            ) : (
              "Guardar configuración"
            )}
          </Button>
        </div>
      ) : (
        <div className="shrink-0 border-b" style={{ borderColor: "var(--platform-border)" }}>
          <div className="px-4 pt-4 pb-2">
            <div className="flex items-center justify-between text-xs font-medium mb-2" style={{ color: "var(--platform-fg-muted)" }}>
              <span>Paso {stepIndex + 1} de {STEPS.length}</span>
              <span>{Math.round(progressPct)}%</span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--platform-surface-hover)" }}>
              <div className="h-full rounded-full transition-all duration-300" style={{ width: `${progressPct}%`, background: "var(--platform-accent)" }} />
            </div>
          </div>
          <div className="flex items-center gap-1 p-2 overflow-x-auto">
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              const isActive = s.id === step;
              const isPast = stepIndex > i;
              const canJump = isPast || isActive;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => (!runSuccess && canJump) && setStep(s.id)}
                  disabled={runSuccess || (!isPast && !isActive)}
                  className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium transition-all shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    background: isActive ? "var(--platform-accent-dim)" : "transparent",
                    color: isActive ? "var(--platform-accent)" : isPast ? "var(--platform-fg)" : "var(--platform-fg-muted)",
                  }}
                  title={`Paso ${i + 1}: ${s.label}`}
                >
                  <span className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: isActive ? "var(--platform-accent)" : "var(--platform-surface-hover)", color: isActive ? "var(--platform-bg)" : "inherit" }}>
                    {isPast ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                  </span>
                  <span className="hidden sm:inline">{s.label}</span>
                  {i < STEPS.length - 1 && <ChevronRight className="h-4 w-4 opacity-40 shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Content: en modo editor todas las secciones visibles; en wizard solo el paso actual */}
      <div className="flex-1 overflow-y-auto p-6 min-h-0">
        {(step === "conexion" || isEditorMode) && (
        <section id="seccion-conexion" className={isEditorMode ? "mb-10 pb-8 border-b" : ""} style={isEditorMode ? { borderColor: "var(--platform-border)" } : undefined}>
        {(step === "conexion" || isEditorMode) && (
          <div className="space-y-6 max-w-xl">
            <div>
              <h3 className="text-lg font-semibold" style={{ color: "var(--platform-fg)" }}>
                1. Conexión
              </h3>
              <p className="text-sm mt-1" style={{ color: "var(--platform-fg-muted)" }}>
                Elegí la conexión a la base de datos de origen (PostgreSQL, MySQL, etc.). Si aún no tenés una, creala primero.
              </p>
            </div>
            {connections.length === 0 ? (
              <div className="rounded-xl border p-6 text-center" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}>
                <Link2 className="h-10 w-10 mx-auto mb-3 opacity-50" style={{ color: "var(--platform-fg-muted)" }} />
                <p className="text-sm font-medium" style={{ color: "var(--platform-fg)" }}>No hay conexiones disponibles</p>
                <p className="text-sm mt-1" style={{ color: "var(--platform-fg-muted)" }}>Creá una conexión a tu base de datos para poder continuar con el ETL.</p>
                <Button
                  type="button"
                  className="rounded-xl mt-4"
                  style={{ background: "var(--platform-accent)", color: "var(--platform-bg)" }}
                  onClick={() => router.push("/admin/connections")}
                >
                  Crear conexión
                </Button>
              </div>
            ) : (
              <>
                <div>
                  <Label className="text-sm font-medium" style={{ color: "var(--platform-fg)" }}>Conexión</Label>
                  <p className="text-xs mt-0.5" style={{ color: "var(--platform-fg-muted)" }}>Base de datos de origen</p>
                  <div className="mt-2">
                    <Select
                      value={connectionId != null ? String(connectionId) : ""}
                      onChange={(v: string) => setConnectionId(v ? v : null)}
                      options={connections.map((c) => ({ value: String(c.id), label: c.title || `Conexión ${c.id}` }))}
                      placeholder="Seleccionar conexión…"
                    />
                  </div>
                </div>
                <div className="flex gap-3 pt-2">
                  {!isEditorMode && (
                    <Button
                      type="button"
                      className="rounded-xl"
                      style={{ background: "var(--platform-accent)", color: "var(--platform-bg)" }}
                      onClick={() => goToStepAndSave("origen")}
                      disabled={!canGoNextConexion}
                    >
                      Siguiente: Origen <ChevronRight className="ml-2 h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-xl"
                    style={{ borderColor: "var(--platform-border)" }}
                    onClick={() => router.push("/admin/connections")}
                  >
                    Gestionar conexiones
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
        </section>
        )}

        {(step === "origen" || isEditorMode) && (
        <section id="seccion-origen" className={isEditorMode ? "mb-10 pb-8 border-b" : ""} style={isEditorMode ? { borderColor: "var(--platform-border)" } : undefined}>
        {(step === "origen" || isEditorMode) && (
          <div className="space-y-6 max-w-xl">
            <div>
              <h3 className="text-lg font-semibold" style={{ color: "var(--platform-fg)" }}>
                2. Origen de datos
              </h3>
              <p className="text-sm mt-1" style={{ color: "var(--platform-fg-muted)" }}>
                Elegí la tabla de donde se leerán los datos.
              </p>
            </div>
            {connections.length === 0 ? (
              <div className="rounded-xl border p-6 text-center" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}>
                <Database className="h-10 w-10 mx-auto mb-3 opacity-50" style={{ color: "var(--platform-fg-muted)" }} />
                <p className="text-sm font-medium" style={{ color: "var(--platform-fg)" }}>No hay conexiones disponibles</p>
                <p className="text-sm mt-1" style={{ color: "var(--platform-fg-muted)" }}>En el paso anterior elegí una conexión o creá una desde el panel de conexiones.</p>
                <Button type="button" variant="outline" className="rounded-xl mt-4" style={{ borderColor: "var(--platform-border)" }} onClick={() => setStep("conexion")}>
                  Ir a Conexión
                </Button>
              </div>
            ) : (
              <>
                <div>
                  <Label className="text-sm font-medium" style={{ color: "var(--platform-fg)" }}>Conexión</Label>
                  <p className="text-xs mt-0.5" style={{ color: "var(--platform-fg-muted)" }}>Base de datos de origen (PostgreSQL, MySQL, etc.)</p>
                  <div className="mt-2">
                    <Select
                      value={connectionId != null ? String(connectionId) : ""}
                      onChange={(v: string) => setConnectionId(v ? v : null)}
                      options={connections.map((c) => ({ value: String(c.id), label: c.title || `Conexión ${c.id}` }))}
                      placeholder="Seleccionar conexión…"
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-sm font-medium" style={{ color: "var(--platform-fg)" }}>Tabla</Label>
                  <p className="text-xs mt-0.5" style={{ color: "var(--platform-fg-muted)" }}>Solo se muestran las tablas configuradas en la conexión. Agregá más desde Conexiones → Tablas para ETL.</p>
                  {loadingMeta ? (
                    <div className="mt-2 flex items-center gap-2 text-sm rounded-xl border px-4 py-3" style={{ borderColor: "var(--platform-border)", color: "var(--platform-fg-muted)" }}>
                      <Loader2 className="h-4 w-4 animate-spin" /> Cargando tablas…
                    </div>
                  ) : (
                    <Select
                      value={selectedTable ?? ""}
                      onChange={(v: string) => setSelectedTable(v || null)}
                      options={tables.map((t) => ({ value: `${t.schema}.${t.name}`, label: `${t.schema}.${t.name}` }))}
                      placeholder={connectionId && tables.length === 0 ? "No hay tablas. Configurá tablas en Conexiones." : "Seleccionar tabla…"}
                      disabled={!connectionId || tables.length === 0}
                      searchable
                      searchPlaceholder="Buscar tabla…"
                      className="mt-2"
                    />
                  )}
                </div>
                <div className="flex gap-3 pt-2">
                  {!isEditorMode && (
                    <>
                      <Button type="button" variant="outline" className="rounded-xl" style={{ borderColor: "var(--platform-border)" }} onClick={() => setStep("conexion")}>
                        Atrás
                      </Button>
                      <Button
                        type="button"
                        className="rounded-xl"
                        style={{ background: "var(--platform-accent)", color: "var(--platform-bg)" }}
                        onClick={() => goToStepAndSave("filtros")}
                        disabled={!canGoNextOrigen}
                      >
                        Siguiente: Columnas y filtros <ChevronRight className="ml-2 h-4 w-4" />
                      </Button>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        )}
        </section>
        )}

        {(step === "filtros" || isEditorMode) && (
        <section id="seccion-filtros" className={isEditorMode ? "mb-10 pb-8 border-b" : ""} style={isEditorMode ? { borderColor: "var(--platform-border)" } : undefined}>
        {(step === "filtros" || isEditorMode) && (
          <div className="space-y-6 max-w-4xl">
            <div>
              <h3 className="text-lg font-semibold" style={{ color: "var(--platform-fg)" }}>
                2b. Columnas y filtros (opcional)
              </h3>
              <p className="text-sm mt-1" style={{ color: "var(--platform-fg-muted)" }}>
                Elegí qué columnas incluir y opcionalmente excluí filas con condiciones.
              </p>
            </div>
            {loadingColumns === selectedTable ? (
              <div className="flex items-center gap-2 text-sm rounded-xl border px-4 py-3" style={{ borderColor: "var(--platform-border)", color: "var(--platform-fg-muted)" }}>
                <Loader2 className="h-4 w-4 animate-spin" /> Cargando columnas…
              </div>
            ) : (selectedTableInfo?.columns?.length ?? 0) > 0 ? (
              <div className="space-y-5">
                <div>
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <Label className="text-sm font-medium" style={{ color: "var(--platform-fg)" }}>Columnas a incluir</Label>
                    <span className="text-xs rounded-full px-2 py-0.5" style={{ background: "var(--platform-surface-hover)", color: "var(--platform-fg-muted)" }}>
                      {(() => {
                        const allNames = (selectedTableInfo?.columns ?? []).map((x) => x.name);
                        return columns.length === 0 ? "Ninguna" : columns.length === allNames.length ? "Todas" : `${columns.length} seleccionadas`;
                      })()}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="rounded-lg h-7 text-xs"
                      style={{ borderColor: "var(--platform-border)" }}
                      onClick={() => setColumns((selectedTableInfo?.columns ?? []).map((x) => x.name))}
                    >
                      Seleccionar todo
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="rounded-lg h-7 text-xs"
                      style={{ borderColor: "var(--platform-border)" }}
                      onClick={() => setColumns([])}
                    >
                      Quitar todo
                    </Button>
                  </div>
                  {columns.length === 0 && (
                    <p className="text-xs mb-2" style={{ color: "var(--platform-fg-muted)" }}>Seleccioná al menos una columna para continuar.</p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {(selectedTableInfo?.columns ?? []).map((c) => {
                      const active = columns.includes(c.name);
                      return (
                        <button
                          key={c.name}
                          type="button"
                          onClick={() => {
                            if (active) setColumns((prev) => prev.filter((x) => x !== c.name));
                            else setColumns((prev) => [...prev, c.name]);
                          }}
                          className="rounded-full px-3 py-1.5 text-xs font-medium border transition-colors"
                          style={{
                            background: active ? "var(--platform-accent-dim)" : "var(--platform-surface-hover)",
                            borderColor: "var(--platform-border)",
                            color: active ? "var(--platform-accent)" : "var(--platform-fg-muted)",
                          }}
                        >
                          {c.name}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Excluir filas por valores en columna */}
                <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}>
                  <Label className="text-sm font-medium" style={{ color: "var(--platform-fg)" }}>Excluir filas (opcional)</Label>
                  <p className="text-xs" style={{ color: "var(--platform-fg-muted)" }}>
                    Elegí una columna; se cargarán automáticamente los valores. Marcá cuáles excluir. Solo se incluirán las filas cuyo valor no esté marcado.
                  </p>
                  <div className="flex flex-wrap gap-2 items-center">
                    <Label className="text-xs" style={{ color: "var(--platform-fg-muted)" }}>Columna</Label>
                    <div className="min-w-[180px]">
                      <Select
                        value={distinctColumn ?? ""}
                        onChange={(v: string) => {
                          const col = v || null;
                          setDistinctColumn(col);
                          setDistinctValuesList([]);
                          setDistinctSearch("");
                        }}
                        options={(selectedTableInfo?.columns ?? []).map((col) => ({ value: col.name, label: col.name }))}
                        placeholder="Elegir columna"
                      />
                    </div>
                    {loadingDistinct && distinctColumn && (
                      <span className="text-sm" style={{ color: "var(--platform-fg-muted)" }}>Cargando valores…</span>
                    )}
                  </div>
                  {distinctValuesList.length > 0 && distinctColumn && (
                    <>
                      <input
                        type="text"
                        placeholder="Buscar valor…"
                        value={distinctSearch}
                        onChange={(e) => setDistinctSearch(e.target.value)}
                        className="w-full rounded-lg border px-3 py-2 text-sm"
                        style={{ borderColor: "var(--platform-border)", background: "var(--platform-surface)", color: "var(--platform-fg)" }}
                      />
                      <div className="max-h-48 overflow-y-auto rounded-lg border space-y-0.5 p-2" style={{ borderColor: "var(--platform-border)" }}>
                        {distinctValuesList
                          .filter((v) => !distinctSearch.trim() || String(v).toLowerCase().includes(distinctSearch.trim().toLowerCase()))
                          .map((val) => {
                            const current = excludedValues.find((e) => e.column === distinctColumn);
                            const excluded = (current?.excluded ?? []).includes(String(val));
                            return (
                              <label
                                key={String(val)}
                                className="flex items-center gap-2 py-1.5 px-2 rounded cursor-pointer hover:bg-[var(--platform-surface-hover)] text-sm"
                                style={{ color: "var(--platform-fg)" }}
                              >
                                <input
                                  type="checkbox"
                                  checked={excluded}
                                  onChange={() => {
                                    setExcludedValues((prev) => {
                                      const entry = prev.find((e) => e.column === distinctColumn);
                                      const nextExcluded = entry ? [...entry.excluded] : [];
                                      const s = String(val);
                                      if (nextExcluded.includes(s)) {
                                        const filtered = nextExcluded.filter((x) => x !== s);
                                        if (filtered.length === 0) return prev.filter((e) => e.column !== distinctColumn);
                                        return prev.map((e) => e.column === distinctColumn ? { column: distinctColumn, excluded: filtered } : e);
                                      }
                                      nextExcluded.push(s);
                                      if (!entry) return [...prev, { column: distinctColumn, excluded: nextExcluded }];
                                      return prev.map((e) => e.column === distinctColumn ? { column: distinctColumn, excluded: nextExcluded } : e);
                                    });
                                  }}
                                />
                                <span className="truncate">{String(val)}</span>
                              </label>
                            );
                          })}
                      </div>
                      <p className="text-xs" style={{ color: "var(--platform-fg-muted)" }}>
                        {excludedValues.find((e) => e.column === distinctColumn)?.excluded.length ?? 0} valor(es) marcados para excluir en esta columna.
                      </p>
                    </>
                  )}
                  {excludedValues.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-1">
                      {excludedValues.map(({ column, excluded }) => (
                        <span key={column} className="text-xs rounded-full px-2 py-0.5" style={{ background: "var(--platform-surface-hover)", color: "var(--platform-fg-muted)" }}>
                          {column}: {excluded.length} excluidos
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Clave única (KEY) — concatenar columnas como en Grain del Dataset de Métricas */}
                <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}>
                  <Label className="text-sm font-medium" style={{ color: "var(--platform-fg)" }}>Clave única (KEY) — opcional</Label>
                  <p className="text-xs" style={{ color: "var(--platform-fg-muted)" }}>
                    Seleccioná una o más columnas para formar una clave por concatenación (igual que el Grain en el Dataset de Métricas). Sirve para identificar de forma única cada fila.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {(selectedTableInfo?.columns ?? []).map((c) => {
                      const active = keyColumns.includes(c.name);
                      return (
                        <label
                          key={c.name}
                          className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer transition-colors"
                          style={{ borderColor: active ? "var(--platform-accent)" : "var(--platform-border)", background: active ? "var(--platform-accent-dim)" : "var(--platform-surface)" }}
                        >
                          <input
                            type="checkbox"
                            checked={active}
                            onChange={(e) => {
                              if (e.target.checked) setKeyColumns((prev) => [...prev, c.name]);
                              else setKeyColumns((prev) => prev.filter((x) => x !== c.name));
                            }}
                            className="rounded"
                          />
                          <span className="text-sm font-medium" style={{ color: "var(--platform-fg)" }}>{c.name}</span>
                        </label>
                      );
                    })}
                  </div>
                  {keyColumns.length > 0 && (
                    <p className="text-xs" style={{ color: "var(--platform-fg-muted)" }}>
                      KEY = {keyColumns.join(" + ")}
                    </p>
                  )}
                </div>

                {/* UNION (opcional): múltiples tablas + columnas por tabla */}
                <div className="rounded-xl border p-4 space-y-2" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="use-union-filtros"
                      checked={useUnion}
                      onChange={(e) => {
                        const v = e.target.checked;
                        setUseUnion(v);
                        if (v) setUseJoin(false);
                        if (!v) { setUnionRightConnectionId(null); setUnionRightTable(null); setUnionRightItems([]); }
                      }}
                    />
                    <Label htmlFor="use-union-filtros" className="text-sm font-medium" style={{ color: "var(--platform-fg)" }}>Combinar con otra tabla (UNION)</Label>
                  </div>
                  <p className="text-xs" style={{ color: "var(--platform-fg-muted)" }}>Apilar filas de otras tablas con las mismas columnas. Elegí una o más tablas y qué columnas traer de cada una.</p>
                  {useUnion && (
                    <div className="space-y-4 pt-2">
                      <div className="rounded-xl border p-4 space-y-4" style={{ borderColor: "var(--platform-border)", background: "var(--platform-surface)" }}>
                        <Label className="text-sm font-medium" style={{ color: "var(--platform-fg)" }}>Agregar tabla a apilar</Label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
                          <div>
                            <Label className="text-xs block mb-1.5" style={{ color: "var(--platform-fg-muted)" }}>Conexión</Label>
                            <Select
                              value={unionRightConnectionId != null ? String(unionRightConnectionId) : ""}
                              onChange={(v: string) => setUnionRightConnectionId(v ? v : null)}
                              options={connections.map((c) => ({
                                value: String(c.id),
                                label: `${c.title || `Conexión ${c.id}`}${String(c.id) === String(connectionId) ? " (principal)" : ""}`,
                              }))}
                              placeholder="Elegir conexión"
                            />
                          </div>
                          <div>
                            <Label className="text-xs block mb-1.5" style={{ color: "var(--platform-fg-muted)" }}>Tabla</Label>
                            <Select
                              value={unionRightTable ?? ""}
                              onChange={(v: string) => setUnionRightTable(v || null)}
                              options={unionRightTables.map((t) => ({ value: `${t.schema}.${t.name}`, label: `${t.schema}.${t.name}` }))}
                              placeholder="Elegir tabla"
                              searchable
                              searchPlaceholder="Buscar tabla…"
                              disabled={!unionRightConnectionId || loadingUnionMeta}
                            />
                          </div>
                          <div className="sm:col-span-2 lg:col-span-1 flex items-end">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="rounded-xl w-full sm:w-auto"
                              style={{ borderColor: "var(--platform-border)" }}
                              disabled={!unionRightConnectionId || !unionRightTable || unionRightItems.some((it) => it.table === unionRightTable)}
                              onClick={async () => {
                                if (!unionRightConnectionId || !unionRightTable) return;
                                try {
                                  const res = await fetchMetadata(unionRightConnectionId, unionRightTable);
                                  const data = await res.json();
                                  const colNames = data?.metadata?.tables?.[0]?.columns?.map((c: { name: string }) => c.name) ?? [];
                                  const mainCols = columns.length > 0 ? columns : (selectedTableInfo?.columns?.map((c) => c.name) ?? []);
                                  const defaultCols = mainCols.filter((c) => colNames.includes(c));
                                  setUnionRightItems((prev) => [
                                    ...prev,
                                    { connectionId: unionRightConnectionId, table: unionRightTable, columns: defaultCols.length ? defaultCols : [], availableColumns: colNames.map((n: string) => ({ name: n })) },
                                  ]);
                                  setUnionRightTable(null);
                                } catch {
                                  toast.error("No se pudieron cargar las columnas de la tabla");
                                }
                              }}
                            >
                              Agregar tabla
                            </Button>
                          </div>
                        </div>
                      </div>
                      <label className="flex items-center gap-2 text-sm" style={{ color: "var(--platform-fg)" }}>
                        <input type="checkbox" checked={unionAll} onChange={(e) => setUnionAll(e.target.checked)} />
                        UNION ALL (incluir duplicados)
                      </label>
                      {unionRightItems.length > 0 && (
                        <div className="space-y-2 border-t pt-3" style={{ borderColor: "var(--platform-border)" }}>
                          <Label className="text-xs font-medium" style={{ color: "var(--platform-fg-muted)" }}>Tablas a apilar ({unionRightItems.length})</Label>
                          {unionRightItems.map((item, idx) => (
                            <div key={`${item.connectionId}-${item.table}-${idx}`} className="rounded-lg border p-3 space-y-2" style={{ borderColor: "var(--platform-border)", background: "var(--platform-surface)" }}>
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-sm font-medium" style={{ color: "var(--platform-fg)" }}>{item.table}</span>
                                <button type="button" className="text-xs rounded px-2 py-1 hover:opacity-80" style={{ color: "var(--platform-fg-muted)", background: "var(--platform-surface-hover)" }} onClick={() => setUnionRightItems((prev) => prev.filter((_, i) => i !== idx))}>Quitar</button>
                              </div>
                              <div className="space-y-2">
                                <div className="flex flex-wrap gap-2 items-center">
                                  <span className="text-xs" style={{ color: "var(--platform-fg-muted)" }}>Columnas a traer:</span>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="rounded-lg h-7 text-xs"
                                    style={{ borderColor: "var(--platform-border)" }}
                                    onClick={() => setUnionRightItems((prev) => prev.map((it, i) => i === idx ? { ...it, columns: (it.availableColumns ?? []).map((c) => c.name) } : it))}
                                  >
                                    Seleccionar todas
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="rounded-lg h-7 text-xs"
                                    style={{ borderColor: "var(--platform-border)" }}
                                    onClick={() => setUnionRightItems((prev) => prev.map((it, i) => i === idx ? { ...it, columns: [] } : it))}
                                  >
                                    Deseleccionar todas
                                  </Button>
                                </div>
                                <div className="flex flex-wrap gap-2 items-center">
                                  {(item.availableColumns ?? []).map((col) => (
                                    <label key={col.name} className="flex items-center gap-1 text-xs cursor-pointer" style={{ color: "var(--platform-fg)" }}>
                                      <input
                                        type="checkbox"
                                        checked={item.columns.includes(col.name)}
                                        onChange={(e) => {
                                          setUnionRightItems((prev) => prev.map((it, i) => i === idx ? { ...it, columns: e.target.checked ? [...it.columns, col.name] : it.columns.filter((c) => c !== col.name) } : it));
                                        }}
                                      />
                                      {col.name}
                                    </label>
                                  ))}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* JOIN (opcional): múltiples tablas + columnas por tabla */}
                <div className="rounded-xl border p-4 space-y-2" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="use-join-filtros"
                      checked={useJoin}
                      onChange={(e) => {
                        const v = e.target.checked;
                        setUseJoin(v);
                        if (v) setUseUnion(false);
                        if (!v) { setJoinSecondaryConnectionId(null); setJoinSecondaryTable(null); setJoinLeftColumn(""); setJoinRightColumn(""); setJoinItems([]); }
                      }}
                    />
                    <Label htmlFor="use-join-filtros" className="text-sm font-medium" style={{ color: "var(--platform-fg)" }}>Combinar con otra tabla (JOIN)</Label>
                  </div>
                  <p className="text-xs" style={{ color: "var(--platform-fg-muted)" }}>Unir por una columna en común. Elegí una o más tablas secundarias, columnas de enlace y qué columnas traer de cada una.</p>
                  {useJoin && joinSecondaryConnectionId != null && connectionId != null && String(joinSecondaryConnectionId) !== String(connectionId) && (
                    <p className="text-xs" style={{ color: "var(--platform-fg-muted)" }}>Al usar otra conexión (otra base de datos), el JOIN se ejecuta en memoria.</p>
                  )}
                  {useJoin && (
                    <div className="space-y-4 pt-2">
                      <div className="rounded-xl border p-4 space-y-4" style={{ borderColor: "var(--platform-border)", background: "var(--platform-surface)" }}>
                        <Label className="text-sm font-medium" style={{ color: "var(--platform-fg)" }}>Tabla secundaria y tipo de JOIN</Label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
                          <div>
                            <Label className="text-xs block mb-1.5" style={{ color: "var(--platform-fg-muted)" }}>Conexión</Label>
                            <Select
                              value={joinSecondaryConnectionId != null ? String(joinSecondaryConnectionId) : ""}
                              onChange={(v: string) => {
                                setJoinSecondaryConnectionId(v ? v : null);
                                setJoinSecondaryTable(null);
                                setJoinLeftColumn("");
                                setJoinRightColumn("");
                              }}
                              options={connections.map((c) => ({
                                value: String(c.id),
                                label: `${c.title || `Conexión ${c.id}`}${String(c.id) === String(connectionId) ? " (principal)" : ""}`,
                              }))}
                              placeholder="Elegir conexión"
                            />
                          </div>
                          <div>
                            <Label className="text-xs block mb-1.5" style={{ color: "var(--platform-fg-muted)" }}>Tabla</Label>
                            <Select
                              value={joinSecondaryTable ?? ""}
                              onChange={(v: string) => { setJoinSecondaryTable(v || null); setJoinRightColumn(""); }}
                              options={joinRightTables.map((t) => ({ value: `${t.schema}.${t.name}`, label: `${t.schema}.${t.name}` }))}
                              placeholder="Elegir tabla"
                              searchable
                              searchPlaceholder="Buscar tabla…"
                              disabled={!joinSecondaryConnectionId || loadingJoinMeta}
                            />
                          </div>
                          <div>
                            <Label className="text-xs block mb-1.5" style={{ color: "var(--platform-fg-muted)" }}>Tipo</Label>
                            <Select
                              value={joinType}
                              onChange={(v: string) => setJoinType(v as "INNER" | "LEFT" | "RIGHT" | "FULL")}
                              options={[
                                { value: "INNER", label: "INNER" },
                                { value: "LEFT", label: "LEFT" },
                                { value: "RIGHT", label: "RIGHT" },
                                { value: "FULL", label: "FULL" },
                              ]}
                              placeholder="Tipo"
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
                          <div>
                            <Label className="text-xs block mb-1.5" style={{ color: "var(--platform-fg-muted)" }}>Columna tabla principal</Label>
                            <Select
                              value={joinLeftColumn}
                              onChange={(v: string) => setJoinLeftColumn(v)}
                              options={(columns.length > 0 ? columns : (selectedTableInfo?.columns ?? []).map((c: { name: string }) => c.name)).map((c) => ({ value: c, label: c }))}
                              placeholder="Elegir columna"
                            />
                          </div>
                          <div>
                            <Label className="text-xs block mb-1.5" style={{ color: "var(--platform-fg-muted)" }}>Columna tabla secundaria</Label>
                            <Select
                              value={joinRightColumn}
                              onChange={(v: string) => setJoinRightColumn(v)}
                              options={joinRightColumns.map((c) => ({ value: c, label: c }))}
                              placeholder="Elegir columna"
                            />
                          </div>
                          <div className="lg:col-span-2 flex items-end">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="rounded-lg text-sm"
                              style={{ borderColor: "var(--platform-border)" }}
                              disabled={!joinSecondaryConnectionId || !joinSecondaryTable || !joinLeftColumn || !joinRightColumn}
                              onClick={() => {
                                if (!joinSecondaryConnectionId || !joinSecondaryTable || !joinLeftColumn || !joinRightColumn) return;
                                setJoinItems((prev) => [
                                  ...prev,
                                  {
                                    id: `join_${prev.length}_${Date.now()}`,
                                    connectionId: joinSecondaryConnectionId,
                                    table: joinSecondaryTable,
                                    joinType,
                                    leftColumn: joinLeftColumn,
                                    rightColumn: joinRightColumn,
                                    rightColumns: [joinRightColumn],
                                    availableColumns: joinRightTableInfo?.columns ?? [],
                                  },
                                ]);
                                setJoinSecondaryTable(null);
                                setJoinLeftColumn("");
                                setJoinRightColumn("");
                                setJoinRightColumns([]);
                              }}
                            >
                              Agregar tabla
                            </Button>
                          </div>
                        </div>
                        {joinItems.length > 0 && (
                          <div className="space-y-2 border-t pt-3" style={{ borderColor: "var(--platform-border)" }}>
                            <Label className="text-xs font-medium" style={{ color: "var(--platform-fg-muted)" }}>Tablas a combinar ({joinItems.length})</Label>
                            {joinItems.map((item, idx) => (
                              <div key={item.id} className="rounded-lg border p-3 space-y-2" style={{ borderColor: "var(--platform-border)", background: "var(--platform-surface)" }}>
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-sm font-medium" style={{ color: "var(--platform-fg)" }}>{item.table}</span>
                                  <span className="text-xs" style={{ color: "var(--platform-fg-muted)" }}>{item.joinType} · {item.leftColumn} = {item.rightColumn}</span>
                                  <button type="button" className="text-xs rounded px-2 py-1 hover:opacity-80" style={{ color: "var(--platform-fg-muted)", background: "var(--platform-surface-hover)" }} onClick={() => setJoinItems((prev) => prev.filter((_, i) => i !== idx))}>Quitar</button>
                                </div>
                                <div className="space-y-2">
                                  <div className="flex flex-wrap gap-2 items-center">
                                    <span className="text-xs" style={{ color: "var(--platform-fg-muted)" }}>Columnas a traer:</span>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      className="rounded-lg h-7 text-xs"
                                      style={{ borderColor: "var(--platform-border)" }}
                                      onClick={() => setJoinItems((prev) => prev.map((it, i) => i === idx ? { ...it, rightColumns: (it.availableColumns ?? []).map((c) => c.name) } : it))}
                                    >
                                      Seleccionar todas
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      className="rounded-lg h-7 text-xs"
                                      style={{ borderColor: "var(--platform-border)" }}
                                      onClick={() => setJoinItems((prev) => prev.map((it, i) => i === idx ? { ...it, rightColumns: [] } : it))}
                                    >
                                      Deseleccionar todas
                                    </Button>
                                  </div>
                                  <div className="flex flex-wrap gap-2 items-center">
                                    {(item.availableColumns ?? []).map((col) => (
                                      <label key={col.name} className="flex items-center gap-1 text-xs cursor-pointer" style={{ color: "var(--platform-fg)" }}>
                                        <input
                                          type="checkbox"
                                          checked={item.rightColumns.includes(col.name)}
                                          onChange={(e) => {
                                            setJoinItems((prev) => prev.map((it, i) => i === idx ? { ...it, rightColumns: e.target.checked ? [...it.rightColumns, col.name] : it.rightColumns.filter((c) => c !== col.name) } : it));
                                          }}
                                        />
                                        {col.name}
                                      </label>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
            ) : null}
            <div className="flex gap-2">
              {!isEditorMode && (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-xl"
                    style={{ borderColor: "var(--platform-border)" }}
                    onClick={() => goToStepAndSave("origen")}
                  >
                    Atrás
                  </Button>
                  <Button
                    type="button"
                    className="rounded-xl"
                    style={{ background: "var(--platform-accent)", color: "var(--platform-bg)" }}
                    onClick={() => goToStepAndSave("columnas_tipos")}
                    disabled={!canGoNextFiltros}
                  >
                    Siguiente: Columnas y tipos <ChevronRight className="ml-2 h-4 w-4" />
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
        </section>
        )}

        {(step === "columnas_tipos" || isEditorMode) && (
        <section id="seccion-columnas-tipos" className={isEditorMode ? "mb-10 pb-8 border-b" : ""} style={isEditorMode ? { borderColor: "var(--platform-border)" } : undefined}>
        {(step === "columnas_tipos" || isEditorMode) && (
          <div className="space-y-6 max-w-4xl">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="text-lg font-semibold" style={{ color: "var(--platform-fg)" }}>
                  3. Columnas y tipos
                </h3>
                <p className="text-sm mt-1" style={{ color: "var(--platform-fg-muted)" }}>
                  Estructura final del dataset: todas las columnas resultantes del paso anterior (incluidas las de JOIN). Definí tipo (Fecha, Número, Texto), nombre para mostrar y formato para que sea más legible.
                </p>
              </div>
              {finalColumnsForTypes.length > 0 && finalColumnsForTypes.every((c) => !c.name.startsWith("join_")) && !loadingColumns && !inferringTypes && connectionId && selectedTable && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-lg"
                  style={{ borderColor: "var(--platform-border)" }}
                  onClick={() => {
                    didInferOnColumnasTiposRef.current = null;
                    setInferringTypes(true);
                    fetch("/api/connection/infer-column-types", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ connectionId, tableName: selectedTable }),
                    })
                      .then((res) => res.json())
                      .then((inferJson) => {
                        if (!inferJson.ok || !inferJson.columnTypes || typeof inferJson.columnTypes !== "object") {
                          toast.error(inferJson?.error ?? "No se pudieron inferir los tipos");
                          return;
                        }
                        const ct = inferJson.columnTypes as Record<string, "Fecha" | "Número" | "Texto">;
                        const getInferred = (colName: string) =>
                          ct[colName] ?? Object.entries(ct).find(([k]) => k.toLowerCase() === colName.toLowerCase())?.[1];
                        const tableColumns = selectedTableInfo!.columns as { name: string; dataType?: string; inferredType?: string }[];
                        const columnsWithInferred = tableColumns.map((c) => ({
                          ...c,
                          inferredType: (getInferred(c.name) ?? dataTypeToLabel(c.dataType)) as "Fecha" | "Número" | "Texto",
                        }));
                        setTables((prev) =>
                          prev.map((t) =>
                            `${t.schema}.${t.name}` === selectedTable ? { ...t, columns: columnsWithInferred } : t
                          )
                        );
                        toast.success("Tipos actualizados desde los datos");
                      })
                      .catch((err) => {
                        console.warn("[ETL] Refrescar tipos:", err);
                        toast.error("Error al inferir tipos. Revisá la consola.");
                      })
                      .finally(() => setInferringTypes(false));
                  }}
                >
                  <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Refrescar tipos
                </Button>
              )}
            </div>
            {loadingColumns === selectedTable ? (
              <div className="flex items-center gap-2 text-sm rounded-xl border px-4 py-3" style={{ borderColor: "var(--platform-border)", color: "var(--platform-fg-muted)" }}>
                <Loader2 className="h-4 w-4 animate-spin" /> Cargando columnas…
              </div>
            ) : inferringTypes ? (
              <div className="flex items-center gap-2 text-sm rounded-xl border px-4 py-3" style={{ borderColor: "var(--platform-border)", color: "var(--platform-fg-muted)" }}>
                <Loader2 className="h-4 w-4 animate-spin" /> Inferiendo tipos desde los datos…
              </div>
            ) : finalColumnsForTypes.length > 0 ? (
              <div className="rounded-xl border overflow-hidden" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--platform-border)", background: "var(--platform-surface-hover)" }}>
                        <th className="text-left py-2 px-3 font-medium" style={{ color: "var(--platform-fg-muted)" }}>Columna</th>
                        <th className="text-left py-2 px-3 font-medium" style={{ color: "var(--platform-fg-muted)" }}>Tipo</th>
                        <th className="text-left py-2 px-3 font-medium" style={{ color: "var(--platform-fg-muted)" }}>Nombre para mostrar</th>
                        <th className="text-left py-2 px-3 font-medium" style={{ color: "var(--platform-fg-muted)" }}>Formato</th>
                      </tr>
                    </thead>
                    <tbody>
                      {finalColumnsForTypes.map((c: { name: string; dataType?: string; inferredType?: string }) => {
                        const disp = columnDisplay[c.name] ?? { label: "", format: "" };
                        const tipoInferido = dataTypeToLabel((c as { inferredType?: string }).inferredType ?? c.dataType);
                        const tipo = (disp.type as "Fecha" | "Número" | "Texto") ?? tipoInferido;
                        const isDate = tipo === "Fecha";
                        const isNumber = tipo === "Número";
                        const formatOptions = isDate ? DATE_FORMAT_OPTIONS : isNumber ? NUMBER_FORMAT_OPTIONS : TEXT_FORMAT_OPTIONS;
                        return (
                          <tr key={c.name} style={{ borderBottom: "1px solid var(--platform-border)" }}>
                            <td className="py-2 px-3 font-mono text-xs" style={{ color: "var(--platform-fg)" }}>{c.name}</td>
                            <td className="py-1 px-2">
                              <Select
                                value={tipo}
                                onChange={(v: string) => setColumnDisplay((prev) => ({ ...prev, [c.name]: { ...(prev[c.name] ?? { label: "", format: "" }), type: v as "Fecha" | "Número" | "Texto" } }))}
                                options={TIPO_OPTIONS}
                                placeholder="Tipo"
                                className="min-w-[100px]"
                                buttonClassName="h-8 text-sm rounded-lg"
                              />
                            </td>
                            <td className="py-1 px-2">
                              <Input
                                value={disp.label}
                                onChange={(e) => setColumnDisplay((prev) => ({ ...prev, [c.name]: { ...(prev[c.name] ?? { label: "", format: "" }), label: e.target.value } }))}
                                placeholder={c.name.replace(/^(primary|join_\d+)\./, "")}
                                className="h-8 text-sm rounded-lg"
                                style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)", color: "var(--platform-fg)" }}
                              />
                            </td>
                            <td className="py-1 px-2">
                              <Select
                                value={disp.format}
                                onChange={(v: string) => setColumnDisplay((prev) => ({ ...prev, [c.name]: { ...(prev[c.name] ?? { label: "", format: "" }), format: v, type: (prev[c.name] as { type?: "Fecha" | "Número" | "Texto" })?.type } }))}
                                options={formatOptions}
                                placeholder="Formato"
                                className="min-w-[140px]"
                                buttonClassName="h-8 text-sm rounded-lg"
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border p-6 text-center" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}>
                <List className="h-10 w-10 mx-auto mb-3 opacity-50" style={{ color: "var(--platform-fg-muted)" }} />
                <p className="text-sm font-medium" style={{ color: "var(--platform-fg)" }}>Sin columnas</p>
                <p className="text-sm mt-1" style={{ color: "var(--platform-fg-muted)" }}>Elegí columnas en el paso anterior (Columnas y filtros) para ver la estructura final y definir tipos.</p>
                <Button type="button" variant="outline" className="rounded-xl mt-4" style={{ borderColor: "var(--platform-border)" }} onClick={() => goToStepAndSave("filtros")}>
                  Ir a Columnas y filtros
                </Button>
              </div>
            )}
            <div className="flex gap-2">
              {!isEditorMode && (
                <>
                  <Button type="button" variant="outline" className="rounded-xl" style={{ borderColor: "var(--platform-border)" }} onClick={() => goToStepAndSave("filtros")}>
                    Atrás
                  </Button>
                  <Button
                    type="button"
                    className="rounded-xl"
                    style={{ background: "var(--platform-accent)", color: "var(--platform-bg)" }}
                    onClick={() => goToStepAndSave("transformacion")}
                    disabled={finalColumnsForTypes.length === 0}
                  >
                    Siguiente: Transformación <ChevronRight className="ml-2 h-4 w-4" />
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
        </section>
        )}

        {(step === "transformacion" || isEditorMode) && (
        <section id="seccion-transformacion" className={isEditorMode ? "mb-10 pb-8 border-b" : ""} style={isEditorMode ? { borderColor: "var(--platform-border)" } : undefined}>
        {(step === "transformacion" || isEditorMode) && (
          <div className="space-y-6 max-w-2xl">
            <div>
              <h3 className="text-lg font-semibold" style={{ color: "var(--platform-fg)" }}>
                4. Transformación (opcional)
              </h3>
              <p className="text-sm mt-1" style={{ color: "var(--platform-fg-muted)" }}>
                Limpiá nulos, normalizá texto, corregí valores fijos y eliminá duplicados antes de guardar.
              </p>
            </div>
            {(() => {
              const effectiveColumns = columns.length > 0 ? columns : (selectedTableInfo?.columns?.map((c) => c.name) ?? []);
              if (effectiveColumns.length === 0) {
                return (
                  <div className="rounded-xl border p-6 text-center" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}>
                    <Sparkles className="h-10 w-10 mx-auto mb-3 opacity-50" style={{ color: "var(--platform-fg-muted)" }} />
                    <p className="text-sm font-medium" style={{ color: "var(--platform-fg)" }}>Sin columnas para transformar</p>
                    <p className="text-sm mt-1" style={{ color: "var(--platform-fg-muted)" }}>En el paso anterior elegí al menos una columna o dejá todas para poder configurar transformaciones aquí.</p>
                    <Button type="button" variant="outline" className="rounded-xl mt-4" style={{ borderColor: "var(--platform-border)" }} onClick={() => goToStepAndSave("filtros")}>
                      Ir a Columnas y filtros
                    </Button>
                  </div>
                );
              }
              return (
                <div className="space-y-6">
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="rounded-lg"
                      style={{ borderColor: "var(--platform-border)", color: "var(--platform-fg-muted)" }}
                      onClick={() => {
                        setNullCleanup(null);
                        setCustomNullValue("");
                        setCleanTransforms([]);
                        setDataFixes([]);
                        setDedupe(null);
                        setBulkNormalizeOp("");
                        toast.success("Transformación restablecida");
                      }}
                    >
                      <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Restablecer toda la transformación
                    </Button>
                  </div>
                  {/* Valores nulos o vacíos */}
                  <div className="rounded-xl border p-4 space-y-4" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}>
                    <Label className="text-sm font-medium" style={{ color: "var(--platform-fg)" }}>Valores nulos o vacíos</Label>
                    <p className="text-xs" style={{ color: "var(--platform-fg-muted)" }}>Elegí qué valores se consideran vacíos en la tabla. Se detectan en todas las columnas y podés agregar personalizados.</p>

                    <div>
                      <p className="text-xs font-medium mb-2" style={{ color: "var(--platform-fg-muted)" }}>Valores predefinidos</p>
                      <div className="flex flex-wrap gap-2">
                        {NULL_PRESET_OPTIONS.map((opt) => {
                          const patterns = nullCleanup?.patterns ?? defaultNullPatterns;
                          const isSelected = patterns.some((p) => p === opt.value);
                          return (
                            <button
                              key={opt.value === "" ? "__empty__" : opt.value}
                              type="button"
                              onClick={() => {
                                const next = isSelected ? patterns.filter((p) => p !== opt.value) : [...patterns, opt.value];
                                setNullCleanup({
                                  patterns: next.length ? next : defaultNullPatterns,
                                  action: nullCleanup?.action ?? "null",
                                  replacement: nullCleanup?.replacement,
                                  columns: nullCleanup?.columns ?? effectiveColumns,
                                });
                              }}
                              className="rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors"
                              style={{
                                borderColor: isSelected ? "var(--platform-accent)" : "var(--platform-border)",
                                background: isSelected ? "var(--platform-accent-dim)" : "var(--platform-surface)",
                                color: isSelected ? "var(--platform-accent)" : "var(--platform-fg)",
                              }}
                            >
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div>
                      <p className="text-xs font-medium mb-2" style={{ color: "var(--platform-fg-muted)" }}>Valores personalizados</p>
                      <div className="flex flex-wrap gap-2 items-center">
                        <Input
                          type="text"
                          placeholder="Ej. Sin dato, --, n/c"
                          value={customNullValue}
                          onChange={(e) => setCustomNullValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              const v = customNullValue.trim();
                              if (v === "") return;
                              const patterns = nullCleanup?.patterns ?? defaultNullPatterns;
                              if (patterns.includes(v)) {
                                toast.info("Ese valor ya está en la lista");
                                return;
                              }
                              setNullCleanup({
                                patterns: [...patterns, v],
                                action: nullCleanup?.action ?? "null",
                                replacement: nullCleanup?.replacement,
                                columns: nullCleanup?.columns ?? effectiveColumns,
                              });
                              setCustomNullValue("");
                            }
                          }}
                          className="max-w-[200px] h-9 rounded-lg text-sm"
                          style={{ borderColor: "var(--platform-border)", background: "var(--platform-surface)", color: "var(--platform-fg)" }}
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="rounded-lg h-9"
                          style={{ borderColor: "var(--platform-border)" }}
                          onClick={() => {
                            const v = customNullValue.trim();
                            if (v === "") return;
                            const patterns = nullCleanup?.patterns ?? defaultNullPatterns;
                            if (patterns.includes(v)) {
                              toast.info("Ese valor ya está en la lista");
                              return;
                            }
                            setNullCleanup({
                              patterns: [...patterns, v],
                              action: nullCleanup?.action ?? "null",
                              replacement: nullCleanup?.replacement,
                              columns: nullCleanup?.columns ?? effectiveColumns,
                            });
                            setCustomNullValue("");
                          }}
                        >
                          <Plus className="h-4 w-4 mr-1" /> Agregar
                        </Button>
                      </div>
                      {(nullCleanup?.patterns ?? defaultNullPatterns).filter((p) => !NULL_PRESET_OPTIONS.some((o) => o.value === p)).length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {(nullCleanup?.patterns ?? defaultNullPatterns)
                            .filter((p) => !NULL_PRESET_OPTIONS.some((o) => o.value === p))
                            .map((p) => (
                              <span
                                key={p}
                                className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium"
                                style={{ background: "var(--platform-surface)", color: "var(--platform-fg)", border: "1px solid var(--platform-border)" }}
                              >
                                {p || "(vacío)"}
                                <button
                                  type="button"
                                  onClick={() => {
                                    const patterns = (nullCleanup?.patterns ?? defaultNullPatterns).filter((x) => x !== p);
                                    setNullCleanup({
                                      patterns: patterns.length ? patterns : defaultNullPatterns,
                                      action: nullCleanup?.action ?? "null",
                                      replacement: nullCleanup?.replacement,
                                      columns: nullCleanup?.columns ?? effectiveColumns,
                                    });
                                  }}
                                  className="rounded-full p-0.5 hover:opacity-80"
                                  style={{ color: "var(--platform-fg-muted)" }}
                                  aria-label="Quitar"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </span>
                            ))}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2 items-center">
                      <span className="text-xs font-medium" style={{ color: "var(--platform-fg-muted)" }}>Acción:</span>
                      <div className="min-w-[200px]">
                        <Select
                          value={nullCleanup?.action ?? "null"}
                          onChange={(v: string) => setNullCleanup((prev) => prev ? { ...prev, action: v as "null" | "replace" } : { patterns: defaultNullPatterns, action: v as "null" | "replace", replacement: undefined, columns: effectiveColumns })}
                          options={[
                            { value: "null", label: "Convertir a NULL" },
                            { value: "replace", label: "Reemplazar por valor" },
                          ]}
                          placeholder="Acción"
                          disablePortal
                        />
                      </div>
                      {nullCleanup?.action === "replace" && (
                        <Input
                          type="text"
                          className="w-32 h-9 rounded-lg text-sm"
                          style={{ borderColor: "var(--platform-border)", background: "var(--platform-surface)", color: "var(--platform-fg)" }}
                          placeholder="Valor de reemplazo"
                          value={nullCleanup?.replacement ?? ""}
                          onChange={(e) => setNullCleanup((prev) => prev ? { ...prev, replacement: e.target.value || undefined } : null)}
                        />
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="rounded-lg"
                        style={{ borderColor: "var(--platform-border)" }}
                        onClick={() => setNullCleanup({
                          patterns: nullCleanup?.patterns ?? defaultNullPatterns,
                          action: nullCleanup?.action ?? "null",
                          replacement: nullCleanup?.replacement,
                          columns: effectiveColumns,
                        })}
                      >
                        Activar en todas las columnas
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="rounded-lg"
                        style={{ borderColor: "var(--platform-border)", color: "var(--platform-fg-muted)" }}
                        onClick={() => {
                          setNullCleanup(null);
                          setCustomNullValue("");
                          toast.success("Valores nulos revertidos");
                        }}
                      >
                        <RotateCcw className="h-3.5 w-3.5 mr-1" /> Revertir
                      </Button>
                    </div>
                  </div>

                  {/* Normalización de texto por columna */}
                  <div className="rounded-xl border p-4 space-y-4" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}>
                    <Label className="text-sm font-medium" style={{ color: "var(--platform-fg)" }}>Normalización de texto por columna</Label>
                    <p className="text-xs" style={{ color: "var(--platform-fg-muted)" }}>Elegí una operación por columna (opcional). Podés aplicar la misma operación a todas de una vez.</p>
                    <div className="flex flex-wrap items-end gap-2 p-3 rounded-xl border" style={{ borderColor: "var(--platform-border)", background: "var(--platform-surface)" }}>
                      <span className="text-xs font-medium" style={{ color: "var(--platform-fg-muted)" }}>Aplicar a todas las columnas:</span>
                      <div className="flex-1 min-w-[200px] max-w-[240px]">
                        <Select
                          value={bulkNormalizeOp}
                          onChange={(v: string) => setBulkNormalizeOp(v)}
                          options={NORMALIZE_OPTIONS.filter((o) => o.value && o.value !== "replace")}
                          placeholder="Elegir operación"
                        />
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="rounded-xl"
                        style={{ borderColor: "var(--platform-border)" }}
                        disabled={!bulkNormalizeOp}
                        onClick={() => {
                          if (!bulkNormalizeOp) return;
                          setCleanTransforms((prev) => {
                            const rest = prev.filter((x) => x.op === "replace");
                            return [
                              ...effectiveColumns.map((col) =>
                                bulkNormalizeOp === "replace"
                                  ? { column: col, op: "replace" as const, find: "", replaceWith: "" }
                                  : { column: col, op: bulkNormalizeOp }
                              ),
                              ...rest,
                            ];
                          });
                          toast.success(`Aplicado a ${effectiveColumns.length} columnas`);
                        }}
                      >
                        Aplicar a todas
                      </Button>
                    </div>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {effectiveColumns.map((colName) => {
                        const t = cleanTransforms.find((t) => t.column === colName);
                        const op = t?.op ?? "";
                        return (
                          <div key={colName} className="flex gap-2 items-center flex-wrap">
                            <span className="text-sm w-32 truncate" style={{ color: "var(--platform-fg-muted)" }}>{colName}</span>
                            <div className="flex-1 min-w-[180px]">
                              <Select
                                value={op}
                                onChange={(v: string) => {
                                  setCleanTransforms((prev) => {
                                    const rest = prev.filter((x) => x.column !== colName);
                                    if (!v) return rest;
                                    if (v === "replace") return [...rest, { column: colName, op: "replace", find: "", replaceWith: "" }];
                                    return [...rest, { column: colName, op: v }];
                                  });
                                }}
                                options={NORMALIZE_OPTIONS}
                                placeholder="(ninguna)"
                              />
                            </div>
                            {op === "replace" && (
                              <>
                                <input
                                  type="text"
                                  className="rounded-xl border px-2 py-1.5 text-xs w-24"
                                  style={{ borderColor: "var(--platform-border)", background: "var(--platform-surface)", color: "var(--platform-fg)" }}
                                  placeholder="Buscar"
                                  value={t?.find ?? ""}
                                  onChange={(ev) =>
                                    setCleanTransforms((prev) =>
                                      prev.map((x) =>
                                        x.column === colName && x.op === "replace"
                                          ? { ...x, find: ev.target.value }
                                          : x
                                      )
                                    )
                                  }
                                />
                                <input
                                  type="text"
                                  className="rounded-xl border px-2 py-1.5 text-xs w-24"
                                  style={{ borderColor: "var(--platform-border)", background: "var(--platform-surface)", color: "var(--platform-fg)" }}
                                  placeholder="Reemplazar"
                                  value={t?.replaceWith ?? ""}
                                  onChange={(ev) =>
                                    setCleanTransforms((prev) =>
                                      prev.map((x) =>
                                        x.column === colName && x.op === "replace"
                                          ? { ...x, replaceWith: ev.target.value }
                                          : x
                                      )
                                    )
                                  }
                                />
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Correcciones permanentes */}
                  <div className="rounded-xl border p-4 space-y-2" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}>
                    <Label className="text-sm font-medium" style={{ color: "var(--platform-fg)" }}>Correcciones permanentes</Label>
                    <p className="text-xs" style={{ color: "var(--platform-fg-muted)" }}>Reemplazar valor incorrecto → correcto (coincidencia exacta). La comparación es exacta (el valor en la celda debe coincidir con &apos;Incorrecto&apos;). Si no aplica, comprobá espacios o mayúsculas.</p>
                    <div className="space-y-2 max-h-36 overflow-y-auto">
                      {dataFixes.map((fix, idx) => (
                        <div key={idx} className="flex gap-2 items-center flex-wrap">
                          <div className="min-w-[140px]">
                            <Select
                              value={fix.column}
                              onChange={(v: string) => setDataFixes((prev) => { const n = [...prev]; n[idx] = { ...fix, column: v }; return n; })}
                              options={effectiveColumns.map((c) => ({ value: c, label: c }))}
                              placeholder="Columna"
                            />
                          </div>
                          <input type="text" className="rounded-xl border px-2 py-1.5 text-sm w-28" style={{ borderColor: "var(--platform-border)", background: "var(--platform-surface)", color: "var(--platform-fg)" }} placeholder="Incorrecto" value={fix.find} onChange={(e) => setDataFixes((prev) => { const n = [...prev]; n[idx] = { ...fix, find: e.target.value }; return n; })} />
                          <span style={{ color: "var(--platform-fg-muted)" }}>→</span>
                          <input type="text" className="rounded-xl border px-2 py-1.5 text-sm w-28" style={{ borderColor: "var(--platform-border)", background: "var(--platform-surface)", color: "var(--platform-fg)" }} placeholder="Correcto" value={fix.replaceWith} onChange={(e) => setDataFixes((prev) => { const n = [...prev]; n[idx] = { ...fix, replaceWith: e.target.value }; return n; })} />
                          <button type="button" className="text-red-500 hover:bg-red-50 rounded-lg p-1.5" onClick={() => setDataFixes((prev) => prev.filter((_, i) => i !== idx))} aria-label="Quitar">×</button>
                        </div>
                      ))}
                    </div>
                    <Button type="button" size="sm" variant="outline" className="rounded-lg" style={{ borderColor: "var(--platform-border)" }} onClick={() => setDataFixes((prev) => [...prev, { column: effectiveColumns[0] ?? "", find: "", replaceWith: "" }])}>
                      + Añadir corrección
                    </Button>
                  </div>

                  {/* Duplicados */}
                  <div className="rounded-xl border p-4 space-y-2" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}>
                    <Label className="text-sm font-medium" style={{ color: "var(--platform-fg)" }}>Duplicados</Label>
                    <p className="text-xs" style={{ color: "var(--platform-fg-muted)" }}>Columnas clave para identificar duplicados. Se conserva una fila por clave.</p>
                    <p className="text-xs" style={{ color: "var(--platform-fg-muted)" }}>Se agrupa por la combinación de valores de las columnas elegidas; si varias filas tienen la misma combinación, se mantiene solo la primera o la última según la opción seleccionada.</p>
                    <div className="flex flex-wrap gap-4 items-end">
                      <div className="min-w-[180px]">
                        <Select
                          value=""
                          onChange={(v: string) => {
                            if (!v) return;
                            setDedupe((prev) => ({ keyColumns: [...(prev?.keyColumns ?? []), v], keep: prev?.keep ?? "first" }));
                          }}
                          options={effectiveColumns.filter((c) => !dedupe?.keyColumns.includes(c)).map((c) => ({ value: c, label: c }))}
                          placeholder="Añadir columna clave"
                        />
                      </div>
                      <div className="min-w-[160px]">
                        <Select
                          value={dedupe?.keep ?? "first"}
                          onChange={(v: string) => setDedupe((prev) => ({ keyColumns: prev?.keyColumns ?? [], keep: (v || "first") as "first" | "last" }))}
                          options={[
                            { value: "first", label: "Mantener primera" },
                            { value: "last", label: "Mantener última" },
                          ]}
                          placeholder="Al duplicado"
                        />
                      </div>
                    </div>
                    {dedupe?.keyColumns?.length ? (
                      <div className="flex flex-wrap gap-1">
                        {dedupe.keyColumns.map((col) => (
                          <span key={col} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs" style={{ background: "var(--platform-surface-hover)", color: "var(--platform-fg)" }}>
                            {col}
                            <button type="button" className="hover:opacity-70" onClick={() => setDedupe((prev) => prev ? { ...prev, keyColumns: prev.keyColumns.filter((c) => c !== col) } : null)}>×</button>
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })()}
            <div className="flex gap-2">
              {!isEditorMode && (
                <>
                  <Button type="button" variant="outline" className="rounded-xl" style={{ borderColor: "var(--platform-border)" }} onClick={() => goToStepAndSave("filtros")}>
                    Atrás
                  </Button>
                  <Button type="button" className="rounded-xl" style={{ background: "var(--platform-accent)", color: "var(--platform-bg)" }} onClick={() => goToStepAndSave("destino")}>
                    Siguiente: Destino <ChevronRight className="ml-2 h-4 w-4" />
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
        </section>
        )}

        {(step === "destino" || isEditorMode) && (
        <section id="seccion-destino" className={isEditorMode ? "mb-10 pb-8 border-b" : ""} style={isEditorMode ? { borderColor: "var(--platform-border)" } : undefined}>
        {(step === "destino" || isEditorMode) && (
          <div className="space-y-6 max-w-xl">
            <div>
              <h3 className="text-lg font-semibold" style={{ color: "var(--platform-fg)" }}>
                5. Tabla de destino
              </h3>
              <p className="text-sm mt-1" style={{ color: "var(--platform-fg-muted)" }}>
                Nombre de la tabla en Supabase donde se guardarán los datos. Solo letras, números y guión bajo. El dashboard usará esta tabla.
              </p>
            </div>
            <div>
              <Label className="text-sm font-medium" style={{ color: "var(--platform-fg)" }}>Nombre de la tabla</Label>
              <p className="text-xs mt-0.5" style={{ color: "var(--platform-fg-muted)" }}>Ej: ventas_2025, reporte_mensual</p>
              <Input
                value={outputTableName}
                onChange={(e) => setOutputTableName(e.target.value.replace(/[^a-zA-Z0-9_]/g, "_"))}
                placeholder="ej. ventas_2025"
                className="mt-2 rounded-xl"
                style={{
                  background: "var(--platform-bg)",
                  borderColor: destinoInvalid ? "var(--platform-error, #dc2626)" : "var(--platform-border)",
                  color: "var(--platform-fg)",
                }}
              />
              {destinoInvalid && (
                <p className="text-xs mt-1" style={{ color: "var(--platform-error, #dc2626)" }}>Solo se permiten letras, números y guión bajo.</p>
              )}
            </div>
            <div>
              <Label className="text-sm font-medium" style={{ color: "var(--platform-fg)" }}>Modo al escribir</Label>
              <p className="text-xs mt-0.5" style={{ color: "var(--platform-fg-muted)" }}>Sobrescribir reemplaza toda la tabla; Agregar añade filas sin borrar.</p>
              <select
                value={outputMode}
                onChange={(e) => setOutputMode(e.target.value as "overwrite" | "append")}
                className="w-full mt-2 rounded-xl border px-4 py-3 text-sm"
                style={{ background: "var(--platform-bg)", borderColor: "var(--platform-border)", color: "var(--platform-fg)" }}
              >
                <option value="overwrite">Sobrescribir (reemplazar tabla)</option>
                <option value="append">Agregar (añadir filas)</option>
              </select>
            </div>
            <div className="flex gap-3 pt-2">
              {!isEditorMode && (
                <>
                  <Button type="button" variant="outline" className="rounded-xl" style={{ borderColor: "var(--platform-border)" }} onClick={() => goToStepAndSave("transformacion")}>
                    Atrás
                  </Button>
                  <Button
                    type="button"
                    className="rounded-xl"
                    style={{ background: "var(--platform-accent)", color: "var(--platform-bg)" }}
                    onClick={() => goToStepAndSave("ejecutar")}
                    disabled={!canGoNextDestino}
                  >
                    Ir a Ejecutar <ChevronRight className="ml-2 h-4 w-4" />
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
        </section>
        )}

        {(step === "ejecutar" || isEditorMode) && (
        <section id="seccion-ejecutar" className={isEditorMode ? "mb-10 pb-8" : ""}>
        {(step === "ejecutar" || isEditorMode) && (
          <div className="space-y-6 max-w-xl">
            {!runSuccess ? (
              <>
                <div>
                  <h3 className="text-lg font-semibold" style={{ color: "var(--platform-fg)" }}>
                    6. Resumen y ejecución
                  </h3>
                  <p className="text-sm mt-1" style={{ color: "var(--platform-fg-muted)" }}>
                    Revisá la configuración y ejecutá el ETL para cargar los datos en Supabase.
                  </p>
                </div>
                {!canRun && (
                  <div className="rounded-xl border p-4 flex items-start gap-3" style={{ borderColor: "var(--platform-error, #dc2626)", background: "rgba(220, 38, 38, 0.06)" }}>
                    <span className="text-lg" style={{ color: "var(--platform-error, #dc2626)" }}>!</span>
                    <div>
                      <p className="text-sm font-medium" style={{ color: "var(--platform-fg)" }}>Falta configurar</p>
                      <p className="text-sm mt-0.5" style={{ color: "var(--platform-fg-muted)" }}>
                        {!selectedTable
                          ? "Elegí la tabla de origen en la sección 2 (Origen de datos)."
                          : !hasColumnsToRun
                            ? "Elegí al menos una columna en la sección 2b (Columnas y filtros) o esperá a que se carguen."
                            : !outputTableName.trim()
                              ? "Indicá un nombre para la tabla de destino."
                              : "El nombre de la tabla solo puede tener letras, números y guión bajo."}
                      </p>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {!selectedTable && (
                          <Button type="button" variant="outline" size="sm" className="rounded-lg" style={{ borderColor: "var(--platform-border)" }} onClick={() => goToStepAndSave("origen")}>
                            Ir a Origen
                          </Button>
                        )}
                        {selectedTable && !hasColumnsToRun && (
                          <Button type="button" variant="outline" size="sm" className="rounded-lg" style={{ borderColor: "var(--platform-border)" }} onClick={() => goToStepAndSave("filtros")}>
                            Ir a Columnas y filtros
                          </Button>
                        )}
                        {(selectedTable && hasColumnsToRun) && (
                          <Button type="button" variant="outline" size="sm" className="rounded-lg" style={{ borderColor: "var(--platform-border)" }} onClick={() => goToStepAndSave("destino")}>
                            Ir a Destino
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
                <div className="rounded-xl border divide-y" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}>
                  <div className="flex items-center gap-3 px-4 py-3">
                    <Database className="h-5 w-5 shrink-0 opacity-60" style={{ color: "var(--platform-fg-muted)" }} />
                    <div>
                      <p className="text-xs font-medium" style={{ color: "var(--platform-fg-muted)" }}>Origen</p>
                      <p className="text-sm font-medium" style={{ color: "var(--platform-fg)" }}>{connectionName} → {selectedTable ?? "—"}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 px-4 py-3">
                    <Table className="h-5 w-5 shrink-0 opacity-60" style={{ color: "var(--platform-fg-muted)" }} />
                    <div>
                      <p className="text-xs font-medium" style={{ color: "var(--platform-fg-muted)" }}>Destino</p>
                      <p className="text-sm font-medium" style={{ color: "var(--platform-fg)" }}>{outputTableName || "—"} · {outputMode === "overwrite" ? "Sobrescribir" : "Agregar"}</p>
                    </div>
                  </div>
                  {(buildCleanConfig() || (useUnion && unionRightItems.length > 0) || (useJoin && (joinItems.length > 0 || (joinSecondaryConnectionId && joinSecondaryTable)))) && (
                    <div className="flex items-center gap-3 px-4 py-3">
                      <Sparkles className="h-5 w-5 shrink-0 opacity-60" style={{ color: "var(--platform-fg-muted)" }} />
                      <div>
                        <p className="text-xs font-medium" style={{ color: "var(--platform-fg-muted)" }}>Transformación</p>
                        <p className="text-sm font-medium" style={{ color: "var(--platform-fg)" }}>
                          {useUnion && unionRightItems.length > 0 && `UNION con ${unionRightItems.length} tabla(s)${unionAll ? " (ALL)" : ""}${buildCleanConfig() ? " · Limpieza" : ""}`}
                          {useJoin && (joinItems.length > 0 || (joinSecondaryConnectionId && joinSecondaryTable)) && !useUnion && `JOIN con ${joinItems.length > 0 ? joinItems.length : (joinSecondaryConnectionId && joinSecondaryTable ? 1 : 0)} tabla(s)${buildCleanConfig() ? " · Limpieza" : ""}`}
                          {!useUnion && !useJoin && buildCleanConfig() && "Limpieza de nulos, texto, correcciones y/o duplicados"}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
                <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}>
                  <h3 className="text-base font-medium" style={{ color: "var(--platform-fg)" }}>Frecuencia de actualización automática</h3>
                  <p className="text-xs" style={{ color: "var(--platform-fg-muted)" }}>Programá con qué frecuencia el sistema traerá los nuevos registros de la base del cliente.</p>
                  <div className="max-w-xs">
                    <Label className="text-xs block mb-1.5" style={{ color: "var(--platform-fg-muted)" }}>Frecuencia</Label>
                    <Select
                      value={scheduleFrequency}
                      onChange={(v: string) => setScheduleFrequency(v ?? "")}
                      options={[
                        { value: "", label: "Ninguna (solo manual)" },
                        { value: "15m", label: "15 minutos" },
                        { value: "1h", label: "1 hora" },
                        { value: "6h", label: "6 horas" },
                        { value: "12h", label: "12 horas" },
                        { value: "24h", label: "24 horas" },
                        { value: "1w", label: "1 semana" },
                        { value: "1M", label: "1 mes" },
                      ]}
                      placeholder="Elegir frecuencia"
                    />
                  </div>
                </div>
                <div className="flex gap-3 pt-2">
                  <Button type="button" variant="outline" className="rounded-xl" style={{ borderColor: "var(--platform-border)" }} onClick={() => goToStepAndSave("destino")}>
                    Atrás
                  </Button>
                  <Button
                    type="button"
                    className="rounded-xl"
                    style={{ background: "var(--platform-accent)", color: "var(--platform-bg)" }}
                    onClick={handleRun}
                    disabled={!canRun || running}
                  >
                    {running ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Ejecutando…
                      </>
                    ) : (
                      <>
                        <Play className="mr-2 h-4 w-4" /> Ejecutar ETL
                      </>
                    )}
                  </Button>
                </div>
              </>
            ) : (
              <div className="rounded-xl border p-6 text-center" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)" }}>
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-full mb-4" style={{ background: "var(--platform-success)", color: "white" }}>
                  <CheckCircle2 className="h-8 w-8" />
                </div>
                <h3 className="text-lg font-semibold" style={{ color: "var(--platform-fg)" }}>
                  ETL en ejecución
                </h3>
                <p className="text-sm mt-2 max-w-sm mx-auto" style={{ color: "var(--platform-fg-muted)" }}>
                  Los datos se están procesando en segundo plano. Cuando termine, la tabla <strong style={{ color: "var(--platform-fg)" }}>{outputTableName}</strong> estará lista para usar en un dashboard.
                </p>
                <div className="flex flex-wrap gap-3 justify-center mt-6">
                  <Button
                    type="button"
                    className="rounded-xl flex items-center gap-2"
                    style={{ background: "var(--platform-accent)", color: "var(--platform-bg)" }}
                    onClick={() => router.push(`/admin/etl/${etlId}/metrics`)}
                  >
                    <LayoutDashboard className="h-4 w-4" /> Crear dashboard con estos datos
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-xl"
                    style={{ borderColor: "var(--platform-border)" }}
                    onClick={() => router.push("/admin/dashboard")}
                  >
                    Ver dashboards
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
        </section>
        )}

        {/* Vista previa de datos: siempre visible, con botón para forzar actualización */}
        <section className="mt-8 pt-6 border-t" style={{ borderColor: "var(--platform-border)" }}>
          <div className="rounded-xl border overflow-hidden" style={{ borderColor: "var(--platform-border)", background: "var(--platform-surface)" }}>
            <div className="px-4 py-3 border-b flex items-center justify-between gap-2" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg-elevated)" }}>
              <h3 className="text-sm font-semibold" style={{ color: "var(--platform-fg)" }}>Vista previa de datos</h3>
              <div className="flex items-center gap-2">
                {previewLoading && (
                  <span className="text-xs flex items-center gap-1.5" style={{ color: "var(--platform-fg-muted)" }}>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Actualizando…
                  </span>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0 h-8 gap-1.5"
                  style={{ borderColor: "var(--platform-border)" }}
                  onClick={() => fetchPreview()}
                  disabled={previewLoading || !connectionId || !selectedTable}
                  title={connectionId && selectedTable ? "Actualizar vista previa" : "Elegí conexión y tabla para habilitar"}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Actualizar
                </Button>
              </div>
            </div>
            <div className="p-4 grid grid-cols-1 md:grid-cols-[minmax(240px,1fr)_2fr] gap-4">
              {/* Resumen de configuración y datos */}
              <div className="rounded-xl border p-4 space-y-3 shrink-0" style={{ borderColor: "var(--platform-border)", background: "var(--platform-bg)", height: "fit-content" }}>
                <h4 className="text-sm font-semibold" style={{ color: "var(--platform-fg)" }}>Resumen</h4>
                <dl className="space-y-2 text-sm">
                  <div>
                    <dt className="text-xs font-medium" style={{ color: "var(--platform-fg-muted)" }}>Conexión</dt>
                    <dd className="font-medium" style={{ color: "var(--platform-fg)" }}>{connectionName || "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium" style={{ color: "var(--platform-fg-muted)" }}>Tabla</dt>
                    <dd className="font-medium truncate" style={{ color: "var(--platform-fg)" }} title={selectedTable ?? undefined}>{selectedTable ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium" style={{ color: "var(--platform-fg-muted)" }}>Columnas</dt>
                    <dd className="font-medium" style={{ color: "var(--platform-fg)" }}>
                      {connectionId && selectedTable
                        ? columns.length > 0
                          ? `${columns.length} columna${columns.length !== 1 ? "s" : ""}`
                          : "Todas"
                        : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium" style={{ color: "var(--platform-fg-muted)" }}>Filtros</dt>
                    <dd className="font-medium" style={{ color: "var(--platform-fg)" }}>
                      {connectionId && selectedTable
                        ? conditions.length > 0 || excludedValues.some((e) => e.excluded.length > 0)
                          ? [
                              conditions.length > 0 && `${conditions.length} condición${conditions.length !== 1 ? "es" : ""}`,
                              excludedValues.some((e) => e.excluded.length > 0) && `${excludedValues.filter((e) => e.excluded.length > 0).length} columna(s) con exclusiones`,
                            ].filter(Boolean).join(", ")
                          : "Sin filtros"
                        : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium" style={{ color: "var(--platform-fg-muted)" }}>Transformación</dt>
                    <dd className="font-medium" style={{ color: "var(--platform-fg)" }}>
                      {buildCleanConfig() || (useUnion && unionRightItems.length > 0) || (useJoin && (joinItems.length > 0 || (joinSecondaryConnectionId && joinSecondaryTable)))
                        ? useUnion && unionRightItems.length > 0
                          ? `UNION con ${unionRightItems.length} tabla(s)${unionAll ? " (ALL)" : ""}${buildCleanConfig() ? " · Limpieza" : ""}`
                          : useJoin && (joinItems.length > 0 || (joinSecondaryConnectionId && joinSecondaryTable)) && !useUnion
                            ? `JOIN con ${joinItems.length > 0 ? joinItems.length : 1} tabla(s)${buildCleanConfig() ? " · Limpieza" : ""}`
                            : !useUnion && !useJoin && buildCleanConfig()
                              ? "Limpieza de nulos, texto y/o duplicados"
                              : "—"
                        : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium" style={{ color: "var(--platform-fg-muted)" }}>Destino</dt>
                    <dd className="font-medium" style={{ color: "var(--platform-fg)" }}>{outputTableName ? `${outputTableName} · ${outputMode === "overwrite" ? "Sobrescribir" : "Agregar"}` : "—"}</dd>
                  </div>
                  <div className="pt-2 border-t" style={{ borderColor: "var(--platform-border)" }}>
                    <dt className="text-xs font-medium mb-1" style={{ color: "var(--platform-fg-muted)" }}>Datos (vista previa)</dt>
                    <dd className="space-y-0.5">
                      <div className="font-medium" style={{ color: "var(--platform-fg)" }}>Filas mostradas: {previewLoading ? "…" : (previewRows != null ? String(previewDisplayRows.length) : "—")}</div>
                      <div className="font-medium" style={{ color: "var(--platform-fg)" }}>Total obtenido: {previewLoading ? "…" : previewError ? "Error al cargar" : (previewRows != null ? (previewRowsProcessed ?? previewRows.length) : "—")}</div>
                    </dd>
                  </div>
                </dl>
              </div>
              {/* Vista previa: tabla y mensajes */}
              <div className="min-w-0">
              {previewError && (
                <p className="text-sm py-4 px-3 rounded-lg" style={{ color: "var(--platform-fg-muted)", background: "var(--platform-surface-hover)" }}>
                  {previewError}
                  <span className="block mt-2">Tocá <strong>Actualizar</strong> para reintentar.</span>
                </p>
              )}
              {!previewError && previewRows && previewRows.length > 0 && (() => {
                const rowKeys = Object.keys(previewRows[0] as Record<string, unknown>);
                const keyByLower: Record<string, string> = Object.fromEntries(rowKeys.map((k: string) => [k.toLowerCase(), k]));
                const mapped = columns.length > 0 ? columns.map((c: string) => (keyByLower[c.toLowerCase()] != null ? keyByLower[c.toLowerCase()] : c)) : [];
                const displayKeys = mapped.filter((k: string) => rowKeys.includes(k) || rowKeys.some((r: string) => r.toLowerCase() === k.toLowerCase()));
                const keysToShow = columns.length > 0 ? (displayKeys.length > 0 ? displayKeys : rowKeys) : [];
                const showNoColumnsMessage = columns.length === 0;
                return (
                  <div className="space-y-2">
                    {showNoColumnsMessage && (
                      <p className="text-sm py-2 px-3 rounded-lg" style={{ color: "var(--platform-fg-muted)", background: "var(--platform-surface-hover)" }}>
                        Seleccioná al menos una columna en “Columnas a incluir” para ver la previsualización.
                      </p>
                    )}
                    {keysToShow.length > 0 && (
                      <div className="overflow-auto rounded-lg border" style={{ maxHeight: 320, borderColor: "var(--platform-border)" }}>
                        <table className="w-full text-sm border-collapse" style={{ color: "var(--platform-fg)" }}>
                          <thead>
                            <tr style={{ background: "var(--platform-bg-elevated)", borderBottom: "1px solid var(--platform-border)" }}>
                              {keysToShow.map((key: string) => {
                                const displayKey = getColumnDisplayKey(key);
                                return (
                                <th
                                  key={key}
                                  role="columnheader"
                                  className="text-left font-medium py-2 px-3 whitespace-nowrap sticky top-0 z-10 cursor-pointer select-none hover:bg-[var(--platform-surface-hover)] transition-colors"
                                  style={{ background: "var(--platform-bg-elevated)", color: "var(--platform-fg-muted)" }}
                                  onClick={() => handlePreviewSort(key)}
                                >
                                  <span className="inline-flex items-center gap-1">
                                    {(columnDisplay[displayKey]?.label?.trim() || key)}
                                    {previewSortKey === key ? (
                                      previewSortDir === "asc" ? (
                                        <ArrowUp className="h-3.5 w-3.5 opacity-80" />
                                      ) : (
                                        <ArrowDown className="h-3.5 w-3.5 opacity-80" />
                                      )
                                    ) : (
                                      <ArrowUpDown className="h-3.5 w-3.5 opacity-50" aria-hidden />
                                    )}
                                  </span>
                                </th>
                              ); })}
                            </tr>
                          </thead>
                          <tbody>
                            {previewDisplayRows.map((row, idx) => (
                              <tr key={idx} className="border-b border-b-[var(--platform-border)] hover:bg-[var(--platform-surface-hover)]">
                                {keysToShow.map((key: string) => {
                                  const raw = (row as Record<string, unknown>)[key];
                                  const displayKey = getColumnDisplayKey(key);
                                  const formatted = formatPreviewCell(displayKey, raw);
                                  return (
                                    <td key={key} className="py-1.5 px-3 whitespace-nowrap max-w-[200px] truncate" title={formatted}>
                                      {formatted}
                                    </td>
                                  );
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })()}
              {!previewError && !previewLoading && (!previewRows || previewRows.length === 0) && connectionId && selectedTable && previewLoadedOnceRef.current && (
                <p className="text-sm py-6 text-center" style={{ color: "var(--platform-fg-muted)" }}>
                  La consulta se ejecutó pero no devolvió filas. Revisá los filtros o probá otra tabla. Podés tocar <strong>Actualizar</strong> para volver a cargar.
                </p>
              )}
              {!previewError && !previewLoading && (!previewRows || previewRows.length === 0) && connectionId && selectedTable && !previewLoadedOnceRef.current && (
                <p className="text-sm py-6 text-center" style={{ color: "var(--platform-fg-muted)" }}>
                  Sin datos aún o la vista previa no se cargó. Tocá <strong>Actualizar</strong> arriba a la derecha para cargar la vista previa ahora.
                </p>
              )}
              {(!connectionId || !selectedTable) && !previewLoading && (
                <p className="text-sm py-6 text-center" style={{ color: "var(--platform-fg-muted)" }}>
                  Elegí una conexión y tabla para ver aquí una vista previa de los datos.
                </p>
              )}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
});

export default ETLGuidedFlowInner;
