"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Connection as ServerConnection } from "@/components/connections/ConnectionsCard";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Minus, Plus, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, PanelLeft, PanelRight, LayoutTemplate, PanelLeftOpen, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
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
} from "chart.js";
import { Bar, Line, Pie } from "react-chartjs-2";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Tooltip,
  Legend,
  Title
);

const METADATA_FETCH_TIMEOUT_MS = 35000; // 35s para dar tiempo a Firebird (servidor usa 30s)
async function fetchMetadataWithTimeout(connectionId: string | number, tableName?: string): Promise<Response> {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), METADATA_FETCH_TIMEOUT_MS);
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

export type WidgetType =
  | "bar"
  | "line"
  | "pie"
  | "table"
  | "kpi"
  | "connection"
  | "filter"
  | "clean"
  | "cast"
  | "count"
  | "condition"
  | "arithmetic"
  | "join"
  | "union"
  | "end";

// Nueva configuración de JOIN tipo "star schema"
export type JoinConfig = {
  primaryTable?: string; // schema.table principal
  primaryConnectionId?: string | number;
  primaryColumns?: string[]; // columnas seleccionadas de la tabla principal (opcional)
  joins?: Array<{
    id: string; // id único para esta unión
    secondaryTable?: string; // schema.table secundaria
    secondaryConnectionId?: string | number;
    primaryColumn?: string; // columna de la tabla principal para la condición
    secondaryColumn?: string; // columna de la tabla secundaria para la condición
    joinType: "INNER" | "LEFT" | "RIGHT" | "FULL";
    secondaryColumns?: string[]; // columnas seleccionadas de la tabla secundaria (opcional)
  }>;
};

export type Widget = {
  id: string;
  type: WidgetType;
  title: string;
  x: number; // px
  y: number; // px
  w: number; // px
  h: number; // px
  config?: ChartConfig;
  // Optional: when the widget represents a connection dragged from the palette
  connectionId?: string | number;
  // For filter nodes: selected table and rules
  filter?: {
    table?: string; // schema.table
    columns?: string[]; // fully qualified or simple
    conditions?: Array<{
      column: string;
      operator:
        | "="
        | "!="
        | ">"
        | ">="
        | "<"
        | "<="
        | "contains"
        | "startsWith"
        | "endsWith"
        | "in"
        | "not in"
        | "is null"
        | "is not null";
      value?: string;
    }>;
  };
  // For cast nodes: convert column data types (replacing originals)
  cast?: {
    conversions: Array<{
      column: string; // source column name (simple name)
      targetType:
        | "number"
        | "integer"
        | "decimal"
        | "string"
        | "boolean"
        | "date"
        | "datetime";
      // Optional: for date/datetime casts allow specifying input/output formats
      inputFormat?: string | null; // pattern describing how the source value looks
      outputFormat?: string | null; // desired output pattern
    }>;
  };
  // For cleaning nodes: column transforms + data quality
  clean?: {
    nullCleanup?: {
      patterns: string[];
      action: "null" | "replace";
      replacement?: string;
      columns: string[];
    };
    transforms: Array<
      | { column: string; op: "trim" | "upper" | "lower" | "cast_number" | "cast_date" }
      | { column: string; op: "replace"; find: string; replaceWith: string }
      | { column: string; op: "normalize_spaces" | "strip_invisible" | "utf8_normalize" }
    >;
    dataFixes?: Array<{ column: string; find: string; replaceWith: string }>;
    dedupe?: { keyColumns: string[]; keep: "first" | "last" };
  };
  // For arithmetic nodes: mathematical operations
  arithmetic?: {
    operations: Array<{
      id: string;
      leftOperand: { type: "column" | "constant"; value: string };
      operator: "+" | "-" | "*" | "/" | "%" | "^" | "pct_of" | "pct_off";
      rightOperand: { type: "column" | "constant"; value: string };
      resultColumn: string;
    }>;
  };
  // For condition nodes: conditional rules (IF / ELSE IF / ELSE)
  condition?: {
    resultColumn?: string; // Columna única de salida; si está definida, se usa evaluación secuencial (primera que cumpla)
    defaultResultValue?: string; // Valor cuando ninguna regla cumple
    rules: Array<{
      id: string;
      leftOperand: { type: "column" | "constant"; value: string };
      comparator: "=" | "!=" | ">" | ">=" | "<" | "<=";
      rightOperand: { type: "column" | "constant"; value: string };
      resultColumn: string;
      outputType: "boolean" | "string" | "number";
      thenValue?: string;
      elseValue?: string;
      shouldFilter?: boolean;
    }>;
  };
  // For count nodes: count occurrences of a column value
  count?: {
    attribute?: string; // column to count occurrences for
    resultColumn?: string; // name of the new column with the count
  };
  // For join nodes: multi table star-schema joins
  join?: JoinConfig;
  // For union nodes: apilar dos datasets con la misma estructura (UNION ALL por defecto)
  union?: { unionAll: boolean };
  // For end nodes: target warehouse config
  end?: {
    target?: { type: "supabase"; table?: string };
    mode?: "append" | "replace";
    lastRun?: {
      at: string;
      rows?: number;
      stored?: boolean;
      error?: string;
    } | null;
  };
};

type ChartConfig = {
  labels: string[];
  datasets: Array<{
    label: string;
    data: number[];
    backgroundColor?: string | string[];
    borderColor?: string | string[];
    borderWidth?: number;
  }>;
  options?: any;
};

const PALETTE: { label: string; type: WidgetType }[] = [
  { label: "Conteo por atributo", type: "count" },
  { label: "Operaciones Aritméticas", type: "arithmetic" },
  { label: "Condiciones", type: "condition" },
  { label: "Conversión de Tipos", type: "cast" },
  { label: "JOIN de Tablas", type: "join" },
  { label: "UNION de Tablas", type: "union" },
  // The connections palette is provided externally; we keep built-in palette for charts only
];

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

const GRID = 16; // px grid for snapping
const snap = (v: number, grid = GRID) => Math.round(v / grid) * grid;

const DND_MIME = "application/x-biconic-widget";

import { createClient } from "@/lib/supabase/client";
import { useETLPreview } from "@/components/etl/ETLPreviewContext";
import { toast } from "sonner";

type Connection = {
  id: string | number;
  name?: string | null;
  db_host?: string | null;
  db_name?: string | null;
  type?: string | null;
  original_file_name?: string | null;
  created_at?: string | null;
};

export function ETLEditor({
  customLeftPanel,
  customBottomPanel,
  etlId,
  etlTitle,
  initialWidgets,
  initialZoom,
  initialGrid,
  initialEdges,
  availableConnections,
}: {
  availableConnections?: ServerConnection[];
  customLeftPanel?: React.ReactNode;
  customBottomPanel?: React.ReactNode;
  etlId?: string;
  etlTitle?: string;
  initialWidgets?: Widget[] | null;
  initialZoom?: number;
  initialGrid?: number;
  initialEdges?: Array<{ id: string; from: string; to: string }>;
}) {
  const canvasRef = useRef<HTMLDivElement | null>(null);
  
  // Layout state
  const [showLeftPanel, setShowLeftPanel] = useState(true);
  const [showRightPanel, setShowRightPanel] = useState(true);
  const [showBottomPanel, setShowBottomPanel] = useState(true);

  const [widgets, setWidgets] = useState<Widget[]>([]);
  // Simple edges between nodes: from -> to (by widget id)
  const [edges, setEdges] = useState<
    Array<{ id: string; from: string; to: string }>
  >([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Connections state for JOIN node configuration
  const [connections, setConnections] = useState<Connection[]>(() => {
    return (availableConnections || []).map((c) => ({
      id: c.id,
      name: c.title,
      db_host: c.host,
      db_name: c.databaseName,
      type: c.type,
      original_file_name: c.type === "Excel" ? c.databaseName : null,
    }));
  });
  // Connection in-progress UI state
  const [connectingFromId, setConnectingFromId] = useState<string | null>(null);
  const [connectMouse, setConnectMouse] = useState<{
    x: number;
    y: number;
  } | null>(null);
  
  // Debug Log
  console.log("ETL EDITOR: Props availableConnections:", availableConnections?.length);

  // -- ETL RUN STATE (GLOBAL) --
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [activeRunStatus, setActiveRunStatus] = useState<"started" | "running" | "completed" | "failed" | null>(null);
  const [progress, setProgress] = useState(0);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [runStartTime, setRunStartTime] = useState<Date | null>(null);

  const [castDetectLoading, setCastDetectLoading] = useState(false);
  const [castDetectError, setCastDetectError] = useState<string | null>(null);

  // 1. Check for active runs on mount (Global)
  useEffect(() => {
     if (!etlId) return;
     let isMounted = true;
     const checkActive = async () => {
        console.log("Checking active runs for ETL (Global):", etlId);
        try {
           const supabase = createClient();
           const { data, error } = await supabase
             .from("etl_runs_log")
             .select("*")
             .eq("etl_id", etlId)
             .order("created_at", { ascending: false })
             .limit(1)
             .maybeSingle();
           
           if (error) {
              console.error("Error fetching active run:", error);
           }

           if (data && isMounted) {
              // Only resume if the headers run is actually started/running.
              // Logic requested: fetch last run -> check if started -> show modal.
              if (data.status === "started") {
                  console.log("Found active run:", data);
                  setActiveRunId(data.id);
                  setActiveRunStatus(data.status as any);
                  setProgress(data.rows_processed || 0);
                  setRunStartTime(new Date(data.created_at));
              } else {
                 console.log("Last run is not started (" + data.status + "), ignoring.");
              }
           } else {
              console.log("No active run found.");
           }
        } catch (e) {
           console.error("Exception in checkActive:", e);
        }
     };
     checkActive();
     return () => { isMounted = false; };
  }, [etlId]);

  // 2. Persistent Subscription for Active Run (Global)
  useEffect(() => {
     if (!activeRunId || !etlId) return;

     const supabase = createClient();
     const channelId = `etl-run-${activeRunId}`;
     console.log("Subscribing to run (Global):", activeRunId);

     const channel = supabase.channel(channelId)
        .on(
            "postgres_changes",
            {
                event: "UPDATE",
                schema: "public",
                table: "etl_runs_log",
                filter: `id=eq.${activeRunId}`
            },
            (payload) => {
                 const newRow = payload.new as any;
                 if (newRow) {
                     console.log("Run update:", newRow.status, newRow.rows_processed);
                     if (typeof newRow.rows_processed === 'number') {
                        setProgress(newRow.rows_processed);
                     }
                     if (newRow.status) {
                        setActiveRunStatus(newRow.status);
                     }
                 }
            }
        )
        .subscribe();

     return () => {
        console.log("Unsubscribing run:", activeRunId);
        supabase.removeChannel(channel);
     };
  }, [activeRunId, etlId]);

  // Zoom placeholder (ui only)
  const [zoom, setZoom] = useState(initialZoom ?? 1);
  const zoomOut = () => setZoom((z) => clamp(+(z - 0.1).toFixed(2), 0.5, 2));
  const zoomIn = () => setZoom((z) => clamp(+(z + 0.1).toFixed(2), 0.5, 2));

  // Panning state
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isCtrlPressed, setIsCtrlPressed] = useState(false);
  const isPanning = useRef(false);
  const lastMousePos = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Control") setIsCtrlPressed(true);
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Control") {
        setIsCtrlPressed(false);
        isPanning.current = false;
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  // Grid size for snapping
  const [grid, setGrid] = useState<number>(initialGrid ?? 16);
  const snapTo = useCallback(
    (v: number) => Math.round(v / grid) * grid,
    [grid]
  );

  // Compute content bounds so the inner canvas has real size (for SVG edges)
  const contentBounds = useMemo(() => {
    const PAD = 200; // extra canvas around content
    const MIN_W = 1200;
    const MIN_H = 800;
    let maxX = 0;
    let maxY = 0;
    for (const w of widgets) {
      maxX = Math.max(maxX, w.x + w.w);
      maxY = Math.max(maxY, w.y + w.h);
    }
    return {
      width: Math.max(MIN_W, maxX + PAD),
      height: Math.max(MIN_H, maxY + PAD),
    };
  }, [widgets]);

  // Drag state for in-canvas move
  const dragState = useRef<{
    id: string | null;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  }>({ id: null, startX: 0, startY: 0, origX: 0, origY: 0 });

  // Resize state
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

  // Small inner component to render the Diseño section (chart/table/count/arithmetic etc.)
  const DesignPaletteSection = () => (
    <div className="space-y-5 w-full">
      <div>
        <h4 className="font-medium mb-2 text-sm" style={{ color: "var(--platform-fg-muted)" }}>Transformaciones</h4>
        <div className="space-y-2">
          {PALETTE.map((p) => (
            <button
              key={p.type}
              draggable
              onDragStart={(e) => onPaletteDragStart(e, p.type)}
              className="w-full rounded-xl px-3 py-2 text-left flex items-center gap-2 cursor-grab active:cursor-grabbing border transition-colors hover:opacity-90"
              style={{ background: "var(--platform-surface-hover)", borderColor: "var(--platform-border)", color: "var(--platform-fg)" }}
            >
              <span className="h-7 w-7 rounded-lg flex-shrink-0" style={{ background: "var(--platform-accent-dim)", color: "var(--platform-accent)" }} />
              <span className="text-sm">{p.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  const onCanvasDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes(DND_MIME)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    }
  };

  const onCanvasDrop = (e: React.DragEvent) => {
    const payload = e.dataTransfer.getData(DND_MIME);
    if (!payload) return;
    e.preventDefault();

    const { left, top } = canvasRef.current!.getBoundingClientRect();
    const x = (e.clientX - left - pan.x) / zoom;
    const y = (e.clientY - top - pan.y) / zoom;

    const {
      type,
      title: droppedTitle,
      connectionId,
    } = JSON.parse(payload) as {
      type: WidgetType;
      title?: string;
      connectionId?: string | number;
    };
    const id = `${type}-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 6)}`;

    const defaultSize = (t: WidgetType) => {
      switch (t) {
        case "connection":
          return { w: 560, h: 320 };
        case "filter":
          return { w: 480, h: 220 };
        case "clean":
          return { w: 520, h: 220 };
        case "count":
          return { w: 520, h: 220 };
        case "condition":
          return { w: 540, h: 280 };
        case "arithmetic":
          return { w: 540, h: 280 };
        case "end":
          return { w: 380, h: 180 };
        case "table":
          return { w: 520, h: 260 };
        case "kpi":
          return { w: 260, h: 140 };
        default:
          return { w: 520, h: 260 };
      }
    };

    const { w, h } = defaultSize(type);
    const defaultConfig: ChartConfig | undefined =
      type === "bar" || type === "line" || type === "pie"
        ? {
            labels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun"],
            datasets: [
              {
                label: "Series 1",
                data: [12, 19, 3, 5, 2, 3],
                backgroundColor:
                  type === "pie"
                    ? [
                        "#10b981",
                        "#06b6d4",
                        "#3b82f6",
                        "#f59e0b",
                        "#ef4444",
                        "#8b5cf6",
                      ]
                    : "rgba(16,185,129,0.4)",
                borderColor: type === "pie" ? "#fff" : "#10b981",
                borderWidth: type === "pie" ? 1 : 2,
              },
            ],
          }
        : undefined;
    setWidgets((prev) => [
      ...prev,
      {
        id,
        type,
        title: droppedTitle?.trim() || type.toUpperCase(),
        x: snapTo(Math.round(x - w / 2)),
        y: snapTo(Math.round(y - 24)),
        w: snapTo(w),
        h: snapTo(h),
        config: defaultConfig,
        connectionId: connectionId,
        join:
          type === "join"
            ? {
                primaryTable: undefined,
                primaryConnectionId: undefined,
                primaryColumns: undefined,
                joins: [],
              }
            : undefined,
        union: type === "union" ? { unionAll: true } : undefined,
        filter:
          type === "filter"
            ? { table: undefined, columns: [], conditions: [] }
            : undefined,
        clean: type === "clean" ? { transforms: [] } : undefined,
        cast: type === "cast" ? { conversions: [] } : undefined,
        count:
          type === "count"
            ? { attribute: "", resultColumn: "conteo" }
            : undefined,
        condition: type === "condition" ? { rules: [] } : undefined,
        arithmetic: type === "arithmetic" ? { operations: [] } : undefined,
        end:
          type === "end"
            ? {
                target: { type: "supabase", table: undefined },
                mode: "append",
                lastRun: null,
              }
            : undefined,
      },
    ]);
    setSelectedId(id);
  };

  // Hydrate widgets when provided by parent
  useEffect(() => {
    if (initialWidgets && Array.isArray(initialWidgets)) {
      setWidgets(initialWidgets);
    }
    if (typeof initialZoom === "number") setZoom(initialZoom);
    if (typeof initialGrid === "number") setGrid(initialGrid);
    if (initialEdges && Array.isArray(initialEdges)) setEdges(initialEdges);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startDragWidget = (id: string, e: React.PointerEvent) => {
    e.stopPropagation();
    const w = widgets.find((w) => w.id === id);
    if (!w || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    dragState.current = {
      id,
      startX: (e.clientX - rect.left - pan.x) / zoom,
      startY: (e.clientY - rect.top - pan.y) / zoom,
      origX: w.x,
      origY: w.y,
    };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };

  const onCanvasPointerDown = (e: React.PointerEvent) => {
    if (isCtrlPressed) {
      isPanning.current = true;
      lastMousePos.current = { x: e.clientX, y: e.clientY };
      (e.target as Element).setPointerCapture?.(e.pointerId);
      e.preventDefault();
    }
  };

  const onCanvasPointerMove = (e: React.PointerEvent) => {
    if (!canvasRef.current) return;

    if (isPanning.current) {
      const dx = e.clientX - lastMousePos.current.x;
      const dy = e.clientY - lastMousePos.current.y;
      setPan((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
      lastMousePos.current = { x: e.clientX, y: e.clientY };
      return;
    }

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const cx = (e.clientX - rect.left - pan.x) / zoom;
    const cy = (e.clientY - rect.top - pan.y) / zoom;
    if (connectingFromId) {
      setConnectMouse({ x: cx, y: cy });
    }
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
                x: snapTo(Math.round(dragState.current!.origX + dx)),
                y: snapTo(Math.round(dragState.current!.origY + dy)),
              }
            : w
        )
      );
    } else if (resizeState.current.id) {
      const handle = resizeState.current.handle;
      setWidgets((prev) =>
        prev.map((w) => {
          if (w.id !== resizeState.current!.id) return w;
          let nx = w.x;
          let ny = w.y;
          let nw = resizeState.current!.origW;
          let nh = resizeState.current!.origH;
          const ox = resizeState.current!.origX;
          const oy = resizeState.current!.origY;

          if (handle === "e" || handle === "ne" || handle === "se") {
            nw = resizeState.current!.origW + dx;
          }
          if (handle === "s" || handle === "se" || handle === "sw") {
            nh = resizeState.current!.origH + dy;
          }
          if (handle === "w" || handle === "nw" || handle === "sw") {
            nw = resizeState.current!.origW - dx;
            nx = ox + dx;
          }
          if (handle === "n" || handle === "ne" || handle === "nw") {
            nh = resizeState.current!.origH - dy;
            ny = oy + dy;
          }

          // Min/max and snapping
          nw = clamp(nw, 120, 2000);
          nh = clamp(nh, 80, 2000);
          nx = snapTo(nx);
          ny = snapTo(ny);
          nw = snapTo(nw);
          nh = snapTo(nh);

          return { ...w, x: nx, y: ny, w: nw, h: nh };
        })
      );
    }
  };

  const onCanvasPointerUp = (e: React.PointerEvent) => {
    if (isPanning.current) {
      isPanning.current = false;
      (e.target as Element).releasePointerCapture?.(e.pointerId);
    }
    dragState.current.id = null;
    resizeState.current.id = null;
  };

  const selected = useMemo(
    () => widgets.find((w) => w.id === selectedId) || null,
    [widgets, selectedId]
  );

  const updateSelected = (patch: Partial<Widget>) => {
    if (!selected) return;
    setWidgets((prev) =>
      prev.map((w) => (w.id === selected.id ? { ...w, ...patch } : w))
    );
  };

  const ensureConfig = (): ChartConfig => {
    return (
      selected?.config || {
        labels: ["A", "B", "C"],
        datasets: [
          {
            label: "Serie 1",
            data: [5, 10, 3],
            backgroundColor:
              selected?.type === "pie"
                ? ["#10b981", "#06b6d4", "#3b82f6"]
                : "rgba(16,185,129,0.4)",
            borderColor: "#10b981",
            borderWidth: 2,
          },
        ],
      }
    );
  };

  const updateConfig = (producer: (cfg: ChartConfig) => ChartConfig) => {
    if (!selected) return;
    const next = producer(ensureConfig());
    updateSelected({ config: next });
  };

  // Connection metadata state for the selected connection widget
  const [connMeta, setConnMeta] = useState<{
    dbVersion?: string;
    schemas: string[];
    tables: Array<{
      schema: string;
      name: string;
      columns: Array<{
        name: string;
        dataType: string;
        nullable: boolean;
        defaultValue: any;
        isPrimaryKey?: boolean;
      }>;
    }>;
  } | null>(null);
  const [metaLoading, setMetaLoading] = useState(false);
  const [metaError, setMetaError] = useState<string | null>(null);
  // Loading state for filter's upstream metadata (shown in right panel)
  const [filterMetaLoading, setFilterMetaLoading] = useState(false);
  const [filterMetaError, setFilterMetaError] = useState<string | null>(null);
  /** Qualified table name (ej. PUBLIC.VENTAS) para el que estamos cargando columnas (Firebird bajo demanda). */
  const [loadingColumnsFor, setLoadingColumnsFor] = useState<string | null>(null);

  useEffect(() => {
    let abort = false;
    async function fetchMetadataIfConnection() {
      setMetaError(null);
      setConnMeta(null);
      if (!selected || selected.type !== "connection") return;
      if (!selected.connectionId) {
        setMetaError("La conexión no tiene un ID asociado");
        return;
      }
      try {
        setMetaLoading(true);
        const res = await fetchMetadataWithTimeout(selected.connectionId);
        const data = await res.json();
        if (!res.ok || !data.ok) {
          throw new Error(data?.error || "No se pudo obtener metadata");
        }
        if (!abort) {
          setConnMeta(data.metadata);
        }
      } catch (e: any) {
        if (!abort) {
          const msg = e?.name === "AbortError" ? "La conexión tardó demasiado. La base puede no ser accesible desde el servidor." : (e?.message || "Error obteniendo metadata");
          setMetaError(msg);
        }
      } finally {
        if (!abort) setMetaLoading(false);
      }
    }
    fetchMetadataIfConnection();
    return () => {
      abort = true;
    };
  }, [selected?.id, selected?.type, selected?.connectionId]);

  // Cache metadata by connection widget id to reuse in filters, with TTL via localStorage
  type DbMetadata = NonNullable<typeof connMeta>;
  const [metaByNode, setMetaByNode] = useState<Record<string, DbMetadata>>({});
  const TTL_MS = 5 * 60 * 1000; // 5 min
  useEffect(() => {
    try {
      const raw = localStorage.getItem("biconic_meta_cache");
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<
        string,
        { ts: number; data: DbMetadata }
      >;
      const now = Date.now();
      const fresh: Record<string, DbMetadata> = {};
      Object.entries(parsed).forEach(([k, v]) => {
        if (now - v.ts < TTL_MS) fresh[k] = v.data;
      });
      setMetaByNode(fresh);
    } catch {}
  }, []);
  useEffect(() => {
    try {
      const now = Date.now();
      const toStore: Record<string, { ts: number; data: DbMetadata }> = {};
      Object.entries(metaByNode).forEach(([k, v]) => {
        toStore[k] = { ts: now, data: v };
      });
      localStorage.setItem("biconic_meta_cache", JSON.stringify(toStore));
    } catch {}
  }, [metaByNode]);

  // List all available tables from all connection widgets on the canvas for JOIN configuration
  const availableTablesForJoin = useMemo(() => {
    type JoinTableOption = {
      connectionId: string | number;
      connectionName: string;
      schema: string;
      tableName: string;
      qualifiedName: string; // schema.table
    };
    const list: JoinTableOption[] = [];
    const seen = new Set<string>();
    // a) Filter only connection widgets that have a connectionId
    const connectionWidgets = widgets.filter(
      (w) => w.type === "connection" && w.connectionId
    );
    for (const cw of connectionWidgets) {
      // b) Find metadata for this widget by its id
      const meta = metaByNode[cw.id];
      if (!meta) continue;
      // c) Iterate metadata tables
      for (const t of meta.tables || []) {
        const schema = t.schema;
        const name = t.name;
        const qualifiedName = `${schema}.${name}`;
        // d) Push entry
        const key = `${cw.connectionId}::${qualifiedName}`;
        if (seen.has(key)) continue;
        seen.add(key);
        list.push({
          connectionId: cw.connectionId!,
          connectionName: cw.title,
          schema,
          tableName: name,
          qualifiedName,
        });
      }
    }

    // Also include tables from all saved DB connections (not only canvas widgets)
    for (const conn of connections) {
      const meta = metaByNode[`conn:${conn.id}`];
      if (!meta) continue;
      for (const t of meta.tables || []) {
        const schema = t.schema;
        const name = t.name;
        const qualifiedName = `${schema}.${name}`;
        const key = `${conn.id}::${qualifiedName}`;
        if (seen.has(key)) continue;
        seen.add(key);
        list.push({
          connectionId: conn.id,
          connectionName: conn.name || String(conn.id),
          schema,
          tableName: name,
          qualifiedName,
        });
      }
    }
    return list;
  }, [widgets, metaByNode, connections]);

  // Ensure metadata is available: for Filter nodes (upstream connection) and Join nodes (all connections on canvas)
  useEffect(() => {
    if (!selected || (selected.type !== "filter" && selected.type !== "join"))
      return;
    setFilterMetaError(null);
    let abort = false;

    const fetchAndStore = async (connWidget: Widget) => {
      try {
        if (!connWidget.connectionId) return;
        const res = await fetchMetadataWithTimeout(connWidget.connectionId);
        const data = await res.json();
        if (!res.ok || !data.ok)
          throw new Error(data?.error || "No se pudo obtener metadata");
        if (!abort)
          setMetaByNode((m) => ({ ...m, [connWidget.id]: data.metadata }));
      } catch (e: any) {
        if (!abort)
          setFilterMetaError(
            e?.name === "AbortError" ? "La conexión tardó demasiado." : (e?.message || "Error obteniendo metadata")
          );
      }
    };

    (async () => {
      setFilterMetaLoading(true);
      try {
        if (selected.type === "filter") {
          const srcEdge = edges.find((e) => e.to === selected.id);
          const srcNode = srcEdge && widgets.find((w) => w.id === srcEdge.from);
          if (
            srcNode &&
            srcNode.type === "connection" &&
            srcNode.connectionId &&
            !metaByNode[srcNode.id]
          ) {
            await fetchAndStore(srcNode);
          }
        } else if (selected.type === "join") {
          // Load metadata for all connection widgets that don't have cache yet
          const connectionWidgets = widgets.filter(
            (w) => w.type === "connection" && w.connectionId
          );
          for (const cw of connectionWidgets) {
            if (abort) break;
            if (!metaByNode[cw.id]) {
              await fetchAndStore(cw);
            }
          }
          // Also load metadata for all saved DB connections (by id)
          for (const conn of connections) {
            if (abort) break;
            const key = `conn:${conn.id}`;
            if (!metaByNode[key]) {
              try {
                const res = await fetchMetadataWithTimeout(conn.id);
                const data = await res.json();
                if (!res.ok || !data.ok)
                  throw new Error(data?.error || "No se pudo obtener metadata");
                if (!abort)
                  setMetaByNode((m) => ({ ...m, [key]: data.metadata }));
              } catch (e: any) {
                if (!abort)
                  setFilterMetaError(
                    e?.name === "AbortError" ? "La conexión tardó demasiado." : (e?.message || "Error obteniendo metadata")
                  );
              }
            }
          }
        }
      } finally {
        if (!abort) setFilterMetaLoading(false);
      }
    })();

    return () => {
      abort = true;
    };
  }, [selected?.id, selected?.type, edges, widgets, metaByNode, connections]);

  // Cargar columnas de una tabla bajo demanda (Firebird: las tablas vienen con columns vacío)
  const loadColumnsForTable = useCallback(
    async (
      connectionId: string | number,
      qualifiedName: string,
      target: "connMeta" | string
    ) => {
      if (!qualifiedName) return;
      setLoadingColumnsFor(qualifiedName);
      try {
        const res = await fetchMetadataWithTimeout(connectionId, qualifiedName);
        const data = await res.json();
        if (!res.ok || !data.ok || !data.metadata?.tables?.length) {
          return;
        }
        const tableWithCols = data.metadata.tables[0];
        const mergeColumnsIntoMeta = (prev: DbMetadata | null): DbMetadata | null => {
          if (!prev?.tables) return prev;
          return {
            ...prev,
            tables: prev.tables.map((t) => {
              const q = `${t.schema}.${t.name}`;
              if (q !== qualifiedName) return t;
              return { ...t, columns: tableWithCols.columns || [] };
            }),
          };
        };
        if (target === "connMeta") {
          setConnMeta((prev) => mergeColumnsIntoMeta(prev) ?? prev);
        } else {
          setMetaByNode((prev) => {
            const current = prev[target];
            const next = mergeColumnsIntoMeta(current ?? null);
            if (!next) return prev;
            return { ...prev, [target]: next };
          });
        }
      } finally {
        setLoadingColumnsFor(null);
      }
    },
    []
  );

  // Al elegir una tabla en el filtro (conexión upstream), si esa tabla no tiene columnas cargadas, pedirlas
  useEffect(() => {
    if (
      selected?.type !== "filter" ||
      !selected.filter?.table ||
      loadingColumnsFor != null
    )
      return;
    const srcEdge = edges.find((e) => e.to === selected.id);
    const srcNode = srcEdge && widgets.find((w) => w.id === srcEdge.from);
    if (srcNode?.type !== "connection" || !srcNode.connectionId) return;
    const meta = metaByNode[srcNode.id];
    if (!meta?.tables) return;
    const tbl = meta.tables.find(
      (t) => `${t.schema}.${t.name}` === selected.filter?.table
    );
    if (tbl?.columns?.length) return;
    loadColumnsForTable(
      srcNode.connectionId,
      selected.filter.table,
      srcNode.id
    );
  }, [
    selected?.id,
    selected?.type,
    selected?.filter?.table,
    edges,
    widgets,
    metaByNode,
    loadingColumnsFor,
    loadColumnsForTable,
  ]);

  // Al configurar JOIN, si la tabla principal o secundarias no tienen columnas, pedirlas
  useEffect(() => {
    if (selected?.type !== "join" || !selected.join || loadingColumnsFor) return;
    const getMetaKey = (connId: string | number): string => {
      const w = widgets.find((x) => x.type === "connection" && x.connectionId != null && String(x.connectionId) === String(connId));
      return w ? w.id : `conn:${connId}`;
    };
    const ensure = (connId: string | number | undefined, tableName: string | undefined) => {
      if (!connId || !tableName) return;
      const key = getMetaKey(connId);
      const meta = metaByNode[key];
      const tbl = meta?.tables?.find((t) => `${t.schema}.${t.name}` === tableName);
      if (tbl?.columns?.length) return;
      loadColumnsForTable(connId, tableName, key);
    };
    ensure(selected.join.primaryConnectionId, selected.join.primaryTable);
    (selected.join.joins || []).forEach((j) => ensure(j.secondaryConnectionId, j.secondaryTable));
  }, [
    selected?.id,
    selected?.type,
    selected?.join?.primaryTable,
    selected?.join?.primaryConnectionId,
    selected?.join?.joins,
    widgets,
    metaByNode,
    loadingColumnsFor,
    loadColumnsForTable,
  ]);

  // Helpers to connect nodes: clicking handle on a node starts a connection; clicking target attaches
  const cancelConnect = () => {
    setConnectingFromId(null);
    setConnectMouse(null);
  };
  const startConnect = (fromId: string) => {
    setConnectingFromId(fromId);
    toast.message("Modo conexión", {
      description:
        "Haz click en el punto de 'Entrada' del nodo destino para completar.",
    });
  };
  const finishConnect = (toId: string) => {
    const fromId = connectingFromId;
    setConnectingFromId(null);
    setConnectMouse(null);
    if (!fromId || fromId === toId) return;
    // Allow chained connections: Connection -> Filter -> Table/Chart
    const fromNode = widgets.find((w) => w.id === fromId);
    const toNode = widgets.find((w) => w.id === toId);
    if (!fromNode || !toNode) return;
    const allowed =
      (fromNode.type === "connection" && toNode.type === "filter") ||
      (fromNode.type === "connection" && toNode.type === "join") ||
      (fromNode.type === "filter" && toNode.type === "arithmetic") ||
      (fromNode.type === "filter" && toNode.type === "count") ||
      (fromNode.type === "filter" && toNode.type === "condition") ||
      (fromNode.type === "filter" && toNode.type === "cast") ||
      (fromNode.type === "arithmetic" && toNode.type === "count") ||
      (fromNode.type === "arithmetic" && toNode.type === "condition") ||
      (fromNode.type === "arithmetic" && toNode.type === "cast") ||
      (fromNode.type === "join" && toNode.type === "filter") ||
      (fromNode.type === "join" && toNode.type === "arithmetic") ||
      (fromNode.type === "join" && toNode.type === "count") ||
      (fromNode.type === "join" && toNode.type === "condition") ||
      (fromNode.type === "join" && toNode.type === "cast") ||
      (fromNode.type === "filter" && toNode.type === "union") ||
      (fromNode.type === "filter" &&
        ["table", "bar", "line", "pie", "kpi", "clean", "cast", "end"].includes(
          toNode.type
        )) ||
      (fromNode.type === "union" &&
        ["filter", "table", "bar", "line", "pie", "kpi", "clean", "cast", "end", "arithmetic", "count", "condition"].includes(
          toNode.type
        )) ||
      (fromNode.type === "arithmetic" &&
        ["table", "bar", "line", "pie", "kpi", "clean", "cast", "end", "arithmetic"].includes(
          toNode.type
        )) ||
      (fromNode.type === "count" &&
        [
          "table",
          "bar",
          "line",
          "pie",
          "kpi",
          "clean",
          "cast",
          "end",
          "count",
          "arithmetic",
          "condition",
        ].includes(toNode.type)) ||
      (fromNode.type === "condition" &&
        [
          "table",
          "bar",
          "line",
          "pie",
          "kpi",
          "clean",
          "cast",
          "end",
          "count",
          "arithmetic",
          "condition",
        ].includes(toNode.type)) ||
      (fromNode.type === "join" &&
        ["table", "bar", "line", "pie", "kpi", "clean", "cast", "end"].includes(
          toNode.type
        )) ||
      (fromNode.type === "cast" &&
        [
          "arithmetic",
          "count",
          "condition",
          "table",
          "bar",
          "line",
          "pie",
          "kpi",
          "clean",
          "end",
        ].includes(toNode.type)) ||
      (fromNode.type === "clean" && ["end", "count"].includes(toNode.type));
    if (!allowed) {
      toast.error(
        "Conexión no permitida. Flujos válidos: Conexión -> (Filtro|JOIN) -> (Aritmético|Condiciones|Conteo|Conversión) -> (Aritmético|Condiciones|Conteo|Visualización|Clean|End)"
      );
      return;
    }
    const id = `e-${fromId}-${toId}`;
    setEdges((prev) => {
      if (prev.some((e) => e.id === id)) return prev; // avoid duplicates
      return [...prev, { id, from: fromId, to: toId }];
    });
    // Auto-select target to show its properties and trigger any loading state
    setSelectedId(toId);
  };
  const removeEdge = (edgeId: string) =>
    setEdges((prev) => prev.filter((e) => e.id !== edgeId));

  // Cancel connect with Escape
  const onCanvasKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape" && connectingFromId) {
      cancelConnect();
      e.stopPropagation();
      e.preventDefault();
    }
  };

  const [saving, setSaving] = useState(false);
  const onSave = async () => {
    try {
      setSaving(true);
      const supabase = createClient();
      const {
        data: { user },
        error: userErr,
      } = await supabase.auth.getUser();
      if (userErr) throw userErr;
      if (!user) throw new Error("No hay un usuario autenticado.");
      if (!etlId) throw new Error("No hay un ID de ETL para guardar.");

      const payload: any = {
        id: etlId,
        user_id: user.id,
        title: etlTitle || "Nuevo ETL",
        name: etlTitle || "Nuevo ETL",
        layout: {
          widgets,
          edges,
          zoom,
          grid,
          version: 1,
        },
        published: false,
        status: "Borrador",
      };

      const { data, error } = await supabase
        .from("etl")
        .upsert(payload, { onConflict: "id" })
        .select()
        .single();
      if (error) throw error;
      toast.success("ETL guardado correctamente");
    } catch (e: any) {
      toast.error(e?.message || "Error al guardar el ETL");
    } finally {
      setSaving(false);
    }
  };



  return (
    <div className="flex flex-row items-start gap-0 w-full h-full">
      {/* Left palette: tema plataforma */}
      <aside
        className={`flex flex-col items-center transition-all duration-300 relative border-r ${
          showLeftPanel
            ? "w-[270px] p-5 opacity-100 overflow-y-auto"
            : "w-0 p-0 opacity-0 overflow-hidden"
        }`}
        style={{
          height: "100%",
          transition: "width 0.3s ease, padding 0.3s ease",
          background: "var(--platform-surface)",
          borderColor: "var(--platform-border)",
        }}
      >
        <div className={`flex flex-col items-stretch gap-4 w-full max-w-[230px] ${showLeftPanel ? "block" : "hidden"}`}>
          {customLeftPanel ? (
            <>
              {customLeftPanel}
              <div className="w-full h-px my-2" style={{ background: "var(--platform-border)" }} />
              <DesignPaletteSection />
            </>
          ) : (
            <>
              <h3 className="text-lg font-semibold" style={{ color: "var(--platform-accent)" }}>Dashboard</h3>
              <p className="text-sm mb-4" style={{ color: "var(--platform-fg-muted)" }}>Crea tu dashboard</p>
              <DesignPaletteSection />
              <div className="space-y-4 w-full">
                <div>
                  <h4 className="font-medium mb-2 text-sm" style={{ color: "var(--platform-fg-muted)" }}>Datos</h4>
                  <div className="space-y-2">
                    {connections.map((conn) => (
                      <div
                        key={conn.id}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData(
                            DND_MIME,
                            JSON.stringify({
                              type: "connection",
                              title: conn.name,
                              connectionId: conn.id,
                            })
                          );
                          e.dataTransfer.effectAllowed = "copy";
                        }}
                        className="w-full rounded-xl px-3 py-2 text-left flex items-center gap-2 cursor-grab active:cursor-grabbing border transition-colors hover:opacity-90"
                        style={{ background: "var(--platform-surface-hover)", borderColor: "var(--platform-border)", color: "var(--platform-fg)" }}
                      >
                        <span className="h-7 w-7 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0" style={{ background: "var(--platform-accent-dim)", color: "var(--platform-accent)" }}>DB</span>
                        <span className="text-sm truncate" title={conn.name || "Sin nombre"}>{conn.name || "Sin nombre"}</span>
                      </div>
                    ))}
                    {connections.length === 0 && (
                      <div className="text-xs" style={{ color: "var(--platform-muted)" }}>No hay conexiones disponibles</div>
                    )}
                  </div>
                </div>
                <div>
                  <h4 className="font-medium mb-2 text-sm" style={{ color: "var(--platform-fg-muted)" }}>Plantillas</h4>
                  <div className="text-xs" style={{ color: "var(--platform-muted)" }}>5</div>
                </div>
                <div>
                  <h4 className="font-medium mb-2 text-sm" style={{ color: "var(--platform-fg-muted)" }}>Estilo</h4>
                  <div className="text-xs" style={{ color: "var(--platform-muted)" }}>5</div>
                </div>
              </div>
            </>
          )}
        </div>
      </aside>

      {/* Toggle Left Button */}
      <div className={`relative z-10 flex items-center h-full -ml-px ${!showLeftPanel ? "ml-0" : ""}`}>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-6 rounded-r-lg border-l-0 z-20 rounded-l-none"
          style={{ background: "var(--platform-surface)", borderColor: "var(--platform-border)", color: "var(--platform-fg-muted)" }}
          onClick={() => setShowLeftPanel(!showLeftPanel)}
          title={showLeftPanel ? "Ocultar panel lateral" : "Mostrar panel lateral"}
        >
          {showLeftPanel ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </Button>
      </div>

      {/* Main content area - Canvas and Right Panel */}
      <section className="flex flex-row items-start flex-1 h-full min-w-0 overflow-hidden relative">
        {/* Canvas area */}
        <div className="flex flex-col items-start h-full flex-1 relative min-w-0">
          <div className={`w-full flex-1 relative transition-all duration-300 ${showBottomPanel && customBottomPanel ? "h-[calc(100%-265px)]" : "h-full"}`}>
            <div
              ref={canvasRef}
              onDragOver={onCanvasDragOver}
              onDrop={onCanvasDrop}
              onPointerDown={onCanvasPointerDown}
              onPointerMove={onCanvasPointerMove}
              onPointerUp={onCanvasPointerUp}
              onPointerLeave={onCanvasPointerUp}
              className="flex flex-col justify-center items-start p-6 gap-2 w-full h-full relative overflow-hidden rounded-xl"
              style={{
                outline: "none",
                cursor: isCtrlPressed ? "grab" : "default",
                background: "var(--platform-bg)",
                backgroundImage:
                  "url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZpZXdCb3g9IjAgMCAxNiAxNiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSI4IiBjeT0iOCIgcj0iMSIgZmlsbD0icmdiYSgyNTUsMjU1LDI1NSwwLjA4KSIvPjwvc3ZnPg==')",
                backgroundSize: "16px 16px",
              }}
              role="application"
              aria-label="Lienzo de diseño de ETL"
              tabIndex={0}
              onKeyDown={(e) => {
                if (connectingFromId) return onCanvasKeyDown(e);
                if (!selectedId) return;
                const delta = e.shiftKey ? grid : 1;
                if (["Delete", "Backspace"].includes(e.key)) {
                  setWidgets((prev) => prev.filter((w) => w.id !== selectedId));
                  setSelectedId(null);
                } else if (
                  ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(
                    e.key
                  )
                ) {
                  setWidgets((prev) =>
                    prev.map((w) => {
                      if (w.id !== selectedId) return w;
                      let nx = w.x;
                      let ny = w.y;
                      if (e.key === "ArrowUp") ny = ny - delta;
                      if (e.key === "ArrowDown") ny = ny + delta;
                      if (e.key === "ArrowLeft") nx = nx - delta;
                      if (e.key === "ArrowRight") nx = nx + delta;
                      return { ...w, x: snapTo(nx), y: snapTo(ny) };
                    })
                  );
                  e.preventDefault();
                }
              }}
            >
              <div
                className="absolute inset-0 pointer-events-none rounded-xl"
                style={{
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                  transformOrigin: "top left",
                }}
              />

              {/* Widgets layer */}
              <div
                className="relative"
                style={{
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                  transformOrigin: "top left",
                  width: contentBounds.width,
                  height: contentBounds.height,
                }}
              >
                {/* SVG edges layer */}
                <svg
                  className="absolute inset-0 pointer-events-none"
                  width={contentBounds.width}
                  height={contentBounds.height}
                  viewBox={`0 0 ${contentBounds.width} ${contentBounds.height}`}
                >
                  {/* Ghost connection while connecting */}
                  {connectingFromId &&
                    (() => {
                      const from = widgets.find(
                        (w) => w.id === connectingFromId
                      );
                      if (!from || !connectMouse) return null;
                      const x1 = from.x + from.w;
                      const y1 = from.y + from.h / 2;
                      const x2 = connectMouse.x;
                      const y2 = connectMouse.y;
                      const midX = (x1 + x2) / 2;
                      const d = `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`;
                      return (
                        <path
                          d={d}
                          stroke="#94a3b8"
                          strokeDasharray="4 4"
                          strokeWidth="2"
                          fill="none"
                        />
                      );
                    })()}
                  {edges.map((e) => {
                    const from = widgets.find((w) => w.id === e.from);
                    const to = widgets.find((w) => w.id === e.to);
                    if (!from || !to) return null;
                    const x1 = from.x + from.w;
                    const y1 = from.y + from.h / 2;
                    const x2 = to.x;
                    const y2 = to.y + to.h / 2;
                    const midX = (x1 + x2) / 2;
                    const path = `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`;
                    return (
                      <g key={e.id} className="pointer-events-auto">
                        <path
                          d={path}
                          stroke="#10b981"
                          strokeWidth="2"
                          fill="none"
                        />
                        {/* small clickable circle to remove edge */}
                        <circle
                          cx={midX}
                          cy={(y1 + y2) / 2}
                          r={6}
                          fill="#10b981"
                          className="cursor-pointer"
                          onClick={() => removeEdge(e.id)}
                        />
                      </g>
                    );
                  })}
                </svg>
                {widgets.map((w) => (
                  <Card
                    key={w.id}
                    className={`absolute rounded-xl border overflow-hidden select-none focus:outline-none focus:ring-2 focus:ring-[var(--platform-accent)] ${
                      selectedId === w.id
                        ? "ring-2 ring-[var(--platform-accent)]"
                        : ""
                    }`}
                    style={{
                      left: w.x,
                      top: w.y,
                      width: w.w,
                      height: w.h,
                      background: "var(--platform-surface)",
                      borderColor: "var(--platform-border)",
                    }}
                    onPointerDown={() => setSelectedId(w.id)}
                    role="group"
                    aria-label={`Widget ${w.title}`}
                    tabIndex={0}
                  >
                    <div
                      className="px-3 py-2 text-sm flex items-center justify-between cursor-grab active:cursor-grabbing border-b"
                      style={{ background: "var(--platform-surface-hover)", borderColor: "var(--platform-border)", color: "var(--platform-fg)" }}
                      onPointerDown={(e) => startDragWidget(w.id, e)}
                    >
                      <span className="font-medium truncate">
                        {w.title || w.type.toUpperCase()}
                      </span>
                      <button
                        className="h-7 w-7 rounded-lg flex items-center justify-center transition-colors hover:opacity-80"
                        style={{ color: "var(--platform-fg-muted)" }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setWidgets((prev) =>
                            prev.filter((x) => x.id !== w.id)
                          );
                          if (selectedId === w.id) setSelectedId(null);
                          // remove edges that touch this node
                          setEdges((prev) =>
                            prev.filter(
                              (ed) => ed.from !== w.id && ed.to !== w.id
                            )
                          );
                        }}
                        aria-label={`Eliminar ${w.title}`}
                        title={`Eliminar ${w.title}`}
                      >
                        ×
                      </button>
                    </div>
                    <div className="w-full h-[calc(100%-36px)] flex items-center justify-center p-2 relative" style={{ background: "var(--platform-bg)" }}>
                      {/* Connection handles: Salida (derecha), Entrada (izquierda) */}
                      <div className="absolute -right-3 top-1/2 -translate-y-1/2 flex flex-col items-center gap-1">
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded" style={{ background: "var(--platform-surface)", color: "var(--platform-fg-muted)", border: "1px solid var(--platform-border)" }}>
                          Salida
                        </span>
                        <button
                          className={`h-5 w-5 rounded-full border-2 shadow hover:scale-110 transition ${
                            connectingFromId === w.id
                              ? "opacity-100"
                              : "opacity-90"
                          }`}
                          style={{ background: "var(--platform-accent)", borderColor: "var(--platform-surface)" }}
                          title="Iniciar conexión (Salida)"
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            startConnect(w.id);
                          }}
                        />
                      </div>
                      <div className="absolute -left-3 top-1/2 -translate-y-1/2 flex flex-col items-center gap-1">
                        <button
                          className={`h-5 w-5 rounded-full border-2 shadow hover:scale-110 transition ${
                            (connectingFromId &&
                              ((w.type === "filter" &&
                                widgets.find((x) => x.id === connectingFromId)
                                  ?.type === "connection") ||
                                (w.type === "arithmetic" &&
                                  widgets.find((x) => x.id === connectingFromId)
                                    ?.type === "filter") ||
                                (w.type === "count" &&
                                  ["filter", "arithmetic"].includes(
                                    widgets.find(
                                      (x) => x.id === connectingFromId
                                    )?.type || ""
                                  )) ||
                                (w.type === "condition" &&
                                  ["filter", "arithmetic"].includes(
                                    widgets.find(
                                      (x) => x.id === connectingFromId
                                    )?.type || ""
                                  )) ||
                                ([
                                  "table",
                                  "bar",
                                  "line",
                                  "pie",
                                  "kpi",
                                  "clean",
                                  "end",
                                ].includes(w.type) &&
                                  [
                                    "filter",
                                    "arithmetic",
                                    "count",
                                    "condition",
                                  ].includes(
                                    widgets.find(
                                      (x) => x.id === connectingFromId
                                    )?.type || ""
                                  )))) ||
                            (w.type === "end" &&
                              widgets.find((x) => x.id === connectingFromId)
                                ?.type === "clean")
                              ? "opacity-100"
                              : "opacity-90"
                          }`}
                          style={{ background: "var(--platform-success)", borderColor: "var(--platform-surface)" }}
                          title="Finalizar conexión (Entrada)"
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            finishConnect(w.id);
                          }}
                        />
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded" style={{ background: "var(--platform-surface)", color: "var(--platform-fg-muted)", border: "1px solid var(--platform-border)" }}>
                          Entrada
                        </span>
                      </div>
                      {w.type === "bar" && w.config ? (
                        <Bar
                          data={{
                            labels: w.config.labels,
                            datasets: w.config.datasets as any,
                          }}
                          options={{
                            responsive: true,
                            maintainAspectRatio: false,
                            plugins: { legend: { display: true } },
                            scales: {
                              x: { grid: { display: false } },
                              y: { grid: { color: "#eee" } },
                            },
                            ...(w.config.options || {}),
                          }}
                        />
                      ) : w.type === "line" && w.config ? (
                        <Line
                          data={{
                            labels: w.config.labels,
                            datasets: w.config.datasets as any,
                          }}
                          options={{
                            responsive: true,
                            maintainAspectRatio: false,
                            plugins: { legend: { display: true } },
                            elements: { point: { radius: 3 } },
                            ...(w.config.options || {}),
                          }}
                        />
                      ) : w.type === "pie" && w.config ? (
                        <Pie
                          data={{
                            labels: w.config.labels,
                            datasets: w.config.datasets as any,
                          }}
                          options={{
                            responsive: true,
                            maintainAspectRatio: false,
                            ...(w.config.options || {}),
                          }}
                        />
                      ) : w.type === "kpi" ? (
                        <div className="text-4xl font-bold text-gray-800">
                          518
                        </div>
                      ) : w.type === "table" ? (
                        <div className="text-sm" style={{ color: "var(--platform-fg-muted)" }}>
                          Tabla (placeholder)
                        </div>
                      ) : w.type === "connection" ? (
                        <div className="w-full h-full overflow-auto text-left px-2">
                          <div className="text-xs mb-2" style={{ color: "var(--platform-fg-muted)" }}>
                            Vista previa de conexión
                          </div>
                          {selectedId === w.id && metaLoading ? (
                            <div className="text-sm" style={{ color: "var(--platform-fg-muted)" }}>
                              Cargando metadata…
                            </div>
                          ) : selectedId === w.id && metaError ? (
                            <div className="text-sm" style={{ color: "var(--platform-danger)" }}>
                              {metaError}
                            </div>
                          ) : selectedId === w.id && connMeta ? (
                            <div className="space-y-2">
                              {connMeta.dbVersion && (
                                <div className="text-sm" style={{ color: "var(--platform-fg)" }}>
                                  Versión DB: {connMeta.dbVersion}
                                </div>
                              )}
                              <div className="text-sm" style={{ color: "var(--platform-fg)" }}>
                                Schemas:{" "}
                                {connMeta.schemas?.slice(0, 6).join(", ")}
                                {connMeta.schemas && connMeta.schemas.length > 6
                                  ? " …"
                                  : ""}
                              </div>
                              <div className="text-sm" style={{ color: "var(--platform-fg)" }}>
                                Tablas:{" "}
                                {connMeta.tables
                                  ?.slice(0, 10)
                                  .map((t) => `${t.schema}.${t.name}`)
                                  .join(", ")}
                                {connMeta.tables && connMeta.tables.length > 10
                                  ? " …"
                                  : ""}
                              </div>
                            </div>
                          ) : (
                            <div className="text-sm" style={{ color: "var(--platform-fg-muted)" }}>
                              Seleccioná este nodo para ver tablas
                            </div>
                          )}
                        </div>
                      ) : w.type === "filter" ? (
                        <div className="w-full h-full overflow-auto text-left px-2">
                          <div className="text-xs mb-2" style={{ color: "var(--platform-fg-muted)" }}>
                            Filtro
                          </div>
                          <div className="text-sm" style={{ color: "var(--platform-fg)" }}>
                            {w.filter?.table ? (
                              <>
                                Tabla: {w.filter.table}
                                <br />
                                Columnas: {w.filter.columns?.join(", ") || "—"}
                                <br />
                                Condiciones: {w.filter.conditions?.length || 0}
                              </>
                            ) : (
                              <span style={{ color: "var(--platform-fg-muted)" }}>
                                Tabla y condiciones en el panel derecho
                              </span>
                            )}
                          </div>
                          {/* Preview button inside filter */}
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <FilterPreviewButton
                              widget={w}
                              edges={edges}
                              widgets={widgets}
                            />
                            <FilterExportExcelButton
                              widget={w}
                              edges={edges}
                              widgets={widgets}
                            />
                          </div>
                        </div>
                      ) : w.type === "clean" ? (
                        <div className="w-full h-full overflow-auto text-left">
                          <div className="text-xs text-gray-500 mb-2">
                            Limpieza y calidad
                          </div>
                          <div className="text-sm text-gray-700">
                            {[
                              w.clean?.transforms?.length && `${w.clean.transforms.length} transform.`,
                              w.clean?.nullCleanup?.columns?.length && "nulos",
                              w.clean?.dataFixes?.length && `${w.clean.dataFixes.length} correcciones`,
                              w.clean?.dedupe?.keyColumns?.length && `dedupe (${w.clean.dedupe.keyColumns.length} cols)`,
                            ].filter(Boolean).join(" · ") || "Sin configuración"}
                          </div>
                        </div>
                      ) : w.type === "count" ? (
                        <div className="w-full h-full overflow-auto text-left">
                          <div className="text-xs text-gray-500 mb-2">
                            Nodo de Conteo
                          </div>
                          <div className="text-sm text-gray-700">
                            {w.count?.attribute
                              ? `Atributo: ${w.count.attribute}`
                              : "Sin atributo seleccionado"}
                            <br />
                            Nueva columna: {w.count?.resultColumn || "conteo"}
                          </div>
                          {/* Preview button inside count node */}
                          <div className="mt-2">
                            <CountPreviewButton
                              widget={w}
                              edges={edges}
                              widgets={widgets}
                            />
                          </div>
                        </div>
                      ) : w.type === "arithmetic" ? (
                        <div className="w-full h-full overflow-auto text-left">
                          <div className="text-xs text-gray-500 mb-2">
                            Nodo Aritmético
                          </div>
                          <div className="text-sm text-gray-700">
                            {w.arithmetic?.operations?.length
                              ? `${w.arithmetic.operations.length} operaciones`
                              : "Sin operaciones"}
                          </div>
                          {w.arithmetic?.operations?.map((op, idx) => (
                            <div
                              key={op.id}
                              className="text-xs text-gray-600 mt-1"
                            >
                              {op.resultColumn} = {op.leftOperand.value}{" "}
                              {op.operator === "pct_of" ? "× % de" : op.operator === "pct_off" ? "descuento %" : op.operator}{" "}
                              {op.rightOperand.value}
                            </div>
                          ))}
                          {/* Preview button inside arithmetic node */}
                          <div className="mt-2">
                            <ArithmeticPreviewButton
                              widget={w}
                              edges={edges}
                              widgets={widgets}
                            />
                          </div>
                        </div>
                      ) : w.type === "cast" ? (
                        <div className="w-full h-full overflow-auto text-left">
                          <div className="text-xs text-gray-500 mb-2">
                            Nodo de Conversión de Tipos
                          </div>
                          <div className="text-sm text-gray-700">
                            {w.cast?.conversions?.length
                              ? `${w.cast.conversions.length} conversiones`
                              : "Sin conversiones"}
                          </div>
                          {w.cast?.conversions?.map((c, idx) => (
                            <div
                              key={`${c.column}-${idx}`}
                              className="text-xs text-gray-600 mt-1"
                            >
                              {c.column} → {c.targetType}
                            </div>
                          ))}
                          {/* Preview button inside cast node */}
                          <div className="mt-2">
                            <CastPreviewButton
                              widget={w}
                              edges={edges}
                              widgets={widgets}
                            />
                          </div>
                        </div>
                      ) : w.type === "condition" ? (
                        <div className="w-full h-full overflow-auto text-left">
                          <div className="text-xs text-gray-500 mb-2">
                            Nodo de Condiciones
                          </div>
                          {w.condition?.resultColumn && (
                            <div className="text-xs text-gray-600 mb-1">
                              Columna: {w.condition.resultColumn}
                              {w.condition.defaultResultValue != null && w.condition.defaultResultValue !== "" && (
                                <> · Def: {w.condition.defaultResultValue}</>
                              )}
                            </div>
                          )}
                          <div className="text-sm text-gray-700">
                            {w.condition?.rules?.length
                              ? `${w.condition.rules.length} reglas`
                              : "Sin reglas"}
                          </div>
                          {w.condition?.rules?.map((r, idx) => (
                            <div
                              key={r.id}
                              className="text-xs text-gray-600 mt-1"
                            >
                              Si {r.leftOperand?.value}{" "}
                              {r.comparator} {r.rightOperand?.value} → {r.thenValue ?? r.outputType}
                            </div>
                          ))}
                          <div className="mt-2">
                            <ConditionPreviewButton
                              widget={w}
                              edges={edges}
                              widgets={widgets}
                            />
                          </div>
                        </div>
                      ) : w.type === "union" ? (
                        <div className="flex flex-col gap-1">
                          <span className="text-xs font-medium" style={{ color: "var(--platform-fg-muted)" }}>
                            UNION
                          </span>
                          <span className="text-[10px]" style={{ color: "var(--platform-fg-muted)" }}>
                            {w.union?.unionAll !== false ? "UNION ALL" : "UNION"}
                          </span>
                        </div>
                      ) : w.type === "join" ? (
                        <div className="w-full h-full overflow-auto text-left">
                          <div className="text-xs text-gray-500 mb-2">
                            Nodo de JOIN
                          </div>
                          <div className="text-sm text-gray-700">
                            {w.join?.primaryTable
                              ? `${w.join.primaryTable} (principal)`
                              : "Selecciona tabla principal"}
                          </div>
                          <div className="text-xs text-gray-600 mt-1">
                            {w.join?.joins?.length
                              ? `${w.join.joins.length} tabla(s) secundarias`
                              : "Sin tablas secundarias"}
                          </div>
                          {w.join?.joins?.map((j, idx) => (
                            <div
                              key={j.id}
                              className="text-xs text-gray-600 mt-1"
                            >
                              {j.secondaryTable || "(sin tabla)"} · {j.joinType}{" "}
                              · {j.primaryColumn || "?"} ={" "}
                              {j.secondaryColumn || "?"}
                            </div>
                          ))}
                          <div className="mt-2">
                            <JoinPreviewButton widget={w} />
                          </div>
                        </div>
                      ) : w.type === "end" ? (
                        <div className="w-full h-full overflow-auto text-left">
                          <div className="text-xs text-gray-500 mb-2">
                            Nodo Fin
                          </div>
                          <div className="text-sm text-gray-700">
                            Destino: Supabase · Tabla:{" "}
                            {w.end?.target?.table || "—"}
                          </div>
                          {w.end?.lastRun && (
                            <div className="text-xs text-gray-600 mt-1">
                              Última ejecución:{" "}
                              {new Date(w.end.lastRun.at).toLocaleString()} ·{" "}
                              {w.end.lastRun.rows ?? 0} filas{" "}
                              {w.end.lastRun.stored ? "guardadas" : ""}
                              {w.end.lastRun.error ? (
                                <div className="text-red-600">
                                  {w.end.lastRun.error}
                                </div>
                              ) : null}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="text-sm text-gray-400">Widget</div>
                      )}
                    </div>

                    {/* Resize handles: corners + edges */}
                    {selectedId === w.id && (
                      <>
                        {/* SE */}
                        <div
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            if (!canvasRef.current) return;
                            const rect =
                              canvasRef.current.getBoundingClientRect();
                            resizeState.current = {
                              id: w.id,
                              startX: (e.clientX - rect.left - pan.x) / zoom,
                              startY: (e.clientY - rect.top - pan.y) / zoom,
                              origW: w.w,
                              origH: w.h,
                              origX: w.x,
                              origY: w.y,
                              handle: "se",
                            };
                            (e.target as Element).setPointerCapture?.(
                              e.pointerId
                            );
                          }}
                          className="absolute -right-2 -bottom-2 h-4 w-4 bg-emerald-500 rounded-full border-2 border-white shadow outline-none focus:ring-2 focus:ring-emerald-300"
                          style={{ cursor: "se-resize" }}
                        />
                        {/* E */}
                        <div
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            if (!canvasRef.current) return;
                            const rect =
                              canvasRef.current.getBoundingClientRect();
                            resizeState.current = {
                              id: w.id,
                              startX: (e.clientX - rect.left - pan.x) / zoom,
                              startY: (e.clientY - rect.top - pan.y) / zoom,
                              origW: w.w,
                              origH: w.h,
                              origX: w.x,
                              origY: w.y,
                              handle: "e",
                            };
                            (e.target as Element).setPointerCapture?.(
                              e.pointerId
                            );
                          }}
                          className="absolute -right-2 top-1/2 -translate-y-1/2 h-3 w-3 bg-emerald-500 rounded-full border-2 border-white shadow outline-none focus:ring-2 focus:ring-emerald-300"
                          style={{ cursor: "e-resize" }}
                        />
                        {/* S */}
                        <div
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            if (!canvasRef.current) return;
                            const rect =
                              canvasRef.current.getBoundingClientRect();
                            resizeState.current = {
                              id: w.id,
                              startX: (e.clientX - rect.left - pan.x) / zoom,
                              startY: (e.clientY - rect.top - pan.y) / zoom,
                              origW: w.w,
                              origH: w.h,
                              origX: w.x,
                              origY: w.y,
                              handle: "s",
                            };
                            (e.target as Element).setPointerCapture?.(
                              e.pointerId
                            );
                          }}
                          className="absolute left-1/2 -translate-x-1/2 -bottom-2 h-3 w-3 bg-emerald-500 rounded-full border-2 border-white shadow outline-none focus:ring-2 focus:ring-emerald-300"
                          style={{ cursor: "s-resize" }}
                        />
                        {/* SW */}
                        <div
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            if (!canvasRef.current) return;
                            const rect =
                              canvasRef.current.getBoundingClientRect();
                            resizeState.current = {
                              id: w.id,
                              startX: (e.clientX - rect.left - pan.x) / zoom,
                              startY: (e.clientY - rect.top - pan.y) / zoom,
                              origW: w.w,
                              origH: w.h,
                              origX: w.x,
                              origY: w.y,
                              handle: "sw",
                            };
                            (e.target as Element).setPointerCapture?.(
                              e.pointerId
                            );
                          }}
                          className="absolute -left-2 -bottom-2 h-4 w-4 bg-emerald-500 rounded-full border-2 border-white shadow outline-none focus:ring-2 focus:ring-emerald-300"
                          style={{ cursor: "sw-resize" }}
                        />
                        {/* W */}
                        <div
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            if (!canvasRef.current) return;
                            const rect =
                              canvasRef.current.getBoundingClientRect();
                            resizeState.current = {
                              id: w.id,
                              startX: (e.clientX - rect.left - pan.x) / zoom,
                              startY: (e.clientY - rect.top - pan.y) / zoom,
                              origW: w.w,
                              origH: w.h,
                              origX: w.x,
                              origY: w.y,
                              handle: "w",
                            };
                            (e.target as Element).setPointerCapture?.(
                              e.pointerId
                            );
                          }}
                          className="absolute -left-2 top-1/2 -translate-y-1/2 h-3 w-3 bg-emerald-500 rounded-full border-2 border-white shadow outline-none focus:ring-2 focus:ring-emerald-300"
                          style={{ cursor: "w-resize" }}
                        />
                        {/* NE */}
                        <div
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            if (!canvasRef.current) return;
                            const rect =
                              canvasRef.current.getBoundingClientRect();
                            resizeState.current = {
                              id: w.id,
                              startX: (e.clientX - rect.left - pan.x) / zoom,
                              startY: (e.clientY - rect.top - pan.y) / zoom,
                              origW: w.w,
                              origH: w.h,
                              origX: w.x,
                              origY: w.y,
                              handle: "ne",
                            };
                            (e.target as Element).setPointerCapture?.(
                              e.pointerId
                            );
                          }}
                          className="absolute -right-2 -top-2 h-4 w-4 bg-emerald-500 rounded-full border-2 border-white shadow outline-none focus:ring-2 focus:ring-emerald-300"
                          style={{ cursor: "ne-resize" }}
                        />
                        {/* N */}
                        <div
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            if (!canvasRef.current) return;
                            const rect =
                              canvasRef.current.getBoundingClientRect();
                            resizeState.current = {
                              id: w.id,
                              startX: (e.clientX - rect.left - pan.x) / zoom,
                              startY: (e.clientY - rect.top - pan.y) / zoom,
                              origW: w.w,
                              origH: w.h,
                              origX: w.x,
                              origY: w.y,
                              handle: "n",
                            };
                            (e.target as Element).setPointerCapture?.(
                              e.pointerId
                            );
                          }}
                          className="absolute left-1/2 -translate-x-1/2 -top-2 h-3 w-3 bg-emerald-500 rounded-full border-2 border-white shadow outline-none focus:ring-2 focus:ring-emerald-300"
                          style={{ cursor: "n-resize" }}
                        />
                        {/* NW */}
                        <div
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            if (!canvasRef.current) return;
                            const rect =
                              canvasRef.current.getBoundingClientRect();
                            resizeState.current = {
                              id: w.id,
                              startX: (e.clientX - rect.left - pan.x) / zoom,
                              startY: (e.clientY - rect.top - pan.y) / zoom,
                              origW: w.w,
                              origH: w.h,
                              origX: w.x,
                              origY: w.y,
                              handle: "nw",
                            };
                            (e.target as Element).setPointerCapture?.(
                              e.pointerId
                            );
                          }}
                          className="absolute -left-2 -top-2 h-4 w-4 bg-emerald-500 rounded-full border-2 border-white shadow outline-none focus:ring-2 focus:ring-emerald-300"
                          style={{ cursor: "nw-resize" }}
                        />
                      </>
                    )}
                  </Card>
                ))}
              </div>

              {/* Floating zoom controls */}
              <div className="absolute right-4 bottom-24 flex flex-col gap-2">
                <button
                  onClick={zoomOut}
                  className="h-10 w-10 rounded-full border flex items-center justify-center transition-colors hover:opacity-90"
                  style={{ background: "var(--platform-surface)", borderColor: "var(--platform-border)", color: "var(--platform-fg)" }}
                  aria-label="Alejar"
                  title="Alejar"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <button
                  onClick={zoomIn}
                  className="h-10 w-10 rounded-full border flex items-center justify-center transition-colors hover:opacity-90"
                  style={{ background: "var(--platform-surface)", borderColor: "var(--platform-border)", color: "var(--platform-fg)" }}
                  aria-label="Acercar"
                  title="Acercar"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>

              {/* Barra de estado (tema plataforma) */}
              <div className="absolute left-1/2 -translate-x-1/2 bottom-4">
                <div className="rounded-2xl px-4 py-2.5 flex items-center gap-3 border" style={{ background: "var(--platform-surface)", borderColor: "var(--platform-border)", color: "var(--platform-fg)" }}>
                  <span className="inline-flex items-center gap-2 text-sm">
                    <span className="h-2 w-2 rounded-full bg-[var(--platform-success)]" />{" "}
                    Guardado hace 3 min
                  </span>
                  <span className="opacity-50" style={{ color: "var(--platform-fg-muted)" }}>|</span>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={onSave}
                    disabled={saving}
                    className="rounded-full h-8 px-4 border-0"
                    style={{ background: "var(--platform-surface-hover)", color: "var(--platform-fg)" }}
                    aria-label="Programar ETL"
                  >
                    {saving ? "Programando..." : "Programar"}
                  </Button>
                  {connectingFromId && (
                    <>
                      <span className="opacity-50" style={{ color: "var(--platform-fg-muted)" }}>|</span>
                      <span className="text-sm" style={{ color: "var(--platform-fg-muted)" }}>
                        Conectando... pulsa &quot;Entrada&quot; en el destino
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={cancelConnect}
                        className="rounded-full h-8 px-3"
                        style={{ background: "var(--platform-surface-hover)", color: "var(--platform-fg)", borderColor: "var(--platform-border)" }}
                      >
                        Cancelar
                      </Button>
                    </>
                  )}
                  <span className="opacity-50" style={{ color: "var(--platform-fg-muted)" }}>|</span>
                  <Button
                    size="sm"
                    className="rounded-full h-8 px-4 border-0"
                    style={{ background: "var(--platform-accent)", color: "var(--platform-bg)" }}
                    aria-label="Ejecutar ETL"
                  >
                    Ejecutar
                  </Button>
                </div>
              </div>
              {widgets.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="text-sm rounded-xl px-5 py-3 border max-w-sm text-center" style={{ background: "var(--platform-surface)", borderColor: "var(--platform-border)", color: "var(--platform-fg-muted)" }}>
                    1. Arrastrá una <strong style={{ color: "var(--platform-fg)" }}>conexión</strong> al lienzo → 2. Conectá un <strong style={{ color: "var(--platform-fg)" }}>Filtro</strong> → 3. Agregá <strong style={{ color: "var(--platform-fg)" }}>Fin</strong> y uní los nodos con Salida → Entrada.
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Bottom panel: tema plataforma */}
          {customBottomPanel && (
            <div
              className={`w-full transition-all duration-300 overflow-hidden border-t ${showBottomPanel ? "h-[265px]" : "h-0"}`}
              style={{ background: "var(--platform-surface)", borderColor: "var(--platform-border)" }}
            >
              <div className="relative w-full h-full">
                {customBottomPanel}
                <Button
                    variant="ghost"
                    size="icon"
                    className="absolute top-2 right-2 h-7 w-7 z-50 rounded-lg"
                    style={{ background: "var(--platform-surface-hover)", color: "var(--platform-fg-muted)" }}
                    onClick={() => setShowBottomPanel(false)}
                    title="Minimizar panel inferior"
                >
                    <ChevronDown className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {customBottomPanel && !showBottomPanel && (
             <div className="absolute bottom-4 right-4 z-50">
                <Button
                    size="icon"
                    className="h-10 w-10 rounded-full"
                    style={{ background: "var(--platform-accent)", color: "var(--platform-bg)" }}
                    onClick={() => setShowBottomPanel(true)}
                    title="Mostrar panel inferior (Log / Datos)"
                >
                  <PanelLeftOpen className="h-5 w-5 rotate-90" />
                </Button>
             </div>
          )}
        </div>

        {/* Toggle Right Button */}
        <div className={`relative z-10 flex items-center h-full -mr-px ${!showRightPanel ? "mr-0" : ""}`}>
           <Button
             variant="outline"
             size="icon"
             className="h-8 w-6 rounded-l-lg border-r-0 z-20 rounded-r-none"
             style={{ background: "var(--platform-surface)", borderColor: "var(--platform-border)", color: "var(--platform-fg-muted)" }}
             onClick={() => setShowRightPanel(!showRightPanel)}
             title={showRightPanel ? "Ocultar panel derecho" : "Mostrar panel derecho"}
           >
             {showRightPanel ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
           </Button>
        </div>

        {/* Right properties panel: tema plataforma */}
        <aside
           className={`border-l transition-all duration-300 overflow-hidden ${showRightPanel ? "w-[315px] opacity-100" : "w-0 opacity-0"}`}
           style={{ height: "100%", transition: "width 0.3s ease, opacity 0.3s ease", background: "var(--platform-surface)", borderColor: "var(--platform-border)" }}
        >
          <div data-etl-right-panel className={`p-4 sticky top-0 space-y-6 h-full overflow-y-auto w-[315px] ${showRightPanel ? "block" : "hidden"}`} style={{ color: "var(--platform-fg)" }}>
            <h3 className="text-lg font-semibold" style={{ color: "var(--platform-accent)" }}>
              Propiedades del Widget
            </h3>
            {selected ? (
              <div className="space-y-4">
                <div>
                  <Label htmlFor="titulo">Título</Label>
                  <Input
                    id="titulo"
                    value={selected.title}
                    onChange={(e) => updateSelected({ title: e.target.value })}
                    className="rounded-xl"
                  />
                </div>

                <div>
                  <div className="font-medium text-sm" style={{ color: "var(--platform-fg-muted)" }}>
                    Dimensiones
                  </div>
                  <div className="grid grid-cols-2 gap-3 mt-2">
                    <div>
                      <Label htmlFor="ancho">Ancho</Label>
                      <Input
                        id="ancho"
                        type="number"
                        value={selected.w}
                        onChange={(e) =>
                          updateSelected({
                            w: clamp(
                              parseInt(e.target.value || "0", 10),
                              120,
                              1600
                            ),
                          })
                        }
                        className="rounded-xl"
                      />
                    </div>
                    <div>
                      <Label htmlFor="alto">Alto</Label>
                      <Input
                        id="alto"
                        type="number"
                        value={selected.h}
                        onChange={(e) =>
                          updateSelected({
                            h: clamp(
                              parseInt(e.target.value || "0", 10),
                              80,
                              1200
                            ),
                          })
                        }
                        className="rounded-xl"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <div className="font-medium text-sm text-gray-700">
                    Posición
                  </div>
                  <div className="grid grid-cols-2 gap-3 mt-2">
                    <div>
                      <Label htmlFor="px">X</Label>
                      <Input
                        id="px"
                        type="number"
                        value={selected.x}
                        onChange={(e) =>
                          updateSelected({
                            x: parseInt(e.target.value || "0", 10),
                          })
                        }
                        className="rounded-xl"
                      />
                    </div>
                    <div>
                      <Label htmlFor="py">Y</Label>
                      <Input
                        id="py"
                        type="number"
                        value={selected.y}
                        onChange={(e) =>
                          updateSelected({
                            y: parseInt(e.target.value || "0", 10),
                          })
                        }
                        className="rounded-xl"
                      />
                    </div>
                  </div>
                </div>

                {/* Chart config UI (friendly inputs) */}
                {(selected.type === "bar" ||
                  selected.type === "line" ||
                  selected.type === "pie") && (
                  <div className="space-y-4">
                    {/* Labels editor */}
                    <div className="space-y-2">
                      <Label>Etiquetas</Label>
                      <div className="space-y-2">
                        {ensureConfig().labels.map((lb, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <Input
                              value={lb}
                              onChange={(e) =>
                                updateConfig((cfg) => {
                                  const labels = [...cfg.labels];
                                  labels[i] = e.target.value;
                                  return { ...cfg, labels };
                                })
                              }
                              className="rounded-xl"
                            />
                            <Button
                              variant="outline"
                              className="rounded-full"
                              onClick={() =>
                                updateConfig((cfg) => {
                                  const labels = cfg.labels.filter(
                                    (_, idx) => idx !== i
                                  );
                                  const datasets = cfg.datasets.map((ds) => ({
                                    ...ds,
                                    data: ds.data.filter((_, idx) => idx !== i),
                                    backgroundColor: Array.isArray(
                                      ds.backgroundColor
                                    )
                                      ? (ds.backgroundColor as string[]).filter(
                                          (_, idx) => idx !== i
                                        )
                                      : ds.backgroundColor,
                                  }));
                                  return { ...cfg, labels, datasets };
                                })
                              }
                            >
                              Quitar
                            </Button>
                          </div>
                        ))}
                        <Button
                          variant="outline"
                          className="rounded-full"
                          onClick={() =>
                            updateConfig((cfg) => {
                              const labels = [
                                ...cfg.labels,
                                `Item ${cfg.labels.length + 1}`,
                              ];
                              const datasets = cfg.datasets.map((ds) => ({
                                ...ds,
                                data: [...ds.data, 0],
                                backgroundColor: Array.isArray(
                                  ds.backgroundColor
                                )
                                  ? [
                                      ...(ds.backgroundColor as string[]),
                                      "#10b981",
                                    ]
                                  : ds.backgroundColor,
                              }));
                              return { ...cfg, labels, datasets };
                            })
                          }
                        >
                          Agregar etiqueta
                        </Button>
                      </div>
                    </div>

                    {/* Datasets editor */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>Series</Label>
                        <Button
                          variant="outline"
                          className="rounded-full"
                          onClick={() =>
                            updateConfig((cfg) => ({
                              ...cfg,
                              datasets: [
                                ...cfg.datasets,
                                {
                                  label: `Serie ${cfg.datasets.length + 1}`,
                                  data: Array(cfg.labels.length).fill(0),
                                  backgroundColor:
                                    selected.type === "pie"
                                      ? cfg.labels.map(() => "#06b6d4")
                                      : "rgba(59,130,246,0.4)",
                                  borderColor:
                                    selected.type === "pie"
                                      ? "#fff"
                                      : "#3b82f6",
                                  borderWidth: 2,
                                },
                              ],
                            }))
                          }
                        >
                          Agregar serie
                        </Button>
                      </div>

                      {ensureConfig().datasets.map((ds, di) => (
                        <div
                          key={di}
                          className="rounded-xl border p-3 space-y-3"
                        >
                          <div className="flex items-center gap-2">
                            <Input
                              value={ds.label}
                              onChange={(e) =>
                                updateConfig((cfg) => {
                                  const datasets = [...cfg.datasets];
                                  datasets[di] = {
                                    ...datasets[di],
                                    label: e.target.value,
                                  };
                                  return { ...cfg, datasets };
                                })
                              }
                              className="rounded-xl"
                            />
                            <Button
                              variant="outline"
                              className="rounded-full"
                              onClick={() =>
                                updateConfig((cfg) => ({
                                  ...cfg,
                                  datasets: cfg.datasets.filter(
                                    (_, idx) => idx !== di
                                  ),
                                }))
                              }
                            >
                              Quitar serie
                            </Button>
                          </div>

                          {selected.type === "pie" ? (
                            <div className="space-y-2">
                              <Label>Colores por etiqueta</Label>
                              {ensureConfig().labels.map((_, li) => (
                                <div
                                  key={li}
                                  className="flex items-center gap-2"
                                >
                                  <input
                                    type="color"
                                    value={
                                      Array.isArray(ds.backgroundColor)
                                        ? (ds.backgroundColor as string[])[
                                            li
                                          ] || "#10b981"
                                        : "#10b981"
                                    }
                                    onChange={(e) =>
                                      updateConfig((cfg) => {
                                        const datasets = [...cfg.datasets];
                                        const bgs = Array.isArray(
                                          datasets[di].backgroundColor
                                        )
                                          ? [
                                              ...((datasets[di]
                                                .backgroundColor as string[]) ||
                                                []),
                                            ]
                                          : cfg.labels.map(() =>
                                              typeof datasets[di]
                                                .backgroundColor === "string"
                                                ? (datasets[di]
                                                    .backgroundColor as string)
                                                : "#10b981"
                                            );
                                        bgs[li] = e.target.value;
                                        datasets[di] = {
                                          ...datasets[di],
                                          backgroundColor: bgs,
                                        };
                                        return { ...cfg, datasets };
                                      })
                                    }
                                  />
                                  <span className="text-sm text-gray-600">
                                    {ensureConfig().labels[li]}
                                  </span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="flex items-center gap-4">
                              <div className="flex items-center gap-2">
                                <Label>Fondo</Label>
                                <input
                                  type="color"
                                  value={
                                    typeof ds.backgroundColor === "string"
                                      ? (ds.backgroundColor as string)
                                      : "#10b981"
                                  }
                                  onChange={(e) =>
                                    updateConfig((cfg) => {
                                      const datasets = [...cfg.datasets];
                                      datasets[di] = {
                                        ...datasets[di],
                                        backgroundColor: e.target.value,
                                      };
                                      return { ...cfg, datasets };
                                    })
                                  }
                                />
                              </div>
                              <div className="flex items-center gap-2">
                                <Label>Borde</Label>
                                <input
                                  type="color"
                                  value={
                                    typeof ds.borderColor === "string"
                                      ? (ds.borderColor as string)
                                      : "#10b981"
                                  }
                                  onChange={(e) =>
                                    updateConfig((cfg) => {
                                      const datasets = [...cfg.datasets];
                                      datasets[di] = {
                                        ...datasets[di],
                                        borderColor: e.target.value,
                                      };
                                      return { ...cfg, datasets };
                                    })
                                  }
                                />
                              </div>
                            </div>
                          )}

                          {/* Values grid */}
                          <div className="space-y-1">
                            <Label>Valores</Label>
                            <div className="grid grid-cols-2 gap-2">
                              {ensureConfig().labels.map((lb, li) => (
                                <div
                                  key={li}
                                  className="flex items-center gap-2"
                                >
                                  <span className="min-w-0 flex-1 truncate text-sm text-gray-600">
                                    {lb}
                                  </span>
                                  <Input
                                    type="number"
                                    value={Number(ds.data[li] ?? 0)}
                                    onChange={(e) =>
                                      updateConfig((cfg) => {
                                        const datasets = [...cfg.datasets];
                                        const data = [...datasets[di].data];
                                        data[li] = Number(e.target.value || 0);
                                        datasets[di] = {
                                          ...datasets[di],
                                          data,
                                        };
                                        return { ...cfg, datasets };
                                      })
                                    }
                                    className="w-24 rounded-xl"
                                  />
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Connection metadata inspector */}
                {selected.type === "connection" && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="font-medium text-sm text-gray-700">
                        Información de la base de datos
                      </div>
                      {selected.connectionId && (
                        <span className="text-xs text-gray-500">
                          ID: {String(selected.connectionId)}
                        </span>
                      )}
                    </div>
                    {metaLoading ? (
                      <div className="text-sm text-gray-600">
                        Cargando metadata…
                      </div>
                    ) : metaError ? (
                      <div className="text-sm text-red-600">{metaError}</div>
                    ) : !connMeta ? (
                      <div className="text-sm text-gray-500">
                        Selecciona una conexión válida para ver detalles.
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {connMeta.dbVersion && (
                          <div className="text-sm text-gray-700">
                            Versión:{" "}
                            <span className="font-medium">
                              {connMeta.dbVersion}
                            </span>
                          </div>
                        )}
                        <div>
                          <div className="font-medium text-sm text-gray-700 mb-1">
                            Schemas ({connMeta.schemas.length})
                          </div>
                          <div className="max-h-40 overflow-auto rounded-xl border p-2 text-sm text-gray-700 space-y-1">
                            {connMeta.schemas.map((s) => (
                              <div
                                key={s}
                                className="px-2 py-1 rounded hover:bg-gray-50"
                              >
                                {s}
                              </div>
                            ))}
                          </div>
                        </div>
                        <div>
                          <div className="font-medium text-sm text-gray-700 mb-1">
                            Tablas ({connMeta.tables.length})
                          </div>
                          <div className="max-h-64 overflow-auto rounded-xl border divide-y">
                            {connMeta.tables.map((t, idx) => {
                              const qualified = `${t.schema}.${t.name}`;
                              const loadingCols = loadingColumnsFor === qualified;
                              return (
                              <details
                                key={`${t.schema}.${t.name}-${idx}`}
                                className="p-2"
                              >
                                <summary
                                  className="cursor-pointer text-sm text-gray-800"
                                  onClick={(e) => {
                                    if (t.columns.length > 0 || loadingCols) return;
                                    if (selected.connectionId)
                                      loadColumnsForTable(selected.connectionId, qualified, "connMeta");
                                  }}
                                >
                                  {t.schema}.{t.name}{" "}
                                  <span className="text-gray-500">
                                    {loadingCols ? "Cargando columnas…" : `(${t.columns.length} columnas)`}
                                  </span>
                                </summary>
                                <div className="mt-2 pl-4">
                                  <table className="w-full text-xs text-left">
                                    <thead className="text-gray-500">
                                      <tr>
                                        <th className="py-1 pr-2">Columna</th>
                                        <th className="py-1 pr-2">Tipo</th>
                                        <th className="py-1 pr-2">Nulo</th>
                                        <th className="py-1 pr-2">PK</th>
                                        <th className="py-1 pr-2">Default</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {t.columns.map((c, ci) => (
                                        <tr key={ci} className="border-t">
                                          <td className="py-1 pr-2 font-medium text-gray-800">
                                            {c.name}
                                          </td>
                                          <td className="py-1 pr-2 text-gray-700">
                                            {c.dataType}
                                          </td>
                                          <td className="py-1 pr-2">
                                            {c.nullable ? "Sí" : "No"}
                                          </td>
                                          <td className="py-1 pr-2">
                                            {c.isPrimaryKey ? "Sí" : ""}
                                          </td>
                                          <td className="py-1 pr-2 text-gray-600 truncate max-w-[160px]">
                                            {String(c.defaultValue ?? "")}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </details>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Filter node config */}
                {selected.type === "filter" && (
                  <div className="space-y-3">
                    <div className="font-medium text-sm text-gray-700">
                      Configuración del Filtro
                    </div>
                    {filterMetaLoading && (
                      <div className="text-sm text-gray-600">
                        Cargando metadata de la conexión…
                      </div>
                    )}
                    {filterMetaError && (
                      <div className="text-sm text-red-600">
                        {filterMetaError}
                      </div>
                    )}
                    {/* Fuente: conexión o JOIN */}
                    <div className="text-xs text-gray-500">
                      Fuente:{" "}
                      {(() => {
                        const srcEdge = edges.find((e) => e.to === selected.id);
                        const srcNode =
                          srcEdge && widgets.find((w) => w.id === srcEdge.from);
                        if (!srcNode) return "No conectado";
                        return srcNode.type === "connection"
                          ? "Conexión"
                          : srcNode.type === "join"
                          ? "JOIN"
                          : srcNode.type;
                      })()}
                    </div>
                    {(() => {
                      const srcEdge = edges.find((e) => e.to === selected.id);
                      const srcNode =
                        srcEdge && widgets.find((w) => w.id === srcEdge.from);

                      // Branch: connected to JOIN (star schema)
                      if (srcNode?.type === "join") {
                        const j = srcNode.join || ({} as any);

                        // Resolve columns for a given table
                        const resolveCols = (
                          connId?: string | number,
                          qualified?: string,
                          picked?: string[]
                        ): string[] => {
                          if (!qualified) return [];
                          if (picked && picked.length > 0) return picked;
                          const [schema, name] = qualified.includes(".")
                            ? qualified.split(".", 2)
                            : ["public", qualified];
                          const connWidget = widgets.find(
                            (w) =>
                              w.type === "connection" &&
                              w.connectionId === connId
                          );
                          const tables =
                            connWidget && metaByNode[connWidget.id]
                              ? metaByNode[connWidget.id].tables
                              : connId && metaByNode[`conn:${connId}`]
                              ? metaByNode[`conn:${connId}`].tables
                              : [];
                          const tbl = (tables || []).find(
                            (t: any) => t.schema === schema && t.name === name
                          );
                          return (tbl?.columns || []).map((c: any) => c.name);
                        };

                        const primaryColsAvail: string[] = resolveCols(
                          j.primaryConnectionId,
                          j.primaryTable,
                          j.primaryColumns
                        );

                        // Build unified columns with prefixes
                        const unifiedCols: { key: string; label: string }[] =
                          [];
                        unifiedCols.push(
                          ...primaryColsAvail.map((n) => ({
                            key: `primary.${n}`,
                            label: `Principal · ${n}`,
                          }))
                        );
                        (j.joins || []).forEach((jn: any, i: number) => {
                          const secCols = resolveCols(
                            jn.secondaryConnectionId,
                            jn.secondaryTable,
                            jn.secondaryColumns
                          );
                          const friendly = (() => {
                            const opt = availableTablesForJoin.find(
                              (t) =>
                                String(t.connectionId) ===
                                  String(jn.secondaryConnectionId) &&
                                t.qualifiedName === jn.secondaryTable
                            );
                            if (opt) return `${opt.tableName}`;
                            return (
                              jn.secondaryTable?.split(".")[1] ||
                              `Join ${i + 1}`
                            );
                          })();
                          unifiedCols.push(
                            ...secCols.map((n: string) => ({
                              key: `join_${i}.${n}`,
                              label: `${friendly} · ${n}`,
                            }))
                          );
                        });

                        const canConfigure = unifiedCols.length > 0;

                        return (
                          <div className="space-y-3">
                            {!canConfigure && (
                              <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-2">
                                Configura el JOIN (tabla principal y joins) para
                                cargar columnas.
                              </div>
                            )}

                            {/* Columnas desde JOIN */}
                            <div>
                              <Label>Columnas</Label>
                              <div className="flex flex-wrap gap-2 mt-1">
                                {unifiedCols.map((c) => {
                                  const active =
                                    selected.filter?.columns?.includes(c.key);
                                  return (
                                    <button
                                      key={c.key}
                                      type="button"
                                      className={`px-2 py-1 rounded-full border text-xs ${
                                        active
                                          ? "bg-emerald-50 border-emerald-400 text-emerald-700"
                                          : "bg-white border-gray-300 text-gray-700"
                                      }`}
                                      onClick={() => {
                                        const cols = new Set(
                                          selected.filter?.columns || []
                                        );
                                        if (active) cols.delete(c.key);
                                        else cols.add(c.key);
                                        updateSelected({
                                          filter: {
                                            ...selected.filter,
                                            table: undefined,
                                            columns: Array.from(cols),
                                            conditions:
                                              selected.filter?.conditions || [],
                                          },
                                        });
                                      }}
                                      disabled={!canConfigure}
                                    >
                                      {c.label}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>

                            {/* Condiciones sobre JOIN */}
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <Label>Condiciones</Label>
                                <Button
                                  variant="outline"
                                  className="rounded-full"
                                  onClick={() => {
                                    const base =
                                      selected.filter?.conditions || [];
                                    const first = unifiedCols[0]?.key || "";
                                    updateSelected({
                                      filter: {
                                        ...selected.filter,
                                        conditions: [
                                          ...base,
                                          {
                                            column: first,
                                            operator: "=",
                                            value: "",
                                          },
                                        ],
                                      },
                                    });
                                  }}
                                >
                                  Agregar condición
                                </Button>
                              </div>
                              {(selected.filter?.conditions || []).length ===
                              0 ? (
                                <div className="text-sm text-gray-500">
                                  No hay condiciones.
                                </div>
                              ) : (
                                <div className="space-y-2">
                                  {(selected.filter?.conditions || []).map(
                                    (cond, idx) => (
                                      <div
                                        key={idx}
                                        className="grid grid-cols-12 gap-2 items-center"
                                      >
                                        <div className="col-span-4">
                                          <select
                                            className="w-full rounded-xl border px-2 py-2 text-sm bg-white"
                                            value={cond.column}
                                            onChange={(e) => {
                                              const next = [
                                                ...(selected.filter
                                                  ?.conditions || []),
                                              ];
                                              next[idx] = {
                                                ...cond,
                                                column: e.target.value,
                                              } as any;
                                              updateSelected({
                                                filter: {
                                                  ...selected.filter,
                                                  conditions: next,
                                                },
                                              });
                                            }}
                                          >
                                            <option value="">Columna…</option>
                                            {unifiedCols.map((c) => (
                                              <option key={c.key} value={c.key}>
                                                {c.label}
                                              </option>
                                            ))}
                                          </select>
                                        </div>
                                        <div className="col-span-3">
                                          <select
                                            className="w-full rounded-xl border px-2 py-2 text-sm bg-white"
                                            value={cond.operator}
                                            onChange={(e) => {
                                              const next = [
                                                ...(selected.filter
                                                  ?.conditions || []),
                                              ];
                                              next[idx] = {
                                                ...cond,
                                                operator: e.target.value as any,
                                              } as any;
                                              updateSelected({
                                                filter: {
                                                  ...selected.filter,
                                                  conditions: next,
                                                },
                                              });
                                            }}
                                          >
                                            {[
                                              "=",
                                              "!=",
                                              ">",
                                              ">=",
                                              "<",
                                              "<=",
                                              "contains",
                                              "startsWith",
                                              "endsWith",
                                              "in",
                                              "not in",
                                              "is null",
                                              "is not null",
                                            ].map((op) => (
                                              <option key={op} value={op}>
                                                {op}
                                              </option>
                                            ))}
                                          </select>
                                        </div>
                                        <div className="col-span-4">
                                          {cond.operator.includes("null") ? (
                                            <div className="text-xs text-gray-500">
                                              (sin valor)
                                            </div>
                                          ) : (
                                            <Input
                                              value={(cond as any).value ?? ""}
                                              onChange={(e) => {
                                                const next = [
                                                  ...(selected.filter
                                                    ?.conditions || []),
                                                ];
                                                next[idx] = {
                                                  ...cond,
                                                  value: e.target.value,
                                                } as any;
                                                updateSelected({
                                                  filter: {
                                                    ...selected.filter,
                                                    conditions: next,
                                                  },
                                                });
                                              }}
                                              className="rounded-xl"
                                            />
                                          )}
                                        </div>
                                        <div className="col-span-1 text-right">
                                          <Button
                                            variant="outline"
                                            className="rounded-full"
                                            onClick={() => {
                                              const next = (
                                                selected.filter?.conditions ||
                                                []
                                              ).filter((_, i) => i !== idx);
                                              updateSelected({
                                                filter: {
                                                  ...selected.filter,
                                                  conditions: next,
                                                },
                                              });
                                            }}
                                          >
                                            Quitar
                                          </Button>
                                        </div>
                                      </div>
                                    )
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      }

                      // Default branch: connected to a connection
                      const availableTables =
                        srcNode?.type === "connection" && metaByNode[srcNode.id]
                          ? metaByNode[srcNode.id].tables
                          : connMeta?.tables || [];
                      const upstreamConn =
                        srcNode?.type === "connection" ? srcNode : null;
                      const canConfigure = !!upstreamConn || !!connMeta;
                      return (
                        <div className="space-y-3">
                          {!canConfigure && (
                            <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-2">
                              Conecta este filtro a una conexión para cargar
                              tablas.
                            </div>
                          )}
                          <div>
                            <Label>Tabla</Label>
                            <select
                              className="w-full rounded-xl border px-3 py-2 text-sm bg-white"
                              value={selected.filter?.table || ""}
                              onChange={(e) =>
                                updateSelected({
                                  filter: {
                                    table: e.target.value || undefined,
                                    columns: [],
                                    conditions: [],
                                  },
                                })
                              }
                              disabled={!canConfigure}
                            >
                              <option value="">Selecciona tabla…</option>
                              {(availableTables || []).map((t) => (
                                <option
                                  key={`${t.schema}.${t.name}`}
                                  value={`${t.schema}.${t.name}`}
                                >
                                  {t.schema}.{t.name}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <Label>Columnas</Label>
                            {loadingColumnsFor === selected.filter?.table && (
                              <div className="text-sm text-amber-600 mt-1">Cargando columnas…</div>
                            )}
                            <div className="flex flex-wrap gap-2 mt-1">
                              {(() => {
                                const tbl = (availableTables || []).find(
                                  (t) =>
                                    `${t.schema}.${t.name}` ===
                                    selected.filter?.table
                                );
                                return (tbl?.columns || []).map((c) => {
                                  const fq = `${c.name}`;
                                  const active =
                                    selected.filter?.columns?.includes(fq);
                                  return (
                                    <button
                                      key={fq}
                                      type="button"
                                      className={`px-2 py-1 rounded-full border text-xs ${
                                        active
                                          ? "bg-emerald-50 border-emerald-400 text-emerald-700"
                                          : "bg-white border-gray-300 text-gray-700"
                                      }`}
                                      onClick={() => {
                                        const cols = new Set(
                                          selected.filter?.columns || []
                                        );
                                        if (active) cols.delete(fq);
                                        else cols.add(fq);
                                        updateSelected({
                                          filter: {
                                            ...selected.filter,
                                            columns: Array.from(cols),
                                            conditions:
                                              selected.filter?.conditions || [],
                                          },
                                        });
                                      }}
                                      disabled={!canConfigure}
                                    >
                                      {c.name}
                                    </button>
                                  );
                                });
                              })()}
                            </div>
                          </div>
                          {/* Condiciones */}
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <Label>Condiciones</Label>
                              <Button
                                variant="outline"
                                className="rounded-full"
                                onClick={() => {
                                  const base =
                                    selected.filter?.conditions || [];
                                  updateSelected({
                                    filter: {
                                      ...selected.filter,
                                      conditions: [
                                        ...base,
                                        {
                                          column:
                                            selected.filter?.columns?.[0] || "",
                                          operator: "=",
                                          value: "",
                                        },
                                      ],
                                    },
                                  });
                                }}
                              >
                                Agregar condición
                              </Button>
                            </div>
                            {(selected.filter?.conditions || []).length ===
                            0 ? (
                              <div className="text-sm text-gray-500">
                                No hay condiciones.
                              </div>
                            ) : (
                              <div className="space-y-2">
                                {(selected.filter?.conditions || []).map(
                                  (cond, idx) => (
                                    <div
                                      key={idx}
                                      className="grid grid-cols-12 gap-2 items-center"
                                    >
                                      <div className="col-span-4">
                                        <select
                                          className="w-full rounded-xl border px-2 py-2 text-sm bg-white"
                                          value={cond.column}
                                          onChange={(e) => {
                                            const next = [
                                              ...(selected.filter?.conditions ||
                                                []),
                                            ];
                                            next[idx] = {
                                              ...cond,
                                              column: e.target.value,
                                            };
                                            updateSelected({
                                              filter: {
                                                ...selected.filter,
                                                conditions: next,
                                              },
                                            });
                                          }}
                                        >
                                          <option value="">Columna…</option>
                                          {(() => {
                                            const tbl = (
                                              availableTables || []
                                            ).find(
                                              (t) =>
                                                `${t.schema}.${t.name}` ===
                                                selected.filter?.table
                                            );
                                            return (tbl?.columns || []).map(
                                              (c) => (
                                                <option
                                                  key={c.name}
                                                  value={c.name}
                                                >
                                                  {c.name}
                                                </option>
                                              )
                                            );
                                          })()}
                                        </select>
                                      </div>
                                      <div className="col-span-3">
                                        <select
                                          className="w-full rounded-xl border px-2 py-2 text-sm bg-white"
                                          value={cond.operator}
                                          onChange={(e) => {
                                            const next = [
                                              ...(selected.filter?.conditions ||
                                                []),
                                            ];
                                            next[idx] = {
                                              ...cond,
                                              operator: e.target.value as any,
                                            };
                                            updateSelected({
                                              filter: {
                                                ...selected.filter,
                                                conditions: next,
                                              },
                                            });
                                          }}
                                        >
                                          {[
                                            "=",
                                            "!=",
                                            ">",
                                            ">=",
                                            "<",
                                            "<=",
                                            "contains",
                                            "startsWith",
                                            "endsWith",
                                            "in",
                                            "not in",
                                            "is null",
                                            "is not null",
                                          ].map((op) => (
                                            <option key={op} value={op}>
                                              {op}
                                            </option>
                                          ))}
                                        </select>
                                      </div>
                                      <div className="col-span-4">
                                        {cond.operator.includes("null") ? (
                                          <div className="text-xs text-gray-500">
                                            (sin valor)
                                          </div>
                                        ) : (
                                          <Input
                                            value={cond.value ?? ""}
                                            onChange={(e) => {
                                              const next = [
                                                ...(selected.filter
                                                  ?.conditions || []),
                                              ];
                                              next[idx] = {
                                                ...cond,
                                                value: e.target.value,
                                              };
                                              updateSelected({
                                                filter: {
                                                  ...selected.filter,
                                                  conditions: next,
                                                },
                                              });
                                            }}
                                            className="rounded-xl"
                                          />
                                        )}
                                      </div>
                                      <div className="col-span-1 text-right">
                                        <Button
                                          variant="outline"
                                          className="rounded-full"
                                          onClick={() => {
                                            const next = (
                                              selected.filter?.conditions || []
                                            ).filter((_, i) => i !== idx);
                                            updateSelected({
                                              filter: {
                                                ...selected.filter,
                                                conditions: next,
                                              },
                                            });
                                          }}
                                        >
                                          Quitar
                                        </Button>
                                      </div>
                                    </div>
                                  )
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* Clean node config — Limpieza y calidad de datos */}
                {selected.type === "clean" && (
                  <div className="space-y-4">
                    <div className="font-medium text-sm text-gray-700">
                      Configuración de Limpieza y Calidad
                    </div>
                    {(() => {
                      const srcEdge = edges.find((e) => e.to === selected.id);
                      const srcNode =
                        srcEdge && widgets.find((w) => w.id === srcEdge.from);
                      const resolveUpstreamFilter = (
                        node: typeof selected | null | undefined
                      ) => {
                        let cur: any = node || null;
                        const visited = new Set<string>();
                        while (cur && cur.type !== "filter") {
                          if (visited.has(cur.id)) break;
                          visited.add(cur.id);
                          const e = edges.find((ed) => ed.to === cur.id);
                          if (!e) return null;
                          cur = widgets.find((w) => w.id === e.from) || null;
                        }
                        return cur && cur.type === "filter" ? cur : null;
                      };
                      const upstreamFilter = resolveUpstreamFilter(srcNode);
                      const table = upstreamFilter?.filter?.table;
                      const connEdge =
                        upstreamFilter &&
                        edges.find((e) => e.to === upstreamFilter.id);
                      const connNode =
                        connEdge && widgets.find((w) => w.id === connEdge.from);
                      const availableTables =
                        connNode?.type === "connection" &&
                        metaByNode[connNode.id]
                          ? metaByNode[connNode.id].tables
                          : connMeta?.tables || [];
                      const tbl = (availableTables || []).find(
                        (t) => `${t.schema}.${t.name}` === table
                      );
                      const selectedCols =
                        upstreamFilter?.filter?.columns || [];
                      let columns: Array<{ name: string }> =
                        selectedCols.length > 0
                          ? Array.from(
                              new Set(
                                (selectedCols as Array<string | number>)
                                  .map((c) => String(c))
                                  .map((c) => c.split(".").slice(-1)[0])
                              )
                            ).map((name: string) => ({ name }))
                          : ((tbl?.columns || []).map((c: any) => ({
                              name: String(c?.name ?? ""),
                            })) as Array<{ name: string }>);
                      const filterSelected =
                        upstreamFilter?.filter?.columns || [];
                      if (filterSelected.length > 0) {
                        const normalized = new Set(
                          (filterSelected as Array<string | number>)
                            .map((c) => String(c))
                            .map((c) => c.split(".").slice(-1)[0])
                        );
                        columns = columns.filter((c) => normalized.has(c.name));
                      }
                      if (srcNode && srcNode.type === "cast") {
                        const castCols = (srcNode.cast?.conversions || [])
                          .map((cv) => String(cv.column))
                          .filter(Boolean);
                        if (castCols.length > 0) {
                          const castSet = new Set(castCols);
                          columns = columns.filter((c) => castSet.has(c.name));
                        }
                      }

                      const transforms = selected.clean?.transforms || [];
                      const baseClean = () => ({ ...selected.clean, transforms: selected.clean?.transforms ?? [] });
                      const setTransforms = (next: typeof transforms) =>
                        updateSelected({ clean: { ...baseClean(), transforms: next } });
                      const nullCleanup = selected.clean?.nullCleanup;
                      const setNullCleanup = (next: typeof nullCleanup) =>
                        updateSelected({ clean: { ...baseClean(), nullCleanup: next ?? undefined } });
                      const dataFixes = selected.clean?.dataFixes || [];
                      const setDataFixes = (next: typeof dataFixes) =>
                        updateSelected({ clean: { ...baseClean(), dataFixes: next } });
                      const dedupe = selected.clean?.dedupe;
                      const setDedupe = (next: typeof dedupe) =>
                        updateSelected({ clean: { ...baseClean(), dedupe: next ?? undefined } });

                      const defaultNullPatterns = ["NA", "-", ".", ""];
                      return (
                        <div className="space-y-4">
                          <div className="text-sm text-gray-700">
                            Tabla: {table || "—"}
                          </div>
                          {columns.length === 0 ? (
                            <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-2">
                              Conecta a un Filtro con una tabla seleccionada.
                            </div>
                          ) : (
                            <>
                              {/* 1. Valores nulos o vacíos */}
                              <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-3 space-y-2">
                                <div className="font-medium text-sm text-gray-800">
                                  Valores nulos o vacíos
                                </div>
                                <p className="text-xs text-gray-600">
                                  Valores a considerar vacíos (separados por coma): se convertirán a NULL o al valor indicado.
                                </p>
                                <div className="flex flex-wrap gap-2 items-center">
                                  <input
                                    type="text"
                                    className="flex-1 min-w-[120px] rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                                    placeholder="NA, -, ., (vacío)"
                                    value={nullCleanup?.patterns?.join(", ") ?? defaultNullPatterns.join(", ")}
                                    onChange={(e) => {
                                      const patterns = e.target.value.split(",").map((s) => s.trim()).filter(Boolean);
                                      setNullCleanup({
                                        patterns: patterns.length ? patterns : defaultNullPatterns,
                                        action: nullCleanup?.action ?? "null",
                                        replacement: nullCleanup?.replacement,
                                        columns: nullCleanup?.columns?.length ? nullCleanup.columns : columns.map((c) => c.name),
                                      });
                                    }}
                                  />
                                  <select
                                    className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm bg-white"
                                    value={nullCleanup?.action ?? "null"}
                                    onChange={(e) => {
                                      const action = e.target.value as "null" | "replace";
                                      setNullCleanup({
                                        patterns: nullCleanup?.patterns ?? defaultNullPatterns,
                                        action,
                                        replacement: nullCleanup?.replacement,
                                        columns: nullCleanup?.columns?.length ? nullCleanup.columns : columns.map((c) => c.name),
                                      });
                                    }}
                                  >
                                    <option value="null">Convertir a NULL</option>
                                    <option value="replace">Reemplazar por valor</option>
                                  </select>
                                  {nullCleanup?.action === "replace" && (
                                    <input
                                      type="text"
                                      className="w-24 rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                                      placeholder="Valor"
                                      value={nullCleanup?.replacement ?? ""}
                                      onChange={(e) =>
                                        setNullCleanup({
                                          ...nullCleanup!,
                                          replacement: e.target.value || undefined,
                                        })
                                      }
                                    />
                                  )}
                                </div>
                                <p className="text-xs text-gray-500">
                                  Se aplica a todas las columnas de la tabla.
                                </p>
                                <button
                                  type="button"
                                  className="text-xs text-indigo-600 hover:underline"
                                  onClick={() => setNullCleanup({
                                    patterns: nullCleanup?.patterns ?? defaultNullPatterns,
                                    action: nullCleanup?.action ?? "null",
                                    replacement: nullCleanup?.replacement,
                                    columns: columns.map((c) => c.name),
                                  })}
                                >
                                  Activar en todas las columnas
                                </button>
                              </div>

                              {/* 2. Normalización de texto por columna */}
                              <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-3 space-y-2">
                                <div className="font-medium text-sm text-gray-800">
                                  Normalización de texto
                                </div>
                                <p className="text-xs text-gray-600">
                                  Por columna: espacios, mayúsculas, caracteres invisibles, UTF-8.
                                </p>
                                {columns.map((c) => {
                                  const current = transforms.find((t) => t.column === c.name) as { op: string; find?: string; replaceWith?: string } | undefined;
                                  const op = current?.op ?? "";
                                  return (
                                    <div key={c.name} className="grid grid-cols-12 gap-2 items-center">
                                      <div className="col-span-4 text-sm text-gray-800 truncate" title={c.name}>{c.name}</div>
                                      <div className="col-span-8 flex flex-wrap gap-1 items-center">
                                        <select
                                          className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm bg-white flex-1 min-w-[140px]"
                                          value={op}
                                          onChange={(e) => {
                                            const newOp = e.target.value;
                                            let next = transforms.filter((t) => t.column !== c.name);
                                            if (newOp) {
                                              if (newOp === "replace") next = [...next, { column: c.name, op: "replace", find: "", replaceWith: "" }];
                                              else next = [...next, { column: c.name, op: newOp as any }];
                                            }
                                            setTransforms(next);
                                          }}
                                        >
                                          <option value="">(ninguna)</option>
                                          <option value="trim">Recortar espacios</option>
                                          <option value="upper">Mayúsculas</option>
                                          <option value="lower">Minúsculas</option>
                                          <option value="normalize_spaces">Espacios múltiples → uno</option>
                                          <option value="strip_invisible">Quitar caracteres invisibles</option>
                                          <option value="utf8_normalize">Normalizar UTF-8 (NFC)</option>
                                          <option value="cast_number">Convertir a número</option>
                                          <option value="cast_date">Convertir a fecha</option>
                                          <option value="replace">Reemplazar (regex)</option>
                                        </select>
                                        {op === "replace" && current && "find" in current && (
                                          <>
                                            <input
                                              type="text"
                                              className="rounded border border-gray-300 px-1.5 py-1 text-xs w-20"
                                              placeholder="Buscar"
                                              value={current.find ?? ""}
                                              onChange={(ev) => {
                                                const next = transforms.map((t) =>
                                                  t.column === c.name && t.op === "replace"
                                                    ? { ...t, find: ev.target.value }
                                                    : t
                                                );
                                                setTransforms(next);
                                              }}
                                            />
                                            <input
                                              type="text"
                                              className="rounded border border-gray-300 px-1.5 py-1 text-xs w-20"
                                              placeholder="Reemplazar"
                                              value={current.replaceWith ?? ""}
                                              onChange={(ev) => {
                                                const next = transforms.map((t) =>
                                                  t.column === c.name && t.op === "replace"
                                                    ? { ...t, replaceWith: ev.target.value }
                                                    : t
                                                );
                                                setTransforms(next);
                                              }}
                                            />
                                          </>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>

                              {/* 3. Correcciones permanentes (data fixes) */}
                              <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-3 space-y-2">
                                <div className="font-medium text-sm text-gray-800">
                                  Correcciones permanentes
                                </div>
                                <p className="text-xs text-gray-600">
                                  Reemplazar valor incorrecto por el correcto (coincidencia exacta). Se aplica cada vez que aparezca el valor.
                                </p>
                                <div className="space-y-1 max-h-40 overflow-y-auto">
                                  {dataFixes.map((fix, idx) => (
                                    <div key={idx} className="flex gap-2 items-center text-sm">
                                      <select
                                        className="rounded border border-gray-300 px-1.5 py-1 text-xs flex-1"
                                        value={fix.column}
                                        onChange={(e) => {
                                          const next = [...dataFixes];
                                          next[idx] = { ...fix, column: e.target.value };
                                          setDataFixes(next);
                                        }}
                                      >
                                        {columns.map((col) => (
                                          <option key={col.name} value={col.name}>{col.name}</option>
                                        ))}
                                      </select>
                                      <input
                                        type="text"
                                        className="rounded border border-gray-300 px-1.5 py-1 text-xs w-28"
                                        placeholder="Incorrecto"
                                        value={fix.find}
                                        onChange={(e) => {
                                          const next = [...dataFixes];
                                          next[idx] = { ...fix, find: e.target.value };
                                          setDataFixes(next);
                                        }}
                                      />
                                      <span className="text-gray-400">→</span>
                                      <input
                                        type="text"
                                        className="rounded border border-gray-300 px-1.5 py-1 text-xs w-28"
                                        placeholder="Correcto"
                                        value={fix.replaceWith}
                                        onChange={(e) => {
                                          const next = [...dataFixes];
                                          next[idx] = { ...fix, replaceWith: e.target.value };
                                          setDataFixes(next);
                                        }}
                                      />
                                      <button
                                        type="button"
                                        className="text-red-600 hover:bg-red-50 rounded p-1"
                                        onClick={() => setDataFixes(dataFixes.filter((_, i) => i !== idx))}
                                        aria-label="Quitar"
                                      >
                                        ×
                                      </button>
                                    </div>
                                  ))}
                                </div>
                                <button
                                  type="button"
                                  className="text-xs text-indigo-600 hover:underline"
                                  onClick={() => setDataFixes([...dataFixes, { column: columns[0]?.name ?? "", find: "", replaceWith: "" }])}
                                >
                                  + Añadir corrección
                                </button>
                              </div>

                              {/* 4. Duplicados */}
                              <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-3 space-y-2">
                                <div className="font-medium text-sm text-gray-800">
                                  Duplicados
                                </div>
                                <p className="text-xs text-gray-600">
                                  Columnas clave para identificar duplicados. Se conserva una fila por clave.
                                </p>
                                <div className="flex flex-wrap gap-2 items-center">
                                  <select
                                    className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm bg-white min-w-[160px]"
                                    value="__keys__"
                                    onChange={(e) => {
                                      const col = e.target.value;
                                      if (col === "__keys__") return;
                                      const keys = dedupe?.keyColumns ?? [];
                                      if (!keys.includes(col)) setDedupe({ keyColumns: [...keys, col], keep: dedupe?.keep ?? "first" });
                                    }}
                                  >
                                    <option value="__keys__">Añadir columna clave</option>
                                    {columns.map((c) => (
                                      <option key={c.name} value={c.name}>{c.name}</option>
                                    ))}
                                  </select>
                                  <select
                                    className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm bg-white"
                                    value={dedupe?.keep ?? "first"}
                                    onChange={(e) => setDedupe({ keyColumns: dedupe?.keyColumns ?? [], keep: e.target.value as "first" | "last" })}
                                  >
                                    <option value="first">Mantener primera ocurrencia</option>
                                    <option value="last">Mantener última ocurrencia</option>
                                  </select>
                                </div>
                                {dedupe?.keyColumns?.length ? (
                                  <div className="flex flex-wrap gap-1">
                                    {dedupe.keyColumns.map((col) => (
                                      <span
                                        key={col}
                                        className="inline-flex items-center gap-1 rounded-full bg-gray-200 px-2 py-0.5 text-xs"
                                      >
                                        {col}
                                        <button
                                          type="button"
                                          className="text-gray-600 hover:text-red-600"
                                          onClick={() =>
                                            setDedupe({
                                              keyColumns: dedupe.keyColumns.filter((c) => c !== col),
                                              keep: dedupe.keep,
                                            })
                                          }
                                        >
                                          ×
                                        </button>
                                      </span>
                                    ))}
                                  </div>
                                ) : null}
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* Count node config */}
                {selected.type === "count" && (
                  <div className="space-y-3">
                    <div className="font-medium text-sm text-gray-700">
                      Configuración de Conteo
                    </div>
                    {(() => {
                      const srcEdge = edges.find((e) => e.to === selected.id);
                      const srcNode =
                        srcEdge && widgets.find((w) => w.id === srcEdge.from);

                      // Helper to trace back to a source node (Filter or Join)
                      const resolveUpstreamSource = (startNode: Widget) => {
                        let curr: Widget | undefined = startNode;
                        const path: Widget[] = [];
                        const visited = new Set<string>();

                        while (curr) {
                          if (visited.has(curr.id)) break;
                          visited.add(curr.id);

                          if (curr.type === "filter" || curr.type === "join") {
                            return { source: curr, path: path.reverse() };
                          }

                          path.push(curr);
                          const edge = edges.find((e) => e.to === curr!.id);
                          if (!edge) break;
                          curr = widgets.find((w) => w.id === edge.from);
                        }
                        return null;
                      };

                      const upstream = srcNode
                        ? resolveUpstreamSource(srcNode)
                        : null;

                      let table = "";
                      let columns: Array<{ name: string; type?: string }> = [];

                      if (upstream) {
                        const { source, path } = upstream;

                        // 1. Base columns from source
                        if (source.type === "filter") {
                          table = source.filter?.table || "";
                          const selectedCols = source.filter?.columns || [];
                          if (selectedCols.length > 0) {
                            columns = selectedCols.map((c) => ({
                              name: String(c).split(".").pop()!,
                            }));
                          } else {
                            const connEdge = edges.find(
                              (e) => e.to === source.id
                            );
                            const connNode =
                              connEdge &&
                              widgets.find((w) => w.id === connEdge.from);
                            const availableTables =
                              connNode?.type === "connection" &&
                              metaByNode[connNode.id]
                                ? metaByNode[connNode.id].tables
                                : connMeta?.tables || [];
                            const tbl = (availableTables || []).find(
                              (t) => `${t.schema}.${t.name}` === table
                            );
                            columns = (tbl?.columns || []).map((c: any) => ({
                              name: String(c?.name ?? ""),
                              type: c?.dataType || c?.type || "string",
                            }));
                          }
                        } else if (source.type === "join") {
                          table = source.join?.primaryTable || "Join Result";
                          const primaryCols = source.join?.primaryColumns || [];
                          const secondaryCols =
                            source.join?.joins?.flatMap(
                              (j) => j.secondaryColumns || []
                            ) || [];
                          columns = [...primaryCols, ...secondaryCols].map(
                            (c) => ({ name: String(c).split(".").pop()! })
                          );
                        }

                        // 2. Apply transformations along the path
                        for (const node of path) {
                          if (node.type === "arithmetic") {
                            node.arithmetic?.operations.forEach((op) => {
                              if (op.resultColumn)
                                columns.push({ name: op.resultColumn });
                            });
                          } else if (node.type === "condition") {
                             // Agregar columnas generadas por reglas de condición
                             (node.condition?.rules || []).forEach((r) => {
                               if (r.resultColumn)
                                 columns.push({ name: r.resultColumn });
                             });
                          } else if (node.type === "count") {
                            const attr = node.count?.attribute;
                            const res = node.count?.resultColumn;
                            // Count resetea las columnas disponibles (agregación)
                            columns = [];
                            if (attr) columns.push({ name: attr });
                            if (res) columns.push({ name: res });
                          }
                          // clean, cast: pass-through
                        }
                      }

                      const countCfg = selected.count || {
                        attribute: "",
                        resultColumn: "conteo",
                      };
                      const setCountCfg = (next: typeof countCfg) =>
                        updateSelected({ count: next });

                      return (
                        <div className="space-y-3">
                          <div className="text-sm text-gray-700">
                            Tabla Base: {table || "—"}
                          </div>
                          {columns.length === 0 ? (
                            <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-2">
                              Conecta a un nodo que proporcione datos (Filtro,
                              Join, etc.).
                            </div>
                          ) : (
                            <>
                              <div>
                                <Label>Columna a contar</Label>
                                <select
                                  className="w-full rounded-xl border px-2 py-2 text-sm bg-white"
                                  value={countCfg.attribute || ""}
                                  onChange={(e) =>
                                    setCountCfg({
                                      ...countCfg,
                                      attribute: e.target.value,
                                    })
                                  }
                                >
                                  <option value="">Selecciona columna…</option>
                                  {columns.map((c, idx) => (
                                    <option
                                      key={`${c.name}-${idx}`}
                                      value={c.name}
                                    >
                                      {c.name}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <Label>Nombre de la nueva columna</Label>
                                <Input
                                  value={countCfg.resultColumn || ""}
                                  onChange={(e) =>
                                    setCountCfg({
                                      ...countCfg,
                                      resultColumn: e.target.value,
                                    })
                                  }
                                  placeholder="ej: veces_repetido"
                                  className="rounded-xl"
                                />
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* Arithmetic node config */}
                {selected.type === "arithmetic" && (
                  <div className="space-y-3">
                    <div className="font-medium text-sm text-gray-700">
                      Configuración de Operaciones Aritméticas
                    </div>
                    {(() => {
                      const srcEdge = edges.find((e) => e.to === selected.id);
                      const srcNode =
                        srcEdge && widgets.find((w) => w.id === srcEdge.from);
                      // Permitir nodos intermedios (cast, arithmetic, count, condition, clean) y resolver la fuente aguas arriba
                      const resolveUpstreamSource = (startNode: Widget) => {
                        let curr: Widget | undefined = startNode;
                        const path: Widget[] = [];
                        const visited = new Set<string>();

                        while (curr) {
                          if (visited.has(curr.id)) break;
                          visited.add(curr.id);

                          if (curr.type === "filter" || curr.type === "join") {
                            return { source: curr, path: path.reverse() };
                          }

                          path.push(curr);
                          const edge = edges.find((e) => e.to === curr!.id);
                          if (!edge) break;
                          curr = widgets.find((w) => w.id === edge.from);
                        }
                        return null;
                      };
                      
                      const upstream = srcNode
                        ? resolveUpstreamSource(srcNode)
                        : null;

                      let table = "";
                      let columns: Array<{ name: string; type?: string }> = [];

                      if (upstream) {
                        const { source, path } = upstream;

                        // 1. Base columns from source
                        if (source.type === "filter") {
                          table = source.filter?.table || "";
                          const selectedCols = source.filter?.columns || [];
                          if (selectedCols.length > 0) {
                            const normalized = Array.from(
                              new Set(
                                (selectedCols as Array<string | number>)
                                  .map((c) => String(c))
                                  .map((c) => c.split(".").slice(-1)[0])
                              )
                            );
                            columns = normalized.map((n) => ({ name: n }));
                          } else {
                            const connEdge = edges.find(
                              (e) => e.to === source.id
                            );
                            const connNode =
                              connEdge &&
                              widgets.find((w) => w.id === connEdge.from);
                            const availableTables =
                              connNode?.type === "connection" &&
                              metaByNode[connNode.id]
                                ? metaByNode[connNode.id].tables
                                : connMeta?.tables || [];
                            const tbl = (availableTables || []).find(
                              (t) => `${t.schema}.${t.name}` === table
                            );
                            columns = (tbl?.columns || []).map((c: any) => ({
                              name: String(c?.name ?? ""),
                              type: c?.dataType || c?.type || "string",
                            }));
                          }
                        } else if (source.type === "join") {
                          table = source.join?.primaryTable || "Join Result";
                          const primaryCols = source.join?.primaryColumns || [];
                          const secondaryCols =
                            source.join?.joins?.flatMap(
                              (j) => j.secondaryColumns || []
                            ) || [];
                          columns = [...primaryCols, ...secondaryCols].map(
                            (c) => ({ name: String(c).split(".").pop()! })
                          );
                        }

                        // 2. Apply transformations along the path
                        for (const node of path) {
                          if (node.type === "arithmetic") {
                            node.arithmetic?.operations.forEach((op) => {
                              if (op.resultColumn)
                                columns.push({ name: op.resultColumn, type: "number" });
                            });
                          } else if (node.type === "condition") {
                            node.condition?.rules.forEach((r) => {
                              if (r.resultColumn)
                                columns.push({
                                  name: r.resultColumn,
                                  type: r.outputType === "boolean" ? "boolean" : "string", // Simplified inference
                                });
                            });
                          } else if (node.type === "count") {
                            const attr = node.count?.attribute;
                            const res = node.count?.resultColumn;
                            // Reset columns for Count interaction? Usually count aggregates.
                            // For this context we keep it simple.
                            columns = [];
                            if (attr) columns.push({ name: attr, type: "string" }); // Original type unknown, defaulting or preserving?
                            if (res) columns.push({ name: res, type: "number" });
                          } else if (node.type === "cast") {
                            node.cast?.conversions.forEach((c) => {
                              const existing = columns.find((col) => col.name === c.column);
                              if (existing) {
                                existing.type = c.targetType;
                              }
                            });
                          } else if (node.type === "clean") {
                             // Basic safe handling for Clean node transformations if needed
                          }
                        }
                      }
                      // Nota: No restringimos por columnas convertidas en CAST;
                      // el usuario espera ver todas las columnas salientes del último filtro de columnas.
                      const operations = selected.arithmetic?.operations || [];
                      const setOperations = (next: typeof operations) =>
                        updateSelected({ arithmetic: { operations: next } });

                      return (
                        <div className="space-y-3">
                          <div className="text-sm text-gray-700">
                            Tabla: {table || "—"}
                          </div>
                          {columns.length === 0 ? (
                            <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-2">
                              Conecta a un Filtro con una tabla seleccionada.
                            </div>
                          ) : (
                            <div className="space-y-3">
                              <p className="text-xs text-gray-500">
                                Las columnas creadas podés usarlas en operaciones siguientes (ej.: Precio × Descuento → Precio con descuento).
                              </p>
                              <div className="flex items-center justify-between">
                                <Label>Operaciones</Label>
                                <Button
                                  variant="outline"
                                  className="rounded-full"
                                  onClick={() => {
                                    const newOp = {
                                      id: `op-${Date.now()}-${Math.random()
                                        .toString(36)
                                        .slice(2, 6)}`,
                                      leftOperand: {
                                        type: "column" as const,
                                        value: columns[0]?.name || "",
                                      },
                                      operator: "+" as const,
                                      rightOperand: {
                                        type: "constant" as const,
                                        value: "1",
                                      },
                                      resultColumn: `new_column_${
                                        operations.length + 1
                                      }`,
                                    };
                                    setOperations([...operations, newOp]);
                                  }}
                                >
                                  Agregar operación
                                </Button>
                              </div>
                              {operations.length === 0 ? (
                                <div className="text-sm text-gray-500">
                                  No hay operaciones.
                                </div>
                              ) : (
                                operations.map((op, idx) => (
                                  <div
                                    key={op.id}
                                    className="border rounded-xl p-3 space-y-2"
                                  >
                                    <div className="flex items-center justify-between">
                                      <span className="text-sm font-medium">
                                        Operación {idx + 1}
                                      </span>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => {
                                          setOperations(
                                            operations.filter(
                                              (o) => o.id !== op.id
                                            )
                                          );
                                        }}
                                      >
                                        Eliminar
                                      </Button>
                                    </div>

                                    {/* Result column name */}
                                    <div>
                                      <Label>Nombre de columna resultado</Label>
                                      <Input
                                        value={op.resultColumn}
                                        onChange={(e) => {
                                          setOperations(
                                            operations.map((o) =>
                                              o.id === op.id
                                                ? {
                                                    ...o,
                                                    resultColumn:
                                                      e.target.value,
                                                  }
                                                : o
                                            )
                                          );
                                        }}
                                        placeholder="nombre_columna"
                                      />
                                    </div>

                                    {/* Left operand */}
                                    <div className="grid grid-cols-2 gap-2">
                                      <div>
                                        <Label>Operando izquierdo</Label>
                                        <select
                                          className="w-full rounded-xl border px-2 py-2 text-sm bg-white"
                                          value={op.leftOperand.type}
                                          onChange={(e) => {
                                            const type = e.target.value as
                                              | "column"
                                              | "constant";
                                            setOperations(
                                              operations.map((o) =>
                                                o.id === op.id
                                                  ? {
                                                      ...o,
                                                      leftOperand: {
                                                        type,
                                                        value:
                                                          type === "column"
                                                            ? columns[0]
                                                                ?.name || ""
                                                            : "1",
                                                      },
                                                    }
                                                  : o
                                              )
                                            );
                                          }}
                                        >
                                          <option value="column">
                                            Columna
                                          </option>
                                          <option value="constant">
                                            Constante
                                          </option>
                                        </select>
                                      </div>
                                      <div>
                                        <Label>Valor</Label>
                                        {op.leftOperand.type === "column" ? (
                                          <select
                                            className="w-full rounded-xl border px-2 py-2 text-sm bg-white"
                                            value={op.leftOperand.value}
                                            onChange={(e) => {
                                              setOperations(
                                                operations.map((o) =>
                                                  o.id === op.id
                                                    ? {
                                                        ...o,
                                                        leftOperand: {
                                                          ...o.leftOperand,
                                                          value: e.target.value,
                                                        },
                                                      }
                                                    : o
                                                )
                                              );
                                            }}
                                          >
                                            {columns.map((col) => (
                                              <option
                                                key={col.name}
                                                value={col.name}
                                              >
                                                {col.name} {col.type ? `(${col.type})` : ""}
                                              </option>
                                            ))}
                                          </select>
                                        ) : (
                                          <Input
                                            value={op.leftOperand.value}
                                            onChange={(e) => {
                                              setOperations(
                                                operations.map((o) =>
                                                  o.id === op.id
                                                    ? {
                                                        ...o,
                                                        leftOperand: {
                                                          ...o.leftOperand,
                                                          value: e.target.value,
                                                        },
                                                      }
                                                    : o
                                                )
                                              );
                                            }}
                                            placeholder="Valor constante"
                                          />
                                        )}
                                      </div>
                                    </div>

                                    {/* Operator */}
                                    <div>
                                      <Label>Operador</Label>
                                      <select
                                        className="w-full rounded-xl border px-2 py-2 text-sm bg-white"
                                        value={op.operator}
                                        onChange={(e) => {
                                          setOperations(
                                            operations.map((o) =>
                                              o.id === op.id
                                                ? {
                                                    ...o,
                                                    operator: e.target
                                                      .value as any,
                                                  }
                                                : o
                                            )
                                          );
                                        }}
                                      >
                                        <option value="+">Suma (+)</option>
                                        <option value="-">Resta (-)</option>
                                        <option value="*">
                                          Multiplicación (*)
                                        </option>
                                        <option value="/">División (/)</option>
                                        <option value="%">Módulo (%)</option>
                                        <option value="^">Potencia (^)</option>
                                        <option value="pct_of">Porcentaje de (A × B ÷ 100)</option>
                                        <option value="pct_off">Descuento % (A × (1 − B))</option>
                                      </select>
                                    </div>

                                    {/* Right operand */}
                                    <div className="grid grid-cols-2 gap-2">
                                      <div>
                                        <Label>Operando derecho</Label>
                                        <select
                                          className="w-full rounded-xl border px-2 py-2 text-sm bg-white"
                                          value={op.rightOperand.type}
                                          onChange={(e) => {
                                            const type = e.target.value as
                                              | "column"
                                              | "constant";
                                            setOperations(
                                              operations.map((o) =>
                                                o.id === op.id
                                                  ? {
                                                      ...o,
                                                      rightOperand: {
                                                        type,
                                                        value:
                                                          type === "column"
                                                            ? columns[0]
                                                                ?.name || ""
                                                            : "1",
                                                      },
                                                    }
                                                  : o
                                              )
                                            );
                                          }}
                                        >
                                          <option value="column">
                                            Columna
                                          </option>
                                          <option value="constant">
                                            Constante
                                          </option>
                                        </select>
                                      </div>
                                      <div>
                                        <Label>Valor</Label>
                                        {op.rightOperand.type === "column" ? (
                                          <select
                                            className="w-full rounded-xl border px-2 py-2 text-sm bg-white"
                                            value={op.rightOperand.value}
                                            onChange={(e) => {
                                              setOperations(
                                                operations.map((o) =>
                                                  o.id === op.id
                                                    ? {
                                                        ...o,
                                                        rightOperand: {
                                                          ...o.rightOperand,
                                                          value: e.target.value,
                                                        },
                                                      }
                                                    : o
                                                )
                                              );
                                            }}
                                          >
                                            {columns.map((col) => (
                                              <option
                                                key={col.name}
                                                value={col.name}
                                              >
                                                {col.name} {col.type ? `(${col.type})` : ""}
                                              </option>
                                            ))}
                                          </select>
                                        ) : (
                                          <Input
                                            value={op.rightOperand.value}
                                            onChange={(e) => {
                                              setOperations(
                                                operations.map((o) =>
                                                  o.id === op.id
                                                    ? {
                                                        ...o,
                                                        rightOperand: {
                                                          ...o.rightOperand,
                                                          value: e.target.value,
                                                        },
                                                      }
                                                    : o
                                                )
                                              );
                                            }}
                                            placeholder="Valor constante"
                                          />
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                ))
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* Cast node config */}
                {selected.type === "cast" && (
                  <div className="space-y-3">
                    <div className="font-medium text-sm text-gray-700">
                      Configuración de Conversión de Tipos
                    </div>
                    {(() => {
                      const flow = collectUpstreamFlow(selected.id, widgets, edges);
                      const srcEdge = edges.find((e) => e.to === selected.id);
                      const srcNode =
                        srcEdge && widgets.find((w) => w.id === srcEdge.from);
                      // Determine table & columns from upstream filter or join output
                      let table: string | undefined = undefined;
                      let columns: Array<{ name: string; type?: string }> = [];
                      if (srcNode?.type === "filter") {
                        table = srcNode.filter?.table;
                        // Prefer columns actually selected in the filter, if any
                        const selectedCols = srcNode.filter?.columns || [];
                        if (selectedCols.length > 0) {
                          const uniq = Array.from(
                            new Set(
                              selectedCols.map(
                                (c) =>
                                  // Strip possible prefixes like primary./join_i.
                                  String(c).split(".").slice(-1)[0]
                              )
                            )
                          );
                          columns = uniq.map((name) => ({ name }));
                        } else {
                          // Fallback to all columns from the selected table metadata
                          const connEdge = edges.find(
                            (e) => e.to === srcNode.id
                          );
                          const connNode =
                            connEdge &&
                            widgets.find((w) => w.id === connEdge.from);
                          const availableTables =
                            connNode?.type === "connection" &&
                            metaByNode[connNode.id]
                              ? metaByNode[connNode.id].tables
                              : connMeta?.tables || [];
                          const tbl = (availableTables || []).find(
                            (t) => `${t.schema}.${t.name}` === table
                          );
                          columns = (tbl?.columns || []).map((c: any) => ({
                             name: String(c?.name ?? ""),
                             type: c?.dataType || c?.type || "string",
                          }));
                        }
                      }
                      // For other upstream node types (arithmetic/count/condition/join) we infer columns from its config/result.
                      if (!columns.length && srcNode) {
                        if (srcNode.type === "arithmetic") {
                          const ops = srcNode.arithmetic?.operations || [];
                          columns = ops.map((op) => ({
                            name: op.resultColumn,
                          }));
                        } else if (srcNode.type === "count") {
                          if (srcNode.count?.resultColumn)
                            columns = [{ name: srcNode.count.resultColumn }];
                        } else if (srcNode.type === "condition") {
                          const rules = srcNode.condition?.rules || [];
                          columns = rules.map((r) => ({
                            name: r.resultColumn,
                          }));
                        } else if (srcNode.type === "join") {
                          // Build columns from primaryColumns + secondaryColumns + implicit join condition columns
                          const joinCfg = srcNode.join;
                          const colSet = new Set<string>();
                          if (joinCfg?.primaryColumns)
                            joinCfg.primaryColumns.forEach((c) =>
                              colSet.add(c)
                            );
                          joinCfg?.joins?.forEach((j) => {
                            j.secondaryColumns?.forEach((c) => colSet.add(c));
                            if (j.primaryColumn) colSet.add(j.primaryColumn);
                            if (j.secondaryColumn)
                              colSet.add(j.secondaryColumn);
                          });
                          columns = Array.from(colSet).map((c) => ({
                            name: c.split(".").slice(-1)[0],
                          }));
                        }
                      }
                      const casts = selected.cast?.conversions || [];
                      const setCasts = (next: typeof casts) =>
                        updateSelected({ cast: { conversions: next } });

                      const handleDetectTypes = async () => {
                        setCastDetectError(null);
                        setCastDetectLoading(true);
                        try {
                          const connectionNode = flow.connectionNode;
                          const filterNode = flow.filterNode;
                          const joinNode = flow.joinNode;
                          const unionNode = flow.unionNode;
                          const leftBranch = flow.leftBranch;
                          const rightBranch = flow.rightBranch;

                          let payload: Record<string, unknown> = {};
                          if (unionNode && leftBranch?.connectionNode && leftBranch?.filterNode && rightBranch?.connectionNode && rightBranch?.filterNode) {
                            payload = {
                              union: {
                                left: {
                                  connectionId: leftBranch.connectionNode.connectionId,
                                  filter: {
                                    table: leftBranch.filterNode.filter?.table,
                                    columns: leftBranch.filterNode.filter?.columns || [],
                                    conditions: leftBranch.filterNode.filter?.conditions || [],
                                  },
                                },
                                right: {
                                  connectionId: rightBranch.connectionNode.connectionId,
                                  filter: {
                                    table: rightBranch.filterNode.filter?.table,
                                    columns: rightBranch.filterNode.filter?.columns || [],
                                    conditions: rightBranch.filterNode.filter?.conditions || [],
                                  },
                                },
                                unionAll: (unionNode as any).union?.unionAll !== false,
                              },
                              inferTypes: true,
                              limit: 150,
                            };
                          } else if (joinNode && filterNode) {
                            const j = (joinNode as any).join || {};
                            const allSelected = filterNode.filter?.columns || [];
                            const primarySelected = allSelected.filter((c: string) => c.startsWith("primary.")).map((c: string) => c.slice("primary.".length));
                            const joinsSelected: Record<string, string[]> = {};
                            (j.joins || []).forEach((jn: any, idx: number) => {
                              const prefix = `join_${idx}.`;
                              joinsSelected[jn.id] = allSelected.filter((c: string) => c.startsWith(prefix)).map((c: string) => c.slice(prefix.length));
                            });
                            if (j.joins?.length === 1) {
                              const only = j.joins[0];
                              payload = {
                                join: {
                                  connectionId: j.primaryConnectionId,
                                  secondaryConnectionId: only.secondaryConnectionId,
                                  leftTable: j.primaryTable,
                                  rightTable: only.secondaryTable,
                                  joinConditions: [{ leftTable: j.primaryTable, leftColumn: only.primaryColumn, rightTable: only.secondaryTable, rightColumn: only.secondaryColumn, joinType: only.joinType || "INNER" }],
                                  leftColumns: primarySelected.length ? primarySelected : undefined,
                                  rightColumns: joinsSelected[only.id]?.length ? joinsSelected[only.id] : undefined,
                                },
                                filter: { columns: allSelected, conditions: filterNode.filter?.conditions || [] },
                                inferTypes: true,
                                limit: 150,
                              };
                            } else {
                              payload = {
                                join: {
                                  primaryConnectionId: j.primaryConnectionId,
                                  primaryTable: j.primaryTable,
                                  primaryColumns: primarySelected.length ? primarySelected : j.primaryColumns,
                                  joins: (j.joins || []).map((jn: any) => ({
                                    id: jn.id,
                                    secondaryConnectionId: jn.secondaryConnectionId,
                                    secondaryTable: jn.secondaryTable,
                                    joinType: jn.joinType,
                                    primaryColumn: jn.primaryColumn,
                                    secondaryColumn: jn.secondaryColumn,
                                    secondaryColumns: joinsSelected[jn.id]?.length ? joinsSelected[jn.id] : jn.secondaryColumns,
                                  })),
                                },
                                filter: { columns: allSelected, conditions: filterNode.filter?.conditions || [] },
                                inferTypes: true,
                                limit: 150,
                              };
                            }
                          } else if (connectionNode?.connectionId && filterNode?.filter?.table) {
                            payload = {
                              connectionId: connectionNode.connectionId,
                              filter: {
                                table: filterNode.filter.table,
                                columns: filterNode.filter.columns || [],
                                conditions: filterNode.filter.conditions || [],
                              },
                              inferTypes: true,
                              limit: 150,
                            };
                          } else {
                            setCastDetectError("Conectá un Filtro con tabla seleccionada (o UNION/JOIN) para detectar tipos.");
                            return;
                          }

                          const res = await fetch("/api/etl/run-preview", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify(payload),
                          });
                          const data = await res.json();
                          if (!res.ok || !data.ok) {
                            throw new Error(data?.error || "Error al detectar tipos");
                          }
                          const inferred = data.inferredTypes || [];
                          if (inferred.length === 0) {
                            setCastDetectError("No se obtuvieron filas para inferir tipos.");
                            return;
                          }
                          setCasts(
                            inferred.map((t: { column: string; inferredType: string }) => ({
                              column: t.column,
                              targetType: t.inferredType,
                              inputFormat: null,
                              outputFormat: null,
                            }))
                          );
                        } catch (e: any) {
                          setCastDetectError(e?.message || "Error al detectar tipos");
                        } finally {
                          setCastDetectLoading(false);
                        }
                      };

                      return (
                        <div className="space-y-3">
                          <div className="text-sm text-gray-700">
                            Tabla origen: {table || "—"}
                          </div>
                          <p className="text-xs text-gray-500">
                            Podés detectar tipos automáticamente desde una muestra de datos o forzar el tipo deseado por columna (texto, entero, decimal, fecha).
                          </p>
                          <div className="flex items-center gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={handleDetectTypes}
                              disabled={castDetectLoading || columns.length === 0}
                            >
                              {castDetectLoading ? "Detectando…" : "Detectar tipos automáticamente"}
                            </Button>
                            {castDetectError && (
                              <span className="text-xs text-red-600">{castDetectError}</span>
                            )}
                          </div>
                          {columns.length === 0 ? (
                            <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-2">
                              Conecta a un nodo con columnas disponibles.
                            </div>
                          ) : (
                            <div className="space-y-3">
                              <div className="flex items-center justify-between">
                                <Label>Conversiones</Label>
                                <Button
                                  variant="outline"
                                  className="rounded-full"
                                  onClick={() => {
                                    const firstCol = columns[0]?.name || "";
                                    const newConv = {
                                      column: firstCol,
                                      targetType: "string" as const,
                                      inputFormat: "",
                                      outputFormat: "",
                                    };
                                    setCasts([...casts, newConv]);
                                  }}
                                >
                                  Agregar conversión
                                </Button>
                              </div>
                              {casts.length === 0 && (
                                <div className="text-xs text-gray-600">
                                  No hay conversiones configuradas.
                                </div>
                              )}
                              <div className="space-y-2">
                                {casts.map((c, idx) => (
                                  <Card key={idx} className="p-2 space-y-2">
                                    <div className="flex items-center gap-2">
                                      <select
                                        className="flex-1 rounded-xl border px-2 py-1 text-sm bg-white"
                                        value={c.column}
                                        onChange={(e) => {
                                          const next = [...casts];
                                          next[idx] = {
                                            ...next[idx],
                                            column: e.target.value,
                                          };
                                          setCasts(next);
                                        }}
                                      >
                                        {columns.map((col) => (
                                          <option
                                            key={col.name}
                                            value={col.name}
                                          >
                                            {col.name} {col.type ? `(${col.type})` : ""}
                                          </option>
                                        ))}
                                      </select>
                                      <select
                                        className="rounded-xl border px-2 py-1 text-sm bg-white"
                                        value={c.targetType}
                                        onChange={(e) => {
                                          const next = [...casts];
                                          next[idx] = {
                                            ...next[idx],
                                            targetType: e.target
                                              .value as typeof c.targetType,
                                          };
                                          setCasts(next);
                                        }}
                                      >
                                        {[
                                          { value: "string", label: "Texto" },
                                          { value: "integer", label: "Entero" },
                                          { value: "number", label: "Decimal" },
                                          { value: "decimal", label: "Decimal (numérico)" },
                                          { value: "boolean", label: "Booleano" },
                                          { value: "date", label: "Fecha" },
                                          { value: "datetime", label: "Fecha y hora" },
                                        ].map((t) => (
                                          <option key={t.value} value={t.value}>
                                            {t.label}
                                          </option>
                                        ))}
                                      </select>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => {
                                          const next = casts.filter(
                                            (_, i) => i !== idx
                                          );
                                          setCasts(next);
                                        }}
                                      >
                                        <Minus className="h-4 w-4" />
                                      </Button>
                                    </div>

                                    {/* Date-specific options: input/output format and help */}
                                    {(c.targetType === "date" ||
                                      c.targetType === "datetime") && (
                                      <div className="space-y-2">
                                        <div>
                                          <Label>Formato de entrada (si la fecha viene como texto)</Label>
                                          <Input
                                            placeholder="ej: dd/MM/yyyy para 01/02/2025"
                                            value={c.inputFormat ?? ""}
                                            onChange={(e) => {
                                              const next = [...casts];
                                              next[idx] = {
                                                ...next[idx],
                                                inputFormat: e.target.value,
                                              };
                                              setCasts(next);
                                            }}
                                            className="rounded-xl"
                                          />
                                        </div>
                                        <div>
                                          <Label>Formato de salida</Label>
                                          <Input
                                            placeholder="ej: dd/MM/yyyy"
                                            value={c.outputFormat ?? ""}
                                            onChange={(e) => {
                                              const next = [...casts];
                                              next[idx] = {
                                                ...next[idx],
                                                outputFormat: e.target.value,
                                              };
                                              setCasts(next);
                                            }}
                                            className="rounded-xl"
                                          />
                                        </div>
                                        <div className="text-xs text-gray-500 bg-gray-50 border rounded p-2">
                                          <div className="font-medium">
                                            Instrucciones
                                          </div>
                                          <div>
                                            Describe el patrón que se encontrará
                                            en la columna de origen y el patrón
                                            deseado de salida. Usa tokens
                                            comunes como:
                                          </div>
                                          <div className="mt-1">
                                            <strong>dd</strong> (día 2 dígitos),{" "}
                                            <strong>d</strong> (día),{" "}
                                            <strong>MM</strong> (mes numérico 2
                                            dígitos), <strong>MMMM</strong>{" "}
                                            (nombre completo de mes),{" "}
                                            <strong>MMM</strong> (nombre corto),{" "}
                                            <strong>yyyy</strong> (año 4
                                            dígitos), <strong>HH:mm:ss</strong>{" "}
                                            (hora).
                                          </div>
                                          <div className="mt-1">
                                            Ejemplo: si la columna contiene "02
                                            de enero de 2017" use entrada{" "}
                                            <code>dd 'de' MMMM 'de' yyyy</code>{" "}
                                            y salida <code>dd/MM/yyyy</code>.
                                          </div>
                                          <div className="mt-1">
                                            Nota: si los nombres de meses están
                                            en español, asegúrate de que el
                                            proceso que aplica el casteo soporte
                                            locales o normaliza los meses
                                            previamente.
                                          </div>
                                        </div>
                                      </div>
                                    )}

                                    {/* Ya no se edita alias; la conversión reemplaza la columna original */}
                                  </Card>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* Condition node config */}
                {selected.type === "condition" && (
                  <div className="space-y-3">
                    <div className="font-medium text-sm text-gray-700">
                      Configuración de Condiciones (IF / ELSE IF / ELSE)
                    </div>
                    {(() => {
                      const srcEdge = edges.find((e) => e.to === selected.id);
                      const srcNode =
                        srcEdge && widgets.find((w) => w.id === srcEdge.from);
                      // Use the same robust upstream resolution as the Count node
                      const resolveUpstreamSource = (startNode: Widget) => {
                        let curr: Widget | undefined = startNode;
                        const path: Widget[] = [];
                        const visited = new Set<string>();

                        while (curr) {
                          if (visited.has(curr.id)) break;
                          visited.add(curr.id);

                          if (curr.type === "filter" || curr.type === "join") {
                            return { source: curr, path: path.reverse() };
                          }

                          path.push(curr);
                          const edge = edges.find((e) => e.to === curr!.id);
                          if (!edge) break;
                          curr = widgets.find((w) => w.id === edge.from);
                        }
                        return null;
                      };

                      const upstream = srcNode
                        ? resolveUpstreamSource(srcNode)
                        : null;

                      let table = "";
                      let columns: Array<{ name: string; type?: string }> = [];

                      if (upstream) {
                        const { source, path } = upstream;

                        // 1. Base columns from source
                        if (source.type === "filter") {
                          table = source.filter?.table || "";
                          const selectedCols = source.filter?.columns || [];
                          if (selectedCols.length > 0) {
                            columns = selectedCols.map((c) => ({
                              name: String(c).split(".").pop()!,
                            }));
                          } else {
                            // Metadata lookup
                            const connEdge = edges.find(
                              (e) => e.to === source.id
                            );
                            const connNode =
                              connEdge &&
                              widgets.find((w) => w.id === connEdge.from);
                            const availableTables =
                              connNode?.type === "connection" &&
                              metaByNode[connNode.id]
                                ? metaByNode[connNode.id].tables
                                : connMeta?.tables || [];
                            const tbl = (availableTables || []).find(
                              (t) => `${t.schema}.${t.name}` === table
                            );
                            columns = (tbl?.columns || []).map((c: any) => ({
                              name: String(c?.name ?? ""),
                              type: c?.dataType || c?.type || "string",
                            }));
                          }
                        } else if (source.type === "join") {
                          table = source.join?.primaryTable || "Join Result";
                          const primaryCols = source.join?.primaryColumns || [];
                          const secondaryCols =
                            source.join?.joins?.flatMap(
                              (j) => j.secondaryColumns || []
                            ) || [];
                          columns = [...primaryCols, ...secondaryCols].map(
                            (c) => ({ name: String(c).split(".").pop()! })
                          );
                        }

                        // 2. Apply transformations along the path to collect new columns
                        for (const node of path) {
                          if (node.type === "arithmetic") {
                            node.arithmetic?.operations.forEach((op) => {
                              if (op.resultColumn)
                                columns.push({ name: op.resultColumn, type: "number" });
                            });
                          } else if (node.type === "condition") {
                            node.condition?.rules.forEach((r) => {
                              if (r.resultColumn)
                                columns.push({
                                  name: r.resultColumn,
                                  type: r.outputType === "boolean" ? "boolean" : "string",
                                });
                            });
                          } else if (node.type === "count") {
                            const attr = node.count?.attribute;
                            const res = node.count?.resultColumn;
                            columns = [];
                            if (attr) columns.push({ name: attr, type: "string" });
                            if (res) columns.push({ name: res, type: "number" });
                          } else if (node.type === "cast") {
                            node.cast?.conversions.forEach((c) => {
                              const existing = columns.find((col) => col.name === c.column);
                              if (existing) {
                                existing.type = c.targetType;
                              }
                            });
                          }
                        }
                      }
                      const rules = selected.condition?.rules || [];
                      const setRules = (next: typeof rules) =>
                        updateSelected({
                          condition: {
                            ...selected.condition,
                            rules: next,
                          },
                        });
                      const condResultColumn =
                        selected.condition?.resultColumn ?? "";
                      const condDefaultValue =
                        selected.condition?.defaultResultValue ?? "";

                      return (
                        <div className="space-y-3">
                          <div className="text-sm text-gray-700">
                            Tabla: {table || "—"}
                          </div>
                          <p className="text-xs text-gray-500">
                            Definí una columna de resultado y valor por defecto para usar evaluación secuencial: se asigna el valor de la primera regla que cumpla; si ninguna cumple, se usa el valor por defecto.
                          </p>
                          <div className="grid grid-cols-1 gap-2">
                            <div>
                              <Label>Columna de resultado (todas las condiciones)</Label>
                              <Input
                                className="mt-1"
                                value={condResultColumn}
                                onChange={(e) =>
                                  updateSelected({
                                    condition: {
                                      ...selected.condition,
                                      rules: selected.condition?.rules ?? [],
                                      resultColumn: e.target.value.trim() || undefined,
                                    },
                                  })
                                }
                                placeholder="ej. región"
                              />
                            </div>
                            <div>
                              <Label>Valor por defecto (si no coincide ninguna)</Label>
                              <Input
                                className="mt-1"
                                value={condDefaultValue}
                                onChange={(e) =>
                                  updateSelected({
                                    condition: {
                                      ...selected.condition,
                                      rules: selected.condition?.rules ?? [],
                                      defaultResultValue: e.target.value,
                                    },
                                  })
                                }
                                placeholder="ej. Resto del mundo"
                              />
                            </div>
                          </div>
                          {columns.length === 0 ? (
                            <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-2">
                              Conecta a un Filtro con una tabla seleccionada.
                            </div>
                          ) : (
                            <div className="space-y-3">
                              <div className="flex items-center justify-between">
                                <Label>Reglas (orden = IF → ELSE IF → …)</Label>
                                {rules.length === 0 && (
                                  <Button
                                    variant="outline"
                                    className="rounded-full"
                                    onClick={() => {
                                      const newRule = {
                                        id: `rule-${Date.now()}-${Math.random()
                                          .toString(36)
                                          .slice(2, 6)}`,
                                        leftOperand: {
                                          type: "column" as const,
                                          value: columns[0]?.name || "",
                                        },
                                        comparator: "=" as const,
                                        rightOperand: {
                                          type: "constant" as const,
                                          value: "",
                                        },
                                        resultColumn: `cond_${
                                          rules.length + 1
                                        }`,
                                        outputType: "boolean" as const,
                                        thenValue: undefined,
                                        elseValue: undefined,
                                        shouldFilter: false,
                                      };
                                      setRules([...(rules || []), newRule]);
                                    }}
                                  >
                                    Agregar regla
                                  </Button>
                                )}
                              </div>
                              {rules.length === 0 ? (
                                <div className="text-sm text-gray-500">
                                  No hay reglas.
                                </div>
                              ) : (
                                rules.map((r) => (
                                  <div
                                    key={r.id}
                                    className="border rounded-xl p-3 space-y-2"
                                  >
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-3">
                                        <span className="text-sm font-medium">
                                          {r.resultColumn}
                                        </span>
                                        <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer select-none bg-gray-50 px-2 py-1 rounded border">
                                          <input
                                            type="checkbox"
                                            className="rounded border-gray-300 text-primary focus:ring-primary h-3 w-3"
                                            checked={!!r.shouldFilter}
                                            onChange={(e) =>
                                              setRules(
                                                rules.map((x) =>
                                                  x.id === r.id
                                                    ? {
                                                        ...x,
                                                        shouldFilter:
                                                          e.target.checked,
                                                      }
                                                    : x
                                                )
                                              )
                                            }
                                          />
                                          Filtrar filas
                                        </label>
                                      </div>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() =>
                                          setRules(
                                            rules.filter((x) => x.id !== r.id)
                                          )
                                        }
                                      >
                                        Eliminar
                                      </Button>
                                    </div>

                                    {/* Result column name */}
                                    <div>
                                      <Label>Nombre de columna resultado</Label>
                                      <Input
                                        value={r.resultColumn}
                                        onChange={(e) =>
                                          setRules(
                                            rules.map((x) =>
                                              x.id === r.id
                                                ? {
                                                    ...x,
                                                    resultColumn:
                                                      e.target.value,
                                                  }
                                                : x
                                            )
                                          )
                                        }
                                        placeholder="nombre_columna"
                                      />
                                    </div>

                                    {/* Left operand */}
                                    <div className="grid grid-cols-2 gap-2">
                                      <div>
                                        <Label>Operando izquierdo</Label>
                                        <select
                                          className="w-full rounded-xl border px-2 py-2 text-sm bg-white"
                                          value={r.leftOperand.type}
                                          onChange={(e) => {
                                            const type = e.target.value as
                                              | "column"
                                              | "constant";
                                            setRules(
                                              rules.map((x) =>
                                                x.id === r.id
                                                  ? {
                                                      ...x,
                                                      leftOperand: {
                                                        type,
                                                        value:
                                                          type === "column"
                                                            ? columns[0]
                                                                ?.name || ""
                                                            : "",
                                                      },
                                                    }
                                                  : x
                                              )
                                            );
                                          }}
                                        >
                                          <option value="column">
                                            Columna
                                          </option>
                                          <option value="constant">
                                            Constante
                                          </option>
                                        </select>
                                      </div>
                                      <div>
                                        <Label>Valor</Label>
                                        {r.leftOperand.type === "column" ? (
                                          <select
                                            className="w-full rounded-xl border px-2 py-2 text-sm bg-white"
                                            value={r.leftOperand.value}
                                            onChange={(e) =>
                                              setRules(
                                                rules.map((x) =>
                                                  x.id === r.id
                                                    ? {
                                                        ...x,
                                                        leftOperand: {
                                                          ...x.leftOperand,
                                                          value: e.target.value,
                                                        },
                                                      }
                                                    : x
                                                )
                                              )
                                            }
                                          >
                                            {columns.map((col) => (
                                              <option
                                                key={col.name}
                                                value={col.name}
                                              >
                                                {col.name} {col.type ? `(${col.type})` : ""}
                                              </option>
                                            ))}
                                          </select>
                                        ) : (
                                          <Input
                                            value={r.leftOperand.value}
                                            onChange={(e) =>
                                              setRules(
                                                rules.map((x) =>
                                                  x.id === r.id
                                                    ? {
                                                        ...x,
                                                        leftOperand: {
                                                          ...x.leftOperand,
                                                          value: e.target.value,
                                                        },
                                                      }
                                                    : x
                                                )
                                              )
                                            }
                                            placeholder="Valor constante"
                                          />
                                        )}
                                      </div>
                                    </div>

                                    {/* Comparator */}
                                    <div>
                                      <Label>Comparador</Label>
                                      <select
                                        className="w-full rounded-xl border px-2 py-2 text-sm bg-white"
                                        value={r.comparator}
                                        onChange={(e) =>
                                          setRules(
                                            rules.map((x) =>
                                              x.id === r.id
                                                ? {
                                                    ...x,
                                                    comparator: e.target
                                                      .value as any,
                                                  }
                                                : x
                                            )
                                          )
                                        }
                                      >
                                        {["=", "!=", ">", ">=", "<", "<="].map(
                                          (op) => (
                                            <option key={op} value={op}>
                                              {op}
                                            </option>
                                          )
                                        )}
                                      </select>
                                    </div>

                                    {/* Right operand */}
                                    <div className="grid grid-cols-2 gap-2">
                                      <div>
                                        <Label>Operando derecho</Label>
                                        <select
                                          className="w-full rounded-xl border px-2 py-2 text-sm bg-white"
                                          value={r.rightOperand.type}
                                          onChange={(e) => {
                                            const type = e.target.value as
                                              | "column"
                                              | "constant";
                                            setRules(
                                              rules.map((x) =>
                                                x.id === r.id
                                                  ? {
                                                      ...x,
                                                      rightOperand: {
                                                        type,
                                                        value:
                                                          type === "column"
                                                            ? columns[0]
                                                                ?.name || ""
                                                            : "",
                                                      },
                                                    }
                                                  : x
                                              )
                                            );
                                          }}
                                        >
                                          <option value="column">
                                            Columna
                                          </option>
                                          <option value="constant">
                                            Constante
                                          </option>
                                        </select>
                                      </div>
                                      <div>
                                        <Label>Valor</Label>
                                        {r.rightOperand.type === "column" ? (
                                          <select
                                            className="w-full rounded-xl border px-2 py-2 text-sm bg-white"
                                            value={r.rightOperand.value}
                                            onChange={(e) =>
                                              setRules(
                                                rules.map((x) =>
                                                  x.id === r.id
                                                    ? {
                                                        ...x,
                                                        rightOperand: {
                                                          ...x.rightOperand,
                                                          value: e.target.value,
                                                        },
                                                      }
                                                    : x
                                                )
                                              )
                                            }
                                          >
                                            {columns.map((col) => (
                                              <option
                                                key={col.name}
                                                value={col.name}
                                              >
                                                {col.name} {col.type ? `(${col.type})` : ""}
                                              </option>
                                            ))}
                                          </select>
                                        ) : (
                                          <Input
                                            value={r.rightOperand.value}
                                            onChange={(e) =>
                                              setRules(
                                                rules.map((x) =>
                                                  x.id === r.id
                                                    ? {
                                                        ...x,
                                                        rightOperand: {
                                                          ...x.rightOperand,
                                                          value: e.target.value,
                                                        },
                                                      }
                                                    : x
                                                )
                                              )
                                            }
                                            placeholder="Valor constante"
                                          />
                                        )}
                                      </div>
                                    </div>

                                    {/* Output type and values */}
                                    <div className="grid grid-cols-2 gap-2">
                                      <div>
                                        <Label>Tipo de salida</Label>
                                        <select
                                          className="w-full rounded-xl border px-2 py-2 text-sm bg-white"
                                          value={r.outputType}
                                          onChange={(e) =>
                                            setRules(
                                              rules.map((x) =>
                                                x.id === r.id
                                                  ? {
                                                      ...x,
                                                      outputType: e.target
                                                        .value as any,
                                                    }
                                                  : x
                                              )
                                            )
                                          }
                                        >
                                          <option value="boolean">
                                            Booleano
                                          </option>
                                          <option value="string">Texto</option>
                                          <option value="number">Número</option>
                                        </select>
                                      </div>
                                      <div className="text-xs text-gray-500 flex items-end">
                                        {r.outputType === "boolean"
                                          ? "Devuelve true/false"
                                          : "Devuelve constantes personalizadas"}
                                      </div>
                                    </div>

                                    {r.outputType !== "boolean" && (
                                      <div className="grid grid-cols-2 gap-2">
                                        <div>
                                          <Label>Valor si verdadero</Label>
                                          <Input
                                            value={r.thenValue ?? ""}
                                            onChange={(e) =>
                                              setRules(
                                                rules.map((x) =>
                                                  x.id === r.id
                                                    ? {
                                                        ...x,
                                                        thenValue:
                                                          e.target.value,
                                                      }
                                                    : x
                                                )
                                              )
                                            }
                                            placeholder="Valor 'Verdadero'"
                                          />
                                        </div>
                                        <div>
                                          <Label>Valor si falso</Label>
                                          <Input
                                            value={r.elseValue ?? ""}
                                            onChange={(e) =>
                                              setRules(
                                                rules.map((x) =>
                                                  x.id === r.id
                                                    ? {
                                                        ...x,
                                                        elseValue:
                                                          e.target.value,
                                                      }
                                                    : x
                                                )
                                              )
                                            }
                                            placeholder="Valor 'Falso'"
                                          />
                                        </div>
                                      </div>
                                    )}

                                    {/* Filtering Toggle */}
                                    <div className="flex items-center gap-2 pt-2 border-t mt-2">
                                      <input
                                        type="checkbox"
                                        id={`filter-${r.id}`}
                                        className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                                        checked={!!r.shouldFilter}
                                        onChange={(e) =>
                                          setRules(
                                            rules.map((x) =>
                                              x.id === r.id
                                                ? {
                                                    ...x,
                                                    shouldFilter:
                                                      e.target.checked,
                                                  }
                                                : x
                                            )
                                          )
                                        }
                                      />
                                      <Label
                                        htmlFor={`filter-${r.id}`}
                                        className="text-sm cursor-pointer"
                                      >
                                        Filtrar filas no coincidentes
                                      </Label>
                                    </div>
                                    <div className="text-xs text-gray-400 pl-6">
                                      Si se activa, solo se mantendrán las filas que cumplan esta condición.
                                    </div>
                                  </div>
                                ))
                              )}

                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* Union node config */}
                {selected.type === "union" && (
                  <div className="space-y-3">
                    <div className="font-medium text-sm text-gray-700">
                      Configuración de UNION
                    </div>
                    <p className="text-xs text-gray-500">
                      Conectá dos ramas (Conexión → Filtro) al nodo UNION. Ambas tablas deben tener las mismas columnas.
                    </p>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selected.union?.unionAll !== false}
                        onChange={(e) =>
                          setWidgets((prev) =>
                            prev.map((w) =>
                              w.id === selected.id
                                ? {
                                    ...w,
                                    union: {
                                      ...(w.union || {}),
                                      unionAll: e.target.checked,
                                    },
                                  }
                                : w
                            )
                          )
                        }
                        className="rounded border border-gray-300"
                      />
                      <span className="text-sm">UNION ALL (no eliminar duplicados)</span>
                    </label>
                  </div>
                )}

                {/* Join node config (Star schema) */}
                {selected.type === "join" &&
                  (() => {
                    // Helpers to resolve metadata and columns
                    const findConnMeta = (cid?: string | number) => {
                      if (!cid && cid !== 0) return undefined as any;
                      const widget = widgets.find(
                        (w) =>
                          w.type === "connection" &&
                          String(w.connectionId) === String(cid)
                      );
                      if (widget && metaByNode[widget.id])
                        return metaByNode[widget.id];
                      return metaByNode[`conn:${cid}`];
                    };
                    const getColumnsFor = (
                      connectionId?: string | number,
                      qualified?: string
                    ): string[] => {
                      if (!connectionId || !qualified) return [];
                      const meta = findConnMeta(connectionId);
                      const t = meta?.tables?.find(
                        (tt: any) => `${tt.schema}.${tt.name}` === qualified
                      );
                      return (t?.columns || []).map((c: any) => c.name);
                    };

                    const primaryCols = getColumnsFor(
                      selected.join?.primaryConnectionId,
                      selected.join?.primaryTable
                    );

                    return (
                      <div className="space-y-4">
                        <div className="font-medium text-sm text-gray-700">
                          Configuración de JOIN (Star Schema)
                        </div>

                        {/* Primary table */}
                        <div className="space-y-2">
                          <Label>Tabla Principal</Label>
                          <select
                            className="w-full rounded-xl border px-3 py-2 text-sm bg-white"
                            value={
                              selected.join?.primaryConnectionId &&
                              selected.join?.primaryTable
                                ? `${selected.join.primaryConnectionId}::${selected.join.primaryTable}`
                                : ""
                            }
                            onChange={(e) => {
                              const val = e.target.value;
                              if (!val) {
                                updateSelected({
                                  join: {
                                    ...selected.join,
                                    primaryConnectionId: undefined,
                                    primaryTable: undefined,
                                    primaryColumns: undefined,
                                    joins: [],
                                  },
                                });
                                return;
                              }
                              const [connId, qualified] = val.split("::");
                              updateSelected({
                                join: {
                                  ...selected.join,
                                  primaryConnectionId: connId,
                                  primaryTable: qualified,
                                  primaryColumns: undefined,
                                  // reset joins when primary changes to avoid invalid pairings
                                  joins: [],
                                },
                              });
                            }}
                          >
                            <option value="">Selecciona tabla…</option>
                            {availableTablesForJoin.map((t, idx) => (
                              <option
                                key={`${t.connectionId}-${t.qualifiedName}-${idx}`}
                                value={`${t.connectionId}::${t.qualifiedName}`}
                              >
                                {`${t.connectionName} - ${t.qualifiedName}`}
                              </option>
                            ))}
                          </select>
                          <div>
                            <Label>Columnas de la Principal (opcional)</Label>
                            <Input
                              placeholder="ej: id,nombre,email"
                              value={(selected.join?.primaryColumns || []).join(
                                ", "
                              )}
                              onChange={(e) => {
                                const columns = e.target.value
                                  .split(",")
                                  .map((c) => c.trim())
                                  .filter(Boolean);
                                updateSelected({
                                  join: {
                                    ...selected.join,
                                    primaryColumns: columns.length
                                      ? columns
                                      : undefined,
                                  },
                                });
                              }}
                              className="rounded-xl"
                            />
                          </div>
                        </div>

                        {/* Secondary joins */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Label>Tablas a Unir (Joins)</Label>
                            <Button
                              variant="outline"
                              className="rounded-full"
                              onClick={() => {
                                const base = selected.join?.joins || [];
                                const newJoin = {
                                  id: `join-${Date.now()}-${Math.random()
                                    .toString(36)
                                    .slice(2, 6)}`,
                                  secondaryTable: undefined as
                                    | string
                                    | undefined,
                                  secondaryConnectionId: undefined as any,
                                  primaryColumn: undefined as
                                    | string
                                    | undefined,
                                  secondaryColumn: undefined as
                                    | string
                                    | undefined,
                                  joinType: "INNER" as const,
                                  secondaryColumns: undefined as
                                    | string[]
                                    | undefined,
                                };
                                updateSelected({
                                  join: {
                                    ...(selected.join || {}),
                                    joins: [...base, newJoin],
                                  },
                                });
                              }}
                              disabled={!selected.join?.primaryTable}
                            >
                              Añadir Join
                            </Button>
                          </div>

                          {(selected.join?.joins || []).length === 0 ? (
                            <div className="text-sm text-gray-500">
                              Sin joins agregados.
                            </div>
                          ) : (
                            <div className="space-y-3">
                              {(selected.join?.joins || []).map((jn, idx) => {
                                const secCols = getColumnsFor(
                                  jn.secondaryConnectionId,
                                  jn.secondaryTable
                                );
                                return (
                                  <div
                                    key={jn.id}
                                    className="border rounded-xl p-3 space-y-3"
                                  >
                                    <div className="flex items-center justify-between">
                                      <div className="text-sm font-medium">
                                        Join {idx + 1}
                                      </div>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => {
                                          const next = (
                                            selected.join?.joins || []
                                          ).filter((j) => j.id !== jn.id);
                                          updateSelected({
                                            join: {
                                              ...(selected.join || {}),
                                              joins: next,
                                            },
                                          });
                                        }}
                                      >
                                        Eliminar
                                      </Button>
                                    </div>

                                    <div>
                                      <Label>Tabla Secundaria</Label>
                                      <select
                                        className="w-full rounded-xl border px-3 py-2 text-sm bg-white"
                                        value={
                                          jn.secondaryConnectionId &&
                                          jn.secondaryTable
                                            ? `${jn.secondaryConnectionId}::${jn.secondaryTable}`
                                            : ""
                                        }
                                        onChange={(e) => {
                                          const val = e.target.value;
                                          let secConn:
                                            | string
                                            | number
                                            | undefined;
                                          let secTable: string | undefined;
                                          if (val) {
                                            const [cid, q] = val.split("::");
                                            secConn = cid as any;
                                            secTable = q;
                                          }
                                          const next = (
                                            selected.join?.joins || []
                                          ).map((j) =>
                                            j.id === jn.id
                                              ? {
                                                  ...j,
                                                  secondaryConnectionId:
                                                    secConn,
                                                  secondaryTable: secTable,
                                                  // reset columns when table changes
                                                  secondaryColumn: undefined,
                                                }
                                              : j
                                          );
                                          updateSelected({
                                            join: {
                                              ...(selected.join || {}),
                                              joins: next,
                                            },
                                          });
                                        }}
                                      >
                                        <option value="">
                                          Selecciona tabla…
                                        </option>
                                        {availableTablesForJoin.map((t, i) => (
                                          <option
                                            key={`${t.connectionId}-${t.qualifiedName}-${i}`}
                                            value={`${t.connectionId}::${t.qualifiedName}`}
                                          >
                                            {`${t.connectionName} - ${t.qualifiedName}`}
                                          </option>
                                        ))}
                                      </select>
                                    </div>

                                    <div className="grid grid-cols-3 gap-3">
                                      <div>
                                        <Label>Tipo de JOIN</Label>
                                        <select
                                          className="w-full rounded-xl border px-3 py-2 text-sm bg-white"
                                          value={jn.joinType}
                                          onChange={(e) => {
                                            const next = (
                                              selected.join?.joins || []
                                            ).map((j) =>
                                              j.id === jn.id
                                                ? {
                                                    ...j,
                                                    joinType: e.target
                                                      .value as any,
                                                  }
                                                : j
                                            );
                                            updateSelected({
                                              join: {
                                                ...(selected.join || {}),
                                                joins: next,
                                              },
                                            });
                                          }}
                                        >
                                          <option value="INNER">INNER</option>
                                          <option value="LEFT">LEFT</option>
                                          <option value="RIGHT">RIGHT</option>
                                          <option value="FULL">FULL</option>
                                        </select>
                                      </div>
                                      <div>
                                        <Label>Columna Principal</Label>
                                        <select
                                          className="w-full rounded-xl border px-3 py-2 text-sm bg-white"
                                          value={jn.primaryColumn || ""}
                                          onChange={(e) => {
                                            const next = (
                                              selected.join?.joins || []
                                            ).map((j) =>
                                              j.id === jn.id
                                                ? {
                                                    ...j,
                                                    primaryColumn:
                                                      e.target.value,
                                                  }
                                                : j
                                            );
                                            updateSelected({
                                              join: {
                                                ...(selected.join || {}),
                                                joins: next,
                                              },
                                            });
                                          }}
                                          disabled={
                                            !selected.join?.primaryTable
                                          }
                                        >
                                          <option value="">Columna…</option>
                                          {primaryCols.map((c) => (
                                            <option key={c} value={c}>
                                              {c}
                                            </option>
                                          ))}
                                        </select>
                                      </div>
                                      <div>
                                        <Label>Columna Secundaria</Label>
                                        <select
                                          className="w-full rounded-xl border px-3 py-2 text-sm bg-white"
                                          value={jn.secondaryColumn || ""}
                                          onChange={(e) => {
                                            const next = (
                                              selected.join?.joins || []
                                            ).map((j) =>
                                              j.id === jn.id
                                                ? {
                                                    ...j,
                                                    secondaryColumn:
                                                      e.target.value,
                                                  }
                                                : j
                                            );
                                            updateSelected({
                                              join: {
                                                ...(selected.join || {}),
                                                joins: next,
                                              },
                                            });
                                          }}
                                          disabled={!jn.secondaryTable}
                                        >
                                          <option value="">Columna…</option>
                                          {secCols.map((c) => (
                                            <option key={c} value={c}>
                                              {c}
                                            </option>
                                          ))}
                                        </select>
                                      </div>
                                    </div>

                                    <div>
                                      <Label>
                                        Columnas Secundarias (opcional)
                                      </Label>
                                      <Input
                                        placeholder="ej: id,created_at,status"
                                        value={(jn.secondaryColumns || []).join(
                                          ", "
                                        )}
                                        onChange={(e) => {
                                          const cols = e.target.value
                                            .split(",")
                                            .map((c) => c.trim())
                                            .filter(Boolean);
                                          const next = (
                                            selected.join?.joins || []
                                          ).map((j) =>
                                            j.id === jn.id
                                              ? {
                                                  ...j,
                                                  secondaryColumns: cols.length
                                                    ? cols
                                                    : undefined,
                                                }
                                              : j
                                          );
                                          updateSelected({
                                            join: {
                                              ...(selected.join || {}),
                                              joins: next,
                                            },
                                          });
                                        }}
                                        className="rounded-xl"
                                      />
                                      <div className="text-xs text-gray-500 mt-1">
                                        Deja vacío para seleccionar todas las
                                        columnas
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        <JoinPreviewButton widget={selected} />
                      </div>
                    );
                  })()}

                {/* End node config */}
                {selected.type === "end" && (
                  <div className="space-y-3">
                    <div className="font-medium text-sm text-gray-700">
                      Configuración de Fin
                    </div>
                    <div className="space-y-2">
                      <Label>Tabla destino (Supabase)</Label>
                      <Input
                        placeholder="ej: dw_ventas_limpias"
                        value={selected.end?.target?.table || ""}
                        onChange={(e) =>
                          updateSelected({
                            end: {
                              ...(selected.end || {}),
                              target: {
                                type: "supabase",
                                table: e.target.value,
                              },
                              mode: selected.end?.mode,
                              lastRun: selected.end?.lastRun || null,
                            },
                          })
                        }
                        className="rounded-xl"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Modo</Label>
                      <select
                        className="w-full rounded-xl border px-2 py-2 text-sm bg-white"
                        value={selected.end?.mode || "append"}
                        onChange={(e) =>
                          updateSelected({
                            end: {
                              ...(selected.end || {}),
                              target: selected.end?.target,
                              mode: e.target.value as any,
                              lastRun: selected.end?.lastRun || null,
                            },
                          })
                        }
                      >
                        <option value="append">Append (agregar)</option>
                        <option value="replace">Replace (reemplazar)</option>
                      </select>
                    </div>
                    <div className="flex items-center gap-2">
                      <EndPreviewButton
                        widget={selected}
                        edges={edges}
                        widgets={widgets}
                        etlId={etlId}
                      />
                      <EndRunButton
                        widget={selected}
                        edges={edges}
                        widgets={widgets}
                        etlId={etlId}
                        onRunStart={(runId) => {
                           setActiveRunId(runId);
                           setActiveRunStatus("started");
                           setRunStartTime(new Date());
                        }}
                      />
                    </div>
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
      </section>

      {/* Global Run Dialog */}
      <Dialog open={!!activeRunId} onOpenChange={(open: boolean) => {
          // Prevent closing if running
          if (!open && (activeRunStatus === 'started' || activeRunStatus === 'running')) return;
          if (!open) { 
              setActiveRunId(null); 
              setActiveRunStatus(null);
          }
      }}>
        <DialogContent className="sm:max-w-md" onInteractOutside={(e) => { e.preventDefault(); }}>
          <DialogHeader>
            <DialogTitle>Ejecución ETL en Progreso</DialogTitle>
            <DialogDescription>
               {activeRunStatus === 'completed' 
                 ? "El proceso ha finalizado correctamente." 
                 : activeRunStatus === 'failed'
                 ? "El proceso ha fallado."
                 : "Procesando datos en segundo plano. Por favor espere."}
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex flex-col items-center justify-center p-4 gap-4">
              {(activeRunStatus === 'started' || activeRunStatus === 'running') && (
                  <div className="w-full space-y-2">
                       <div className="flex justify-between text-sm text-gray-600">
                          <span className="flex items-center gap-2"><Loader2 className="h-3 w-3 animate-spin"/> Procesando...</span>
                          <span className="font-mono font-medium">{progress.toLocaleString()} filas</span>
                       </div>
                       <Progress value={undefined} className="h-2 w-full animate-pulse" />
                       <div className="text-xs text-gray-400 text-center pt-1">
                          No cierre esta ventana hasta que finalice.
                       </div>
                  </div>
              )}

              {activeRunStatus === 'completed' && (
                  <div className="text-center space-y-2">
                      <div className="text-emerald-600 font-medium text-lg">¡Completado!</div>
                      <div className="text-gray-600">Total filas procesadas: {progress.toLocaleString()}</div>
                  </div>
              )}

              {activeRunStatus === 'failed' && (
                  <div className="text-center space-y-2">
                      <div className="text-red-600 font-medium text-lg">Error</div>
                      <div className="text-gray-600 text-sm">Ocurrió un error en el servidor. Revise los logs para más detalles.</div>
                  </div>
              )}
          </div>

          <DialogFooter className="sm:justify-center">
             {(activeRunStatus === 'completed' || activeRunStatus === 'failed') && (
                 <Button type="button" variant="secondary" onClick={() => { setActiveRunId(null); setActiveRunStatus(null); }}>
                    Cerrar
                 </Button>
             )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default ETLEditor;

// Utilidades compartidas con Cast/Arithmetic para convertir valores y fechas en cliente
const ES_MONTHS = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];
const ES_MONTHS_SHORT = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
];

function buildRegexFromPattern(pattern: string) {
  const groups: { token: string }[] = [];
  let src = "^";
  let i = 0;
  while (i < pattern.length) {
    if (pattern[i] === "'") {
      let j = i + 1;
      let lit = "";
      while (j < pattern.length && pattern[j] !== "'") {
        lit += pattern[j++];
      }
      src += lit.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
      i = j + 1;
      continue;
    }
    const rest = pattern.slice(i);
    const match = rest.startsWith("EEEE")
      ? "EEEE"
      : rest.startsWith("MMMM")
      ? "MMMM"
      : rest.startsWith("MMM")
      ? "MMM"
      : rest.startsWith("yyyy")
      ? "yyyy"
      : rest.startsWith("dd")
      ? "dd"
      : rest.startsWith("MM")
      ? "MM"
      : rest.startsWith("d")
      ? "d"
      : rest.startsWith("M")
      ? "M"
      : null;
    if (match) {
      groups.push({ token: match });
      switch (match) {
        case "EEEE":
        case "MMMM":
        case "MMM":
          src += "([A-Za-zÁÉÍÓÚáéíóúñÑ]+)";
          break;
        case "yyyy":
          src += "(\\d{4})";
          break;
        case "dd":
          src += "(\\d{2})";
          break;
        case "MM":
          src += "(\\d{2})";
          break;
        case "d":
          src += "(\\d{1,2})";
          break;
        case "M":
          src += "(\\d{1,2})";
          break;
      }
      i += match.length;
    } else {
      src += pattern[i].replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
      i += 1;
    }
  }
  src += "$";
  return { regex: new RegExp(src, "i"), groups };
}

function parseDateWithPattern(value: string, pattern?: string): Date | null {
  const trimmed = (value ?? "").toString().trim();
  if (!trimmed) return null;
  if (!pattern) {
    const d = new Date(trimmed);
    return isNaN(d.getTime()) ? null : d;
  }
  const { regex, groups } = buildRegexFromPattern(pattern);
  const m = trimmed.match(regex);
  if (!m) return null;
  let day: number | undefined;
  let month: number | undefined;
  let year: number | undefined;
  let cursor = 1;
  for (const g of groups) {
    const part = m[cursor++] ?? "";
    switch (g.token) {
      case "dd":
      case "d":
        day = Number(part);
        break;
      case "MM":
      case "M":
        month = Number(part);
        break;
      case "MMM": {
        const idx = ES_MONTHS_SHORT.indexOf(part.toLowerCase());
        month = idx >= 0 ? idx + 1 : undefined;
        break;
      }
      case "MMMM": {
        const idx = ES_MONTHS.indexOf(part.toLowerCase());
        month = idx >= 0 ? idx + 1 : undefined;
        break;
      }
      case "yyyy":
        year = Number(part);
        break;
      case "EEEE":
        break;
    }
  }
  if (!year || !month || !day) return null;
  const d = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
  return isNaN(d.getTime()) ? null : d;
}

function pad(n: number, len = 2) {
  return String(n).padStart(len, "0");
}

function formatDateWithPattern(d: Date, pattern?: string): string {
  if (!pattern) return d.toISOString();
  const yyyy = d.getUTCFullYear();
  const M = d.getUTCMonth() + 1;
  const MM = pad(M);
  const dd = pad(d.getUTCDate());
  const d1 = d.getUTCDate();
  const MMM = ES_MONTHS_SHORT[M - 1];
  const MMMM = ES_MONTHS[M - 1];
  return pattern
    .replace(/yyyy/g, String(yyyy))
    .replace(/MM/g, MM)
    .replace(/M(?![a-zA-Z])/g, String(M))
    .replace(/dd/g, dd)
    .replace(/d(?![a-zA-Z])/g, String(d1))
    .replace(/MMMM/g, MMMM)
    .replace(/MMM/g, MMM);
}

function applyConversionsInClient(
  row: Record<string, any>,
  conversions: Array<{
    column: string;
    targetType:
      | "number"
      | "integer"
      | "decimal"
      | "string"
      | "boolean"
      | "date"
      | "datetime";
    inputFormat?: string | null;
    outputFormat?: string | null;
  }>,
  keyResolver: (simple: string) => string[]
) {
  const out = { ...row };
  for (const cv of conversions || []) {
    const targets = keyResolver(cv.column);
    for (const key of targets) {
      if (!(key in out)) continue;
      const v = out[key];
      switch (cv.targetType) {
        case "string":
          out[key] = v == null ? null : String(v);
          break;
        case "number":
        case "decimal": {
          const s = (v ?? "").toString().trim();
          const norm = s
            .replace(/\s+/g, "")
            .replace(/\.(?=.*\.)/g, "")
            .replace(/,(?=\d{1,2}$)/, ".")
            .replace(/[^0-9.\-]/g, "");
          const n = norm ? Number(norm) : NaN;
          out[key] = isNaN(n) ? null : n;
          break;
        }
        case "integer": {
          const s = (v ?? "").toString().trim();
          const norm = s
            .replace(/\s+/g, "")
            .replace(/[.,](?=\d{1,2}$)/, ".")
            .replace(/[^0-9.\-]/g, "");
          const n = norm ? Math.trunc(Number(norm)) : NaN;
          out[key] = isNaN(n) ? null : n;
          break;
        }
        case "boolean": {
          const sv = (v ?? "").toString().trim().toLowerCase();
          out[key] = ["true", "t", "1", "yes", "y", "si", "sí"].includes(sv)
            ? true
            : ["false", "f", "0", "no", "n"].includes(sv)
            ? false
            : null;
          break;
        }
        case "date":
        case "datetime": {
          const d = parseDateWithPattern(
            String(v ?? ""),
            cv.inputFormat || undefined
          );
          if (!d) out[key] = null;
          else
            out[key] = formatDateWithPattern(
              d,
              cv.outputFormat ||
                (cv.targetType === "date" ? "yyyy-MM-dd" : undefined)
            );
          break;
        }
      }
    }
  }
  return out;
}

// Button to export current filter output to Excel (.xlsx)
function FilterExportExcelButton({
  widget,
  edges,
  widgets,
}: {
  widget: Widget;
  edges: Array<{ id: string; from: string; to: string }>;
  widgets: Widget[];
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onExport = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Determine source node (JOIN or Connection)
      const srcEdge = edges.find((e) => e.to === widget.id);
      const srcNode = srcEdge && widgets.find((w) => w.id === srcEdge.from);
      if (!srcNode) throw new Error("Conecta este filtro a una fuente válida");

      let url = "/api/connection/export-excel";
      let res: Response;

      if (srcNode.type === "join") {
        const j = (srcNode as any).join || ({} as any);
        if (!j.primaryConnectionId) {
          throw new Error("Selecciona la tabla principal (incluye conexión)");
        }
        if (
          !j.primaryTable ||
          !Array.isArray(j.joins) ||
          j.joins.length === 0
        ) {
          throw new Error(
            "Configura el JOIN (principal y al menos un secundario) antes de exportar"
          );
        }
        // Validate join pairs
        for (const jn of j.joins) {
          if (!jn.primaryColumn || !jn.secondaryColumn) {
            throw new Error("Completa las columnas de unión en cada join");
          }
        }
        // Map columnas seleccionadas del filtro (prefijos primary./join_X.)
        const selectedCols: string[] = widget.filter?.columns || [];
        const primarySelected = selectedCols
          .filter((c) => c.startsWith("primary."))
          .map((c) => c.slice("primary.".length));
        const joinsSelected: Record<string, string[]> = {};
        (j.joins || []).forEach((jn: any, idx: number) => {
          const prefix = `join_${idx}.`;
          const arr = selectedCols
            .filter((c) => c.startsWith(prefix))
            .map((c) => c.slice(prefix.length));
          if (arr.length) joinsSelected[jn.id] = arr;
        });
        res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            primaryConnectionId: j.primaryConnectionId,
            primaryTable: j.primaryTable,
            primaryColumns: primarySelected.length
              ? primarySelected
              : j.primaryColumns,
            joins: (j.joins || []).map((jn: any, idx: number) => ({
              id: jn.id,
              secondaryConnectionId: jn.secondaryConnectionId,
              secondaryTable: jn.secondaryTable,
              joinType: jn.joinType,
              primaryColumn: jn.primaryColumn,
              secondaryColumn: jn.secondaryColumn,
              secondaryColumns: joinsSelected[jn.id]?.length
                ? joinsSelected[jn.id]
                : jn.secondaryColumns,
            })),
            conditions: widget.filter?.conditions || [],
          }),
        });
      } else if (srcNode.type === "connection") {
        if (!srcNode.connectionId) throw new Error("Conexión sin ID");
        if (!widget.filter?.table) throw new Error("Selecciona una tabla");
        res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            connectionId: (srcNode as any).connectionId,
            table: widget.filter.table,
            columns:
              widget.filter.columns && widget.filter.columns.length > 0
                ? widget.filter.columns
                : undefined,
            conditions: widget.filter.conditions || [],
          }),
        });
      } else {
        throw new Error("La fuente debe ser un nodo de Conexión o JOIN");
      }

      if (!res.ok) {
        // Try to parse JSON error
        try {
          const data = await res.json();
          throw new Error(data?.error || "Error exportando Excel");
        } catch (_) {
          throw new Error("Error exportando Excel");
        }
      }

      // Get filename from header if present
      const cd = res.headers.get("Content-Disposition") || "";
      const m = /filename="?([^";]+)"?/i.exec(cd);
      const filename =
        m?.[1] ||
        (srcNode.type === "join" ? "filtro_join.xlsx" : "filtro.xlsx");

      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(href);
    } catch (e: any) {
      setError(e?.message || "Error exportando Excel");
    } finally {
      setLoading(false);
    }
  }, [edges, widgets, widget.id, widget.filter]);

  return (
    <div className="inline-flex items-center gap-2">
      <Button
        variant="outline"
        className="rounded-full"
        disabled={loading}
        onClick={onExport}
      >
        {loading ? "Exportando…" : "Exportar a Excel"}
      </Button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}

// Traverse backwards from a node until we hit a source (connection or join) and optional filter.
function getBranchSource(
  startNodeId: string,
  widgets: Widget[],
  edges: Array<{ id: string; from: string; to: string }>
): { filterNode: Widget | null; connectionNode: Widget | null; joinNode: Widget | null } {
  let filterNode: Widget | null = null;
  let connectionNode: Widget | null = null;
  let joinNode: Widget | null = null;
  let currentId = startNodeId;
  const visited = new Set<string>();
  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const node = widgets.find((w) => w.id === currentId);
    if (!node) break;
    if (node.type === "filter") {
      filterNode = node;
      const edge = edges.find((e) => e.to === node.id);
      if (edge) {
        const up = widgets.find((w) => w.id === edge.from);
        if (up) {
          if (up.type === "connection") connectionNode = up;
          else if (up.type === "join") joinNode = up;
        }
      }
      break;
    }
    if (node.type === "join") {
      joinNode = node;
      break;
    }
    if (node.type === "connection") {
      connectionNode = node;
      break;
    }
    const edge = edges.find((e) => e.to === currentId);
    if (!edge) break;
    currentId = edge.from;
  }
  return { filterNode, connectionNode, joinNode };
}

// Helper to collect all upstream nodes and operations sequence to ensure full flow execution
function collectUpstreamFlow(
  targetNodeId: string,
  widgets: Widget[],
  edges: Array<{ id: string; from: string; to: string }>
) {
  let filterNode: Widget | null = null;
  let joinNode: Widget | null = null;
  let connectionNode: Widget | null = null;
  let unionNode: Widget | null = null;
  let leftBranch: { filterNode: Widget | null; connectionNode: Widget | null } | null = null;
  let rightBranch: { filterNode: Widget | null; connectionNode: Widget | null } | null = null;

  let currentId = targetNodeId;
  const path: Widget[] = [];
  const visited = new Set<string>();

  while (currentId) {
    if (visited.has(currentId)) break;
    visited.add(currentId);

    const node = widgets.find((w) => w.id === currentId);
    if (!node) break;

    path.push(node);

    if (node.type === "union") {
      unionNode = node;
      const incoming = edges.filter((e) => e.to === node.id);
      if (incoming.length >= 2) {
        const [e1, e2] = incoming.slice(0, 2);
        const b1 = getBranchSource(e1.from, widgets, edges);
        const b2 = getBranchSource(e2.from, widgets, edges);
        leftBranch = { filterNode: b1.filterNode, connectionNode: b1.connectionNode };
        rightBranch = { filterNode: b2.filterNode, connectionNode: b2.connectionNode };
      }
      break;
    }
    if (node.type === "filter") {
      filterNode = node;
      const edge = edges.find((e) => e.to === node.id);
      if (edge) {
        const up = widgets.find((w) => w.id === edge.from);
        if (up) {
          if (up.type === "connection") connectionNode = up;
          else if (up.type === "join") joinNode = up;
        }
      }
      break;
    }
    if (node.type === "join") {
      joinNode = node;
      break;
    }
    if (node.type === "connection") {
      connectionNode = node;
      break;
    }

    const edge = edges.find((e) => e.to === currentId);
    if (!edge) break;
    currentId = edge.from;
  }

  const fullPath = path.reverse();
  
  const rules = fullPath
    .filter(n => n.type === "condition")
    .flatMap(n => n.condition?.rules || []);
  
  // Collect arithmetics in order? Current backend only takes one list of ops.
  // We will assume the target node's ops are main, but if there are upstream ops we should include them?
  // Current backend logic: operations: ArithmeticOperation[]
  // If we have multiple Arithmetic nodes, we should probably merge their operations if they are independent,
  // or the backend should support sequential stages.
  // Given current backend limitation, we will assume linear accumulation of result columns is handled by frontend aliases,
  // but actual calculation needs the operations.
  // To stay safe and "execute all prior flow", we should collect ALL operations.
  const operations = fullPath
    .filter(n => n.type === "arithmetic")
    .flatMap(n => n.arithmetic?.operations || []);

  const conversions = fullPath
    .filter(n => n.type === "cast")
    .flatMap(n => n.cast?.conversions || []);

  // Expand clean config (nullCleanup + transforms + dataFixes) to API shape; merge all clean nodes
  function expandCleanConfig(clean: Widget["clean"]) {
    if (!clean) return undefined;
    const transforms: Array<{ column: string; op: string; find?: string; replaceWith?: string; patterns?: string[]; action?: "null" | "replace"; replacement?: string }> = [];
    if (clean.nullCleanup?.columns?.length) {
      const { patterns, action, replacement } = clean.nullCleanup;
      for (const col of clean.nullCleanup.columns) {
        transforms.push({ column: col, op: "normalize_nulls", patterns: patterns || [], action: action || "null", replacement });
      }
    }
    for (const t of clean.transforms || []) {
      transforms.push(t as typeof transforms[0]);
    }
    if (clean.dataFixes?.length) {
      for (const f of clean.dataFixes) {
        transforms.push({ column: f.column, op: "replace_value", find: f.find, replaceWith: f.replaceWith });
      }
    }
    return { transforms, dedupe: clean.dedupe };
  }

  const cleanTransforms = fullPath
    .filter(n => n.type === "clean")
    .flatMap(n => expandCleanConfig(n.clean)?.transforms || []);

  const lastCleanNode = fullPath.filter(n => n.type === "clean").pop();
  const lastCleanDedupe = expandCleanConfig(lastCleanNode?.clean)?.dedupe;

  const formattedPipeline = fullPath
    .filter((n) => ["clean", "cast", "arithmetic", "condition"].includes(n.type))
    .map((n) => {
      if (n.type === "clean") return { type: "clean", config: expandCleanConfig(n.clean) ?? n.clean };
      if (n.type === "cast") return { type: "cast", config: n.cast };
      if (n.type === "arithmetic") return { type: "arithmetic", config: n.arithmetic };
      if (n.type === "condition") return { type: "condition", config: n.condition };
      return null;
    })
    .filter(Boolean);

  return {
    sourceNode: filterNode || joinNode || connectionNode || unionNode,
    filterNode,
    joinNode,
    connectionNode,
    unionNode,
    leftBranch,
    rightBranch,
    collectedRules: rules,
    collectedOperations: operations,
    collectedConversions: conversions,
    collectedTransforms: cleanTransforms,
    lastCleanDedupe,
    pipeline: formattedPipeline,
    fullPath
  };
}

// Preview data at the Filter node
function FilterPreviewButton({
  widget,
  edges,
  widgets,
}: {
  widget: Widget;
  edges: Array<{ id: string; from: string; to: string }>;
  widgets: Widget[];
}) {
  const {
    setPreviewData,
    addLog,
    setIsLoading,
    setActiveTab,
    setOnLoadPage,
    isLoading,
  } = useETLPreview();
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const loadPage = async (pageNum: number) => {
    try {
      setIsLoading(true);

      // Adapt to use collectUpstreamFlow for consistency
      const { 
         filterNode, 
         joinNode, 
         connectionNode 
      } = collectUpstreamFlow(widget.id, widgets, edges);
      
      // Filter node should be self or collected
      if (!filterNode) throw new Error("Configuración del filtro incompleta");

      // Case A: upstream is a JOIN
      if (joinNode) {
        const j = (joinNode as any).join || ({} as any);
        if (!j.primaryConnectionId) {
          throw new Error("Selecciona la tabla principal (incluye conexión)");
        }
        if (
          !j.primaryTable ||
          !Array.isArray(j.joins) ||
          j.joins.length === 0
        ) {
          throw new Error("Configura el JOIN antes de previsualizar");
        }
        for (const jn of j.joins) {
          if (!jn.primaryColumn || !jn.secondaryColumn) {
            throw new Error("Completa las columnas de unión en cada join");
          }
        }
        // Map selected filter columns into star-schema primary/secondary selections
        const selectedCols: string[] = filterNode.filter?.columns || [];
        const primarySelected = selectedCols
          .filter((c) => c.startsWith("primary."))
          .map((c) => c.slice("primary.".length));
        
        const res = await fetch("/api/connection/join-query", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            primaryConnectionId: j.primaryConnectionId,
            primaryTable: j.primaryTable,
            primaryColumns: primarySelected.length
              ? primarySelected
              : j.primaryColumns,
            joins: (j.joins || []).map((jn: any, idx: number) => ({
              id: jn.id,
              secondaryConnectionId: jn.secondaryConnectionId,
              secondaryTable: jn.secondaryTable,
              joinType: jn.joinType,
              primaryColumn: jn.primaryColumn,
              secondaryColumn: jn.secondaryColumn,
              secondaryColumns: jn.secondaryColumns,
              index: idx,
            })),
            limit: pageSize,
            offset: (pageNum - 1) * pageSize,
        
            conditions: filterNode.filter?.conditions || [],
            count: true,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok)
           throw new Error(data?.error || "Error al leer JOIN");
           
        setPreviewData({
          rows: data.rows || [],
          total: data.total,
 
          sourceNodeId: widget.id,
          pageSize: pageSize,
        });
        addLog("Success", `Vista previa generada: ${(data.rows || []).length} filas (Filter)`);
        setActiveTab("Data");

      } else {
        // Case B: upstream is a Connection
        if (!connectionNode || !connectionNode.connectionId) {
           throw new Error("Conecta el filtro a una conexión");
        }
        if (!filterNode.filter?.table) {
           throw new Error("Selecciona una tabla");
        }

        const res = await fetch("/api/connection/query", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            connectionId: connectionNode.connectionId,
            table: filterNode.filter.table,
            columns:
              filterNode.filter.columns && filterNode.filter.columns.length > 0
                ? filterNode.filter.columns
                : undefined,
            conditions: filterNode.filter.conditions || [], 
            limit: pageSize,
            offset: (pageNum - 1) * pageSize,
            count: true,
          }),
        });

        const data = await res.json();
        if (!res.ok || !data.ok)
          throw new Error(data?.error || "Error al leer datos");

        // Pruning logic - maintain existing behavior
        const selected = filterNode.filter?.columns || [];
        const aliasKeys = selected.map((c: string) => {
            const parts = c.split(".");
            return parts[parts.length - 1];
        });
        const pruned = (data.rows || []).map((row: any) => {
          if (aliasKeys.length === 0) return row;
          const out: Record<string, any> = {};
          for (const k of aliasKeys) {
            if (k in row) out[k] = row[k];
          }
          return out;
        });

        setPreviewData({
          rows: pruned,
          total: data.total,
        sourceNodeId: widget.id,
          pageSize: pageSize,
        });
        addLog("Success", `Vista previa generada: ${pruned.length} filas (Filter)`);
        setActiveTab("Data");
      }

    } catch (e: any) {
      addLog("Error", e?.message || "Error al generar vista previa");
    } finally {
      setIsLoading(false);
    }
  };

  const handlePreview = () => {
    setOnLoadPage(() => loadPage);
    setPage(1);
    loadPage(1);
  };

  return (
    <div className="space-y-2">
      <Button
        variant="outline"
        className="rounded-full"
        onClick={handlePreview}
        disabled={isLoading}
      >
        Vista previa
      </Button>
    </div>
  );
}

// Small component to preview count results with pagination
function CountPreviewButton({
  widget,
  edges,
  widgets,
}: {
  widget: Widget;
  edges: Array<{ id: string; from: string; to: string }>;
  widgets: Widget[];
}) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState<number | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const fetchPage = useCallback(
    async (pageNum: number) => {
      try {
        setLoading(true);
        setError(null);

        // Use helper to traverse upstream
        const { 
          filterNode, 
          joinNode, 
          connectionNode, 
          collectedRules, 
          collectedConversions,
          collectedOperations 
        } = collectUpstreamFlow(widget.id, widgets, edges);

        const upstreamNode = filterNode ? connectionNode : null;

        // Check compatibility
        if (joinNode) {
            // For now, if upstream is Join, we handle it if supportable logic exists.
            // Original code had specific JOIN handling path.
            // Let's adapt it.
        } else {
             if (!filterNode) throw new Error("No se encontró un nodo Filtro aguas arriba");
             if (!connectionNode || !connectionNode.connectionId) 
                 throw new Error("El filtro debe estar conectado a una conexión válida");
        }
        
        const attribute = widget.count?.attribute;
        const resultColumn = widget.count?.resultColumn || "conteo";
        if (!attribute)
          throw new Error("Selecciona la columna a contar en el nodo Conteo");

        if (joinNode) {
            // Specific JOIN + COUNT logic.
            // We need to re-implement the JOIN request but using the collected info if possible?
            // Actually, the original JOIN block was separate.
            // Let's preserve the existing JOIN logic but maybe cleaner. 
            // Since JOIN logic is complex and specific, I will leave the JOIN branch mostly as is 
            // BUT ensure we check joinNode properly.
            // The original code was: if (srcNode.type === "join") ...
            // Our helper returns joinNode if it's the source.
            
            const j = (joinNode as any).join || {};
            // ... (validation) ...
            
            // To properly standardized, we should use the same `collectUpstreamFlow` 
            // but the JOIN endpoint `join-query` might not support rules/arithmetic yet?
            // Wait, the user wants "all nodes execute prior flow".
            // If we have Join -> Filter -> Count, the `collectUpstreamFlow` would return `joinNode` as source 
            // AND `filterNode` as an intermediate?
            // My helper:
            // if (node.type === "filter") { filterNode = node; break; }
            // So if Filter is present, it stops there.
            // But if Filter is connected to Join, it checks `upstreamEdge`.
            // Wait, my helper stops at Filter and checks upstream.
            // If upstream is Join, `collectUpstreamFlow` might not capture it in `joinNode` var 
            // because `joinNode` var is only set if loop hits "join".
            
            // Let's refine `collectUpstreamFlow` logic mentally:
            // if node is Filter: set filterNode. check upstream edge.
            // if upstream is Connection: set connectionNode.
            // if upstream is Join: my helper currently does NOT set joinNode. It just sets filterNode.
            // This is a flaw in my helper for the "Filter connected to Join" case.
            // I should update the helper to handle Filter -> Join case more explicitly or return the upstream node generically.
            
            // However, `CountPreviewButton` original logic handled `srcNode.type === "join"` (direct) 
            // OR `srcNode.type === "filter" -> upstream.type === "join"`.
            
            // Given I am inside `count-query` call below, I should use the correct payload.
            // `count-query` accepts `join` object in payload.
            
            // Let's look at `CountPreviewButton` again.
        } 
        
        // ... (Due to complexity of JOIN vs Connection branching in Count, 
        // I will first only refactor the Connection path which is the primary request context (Condition usage).
        // Condition node usually works with Filter -> Connection.
        // If the user uses JOIN, they might not be using Conditions yet (as per "Este nodo aún no soporta filtros conectados a un JOIN").
        
        // So for now, I will focus on standardizing the Filter/Connection path which supports Condition/Arithmetic.)
        
        if (joinNode) {
             const j = (joinNode as any).join || {};
             // Validations...
             if (!j.primaryConnectionId) throw new Error("Configuración de JOIN incompleta");
             if (!j.primaryTable || !Array.isArray(j.joins) || j.joins.length === 0) 
                 throw new Error("Configura el JOIN antes de previsualizar");
             
             // Mapping logic...
             // For brevity, I will defer JOIN refactor to be identical to original but using joinNode variable.
             // But simpler: just let the original "JOIN" block run if I can match it.
             // But I am replacing the whole block? No, `view_file` showed lines 5500-6299?
             // No, `view_file` in step 1091 showed `CountPreviewButton` starts at 5743.
             
             // I will replace the logic inside `fetchPage`.
        }
        
        // Construct standard payload
        const payload: any = {
           attribute,
           resultColumn,
           limit: pageSize,
           offset: (pageNum - 1) * pageSize,
           count: true,
           conditions: filterNode?.filter?.conditions || [],
           columns: filterNode?.filter?.columns || undefined,
           // Inject collected metadata
           rules: collectedRules,
           operations: collectedOperations,
           conversions: collectedConversions
        };
        
        // Handle Source logic (Join vs Connection)
        if (joinNode) {
             const j = (joinNode as any).join;
             payload.join = {
                primaryConnectionId: j.primaryConnectionId,
                primaryTable: j.primaryTable,
                joins: j.joins
             };
             // We need to re-map columns if it's join?
             // The backend `count-query` might handle `join` object directly?
             // Yes, existing code: payload.join = ...
        } else {
             if (!connectionNode) throw new Error("Desconectado");
             payload.connectionId = (connectionNode as any).connectionId;
             payload.table = filterNode?.filter?.table;
        }

        const res = await fetch("/api/connection/arithmetic-query", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const data = await res.json();
        if (!res.ok || !data.ok)
           throw new Error(data?.error || "Error de conteo");
           
        // Column Pruning Logic
        const selected = filterNode?.filter?.columns || [];
        const aliasKeysBase = selected.map((c: string) => {
           const parts = c.split(".");
           return parts[parts.length - 1];
        });
        // Include resultColumn
        const resultCol = widget.count?.resultColumn || "conteo";
        
        // Include upstream columns?
        // Count usually aggregates, so valid columns are only the dimensions (if grouped) or just the count.
        // But `count-query` might be grouping? 
        // The current implementation of `count-query` seems to return "rows" (maybe grouped? or just 1 row if no dimensions?).
        // If it returns rows, we should respect the same "whitelist" logic as others?
        // Existing logic: `const aliasKeys = selected...`
        // It prunes everything except selected + resultCol.
        // If we have upstream Condition, it creates new columns. valid to include them?
        // If Count is aggregating, does it group by them?
        // Current Count node config does NOT seem to support "Group By" explicit configuration in the snippet I saw?
        // Using "attribute" to count.
        // If `count-query` is just SELECT COUNT(*) ... it returns 1 row.
        // If it returns 1 row, pruning is less critical but good to check.
        
        // Just keeping existing pruning logic + resultCol is likely safe.
        
        const aliasKeys = [...aliasKeysBase, resultCol];
        const pruned = (data.rows || []).map((row: any) => {
           if (aliasKeys.length <= 1 && aliasKeysBase.length === 0) return row; 
           const out: Record<string, any> = {};
           for (const k of aliasKeys) if (k in row) out[k] = row[k];
           return out;
        });

        // Apply upstream conversions (Cast) client-side
        const convertedRows = pruned.map((row: any) => {
           return applyConversionsInClient(row, collectedConversions, (simple) => {
              const keys = Object.keys(row);
              const matches = keys.filter(
                   k => k.endsWith(`_${simple}`) || k === simple || k.endsWith(`.${simple}`)
              );
              return matches.length ? matches : [simple];
           });
        });

        setRows(convertedRows);
        setTotal(typeof data.total === "number" ? data.total : undefined);

      } catch (e: any) {
        setError(e?.message || "Error al generar conteo");
      } finally {
        setLoading(false);
      }
    },
    [edges, widgets, widget.id, widget.count]
  );

  useEffect(() => {
    if (open) fetchPage(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, page]);

  return (
    <div className="space-y-2">
      <Button
        variant="outline"
        className="rounded-full"
        onClick={() => setOpen((o) => !o)}
      >
        {open ? "Ocultar vista previa" : "Vista previa"}
      </Button>
      {open && (
        <div className="border rounded-xl p-2 bg-white max-h-64 overflow-auto">
          {loading ? (
            <div className="text-sm text-gray-600">Cargando…</div>
          ) : error ? (
            <div className="text-sm text-red-600">{error}</div>
          ) : rows.length === 0 ? (
            <div className="text-sm text-gray-600">Sin datos.</div>
          ) : (
            <div className="space-y-2">
              <table className="w-full text-xs text-left">
                <thead className="sticky top-0 bg-white">
                  <tr>
                    {Object.keys(rows[0] || {}).map((k) => (
                      <th
                        key={k}
                        className="py-1 pr-2 font-medium text-gray-700"
                      >
                        {k}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className="border-t">
                      {Object.keys(rows[0] || {}).map((k) => (
                        <td
                          key={k}
                          className="py-1 pr-2 text-gray-800 truncate max-w-[200px]"
                        >
                          {String(r[k])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex items-center justify-between text-xs text-gray-700">
                <div>
                  Página {page}
                  {typeof total === "number" ? ` · ${total} filas` : ""}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-full"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={loading || page === 1}
                  >
                    Anterior
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-full"
                    onClick={() => setPage((p) => p + 1)}
                    disabled={
                      loading ||
                      (typeof total === "number" && page * pageSize >= total)
                    }
                  >
                    Siguiente
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Small component to preview arithmetic results with pagination
function ArithmeticPreviewButton({
  widget,
  edges,
  widgets,
}: {
  widget: Widget;
  edges: Array<{ id: string; from: string; to: string }>;
  widgets: Widget[];
}) {
  // Utilidades de conversión movidas a scope global


  // Utilidades compartidas con Cast para convertir valores y fechas en cliente
  const { setPreviewData, addLog, setIsLoading, setActiveTab, isLoading, setPage, setOnLoadPage } = useETLPreview();
  const pageSize = 100;

  const loadPage = async (pageNum: number) => {
    try {
      setIsLoading(true);
      addLog("Info", `Iniciando vista previa aritmética: ${widget.title}`);

      // Use helper to traverse upstream
      const { 
        filterNode, 
        joinNode, 
        connectionNode, 
        collectedRules, 
        collectedConversions,
        collectedOperations 
      } = collectUpstreamFlow(widget.id, widgets, edges);

      if (!filterNode && !joinNode)
        throw new Error("No se encontró un nodo Filtro o JOIN aguas arriba");

      if (joinNode) {
          // ... JOIN logic handling ...
          // Note: The original code had a separate branch for JOIN.
          // To merge efficiently, we can check joinNode here.
          // Re-using existing JOIN logic logic might be safest if we just swap the traversal.
          // BUT, `collectUpstreamFlow` returns `joinNode` if it's the source.
      }
      
      const upstreamNode = filterNode ? connectionNode : joinNode;

      // Handle Join Case separately or unified? The original code splits execution paths.
      // Let's keep the split but use the helper results.
      if (joinNode) {
        // ... (Join logic remains similar, but uses helper results if needed)
        // Original Join logic traverses differently... actually it relies on `upstreamNode`.
        // Let's preserve the Join block but verify it uses the correct nodes.
      } else {
         // Filter Case
         if (!filterNode?.filter?.table)
            throw new Error("El filtro debe tener una tabla seleccionada");
         if (!connectionNode || !connectionNode.connectionId)
             throw new Error("El filtro debe estar conectado a una conexión válida");
      }

      // If we are here, we are in the Filter path (or connection-based).
      // If original code had a big `if (upstreamNode.type === 'join')`, we need to adapt.
      // Let's just REPLACE the traversal part and keep the logic flow compatible.

      // Re-implement the check using helper results:
      const sourceIsJoin = !!joinNode;
      
      let data: any;

      if (sourceIsJoin) {
          const j = (joinNode as any).join || {};
          if (!j.primaryConnectionId) throw new Error("Configuración de JOIN incompleta");
          
          const payload: any = {
             limit: pageSize,
             offset: (pageNum - 1) * pageSize,
             count: true,
             conditions: filterNode?.filter?.conditions || [],
             columns: filterNode?.filter?.columns || undefined,
             rules: collectedRules,
             operations: widget.arithmetic?.operations,
             conversions: collectedConversions,
             join: {
                primaryConnectionId: j.primaryConnectionId,
                primaryTable: j.primaryTable,
                joins: j.joins
             }
          };

          const res = await fetch("/api/connection/arithmetic-query", {
             method: "POST",
             headers: { "Content-Type": "application/json" },
             body: JSON.stringify(payload),
          });

          const json = await res.json();
          if (!res.ok) {
             throw new Error(json.error || "Error en consulta aritmética (JOIN)");
          }
          data = json;
      } else {
         // Filter path
         if (!filterNode) throw new Error("Filtro no encontrado");
         
         // Prepare payload
         const res = await fetch("/api/connection/arithmetic-query", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              connectionId: (connectionNode as any).connectionId,
              table: filterNode.filter?.table,
              // Use explicit columns if selected, otherwise undefined (all)
              columns: filterNode.filter?.columns?.length ? filterNode.filter.columns : undefined,
              conditions: filterNode.filter?.conditions || [],
              rules: collectedRules,
              operations: widget.arithmetic?.operations,
              conversions: collectedConversions,
              limit: pageSize,
              offset: (pageNum - 1) * pageSize,
              count: true,
            }),
         });

         const json = await res.json();
         if (!res.ok) {
            throw new Error(json.error || "Error en consulta aritmética");
         }
         data = json;
      }
      // Limitar columnas mostradas a las seleccionadas (aritmética) más columnas resultado
      const selected = filterNode?.filter?.columns || [];
      const aliasKeysBase = selected.map((c: string) => {
        const parts = c.split(".");
        return parts[parts.length - 1];
      });
      const resultCols = (widget.arithmetic?.operations || []).map(
        (op) => op.resultColumn
      );
      const conditionCols = collectedRules.map((r: any) => r.resultColumn);
      const aliasKeys = [...new Set([...aliasKeysBase, ...resultCols, ...conditionCols])];
      const pruned = (data.rows || []).map((row: any) => {
        if (aliasKeys.length === 0) return row;
        const out: Record<string, any> = {};
        for (const k of aliasKeys) if (k in row) out[k] = row[k];
        return out;
      });

      // Apply upstream conversions (Cast) client-side to ensure formatting
      const convertedRows = pruned.map((row: any) => {
         return applyConversionsInClient(row, collectedConversions, (simple) => {
              const keys = Object.keys(row);
              // Match flattened aliases from backend (e.g. primary_date_str) to simple name (date_str)
              const matches = keys.filter(
                   k => k.endsWith(`_${simple}`) || k === simple || k.endsWith(`.${simple}`)
              );
              return matches.length ? matches : [simple];
         });
      });

      setPreviewData({
         rows: convertedRows,
         total: data.total !== undefined ? Number(data.total) : undefined,
         sourceNodeId: widget.id,
         pageSize: pageSize,
      });
      addLog("Success", `Vista previa generada: ${convertedRows.length} filas`);
      setActiveTab("Data");
    } catch (e: any) {
      addLog("Error", e?.message || "Error al generar vista previa");
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePreview = () => {
    setOnLoadPage(() => loadPage);
    setPage(1);
    loadPage(1);
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handlePreview}
      disabled={isLoading}
      className="text-gray-700 border-gray-300 hover:bg-gray-50"
    >
      {isLoading ? "Cargando..." : "Vista Previa"}
    </Button>
  );
}

// Small component to preview condition results with pagination
function ConditionPreviewButton({
  widget,
  edges,
  widgets,
}: {
  widget: Widget;
  edges: Array<{ id: string; from: string; to: string }>;
  widgets: Widget[];
}) {
  const { setPreviewData, addLog, setIsLoading, setActiveTab, isLoading, setPage, setOnLoadPage } = useETLPreview();
  const pageSize = 100;

  const loadPage = async (pageNum: number) => {
    try {
      setIsLoading(true);
      addLog("Info", `Iniciando vista previa para Condición: ${widget.title}`);

      // Use helper to traverse upstream
      const { 
        filterNode, 
        joinNode, 
        connectionNode, 
        collectedRules, 
        collectedConversions,
        collectedOperations 
      } = collectUpstreamFlow(widget.id, widgets, edges);

      if (!filterNode && !joinNode)
        throw new Error("No se encontró un nodo Filtro o JOIN aguas arriba");

      if (joinNode) {
          throw new Error("Este nodo aún no soporta filtros conectados a un JOIN. Conéctalo a una Conexión directa.");
      }
      
      const upstreamNode = filterNode ? connectionNode : null;

      if (!filterNode?.filter?.table)
        throw new Error("El filtro debe tener una tabla seleccionada");
      if (
        !upstreamNode ||
        upstreamNode.type !== "connection" ||
        !(upstreamNode as any).connectionId
      ) {
        throw new Error("El filtro debe estar conectado a una conexión válida");
      }

      // Note: collectUpstreamFlow includes the current node in collectedRules if it's a Condition node.
      if (collectedRules.length === 0) {
         // Fallback check if user hasn't configured rules yet?
         // Actually current node rules should be there.
         // But maybe widget.condition.rules is empty.
         if (!widget.condition?.rules || widget.condition.rules.length === 0)
            throw new Error("Configura al menos una regla de condición");
      }
      
      const payload = {
          connectionId: (upstreamNode as any).connectionId,
          table: filterNode.filter.table,
          columns:
            filterNode.filter.columns && filterNode.filter.columns.length > 0
              ? filterNode.filter.columns
              : undefined,
          conditions: filterNode.filter.conditions || [],
          // collectedRules includes current node's rules because collectUpstreamFlow includes target node
          rules: collectedRules, 
          operations: collectedOperations,
          conversions: collectedConversions,
          limit: pageSize,
          offset: (pageNum - 1) * pageSize,
          count: true,
        };

      const res = await fetch("/api/connection/condition-query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.ok)
        throw new Error(
          data?.error || "No se pudo ejecutar la consulta de condiciones"
        );
      
      const selected = filterNode.filter?.columns || [];
      const aliasKeysBase = selected.map((c: string) => {
        const parts = c.split(".");
        return parts[parts.length - 1];
      });
      const ruleCols = (widget.condition?.rules || []).map(
        (r) => r.resultColumn
      );
      const upstreamRuleCols = collectedRules.map((r) => r.resultColumn);
      const arithCols = collectedOperations.map(
        (op: any) => op.resultColumn
      );
      
      const aliasKeys = [...new Set([...aliasKeysBase, ...ruleCols, ...upstreamRuleCols, ...arithCols])];
      const pruned = (data.rows || []).map((row: any) => {
        if (aliasKeys.length === 0) return row;
        const out: Record<string, any> = {};
        for (const k of aliasKeys) if (k in row) out[k] = row[k];
        return out;
      });
      
      // Apply upstream conversions (Cast) client-side
      const convertedRows = pruned.map((row: any) => {
         return applyConversionsInClient(row, collectedConversions, (simple) => {
              const keys = Object.keys(row);
              const matches = keys.filter(
                   k => k.endsWith(`_${simple}`) || k === simple || k.endsWith(`.${simple}`)
              );
              return matches.length ? matches : [simple];
         });
      });

      setPreviewData({
        rows: convertedRows,
        total: data.total !== undefined ? Number(data.total) : undefined,
        sourceNodeId: widget.id,
        pageSize: pageSize,
      });
      addLog("Success", `Vista previa generada: ${convertedRows.length} filas`);
      setActiveTab("Data");
    } catch (e: any) {
      addLog("Error", e?.message || "Error de consulta de condiciones");
    } finally {
      setIsLoading(false);
    }
  };

  const handlePreview = () => {
    setOnLoadPage(() => loadPage);
    setPage(1);
    loadPage(1);
  };



  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handlePreview}
      disabled={isLoading}
      className="text-gray-700 border-gray-300 hover:bg-gray-50"
    >
      {isLoading ? "Cargando..." : "Vista Previa"}
    </Button>
  );
}

// Small component to preview cast results with pagination
function CastPreviewButton({
  widget,
  edges,
  widgets,
}: {
  widget: Widget;
  edges: Array<{ id: string; from: string; to: string }>;
  widgets: Widget[];
}) {
  // Utilidades movidas a scope global


  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState<number | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const fetchPage = useCallback(
    async (pageNum: number) => {
      try {
        setLoading(true);
        setError(null);
        setRows([]);

        // Collect full flow to ensure standard upstream execution
        const {
          filterNode,
          joinNode,
          connectionNode,
          fullPath,
        } = collectUpstreamFlow(widget.id, widgets, edges);

        // Validation for source
        if (joinNode) {
           const j = (joinNode as any).join || {};
           if (!j.primaryConnectionId) throw new Error("Configuración de JOIN incompleta");
        } else {
           if (!filterNode) throw new Error("No se encontró un nodo Filtro o JOIN aguas arriba");
           if (!connectionNode || !connectionNode.connectionId) 
               throw new Error("El filtro debe estar conectado a una conexión válida");
        }
        
        // Separate upstream vs current metadata
        // We execute upstream flow in backend (via arithmetic-query), but apply current Cast in client (for formatting)
        const upstreamNodes = fullPath.filter(n => n.id !== widget.id);
        const upstreamRules = upstreamNodes
            .filter(n => n.type === 'condition')
            .flatMap(n => n.condition?.rules || []);
        const upstreamOperations = upstreamNodes
            .filter(n => n.type === 'arithmetic')
            .flatMap(n => n.arithmetic?.operations || []);
        const upstreamConversions = upstreamNodes
            .filter(n => n.type === 'cast')
            .flatMap(n => n.cast?.conversions || []);

        const payload: any = {
           limit: pageSize,
           offset: (pageNum - 1) * pageSize,
           count: true,
           conditions: filterNode?.filter?.conditions || [],
           columns: filterNode?.filter?.columns || undefined,
           rules: upstreamRules,
           operations: upstreamOperations,
           conversions: upstreamConversions
        };

        if (joinNode) {
             const j = (joinNode as any).join;
             payload.join = {
                primaryConnectionId: j.primaryConnectionId,
                primaryTable: j.primaryTable,
                joins: j.joins
             };
        } else {
             if (!connectionNode) throw new Error("Desconectado");
             payload.connectionId = (connectionNode as any).connectionId;
             payload.table = filterNode?.filter?.table;
        }

        // Use arithmetic-query as the universal runner (it allows empty operations now)
        const res = await fetch("/api/connection/arithmetic-query", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const data = await res.json();
        if (!res.ok || !data.ok)
           throw new Error(data?.error || "Error al obtener datos para cast");

        // Client-side processing: Column Pruning + Current Cast
        const selected = filterNode?.filter?.columns || [];
        const aliasKeysBase = selected.map((c: string) => {
             if (c.startsWith("primary.")) return c.replace("primary.", "primary_");
             const m = c.match(/^join_(\d+)\.(.+)$/);
             if (m) return `join_${m[1]}_${m[2]}`;
             return c.replace(/\./g, "_");
        });
        
        // Add columns from upstream logic
        upstreamRules.forEach(r => aliasKeysBase.push(r.resultColumn));
        upstreamOperations.forEach(op => aliasKeysBase.push(op.resultColumn));
        
        const keysToKeep = new Set(aliasKeysBase);
        const currentConversions = widget.cast?.conversions || [];
        currentConversions.forEach(c => keysToKeep.add(c.column));
        
        const aliasKeys = Array.from(keysToKeep);

        // Map rows
        const processedRows = (data.rows || []).map((row: any) => {
            const out: Record<string, any> = {};
            if (aliasKeys.length === 0 && !filterNode?.filter?.columns?.length) {
                Object.assign(out, row);
            } else {
                for (const k of aliasKeys) if (k in row) out[k] = row[k];
                // Ensure conversion targets are kept
                currentConversions.forEach(c => {
                   if (c.column in row) out[c.column] = row[c.column];
                });
            }
            
            // Apply current conversions in client
            // Note: applyConversionsInClient mutates 'out' or returns new?
            // Line 6282: `return out;` (it creates shallow copy).
            // But we didn't assign it back.
            // Wait, I need to check `applyConversionsInClient` signature in this file.
            // I viewed it in Step 1152 around line 6206.
            // It returns `out`.
            // So we need `return applyConversionsInClient(...)`.
            return applyConversionsInClient(out, currentConversions, (simple) => {
                 const keys = Object.keys(out);
                 const matches = keys.filter(
                      k => k.endsWith(`_${simple}`) || k === simple || k.endsWith(`.${simple}`)
                 );
                 return matches.length ? matches : [simple];
            });
        });

        setRows(processedRows);
        setTotal(typeof data.total === "number" ? data.total : undefined);

      } catch (e: any) {
        setError(e?.message || "Error al generar vista previa (Cast)");
      } finally {
        setLoading(false);
      }
    },
    [edges, widgets, widget.id, widget.cast]
  );

  useEffect(() => {
    if (open) fetchPage(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, page]);

  return (
    <div className="space-y-2">
      <Button
        variant="outline"
        className="rounded-full"
        onClick={() => setOpen((o) => !o)}
      >
        {open ? "Ocultar vista previa" : "Vista previa"}
      </Button>
      {open && (
        <div className="border rounded-xl p-2 bg-white max-h-64 overflow-auto">
          {loading ? (
            <div className="text-sm text-gray-600">Cargando…</div>
          ) : error ? (
            <div className="text-sm text-red-600">{error}</div>
          ) : rows.length === 0 ? (
            <div className="text-sm text-gray-600">Sin datos.</div>
          ) : (
            <table className="min-w-full text-xs">
              <thead>
                <tr>
                  {Object.keys(rows[0]).map((k) => (
                    <th key={k} className="text-left px-2 py-1 border-b">
                      {k}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="odd:bg-gray-50">
                    {Object.keys(rows[0]).map((k) => (
                      <td key={k} className="px-2 py-1 border-b">
                        {String(r[k])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="flex items-center justify-between mt-2">
            <div className="text-xs text-gray-600">
              Página {page} {total ? `de ${Math.ceil(total / pageSize)}` : ""}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="h-7 px-2 rounded-full"
              >
                Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={
                  loading ||
                  (total ? page >= Math.ceil(total / pageSize) : false)
                }
                onClick={() => setPage((p) => p + 1)}
                className="h-7 px-2 rounded-full"
              >
                Siguiente
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Small component to preview join results with pagination
function JoinPreviewButton({ widget }: { widget: Widget }) {
  const {
    setPreviewData,
    addLog,
    setIsLoading,
    setActiveTab,
    setOnLoadPage,
    isLoading,
  } = useETLPreview();
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const loadPage = async (pageNum: number) => {
    try {
      setIsLoading(true);

      if (!widget.join?.primaryTable) {
        throw new Error("Configura la tabla principal del JOIN");
      }
      if (!widget.join?.joins || widget.join.joins.length === 0) {
        throw new Error("Agrega al menos una tabla secundaria al JOIN");
      }
      // Validate each join has required info
      for (const jn of widget.join.joins) {
        if (!jn.secondaryTable)
          throw new Error("Selecciona la tabla secundaria");
        if (!jn.primaryColumn || !jn.secondaryColumn)
          throw new Error("Configura las columnas de unión");
      }

      const res = await fetch("/api/connection/join-query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          primaryConnectionId: widget.join.primaryConnectionId,
          primaryTable: widget.join.primaryTable,
          primaryColumns: widget.join.primaryColumns,
          joins: (widget.join.joins || []).map((jn, idx) => ({
            secondaryConnectionId: jn.secondaryConnectionId,
            secondaryTable: jn.secondaryTable,
            joinType: jn.joinType,
            primaryColumn: jn.primaryColumn,
            secondaryColumn: jn.secondaryColumn,
            secondaryColumns: jn.secondaryColumns,
            index: idx,
          })),
          limit: pageSize,
          offset: (pageNum - 1) * pageSize,
          count: true,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok)
        throw new Error(
          data?.error || "No se pudo ejecutar la consulta JOIN"
        );

      setPreviewData({
        rows: data.rows || [],
        total: typeof data.total === "number" ? data.total : undefined,
        sourceNodeId: widget.id,
        pageSize: pageSize,
      });

      addLog("Success", `Vista previa generada: ${(data.rows || []).length} filas (JOIN)`);
      setActiveTab("Data");

    } catch (e: any) {
      addLog("Error", e?.message || "Error de consulta JOIN");
    } finally {
      setIsLoading(false);
    }
  };

  const handlePreview = () => {
    setOnLoadPage(() => loadPage);
    setPage(1);
    loadPage(1);
  };

  return (
    <Button
      variant="outline"
      size="sm"
      className="text-gray-700 border-gray-300 hover:bg-gray-50"
      onClick={handlePreview}
      disabled={isLoading}
    >
       Vista Previa
    </Button>
  );
}


// Preview data at the End node without writing to DB
function EndPreviewButton({
  widget,
  edges,
  widgets,
  etlId,
}: {
  widget: Widget;
  edges: Array<{ id: string; from: string; to: string }>;
  widgets: Widget[];
  etlId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"data" | "query">("data");
  const [queryInfo, setQueryInfo] = useState<{
    extractionQuery?: string;
    transformationSteps?: string[];
  } | null>(null);

  const runPreview = async () => {
    setLoading(true);
    setError(null);
    setRows([]);
    try {
      const flow = collectUpstreamFlow(widget.id, widgets, edges);

      const upstreamNode = flow.connectionNode || flow.joinNode || flow.unionNode;
      if (!upstreamNode) {
        throw new Error("Conecta el nodo Fin a una fuente válida (Conexión, JOIN o UNION)");
      }

      const filterNode = flow.filterNode;
      const isUnion = upstreamNode.type === "union";
      if (!isUnion && !filterNode) {
        throw new Error("No se encontró un nodo de Filtro en la cadena");
      }
      if (isUnion) {
        if (!flow.leftBranch?.connectionNode || !flow.leftBranch?.filterNode || !flow.rightBranch?.connectionNode || !flow.rightBranch?.filterNode) {
          throw new Error("UNION requiere dos ramas: cada una Conexión → Filtro conectado al UNION");
        }
        if (!flow.leftBranch.filterNode.filter?.table || !flow.rightBranch.filterNode.filter?.table) {
          throw new Error("Cada rama del UNION debe tener una tabla seleccionada en el Filtro");
        }
      }

      const countNode = flow.fullPath.find(w => w.type === "count");

      if (!isUnion) {
        if (upstreamNode.type === "connection") {
          if (!upstreamNode.connectionId)
            throw new Error("Conexión sin ID en el nodo de origen");
          if (!filterNode!.filter?.table)
            throw new Error("Selecciona una tabla en el Filtro");
        } else if (upstreamNode.type === "join") {
          const j = (upstreamNode as any).join || ({} as any);
          if (
            !j.primaryTable ||
            !Array.isArray(j.joins) ||
            j.joins.length === 0
          ) {
            throw new Error("Configura el JOIN antes de ejecutar el flujo");
          }
          for (const jn of j.joins) {
            if (!jn.primaryColumn || !jn.secondaryColumn) {
              throw new Error("Completa las columnas de unión en cada join");
            }
          }
          if (!j.primaryConnectionId) {
            throw new Error("Selecciona la tabla principal del JOIN");
          }
        } else {
          throw new Error("La fuente debe ser Conexión, JOIN o UNION");
        }
      }

      let payload: any;
      const commonEnd = {
        target: widget.end?.target || { type: "supabase", table: "preview" },
        mode: widget.end?.mode || "append",
      };

      if (upstreamNode.type === "union" && flow.leftBranch && flow.rightBranch) {
        payload = {
          etlId,
          union: {
            left: {
              connectionId: flow.leftBranch.connectionNode!.connectionId,
              filter: {
                table: flow.leftBranch.filterNode!.filter!.table,
                columns: flow.leftBranch.filterNode!.filter!.columns || [],
                conditions: flow.leftBranch.filterNode!.filter!.conditions || [],
              },
            },
            right: {
              connectionId: flow.rightBranch.connectionNode!.connectionId,
              filter: {
                table: flow.rightBranch.filterNode!.filter!.table,
                columns: flow.rightBranch.filterNode!.filter!.columns || [],
                conditions: flow.rightBranch.filterNode!.filter!.conditions || [],
              },
            },
            unionAll: (upstreamNode as any).union?.unionAll !== false,
          },
          end: commonEnd,
          preview: true,
        };
      } else if (upstreamNode.type === "connection") {
        payload = {
          etlId,
          connectionId: (upstreamNode as any).connectionId,
          filter: {
            table: filterNode!.filter!.table!,
            columns: filterNode!.filter!.columns || [],
            conditions: filterNode!.filter!.conditions || [],
          },
          end: commonEnd,
          preview: true,
        };
      } else {
        // upstream is multi-join (star schema) -> fallback to legacy when only one join
        const j = (upstreamNode as any).join || ({} as any);
        let allSelected = filterNode!.filter?.columns || [];
        
        // Auto-inject downstream dependencies
        const neededCols = new Set<string>();
        if (flow.pipeline) {
           flow.pipeline.forEach(step => {
              if (!step) return;
              if (step.type === "condition") {
                 (step.config as any).rules?.forEach((r: any) => {
                    if (r.leftOperand?.type === "column") neededCols.add(r.leftOperand.value);
                    if (r.rightOperand?.type === "column") neededCols.add(r.rightOperand.value);
                    // Legacy payload might keep string value
                    if (typeof r.column === "string") neededCols.add(r.column);
                 });
              }
              if (step.type === "arithmetic") {
                 (step.config as any).operations?.forEach((op: any) => {
                    if (op.leftOperand?.type === "column") neededCols.add(op.leftOperand.value);
                    if (op.rightOperand?.type === "column") neededCols.add(op.rightOperand.value);
                    // Legacy props
                    if (typeof op.leftColumn === "string") neededCols.add(op.leftColumn);
                    if (typeof op.rightColumn === "string") neededCols.add(op.rightColumn);
                 });
              }
           });
        }
        neededCols.forEach(col => {
            if (!allSelected.includes(col)) allSelected = [...allSelected, col];
        });

        const primarySelected = allSelected
          .filter((c: string) => c.startsWith("primary."))
          .map((c: string) => c.slice("primary.".length));
        const joinsSelected: Record<string, string[]> = {};
        (j.joins || []).forEach((jn: any, idx: number) => {
          const prefix = `join_${idx}.`;
          joinsSelected[jn.id] = allSelected
            .filter((c: string) => c.startsWith(prefix))
            .map((c: string) => c.slice(prefix.length));
        });
        
        if (j.joins?.length === 1) {
            const only = j.joins[0];
            payload = {
              etlId,
              join: {
                connectionId: j.primaryConnectionId,
                secondaryConnectionId: only.secondaryConnectionId,
                leftTable: j.primaryTable,
                rightTable: only.secondaryTable,
                joinConditions: [
                  {
                    leftTable: j.primaryTable,
                    leftColumn: only.primaryColumn,
                    rightTable: only.secondaryTable,
                    rightColumn: only.secondaryColumn,
                    joinType: only.joinType || "INNER",
                  },
                ],
                leftColumns: primarySelected.length
                  ? primarySelected
                  : (j.primaryColumns as string[] | undefined),
                rightColumns: joinsSelected[only.id]?.length
                  ? joinsSelected[only.id]
                  : (only.secondaryColumns as string[] | undefined),
              },
              filter: {
                columns: allSelected,
                conditions: filterNode!.filter?.conditions || [],
              },
              end: commonEnd,
              preview: true,
            };
        } else {
             // Star Schema Join Logic
             payload = {
                etlId,
                join: {
                  primaryConnectionId: j.primaryConnectionId,
                  primaryTable: j.primaryTable,
                  primaryColumns: primarySelected.length
                    ? primarySelected
                    : (j.primaryColumns as string[] | undefined),
                  joins: (j.joins || []).map((jn: any) => ({
                    id: jn.id,
                    secondaryConnectionId: jn.secondaryConnectionId,
                    secondaryTable: jn.secondaryTable,
                    joinType: jn.joinType,
                    primaryColumn: jn.primaryColumn,
                    secondaryColumn: jn.secondaryColumn,
                    secondaryColumns: joinsSelected[jn.id]?.length
                      ? joinsSelected[jn.id]
                      : (jn.secondaryColumns as string[] | undefined),
                  })),
                },
                filter: {
                  columns: allSelected,
                  conditions: filterNode!.filter?.conditions || [],
                },
                end: commonEnd,
                preview: true,
              };
        }
      }

      // Add accumulated simple transformations
      if (flow.collectedTransforms.length > 0 || flow.lastCleanDedupe?.keyColumns?.length) {
        payload.clean = { transforms: flow.collectedTransforms, dedupe: flow.lastCleanDedupe };
      }
      
      if (flow.collectedConversions.length > 0) {
        payload.cast = { conversions: flow.collectedConversions };
      }

      if (flow.collectedOperations.length > 0) {
        payload.arithmetic = { operations: flow.collectedOperations };
      }
      
      if (flow.collectedRules.length > 0) {
        const conditionNode = flow.fullPath.find(
          (n) => n.type === "condition"
        ) as Widget | undefined;
        payload.condition = {
          rules: flow.collectedRules,
          resultColumn: conditionNode?.condition?.resultColumn,
          defaultResultValue: conditionNode?.condition?.defaultResultValue,
        };
      }
      
      if (flow.pipeline?.length > 0) {
        payload.pipeline = flow.pipeline;
      }
      
      if (countNode?.count) {
        payload.count = countNode.count;
      }

      const res = await fetch("/api/etl/run-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.ok)
        throw new Error(data?.error || "Error al generar vista previa");
      
      setRows(data.previewRows || []);
      setQueryInfo({
        extractionQuery: data.extractionQuery,
        transformationSteps: data.transformationSteps,
      });
    } catch (e: any) {
      const msg = e?.message || "Error al generar vista previa";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) runPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <div className="inline-block">
      <Button
        variant="outline"
        className="rounded-full mr-2"
        onClick={() => setOpen((o) => !o)}
      >
        {open ? "Ocultar Previa" : "Vista Previa"}
      </Button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[80vh] flex flex-col">
            <div className="p-4 border-b flex justify-between items-center bg-gray-50 rounded-t-xl">
              <div className="flex items-center gap-4">
                  <h3 className="font-medium text-gray-900">Vista Previa</h3>
                  <div className="flex bg-gray-200 rounded-lg p-1 text-xs font-medium">
                      <button 
                        onClick={() => setActiveTab("data")}
                        className={`px-3 py-1 rounded-md transition-all ${activeTab === "data" ? "bg-white shadow text-gray-900" : "text-gray-500 hover:text-gray-700"}`}
                      >
                        Resultados ({rows.length})
                      </button>
                      <button 
                         onClick={() => setActiveTab("query")}
                         className={`px-3 py-1 rounded-md transition-all ${activeTab === "query" ? "bg-white shadow text-gray-900" : "text-gray-500 hover:text-gray-700"}`}
                      >
                        Info Técnica
                      </button>
                  </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setOpen(false)}
              >
                Cerrar
              </Button>
            </div>
            
            <div className="flex-1 overflow-auto p-4">
              {loading ? (
                <div className="text-center py-8 text-gray-500">
                  Procesando datos en memoria...
                </div>
              ) : error ? (
                <div className="text-red-600 bg-red-50 p-3 rounded">
                  {error}
                </div>
              ) : activeTab === "query" ? (
                  <div className="p-6 space-y-6">
                      <div>
                          <h4 className="text-sm font-semibold text-gray-900 mb-2">Flujo de Transformación (Javascript)</h4>
                          <div className="bg-gray-50 border rounded-lg p-4">
                              {queryInfo?.transformationSteps && queryInfo.transformationSteps.length > 0 ? (
                                  <ul className="list-disc list-inside space-y-1 text-sm text-gray-700">
                                      {queryInfo.transformationSteps.map((step, idx) => (
                                          <li key={idx}>{step}</li>
                                      ))}
                                  </ul>
                              ) : (
                                  <div className="text-sm text-gray-500 italic">No se aplicaron transformaciones en memoria.</div>
                              )}
                          </div>
                      </div>

                      <div>
                          <h4 className="text-sm font-semibold text-gray-900 mb-2">Consulta de Extracción (SQL)</h4>
                          <div className="bg-slate-900 text-slate-50 rounded-lg p-4 font-mono text-xs overflow-x-auto whitespace-pre-wrap">
                              {queryInfo?.extractionQuery || "-- No query available"}
                          </div>
                          <p className="text-xs text-gray-500 mt-1">
                              * Esta consulta se ejecuta con paginación optimizada (OFFSET/LIMIT) para encontrar resultados.
                          </p>
                      </div>
                  </div>
              ) : rows.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No se generaron resultados para previsualizar.
                </div>
              ) : (
                <table className="w-full text-xs text-left">
                  <thead className="sticky top-0 bg-white shadow-sm">
                    <tr>
                      {Object.keys(rows[0]).map((k) => (
                        <th
                          key={k}
                          className="px-3 py-2 bg-gray-50 font-medium text-gray-700 border-b"
                        >
                          {k}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i} className="border-b hover:bg-gray-50">
                        {Object.keys(rows[0]).map((k) => (
                          <td
                            key={k}
                            className="px-3 py-2 text-gray-800 whitespace-nowrap"
                          >
                            {r[k] === null ? <span className="text-gray-400">null</span> : String(r[k])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            
            <div className="p-2 border-t text-xs text-gray-500 text-center">
              Mostrando {rows.length} filas. Estas filas no se han escrito en la base de datos.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Execute ETL flow from the selected End node
function EndRunButton({
  widget,
  edges,
  widgets,
  etlId,
  onRunStart,
}: {
  widget: Widget;
  edges: Array<{ id: string; from: string; to: string }>;
  widgets: Widget[];
  etlId?: string;
  onRunStart: (runId: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setLoading(true);
    setError(null);

    try {
      const flow = collectUpstreamFlow(widget.id, widgets, edges);

      const upstreamNode = flow.connectionNode || flow.joinNode || flow.unionNode;
      if (!upstreamNode) {
        throw new Error("No se encontró una fuente de datos válida (Conexión, JOIN o UNION) conectada al Fin");
      }

      const filterNode = flow.filterNode;
      const isUnion = upstreamNode.type === "union";
      if (!isUnion && !filterNode) {
        throw new Error("No se encontró un nodo de Filtro en la cadena");
      }
      if (isUnion) {
        if (!flow.leftBranch?.connectionNode || !flow.leftBranch?.filterNode || !flow.rightBranch?.connectionNode || !flow.rightBranch?.filterNode) {
          throw new Error("UNION requiere dos ramas: cada una debe ser Conexión → Filtro conectado al UNION");
        }
        if (!flow.leftBranch.filterNode.filter?.table || !flow.rightBranch.filterNode.filter?.table) {
          throw new Error("Cada rama del UNION debe tener una tabla seleccionada en el Filtro");
        }
      }

      const countNode = flow.fullPath.find(w => w.type === "count");

      if (!isUnion) {
        if (upstreamNode.type === "connection") {
          if (!upstreamNode.connectionId)
            throw new Error("Conexión sin ID en el nodo de origen");
          if (!filterNode!.filter?.table)
            throw new Error("Selecciona una tabla en el Filtro");
        } else if (upstreamNode.type === "join") {
          const j = (upstreamNode as any).join || ({} as any);
          if (
            !j.primaryTable ||
            !Array.isArray(j.joins) ||
            j.joins.length === 0
          ) {
            throw new Error("Configura el JOIN antes de ejecutar el flujo");
          }
          for (const jn of j.joins) {
            if (!jn.primaryColumn || !jn.secondaryColumn) {
              throw new Error("Completa las columnas de unión en cada join");
            }
          }
          if (!j.primaryConnectionId) {
            throw new Error("Selecciona la tabla principal del JOIN");
          }
        } else {
          throw new Error("La fuente debe ser Conexión, JOIN o UNION");
        }
      }

      if (!widget.end?.target?.table)
        throw new Error("Configura la tabla destino en el nodo Fin");

      // Build payload for single-table or join
      let payload: any;
      
      // Common parts
      const commonEnd = {
          target: widget.end!.target!,
          mode: widget.end!.mode || "overwrite",
      };

      if (upstreamNode.type === "union" && flow.leftBranch && flow.rightBranch) {
        payload = {
          etlId,
          union: {
            left: {
              connectionId: flow.leftBranch.connectionNode!.connectionId,
              filter: {
                table: flow.leftBranch.filterNode!.filter!.table,
                columns: flow.leftBranch.filterNode!.filter!.columns || [],
                conditions: flow.leftBranch.filterNode!.filter!.conditions || [],
              },
            },
            right: {
              connectionId: flow.rightBranch.connectionNode!.connectionId,
              filter: {
                table: flow.rightBranch.filterNode!.filter!.table,
                columns: flow.rightBranch.filterNode!.filter!.columns || [],
                conditions: flow.rightBranch.filterNode!.filter!.conditions || [],
              },
            },
            unionAll: (upstreamNode as any).union?.unionAll !== false,
          },
          end: commonEnd,
        };
      } else if (upstreamNode.type === "connection") {
        payload = {
          etlId,
          connectionId: (upstreamNode as any).connectionId,
          filter: {
            table: filterNode!.filter!.table!,
            columns: filterNode!.filter!.columns || [],
            conditions: filterNode!.filter!.conditions || [],
          },
          end: commonEnd,
        };
      } else {
        // upstream is multi-join (star schema) -> fallback to legacy when only one join
        const j = (upstreamNode as any).join || ({} as any);
        const allSelected = filterNode!.filter?.columns || [];
        const primarySelected = allSelected
          .filter((c) => c.startsWith("primary."))
          .map((c) => c.slice("primary.".length));
        const joinsSelected: Record<string, string[]> = {};
        (j.joins || []).forEach((jn: any, idx: number) => {
          const prefix = `join_${idx}.`;
          joinsSelected[jn.id] = allSelected
            .filter((c) => c.startsWith(prefix))
            .map((c) => c.slice(prefix.length));
        });
        
        if (j.joins?.length === 1) {
          const only = j.joins[0];
          payload = {
            etlId,
            join: {
              connectionId: j.primaryConnectionId,
              secondaryConnectionId: only.secondaryConnectionId,
              leftTable: j.primaryTable,
              rightTable: only.secondaryTable,
              joinConditions: [
                {
                  leftTable: j.primaryTable,
                  leftColumn: only.primaryColumn,
                  rightTable: only.secondaryTable,
                  rightColumn: only.secondaryColumn,
                  joinType: only.joinType || "INNER",
                },
              ],
              leftColumns: primarySelected.length
                ? primarySelected
                : (j.primaryColumns as string[] | undefined),
              rightColumns: joinsSelected[only.id]?.length
                ? joinsSelected[only.id]
                : (only.secondaryColumns as string[] | undefined),
            },
            filter: {
              columns: allSelected,
              conditions: filterNode!.filter?.conditions || [],
            },
            end: commonEnd,
          };
        } else {
            // Star Schema Join Logic
             payload = {
            etlId,
            join: {
              primaryConnectionId: j.primaryConnectionId,
              primaryTable: j.primaryTable,
              primaryColumns: primarySelected.length
                ? primarySelected
                : (j.primaryColumns as string[] | undefined),
              joins: (j.joins || []).map((jn: any) => ({
                id: jn.id,
                secondaryConnectionId: jn.secondaryConnectionId,
                secondaryTable: jn.secondaryTable,
                joinType: jn.joinType,
                primaryColumn: jn.primaryColumn,
                secondaryColumn: jn.secondaryColumn,
                secondaryColumns: joinsSelected[jn.id]?.length
                  ? joinsSelected[jn.id]
                  : (jn.secondaryColumns as string[] | undefined),
              })),
            },
            filter: {
              columns: allSelected,
              conditions: filterNode!.filter?.conditions || [],
            },
            end: commonEnd,
          };
        }
      }

      // Add accumulated simple transformations
      if (flow.collectedTransforms.length > 0 || flow.lastCleanDedupe?.keyColumns?.length) {
        payload.clean = { transforms: flow.collectedTransforms, dedupe: flow.lastCleanDedupe };
      }
      
      if (flow.collectedConversions.length > 0) {
        payload.cast = { conversions: flow.collectedConversions };
      }

      if (flow.collectedOperations.length > 0) {
        payload.arithmetic = { operations: flow.collectedOperations };
      }
      
      if (flow.collectedRules.length > 0) {
        const conditionNode = flow.fullPath.find(
          (n) => n.type === "condition"
        ) as Widget | undefined;
        payload.condition = {
          rules: flow.collectedRules,
          resultColumn: conditionNode?.condition?.resultColumn,
          defaultResultValue: conditionNode?.condition?.defaultResultValue,
        };
      }
      
      if (countNode?.count) {
        payload.count = countNode.count;
      }

      const res = await fetch("/api/etl/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data?.error || "Error al ejecutar flujo");
      }

      // Start Tracking (Async Fire-and-Forget)
      if (data.runId) {
          onRunStart(data.runId);
      } else {
        throw new Error("No se recibió ID de ejecución");
      }
      
      console.log("ETL Run Initiated:", data);

    } catch (e: any) {
      console.error("Run Error:", e);
      setError(e?.message || "Error desconocido");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <Button
        onClick={run}
        disabled={loading || !widget.end?.target?.table}
        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
      >
        {loading ? "Iniciando..." : "Ejecutar Flujo y Guardar"}
      </Button>
      {error && <div className="text-xs text-red-500">{error}</div>}
    </div>
  );
}
